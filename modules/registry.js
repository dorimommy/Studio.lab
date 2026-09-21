/**
 * Studio.lab module registry.
 *
 * Each isolated-world feature file registers a descriptor here. content.js only
 * reads descriptors and delegates lifecycle/actions back to the module.
 */
(function () {
  'use strict';

  const modules = [];

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

  // A scope owns resources for one activation, route, or settings dialog.
  function createScope() {
    const cleanups = new Set();
    let disposed = false;
    function add(cleanup) {
      let active = true;
      const cancel = () => {
        if (!active) return;
        active = false;
        cleanups.delete(cancel);
        cleanup();
      };
      if (disposed) cancel();
      else cleanups.add(cancel);
      return cancel;
    }
    return {
      get disposed() { return disposed; },
      add,
      listen(target, type, handler, options) {
        if (disposed) return () => {};
        target.addEventListener(type, handler, options);
        return add(() => target.removeEventListener(type, handler, options));
      },
      observe(observer, target, options) {
        if (disposed) { observer.disconnect(); return observer; }
        observer.observe(target, options);
        add(() => observer.disconnect());
        return observer;
      },
      timeout(fn, delay) {
        if (disposed) return () => {};
        const id = setTimeout(() => { cancel(); if (!disposed) fn(); }, delay);
        const cancel = add(() => clearTimeout(id));
        return cancel;
      },
      interval(fn, delay) {
        if (disposed) return () => {};
        const id = setInterval(() => { if (!disposed) fn(); }, delay);
        return add(() => clearInterval(id));
      },
      frame(fn) {
        if (disposed) return () => {};
        const id = requestAnimationFrame((time) => { cancel(); if (!disposed) fn(time); });
        const cancel = add(() => cancelAnimationFrame(id));
        return cancel;
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        for (const cleanup of [...cleanups].reverse()) {
          try { cleanup(); } catch (_) { log('Resource cleanup failed.', 'warn'); }
        }
      }
    };
  }

  window.StudioLab = Object.assign(window.StudioLab || {}, {
    registerModule,
    getModules,
    createScope,
    SELECTORS,
    log
  });
})();
