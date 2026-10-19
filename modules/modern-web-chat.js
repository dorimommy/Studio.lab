// Restyle native AI Studio controls while retaining Angular ownership.
(function () {
  'use strict';

  if (!window.StudioLab || typeof window.StudioLab.registerModule !== 'function') return;

  // window.StudioLabCore (packages/core) is bundled before this module.
  // `el` is intentionally not destructured: this file already binds `el`
  // locally (updateStyles, dispatchPointerClick, cleanup callbacks).
  const { $, $$, waitFor, observe } = window.StudioLabCore;

  let ctxRef = null;
  let styleEl = null;
  let mainObserver = null; // SDK observe() disposer (was MutationObserver)
  let overlayObserver = null; // SDK observe() disposer (was MutationObserver)
  let updateScheduled = false;
  let globalHandlersAttached = false;
  const hiddenNativeButtons = new Map();
  const viewerHandlers = new Map();
  const decoratedMediaPanels = new Set();
  const modifiedMenuContents = new Set();
  const injectedRoots = new Set();
  let dropdownGeneration = 0;
  let tokenExtractionTimeout = null;
  let domUpdateTimeout = null;
  let disposed = false;

  // The packaged theme preview uses the same controls and styles with a local
  // provider. It never invokes AI Studio's model picker, account, or chat APIs.
  function getPreviewControls() {
    return ctxRef?.previewControls || null;
  }

  function markCreated(node) {
    node.setAttribute('data-sl-modern-created', '');
    injectedRoots.add(node);
  }

  function rememberNativeDisplay(node) {
    if (!hiddenNativeButtons.has(node)) {
      hiddenNativeButtons.set(node, {
        value: node.style.getPropertyValue('display'),
        priority: node.style.getPropertyPriority('display')
      });
    }
  }

  function createNativeMenuProxy(nativeItem) {
    const proxy = document.createElement('button');
    proxy.type = 'button';
    proxy.className = nativeItem.className + ' sl-native-menu-proxy';
    proxy.setAttribute('role', 'menuitem');
    const label = nativeItem.getAttribute('aria-label');
    if (label) proxy.setAttribute('aria-label', label);
    for (const child of nativeItem.childNodes) proxy.appendChild(child.cloneNode(true));
    // Clones have no Angular listeners and must not duplicate native ID references.
    proxy.querySelectorAll('[id], [aria-describedby], [aria-labelledby], [aria-controls]').forEach(node => {
      for (const attribute of ['id', 'aria-describedby', 'aria-labelledby', 'aria-controls']) node.removeAttribute(attribute);
    });
    proxy.disabled = nativeItem.disabled || nativeItem.getAttribute('aria-disabled') === 'true';
    proxy.onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      if (!isEnabled() || !nativeItem.isConnected || nativeItem.disabled || nativeItem.getAttribute('aria-disabled') === 'true') return;
      nativeItem.click();
    };
    return proxy;
  }

  function getNativeRunSettingsToggle() {
    return $$('button.runsettings-toggle-button, button[aria-label="Toggle run settings panel"], button[aria-label="Run Settings"], button[aria-label*="run settings" i]')
      .find(button => !button.closest('.sl-header-btn, [data-sl-modern-created]')) || null;
  }

  function getOverlayBackdrop(overlay) {
    for (let owner = overlay?.closest('.cdk-overlay-pane'); owner?.parentElement; owner = owner.parentElement) {
      const parent = owner.parentElement;
      const previous = owner.previousElementSibling;
      if (previous?.classList.contains('cdk-overlay-backdrop')) return previous;
      if (parent.classList.contains('cdk-overlay-container')) break;
      if (parent.matches('.cdk-overlay-popover, .cdk-overlay-connected-position-bounding-box, .cdk-global-overlay-wrapper')) {
        const backdrops = Array.from(parent.children).filter(node => node.classList.contains('cdk-overlay-backdrop'));
        if (backdrops.length === 1) return backdrops[0];
        if (parent.classList.contains('cdk-overlay-popover')) return null;
      }
    }
    return null;
  }

  function isEnabled() {
    if (disposed) return false;
    if (!getPreviewControls() && window.StudioLab.isExtensionActive && !window.StudioLab.isExtensionActive()) return false;
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


  function getToolControl(toolName) {
    const name = toolName.toLowerCase();
    const row = $$('ms-run-settings .settings-item.settings-tool, ms-prompt-run-settings .settings-item.settings-tool')
      .find(item => item.querySelector('h3')?.textContent.trim().toLowerCase() === name);
    const toggle = row?.querySelector('mat-slide-toggle');
    return toggle ? { toggle, button: toggle.querySelector('button'), input: toggle.querySelector('input') } : null;
  }

  function isToolActive(toolName) {
    const control = getToolControl(toolName);
    if (control) {
      return control.toggle.classList.contains('mat-mdc-slide-toggle-checked') ||
        control.button?.getAttribute('aria-checked') === 'true' || !!control.input?.checked;
    }
    return $$('.enabled-tool-container .enabled-tool, ms-horizontal-scroll .enabled-tool')
      .some(chip => (chip.textContent || '').toLowerCase().includes(toolName.toLowerCase()));
  }

  function isToolDisabled(toolName) {
    const control = getToolControl(toolName);
    if (!control) return false;
    return !!(control.button?.disabled || control.input?.disabled ||
      control.button?.getAttribute('aria-disabled') === 'true' ||
      control.toggle.classList.contains('mat-mdc-slide-toggle-disabled'));
  }

  function adjustSubmenuPosition(submenu) {
    if (!submenu) return;
    submenu.style.transform = 'none';
    const rect = submenu.getBoundingClientRect();
    const pad = 8;
    if (rect.right > window.innerWidth - pad) {
      const overflow = rect.right - (window.innerWidth - pad);
      submenu.style.transform = `translateX(-${overflow}px)`;
    }
  }

  async function ensureToolsRunSettingsMounted(toolName) {
    if (!isEnabled()) return false;
    if (getToolControl(toolName)) return true;
    if (await waitForModelValue(() => getToolControl(toolName), 250)) return true;
    const panel = $('ms-run-settings');
    const openBtn = $('button.runsettings-toggle-button, button[aria-label="Toggle run settings panel"]');
    if ((!panel || !panel.classList.contains('expanded')) && openBtn) openBtn.click();
    const toolsGroup = $$('ms-prompt-run-settings .field-group, ms-run-settings .field-group')
      .find(group => /\bTools\b/i.test(group.textContent || ''));
    if (toolsGroup && !toolsGroup.querySelector('mat-slide-toggle')) {
      toolsGroup.querySelector('button[aria-label*="xpand" i], button.expand-icon, .group-header')?.click();
    }
    return !!(await waitForModelValue(() => getToolControl(toolName), 1200));
  }

  async function toggleNativeTool(toolName) {
    if (!(await ensureToolsRunSettingsMounted(toolName))) return false;
    if (!isEnabled()) return false;
    const control = getToolControl(toolName);
    if (!control?.button || isToolDisabled(toolName)) return false;
    const expected = !isToolActive(toolName);
    // Mixing a native click with synthetic pointer events can toggle twice.
    control.button.click();
    return !!(await waitForModelValue(() => isToolActive(toolName) === expected, 1200));
  }

  function syncToolsSubmenu(submenu) {
    submenu.querySelectorAll('.sl-tools-menu-item').forEach(item => {
      const name = item.dataset.slTool;
      const active = isToolActive(name);
      const disabled = isToolDisabled(name);
      item.setAttribute('aria-pressed', String(active));
      item.setAttribute('aria-checked', String(active));
      item.disabled = disabled;
      item.classList.toggle('sl-tool-disabled', disabled);
      item.title = disabled ? 'Tool unavailable with current settings' : '';
      const check = item.querySelector('.sl-tool-check');
      if (check) check.style.opacity = active ? '1' : '0';
    });
  }

  function makeSubmenuAccessible(wrapper, button, submenu) {
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    submenu.setAttribute('role', 'menu');
    const focusFirst = () => submenu.querySelector('button:not(:disabled)')?.focus();
    const onClick = button.onclick;
    button.onclick = event => {
      onClick?.(event);
      const open = wrapper.classList.contains('sl-submenu-open');
      button.setAttribute('aria-expanded', String(open));
      if (open) focusFirst();
    };
    button.addEventListener('keydown', event => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      event.stopPropagation();
      wrapper.classList.add('sl-submenu-open');
      button.setAttribute('aria-expanded', 'true');
      adjustSubmenuPosition(submenu);
      focusFirst();
    });
    submenu.addEventListener('keydown', event => {
      const items = Array.from(submenu.querySelectorAll('button:not(:disabled)'));
      if (event.key === 'Escape' || event.key === 'ArrowLeft') {
        event.preventDefault(); event.stopPropagation();
        wrapper.classList.remove('sl-submenu-open');
        button.setAttribute('aria-expanded', 'false');
        button.focus();
      } else if (items.length && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        const index = items.indexOf(document.activeElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
          : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
        items[next].focus();
      }
    });
  }

  function modifyPlusMenu() {
    const contents = $$('.mat-mdc-menu-content:not([data-sl-injected])');
    if (contents.length > 0) {
      if (window.StudioLab && window.StudioLab.log) window.StudioLab.log('Found ' + contents.length + ' uninjected menu contents', 'info');
    }

    contents.forEach(content => {
      // The native Drive action distinguishes this from other menus.
      const driveBtn = content.querySelector('.drive-file-menu-item');
      if (!driveBtn) return; // Silent return for other menus

      if (window.StudioLab && window.StudioLab.log) window.StudioLab.log('Target + menu container detected. Injecting...', 'info');
      content.dataset.slInjected = 'true';
      modifiedMenuContents.add(content);
      const panel = content.closest('.mat-mdc-menu-panel');
      if (panel) panel.setAttribute('data-sl-injected', 'true');

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
        markCreated(otherWrapper);

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

        itemsToMove.forEach(item => {
          rememberNativeDisplay(item);
          item.style.setProperty('display', 'none');
          submenuContent.appendChild(createNativeMenuProxy(item));
        });

        otherWrapper.appendChild(otherBtn);
        otherWrapper.appendChild(submenu);

        if (insertAfterNode && insertAfterNode.parentNode) {
          insertAfterNode.after(otherWrapper);
        } else {
          content.appendChild(otherWrapper);
        }

        otherBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const isOpen = otherWrapper.classList.toggle('sl-submenu-open');
          if (isOpen) adjustSubmenuPosition(submenu);
        };
        otherWrapper.onmouseenter = () => adjustSubmenuPosition(submenu);
        makeSubmenuAccessible(otherWrapper, otherBtn, submenu);
        if (window.StudioLab && window.StudioLab.log) window.StudioLab.log('Submenu created and injected successfully.', 'success');
      } else {
        if (window.StudioLab && window.StudioLab.log) window.StudioLab.log('No items found to move to submenu.', 'warn');
      }

      const divider = document.createElement('mat-divider');
      markCreated(divider);
      divider.setAttribute('role', 'separator');
      divider.style.borderTopColor = 'var(--mat-divider-color, rgba(255,255,255,0.12))';
      divider.style.borderTopWidth = '1px';
      divider.style.borderTopStyle = 'solid';
      divider.style.display = 'block';
      divider.style.margin = '4px 0';
      content.appendChild(divider);
      if (window.StudioLab && window.StudioLab.log) window.StudioLab.log('Divider added.', 'info');

      const nativeTools = $('ms-prompt-box-tools button') || $('.prompt-box-tools button');
      if (nativeTools) {
        if (window.StudioLab && window.StudioLab.log) window.StudioLab.log('Found native Tools button, adding flyout submenu to menu.', 'info');
        const toolsWrapper = document.createElement('div');
        toolsWrapper.className = 'sl-hover-wrapper sl-tools-hover-wrapper';
        markCreated(toolsWrapper);

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
          tItem.type = 'button';
          tItem.setAttribute('role', 'menuitemcheckbox');
          tItem.dataset.slTool = tool.id;
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
          tCheck.className = 'material-symbols-outlined notranslate sl-tool-check';
          tCheck.style.fontSize = '18px';
          tCheck.style.color = '#8ab4f8';
          tCheck.style.opacity = tActive ? '1' : '0';
          tCheck.textContent = 'check';

          tWrap.appendChild(tLeft);
          tWrap.appendChild(tCheck);
          tItem.appendChild(tWrap);

          tItem.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (isToolDisabled(tool.id)) return;
            tItem.disabled = true;
            try { await toggleNativeTool(tool.id); }
            finally { if (toolsSubmenu.isConnected) syncToolsSubmenu(toolsSubmenu); }
          };

          toolsSubmenu.appendChild(tItem);
        });

        toolsWrapper.appendChild(toolsBtn);
        toolsWrapper.appendChild(toolsSubmenu);
        content.appendChild(toolsWrapper);
        syncToolsSubmenu(toolsSubmenu);

        toolsBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const isOpen = toolsWrapper.classList.toggle('sl-submenu-open');
          if (isOpen) {
            syncToolsSubmenu(toolsSubmenu);
            adjustSubmenuPosition(toolsSubmenu);
          }
        };
        toolsWrapper.onmouseenter = () => {
          syncToolsSubmenu(toolsSubmenu);
          adjustSubmenuPosition(toolsSubmenu);
        };
        makeSubmenuAccessible(toolsWrapper, toolsBtn, toolsSubmenu);
      } else {
        if (window.StudioLab && window.StudioLab.log) window.StudioLab.log('Native Tools button NOT FOUND in DOM.', 'warn');
      }

      const nativeKey = $('ms-paid-api-key-button button') || $('.paid-api-key-button');
      if (nativeKey) {
        if (window.StudioLab && window.StudioLab.log) window.StudioLab.log('Found native Paid API Key button, adding proxy to menu.', 'info');
        const keyBtn = document.createElement('button');
        keyBtn.type = 'button';
        markCreated(keyBtn);
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
    const menuContent = $('.toolbar-overflow-menu .mat-mdc-menu-content:not([data-sl-header-injected])');
    if (!menuContent) return;

    menuContent.dataset.slHeaderInjected = 'true';
    modifiedMenuContents.add(menuContent);

    const hasTurns = !!$('ms-chat-turn');
    const promptValue = $('ms-prompt-box textarea')?.value?.trim();
    const isEmptyChat = !hasTurns && !promptValue;

    if (isEmptyChat) {
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
          hideNativeButton(item);
        }
      });
      // Unsaved chats keep native toggles but have no title/share/app actions yet.
      return;
    }

    // The injected Share prompt action replaces the native item.
    const nativeItems = menuContent.querySelectorAll('button.mat-mdc-menu-item:not(.sl-injected-header-item)');
    nativeItems.forEach(item => {
      const txt = item.textContent.trim().toLowerCase();
      const iconTxt = item.querySelector('.material-symbols-outlined, mat-icon')?.textContent.trim().toLowerCase();
      if (txt === 'share' || txt.startsWith('share') || iconTxt === 'share') {
        hideNativeButton(item);
      }
    });

    const divider = document.createElement('div');
    divider.className = 'mat-divider sl-header-menu-divider';
    divider.setAttribute('role', 'separator');
    divider.style.borderTop = '1px solid var(--mat-divider-color, rgba(255, 255, 255, 0.12))';
    divider.style.margin = '4px 0';
    menuContent.appendChild(divider);

    const proxyItems = [
      {
        icon: 'edit',
        label: 'Edit title',
        targetSelector: 'button[aria-label*="Edit prompt title" i], .page-title button, button[aria-label*="Edit title" i]',
      },
      {
        icon: 'share',
        label: 'Share prompt',
        targetSelector: 'ms-share-prompt button, button[aria-label="Share prompt"]',
      }
    ];

    if (window.innerWidth > 768 && $('button.compare-button, button[aria-label*="Compare"]')) {
      proxyItems.push({
        icon: 'compare_arrows',
        label: 'Compare mode',
        targetSelector: 'button.compare-button, button[aria-label*="Compare"]',
      });
    }

    proxyItems.push({
      icon: 'design_services',
      label: 'Make this an app',
      targetSelector: 'button[aria-label="Make this an app"]',
    });

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

        // Dismiss only this menu's backdrop so newly opened dialogs stay intact.
        const menuBackdrop = $('.mat-mdc-menu-backdrop');
        if (menuBackdrop) {
          menuBackdrop.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        }

        if (item.label === 'Edit title') {
          const target = $('button[aria-label*="Edit prompt title" i], .page-title button, button[aria-label*="Edit title" i]');
          if (target) {
            try {
              target.click();
            } catch (_) {
              dispatchPointerClick(target);
            }
          } else {
            window.dispatchEvent(new CustomEvent('__sl_openEditPromptTitle'));
          }
          return;
        }

        const target = item.targetSelector ? $(item.targetSelector) : null;
        if (target) {
          try {
            target.click();
          } catch (_) {
            dispatchPointerClick(target);
          }
        }
      };

      menuContent.appendChild(btn);
    });
  }


  let cachedModelName = '';
  let cachedModelId = '';
  let cachedModelRoute = window.location.pathname;
  const modelsByChatRoute = new Map();

  function syncModelRoute() {
    const route = window.location.pathname;
    if (route === cachedModelRoute) return;
    cachedModelRoute = route;
    const saved = modelsByChatRoute.get(route);
    cachedModelId = saved?.id || '';
    cachedModelName = saved?.name || '';
  }

  function rememberModel(id, name) {
    syncModelRoute();
    cachedModelId = (id || '').replace(/^models\//, '');
    cachedModelName = name || formatModelSlug(cachedModelId);
    const route = window.location.pathname;
    if (cachedModelName && /^\/prompts\/[^/]+/.test(route)) {
      modelsByChatRoute.delete(route);
      modelsByChatRoute.set(route, { id: cachedModelId, name: cachedModelName });
      if (modelsByChatRoute.size > 32) modelsByChatRoute.delete(modelsByChatRoute.keys().next().value);
    }
  }

  let featuredModels = [];
  let featuredSyncedAt = 0;
  let featuredSyncPromise = null;
  let modelDropdownOpening = false;

  function getFeaturedModels() {
    return getPreviewControls()?.getModels() || featuredModels;
  }

  const thinkingSelectSelector = 'mat-select[aria-label="Thinking Level"], ms-thinking-level-setting mat-select, ms-run-settings mat-select[aria-label*="hinking"], ms-run-settings .thinking-level mat-select';

  function getThinkingSelect() {
    return $(thinkingSelectSelector);
  }

  function getThinkingPanel(select) {
    const panelId = select?.getAttribute('aria-controls') || select?.getAttribute('aria-owns') || (select?.id ? select.id + '-panel' : null);
    return panelId ? document.getElementById(panelId) : $('.mat-mdc-select-panel');
  }

  function getAvailableThinkingLevels(panel) {
    return Array.from(panel?.querySelectorAll('mat-option') || [])
      .filter(option => option.getAttribute('aria-disabled') !== 'true' && !option.classList.contains('mat-mdc-option-disabled'))
      .map(option => option.textContent.trim()).filter(Boolean);
  }

  function formatModelSlug(slug) {
    if (!slug) return 'Select model';
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
    const previewModel = getPreviewControls()?.getModel();
    if (previewModel) return previewModel.name;
    syncModelRoute();
    // The native card and URL are authoritative. A previous custom-menu label
    // must never mask a model selected in AI Studio itself.
    const nativeModel = $('ms-model-selector [data-test-id="model-name"]')?.textContent.trim();
    const nativeName = $('ms-model-selector .title')?.textContent.trim();
    if (nativeModel && nativeName) {
      rememberModel(nativeModel, nativeName);
      return cachedModelName;
    }
    const urlModel = new URLSearchParams(window.location.search).get('model');
    if (urlModel) {
      const id = urlModel.replace(/^models\//, '');
      if (cachedModelId !== id || !cachedModelName) {
        rememberModel(id, getFeaturedModels().find(model => model.id === id)?.name || formatModelSlug(id));
      }
      return cachedModelName;
    }
    if (cachedModelName) return cachedModelName;
    try {
      if (typeof window.DynamicStudioAPI !== 'undefined' && typeof window.DynamicStudioAPI.getModel === 'function') {
        const m = window.DynamicStudioAPI.getModel();
        if (m) {
          rememberModel(m, formatModelSlug(m));
          return cachedModelName;
        }
      }
    } catch (_) {}

    const titleEl = $('ms-run-settings ms-model-selector .title, ms-run-settings ms-model-selector .model-title, ms-run-settings .model-card .title, ms-model-selector .title, ms-model-selector h3');
    if (titleEl && titleEl.textContent.trim()) {
      rememberModel('', titleEl.textContent.trim());
      return cachedModelName;
    }
    const nativeModelTag = $('ms-model-selector span[data-test-id="model-name"], ms-model-selector .model-name, ms-model-selector .subtitle');
    if (nativeModelTag && nativeModelTag.textContent.trim()) {
      rememberModel(nativeModelTag.textContent.trim(), formatModelSlug(nativeModelTag.textContent.trim()));
      return cachedModelName;
    }
    return 'Select model';
  }

  function getSelectedThinkingLevel() {
    if (getPreviewControls()) return getPreviewControls().getThinkingLevel();
    const select = getThinkingSelect();
    if (select) {
      const valText = select.querySelector('.mat-mdc-select-value-text, .mat-mdc-select-value, .mat-select-value-text');
      if (valText && valText.textContent.trim()) {
        return valText.textContent.trim();
      }
    }
    return '';
  }

  function updateEmptyChatState() {
    if (getPreviewControls()) {
      document.body.classList.toggle('sl-empty-chat', !$('ms-chat-turn'));
      return;
    }
    const isNew = window.location.pathname.includes('/prompts/new_chat');
    const turns = $$('ms-chat-turn');
    const isEmpty = isNew || turns.length === 0;
    if (isEmpty) {
      document.body.classList.add('sl-empty-chat');
    } else {
      document.body.classList.remove('sl-empty-chat');
    }
  }

  function closeCustomDropdowns(restoreFocus = false) {
    dropdownGeneration++;
    $$('.sl-custom-dropdown').forEach(dropdown => {
      const owner = dropdown.slOwner;
      owner?.setAttribute('aria-expanded', 'false');
      owner?.removeAttribute('aria-controls');
      dropdown.remove();
      if (restoreFocus && owner?.isConnected) owner.focus();
    });
  }

  function mountCustomDropdown(dropdown, button) {
    dropdown.id = 'sl-dropdown-' + dropdownGeneration;
    dropdown.slOwner = button;
    dropdown.setAttribute('role', 'menu');
    dropdown.setAttribute('aria-label', button.getAttribute('aria-label') || button.textContent.trim());
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-controls', dropdown.id);
    dropdown.addEventListener('keydown', event => {
      const items = Array.from(dropdown.querySelectorAll('button:not(:disabled)'));
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeCustomDropdowns(true);
      } else if (event.key === 'Tab') {
        closeCustomDropdowns();
      } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && items.length) {
        event.preventDefault();
        const index = items.indexOf(document.activeElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
          : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
        items[next].focus();
      }
    });
    document.body.appendChild(dropdown);
    const rect = button.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom + 6}px`;
    dropdown.style.right = `${Math.max(12, window.innerWidth - rect.right)}px`;
    (dropdown.querySelector('[aria-checked="true"]') || dropdown.querySelector('button:not(:disabled)'))?.focus();
  }

  async function ensureRunSettingsMounted() {
    if (getPreviewControls()) return $('ms-model-selector button');
    if (!isEnabled()) return null;
    const triggerSelector = 'ms-model-selector button.model-selector-card, ms-model-selector button';
    const nativeTrigger = $(triggerSelector);
    if (nativeTrigger) return nativeTrigger;

    const toggleBtn = getNativeRunSettingsToggle();
    if (toggleBtn) {
      toggleBtn.click();
      // Was a hand-rolled requestAnimationFrame poll for up to 800 ms.
      return await waitFor(() => $(triggerSelector), { timeout: 800, interval: 16 });
    }
    return $(triggerSelector);
  }

  function toggleSettingsDrawer(forceOpen) {
    const hasPanel = !!$('ms-run-settings');
    const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : !document.body.classList.contains('sl-settings-open');

    if (getPreviewControls()) {
      closeCustomDropdowns();
      document.body.classList.toggle('sl-settings-open', shouldOpen);
      $('.sl-header-settings-btn')?.setAttribute('aria-expanded', String(shouldOpen));
      getPreviewControls().onSettingsToggle?.(shouldOpen);
      return;
    }

    if (shouldOpen) {
      // On narrow screens the drawers overlap; on desktop they can coexist.
      if (window.innerWidth <= 768) {
        const leftNavOverlay = $('.sidebar-overlay');
        if (leftNavOverlay) {
          leftNavOverlay.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        }
        const leftNavClose = $('.v3-left-nav.expanded button[aria-label*="close" i], button[aria-label="Close navigation menu"]');
        if (leftNavClose) leftNavClose.click();
      }

      closeCustomDropdowns();
      document.body.classList.add('sl-settings-open');
      if (!hasPanel) {
        const openBtn = getNativeRunSettingsToggle();
        if (openBtn) openBtn.click();
      }
    } else {
      document.body.classList.remove('sl-settings-open');
    }
  }

  if (window._slGlobalDrawerHandler) {
    document.removeEventListener('pointerdown', window._slGlobalDrawerHandler, true);
    document.removeEventListener('click', window._slGlobalDrawerHandler, true);
  }
  window._slGlobalDrawerHandler = (e) => {
    if (!isEnabled()) return;
    if (e.type === 'click' && window._slMediaPointerListener) window._slMediaPointerListener(e);
    if ((e.isTrusted || (!document.body.classList.contains('sl-syncing-model-picker') && !document.body.classList.contains('sl-reading-thinking-options'))) &&
      !e.target.closest('.sl-custom-dropdown') && !e.target.closest('.sl-header-btn')) {
      closeCustomDropdowns();
    }

    const leftNavToggle = e.target.closest('button[aria-label*="navigation menu" i], .navbar-toggle-button, button[aria-label*="Open nav" i]');
    // Mutual closing remains necessary on mobile, where the drawers overlap.
    if (window.innerWidth <= 768 && leftNavToggle && document.body.classList.contains('sl-settings-open')) {
      toggleSettingsDrawer(false);
    }

    // A close button in another dialog must not close Run Settings.
    const panel = e.target.closest('ms-right-side-panel, ms-run-settings, .drawer-container:has(ms-run-settings)');
    if (panel) {
      const closeBtn = e.target.closest('button[aria-label="Close run settings panel"], button[aria-label*="close" i], .close-button');
      if (closeBtn && e.type === 'click') {
        window._slLastDrawerCloseTime = Date.now();
        toggleSettingsDrawer(false);
        return;
      }
    }

    if (document.body.classList.contains('sl-settings-open')) {
      const btn = e.target.closest('.sl-header-settings-btn, button.runsettings-toggle-button, button[aria-label="Toggle run settings panel"]');
      const overlay = e.target.closest('.cdk-overlay-container, .sl-custom-dropdown, mat-dialog-container');
      const desktopLeftNav = window.innerWidth > 768 && (leftNavToggle || e.target.closest('.v3-left-nav, .nav-content, ms-nav-items-main-v2, .sidebar-overlay'));
      if (!panel && !btn && !overlay && !desktopLeftNav) {
        window._slLastDrawerCloseTime = Date.now();
        toggleSettingsDrawer(false);
      }
    }
  };

  function attachGlobalHandlers() {
    if (globalHandlersAttached) return;
    document.addEventListener('pointerdown', window._slGlobalDrawerHandler, true);
    document.addEventListener('click', window._slGlobalDrawerHandler, true);
    if (!getPreviewControls() && window._slMediaPointerListener) document.addEventListener('pointerdown', window._slMediaPointerListener, true);
    if (window._slKeydownListener) window.addEventListener('keydown', window._slKeydownListener);
    if (!getPreviewControls()) {
      window.addEventListener('__sl_modelChanged', onModelChanged);
      window.addEventListener('__sl_savingState', onSavingState);
    }
    globalHandlersAttached = true;
  }

  function detachGlobalHandlers() {
    if (!globalHandlersAttached) return;
    document.removeEventListener('pointerdown', window._slGlobalDrawerHandler, true);
    document.removeEventListener('click', window._slGlobalDrawerHandler, true);
    if (window._slMediaPointerListener) document.removeEventListener('pointerdown', window._slMediaPointerListener, true);
    if (window._slKeydownListener) window.removeEventListener('keydown', window._slKeydownListener);
    window.removeEventListener('__sl_modelChanged', onModelChanged);
    window.removeEventListener('__sl_savingState', onSavingState);
    globalHandlersAttached = false;
  }

  function findModelDialog() {
    return $$('mat-dialog-container, .mat-mdc-dialog-container')
      .find(dialog => Array.from(dialog.querySelectorAll('button[data-test-category-button]'))
        .some(button => button.textContent.trim() === 'Featured')) || null;
  }

  function getModelSearchInput(dialog) {
    return dialog?.querySelector('input[aria-label="Search"], input[aria-label="Search models"], input[placeholder*="search" i], input[type="search"]') ||
      Array.from(dialog?.querySelectorAll('input') || []).find(input => input.type === 'text' || input.type === 'search') || null;
  }

  async function prepareFeaturedModels(dialog) {
    if (!dialog || !isEnabled()) return false;
    const search = getModelSearchInput(dialog);
    const clearButton = dialog.querySelector('button[aria-label="Clear search query"]');
    if (search?.value || (!search && clearButton)) {
      if (clearButton && !clearButton.disabled && clearButton.getAttribute('aria-disabled') !== 'true') clearButton.click();
      const remainingSearch = getModelSearchInput(dialog);
      if (remainingSearch?.value) {
        // Use the native value setter and Angular's input listener if the clear
        // button is absent or its DOM update has not completed yet.
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(remainingSearch, '');
        else remainingSearch.value = '';
        remainingSearch.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      }
      if (!(await waitForModelValue(() => !getModelSearchInput(dialog)?.value, 1200))) return false;
    }
    const tab = await waitForModelValue(() => Array.from(dialog.querySelectorAll('button[data-test-category-button]'))
      .find(button => button.textContent.trim() === 'Featured' && !button.disabled && button.getAttribute('aria-disabled') !== 'true'), 1200);
    if (!tab || !isEnabled()) return false;
    if (tab.getAttribute('aria-selected') !== 'true') tab.click();
    return !!(await waitForModelValue(() => tab.getAttribute('aria-selected') === 'true', 1200));
  }

  function syncFeaturedModelsFromDialog(dialog) {
    if (!dialog) return false;
    if (getModelSearchInput(dialog)?.value) return false;
    const featuredTab = Array.from(dialog.querySelectorAll('button[data-test-category-button]'))
      .find(button => button.textContent.trim() === 'Featured');
    if (!featuredTab || featuredTab.disabled || featuredTab.getAttribute('aria-disabled') === 'true' || featuredTab.getAttribute('aria-selected') !== 'true') return false;

    const prefix = 'model-carousel-row-models/';
    const rows = Array.from(dialog.querySelectorAll('button.content-button[id^="' + prefix + '"]'));
    const models = rows.slice(0, 3).map(row => ({
      id: row.id.slice(prefix.length),
      name: row.querySelector('.model-title-text')?.textContent.trim() || ''
    }));
    if (models.length !== 3 || models.some(model => !model.id || !model.name)) return false;

    featuredModels = models;
    featuredSyncedAt = Date.now();
    return true;
  }

  // Polls until read() is truthy. Thin wrapper over the SDK waitFor that keeps
  // the original semantics: stops early when the module is disabled, resolves
  // falsy on timeout, and lets read() exceptions propagate immediately.
  async function waitForModelValue(read, timeout = 2500) {
    const ABORTED = Symbol('waitForModelValue.aborted');
    let failure = null;
    const result = await waitFor(() => {
      if (!isEnabled()) return ABORTED;
      try {
        return read() || null;
      } catch (error) {
        failure = error;
        return ABORTED;
      }
    }, { timeout, interval: 16 });
    if (failure) throw failure;
    return result === ABORTED ? null : result;
  }

  async function refreshFeaturedModels() {
    if (featuredSyncPromise) return featuredSyncPromise;
    featuredSyncPromise = (async () => {
      let dialog = findModelDialog();
      const openedByUs = !dialog;
      const hadNativeSelector = !!$('ms-model-selector button.model-selector-card');
      const wasSyncing = document.body.classList.contains('sl-syncing-model-picker');
      document.body.classList.add('sl-syncing-model-picker');
      try {
        if (!dialog) {
          const trigger = await ensureRunSettingsMounted();
          if (!trigger || !isEnabled()) return false;
          trigger.click();
          dialog = await waitForModelValue(findModelDialog);
        }
        if (!dialog) return false;
        if (!(await prepareFeaturedModels(dialog))) return false;
        const synced = await waitForModelValue(() => syncFeaturedModelsFromDialog(dialog));
        return !!synced;
      } finally {
        if (openedByUs) {
          dialog?.querySelector('button[aria-label="Close panel"]')?.click();
          await waitForModelValue(() => !findModelDialog(), 2000);
          if (!hadNativeSelector) $('button[aria-label="Close run settings panel"]')?.click();
        }
        if (!wasSyncing) document.body.classList.remove('sl-syncing-model-picker');
      }
    })();
    try { return await featuredSyncPromise; }
    finally { featuredSyncPromise = null; }
  }

  async function selectNativeModel(modelId, modelName) {
    if (getPreviewControls()) {
      const changed = getPreviewControls().setModel(modelId);
      reorganizeHeader();
      return changed;
    }
    // Direct signals require an existing text chat and native-card confirmation;
    // new chats and specialized models need AI Studio's route flow.
    const canTryDirect = /^\/prompts\/(?!new_chat$)[^/]+$/.test(window.location.pathname) &&
      /^gemini-\d+(?:\.\d+)?-(?:flash(?:-lite)?|pro)$/.test(modelId);
    if (canTryDirect) {
      const requestId = 'sl-model-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      const directResult = await new Promise(resolve => {
        const onResult = event => {
          if (event.detail?.requestId !== requestId) return;
          clearTimeout(timer);
          window.removeEventListener('__sl_modelDirectResult', onResult);
          resolve(!!event.detail.applied);
        };
        const timer = setTimeout(() => {
          window.removeEventListener('__sl_modelDirectResult', onResult);
          resolve(false);
        }, 500);
        window.addEventListener('__sl_modelDirectResult', onResult);
        window.dispatchEvent(new CustomEvent('__sl_trySetModel', { detail: { modelId, requestId } }));
      });
      if (directResult && await waitForModelValue(() =>
        $('ms-model-selector [data-test-id="model-name"]')?.textContent.trim() === modelId, 1000)) {
        rememberModel(modelId, modelName);
        const label = $('.sl-header-model-btn .model-label');
        if (label) label.textContent = modelName;
        return true;
      }
    }

    // The native picker completes URL and capability updates for these models.
    const hadNativeSelector = !!$('ms-model-selector button.model-selector-card');
    let selected = false;
    document.body.classList.add('sl-syncing-model-picker');
    try {
      const trigger = await ensureRunSettingsMounted();
      if (!trigger || !isEnabled()) return false;
      trigger.click();
      const dialog = await waitForModelValue(findModelDialog);
      if (!dialog) return false;
      if (!(await prepareFeaturedModels(dialog))) return false;
      await waitForModelValue(() => syncFeaturedModelsFromDialog(dialog));
      const row = await waitForModelValue(() => Array.from(dialog.querySelectorAll('button.content-button[id]'))
        .find(button => button.id === 'model-carousel-row-models/' + modelId));
      if (!row) return false; // Reveal the native picker so the user can choose manually.

      window.dispatchEvent(new CustomEvent('__sl_clearModelOverride'));
      row.click();
      selected = !!(await waitForModelValue(() => {
        const nativeId = $('ms-model-selector [data-test-id="model-name"]')?.textContent.trim();
        const urlId = new URLSearchParams(window.location.search).get('model');
        return nativeId === modelId &&
          (window.location.pathname !== '/prompts/new_chat' || urlId === modelId);
      }));
      if (!selected) return false;
      rememberModel(modelId, modelName);
      const label = $('.sl-header-model-btn .model-label');
      if (label) label.textContent = modelName;
      return true;
    } finally {
      if (selected) {
        await waitForModelValue(() => !findModelDialog(), 2000);
        if (!hadNativeSelector) $('button[aria-label="Close run settings panel"]')?.click();
      }
      document.body.classList.remove('sl-syncing-model-picker');
    }
  }

  function onModelChanged(e) {
    if (e.detail?.modelId || e.detail?.modelName) {
      rememberModel(e.detail.modelId || '', e.detail.modelName || formatModelSlug(e.detail.modelId));
      const lbl = $('.sl-header-model-btn .model-label');
      if (lbl && cachedModelName) {
        lbl.textContent = cachedModelName;
      }
    }
  }

  async function selectNativeThinkingLevel(level) {
    if (getPreviewControls()) {
      const changed = getPreviewControls().setThinkingLevel(level);
      reorganizeHeader();
      return changed;
    }
    await ensureRunSettingsMounted();
    if (!isEnabled()) return false;
    const select = getThinkingSelect();
    if (!select || select.getAttribute('aria-disabled') === 'true') return false;
    document.body.classList.add('sl-reading-thinking-options');
    let panel = null;
    try {
      const trigger = select.querySelector('.mat-mdc-select-trigger') || select;
      trigger.click();
      panel = await waitForModelValue(() => getThinkingPanel(select), 800);
      if (!panel || !isEnabled()) return false;
      const target = Array.from(panel.querySelectorAll('mat-option')).find(option =>
        option.textContent.trim().toLowerCase() === level.toLowerCase() &&
        option.getAttribute('aria-disabled') !== 'true' && !option.classList.contains('mat-mdc-option-disabled'));
      if (!target) return false;
      target.click();
      const applied = !!(await waitForModelValue(() => getSelectedThinkingLevel().toLowerCase() === level.toLowerCase(), 800));
      if (applied) {
        const label = $('.sl-header-thinking-btn .thinking-label');
        if (label) label.textContent = getSelectedThinkingLevel();
      }
      return applied;
    } finally {
      await dismissThinkingPanel(panel, select);
      document.body.classList.remove('sl-reading-thinking-options');
    }
  }

  async function dismissThinkingPanel(panel, select) {
    let backdrop = getOverlayBackdrop(panel);
    const isClosed = () => (!select?.isConnected || select.getAttribute('aria-expanded') === 'false') &&
      !panel?.isConnected && !backdrop?.isConnected && !getThinkingPanel(select)?.isConnected;
    if (isClosed()) return true;
    if (backdrop) {
      backdrop.click();
      if (await waitForModelValue(isClosed, 800)) return true;
    }
    if (!isEnabled()) return false;
    panel = getThinkingPanel(select) || panel;
    backdrop = getOverlayBackdrop(panel) || backdrop;
    (panel?.isConnected ? panel : select)?.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true, composed: true
    }));
    return !!(await waitForModelValue(isClosed, 800));
  }

  async function openModelDropdown(button) {
    const existing = $('.sl-model-dropdown');
    if (existing) {
      closeCustomDropdowns(true);
      return;
    }
    if (modelDropdownOpening) return;
    modelDropdownOpening = true;
    closeCustomDropdowns();
    const generation = dropdownGeneration;
    try {
      if (!getPreviewControls() && (featuredModels.length !== 3 || Date.now() - featuredSyncedAt > 5 * 60 * 1000)) {
        await refreshFeaturedModels();
      }
    } catch (_) {
      // The native picker remains available through "More models" below.
    } finally {
      modelDropdownOpening = false;
    }
    if (!isEnabled() || generation !== dropdownGeneration || !button.isConnected) return;

    const currentName = getModelDisplayName();
    const nativeId = $('ms-model-selector [data-test-id="model-name"]')?.textContent.trim().replace(/^models\//, '');
    const urlId = new URLSearchParams(window.location.search).get('model')?.replace(/^models\//, '');
    const currentId = getPreviewControls()?.getModel().id || (window.location.pathname === '/prompts/new_chat'
      ? (urlId || nativeId || cachedModelId)
      : (nativeId || cachedModelId || urlId));
    const dropdown = document.createElement('div');
    dropdown.className = 'sl-custom-dropdown sl-model-dropdown';

    const models = getFeaturedModels();
    models.forEach(m => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'sl-dropdown-item';
      const isSelected = currentId ? currentId === m.id : currentName === m.name;
      item.setAttribute('role', 'menuitemradio');
      item.setAttribute('aria-checked', String(isSelected));
      if (isSelected) item.classList.add('active');

      const itemTitle = document.createElement('span');
      itemTitle.className = 'sl-dropdown-item-title';
      itemTitle.textContent = m.name;

      const check = document.createElement('span');
      check.className = 'material-symbols-outlined notranslate sl-dropdown-check';
      check.textContent = 'check';
      check.setAttribute('aria-hidden', 'true');

      item.appendChild(itemTitle);
      item.appendChild(check);

      item.onclick = async (e) => {
        e.stopPropagation();
        closeCustomDropdowns(true);
        await selectNativeModel(m.id, m.name);
      };

      dropdown.appendChild(item);
    });

    if (models.length === 0) {
      const unavailable = document.createElement('div');
      unavailable.className = 'sl-dropdown-item';
      unavailable.textContent = 'Featured models unavailable';
      dropdown.appendChild(unavailable);
    }

    if (getPreviewControls()) {
      mountCustomDropdown(dropdown, button);
      return;
    }

    const divider = document.createElement('div');
    divider.className = 'sl-dropdown-divider';
    dropdown.appendChild(divider);

    const moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.setAttribute('role', 'menuitem');
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
    moreIcon.setAttribute('aria-hidden', 'true');

    const moreText = document.createElement('span');
    moreText.textContent = 'More models...';

    moreLeft.appendChild(moreIcon);
    moreLeft.appendChild(moreText);
    moreBtn.appendChild(moreLeft);

    moreBtn.onclick = async (e) => {
      e.stopPropagation();
      closeCustomDropdowns();
      const nativeTrigger = await ensureRunSettingsMounted();
      if (nativeTrigger && isEnabled()) {
        nativeTrigger.click();
      }
    };
    dropdown.appendChild(moreBtn);

    mountCustomDropdown(dropdown, button);
  }

  async function openThinkingDropdown(button) {
    const existing = $('.sl-thinking-dropdown');
    if (existing) {
      closeCustomDropdowns(true);
      return;
    }
    closeCustomDropdowns();
    const generation = dropdownGeneration;
    await ensureRunSettingsMounted();
    if (!isEnabled() || generation !== dropdownGeneration || !button.isConnected) return;
    const select = getThinkingSelect();
    if (!getPreviewControls() && (!select || select.getAttribute('aria-disabled') === 'true')) return;
    let panel = null;
    let levels = [];
    let nativeDismissed = true;
    if (getPreviewControls()) levels = getPreviewControls().getThinkingLevels();
    else {
      document.body.classList.add('sl-reading-thinking-options');
      try {
        (select.querySelector('.mat-mdc-select-trigger') || select).click();
        panel = await waitForModelValue(() => getThinkingPanel(select), 800);
        levels = getAvailableThinkingLevels(panel);
      } finally {
        nativeDismissed = await dismissThinkingPanel(panel, select);
        document.body.classList.remove('sl-reading-thinking-options');
      }
    }
    if (!nativeDismissed || !levels.length || !isEnabled() || generation !== dropdownGeneration || !button.isConnected) return;

    const currentThinking = getSelectedThinkingLevel();
    const dropdown = document.createElement('div');
    dropdown.className = 'sl-custom-dropdown sl-thinking-dropdown';

    levels.forEach(lvl => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'sl-dropdown-item';
      item.setAttribute('role', 'menuitemradio');
      item.setAttribute('aria-checked', String(currentThinking.toLowerCase() === lvl.toLowerCase()));
      if (currentThinking.toLowerCase() === lvl.toLowerCase()) {
        item.classList.add('active');
      }

      const itemTitle = document.createElement('span');
      itemTitle.className = 'sl-dropdown-item-title';
      itemTitle.textContent = lvl;

      const check = document.createElement('span');
      check.className = 'material-symbols-outlined notranslate sl-dropdown-check';
      check.textContent = 'check';
      check.setAttribute('aria-hidden', 'true');

      item.appendChild(itemTitle);
      item.appendChild(check);

      item.onclick = (e) => {
        e.stopPropagation();
        closeCustomDropdowns(true);
        selectNativeThinkingLevel(lvl);
      };

      dropdown.appendChild(item);
    });

    mountCustomDropdown(dropdown, button);
  }

  function hideNativeButton(button) {
    rememberNativeDisplay(button);
    button.style.setProperty('display', 'none', 'important');
  }

  function reorganizeHeader() {
    const toolbarLeft = $('.toolbar-left');
    const toolbarRight = $('.toolbar-right');
    if (!toolbarLeft || !toolbarRight) return;

    updateEmptyChatState();

    // Hide the header's redundant New Chat controls without removing Angular-owned nodes.
    const newChatSelector = 'button[data-test-clear="outside"], button[data-test-clear], button[aria-label*="New chat" i], button[aria-label*="New prompt" i]';
    [...toolbarLeft.querySelectorAll(':scope > button'), ...toolbarRight.querySelectorAll(':scope > button')]
      .filter(button => button.matches(newChatSelector))
      .forEach(hideNativeButton);
    toolbarLeft.querySelectorAll(':scope > button').forEach(b => {
      const isNav = b.getAttribute('aria-label')?.toLowerCase().includes('nav') || b.getAttribute('aria-label')?.toLowerCase().includes('menu');
      const isAdd = b.textContent.trim() === 'add' || b.querySelector('.material-symbols-outlined')?.textContent.trim() === 'add';
      if (!isNav && isAdd) {
        hideNativeButton(b);
      }
    });
    toolbarRight.querySelectorAll(':scope > button').forEach(b => {
      const isAdd = b.textContent.trim() === 'add' || b.querySelector('.material-symbols-outlined')?.textContent.trim() === 'add';
      if (isAdd && !b.classList.contains('sl-header-btn')) {
        hideNativeButton(b);
      }
    });

    let modelBtn = toolbarRight.querySelector('.sl-header-model-btn');
    if (!modelBtn) {
      modelBtn = document.createElement('button');
      modelBtn.type = 'button';
      modelBtn.className = 'sl-header-btn sl-header-model-btn';
      modelBtn.setAttribute('aria-haspopup', 'menu');
      modelBtn.setAttribute('aria-expanded', 'false');

      const label = document.createElement('span');
      label.className = 'sl-header-btn-label model-label';
      label.textContent = getModelDisplayName();

      const chevron = document.createElement('span');
      chevron.className = 'material-symbols-outlined notranslate chevron';
      chevron.textContent = 'expand_more';
      chevron.setAttribute('aria-hidden', 'true');

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
        if (currentTitle && label.textContent !== currentTitle && !$('.sl-model-dropdown')) {
          label.textContent = currentTitle;
        }
      }
    }

    let thinkingBtn = toolbarRight.querySelector('.sl-header-thinking-btn');
    const thinkingSelect = getThinkingSelect();
    const hasThinkingSetting = getPreviewControls() ? getPreviewControls().getThinkingLevels().length > 0 : !!thinkingSelect;
    if (!thinkingBtn) {
      thinkingBtn = document.createElement('button');
      thinkingBtn.type = 'button';
      thinkingBtn.className = 'sl-header-btn sl-header-thinking-btn';
      thinkingBtn.setAttribute('aria-haspopup', 'menu');
      thinkingBtn.setAttribute('aria-expanded', 'false');

      const label = document.createElement('span');
      label.className = 'sl-header-btn-label thinking-label';
      label.textContent = getSelectedThinkingLevel();

      const chevron = document.createElement('span');
      chevron.className = 'material-symbols-outlined notranslate chevron';
      chevron.textContent = 'expand_more';
      chevron.setAttribute('aria-hidden', 'true');

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
        if (currentThinking && label.textContent !== currentThinking && !$('.sl-thinking-dropdown')) {
          label.textContent = currentThinking;
        }
      }
    }
    if (thinkingBtn) {
      const isMobile = window.innerWidth <= 768;
      thinkingBtn.hidden = !hasThinkingSetting || isMobile;
      thinkingBtn.disabled = thinkingSelect?.getAttribute('aria-disabled') === 'true';
    }

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
        if (Date.now() - (window._slLastDrawerCloseTime || 0) < 400) return;
        toggleSettingsDrawer();
      };
      toolbarRight.appendChild(settingsBtn);
    }
  }


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
    const hasPromptUI = !!$('ms-prompt-box, ms-chunk-editor, ms-prompt-renderer');
    return isPromptPage && hasPromptUI;
  }

  function shouldShowSidebarTokens() {
    if (!isChatPromptActive()) return false;
    const path = window.location.pathname;
    if (path.includes('/new_chat') || path === '/prompts/new_chat') return false;

    const turns = $$('ms-chat-turn');
    if (turns.length === 0) return false;

    const tokenSpan = $('ms-token-count .v3-token-count-value');
    const currentText = tokenSpan ? tokenSpan.textContent?.trim().replace(/\s+/g, ' ') : '';
    if (!currentText || currentText === '0' || currentText === '0 tokens') return false;

    return true;
  }

  function updateSidebarTokens() {
    const mainNav = $('ms-nav-items-main-v2');
    if (!mainNav) return;

    if (!shouldShowSidebarTokens()) {
      const header = $('.sl-token-section-header');
      if (header) header.remove();
      const card = $('.sl-tokens-card');
      if (card) card.remove();
      lastTokenCountText = '';
      return;
    }

    const tokenSpan = $('ms-token-count .v3-token-count-value');
    const currentText = tokenSpan ? tokenSpan.textContent?.trim().replace(/\s+/g, ' ') : '';

    let header = $('.sl-token-section-header');
    let card = $('.sl-tokens-card');

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

    if (tokenSpan) {
      try {
        tokenSpan.click();
        tokenExtractionTimeout = setTimeout(() => {
          tokenExtractionTimeout = null;
          if (!isEnabled()) { isExtractingTokens = false; return; }
          try {
            const tooltip = $('.token-count-tooltip');
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
            getOverlayBackdrop(tooltip)?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          } catch (err) {}
          if (!cachedTokenBreakdown.usageStr) cachedTokenBreakdown.usageStr = currentText;
          const currentCard = $('.sl-tokens-card');
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




  function injectViewerElements() {
    const dialog = $('ms-view-media-dialog');
    if (!dialog) return;

    const pane = dialog.closest('.cdk-overlay-pane');
    if (pane && pane.previousElementSibling && pane.previousElementSibling.classList.contains('cdk-overlay-backdrop')) {
      pane.previousElementSibling.classList.add('sl-backdrop-tint');
    }

    const main = dialog.querySelector('main');
    if (main && !viewerHandlers.has(main)) {
      const onClick = (e) => {
        if (e.target === main) {
          const closeBtn = dialog.querySelector('button[aria-label="Close"]');
          if (closeBtn) closeBtn.click();
        }
      };
      main.addEventListener('click', onClick);
      viewerHandlers.set(main, onClick);
    }
  }


  let savingPillEl = null;
  let savingHideTimeout = null;

  function getOrCreateSavingPill() {
    if (savingPillEl && savingPillEl.isConnected) return savingPillEl;
    const existing = $('.sl-saving-pill');
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
      const pill = $('.sl-saving-pill');
      if (pill) pill.classList.remove('sl-visible');
      savingHideTimeout = null;
    }, delay);
  }

  function checkNativeSavingState() {
    const indicators = $$('.toolbar-saving-indicator, ms-drive-save-indicator, .saving-status.visible');
    const isActivelySaving = indicators.some(el => {
      // Menu checkmarks such as Saved to Drive are not live save status.
      if (el.closest('.mat-mdc-menu-panel, .toolbar-overflow-menu, .mat-mdc-menu-content')) return false;
      const text = (el.textContent || '').toLowerCase();
      const hasSpinner = !!el.querySelector('mat-progress-spinner, mat-spinner, .spinner, .saving-spinner');
      const isSavingClass = el.classList.contains('saving') || el.classList.contains('is-saving') || (el.classList.contains('saving-status') && el.classList.contains('visible'));
      return hasSpinner || isSavingClass || text.includes('saving');
    });

    if (isActivelySaving) {
      showSavingIndicator();
    } else if (savingPillEl && savingPillEl.classList.contains('sl-visible') && !savingHideTimeout) {
      hideSavingIndicator(400);
    }
  }

  function onSavingState(e) {
    if (e.detail && e.detail.saving) {
      showSavingIndicator();
    } else {
      hideSavingIndicator(500);
    }
  }


  let lastTocButtonCount = 0;
  let lastActiveTocIndex = -1;
  let tocScroller = null;
  let tocScrollHandler = null;
  let tocResizeHandler = null;
  let tocScrollFrame = null;
  let tocResizeFrame = null;
  let lastTocNativeButtons = [];
  let lastTocTitles = '';
  let pendingTurnJump = null;
  let pendingTurnJumpFrame = null;
  const bufferedTurnSelector = 'ms-chat-turn[data-sl-buffered-turn]';

  function isBufferedTurnHidden(element) {
    return !!element?.closest(bufferedTurnSelector);
  }

  function detachTocScrollListener() {
    if (tocScroller && tocScrollHandler) tocScroller.removeEventListener('scroll', tocScrollHandler);
    if (tocScrollFrame !== null) cancelAnimationFrame(tocScrollFrame);
    tocScroller = null;
    tocScrollHandler = null;
    tocScrollFrame = null;
  }

  function detachTurnNavigatorListeners() {
    cancelPendingTurnJump();
    detachTocScrollListener();
    if (tocResizeHandler) window.removeEventListener('resize', tocResizeHandler);
    if (tocResizeFrame !== null) cancelAnimationFrame(tocResizeFrame);
    tocResizeHandler = null;
    tocResizeFrame = null;
  }

  function shouldShowTurnNavigator() {
    if (!isEnabled()) return false;
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
    cancelPendingTurnJump();
    let target = controlsId ? document.getElementById(controlsId) : null;
    const wasDeferred = !target || isBufferedTurnHidden(target);

    // The buffer retains native hosts; reveal them before Angular scrolls to one.
    if (window.StudioLab && typeof window.StudioLab.restoreDetached === 'function') {
      window.StudioLab.restoreDetached();
    }
    window.dispatchEvent(new CustomEvent('__sl_restoreAllTurns'));
    target = controlsId ? document.getElementById(controlsId) : null;

    if (!controlsId) return;
    if (!target || isBufferedTurnHidden(target)) {
      pendingTurnJump = { controlsId, nativeButton: nBtn, wasDeferred, route: window.location.pathname + window.location.search };
      window.addEventListener('__sl_chatRenderCommitted', schedulePendingTurnJump);
      window.addEventListener('popstate', cancelPendingTurnJump);
      return;
    }
    finishTurnJump(controlsId, nBtn, wasDeferred);
  }

  function cancelPendingTurnJump() {
    pendingTurnJump = null;
    if (pendingTurnJumpFrame !== null) cancelAnimationFrame(pendingTurnJumpFrame);
    pendingTurnJumpFrame = null;
    window.removeEventListener('__sl_chatRenderCommitted', schedulePendingTurnJump);
    window.removeEventListener('popstate', cancelPendingTurnJump);
  }

  function schedulePendingTurnJump() {
    if (!pendingTurnJump || pendingTurnJumpFrame !== null) return;
    pendingTurnJumpFrame = requestAnimationFrame(() => {
      pendingTurnJumpFrame = null;
      resumePendingTurnJump();
    });
  }

  function resumePendingTurnJump() {
    const pending = pendingTurnJump;
    if (!pending) return;
    if (!isEnabled() || pending.route !== window.location.pathname + window.location.search) {
      cancelPendingTurnJump();
      return;
    }
    const target = document.getElementById(pending.controlsId);
    if (!target || isBufferedTurnHidden(target)) return;
    cancelPendingTurnJump();
    finishTurnJump(pending.controlsId, pending.nativeButton, pending.wasDeferred);
  }

  function finishTurnJump(controlsId, nBtn, wasDeferred) {
    const nativeButton = nBtn?.isConnected && nBtn.getAttribute('aria-controls') === controlsId ? nBtn
      : $$('ms-items-scrollbar .items-scrollbar-item button')
        .find(button => button.getAttribute('aria-controls') === controlsId);
    // The native button updates Angular's active-turn state after its target exists.
    if (nativeButton) {
      try { nativeButton.click(); } catch (e) { }
    }
    const target = document.getElementById(controlsId);
    if (!target || isBufferedTurnHidden(target)) return;

    const scroller = $('ms-autoscroll-container');
    if (!scroller) return;

    const scrollerRect = scroller.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();

    const isAlreadyVisible = targetRect.bottom > scrollerRect.top + 60 && targetRect.top < scrollerRect.bottom - 60;

    if (isAlreadyVisible) {
      // Keep the viewport steady when any part of the target is already visible.
      target.classList.add('sl-turn-highlight');
      setTimeout(() => target.classList.remove('sl-turn-highlight'), 2000);
      return;
    }

    target.scrollIntoView({ behavior: 'smooth', block: wasDeferred ? 'start' : 'nearest' });
    target.classList.add('sl-turn-highlight');
    setTimeout(() => target.classList.remove('sl-turn-highlight'), 2000);
  }

  function getActiveTurnIndex(nativeBtns, scroller) {
    if (!nativeBtns.length) return 0;
    if (!scroller) return 0;

    const distFromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    if (distFromBottom < 80) {
      return nativeBtns.length - 1;
    }

    const targetScroll = scroller.scrollTop + 140;

    let activeIdx = -1;
    for (let i = 0; i < nativeBtns.length; i++) {
      const cid = nativeBtns[i].getAttribute('aria-controls');
      const el = cid ? document.getElementById(cid) : null;
      if (!el || isBufferedTurnHidden(el)) continue;
      if (activeIdx === -1) activeIdx = i;
      if (el.offsetTop <= targetScroll) {
        activeIdx = i;
      } else {
        break;
      }
    }
    return Math.max(0, activeIdx);
  }

  function updateTurnNavigator() {
    const tocEl = $('.sl-chatgpt-toc');

    if (!isEnabled()) return;
    if (!tocResizeHandler) {
      tocResizeHandler = () => {
        if (!isEnabled() || tocResizeFrame !== null) return;
        tocResizeFrame = requestAnimationFrame(() => {
          tocResizeFrame = null;
          if (isEnabled()) updateTurnNavigator();
        });
      };
      window.addEventListener('resize', tocResizeHandler);
    }

    if (!shouldShowTurnNavigator()) {
      detachTocScrollListener();
      if (tocEl) tocEl.style.display = 'none';
      return;
    }

    const chatSession = $('ms-chat-session');
    if (!chatSession) {
      detachTocScrollListener();
      if (tocEl) tocEl.remove();
      lastTocButtonCount = 0;
      lastActiveTocIndex = -1;
      return;
    }

    const nativeBtns = $$('ms-items-scrollbar .items-scrollbar-item button');
    if (nativeBtns.length <= 1) {
      detachTocScrollListener();
      if (tocEl) tocEl.remove();
      lastTocButtonCount = 0;
      lastActiveTocIndex = -1;
      return;
    }

    const scroller = $('ms-autoscroll-container');

    let existingToc = $('.sl-chatgpt-toc');
    const titles = nativeBtns.map(button => button.getAttribute('aria-label') || '').join('\n');
    const needsRebuild = !existingToc || existingToc.parentElement !== chatSession ||
      nativeBtns.length !== lastTocButtonCount || titles !== lastTocTitles ||
      nativeBtns.some((button, index) => button !== lastTocNativeButtons[index]);

    if (needsRebuild) {
      if (existingToc) existingToc.remove();
      lastTocButtonCount = nativeBtns.length;
      lastTocNativeButtons = nativeBtns;
      lastTocTitles = titles;
      lastActiveTocIndex = -1;

      const toc = document.createElement('div');
      toc.className = 'sl-chatgpt-toc';

      const wrapper = document.createElement('div');
      wrapper.className = 'sl-toc-wrapper';

      const dashesContainer = document.createElement('div');
      dashesContainer.className = 'sl-toc-dashes-container';

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

    existingToc.style.display = '';

    syncTocActiveState();

    // Throttle scroll updates to animation frames to avoid navigator jitter.
    let lastTocScrollCheck = 0;
    if (scroller !== tocScroller) {
      detachTocScrollListener();
      tocScroller = scroller;
    }
    if (!tocScrollHandler && scroller) {
      tocScrollHandler = () => {
        if (!isEnabled()) return;
        const now = Date.now();
        if (now - lastTocScrollCheck < 80) return;
        lastTocScrollCheck = now;
        if (tocScrollFrame !== null) return;
        tocScrollFrame = requestAnimationFrame(() => {
          tocScrollFrame = null;
          if (isEnabled()) syncTocActiveState();
        });
      };
      scroller.addEventListener('scroll', tocScrollHandler, { passive: true });
    }
  }

  function syncTocActiveState() {
    const existingToc = $('.sl-chatgpt-toc');
    if (!existingToc || existingToc.style.display === 'none') return;

    const nativeBtns = $$('ms-items-scrollbar .items-scrollbar-item button');
    if (!nativeBtns.length) return;

    const scroller = $('ms-autoscroll-container');
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

      if (dashesList && nativeBtns.length > 9) {
        const DASH_STRIDE = 8; // 3px + 5px
        const maxOffset = (nativeBtns.length - 9) * DASH_STRIDE;
        const targetOffset = Math.max(0, Math.min(maxOffset, (activeIndex - 4) * DASH_STRIDE));
        dashesList.style.transform = `translateY(-${targetOffset}px)`;
      }
    }
  }


  let pendingMediaMenu = null;

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

  function trackMediaMenu(target) {
    const trigger = target.closest('button[aria-haspopup="menu"], ms-chat-turn-options button');
    const turn = trigger?.closest('ms-chat-turn');
    if (!trigger || !turn) { pendingMediaMenu = null; return; }
    if (pendingMediaMenu?.trigger === trigger && Date.now() - pendingMediaMenu.at < 500) return;
    const chunks = Array.from(turn.querySelectorAll('ms-image-chunk, ms-file-chunk, ms-video-chunk'));
    const chunk = target.closest('ms-image-chunk, ms-file-chunk, ms-video-chunk') ||
      (chunks.length === 1 ? chunks[0] : null);
    // A turn-wide menu with several attachments has no authoritative chunk.
    if (!chunk) { pendingMediaMenu = null; return; }
    pendingMediaMenu = {
      trigger, chunk, at: Date.now(),
      existingPanels: new Set($$('.cdk-overlay-container .mat-mdc-menu-panel'))
    };
  }

  function handleMediaMenuPanel(panel, chunk) {
    if (!panel || !chunk?.isConnected || !isEnabled()) return false;

    if (panel.querySelector('.sl-media-download-item')) return true;

    const content = panel.querySelector('.mat-mdc-menu-content') || panel;
    const items = panel.querySelectorAll('button[role="menuitem"], .mat-mdc-menu-item, button');
    if (items.length === 0) return false;

    panel.classList.add('sl-media-menu');
    decoratedMediaPanels.add(panel);

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
      if (!isEnabled() || !chunk.isConnected) return;
      const pane = panel.closest('.cdk-overlay-pane');
      const backdrop = pane?.previousElementSibling?.classList.contains('cdk-overlay-backdrop')
        ? pane.previousElementSibling : $('.mat-mdc-menu-backdrop');
      if (backdrop) backdrop.click();

      if (chunk.matches('ms-image-chunk')) {
        chunk.setAttribute('data-sl-dl-target', 'true');
        window.dispatchEvent(new CustomEvent('__sl_download_media', { detail: { filename: 'image.png' } }));
      }
      else if (chunk.matches('ms-file-chunk')) {
        const nameEl = chunk.querySelector('.name');
        const filename = nameEl ? nameEl.textContent.trim() : 'file';

        chunk.setAttribute('data-sl-dl-target', 'true');
        window.dispatchEvent(new CustomEvent('__sl_download_media', { detail: { filename } }));
      }
      else if (chunk.matches('ms-video-chunk')) {
        const iframe = chunk.querySelector('iframe');
        if (iframe && iframe.src) {
          window.open(iframe.src, '_blank');
        }
      }
    };

    content.insertBefore(downloadBtn, content.firstChild);
    return true;
  }

  function checkOpenMediaMenu() {
    const pending = pendingMediaMenu;
    if (!isEnabled() || !pending) return;
    if (!pending.chunk.isConnected || !pending.trigger.isConnected || Date.now() - pending.at > 2000) {
      pendingMediaMenu = null;
      return;
    }
    const controls = pending.trigger.getAttribute('aria-controls');
    const panel = $$('.cdk-overlay-container .mat-mdc-menu-panel')
      .find(candidate => controls ? candidate.id === controls : !pending.existingPanels.has(candidate));
    if (panel && handleMediaMenuPanel(panel, pending.chunk)) pendingMediaMenu = null;
  }

  function syncTurnTimestampsAndStatus() {
    const turns = $$('ms-chat-turn:not([data-sl-buffered-turn])');
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
    if (getPreviewControls()) {
      reorganizeHeader();
      return;
    }
    syncFeaturedModelsFromDialog(findModelDialog());
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
    detachGlobalHandlers();
    detachTurnNavigatorListeners();
    closeCustomDropdowns();
    pendingMediaMenu = null;
    if (domUpdateTimeout !== null) clearTimeout(domUpdateTimeout);
    domUpdateTimeout = null;
    if (tokenExtractionTimeout !== null) clearTimeout(tokenExtractionTimeout);
    tokenExtractionTimeout = null;
    isExtractingTokens = false;
    lastTokenCountText = '';
    if (overlayObserver) { overlayObserver(); overlayObserver = null; }
    if (mainObserver) { mainObserver(); mainObserver = null; }
    for (const root of injectedRoots) root.remove();
    injectedRoots.clear();
    for (const content of modifiedMenuContents) {
      content.removeAttribute('data-sl-injected');
      content.removeAttribute('data-sl-header-injected');
      content.closest('.mat-mdc-menu-panel')?.removeAttribute('data-sl-injected');
      content.querySelectorAll('.sl-injected-header-item, .sl-header-menu-divider').forEach(node => node.remove());
    }
    modifiedMenuContents.clear();
    for (const [main, handler] of viewerHandlers) main.removeEventListener('click', handler);
    viewerHandlers.clear();
    for (const panel of decoratedMediaPanels) {
      panel.classList.remove('sl-media-menu');
      panel.querySelectorAll('.sl-media-download-item').forEach(node => node.remove());
    }
    decoratedMediaPanels.clear();
    for (const [button, original] of hiddenNativeButtons) {
      if (original.value) button.style.setProperty('display', original.value, original.priority);
      else button.style.removeProperty('display');
    }
    hiddenNativeButtons.clear();
    if (savingHideTimeout) {
      clearTimeout(savingHideTimeout);
      savingHideTimeout = null;
    }
    const savingPill = $('.sl-saving-pill');
    if (savingPill) savingPill.remove();
    savingPillEl = null;

    const otherBtn = $('.sl-other-uploads');
    if (otherBtn) otherBtn.remove();
    const divider = $('.sl-divider');
    if (divider) divider.remove();
    $$('.sl-injected-header-item, .sl-header-menu-divider, .sl-header-model-btn, .sl-header-thinking-btn, .sl-header-settings-btn, .sl-custom-dropdown, .sl-drawer-backdrop').forEach(el => el.remove());
    document.body?.classList.remove('sl-settings-open', 'sl-empty-chat', 'sl-reading-thinking-options', 'sl-switching-model', 'sl-syncing-model-picker');
    $$('.sl-backdrop-tint').forEach(node => node.classList.remove('sl-backdrop-tint'));
    const tokenHeader = $('.sl-token-section-header');
    if (tokenHeader) tokenHeader.remove();
    const tokenCard = $('.sl-tokens-card');
    if (tokenCard) tokenCard.remove();
    const tokenTooltips = $$('.token-count-tooltip');
    tokenTooltips.forEach(t => {
      getOverlayBackdrop(t)?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    const toc = $('.sl-chatgpt-toc');
    if (toc) toc.remove();
    $$('.sl-card-delete-btn, .sl-user-copy-btn, .sl-model-copy-btn, .sl-turn-status-badge, .sl-model-edited-badge, .sl-media-download-item').forEach(el => el.remove());
    if (overlayObserver) {
      overlayObserver();
      overlayObserver = null;
    }
    if (mainObserver) {
      mainObserver();
      mainObserver = null;
    }
    lastTocButtonCount = 0;
    lastActiveTocIndex = -1;
    lastTocNativeButtons = [];
    lastTocTitles = '';
  }


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
      disposed = false;
      detachGlobalHandlers();
      ctxRef = ctx;
      if (window._slMediaPointerListener) {
        document.removeEventListener('pointerdown', window._slMediaPointerListener, true);
      }
      window._slMediaPointerListener = (e) => {
        if (!isEnabled()) return;
        trackMediaMenu(e.target);
        if ((e.isTrusted || (!document.body.classList.contains('sl-syncing-model-picker') && !document.body.classList.contains('sl-reading-thinking-options'))) &&
          !e.target.closest('.sl-custom-dropdown') && !e.target.closest('.sl-header-model-btn') && !e.target.closest('.sl-header-thinking-btn')) {
          closeCustomDropdowns();
        }
        if (e.target.closest('ms-prompt-box button, .prompt-box-button, button[aria-haspopup="menu"]')) {
          requestAnimationFrame(() => {
            if (!isEnabled()) return;
            modifyPlusMenu();
            modifyHeaderMenu();
          });
        }
      };

      if (getPreviewControls()) window._slMediaPointerListener = null;

      if (window._slKeydownListener) {
        window.removeEventListener('keydown', window._slKeydownListener);
      }
      window._slKeydownListener = (e) => {
        if (e.key === 'Escape') {
          if (!e.isTrusted && document.body.classList.contains('sl-reading-thinking-options')) return;
          closeCustomDropdowns(true);
          toggleSettingsDrawer(false);
        }
      };
      this.updateStyles();
    },
    onStateChange() {
      this.updateStyles();
    },
    onRouteChange(ctx) {
      cancelPendingTurnJump();
      if (getPreviewControls()) return;
      closeCustomDropdowns();
      pendingMediaMenu = null;
      syncModelRoute();
      if (isEnabled()) {
        try { performDOMUpdates(); } catch (e) { }
      }
    },
    setupObservers() {
      if (!isEnabled()) return;
      if (mainObserver) mainObserver();
      if (domUpdateTimeout !== null) clearTimeout(domUpdateTimeout);
      domUpdateTimeout = null;
      let chatOnlyUpdate = true;
      const mainObserverOpts = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['aria-checked', 'aria-disabled', 'disabled', 'aria-selected', 'data-sl-buffered-turn'] };
      const onMainMutations = mutations => {
        if (pendingTurnJump && mutations.some(mutation => mutation.addedNodes?.length)) schedulePendingTurnJump();
        chatOnlyUpdate = chatOnlyUpdate && mutations.every(mutation => {
          const element = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
          return !!element?.closest('ms-chat-session');
        });
        if (domUpdateTimeout !== null) return;
        domUpdateTimeout = setTimeout(() => {
          domUpdateTimeout = null;
          if (!isEnabled()) return;
          const updateChatOnly = chatOnlyUpdate;
          chatOnlyUpdate = true;
          if (mainObserver) mainObserver();
          try {
            if (updateChatOnly) {
              updateTurnNavigator();
              syncTurnTimestampsAndStatus();
            } else performDOMUpdates();
          } catch (e) { }
          if (mainObserver && isEnabled()) {
            mainObserver = observe(document.body || document.documentElement, mainObserverOpts, onMainMutations);
          }
        }, 120);
      };
      mainObserver = observe(document.body || document.documentElement, mainObserverOpts, onMainMutations);

      // Decorate new overlay panels synchronously to avoid an unstyled + menu flash.
      if (overlayObserver) overlayObserver();
      const overlayTarget = $('.cdk-overlay-container') || document.body || document.documentElement;
      // A null root creates a non-observing instance, like the original which
      // always constructed the observer but only observed outside previews.
      overlayObserver = observe(getPreviewControls() ? null : overlayTarget, { childList: true, subtree: true }, (mutations) => {
        if (!isEnabled()) return;
        for (const m of mutations) {
          if (Array.from(m.addedNodes || []).some(node => node.nodeType === 1 &&
            (node.closest('.cdk-overlay-container, .mat-mdc-menu-panel') || node.querySelector('.cdk-overlay-container, .mat-mdc-menu-panel')))) {
            modifyPlusMenu();
            modifyHeaderMenu();
            checkOpenMediaMenu();
            break;
          }
        }
      });
    },
    updateStyles() {
      const on = isEnabled();
      window.dispatchEvent(new CustomEvent('__sl_modernWebChatToggle', { detail: { enabled: on } }));
      let el = styleEl || document.getElementById('sl-modern-web-chat-styles');
      if (on) {
        attachGlobalHandlers();
        if (!el) {
          el = document.createElement('link');
          el.id = 'sl-modern-web-chat-styles';
          el.rel = 'stylesheet';
          try {
            el.href = (typeof chrome !== 'undefined' && chrome.runtime?.id && chrome.runtime.getURL)
              ? chrome.runtime.getURL('modules/modern-web-chat.css')
              : '';
          } catch (error) {
            if (window.StudioLab.handleExtensionError?.(error)) return;
            throw error;
          }
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
    },
    dispose() {
      disposed = true;
      window.dispatchEvent(new CustomEvent('__sl_modernWebChatToggle', { detail: { enabled: false } }));
      cleanup();
      if (styleEl) styleEl.remove();
      styleEl = null;
      ctxRef = null;
    }
  };

  window.StudioLab.registerModule(modernChatModule);
})();
