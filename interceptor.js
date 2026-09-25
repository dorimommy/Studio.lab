/**
 * interceptor.js — Studio.lab | world: MAIN, run_at: document_start
 *
 * XHR interceptor that sanitizes GenerateContent responses before Angular
 * processes them. Neutralizes block signals and prevents stream abort.
 */
(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════
  // ANGULAR 19 LVIEW REGISTRY INTERCEPTOR
  // Captures Angular's internal LView Map before bootstrap
  // ═══════════════════════════════════════════════════════════════════
  const _candidateLViewMaps = new Set();
  const _origMapSet = Map.prototype.set;
  let mapCaptureTimeout;
  let mapCaptureActive = true;
  function captureMapSet(key, value) {
    if (typeof key === 'number' && Array.isArray(value) && value.length > 20) {
      _candidateLViewMaps.add(this);
      // Bound retained maps while waiting for an Angular DOM context to identify the registry.
      if (_candidateLViewMaps.size > 64) {
        _candidateLViewMaps.delete(_candidateLViewMaps.values().next().value);
      }
      window.__NG_LVIEW_MAPS__ = _candidateLViewMaps;
    }
    return _origMapSet.apply(this, arguments);
  }
  Map.prototype.set = captureMapSet;

  function stopMapCapture() {
    mapCaptureActive = false;
    if (Map.prototype.set === captureMapSet) Map.prototype.set = _origMapSet;
    clearTimeout(mapCaptureTimeout);
    _candidateLViewMaps.clear();
    if (window.__NG_LVIEW_MAPS__ === _candidateLViewMaps) delete window.__NG_LVIEW_MAPS__;
  }

  // ═══════════════════════════════════════════════════════════════════
  // MS-HEADER DESKTOP ACTION MOUNTING SHIM (For Mobile & Small Screens)
  // Ensures Google AI Studio's ms-header always mounts its desktop action
  // controls (including prompt title and native edit dialog trigger) regardless
  // of viewport width. Modern Web Chat visually handles layout and styling.
  // ═══════════════════════════════════════════════════════════════════
  if (typeof Element !== 'undefined' && Element.prototype) {
    const _origGBCR = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      const rect = _origGBCR.apply(this, arguments);
      if (this && this.tagName === 'MS-HEADER') {
        const w = (rect && typeof rect.width === 'number') ? Math.max(rect.width, 1024) : 1024;
        const h = (rect && typeof rect.height === 'number') ? rect.height : 0;
        const x = (rect && typeof rect.x === 'number') ? rect.x : 0;
        const y = (rect && typeof rect.y === 'number') ? rect.y : 0;
        return typeof DOMRect !== 'undefined'
          ? new DOMRect(x, y, w, h)
          : { x, y, width: w, height: h, top: y, bottom: y + h, left: x, right: x + w };
      }
      return rect;
    };
  }

  if (typeof window !== 'undefined' && typeof window.ResizeObserver === 'function') {
    const _OrigResizeObserver = window.ResizeObserver;
    window.ResizeObserver = class extends _OrigResizeObserver {
      constructor(callback) {
        super((entries, observer) => {
          const proxiedEntries = entries.map(entry => {
            if (entry && entry.target && entry.target.tagName === 'MS-HEADER') {
              return new Proxy(entry, {
                get(target, prop) {
                  if (prop === 'contentRect') {
                    const cr = target.contentRect;
                    return new Proxy(cr, {
                      get(rTarget, rProp) {
                        if (rProp === 'width') return Math.max(rTarget.width, 1024);
                        return rTarget[rProp];
                      }
                    });
                  }
                  return target[prop];
                }
              });
            }
            return entry;
          });
          return callback(proxiedEntries, observer);
        });
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // DYNAMIC STUDIO API (Angular Signals & Direct State Mutation)
  // ═══════════════════════════════════════════════════════════════════
  const DynamicStudioAPI = {
    _getMap() {
      if (!mapCaptureActive && window.__NG_LVIEW_MAP__) {
        return window.__NG_LVIEW_MAP__;
      }
      // Check candidate maps for the one that has active DOM elements with __ngContext__
      const probeEls = document.querySelectorAll('ms-run-settings, ms-prompt-run-settings, ms-system-instructions-panel, app-root, ms-prompt-box');
      for (const el of probeEls) {
        const ctxId = el.__ngContext__;
        if (typeof ctxId === 'number') {
          for (const m of _candidateLViewMaps) {
            if (m.has(ctxId)) {
              window.__NG_LVIEW_MAP__ = m;
              stopMapCapture();
              return m;
            }
          }
        }
      }
      // Fallback: pick candidate map with most entries
      let best = window.__NG_LVIEW_MAP__ || null;
      let maxLen = best ? best.size : 0;
      for (const m of _candidateLViewMaps) {
        if (m.size > maxLen) {
          maxLen = m.size;
          best = m;
        }
      }
      if (best) window.__NG_LVIEW_MAP__ = best;
      return best;
    },

    getRunSettingsComponent() {
      const map = this._getMap();
      if (!map) return null;

      // 1. Try direct lookup via DOM element __ngContext__
      const rs = document.querySelector('ms-run-settings, ms-prompt-run-settings');
      if (rs && typeof rs.__ngContext__ === 'number' && map.has(rs.__ngContext__)) {
        const lview = map.get(rs.__ngContext__);
        if (Array.isArray(lview)) {
          for (let i = 0; i < lview.length; i++) {
            const item = lview[i];
            if (item && typeof item === 'object' && !Array.isArray(item) && !(item instanceof Node)) {
              if (item.model && typeof item.model === 'function') {
                return item;
              }
            }
          }
        }
      }

      // 2. Scan map entries if not found via DOM
      for (const [key, lview] of map.entries()) {
        if (!Array.isArray(lview)) continue;
        for (let i = 0; i < lview.length; i++) {
          const item = lview[i];
          if (item && typeof item === 'object' && !Array.isArray(item) && !(item instanceof Node)) {
            if (item.model && item.temperature && typeof item.model === 'function' && typeof item.temperature === 'function') {
              return item;
            }
          }
        }
      }
      return null;
    },

    getModel() {
      const rs = this.getRunSettingsComponent();
      if (rs && typeof rs.model === 'function') {
        const val = rs.model();
        if (typeof val === 'string') return val.replace(/^models\//, '');
        if (val && typeof val === 'object' && val.name) return String(val.name).replace(/^models\//, '');
      }
      const modelSelect = document.querySelector('ms-model-selector span[data-test-id="model-name"]');
      if (modelSelect) return modelSelect.textContent.trim();
      return '';
    },

    setModel(modelName) {
      if (!modelName) return false;
      const cleanName = modelName.replace(/^models\//, '');
      const fullName = 'models/' + cleanName;
      const rs = this.getRunSettingsComponent();
      if (rs && rs.model) {
        if (typeof rs.model.set === 'function') {
          const current = typeof rs.model === 'function' ? rs.model() : null;
          if (typeof current === 'string') {
            if (current.startsWith('models/')) {
              rs.model.set(fullName);
            } else {
              rs.model.set(cleanName);
            }
            return true;
          } else {
            try {
              rs.model.set(fullName);
              return true;
            } catch (e) {
              try {
                rs.model.set(cleanName);
                return true;
              } catch (e2) {}
            }
          }
        }
      }
      return false;
    },

    getTemperature() {
      const rs = this.getRunSettingsComponent();
      if (rs && typeof rs.temperature === 'function') {
        const val = rs.temperature();
        if (typeof val === 'number') return val;
      }
      const tempInput = document.querySelector('ms-temperature-slider input');
      if (tempInput) return parseFloat(tempInput.value);
      return 1.0;
    },

    setTemperature(temp) {
      const val = typeof temp === 'number' ? temp : parseFloat(temp);
      if (isNaN(val)) return false;
      const rs = this.getRunSettingsComponent();
      if (rs && rs.temperature && typeof rs.temperature.set === 'function') {
        rs.temperature.set(val);
        return true;
      }
      const tempInput = document.querySelector('ms-temperature-slider input');
      if (tempInput) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(tempInput, val);
        tempInput.dispatchEvent(new Event('input', { bubbles: true }));
        tempInput.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      return false;
    },

    setSystemInstructions(text, callback) {
      if (typeof text !== 'string') {
        if (callback) callback();
        return;
      }

      let textarea = document.querySelector('textarea[aria-label="System instructions"], ms-system-instructions textarea');
      if (textarea) {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        setter.call(textarea, text);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        if (callback) callback();
        return;
      }

      const btn = document.querySelector('ms-system-instructions-panel button');
      if (!btn) {
        if (callback) callback();
        return;
      }

      btn.click();
      setTimeout(() => {
        textarea = document.querySelector('textarea[aria-label="System instructions"], ms-system-instructions textarea');
        if (textarea) {
          const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
          setter.call(textarea, text);
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const closeBtn = document.querySelector('button[aria-label="Close panel"]');
        if (closeBtn) closeBtn.click();
        if (callback) callback();
      }, 80);
    },

    getTools() {
      const rs = this.getRunSettingsComponent();
      if (!rs) return [];
      const list = [];
      if (rs.enableSearchAsATool && typeof rs.enableSearchAsATool === 'function') {
        list.push({ name: 'Grounding with Google Search', checked: !!rs.enableSearchAsATool() });
      }
      if (rs.enableCodeExecution && typeof rs.enableCodeExecution === 'function') {
        list.push({ name: 'Code execution', checked: !!rs.enableCodeExecution() });
      }
      if (rs.enableGoogleMaps && typeof rs.enableGoogleMaps === 'function') {
        list.push({ name: 'Google Maps', checked: !!rs.enableGoogleMaps() });
      }
      if (rs.enableBrowseAsATool && typeof rs.enableBrowseAsATool === 'function') {
        list.push({ name: 'Browse as a tool', checked: !!rs.enableBrowseAsATool() });
      }
      if (rs.enableImageSearch && typeof rs.enableImageSearch === 'function') {
        list.push({ name: 'Image Search', checked: !!rs.enableImageSearch() });
      }
      return list;
    },

    openEditPromptTitleDialog() {
      const btn = document.querySelector('button[aria-label*="Edit prompt title" i], .page-title button, button[aria-label*="Edit title" i]');
      if (btn) {
        try {
          btn.click();
          return true;
        } catch (_) {}
      }
      const map = this._getMap();
      const header = document.querySelector('ms-header');
      if (map && header && typeof header.__ngContext__ === 'number' && map.has(header.__ngContext__)) {
        const lview = map.get(header.__ngContext__);
        const comp = lview ? lview[8] : null;
        if (comp && comp.Ffa && typeof comp.Ffa.set === 'function') {
          comp.nHb?.set(true);
          comp.Ffa.set(true);
          document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          setTimeout(() => {
            const b = document.querySelector('button[aria-label*="Edit prompt title" i], .page-title button, button[aria-label*="Edit title" i]');
            b?.click();
          }, 30);
          return true;
        }
      }
      return false;
    },
    setTool(name, enabled) {
      const rs = this.getRunSettingsComponent();
      if (!rs) return false;
      const q = (name || '').toLowerCase();
      const val = !!enabled;

      if (q.includes('search') || q.includes('grounding')) {
        if (rs.enableSearchAsATool && typeof rs.enableSearchAsATool.set === 'function') {
          rs.enableSearchAsATool.set(val);
          return true;
        }
      }
      if (q.includes('code') || q.includes('execution')) {
        if (rs.enableCodeExecution && typeof rs.enableCodeExecution.set === 'function') {
          rs.enableCodeExecution.set(val);
          return true;
        }
      }
      if (q.includes('map')) {
        if (rs.enableGoogleMaps && typeof rs.enableGoogleMaps.set === 'function') {
          rs.enableGoogleMaps.set(val);
          return true;
        }
      }
      if (q.includes('browse') || q.includes('url')) {
        if (rs.enableBrowseAsATool && typeof rs.enableBrowseAsATool.set === 'function') {
          rs.enableBrowseAsATool.set(val);
          return true;
        }
      }
      if (q.includes('image')) {
        if (rs.enableImageSearch && typeof rs.enableImageSearch.set === 'function') {
          rs.enableImageSearch.set(val);
          return true;
        }
      }
      return false;
    }
  };

  window.DynamicStudioAPI = DynamicStudioAPI;

  // Stop patching the page's Map prototype even if Angular's registry cannot
  // be verified. Keep the best candidate for the existing signal fallback.
  mapCaptureTimeout = setTimeout(() => {
    DynamicStudioAPI._getMap();
    stopMapCapture();
  }, 15000);

  window.addEventListener('__sl_captureProfile', (e) => {
    const eventId = e.detail && e.detail.eventId;
    if (!eventId) return;

    const profile = {};
    profile.model = DynamicStudioAPI.getModel() || 'gemini-1.5-pro';
    profile.temperature = DynamicStudioAPI.getTemperature();

    const signalTools = DynamicStudioAPI.getTools();
    if (signalTools.length > 0) {
      profile.tools = signalTools;
    } else {
      const toolToggles = document.querySelectorAll('ms-prompt-run-settings mat-slide-toggle, ms-run-settings mat-slide-toggle');
      const toolsState = [];
      toolToggles.forEach(t => {
         const parentRow = t.closest('.ms-run-settings-row') || t.parentElement.parentElement;
         const text = parentRow ? parentRow.textContent.trim().replace(/\s+/g, ' ') : '';
         const isChecked = t.classList.contains('mat-mdc-slide-toggle-checked') || t.querySelector('input')?.checked;
         
         let name = text.replace(' Edit', '').replace(' Source: Google Search', '').trim();
         if (name) toolsState.push({ name, checked: !!isChecked });
      });
      profile.tools = toolsState;
    }

    const inlineTextarea = document.querySelector('textarea[aria-label="System instructions"], ms-system-instructions textarea');
    if (inlineTextarea && inlineTextarea.value) {
      profile.systemInstructions = inlineTextarea.value;
    } else {
      const panel = document.querySelector('ms-system-instructions-panel');
      const subtitle = panel?.querySelector('.subtitle')?.textContent?.trim();
      if (subtitle && !subtitle.includes('Optional tone and style')) {
        profile.systemInstructions = subtitle;
      }
    }

    window.dispatchEvent(new CustomEvent('__sl_result_' + eventId, { detail: profile }));
  });

  window.addEventListener('__sl_syncLibrary', (e) => {
    const eventId = e.detail && e.detail.eventId;
    if (!eventId) return;

    try {
      const stored = localStorage.getItem('aistudio_all_system_instructions');
      let libraryItems = [];
      if (stored) {
        const parsed = JSON.parse(stored);
        
        if (Array.isArray(parsed)) {
          libraryItems = parsed.map((item, idx) => {
            const rawText = typeof item === 'string' ? item : (item.text || item.instruction || item.content || JSON.stringify(item));
            const rawTitle = typeof item === 'string' ? null : (item.title || item.name || item.displayName);
            const promptText = rawText ? rawText.trim() : '';
            const displayTitle = rawTitle ? rawTitle.trim() : (promptText.substring(0, 30) + (promptText.length > 30 ? '...' : ''));
            return {
              text: displayTitle,
              instructionText: promptText,
              id: idx.toString()
            };
          }).filter(opt => opt.instructionText !== '');
        } else if (typeof parsed === 'object') {
          Object.values(parsed).forEach((item, idx) => {
            const rawText = typeof item === 'string' ? item : (item.text || item.instruction || item.content || JSON.stringify(item));
            const rawTitle = typeof item === 'string' ? null : (item.title || item.name || item.displayName);
            const promptText = rawText ? rawText.trim() : '';
            const displayTitle = rawTitle ? rawTitle.trim() : (promptText.substring(0, 30) + (promptText.length > 30 ? '...' : ''));
            if (promptText !== '') {
              libraryItems.push({
                text: displayTitle,
                instructionText: promptText,
                id: idx.toString()
              });
            }
          });
        }
      }
      
      window.dispatchEvent(new CustomEvent('__sl_result_' + eventId, { detail: libraryItems }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('__sl_result_' + eventId, { detail: { error: 'Failed to read from localStorage: ' + err.message } }));
    }
  });

  function applyTools(tools, next) {
    if (!tools || !tools.length) return next();

    // 1. Direct Signals application
    let appliedAll = true;
    for (const item of tools) {
      const ok = DynamicStudioAPI.setTool(item.name, item.checked);
      if (!ok) appliedAll = false;
    }
    if (appliedAll) {
      return next();
    }

    // 2. Fallback: DOM switch toggles
    const toggles = document.querySelectorAll('ms-prompt-run-settings mat-slide-toggle, ms-run-settings mat-slide-toggle');
    let i = 0;
    function nextToggle() {
      if (i >= toggles.length) return next();
      const t = toggles[i];
      const parentRow = t.closest('.ms-run-settings-row') || t.parentElement.parentElement;
      const text = parentRow ? parentRow.textContent.trim().replace(/\s+/g, ' ') : '';
      let name = text.replace(' Edit', '').replace(' Source: Google Search', '').trim();
      const savedState = tools.find(x => x.name === name);
      if (savedState) {
        const isChecked = t.classList.contains('mat-mdc-slide-toggle-checked') || t.querySelector('input')?.checked;
        if (!!isChecked !== savedState.checked) {
          const btn = t.querySelector('button');
          if (btn) btn.click();
        }
      }
      i++;
      setTimeout(nextToggle, 30);
    }
    nextToggle();
  }

  window.addEventListener('__sl_applyProfile', (e) => {
    const eventId = e.detail && e.detail.eventId;
    const profile = e.detail && e.detail.profile;
    if (!eventId || !profile) return;

    // 1. Set model via DynamicStudioAPI (Signals) or fallback to model override in XHR
    if (profile.model) {
      const ok = DynamicStudioAPI.setModel(profile.model);
      if (!ok) {
        overrideModelId = profile.model.replace(/^models\//, '');
      }
    }

    // 2. Set temperature via Signals
    if (typeof profile.temperature !== 'undefined') {
      DynamicStudioAPI.setTemperature(profile.temperature);
    }

    // 3. Set system instructions (silent slide panel injection, zero dialog popups)
    DynamicStudioAPI.setSystemInstructions(profile.systemInstructions, () => {
      // 4. Apply tools
      applyTools(profile.tools, () => {
        window.dispatchEvent(new CustomEvent('__sl_result_' + eventId, { detail: true }));
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────

  const URL_MARKER = 'GenerateContent';
  const EVENT_NAME = '__aisu_xhrCapture';

  function isGenerateContentUrl(u) {
    if (!u || typeof u !== 'string') return false;
    return u.toLowerCase().includes('generatecontent');
  }

  let requestSequence = 0;
  function requestMeta() {
    return {
      version: 1,
      requestId: 'sl_req_' + Date.now() + '_' + (++requestSequence),
      route: window.location.pathname,
      ts: Date.now()
    };
  }

  function emitRequest(meta, body) {
    window.dispatchEvent(new CustomEvent('__sl_requestPayload', {
      detail: { ...meta, body: typeof body === 'string' ? body : null }
    }));
  }

  function emitRequestFinished(meta, ok) {
    window.dispatchEvent(new CustomEvent('__sl_requestFinished', {
      detail: { ...meta, ok: !!ok }
    }));
  }

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

  // Fast, signal-only selection for existing text chats. Unlike __sl_setModel,
  // this does not install a network override or claim success on failure.
  window.addEventListener('__sl_trySetModel', (e) => {
    const modelId = e.detail?.modelId;
    const requestId = e.detail?.requestId;
    if (!modelId || !requestId) return;
    let applied = false;
    try { applied = DynamicStudioAPI.setModel(modelId); } catch (_) {}
    window.dispatchEvent(new CustomEvent('__sl_modelDirectResult', {
      detail: { requestId, applied }
    }));
  });

  window.addEventListener('__sl_setModel', (e) => {
    const id = e.detail && (e.detail.modelId || e.detail.model);
    const modelName = e.detail && e.detail.modelName;
    if (id) {
      overrideModelId = id.replace(/^models\//, '');
      if (document.documentElement) {
        document.documentElement.dataset.slActiveModel = overrideModelId;
        document.documentElement.dataset.slActiveModelName = modelName || overrideModelId;
      }
      const setOk = DynamicStudioAPI.setModel(id);
      window.dispatchEvent(new CustomEvent('__sl_modelChanged', {
        detail: { modelId: overrideModelId, modelName: modelName || overrideModelId, signalApplied: setOk }
      }));
      console.log(
        '%c[Studio.lab] 🔄 Model override / signal set: ' + id + (setOk ? ' (Signal OK)' : ' (XHR fallback)'),
        'color:#87a9ff;font-weight:bold'
      );
    }
  });

  // Clear override when user manually changes model via native UI
  window.addEventListener('__sl_clearModelOverride', () => {
    overrideModelId = null;
  });

  // Dynamic tool toggling via DynamicStudioAPI signal
  window.addEventListener('__sl_setTool', (e) => {
    if (e.detail && e.detail.name) {
      DynamicStudioAPI.setTool(e.detail.name, e.detail.enabled);
    }
  });

  // Open native Save Prompt (Edit title) dialog
  window.addEventListener('__sl_openEditPromptTitle', () => {
    DynamicStudioAPI.openEditPromptTitleDialog();
  });

  // ═══════════════════════════════════════════════════════════════════
  // TELEMETRY & ROUTING PATTERNS
  // ═══════════════════════════════════════════════════════════════════
  const TELEMETRY_PATTERNS = [
    'play.google.com/log',
    'google-analytics.com/g/collect',
    'google-analytics.com/analytics.js',
    'googletagmanager.com/gtm.js',
    'googletagmanager.com/gtag',
    '/cspreport/',
    'gen_204',
    'generate_204',
    'cleardot.gif',
    'feedback-pa.clients6.google.com',
    'google.com/pagead/',
    'google.com/measurement/'
  ];

  function isTelemetryUrl(url) {
    if (!url || typeof url !== 'string') return false;
    for (let i = 0; i < TELEMETRY_PATTERNS.length; i++) {
      if (url.includes(TELEMETRY_PATTERNS[i])) return true;
    }
    return false;
  }

  // ── Patch open (with model override & telemetry logging) ───────────
  XMLHttpRequest.prototype.open = function (method, url) {
    const rawUrl = typeof url === 'string' ? url : (url != null ? String(url) : '');
    let processedUrl = rawUrl;

    // Apply model override to GenerateContent requests
    if (overrideModelId && isGenerateContentUrl(processedUrl)) {
      processedUrl = processedUrl.replace(/models\/[^:\/]+/, 'models/' + overrideModelId);
      console.log(
        '%c[Studio.lab] 🔄 Model swapped in request: ' + overrideModelId,
        'color:#87a9ff'
      );
    }

    // Telemetry detection
    const isTelemetry = isTelemetryUrl(processedUrl);
    window.dispatchEvent(new CustomEvent('__sl_networkRequest', {
      detail: { url: processedUrl, method, ts: Date.now(), isTelemetry }
    }));

    this.__aisuUrl = processedUrl;
    this.__aisuIsGen = isGenerateContentUrl(processedUrl);

    // Save / Sync detection (prompt auto-saving or Drive sync)
    if (/prompt.*(?:update|create|save|set)|drive.*(?:files|upload)/i.test(processedUrl)) {
      window.dispatchEvent(new CustomEvent('__sl_savingState', { detail: { saving: true, url: processedUrl } }));
      this.addEventListener('loadend', function () {
        window.dispatchEvent(new CustomEvent('__sl_savingState', { detail: { saving: false, url: processedUrl } }));
      });
    }

    if (processedUrl.includes('ListModels')) {
      this.addEventListener('load', function () {
        try {
          const raw = (this.responseType === 'json' || (this.response && typeof this.response === 'object'))
            ? this.response
            : JSON.parse(this.responseText || '{}');
          let modelsList = [];
          if (Array.isArray(raw)) {
            modelsList = raw;
          } else if (raw && Array.isArray(raw.models)) {
            modelsList = raw.models;
          } else if (raw && typeof raw === 'object') {
            for (const v of Object.values(raw)) {
              if (Array.isArray(v)) {
                modelsList = v;
                break;
              }
            }
          }
          if (modelsList.length > 0) {
            const featured = [];
            for (const m of modelsList) {
              const name = m.displayName || m.name || m.title || '';
              const id = (m.name || m.id || m.modelId || '').replace(/^models\//, '');
              if (name && id && !id.includes('embedding') && !id.includes('aqa') && !id.includes('imagen')) {
                featured.push({ id, name });
              }
            }
            if (featured.length > 0) {
              try {
                if (typeof window !== 'undefined' && window.localStorage) {
                  window.localStorage.setItem('sl_featured_models', JSON.stringify(featured));
                }
              } catch (storageErr) { }
              window.dispatchEvent(new CustomEvent('__sl_featuredModels', { detail: featured }));
            }
          }
        } catch (e) { }
      });
    }

    // Call original open with potentially modified URL
    const args = Array.from(arguments);
    if (processedUrl !== rawUrl || typeof url !== 'string') {
      args[1] = processedUrl;
    }
    return _origOpen.apply(this, args);
  };

  // ── Patch send ─────────────────────────────────────────────────────
  XMLHttpRequest.prototype.send = function (body) {
    if (!this.__aisuIsGen) {
      return _origSend.apply(this, arguments);
    }

    let modifiedBody = body;
    if (overrideModelId && typeof body === 'string' && body.includes('models/')) {
      modifiedBody = body.replace(/models\/gemini-[a-zA-Z0-9\.\-_]+/g, 'models/' + overrideModelId);
    }

    const request = requestMeta();
    emitRequest(request, modifiedBody);

    window.dispatchEvent(new CustomEvent('__sl_generateContentRequest', {
      detail: { url: this.__aisuUrl, model: overrideModelId || DynamicStudioAPI.getModel(), ts: Date.now() }
    }));

    const xhr = this;
    let finished = false;
    const finish = (ok) => {
      if (finished) return;
      finished = true;
      emitRequestFinished(request, ok);
    };
    xhr.addEventListener('loadend', () => finish(xhr.status >= 200 && xhr.status < 300), { once: true });
    let snap = '';
    let snapTime = 0;
    let didLogSanitize = false;

    // ── 1. ABORT BLOCK (Core Bypass Feature) ─────────────────────────
    xhr.abort = function () {
      if (!bypassEnabled) {
        return _origAbort.apply(this, arguments);
      }
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

    try {
      return _origSend.call(this, modifiedBody);
    } catch (error) {
      finish(false);
      throw error;
    }
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


  // ── Media / File Download handler ─────────────────────────────────
  window.addEventListener('__sl_download_media', (e) => {
    const detail = e.detail || {};
    const filename = detail.filename || 'download';
    const target = document.querySelector('[data-sl-dl-target="true"]');
    if (!target) return;
    target.removeAttribute('data-sl-dl-target');

    // 1. Try native download button in chunk
    const nativeBtn = target.querySelector('button[aria-label*="ownload"]') ||
                      target.querySelector('.bottom-right-image-controls button');
    if (nativeBtn) {
      nativeBtn.click();
      return;
    }

    // 2. Fallback for image chunks
    const img = target.querySelector('img');
    if (img && img.src) {
      const a = document.createElement('a');
      a.href = img.src;
      a.download = filename.includes('.') ? filename : `${filename}.png`;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => a.remove(), 1000);
      return;
    }

    // 3. Fallback: click target
    target.click();
  });

  // ═══════════════════════════════════════════════════════════════════
  // TELEMETRY BLOCKER — MAIN world fetch() intercept for logging
  // The actual blocking is done by declarativeNetRequest rules, but
  // this intercept lets us COUNT and LOG blocked requests for the UI.
  // ═══════════════════════════════════════════════════════════════════

  // Intercept fetch() for telemetry logging & model override
  const _origFetch = window.fetch;
  window.fetch = async function (input, init) {
    let url = typeof input === 'string' ? input
      : (input && (input.url || input.href)) || '';
    const isGen = isGenerateContentUrl(url);

    if (isGen && overrideModelId) {
      const rewrittenUrl = url.replace(/models\/[^:\/]+/, 'models/' + overrideModelId);
      if (typeof input === 'string') {
        input = rewrittenUrl;
      } else if (typeof URL !== 'undefined' && input instanceof URL) {
        input = rewrittenUrl;
      } else if (input && typeof Request !== 'undefined' && input instanceof Request) {
        input = new Request(rewrittenUrl, input);
      }
      url = rewrittenUrl;
      if (init && typeof init.body === 'string' && init.body.includes('models/')) {
        init = { ...init, body: init.body.replace(/models\/gemini-[a-zA-Z0-9\.\-_]+/g, 'models/' + overrideModelId) };
      }
      console.log(
        '%c[Studio.lab] 🔄 Model swapped in fetch request: ' + overrideModelId,
        'color:#87a9ff;font-weight:bold'
      );
    }

    const isTelemetry = isTelemetryUrl(url);
    window.dispatchEvent(new CustomEvent('__sl_networkRequest', {
      detail: { url, method: (init && init.method) || (input && input.method) || 'GET', ts: Date.now(), isTelemetry }
    }));

    const request = isGen ? requestMeta() : null;
    if (request) emitRequest(request, init && init.body);

    const isSave = /prompt.*(?:update|create|save|set)|drive.*(?:files|upload)/i.test(url);
    if (isSave) {
      window.dispatchEvent(new CustomEvent('__sl_savingState', { detail: { saving: true, url } }));
    }

    try {
      const res = await _origFetch.apply(this, init === undefined ? [input] : [input, init]);
      if (request) emitRequestFinished(request, res.ok);
      if (isSave) {
        window.dispatchEvent(new CustomEvent('__sl_savingState', { detail: { saving: false, url } }));
      }
      return res;
    } catch (fetchErr) {
      if (request) emitRequestFinished(request, false);
      if (isSave) {
        window.dispatchEvent(new CustomEvent('__sl_savingState', { detail: { saving: false, url } }));
      }
      throw fetchErr;
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  // BUILD INFO DATA BRIDGE — sends runtime data to content script
  // ═══════════════════════════════════════════════════════════════════
  function emitBuildInfo() {
    try {
      const toggles = window._F_toggles_default_MakerSuite || null;
      const scripts = document.querySelectorAll('script[src*="boq-makersuite"]');
      let buildId = null;
      if (scripts.length > 0) {
        const src = scripts[0].src;
        const match = src.match(/k=boq-makersuite\.MakerSuite\.[^/]+/);
        if (match) buildId = match[0].replace('k=boq-makersuite.MakerSuite.', '');
      }
      window.dispatchEvent(new CustomEvent('__sl_buildInfo', {
        detail: { toggles, buildId, ts: Date.now() }
      }));
    } catch (_) {}
  }

  // Emit build info once DOM is ready
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(emitBuildInfo, 2000);
  } else {
    window.addEventListener('DOMContentLoaded', () => setTimeout(emitBuildInfo, 2000));
  }

  // Also re-emit on request from content script
  window.addEventListener('__sl_requestBuildInfo', emitBuildInfo);

  console.log(
    '%c[Studio.lab] ⚡ Angular Bypass + Telemetry Shield active (MAIN world)',
    'color:#87a9ff;font-weight:bold;font-size:12px'
  );
})();

