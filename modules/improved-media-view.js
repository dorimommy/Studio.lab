/**
 * Studio.lab module: improved-media-view
 * Gallery-style grid and enhanced full-screen media viewer (Native Parity).
 */
(function () {
  'use strict';

  if (!window.StudioLab || typeof window.StudioLab.registerModule !== 'function') return;

  let ctxRef = null;
  let styleEl = null;
  let dialogObserver = null;

  const CSS = `
    /* --- 1. Grid System (Virtual Scroll Safe) --- */
    
    .cdk-virtual-scroll-content-wrapper {
      display: flex !important;
      flex-wrap: wrap !important;
      align-content: flex-start !important;
      font-size: 14px !important;
    }

    /* Force Media Turns to flow in a flex grid */
    ms-chat-session ms-chat-turn {
      width: 100% !important;
      flex: 0 0 100% !important;
      position: relative !important;
      top: 0 !important;
      left: 0 !important;
      transform: none !important;
      margin-bottom: 0 !important;
      box-sizing: border-box !important;
    }

    /* Break element to separate Images from Files */
    .sl-grid-break {
      flex-basis: 100% !important;
      width: 100% !important;
      height: 12px !important;
    }

    /* Image Grid Widths */
    ms-chat-turn:has(ms-image-chunk):not(:has(ms-text-chunk)) {
      width: 16.66% !important;
      flex: 0 0 16.66% !important;
      padding: 3px !important;
    }

    /* File Grid Widths */
    ms-chat-turn:has(ms-file-chunk):not(:has(ms-text-chunk)) {
      width: 33.33% !important;
      flex: 0 0 33.33% !important;
      padding: 5px !important;
    }

    /* Adaptive Grid (1024px and Tablet) */
    @media (max-width: 1300px) {
      ms-chat-turn:has(ms-image-chunk):not(:has(ms-text-chunk)) {
        width: 25% !important;
        flex: 0 0 25% !important;
      }
      ms-chat-turn:has(ms-file-chunk):not(:has(ms-text-chunk)) {
        width: 50% !important;
        flex: 0 0 50% !important;
      }
    }

    /* Mobile Adaptive */
    @media (max-width: 800px) {
      ms-chat-turn:has(ms-image-chunk):not(:has(ms-text-chunk)) {
        width: 50% !important;
        flex: 0 0 50% !important;
      }
      ms-chat-turn:has(ms-file-chunk):not(:has(ms-text-chunk)) {
        width: 100% !important;
        flex: 0 0 100% !important;
      }
    }

    /* --- 2. Image Chunk Styling --- */
    ms-image-chunk {
      aspect-ratio: 1 / 1 !important;
      width: 100% !important;
      display: block !important;
      border-radius: 12px !important;
      overflow: hidden !important;
      background: var(--color-v3-surface-container-high) !important;
      cursor: pointer !important;
      transition: background 0.2s !important;
    }

    ms-image-chunk:hover {
      background: var(--color-v3-surface-container-highest) !important;
    }

    /* Image Hover Controls */
    ms-image-chunk .bottom-right-image-controls {
      background: var(--color-v3-surface-container-high) !important;
      border-radius: 16px !important;
      bottom: 8px !important;
      right: 8px !important;
      display: none;
      gap: 6px !important;
      position: absolute !important;
      padding: 4px !important;
      z-index: 5 !important;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4) !important;
    }

    ms-image-chunk:hover .bottom-right-image-controls {
      display: flex !important;
    }

    /* Mobile/Touch Controls optimization */
    @media (pointer: coarse) {
      ms-image-chunk .bottom-right-image-controls {
        display: flex !important; /* Always show on touch */
        background: rgba(var(--color-v3-surface-container-high-rgb), 0.9) !important;
        padding: 6px !important;
      }
      ms-image-chunk .bottom-right-image-controls button[ms-button] {
        width: 36px !important; /* Larger hit area for fingers */
        height: 36px !important;
      }
    }

    /* --- 3. File Chunk Styling (Plate View) --- */
    ms-file-chunk {
      display: flex !important;
      width: 100% !important;
      background: var(--color-v3-surface-container-high) !important;
      border-radius: 12px !important;
      cursor: pointer !important;
      transition: background 0.2s !important;
    }

    ms-file-chunk:hover {
      background: var(--color-v3-surface-container-highest) !important;
    }

    ms-file-chunk .preview-container {
      display: none !important;
    }

    ms-file-chunk .file-chunk-container {
      padding: 10px 14px !important;
      display: flex !important;
      flex-direction: row !important;
      align-items: center !important;
      justify-content: space-between !important;
      width: 100% !important;
    }

    ms-file-chunk .file-chunk-container > div:first-child {
      display: flex !important;
      align-items: center !important;
      gap: 10px !important;
      flex: 1 !important;
      overflow: hidden !important;
    }

    ms-file-chunk .file-icon {
      font-size: 20px !important;
      color: var(--color-v3-primary) !important;
    }

    ms-file-chunk .name {
      font-family: 'Google Sans', Inter, sans-serif !important;
      font-size: 14px !important;
      font-weight: 500 !important;
      color: var(--color-v3-text) !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
    }

    ms-file-chunk .token-count {
      font-size: 12px !important;
      color: var(--color-v3-text-var) !important;
      margin-left: 12px !important;
    }

    /* Control buttons styling */
    ms-image-chunk .bottom-right-image-controls button[ms-button] {
      width: 28px !important;
      height: 28px !important;
      border-radius: 50% !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      background: transparent !important;
      border: none !important;
      transition: background 0.2s !important;
    }

    ms-image-chunk .bottom-right-image-controls button[ms-button]:hover {
      background: var(--color-v3-hover) !important;
    }

    /* --- 4. Enhanced Image View (Strictly Scoped Parity) --- */
    
    /* 60% Dark tint ONLY for our specific backdrop class injected via JS */
    .cdk-overlay-backdrop.sl-backdrop-tint {
      background-color: rgba(0, 0, 0, 0.6) !important;
    }

    /* Scoped Pane overrides */
    .cdk-overlay-pane:has(ms-view-media-dialog) {
      width: 100vw !important;
      height: 100vh !important;
      max-width: 100vw !important;
      max-height: 100vh !important;
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      transform: none !important;
      z-index: 2000 !important;
      background: transparent !important;
      pointer-events: none !important;
      animation: none !important;
      transition: none !important;
    }

    /* Scoped Dialog Container overrides */
    .cdk-overlay-pane:has(ms-view-media-dialog) mat-dialog-container, 
    .cdk-overlay-pane:has(ms-view-media-dialog) .mat-mdc-dialog-container,
    .cdk-overlay-pane:has(ms-view-media-dialog) .mat-mdc-dialog-inner-container,
    .cdk-overlay-pane:has(ms-view-media-dialog) .mat-mdc-dialog-surface,
    .cdk-overlay-pane:has(ms-view-media-dialog) .mdc-dialog__surface,
    ms-view-media-dialog,
    ms-view-media-dialog .action-confirmation,
    ms-view-media-dialog .action-confirmation-wide,
    ms-view-media-dialog .view-media-dialog,
    ms-view-media-dialog main,
    ms-view-media-dialog .image-container {
      background: transparent !important;
      border: none !important;
      box-shadow: none !important;
      width: 100% !important;
      height: 100% !important;
      max-width: 100vw !important;
      max-height: 100vh !important;
      padding: 0 !important;
      margin: 0 !important;
      pointer-events: none !important;
      display: flex !important;
      flex-direction: column !important;
      animation: none !important;
      transition: none !important;
      --mat-dialog-transition-duration: 0ms !important;
    }

    /* Interactive elements */
    ms-view-media-dialog header.shared-dialog-header,
    ms-view-media-dialog .main-media-item,
    ms-view-media-dialog .actions,
    .sl-back-button,
    ms-view-media-dialog main { /* Main needs pointer events for the click-to-close JS */
      pointer-events: auto !important;
    }

    ms-view-media-dialog header.shared-dialog-header {
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      width: 100% !important;
      height: 76px !important;
      padding: 0 24px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: flex-start !important;
      background: transparent !important;
      z-index: 100 !important;
    }

    /* Back button: Use native button styling */
    .sl-back-button {
      margin-right: 8px !important;
      color: var(--color-v3-text) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      cursor: pointer !important;
    }

    .sl-back-button .google-symbols {
      font-size: 24px !important; /* Match right-side icons */
    }

    ms-view-media-dialog header .text {
      font-family: 'Google Sans', Inter, sans-serif !important;
      font-size: 14px !important;
      font-weight: 500 !important;
      color: var(--color-v3-text) !important;
      flex: 1 !important;
      margin-left: 4px !important; /* Tighten spacing */
    }

    /* Native sizing for all header icons */
    ms-view-media-dialog header button .material-symbols-outlined {
      font-size: 24px !important;
    }

    /* Fix for Hover Controls Buttons */
    ms-image-chunk .bottom-right-image-controls button[ms-button] {
      width: 28px !important;
      height: 28px !important;
      transition: background 0.2s !important;
    }

    ms-image-chunk .bottom-right-image-controls button[ms-button]:hover {
      background-color: var(--color-v3-hover) !important;
    }

    /* Main Area: Centering and Click-to-close target */
    ms-view-media-dialog main {
      justify-content: center !important;
      align-items: center !important;
      flex: 1 !important;
      width: 100% !important;
      height: 100% !important;
      cursor: default !important;
    }

    ms-view-media-dialog .main-media-item {
      max-width: 90vw !important;
      max-height: 90vh !important;
      border-radius: 24px !important; 
      box-shadow: 0 10px 60px rgba(0,0,0,0.6) !important;
      object-fit: contain !important;
      background: #000 !important;
      pointer-events: auto !important;
    }
  `;

  function injectHeaderElements() {
    const dialog = document.querySelector('ms-view-media-dialog');
    if (!dialog) return;

    // 1. Precise Backdrop Tinting (Target only this dialog's backdrop)
    const pane = dialog.closest('.cdk-overlay-pane');
    if (pane && pane.previousElementSibling && pane.previousElementSibling.classList.contains('cdk-overlay-backdrop')) {
      pane.previousElementSibling.classList.add('sl-backdrop-tint');
    }

    const header = dialog.querySelector('header.shared-dialog-header');
    if (!header || header.querySelector('.sl-back-button')) return;

    // 1. Create Back Button (Native Style)
    const backBtn = document.createElement('button');
    backBtn.setAttribute('ms-button', '');
    backBtn.setAttribute('variant', 'icon-borderless');
    backBtn.className = 'sl-back-button ms-button-borderless ms-button-icon';
    backBtn.innerHTML = '<span class="google-symbols material-symbols-outlined">arrow_back</span>';
    
    backBtn.onclick = (e) => {
      e.stopPropagation();
      const closeBtn = dialog.querySelector('button[aria-label="Close"]');
      if (closeBtn) closeBtn.click();
    };

    // 2. Click-to-close on empty space
    const main = dialog.querySelector('main');
    if (main && !main.dataset.slListener) {
      main.onclick = (e) => {
        if (e.target === main) {
          const closeBtn = dialog.querySelector('button[aria-label="Close"]');
          if (closeBtn) closeBtn.click();
        }
      };
      main.dataset.slListener = 'true';
    }

    header.prepend(backBtn);
  }

  window.StudioLab.registerModule({
    id: 'improved-media-view',
    group: 'modules',
    order: 40,
    title: 'Improved Media View',
    subtitle: 'gallery-and-viewer',
    icon: 'visibility',
    stateKey: 'mediaViewEnabled',
    defaults: {
      mediaViewEnabled: true
    },
    details: [
      { icon: 'visibility', text: 'Native-parity grid hover and full-screen viewer with functional back button and rounded corners.' }
    ],
    init(ctx) {
      ctxRef = ctx;
      this.updateStyles();
      this.setupObserver();
    },
    onStateChange() {
      this.updateStyles();
    },
    setupObserver() {
      if (dialogObserver) dialogObserver.disconnect();

      dialogObserver = new MutationObserver((mutations) => {
      const enabled = !!(ctxRef && ctxRef.state.mediaViewEnabled);
      if (!enabled) return;

      // 1. Inject Header Elements for Dialog
      injectHeaderElements();

      // 2. Logic to Separate Image Rows from File Rows
      const container = document.querySelector('ms-chat-session .cdk-virtual-scroll-content-wrapper');
      if (container) {
        const turns = Array.from(container.querySelectorAll('ms-chat-turn'));
        
        // Remove old breaks first
        container.querySelectorAll('.sl-grid-break').forEach(b => b.remove());

        for (let i = 0; i < turns.length - 1; i++) {
          const currentIsImage = !!turns[i].querySelector('ms-image-chunk');
          const nextIsFile = !!turns[i+1].querySelector('ms-file-chunk');
          const currentIsFile = !!turns[i].querySelector('ms-file-chunk');
          const nextIsImage = !!turns[i+1].querySelector('ms-image-chunk');

          if ((currentIsImage && nextIsFile) || (currentIsFile && nextIsImage)) {
            const breaker = document.createElement('div');
            breaker.className = 'sl-grid-break';
            turns[i].after(breaker);
          }
        }
      }
    });

      dialogObserver.observe(document.body, { childList: true, subtree: true });
    },
    updateStyles() {
      const enabled = !!(ctxRef && ctxRef.state.mediaViewEnabled);
      
      if (enabled) {
        if (!styleEl) {
          styleEl = document.createElement('style');
          styleEl.id = 'sl-media-view-styles';
          styleEl.textContent = CSS;
          document.head.appendChild(styleEl);
        }
      } else {
        if (styleEl) {
          styleEl.remove();
          styleEl = null;
        }
      }
    }
  });
})();


