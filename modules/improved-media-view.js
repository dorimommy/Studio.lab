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
    /* --- 1. Gallery Grid (6 items per row) --- */
    ms-chat-session ms-autoscroll-container > div > div {
      display: flex !important;
      flex-direction: row !important;
      flex-wrap: wrap !important;
      align-items: flex-start !important;
      align-content: flex-start !important;
      padding-bottom: 24px !important;
    }

    ms-chat-turn {
      width: 100% !important;
      flex: 0 0 100% !important;
    }

    ms-chat-turn:has(ms-image-chunk):not(:has(ms-text-chunk)) {
      width: 16.66% !important;
      flex: 0 0 16.66% !important;
      padding: 0 !important;
      box-sizing: border-box !important;
    }

    /* --- 2. Image Chunk Grid Previews --- */
    ms-image-chunk {
      aspect-ratio: 1 / 1 !important;
      width: 100% !important;
      height: auto !important;
      display: block !important;
      border-radius: 8px !important;
      overflow: hidden !important;
      background: var(--color-v3-surface-container-high) !important;
      border: 1px solid var(--color-v3-outline-var) !important;
      cursor: pointer !important;
    }

    ms-image-chunk .image-container {
      width: 100% !important;
      height: 100% !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      position: relative !important;
    }

    ms-image-chunk img.loaded-image {
      width: 100% !important;
      height: 100% !important;
      object-fit: cover !important;
      margin: 0 !important;
    }

    /* --- 3. Native Hover Controls (Matched to user's CSS) --- */
    ms-image-chunk .bottom-right-image-controls {
      background: var(--color-v3-surface-container-high) !important;
      border-radius: 16px !important;
      bottom: 6px !important;
      right: 6px !important;
      display: flex !important;
      gap: 4px !important;
      position: absolute !important;
      padding: 4px !important;
      opacity: 0 !important;
      transition: opacity 0.15s ease-in-out !important;
      pointer-events: all !important;
      box-shadow: var(--v3-shadow-md) !important;
    }

    ms-image-chunk:hover .bottom-right-image-controls {
      opacity: 1 !important;
    }

    /* Native button look for hover controls */
    ms-image-chunk .bottom-right-image-controls button[ms-button] {
      border-radius: 50% !important;
      aspect-ratio: 1/1 !important;
      padding: 0 !important;
      width: 32px !important;
      height: 32px !important;
      background: transparent !important;
      border: none !important;
      color: var(--color-v3-text) !important;
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

        for (const mutation of mutations) {
          if (mutation.addedNodes.length) {
            injectHeaderElements();
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


