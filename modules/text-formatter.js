/**
 * StudioLab module: text-formatter
 *
 * Native Google AI Studio styled Markdown formatting toolbar, custom link modal,
 * hotkeys, and smart list auto-continuation (Google Docs style).
 *
 * CSS values extracted from live https://aistudio.google.com via DevTools:
 *   prompt-box-container: bg #252525, border 1px solid #262626, radius 12px
 *   Run button:           bg #1f1f1f, border 1px solid #333, radius 12px, h ~32px
 *   Plus button:          bg transparent, border 1px solid #333, radius 12px, h ~32px
 *   Menu container:       bg #1f1f1f, radius 8px, shadow Material
 *   Text color:           #d4d4d4
 *   Font:                 Inter, sans-serif, 14px, weight 500
 */
(function () {
  'use strict';

  if (!window.StudioLab || typeof window.StudioLab.registerModule !== 'function') return;

  let ctxRef = null;
  let watcherInterval = null;
  let activeTextarea = null;
  let floatingToolbarEl = null;
  let inlineToolbarEl = null;
  let toggleBtnEl = null;
  let styleEl = null;

  // ═══════════════════════════════════════════════════════════════════
  //  SVG Icons
  // ═══════════════════════════════════════════════════════════════════
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

  // Full set of buttons for the inline (slide-out) toolbar
  const BUTTONS_FULL = [
    { id: 'bold', icon: SVG_ICONS.bold, title: 'Bold (Ctrl+B)', action: 'bold' },
    { id: 'italic', icon: SVG_ICONS.italic, title: 'Italic (Ctrl+I)', action: 'italic' },
    { id: 'strikethrough', icon: SVG_ICONS.strikethrough, title: 'Strikethrough (Ctrl+Shift+X)', action: 'strikethrough' },
    { id: 'sep1', type: 'separator' },
    { id: 'h1', text: 'H1', title: 'Heading 1 (#)', action: 'h1' },
    { id: 'h2', text: 'H2', title: 'Heading 2 (##)', action: 'h2' },
    { id: 'h3', text: 'H3', title: 'Heading 3 (###)', action: 'h3' },
    { id: 'sep2', type: 'separator' },
    { id: 'ul', icon: SVG_ICONS.ul, title: 'Bullet List (- item)', action: 'ul' },
    { id: 'ol', icon: SVG_ICONS.ol, title: 'Numbered List (1. item)', action: 'ol' },
    { id: 'task', icon: SVG_ICONS.task, title: 'Task List (- [ ] task)', action: 'task' },
    { id: 'quote', icon: SVG_ICONS.quote, title: 'Blockquote (> quote)', action: 'quote' },
    { id: 'sep3', type: 'separator' },
    { id: 'link', icon: SVG_ICONS.link, title: 'Insert Link (Ctrl+K)', action: 'link' },
    { id: 'code', icon: SVG_ICONS.code, title: 'Code Block / Inline Code', action: 'code' }
  ];

  // Reduced set for the floating (selection) toolbar
  const BUTTONS_FLOATING = [
    { id: 'bold', icon: SVG_ICONS.bold, title: 'Bold (Ctrl+B)', action: 'bold' },
    { id: 'italic', icon: SVG_ICONS.italic, title: 'Italic (Ctrl+I)', action: 'italic' },
    { id: 'strikethrough', icon: SVG_ICONS.strikethrough, title: 'Strikethrough (Ctrl+Shift+X)', action: 'strikethrough' },
    { id: 'sep1', type: 'separator' },
    { id: 'ul', icon: SVG_ICONS.ul, title: 'Bullet List', action: 'ul' },
    { id: 'ol', icon: SVG_ICONS.ol, title: 'Numbered List', action: 'ol' },
    { id: 'sep2', type: 'separator' },
    { id: 'link', icon: SVG_ICONS.link, title: 'Insert Link (Ctrl+K)', action: 'link' },
    { id: 'code', icon: SVG_ICONS.code, title: 'Code', action: 'code' }
  ];

  // ═══════════════════════════════════════════════════════════════════
  //  CSS — all values from live Google AI Studio DevTools extraction
  // ═══════════════════════════════════════════════════════════════════
  const CSS = `
    /* ── Shared toolbar base ────────────────────────────────────────── */
    .sl-fmt-toolbar {
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 4px 6px;
      background: #1f1f1f;
      border: 1px solid #333;
      border-radius: 12px;
      box-shadow: 0px 4px 8px 3px rgba(0,0,0,0.15), 0px 1px 3px rgba(0,0,0,0.3);
      z-index: 1000;
      font-family: Inter, sans-serif;
    }

    /* ── Floating toolbar (on text selection) ───────────────────────── */
    .sl-fmt-floating {
      position: fixed;
      pointer-events: none;
      opacity: 0;
      transform: translateY(6px);
      transition: opacity 0.15s ease, transform 0.15s ease;
    }
    .sl-fmt-floating.sl-fmt-visible {
      pointer-events: auto;
      opacity: 1;
      transform: translateY(0);
    }

    /* ── Inline toolbar (attached directly inside ms-prompt-box) ─────── */
    .sl-fmt-inline {
      display: none;
      width: calc(100% - 24px) !important;
      margin: 0 12px 8px 12px !important;
      box-sizing: border-box !important;
      flex-wrap: wrap !important;
      background: var(--color-v3-surface-container-high, #282a2c) !important;
      border: none !important;
      border-radius: 12px !important;
      box-shadow: none !important;
      padding: 6px !important;
    }
    .sl-fmt-inline.sl-fmt-visible {
      display: flex;
    }

    /* ── Separator ──────────────────────────────────────────────────── */
    .sl-fmt-sep {
      width: 1px;
      height: 16px;
      background: #444748;
      margin: 0 4px;
      flex-shrink: 0;
    }

    /* ── Format buttons (round) ─────────────────────────────────────── */
    .sl-fmt-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: none;
      background: transparent;
      color: #d4d4d4;
      cursor: pointer;
      transition: background-color 0.12s ease;
      flex-shrink: 0;
      padding: 0;
    }
    .sl-fmt-btn:hover {
      background-color: rgba(255, 255, 255, 0.08);
    }
    .sl-fmt-btn:active {
      background-color: rgba(255, 255, 255, 0.12);
    }
    .sl-fmt-btn svg {
      pointer-events: none;
    }
    .sl-fmt-btn-text {
      font-family: Inter, sans-serif;
      font-size: 13px;
      font-weight: 500;
      line-height: 1;
    }

    /* ── Toggle button (in footer button row) ──────────────────────── */
    .sl-fmt-toggle {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 32px;
      width: 32px;
      border-radius: 12px;
      background: transparent;
      border: 1px solid #333;
      color: #d4d4d4;
      cursor: pointer;
      transition: background-color 0.15s ease, color 0.15s ease;
      flex-shrink: 0;
      padding: 0;
      margin-right: 8px;
    }
    .sl-fmt-toggle:hover {
      background: #2a2a2a;
    }
    .sl-fmt-toggle.sl-fmt-active {
      background: #1f1f1f;
      color: #fff;
    }

    /* ── Sleek Native Link Modal (Material 3 Style) ───────────────── */
    .sl-fmt-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999999;
      backdrop-filter: blur(2px);
    }
    .sl-fmt-modal {
      background: var(--color-v3-surface-container-high, #282a2c);
      border: none;
      border-radius: 16px;
      width: 300px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      padding: 16px;
      font-family: Inter, sans-serif;
    }
    .sl-fmt-modal h2 { margin: 0 0 14px 0; font-size: 15px; color: #e3e3e3; font-weight: 500; line-height: 20px; }
    .sl-fmt-modal label { display: block; font-size: 11px; color: #9aa0a6; margin-bottom: 3px; margin-left: 2px; }
    .sl-fmt-modal input {
      width: 100%; box-sizing: border-box; background: #1e1e1e; border: 1px solid #444746; 
      border-radius: 8px; padding: 0 10px; color: #e3e3e3; font-size: 13px; height: 36px; margin-bottom: 12px; outline: none;
      transition: border-color 0.15s;
    }
    .sl-fmt-modal input:focus { border-color: #a8c7fa; }
    .sl-fmt-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
    .sl-fmt-modal-actions button {
      border-radius: 100px; font-size: 13px; font-weight: 500; cursor: pointer; border: none; height: 32px; padding: 0 16px;
      transition: background-color 0.15s, opacity 0.15s;
    }
    .sl-fmt-btn-cancel { background: transparent; color: #c4c7c5; }
    .sl-fmt-btn-cancel:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }
    .sl-fmt-btn-submit { background: #a8c7fa; color: #041e49; font-weight: 600; }
    .sl-fmt-btn-submit:hover { background: #b4d0fa; }
  `;

  // ═══════════════════════════════════════════════════════════════════
  //  Module Registration
  // ═══════════════════════════════════════════════════════════════════
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
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Lifecycle helpers
  // ═══════════════════════════════════════════════════════════════════
  function isActive() {
    const state = ctxRef && ctxRef.state;
    return !!(state && state.textFormatterEnabled !== false);
  }

  function injectCSS() {
    if (document.getElementById('sl-text-formatter-css')) return;
    styleEl = document.createElement('style');
    styleEl.id = 'sl-text-formatter-css';
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
    if (watcherInterval) return;
    watcherInterval = setInterval(attachToPromptBox, 600);
    attachToPromptBox();
  }

  function stopWatcher() {
    if (watcherInterval) {
      clearInterval(watcherInterval);
      watcherInterval = null;
    }
  }

  function cleanupDOM() {
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

    if (activeTextarea) {
      activeTextarea.removeEventListener('keydown', handleKeyDown);
      activeTextarea.removeEventListener('mouseup', handleMouseUp);
      activeTextarea.removeEventListener('keyup', handleKeyUp);
      activeTextarea.removeEventListener('blur', handleBlur);
      activeTextarea = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Find & Attach to Prompt Textarea
  // ═══════════════════════════════════════════════════════════════════
  function findPromptTextarea() {
    const selectors = [
      'ms-prompt-box textarea',
      'section.chunk-editor-main textarea',
      'footer textarea',
      'textarea.cdk-textarea-autosize',
      'textarea'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return el;
    }
    return null;
  }

  function attachToPromptBox() {
    const textarea = findPromptTextarea();
    if (!textarea) return;

    if (activeTextarea !== textarea) {
      if (activeTextarea) {
        activeTextarea.removeEventListener('keydown', handleKeyDown);
        activeTextarea.removeEventListener('mouseup', handleMouseUp);
        activeTextarea.removeEventListener('keyup', handleKeyUp);
        activeTextarea.removeEventListener('blur', handleBlur);
      }
      activeTextarea = textarea;
      activeTextarea.addEventListener('keydown', handleKeyDown);
      activeTextarea.addEventListener('mouseup', handleMouseUp);
      activeTextarea.addEventListener('keyup', handleKeyUp);
      activeTextarea.addEventListener('blur', handleBlur);
    }

    ensureToolbars(textarea);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Build Toolbar DOM
  // ═══════════════════════════════════════════════════════════════════
  function createToolbarNode(className, buttons) {
    const tb = document.createElement('div');
    tb.className = `sl-fmt-toolbar ${className}`;
    tb.setAttribute('role', 'toolbar');
    tb.setAttribute('aria-label', 'Text formatting options');

    buttons.forEach(btn => {
      if (btn.type === 'separator') {
        const sep = document.createElement('div');
        sep.className = 'sl-fmt-sep';
        tb.appendChild(sep);
        return;
      }

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sl-fmt-btn';
      button.title = btn.title;
      button.setAttribute('aria-label', btn.title);

      if (btn.icon) {
        button.innerHTML = btn.icon;
      } else if (btn.text) {
        const span = document.createElement('span');
        span.className = 'sl-fmt-btn-text';
        span.textContent = btn.text;
        button.appendChild(span);
      }

      button.addEventListener('mousedown', (e) => {
        e.preventDefault(); // Keep focus in textarea
        if (btn.action === 'link') {
          openCustomLinkModal(activeTextarea);
        } else {
          applyFormatting(activeTextarea, btn.action);
        }
      });

      tb.appendChild(button);
    });

    return tb;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Ensure Toolbars Injected
  // ═══════════════════════════════════════════════════════════════════
  function ensureToolbars(textarea) {
    const promptBox = textarea.closest('ms-prompt-box') || textarea.closest('.chunk-editor-main');
    if (!promptBox) return;

    // 1. Floating toolbar — appended to body (fixed positioning)
    if (!floatingToolbarEl || !document.body.contains(floatingToolbarEl)) {
      floatingToolbarEl = createToolbarNode('sl-fmt-floating', BUTTONS_FLOATING);
      document.body.appendChild(floatingToolbarEl);
    }

    // 2. Inline toolbar — inserted inside ms-prompt-box before .prompt-box-container
    if (!inlineToolbarEl || (promptBox && !promptBox.contains(inlineToolbarEl))) {
      inlineToolbarEl = createToolbarNode('sl-fmt-inline', BUTTONS_FULL);
      if (promptBox) {
        promptBox.prepend(inlineToolbarEl);
      }
    }

    // 3. Toggle button in footer button row
    if (!toggleBtnEl || !document.body.contains(toggleBtnEl)) {
      const buttonsRow = promptBox.querySelector('.buttons-row');
      const buttonWrapper = promptBox.querySelector('.button-wrapper');
      const footerRow = buttonsRow || buttonWrapper;
      if (footerRow) {
        toggleBtnEl = document.createElement('button');
        toggleBtnEl.type = 'button';
        toggleBtnEl.className = 'sl-fmt-toggle';
        toggleBtnEl.title = 'Format Text';
        toggleBtnEl.setAttribute('aria-label', 'Toggle formatting toolbar');
        toggleBtnEl.innerHTML = SVG_ICONS.format;

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

        // Safe insertion after ms-add-media-button or at start of footerRow
        const addMediaBtn = footerRow.querySelector('ms-add-media-button');
        if (addMediaBtn) {
          addMediaBtn.after(toggleBtnEl);
        } else {
          footerRow.prepend(toggleBtnEl);
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Floating Toolbar — Show / Hide / Position
  // ═══════════════════════════════════════════════════════════════════
  let lastPos = null;

  function showFloatingToolbar(e) {
    if (!activeTextarea || !floatingToolbarEl) return;

    // If inline toolbar is open, don't show floating
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

    // Position: above mouse click, or keep last position on resize/blur, or fallback to center
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

    // Clamp to viewport
    if (left < 8) left = 8;
    if (left + tbWidth > window.innerWidth - 8) left = window.innerWidth - tbWidth - 8;
    if (top < 8) {
      // If not enough space above, show below
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

  // ═══════════════════════════════════════════════════════════════════
  //  Event Handlers
  // ═══════════════════════════════════════════════════════════════════
  function handleMouseUp(e) {
    setTimeout(() => showFloatingToolbar(e), 10);
  }

  function handleKeyUp(e) {
    if (e.shiftKey) {
      setTimeout(() => showFloatingToolbar(null), 10);
    }
  }

  function handleBlur() {
    // Delay to allow clicking toolbar buttons (mousedown fires before blur)
    setTimeout(() => {
      if (floatingToolbarEl) floatingToolbarEl.classList.remove('sl-fmt-visible');
    }, 200);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Custom Link Dialog (Pixel-Perfect Google AI Studio style)
  // ═══════════════════════════════════════════════════════════════════
  function openCustomLinkModal(textarea) {
    if (!textarea) return;
    const existing = document.querySelector('.sl-link-modal-overlay');
    if (existing) existing.remove();

    hideFloatingToolbar();

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);

    const overlay = document.createElement('div');
    overlay.className = 'sl-overlay sl-fmt-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    overlay.innerHTML = `
      <div class="sl-fmt-modal">
        <h2>Insert Link</h2>
        <label for="sl-link-url">URL</label>
        <input type="url" id="sl-link-url" placeholder="https://example.com" value="https://" autocomplete="off">
        
        <label for="sl-link-text">Display Text (optional)</label>
        <input type="text" id="sl-link-text" placeholder="Link text" value="${escapeHtml(selectedText)}" autocomplete="off">
        
        <div class="sl-fmt-modal-actions">
          <button type="button" class="sl-fmt-btn-cancel sl-cancel-btn">Cancel</button>
          <button type="button" class="sl-fmt-btn-submit sl-submit-btn">Insert Link</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const urlInput = overlay.querySelector('#sl-link-url');
    const textInput = overlay.querySelector('#sl-link-text');
    const closeBtn = overlay.querySelector('.sl-close-btn');
    const cancelBtn = overlay.querySelector('.sl-cancel-btn');
    const submitBtn = overlay.querySelector('.sl-submit-btn');

    setTimeout(() => {
      urlInput.focus();
      urlInput.setSelectionRange(urlInput.value.length, urlInput.value.length);
    }, 50);

    function close() {
      overlay.remove();
      textarea.focus();
    }

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

    if (closeBtn) closeBtn.addEventListener('click', close);
    if (cancelBtn) cancelBtn.addEventListener('click', close);
    if (submitBtn) submitBtn.addEventListener('click', submit);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Formatting Core Logic
  // ═══════════════════════════════════════════════════════════════════
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
        // Check if the text around selection already has **
        const hasSurrounding = before.endsWith('**') && after.startsWith('**');
        if (hasSurrounding) {
          // Remove bold — strip ** from both sides
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
        // Need to be careful not to eat bold markers when toggling italic
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
    // Don't hide toolbar — let user stack multiple formats
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

  // ═══════════════════════════════════════════════════════════════════
  //  Smart List Auto-continuation & Indentation
  // ═══════════════════════════════════════════════════════════════════
  function handleKeyDown(e) {
    const textarea = e.target;
    if (!textarea) return;

    // Smart Enter
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const val = textarea.value;
      const pos = textarea.selectionStart;

      const lineStart = val.lastIndexOf('\n', pos - 1) + 1;
      const currentLine = val.substring(lineStart, pos);

      const taskMatch = currentLine.match(/^(\s*)([-*+])\s+\[([ xX])\]\s*(.*)$/);
      const olMatch = currentLine.match(/^(\s*)(\d+)\.\s*(.*)$/);
      const ulMatch = currentLine.match(/^(\s*)([-*+])\s*(.*)$/);
      const quoteMatch = currentLine.match(/^(\s*)(>+)\s*(.*)$/);

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

    // Tab / Shift+Tab for Indent / Outdent
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

    // Hotkeys: Ctrl+B, Ctrl+I, Ctrl+Shift+X, Ctrl+K
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

  // ═══════════════════════════════════════════════════════════════════
  //  Text Manipulation Helpers
  // ═══════════════════════════════════════════════════════════════════
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

})();
