/**
 * content.js - Studio.lab shell
 *
 * The feature logic lives in modules/*.js. This file owns shared state,
 * sidebar injection, modal rendering, and module lifecycle dispatch.
 */
(function () {
  'use strict';

  const VERSION = chrome.runtime.getManifest().version_name || chrome.runtime.getManifest().version;
  const STORAGE_KEY = 'slState';
  const ICONS = {
    bolt: '<path d="M13 2 4 14h7l-1 8 10-13h-7l0-7z"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/>',
    storage: '<path d="M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
    delete: '<path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 14h10l1-14"/><path d="M9 7V4h6v3"/>',
    south: '<path d="M12 4v14"/><path d="m6 12 6 6 6-6"/>',
    calculate: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8"/><path d="M8 11h2"/><path d="M12 11h2"/><path d="M16 11h0"/><path d="M8 15h2"/><path d="M12 15h2"/><path d="M16 15h0"/>',
    rocket_launch: '<path d="M5 19c1.5-.3 3-.9 4-2"/><path d="M6 14 4 10l4-1 7-7 3 3-7 7-1 4-4-2z"/><path d="m14 4 6 6"/><path d="M4 22l4-4"/>',
    arrow_outward: '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
    flash_on: '<path d="M13 2 4 14h7l-1 8 10-13h-7l0-7z"/>',
    visibility: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="3"/>',
    edit: '<path d="M4 20h4l11-11-4-4L4 16v4z"/><path d="m13 7 4 4"/>',
    visibility_off: '<path d="m3 3 18 18"/><path d="M10.6 10.6A3 3 0 0 0 13.4 13.4"/><path d="M9.9 5.4A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a16 16 0 0 1-3.1 4.1"/><path d="M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7c1.8 0 3.4-.5 4.7-1.2"/>',
    speed: '<path d="M4 13a8 8 0 1 1 16 0"/><path d="M12 13l4-4"/><path d="M3 20h18"/>',
    check: '<path d="m5 13 4 4L19 7"/>',
    check_circle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    favorite: '<path d="M12 21s-7-4.4-9.3-8.6C.7 8.6 2.9 5 6.6 5c2 0 3.4 1 4.4 2.2C12 6 13.4 5 15.4 5c3.7 0 5.9 3.6 3.9 7.4C19 16.6 12 21 12 21z"/>',
    close: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/>'
  };

  const TABS = [
    { id: 'all', label: 'All' },
    { id: 'injection', label: 'Injection' },
    { id: 'tweaks', label: 'Tweaks' },
    { id: 'modules', label: 'Modules' },
    { id: 'info', label: 'Info' }
  ];

  const GROUPS = [
    {
      id: 'bypass',
      tabId: 'injection',
      title: 'CONTENT BYPASS',
      description: 'Bypass content filters and blocked response streams.',
      enabledKey: 'bypassEnabled'
    },
    {
      id: 'optimizer',
      tabId: 'injection',
      title: 'CHAT OPTIMIZER',
      description: 'Remove old chat turns from memory to eliminate UI lag.',
      enabledKey: 'optimizerEnabled',
      showTurnCounter: true
    },
    {
      id: 'tweaks',
      tabId: 'tweaks',
      title: 'TWEAKS',
      description: 'Small improvements for the interface.'
    },
    {
      id: 'cleaner',
      tabId: 'tweaks',
      title: 'UI CLEANER',
      description: 'Hide unused elements and declutter the interface.',
      enabledKey: 'cleanerEnabled'
    },
    {
      id: 'modules',
      tabId: 'modules',
      title: 'MODULES',
      description: 'Extra features to enhance AI Studio experience.'
    }
  ];

  const DEFAULT_STATE = {
    bypassEnabled: true,
    optimizerEnabled: false,
    optimizerMode: 'smart',
    keepLast: 15,
    autoKeep: true,
    scrollBottomEnabled: true,
    wordCounterEnabled: true,
    textFormatterEnabled: true,
    modernWebChatEnabled: false,
    cleanerEnabled: false,
    draftSaverEnabled: true
  };

  const moduleApi = window.StudioLab || {};
  const modules = typeof moduleApi.getModules === 'function' ? moduleApi.getModules() : [];
  const moduleById = new Map(modules.map(module => [module.id, module]));
  const groupById = new Map(GROUPS.map(group => [group.id, group]));

  const state = buildInitialState();
  const ctx = {
    state,
    modules,
    setState,
    saveState,
    getTurnCount,
    refreshLiveStats,
    html
  };

  let initialized = false;
  let injected = false;
  let modalEl = null;
  let modalScope = null;
  let returnFocus = null;
  let liveStatsInterval = null;
  let lastUrl = location.href;
  let currentRoute = readRoute();
  let activeTab = 'all';
  let searchQuery = '';
  let lastLocalSave = '';
  let telemetryStatus = null;
  let updateStatus = null;
  let updateCheckPending = null;
  const moduleErrors = new Map();
  const recentErrors = [];

  function recordError(moduleId, err, phase = 'runtime') {
    const message = err?.message || String(err);
    const stack = err?.stack ? err.stack.split('\n').slice(0, 3).join('\n') : null;
    moduleErrors.set(moduleId, message);
    recentErrors.push({
      module: moduleId,
      phase,
      message,
      stack,
      time: new Date().toISOString()
    });
    if (recentErrors.length > 20) recentErrors.shift();
  }

  function callModule(module, method, ...args) {
    if (!module || typeof module[method] !== 'function') return undefined;
    try {
      return module[method](...args);
    } catch (err) {
      recordError(module.id || 'unknown', err, method);
      if (window.StudioLab && window.StudioLab.log) {
        window.StudioLab.log(`Error in module ${module.id || 'unknown'} ${method}: ` + err, 'error');
      }
      return undefined;
    }
  }

  // Start critical UI watchers immediately
  waitForSidebar();
  startRouteWatcher();

  chrome.storage.local.get([STORAGE_KEY], (data) => {
    if (data && data[STORAGE_KEY]) {
      Object.assign(state, data[STORAGE_KEY]);
      normalizeState();
    }

    initialized = true;
    initModules();
    refreshLiveStats();
    checkUpdates();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[STORAGE_KEY] || !initialized) return;

    const incoming = changes[STORAGE_KEY].newValue || {};
    const incomingJson = JSON.stringify(incoming);
    if (incomingJson === lastLocalSave) {
      lastLocalSave = '';
      return;
    }

    const prev = snapshotState();
    Object.assign(state, incoming);
    normalizeState();
    notifyModules(prev);
    updateModalState();
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.action === 'openStudioLab') openModal();
  });
  window.addEventListener('__sl_openSettings', () => openModal());

  function buildInitialState() {
    const initial = Object.assign({}, DEFAULT_STATE);
    modules.forEach((module) => {
      if (module.defaults) Object.assign(initial, module.defaults);
    });
    return initial;
  }

  function normalizeState() {
    if (!['smart', 'hard'].includes(state.optimizerMode)) state.optimizerMode = 'smart';

    state.keepLast = Math.max(2, parseInt(state.keepLast, 10) || 15);
    state.bypassEnabled = !!state.bypassEnabled;
    state.optimizerEnabled = !!state.optimizerEnabled;
    state.autoKeep = !!state.autoKeep;
    state.scrollBottomEnabled = !!state.scrollBottomEnabled;
    state.wordCounterEnabled = !!state.wordCounterEnabled;
    state.textFormatterEnabled = state.textFormatterEnabled !== false;
    state.modernWebChatEnabled = !!state.modernWebChatEnabled;
    state.cleanerEnabled = !!state.cleanerEnabled;
    state.draftSaverEnabled = state.draftSaverEnabled !== false;
  }

  function snapshotState() {
    return Object.assign({}, state);
  }

  function setState(patch, options = {}) {
    const prev = snapshotState();
    Object.assign(state, patch);
    normalizeState();

    if (options.save !== false) saveState();
    notifyModules(prev);

    if (options.render === false) updateModalState();
    else refreshModal();
  }

  function saveState() {
    try {
      if (!chrome.runtime || !chrome.runtime.id) return;
      lastLocalSave = JSON.stringify(state);
      chrome.storage.local.set({ [STORAGE_KEY]: state });
    } catch (_) {
      if (window.StudioLab && window.StudioLab.log) window.StudioLab.log('Extension context invalidated. Hard refresh AI Studio.', 'warn');
    }
  }

  function initModules() {
    modules.forEach((module) => {
      callModule(module, 'init', ctx);
    });
    notifyModules(null);
  }

  function notifyModules(prevState) {
    modules.forEach((module) => {
      callModule(module, 'onStateChange', ctx, prevState);
    });
  }

  function readRoute() {
    return { url: location.href, key: location.pathname.replace(/\/+$/, '') || '/' };
  }

  function notifyRouteChange(current, previous) {
    modules.forEach((module) => {
      callModule(module, 'onRouteChange', ctx, current, previous);
    });
    window.dispatchEvent(new CustomEvent('__sl_routeChanged', {
      detail: { url: current.url, current, previous }
    }));
  }

  function startRouteWatcher() {
    setInterval(() => {
      if (location.href === lastUrl) return;

      lastUrl = location.href;
      const previousRoute = currentRoute;
      currentRoute = readRoute();
      injected = false;
      notifyRouteChange(currentRoute, previousRoute);
      waitForSidebar();
      refreshLiveStats();
      if (window.StudioLab && window.StudioLab.log) window.StudioLab.log('SPA navigation detected. Module state refreshed.', 'info');
    }, 500);
  }

  function waitForSidebar() {
    // 1. Purge any misplaced button from the left navigation toolbar
    const oldBtns = document.querySelectorAll('.sl-sidebar-btn');
    oldBtns.forEach(b => b.remove());

    // 2. Inject into the Settings menu directly below "User settings"
    const tryInjectIntoSettingsMenu = () => {
      const menuPanels = document.querySelectorAll('.cdk-overlay-container .mat-mdc-menu-panel:not([data-sl-settings-processed])');
      menuPanels.forEach(panel => {
        // Find User Settings item inside menu
        const items = panel.querySelectorAll('button.mat-mdc-menu-item, a.mat-mdc-menu-item');
        let userSettingsItem = null;
        for (const item of items) {
          const txt = item.textContent.trim().toLowerCase();
          if (
            item.getAttribute('data-test-id') === 'user-settings-menu' ||
            txt.includes('user settings') ||
            txt.includes('user setting') ||
            item.getAttribute('aria-label')?.toLowerCase().includes('user setting')
          ) {
            userSettingsItem = item;
            break;
          }
        }

        if (!userSettingsItem) return;
        panel.setAttribute('data-sl-settings-processed', 'true');
        if (panel.querySelector('.sl-user-settings-item')) return;

        const slItem = document.createElement('button');
        slItem.type = 'button';
        slItem.setAttribute('mat-menu-item', '');
        slItem.className = 'mat-mdc-menu-item mat-focus-indicator sl-user-settings-item';
        slItem.setAttribute('role', 'menuitem');

        const textSpan = document.createElement('span');
        textSpan.className = 'mat-mdc-menu-item-text';

        const icon = document.createElement('span');
        icon.className = 'material-symbols-outlined notranslate';
        icon.textContent = 'science';

        const label = document.createElement('span');
        label.textContent = 'Studio.lab Settings';

        textSpan.appendChild(icon);
        textSpan.appendChild(label);
        slItem.appendChild(textSpan);

        const ripple = document.createElement('div');
        ripple.setAttribute('matripple', '');
        ripple.className = 'mat-ripple mat-mdc-menu-ripple';
        slItem.appendChild(ripple);

        slItem.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const backdrop = document.querySelector('.cdk-overlay-backdrop');
          if (backdrop) backdrop.click();
          openModal();
        });

        userSettingsItem.insertAdjacentElement('afterend', slItem);
      });
    };

    // Run on any DOM change / menu overlay opening
    if (!window._slMenuObserver) {
      window._slMenuObserver = new MutationObserver(() => {
        // Keep old bottom icon row clean
        const rogueBtns = document.querySelectorAll('.v3-left-nav .sl-sidebar-btn, ms-side-nav .sl-sidebar-btn');
        rogueBtns.forEach(b => b.remove());

        tryInjectIntoSettingsMenu();
      });
      window._slMenuObserver.observe(document.documentElement, { 
        childList: true, 
        subtree: true 
      });
    }

    tryInjectIntoSettingsMenu();
  }

  function showHealthCheckWarning() {
    if (document.querySelector('.sl-health-check-toast')) return;
    const toast = document.createElement('div');
    toast.className = 'sl-health-check-toast';
    toast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#333;color:#fff;padding:12px 16px;border-radius:8px;z-index:999999;box-shadow:0 4px 12px rgba(0,0,0,0.3);font-family:sans-serif;font-size:14px;display:flex;align-items:center;gap:12px;';
    toast.innerHTML = `
      <span>⚠️ Можливо, Google оновив інтерфейс. Деякі функції Studio.lab можуть не працювати.</span>
      <button style="background:none;border:none;color:#fff;cursor:pointer;padding:4px;" aria-label="Close">✕</button>
    `;
    toast.querySelector('button').addEventListener('click', () => toast.remove());
    document.body.appendChild(toast);
    setTimeout(() => { if (document.body.contains(toast)) toast.remove(); }, 15000);
  }

  function openModal() {
    if (!initialized || !document.body) return;
    if (modalEl) closeModal();
    returnFocus = document.activeElement;
    modalScope = window.StudioLab.createScope ? window.StudioLab.createScope() : null;

    modalEl = document.createElement('div');
    modalEl.className = 'sl-overlay';
    modalEl.addEventListener('click', (event) => {
      if (event.target === modalEl) closeModal();
    });

    modalEl.innerHTML = renderDialog();
    document.body.appendChild(modalEl);

    bindModalEvents();
    startLiveStats();
    document.addEventListener('keydown', escHandler);

    const searchInput = modalEl.querySelector('[data-sl-search-input]');
    if (searchInput) searchInput.focus();

    refreshDiagnostics();
    refreshUpdateInfo();
    chrome.runtime.sendMessage({ action: 'getTelemetryStatus' }).then(result => {
      telemetryStatus = result || null;
      refreshDiagnostics();
    }).catch(() => {});
  }

  function refreshUpdateInfo() {
    if (!modalEl) return;
    const status = modalEl.querySelector('[data-sl-update-status]');
    const button = modalEl.querySelector('[data-sl-check-updates]');
    const link = modalEl.querySelector('[data-sl-release-link]');
    if (button) button.disabled = !!updateCheckPending;
    if (status) {
      status.textContent = updateCheckPending ? 'Checking for updates…'
        : !updateStatus ? 'Not checked yet'
        : !updateStatus.ok ? 'Could not check GitHub'
        : updateStatus.updateAvailable ? `Update ${updateStatus.latestVersion} available${updateStatus.stale ? ' (cached)' : ''}`
        : updateStatus.stale ? 'Could not refresh GitHub (cached result)'
        : 'Up to date';
    }
    if (link) {
      link.hidden = !updateStatus?.updateAvailable || !updateStatus.releaseUrl;
      if (!link.hidden) link.href = updateStatus.releaseUrl;
      else link.removeAttribute('href');
    }
  }

  async function checkUpdates(force = false) {
    if (updateCheckPending) return updateCheckPending;
    if (typeof chrome.runtime?.sendMessage !== 'function') return;
    updateCheckPending = Promise.resolve().then(() => chrome.runtime.sendMessage({ action: 'checkForUpdates', force }))
      .then(async result => {
        updateStatus = result || { ok: false };
        if (!result?.updateAvailable || !result.latestVersion || !result.releaseUrl) return;
        const stored = await chrome.storage.local.get(['slDismissedUpdateTag']);
        if (stored.slDismissedUpdateTag !== result.latestVersion) showUpdatePopup(result);
      })
      .catch(() => { updateStatus = { ok: false }; })
      .finally(() => { updateCheckPending = null; refreshUpdateInfo(); });
    refreshUpdateInfo();
    return updateCheckPending;
  }

  function showUpdatePopup(release) {
    if (document.querySelector('.sl-update-overlay')) return;
    const overlay = document.createElement('div');
    overlay.className = 'sl-update-overlay';
    const popup = document.createElement('div');
    popup.className = 'sl-update-popup';
    popup.style.setProperty('--sl-update-background', `url("${chrome.runtime.getURL('images/update-space.webp')}")`);
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-modal', 'true');
    popup.setAttribute('aria-labelledby', 'sl-update-title');
    popup.setAttribute('aria-describedby', 'sl-update-description');
    popup.tabIndex = -1;
    popup.innerHTML = `
      <div class="sl-update-popup-content">
        <span class="sl-update-popup-brand"><img src="${chrome.runtime.getURL('images/SL_logotype.svg')}" alt="" aria-hidden="true">Studio.lab</span>
        <h2 id="sl-update-title">A new version <span>is here!</span></h2>
        <p id="sl-update-description">Studio.lab <strong data-sl-latest-version></strong> is ready. See what's new before you update.</p>
        <div class="sl-update-popup-actions">
          <button type="button">Dismiss</button>
          <a target="_blank" rel="noopener noreferrer">View release ${renderIcon('arrow_outward', 'detail')}</a>
        </div>
      </div>
      `;
    popup.querySelector('[data-sl-latest-version]').textContent = `v${String(release.latestVersion).replace(/^v/i, '')}`;
    const releaseLink = popup.querySelector('.sl-update-popup-actions a');
    releaseLink.href = release.releaseUrl;
    const returnFocus = document.activeElement;
    const closePopup = (rememberDismissal = false) => {
      if (rememberDismissal) {
        chrome.storage.local.set({ slDismissedUpdateTag: release.latestVersion }).catch(() => {});
      }
      document.removeEventListener('keydown', onKeyDown, true);
      overlay.remove();
      if (returnFocus?.isConnected && typeof returnFocus.focus === 'function') returnFocus.focus();
    };
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closePopup();
      } else if (event.key === 'Tab') {
        const dismissButton = popup.querySelector('button');
        if (event.shiftKey && (document.activeElement === dismissButton || document.activeElement === popup)) {
          event.preventDefault();
          releaseLink.focus();
        } else if (!event.shiftKey && document.activeElement === releaseLink) {
          event.preventDefault();
          dismissButton.focus();
        }
      }
    };
    popup.querySelector('button').addEventListener('click', () => closePopup(true));
    overlay.addEventListener('click', event => {
      if (event.target === overlay) closePopup();
    });
    overlay.appendChild(popup);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKeyDown, true);
    popup.focus();
  }

  function closeModal() {
    if (modalScope) {
      modalScope.dispose();
      modalScope = null;
    }
    if (modalEl) {
      modalEl.remove();
      modalEl = null;
    }
    stopLiveStats();
    document.removeEventListener('keydown', escHandler);
    if (returnFocus && returnFocus.isConnected && typeof returnFocus.focus === 'function') {
      returnFocus.focus();
    }
    returnFocus = null;
  }

  function refreshModal() {
    if (!modalEl) return;
    if (modalScope) {
      modalScope.dispose();
      modalScope = window.StudioLab.createScope ? window.StudioLab.createScope() : null;
    }
    modalEl.innerHTML = renderDialog();
    bindModalEvents();
    refreshLiveStats();
    refreshDiagnostics();
    refreshUpdateInfo();
  }

  function renderDialog() {
    const tabs = TABS.map(t => renderTabButton(t.id, t.label)).join('');

    return `
      <div class="sl-dialog" role="dialog" aria-modal="true" aria-label="Studio.lab Settings">
        <div class="sl-dialog-header">
          <h2>Studio.lab Settings</h2>
          <button type="button" class="sl-close-btn" data-sl-close aria-label="Close">
            ${renderIcon('close', 'plain')}
          </button>
        </div>

        <div class="sl-search-field">
          <div class="sl-search-container">
            ${renderIcon('search', 'search')}
            <input type="text" data-sl-search-input placeholder="Search settings..." aria-label="Search settings" value="${html(searchQuery)}" style="background: transparent !important; background-color: transparent !important; border: none !important; outline: none !important; box-shadow: none !important;">
            <button type="button" class="sl-search-clear ${searchQuery ? 'visible' : ''}" data-sl-search-clear aria-label="Clear search">
              ${renderIcon('close', 'plain')}
            </button>
          </div>
        </div>

        <div class="sl-tabs-header" role="tablist">
          ${tabs}
        </div>

        <div class="sl-dialog-body">
          <div class="sl-dialog-content">
            ${GROUPS.map(renderGroupTab).join('')}
            ${renderInfoTab()}
          </div>
          ${renderDonation()}
        </div>
      </div>
    `;
  }

  function renderTabButton(tabId, label) {
    return `
      <button type="button" class="sl-tab-btn ${activeTab === tabId ? 'active' : ''}" data-sl-tab="${tabId}" role="tab" aria-selected="${activeTab === tabId}">
        ${html(label)}
      </button>
    `;
  }

  function renderGroupTab(group) {
    const groupModules = modules.filter(module => module.group === group.id);
    const isDisabled = group.enabledKey && !state[group.enabledKey];
    const activeClass = (activeTab === group.tabId || activeTab === 'all') ? 'active' : '';

    return `
      <div class="sl-tab-content ${activeClass}" data-sl-tab-content="${group.tabId}" role="tabpanel">
        <div class="sl-section" data-sl-section="${group.id}">
          <div class="sl-header-row">
            <div class="sl-header-text">
              <div class="sl-section-title">${html(group.title)}</div>
              <div class="sl-section-desc">${html(group.description)}</div>
            </div>
            ${group.enabledKey ? renderGroupToggle(group) : ''}
          </div>

          <div class="sl-mode-list ${isDisabled ? 'disabled' : ''}" data-sl-module-list="${group.id}">
            ${group.showTurnCounter ? renderTurnCounter() : ''}
            ${groupModules.map(renderModuleItem).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function renderGroupToggle(group) {
    const isActive = !!state[group.enabledKey];
    return `
      <button type="button" role="switch" aria-checked="${isActive}" class="sl-auto-toggle ${isActive ? 'active' : ''}" data-sl-group-toggle="${group.id}" aria-label="Toggle ${html(group.title)}"></button>
    `;
  }

  function renderTurnCounter() {
    return `
      <div class="sl-turn-counter">
        <span>Active turns in DOM:</span>
        <span class="sl-count-num" data-sl-live="turn-count">${getTurnCount()}</span>
      </div>
    `;
  }

  function renderModuleItem(module) {
    const searchText = (module.title || '').toLowerCase();

    return `
      <div class="sl-module-item" data-sl-module-item="${html(module.id)}" data-sl-search="${html(searchText)}">
        ${renderModuleRow(module)}
        ${callModule(module, 'renderControls', ctx) || ''}
      </div>
    `;
  }

  function renderModuleRow(module) {
    const isSelected = isModuleSelected(module);
    const details = module.details && module.details.length
      ? `
        <div class="model-details">
          <ul>
            ${module.details.map(detail => `
              <li class="model-carousel-row-detail">
                <span>${html(detail.text)}</span>
              </li>
            `).join('')}
          </ul>
        </div>
      `
      : '';

    const tag = module.alwaysSelected ? 'div' : 'button';
    const typeAttr = module.alwaysSelected ? '' : 'type="button"';
    const staticClass = module.alwaysSelected ? 'static' : '';
    const ariaPressed = module.alwaysSelected ? '' : `aria-pressed="${isSelected}"`;

    return `
      <${tag} ${typeAttr} ${ariaPressed} class="sl-mode-row ${isSelected ? 'selected' : ''} ${staticClass}" data-sl-module-id="${html(module.id)}">
        <div class="row-header">
          <div class="row-header-text">
            <div class="model-title">
              <span class="model-title-text">${html(module.title)}</span>
              ${renderBadge(module.badge)}
            </div>
            <span class="model-subtitle">${html(module.subtitle || '')}</span>
          </div>
        </div>
        ${details}
      </${tag}>
    `;
  }

  function renderBadge(badge) {
    if (!badge) return '';
    return `
      <span class="badge ${html(badge.className || '')}">
        <span class="badge-dot"></span>${html(badge.text)}
      </span>
    `;
  }

  function renderIcon(name, variant) {
    const icon = ICONS[name] || ICONS.check;
    return `
      <span class="sl-icon-wrap sl-icon-wrap--${html(variant || 'detail')}" aria-hidden="true">
        <svg class="sl-icon" viewBox="0 0 24 24" focusable="false">
          ${icon}
        </svg>
      </span>
    `;
  }

  function renderInfoTab() {
    const activeClass = activeTab === 'info' ? 'active' : '';

    return `
      <div class="sl-tab-content ${activeClass}" data-sl-tab-content="info" role="tabpanel">
        <div class="sl-section">
          <div class="sl-header-row">
            <div class="sl-header-text">
              <div class="sl-section-title">ABOUT STUDIO.LAB</div>
              <div class="sl-section-desc">Unofficial extension for Google AI Studio. v${VERSION}</div>
            </div>
          </div>
          <div class="sl-info-body">
            <div class="sl-info-card sl-health-card">
              <div class="sl-health-heading">
                <div>
                  <p class="sl-health-title" data-sl-diag-badge>All Systems Operational</p>
                  <p class="sl-health-subtitle">Studio.lab is ready on this page.</p>
                </div>
                <span class="sl-health-mark" aria-hidden="true"></span>
              </div>
              <div class="sl-health-meta">
                <span>Installed v${html(VERSION)}</span>
                <span data-sl-update-status>Checking for updates…</span>
              </div>
              <div class="sl-health-actions">
                <button type="button" class="sl-apply-btn" data-sl-check-updates>Check for updates</button>
                <a class="sl-apply-btn" data-sl-release-link target="_blank" rel="noopener noreferrer" hidden>View release</a>
              </div>
            </div>
            <div class="sl-info-card" style="background: var(--color-v3-surface-container-high); border-radius: 12px; padding: 16px; margin-bottom: 12px;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
                ${renderIcon('storage', 'detail')}<span style="color: var(--color-v3-text); font-size: 13px;">Settings are saved locally with Chrome storage.</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                ${renderIcon('visibility_off', 'detail')}<span style="color: var(--color-v3-text); font-size: 13px;">No analytics. Update checks contact only GitHub; no chats or account data are sent.</span>
              </div>
            </div>
            <div class="sl-info-card" style="background: var(--color-v3-surface-container-high); border-radius: 12px; padding: 16px; margin-bottom: 12px; border: 1px solid var(--color-v3-outline-var, #2a2a2a);">
              <p style="margin: 0 0 10px; font-size: 13px; font-weight: 500; color: var(--color-v3-text);">System Diagnostics & Compatibility</p>
              <p style="font-size: 12px; color: #a8abb0; margin: 0 0 10px 0; line-height: 1.5;">
                Exports a sanitized technical report to attach to bug reports. Never includes chat messages, prompt text, user emails, or API credentials.
              </p>
              <button type="button" class="sl-apply-btn sl-diag-copy-btn" data-sl-copy-diagnostics>
                <span class="material-symbols-outlined notranslate" aria-hidden="true">content_copy</span>
                <span class="sl-copy-label">Copy Diagnostics</span>
              </button>
              <details style="margin-top: 8px;">
                <summary style="cursor: pointer; font-size: 12px; color: var(--color-v3-text); user-select: none; padding: 4px 0;">View Diagnostic Snapshot</summary>
                <pre class="sl-diagnostics-snapshot" data-sl-diagnostics></pre>
              </details>
            </div>
            <div class="sl-info-card" style="background: var(--color-v3-surface-container-high); border-radius: 12px; padding: 16px;">
              <p style="margin: 0 0 12px 0; font-size: 13px; font-weight: 500; color: var(--color-v3-text);">Community & Updates</p>
              <a href="https://reddit.com/r/GoogleAIStudio/" target="_blank" rel="noreferrer" style="color: var(--color-v3-text); text-decoration: none; display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: var(--color-v3-surface-container-highest); border-radius: 8px; margin-bottom: 8px;">
                <svg viewBox="0 0 24 24" style="width: 18px; height: 18px; flex-shrink: 0; fill: #FF4500;"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.688-.561-1.25-1.25-1.25zm-2.75 3.846c-1.353 0-2.457-.34-2.827-.811-.08-.101-.064-.249.037-.329.1-.08.246-.064.327.037.233.294 1.134.603 2.463.603 1.329 0 2.23-.309 2.463-.603.081-.101.228-.117.328-.037.101.08.118.228.038.329-.37.471-1.474.811-2.827.811z"/></svg>
                <span style="font-size: 13px; font-weight: 500;">r/GoogleAIStudio</span>
              </a>
              <a href="https://github.com/dorimommy/Studio.lab" target="_blank" rel="noreferrer" style="color: var(--color-v3-text); text-decoration: none; display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: var(--color-v3-surface-container-highest); border-radius: 8px; margin-bottom: 8px;">
                <svg viewBox="0 0 24 24" style="width: 18px; height: 18px; flex-shrink: 0; fill: var(--color-v3-text);"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                <span style="font-size: 13px; font-weight: 500;">Source code</span>
              </a>
              <div style="border-top: 1px solid var(--color-v3-outline-var); margin: 12px 0; padding-top: 12px;">
                <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 500; color: var(--color-v3-text);">Useful Links</p>
              </div>
              <a href="https://reddit.com/r/GeminiAI/" target="_blank" rel="noreferrer" style="color: var(--color-v3-text); text-decoration: none; display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: var(--color-v3-surface-container-highest); border-radius: 8px;">
                <svg viewBox="0 0 24 24" style="width: 18px; height: 18px; flex-shrink: 0; fill: #FF4500;"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.688-.561-1.25-1.25-1.25zm-2.75 3.846c-1.353 0-2.457-.34-2.827-.811-.08-.101-.064-.249.037-.329.1-.08.246-.064.327.037.233.294 1.134.603 2.463.603 1.329 0 2.23-.309 2.463-.603.081-.101.228-.117.328-.037.101.08.118.228.038.329-.37.471-1.474.811-2.827.811z"/></svg>
                <span style="font-size: 13px; font-weight: 500;">r/GeminiAI</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderDonation() {
    return `
      <div class="sl-donation-wrap">
        <a href="https://ko-fi.com/astierdoriana" target="_blank" rel="noreferrer" class="sl-donation-banner">
          <img src="${chrome.runtime.getURL('images/Support_Banner.png')}" alt="Support Studio.lab" class="sl-banner-img">
        </a>
        <div class="sl-footer">Unofficial extension. Not affiliated with Google or AI Studio.</div>
      </div>
    `;
  }

  function bindModalEvents() {
    if (!modalEl) return;

    const closeButton = modalEl.querySelector('[data-sl-close]');
    if (closeButton) closeButton.addEventListener('click', closeModal);

    modalEl.querySelectorAll('[data-sl-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        activeTab = button.dataset.slTab;
        updateTabs();
        applySearchFilter();
        button.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      });
    });

    const searchInput = modalEl.querySelector('[data-sl-search-input]');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        searchQuery = searchInput.value;
        const clearButton = modalEl.querySelector('[data-sl-search-clear]');
        if (clearButton) clearButton.classList.toggle('visible', !!searchQuery);
        applySearchFilter();
      });
    }

    const clearSearch = modalEl.querySelector('[data-sl-search-clear]');
    if (clearSearch) {
      clearSearch.addEventListener('click', () => {
        searchQuery = '';
        const input = modalEl.querySelector('[data-sl-search-input]');
        if (input) input.value = '';
        clearSearch.classList.remove('visible');
        applySearchFilter();
        if (input) input.focus();
      });
    }

    modalEl.querySelectorAll('[data-sl-group-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const group = groupById.get(button.dataset.slGroupToggle);
        if (!group || !group.enabledKey) return;
        setState({ [group.enabledKey]: !state[group.enabledKey] }, { render: false });
      });
    });

    modalEl.querySelectorAll('[data-sl-module-id]').forEach((button) => {
      button.addEventListener('click', () => {
        handleModuleClick(button.dataset.slModuleId);
      });
    });

    modules.forEach((module) => {
      const dispose = callModule(module, 'bindControls', modalEl, ctx);
      if (typeof dispose === 'function' && modalScope) modalScope.add(dispose);
    });

    const copyBtn = modalEl.querySelector('[data-sl-copy-diagnostics]');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        const btnText = copyBtn.querySelector('.sl-copy-label');
        try {
          const diag = getDiagnostics();
          await navigator.clipboard.writeText(JSON.stringify(diag, null, 2));
          if (btnText) btnText.textContent = 'Copied to clipboard!';
          setTimeout(() => { if (btnText) btnText.textContent = 'Copy Diagnostics'; }, 2200);
        } catch (_) {
          if (btnText) btnText.textContent = 'Copy failed (check permissions)';
        }
      });
    }

    const checkUpdatesBtn = modalEl.querySelector('[data-sl-check-updates]');
    if (checkUpdatesBtn) checkUpdatesBtn.addEventListener('click', () => checkUpdates(true));

    updateModalState();
    applySearchFilter();
  }

  function handleModuleClick(moduleId) {
    const module = moduleById.get(moduleId);
    if (!module) return;

    if (module.enabledKey && !state[module.enabledKey]) return;

    if (module.modeKey) {
      setState({ [module.modeKey]: module.modeValue }, { render: false });
      return;
    }

    if (module.stateKey) {
      setState({ [module.stateKey]: !state[module.stateKey] }, { render: false });
    }
  }

  function isModuleSelected(module) {
    if (module.alwaysSelected) return true;
    if (module.modeKey) return state[module.modeKey] === module.modeValue;
    if (module.stateKey) return !!state[module.stateKey];
    return false;
  }

  function isModuleEnabled(module) {
    if (!module) return false;
    if (module.enabledKey && !state[module.enabledKey]) return false;
    if (module.stateKey) return !!state[module.stateKey];
    if (module.modeKey) return state[module.modeKey] === module.modeValue;
    return true;
  }

  function updateModalState() {
    if (!modalEl) return;

    GROUPS.forEach((group) => {
      if (group.enabledKey) {
        const enabled = !!state[group.enabledKey];
        const toggle = modalEl.querySelector(`[data-sl-group-toggle="${group.id}"]`);
        const list = modalEl.querySelector(`[data-sl-module-list="${group.id}"]`);

        if (toggle) {
          toggle.classList.toggle('active', enabled);
          toggle.setAttribute('aria-checked', String(enabled));
        }
        if (list) list.classList.toggle('disabled', !enabled);
      }
    });

    modules.forEach((module) => {
      const row = modalEl.querySelector(`[data-sl-module-id="${cssEscape(module.id)}"]`);
      if (row) {
        row.classList.toggle('selected', isModuleSelected(module));
        if (!module.alwaysSelected) row.setAttribute('aria-pressed', String(isModuleSelected(module)));
      }

      callModule(module, 'updateControls', modalEl, ctx);
    });

    refreshLiveStats();
    refreshDiagnostics();
  }

  function updateTabs() {
    if (!modalEl) return;

    modalEl.querySelectorAll('[data-sl-tab]').forEach((button) => {
      const isActive = button.dataset.slTab === activeTab;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', String(isActive));
    });

    modalEl.querySelectorAll('[data-sl-tab-content]').forEach((content) => {
      const tabId = content.dataset.slTabContent;
      const isActive = tabId === activeTab || (activeTab === 'all' && tabId !== 'info');
      content.classList.toggle('active', isActive);
    });
  }

  function applySearchFilter() {
    if (!modalEl) return;

    const query = searchQuery.trim().toLowerCase();

    // When searching, switch to 'all' to search across everything
    if (query && activeTab !== 'all') {
      activeTab = 'all';
      updateTabs();
    }

    // Apply filter to all visible tab-contents
    modalEl.querySelectorAll('.sl-tab-content.active').forEach(panel => {
      let anyVisible = false;
      panel.querySelectorAll('[data-sl-module-item]').forEach((item) => {
        const haystack = item.getAttribute('data-sl-search') || '';
        const match = !query || haystack.includes(query);
        item.hidden = !match;
        if (match) anyVisible = true;
      });

      // Hide entire section (header + module list) when searching and nothing matches
      const section = panel.querySelector('[data-sl-section]');
      if (section) {
        if (query && !anyVisible) {
          panel.style.display = 'none';
        } else {
          panel.style.display = '';
        }
      }
    });
  }

  function startLiveStats() {
    stopLiveStats();
    liveStatsInterval = setInterval(refreshLiveStats, 2000);
    refreshLiveStats();
  }

  function stopLiveStats() {
    if (!liveStatsInterval) return;
    clearInterval(liveStatsInterval);
    liveStatsInterval = null;
  }

  function refreshLiveStats() {
    if (!modalEl) return;

    const count = getTurnCount();
    modalEl.querySelectorAll('[data-sl-live="turn-count"]').forEach((element) => {
      element.textContent = String(count);
    });

    modules.forEach((module) => {
      callModule(module, 'updateControls', modalEl, ctx);
    });
  }

  function getTurnCount() {
    const sel = (window.StudioLab && window.StudioLab.SELECTORS) 
      ? window.StudioLab.SELECTORS.CHAT_TURN 
      : 'ms-chat-turn';
    return document.querySelectorAll(sel).length;
  }

  function getDiagnostics() {
    const ngVersion = document.querySelector('[ng-version]')?.getAttribute('ng-version') || 
                      document.querySelector('app-root')?.getAttribute('ng-version') || 
                      'Not detected';

    const criticalSelectors = {
      promptTextarea: 'ms-prompt-box textarea',
      promptBox: 'ms-prompt-box',
      runSettings: 'ms-run-settings',
      modelSelector: 'ms-model-selector',
      thinkingSelector: 'ms-thinking-level-setting, mat-select[aria-label*="Thinking" i]',
      chatSession: 'ms-chat-session',
      chatTurns: 'ms-chat-turn',
      stopButton: 'ms-run-button button.stop, [data-test-id="stop-button"]',
      systemInstructions: 'ms-system-instructions, textarea[aria-label*="System instructions" i]'
    };

    const domCheck = {};
    let missingCount = 0;
    for (const [name, sel] of Object.entries(criticalSelectors)) {
      const foundNodes = document.querySelectorAll(sel);
      domCheck[name] = {
        selector: sel,
        found: foundNodes.length > 0,
        count: foundNodes.length
      };
      if (foundNodes.length === 0 && name !== 'stopButton') {
        missingCount++;
      }
    }

    return {
      timestamp: new Date().toISOString(),
      extension: {
        version: VERSION,
        activeTab: activeTab
      },
      environment: {
        userAgent: navigator.userAgent,
        platform: navigator.userAgentData?.platform || navigator.platform,
        viewport: `${window.innerWidth}x${window.innerHeight} (dpr: ${window.devicePixelRatio || 1})`,
        language: navigator.language
      },
      aiStudio: {
        origin: location.origin,
        pathname: location.pathname,
        isChat: /^\/prompts\/(?:new_chat|[^/]+)$/.test(location.pathname),
        angularVersion: ngVersion,
        chatTurnCount: getTurnCount()
      },
      signalsAndEngine: {
        lviewMapAvailable: typeof window.__NG_LVIEW_MAP__ !== 'undefined',
        lviewEntriesCount: window.__NG_LVIEW_MAP__ ? window.__NG_LVIEW_MAP__.size : null,
        dynamicStudioApiReady: typeof window.__SL_DYNAMIC_API_READY__ !== 'undefined' 
          ? window.__SL_DYNAMIC_API_READY__ 
          : (typeof window.DynamicStudioAPI !== 'undefined'),
        modernWebChatStyleApplied: document.body.classList.contains('modern-web-chat-enabled')
      },
      telemetry: telemetryStatus ? {
        rulesActive: telemetryStatus.enabled,
        statusOk: telemetryStatus.ok,
        error: telemetryStatus.error || null
      } : 'Checking...',
      domHealth: {
        missingCount,
        selectors: domCheck
      },
      modules: modules.map(m => ({
        id: m.id,
        title: m.title,
        group: m.group,
        enabled: isModuleEnabled(m),
        hasError: moduleErrors.has(m.id),
        lastError: moduleErrors.get(m.id) || null
      })),
      recentErrors: recentErrors.slice(-10)
    };
  }

  function refreshDiagnostics() {
    if (!modalEl) return;
    const diag = getDiagnostics();
    const pre = modalEl.querySelector('[data-sl-diagnostics]');
    if (pre) pre.textContent = JSON.stringify(diag, null, 2);

    const statusBadge = modalEl.querySelector('[data-sl-diag-badge]');
    if (statusBadge) {
      const hasErrors = moduleErrors.size > 0 || recentErrors.length > 0;
      const missing = diag.domHealth.missingCount;
      const healthCard = statusBadge.closest('.sl-health-card');
      const subtitle = healthCard?.querySelector('.sl-health-subtitle');
      if (hasErrors) {
        statusBadge.textContent = `${moduleErrors.size} Module Error(s) Reported`;
        if (healthCard) healthCard.dataset.health = 'error';
        if (subtitle) subtitle.textContent = 'Some modules need attention. See diagnostics below.';
      } else if (missing > 3) {
        statusBadge.textContent = `UI Elements Unmounted (${missing} missing)`;
        if (healthCard) healthCard.dataset.health = 'warning';
        if (subtitle) subtitle.textContent = 'AI Studio may have changed. Review compatibility below.';
      } else {
        statusBadge.textContent = 'All Systems Operational';
        if (healthCard) healthCard.dataset.health = 'ok';
        if (subtitle) subtitle.textContent = 'Studio.lab is ready on this page.';
      }
    }
  }

  function escHandler(event) {
    if (event.key === 'Escape') closeModal();
    if (event.key !== 'Tab' || !modalEl) return;
    const focusable = [...modalEl.querySelectorAll('button, input, textarea, a[href], [tabindex="0"]')]
      .filter(node => !node.disabled && node.getClientRects().length);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function html(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value);
    }
    return String(value).replace(/["\\]/g, '\\$&');
  }

  if (window.StudioLab && window.StudioLab.log) {
    window.StudioLab.log(`v${VERSION} shell loaded (${modules.length} modules)`, 'info');
  }
})();
