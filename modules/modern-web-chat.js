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
  let overlayObserver = null;
  let updateScheduled = false;

  function isEnabled() {
    if (!ctxRef) {
      try {
        const raw = localStorage.getItem('sl_state');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (typeof parsed.modernWebChatEnabled !== 'undefined') return !!parsed.modernWebChatEnabled;
        }
      } catch (e) {}
      return false;
    }
    if (ctxRef.state && typeof ctxRef.state.modernWebChatEnabled !== 'undefined') {
      return !!ctxRef.state.modernWebChatEnabled;
    }
    if (ctxRef.config) {
      return !!(ctxRef.config['modern-web-chat'] || ctxRef.config.modernWebChatEnabled);
    }
    return false;
  }

  // ══════════════════════════════════════════════════════════════════
  //  CSS (Native Restyling & Menu Hacks)
  // ══════════════════════════════════════════════════════════════════
  // CSS is cleanly isolated in modules/modern-web-chat.css and loaded via updateStyles()
  // ══════════════════════════════════════════════════════════════════
  //  NATIVE DOM REARRANGEMENT
  // ══════════════════════════════════════════════════════════════════

  function isToolActive(toolName) {
    const q = toolName.toLowerCase();
    const chips = Array.from(document.querySelectorAll('.enabled-tool-container .enabled-tool, ms-horizontal-scroll .enabled-tool'));
    if (chips.some(c => (c.textContent || '').toLowerCase().includes(q))) return true;

    // Check active switch in run settings or dialog
    const swList = Array.from(document.querySelectorAll('ms-run-settings mat-slide-toggle, ms-run-settings button[role="switch"], .mdc-switch'));
    for (const sw of swList) {
      const aria = (sw.getAttribute('aria-label') || sw.querySelector('button')?.getAttribute('aria-label') || '').toLowerCase();
      if (aria.includes(q)) {
        return sw.getAttribute('aria-checked') === 'true' ||
          sw.querySelector('button')?.getAttribute('aria-checked') === 'true' ||
          sw.classList.contains('mdc-switch--checked') ||
          sw.classList.contains('mdc-switch--selected');
      }
    }
    return false;
  }

  function ensureRunSettingsMounted() {
    let rs = document.querySelector('ms-run-settings');
    if (!rs) {
      const openBtn = document.querySelector('button.runsettings-toggle-button, button[aria-label="Toggle run settings panel"]');
      if (openBtn) openBtn.click();
    }
    const toolsGroup = Array.from(document.querySelectorAll('ms-prompt-run-settings .field-group, ms-run-settings .field-group')).find(g => g.textContent.includes('Tools'));
    if (toolsGroup) {
      const expandBtn = toolsGroup.querySelector('button[aria-label*="xpand" i], button.expand-icon, .group-header');
      const hasSwitches = toolsGroup.querySelector('mat-slide-toggle, button[role="switch"]');
      if (!hasSwitches && expandBtn) {
        expandBtn.click();
      }
    }
  }

  function toggleNativeTool(toolName) {
    const q = toolName.toLowerCase();
    // 1. If chip exists in enabled tools row, clicking remove chip toggles it off
    const chips = Array.from(document.querySelectorAll('.enabled-tool-container .enabled-tool, ms-horizontal-scroll .enabled-tool'));
    const matchedChip = chips.find(c => (c.textContent || '').toLowerCase().includes(q));
    if (matchedChip) {
      const removeBtn = matchedChip.querySelector('button:last-child, button[aria-label*="Remove" i], button:has(.close)');
      if (removeBtn) {
        removeBtn.click();
        return;
      }
    }

    ensureRunSettingsMounted();

    // 2. Direct toggle via ms-run-settings (100% silent, zero popups or overlay dialogs)
    const runSwitches = Array.from(document.querySelectorAll('ms-run-settings mat-slide-toggle, ms-prompt-run-settings mat-slide-toggle'));
    const target = runSwitches.find(s => {
      const aria = (s.getAttribute('aria-label') || s.querySelector('button')?.getAttribute('aria-label') || s.parentElement?.textContent || '').toLowerCase();
      return aria.includes(q) || (q.includes('url') && aria.includes('url')) || (q.includes('search') && aria.includes('search')) || (q.includes('maps') && aria.includes('maps')) || (q.includes('code') && aria.includes('code')) || (q.includes('function') && aria.includes('function')) || (q.includes('structured') && aria.includes('structured'));
    });
    if (target) {
      const btn = target.querySelector('.mat-mdc-slide-toggle-touch-target') || target.querySelector('button') || target;
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(t => {
        btn.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
      });
      return;
    }
  }

  function modifyPlusMenu() {
    const contents = document.querySelectorAll('.mat-mdc-menu-content:not([data-sl-injected])');
    if (contents.length > 0) {
      if (window.StudioLab && window.StudioLab.log) window.StudioLab.log('Found ' + contents.length + ' uninjected menu contents', 'info');
    }

    contents.forEach(content => {
      // Find the native Drive button to verify this is the + menu
      const driveBtn = content.querySelector('.drive-file-menu-item');
      if (!driveBtn) return; // Silent return for other menus

      if (window.StudioLab && window.StudioLab.log) window.StudioLab.log('Target + menu container detected. Injecting...', 'info');
      content.dataset.slInjected = 'true';
      const panel = content.closest('.mat-mdc-menu-panel');
      if (panel) panel.setAttribute('data-sl-injected', 'true');

      // Find all items in this specific menu
      const allItems = Array.from(content.querySelectorAll('button[mat-menu-item], button.mat-mdc-menu-item, button[role="menuitem"]'));
      if (window.StudioLab && window.StudioLab.log) window.StudioLab.log('Found ' + allItems.length + ' core items inside the menu', 'info');

      const itemsToMove = [];
      let insertAfterNode = driveBtn; // We will insert our stuff after the core items

      allItems.forEach(item => {
        if (item.classList.contains('camera-menu-item') ||
          item.classList.contains('youtube-video-menu-item') ||
          item.classList.contains('sample-media-picker-menu-item')) {
          itemsToMove.push(item);
          if (window.StudioLab && window.StudioLab.log) window.StudioLab.log('Queued for submenu: ' + item.className, 'info');
        } else {
          insertAfterNode = item; // Keep updating to the last kept item
        }
      });

      if (window.StudioLab && window.StudioLab.log) window.StudioLab.log('Total items to move to submenu: ' + itemsToMove.length, 'info');

      if (itemsToMove.length > 0) {
        const otherWrapper = document.createElement('div');
        otherWrapper.className = 'sl-hover-wrapper';

        const otherBtn = document.createElement('button');
        otherBtn.className = 'mat-mdc-menu-item mat-mdc-focus-indicator';
        const otherWrap = document.createElement('span');
        otherWrap.className = 'mat-mdc-menu-item-text';
        otherWrap.style.cssText = 'display:flex; align-items:center; width:100%;';

        const otherIcon = document.createElement('span');
        otherIcon.className = 'start-icon material-symbols-outlined notranslate';
        otherIcon.textContent = 'more_horiz';

        const otherLabel = document.createElement('span');
        otherLabel.style.flex = '1';
        otherLabel.textContent = 'Other uploads';

        const otherChevron = document.createElement('span');
        otherChevron.className = 'material-symbols-outlined';
        otherChevron.style.cssText = 'font-size:18px; opacity:0.7;';
        otherChevron.textContent = 'chevron_right';

        otherWrap.appendChild(otherIcon);
        otherWrap.appendChild(otherLabel);
        otherWrap.appendChild(otherChevron);
        otherBtn.appendChild(otherWrap);

        const submenu = document.createElement('div');
        submenu.className = 'sl-custom-submenu';

        const submenuContent = document.createElement('div');
        submenuContent.className = 'sl-custom-submenu-content';
        submenuContent.dataset.slInjected = 'true';
        submenu.appendChild(submenuContent);

        // Move the secondary items into the submenu
        itemsToMove.forEach(item => {
          item.style.display = 'flex';
          submenuContent.appendChild(item);
        });

        otherWrapper.appendChild(otherBtn);
        otherWrapper.appendChild(submenu);

        // Insert 'Other uploads' right after the last primary item (e.g. Record Audio)
        if (insertAfterNode && insertAfterNode.parentNode) {
          insertAfterNode.after(otherWrapper);
        } else {
          content.appendChild(otherWrapper);
        }

        otherBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation(); // Keep main menu open
        };
        if (window.StudioLab && window.StudioLab.log) window.StudioLab.log('Submenu created and injected successfully.', 'success');
      } else {
        if (window.StudioLab && window.StudioLab.log) window.StudioLab.log('No items found to move to submenu.', 'warn');
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
      if (window.StudioLab && window.StudioLab.log) window.StudioLab.log('Divider added.', 'info');

      // Add Tools as hover flyout submenu
      const nativeTools = document.querySelector('ms-prompt-box-tools button') || document.querySelector('.prompt-box-tools button');
      if (nativeTools) {
        if (window.StudioLab && window.StudioLab.log) window.StudioLab.log('Found native Tools button, adding flyout submenu to menu.', 'info');
        const toolsWrapper = document.createElement('div');
        toolsWrapper.className = 'sl-hover-wrapper sl-tools-hover-wrapper';

        const toolsBtn = document.createElement('button');
        toolsBtn.className = 'mat-mdc-menu-item mat-mdc-focus-indicator';
        const toolsWrap = document.createElement('span');
        toolsWrap.className = 'mat-mdc-menu-item-text';
        toolsWrap.style.cssText = 'display:flex; align-items:center; width:100%;';

        const toolsIcon = document.createElement('span');
        toolsIcon.className = 'start-icon material-symbols-outlined notranslate';
        toolsIcon.textContent = 'widgets';

        const toolsLabel = document.createElement('span');
        toolsLabel.style.flex = '1';
        toolsLabel.textContent = 'Tools';

        const toolsChevron = document.createElement('span');
        toolsChevron.className = 'material-symbols-outlined';
        toolsChevron.style.cssText = 'font-size:18px; opacity:0.7;';
        toolsChevron.textContent = 'chevron_right';

        toolsWrap.appendChild(toolsIcon);
        toolsWrap.appendChild(toolsLabel);
        toolsWrap.appendChild(toolsChevron);
        toolsBtn.appendChild(toolsWrap);

        const toolsSubmenu = document.createElement('div');
        toolsSubmenu.className = 'sl-custom-submenu sl-tools-submenu';

        const TOOLS_LIST = [
          { name: 'Grounding with Google Search', id: 'grounding with google search', icon: 'travel_explore' },
          { name: 'Code execution', id: 'code execution', icon: 'terminal' },
          { name: 'Structured outputs', id: 'structured outputs', icon: 'data_object' },
          { name: 'Function calling', id: 'function calling', icon: 'function' },
          { name: 'Grounding with Google Maps', id: 'grounding with google maps', icon: 'map' },
          { name: 'URL context', id: 'url context', icon: 'link' }
        ];

        TOOLS_LIST.forEach(tool => {
          const tItem = document.createElement('button');
          tItem.className = 'mat-mdc-menu-item mat-mdc-focus-indicator sl-tools-menu-item';
          const tWrap = document.createElement('span');
          tWrap.className = 'mat-mdc-menu-item-text';
          tWrap.style.cssText = 'display:flex; align-items:center; width:100%; justify-content:space-between;';

          const tLeft = document.createElement('div');
          tLeft.style.cssText = 'display:flex; align-items:center; gap:8px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';

          const tIcon = document.createElement('span');
          tIcon.className = 'material-symbols-outlined notranslate';
          tIcon.style.fontSize = '18px';
          tIcon.textContent = tool.icon;

          const tLabel = document.createElement('span');
          tLabel.textContent = tool.name;
          tLabel.style.cssText = 'overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';

          tLeft.appendChild(tIcon);
          tLeft.appendChild(tLabel);

          const tActive = isToolActive(tool.id);
          const tCheck = document.createElement('span');
          tCheck.className = 'material-symbols-outlined notranslate';
          tCheck.style.fontSize = '18px';
          tCheck.style.color = '#8ab4f8';
          tCheck.style.opacity = tActive ? '1' : '0';
          tCheck.textContent = 'check';

          tWrap.appendChild(tLeft);
          tWrap.appendChild(tCheck);
          tItem.appendChild(tWrap);

          tItem.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleNativeTool(tool.id);
            setTimeout(() => {
              const backdrop = document.querySelector('.cdk-overlay-backdrop-showing');
              if (backdrop) backdrop.click();
            }, 120);
          };

          toolsSubmenu.appendChild(tItem);
        });

        toolsWrapper.appendChild(toolsBtn);
        toolsWrapper.appendChild(toolsSubmenu);
        content.appendChild(toolsWrapper);

        toolsBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
        };
      } else {
        if (window.StudioLab && window.StudioLab.log) window.StudioLab.log('Native Tools button NOT FOUND in DOM.', 'warn');
      }

      // Add Paid API
      const nativeKey = document.querySelector('ms-paid-api-key-button button') || document.querySelector('.paid-api-key-button');
      if (nativeKey) {
        if (window.StudioLab && window.StudioLab.log) window.StudioLab.log('Found native Paid API Key button, adding proxy to menu.', 'info');
        const keyBtn = document.createElement('button');
        keyBtn.className = 'mat-mdc-menu-item mat-mdc-focus-indicator';
        const keyWrap = document.createElement('span');
        keyWrap.className = 'mat-mdc-menu-item-text';
        const keyIcon = document.createElement('span');
        keyIcon.className = 'start-icon material-symbols-outlined notranslate';
        keyIcon.textContent = 'key';
        const keyLabel = document.createElement('span');
        keyLabel.textContent = 'Link a paid API';
        keyWrap.appendChild(keyIcon);
        keyWrap.appendChild(keyLabel);
        keyBtn.appendChild(keyWrap);
        keyBtn.onclick = () => {
          nativeKey.click();
        };
        content.appendChild(keyBtn);
      } else {
        if (window.StudioLab && window.StudioLab.log) window.StudioLab.log('Native Paid API Key button NOT FOUND in DOM.', 'warn');
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════
  //  TOOLBAR OVERFLOW MENU PROXYING (ChatGPT-style header)
  // ══════════════════════════════════════════════════════════════════

  function dispatchPointerClick(el) {
    if (!el) return;
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
      try {
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      } catch (e) {
        try { el.click(); } catch (e2) {}
      }
    });
  }

  function modifyHeaderMenu() {
    // When clicking the three-dots button in the header toolbar, Angular creates
    // a menu panel with class .toolbar-overflow-menu
    const menuContent = document.querySelector('.toolbar-overflow-menu .mat-mdc-menu-content:not([data-sl-header-injected])');
    if (!menuContent) return;

    menuContent.dataset.slHeaderInjected = 'true';

    // Determine if the current session is an empty/new chat
    const hasTurns = !!document.querySelector('ms-chat-turn');
    const promptValue = document.querySelector('ms-prompt-box textarea')?.value?.trim();
    const isEmptyChat = !hasTurns && !promptValue;

    if (isEmptyChat) {
      // In an empty chat, hide redundant and disabled actions:
      // "No changes to save", "Make a copy", "Delete"
      const items = menuContent.querySelectorAll('button.mat-mdc-menu-item');
      items.forEach(item => {
        const txt = item.textContent.trim().toLowerCase();
        if (
          txt.includes('save') ||
          txt.includes('copy') ||
          txt.includes('delete') ||
          item.classList.contains('mat-mdc-menu-item-disabled') ||
          item.getAttribute('aria-disabled') === 'true'
        ) {
          item.style.display = 'none';
        }
      });
      // In empty chat, only Temporary chat (and active toggles like Raw Mode) make sense.
      // Do NOT inject "Edit title", "Share prompt", "Compare mode", "Make this an app".
      return;
    }

    // Divider separating native items from injected actions
    const divider = document.createElement('div');
    divider.className = 'mat-divider sl-header-menu-divider';
    divider.setAttribute('role', 'separator');
    divider.style.borderTop = '1px solid var(--mat-divider-color, rgba(255, 255, 255, 0.12))';
    divider.style.margin = '4px 0';
    menuContent.appendChild(divider);

    // Proxy actions in requested order:
    // 1. Edit title (above Share prompt)
    // 2. Share prompt
    // 3. Compare mode
    // 4. Make this an app (at the very bottom)
    const proxyItems = [
      {
        icon: 'edit',
        label: 'Edit title',
        targetSelector: '.toolbar-left button[aria-label*="Edit"], .toolbar-left button[mattooltip*="Edit"]',
      },
      {
        icon: 'share',
        label: 'Share prompt',
        targetSelector: 'ms-share-prompt button, button[aria-label="Share prompt"]',
      },
      {
        icon: 'compare_arrows',
        label: 'Compare mode',
        targetSelector: 'button.compare-button, button[aria-label*="Compare"]',
      },
      {
        icon: 'design_services',
        label: 'Make this an app',
        targetSelector: 'button[aria-label="Make this an app"]',
      }
    ];

    proxyItems.forEach(item => {
      const btn = document.createElement('button');
      btn.setAttribute('mat-menu-item', '');
      btn.className = 'mat-mdc-menu-item mat-focus-indicator sl-injected-header-item';
      btn.setAttribute('role', 'menuitem');
      btn.style.cssText = 'height: 32px; min-height: 32px; padding: 6px 8px; font-size: 14px;';

      const textSpan = document.createElement('span');
      textSpan.className = 'mat-mdc-menu-item-text';
      textSpan.style.cssText = 'display: flex; align-items: center; font-size: 14px;';

      const iconSpan = document.createElement('span');
      iconSpan.className = 'material-symbols-outlined notranslate';
      iconSpan.textContent = item.icon;
      iconSpan.style.cssText = 'font-size: 18px; width: 18px; height: 18px; margin-right: 8px; display: inline-flex; align-items: center; justify-content: center;';

      const labelSpan = document.createElement('span');
      labelSpan.textContent = item.label;

      textSpan.appendChild(iconSpan);
      textSpan.appendChild(labelSpan);
      btn.appendChild(textSpan);

      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Close menu backdrop
        const backdrop = document.querySelector('.cdk-overlay-backdrop');
        if (backdrop) backdrop.click();

        // Trigger native button click
        const target = document.querySelector(item.targetSelector);
        if (target) {
          dispatchPointerClick(target);
        }
      };

      menuContent.appendChild(btn);
    });
  }

  // ══════════════════════════════════════════════════════════════════
  //  HEADER CONTROLS RESTRUCTURING (ChatGPT / Gemini style)
  // ══════════════════════════════════════════════════════════════════

  let cachedModelName = '';
  let cachedModelId = '';

  const DEFAULT_FEATURED_MODELS = [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' }
  ];

  function getFeaturedModels() {
    try {
      const cached = localStorage.getItem('sl_featured_models');
      if (cached) {
        const list = JSON.parse(cached);
        if (Array.isArray(list) && list.length > 0) {
          return list.slice(0, 3);
        }
      }
    } catch (e) {}
    return DEFAULT_FEATURED_MODELS;
  }

  function getAvailableThinkingLevels() {
    const model = getModelDisplayName().toLowerCase();
    if (model.includes('3.5')) {
      return ['Minimal', 'Low', 'Medium', 'High'];
    }
    return ['Low', 'Medium', 'High'];
  }

  let cachedThinkingLevel = 'Low';

  function formatModelSlug(slug) {
    if (!slug) return 'Gemini 2.5 Flash';
    return slug
      .replace(/^models\//, '')
      .replace(/^gemini-/i, 'Gemini ')
      .replace(/-/g, ' ')
      .replace(/\bflash\b/i, 'Flash')
      .replace(/\bpro\b/i, 'Pro')
      .replace(/\bultra\b/i, 'Ultra')
      .replace(/\bthinking\b/i, 'Thinking')
      .replace(/\blite\b/i, 'Lite')
      .replace(/\bpreview\b/i, 'Preview')
      .replace(/\bexp\b/i, 'Exp')
      .trim();
  }

  function getModelDisplayName() {
    if (cachedModelName) {
      return cachedModelName;
    }
    try {
      if (typeof window.DynamicStudioAPI !== 'undefined' && typeof window.DynamicStudioAPI.getModel === 'function') {
        const m = window.DynamicStudioAPI.getModel();
        if (m) {
          cachedModelId = m;
          cachedModelName = formatModelSlug(m);
          return cachedModelName;
        }
      }
    } catch (_) {}

    const titleEl = document.querySelector('ms-run-settings ms-model-selector .title, ms-run-settings ms-model-selector .model-title, ms-run-settings .model-card .title, ms-model-selector .title, ms-model-selector h3');
    if (titleEl && titleEl.textContent.trim()) {
      cachedModelName = titleEl.textContent.trim();
      return cachedModelName;
    }
    const nativeModelTag = document.querySelector('ms-model-selector span[data-test-id="model-name"], ms-model-selector .model-name, ms-model-selector .subtitle');
    if (nativeModelTag && nativeModelTag.textContent.trim()) {
      cachedModelName = formatModelSlug(nativeModelTag.textContent.trim());
      return cachedModelName;
    }
    try {
      const urlParam = new URLSearchParams(window.location.search).get('model');
      if (urlParam) {
        cachedModelId = urlParam;
        cachedModelName = formatModelSlug(urlParam);
        return cachedModelName;
      }
    } catch (_) {}

    try {
      const saved = localStorage.getItem('sl_last_selected_model');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.name) {
          cachedModelName = parsed.name;
          cachedModelId = parsed.id || '';
          return cachedModelName;
        }
      }
    } catch (_) {}

    return 'Gemini 2.5 Flash';
  }

  function getSelectedThinkingLevel() {
    const select = document.querySelector('mat-select[aria-label="Thinking Level"], ms-thinking-level-setting mat-select, ms-run-settings mat-select[aria-label*="hinking"], ms-run-settings .thinking-level mat-select');
    if (select) {
      const valText = select.querySelector('.mat-mdc-select-value-text, .mat-mdc-select-value, .mat-select-value-text');
      if (valText && valText.textContent.trim()) {
        const t = valText.textContent.trim();
        const levels = getAvailableThinkingLevels();
        for (const l of levels) {
          if (t.toLowerCase().includes(l.toLowerCase())) {
            cachedThinkingLevel = l;
            return l;
          }
        }
        return t;
      }
    }
    return cachedThinkingLevel;
  }

  function updateEmptyChatState() {
    const isNew = window.location.pathname.includes('/prompts/new_chat');
    const turns = document.querySelectorAll('ms-chat-turn');
    const isEmpty = isNew || turns.length === 0;
    if (isEmpty) {
      document.body.classList.add('sl-empty-chat');
    } else {
      document.body.classList.remove('sl-empty-chat');
    }
  }

  function closeCustomDropdowns() {
    document.querySelectorAll('.sl-custom-dropdown').forEach(d => d.remove());
  }

  async function ensureRunSettingsMounted() {
    let nativeTrigger = document.querySelector('ms-model-selector button.model-selector-card, ms-model-selector button');
    if (nativeTrigger) return nativeTrigger;

    const toggleBtn = document.querySelector('button.runsettings-toggle-button, button[aria-label="Run Settings"], button[aria-label*="run settings" i], button[aria-label="Toggle run settings panel"]');
    if (toggleBtn) {
      toggleBtn.click();
      const t0 = performance.now();
      while (performance.now() - t0 < 800) {
        nativeTrigger = document.querySelector('ms-model-selector button.model-selector-card, ms-model-selector button');
        if (nativeTrigger) return nativeTrigger;
        await new Promise(r => requestAnimationFrame(r));
      }
    }
    return document.querySelector('ms-model-selector button.model-selector-card, ms-model-selector button');
  }

  function toggleSettingsDrawer(forceOpen) {
    const hasPanel = !!document.querySelector('ms-run-settings');
    const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : !document.body.classList.contains('sl-settings-open');

    if (shouldOpen) {
      closeCustomDropdowns();
      document.body.classList.add('sl-settings-open');
      if (!hasPanel) {
        const openBtn = document.querySelector('button.runsettings-toggle-button, button[aria-label="Toggle run settings panel"], button[aria-label="Run Settings"]');
        if (openBtn) openBtn.click();
      }
    } else {
      document.body.classList.remove('sl-settings-open');
    }
  }

  // Global pointerdown & click listener with capture to reliably close settings drawer and custom dropdowns
  if (window._slGlobalDrawerHandler) {
    document.removeEventListener('pointerdown', window._slGlobalDrawerHandler, true);
    document.removeEventListener('click', window._slGlobalDrawerHandler, true);
  }
  window._slGlobalDrawerHandler = (e) => {
    // Close custom dropdowns if clicked outside
    if (!e.target.closest('.sl-custom-dropdown') && !e.target.closest('.sl-header-btn')) {
      closeCustomDropdowns();
    }

    // Handle close button click inside run settings drawer
    const closeBtn = e.target.closest('button[aria-label="Close run settings panel"], button[aria-label="close" i], .close-button');
    if (closeBtn) {
      e.preventDefault();
      e.stopPropagation();
      toggleSettingsDrawer(false);
      return;
    }

    // Close settings drawer if open and clicked outside ms-right-side-panel and not on settings button
    if (document.body.classList.contains('sl-settings-open')) {
      const panel = e.target.closest('ms-right-side-panel, ms-run-settings, .drawer-container:has(ms-run-settings)');
      const btn = e.target.closest('.sl-header-settings-btn, button.runsettings-toggle-button, button[aria-label="Toggle run settings panel"]');
      const overlay = e.target.closest('.cdk-overlay-container, .sl-custom-dropdown, mat-dialog-container');
      if (!panel && !btn && !overlay) {
        toggleSettingsDrawer(false);
      }
    }
  };
  document.addEventListener('pointerdown', window._slGlobalDrawerHandler, true);
  document.addEventListener('click', window._slGlobalDrawerHandler, true);

  function syncFeaturedModelsFromDialog(dialog) {
    if (!dialog) return;
    try {
      const cards = Array.from(dialog.querySelectorAll('button.content-button'));
      const found = [];
      cards.forEach(c => {
        const txt = c.textContent || '';
        const m = txt.match(/gemini-[\w\.\-]+/i);
        const titleMatch = txt.match(/(?:spark\s+)?(Gemini\s+[\d\.]+\s+[\w\s]+?)(?:New|Paid|gemini|info|$)/i);
        if (m && found.length < 3) {
          const id = m[0];
          let name = titleMatch ? titleMatch[1].trim() : formatModelSlug(id);
          name = name.replace(/^spark\s+/i, '').trim();
          if (!found.some(f => f.id === id)) {
            found.push({ id, name });
          }
        }
      });
      if (found.length >= 3) {
        localStorage.setItem('sl_featured_models', JSON.stringify(found));
      }
    } catch (e) {}
  }

  async function selectNativeModel(modelId, modelName) {
    cachedModelName = modelName;
    cachedModelId = modelId;
    try {
      localStorage.setItem('sl_last_selected_model', JSON.stringify({ id: modelId, name: modelName }));
    } catch (_) {}

    // 1. Immediately update UI button label without any DOM flicker or delay
    const lbl = document.querySelector('.sl-header-model-btn .model-label');
    if (lbl) lbl.textContent = modelName;

    // 2. Dispatch __sl_setModel to MAIN world interceptor to update Angular 19 Writable Signal & XHR/fetch override
    window.dispatchEvent(new CustomEvent('__sl_setModel', {
      detail: { modelId, model: modelId, modelName }
    }));
  }

  // Listen for model change notifications from interceptor or other components
  window.addEventListener('__sl_modelChanged', (e) => {
    if (e.detail) {
      if (e.detail.modelName) cachedModelName = e.detail.modelName;
      else if (e.detail.modelId) cachedModelName = formatModelSlug(e.detail.modelId);
      if (e.detail.modelId) cachedModelId = e.detail.modelId;
      const lbl = document.querySelector('.sl-header-model-btn .model-label');
      if (lbl && cachedModelName) {
        lbl.textContent = cachedModelName;
      }
    }
  });

  window.addEventListener('__sl_featuredModels', (e) => {
    if (e.detail && Array.isArray(e.detail) && e.detail.length > 0) {
      try {
        localStorage.setItem('sl_featured_models', JSON.stringify(e.detail));
      } catch (_) {}
    }
  });

  async function selectNativeThinkingLevel(level) {
    cachedThinkingLevel = level;
    const lbl = document.querySelector('.sl-header-thinking-btn .thinking-label');
    if (lbl) lbl.textContent = level;

    ensureRunSettingsMounted();
    document.body.classList.add('sl-switching-model');

    let select = document.querySelector('mat-select[aria-label="Thinking Level"], ms-thinking-level-setting mat-select, ms-run-settings mat-select[aria-label*="hinking"]');
    if (!select) {
      await new Promise(r => setTimeout(r, 60));
      select = document.querySelector('mat-select[aria-label="Thinking Level"], ms-thinking-level-setting mat-select, ms-run-settings mat-select[aria-label*="hinking"]');
    }

    if (select) {
      const trigger = select.querySelector('.mat-mdc-select-trigger') || select;
      trigger.click();
      let panel = null;
      const t0 = performance.now();
      while (!panel && performance.now() - t0 < 400) {
        panel = document.querySelector('.mat-mdc-select-panel');
        if (!panel) await new Promise(r => requestAnimationFrame(r));
      }

      if (panel) {
        const options = Array.from(panel.querySelectorAll('.mat-mdc-select-panel mat-option, mat-option'));
        const target = options.find(o => o.textContent.trim().toLowerCase() === level.toLowerCase());
        if (target) {
          target.click();
        } else {
          const backdrop = document.querySelector('.cdk-overlay-backdrop');
          if (backdrop) backdrop.click();
        }
      }
    }

    setTimeout(() => {
      document.body.classList.remove('sl-switching-model');
    }, 150);
  }

  function openModelDropdown(button) {
    const existing = document.querySelector('.sl-model-dropdown');
    if (existing) {
      existing.remove();
      return;
    }
    closeCustomDropdowns();

    const currentName = getModelDisplayName().toLowerCase();
    const dropdown = document.createElement('div');
    dropdown.className = 'sl-custom-dropdown sl-model-dropdown';

    const models = getFeaturedModels();
    models.forEach(m => {
      const item = document.createElement('div');
      item.className = 'sl-dropdown-item';
      const isSelected = currentName.includes(m.name.toLowerCase()) || currentName.includes(m.id.toLowerCase());
      if (isSelected) item.classList.add('active');

      const itemTitle = document.createElement('span');
      itemTitle.className = 'sl-dropdown-item-title';
      itemTitle.textContent = m.name;

      const check = document.createElement('span');
      check.className = 'material-symbols-outlined notranslate sl-dropdown-check';
      check.textContent = 'check';

      item.appendChild(itemTitle);
      item.appendChild(check);

      item.onclick = (e) => {
        e.stopPropagation();
        closeCustomDropdowns();
        const lbl = button.querySelector('.model-label');
        if (lbl) lbl.textContent = m.name;
        selectNativeModel(m.id, m.name);
      };

      dropdown.appendChild(item);
    });

    const divider = document.createElement('div');
    divider.className = 'sl-dropdown-divider';
    dropdown.appendChild(divider);

    const moreBtn = document.createElement('div');
    moreBtn.className = 'sl-dropdown-item sl-dropdown-more-btn';
    const moreLeft = document.createElement('div');
    moreLeft.style.display = 'flex';
    moreLeft.style.alignItems = 'center';
    moreLeft.style.gap = '8px';

    const moreIcon = document.createElement('span');
    moreIcon.className = 'material-symbols-outlined notranslate';
    moreIcon.style.fontSize = '18px';
    moreIcon.style.color = '#8ab4f8';
    moreIcon.textContent = 'apps';

    const moreText = document.createElement('span');
    moreText.textContent = 'More models...';

    moreLeft.appendChild(moreIcon);
    moreLeft.appendChild(moreText);
    moreBtn.appendChild(moreLeft);

    moreBtn.onclick = async (e) => {
      e.stopPropagation();
      closeCustomDropdowns();
      const nativeTrigger = await ensureRunSettingsMounted();
      if (nativeTrigger) {
        nativeTrigger.click();
      }
    };
    dropdown.appendChild(moreBtn);

    document.body.appendChild(dropdown);
    const rect = button.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom + 6}px`;
    dropdown.style.right = `${Math.max(12, window.innerWidth - rect.right)}px`;
  }

  function openThinkingDropdown(button) {
    const existing = document.querySelector('.sl-thinking-dropdown');
    if (existing) {
      existing.remove();
      return;
    }
    closeCustomDropdowns();

    const currentThinking = getSelectedThinkingLevel();
    const dropdown = document.createElement('div');
    dropdown.className = 'sl-custom-dropdown sl-thinking-dropdown';

    const levels = getAvailableThinkingLevels();
    levels.forEach(lvl => {
      const item = document.createElement('div');
      item.className = 'sl-dropdown-item';
      if (currentThinking.toLowerCase() === lvl.toLowerCase()) {
        item.classList.add('active');
      }

      const itemTitle = document.createElement('span');
      itemTitle.className = 'sl-dropdown-item-title';
      itemTitle.textContent = lvl;

      const check = document.createElement('span');
      check.className = 'material-symbols-outlined notranslate sl-dropdown-check';
      check.textContent = 'check';

      item.appendChild(itemTitle);
      item.appendChild(check);

      item.onclick = (e) => {
        e.stopPropagation();
        closeCustomDropdowns();
        const lbl = button.querySelector('.thinking-label');
        if (lbl) lbl.textContent = lvl;
        selectNativeThinkingLevel(lvl);
      };

      dropdown.appendChild(item);
    });

    document.body.appendChild(dropdown);
    const rect = button.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom + 6}px`;
    dropdown.style.right = `${Math.max(12, window.innerWidth - rect.right)}px`;
  }

  function reorganizeHeader() {
    const toolbarLeft = document.querySelector('.toolbar-left');
    const toolbarRight = document.querySelector('.toolbar-right');
    if (!toolbarLeft || !toolbarRight) return;

    // Update empty chat state (controls '+' visibility in toolbar-left)
    updateEmptyChatState();

    // 1. Move New Chat '+' button to .toolbar-left right after nav toggle
    const newChatBtn = document.querySelector('button[data-test-clear="outside"], button[aria-label="New chat"]');
    if (newChatBtn && newChatBtn.parentElement !== toolbarLeft) {
      if (toolbarLeft.firstElementChild) {
        toolbarLeft.firstElementChild.after(newChatBtn);
      } else {
        toolbarLeft.appendChild(newChatBtn);
      }
    }

    // 2. Move overflow menu '⋮' to .toolbar-left right after New chat
    const overflowMenuWrapper = document.querySelector('.overflow-menu-wrapper');
    if (overflowMenuWrapper && overflowMenuWrapper.parentElement !== toolbarLeft) {
      if (newChatBtn && newChatBtn.parentElement === toolbarLeft) {
        newChatBtn.after(overflowMenuWrapper);
      } else {
        toolbarLeft.appendChild(overflowMenuWrapper);
      }
    }

    // 3. Right Toolbar controls: [Model] [Thinking level] [Settings]
    // A. Model Button (Clean text with chevron, NO emojis/icons):
    let modelBtn = toolbarRight.querySelector('.sl-header-model-btn');
    if (!modelBtn) {
      modelBtn = document.createElement('button');
      modelBtn.type = 'button';
      modelBtn.className = 'sl-header-btn sl-header-model-btn';

      const label = document.createElement('span');
      label.className = 'sl-header-btn-label model-label';
      label.textContent = getModelDisplayName();

      const chevron = document.createElement('span');
      chevron.className = 'material-symbols-outlined notranslate chevron';
      chevron.textContent = 'expand_more';

      modelBtn.appendChild(label);
      modelBtn.appendChild(chevron);

      modelBtn.onclick = (e) => {
        e.stopPropagation();
        openModelDropdown(modelBtn);
      };
      toolbarRight.appendChild(modelBtn);
    } else {
      const label = modelBtn.querySelector('.model-label');
      if (label) {
        const currentTitle = getModelDisplayName();
        if (currentTitle && label.textContent !== currentTitle && !document.querySelector('.sl-model-dropdown')) {
          label.textContent = currentTitle;
        }
      }
    }

    // B. Thinking Level Button (Selected option with chevron, NO emojis/icons):
    let thinkingBtn = toolbarRight.querySelector('.sl-header-thinking-btn');
    const currentModelName = getModelDisplayName().toLowerCase();
    const modelSupportsThinking = currentModelName.includes('flash') || currentModelName.includes('pro') || currentModelName.includes('thinking') || currentModelName.includes('gemini-2') || currentModelName.includes('gemini-3');
    const hasThinkingSetting = modelSupportsThinking || !!document.querySelector('ms-thinking-level-setting, mat-select[aria-label="Thinking Level"]');
    if (!thinkingBtn) {
      thinkingBtn = document.createElement('button');
      thinkingBtn.type = 'button';
      thinkingBtn.className = 'sl-header-btn sl-header-thinking-btn';

      const label = document.createElement('span');
      label.className = 'sl-header-btn-label thinking-label';
      label.textContent = getSelectedThinkingLevel();

      const chevron = document.createElement('span');
      chevron.className = 'material-symbols-outlined notranslate chevron';
      chevron.textContent = 'expand_more';

      thinkingBtn.appendChild(label);
      thinkingBtn.appendChild(chevron);

      thinkingBtn.onclick = (e) => {
        e.stopPropagation();
        openThinkingDropdown(thinkingBtn);
      };
      toolbarRight.appendChild(thinkingBtn);
    } else {
      const label = thinkingBtn.querySelector('.thinking-label');
      if (label) {
        const currentThinking = getSelectedThinkingLevel();
        if (currentThinking && label.textContent !== currentThinking && !document.querySelector('.sl-thinking-dropdown')) {
          label.textContent = currentThinking;
        }
      }
    }
    if (thinkingBtn) {
      thinkingBtn.style.display = hasThinkingSetting ? 'inline-flex' : 'none';
    }

    // C. Settings Button (Run Settings trigger):
    let settingsBtn = toolbarRight.querySelector('.sl-header-settings-btn');
    if (!settingsBtn) {
      settingsBtn = document.createElement('button');
      settingsBtn.type = 'button';
      settingsBtn.className = 'sl-header-btn sl-header-settings-btn';
      settingsBtn.title = 'Run Settings';
      settingsBtn.setAttribute('aria-label', 'Run Settings');

      const icon = document.createElement('span');
      icon.className = 'material-symbols-outlined notranslate';
      icon.textContent = 'tune';

      settingsBtn.appendChild(icon);

      settingsBtn.onclick = (e) => {
        e.stopPropagation();
        toggleSettingsDrawer();
      };
      toolbarRight.appendChild(settingsBtn);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  //  SIDEBAR TOKENS PANEL (under Manage section)
  // ══════════════════════════════════════════════════════════════════

  let lastTokenCountText = '';
  let isExtractingTokens = false;
  let cachedTokenBreakdown = {
    usageStr: '',
    inputTokens: '—',
    outputTokens: '—',
    estCost: '—'
  };

  function renderTokensCard(card, data) {
    let displayUsage = data.usageStr || '0';
    let maxLabel = '';
    if (data.usageStr && data.usageStr.includes('/')) {
      const parts = data.usageStr.split('/');
      const currNum = parseInt(parts[0].replace(/,/g, '').trim());
      const maxNum = parseInt(parts[1].replace(/,/g, '').trim());
      const currFormatted = isNaN(currNum) ? parts[0].trim() : currNum.toLocaleString();
      if (!isNaN(maxNum)) {
        maxLabel = maxNum >= 1000000 ? ` / ${Math.round(maxNum / 1000000)}M` : ` / ${Math.round(maxNum / 1000)}k`;
      }
      displayUsage = currFormatted;
    }

    while (card.firstChild) card.removeChild(card.firstChild);

    const hero = document.createElement('div');
    hero.className = 'sl-tokens-hero';

    const usageLbl = document.createElement('span');
    usageLbl.className = 'sl-tokens-hero-label';
    usageLbl.textContent = 'Total tokens';

    const usageVal = document.createElement('span');
    usageVal.className = 'sl-tokens-hero-value';
    usageVal.textContent = displayUsage;

    if (maxLabel) {
      const maxSpan = document.createElement('span');
      maxSpan.style.cssText = 'font-size: 10px; font-weight: 400; color: #707070; margin-left: 4px;';
      maxSpan.textContent = maxLabel;
      usageVal.appendChild(maxSpan);
    }

    hero.appendChild(usageLbl);
    hero.appendChild(usageVal);
    card.appendChild(hero);

    const list = document.createElement('div');
    list.className = 'sl-tokens-list';

    const items = [
      { label: 'Input', val: data.inputTokens || '—' },
      { label: 'Output', val: data.outputTokens || '—' },
      { label: 'Est. cost', val: data.estCost || '—', highlight: true }
    ];

    items.forEach(it => {
      const row = document.createElement('div');
      row.className = 'sl-tokens-row';

      const l = document.createElement('span');
      l.textContent = it.label;

      const v = document.createElement('span');
      v.textContent = it.val;
      if (it.highlight) v.className = 'sl-highlight';

      row.appendChild(l);
      row.appendChild(v);
      list.appendChild(row);
    });

    card.appendChild(list);
  }

  function isChatPromptActive() {
    const path = window.location.pathname;
    const isNonChatPage = path === '/prompts' || path === '/prompts/' || path.startsWith('/library') || path.startsWith('/tune') || path.startsWith('/apikey') || path === '/' || path === '';
    if (isNonChatPage) return false;
    const isPromptPage = /^\/prompts\/[a-zA-Z0-9_\-]+/.test(path) || path.includes('/prompt/');
    const hasPromptUI = !!document.querySelector('ms-prompt-box, ms-chunk-editor, ms-prompt-renderer');
    return isPromptPage && hasPromptUI;
  }

  function shouldShowSidebarTokens() {
    if (!isChatPromptActive()) return false;
    const path = window.location.pathname;
    if (path.includes('/new_chat') || path === '/prompts/new_chat') return false;

    // Check if chat has any turns
    const turns = document.querySelectorAll('ms-chat-turn');
    if (turns.length === 0) return false;

    // Check if token count is 0 or empty
    const tokenSpan = document.querySelector('ms-token-count .v3-token-count-value');
    const currentText = tokenSpan ? tokenSpan.textContent?.trim().replace(/\s+/g, ' ') : '';
    if (!currentText || currentText === '0' || currentText === '0 tokens') return false;

    return true;
  }

  function updateSidebarTokens() {
    const mainNav = document.querySelector('ms-nav-items-main-v2');
    if (!mainNav) return;

    if (!shouldShowSidebarTokens()) {
      const header = document.querySelector('.sl-token-section-header');
      if (header) header.remove();
      const card = document.querySelector('.sl-tokens-card');
      if (card) card.remove();
      lastTokenCountText = '';
      return;
    }

    const tokenSpan = document.querySelector('ms-token-count .v3-token-count-value');
    const currentText = tokenSpan ? tokenSpan.textContent?.trim().replace(/\s+/g, ' ') : '';

    let header = document.querySelector('.sl-token-section-header');
    let card = document.querySelector('.sl-tokens-card');

    if (!header || header.parentElement !== mainNav || !card || card.parentElement !== mainNav) {
      if (header) header.remove();
      if (card) card.remove();

      header = document.createElement('div');
      header.className = 'section-header sl-token-section-header';
      header.textContent = 'Tokens';

      card = document.createElement('div');
      card.className = 'sl-tokens-card';

      mainNav.appendChild(header);
      mainNav.appendChild(card);
      renderTokensCard(card, cachedTokenBreakdown.usageStr ? cachedTokenBreakdown : { usageStr: currentText });
      lastTokenCountText = '';
    }

    if (!currentText) return;
    if (currentText === lastTokenCountText && card.hasChildNodes()) return;
    if (isExtractingTokens) return;

    lastTokenCountText = currentText;
    isExtractingTokens = true;

    // Trigger silent tooltip inspection
    if (tokenSpan) {
      try {
        tokenSpan.click();
        setTimeout(() => {
          try {
            const tooltip = document.querySelector('.token-count-tooltip');
            if (tooltip) {
              const rows = Array.from(tooltip.querySelectorAll('.tooltip-row'));
              rows.forEach(r => {
                const spans = Array.from(r.querySelectorAll('span'));
                const label = spans[0]?.textContent?.trim() || '';
                const val = spans[1]?.textContent?.trim() || '';
                if (label.includes('Usage')) cachedTokenBreakdown.usageStr = val;
                else if (label.includes('Input tokens')) cachedTokenBreakdown.inputTokens = val;
                else if (label.includes('Output tokens')) cachedTokenBreakdown.outputTokens = val;
                else if (label.includes('Total cost')) {
                  const num = parseFloat(val.replace('$', ''));
                  cachedTokenBreakdown.estCost = isNaN(num) ? val : ('$' + num.toFixed(2));
                }
              });
            }
            document.querySelector('.cdk-overlay-backdrop')?.click();
          } catch (err) {}
          if (!cachedTokenBreakdown.usageStr) cachedTokenBreakdown.usageStr = currentText;
          const currentCard = document.querySelector('.sl-tokens-card');
          if (currentCard) renderTokensCard(currentCard, cachedTokenBreakdown);
          isExtractingTokens = false;
        }, 50);
      } catch (e) {
        isExtractingTokens = false;
      }
    } else {
      isExtractingTokens = false;
    }
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

  // ══════════════════════════════════════════════════════════════════
  //  CENTERED TOP SAVING PILL (ChatGPT / Gemini style)
  // ══════════════════════════════════════════════════════════════════

  let savingPillEl = null;
  let savingHideTimeout = null;

  function getOrCreateSavingPill() {
    if (savingPillEl && savingPillEl.isConnected) return savingPillEl;
    const existing = document.querySelector('.sl-saving-pill');
    if (existing) {
      savingPillEl = existing;
      return savingPillEl;
    }

    const pill = document.createElement('div');
    pill.className = 'sl-saving-pill';

    const icon = document.createElement('span');
    icon.className = 'material-symbols-outlined notranslate sl-spin-icon';
    icon.textContent = 'sync';

    const text = document.createElement('span');
    text.className = 'sl-saving-text';
    text.textContent = 'Saving...';

    pill.appendChild(icon);
    pill.appendChild(text);
    document.body.appendChild(pill);
    savingPillEl = pill;
    return savingPillEl;
  }

  function showSavingIndicator() {
    if (!isEnabled()) return;
    if (savingHideTimeout) {
      clearTimeout(savingHideTimeout);
      savingHideTimeout = null;
    }
    const pill = getOrCreateSavingPill();
    pill.classList.add('sl-visible');
  }

  function hideSavingIndicator(delay = 600) {
    if (savingHideTimeout) clearTimeout(savingHideTimeout);
    savingHideTimeout = setTimeout(() => {
      const pill = document.querySelector('.sl-saving-pill');
      if (pill) pill.classList.remove('sl-visible');
      savingHideTimeout = null;
    }, delay);
  }

  function checkNativeSavingState() {
    const nativeSaving = document.querySelector('.toolbar-saving-indicator, ms-drive-save-indicator, .saving-status.visible');
    if (nativeSaving) {
      showSavingIndicator();
    } else if (savingPillEl && savingPillEl.classList.contains('sl-visible') && !savingHideTimeout) {
      hideSavingIndicator(400);
    }
  }

  window.addEventListener('__sl_savingState', (e) => {
    if (e.detail && e.detail.saving) {
      showSavingIndicator();
    } else {
      hideSavingIndicator(500);
    }
  });

  // ══════════════════════════════════════════════════════════════════
  //  CHATGPT-STYLE TURN NAVIGATOR (replaces ms-items-scrollbar)
  // ══════════════════════════════════════════════════════════════════

  let lastTocButtonCount = 0;
  let lastActiveTocIndex = -1;
  let tocScrollListenerAttached = false;
  let tocResizeListenerAttached = false;

  function shouldShowTurnNavigator() {
    if (window.innerWidth <= 768) return false;
    return isChatPromptActive();
  }

  function cleanTurnTitle(raw, index) {
    if (!raw) return `Prompt ${index + 1}`;
    let clean = raw
      .replace(/^[#\s*>-]+/gm, '')
      .replace(/\r?\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return clean || `Prompt ${index + 1}`;
  }

  function jumpToTurn(controlsId, nBtn) {
    // 1. Wake and restore Smart Optimizer if turns are detached
    if (window.StudioLab && typeof window.StudioLab.restoreDetached === 'function') {
      window.StudioLab.restoreDetached();
    }
    window.dispatchEvent(new CustomEvent('__sl_restoreAllTurns'));

    // 2. Click native button to update Angular's model
    if (nBtn) {
      try { nBtn.click(); } catch (e) { }
    }

    // 3. Multi-attempt convergence scroll to ensure target lands accurately in viewport
    let attempts = 0;
    function ensureInView() {
      attempts++;
      const target = controlsId ? document.getElementById(controlsId) : null;
      const scroller = document.querySelector('ms-autoscroll-container');
      if (!target || !scroller) return;

      const scrollerRect = scroller.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const offsetDiff = targetRect.top - scrollerRect.top - 16;

      if (Math.abs(offsetDiff) > 20 && attempts <= 8) {
        scroller.scrollTo({
          top: Math.max(0, scroller.scrollTop + offsetDiff),
          behavior: attempts === 1 ? 'smooth' : 'auto'
        });
        setTimeout(ensureInView, 120);
      } else {
        if (Math.abs(offsetDiff) > 4) {
          scroller.scrollTop = Math.max(0, scroller.scrollTop + (target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 16));
        }
        target.classList.add('sl-turn-highlight');
        setTimeout(() => target.classList.remove('sl-turn-highlight'), 2000);
      }
    }

    requestAnimationFrame(() => {
      ensureInView();
    });
  }

  function getActiveTurnIndex(nativeBtns, scroller) {
    if (!nativeBtns.length) return 0;
    if (!scroller) return 0;

    const distFromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    if (distFromBottom < 80) {
      return nativeBtns.length - 1;
    }

    const targetScroll = scroller.scrollTop + 140;

    let activeIdx = 0;
    for (let i = 0; i < nativeBtns.length; i++) {
      const cid = nativeBtns[i].getAttribute('aria-controls');
      const el = cid ? document.getElementById(cid) : null;
      if (!el) continue;
      if (el.offsetTop <= targetScroll) {
        activeIdx = i;
      } else {
        break;
      }
    }
    return activeIdx;
  }

  function updateTurnNavigator() {
    const tocEl = document.querySelector('.sl-chatgpt-toc');

    if (!shouldShowTurnNavigator()) {
      if (tocEl) tocEl.style.display = 'none';
      return;
    }

    const chatSession = document.querySelector('ms-chat-session');
    if (!chatSession) {
      if (tocEl) tocEl.remove();
      lastTocButtonCount = 0;
      lastActiveTocIndex = -1;
      return;
    }

    const nativeBtns = Array.from(document.querySelectorAll('ms-items-scrollbar .items-scrollbar-item button'));
    if (nativeBtns.length <= 1) {
      if (tocEl) tocEl.remove();
      lastTocButtonCount = 0;
      lastActiveTocIndex = -1;
      return;
    }

    const scroller = document.querySelector('ms-autoscroll-container');

    // Check if we need to rebuild the DOM tree
    let existingToc = document.querySelector('.sl-chatgpt-toc');
    const needsRebuild = !existingToc || existingToc.parentElement !== chatSession || nativeBtns.length !== lastTocButtonCount;

    if (needsRebuild) {
      if (existingToc) existingToc.remove();
      lastTocButtonCount = nativeBtns.length;
      lastActiveTocIndex = -1;

      const toc = document.createElement('div');
      toc.className = 'sl-chatgpt-toc';

      const wrapper = document.createElement('div');
      wrapper.className = 'sl-toc-wrapper';

      const dashesContainer = document.createElement('div');
      dashesContainer.className = 'sl-toc-dashes-container';

      // Constrain dashes container height to max 9 visible items
      const VISIBLE_DASHES = 9;
      const visibleCount = Math.min(nativeBtns.length, VISIBLE_DASHES);
      dashesContainer.style.height = `${visibleCount * 3 + (visibleCount - 1) * 5}px`;

      const dashesList = document.createElement('div');
      dashesList.className = 'sl-toc-dashes-list';

      const popover = document.createElement('div');
      popover.className = 'sl-toc-popover';

      const popoverList = document.createElement('ul');
      popoverList.className = 'sl-toc-popover-list';

      nativeBtns.forEach((nBtn, idx) => {
        const cleanTitle = cleanTurnTitle(nBtn.getAttribute('aria-label'), idx);
        const controlsId = nBtn.getAttribute('aria-controls');

        // Dash button (3px pill)
        const dash = document.createElement('button');
        dash.type = 'button';
        dash.className = 'sl-toc-dash';
        dash.setAttribute('aria-label', cleanTitle);
        dash.dataset.index = idx.toString();
        dash.onclick = (e) => {
          e.stopPropagation();
          jumpToTurn(controlsId, nBtn);
        };
        dashesList.appendChild(dash);

        // Popover list item (matching native History style)
        const li = document.createElement('li');
        const pBtn = document.createElement('button');
        pBtn.type = 'button';
        pBtn.className = 'sl-toc-item';
        pBtn.dataset.index = idx.toString();

        const txtSpan = document.createElement('span');
        txtSpan.className = 'sl-toc-item-text';
        txtSpan.textContent = cleanTitle;

        pBtn.appendChild(txtSpan);
        pBtn.onclick = (e) => {
          e.stopPropagation();
          jumpToTurn(controlsId, nBtn);
        };
        li.appendChild(pBtn);
        popoverList.appendChild(li);
      });

      dashesContainer.appendChild(dashesList);
      popover.appendChild(popoverList);
      wrapper.appendChild(dashesContainer);
      wrapper.appendChild(popover);
      toc.appendChild(wrapper);

      // On hover: auto scroll active popover item into view with debounced hover state
      let hoverTimeout = null;
      toc.addEventListener('mouseenter', () => {
        if (hoverTimeout) clearTimeout(hoverTimeout);
        toc.classList.add('sl-hovered');
        const activeItem = popover.querySelector('.sl-toc-item.active');
        if (activeItem) {
          activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      });

      toc.addEventListener('mouseleave', () => {
        hoverTimeout = setTimeout(() => {
          toc.classList.remove('sl-hovered');
        }, 120);
      });

      chatSession.appendChild(toc);
      existingToc = toc;
    }

    // Ensure toc is visible
    existingToc.style.display = '';

    // Synchronize active turn state accurately using viewport positioning
    syncTocActiveState();

    // Attach listeners once with RAF throttling to prevent scroll jitter
    let isScrollTicking = false;
    let lastTocScrollCheck = 0;
    if (!tocScrollListenerAttached && scroller) {
      scroller.addEventListener('scroll', () => {
        const now = Date.now();
        if (now - lastTocScrollCheck < 80) return;
        lastTocScrollCheck = now;
        if (isScrollTicking) return;
        isScrollTicking = true;
        requestAnimationFrame(() => {
          isScrollTicking = false;
          syncTocActiveState();
        });
      }, { passive: true });
      tocScrollListenerAttached = true;
    }

    if (!tocResizeListenerAttached) {
      window.addEventListener('resize', () => {
        requestAnimationFrame(() => updateTurnNavigator());
      });
      tocResizeListenerAttached = true;
    }
  }

  function syncTocActiveState() {
    const existingToc = document.querySelector('.sl-chatgpt-toc');
    if (!existingToc || existingToc.style.display === 'none') return;

    const nativeBtns = Array.from(document.querySelectorAll('ms-items-scrollbar .items-scrollbar-item button'));
    if (!nativeBtns.length) return;

    const scroller = document.querySelector('ms-autoscroll-container');
    const activeIndex = getActiveTurnIndex(nativeBtns, scroller);

    if (activeIndex !== lastActiveTocIndex) {
      lastActiveTocIndex = activeIndex;
      const dashes = existingToc.querySelectorAll('.sl-toc-dash');
      const items = existingToc.querySelectorAll('.sl-toc-item');
      const dashesList = existingToc.querySelector('.sl-toc-dashes-list');

      dashes.forEach((dash, idx) => {
        if (idx === activeIndex) dash.classList.add('active');
        else dash.classList.remove('active');
      });

      items.forEach((it, idx) => {
        if (idx === activeIndex) it.classList.add('active');
        else it.classList.remove('active');
      });

      // Slide the 9-dash window to center on active dash
      if (dashesList && nativeBtns.length > 9) {
        const DASH_STRIDE = 8; // 3px + 5px
        const maxOffset = (nativeBtns.length - 9) * DASH_STRIDE;
        const targetOffset = Math.max(0, Math.min(maxOffset, (activeIndex - 4) * DASH_STRIDE));
        dashesList.style.transform = `translateY(-${targetOffset}px)`;
      }
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

    if (window.StudioLab && window.StudioLab.log) window.StudioLab.log('Relocating enabled-tools bar into buttons-row.', 'info');
    buttonsRow.appendChild(toolsBar);
  }

  let lastClickedMediaTurn = null;
  let lastClickedMediaTime = 0;
  let mediaMenuListenerAttached = false;

  function downloadUrl(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'download';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 100);
  }

  function downloadData(data, filename, mimeType) {
    let blob;
    if (typeof data === 'string') {
      if (data.startsWith('data:')) {
        downloadUrl(data, filename);
        return;
      }
      blob = new Blob([data], { type: mimeType || 'text/plain' });
    } else if (data instanceof Blob) {
      blob = data;
    } else {
      blob = new Blob([data], { type: mimeType || 'application/octet-stream' });
    }
    const blobUrl = URL.createObjectURL(blob);
    downloadUrl(blobUrl, filename);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  }

  function getActiveMediaTurn() {
    const openTurn = document.querySelector('ms-chat-turn:has(button[aria-expanded="true"]), ms-chat-turn:has([aria-expanded="true"])');
    if (openTurn && openTurn.querySelector('ms-image-chunk, ms-file-chunk, ms-video-chunk')) {
      return openTurn;
    }
    if (lastClickedMediaTurn && Date.now() - lastClickedMediaTime < 6000) {
      return lastClickedMediaTurn;
    }
    return null;
  }

  function handleMediaMenuPanel(panel) {
    if (!panel) return;
    const targetTurn = getActiveMediaTurn();
    if (!targetTurn) return;

    if (panel.querySelector('.sl-media-download-item')) return;

    const content = panel.querySelector('.mat-mdc-menu-content') || panel;
    const items = panel.querySelectorAll('button[role="menuitem"], .mat-mdc-menu-item, button');
    if (items.length === 0) {
      setTimeout(() => handleMediaMenuPanel(panel), 20);
      return;
    }

    panel.classList.add('sl-media-menu');

    const downloadBtn = document.createElement('button');
    downloadBtn.type = 'button';
    downloadBtn.className = 'mat-mdc-menu-item mat-mdc-focus-indicator sl-media-download-item';
    downloadBtn.setAttribute('role', 'menuitem');
    downloadBtn.innerHTML = `
      <span class="mat-mdc-menu-item-text">
        <span aria-hidden="true" class="start-icon material-symbols-outlined notranslate">download</span>
        <span>Download</span>
      </span>
      <div matripple="" class="mat-ripple mat-mdc-menu-ripple"></div>
    `;

    downloadBtn.onclick = (e) => {
      e.stopPropagation();
      const backdrop = document.querySelector('.cdk-overlay-backdrop');
      if (backdrop) backdrop.click();

      // Download photo
      if (targetTurn.querySelector('ms-image-chunk')) {
        const imageChunk = targetTurn.querySelector('ms-image-chunk');
        if (imageChunk) {
          imageChunk.setAttribute('data-sl-dl-target', 'true');
          window.dispatchEvent(new CustomEvent('__sl_download_media', { detail: { filename: 'image.png' } }));
        }
      }
      // Download file
      else if (targetTurn.querySelector('ms-file-chunk')) {
        const fileChunk = targetTurn.querySelector('ms-file-chunk');
        const nameEl = fileChunk.querySelector('.name');
        const filename = nameEl ? nameEl.textContent.trim() : 'file';

        fileChunk.setAttribute('data-sl-dl-target', 'true');
        window.dispatchEvent(new CustomEvent('__sl_download_media', { detail: { filename } }));
      }
      // Download / view video
      else if (targetTurn.querySelector('ms-video-chunk')) {
        const iframe = targetTurn.querySelector('ms-video-chunk iframe');
        if (iframe && iframe.src) {
          window.open(iframe.src, '_blank');
        }
      }
    };

    content.insertBefore(downloadBtn, content.firstChild);
  }

  function checkOpenMediaMenu() {
    const panels = document.querySelectorAll('.cdk-overlay-container .mat-mdc-menu-panel:not(:has(.sl-media-download-item))');
    panels.forEach(panel => {
      handleMediaMenuPanel(panel);
    });
  }

  function syncTurnTimestampsAndStatus() {
    // 1. Purge any bottom status badges from all turns (user turns, model turns, edit mode)
    const oldBadges = document.querySelectorAll('.sl-turn-status-badge');
    oldBadges.forEach(b => b.remove());

    // 2. On model turns: only show "• Edited" in .author-label at top if edited
    const turns = document.querySelectorAll('ms-chat-turn');
    turns.forEach(turn => {
      const container = turn.querySelector('.chat-turn-container');
      const isModel = container && container.classList.contains('model');
      if (!isModel) return;

      const authorLabel = turn.querySelector('.author-label');
      if (!authorLabel) return;

      const footerMsg = turn.querySelector('.turn-footer .status-message');
      const isEdited = footerMsg && footerMsg.textContent.toLowerCase().includes('edit');

      let editedBadge = authorLabel.querySelector('.sl-model-edited-badge');
      if (isEdited) {
        if (!editedBadge) {
          editedBadge = document.createElement('span');
          editedBadge.className = 'sl-model-edited-badge';
          editedBadge.textContent = ' • Edited';
          authorLabel.appendChild(editedBadge);
        }
      } else if (editedBadge) {
        editedBadge.remove();
      }
    });
  }

  function performDOMUpdates() {
    if (!isEnabled()) return;
    relocateToolsBar();
    modifyPlusMenu();
    modifyHeaderMenu();
    reorganizeHeader();
    updateSidebarTokens();
    updateTurnNavigator();
    syncTurnTimestampsAndStatus();
    checkOpenMediaMenu();
    injectViewerElements();
    checkNativeSavingState();
  }

  function cleanup() {
    if (savingHideTimeout) {
      clearTimeout(savingHideTimeout);
      savingHideTimeout = null;
    }
    const savingPill = document.querySelector('.sl-saving-pill');
    if (savingPill) savingPill.remove();
    savingPillEl = null;

    const otherBtn = document.querySelector('.sl-other-uploads');
    if (otherBtn) otherBtn.remove();
    const divider = document.querySelector('.sl-divider');
    if (divider) divider.remove();
    document.querySelectorAll('.sl-injected-header-item, .sl-header-menu-divider, .sl-header-model-btn, .sl-header-thinking-btn, .sl-header-settings-btn, .sl-custom-dropdown, .sl-drawer-backdrop').forEach(el => el.remove());
    document.body.classList.remove('sl-settings-open');
    const tokenHeader = document.querySelector('.sl-token-section-header');
    if (tokenHeader) tokenHeader.remove();
    const tokenCard = document.querySelector('.sl-tokens-card');
    if (tokenCard) tokenCard.remove();
    const toc = document.querySelector('.sl-chatgpt-toc');
    if (toc) toc.remove();
    document.querySelectorAll('.sl-card-delete-btn, .sl-user-copy-btn, .sl-model-copy-btn, .sl-turn-status-badge, .sl-model-edited-badge, .sl-media-download-item').forEach(el => el.remove());
    if (overlayObserver) {
      overlayObserver.disconnect();
      overlayObserver = null;
    }
    if (mainObserver) {
      mainObserver.disconnect();
      mainObserver = null;
    }
    lastTocButtonCount = 0;
    lastActiveTocIndex = -1;
  }

  // ══════════════════════════════════════════════════════════════════
  //  MODULE REGISTRATION
  // ══════════════════════════════════════════════════════════════════

  const modernChatModule = {
    id: 'modern-web-chat',
    group: 'modules',
    order: 40,
    title: 'Modern Web Chat',
    subtitle: 'Gemini-style chat stream, input bar & media gallery',
    icon: 'forum',
    stateKey: 'modernWebChatEnabled',
    defaults: { modernWebChatEnabled: false },
    init(ctx) {
      ctxRef = ctx;
      if (window._slMediaPointerListener) {
        document.removeEventListener('pointerdown', window._slMediaPointerListener, true);
      }
      window._slMediaPointerListener = (e) => {
        if (!isEnabled()) return;
        const turn = e.target.closest('ms-chat-turn');
        if (turn) {
          const isMedia = turn.querySelector('ms-image-chunk, ms-file-chunk, ms-video-chunk');
          if (isMedia) {
            lastClickedMediaTurn = turn;
            lastClickedMediaTime = Date.now();
          }
        }
        if (!e.target.closest('.sl-custom-dropdown') && !e.target.closest('.sl-header-model-btn') && !e.target.closest('.sl-header-thinking-btn')) {
          closeCustomDropdowns();
        }
        // Instant trigger for '+' menu
        if (e.target.closest('ms-prompt-box button, .prompt-box-button, button[aria-haspopup="menu"]')) {
          requestAnimationFrame(() => {
            modifyPlusMenu();
            modifyHeaderMenu();
          });
        }
      };
      document.addEventListener('pointerdown', window._slMediaPointerListener, true);

      if (window._slKeydownListener) {
        window.removeEventListener('keydown', window._slKeydownListener);
      }
      window._slKeydownListener = (e) => {
        if (e.key === 'Escape') {
          closeCustomDropdowns();
          toggleSettingsDrawer(false);
        }
      };
      window.addEventListener('keydown', window._slKeydownListener);
      this.updateStyles();
    },
    onStateChange() {
      this.updateStyles();
    },
    onRouteChange(ctx) {
      cachedModelName = '';
      cachedModelId = '';
      if (isEnabled()) {
        try { performDOMUpdates(); } catch (e) { }
      }
    },
    setupObservers() {
      if (!isEnabled()) return;
      if (mainObserver) mainObserver.disconnect();
      let debounceTimer = null;
      mainObserver = new MutationObserver(() => {
        if (debounceTimer) return;
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          if (!isEnabled()) return;
          if (mainObserver) mainObserver.disconnect();
          try { performDOMUpdates(); } catch (e) { }
          if (mainObserver && isEnabled()) {
            mainObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
          }
        }, 120);
      });
      mainObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });

      // Synchronous instant observer for overlay panels (eliminates '+' menu flash)
      if (overlayObserver) overlayObserver.disconnect();
      overlayObserver = new MutationObserver((mutations) => {
        if (!isEnabled()) return;
        for (const m of mutations) {
          if (m.addedNodes && m.addedNodes.length > 0) {
            modifyPlusMenu();
            modifyHeaderMenu();
            checkOpenMediaMenu();
            break;
          }
        }
      });
      const overlayTarget = document.querySelector('.cdk-overlay-container') || document.body || document.documentElement;
      overlayObserver.observe(overlayTarget, { childList: true, subtree: true });
    },
    updateStyles() {
      const on = isEnabled();
      let el = styleEl || document.getElementById('sl-modern-web-chat-styles');
      if (on) {
        if (!el) {
          el = document.createElement('link');
          el.id = 'sl-modern-web-chat-styles';
          el.rel = 'stylesheet';
          el.href = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
            ? chrome.runtime.getURL('modules/modern-web-chat.css')
            : '';
          el.onload = () => {
            try { performDOMUpdates(); } catch (e) { }
          };
          (document.head || document.documentElement).appendChild(el);
        }
        styleEl = el;
        this.setupObservers();
        try { performDOMUpdates(); } catch (e) { }
      } else {
        if (el) el.remove();
        const existing = document.getElementById('sl-modern-web-chat-styles');
        if (existing) existing.remove();
        styleEl = null;
        cleanup();
      }
    }
  };

  window.StudioLab.registerModule(modernChatModule);
})();
