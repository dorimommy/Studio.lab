(function () {
  'use strict';
  const { $$, scope } = window.StudioLabCore;
  const lifetime = scope();

  // The preview registers only the production MWC module; it loads no main
  // extension registry, storage, network or GAIS application code.
  let modernChat = null;
  let themePreview = null;
  let disposed = false;
  let previewGeneration = 0;
  let hideFeedback = null;
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
  window.StudioLab = { registerModule(value) {
    if (value?.id === 'modern-web-chat') modernChat = value;
  } };

  function reply(type, extra = {}) {
    if (embedded && !disposed) parent.postMessage({ type, requestId, ...extra }, parentOrigin);
  }
  function feedback(message) {
    const node = document.getElementById('preview-feedback');
    node.textContent = message;
    node.hidden = false;
    hideFeedback?.();
    hideFeedback = lifetime.timeout(() => { document.getElementById('preview-feedback').hidden = true; }, 1800);
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
    window.StudioLab.themeEngine?.clearCustomTheme();
    document.body.classList.toggle('light-theme', clean.mode === 'light');
    document.body.classList.toggle('dark-theme', clean.mode === 'dark');
    themePreview.preview(clean);
  }

  lifetime.on(window, 'message', async event => {
    if (!embedded || event.source !== parent || event.origin !== parentOrigin ||
        !['sl-theme-preview-update', 'sl-theme-editor-preview-update'].includes(event.data?.type) || event.data.requestId !== requestId) return;
    const generation = ++previewGeneration;
    try {
      if (!themePreview) throw new Error('Preview not ready.');
      if (event.data.type === 'sl-theme-editor-preview-update') {
        const clean = await window.StudioLab.themePresets.sanitizeEditorPreview(event.data.config);
        if (disposed || generation !== previewGeneration) return;
        const color = clean.mainInterface.uiBase;
        const rgb = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16));
        const light = (rgb[0] * .299 + rgb[1] * .587 + rgb[2] * .114) / 255 > .6;
        document.body.classList.toggle('light-theme', light);
        document.body.classList.toggle('dark-theme', !light);
        themePreview.endPreview();
        await window.StudioLab.themeEngine.previewInIsolated(clean);
        if (disposed || generation !== previewGeneration) return;
        if (document.body.getAttribute('data-sl-editor-theme') !== 'true') throw new Error('Preview unavailable.');
      } else applyTheme(event.data.theme);
      reply('sl-theme-preview-applied');
    } catch (_) {
      if (!disposed && generation === previewGeneration) reply('sl-theme-preview-error', { error: 'This theme could not be previewed.' });
    }
  });

  function toggleNavigation() {
    if (innerWidth <= 768) document.body.classList.toggle('sl-preview-mobile-nav');
    else document.body.classList.toggle('sl-preview-nav-collapsed');
  }

  lifetime.on(document, 'DOMContentLoaded', async () => {
    try {
      if (!modernChat || !window.StudioLabTheme?.start) throw new Error('Preview unavailable.');
      modernChat.init({ state: { modernWebChatEnabled: true }, previewControls: controls });
      themePreview = window.StudioLabTheme.start(window, { isolatedPreview: true });
      controls.onSettingsToggle(false);
      const standaloneMode = !embedded && new URLSearchParams(location.search).get('appearance') === 'light' ? 'light' : 'dark';
      applyTheme(window.StudioLabCatalogSchema.DEFAULT_THEMES[standaloneMode]);
      $$('[aria-label="Open navigation menu"], [aria-label="Collapse navigation menu"]').forEach(button => lifetime.on(button, 'click', toggleNavigation));
      lifetime.on(document.querySelector('[data-preview-thinking]'), 'click', () => document.querySelector('.sl-header-thinking-btn')?.click());
      lifetime.on(document.querySelector('[aria-label="Close run settings panel"]'), 'click', () => document.querySelector('.sl-header-settings-btn')?.click());
      $$('mat-slide-toggle button').forEach(button => lifetime.on(button, 'click', () => {
        const on = button.getAttribute('aria-checked') !== 'true';
        button.setAttribute('aria-checked', String(on));
        button.closest('mat-slide-toggle').classList.toggle('mat-mdc-slide-toggle-checked', on);
      }));
      const temperature = document.getElementById('sample-temperature');
      lifetime.on(temperature, 'input', () => document.querySelector('output[for="sample-temperature"]').textContent = temperature.value);
      lifetime.on(document.querySelector('[data-remove-tool]'), 'click', event => event.currentTarget.closest('.enabled-tool').remove());
      const runButton = document.querySelector('ms-run-button button');
      runButton.disabled = true;
      runButton.setAttribute('aria-disabled', 'true');
      $$('[data-copy]').forEach(button => lifetime.on(button, 'click', async () => {
        const selectors = { 'sample-prompt': '.chat-turn-container.user .user-chunk', 'sample-code': 'ms-code-block code', 'sample-response': '.chat-turn-container.model ms-text-chunk' };
        const text = document.querySelector(selectors[button.dataset.copy])?.innerText || '';
        try { await navigator.clipboard.writeText(text); feedback('Copied'); }
        catch (_) { feedback('Copy is unavailable in this preview.'); }
      }));
      lifetime.on(document, 'keydown', event => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        if (document.querySelector('.sl-custom-dropdown')) return;
        if (document.body.classList.contains('sl-settings-open')) return;
        reply('sl-theme-preview-close');
      }, true);
      // Ready is sent only after the canonical module and default palette are
      // installed. The parent can then send the draft palette without a flash.
      await document.fonts.ready;
      const sampleControls = '[data-copy], [data-preview-thinking], [data-remove-tool], mat-slide-toggle button, .sl-header-model-btn, .sl-header-thinking-btn, .sl-header-settings-btn, [aria-label="Open navigation menu"], [aria-label="Collapse navigation menu"], [aria-label="Close run settings panel"]';
      $$('button').forEach(button => {
        if (button.matches(sampleControls)) return;
        button.disabled = true;
        button.title = 'This action is unavailable in the sample conversation.';
      });
      reply('sl-theme-preview-ready');
    } catch (_) {
      reply('sl-theme-preview-error', { error: 'Theme preview is unavailable.' });
    }
  }, { once: true });

  lifetime.on(window, 'pagehide', () => {
    disposed = true;
    previewGeneration++;
    window.StudioLab.themeEngine?.clearCustomTheme();
    themePreview?.endPreview();
    modernChat?.dispose();
    lifetime.dispose();
  }, { once: true });
})();
