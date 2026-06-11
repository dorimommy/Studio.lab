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
    bypassEnabled = !!e.detail;
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

  // ═══════════════════════════════════════════════════════════════════
  // MODEL OVERRIDE — the DIRECT SIGNAL approach
  // Content script sets the model via CustomEvent, interceptor swaps
  // the model in the XHR URL. No clicks, no Angular hacks.
  // ═══════════════════════════════════════════════════════════════════
  let overrideModelId = null;

  window.addEventListener('__sl_setModel', (e) => {
    const id = e.detail && e.detail.modelId;
    if (id) {
      overrideModelId = id;
      console.log(
        '%c[Studio.lab] 🔄 Model override set: ' + id,
        'color:#87a9ff;font-weight:bold'
      );
    }
  });

  // Clear override when user manually changes model via native UI
  window.addEventListener('__sl_clearModelOverride', () => {
    overrideModelId = null;
  });

  // ── Patch open (with model override) ──────────────────────────────
  // Replacing the original patched open with one that supports model override
  XMLHttpRequest.prototype.open = function (method, url) {
    let finalUrl = typeof url === 'string' ? url : '';

    // Apply model override to GenerateContent requests
    if (overrideModelId && finalUrl.includes(URL_MARKER)) {
      finalUrl = finalUrl.replace(/models\/[^:\/]+/, 'models/' + overrideModelId);
      console.log(
        '%c[Studio.lab] 🔄 Model swapped in request: ' + overrideModelId,
        'color:#87a9ff'
      );
    }

    this.__aisuUrl = finalUrl;
    this.__aisuIsGen = finalUrl.includes(URL_MARKER);

    // Call original open with potentially modified URL
    const args = Array.from(arguments);
    args[1] = finalUrl;
    return _origOpen.apply(this, args);
  };

  // ── Patch send ─────────────────────────────────────────────────────
  XMLHttpRequest.prototype.send = function (body) {
    if (!this.__aisuIsGen) {
      return _origSend.apply(this, arguments);
    }

    if (body && typeof body === 'string') {
      window.dispatchEvent(new CustomEvent('__sl_requestPayload', {
        detail: body
      }));
    }

    const xhr = this;
    let snap = '';
    let snapTime = 0;
    let didLogSanitize = false;

    // ── 1. ABORT BLOCK (Core Bypass Feature) ─────────────────────────
    xhr.abort = function () {
      console.log('%c[Studio.lab] 🚫 abort() blocked — preserving stream', 'color:#ff9800;font-weight:bold');
      return; 
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

    // ── 3. Snap for fallback ─────────────────────────────────────────
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

  // ── Thought deletion (MAIN world, no inline script needed) ────────
  window.addEventListener('__sl_deleteThought', () => {
    const chunk = document.querySelector('.sl-delete-target');
    if (!chunk) return;
    chunk.classList.remove('sl-delete-target');

    const deleteBtn = Array.from(chunk.querySelectorAll('button')).find(btn => {
      const icon = btn.querySelector('.material-symbols-outlined, .google-symbols');
      const iconText = icon ? icon.textContent.trim().toLowerCase() : '';
      return iconText === 'close' || iconText === 'delete' || iconText === 'clear' ||
             btn.getAttribute('aria-label')?.toLowerCase().includes('delete') ||
             btn.getAttribute('aria-label')?.toLowerCase().includes('remove');
    });
    if (deleteBtn) deleteBtn.click();
  });

  console.log(
    '%c[Studio.lab] ⚡ Angular Bypass active (MAIN world)',
    'color:#87a9ff;font-weight:bold;font-size:12px'
  );
})();

