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
    if (modules.some(item => item.id === module.id)) return;
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

  window.StudioLab = Object.assign(window.StudioLab || {}, {
    registerModule,
    getModules,
    SELECTORS,
    log
  });
})();
