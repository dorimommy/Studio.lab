(function () {
  'use strict';

  if (!window.StudioLab || typeof window.StudioLab.registerModule !== 'function') return;

  // SDK: window.StudioLabCore is bundled before this file.
  const { $, $$, el, scope } = window.StudioLabCore;

  let ctxRef = null;
  let watching = false;
  let watcherScope = null;
  let taScope = null;
  let activeTextarea = null;
  let floatingToolbarEl = null;
  let inlineToolbarEl = null;
  let toggleBtnEl = null;
  let styleEl = null;
  let closeLinkModal = null;

  const SVG_ICONS = {
    bold: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"/></svg>',
    italic: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z"/></svg>',
    strikethrough: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10 19h4v-3h-4v3zM5 4v3h5v3h4V7h5V4H5zM3 14h18v-2H3v2z"/></svg>',
    ul: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z"/></svg>',
    ol: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z"/></svg>',
    task: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14l-8.02-8.02zM17.99 9l-1.41-1.42-6.59 6.59-2.58-2.57-1.42 1.41 4 4z"/></svg>',
    quote: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z"/></svg>',
    link: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>',
    code: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></svg>',
    format: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M5 17v2h14v-2H5zm4.5-4.2h5l.9 2.2h2.1L12.75 4h-1.5L6.5 15h2.1l.9-2.2zM12 5.98L13.87 11h-3.74L12 5.98z"/></svg>'
  };

  function t(key, fallback) {
    return window.StudioLab?.i18n?.t ? window.StudioLab.i18n.t(key, fallback || key) : (fallback || key);
  }

  const BUTTONS_FULL = [
    { id: 'bold', icon: SVG_ICONS.bold, titleKey: 'fmt_bold', title: 'Bold (Ctrl+B)', action: 'bold' },
    { id: 'italic', icon: SVG_ICONS.italic, titleKey: 'fmt_italic', title: 'Italic (Ctrl+I)', action: 'italic' },
    { id: 'strikethrough', icon: SVG_ICONS.strikethrough, titleKey: 'fmt_strikethrough', title: 'Strikethrough (Ctrl+Shift+X)', action: 'strikethrough' },
    { id: 'sep1', type: 'separator' },
    { id: 'h1', text: 'H1', titleKey: 'fmt_h1', title: 'Heading 1 (#)', action: 'h1' },
    { id: 'h2', text: 'H2', titleKey: 'fmt_h2', title: 'Heading 2 (##)', action: 'h2' },
    { id: 'h3', text: 'H3', titleKey: 'fmt_h3', title: 'Heading 3 (###)', action: 'h3' },
    { id: 'sep2', type: 'separator' },
    { id: 'ul', icon: SVG_ICONS.ul, titleKey: 'fmt_ul', title: 'Bullet List (- item)', action: 'ul' },
    { id: 'ol', icon: SVG_ICONS.ol, titleKey: 'fmt_ol', title: 'Numbered List (1. item)', action: 'ol' },
    { id: 'task', icon: SVG_ICONS.task, titleKey: 'fmt_task', title: 'Task List (- [ ] task)', action: 'task' },
    { id: 'quote', icon: SVG_ICONS.quote, titleKey: 'fmt_quote', title: 'Blockquote (> quote)', action: 'quote' },
    { id: 'sep3', type: 'separator' },
    { id: 'link', icon: SVG_ICONS.link, titleKey: 'fmt_link', title: 'Insert Link (Ctrl+K)', action: 'link' },
    { id: 'code', icon: SVG_ICONS.code, titleKey: 'fmt_code', title: 'Code Block / Inline Code', action: 'code' }
  ];

  const BUTTONS_FLOATING = [
    { id: 'bold', icon: SVG_ICONS.bold, titleKey: 'fmt_bold', title: 'Bold (Ctrl+B)', action: 'bold' },
    { id: 'italic', icon: SVG_ICONS.italic, titleKey: 'fmt_italic', title: 'Italic (Ctrl+I)', action: 'italic' },
    { id: 'strikethrough', icon: SVG_ICONS.strikethrough, titleKey: 'fmt_strikethrough', title: 'Strikethrough (Ctrl+Shift+X)', action: 'strikethrough' },
    { id: 'sep1', type: 'separator' },
    { id: 'ul', icon: SVG_ICONS.ul, titleKey: 'fmt_ul', title: 'Bullet List', action: 'ul' },
    { id: 'ol', icon: SVG_ICONS.ol, titleKey: 'fmt_ol', title: 'Numbered List', action: 'ol' },
    { id: 'sep2', type: 'separator' },
    { id: 'link', icon: SVG_ICONS.link, titleKey: 'fmt_link', title: 'Insert Link (Ctrl+K)', action: 'link' },
    { id: 'code', icon: SVG_ICONS.code, titleKey: 'fmt_code', title: 'Code', action: 'code' }
  ];

  // Component roles retain AI Studio's toolbar palette in both native themes.
  const CSS = `
    :is(.sl-fmt-toolbar, .sl-fmt-toggle, .sl-fmt-modal-overlay) {
      --sl-fmt-surface: #1f1f1f;
      --sl-fmt-inline-surface: #282a2c;
      --sl-fmt-border: #333;
      --sl-fmt-separator: #444748;
      --sl-fmt-text: #d4d4d4;
      --sl-fmt-text-strong: #e3e3e3;
      --sl-fmt-muted: #9aa0a6;
      --sl-fmt-hover: rgba(255, 255, 255, 0.08);
      --sl-fmt-active: rgba(255, 255, 255, 0.12);
      --sl-fmt-menu-hover: rgba(255, 255, 255, 0.1);
      --sl-fmt-toggle-hover: #2a2a2a;
      --sl-fmt-highlight: #fff;
      --sl-fmt-input: #1e1e1e;
      --sl-fmt-input-border: #444746;
      --sl-fmt-cancel: #c4c7c5;
      --sl-fmt-primary: #a8c7fa;
      --sl-fmt-focus: var(--sl-fmt-primary);
      --sl-fmt-primary-hover: #b4d0fa;
      --sl-fmt-on-primary: #041e49;
      --sl-fmt-scrim: rgba(0, 0, 0, 0.4);
      --sl-fmt-elevation-toolbar: 0 4px 8px 3px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.3);
      --sl-fmt-elevation-menu: 0 4px 12px rgba(0, 0, 0, 0.5);
      --sl-fmt-elevation-dialog: 0 8px 24px rgba(0, 0, 0, 0.4);
      --sl-fmt-control-size: 28px;
      --sl-fmt-toggle-size: var(--sl-space-8);
      --sl-fmt-dialog-width: 332px;
    }

    /* ── Shared toolbar base ────────────────────────────────────────── */
    .sl-fmt-toolbar {
      display: flex;
      align-items: center;
      gap: var(--sl-space-0-5);
      padding: var(--sl-space-1) var(--sl-space-1-5);
      background: var(--sl-fmt-surface);
      border: 1px solid var(--sl-fmt-border);
      border-radius: var(--sl-radius-md);
      box-shadow: var(--sl-fmt-elevation-toolbar);
      z-index: 1000;
      font-family: var(--sl-font-chat);
    }

    /* ── Floating toolbar (on text selection) ───────────────────────── */
    .sl-fmt-floating {
      position: fixed;
      pointer-events: none;
      opacity: 0;
      max-width: calc(100vw - var(--sl-space-6));
      box-sizing: border-box;
      flex-wrap: wrap;
      transform: translateY(var(--sl-space-1-5));
      transition: opacity var(--sl-duration-short) ease, transform var(--sl-duration-short) ease;
    }
    .sl-fmt-floating.sl-fmt-visible {
      pointer-events: auto;
      opacity: 1;
      transform: translateY(0);
    }

    /* ── Inline toolbar (attached directly inside ms-prompt-box) ─────── */
    .sl-fmt-inline {
      display: none;
      width: 100% !important;
      margin: 0 0 var(--sl-space-2) 0 !important;
      box-sizing: border-box !important;
      flex-wrap: wrap !important;
      background: var(--color-v3-surface-container-high, var(--sl-fmt-inline-surface)) !important;
      border: none !important;
      border-radius: var(--sl-radius-md) !important;
      box-shadow: none !important;
      padding: var(--sl-space-1-5) !important;
    }
    .sl-fmt-inline.sl-fmt-visible {
      display: flex;
    }

    /* ── Separator ──────────────────────────────────────────────────── */
    .sl-fmt-sep {
      width: 1px;
      height: var(--sl-space-4);
      background: var(--sl-fmt-separator);
      margin: 0 var(--sl-space-1);
      flex-shrink: 0;
    }

    /* ── Format buttons (round) ─────────────────────────────────────── */
    .sl-fmt-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: var(--sl-fmt-control-size);
      height: var(--sl-fmt-control-size);
      border-radius: var(--sl-radius-round);
      border: none;
      background: transparent;
      color: var(--sl-fmt-text);
      cursor: pointer;
      transition: background-color var(--sl-duration-fast) ease;
      flex-shrink: 0;
      padding: 0;
    }
    .sl-fmt-btn:hover {
      background-color: var(--sl-fmt-hover);
    }
    .sl-fmt-btn:active {
      background-color: var(--sl-fmt-active);
    }
    .sl-fmt-btn svg {
      pointer-events: none;
    }
    .sl-fmt-btn-text {
      font-family: var(--sl-font-chat);
      font-size: var(--sl-text-sm);
      font-weight: 500;
      line-height: 1;
    }

    /* ── Mobile Heading Dropdown (H ▾) ─────────────────────────────── */
    .sl-fmt-heading-dropdown {
      display: none;
      position: relative;
    }
    .sl-fmt-heading-btn {
      width: var(--sl-fmt-toggle-size) !important;
      font-weight: 600;
    }
    .sl-fmt-heading-menu {
      display: none;
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      margin-bottom: var(--sl-space-1-5);
      background: var(--sl-fmt-surface);
      border: 1px solid var(--sl-fmt-border);
      border-radius: var(--sl-radius-sm);
      padding: var(--sl-space-1);
      flex-direction: column;
      gap: var(--sl-space-0-5);
      box-shadow: var(--sl-fmt-elevation-menu);
      z-index: 1001;
    }
    .sl-fmt-heading-dropdown.sl-open .sl-fmt-heading-menu {
      display: flex;
    }
    .sl-fmt-heading-item {
      background: transparent;
      border: none;
      color: var(--sl-fmt-text);
      padding: var(--sl-space-1-5) var(--sl-space-3);
      font-size: var(--sl-text-sm);
      font-weight: 600;
      border-radius: var(--sl-radius-compact);
      cursor: pointer;
      text-align: center;
    }
    .sl-fmt-heading-item:hover {
      background: var(--sl-fmt-menu-hover);
      color: var(--sl-fmt-highlight);
    }

    @media screen and (max-width: 768px) {
      .sl-fmt-btn[data-action="h1"],
      .sl-fmt-btn[data-action="h2"],
      .sl-fmt-btn[data-action="h3"] {
        display: none !important;
      }
      .sl-fmt-heading-dropdown {
        display: flex !important;
      }
    }

    /* ── Toggle button (in footer button row) ──────────────────────── */
    .sl-fmt-toggle {
      display: flex;
      align-items: center;
      justify-content: center;
      height: var(--sl-fmt-toggle-size);
      width: var(--sl-fmt-toggle-size);
      border-radius: var(--sl-radius-md);
      background: transparent;
      border: 1px solid var(--sl-fmt-border);
      color: var(--sl-fmt-text);
      cursor: pointer;
      transition: background-color var(--sl-duration-short) ease, color var(--sl-duration-short) ease;
      flex-shrink: 0;
      padding: 0;
      margin-right: var(--sl-space-2);
    }
    .sl-fmt-toggle:hover {
      background: var(--sl-fmt-toggle-hover);
    }
    .sl-fmt-toggle.sl-fmt-active {
      background: var(--sl-fmt-surface);
      color: var(--sl-fmt-highlight);
    }

    /* ── Sleek Native Link Modal (Material 3 Style) ───────────────── */
    .sl-fmt-modal-overlay {
      position: fixed;
      inset: 0;
      background: var(--sl-fmt-scrim);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999999;
      backdrop-filter: blur(var(--sl-space-0-5));
    }
    .sl-fmt-modal {
      background: var(--color-v3-surface-container-high, var(--sl-fmt-inline-surface));
      border: none;
      border-radius: var(--sl-radius-lg);
      width: var(--sl-fmt-dialog-width);
      max-width: calc(100vw - var(--sl-space-8));
      box-sizing: border-box;
      box-shadow: var(--sl-fmt-elevation-dialog);
      padding: var(--sl-space-4);
      font-family: var(--sl-font-chat);
    }
    .sl-fmt-modal h2 { margin: 0 0 var(--sl-space-3-5) 0; font-size: var(--sl-text-base); color: var(--sl-fmt-text-strong); font-weight: 500; line-height: var(--sl-space-5); }
    .sl-fmt-modal label { display: block; font-size: var(--sl-text-2xs); color: var(--sl-fmt-muted); margin-bottom: var(--sl-space-0-75); margin-left: var(--sl-space-0-5); }
    .sl-fmt-modal input {
      width: 100%; box-sizing: border-box; background: var(--sl-fmt-input); border: 1px solid var(--sl-fmt-input-border);
      border-radius: var(--sl-radius-sm); padding: 0 var(--sl-space-2-5); color: var(--sl-fmt-text-strong); font-size: var(--sl-text-sm); height: var(--sl-space-9); margin-bottom: var(--sl-space-3);
      transition: border-color var(--sl-duration-short);
    }
    .sl-fmt-modal input:focus { border-color: var(--sl-fmt-primary); }
    .sl-fmt-modal-actions { display: flex; justify-content: flex-end; gap: var(--sl-space-2); margin-top: var(--sl-space-1); }
    .sl-fmt-modal-actions button {
      border-radius: var(--sl-radius-pill); font-size: var(--sl-text-sm); font-weight: 500; cursor: pointer; border: none; height: var(--sl-fmt-toggle-size); padding: 0 var(--sl-space-4);
      transition: background-color var(--sl-duration-short), opacity var(--sl-duration-short);
    }
    .sl-fmt-btn-cancel { background: transparent; color: var(--sl-fmt-cancel); }
    .sl-fmt-btn-cancel:hover { background: var(--sl-fmt-hover); color: var(--sl-fmt-highlight); }
    .sl-fmt-btn-submit { background: var(--sl-fmt-primary); color: var(--sl-fmt-on-primary); font-weight: 600; }
    .sl-fmt-btn-submit:hover { background: var(--sl-fmt-primary-hover); }

    :is(.sl-fmt-btn, .sl-fmt-heading-item, .sl-fmt-toggle, .sl-fmt-modal input, .sl-fmt-modal-actions button):focus-visible {
      outline: var(--sl-space-0-5) solid var(--sl-fmt-focus);
      outline-offset: var(--sl-space-0-5);
    }

    @media (pointer: coarse) {
      :is(.sl-fmt-toolbar, .sl-fmt-toggle, .sl-fmt-modal-overlay) {
        --sl-fmt-control-size: var(--sl-target-min);
        --sl-fmt-toggle-size: var(--sl-target-min);
      }
      .sl-fmt-heading-item, .sl-fmt-modal input { min-height: var(--sl-target-min); }
    }

    @media (prefers-reduced-motion: reduce) {
      .sl-fmt-toolbar, .sl-fmt-toolbar *, .sl-fmt-toggle, .sl-fmt-modal * { transition: none !important; }
    }

    /* AI Studio's Light mode needs a light floating toolbar and dark glyphs. */
    body.light-theme :is(.sl-fmt-toolbar, .sl-fmt-toggle, .sl-fmt-modal-overlay) {
      --sl-fmt-surface: #fff;
      --sl-fmt-inline-surface: #f4f5f7;
      --sl-fmt-border: #d7d8da;
      --sl-fmt-text: #1b1b1e;
      --sl-fmt-text-strong: #1b1b1e;
      --sl-fmt-muted: #565b61;
      --sl-fmt-highlight: #1b1b1e;
      --sl-fmt-hover: #e9ebef;
      --sl-fmt-menu-hover: #e9ebef;
      --sl-fmt-toggle-hover: #e9ebef;
      --sl-fmt-active: #dce6f9;
      --sl-fmt-focus: #174ea6;
      --sl-fmt-input: #fff;
      --sl-fmt-input-border: #c6cbd1;
      --sl-fmt-separator: #c6cbd1;
      --sl-fmt-cancel: #1b1b1e;
      --sl-fmt-elevation-toolbar: 0 4px 14px rgba(27, 27, 30, 0.14);
      --sl-fmt-elevation-menu: var(--sl-fmt-elevation-toolbar);
    }
    body.light-theme .sl-fmt-inline {
      background: var(--sl-fmt-inline-surface) !important;
      box-shadow: none !important;
    }
    body.light-theme .sl-fmt-btn:active,
    body.light-theme .sl-fmt-toggle.sl-fmt-active {
      background: var(--sl-fmt-active) !important;
      color: var(--sl-fmt-focus) !important;
    }
  `;

  window.StudioLab.registerModule({
    id: 'text-formatter',
    group: 'modules',
    order: 25,
    title: 'Text Formatter',
    subtitle: 'markdown-toolbar-and-smart-lists',
    icon: 'edit',
    stateKey: 'textFormatterEnabled',
    defaults: {
      textFormatterEnabled: true
    },
    details: [
      { icon: 'edit', text: 'Native Markdown formatting toolbar for prompt editor.' },
      { icon: 'check_circle', text: 'Smart list continuation (Enter / Tab / Shift+Tab like Google Docs).' }
    ],
    init(ctx) {
      ctxRef = ctx;
      injectCSS();
      sync();
    },
    onStateChange() {
      sync();
    },
    onRouteChange() {
      cleanupDOM();
      sync();
    },
    dispose() {
      ctxRef = null;
      stopWatcher();
      cleanupDOM();
      styleEl?.remove();
      styleEl = null;
    }
  });

  function isActive() {
    const state = ctxRef && ctxRef.state;
    return !!(state && state.textFormatterEnabled !== false);
  }

  function injectCSS() {
    if (document.getElementById('sl-text-formatter-css')) return;
    styleEl = el('<style id="sl-text-formatter-css"></style>');
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);
  }

  function sync() {
    if (isActive()) {
      startWatcher();
    } else {
      stopWatcher();
      cleanupDOM();
    }
  }

  function startWatcher() {
    if (watching) return;
    watching = true;
    watcherScope = scope();
    watcherScope.every(600, attachToPromptBox);
    watcherScope.listen(window, '__sl_languageChanged', () => {
      if (toggleBtnEl) {
        const title = t('fmt_toggle_title', 'Text Formatting');
        toggleBtnEl.setAttribute('title', title);
        toggleBtnEl.setAttribute('aria-label', title);
      }
      const wasInlineVisible = inlineToolbarEl && inlineToolbarEl.classList.contains('sl-fmt-visible');
      if (floatingToolbarEl && floatingToolbarEl.parentNode) floatingToolbarEl.parentNode.removeChild(floatingToolbarEl);
      if (inlineToolbarEl && inlineToolbarEl.parentNode) inlineToolbarEl.parentNode.removeChild(inlineToolbarEl);
      floatingToolbarEl = null;
      inlineToolbarEl = null;
      if (activeTextarea) {
        ensureToolbars(activeTextarea);
        if (wasInlineVisible && inlineToolbarEl) inlineToolbarEl.classList.add('sl-fmt-visible');
      }
    });
    attachToPromptBox();
  }

  function stopWatcher() {
    if (!watching) return;
    watching = false;
    watcherScope?.dispose();
    watcherScope = null;
  }

  function cleanupDOM() {
    closeLinkModal?.(false);
    if (floatingToolbarEl && floatingToolbarEl.parentNode) {
      floatingToolbarEl.parentNode.removeChild(floatingToolbarEl);
    }
    if (inlineToolbarEl && inlineToolbarEl.parentNode) {
      inlineToolbarEl.parentNode.removeChild(inlineToolbarEl);
    }
    if (toggleBtnEl && toggleBtnEl.parentNode) {
      toggleBtnEl.parentNode.removeChild(toggleBtnEl);
    }
    floatingToolbarEl = null;
    inlineToolbarEl = null;
    toggleBtnEl = null;

    if (taScope) {
      taScope.dispose();
      taScope = null;
    }
    activeTextarea = null;
  }

  function findPromptTextarea() {
    const selectors = [
      'ms-prompt-box textarea',
      'section.chunk-editor-main textarea',
      'footer textarea',
      'textarea.cdk-textarea-autosize',
      'textarea'
    ];
    for (const sel of selectors) {
      const candidate = $(sel);
      if (candidate && candidate.offsetParent !== null) return candidate;
    }
    return null;
  }

  function attachToPromptBox() {
    const textarea = findPromptTextarea();
    if (!textarea) return;

    if (activeTextarea !== textarea) {
      if (taScope) taScope.dispose();
      activeTextarea = textarea;
      taScope = scope();
      taScope.on(activeTextarea, 'keydown', handleKeyDown);
      taScope.on(activeTextarea, 'mouseup', handleMouseUp);
      taScope.on(activeTextarea, 'keyup', handleKeyUp);
      taScope.on(activeTextarea, 'blur', handleBlur);
    }

    ensureToolbars(textarea);
  }

  function createToolbarNode(className, buttons) {
    const tb = el(`<div class="sl-fmt-toolbar ${className}" role="toolbar" aria-label="Text formatting options"></div>`);

    let headingDropdownAdded = false;

    buttons.forEach(btn => {
      if (btn.type === 'separator') {
        tb.append(el('<div class="sl-fmt-sep"></div>'));
        return;
      }

      if (btn.action === 'h1' && !headingDropdownAdded) {
        headingDropdownAdded = true;
        const hTitle = t('fmt_headings', 'Headings');
        const hDrop = el(`<div class="sl-fmt-heading-dropdown">
          <button type="button" class="sl-fmt-btn sl-fmt-heading-btn" title="Headings" aria-label="Headings" aria-haspopup="menu" aria-expanded="false"><span class="sl-fmt-btn-text">H ▾</span></button>
          <div class="sl-fmt-heading-menu" role="menu" aria-label="Heading level"></div>
        </div>`);
        const hMenu = $('.sl-fmt-heading-menu', hDrop);
        const headingButton = $('.sl-fmt-heading-btn', hDrop);
        function setHeadingOpen(open) {
          hDrop.classList.toggle('sl-open', open);
          headingButton.setAttribute('aria-expanded', String(open));
        }

        ['h1', 'h2', 'h3'].forEach((hAct, i) => {
          const item = el(`<button type="button" class="sl-fmt-heading-item" role="menuitem">H${i + 1}</button>`);
          item.addEventListener('mousedown', e => e.preventDefault());
          item.addEventListener('click', () => {
            applyFormatting(activeTextarea, hAct);
            setHeadingOpen(false);
          });
          hMenu.append(item);
        });

        headingButton.addEventListener('mousedown', e => e.preventDefault());
        headingButton.addEventListener('click', (e) => {
          e.stopPropagation();
          const open = !hDrop.classList.contains('sl-open');
          setHeadingOpen(open);
          if (open && e.detail === 0) hMenu.firstElementChild?.focus();
        });
        hDrop.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            setHeadingOpen(false);
            headingButton.focus();
          }
        });

        tb.append(hDrop);
      }

      const btnTitle = btn.titleKey ? t(btn.titleKey, btn.title) : btn.title;
      const label = btn.icon || (btn.text ? `<span class="sl-fmt-btn-text">${btn.text}</span>` : '');
      const button = el(`<button type="button" class="sl-fmt-btn"${btn.action ? ` data-action="${btn.action}"` : ''} title="${btnTitle}" aria-label="${btnTitle}">${label}</button>`);

      button.addEventListener('mousedown', e => e.preventDefault());
      button.addEventListener('click', () => {
        if (btn.action === 'link') {
          openCustomLinkModal(activeTextarea);
        } else {
          applyFormatting(activeTextarea, btn.action);
        }
      });

      tb.append(button);
    });

    return tb;
  }

  function ensureToolbars(textarea) {
    const promptBox = textarea.closest('ms-prompt-box') || textarea.closest('.chunk-editor-main');
    if (!promptBox) return;

    if (!floatingToolbarEl || !document.body.contains(floatingToolbarEl)) {
      floatingToolbarEl = createToolbarNode('sl-fmt-floating', BUTTONS_FLOATING);
      document.body.appendChild(floatingToolbarEl);
    }

    if (!inlineToolbarEl || (promptBox && !promptBox.contains(inlineToolbarEl))) {
      inlineToolbarEl = createToolbarNode('sl-fmt-inline', BUTTONS_FULL);
      if (promptBox) {
        promptBox.prepend(inlineToolbarEl);
      }
    }

    if (!toggleBtnEl || !document.body.contains(toggleBtnEl)) {
      const buttonsRow = promptBox.querySelector('.buttons-row');
      const buttonWrapper = promptBox.querySelector('.button-wrapper');
      const footerRow = buttonsRow || buttonWrapper;
      if (footerRow) {
        const toggleTitle = t('fmt_toggle_title', 'Text Formatting');
        toggleBtnEl = el(`<button type="button" class="sl-fmt-toggle" title="${toggleTitle}" aria-label="${toggleTitle}">${SVG_ICONS.format}</button>`);

        toggleBtnEl.addEventListener('mousedown', (e) => {
          e.preventDefault();
        });

        toggleBtnEl.addEventListener('click', (e) => {
          e.preventDefault();
          const targetTa = activeTextarea || textarea;
          const start = targetTa ? targetTa.selectionStart : 0;
          const end = targetTa ? targetTa.selectionEnd : 0;

          const isVisible = inlineToolbarEl && inlineToolbarEl.classList.contains('sl-fmt-visible');
          if (isVisible) {
            inlineToolbarEl.classList.remove('sl-fmt-visible');
            toggleBtnEl.classList.remove('sl-fmt-active');
          } else {
            if (inlineToolbarEl) inlineToolbarEl.classList.add('sl-fmt-visible');
            toggleBtnEl.classList.add('sl-fmt-active');
          }

          if (targetTa) {
            targetTa.focus();
            targetTa.setSelectionRange(start, end);
          }
        });

        const addMediaBtn = footerRow.querySelector('ms-add-media-button');
        if (addMediaBtn) {
          addMediaBtn.after(toggleBtnEl);
        } else {
          footerRow.prepend(toggleBtnEl);
        }
      }
    }
  }

  let lastPos = null;

  function showFloatingToolbar(e) {
    if (!activeTextarea || !floatingToolbarEl) return;

    if (inlineToolbarEl && inlineToolbarEl.classList.contains('sl-fmt-visible')) {
      floatingToolbarEl.classList.remove('sl-fmt-visible');
      return;
    }

    const start = activeTextarea.selectionStart;
    const end = activeTextarea.selectionEnd;

    if (start === end) {
      floatingToolbarEl.classList.remove('sl-fmt-visible');
      lastPos = null;
      return;
    }

    const tbWidth = floatingToolbarEl.offsetWidth || 280;
    const tbHeight = floatingToolbarEl.offsetHeight || 40;

    let left, top;
    if (e && typeof e.clientX === 'number' && e.clientX > 0 && typeof e.clientY === 'number' && e.clientY > 0) {
      left = e.clientX - (tbWidth / 2);
      top = e.clientY - tbHeight - 12;
      lastPos = { left, top };
    } else if (lastPos && floatingToolbarEl.classList.contains('sl-fmt-visible')) {
      left = lastPos.left;
      top = lastPos.top;
    } else {
      const rect = activeTextarea.getBoundingClientRect();
      left = rect.left + (rect.width / 2) - (tbWidth / 2);
      top = rect.top - tbHeight - 8;
      lastPos = { left, top };
    }

    if (left < 8) left = 8;
    if (left + tbWidth > window.innerWidth - 8) left = window.innerWidth - tbWidth - 8;
    if (top < 8) {
      if (e && e.clientY) {
        top = e.clientY + 12;
      } else {
        const rect = activeTextarea.getBoundingClientRect();
        top = rect.top + 8;
      }
    }

    floatingToolbarEl.style.left = `${left}px`;
    floatingToolbarEl.style.top = `${top}px`;
    floatingToolbarEl.classList.add('sl-fmt-visible');
  }

  function hideFloatingToolbar() {
    if (floatingToolbarEl) floatingToolbarEl.classList.remove('sl-fmt-visible');
  }

  function handleMouseUp(e) {
    setTimeout(() => showFloatingToolbar(e), 10);
  }

  function handleKeyUp(e) {
    if (e.shiftKey) {
      setTimeout(() => showFloatingToolbar(null), 10);
    }
  }

  function handleBlur() {
    // Keep the selection toolbar visible while keyboard focus is inside it.
    setTimeout(() => {
      if (floatingToolbarEl && !floatingToolbarEl.contains(document.activeElement)) {
        floatingToolbarEl.classList.remove('sl-fmt-visible');
      }
    }, 200);
  }

  function openCustomLinkModal(textarea) {
    if (!textarea) return;
    closeLinkModal?.(false);
    const existing = $('.sl-link-modal-overlay');
    if (existing) existing.remove();
    const opener = document.activeElement;
    const returnFocus = opener?.isConnected && opener !== document.body && !opener.closest?.('.sl-fmt-floating') ? opener : textarea;

    hideFloatingToolbar();

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);

    const overlay = el(`
      <div class="sl-overlay sl-fmt-modal-overlay sl-link-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="sl-link-dialog-title">
      <div class="sl-fmt-modal">
        <h2 id="sl-link-dialog-title">Insert Link</h2>
        <label for="sl-link-url">URL</label>
        <input type="url" id="sl-link-url" placeholder="https://example.com" value="https://" autocomplete="off">

        <label for="sl-link-text">${t('fmt_modal_display_text', 'Display Text (optional)')}</label>
        <input type="text" id="sl-link-text" placeholder="${t('fmt_modal_link_placeholder', 'Link text')}" value="${escapeHtml(selectedText)}" autocomplete="off">

        <div class="sl-fmt-modal-actions">
          <button type="button" class="sl-fmt-btn-cancel sl-cancel-btn">${t('fmt_modal_cancel', 'Cancel')}</button>
          <button type="button" class="sl-fmt-btn-submit sl-submit-btn">${t('fmt_modal_insert', 'Insert Link')}</button>
        </div>
      </div>
      </div>
    `);

    document.body.appendChild(overlay);

    const urlInput = $('#sl-link-url', overlay);
    const textInput = $('#sl-link-text', overlay);
    const closeBtn = $('.sl-close-btn', overlay);
    const cancelBtn = $('.sl-cancel-btn', overlay);
    const submitBtn = $('.sl-submit-btn', overlay);
    const modalScope = scope();
    let closed = false;

    modalScope.timeout(() => {
      urlInput.focus();
    }, 50);

    function close(restoreFocus = true) {
      if (closed) return;
      closed = true;
      modalScope.dispose();
      overlay.remove();
      if (closeLinkModal === close) closeLinkModal = null;
      if (restoreFocus && returnFocus.isConnected !== false) returnFocus.focus();
    }
    closeLinkModal = close;

    function submit() {
      const url = urlInput.value.trim();
      if (!url) {
        urlInput.focus();
        return;
      }
      let text = textInput.value.trim();
      if (!text) text = url;
      
      const md = `[${text}](${url})`;
      
      close();
      
      setTimeout(() => {
        textarea.focus();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const val = textarea.value;
        textarea.value = val.substring(0, start) + md + val.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + md.length;
        dispatchInputEvent(textarea);
      }, 20);
    }

    if (closeBtn) modalScope.on(closeBtn, 'click', () => close());
    if (cancelBtn) modalScope.on(cancelBtn, 'click', () => close());
    if (submitBtn) modalScope.on(submitBtn, 'click', submit);

    modalScope.on(overlay, 'click', (e) => {
      if (e.target === overlay) close();
    });

    modalScope.on(overlay, 'keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      } else if (e.key === 'Tab') {
        const controls = [urlInput, textInput, cancelBtn, submitBtn].filter(Boolean);
        const index = controls.indexOf(document.activeElement);
        if (index < 0 || (!e.shiftKey && index === controls.length - 1) || (e.shiftKey && index === 0)) {
          e.preventDefault();
          controls[e.shiftKey ? controls.length - 1 : 0]?.focus();
        }
      } else if (e.key === 'Enter' && (e.target === urlInput || e.target === textInput)) {
        e.preventDefault();
        submit();
      }
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function applyFormatting(textarea, type) {
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const val = textarea.value;
    const selectedText = val.substring(start, end);
    const before = val.substring(0, start);
    const after = val.substring(end);

    let replacement = '';
    let newStart = start;
    let newEnd = end;
    let alreadyModified = false;

    switch (type) {
      case 'bold': {
        const hasSurrounding = before.endsWith('**') && after.startsWith('**');
        if (hasSurrounding) {
          textarea.value = before.slice(0, -2) + selectedText + after.substring(2);
          newStart = start - 2;
          newEnd = end - 2;
          alreadyModified = true;
        } else if (selectedText.startsWith('**') && selectedText.endsWith('**') && selectedText.length >= 4) {
          replacement = selectedText.slice(2, -2);
          newStart = start;
          newEnd = start + replacement.length;
        } else {
          replacement = `**${selectedText || 'bold text'}**`;
          if (!selectedText) { newStart = start + 2; newEnd = start + 11; }
          else { newStart = start; newEnd = start + replacement.length; }
        }
        break;
      }

      case 'italic': {
        // Toggling italic must preserve adjacent bold markers.
        const hasSurrounding = before.endsWith('*') && after.startsWith('*') && !(before.endsWith('**') && after.startsWith('**'));
        if (hasSurrounding) {
          textarea.value = before.slice(0, -1) + selectedText + after.substring(1);
          newStart = start - 1;
          newEnd = end - 1;
          alreadyModified = true;
        } else if (selectedText.startsWith('*') && selectedText.endsWith('*') && selectedText.length >= 2 && !selectedText.startsWith('**')) {
          replacement = selectedText.slice(1, -1);
          newStart = start;
          newEnd = start + replacement.length;
        } else {
          replacement = `*${selectedText || 'italic text'}*`;
          if (!selectedText) { newStart = start + 1; newEnd = start + 12; }
          else { newStart = start; newEnd = start + replacement.length; }
        }
        break;
      }

      case 'strikethrough': {
        const hasSurrounding = before.endsWith('~~') && after.startsWith('~~');
        if (hasSurrounding) {
          textarea.value = before.slice(0, -2) + selectedText + after.substring(2);
          newStart = start - 2;
          newEnd = end - 2;
          alreadyModified = true;
        } else if (selectedText.startsWith('~~') && selectedText.endsWith('~~') && selectedText.length >= 4) {
          replacement = selectedText.slice(2, -2);
          newStart = start;
          newEnd = start + replacement.length;
        } else {
          replacement = `~~${selectedText || 'text'}~~`;
          if (!selectedText) { newStart = start + 2; newEnd = start + 6; }
          else { newStart = start; newEnd = start + replacement.length; }
        }
        break;
      }

      case 'code': {
        if (selectedText.includes('\n')) {
          replacement = `\`\`\`\n${selectedText || 'code'}\n\`\`\``;
          newStart = start + 4;
          newEnd = start + 4 + (selectedText ? selectedText.length : 4);
        } else {
          const hasSurrounding = before.endsWith('`') && after.startsWith('`');
          if (hasSurrounding) {
            textarea.value = before.slice(0, -1) + selectedText + after.substring(1);
            newStart = start - 1;
            newEnd = end - 1;
            alreadyModified = true;
          } else if (selectedText.startsWith('`') && selectedText.endsWith('`') && selectedText.length >= 2) {
            replacement = selectedText.slice(1, -1);
            newStart = start;
            newEnd = start + replacement.length;
          } else {
            replacement = `\`${selectedText || 'code'}\``;
            if (!selectedText) { newStart = start + 1; newEnd = start + 5; }
            else { newStart = start; newEnd = start + replacement.length; }
          }
        }
        break;
      }

      case 'h1':
      case 'h2':
      case 'h3':
      case 'quote':
      case 'ul':
      case 'ol':
      case 'task':
        applyLinePrefix(textarea, type);
        return;
    }

    if (!alreadyModified) {
      textarea.value = before + replacement + after;
    }
    textarea.selectionStart = newStart;
    textarea.selectionEnd = newEnd;
    textarea.focus();
    dispatchInputEvent(textarea);
    // Keep the toolbar open so the user can apply multiple formats.
  }

  function applyLinePrefix(textarea, type) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const val = textarea.value;

    const lineStart = val.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = val.indexOf('\n', end);
    if (lineEnd === -1) lineEnd = val.length;

    const linesText = val.substring(lineStart, lineEnd);
    const lines = linesText.split('\n');

    const prefixMap = {
      h1: '# ',
      h2: '## ',
      h3: '### ',
      quote: '> ',
      ul: '- ',
      ol: (i) => `${i + 1}. `,
      task: '- [ ] '
    };

    const newLines = lines.map((line, idx) => {
      const cleanLine = line.replace(/^(\s*)(#+\s+|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+\.\s+|>\s*)/, '$1');
      const p = typeof prefixMap[type] === 'function' ? prefixMap[type](idx) : prefixMap[type];

      const checkRegex = type === 'h1' ? /^# /
        : type === 'h2' ? /^## /
        : type === 'h3' ? /^### /
        : type === 'quote' ? /^> /
        : type === 'ul' ? /^-\s+/
        : type === 'task' ? /^-\s+\[[ xX]\]\s+/
        : /^\d+\.\s+/;

      if (checkRegex.test(line)) {
        return cleanLine;
      }
      return p + cleanLine;
    });

    const replacement = newLines.join('\n');
    const beforeLines = val.substring(0, lineStart);
    const afterLines = val.substring(lineEnd);

    textarea.value = beforeLines + replacement + afterLines;
    textarea.selectionStart = lineStart;
    textarea.selectionEnd = lineStart + replacement.length;
    textarea.focus();
    dispatchInputEvent(textarea);
  }

  function handleKeyDown(e) {
    const textarea = e.target;
    if (!textarea) return;

    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const val = textarea.value;
      const pos = textarea.selectionStart;

      const lineStart = val.lastIndexOf('\n', pos - 1) + 1;
      const currentLine = val.substring(lineStart, pos);

      const taskMatch = currentLine.match(/^(\s*)([-*+])\s+\[([ xX])\]\s*(.*)$/);
      const olMatch = currentLine.match(/^(\s*)(\d+)\.\s+(.*)$/);
      const ulMatch = currentLine.match(/^(\s*)([-*+])\s+(.*)$/);
      const quoteMatch = currentLine.match(/^(\s*)(>+)\s+(.*)$/);

      if (taskMatch) {
        const [, indent, bullet, , text] = taskMatch;
        if (text.trim() === '') {
          e.preventDefault();
          removeEmptyLinePrefix(textarea, lineStart, pos);
        } else {
          e.preventDefault();
          insertTextAtCursor(textarea, `\n${indent}${bullet} [ ] `);
        }
        return;
      }

      if (olMatch) {
        const [, indent, numStr, text] = olMatch;
        if (text.trim() === '') {
          e.preventDefault();
          removeEmptyLinePrefix(textarea, lineStart, pos);
        } else {
          e.preventDefault();
          const nextNum = parseInt(numStr, 10) + 1;
          insertTextAtCursor(textarea, `\n${indent}${nextNum}. `);
        }
        return;
      }

      if (ulMatch) {
        const [, indent, bullet, text] = ulMatch;
        if (text.trim() === '') {
          e.preventDefault();
          removeEmptyLinePrefix(textarea, lineStart, pos);
        } else {
          e.preventDefault();
          insertTextAtCursor(textarea, `\n${indent}${bullet} `);
        }
        return;
      }

      if (quoteMatch) {
        const [, indent, quotes, text] = quoteMatch;
        if (text.trim() === '') {
          e.preventDefault();
          removeEmptyLinePrefix(textarea, lineStart, pos);
        } else {
          e.preventDefault();
          insertTextAtCursor(textarea, `\n${indent}${quotes} `);
        }
        return;
      }
    }

    if (e.key === 'Tab') {
      const val = textarea.value;
      const pos = textarea.selectionStart;
      const lineStart = val.lastIndexOf('\n', pos - 1) + 1;
      let lineEnd = val.indexOf('\n', pos);
      if (lineEnd === -1) lineEnd = val.length;

      const currentLine = val.substring(lineStart, lineEnd);
      const isList = /^(\s*)([-*+]|\d+\.|>)\s+/.test(currentLine);

      if (isList) {
        e.preventDefault();
        if (e.shiftKey) {
          if (currentLine.startsWith('  ')) {
            const newLine = currentLine.substring(2);
            textarea.value = val.substring(0, lineStart) + newLine + val.substring(lineEnd);
            textarea.selectionStart = textarea.selectionEnd = Math.max(lineStart, pos - 2);
            dispatchInputEvent(textarea);
          }
        } else {
          const newLine = '  ' + currentLine;
          textarea.value = val.substring(0, lineStart) + newLine + val.substring(lineEnd);
          textarea.selectionStart = textarea.selectionEnd = pos + 2;
          dispatchInputEvent(textarea);
        }
        return;
      }
    }

    if (e.ctrlKey || e.metaKey) {
      const key = e.key.toLowerCase();
      if (key === 'b') {
        e.preventDefault();
        applyFormatting(textarea, 'bold');
      } else if (key === 'i') {
        e.preventDefault();
        applyFormatting(textarea, 'italic');
      } else if (key === 'x' && e.shiftKey) {
        e.preventDefault();
        applyFormatting(textarea, 'strikethrough');
      } else if (key === 'k') {
        e.preventDefault();
        openCustomLinkModal(textarea);
      }
    }
  }

  function removeEmptyLinePrefix(textarea, lineStart, pos) {
    const val = textarea.value;
    const beforeLine = val.substring(0, lineStart);
    const afterLine = val.substring(pos);
    textarea.value = beforeLine + afterLine;
    textarea.selectionStart = textarea.selectionEnd = lineStart;
    dispatchInputEvent(textarea);
  }

  function insertTextAtCursor(textarea, text) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const val = textarea.value;
    textarea.value = val.substring(0, start) + text + val.substring(end);
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
    textarea.focus();
    dispatchInputEvent(textarea);
  }

  function dispatchInputEvent(textarea) {
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.sl-fmt-heading-dropdown')) {
      $$('.sl-fmt-heading-dropdown.sl-open').forEach(d => {
        d.classList.remove('sl-open');
        $('.sl-fmt-heading-btn', d)?.setAttribute('aria-expanded', 'false');
      });
    }
  });

})();
