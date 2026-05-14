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
    /* --- 1. Scoped Grid Architecture (Native Parity) --- */
    
    .cdk-virtual-scroll-content-wrapper,
    .chat-session-content {
      display: grid !important;
      grid-template-columns: repeat(12, 1fr) !important;
      gap: 4px !important;
      align-content: flex-start !important;
      justify-items: stretch !important;

      & > ms-chat-turn {
        grid-column: 1 / -1 !important;
        width: 100% !important;
        display: block !important;
        box-sizing: border-box !important;
        
        /* Media/File Turns: Dedicated Gallery Units */
        &:has(ms-image-chunk), &:has(ms-file-chunk) {
          position: relative !important;
          top: 0 !important;
          left: 0 !important;
          transform: none !important;
          margin: 0 !important;
          padding: 0 !important;
          width: 100% !important;
          max-width: none !important;
          min-width: 0 !important;
        }

        /* Image: span 2 (Desktop: 6 per row) */
        &:has(ms-image-chunk) {
          grid-column: span 2 !important;
        }

        /* File: span 4 (Desktop: 3 per row) */
        &:has(ms-file-chunk) {
          grid-column: span 4 !important;
        }

        /* Force new row when type changes */
        &:has(ms-image-chunk) + &:has(ms-file-chunk),
        &:has(ms-file-chunk) + &:has(ms-image-chunk) {
          grid-column-start: 1 !important;
        }
      }
    }

    /* Adaptive: Tablet */
    @media (max-width: 1300px) {
      .cdk-virtual-scroll-content-wrapper, .chat-session-content {
        & > ms-chat-turn {
          &:has(ms-image-chunk) { grid-column: span 3 !important; }
          &:has(ms-file-chunk) { grid-column: span 6 !important; }
        }
      }
    }

    /* Adaptive: Mobile */
    @media (max-width: 800px) {
      .cdk-virtual-scroll-content-wrapper, .chat-session-content {
        & > ms-chat-turn {
          &:has(ms-image-chunk) { grid-column: span 6 !important; }
          &:has(ms-file-chunk) { grid-column: span 12 !important; }
        }
      }
    }

    /* --- 2. Image Chunk Styling (Native Look) --- */
    ms-image-chunk {
      aspect-ratio: 1 / 1 !important;
      width: 100% !important;
      height: 100% !important;
      border-radius: 12px !important;
      overflow: hidden !important;
      background: var(--color-v3-surface-container-high) !important;
      position: relative !important;
      display: block !important;

      & .image-container, & img {
        width: 100% !important;
        height: 100% !important;
        object-fit: cover !important;
        display: block !important;
        border-radius: inherit !important;
      }
    }

    .bottom-right-image-controls {
      background: var(--color-v3-surface-container-high) !important;
      border-radius: 12px !important;
      bottom: 8px !important;
      right: 8px !important;
      display: none;
      gap: 4px !important;
      position: absolute !important;
      padding: 4px !important;
      z-index: 20 !important;
    }

    ms-image-chunk:hover .bottom-right-image-controls {
      display: flex !important;
    }

    @media (pointer: coarse) {
      .bottom-right-image-controls { display: none !important; }
    }

    /* --- 3. File Chunk Styling (Fixed Widths) --- */
    ms-file-chunk {
      display: flex !important;
      width: 100% !important;
      min-width: 0 !important;
      background: var(--color-v3-surface-container-high) !important;
      border-radius: 12px !important;
      cursor: pointer !important;
      
      &:hover { background: var(--color-v3-surface-container-highest) !important; }
      .preview-container { display: none !important; }
      
      .file-chunk-container {
        padding: 10px 14px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        width: 100% !important;
        min-width: 0 !important;
        gap: 6px !important;
        box-sizing: border-box !important;
      }
    }

    ms-file-chunk .file-chunk-container > div:first-child {
      display: flex !important;
      align-items: center !important;
      gap: 6px !important;
      flex: 1 !important;
      min-width: 0 !important;
      overflow: hidden !important;
    }

    ms-file-chunk .file-icon {
      margin: 0 !important;
      font-size: 20px !important;
      color: var(--color-v3-primary) !important;
      flex-shrink: 0 !important;
    }

    /* Hide custom controls on touch to allow native menus */
    @media (pointer: coarse) {
      ms-image-chunk .bottom-right-image-controls {
        display: none !important;
      }
    }

    /* --- 3. Modern File Chunk Styling --- */
    ms-file-chunk {
      display: flex !important;
      width: 100% !important;
      background: var(--color-v3-surface-container-high) !important;
      border-radius: 12px !important;
      cursor: pointer !important;
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
      min-width: 0 !important; /* FIXED: Enable truncation */
      overflow: hidden !important;
    }

    ms-file-chunk .file-icon {
      font-size: 20px !important;
      color: var(--color-v3-primary) !important;
      flex-shrink: 0 !important;
    }

    ms-file-chunk .name {
      font-family: 'Google Sans', Inter, sans-serif !important;
      font-size: 14px !important;
      font-weight: 500 !important;
      color: var(--color-v3-text) !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      flex: 1 !important;
    }

    ms-file-chunk .token-count {
      font-size: 12px !important;
      color: var(--color-v3-text-var) !important;
      margin-left: 8px !important;
      flex-shrink: 0 !important;
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

    // 1. Precise Backdrop Tinting
    const pane = dialog.closest('.cdk-overlay-pane');
    if (pane && pane.previousElementSibling && pane.previousElementSibling.classList.contains('cdk-overlay-backdrop')) {
      pane.previousElementSibling.classList.add('sl-backdrop-tint');
    }

    // 2. Click-to-close on empty space (Modern UX)
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
  }

  window.StudioLab.registerModule({
    id: 'improved-media-view',
    group: 'modules',
    order: 40,
    title: 'Improved Media View',
    subtitle: 'gallery-and-viewer',
    badge: { text: 'Beta', className: 'beta' },
    icon: 'visibility',
    stateKey: 'mediaViewEnabled',
    defaults: {
      mediaViewEnabled: false
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

        // Only need to inject header, grid and breaks are now handled by pure modern CSS
        injectHeaderElements();
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


