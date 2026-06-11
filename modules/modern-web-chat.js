/**
 * Studio.lab module: modern-web-chat
 *
 * Replicates the Gemini web app input bar using 100% NATIVE Angular elements.
 * NO PROXY DOM. NO FAKE CLICKS.
 *
 * - Uses CSS `display: contents` to flatten the bottom row.
 * - Uses CSS `order` to rearrange native elements.
 * - Injects custom [Other Uploads] button to split the + menu.
 */
(function () {
  'use strict';

  if (!window.StudioLab || typeof window.StudioLab.registerModule !== 'function') return;

  let ctxRef = null;
  let styleEl = null;
  let mainObserver = null;
  let updateScheduled = false;

  // ══════════════════════════════════════════════════════════════════
  //  CSS (Native Restyling & Menu Hacks)
  // ══════════════════════════════════════════════════════════════════
  const CSS = `
    /* ── PART 1: MEDIA GALLERY & VIEWER ────────────────────────────────── */

    /* 1. Scoped Grid Architecture */
    .cdk-virtual-scroll-content-wrapper,
    .chat-session-content {
      display: grid !important;
      grid-template-columns: repeat(12, 1fr) !important;
      gap: 4px !important;
      align-content: flex-start !important;
      justify-items: stretch !important;
      padding: 0 4px !important; /* Prevent photos from touching scrollbar edges */

      & > ms-chat-turn {
        grid-column: 1 / -1 !important;
        width: 100% !important;
        display: block !important;
        box-sizing: border-box !important;
      }

      /* IMAGE-ONLY turns (no text alongside) go into grid tiles */
      & > ms-chat-turn:has(ms-image-chunk):not(:has(ms-text-chunk)) {
        position: relative !important;
        top: 0 !important; left: 0 !important;
        transform: none !important;
        margin: 0 !important; padding: 0 !important;
        width: 100% !important;
        max-width: none !important; min-width: 0 !important;
        grid-column: span 2 !important;
      }

      /* FILE turns */
      & > ms-chat-turn:has(ms-file-chunk):not(:has(ms-text-chunk)) {
        position: relative !important;
        top: 0 !important; left: 0 !important;
        transform: none !important;
        margin: 0 !important; padding: 0 !important;
        width: 100% !important;
        max-width: none !important; min-width: 0 !important;
        grid-column: span 4 !important;
      }

      /* Force new row when type changes */
      & > ms-chat-turn:has(ms-image-chunk):not(:has(ms-text-chunk)) + & > ms-chat-turn:has(ms-file-chunk),
      & > ms-chat-turn:has(ms-file-chunk) + & > ms-chat-turn:has(ms-image-chunk):not(:has(ms-text-chunk)) {
        grid-column-start: 1 !important;
      }

      /* Non-turn elements (disclaimers, nudges, etc.) always full width */
      & > :not(ms-chat-turn) {
        grid-column: 1 / -1 !important;
      }
    }

    /* Adaptive: Tablet */
    @media (max-width: 1300px) {
      .cdk-virtual-scroll-content-wrapper, .chat-session-content {
        & > ms-chat-turn:has(ms-image-chunk):not(:has(ms-text-chunk)) { grid-column: span 3 !important; }
        & > ms-chat-turn:has(ms-file-chunk):not(:has(ms-text-chunk)) { grid-column: span 6 !important; }
      }
    }
    /* Adaptive: Mobile */
    @media (max-width: 800px) {
      .cdk-virtual-scroll-content-wrapper, .chat-session-content {
        & > ms-chat-turn:has(ms-image-chunk):not(:has(ms-text-chunk)) { grid-column: span 4 !important; }
        & > ms-chat-turn:has(ms-file-chunk):not(:has(ms-text-chunk)) { grid-column: span 12 !important; }
      }
    }

    /* 2. Clean image-only grid tiles — hide labels and spacers, but KEEP actions (delete/edit/rerun) */
    ms-chat-turn:has(ms-image-chunk):not(:has(ms-text-chunk)) .author-label,
    ms-chat-turn:has(ms-image-chunk):not(:has(ms-text-chunk)) .turn-separator,
    ms-chat-turn:has(ms-image-chunk):not(:has(ms-text-chunk)) .sl-word-counter,
    ms-chat-turn:has(ms-image-chunk):not(:has(ms-text-chunk)) .turn-information {
      display: none !important;
    }
    /* Reset virtual-scroll spacer height inside image tiles */
    ms-chat-turn:has(ms-image-chunk):not(:has(ms-text-chunk)) .virtual-scroll-container > div:first-child {
      height: 0 !important;
    }
    /* Remove padding from containers in image tiles */
    ms-chat-turn:has(ms-image-chunk):not(:has(ms-text-chunk)) .chat-turn-container {
      padding: 0 !important; margin: 0 !important;
    }
    ms-chat-turn:has(ms-image-chunk):not(:has(ms-text-chunk)) .turn-content {
      padding: 0 !important; margin: 0 !important;
    }
    ms-chat-turn:has(ms-image-chunk):not(:has(ms-text-chunk)) .virtual-scroll-container {
      padding: 0 !important; margin: 0 !important;
    }

    /* 3. Image Chunk — 1:1 square tiles */
    ms-image-chunk {
      aspect-ratio: 1 / 1 !important;
      width: 100% !important; height: 100% !important;
      border-radius: 12px !important; overflow: hidden !important;
      background: var(--color-v3-surface-container-high) !important;
      position: relative !important; display: block !important;
      & .image-container, & img {
        width: 100% !important; height: 100% !important;
        object-fit: cover !important; display: block !important; border-radius: inherit !important;
      }
    }
    /* Model response images (in mixed text+image turns) — NOT square, natural aspect */
    ms-chat-turn:has(ms-text-chunk) ms-image-chunk {
      aspect-ratio: auto !important;
      height: auto !important;
    }
    ms-chat-turn:has(ms-text-chunk) ms-image-chunk img {
      height: auto !important;
      max-height: 70vh !important;
      object-fit: contain !important;
    }

    /* Image hover controls — Desktop */
    .bottom-right-image-controls {
      background: var(--color-v3-surface-container-high) !important;
      border-radius: 12px !important;
      bottom: 8px !important; right: 8px !important;
      display: none; gap: 4px !important;
      position: absolute !important; padding: 4px !important; z-index: 20 !important;
    }
    ms-image-chunk:hover .bottom-right-image-controls { display: flex !important; }

    /* Touch/mobile: HIDE download/fullscreen — tapping opens fullscreen natively */
    @media (pointer: coarse) {
      .bottom-right-image-controls {
        display: none !important;
      }
    }

    ms-image-chunk .bottom-right-image-controls button[ms-button] {
      width: 28px !important; height: 28px !important;
      border-radius: 50% !important; display: flex !important;
      align-items: center !important; justify-content: center !important;
      background: transparent !important; border: none !important;
      transition: background 0.2s !important;
    }
    ms-image-chunk .bottom-right-image-controls button[ms-button]:hover {
      background: var(--color-v3-hover) !important;
    }

    /* 4. File Chunk Styling */
    ms-file-chunk {
      display: flex !important; width: 100% !important; min-width: 0 !important;
      background: var(--color-v3-surface-container-high) !important;
      border-radius: 12px !important; cursor: pointer !important;
      &:hover { background: var(--color-v3-surface-container-highest) !important; }
      .preview-container { display: none !important; }
      .file-chunk-container {
        padding: 10px 14px !important; display: flex !important;
        align-items: center !important; justify-content: space-between !important;
        width: 100% !important; min-width: 0 !important;
        gap: 6px !important; box-sizing: border-box !important;
      }
    }
    ms-file-chunk .file-chunk-container > div:first-child {
      display: flex !important; align-items: center !important;
      gap: 10px !important; flex: 1 !important;
      min-width: 0 !important; overflow: hidden !important;
    }
    ms-file-chunk .file-icon {
      font-size: 20px !important; color: var(--color-v3-primary) !important; flex-shrink: 0 !important; margin: 0 !important;
    }
    ms-file-chunk .name {
      font-size: 14px !important; font-weight: 500 !important;
      white-space: nowrap !important; overflow: hidden !important;
      text-overflow: ellipsis !important; flex: 1 !important;
    }
    ms-file-chunk .token-count {
      font-size: 12px !important; color: var(--color-v3-text-var) !important;
      margin-left: 8px !important; flex-shrink: 0 !important;
    }

    /* 5. Enhanced Full-Screen Viewer */
    .cdk-overlay-backdrop.sl-backdrop-tint {
      background-color: rgba(0, 0, 0, 0.6) !important;
    }
    .cdk-overlay-pane:has(ms-view-media-dialog) {
      width: 100vw !important; height: 100vh !important;
      max-width: 100vw !important; max-height: 100vh !important;
      position: fixed !important; top: 0 !important; left: 0 !important;
      transform: none !important; z-index: 2000 !important;
      background: transparent !important; pointer-events: none !important;
      animation: none !important; transition: none !important;
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
      background: transparent !important; border: none !important;
      box-shadow: none !important; width: 100% !important; height: 100% !important;
      max-width: 100vw !important; max-height: 100vh !important;
      padding: 0 !important; margin: 0 !important; pointer-events: none !important;
      display: flex !important; flex-direction: column !important;
      animation: none !important; transition: none !important;
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
      position: absolute !important; top: 0 !important; left: 0 !important;
      width: 100% !important; height: 76px !important; padding: 0 24px !important;
      display: flex !important; align-items: center !important;
      justify-content: flex-start !important; background: transparent !important;
      z-index: 100 !important;
    }
    ms-view-media-dialog header .text {
      font-size: 14px !important; font-weight: 500 !important; flex: 1 !important;
    }
    ms-view-media-dialog main {
      justify-content: center !important; align-items: center !important;
      flex: 1 !important; width: 100% !important; height: 100% !important;
      cursor: default !important;
    }
    ms-view-media-dialog .main-media-item {
      max-width: 90vw !important; max-height: 90vh !important;
      border-radius: 24px !important;
      box-shadow: 0 10px 60px rgba(0,0,0,0.6) !important;
      object-fit: contain !important; background: #000 !important;
    }

    /* ── PART 2: HIDE LEFT ROW & REARRANGE RIGHT ROW ────────────────── */
    
    /* Allow submenus to break out of the native panel boundaries */
    .cdk-overlay-container .mat-mdc-menu-panel,
    .cdk-overlay-container .mat-mdc-menu-content {
        overflow: visible !important;
    }

    ms-prompt-box .buttons-row {
        display: flex !important;
        align-items: center !important;
        width: 100% !important;
    }

    /* 1. Hide the native left row entirely since its items are moving into the + menu */
    ms-prompt-box .button-row-left {
        opacity: 0 !important;
        position: absolute !important;
        pointer-events: none !important;
        width: 0 !important; height: 0 !important; overflow: hidden !important;
    }

    /* 2. Flatten the right wrapper so we can reorder + and Mic/Run */
    ms-prompt-box .button-wrapper {
        display: contents !important;
    }

    /* 3. Make sure any other random elements in the bottom row are pushed to the right initially */
    ms-prompt-box .buttons-row > * {
        order: 10 !important;
    }

    /* 4. Assign specific order to force layout */
    /* Move + to the far left */
    ms-add-media-button {
        order: -1 !important;
        margin-right: 8px !important;
    }

    /* Enabled tools bar sits right after + */
    ms-prompt-box .buttons-row > ms-horizontal-scroll.enabled-tool-container {
        order: 0 !important;
        margin-right: 8px !important;
        flex-shrink: 1 !important;
        min-width: 0 !important;
        max-width: calc(100% - 200px) !important;
        opacity: 1 !important;
        position: static !important;
        pointer-events: auto !important;
        width: auto !important;
        height: auto !important;
    }

    /* Mic and Run stay on the right. 
       margin-left: auto pushes them to the far right, keeping + and tools flush left! */
    ms-stt-button { 
        order: 2 !important; 
        margin-left: auto !important; 
        margin-right: 12px !important; 
    }
    ms-run-button { 
        order: 3 !important; 
    }

    /* Submenu hover wrapper */
    .sl-hover-wrapper {
        position: relative;
        width: 100%;
    }
    .sl-hover-wrapper > button {
        width: 100%;
    }
    /* The submenu panel */
    .sl-custom-submenu {
        display: none;
        position: absolute;
        left: 100%;
        top: 0;
    }
    /* Invisible bridge between button edge and submenu to prevent hover gap */
    .sl-custom-submenu::before {
        content: '';
        position: absolute;
        right: 100%;
        top: 0;
        width: 20px;
        height: 100%;
    }
    /* Pure CSS hover — no JS events, no flickering */
    .sl-hover-wrapper:hover > .sl-custom-submenu {
        display: flex !important;
    }

    /* ── PART 3: ENABLED TOOLS BAR ──────────────────────────────────── */

    /* Container — layout left, take up available space */
    ms-horizontal-scroll.enabled-tool-container {
        display: flex !important;
        align-items: center !important;
        justify-content: flex-start !important;
        background: transparent !important;
        border: none !important;
        padding: 0 !important;
        min-height: 0 !important;
        height: auto !important;
    }
    
    ms-horizontal-scroll.enabled-tool-container .scroll-container {
        display: flex !important;
        justify-content: flex-start !important;
        align-items: center !important;
        gap: 0 !important;
        background: transparent !important;
        min-height: 0 !important;
        padding: 0 !important;
        width: 100% !important;
    }

    /* Hide scroll chevrons and gradients */
    ms-horizontal-scroll.enabled-tool-container .chevron-btn,
    ms-horizontal-scroll.enabled-tool-container .scroll-container::before,
    ms-horizontal-scroll.enabled-tool-container .scroll-container::after,
    ms-horizontal-scroll.enabled-tool-container .show-left-gradient::before,
    ms-horizontal-scroll.enabled-tool-container .show-right-gradient::after {
        display: none !important;
    }

    /* Content row */
    ms-horizontal-scroll.enabled-tool-container .content-container {
        display: flex !important;
        justify-content: flex-start !important;
        align-items: center !important;
        gap: 6px !important;
        padding: 0 !important;
    }

    /* Tool chip — subtle outline pill, matches + button style */
    .enabled-tool-container .enabled-tool {
        display: inline-flex !important;
        align-items: center !important;
        gap: 2px !important;
        background: transparent !important;
        border: 1px solid rgba(255, 255, 255, 0.08) !important; /* Extra faint to match + button */
        border-radius: 100px !important;
        padding: 0 4px 0 10px !important;
        margin: 0 !important;
        height: 32px !important; /* strict height so it doesn't stretch row */
        transition: background 0.15s ease !important;
    }
    .enabled-tool-container .enabled-tool:hover {
        background: rgba(255, 255, 255, 0.05) !important;
    }

    /* Reset button inside */
    .enabled-tool-container .tool-chip-button {
        background: none !important;
        border: none !important;
        padding: 0 !important;
        cursor: pointer !important;
        display: flex !important;
        align-items: center !important;
        gap: 6px !important;
        height: 100% !important;
    }

    /* Text */
    .enabled-tool-container .tool-name {
        color: rgba(255, 255, 255, 0.6) !important; /* subtle text, not bright white */
        font-size: 13px !important;
        font-weight: 400 !important;
        white-space: nowrap !important;
        line-height: 1 !important;
    }

    /* Icon */
    .enabled-tool-container .tool-icon {
        color: rgba(255, 255, 255, 0.6) !important;
        font-size: 16px !important;
    }

    /* Close button */
    .enabled-tool-container .enabled-tool > button:last-child {
        background: none !important;
        border: none !important;
        color: rgba(255, 255, 255, 0.5) !important;
        padding: 0 !important;
        width: 24px !important;
        height: 24px !important;
        border-radius: 50% !important;
        cursor: pointer !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        transition: color 0.15s ease, background 0.15s ease !important;
    }
    .enabled-tool-container .enabled-tool > button:last-child:hover {
        color: rgba(255, 255, 255, 0.9) !important;
        background: rgba(255, 255, 255, 0.1) !important;
    }
    .enabled-tool-container .enabled-tool > button:last-child .material-symbols-outlined {
        font-size: 16px !important;
    }

    /* Hide native tooltips when hovering over the tools bar to prevent confusing popups */
    body:has(.enabled-tool-container:hover) .cdk-overlay-container .mat-mdc-tooltip {
        display: none !important;
        opacity: 0 !important;
    }
  `;

  // ══════════════════════════════════════════════════════════════════
  //  NATIVE DOM REARRANGEMENT
  // ══════════════════════════════════════════════════════════════════

  function modifyPlusMenu() {
    const contents = document.querySelectorAll('.mat-mdc-menu-content:not([data-sl-injected])');
    if (contents.length > 0) {
        console.log('[ModernWebChat] Found ' + contents.length + ' uninjected menu contents');
    }
    
    contents.forEach(content => {
        // Find the native Drive button to verify this is the + menu
        const driveBtn = content.querySelector('.drive-file-menu-item');
        if (!driveBtn) return; // Silent return for other menus

        console.log('[ModernWebChat] Target + menu container detected. Injecting...');
        content.dataset.slInjected = 'true';
        
        // Find all items in this specific menu
        const allItems = Array.from(content.querySelectorAll('button[mat-menu-item], button.mat-mdc-menu-item, button[role="menuitem"]'));
        console.log('[ModernWebChat] Found ' + allItems.length + ' core items inside the menu');

        const itemsToMove = [];
        let insertAfterNode = driveBtn; // We will insert our stuff after the core items

        allItems.forEach(item => {
            if (item.classList.contains('camera-menu-item') || 
                item.classList.contains('youtube-video-menu-item') || 
                item.classList.contains('sample-media-picker-menu-item')) {
                itemsToMove.push(item);
                console.log('[ModernWebChat] Queued for submenu: ' + item.className);
            } else {
                insertAfterNode = item; // Keep updating to the last kept item
            }
        });

        console.log('[ModernWebChat] Total items to move to submenu: ' + itemsToMove.length);

        if (itemsToMove.length > 0) {
            const otherWrapper = document.createElement('div');
            otherWrapper.className = 'sl-hover-wrapper';

            const otherBtn = document.createElement('button');
            otherBtn.className = 'mat-mdc-menu-item mat-mdc-focus-indicator';
            otherBtn.innerHTML = `
                <span class="mat-mdc-menu-item-text" style="display:flex; align-items:center; width:100%;">
                    <span class="start-icon material-symbols-outlined notranslate">more_horiz</span>
                    <span style="flex:1;">Other uploads</span>
                    <span class="material-symbols-outlined" style="font-size:18px; opacity:0.7;">chevron_right</span>
                </span>
            `;
            
            const submenu = document.createElement('div');
            submenu.className = 'sl-custom-submenu';
            submenu.style.minWidth = '200px';
            submenu.style.background = 'var(--mdc-menu-container-color, #282a2c)';
            submenu.style.borderRadius = '8px';
            submenu.style.boxShadow = '0px 5px 5px -3px rgba(0,0,0,0.2), 0px 8px 10px 1px rgba(0,0,0,0.14), 0px 3px 14px 2px rgba(0,0,0,0.12)';
            submenu.style.flexDirection = 'column';
            submenu.style.zIndex = '1000';

            const submenuContent = document.createElement('div');
            submenuContent.className = 'mat-mdc-menu-content';
            submenu.appendChild(submenuContent);

            // Move the secondary items into the submenu
            itemsToMove.forEach(item => {
                submenuContent.appendChild(item);
                item.style.display = 'flex'; 
            });

            otherWrapper.appendChild(otherBtn);
            otherWrapper.appendChild(submenu);

            // Insert 'Other uploads' right after the last primary item (e.g. Record Audio)
            content.insertBefore(otherWrapper, insertAfterNode.nextSibling);

            otherBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation(); // Keep main menu open
            };
            console.log('[ModernWebChat] Submenu created and injected successfully.');
        } else {
            console.log('[ModernWebChat] WARNING: No items found to move to submenu.');
        }

        // Add Divider
        const divider = document.createElement('mat-divider');
        divider.setAttribute('role', 'separator');
        divider.style.borderTopColor = 'var(--mat-divider-color, rgba(255,255,255,0.12))';
        divider.style.borderTopWidth = '1px';
        divider.style.borderTopStyle = 'solid';
        divider.style.display = 'block';
        divider.style.margin = '4px 0';
        content.appendChild(divider);
        console.log('[ModernWebChat] Divider added.');

        // Add Tools
        const nativeTools = document.querySelector('ms-prompt-box-tools button') || document.querySelector('.prompt-box-tools button');
        if (nativeTools) {
            console.log('[ModernWebChat] Found native Tools button, adding proxy to menu.');
            const toolsBtn = document.createElement('button');
            toolsBtn.className = 'mat-mdc-menu-item mat-mdc-focus-indicator';
            toolsBtn.innerHTML = `
                <span class="mat-mdc-menu-item-text">
                    <span class="start-icon material-symbols-outlined notranslate">widgets</span>
                    <span>Tools</span>
                </span>
            `;
            toolsBtn.onclick = () => { nativeTools.click(); };
            content.appendChild(toolsBtn);
        } else {
            console.log('[ModernWebChat] Native Tools button NOT FOUND in DOM.');
        }

        // Add Paid API
        const nativeKey = document.querySelector('ms-paid-api-key-button button') || document.querySelector('.paid-api-key-button');
        if (nativeKey) {
            console.log('[ModernWebChat] Found native Paid API Key button, adding proxy to menu.');
            const keyBtn = document.createElement('button');
            keyBtn.className = 'mat-mdc-menu-item mat-mdc-focus-indicator';
            keyBtn.innerHTML = `
                <span class="mat-mdc-menu-item-text">
                    <span class="start-icon material-symbols-outlined notranslate">key</span>
                    <span>Link a paid API</span>
                </span>
            `;
            keyBtn.onclick = () => {
                nativeKey.click();
            };
            content.appendChild(keyBtn);
        } else {
            console.log('[ModernWebChat] Native Paid API Key button NOT FOUND in DOM.');
        }
    });
  }

  // ══════════════════════════════════════════════════════════════════
  //  AUTO-DELETE THOUGHTS (only after model response has actual content)
  // ══════════════════════════════════════════════════════════════════

  function autoDeleteThoughts() {
    const chunks = document.querySelectorAll('ms-thought-chunk');
    chunks.forEach(chunk => {
      if (chunk.dataset.slDeleted === 'true') return;
      // Find the parent turn
      const turn = chunk.closest('ms-chat-turn');
      if (!turn) return;
      // Only delete if there's visible content AFTER the thought (text-chunk or image-chunk)
      const turnContent = turn.querySelector('.turn-content');
      if (!turnContent) return;
      const hasVisibleContent = turnContent.querySelector('ms-text-chunk, ms-image-chunk');
      if (!hasVisibleContent) return; // Response hasn't started yet, keep thoughts visible
      chunk.dataset.slDeleted = 'true';
      chunk.classList.add('sl-delete-target');
      window.dispatchEvent(new CustomEvent('__sl_deleteThought'));
    });
  }

  // ══════════════════════════════════════════════════════════════════
  //  FULL-SCREEN VIEWER INJECTION
  // ══════════════════════════════════════════════════════════════════

  function injectViewerElements() {
    const dialog = document.querySelector('ms-view-media-dialog');
    if (!dialog) return;

    // Backdrop tinting
    const pane = dialog.closest('.cdk-overlay-pane');
    if (pane && pane.previousElementSibling && pane.previousElementSibling.classList.contains('cdk-overlay-backdrop')) {
      pane.previousElementSibling.classList.add('sl-backdrop-tint');
    }

    // Click-to-close on empty space
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

  function ensureStyleDominance() {
    if (styleEl && styleEl.parentNode && styleEl.parentNode.lastChild !== styleEl) {
      styleEl.parentNode.appendChild(styleEl);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  //  DOM UPDATE CYCLE
  // ══════════════════════════════════════════════════════════════════

  function relocateToolsBar() {
    const buttonsRow = document.querySelector('ms-prompt-box .buttons-row');
    if (!buttonsRow) return;

    const toolsBar = document.querySelector('ms-horizontal-scroll.enabled-tool-container');
    if (!toolsBar) return;

    // Already relocated?
    if (toolsBar.parentElement === buttonsRow) return;

    console.log('[ModernWebChat] Relocating enabled-tools bar into buttons-row.');
    buttonsRow.appendChild(toolsBar);
  }

  function performDOMUpdates() {
    if (!ctxRef || !ctxRef.state.modernWebChatEnabled) return;
    relocateToolsBar();
    modifyPlusMenu();
    autoDeleteThoughts();
    injectViewerElements();
    ensureStyleDominance();
  }

  function cleanup() {
    const otherBtn = document.querySelector('.sl-other-uploads');
    if (otherBtn) otherBtn.remove();
    const divider = document.querySelector('.sl-divider');
    if (divider) divider.remove();
  }

  // ══════════════════════════════════════════════════════════════════
  //  MODULE REGISTRATION
  // ══════════════════════════════════════════════════════════════════

  window.StudioLab.registerModule({
    id: 'modern-web-chat',
    group: 'modules',
    order: 40,
    title: 'Modern Web Chat',
    subtitle: 'Gemini-style input bar & media gallery',
    badge: { text: 'New', className: 'new' },
    icon: 'forum',
    stateKey: 'modernWebChatEnabled',
    defaults: { modernWebChatEnabled: false },
    init(ctx) {
      ctxRef = ctx;
      this.updateStyles();
      this.setupObservers();
    },
    onStateChange() { this.updateStyles(); },
    setupObservers() {
      if (mainObserver) mainObserver.disconnect();
      mainObserver = new MutationObserver(() => {
        if (updateScheduled) return;
        updateScheduled = true;
        requestAnimationFrame(() => {
          updateScheduled = false;
          if (!ctxRef || !ctxRef.state.modernWebChatEnabled) return;
          if (mainObserver) mainObserver.disconnect();
          try { performDOMUpdates(); } catch (e) { }
          if (mainObserver && ctxRef.state.modernWebChatEnabled) {
            mainObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
          }
        });
      });
      mainObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
    },
    updateStyles() {
      const on = !!(ctxRef && ctxRef.state.modernWebChatEnabled);
      if (on) {
        if (!styleEl) {
          styleEl = document.createElement('style');
          styleEl.id = 'sl-modern-web-chat-styles';
          styleEl.textContent = CSS;
          document.head.appendChild(styleEl);
        }
        modifyPlusMenu();
        autoDeleteThoughts();
      } else {
        if (styleEl) { styleEl.remove(); styleEl = null; }
        cleanup();
      }
    }
  });
})();
