// Runs in MAIN at document_start, before Angular consumes GenerateContent responses.
(function () {
  'use strict';

  // SDK: window.StudioLabCore is bundled before this file (MAIN world, no chrome.* here).
  const { $, $$, el, waitFor } = window.StudioLabCore;

  // Capture Angular's internal LView map before bootstrap.
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

  // Modern Web Chat needs desktop actions mounted on small screens; native geometry applies otherwise.
  let modernWebChatEnabled = false;
  const headerObservers = new Set();
  window.addEventListener('__sl_modernWebChatToggle', (event) => {
    const enabled = event.detail?.enabled === true;
    if (enabled === modernWebChatEnabled) return;
    modernWebChatEnabled = enabled;
    // A setting change need not physically resize the header. Replay its last
    // native observation so Angular also updates the mounted action controls.
    headerObservers.forEach(observer => observer.refreshHeader());
  });

  if (typeof Element !== 'undefined' && Element.prototype) {
    const _origGBCR = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      const rect = _origGBCR.apply(this, arguments);
      if (modernWebChatEnabled && this && this.tagName === 'MS-HEADER') {
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
        let notify;
        super((entries, observer) => notify(entries, observer));
        this.headerEntries = new Map();
        notify = (entries, observer) => {
          entries.forEach(entry => {
            if (entry.target?.tagName === 'MS-HEADER') this.headerEntries.set(entry.target, entry);
          });
          const proxiedEntries = entries.map(entry => {
            if (modernWebChatEnabled && entry?.target?.tagName === 'MS-HEADER') {
              return new Proxy(entry, {
                get(target, prop) {
                  if (prop === 'contentRect') {
                    const cr = target.contentRect;
                    return new Proxy(cr, {
                      get(rTarget, rProp) {
                        if (rProp === 'width') return Math.max(rTarget.width, 1024);
                        const value = rTarget[rProp];
                        return typeof value === 'function' ? value.bind(rTarget) : value;
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
        };
        this.refreshHeader = () => {
          if (this.headerEntries.size) notify([...this.headerEntries.values()], this);
        };
      }
      observe(target, options) {
        super.observe(target, options);
        if (target?.tagName === 'MS-HEADER') headerObservers.add(this);
      }
      unobserve(target) {
        super.unobserve(target);
        this.headerEntries.delete(target);
        if (!this.headerEntries.size) headerObservers.delete(this);
      }
      disconnect() {
        super.disconnect();
        this.headerEntries.clear();
        headerObservers.delete(this);
      }
    };
  }

  const DynamicStudioAPI = {
    _getMap() {
      if (!mapCaptureActive && window.__NG_LVIEW_MAP__) {
        return window.__NG_LVIEW_MAP__;
      }
      // A live DOM context identifies Angular's registry among candidate maps.
      const probeEls = $$('ms-run-settings, ms-prompt-run-settings, ms-system-instructions-panel, app-root, ms-prompt-box');
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

      const rs = $('ms-run-settings, ms-prompt-run-settings');
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
      const modelSelect = $('ms-model-selector span[data-test-id="model-name"]');
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
      const tempInput = $('ms-temperature-slider input');
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
      const tempInput = $('ms-temperature-slider input');
      if (tempInput) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(tempInput, val);
        tempInput.dispatchEvent(new Event('input', { bubbles: true }));
        tempInput.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      return false;
    },

    setSystemInstructions(text, callback, guard = () => true) {
      if (typeof text !== 'string') {
        if (callback) callback(false);
        return;
      }
      const apply = (input) => {
        if (!input || !guard()) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        setter.call(input, text);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return guard() && input.value === text;
      };
      let textarea = $('textarea[aria-label="System instructions"], ms-system-instructions textarea');
      if (textarea) {
        if (callback) callback(apply(textarea));
        else apply(textarea);
        return;
      }
      const btn = $('ms-system-instructions-panel button');
      if (!btn || !guard()) {
        if (callback) callback(false);
        return;
      }
      btn.click();
      // Was: hand-rolled waitForPanel with an attempts counter (30 × 50 ms).
      // waitFor keeps the same timing; a failed guard resolves null → callback(false),
      // exactly like the original guard-fail and timeout paths (apply(null) === false).
      setTimeout(async () => {
        textarea = await waitFor(() => {
          if (!guard()) return null;
          return $('textarea[aria-label="System instructions"], ms-system-instructions textarea');
        }, { timeout: 1500, interval: 50 });
        const applied = apply(textarea);
        const closeBtn = $('button[aria-label="Close panel"]');
        if (textarea && guard() && closeBtn) closeBtn.click();
        if (callback) callback(applied);
      }, 50);
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
      const btn = $('button[aria-label*="Edit prompt title" i], .page-title button, button[aria-label*="Edit title" i]');
      if (btn) {
        try {
          btn.click();
          return true;
        } catch (_) {}
      }
      const map = this._getMap();
      const header = $('ms-header');
      if (map && header && typeof header.__ngContext__ === 'number' && map.has(header.__ngContext__)) {
        const lview = map.get(header.__ngContext__);
        const comp = lview ? lview[8] : null;
        if (comp && comp.Ffa && typeof comp.Ffa.set === 'function') {
          comp.nHb?.set(true);
          comp.Ffa.set(true);
          document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          setTimeout(() => {
            const b = $('button[aria-label*="Edit prompt title" i], .page-title button, button[aria-label*="Edit title" i]');
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

      if (q.includes('image')) {
        if (rs.enableImageSearch && typeof rs.enableImageSearch.set === 'function') {
          rs.enableImageSearch.set(val);
          return true;
        }
        return false;
      }
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
      const toolToggles = $$('ms-prompt-run-settings mat-slide-toggle, ms-run-settings mat-slide-toggle');
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

    const inlineTextarea = $('textarea[aria-label="System instructions"], ms-system-instructions textarea');
    if (inlineTextarea && inlineTextarea.value) {
      profile.systemInstructions = inlineTextarea.value;
    } else {
      const panel = $('ms-system-instructions-panel');
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

    let appliedAll = true;
    for (const item of tools) {
      const ok = DynamicStudioAPI.setTool(item.name, item.checked);
      if (!ok) appliedAll = false;
    }
    if (appliedAll) {
      return next();
    }

    const toggles = $$('ms-prompt-run-settings mat-slide-toggle, ms-run-settings mat-slide-toggle');
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

    if (profile.model) {
      const ok = DynamicStudioAPI.setModel(profile.model);
      if (ok) clearModelOverride();
      else installModelOverride(profile.model);
    }

    if (typeof profile.temperature !== 'undefined') {
      DynamicStudioAPI.setTemperature(profile.temperature);
    }

    DynamicStudioAPI.setSystemInstructions(profile.systemInstructions, () => {
      applyTools(profile.tools, () => {
        window.dispatchEvent(new CustomEvent('__sl_result_' + eventId, { detail: true }));
      });
    });
  });

  const URL_MARKER = 'GenerateContent';
  const EVENT_NAME = '__aisu_xhrCapture';

  function isGenerateContentUrl(u) {
    if (!u || typeof u !== 'string') return false;
    return u.toLowerCase().includes('generatecontent');
  }

  let requestSequence = 0;
  let chatEpoch = 0;
  function requestMeta() {
    return {
      version: 1,
      requestId: 'sl_req_' + Date.now() + '_' + (++requestSequence),
      epoch: chatEpoch,
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

  function promptOperation(url) {
    try {
      const parsed = new URL(url, 'https://aistudio.google.com');
      if (!['aistudio.google.com', 'alkalimakersuite-pa.clients6.google.com'].includes(parsed.hostname)) return null;
      return parsed.pathname.match(/^\/\$rpc\/google\.internal\.alkali\.applications\.makersuite\.v1\.MakerSuiteService\/(CreatePrompt|UpdatePrompt)$/)?.[1] || null;
    } catch (_) { return null; }
  }

  function promptSaveMeta(operation) {
    const meta = requestMeta();
    return { version: 1, saveId: meta.requestId, epoch: meta.epoch, route: meta.route, ts: meta.ts, operation };
  }

  function emitPromptSaveRequest(meta, body) {
    window.dispatchEvent(new CustomEvent('__sl_promptSaveRequest', {
      detail: { ...meta, body: typeof body === 'string' ? body : null }
    }));
  }

  function emitPromptSaveResult(meta, body, ok) {
    let name = null;
    if (ok) {
      try {
        const prompt = typeof body === 'string' ? JSON.parse(body.replace(/^\s*\)\]\}'[^\r\n]*[\r\n]+/, '')) : body;
        const value = Array.isArray(prompt) ? prompt[0] : null;
        if (typeof value === 'string' && /^prompts\/[A-Za-z0-9_-]+$/.test(value) &&
            !/^prompts\/new_(?:chat|image|video|comparison)$/.test(value)) name = value;
      } catch (_) {}
    }
    window.dispatchEvent(new CustomEvent('__sl_promptSaveResult', {
      detail: { ...meta, ok: !!ok && !!name, complete: true, name }
    }));
  }

  let responseRecoveryEnabled = true;

  window.addEventListener('__sl_responseRecoveryToggle', (e) => {
    responseRecoveryEnabled = !!e.detail;
  });

  // Capture native methods before Angular patches them.
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

  // A content-script event supplies the fallback model for outgoing generation requests.
  let overrideModelId = null;
  let overrideBaseModel = null;
  let stealthOverrideModelId = null;
  const activeGenerationXhrs = new Set();

  function clearModelOverride() {
    overrideModelId = null;
    overrideBaseModel = null;
    if (document.documentElement) {
      delete document.documentElement.dataset.slActiveModel;
      delete document.documentElement.dataset.slActiveModelName;
    }
  }

  function installModelOverride(id) {
    if (typeof id !== 'string' || !/^(?:models\/)?[\w.-]+$/.test(id)) return;
    overrideModelId = id.replace(/^models\//, '');
    overrideBaseModel = DynamicStudioAPI.getModel();
  }

  function currentModelOverride() {
    if (stealthOverrideModelId) return stealthOverrideModelId;
    if (!overrideModelId) return null;
    const nativeModel = DynamicStudioAPI.getModel();
    if (nativeModel && !overrideBaseModel) {
      // Settings mount lazily. Their first readable value establishes the
      // baseline; it does not prove that the user changed the model.
      overrideBaseModel = nativeModel;
    } else if (nativeModel && nativeModel !== overrideBaseModel && nativeModel !== overrideModelId) {
      clearModelOverride(); // A native selection supersedes the fallback.
    }
    return overrideModelId;
  }

  function resolveStealthModelId(requestedId) {
    const cleanReq = String(requestedId || 'gemini-3.1-flash-lite').replace(/^models\//, '').trim();
    if (cleanReq === 'gemini-3.1-flash-lite') {
      return 'gemini-3.1-flash-lite';
    }
    try {
      const rawFeatured = window.localStorage && window.localStorage.getItem('sl_featured_models');
      if (rawFeatured) {
        const list = JSON.parse(rawFeatured);
        if (Array.isArray(list) && list.length > 0) {
          const exact = list.find(m => m && m.id === cleanReq);
          if (exact && exact.id) return exact.id;
          const previewMatch = list.find(m => m && m.id === cleanReq + '-preview');
          if (previewMatch && previewMatch.id) return previewMatch.id;
          const prefixMatch = list.find(m => m && typeof m.id === 'string' && m.id.startsWith(cleanReq));
          if (prefixMatch && prefixMatch.id) return prefixMatch.id;
        }
      }
    } catch (_) {}
    return cleanReq;
  }

  window.addEventListener('__sl_routeChanged', (event) => {
    const current = event.detail?.current?.key;
    const previous = event.detail?.previous?.key;
    if (current && previous && current !== previous) {
      stealthOverrideModelId = null;
      clearModelOverride();
    }
  });
  document.addEventListener('click', event => {
    const resetButton = event.target?.closest?.('button[data-test-clear="outside"][aria-label="New chat"]');
    let resetsChat = resetButton?.getAttribute?.('data-test-clear') === 'outside' &&
      resetButton?.getAttribute?.('aria-label') === 'New chat';
    if (!resetsChat && event.isTrusted === true && event.button === 0 &&
        !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
      const anchor = event.target?.closest?.('a[href]');
      try {
        const url = anchor && new URL(anchor.href, 'https://aistudio.google.com');
        resetsChat = !!url && url.origin === 'https://aistudio.google.com' && url.pathname.replace(/\/+$/, '') === '/prompts/new_chat' &&
          !anchor.download && (!anchor.target || anchor.target === '_self');
      } catch (_) {}
    }
    if (resetsChat) {
      // The same-path New Chat action reuses Angular's component. Invalidate
      // ownership before its handler runs, including native proxy clicks.
      chatEpoch++;
      activeGenerationXhrs.forEach(xhr => { xhr.__slUserCancelled = true; });
      window.dispatchEvent(new CustomEvent('__sl_chatReset', {
        detail: { version: 1, epoch: chatEpoch, route: window.location.pathname }
      }));
    }
    const explicitStop = event.target?.closest?.('button.stop, [data-test-id="stop-button"], ms-run-button button[aria-label*="Stop" i]');
    const runButton = event.target?.closest?.('ms-run-button button');
    // Native Run/Stop lacks a Stop class or aria-label; its label can include separate shortcut lines.
    const nativeStop = runButton && /(?:^|\n)\s*Stop\s*(?:\n|$)/i.test(runButton.innerText || '');
    if (explicitStop || nativeStop) {
      activeGenerationXhrs.forEach(xhr => { xhr.__slUserCancelled = true; });
    }
  }, true);

  // Fast, signal-only selection for existing text chats. Unlike __sl_setModel,
  // this does not install a network override or claim success on failure.
  window.addEventListener('__sl_trySetModel', (e) => {
    const modelId = e.detail?.modelId;
    const requestId = e.detail?.requestId;
    if (!modelId || !requestId) return;
    let applied = false;
    try { applied = DynamicStudioAPI.setModel(modelId); } catch (_) {}
    if (applied) clearModelOverride();
    window.dispatchEvent(new CustomEvent('__sl_modelDirectResult', {
      detail: { requestId, applied }
    }));
  });

  window.addEventListener('__sl_stealthSwitchModel', (e) => {
    const requestId = e.detail?.requestId;
    const targetModel = e.detail?.modelId || 'gemini-3.1-flash-lite';
    const originalSignalModel = DynamicStudioAPI.getModel() || '';
    const originalOverrideModel = overrideModelId || null;
    const resolvedModelId = resolveStealthModelId(targetModel);

    let signalApplied = false;
    try {
      signalApplied = DynamicStudioAPI.setModel(resolvedModelId);
      if (!signalApplied && resolvedModelId !== targetModel) {
        signalApplied = DynamicStudioAPI.setModel(targetModel);
      }
    } catch (_) {}

    stealthOverrideModelId = resolvedModelId;

    if (requestId) {
      window.dispatchEvent(new CustomEvent('__sl_stealthSwitchModelResult', {
        detail: {
          requestId,
          originalSignalModel,
          originalOverrideModel,
          appliedModel: resolvedModelId,
          signalApplied
        }
      }));
    }
  });

  window.addEventListener('__sl_stealthRestoreModel', (e) => {
    const requestId = e.detail?.requestId;
    const originalSignalModel = e.detail?.originalSignalModel || '';
    const originalOverrideModel = e.detail?.originalOverrideModel || null;

    stealthOverrideModelId = null;

    let restoredSignal = false;
    if (originalSignalModel) {
      try {
        restoredSignal = DynamicStudioAPI.setModel(originalSignalModel);
      } catch (_) {}
    }
    overrideModelId = originalOverrideModel;
    if (originalOverrideModel) {
      overrideBaseModel = DynamicStudioAPI.getModel();
    }

    if (requestId) {
      window.dispatchEvent(new CustomEvent('__sl_stealthRestoreModelResult', {
        detail: { requestId, restoredSignal }
      }));
    }
  });

  window.addEventListener('__sl_setModel', (e) => {
    const id = e.detail && (e.detail.modelId || e.detail.model);
    const modelName = e.detail && e.detail.modelName;
    if (id) {
      const activeModelId = id.replace(/^models\//, '');
      const setOk = DynamicStudioAPI.setModel(id);
      if (setOk) clearModelOverride();
      else installModelOverride(id);
      if (document.documentElement) {
        document.documentElement.dataset.slActiveModel = activeModelId;
        document.documentElement.dataset.slActiveModelName = modelName || activeModelId;
      }
      window.dispatchEvent(new CustomEvent('__sl_modelChanged', {
        detail: { modelId: activeModelId, modelName: modelName || activeModelId, signalApplied: setOk }
      }));
      console.log(
        '%c[Studio.lab] 🔄 Model override / signal set: ' + id + (setOk ? ' (Signal OK)' : ' (XHR fallback)'),
        'color:#87a9ff;font-weight:bold'
      );
    }
  });

  window.addEventListener('__sl_clearModelOverride', clearModelOverride);

  window.addEventListener('__sl_setTool', (e) => {
    if (e.detail && e.detail.name) {
      DynamicStudioAPI.setTool(e.detail.name, e.detail.enabled);
    }
  });

  window.addEventListener('__sl_openEditPromptTitle', () => {
    DynamicStudioAPI.openEditPromptTitleDialog();
  });

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

  function rewriteModelUrl(rawUrl, modelId) {
    if (!modelId) return rawUrl;
    try {
      const url = new URL(rawUrl, window.location.href || 'https://aistudio.google.com/');
      const pathname = url.pathname.replace(/\/models\/[^/:]+(?=:(?:stream)?generatecontent$)/i, '/models/' + modelId);
      if (pathname === url.pathname) return rawUrl;
      url.pathname = pathname;
      return url.href;
    } catch (_) { return rawUrl; }
  }

  // JSON token ranges let us edit schema fields without reserializing prompt
  // text, signatures, images, whitespace, or an unfinished streaming suffix.
  function readJsonNode(raw, offset = 0) {
    let pos = offset;
    const whitespace = () => { while (/\s/.test(raw[pos] || '') && pos < raw.length) pos++; };
    const read = (depth) => {
      if (depth > 100) throw new Error('JSON nesting limit');
      whitespace();
      const start = pos, ch = raw[pos];
      if (ch === '[' || ch === '{') {
        const array = ch === '[', close = array ? ']' : '}';
        const node = { kind: array ? 'array' : 'object', start, end: ++pos, complete: false, items: [], fields: new Map() };
        whitespace();
        if (raw[pos] === close) { node.end = ++pos; node.complete = true; return node; }
        while (pos < raw.length) {
          let key;
          if (!array) {
            const keyNode = read(depth + 1);
            if (!keyNode.complete) return node;
            if (keyNode.kind !== 'string') throw new Error('Invalid JSON key');
            key = keyNode.value;
            whitespace();
            if (pos === raw.length) return node;
            if (raw[pos++] !== ':') throw new Error('Invalid JSON object');
          }
          const child = read(depth + 1);
          node.items.push(child);
          if (!array) node.fields.set(key, child);
          node.end = child.end;
          if (!child.complete) return node;
          whitespace();
          if (pos === raw.length) return node;
          if (raw[pos] === close) { node.end = ++pos; node.complete = true; return node; }
          if (raw[pos++] !== ',') throw new Error('Invalid JSON separator');
          whitespace();
        }
        return node;
      }
      if (ch === '"') {
        pos++;
        while (pos < raw.length) {
          if (raw[pos] === '\\') { pos += 2; continue; }
          if (raw[pos++] === '"') {
            const token = raw.slice(start, pos);
            return { kind: 'string', start, end: pos, complete: true,
              value: token.length <= 512 ? JSON.parse(token) : undefined };
          }
        }
        return { kind: 'string', start, end: raw.length, complete: false };
      }
      while (pos < raw.length && !/[\s,\]}]/.test(raw[pos])) pos++;
      const token = raw.slice(start, pos);
      if (!token || !/^(?:null|true|false|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)$/.test(token)) {
        if (pos === raw.length) return { kind: 'primitive', start, end: pos, complete: false };
        throw new Error('Invalid JSON token');
      }
      // A final digit can still be followed by more digits in the next chunk.
      if (pos === raw.length && /^-?\d/.test(token)) return { kind: 'primitive', start, end: pos, complete: false };
      return { kind: 'primitive', start, end: pos, complete: true, value: JSON.parse(token) };
    };
    return read(0);
  }

  function replaceJsonRanges(raw, replacements) {
    let result = raw;
    replacements.sort((a, b) => b.start - a.start).forEach(({ start, end, value }) => {
      result = result.slice(0, start) + value + result.slice(end);
    });
    return result;
  }

  function rewriteModelBody(body, modelId) {
    if (!modelId || typeof body !== 'string') return body;
    try {
      const root = readJsonNode(body);
      if (!root.complete || body.slice(root.end).trim()) return body;
      // MakerSuite's GenerateContentRequest proto field 1 is root[0]. The
      // public REST schema uses root.model. Never descend into contents/tools.
      const field = root.kind === 'array' && root.items[1]?.kind === 'array' ? root.items[0]
        : root.kind === 'object' ? root.fields.get('model') : null;
      if (field?.kind !== 'string' || typeof field.value !== 'string' ||
          !/^(?:models\/)?[\w.-]+$/.test(field.value)) return body;
      return replaceJsonRanges(body, [{ start: field.start, end: field.end,
        value: JSON.stringify((field.value.startsWith('models/') ? 'models/' : '') + modelId) }]);
    } catch (_) { return body; }
  }

  function emitResponse(meta, body, ok) {
    if (!ok || typeof body !== 'string' || !body) return;
    window.dispatchEvent(new CustomEvent('__sl_responsePayload', {
      detail: { ...meta, body, ok: true, complete: true }
    }));
  }

  XMLHttpRequest.prototype.open = function (method, url) {
    // A reopened XHR must not attribute its new response to an older save.
    if (this.__slPromptSaveFinish) this.__slPromptSaveFinish(false);
    const rawUrl = typeof url === 'string' ? url : (url != null ? String(url) : '');
    let processedUrl = rawUrl;

    const modelOverride = currentModelOverride();
    if (modelOverride && isGenerateContentUrl(processedUrl)) {
      processedUrl = rewriteModelUrl(processedUrl, modelOverride);
      console.log(
        '%c[Studio.lab] 🔄 Model swapped in request: ' + overrideModelId,
        'color:#87a9ff'
      );
    }

    const isTelemetry = isTelemetryUrl(processedUrl);
    window.dispatchEvent(new CustomEvent('__sl_networkRequest', {
      detail: { url: processedUrl, method, ts: Date.now(), isTelemetry }
    }));

    this.__aisuUrl = processedUrl;
    this.__aisuIsGen = isGenerateContentUrl(processedUrl);
    this.__slPromptOperation = String(method).toUpperCase() === 'POST' ? promptOperation(processedUrl) : null;
    this.__slModelOverride = modelOverride;
    if (this.__slPatchedGeneration) {
      // Native XHR objects may be reopened for unrelated requests.
      delete this.abort;
      delete this.responseText;
      delete this.response;
      this.__slPatchedGeneration = false;
    }

    if (this.__slPromptOperation || /prompt.*(?:update|create|save|set)|drive.*(?:files|upload)/i.test(processedUrl)) {
      window.dispatchEvent(new CustomEvent('__sl_savingState', { detail: { saving: true, url: processedUrl } }));
      this.addEventListener('loadend', function () {
        window.dispatchEvent(new CustomEvent('__sl_savingState', { detail: { saving: false, url: processedUrl } }));
      }, { once: true });
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

    const args = Array.from(arguments);
    if (processedUrl !== rawUrl || typeof url !== 'string') {
      args[1] = processedUrl;
    }
    return _origOpen.apply(this, args);
  };

  XMLHttpRequest.prototype.send = function (body) {
    if (this.__slPromptOperation) {
      const xhr = this;
      const save = promptSaveMeta(this.__slPromptOperation);
      emitPromptSaveRequest(save, body);
      let finished = false;
      const finishSave = ok => {
        if (finished) return;
        finished = true;
        if (xhr.__slPromptSaveFinish === finishSave) delete xhr.__slPromptSaveFinish;
        let response;
        try { response = xhr.responseType === 'json' ? _nativeR?.call(xhr) : _nativeRT?.call(xhr); } catch (_) {}
        emitPromptSaveResult(save, response, ok);
      };
      this.__slPromptSaveFinish = finishSave;
      this.addEventListener('loadend', () => finishSave(xhr.status >= 200 && xhr.status < 300), { once: true });
      try { return _origSend.apply(this, arguments); }
      catch (error) { finishSave(false); throw error; }
    }
    if (!this.__aisuIsGen) {
      return _origSend.apply(this, arguments);
    }

    const modifiedBody = rewriteModelBody(body, this.__slModelOverride);

    const request = requestMeta();
    emitRequest(request, modifiedBody);

    window.dispatchEvent(new CustomEvent('__sl_generateContentRequest', {
      detail: { url: this.__aisuUrl, model: overrideModelId || DynamicStudioAPI.getModel(), ts: Date.now() }
    }));

    const xhr = this;
    xhr.__slPatchedGeneration = true;
    xhr.__slUserCancelled = false;
    activeGenerationXhrs.add(xhr);
    let finished = false;
    const finish = (ok) => {
      if (finished) return;
      finished = true;
      activeGenerationXhrs.delete(xhr);
      try { emitResponse(request, xhr.responseText, ok); } catch (_) {}
      emitRequestFinished(request, ok);
    };
    xhr.addEventListener('loadend', () => finish(!xhr.__slUserCancelled && xhr.status >= 200 && xhr.status < 300), { once: true });
    let snap = '';
    let snapTime = 0;
    let didLogSanitize = false;

    xhr.abort = function () {
      if (!responseRecoveryEnabled || xhr.__slUserCancelled || window.location.pathname !== request.route) {
        return _origAbort.apply(this, arguments);
      }
      console.log('%c[Studio.lab] 🚫 abort() blocked — preserving stream', 'color:#ff9800;font-weight:bold');
      return; 
    };

    let lastRaw, lastSanitized;
    const sanitize = raw => {
      if (raw !== lastRaw) { lastRaw = raw; lastSanitized = _sanitize(raw); }
      return lastSanitized;
    };
    if (_nativeRT) {
      Object.defineProperty(xhr, 'responseText', {
        get: function () {
          const raw = _nativeRT.call(this);
          if (!raw || !responseRecoveryEnabled) return raw;
          const clean = sanitize(raw);
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
            if (!responseRecoveryEnabled) return raw;
            return (raw && typeof raw === 'string') ? sanitize(raw) : raw;
          }
          return _nativeR.call(this);
        },
        configurable: true
      });
    }

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

  function _sanitize(raw) {
    if (typeof raw !== 'string' || !raw) return raw;
    const replacements = [];
    const blockedNames = new Set(['SAFETY', 'RECITATION', 'PROHIBITED_CONTENT', 'IMAGE_SAFETY',
      'SPII', 'BLOCKLIST', 'IMAGE_PROHIBITED_CONTENT', 'MODEL_ARMOR']);
    const blockedFinishCodes = new Set([3, 4, 7, 8, 11, 14, 17]);
    const blockedPromptCodes = new Set([1, 3, 4, 5]);
    const replace = (node, value) => {
      if (node?.complete) replacements.push({ start: node.start, end: node.end, value });
    };
    const blockedFinish = node => node?.complete &&
      (blockedNames.has(node.value) || blockedFinishCodes.has(node.value));
    const clearRatings = node => {
      if (node?.kind !== 'array') return;
      node.items.forEach(rating => {
        const blocked = rating.fields?.get('blocked');
        if (blocked?.value === true) replace(blocked, 'false');
      });
    };
    const contentIsModel = node => node?.kind === 'array' && node.items[0]?.kind === 'array' &&
      node.items[1]?.value === 'model';
    const nativeFrame = node => {
      if (node?.kind !== 'array' || node.items[0]?.kind !== 'array') return false;
      const candidates = node.items[0].items;
      const feedback = node.items[1];
      const hasFeedback = feedback?.kind === 'array' && blockedPromptCodes.has(feedback.items[0]?.value);
      if (!hasFeedback && (!candidates.length || !candidates.every(candidate =>
        candidate.kind === 'array' && (contentIsModel(candidate.items[0]) ||
          (node.items.length >= 3 && (candidate.items[0]?.value === null ||
            candidate.items[0]?.kind === 'array' && candidate.items[0].items.length === 0)))))) return false;
      candidates.forEach(candidate => {
        if (blockedFinish(candidate.items[1])) {
          replace(candidate.items[1], typeof candidate.items[1].value === 'number' ? '1' : '"STOP"');
          // Proto fields 2 and 4 are finishReason and finishMessage. Parts and
          // token usage have their own nested arrays and are never inspected.
          if (candidate.items[3]?.kind === 'string') replace(candidate.items[3], 'null');
        }
      });
      if (hasFeedback) replace(feedback, 'null');
      return true;
    };
    const response = node => {
      if (node.kind === 'object') {
        const candidates = node.fields.get('candidates');
        if (candidates?.kind === 'array') candidates.items.forEach(candidate => {
          if (candidate.kind !== 'object') return;
          const reason = candidate.fields.get('finishReason');
          if (blockedFinish(reason)) {
            replace(reason, typeof reason.value === 'number' ? '1' : '"STOP"');
            if (candidate.fields.get('finishMessage')?.kind === 'string') replace(candidate.fields.get('finishMessage'), 'null');
          }
          clearRatings(candidate.fields.get('safetyRatings'));
        });
        const feedback = node.fields.get('promptFeedback');
        if (feedback?.kind === 'object' && blockedNames.has(feedback.fields.get('blockReason')?.value)) replace(feedback, 'null');
        return;
      }
      if (nativeFrame(node)) return;
      // ServerStreaming returns [frames]; REST streaming returns [responses].
      // Traverse only these envelopes so nested parts and tool arguments remain intact.
      if (node.kind === 'array') node.items.forEach(frame => {
        if (frame.kind === 'object') response(frame);
        else if (!nativeFrame(frame) && frame.kind === 'array') frame.items.forEach(nativeFrame);
      });
    };
    try {
      if (/^\s*data:/.test(raw)) {
        const pattern = /(?:^|\n)data:\s*/g;
        let match;
        while ((match = pattern.exec(raw))) {
          if (raw.slice(pattern.lastIndex, pattern.lastIndex + 6) === '[DONE]') continue;
          response(readJsonNode(raw, pattern.lastIndex));
        }
      } else {
        let offset = raw.startsWith(")]}'") ? raw.indexOf('\n') + 1 : 0;
        while (offset < raw.length) {
          const node = readJsonNode(raw, offset);
          // Unknown length-prefixed transports must retain both their byte
          // counts and payloads; only the verified JSON envelopes are edited.
          if (node.kind !== 'array' && node.kind !== 'object') return raw;
          response(node);
          if (!node.complete) break;
          offset = node.end;
          while (/\s/.test(raw[offset] || '') && offset < raw.length) offset++;
        }
      }
      return replaceJsonRanges(raw, replacements);
    } catch (_) { return raw; } // Unknown/malformed encodings pass through intact.
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


  window.addEventListener('__sl_download_media', (e) => {
    const detail = e.detail || {};
    const filename = detail.filename || 'download';
    const target = $('[data-sl-dl-target="true"]');
    if (!target) return;
    target.removeAttribute('data-sl-dl-target');

    const nativeBtn = target.querySelector('button[aria-label*="ownload"]') ||
                      target.querySelector('.bottom-right-image-controls button');
    if (nativeBtn) {
      nativeBtn.click();
      return;
    }

    const img = target.querySelector('img');
    if (img && img.src) {
      const a = el('<a target="_blank"></a>');
      a.href = img.src;
      a.download = filename.includes('.') ? filename : `${filename}.png`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => a.remove(), 1000);
      return;
    }

    target.click();
  });

  // declarativeNetRequest handles blocking; this wrapper records telemetry for the UI.
  const _origFetch = window.fetch;
  window.fetch = async function (input, init) {
    let url = typeof input === 'string' ? input
      : (input && (input.url || input.href)) || '';
    const isGen = isGenerateContentUrl(url);
    // Capture ownership before reading a Request body asynchronously.
    const request = isGen ? requestMeta() : null;
    const operation = String(init?.method || input?.method || 'GET').toUpperCase() === 'POST' ? promptOperation(url) : null;
    const save = operation ? promptSaveMeta(operation) : null;
    const modelOverride = isGen ? currentModelOverride() : null;
    let requestBody = init && typeof init.body === 'string' ? init.body : null;
    const isRequest = typeof Request !== 'undefined' && input instanceof Request;
    let effectiveRequest = null;
    if ((isGen || save) && isRequest) {
      try {
        effectiveRequest = init === undefined ? input.clone() : new Request(input.clone(), init);
        requestBody = await effectiveRequest.clone().text();
      } catch (_) { /* A disturbed/unreadable body retains native fetch behavior. */ }
    }

    if (modelOverride) {
      const rewrittenUrl = rewriteModelUrl(url, modelOverride);
      const rewrittenBody = rewriteModelBody(requestBody, modelOverride);
      if (typeof input === 'string') {
        input = rewrittenUrl;
      } else if (typeof URL !== 'undefined' && input instanceof URL) {
        input = rewrittenUrl;
      } else if (isRequest && effectiveRequest) {
        const redirected = new Request(rewrittenUrl, effectiveRequest);
        input = rewrittenBody !== requestBody ? new Request(redirected, { body: rewrittenBody }) : redirected;
        init = undefined; // The caller's init was merged into effectiveRequest.
      }
      url = rewrittenUrl;
      if (init && typeof init.body === 'string' && rewrittenBody !== requestBody) init = { ...init, body: rewrittenBody };
      requestBody = rewrittenBody;
      console.log(
        '%c[Studio.lab] 🔄 Model swapped in fetch request: ' + overrideModelId,
        'color:#87a9ff;font-weight:bold'
      );
    }

    const isTelemetry = isTelemetryUrl(url);
    window.dispatchEvent(new CustomEvent('__sl_networkRequest', {
      detail: { url, method: (init && init.method) || (input && input.method) || 'GET', ts: Date.now(), isTelemetry }
    }));

    if (request) emitRequest(request, requestBody);
    if (save) emitPromptSaveRequest(save, requestBody);

    const isSave = !!save || /prompt.*(?:update|create|save|set)|drive.*(?:files|upload)/i.test(url);
    if (isSave) {
      window.dispatchEvent(new CustomEvent('__sl_savingState', { detail: { saving: true, url } }));
    }

    try {
      const res = await _origFetch.apply(this, init === undefined ? [input] : [input, init]);
      if (request) {
        if (res.ok && typeof res.clone === 'function') {
          // Read a clone in parallel; the page receives its original streaming
          // body immediately. Export/cleanup waits for the entire generation.
          try {
            res.clone().text().then(body => {
              emitResponse(request, body, true);
              emitRequestFinished(request, true);
            }).catch(() => emitRequestFinished(request, false));
          } catch (_) { emitRequestFinished(request, false); }
        } else emitRequestFinished(request, res.ok);
      }
      if (save) {
        if (res.ok && typeof res.clone === 'function') {
          try {
            res.clone().text().then(body => emitPromptSaveResult(save, body, true))
              .catch(() => emitPromptSaveResult(save, null, false));
          } catch (_) { emitPromptSaveResult(save, null, false); }
        } else emitPromptSaveResult(save, null, false);
      }
      if (isSave) {
        window.dispatchEvent(new CustomEvent('__sl_savingState', { detail: { saving: false, url } }));
      }
      return res;
    } catch (fetchErr) {
      if (request) emitRequestFinished(request, false);
      if (save) emitPromptSaveResult(save, null, false);
      if (isSave) {
        window.dispatchEvent(new CustomEvent('__sl_savingState', { detail: { saving: false, url } }));
      }
      throw fetchErr;
    }
  };

  function emitBuildInfo() {
    try {
      const toggles = window._F_toggles_default_MakerSuite || null;
      const scripts = $$('script[src*="boq-makersuite"]');
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

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(emitBuildInfo, 2000);
  } else {
    window.addEventListener('DOMContentLoaded', () => setTimeout(emitBuildInfo, 2000));
  }

  window.addEventListener('__sl_requestBuildInfo', emitBuildInfo);

  console.log(
    '%c[Studio.lab] ⚡ Response Recovery + Telemetry Shield active (MAIN world)',
    'color:#87a9ff;font-weight:bold;font-size:12px'
  );
})();

