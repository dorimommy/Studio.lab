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
    return true;
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
      item.title = disabled ? t('mwc_tool_unavailable', 'Tool unavailable with current settings') : '';
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
        otherLabel.textContent = t('mwc_other_uploads', 'Other uploads');

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
        toolsLabel.textContent = t('mwc_tools', 'Tools');

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
          { name: t('mwc_tool_google_search', 'Grounding with Google Search'), id: 'grounding with google search', icon: 'travel_explore' },
          { name: t('mwc_tool_code_exec', 'Code execution'), id: 'code execution', icon: 'terminal' },
          { name: t('mwc_tool_structured_outputs', 'Structured outputs'), id: 'structured outputs', icon: 'data_object' },
          { name: t('mwc_tool_function_calling', 'Function calling'), id: 'function calling', icon: 'function' },
          { name: t('mwc_tool_google_maps', 'Grounding with Google Maps'), id: 'grounding with google maps', icon: 'map' },
          { name: t('mwc_tool_url_context', 'URL context'), id: 'url context', icon: 'link' }
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
        keyLabel.textContent = t('mwc_link_paid_api', 'Link a paid API');
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
        id: 'edit_title',
        icon: 'edit',
        label: t('mwc_edit_title', 'Edit title'),
        targetSelector: 'button[aria-label*="Edit prompt title" i], .page-title button, button[aria-label*="Edit title" i]',
      },
      {
        id: 'share_prompt',
        icon: 'share',
        label: t('mwc_share_prompt', 'Share prompt'),
        targetSelector: 'ms-share-prompt button, button[aria-label="Share prompt"]',
      }
    ];

    if (window.innerWidth > 768 && $('button.compare-button, button[aria-label*="Compare"]')) {
      proxyItems.push({
        id: 'compare_mode',
        icon: 'compare_arrows',
        label: t('mwc_compare_mode', 'Compare mode'),
        targetSelector: 'button.compare-button, button[aria-label*="Compare"]',
      });
    }

    proxyItems.push({
      id: 'make_app',
      icon: 'design_services',
      label: t('mwc_make_app', 'Make this an app'),
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

        if (item.id === 'edit_title') {
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
  let staleNativeModelId = '';
  let staleNativeModelName = '';
  const modelsByChatRoute = new Map();

  let cachedThinkingLevel = '';
  let staleThinkingDomValue = '';
  let cachedThinkingRoute = window.location.pathname;

  function t(key, fallback) {
    return window.StudioLab?.i18n ? window.StudioLab.i18n.t(key, fallback) : (fallback || key);
  }

  function syncModelRoute() {
    const route = window.location.pathname;
    if (route === cachedModelRoute) return;
    cachedModelRoute = route;
    staleNativeModelId = '';
    staleNativeModelName = '';
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

  function loadStoredFeaturedModels() {
    try {
      const raw = localStorage.getItem('sl_featured_models');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const valid = parsed
          .map(m => ({
            id: String(m?.id || '').replace(/^models\//, '').trim(),
            name: String(m?.name || '').trim()
          }))
          .filter(m => m.id && m.name);
        if (valid.length > 0) {
          featuredModels = valid.slice(0, 4);
          featuredSyncedAt = Date.now();
        }
      }
    } catch (_) {}
  }
  loadStoredFeaturedModels();

  function onFeaturedModelsEvent(e) {
    const list = e?.detail?.models;
    if (Array.isArray(list) && list.length > 0) {
      const valid = list
        .map(m => ({
          id: String(m?.id || '').replace(/^models\//, '').trim(),
          name: String(m?.name || '').trim()
        }))
        .filter(m => m.id && m.name);
      if (valid.length > 0) {
        featuredModels = valid.slice(0, 4);
        featuredSyncedAt = Date.now();
      }
    }
  }

  function getFeaturedModels() {
    if (getPreviewControls()) return getPreviewControls().getModels();
    if (featuredModels.length === 0) loadStoredFeaturedModels();
    return featuredModels;
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
    if (!slug) return t('mwc_select_model', 'Select model');
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

    const rawNativeModel = $('ms-model-selector [data-test-id="model-name"]')?.textContent.trim() || '';
    const cleanNativeModel = rawNativeModel.replace(/^models\//, '');
    const nativeName = $('ms-model-selector .title')?.textContent.trim() || '';

    // Clear stale markers once Angular flushes the new values into ms-model-selector
    if (cleanNativeModel && staleNativeModelId && cleanNativeModel !== staleNativeModelId) {
      staleNativeModelId = '';
    }
    if (nativeName && staleNativeModelName && nativeName !== staleNativeModelName) {
      staleNativeModelName = '';
    }

    const isNativeDomStale = Boolean(
      (staleNativeModelId && cleanNativeModel === staleNativeModelId) ||
      (staleNativeModelName && nativeName === staleNativeModelName)
    );

    if (!isNativeDomStale && cleanNativeModel && nativeName) {
      rememberModel(cleanNativeModel, nativeName);
      return cachedModelName;
    }

    const urlModel = new URLSearchParams(window.location.search).get('model');
    if (urlModel) {
      const id = urlModel.replace(/^models\//, '');
      if (!staleNativeModelId || id !== staleNativeModelId) {
        if (cachedModelId !== id || !cachedModelName) {
          rememberModel(id, getFeaturedModels().find(model => model.id === id)?.name || formatModelSlug(id));
        }
        return cachedModelName;
      }
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
      const tText = titleEl.textContent.trim();
      if (!staleNativeModelName || tText !== staleNativeModelName) {
        rememberModel('', tText);
        return cachedModelName;
      }
    }
    const nativeModelTag = $('ms-model-selector span[data-test-id="model-name"], ms-model-selector .model-name, ms-model-selector .subtitle');
    if (nativeModelTag && nativeModelTag.textContent.trim()) {
      const tagId = nativeModelTag.textContent.trim().replace(/^models\//, '');
      if (!staleNativeModelId || tagId !== staleNativeModelId) {
        rememberModel(tagId, formatModelSlug(tagId));
        return cachedModelName;
      }
    }
    return cachedModelName || t('mwc_select_model', 'Select model');
  }

  function getSelectedThinkingLevel() {
    if (getPreviewControls()) return getPreviewControls().getThinkingLevel();
    if (window.location.pathname !== cachedThinkingRoute) {
      cachedThinkingRoute = window.location.pathname;
      cachedThinkingLevel = '';
      staleThinkingDomValue = '';
    }
    const select = getThinkingSelect();
    if (select) {
      const valText = select.querySelector('.mat-mdc-select-value-text, .mat-mdc-select-value, .mat-select-value-text');
      const domVal = valText ? valText.textContent.trim() : '';
      if (domVal) {
        if (staleThinkingDomValue && domVal.toLowerCase() !== staleThinkingDomValue.toLowerCase()) {
          staleThinkingDomValue = '';
        }
        if (staleThinkingDomValue && domVal.toLowerCase() === staleThinkingDomValue.toLowerCase() && cachedThinkingLevel) {
          return cachedThinkingLevel;
        }
        cachedThinkingLevel = domVal;
        return domVal;
      }
    }
    return cachedThinkingLevel || '';
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

    // If user manually picks a model inside AI Studio's full Model Picker dialog ("More models...")
    if (e.type === 'click' && e.isTrusted && !document.body.classList.contains('sl-syncing-model-picker')) {
      const modelRow = e.target.closest('button.content-button[id^="model-carousel-row-"]');
      if (modelRow) {
        const pickedId = modelRow.id.replace(/^model-carousel-row-(?:models\/)?/, '').trim();
        const pickedName = modelRow.querySelector('.model-title-text')?.textContent.trim() || formatModelSlug(pickedId);
        if (pickedId) {
          const prevDomId = ($('ms-model-selector [data-test-id="model-name"]')?.textContent.trim() || '').replace(/^models\//, '');
          const prevDomName = $('ms-model-selector .title')?.textContent.trim() || '';
          staleNativeModelId = (prevDomId && prevDomId !== pickedId) ? prevDomId : '';
          staleNativeModelName = (prevDomName && prevDomName !== pickedName) ? prevDomName : '';
          rememberModel(pickedId, pickedName);
          const lbl = $('.sl-header-model-btn .model-label');
          if (lbl && cachedModelName) lbl.textContent = cachedModelName;
        }
      }
      const nativeOption = e.target.closest('.mat-mdc-select-panel mat-option');
      if (nativeOption && !document.body.classList.contains('sl-reading-thinking-options')) {
        const optText = nativeOption.textContent?.trim();
        if (optText) {
          staleThinkingDomValue = '';
          cachedThinkingRoute = window.location.pathname;
          cachedThinkingLevel = optText;
          const tLbl = $('.sl-header-thinking-btn .thinking-label');
          if (tLbl) tLbl.textContent = optText;
        }
      }
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
      window.addEventListener('__sl_featuredModels', onFeaturedModelsEvent);
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
    window.removeEventListener('__sl_featuredModels', onFeaturedModelsEvent);
    window.removeEventListener('__sl_savingState', onSavingState);
    globalHandlersAttached = false;
  }

  function findModelDialog() {
    return $$('mat-dialog-container, .mat-mdc-dialog-container, .ms-sliding-right-panel-dialog')
      .find(dialog =>
        dialog.querySelector('ms-model-carousel, button[data-test-category-button], button.content-button[id^="model-carousel-row-"]')
      ) || null;
  }

  async function closeModelDialog(dialog) {
    const activeDialog = dialog?.isConnected ? dialog : findModelDialog();
    if (!activeDialog) return true;
    const closeBtn = activeDialog.querySelector(
      'button[aria-label="Close panel"], button[aria-label*="Close" i], button[mat-dialog-close], button.close-button'
    );
    if (closeBtn) closeBtn.click();
    if (await waitForModelValue(() => !findModelDialog(), 800)) return true;

    const backdrop = getOverlayBackdrop(activeDialog) || $('.cdk-overlay-backdrop:not(.mat-mdc-menu-backdrop)');
    if (backdrop) backdrop.click();
    if (await waitForModelValue(() => !findModelDialog(), 600)) return true;

    activeDialog.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true, composed: true
    }));
    return !!(await waitForModelValue(() => !findModelDialog(), 600));
  }

  function getModelSearchInput(dialog) {
    return dialog?.querySelector('input[aria-label="Search"], input[aria-label="Search models"], input[placeholder*="search" i], input[type="search"]') ||
      Array.from(dialog?.querySelectorAll('input') || []).find(input => input.type === 'text' || input.type === 'search') || null;
  }

  function findFeaturedTabButton(dialog) {
    const buttons = Array.from(dialog?.querySelectorAll('button[data-test-category-button]') || [])
      .filter(button => !button.disabled && button.getAttribute('aria-disabled') !== 'true');
    return buttons.find(button => button.textContent.trim().toLowerCase() === 'featured') || buttons[0] || null;
  }

  async function prepareFeaturedModels(dialog) {
    if (!dialog || !isEnabled()) return false;
    const search = getModelSearchInput(dialog);
    const clearButton = dialog.querySelector('button[aria-label="Clear search query"], button[aria-label*="Clear" i]');
    if (search?.value || (!search && clearButton)) {
      if (clearButton && !clearButton.disabled && clearButton.getAttribute('aria-disabled') !== 'true') clearButton.click();
      const remainingSearch = getModelSearchInput(dialog);
      if (remainingSearch?.value) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(remainingSearch, '');
        else remainingSearch.value = '';
        remainingSearch.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      }
      if (!(await waitForModelValue(() => !getModelSearchInput(dialog)?.value, 1200))) return false;
    }
    const tab = await waitForModelValue(() => findFeaturedTabButton(dialog), 1200);
    if (!tab || !isEnabled()) {
      // Even if category tabs are absent, allow reading rows directly
      return !!dialog.querySelector('button.content-button[id^="model-carousel-row-"]');
    }
    if (tab.getAttribute('aria-selected') !== 'true') tab.click();
    return !!(await waitForModelValue(() => tab.getAttribute('aria-selected') === 'true', 1200));
  }

  function syncFeaturedModelsFromDialog(dialog) {
    if (!dialog) return false;
    if (getModelSearchInput(dialog)?.value) return false;
    const featuredTab = findFeaturedTabButton(dialog);
    if (featuredTab && featuredTab.getAttribute('aria-selected') !== 'true') return false;

    const prefix = 'model-carousel-row-models/';
    const rows = Array.from(dialog.querySelectorAll('button.content-button[id^="' + prefix + '"]'));
    const models = rows.slice(0, 4).map(row => ({
      id: row.id.slice(prefix.length).replace(/^models\//, ''),
      name: row.querySelector('.model-title-text')?.textContent.trim() || formatModelSlug(row.id.slice(prefix.length))
    })).filter(model => model.id && model.name);
    if (models.length === 0) return false;

    featuredModels = models.slice(0, 3);
    featuredSyncedAt = Date.now();
    try {
      localStorage.setItem('sl_featured_models', JSON.stringify(featuredModels));
    } catch (_) {}
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
      const hadNativeSelector = !!$('ms-model-selector button.model-selector-card, ms-model-selector button');
      const wasSyncing = document.body.classList.contains('sl-syncing-model-picker');
      document.body.classList.add('sl-syncing-model-picker');
      try {
        if (!dialog) {
          const trigger = await ensureRunSettingsMounted();
          if (!trigger || !isEnabled()) return false;
          trigger.click();
          dialog = await waitForModelValue(findModelDialog, 1500);
        }
        if (!dialog) return false;
        if (!(await prepareFeaturedModels(dialog))) return false;
        const synced = await waitForModelValue(() => syncFeaturedModelsFromDialog(dialog), 1500);
        return !!synced;
      } finally {
        if (openedByUs) {
          await closeModelDialog(dialog);
          if (!hadNativeSelector && !document.body.classList.contains('sl-settings-open')) {
            $('button[aria-label="Close run settings panel"]')?.click();
          }
        }
        if (!wasSyncing) document.body.classList.remove('sl-syncing-model-picker');
      }
    })();
    try { return await featuredSyncPromise; }
    finally { featuredSyncPromise = null; }
  }

  async function selectNativeModel(modelId, modelName) {
    const cleanId = (modelId || '').replace(/^models\//, '');
    const displayTitle = modelName || formatModelSlug(cleanId);

    if (getPreviewControls()) {
      const changed = getPreviewControls().setModel(cleanId);
      reorganizeHeader();
      return changed;
    }

    // Record pre-selection DOM values so getModelDisplayName() ignores stale DOM while the right drawer is closed
    const prevDomId = ($('ms-model-selector [data-test-id="model-name"]')?.textContent.trim() || '').replace(/^models\//, '');
    const prevDomName = $('ms-model-selector .title')?.textContent.trim() || '';
    staleNativeModelId = (prevDomId && prevDomId !== cleanId) ? prevDomId : '';
    staleNativeModelName = (prevDomName && prevDomName !== displayTitle) ? prevDomName : '';

    // Optimistically update cache and toolbar label immediately
    rememberModel(cleanId, displayTitle);
    const immediateLabel = $('.sl-header-model-btn .model-label');
    if (immediateLabel) immediateLabel.textContent = cachedModelName;

    // Direct signals work for existing text chats
    const canTryDirect = /^\/prompts\/(?!new_chat$)[^/]+$/.test(window.location.pathname) &&
      /^gemini-\d+(?:\.\d+)?-(?:flash(?:-lite)?|pro)/i.test(cleanId);
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
        window.dispatchEvent(new CustomEvent('__sl_trySetModel', { detail: { modelId: cleanId, requestId } }));
      });
      if (directResult) {
        await waitForModelValue(() => {
          const domId = ($('ms-model-selector [data-test-id="model-name"]')?.textContent.trim() || '').replace(/^models\//, '');
          return domId === cleanId;
        }, 250);
        rememberModel(cleanId, displayTitle);
        const label = $('.sl-header-model-btn .model-label');
        if (label) label.textContent = cachedModelName;
        return true;
      }
    }

    // Use the native picker in the background to complete URL and capability updates
    const hadNativeSelector = !!$('ms-model-selector button.model-selector-card, ms-model-selector button');
    let dialog = null;
    document.body.classList.add('sl-syncing-model-picker');
    try {
      const trigger = await ensureRunSettingsMounted();
      if (!trigger || !isEnabled()) return false;
      trigger.click();
      dialog = await waitForModelValue(findModelDialog, 1800);
      if (!dialog) return false;
      await prepareFeaturedModels(dialog);
      syncFeaturedModelsFromDialog(dialog);
      const row = await waitForModelValue(() => Array.from(dialog.querySelectorAll('button.content-button[id]'))
        .find(button => button.id === 'model-carousel-row-models/' + cleanId || button.id.endsWith('/' + cleanId)), 1500);
      if (!row) return false;

      window.dispatchEvent(new CustomEvent('__sl_clearModelOverride'));
      row.click();
      await waitForModelValue(() => {
        const nativeId = ($('ms-model-selector [data-test-id="model-name"]')?.textContent.trim() || '').replace(/^models\//, '');
        const urlId = (new URLSearchParams(window.location.search).get('model') || '').replace(/^models\//, '');
        return !findModelDialog() || nativeId === cleanId || urlId === cleanId;
      }, 1500);

      rememberModel(cleanId, displayTitle);
      const label = $('.sl-header-model-btn .model-label');
      if (label) label.textContent = cachedModelName;
      return true;
    } finally {
      await closeModelDialog(dialog);
      if (!hadNativeSelector && !document.body.classList.contains('sl-settings-open')) {
        $('button[aria-label="Close run settings panel"]')?.click();
      }
      document.body.classList.remove('sl-syncing-model-picker');
    }
  }

  function onModelChanged(e) {
    if (e.detail?.modelId || e.detail?.modelName) {
      const nextId = (e.detail.modelId || '').replace(/^models\//, '');
      const nextName = e.detail.modelName || formatModelSlug(nextId);
      const prevDomId = ($('ms-model-selector [data-test-id="model-name"]')?.textContent.trim() || '').replace(/^models\//, '');
      const prevDomName = $('ms-model-selector .title')?.textContent.trim() || '';
      if (prevDomId && nextId && prevDomId !== nextId) staleNativeModelId = prevDomId;
      if (prevDomName && nextName && prevDomName !== nextName) staleNativeModelName = prevDomName;
      rememberModel(nextId, nextName);
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

    const valTextEl = select.querySelector('.mat-mdc-select-value-text, .mat-mdc-select-value, .mat-select-value-text');
    const prevDomVal = valTextEl ? valTextEl.textContent.trim() : '';
    if (prevDomVal && prevDomVal.toLowerCase() !== level.toLowerCase()) {
      staleThinkingDomValue = prevDomVal;
    } else {
      staleThinkingDomValue = '';
    }
    cachedThinkingRoute = window.location.pathname;
    cachedThinkingLevel = level;
    const immediateLabel = $('.sl-header-thinking-btn .thinking-label');
    if (immediateLabel) immediateLabel.textContent = level;

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
      await waitForModelValue(() =>
        target.getAttribute('aria-selected') === 'true' ||
        !panel.isConnected ||
        getSelectedThinkingLevel().toLowerCase() === level.toLowerCase(), 500);
      cachedThinkingLevel = level;
      const label = $('.sl-header-thinking-btn .thinking-label');
      if (label) label.textContent = level;
      return true;
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
      loadStoredFeaturedModels();
      if (!getPreviewControls() && (featuredModels.length === 0 || Date.now() - featuredSyncedAt > 10 * 60 * 1000)) {
        await refreshFeaturedModels();
      }
    } catch (_) {
      // The native picker remains available through "More models" below.
    } finally {
      modelDropdownOpening = false;
    }
    if (!isEnabled() || generation !== dropdownGeneration || !button.isConnected) return;

    const currentName = getModelDisplayName();
    const rawNativeId = ($('ms-model-selector [data-test-id="model-name"]')?.textContent.trim() || '').replace(/^models\//, '');
    const nativeId = (staleNativeModelId && rawNativeId === staleNativeModelId) ? cachedModelId : rawNativeId;
    const urlId = new URLSearchParams(window.location.search).get('model')?.replace(/^models\//, '');
    const currentId = getPreviewControls()?.getModel().id || (window.location.pathname === '/prompts/new_chat'
      ? (cachedModelId || urlId || nativeId)
      : (cachedModelId || nativeId || urlId));
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
      unavailable.textContent = t('mwc_featured_unavailable', 'Featured models unavailable');
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
    moreText.textContent = t('mwc_more_models', 'More models...');

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

  function openTrashDropdown(button) {
    const existing = $('.sl-trash-dropdown');
    if (existing) {
      closeCustomDropdowns(true);
      return;
    }
    closeCustomDropdowns();

    const dropdown = document.createElement('div');
    dropdown.className = 'sl-custom-dropdown sl-trash-dropdown';

    const actions = [
      {
        label: t('btn_delete_thoughts', 'Xoá all Think block'),
        svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;display:block;"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.04Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.04Z"/></svg>`,
        color: '#a8c7fa',
        onClick: () => window.StudioLab?.ChatCleanup?.deleteAllThoughts?.({ showProgress: true })
      },
      {
        label: t('btn_delete_media', 'Xoá all Media'),
        svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;display:block;"><rect width="18" height="18" x="3" y="3" rx="3" ry="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`,
        color: '#a8c7fa',
        onClick: () => window.StudioLab?.ChatCleanup?.deleteAllMedia?.()
      },
      {
        label: t('btn_delete_code', 'Xoá all Block Code'),
        svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;display:block;"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
        color: '#a8c7fa',
        onClick: () => window.StudioLab?.ChatCleanup?.deleteAllCodeExecutions?.()
      },
      { divider: true },
      {
        label: t('btn_fix_share', 'Fix lỗi Share đoạn chat'),
        svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;display:block;"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
        color: '#81c995',
        onClick: () => window.StudioLab?.ChatCleanup?.fixShareChatError?.()
      }
    ];

    actions.forEach(action => {
      if (action.divider) {
        const div = document.createElement('div');
        div.className = 'sl-dropdown-divider';
        dropdown.appendChild(div);
        return;
      }

      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'sl-dropdown-item sl-trash-dropdown-item';
      item.setAttribute('role', 'menuitem');

      const leftWrap = document.createElement('div');
      leftWrap.style.cssText = 'display: flex; align-items: center; gap: 10px; width: 100%;';

      const iconSpan = document.createElement('span');
      iconSpan.style.cssText = `display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; color: ${action.color}; flex-shrink: 0;`;
      iconSpan.innerHTML = action.svg;
      iconSpan.setAttribute('aria-hidden', 'true');

      const textSpan = document.createElement('span');
      textSpan.className = 'sl-dropdown-item-title';
      textSpan.textContent = action.label;

      leftWrap.appendChild(iconSpan);
      leftWrap.appendChild(textSpan);
      item.appendChild(leftWrap);

      item.onclick = (e) => {
        e.stopPropagation();
        closeCustomDropdowns();
        action.onClick();
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

    let trashBtn = toolbarRight.querySelector('.sl-header-trash-btn');
    if (!trashBtn) {
      trashBtn = document.createElement('button');
      trashBtn.type = 'button';
      trashBtn.className = 'sl-header-btn sl-header-trash-btn';
      const trashTitle = t('toolbar_trash_title', 'Dọn dẹp & Sửa lỗi Chat');
      trashBtn.title = trashTitle;
      trashBtn.setAttribute('aria-label', trashTitle);
      trashBtn.setAttribute('aria-haspopup', 'menu');
      trashBtn.setAttribute('aria-expanded', 'false');

      const icon = document.createElement('span');
      icon.className = 'material-symbols-outlined notranslate';
      icon.textContent = 'delete';
      icon.setAttribute('aria-hidden', 'true');

      trashBtn.appendChild(icon);

      trashBtn.onclick = (e) => {
        e.stopPropagation();
        openTrashDropdown(trashBtn);
      };
      toolbarRight.appendChild(trashBtn);
    } else {
      const trashTitle = t('toolbar_trash_title', 'Dọn dẹp & Sửa lỗi Chat');
      if (trashBtn.title !== trashTitle) {
        trashBtn.title = trashTitle;
        trashBtn.setAttribute('aria-label', trashTitle);
      }
    }

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

    // Ensure trashBtn is positioned right before modelBtn
    if (trashBtn && modelBtn && trashBtn.nextElementSibling !== modelBtn) {
      toolbarRight.insertBefore(trashBtn, modelBtn);
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
      const settingsTitle = t('mwc_run_settings', 'Run Settings');
      settingsBtn.title = settingsTitle;
      settingsBtn.setAttribute('aria-label', settingsTitle);

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
    } else {
      const settingsTitle = t('mwc_run_settings', 'Run Settings');
      if (settingsBtn.title !== settingsTitle) {
        settingsBtn.title = settingsTitle;
        settingsBtn.setAttribute('aria-label', settingsTitle);
      }
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
    usageLbl.textContent = t('mwc_total_tokens', 'Total tokens');

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
      { label: t('mwc_tokens_input', 'Input'), val: data.inputTokens || '—' },
      { label: t('mwc_tokens_output', 'Output'), val: data.outputTokens || '—' },
      { label: t('mwc_tokens_cost', 'Est. cost'), val: data.estCost || '—', highlight: true }
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
      header.textContent = t('mwc_tokens_header', 'Tokens');

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
    text.textContent = t('mwc_saving', 'Saving...');

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
        <span>${t('mwc_download', 'Download')}</span>
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

  function isThoughtOnlyModelTurn(turn) {
    if (!turn) return false;
    const hasThought = Boolean(turn.querySelector('ms-thought-chunk, .thought-panel, .thought-chunk'));
    if (!hasThought && !turn.classList?.contains('thought-activity-host')) return false;
    const hasResponseOutsideThought = Array.from(
      turn.querySelectorAll('ms-text-chunk, ms-cmark-node, ms-code-block')
    ).some(el => !el.closest('ms-thought-chunk, .thought-panel, .thought-chunk'));
    return !hasResponseOutsideThought;
  }

  function scheduleThoughtChunkCollapseFallback(thoughtChunk) {
    if (!thoughtChunk) return;
    if (thoughtChunk._slCollapseFallbackTimer) {
      clearTimeout(thoughtChunk._slCollapseFallbackTimer);
    }
    thoughtChunk._slCollapseFallbackTimer = setTimeout(() => {
      thoughtChunk._slCollapseFallbackTimer = null;
      if (!thoughtChunk.isConnected) return;
      const mainPanel =
        thoughtChunk.querySelector('mat-expansion-panel.thought-panel') ||
        thoughtChunk.querySelector('mat-expansion-panel:not([disabled])');
      const mainHeader = mainPanel?.querySelector('mat-expansion-panel-header');
      const isStillExpanded = Boolean(
        mainPanel?.classList.contains('mat-expanded') ||
        mainHeader?.getAttribute('aria-expanded') === 'true'
      );
      if (isStillExpanded && mainHeader) {
        mainHeader.click();
      }
    }, 75);
  }

  function syncTurnTimestampsAndStatus() {
    const turns = $$('ms-chat-turn:not([data-sl-buffered-turn])');
    const lastIdx = turns.length - 1;
    const customThemeOn = document.body?.getAttribute('data-sl-theme-active') === '1';
    let userRun = [];
    let modelRun = [];

    const applyRunPositions = (run) => {
      if (customThemeOn || run.length === 0) return;
      if (run.length === 1) {
        run[0].setAttribute('data-sl-bubble-pos', 'single');
      } else {
        run.forEach((rTurn, i) => {
          if (i === 0) rTurn.setAttribute('data-sl-bubble-pos', 'first');
          else if (i === run.length - 1) rTurn.setAttribute('data-sl-bubble-pos', 'last');
          else rTurn.setAttribute('data-sl-bubble-pos', 'middle');
        });
      }
    };

    const flushUserRun = () => {
      applyRunPositions(userRun);
      userRun = [];
    };

    const flushModelRun = () => {
      applyRunPositions(modelRun);
      modelRun = [];
    };

    turns.forEach((turn, idx) => {
      if (idx === lastIdx) {
        turn.setAttribute('data-sl-latest-turn', 'true');
      } else if (turn.hasAttribute('data-sl-latest-turn')) {
        turn.removeAttribute('data-sl-latest-turn');
      }

      const container = turn.querySelector('.chat-turn-container');
      const isModel = container && container.classList.contains('model');
      const isUser = container && container.classList.contains('user');
      const thoughtOnly = isModel && isThoughtOnlyModelTurn(turn);

      if (thoughtOnly) {
        turn.setAttribute('data-sl-thought-turn', 'true');
      } else if (turn.hasAttribute('data-sl-thought-turn')) {
        turn.removeAttribute('data-sl-thought-turn');
      }

      if (!customThemeOn) {
        if (isUser) {
          flushModelRun();
          const hasTextBubble = Boolean(turn.querySelector('ms-prompt-chunk:not(:has(ms-file-chunk)):not(:has(ms-video-chunk)):not(:has(ms-image-chunk)):not(:has(textarea))'));
          if (hasTextBubble) {
            userRun.push(turn);
          } else {
            flushUserRun();
            turn.removeAttribute('data-sl-bubble-pos');
          }
        } else if (isModel) {
          flushUserRun();
          if (!thoughtOnly) {
            modelRun.push(turn);
          } else {
            turn.removeAttribute('data-sl-bubble-pos');
          }
        } else {
          flushUserRun();
          flushModelRun();
          turn.removeAttribute('data-sl-bubble-pos');
        }
      }

      if (!isModel) return;

      turn.querySelectorAll('ms-thought-chunk mat-expansion-panel').forEach(panel => {
        if (panel.classList.contains('thought-panel')) return;
        if (
          panel.hasAttribute('disabled') ||
          panel.querySelector('.thought-panel-footer, .thought-collapsed-text-container, .thought-collapsed-text')
        ) {
          if (!panel.hasAttribute('data-sl-footer-bound')) {
            panel.setAttribute('data-sl-footer-bound', '1');
            panel.addEventListener('click', () => {
              const thoughtChunk = panel.closest('ms-thought-chunk');
              scheduleThoughtChunkCollapseFallback(thoughtChunk);
            });
          }
        }
      });

      const authorLabel = turn.querySelector('.author-label');
      if (!authorLabel) return;

      const footerMsg = turn.querySelector('.turn-footer .status-message');
      const isEdited = footerMsg && footerMsg.textContent.toLowerCase().includes('edit');

      let editedBadge = authorLabel.querySelector('.sl-model-edited-badge');
      if (isEdited) {
        if (!editedBadge) {
          editedBadge = document.createElement('span');
          editedBadge.className = 'sl-model-edited-badge';
          editedBadge.textContent = t('mwc_edited', ' • Edited');
          authorLabel.appendChild(editedBadge);
        } else {
          editedBadge.textContent = t('mwc_edited', ' • Edited');
        }
      } else if (editedBadge) {
        editedBadge.remove();
      }
    });
    flushUserRun();
    flushModelRun();
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
    defaults: { modernWebChatEnabled: true },
    init(ctx) {
      disposed = false;
      detachGlobalHandlers();
      ctxRef = ctx;
      if (window._slThoughtFooterClickListener) {
        document.removeEventListener('click', window._slThoughtFooterClickListener, false);
      }
      window._slThoughtFooterClickListener = (e) => {
        if (!isEnabled()) return;
        const footerHit = e.target?.closest?.(
          'ms-thought-chunk .thought-panel-footer, ms-thought-chunk .thought-collapsed-text-container, ms-thought-chunk .thought-collapsed-text, ms-thought-chunk mat-expansion-panel:not(.thought-panel)[disabled] mat-expansion-panel-header'
        );
        if (footerHit) {
          const thoughtChunk = footerHit.closest('ms-thought-chunk');
          scheduleThoughtChunkCollapseFallback(thoughtChunk);
        }
      };
      document.addEventListener('click', window._slThoughtFooterClickListener, false);

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
      if (window._slLangListener) {
        window.removeEventListener('__sl_languageChanged', window._slLangListener);
      }
      window._slLangListener = () => {
        if (!isEnabled()) return;
        const trashBtn = $('.sl-header-trash-btn');
        if (trashBtn) {
          const trashTitle = t('toolbar_trash_title', 'Dọn dẹp & Sửa lỗi Chat');
          trashBtn.title = trashTitle;
          trashBtn.setAttribute('aria-label', trashTitle);
        }
        const settingsBtn = $('.sl-header-settings-btn');
        if (settingsBtn) {
          const settingsTitle = t('mwc_run_settings', 'Run Settings');
          settingsBtn.title = settingsTitle;
          settingsBtn.setAttribute('aria-label', settingsTitle);
        }
        const savingText = $('.sl-saving-pill .sl-saving-text');
        if (savingText) savingText.textContent = t('mwc_saving', 'Saving...');
        const tokenHeader = $('.sl-token-section-header');
        if (tokenHeader) tokenHeader.textContent = t('mwc_tokens_header', 'Tokens');
        const tokenCard = $('.sl-tokens-card');
        if (tokenCard && cachedTokenBreakdown.usageStr) {
          renderTokensCard(tokenCard, cachedTokenBreakdown);
        }
        for (const content of modifiedMenuContents) {
          content.removeAttribute('data-sl-injected');
          content.removeAttribute('data-sl-header-injected');
          content.querySelectorAll('.sl-injected-header-item, .sl-header-menu-divider, .sl-hover-wrapper').forEach(node => node.remove());
        }
        modifiedMenuContents.clear();
        syncTurnTimestampsAndStatus();
      };
      window.addEventListener('__sl_languageChanged', window._slLangListener);
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
        const relevant = mutations.filter(mutation => {
          const element = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
          if (!element) return false;
          if (element.closest('ms-autosize-textarea, textarea, input, .mat-ripple, .mat-mdc-button-ripple, .mat-mdc-focus-indicator, #sl-ct-snow-layer, #sl-ct-bg-layer, .sl-quote-highlight, .sl-rp-turn-header, .sl-word-counter, .sl-saving-pill')) {
            return false;
          }
          return true;
        });
        if (!relevant.length) return;
        if (pendingTurnJump && relevant.some(mutation => mutation.addedNodes?.length)) schedulePendingTurnJump();
        chatOnlyUpdate = chatOnlyUpdate && relevant.every(mutation => {
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
