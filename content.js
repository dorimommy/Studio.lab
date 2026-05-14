/**
 * content.js - Studio.lab shell
 *
 * The feature logic lives in modules/*.js. This file owns shared state,
 * sidebar injection, modal rendering, and module lifecycle dispatch.
 */
(function () {
  'use strict';

  const VERSION = '1.0';
  const STORAGE_KEY = 'slState';
  const ICONS = {
    bolt: '<path d="M13 2 4 14h7l-1 8 10-13h-7l0-7z"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/>',
    storage: '<path d="M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
    delete: '<path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 14h10l1-14"/><path d="M9 7V4h6v3"/>',
    south: '<path d="M12 4v14"/><path d="m6 12 6 6 6-6"/>',
    calculate: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8"/><path d="M8 11h2"/><path d="M12 11h2"/><path d="M16 11h0"/><path d="M8 15h2"/><path d="M12 15h2"/><path d="M16 15h0"/>',
    rocket_launch: '<path d="M5 19c1.5-.3 3-.9 4-2"/><path d="M6 14 4 10l4-1 7-7 3 3-7 7-1 4-4-2z"/><path d="m14 4 6 6"/><path d="M4 22l4-4"/>',
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

  const GROUPS = [
    {
      id: 'bypass',
      tab: 'Bypass',
      title: 'CONTENT BYPASS',
      description: 'Bypass content filters and blocked response streams.',
      enabledKey: 'bypassEnabled'
    },
    {
      id: 'optimizer',
      tab: 'Optimization',
      title: 'CHAT OPTIMIZER',
      description: 'Remove old chat turns from memory to eliminate UI lag.',
      enabledKey: 'optimizerEnabled',
      showTurnCounter: true
    },
    {
      id: 'modules',
      tab: 'Modules',
      title: 'MODULES',
      description: 'Extra UI features to enhance AI Studio experience.'
    }
  ];

  const DEFAULT_STATE = {
    bypassEnabled: true,
    bypassMode: 'angular',
    optimizerEnabled: false,
    optimizerMode: 'smart',
    keepLast: 15,
    autoKeep: true,
    scrollBottomEnabled: true,
    wordCounterEnabled: true,
    bannerRemoverEnabled: true,
    mediaViewEnabled: false
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
  let liveStatsInterval = null;
  let lastUrl = location.href;
  let activeTab = 'all';
  let searchQuery = '';
  let lastLocalSave = '';

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

  function buildInitialState() {
    const initial = Object.assign({}, DEFAULT_STATE);
    modules.forEach((module) => {
      if (module.defaults) Object.assign(initial, module.defaults);
    });
    return initial;
  }

  function normalizeState() {
    if (!['angular', 'dom'].includes(state.bypassMode)) state.bypassMode = 'angular';
    if (!['smart', 'hard'].includes(state.optimizerMode)) state.optimizerMode = 'smart';

    state.keepLast = Math.max(2, parseInt(state.keepLast, 10) || 15);
    state.bypassEnabled = !!state.bypassEnabled;
    state.optimizerEnabled = !!state.optimizerEnabled;
    state.autoKeep = !!state.autoKeep;
    state.scrollBottomEnabled = !!state.scrollBottomEnabled;
    state.wordCounterEnabled = !!state.wordCounterEnabled;
    state.bannerRemoverEnabled = !!state.bannerRemoverEnabled;
    state.mediaViewEnabled = !!state.mediaViewEnabled;
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
      console.warn('[Studio.lab] Extension context invalidated. Hard refresh AI Studio.');
    }
  }

  function initModules() {
    modules.forEach((module) => {
      if (typeof module.init === 'function') module.init(ctx);
    });
    notifyModules(null);
  }

  function notifyModules(prevState) {
    modules.forEach((module) => {
      if (typeof module.onStateChange === 'function') {
        module.onStateChange(ctx, prevState);
      }
    });
  }

  function notifyRouteChange() {
    modules.forEach((module) => {
      if (typeof module.onRouteChange === 'function') module.onRouteChange(ctx);
    });
  }

  function startRouteWatcher() {
    setInterval(() => {
      if (location.href === lastUrl) return;

      lastUrl = location.href;
      injected = false;
      notifyRouteChange();
      waitForSidebar();
      refreshLiveStats();
      console.log('[Studio.lab] SPA navigation detected. Module state refreshed.');
    }, 500);
  }

  function waitForSidebar() {
    const tryInject = () => {
      if (document.querySelector('.sl-sidebar-btn')) return true;

      // Use the exact selectors provided by the user
      const anchor = document.querySelector('ms-system-instructions-panel') || 
                     document.querySelector('ms-model-selector') ||
                     document.querySelector('.selector-container.field-group') ||
                     document.querySelector('ms-run-settings');

      if (!anchor) return false;

      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'sl-sidebar-btn';
      card.setAttribute('aria-label', 'Studio.lab Settings');
      card.style.margin = '12px 0';
      card.innerHTML = `
        <div class="title-container">
          <span class="title">Studio.lab</span>
        </div>
        <span class="subtitle">Performance, bypass and workspace modules</span>
      `;
      card.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openModal();
      });

      // Inject after the component or at the top of the container
      if (anchor.tagName.startsWith('MS-')) {
        anchor.insertAdjacentElement('afterend', card);
      } else {
        anchor.prepend(card);
      }

      injected = true;
      return true;
    };

    // Run immediately and then via observer/polling
    if (tryInject()) return;

    if (!window._slSidebarObserver) {
      window._slSidebarObserver = new MutationObserver(() => {
        if (!document.querySelector('.sl-sidebar-btn')) tryInject();
      });
      window._slSidebarObserver.observe(document.documentElement, { 
        childList: true, 
        subtree: true 
      });
    }

    let attempts = 0;
    const poll = setInterval(() => {
      attempts++;
      if (tryInject() || attempts > 60) clearInterval(poll);
    }, 1000);
  }

  function openModal() {
    if (modalEl) closeModal();

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
  }

  function closeModal() {
    if (modalEl) {
      modalEl.remove();
      modalEl = null;
    }
    stopLiveStats();
    document.removeEventListener('keydown', escHandler);
  }

  function refreshModal() {
    if (!modalEl) return;
    modalEl.innerHTML = renderDialog();
    bindModalEvents();
    refreshLiveStats();
  }

  function renderDialog() {
    const tabs = renderTabButton('all', 'All') + GROUPS
      .map(group => renderTabButton(group.id, group.tab))
      .join('') + renderTabButton('info', 'Info');

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
            <input type="text" data-sl-search-input placeholder="Search settings..." aria-label="Search settings" value="${html(searchQuery)}">
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
    const activeClass = (activeTab === group.id || activeTab === 'all') ? 'active' : '';

    return `
      <div class="sl-tab-content ${activeClass}" data-sl-tab-content="${group.id}" role="tabpanel">
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
      <button type="button" class="sl-auto-toggle ${isActive ? 'active' : ''}" data-sl-group-toggle="${group.id}" aria-label="Toggle ${html(group.title)}"></button>
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
        ${typeof module.renderControls === 'function' ? module.renderControls(ctx) : ''}
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

    return `
      <button type="button" class="sl-mode-row ${isSelected ? 'selected' : ''}" data-sl-module-id="${html(module.id)}">
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
      </button>
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
    const loadedModules = modules.map(module => module.title).join(', ');

    return `
      <div class="sl-tab-content ${activeClass}" data-sl-tab-content="info" role="tabpanel">
        <div class="sl-section">
          <div class="sl-header-row">
            <div class="sl-header-text">
              <div class="sl-section-title">ABOUT STUDIO.LAB</div>
              <div class="sl-section-desc">Unofficial extension for Google AI Studio.</div>
            </div>
          </div>
          <div class="sl-info-body">
            <p><strong>Studio.lab v${VERSION}</strong> runs feature logic from modular files.</p>
            <ul class="sl-info-list">
              <li>${renderIcon('check_circle', 'detail')}<span>Modules loaded: ${html(loadedModules || 'none')}</span></li>
              <li>${renderIcon('check_circle', 'detail')}<span>Settings are saved locally with Chrome storage.</span></li>
              <li>${renderIcon('check_circle', 'detail')}<span>No analytics or external requests are used by Studio.lab.</span></li>
            </ul>
          </div>
        </div>
      </div>
    `;
  }

  function renderDonation() {
    return `
      <div class="sl-donation-wrap">
        <a href="https://ko-fi.com/astierdoriana" target="_blank" rel="noreferrer" class="sl-donation-banner">
          <img src="${chrome.runtime.getURL('images/Banner.png')}" alt="Support Studio.lab" class="sl-banner-img">
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
      if (typeof module.bindControls === 'function') module.bindControls(modalEl, ctx);
    });

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
    if (module.modeKey) return state[module.modeKey] === module.modeValue;
    if (module.stateKey) return !!state[module.stateKey];
    return false;
  }

  function updateModalState() {
    if (!modalEl) return;

    GROUPS.forEach((group) => {
      if (group.enabledKey) {
        const enabled = !!state[group.enabledKey];
        const toggle = modalEl.querySelector(`[data-sl-group-toggle="${group.id}"]`);
        const list = modalEl.querySelector(`[data-sl-module-list="${group.id}"]`);

        if (toggle) toggle.classList.toggle('active', enabled);
        if (list) list.classList.toggle('disabled', !enabled);
      }
    });

    modules.forEach((module) => {
      const row = modalEl.querySelector(`[data-sl-module-id="${cssEscape(module.id)}"]`);
      if (row) row.classList.toggle('selected', isModuleSelected(module));

      if (typeof module.updateControls === 'function') {
        module.updateControls(modalEl, ctx);
      }
    });

    refreshLiveStats();
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
      if (typeof module.updateControls === 'function') module.updateControls(modalEl, ctx);
    });
  }

  function getTurnCount() {
    return document.querySelectorAll('ms-chat-turn').length;
  }

  function escHandler(event) {
    if (event.key === 'Escape') closeModal();
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

  console.log(
    `%c[Studio.lab] v${VERSION} shell loaded (${modules.length} modules)`,
    'color:#87a9ff;font-weight:bold;font-size:12px'
  );
})();
