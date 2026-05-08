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
    /* --- 1. Safe Flex Architecture (INSIDE the turn, total stability) --- */
    
    /* Замість того, щоб ламати скроллер, ми робимо flex-сітку всередині самого повідомлення */
    ms-chat-turn .chunk-container {
      display: flex !important;
      flex-wrap: wrap !important;
      gap: 8px !important;
      align-items: flex-start !important;
    }

    /* Базово всі чанки (текст, думки) займають 100% ширини і йдуть останніми */
    ms-chat-turn .chunk-container > * {
      flex: 1 1 100% !important;
      order: 3 !important; 
    }

    /* --- 2. Image Chunk Styling (Strict Uniformity) --- */
    
    /* СОРТУВАННЯ: Фотки отримують order: 1 (будуть першими) */
    ms-chat-turn .chunk-container > *:has(ms-image-chunk) {
      order: 1 !important;
      flex: 0 0 auto !important;
      width: 160px !important;
      height: 160px !important;
      padding: 0 !important;
      margin: 0 !important;
    }

    ms-image-chunk {
      display: block !important;
      width: 100% !important;
      height: 100% !important;
      aspect-ratio: 1 / 1 !important;
      border-radius: 12px !important;
      overflow: hidden !important;
      background: var(--color-v3-surface-container-high) !important;

      & .image-container, & img {
        width: 100% !important;
        height: 100% !important;
        object-fit: cover !important;
        display: block !important;
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

    /* --- 3. File Chunk Styling --- */
    
    /* СОРТУВАННЯ: Файли отримують order: 2 (будуть після фоток, але перед текстом) */
    ms-chat-turn .chunk-container > *:has(ms-file-chunk) {
      order: 2 !important;
      flex: 0 0 auto !important;
      width: calc(33.33% - 12px) !important;
      min-width: 280px !important;
      padding: 0 !important;
      margin: 0 !important;
    }

    ms-file-chunk {
      display: block !important;
      width: 100% !important;
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

    ms-image-chunk .bottom-right-image-controls button[ms-button]:hover {
      background: var(--color-v3-hover) !important;
    }

    /* --- 4. Enhanced Image View (Strictly Scoped Parity) --- */
    /* Твої стилі для модалки залишені без змін */
    
    .cdk-overlay-backdrop.sl-backdrop-tint {
      background-color: rgba(0, 0, 0, 0.6) !important;
    }

    .cdk-overlay-pane:has(ms-view-media-dialog) {
      width: 100vw !important;
      height: 100vh !important;
      height: 100dvh !important;
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

    ms-view-media-dialog header.shared-dialog-header,
    ms-view-media-dialog .main-media-item,
    ms-view-media-dialog .actions,
    .sl-back-button,
    ms-view-media-dialog main { 
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

    .sl-back-button {
      margin-right: 8px !important;
      color: var(--color-v3-text) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      cursor: pointer !important;
    }

    .sl-back-button .google-symbols { font-size: 24px !important; }

    ms-view-media-dialog header .text {
      font-family: 'Google Sans', Inter, sans-serif !important;
      font-size: 14px !important;
      font-weight: 500 !important;
      color: var(--color-v3-text) !important;
      flex: 1 !important;
    }

    ms-view-media-dialog header button .material-symbols-outlined {
      font-size: 24px !important;
    }

    ms-image-chunk .bottom-right-image-controls button[ms-button] {
      width: 28px !important;
      height: 28px !important;
      transition: background 0.2s !important;
    }

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

  // Сучасний підхід до ініціалізації модалки (без дублювання подій)
  function injectHeaderElements() {
    const dialog = document.querySelector('ms-view-media-dialog');
    // Використовуємо dataset, щоб не переініціалізовувати модалку 10 разів на секунду
    if (!dialog || dialog.dataset.slInjected) return;

    // 1. Точне затемнення фону
    const pane = dialog.closest('.cdk-overlay-pane');
    const backdrop = pane?.previousElementSibling;
    if (backdrop?.classList.contains('cdk-overlay-backdrop')) {
      backdrop.classList.add('sl-backdrop-tint');
    }

    // 2. Закриття по кліку на порожній простір (сучасний Event Listener)
    const main = dialog.querySelector('main');
    if (main) {
      main.addEventListener('click', (e) => {
        if (e.target === main) {
          dialog.querySelector('button[aria-label="Close"]')?.click();
        }
      });
    }

    dialog.dataset.slInjected = 'true';
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

      dialogObserver = new MutationObserver(() => {
        if (!ctxRef?.state.mediaViewEnabled) return;

        // Швидка перевірка, чи взагалі існує діалог, щоб не навантажувати процесор
        if (document.querySelector('ms-view-media-dialog')) {
          injectHeaderElements();
        }
      });

      // Слухаємо тільки додавання нових нодів, щоб не реагувати на кожну зміну тексту
      dialogObserver.observe(document.body, { childList: true, subtree: true });
    },
    updateStyles() {
      const enabled = !!ctxRef?.state.mediaViewEnabled;

      if (enabled) {
        if (!styleEl) {
          styleEl = document.createElement('style');
          styleEl.id = 'sl-media-view-styles';
          styleEl.textContent = CSS;
          document.head.appendChild(styleEl);
        }
      } else if (styleEl) {
        styleEl.remove();
        styleEl = null;
      }
    }
  });
})();