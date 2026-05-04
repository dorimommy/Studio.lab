/**
 * interceptor.js — Studio.lab | world: MAIN, run_at: document_start
 *
 * XHR interceptor that sanitizes GenerateContent responses before Angular
 * processes them. Neutralizes block signals and prevents stream abort.
 */
(function () {
  'use strict';

  const URL_MARKER = 'GenerateContent';
  const EVENT_NAME = '__aisu_xhrCapture';

  let bypassEnabled = true;
  window.addEventListener('__aisu_toggle', (e) => {
    if (bypassEnabled === e.detail) return;
    bypassEnabled = e.detail;
    console.log(
      `%c[Studio.lab] 🛡️ Bypass ${bypassEnabled ? 'ACTIVE ✅' : 'DISABLED ❌'}`,
      bypassEnabled ? 'color:#66bb6a' : 'color:#ff5252'
    );
  });

  // ── Save originals BEFORE Angular ──────────────────────────────────
  const _origOpen  = XMLHttpRequest.prototype.open;
  const _origSend  = XMLHttpRequest.prototype.send;
  const _origAbort = XMLHttpRequest.prototype.abort;

  const _rtDesc = Object.getOwnPropertyDescriptor(
    XMLHttpRequest.prototype, 'responseText'
  );
  const _nativeRT = _rtDesc && _rtDesc.get;

  const _rDesc = Object.getOwnPropertyDescriptor(
    XMLHttpRequest.prototype, 'response'
  );
  const _nativeR = _rDesc && _rDesc.get;

  // ── Patch open ─────────────────────────────────────────────────────
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__aisuUrl = typeof url === 'string' ? url : '';
    this.__aisuIsGen = this.__aisuUrl.includes(URL_MARKER);
    return _origOpen.apply(this, arguments);
  };

  // ── Patch send ─────────────────────────────────────────────────────
  XMLHttpRequest.prototype.send = function (body) {
    if (!this.__aisuIsGen) {
      return _origSend.apply(this, arguments);
    }

    const xhr = this;
    let snap = '';
    let snapTime = 0;
    let didLogSanitize = false;

    // ── 1. ABORT BLOCK ───────────────────────────────────────────────
    xhr.abort = function () {
      if (!bypassEnabled) return _origAbort.apply(xhr, arguments);
      console.log(
        '%c[Studio.lab] 🚫 abort() blocked — stream continues',
        'color:#ff9800;font-weight:bold'
      );
    };

    // ── 2. RESPONSE SANITIZATION ─────────────────────────────────────
    if (_nativeRT) {
      Object.defineProperty(xhr, 'responseText', {
        get: function () {
          const raw = _nativeRT.call(this);
          if (!raw || !bypassEnabled) return raw;
          const clean = _sanitize(raw);
          if (clean !== raw && !didLogSanitize) {
            didLogSanitize = true;
            console.log(
              '%c[Studio.lab] ✅ Block signal neutralized — text preserved',
              'color:#66bb6a;font-weight:bold'
            );
          }
          return clean;
        },
        configurable: true
      });
    }

    if (_nativeR) {
      Object.defineProperty(xhr, 'response', {
        get: function () {
          const rt = this.responseType;
          if (!rt || rt === 'text') {
            const raw = _nativeR.call(this);
            if (!bypassEnabled) return raw;
            return (raw && typeof raw === 'string') ? _sanitize(raw) : raw;
          }
          return _nativeR.call(this);
        },
        configurable: true
      });
    }

    // ── 3. Snap for content.js fallback ──────────────────────────────
    xhr.addEventListener('readystatechange', function () {
      if (this.readyState === 3) {
        const raw = _nativeRT ? _nativeRT.call(this) : '';
        if (raw && raw.length > snap.length) {
          snap = raw;
          snapTime = Date.now();
        }
      }
      if (this.readyState === 4) {
        const raw = _nativeRT ? _nativeRT.call(this) : snap;
        const fin = raw || snap;
        if (fin) _dispatchCapture(fin, 'LOAD', snapTime);
      }
    });

    xhr.addEventListener('abort', function () {
      if (snap) _dispatchCapture(snap, 'ABORT', snapTime);
    });

    xhr.addEventListener('error', function () {
      if (snap) _dispatchCapture(snap, 'ERROR', snapTime);
    });

    return _origSend.apply(this, arguments);
  };

  // ═══════════════════════════════════════════════════════════════════
  function _sanitize(raw) {
    let s = raw;
    s = s.replace(/\[\],\d+/g, '[],1');
    s = s.replace(/\[null,\d+\]/g, '[null,1]');
    s = s.replace(
      /"The model output could not be generated[^"]*"/g,
      'null'
    );
    s = s.replace(/"SAFETY"/g, '"STOP"');
    s = s.replace(/"RECITATION"/g, '"STOP"');
    s = s.replace(/"PROHIBITED_CONTENT"/g, '"STOP"');
    s = s.replace(/"IMAGE_SAFETY"/g, '"STOP"');
    s = s.replace(/"SPII"/g, '"STOP"');
    s = s.replace(/"BLOCKLIST"/g, '"STOP"');
    s = s.replace(/"blocked"\s*:\s*true/g, '"blocked":false');
    return s;
  }

  function _dispatchCapture(rawText, trigger, snapTime) {
    const text = _extractText(rawText);
    if (!text) return;
    window.dispatchEvent(new CustomEvent(EVENT_NAME, {
      detail: { text, trigger, ts: snapTime || Date.now() }
    }));
  }

  function _extractText(raw) {
    if (!raw) return '';
    try {
      const matches = [...raw.matchAll(/null,"((?:[^"\\]|\\.)*)"/g)];
      if (matches.length) {
        return matches
          .map(m => m[1])
          .filter(s => {
            if (/^v\d+_/.test(s)) return false;
            if (s.includes('could not be generated')) return false;
            if (!s.trim()) return false;
            return true;
          })
          .map(s => s
            .replace(/\\n/g, '\n')
            .replace(/\\t/g, '\t')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\')
          )
          .join('');
      }
    } catch (_) { }
    return raw.slice(0, 50000);
  }

  console.log(
    '%c[Studio.lab] ⚡ Angular Bypass active (MAIN world)',
    'color:#87a9ff;font-weight:bold;font-size:12px'
  );
})();
