/**
 * Studio.lab module: photo-grid
 * Transforms vertically stacked images into a sleek 1:1 grid layout.
 */
(function () {
  'use strict';

  if (!window.StudioLab || typeof window.StudioLab.registerModule !== 'function') return;

  let ctxRef = null;
  let styleEl = null;

  const CSS = `
    /* --- Container Adjustments --- */
    /* Target the main chat container to allow turns to wrap */
    ms-chat-session ms-autoscroll-container > div > div {
      display: flex !important;
      flex-direction: row !important;
      flex-wrap: wrap !important;
      align-items: flex-start !important;
      align-content: flex-start !important;
      padding-bottom: 20px !important;
    }

    /* Standard turns (text or mixed) take full width */
    ms-chat-turn {
      width: 100% !important;
      flex: 0 0 100% !important;
    }

    /* --- Photo Grid Turn --- */
    /* Target turns that only contain images (no text chunks) */
    ms-chat-turn:has(ms-image-chunk):not(:has(ms-text-chunk)) {
      width: 25% !important;
      flex: 0 0 25% !important;
      min-width: 180px !important;
      padding: 4px !important;
      box-sizing: border-box !important;
    }

    /* Hide author label and timestamp for photo grid items to look like a gallery */
    ms-chat-turn:has(ms-image-chunk):not(:has(ms-text-chunk)) .author-label {
      display: none !important;
    }
    
    /* Remove unnecessary spacing in photo turns */
    ms-chat-turn:has(ms-image-chunk):not(:has(ms-text-chunk)) .chat-turn-container {
      padding: 0 !important;
      margin: 0 !important;
    }
    
    ms-chat-turn:has(ms-image-chunk):not(:has(ms-text-chunk)) .virtual-scroll-container {
       padding: 0 !important;
    }

    /* --- Image Chunk Styling --- */
    ms-image-chunk {
      aspect-ratio: 1 / 1 !important;
      width: 100% !important;
      height: auto !important;
      display: block !important;
      border-radius: 12px !important;
      overflow: hidden !important;
      background: var(--color-v3-surface-container-high, #252525) !important;
      border: 1px solid var(--color-v3-outline-var, #262626) !important;
      transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s ease !important;
      cursor: pointer !important;
    }

    ms-image-chunk:hover {
      transform: translateY(-2px) scale(1.02) !important;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4) !important;
      z-index: 10 !important;
      border-color: var(--color-v3-outline, #444) !important;
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
      transition: filter 0.3s ease !important;
    }

    /* --- Controls Overlay --- */
    ms-image-chunk .bottom-right-image-controls {
      position: absolute !important;
      bottom: 8px !important;
      right: 8px !important;
      display: flex !important;
      gap: 4px !important;
      background: rgba(0, 0, 0, 0.6) !important;
      backdrop-filter: blur(8px) !important;
      padding: 4px !important;
      border-radius: 10px !important;
      opacity: 0 !important;
      transform: translateY(4px) !important;
      transition: opacity 0.2s ease, transform 0.2s ease !important;
      pointer-events: all !important;
    }

    ms-image-chunk:hover .bottom-right-image-controls {
      opacity: 1 !important;
      transform: translateY(0) !important;
    }

    /* --- Responsive Grid --- */
    @media (max-width: 1200px) {
      ms-chat-turn:has(ms-image-chunk):not(:has(ms-text-chunk)) {
        width: 33.33% !important;
        flex: 0 0 33.33% !important;
      }
    }
    @media (max-width: 900px) {
      ms-chat-turn:has(ms-image-chunk):not(:has(ms-text-chunk)) {
        width: 50% !important;
        flex: 0 0 50% !important;
      }
    }
    @media (max-width: 600px) {
      ms-chat-turn:has(ms-image-chunk):not(:has(ms-text-chunk)) {
        width: 100% !important;
        flex: 0 0 100% !important;
      }
    }
  `;

  window.StudioLab.registerModule({
    id: 'photo-grid',
    group: 'modules',
    order: 40,
    title: 'Photo Grid View',
    subtitle: 'gallery-layout',
    icon: 'visibility',
    stateKey: 'photoGridEnabled',
    defaults: {
      photoGridEnabled: true
    },
    details: [
      { icon: 'visibility', text: 'Displays consecutive photo-only messages in a clean 1:1 grid instead of stacking them.' }
    ],
    init(ctx) {
      ctxRef = ctx;
      this.updateGrid();
    },
    onStateChange() {
      this.updateGrid();
    },
    updateGrid() {
      const enabled = !!(ctxRef && ctxRef.state.photoGridEnabled);
      
      if (enabled) {
        if (!styleEl) {
          styleEl = document.createElement('style');
          styleEl.id = 'sl-photo-grid-styles';
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
