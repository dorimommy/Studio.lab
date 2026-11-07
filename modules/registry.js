// Isolated-world features register descriptors here; content.js delegates lifecycle and actions to them.
(function () {
  'use strict';

  const modules = [];
  const invalidationListeners = new Set();
  let extensionInvalidated = false;

  function invalidateExtension() {
    if (extensionInvalidated) return;
    extensionInvalidated = true;
    for (const listener of [...invalidationListeners]) {
      try { listener(); } catch (_) { log('Extension cleanup failed.', 'warn'); }
    }
    invalidationListeners.clear();
  }

  function isExtensionActive() {
    if (extensionInvalidated) return false;
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.id) return true;
    } catch (_) {}
    invalidateExtension();
    return false;
  }

  function handleExtensionError(error) {
    if (/extension context invalidated/i.test(error?.message || String(error))) {
      invalidateExtension();
      return true;
    }
    return !isExtensionActive();
  }

  function onExtensionInvalidated(listener) {
    if (extensionInvalidated) listener();
    else invalidationListeners.add(listener);
    return () => invalidationListeners.delete(listener);
  }

  function registerModule(module) {
    if (!module || !module.id) return;
    const idx = modules.findIndex(item => item.id === module.id);
    if (idx !== -1) {
      modules[idx] = module;
      return;
    }
    modules.push(module);
  }

  function getModules() {
    return modules
      .slice()
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  const SELECTORS = {
    CHAT_TURN: 'ms-chat-turn',
    THOUGHT_CHUNK: 'ms-thought-chunk',
    TEXT_CHUNK: '.text-chunk, ms-text-chunk',
    PROMPT_BOX: 'ms-prompt-box',
    AUTOSCROLL_CONTAINER: 'ms-autoscroll-container',
    LOADING_INDICATOR: 'ms-chat-loading-indicator',
    OMNIBAR: 'ms-omnibar',
    OMNIBAR_RESULTS: '#omnibar-results',
    SIDEBAR_ANCHORS: [
      'ms-system-instructions-panel',
      'ms-model-selector',
      '.selector-container.field-group',
      'ms-run-settings'
    ]
  };

  function log(message, type = 'info') {
    const colors = {
      info: 'color:#87a9ff;font-weight:bold',
      success: 'color:#66bb6a;font-weight:bold',
      warn: 'color:#ffca28;font-weight:bold',
      error: 'color:#ef5350;font-weight:bold'
    };
    console.log(`%c[Studio.lab] ${message}`, colors[type] || colors.info);
  }

  // Lifecycle scopes now live in @studiolab/core (dist/core.js, loaded first
  // in every content-script group). This stays as a thin alias so existing
  // callers of window.StudioLab.createScope() keep working unchanged.
  function createScope() {
    return window.StudioLabCore.scope();
  }

  window.StudioLab = Object.assign(window.StudioLab || {}, {
    registerModule,
    getModules,
    createScope,
    isExtensionActive,
    handleExtensionError,
    onExtensionInvalidated,
    SELECTORS,
    log
  });
})();
