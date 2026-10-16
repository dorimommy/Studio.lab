(function () {
  'use strict';

  // The preview registers only the production MWC module; it loads no main
  // extension registry, storage, network or GAIS application code.
  let modernChat = null;
  let themePreview = null;
  let feedbackTimer = null;
  const parameters = new URLSearchParams(location.hash.slice(1));
  const requestId = parameters.get('request') || '';
  const validRequest = /^[a-zA-Z0-9_-]{1,120}$/.test(requestId);
  // The native host may intentionally omit Referer on this private iframe.
  // Its production parent is fixed; local visual inspection stays same-origin.
  let parentOrigin = location.protocol === 'chrome-extension:' && parent !== window
    ? 'https://aistudio.google.com' : location.origin;
  try {
    const origin = new URL(document.referrer).origin;
    if (origin === 'https://aistudio.google.com' || origin === location.origin) parentOrigin = origin;
  } catch (_) {}
  const requestedParent = parameters.get('parent');
  if (requestedParent === 'https://aistudio.google.com' || requestedParent === location.origin) {
    parentOrigin = requestedParent;
  }
  const embedded = parent !== window && validRequest;
  const models = Object.freeze([
    Object.freeze({ id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' }),
    Object.freeze({ id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' }),
    Object.freeze({ id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite' })
  ]);
  let model = models[0];
  let thinkingLevel = 'High';
  const thinkingLevels = Object.freeze(['Low', 'Medium', 'High']);
  window.StudioLab = Object.freeze({ registerModule(value) {
    if (value?.id === 'modern-web-chat') modernChat = value;
  } });

  function reply(type, extra = {}) {
    if (embedded) parent.postMessage({ type, requestId, ...extra }, parentOrigin);
  }
  function feedback(message) {
    const node = document.getElementById('preview-feedback');
    node.textContent = message;
    node.hidden = false;
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => { node.hidden = true; }, 1800);
  }
  const controls = Object.freeze({
    getModel: () => model,
    getModels: () => models,
    getThinkingLevel: () => thinkingLevel,
    getThinkingLevels: () => thinkingLevels,
    setModel(id) {
      const next = models.find(value => value.id === id);
      if (!next) return false;
      model = next;
      document.querySelector('ms-model-selector .title').textContent = next.name;
      return true;
    },
    setThinkingLevel(level) {
      if (!thinkingLevels.includes(level)) return false;
      thinkingLevel = level;
      document.querySelector('.mat-mdc-select-value-text').textContent = level;
      return true;
    },
    onSettingsToggle(open) {
      document.querySelector('ms-right-side-panel').setAttribute('aria-hidden', String(!open));
      document.querySelector('ms-right-side-panel').inert = !open;
    }
  });

  function applyTheme(value) {
    const clean = window.StudioLabCatalogSchema.validateTheme(value);
    document.body.classList.toggle('light-theme', clean.mode === 'light');
    document.body.classList.toggle('dark-theme', clean.mode === 'dark');
    themePreview.preview(clean);
  }

  window.addEventListener('message', event => {
    if (!embedded || event.source !== parent || event.origin !== parentOrigin ||
        event.data?.type !== 'sl-theme-preview-update' || event.data.requestId !== requestId) return;
    try {
      if (!themePreview) throw new Error('Preview not ready.');
      applyTheme(event.data.theme);
      reply('sl-theme-preview-applied');
    } catch (_) {
      reply('sl-theme-preview-error', { error: 'This theme could not be previewed.' });
    }
  });

  function toggleNavigation() {
    if (innerWidth <= 768) document.body.classList.toggle('sl-preview-mobile-nav');
    else document.body.classList.toggle('sl-preview-nav-collapsed');
  }

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      if (!modernChat || !window.StudioLabTheme?.start) throw new Error('Preview unavailable.');
      modernChat.init({ state: { modernWebChatEnabled: true }, previewControls: controls });
      themePreview = window.StudioLabTheme.start(window, { isolatedPreview: true });
      controls.onSettingsToggle(false);
      const standaloneMode = !embedded && new URLSearchParams(location.search).get('appearance') === 'light' ? 'light' : 'dark';
      applyTheme(window.StudioLabCatalogSchema.DEFAULT_THEMES[standaloneMode]);
      document.querySelectorAll('[aria-label="Open navigation menu"], [aria-label="Collapse navigation menu"]').forEach(button => button.addEventListener('click', toggleNavigation));
      document.querySelector('[data-preview-thinking]').addEventListener('click', () => document.querySelector('.sl-header-thinking-btn')?.click());
      document.querySelectorAll('mat-slide-toggle button').forEach(button => button.addEventListener('click', () => {
        const on = button.getAttribute('aria-checked') !== 'true';
        button.setAttribute('aria-checked', String(on));
        button.closest('mat-slide-toggle').classList.toggle('mat-mdc-slide-toggle-checked', on);
      }));
      const temperature = document.getElementById('sample-temperature');
      temperature.addEventListener('input', () => document.querySelector('output[for="sample-temperature"]').textContent = temperature.value);
      document.querySelector('[data-remove-tool]').addEventListener('click', event => event.currentTarget.closest('.enabled-tool').remove());
      const runButton = document.querySelector('ms-run-button button');
      runButton.disabled = true;
      runButton.setAttribute('aria-disabled', 'true');
      document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
        const selectors = { 'sample-prompt': '.chat-turn-container.user .user-chunk', 'sample-code': 'ms-code-block code', 'sample-response': '.chat-turn-container.model ms-text-chunk' };
        const text = document.querySelector(selectors[button.dataset.copy])?.innerText || '';
        try { await navigator.clipboard.writeText(text); feedback('Copied'); }
        catch (_) { feedback('Copy is unavailable in this preview.'); }
      }));
      document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        if (document.querySelector('.sl-custom-dropdown')) return;
        if (document.body.classList.contains('sl-settings-open')) return;
        reply('sl-theme-preview-close');
      }, true);
      // Ready is sent only after the canonical module and default palette are
      // installed. The parent can then send the draft palette without a flash.
      await document.fonts.ready;
      reply('sl-theme-preview-ready');
    } catch (_) {
      reply('sl-theme-preview-error', { error: 'Theme preview is unavailable.' });
    }
  }, { once: true });

  window.addEventListener('pagehide', () => {
    clearTimeout(feedbackTimer);
    themePreview?.endPreview();
    modernChat?.dispose();
  }, { once: true });
})();
