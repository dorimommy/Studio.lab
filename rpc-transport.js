// MAIN-world transport: fetches full conversations from AI Studio's own RPC.
//
// Why MAIN and not the isolated content-script world: the MakerSuite endpoint
// answers only to the AI Studio origin (CORS). A fetch from the isolated world
// carries the extension origin and is rejected, so the request must originate
// from the page itself, where document.cookie (SAPISID) is also available.
//
// Reads only. The allowlist below contains no mutating method, and every
// outbound request goes to a Google host. The transport only acts on
// __sl_fetchPrompt / __sl_listPrompts events from our own isolated world and
// answers with __sl_result_<eventId>, mirroring the bridge in interceptor.js.
//
// Runs in MAIN at document_start: no chrome.* here.
(function () {
  'use strict';

  var ORIGIN = 'https://aistudio.google.com';
  var RPC_BASE = 'https://alkalimakersuite-pa.clients6.google.com/$rpc/' +
    'google.internal.alkali.applications.makersuite.v1.MakerSuiteService/';

  // Read-only methods. ResolveDriveResource returns one saved prompt by its
  // Drive id; ListPrompts pages the library; GenerateAccessToken mints the
  // short-lived OAuth token Drive needs (same flow the frontend uses).
  var ALLOWED_METHODS = { ResolveDriveResource: true, ListPrompts: true, GenerateAccessToken: true };

  var DRIVE_BASE = 'https://content.googleapis.com/drive/v3/files/';

  // Refuse to buffer an attachment larger than this; one pathological file
  // must not be able to exhaust the tab's memory mid-export.
  var MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;

  // Google-native documents have no byte stream; convert on request with the
  // types that best preserve content.
  var NATIVE_EXPORT_TYPES = {
    'application/vnd.google-apps.document': { mimeType: 'text/markdown', extension: 'md' },
    'application/vnd.google-apps.spreadsheet': { mimeType: 'text/csv', extension: 'csv' },
    'application/vnd.google-apps.presentation': { mimeType: 'application/pdf', extension: 'pdf' },
    'application/vnd.google-apps.drawing': { mimeType: 'image/png', extension: 'png' },
    'application/vnd.google-apps.script': { mimeType: 'application/vnd.google-apps.script+json', extension: 'json' }
  };
  var NATIVE_FALLBACK = { mimeType: 'application/pdf', extension: 'pdf' };

  // Public web-client key shipped inside the AI Studio bundle. Page-discovered
  // keys are tried first so a rotation on Google's side can still recover.
  // SECURITY: never hardcode an API key here — GitHub secret scanning flags
// AIza keys in public repos. The live key is discovered from the AI Studio
// page itself (see API_KEY_PATTERN below); empty means discovery-only.
var FALLBACK_API_KEY = '';
  var API_KEY_PATTERN = /["'](AIza[\w-]{35})["']/g;

  var keyCandidates = null;
  var activeKeyIndex = 0;

  function collectApiKeys() {
    if (keyCandidates) return keyCandidates;
    var discovered = [];
    try {
      var scripts = document.querySelectorAll('script:not([src])');
      for (var i = 0; i < scripts.length; i++) {
        var text = scripts[i].textContent || '';
        var match;
        API_KEY_PATTERN.lastIndex = 0;
        while ((match = API_KEY_PATTERN.exec(text)) !== null) {
          if (discovered.indexOf(match[1]) === -1) discovered.push(match[1]);
        }
      }
    } catch (_) { /* page not ready yet; fall back to the constant */ }
    var ordered = [];
    for (var j = 0; j < discovered.length; j++) {
      if (ordered.indexOf(discovered[j]) === -1) ordered.push(discovered[j]);
    }
    if (FALLBACK_API_KEY && ordered.indexOf(FALLBACK_API_KEY) === -1) ordered.push(FALLBACK_API_KEY);
    keyCandidates = ordered;
    activeKeyIndex = 0;
    return keyCandidates;
  }

  function currentApiKey() {
    var keys = collectApiKeys();
    return keys[activeKeyIndex] || '';
  }

  function advanceApiKey() {
    var keys = collectApiKeys();
    if (activeKeyIndex + 1 >= keys.length) return false;
    activeKeyIndex++;
    return true;
  }

  function findAuthUser() {
    var match = /^\/u\/(\d+)\//.exec(location.pathname);
    return match ? match[1] : '0';
  }

  function readCookie(name) {
    var prefix = name + '=';
    var parts = document.cookie.split('; ');
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].indexOf(prefix) === 0) return parts[i].slice(prefix.length);
    }
    return null;
  }

  function sha1Hex(input) {
    return crypto.subtle.digest('SHA-1', new TextEncoder().encode(input)).then(function (digest) {
      return Array.from(new Uint8Array(digest)).map(function (b) {
        return b.toString(16).padStart(2, '0');
      }).join('');
    });
  }

  // SAPISIDHASH: SHA-1 over "<unixSeconds> <SAPISID> <origin>".
  // Re-derives the header the AI Studio frontend itself sends; mints nothing.
  function buildAuthHeader() {
    var sapisid = readCookie('SAPISID') || readCookie('__Secure-3PAPISID');
    if (!sapisid) return Promise.reject(new Error('Not signed in to Google (no SAPISID cookie)'));
    var seconds = Math.floor(Date.now() / 1000);
    return sha1Hex(seconds + ' ' + sapisid + ' ' + ORIGIN).then(function (hash) {
      return 'SAPISIDHASH ' + seconds + '_' + hash;
    });
  }

  function describeRpcError(status, text, method) {
    var detail = String(text).slice(0, 200);
    try {
      var parsed = JSON.parse(text);
      if (Array.isArray(parsed) && typeof parsed[1] === 'string') detail = parsed[1];
    } catch (_) { /* keep the raw prefix */ }
    return new Error(method + ' failed (' + status + '): ' + detail);
  }

  function callRpc(method, body) {
    if (!ALLOWED_METHODS[method]) {
      return Promise.reject(new Error('Refusing non-allowlisted RPC method: ' + method));
    }
    var keys = collectApiKeys();
    var attempt = 0;
    var lastError = null;

    function tryOnce() {
      return buildAuthHeader().then(function (authHeader) {
        return fetch(RPC_BASE + method, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'content-type': 'application/json+protobuf',
            'x-goog-api-key': currentApiKey(),
            'x-goog-authuser': findAuthUser(),
            'x-user-agent': 'grpc-web-javascript/0.1',
            'authorization': authHeader
          },
          body: JSON.stringify(body)
        });
      }).then(function (response) {
        return response.text().then(function (text) {
          if (response.ok) return JSON.parse(text);
          lastError = describeRpcError(response.status, text, method);
          // A 401/403 usually means the key is not authorised for this API,
          // not that the user is signed out — try the next candidate.
          if ((response.status === 401 || response.status === 403) && advanceApiKey()) {
            attempt++;
            if (attempt < keys.length) return tryOnce();
          }
          throw lastError;
        });
      });
    }

    return tryOnce().catch(function (err) { throw lastError || err; });
  }

  function answer(eventId, detail) {
    window.dispatchEvent(new CustomEvent('__sl_result_' + eventId, { detail: detail }));
  }

  window.addEventListener('__sl_fetchPrompt', function (e) {
    var detail = (e && e.detail) || {};
    var eventId = detail.eventId;
    var driveId = detail.driveId;
    if (!eventId || typeof driveId !== 'string' || !driveId) {
      if (eventId) answer(eventId, { ok: false, error: 'Missing driveId' });
      return;
    }
    callRpc('ResolveDriveResource', [driveId]).then(function (data) {
      answer(eventId, { ok: true, data: data });
    }).catch(function (err) {
      answer(eventId, { ok: false, error: (err && err.message) || String(err) });
    });
  });

  window.addEventListener('__sl_listPrompts', function (e) {
    var detail = (e && e.detail) || {};
    var eventId = detail.eventId;
    if (!eventId) return;
    var body = detail.pageToken ? [detail.pageSize || 100, detail.pageToken] : [detail.pageSize || 100];
    callRpc('ListPrompts', body).then(function (data) {
      answer(eventId, { ok: true, data: data });
    }).catch(function (err) {
      answer(eventId, { ok: false, error: (err && err.message) || String(err) });
    });
  });

  // --- Drive attachments -----------------------------------------------------
  // Drive rejects SAPISIDHASH and wants OAuth, so mint a bearer token the
  // same way AI Studio does. Tokens live roughly an hour; re-mint early.

  var tokenCache = null; // { token, expiresAt }

  function getAccessToken() {
    if (tokenCache && Date.now() < tokenCache.expiresAt) {
      return Promise.resolve(tokenCache.token);
    }
    return callRpc('GenerateAccessToken', ['users/me']).then(function (result) {
      var token = Array.isArray(result) ? result[0] : null;
      if (typeof token !== 'string' || !token) {
        throw new Error('GenerateAccessToken returned no token');
      }
      tokenCache = { token: token, expiresAt: Date.now() + 45 * 60 * 1000 };
      return token;
    });
  }

  function driveFetch(url) {
    return getAccessToken().then(function (token) {
      return fetch(url, { headers: { authorization: 'Bearer ' + token } });
    }).then(function (response) {
      if (response.status !== 401) return response;
      tokenCache = null; // stale earlier than expected; re-mint once
      return getAccessToken().then(function (token) {
        return fetch(url, { headers: { authorization: 'Bearer ' + token } });
      });
    });
  }

  function driveUrl(id, query) {
    return DRIVE_BASE + encodeURIComponent(id) + query + '&key=' + currentApiKey();
  }

  function driveMetadata(fileId) {
    return driveFetch(driveUrl(fileId, '?supportsAllDrives=true&fields=id,name,mimeType,size'))
      .then(function (response) {
        if (!response.ok) throw new Error('Drive metadata failed (' + response.status + ') for ' + fileId);
        return response.json();
      })
      .then(function (meta) {
        return {
          id: meta.id,
          name: meta.name || null,
          mimeType: meta.mimeType || null,
          size: meta.size ? Number(meta.size) : null
        };
      });
  }

  function bufferToBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var binary = '';
    var CHUNK = 0x8000;
    for (var i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  }

  function driveDownload(fileId) {
    return driveMetadata(fileId).then(function (meta) {
      var mimeType = meta.mimeType || '';
      var isNative = mimeType.indexOf('application/vnd.google-apps') === 0;
      if (meta.size && meta.size > MAX_ATTACHMENT_BYTES) {
        throw new Error('Attachment exceeds ' + Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024) + 'MB limit');
      }
      var exportAs = isNative ? (NATIVE_EXPORT_TYPES[mimeType] || NATIVE_FALLBACK) : null;
      var url = exportAs
        ? driveUrl(fileId, '/export?mimeType=' + encodeURIComponent(exportAs.mimeType))
        : driveUrl(fileId, '?alt=media&supportsAllDrives=true');
      return driveFetch(url).then(function (response) {
        if (!response.ok) throw new Error('Drive download failed (' + response.status + ') for ' + fileId);
        return response.arrayBuffer();
      }).then(function (buffer) {
        if (buffer.byteLength > MAX_ATTACHMENT_BYTES) {
          throw new Error('Attachment exceeded size limit while downloading');
        }
        return {
          meta: meta,
          base64: bufferToBase64(buffer),
          effectiveMimeType: exportAs ? exportAs.mimeType : (mimeType || 'application/octet-stream'),
          exportedExtension: exportAs ? exportAs.extension : null
        };
      });
    });
  }

  window.addEventListener('__sl_driveMeta', function (e) {
    var detail = (e && e.detail) || {};
    var eventId = detail.eventId;
    if (!eventId || typeof detail.fileId !== 'string' || !detail.fileId) return;
    driveMetadata(detail.fileId).then(function (meta) {
      answer(eventId, { ok: true, meta: meta });
    }).catch(function (err) {
      answer(eventId, { ok: false, error: (err && err.message) || String(err) });
    });
  });

  window.addEventListener('__sl_driveDownload', function (e) {
    var detail = (e && e.detail) || {};
    var eventId = detail.eventId;
    if (!eventId || typeof detail.fileId !== 'string' || !detail.fileId) return;
    driveDownload(detail.fileId).then(function (result) {
      answer(eventId, { ok: true, meta: result.meta, base64: result.base64,
        effectiveMimeType: result.effectiveMimeType, exportedExtension: result.exportedExtension });
    }).catch(function (err) {
      answer(eventId, { ok: false, error: (err && err.message) || String(err) });
    });
  });
})();
