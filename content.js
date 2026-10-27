// Owns shared state, settings, native-control hosting, and module lifecycle dispatch.
// Feature logic lives in modules/*.js.
(function () {
  'use strict';

  const { $, $$, el, observe, scope, store } = window.StudioLabCore;

  let manifest;
  try {
    if (!chrome.runtime?.id) return;
    manifest = chrome.runtime.getManifest();
  } catch (_) { return; }
  const VERSION = manifest.version_name || manifest.version;
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
    chevron_down: '<path d="m6 9 6 6 6-6"/>',
    flash_on: '<path d="M13 2 4 14h7l-1 8 10-13h-7l0-7z"/>',
    visibility: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="3"/>',
    edit: '<path d="M4 20h4l11-11-4-4L4 16v4z"/><path d="m13 7 4 4"/>',
    visibility_off: '<path d="m3 3 18 18"/><path d="M10.6 10.6A3 3 0 0 0 13.4 13.4"/><path d="M9.9 5.4A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a16 16 0 0 1-3.1 4.1"/><path d="M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7c1.8 0 3.4-.5 4.7-1.2"/>',
    speed: '<path d="M4 13a8 8 0 1 1 16 0"/><path d="M12 13l4-4"/><path d="M3 20h18"/>',
    check: '<path d="m5 13 4 4L19 7"/>',
    check_circle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    favorite: '<path d="M12 21s-7-4.4-9.3-8.6C.7 8.6 2.9 5 6.6 5c2 0 3.4 1 4.4 2.2C12 6 13.4 5 15.4 5c3.7 0 5.9 3.6 3.9 7.4C19 16.6 12 21 12 21z"/>',
    close: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    home: '<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
    tune: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="9" cy="18" r="2"/>',
    science: '<path d="M9 3h6M10 3v7L4 20c-.3.6.1 1 1 1h14c.9 0 1.3-.4 1-1l-6-10V3"/><path d="M7 15h10"/>',
    person: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/>',
    palette: '<path d="M12 3a9 9 0 0 0 0 18c1.3 0 2.2-.9 2.2-2.1 0-.5-.2-1-.5-1.4-.3-.3-.4-.8-.4-1.2 0-1 0.8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.1-4-7.5-9-7.5z"/><circle cx="7.5" cy="10.5" r="1.2"/><circle cx="10.5" cy="7.5" r="1.2"/><circle cx="14.5" cy="7.5" r="1.2"/><circle cx="16.5" cy="10.5" r="1.2"/>',
    add: '<path d="M12 5v14M5 12h14"/>',
    arrow_back: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
    download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
    upload: '<path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M5 21h14"/>'
  };

  const TABS = [
    { id: 'home', label: 'Home', icon: 'home', tone: 'blue', description: 'Google AI Studio and Studio.lab, in one place.' },
    { id: 'native', label: 'Google AI Studio', icon: 'tune', tone: 'purple', description: 'Keyboard shortcuts, autocomplete, notifications, and microphone.' },
    { id: 'all', label: 'Studio.lab', icon: 'science', tone: 'green', description: 'All your Studio.lab preferences.' },
    { id: 'theme', label: 'Theme', icon: 'palette', tone: 'pink', description: 'Choose between Original Theme and your saved custom themes.' },
    { id: 'injection', label: 'Performance', icon: 'bolt', tone: 'orange', description: 'Recover interrupted responses and keep long conversations responsive.' },
    { id: 'tweaks', label: 'Workspace', icon: 'tune', tone: 'purple', description: 'Choose your interface helpers and what stays visible.' },
    { id: 'modules', label: 'Tools', icon: 'calculate', tone: 'green', description: 'Manage chat tools, local profiles, exports, and privacy.' },
    { id: 'info', label: 'Info', icon: 'info', tone: 'blue', description: 'Updates, compatibility, and information about Studio.lab.' }
  ];

  const GROUPS = [
    {
      id: 'response-recovery',
      tabId: 'injection',
      title: 'Response recovery',
      description: 'Keep available content visible when a response is interrupted.'
    },
    {
      id: 'chat-loading',
      tabId: 'injection',
      title: 'Chat opening',
      description: 'Open large conversations while keeping the full native history.'
    },
    {
      id: 'optimizer',
      tabId: 'injection',
      title: 'Long conversations',
      description: 'Reduce the number of rendered turns in long conversations.',
      enabledKey: 'optimizerEnabled',
      showTurnCounter: true
    },
    {
      id: 'tweaks',
      tabId: 'tweaks',
      title: 'Workspace helpers',
      description: 'Choose the controls that help you write and navigate.'
    },
    {
      id: 'cleaner',
      tabId: 'tweaks',
      title: 'Interface visibility',
      description: 'Hide selected interface elements without changing your chats.',
      enabledKey: 'cleanerEnabled'
    },
    {
      id: 'modules',
      tabId: 'modules',
      title: 'Chat tools',
      description: 'Configure your chat tools and the information kept in this browser.'
    },
    {
      id: 'privacy', tabId: 'modules', title: 'Privacy',
      description: 'Choose which usage requests AI Studio can send.'
    }
  ];

  const SETTING_HELP = {
    'response-recovery': 'Keep available text if a response stops.',
    'word-counter': 'Show word and character counts for messages.',
    'scroll-bottom': 'Add a button that returns you to the newest message.',
    'draft-saver': 'Recover unsent prompts after reloading.',
    'text-formatter': 'Show Markdown controls and smart lists for prompts.',
    'modern-web-chat': 'Use the alternate chat layout with its input bar and media gallery.',
    'telemetry-blocker': 'Block supported analytics requests while you use AI Studio.',
    'default-profile': 'Reuse a model and instruction in new chats.',
    'chat-export': 'Download this conversation as Markdown or JSON.',
    'chat-cleanup': 'Automatically remove Think blocks, bulk delete Think/Media/Code blocks with progress tracking, and fix share chat blank screen errors.',
    'response-history': 'Keep and switch between multiple regenerated responses (<1/3>) right below the chat turn.',
    'optimizer-smart': 'Hide older messages while keeping native chat nodes intact. Restore them when needed.',
    'optimizer-hard': 'Remove older rendered turns from this browser session when you run cleanup.',
    'initial-chat-render': 'Show the latest 20 messages first and load earlier messages in batches as you scroll up or use history controls. Keep the complete conversation available for writing and model context.',
    'cleaner-tips': 'Keep your greeting while hiding welcome promotions, examples, and toggles.',
    'cleaner-banners': 'Hide promotional upgrade and payment banners without hiding chat errors.',
    'cleaner-sidebar-banners': 'Hide promotional cards above the bottom navigation buttons.',
    'cleaner-hallucinations': 'Hide the disclaimer displayed below the conversation.',
    'cleaner-feedback': 'Hide the thumbs up and thumbs down buttons below responses.',
    'cleaner-suggestions': 'Hide suggested prompts and app shortcuts in the code assistant.'
  };

  const SETTING_TITLES = {
    'response-recovery': 'Response recovery',
    'scroll-bottom': 'Jump to latest message',
    'word-counter': 'Word counter',
    'draft-saver': 'Save drafts',
    'text-formatter': 'Formatting toolbar',
    'modern-web-chat': 'Chat layout',
    'telemetry-blocker': 'Block usage analytics',
    'default-profile': 'New chat defaults',
    'chat-export': 'Export conversation',
    'chat-cleanup': 'Chat cleanup & Share fix',
    'response-history': 'Multiple Response Options',
    'optimizer-smart': 'Buffered',
    'optimizer-hard': 'Physical cleanup',
    'initial-chat-render': 'Fast chat opening',
    'cleaner-tips': 'Simplify the welcome screen',
    'cleaner-banners': 'Hide upgrade banners',
    'cleaner-sidebar-banners': 'Hide sidebar promotions',
    'cleaner-hallucinations': 'Hide the response disclaimer',
    'cleaner-feedback': 'Hide feedback buttons',
    'cleaner-suggestions': 'Hide app suggestions'
  };

  const DEFAULT_STATE = {
    responseRecoveryEnabled: true,
    optimizerEnabled: true,
    optimizerMode: 'smart',
    keepLast: 15,
    autoKeep: true,
    scrollBottomEnabled: true,
    wordCounterEnabled: true,
    textFormatterEnabled: true,
    modernWebChatEnabled: true,
    cleanerEnabled: true,
    cleanerTips: true,
    cleanerBanners: true,
    cleanerSidebarBanners: true,
    cleanerHallucinations: true,
    cleanerFeedback: true,
    cleanerSuggestions: true,
    draftSaverEnabled: true,
    multipleResponseEnabled: true,
    autoDeleteThoughtsEnabled: false,
    deleteThoughtDelay: 5,
    welcomeCompleted: false,
    language: 'vi',
    activeThemeId: 'original',
    customThemes: []
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
    html,
    announceSettings,
    saveCustomTheme,
    applyThemeById,
    deleteCustomTheme
  };

  let initialized = false;
  let contextStopped = false;
  let routeWatcherId = null;
  let closeUpdatePopup = null;
  let modalEl = null;
  let modalScope = null;
  let returnFocus = null;
  let liveStatsInterval = null;
  let lastUrl = location.href;
  let currentRoute = readRoute();
  let activeTab = 'home';
  let browseTab = 'home';
  let themeEditorState = null;
  let nativeSettings = null;
  let openingModal = false;
  let settingsEntryBound = false;
  let searchQuery = '';
  let lastLocalSave = '';
  let telemetryStatus = null;
  let updateStatus = null;
  let updateCheckPending = null;
  let feedbackTimer = null;
  let searchAnnouncementTimer = null;
  let saveSequence = 0;
  const backgroundInert = new Map();
  let backgroundInertObserver = null;
  let searchResultsSignature = '';
  const settingsMenuInert = new Map();
  let feedbackHideTimer = null;
  const moduleErrors = new Map();
  const recentErrors = [];
  const shellScope = scope();

  function extensionActive() {
    return !contextStopped && moduleApi.isExtensionActive();
  }

  function stopInvalidatedContext() {
    if (contextStopped) return;
    contextStopped = true;
    initialized = false;
    clearInterval(routeWatcherId);
    routeWatcherId = null;
    closeUpdatePopup?.();
    closeModal();
    for (const module of [...modules].reverse()) callModule(module, 'dispose');
    shellScope.dispose();
  }

  moduleApi.onExtensionInvalidated(stopInvalidatedContext);

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
    if (method !== 'dispose' && !extensionActive()) return undefined;
    try {
      return module[method](...args);
    } catch (err) {
      if (moduleApi.handleExtensionError(err)) return undefined;
      recordError(module.id || 'unknown', err, method);
      if (window.StudioLab && window.StudioLab.log) {
        window.StudioLab.log(`Error in module ${module.id || 'unknown'} ${method}: ` + err, 'error');
      }
      return undefined;
    }
  }

  waitForSidebar();
  startRouteWatcher();

  function finishInitialLoad() {
    if (!extensionActive()) return;
    initialized = true;
    if (state.language) {
      window.StudioLab?.i18n?.applyLanguage?.(state.language, ctx);
    }
    window.StudioLab?.themeEngine?.syncFromState?.(state);
    initModules();
    refreshLiveStats();
    checkUpdates();
    window.StudioLab?.i18n?.maybeShowWelcomeModal?.(ctx);
  }
  try {
    store.get([STORAGE_KEY]).then(data => {
      if (!extensionActive()) return;
      if (data && data[STORAGE_KEY]) {
        Object.assign(state, migrateStoredState(data[STORAGE_KEY]));
        normalizeState();
        if (Object.prototype.hasOwnProperty.call(data[STORAGE_KEY], 'bypassEnabled')) saveState();
      }
      finishInitialLoad();
    }, error => {
      if (!extensionActive()) return;
      if (moduleApi.handleExtensionError(error)) return;
      finishInitialLoad();
    });
  } catch (error) {
    if (!moduleApi.handleExtensionError(error)) recordError('settings', error, 'load');
  }

  function handleStorageChange(changes, area) {
    if (!extensionActive()) return;
    if (area !== 'local' || !changes[STORAGE_KEY] || !initialized) return;

    const incoming = changes[STORAGE_KEY].newValue || {};
    const incomingJson = JSON.stringify(incoming);
    if (incomingJson === lastLocalSave) {
      lastLocalSave = '';
      return;
    }

    const prev = snapshotState();
    Object.assign(state, migrateStoredState(incoming));
    normalizeState();
    if (state.language && state.language !== prev.language) {
      window.StudioLab?.i18n?.applyLanguage?.(state.language, ctx);
    }
    window.StudioLab?.themeEngine?.syncFromState?.(state);
    if (Object.prototype.hasOwnProperty.call(incoming, 'bypassEnabled')) saveState();
    notifyModules(prev);
    if (state.language !== prev.language && modalEl) {
      rerenderModalInPlace();
    } else {
      updateModalState();
    }
  }
  if (!extensionActive()) return;
  shellScope.add(store.onChange(handleStorageChange));

  function handleContentMessage(msg) {
    if (!extensionActive()) return;
    if (msg && msg.action === 'openStudioLab') openModal();
  }
  chrome.runtime.onMessage.addListener(handleContentMessage);
  shellScope.add(() => chrome.runtime.onMessage.removeListener(handleContentMessage));
  function handleOpenSettings() { if (extensionActive()) openModal(); }
  shellScope.on(window, '__sl_openSettings', handleOpenSettings);

  function buildInitialState() {
    const initial = Object.assign({}, DEFAULT_STATE);
    modules.forEach((module) => {
      if (module.defaults) Object.assign(initial, module.defaults);
    });
    return initial;
  }

  function migrateStoredState(stored) {
    const migrated = Object.assign({}, stored);
    // Read the previous storage key before defaults are merged, preserving disabled preferences.
    if (!Object.prototype.hasOwnProperty.call(migrated, 'responseRecoveryEnabled') &&
        Object.prototype.hasOwnProperty.call(migrated, 'bypassEnabled')) {
      migrated.responseRecoveryEnabled = migrated.bypassEnabled;
    }
    delete migrated.bypassEnabled;
    return migrated;
  }

  function normalizeState() {
    if (!['smart', 'hard'].includes(state.optimizerMode)) state.optimizerMode = 'smart';

    state.keepLast = Math.min(500, Math.max(2, parseInt(state.keepLast, 10) || 15));
    state.responseRecoveryEnabled = !!state.responseRecoveryEnabled;
    state.optimizerEnabled = !!state.optimizerEnabled;
    state.initialChatRenderEnabled = state.initialChatRenderEnabled !== false;
    delete state.fastChatRenderEnabled;
    state.autoKeep = !!state.autoKeep;
    state.scrollBottomEnabled = !!state.scrollBottomEnabled;
    state.wordCounterEnabled = !!state.wordCounterEnabled;
    state.textFormatterEnabled = state.textFormatterEnabled !== false;
    // Chat layout is permanently enabled and hidden from settings
    state.modernWebChatEnabled = true;
    state.cleanerEnabled = !!state.cleanerEnabled;
    state.draftSaverEnabled = state.draftSaverEnabled !== false;
    state.multipleResponseEnabled = state.multipleResponseEnabled !== false;
    state.autoDeleteThoughtsEnabled = !!state.autoDeleteThoughtsEnabled;
    state.deleteThoughtDelay = Math.min(3600, Math.max(1, parseInt(state.deleteThoughtDelay, 10) || 5));
    state.welcomeCompleted = !!state.welcomeCompleted;
    state.language = String(state.language || 'vi');
    if (!Array.isArray(state.customThemes)) {
      state.customThemes = [];
    } else {
      state.customThemes = state.customThemes
        .filter(item => item && typeof item === 'object' && item.id)
        .map(item => ({
          id: String(item.id),
          name: String(item.name || 'Custom Theme').trim() || 'Custom Theme',
          description: String(item.description || '').trim(),
          createdAt: item.createdAt || new Date().toISOString(),
          updatedAt: item.updatedAt || new Date().toISOString(),
          config: item.config && typeof item.config === 'object' ? item.config : {}
        }));
    }
    const rawThemeId = String(state.activeThemeId || 'original');
    const validCustomTheme = state.customThemes.some(item => item.id === rawThemeId);
    state.activeThemeId = (rawThemeId === 'original' || validCustomTheme) ? rawThemeId : 'original';
  }

  function applyThemeById(themeId) {
    const t = (key, fb) => window.StudioLab?.i18n?.t ? window.StudioLab.i18n.t(key, fb || key) : (fb || key);
    const targetId = String(themeId || 'original');
    const exists = targetId === 'original' || (Array.isArray(state.customThemes) && state.customThemes.some(item => item.id === targetId));
    const nextId = exists ? targetId : 'original';
    setState({ activeThemeId: nextId });
    window.StudioLab?.themeEngine?.syncFromState?.(state);
    announceSettings(t('theme_applied_toast', 'Theme applied.'));
    rerenderThemeTabInPlace();
  }

  function saveCustomTheme(themeInput = {}) {
    const list = Array.isArray(state.customThemes) ? [...state.customThemes] : [];
    const now = new Date().toISOString();
    const editingId = themeInput.id || (themeEditorState?.mode === 'edit' ? themeEditorState.themeId : null);
    const normalizeCfg = window.StudioLab?.themePresets?.normalizeThemeConfig;
    const rawConfig = themeInput.config && typeof themeInput.config === 'object' ? themeInput.config : {};
    const finalConfig = normalizeCfg ? normalizeCfg(rawConfig) : rawConfig;
    let savedTheme;
    if (editingId && list.some(item => item.id === editingId)) {
      const idx = list.findIndex(item => item.id === editingId);
      savedTheme = {
        ...list[idx],
        name: String(themeInput.name || list[idx].name || `Custom Theme ${idx + 1}`).trim(),
        description: String(themeInput.description ?? list[idx].description ?? '').trim(),
        updatedAt: now,
        config: finalConfig
      };
      list[idx] = savedTheme;
    } else {
      const id = 'custom-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
      savedTheme = {
        id,
        name: String(themeInput.name || `Custom Theme ${list.length + 1}`).trim(),
        description: String(themeInput.description || '').trim(),
        createdAt: now,
        updatedAt: now,
        config: finalConfig
      };
      list.push(savedTheme);
    }
    themeEditorState = null;
    setState({
      customThemes: list,
      activeThemeId: savedTheme.id
    });
    window.StudioLab?.themeEngine?.syncFromState?.(state);
    rerenderThemeTabInPlace();
    return savedTheme;
  }

  function deleteCustomTheme(themeId) {
    const t = (key, fb) => window.StudioLab?.i18n?.t ? window.StudioLab.i18n.t(key, fb || key) : (fb || key);
    const targetId = String(themeId || '');
    if (!targetId || targetId === 'original') return;
    const nextList = (state.customThemes || []).filter(item => item.id !== targetId);
    const nextActive = state.activeThemeId === targetId ? 'original' : state.activeThemeId;
    if (themeEditorState && themeEditorState.themeId === targetId) {
      themeEditorState = null;
    }
    setState({
      customThemes: nextList,
      activeThemeId: nextActive
    });
    window.StudioLab?.themeEngine?.syncFromState?.(state);
    announceSettings(t('theme_deleted_toast', 'Custom theme deleted.'));
    rerenderThemeTabInPlace();
  }

  function exportCustomTheme(themeId) {
    const t = (key, fb) => window.StudioLab?.i18n?.t ? window.StudioLab.i18n.t(key, fb || key) : (fb || key);
    const targetId = String(themeId || '');
    const item = (state.customThemes || []).find(th => th.id === targetId);
    if (!item) return;

    const serializeFn = window.StudioLab?.themePresets?.serializeThemelab;
    const contentStr = serializeFn
      ? serializeFn(item)
      : JSON.stringify({
          format: 'studiolab-themelab',
          version: '2.2.2',
          exportedAt: new Date().toISOString(),
          theme: {
            name: item.name || 'Custom Theme',
            description: item.description || '',
            config: item.config || {}
          }
        }, null, 2);

    const rawSlug = String(item.name || 'custom-theme')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u00C0-\u1EF9_-]+/gi, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'custom-theme';

    const blob = new Blob([contentStr], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${rawSlug}.themelab`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);

    announceSettings(t('theme_exported_toast', 'Exported .themelab file!'));
  }

  function importCustomThemeFromText(rawText, fallbackName = 'Imported Theme') {
    const t = (key, fb) => window.StudioLab?.i18n?.t ? window.StudioLab.i18n.t(key, fb || key) : (fb || key);
    try {
      const parseFn = window.StudioLab?.themePresets?.parseThemelab;
      const parsed = parseFn
        ? parseFn(rawText, fallbackName)
        : (() => {
            const obj = JSON.parse(rawText);
            const node = obj.theme || obj;
            if (!node || typeof node !== 'object' || (!node.config && !node.mainInterface)) {
              throw new Error('Invalid .themelab');
            }
            return {
              name: String(node.name || fallbackName || 'Imported Theme').trim(),
              description: String(node.description || '').trim(),
              config: node.config || node
            };
          })();

      // Guarantee a New Theme insertion + immediate auto-apply
      const prevEditorState = themeEditorState;
      themeEditorState = null;
      const saved = saveCustomTheme({
        name: parsed.name,
        description: parsed.description,
        config: parsed.config
      });
      if (prevEditorState) themeEditorState = null;
      announceSettings(t('theme_imported_toast', 'Theme (.themelab) imported and applied immediately!'));
      return saved;
    } catch (_) {
      announceSettings(t('theme_import_error_toast', 'Invalid or corrupted .themelab file.'), true);
      return null;
    }
  }

  if (window.StudioLab) {
    window.StudioLab.themeManager = {
      saveCustomTheme,
      applyThemeById,
      deleteCustomTheme,
      exportCustomTheme,
      importCustomThemeFromText,
      getActiveThemeId: () => state.activeThemeId || 'original',
      getCustomThemes: () => [...(state.customThemes || [])]
    };
  }

  function snapshotState() {
    return Object.assign({}, state);
  }

  function setState(patch, options = {}) {
    if (!extensionActive()) return;
    const prev = snapshotState();
    Object.assign(state, patch);
    normalizeState();

    if (options.save !== false) saveState();
    notifyModules(prev);

    // Settings controls are persistent DOM nodes. State changes must not replace
    // the focused input, native Angular view, or private Account frame.
    updateModalState();
  }

  function saveState() {
    try {
      if (!extensionActive()) return;
      const sequence = ++saveSequence;
      lastLocalSave = JSON.stringify(state);
      store.set({ [STORAGE_KEY]: state }).then(() => {
        if (extensionActive() && sequence === saveSequence) announceSettings('Settings saved in this browser.');
      }).catch(error => {
        if (moduleApi.handleExtensionError(error)) return;
        if (sequence === saveSequence) announceSettings('Settings could not be saved. Try again.', true);
      });
    } catch (error) {
      if (moduleApi.handleExtensionError(error)) return;
      announceSettings('Reload AI Studio to reconnect the extension.', true);
      if (window.StudioLab && window.StudioLab.log) window.StudioLab.log('Extension context invalidated. Hard refresh AI Studio.', 'warn');
    }
  }

  function announceSettings(message, isError = false) {
    if (!modalEl) return;
    const feedback = modalEl.querySelector('[data-sl-settings-feedback]');
    const status = modalEl.querySelector(isError ? '[data-sl-settings-alert]' : '[data-sl-settings-status]');
    clearTimeout(feedbackHideTimer);
    if (feedback) {
      feedback.hidden = !isError || !message;
      feedback.textContent = isError ? message : '';
      feedback.dataset.tone = 'error';
    }
    if (status) {
      clearTimeout(feedbackTimer);
      // Debounce a sequence of keyboard adjustments into one useful message.
      feedbackTimer = setTimeout(() => {
        if (status.isConnected && status.textContent !== message) status.textContent = message;
      }, isError ? 0 : 250);
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
    routeWatcherId = setInterval(() => {
      if (!extensionActive()) return;
      if (location.href === lastUrl) return;

      lastUrl = location.href;
      const previousRoute = currentRoute;
      currentRoute = readRoute();
      notifyRouteChange(currentRoute, previousRoute);
      waitForSidebar();
      refreshLiveStats();
      if (window.StudioLab && window.StudioLab.log) window.StudioLab.log('SPA navigation detected. Module state refreshed.', 'info');
    }, 500);
  }

  function waitForSidebar() {
    $$('.sl-sidebar-btn, .sl-user-settings-item').forEach(button => button.remove());
    if (settingsEntryBound) return;
    settingsEntryBound = true;
    shellScope.on(document, 'click', handleSettingsEntry, true);
  }

  function handleSettingsEntry(event) {
    if (!extensionActive()) return;
    if (!initialized || openingModal || nativeSettings?.isOpening() || event.defaultPrevented) return;
    const target = event.target?.closest?.('button, a');
    if (!target || target.closest('.sl-overlay') || target.disabled || target.getAttribute('aria-disabled') === 'true') return;
    const isSettings = window.StudioLab?.NativeSettings?.isSettingsTrigger(target);
    if (!isSettings) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openModal();
  }

  function showHealthCheckWarning() {
    if ($('.sl-health-check-toast')) return;
    const toast = el(`
      <div class="sl-health-check-toast" style="position:fixed;bottom:20px;right:20px;background:#333;color:#fff;padding:12px 16px;border-radius:8px;z-index:999999;box-shadow:0 4px 12px rgba(0,0,0,0.3);font-family:sans-serif;font-size:14px;display:flex;align-items:center;gap:12px;">
        <span>⚠️ Можливо, Google оновив інтерфейс. Деякі функції Studio.lab можуть не працювати.</span>
        <button style="background:none;border:none;color:#fff;cursor:pointer;padding:4px;" aria-label="Close">✕</button>
      </div>
    `);
    toast.querySelector('button').addEventListener('click', () => toast.remove());
    document.body.appendChild(toast);
    setTimeout(() => { if (document.body.contains(toast)) toast.remove(); }, 15000);
  }

  async function openModal(initialTab = 'home') {
    try {
      await openConnectedModal(initialTab);
    } catch (error) {
      if (!moduleApi.handleExtensionError(error)) {
        recordError('settings', error, 'open');
        closeModal();
      }
    }
  }

  async function openConnectedModal(initialTab = 'home') {
    if (!extensionActive() || !initialized || !document.body || openingModal) return;
    if (modalEl) {
      focusSettingsSearch();
      return;
    }
    returnFocus = document.activeElement;
    activeTab = TABS.some(tab => tab.id === initialTab) ? initialTab : 'home';
    browseTab = activeTab;
    searchQuery = '';
    openingModal = true;
    let requestedAdapter = null;
    modalScope = window.StudioLab.createScope ? window.StudioLab.createScope() : null;
    try {
      const factory = window.StudioLab?.NativeSettings?.createAdapter;
      if (factory) {
        nativeSettings = factory({
          onClosed: () => {
            if (nativeSettings !== requestedAdapter) return;
            closeModal(true);
          },
          onChange: () => {
            if (!modalEl || nativeSettings !== requestedAdapter) return;
            const slot = modalEl.querySelector('[data-sl-native-settings]');
            if (slot && nativeSettings?.getHost()) {
              restoreBackgroundInert();
              nativeSettings.attach(modalEl, slot);
              if (!nativeSettings.usesNativeFocusTrap()) makeBackgroundInert();
            }
            updateNativeAvailability();
            applySearchFilter();
          }
        });
        requestedAdapter = nativeSettings;
      }
    } catch (_) {
      // Studio.lab remains usable when Google changes or delays its native settings.
    }

    modalEl = el('<div class="sl-overlay"></div>');
    modalEl.addEventListener('click', (event) => {
      if (event.target === modalEl) closeModal();
    });

    modalEl.innerHTML = renderDialog();
    const slot = modalEl.querySelector('[data-sl-native-settings]');
    if (!nativeSettings?.attach(modalEl, slot)) {
      document.body.appendChild(modalEl);
      makeBackgroundInert();
    }

    bindModalEvents();
    startLiveStats();
    document.addEventListener('keydown', escHandler);

    openingModal = false;
    modalEl.querySelector('[data-sl-settings-title]')?.focus({ preventScroll: true });
    // Paint the shell immediately. Google's dialog can arrive later;
    // the adapter moves its live controls without rebuilding this view.
    if (requestedAdapter) {
      Promise.resolve(requestedAdapter.open()).catch(() => {}).finally(() => {
        if (nativeSettings === requestedAdapter && modalEl) updateNativeAvailability();
      });
      updateNativeAvailability();
    }

    refreshDiagnostics();
    refreshUpdateInfo();
    Promise.resolve().then(() => {
      if (extensionActive()) return chrome.runtime.sendMessage({ action: 'getTelemetryStatus' });
    }).then(result => {
      if (!extensionActive()) return;
      telemetryStatus = result || null;
      refreshDiagnostics();
    }).catch(error => { moduleApi.handleExtensionError(error); });
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
    if (!extensionActive()) return;
    if (updateCheckPending) return updateCheckPending;
    if (typeof chrome.runtime?.sendMessage !== 'function') return;
    updateCheckPending = Promise.resolve().then(() => {
      if (extensionActive()) return chrome.runtime.sendMessage({ action: 'checkForUpdates', force });
    })
      .then(async result => {
        if (!extensionActive()) return;
        updateStatus = result || { ok: false };
        if (!result?.updateAvailable || !result.latestVersion || !result.releaseUrl) return;
        const stored = await store.get(['slDismissedUpdateTag']);
        if (!extensionActive()) return;
        if (stored.slDismissedUpdateTag !== result.latestVersion) showUpdatePopup(result);
      })
      .catch(error => { moduleApi.handleExtensionError(error); updateStatus = { ok: false }; })
      .finally(() => { updateCheckPending = null; refreshUpdateInfo(); });
    refreshUpdateInfo();
    return updateCheckPending;
  }

  function showUpdatePopup(release) {
    if (!extensionActive() || modalEl || $('.sl-update-overlay')) return;
    const overlay = el('<div class="sl-update-overlay"></div>');
    const popup = el(`
      <div class="sl-update-popup" role="dialog" aria-modal="true" aria-labelledby="sl-update-title" aria-describedby="sl-update-description" tabindex="-1">
        <div class="sl-update-popup-content">
          <span class="sl-update-popup-brand"><img src="${chrome.runtime.getURL('images/SL_logotype.svg')}" alt="" aria-hidden="true">Studio.lab</span>
          <h2 id="sl-update-title">A new version <span>is here!</span></h2>
          <p id="sl-update-description">Studio.lab <strong data-sl-latest-version></strong> is ready. See what's new before you update.</p>
          <div class="sl-update-popup-actions">
            <button type="button">Dismiss</button>
            <a target="_blank" rel="noopener noreferrer">View release ${renderIcon('arrow_outward', 'detail')}</a>
          </div>
        </div>
      </div>
    `);
    popup.style.setProperty('--sl-update-background', `url("${chrome.runtime.getURL('images/update-space.webp')}")`);
    popup.querySelector('[data-sl-latest-version]').textContent = `v${String(release.latestVersion).replace(/^v/i, '')}`;
    const releaseLink = popup.querySelector('.sl-update-popup-actions a');
    releaseLink.href = release.releaseUrl;
    const returnFocus = document.activeElement;
    const closePopup = (rememberDismissal = false) => {
      if (rememberDismissal && extensionActive()) {
        Promise.resolve().then(() => {
          if (extensionActive()) return store.set({ slDismissedUpdateTag: release.latestVersion });
        }).catch(error => { moduleApi.handleExtensionError(error); });
      }
      document.removeEventListener('keydown', onKeyDown, true);
      overlay.remove();
      closeUpdatePopup = null;
      if (returnFocus?.isConnected && typeof returnFocus.focus === 'function') returnFocus.focus();
    };
    closeUpdatePopup = closePopup;
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

  function closeModal(nativeClosed = false) {
    if (themeEditorState) {
      const draft = window.StudioLab?.themeEditorUI?.getDraft?.();
      if (draft && draft.isDirty) {
        saveCustomTheme({ name: draft.name, config: draft.config });
      }
      themeEditorState = null;
      window.StudioLab?.themeEditorUI?.resetDraftSession?.();
      window.StudioLab?.themeEngine?.syncFromState?.(state);
    }
    closeSettingsMenu(false);
    const adapter = nativeSettings;
    nativeSettings = null;
    if (nativeClosed !== true) adapter?.close();
    if (modalScope) {
      modalScope.dispose();
      modalScope = null;
    }
    backgroundInertObserver = null;
    if (modalEl) {
      modalEl.remove();
      modalEl = null;
    }
    adapter?.dispose();
    restoreBackgroundInert();
    stopLiveStats();
    clearTimeout(feedbackTimer);
    clearTimeout(feedbackHideTimer);
    clearTimeout(searchAnnouncementTimer);
    searchResultsSignature = '';
    document.removeEventListener('keydown', escHandler);
    const focusTarget = returnFocus?.isConnected && returnFocus !== document.body ? returnFocus
      : $('ms-settings-menu button[data-test-id="settings-menu"], ms-settings-menu button[aria-label="Settings"]');
    focusTarget?.focus({ preventScroll: true });
    returnFocus = null;
  }

  function isSettingsMenuOpen() {
    return !!modalEl?.querySelector('[data-sl-menu-nav-slot]')?.closest('dialog')?.open;
  }

  function openSettingsMenu() {
    if (!modalEl || window.innerWidth > 760 || isSettingsMenuOpen()) return;
    const dialog = modalEl.querySelector('.sl-settings-mobile-menu');
    const nav = modalEl.querySelector('.sl-settings-nav');
    if (!dialog || !nav) return;
    dialog.querySelector('[data-sl-menu-nav-slot]').appendChild(nav);
    modalEl.querySelector('[data-sl-settings-menu]').setAttribute('aria-expanded', 'true');
    modalEl.querySelectorAll('.sl-settings-main, .sl-settings-topbar').forEach(element => {
      settingsMenuInert.set(element, element.inert);
      element.inert = true;
    });
    try {
      dialog.showModal();
      nav.querySelector('[aria-current="page"]')?.focus({ preventScroll: true });
      scrollActiveTabIntoView();
    } catch (error) {
      finishSettingsMenu(true);
      recordError('settings-menu', error, 'open');
    }
  }

  function finishSettingsMenu(restoreFocus) {
    if (!modalEl) return;
    const button = modalEl.querySelector('[data-sl-settings-menu]');
    if (button?.getAttribute('aria-expanded') !== 'true' && !settingsMenuInert.size) return;
    const nav = modalEl.querySelector('.sl-settings-mobile-menu .sl-settings-nav');
    const layout = modalEl.querySelector('.sl-settings-layout');
    if (nav && layout) layout.insertBefore(nav, layout.querySelector('.sl-settings-main'));
    for (const [element, original] of settingsMenuInert) element.inert = original;
    settingsMenuInert.clear();
    button?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) button?.focus({ preventScroll: true });
  }

  function closeSettingsMenu(restoreFocus = true) {
    const dialog = modalEl?.querySelector('.sl-settings-mobile-menu');
    if (dialog?.open) dialog.close();
    finishSettingsMenu(restoreFocus);
  }

  function handleSettingsMenuKey(event) {
    if (!isSettingsMenuOpen() || event.defaultPrevented) return false;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeSettingsMenu();
    } else if (event.key === 'Tab') {
      const dialog = modalEl.querySelector('.sl-settings-mobile-menu');
      const controls = [...dialog.querySelectorAll('button, input, a[href], [tabindex="0"]')]
        .filter(node => !node.matches(':disabled') && !node.closest('[hidden], [inert]') && node.getClientRects().length);
      const target = event.shiftKey && document.activeElement === controls[0] ? controls[controls.length - 1]
        : !event.shiftKey && document.activeElement === controls[controls.length - 1] ? controls[0] : null;
      if (target) { event.preventDefault(); target.focus(); }
    }
    return true;
  }

  function restoreBackgroundInert() {
    for (const [element, original] of backgroundInert) element.inert = original;
    backgroundInert.clear();
  }

  function makeBackgroundInert() {
    const disableSiblings = () => {
      if (!modalEl || nativeSettings?.usesNativeFocusTrap?.()) return;
      const overlayRoot = nativeSettings?.getOverlayRoot?.();
      for (const element of document.body.children) {
        if (element === modalEl || element === overlayRoot || ['SCRIPT', 'STYLE', 'LINK'].includes(element.tagName)) continue;
        if (!backgroundInert.has(element)) backgroundInert.set(element, element.inert);
        element.inert = true;
      }
    };
    disableSiblings();
    if (modalScope && !backgroundInertObserver) {
      backgroundInertObserver = observe(document.body, { childList: true }, disableSiblings);
      modalScope.add(backgroundInertObserver);
    }
  }

  function renderDialog() {
    const t = (text) => window.StudioLab?.i18n?.t ? window.StudioLab.i18n.t(text, text) : text;
    const tabs = TABS.map(renderTabButton).join('');
    const selected = TABS.find(tab => tab.id === activeTab) || TABS[0];

    return `
      <div class="sl-dialog sl-settings-shell ${activeTab === 'home' ? 'sl-settings-home' : ''}" lang="${html(state.language || 'en')}" role="dialog" aria-modal="true" aria-label="Google AI Studio and Studio.lab Settings">
        <header class="sl-settings-topbar">
          <div class="sl-settings-topbar-start"><button type="button" class="sl-settings-menu-button" data-sl-settings-menu aria-label="Search and settings sections" aria-expanded="false" aria-controls="sl-settings-mobile-menu">${renderIcon('menu', 'plain')}</button><span class="sl-settings-brand">${html(t('Settings'))}</span></div>
          <h1 id="sl-settings-page-title" data-sl-settings-title tabindex="-1" cdkFocusInitial>${html(t(selected.label))}</h1>
          <div class="sl-settings-topbar-end"><button type="button" class="sl-close-btn" data-sl-close aria-label="Close settings">${renderIcon('close', 'plain')}</button></div>
        </header>
        <div class="sl-settings-layout">
          <nav class="sl-settings-nav" aria-label="Settings sections">
            <ul>${tabs}</ul>
            ${renderSettingsSearch()}
          </nav>
          <main class="sl-settings-main" aria-labelledby="sl-settings-page-title">
            <div class="sl-settings-main-heading">
              <div class="sl-settings-section-heading" data-sl-section-heading>
                <p data-sl-settings-description>${html(t(selected.description))}</p>
              </div>
            </div>
            <div class="sl-dialog-body" id="sl-settings-content" tabindex="0" role="region" aria-labelledby="sl-settings-page-title">
                ${renderHomeTab()}
                ${renderNativeTab()}
                ${renderThemeTab()}
                ${GROUPS.map(renderGroupTab).join('')}
                ${renderInfoTab()}
                <section class="sl-settings-page sl-settings-search-page" data-sl-tab-content="search" aria-label="Search results" hidden>
                  <ul class="sl-settings-result-list" data-sl-search-results></ul>
                  <div class="sl-settings-empty" data-sl-search-empty hidden><h2>${html(t('No settings found'))}</h2><p>Try autocomplete, turn limit, or formatting.</p></div>
                </section>
            </div>
            <p class="sl-settings-feedback" data-sl-settings-feedback hidden></p>
            <div class="sl-sr-only" role="status" aria-live="polite" aria-atomic="true" data-sl-settings-status></div>
            <div class="sl-sr-only" role="status" aria-live="polite" aria-atomic="true" data-sl-search-status></div>
            <div class="sl-sr-only" role="alert" aria-atomic="true" data-sl-settings-alert></div>
          </main>
        </div>
        <dialog id="sl-settings-mobile-menu" class="sl-settings-mobile-menu" aria-labelledby="sl-settings-menu-title">
          <div class="sl-settings-mobile-menu-header"><h2 id="sl-settings-menu-title">${html(t('Settings'))}</h2><button type="button" class="sl-close-btn" data-sl-settings-menu-close aria-label="Close settings sections">${renderIcon('close', 'plain')}</button></div>
          <div data-sl-menu-nav-slot></div>
        </dialog>
      </div>
    `;
  }

  function renderSettingsSearch() {
    const t = (text) => window.StudioLab?.i18n?.t ? window.StudioLab.i18n.t(text, text) : text;
    return `<form class="sl-search-field" role="search" aria-label="${html(t('Search settings'))}" data-sl-search-form>
      <div class="sl-search-container">${renderIcon('search', 'search')}
        <label for="sl-settings-search" class="sl-sr-only">Search Google AI Studio and Studio.lab settings</label>
        <input id="sl-settings-search" type="search" data-sl-search-input placeholder="${html(t('Search settings'))}" aria-controls="sl-settings-content" aria-describedby="sl-settings-search-help" value="${html(searchQuery)}" autocomplete="off" aria-keyshortcuts="Control+K">
        <button type="button" class="sl-search-clear ${searchQuery ? 'visible' : ''}" data-sl-search-clear aria-label="Clear search" ${searchQuery ? '' : 'disabled'}>${renderIcon('close', 'plain')}</button>
      </div><button type="submit" class="sl-search-show" data-sl-search-show hidden>Show results</button><p id="sl-settings-search-help" class="sl-sr-only">Search any section. Results update as you type. Choose a result to open its setting. On small screens, press Enter or Show results. Press Escape to clear.</p>
    </form>`;
  }

  function focusSettingsSearch() {
    if (window.innerWidth <= 760) openSettingsMenu();
    modalEl?.querySelector('.sl-search-container')?.setAttribute('data-sl-keyboard-focus', '');
    modalEl?.querySelector('[data-sl-search-input]')?.focus({ preventScroll: true });
  }

  function readVisibleGaisProfile() {
    const account = $('ms-account-switcher .account-switcher-button') ||
      $('button[aria-label^="Google Account:"]');
    const image = account?.querySelector('img');
    const name = image?.getAttribute('alt')?.trim().slice(0, 80) || '';
    let source = '';
    try {
      const url = new URL(image?.getAttribute('src') || '', location.href);
      if (url.protocol === 'https:' && /(^|\.)googleusercontent\.com$/.test(url.hostname)) source = url.href;
    } catch (_) {}
    return { name, image: source };
  }

  function renderHomeTab() {
    const t = (key, fb) => window.StudioLab?.i18n?.t ? window.StudioLab.i18n.t(key, fb || key) : (fb || key);
    const profile = readVisibleGaisProfile();
    const shortcuts = [
      ['native', t('tab_native', 'Google AI Studio'), t('home_card_native_help', 'Keyboard shortcuts, autocomplete, and input.'), 'tune', 'tweaks'],
      ['all', 'Studio.lab', t('home_card_studiolab_help', 'Chat tools, workspace, and performance.'), 'science', 'injection']
    ];
    const fallbackLanguages = [
      { code: 'vi', nativeName: 'Tiếng Việt', englishName: 'Vietnamese', badge: 'VN' },
      { code: 'en', nativeName: 'English', englishName: 'English', badge: 'EN' },
      { code: 'zh-CN', nativeName: '中文 (简体)', englishName: 'Chinese (Simplified)', badge: 'CN' },
      { code: 'zh-TW', nativeName: '中文 (繁體)', englishName: 'Chinese (Traditional)', badge: 'TW' },
      { code: 'ja', nativeName: '日本語', englishName: 'Japanese', badge: 'JP' },
      { code: 'ko', nativeName: '한국어', englishName: 'Korean', badge: 'KR' },
      { code: 'es', nativeName: 'Español', englishName: 'Spanish', badge: 'ES' },
      { code: 'fr', nativeName: 'Français', englishName: 'French', badge: 'FR' },
      { code: 'de', nativeName: 'Deutsch', englishName: 'German', badge: 'DE' },
      { code: 'ru', nativeName: 'Русский', englishName: 'Russian', badge: 'RU' },
      { code: 'pt', nativeName: 'Português', englishName: 'Portuguese', badge: 'PT' },
      { code: 'uk', nativeName: 'Українська', englishName: 'Ukrainian', badge: 'UA' },
      { code: 'it', nativeName: 'Italiano', englishName: 'Italian', badge: 'IT' },
      { code: 'id', nativeName: 'Bahasa Indonesia', englishName: 'Indonesian', badge: 'ID' },
      { code: 'th', nativeName: 'ไทย', englishName: 'Thai', badge: 'TH' },
      { code: 'hi', nativeName: 'हिन्दी', englishName: 'Hindi', badge: 'IN' },
      { code: 'ar', nativeName: 'العربية', englishName: 'Arabic', badge: 'AR' },
      { code: 'tr', nativeName: 'Türkçe', englishName: 'Turkish', badge: 'TR' },
      { code: 'pl', nativeName: 'Polski', englishName: 'Polish', badge: 'PL' },
      { code: 'nl', nativeName: 'Nederlands', englishName: 'Dutch', badge: 'NL' }
    ];
    const i18nLangs = window.StudioLab?.i18n?.LANGUAGES;
    const languages = (Array.isArray(i18nLangs) && i18nLangs.length) ? i18nLangs : fallbackLanguages;
    const currentLang = window.StudioLab?.i18n?.getLang?.() || state.language || 'vi';
    const langOptions = languages.map(l => {
      const code = l.code || '';
      const native = l.nativeName || l.native || code;
      const english = l.englishName || l.name || '';
      const badge = l.badge || l.flag || '';
      const label = english && english !== native
        ? `${badge ? badge + ' · ' : ''}${native} (${english})`
        : `${badge ? badge + ' · ' : ''}${native}`;
      return `<option value="${html(code)}" ${code === currentLang ? 'selected' : ''}>${html(label)}</option>`;
    }).join('');

    return `
      <section class="sl-settings-page" data-sl-tab-content="home" aria-label="Workspace overview" ${activeTab === 'home' ? '' : 'hidden'}>
        <div class="sl-settings-home-intro" data-sl-home-intro>
          <div class="sl-home-brands" role="group" aria-label="Your Google AI Studio profile and Studio.lab"><div class="sl-settings-avatar">${profile.image ? `<img src="${html(profile.image)}" alt="" referrerpolicy="no-referrer">` : renderIcon('person', 'plain')}</div><span class="sl-home-brand-join" aria-hidden="true">×</span><img src="${html(chrome.runtime.getURL('images/SL_PFP_64.png'))}" width="64" height="64" alt=""></div>
          <div><h2>${html(profile.name || t('home_workspace_title', 'Your workspace'))}</h2><p>${html(t('home_workspace_subtitle', 'Personalize Google AI Studio and Studio.lab.'))}</p></div>
        </div>
        <div class="sl-settings-home-grid" role="group" aria-label="Quick settings links">
          ${shortcuts.map(([id, label, help, icon, tone]) => `<button type="button" class="sl-settings-home-card" data-sl-open-tab="${id}">${renderIcon(icon, tone)}<span class="sl-setting-copy"><span class="sl-settings-home-card-title">${html(label)}</span><span class="sl-settings-home-card-help">${html(help)}</span></span>${renderIcon('arrow_outward', 'plain')}</button>`).join('')}
        </div>
        <div class="sl-setting-row sl-settings-card" style="margin-top: 14px;">
          <div class="sl-setting-copy">
            <label class="sl-setting-label" for="sl-home-language-select">${html(t('language_label', 'Display language'))}</label>
            <p class="sl-setting-help">${html(t('language_help', 'Choose the display language for Studio.lab settings and tools.'))}</p>
          </div>
          <div class="sl-setting-control">
            <select id="sl-home-language-select" class="sl-setting-input" data-sl-language-select>
              ${langOptions}
            </select>
          </div>
        </div>
        <p class="sl-settings-home-note">${html(t('home_auto_save_note', 'Settings save automatically. Google AI Studio saves its preferences; Studio.lab keeps yours in this browser.'))}</p>
      </section>
    `;
  }

  function renderNativeTab() {
    return `
      <section class="sl-settings-page" data-sl-tab-content="native" aria-label="Google AI Studio settings" ${activeTab === 'native' ? '' : 'hidden'}>
        <p class="sl-native-settings-loading" data-sl-native-loading role="status" hidden>Loading Google AI Studio controls…</p>
        <div data-sl-native-settings></div>
        <div class="sl-native-settings-unavailable" data-sl-native-unavailable hidden>
          <h2>Google AI Studio settings are unavailable</h2>
          <p>The native settings could not be opened on this page. You can still change your Studio.lab preferences.</p>
          <button type="button" class="sl-settings-button" data-sl-retry-native>Try again</button>
        </div>
      </section>
    `;
  }

  function updateNativeAvailability() {
    if (!modalEl) return;
    const message = modalEl.querySelector('[data-sl-native-unavailable]');
    const loading = modalEl.querySelector('[data-sl-native-loading]');
    const pending = !!nativeSettings?.isOpening();
    if (message) message.hidden = pending || !!nativeSettings?.getHost();
    if (loading) loading.hidden = !pending || !!nativeSettings?.getHost();
  }

  function renderThemeTab() {
    const t = (key, fb) => window.StudioLab?.i18n?.t ? window.StudioLab.i18n.t(key, fb || key) : (fb || key);
    const isVisible = activeTab === 'theme';
    return `
      <section class="sl-settings-page sl-settings-theme-page" data-sl-tab-content="theme" data-sl-section="theme" aria-label="${html(t('tab_theme', 'Theme'))}" ${isVisible ? '' : 'hidden'}>
        ${renderThemeTabInner()}
      </section>
    `;
  }

  function renderThemeTabInner() {
    const t = (key, fb) => window.StudioLab?.i18n?.t ? window.StudioLab.i18n.t(key, fb || key) : (fb || key);
    const activeThemeId = state.activeThemeId || 'original';
    const customThemes = Array.isArray(state.customThemes) ? state.customThemes : [];

    if (themeEditorState && window.StudioLab?.themeEditorUI?.renderEditorWorkspace) {
      return window.StudioLab.themeEditorUI.renderEditorWorkspace({
        editorState: themeEditorState,
        customThemes,
        renderIcon
      });
    }

    const isOriginalActive = activeThemeId === 'original';

    const customThemeCardsHtml = customThemes.map(item => {
      const isActive = activeThemeId === item.id;
      const presetKey = item.config?.mainInterface?.presetKey || 'purple';
      const presetObj = window.StudioLab?.themePresets?.PRESET_PALETTES?.[presetKey];
      const rp = item.config?.roleplay;
      const stylePreset = item.config?.style?.stylePreset || 'default';
      const summaryParts = [];
      if (presetObj?.label) summaryParts.push(presetObj.label);
      if (stylePreset === 'cartoon-pixel') {
        summaryParts.push(`🕹️ ${t('te_style_pixel_title', 'Pixel Hoạt Hình')}`);
      } else if (stylePreset === 'noble-fantasy') {
        summaryParts.push(`❖ ${t('te_style_noble_title', 'Cổ điển Quý tộc')}`);
      }
      if (rp?.enableNameCustom && (rp.modelName || rp.userName)) {
        summaryParts.push(`${rp.modelName || 'Model'} · ${rp.userName || 'User'}`);
      }
      const desc = item.description || summaryParts.join(' • ') || t('theme_custom_badge', 'Custom Theme');
      return `
        <div class="sl-setting-row sl-theme-card ${isActive ? 'is-active' : ''}" data-sl-theme-card="${html(item.id)}" data-sl-search-item data-sl-search="${html(item.name + ' ' + desc + ' Custom Theme .themelab')}">
          <div class="sl-theme-card-start">
            <span class="sl-theme-card-avatar" data-tone="pink">${renderIcon('palette', 'plain')}</span>
            <div class="sl-setting-copy">
              <div class="sl-theme-card-title-row">
                <h3 class="sl-setting-label">${html(item.name)}</h3>
                <span class="sl-theme-badge">${html(t('theme_custom_badge', 'Custom Theme'))}</span>
                ${stylePreset === 'cartoon-pixel' ? `<span class="sl-theme-badge">8-BIT PIXEL</span>` : ''}
                ${stylePreset === 'noble-fantasy' ? `<span class="sl-theme-badge">ROYAL NOVEL</span>` : ''}
                ${isActive ? `<span class="sl-theme-badge sl-theme-badge--active">${html(t('theme_active_badge', 'Active'))}</span>` : ''}
              </div>
              <p class="sl-setting-help">${html(desc)}</p>
            </div>
          </div>
          <div class="sl-setting-actions sl-theme-card-actions">
            ${isActive
              ? `<button type="button" class="sl-settings-button sl-theme-active-btn" disabled>${renderIcon('check', 'plain')}<span>${html(t('theme_active_badge', 'Active'))}</span></button>`
              : `<button type="button" class="sl-settings-button primary" data-sl-apply-theme="${html(item.id)}">${html(t('theme_apply_btn', 'Apply theme'))}</button>`
            }
            <button type="button" class="sl-settings-button" data-sl-edit-theme="${html(item.id)}" title="${html(t('theme_edit_btn', 'Edit'))}">
              ${renderIcon('edit', 'plain')}
              <span>${html(t('theme_edit_btn', 'Edit'))}</span>
            </button>
            <button type="button" class="sl-settings-button" data-sl-export-theme="${html(item.id)}" title="${html(t('theme_export_btn_title', 'Export as .themelab file'))}">
              ${renderIcon('download', 'plain')}
              <span>${html(t('theme_export_btn', 'Export .themelab'))}</span>
            </button>
            <button type="button" class="sl-settings-button destructive" data-sl-delete-theme="${html(item.id)}" title="${html(t('theme_delete_btn', 'Delete'))}">
              ${renderIcon('delete', 'plain')}
              <span>${html(t('theme_delete_btn', 'Delete'))}</span>
            </button>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="sl-theme-manager" data-sl-theme-manager>
        <div class="sl-settings-list sl-theme-list" role="region" aria-label="${html(t('theme_section_available', 'Available themes'))}">
          <div class="sl-setting-row sl-theme-card ${isOriginalActive ? 'is-active' : ''}" data-sl-theme-card="original" data-sl-search-item data-sl-search="Original Theme default interface giao diện gốc">
            <div class="sl-theme-card-start">
              <span class="sl-theme-card-avatar" data-tone="blue">${renderIcon('palette', 'plain')}</span>
              <div class="sl-setting-copy">
                <div class="sl-theme-card-title-row">
                  <h3 class="sl-setting-label">${html(t('theme_original_title', 'Original Theme'))}</h3>
                  <span class="sl-theme-badge">${html(t('theme_default_badge', 'Default'))}</span>
                  ${isOriginalActive ? `<span class="sl-theme-badge sl-theme-badge--active">${html(t('theme_active_badge', 'Active'))}</span>` : ''}
                </div>
                <p class="sl-setting-help">${html(t('theme_original_desc', 'Default original interface of the Studio.lab extension.'))}</p>
              </div>
            </div>
            <div class="sl-setting-actions sl-theme-card-actions">
              ${isOriginalActive
                ? `<button type="button" class="sl-settings-button sl-theme-active-btn" disabled>${renderIcon('check', 'plain')}<span>${html(t('theme_active_badge', 'Active'))}</span></button>`
                : `<button type="button" class="sl-settings-button primary" data-sl-apply-theme="original">${html(t('theme_apply_btn', 'Apply theme'))}</button>`
              }
            </div>
          </div>
          ${customThemeCardsHtml}
        </div>

        <div class="sl-settings-list sl-theme-create-section">
          <div class="sl-setting-row sl-theme-create-card" data-sl-create-theme-card data-sl-search-item data-sl-search="Create Theme Custom Theme Import .themelab tuỳ chỉnh nhập giao diện">
            <div class="sl-theme-card-start">
              <span class="sl-theme-card-avatar" data-tone="pink">${renderIcon('add', 'plain')}</span>
              <div class="sl-setting-copy">
                <h3 class="sl-setting-label">${html(t('theme_create_title', 'Create Theme / Custom Theme'))}</h3>
                <p class="sl-setting-help">${html(t('theme_create_desc', 'Create a custom theme or import an exported .themelab file to apply it immediately.'))}</p>
              </div>
            </div>
            <div class="sl-setting-actions sl-theme-card-actions">
              <button type="button" class="sl-settings-button" data-sl-import-theme-btn title="${html(t('theme_import_btn_title', 'Import a .themelab file and apply immediately'))}">
                ${renderIcon('upload', 'plain')}
                <span>${html(t('theme_import_btn', 'Import .themelab'))}</span>
              </button>
              <input type="file" accept=".themelab,application/json" data-sl-import-theme-input hidden>
              <button type="button" class="sl-settings-button primary" data-sl-open-theme-creator>
                ${renderIcon('add', 'plain')}
                <span>${html(t('theme_create_btn', 'Create Theme'))}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function rerenderThemeTabInPlace() {
    if (!modalEl) return;
    const section = modalEl.querySelector('[data-sl-tab-content="theme"]');
    if (!section) return;
    section.innerHTML = renderThemeTabInner();
    bindThemeTabEvents(section);
  }

  function bindThemeTabEvents(root) {
    if (!root) return;
    const editorRoot = root.querySelector('[data-sl-theme-editor-view]');
    if (editorRoot && window.StudioLab?.themeEditorUI?.bindEditorEvents) {
      window.StudioLab.themeEditorUI.bindEditorEvents(editorRoot, {
        onSave: ({ name, config }) => {
          saveCustomTheme({ name, config });
        },
        onBack: () => {
          themeEditorState = null;
          window.StudioLab?.themeEngine?.syncFromState?.(state);
          rerenderThemeTabInPlace();
        },
        announce: announceSettings
      });
      return;
    }

    root.querySelectorAll('[data-sl-apply-theme]').forEach(btn => {
      btn.addEventListener('click', () => {
        const themeId = btn.getAttribute('data-sl-apply-theme') || 'original';
        applyThemeById(themeId);
      });
    });
    root.querySelectorAll('[data-sl-open-theme-creator]').forEach(btn => {
      btn.addEventListener('click', () => {
        themeEditorState = { mode: 'create', themeId: null };
        rerenderThemeTabInPlace();
      });
    });
    root.querySelectorAll('[data-sl-edit-theme]').forEach(btn => {
      btn.addEventListener('click', () => {
        const themeId = btn.getAttribute('data-sl-edit-theme');
        if (!themeId) return;
        themeEditorState = { mode: 'edit', themeId };
        rerenderThemeTabInPlace();
      });
    });
    root.querySelectorAll('[data-sl-export-theme]').forEach(btn => {
      btn.addEventListener('click', () => {
        const themeId = btn.getAttribute('data-sl-export-theme');
        if (!themeId) return;
        exportCustomTheme(themeId);
      });
    });
    root.querySelectorAll('[data-sl-delete-theme]').forEach(btn => {
      btn.addEventListener('click', () => {
        const themeId = btn.getAttribute('data-sl-delete-theme');
        if (!themeId) return;
        deleteCustomTheme(themeId);
      });
    });

    const importFileInput = root.querySelector('[data-sl-import-theme-input]');
    root.querySelectorAll('[data-sl-import-theme-btn]').forEach(btn => {
      btn.addEventListener('click', () => {
        importFileInput?.click();
      });
    });
    if (importFileInput) {
      importFileInput.addEventListener('change', async () => {
        const file = importFileInput.files?.[0];
        if (!file) return;
        try {
          const rawText = await file.text();
          const fallbackName = String(file.name || 'Imported Theme')
            .replace(/\.themelab$/i, '')
            .replace(/\.json$/i, '')
            .trim() || 'Imported Theme';
          importCustomThemeFromText(rawText, fallbackName);
        } catch (_) {
          const t = (key, fb) => window.StudioLab?.i18n?.t ? window.StudioLab.i18n.t(key, fb || key) : (fb || key);
          announceSettings(t('theme_import_error_toast', 'Invalid or corrupted .themelab file.'), true);
        }
        importFileInput.value = '';
      });
    }
  }

  function renderTabButton(tab) {
    const t = (text) => window.StudioLab?.i18n?.t ? window.StudioLab.i18n.t(text, text) : text;
    return `
      <li><button type="button" class="sl-settings-nav-item ${activeTab === tab.id ? 'active' : ''}" data-sl-tab="${tab.id}" aria-controls="sl-settings-content" ${activeTab === tab.id ? 'aria-current="page"' : ''}>
        <span class="sl-settings-nav-icon" data-tone="${tab.tone}">${renderIcon(tab.icon, 'plain')}</span><span class="sl-settings-nav-label">${html(t(tab.label))}</span>
      </button></li>
    `;
  }

  function selectTab(tabId, focusContent = true) {
    if (!TABS.some(tab => tab.id === tabId)) return;
    closeSettingsMenu(false);
    if (themeEditorState) {
      const draft = window.StudioLab?.themeEditorUI?.getDraft?.();
      if (draft && draft.isDirty) {
        saveCustomTheme({ name: draft.name, config: draft.config });
      }
      themeEditorState = null;
      window.StudioLab?.themeEditorUI?.resetDraftSession?.();
      window.StudioLab?.themeEngine?.syncFromState?.(state);
      rerenderThemeTabInPlace();
    }
    activeTab = tabId;
    browseTab = tabId;
    searchQuery = '';
    const input = modalEl?.querySelector('[data-sl-search-input]');
    if (input) input.value = '';
    const clear = modalEl?.querySelector('[data-sl-search-clear]');
    if (clear) { clear.classList.remove('visible'); clear.disabled = true; }
    updateTabs();
    applySearchFilter();
    scrollActiveTabIntoView();
    const body = modalEl?.querySelector('.sl-dialog-body');
    if (body) body.scrollTop = 0;
    if (focusContent) modalEl?.querySelector('[data-sl-settings-title]')?.focus({ preventScroll: true });
  }

  function settingsGroup(module) {
    if (['text-formatter', 'modern-web-chat'].includes(module.id)) return 'tweaks';
    if (module.id === 'telemetry-blocker') return 'privacy';
    return module.group;
  }

  function renderGroupTab(group) {
    const t = (text) => window.StudioLab?.i18n?.t ? window.StudioLab.i18n.t(text, text) : text;
    // Hide modern-web-chat ("Chat layout") from settings so it stays permanently on
    const groupModules = modules.filter(module => settingsGroup(module) === group.id && module.id !== 'modern-web-chat');
    const visible = activeTab === group.tabId || activeTab === 'all';
    const controls = group.id === 'optimizer'
      ? renderOptimizerModes(groupModules) + (callModule(moduleById.get('optimizer-hard'), 'renderControls', ctx) || '')
      : groupModules.map(renderModuleItem).join('');
    const master = group.enabledKey ? renderCheckboxRow({
      id: group.id + '-enabled', title: t(group.title),
      description: t(group.id === 'optimizer' ? 'Keep long conversations responsive.' : 'Choose which interface elements to hide.'),
      key: group.enabledKey, extra: `data-sl-group-toggle="${group.id}" data-sl-setting-master`,
      card: false, heading: 'h2'
    }) : '';
    const standalone = ['response-recovery', 'optimizer', 'cleaner'].includes(group.id);
    const sectionLabel = group.id === 'response-recovery' ? 'sl-label-response-recovery'
      : group.enabledKey ? 'sl-label-' + group.id + '-enabled' : 'sl-section-' + group.id;
    const fields = group.enabledKey
      ? `<fieldset class="sl-setting-dependent" data-sl-dependent="${group.enabledKey}" ${state[group.enabledKey] ? '' : 'disabled'}><legend class="sl-sr-only">${html(t(group.title))} options</legend>${controls}</fieldset>`
      : controls;
    return `
      <section class="sl-settings-section" data-sl-tab-content="${group.tabId}" data-sl-section="${group.id}" aria-labelledby="${sectionLabel}" ${visible ? '' : 'hidden'}>
        ${standalone ? '' : `<header class="${group.id === 'modules' ? 'sl-sr-only' : 'sl-settings-section-header'}"><h2 id="sl-section-${group.id}">${html(t(group.title))}</h2></header>`}
        <div class="${group.id === 'modules' ? 'sl-settings-tools' : 'sl-settings-list'} ${group.id === 'optimizer' ? 'sl-optimizer-card' : ''}">
          ${master}${fields}
        </div>
        ${group.showTurnCounter ? `<p class="sl-setting-note"><span data-sl-live="turn-count">${getTurnCount()}</span> ${html(t('turns_rendered_note', 'turns currently rendered. Saved chats stay in Google AI Studio.'))}</p>` : ''}
      </section>
    `;
  }

  function renderModuleItem(module) {
    if (module.id === 'modern-web-chat') return '';
    const t = (text) => window.StudioLab?.i18n?.t ? window.StudioLab.i18n.t(text, text) : text;
    const rawDesc = SETTING_HELP[module.id] || (module.details || []).map(detail => detail.text).join(' ') || module.subtitle || '';
    const rawTitle = SETTING_TITLES[module.id] || module.title;
    const description = t(rawDesc);
    const title = t(rawTitle);
    if (module.stateKey) return renderCheckboxRow({
      id: module.id, title, description, key: module.stateKey,
      extra: `data-sl-module-id="${html(module.id)}"`, moduleId: module.id,
      heading: module.id === 'response-recovery' ? 'h2' : '', card: false
    });
    return `<div class="sl-setting-tool ${module.id === 'chat-export' ? 'sl-setting-export' : ''}" data-sl-module-item="${html(module.id)}" data-sl-search-item data-sl-search="${html(module.title + ' ' + title + ' ' + description)}">
      ${module.id === 'chat-cleanup' ? '' : `<div class="sl-setting-copy"><h3 class="sl-setting-label" id="sl-setting-${html(module.id)}">${html(title)}</h3><p class="${module.id === 'default-profile' ? 'sl-sr-only' : 'sl-setting-help'}" id="sl-help-${html(module.id)}">${html(description)}</p></div>`}
      ${callModule(module, 'renderControls', ctx) || ''}
    </div>`;
  }

  function renderCheckboxRow({ id, title, description, key, extra = '', moduleId = '', card = true, heading = '' }) {
    const caption = heading
      ? `<${heading} class="sl-setting-label"><label id="sl-label-${html(id)}" for="sl-control-${html(id)}">${html(title)}</label></${heading}>`
      : `<label class="sl-setting-label" id="sl-label-${html(id)}" for="sl-control-${html(id)}">${html(title)}</label>`;
    return `<div class="sl-setting-row ${card ? 'sl-settings-card' : ''}" data-sl-search-item ${moduleId ? `data-sl-module-item="${html(moduleId)}"` : ''} data-sl-search="${html(title + ' ' + description)}">
      <div class="sl-setting-copy">${caption}<p class="sl-setting-help" id="sl-help-${html(id)}">${html(description)}</p></div>
      <div class="sl-setting-control"><span class="sl-setting-checkbox-hit"><input type="checkbox" role="switch" class="sl-setting-checkbox" id="sl-control-${html(id)}" data-sl-state-key="${html(key)}" ${extra} aria-labelledby="sl-label-${html(id)}" aria-describedby="sl-help-${html(id)}" ${state[key] ? 'checked' : ''}></span></div>
    </div>`;
  }

  function renderOptimizerModes(choices) {
    const t = (text) => window.StudioLab?.i18n?.t ? window.StudioLab.i18n.t(text, text) : text;
    return `<fieldset class="sl-setting-fieldset" data-sl-search-item data-sl-search="Optimization strategy buffered safe physical aggressive cleanup ${html(choices.map(choice => SETTING_HELP[choice.id] || '').join(' '))}" aria-describedby="sl-optimizer-mode-help">
      <legend class="sl-setting-label">${html(t('Older turns'))}</legend>
      <p class="sl-sr-only" id="sl-optimizer-mode-help">Choose how older rendered turns are handled.</p>
      <div class="sl-setting-radio-options">${choices.map(choice => `<label class="sl-setting-radio-option" for="sl-control-${html(choice.id)}"><input type="radio" id="sl-control-${html(choice.id)}" name="sl-optimizer-mode" value="${html(choice.modeValue)}" data-sl-state-key="${html(choice.modeKey)}" data-sl-module-id="${html(choice.id)}" aria-labelledby="sl-label-${html(choice.id)}" aria-describedby="sl-help-${html(choice.id)}" ${state[choice.modeKey] === choice.modeValue ? 'checked' : ''}><span class="sl-setting-copy"><span class="sl-setting-label" id="sl-label-${html(choice.id)}">${html(t(SETTING_TITLES[choice.id] || choice.title))}</span><span class="sl-setting-help" id="sl-help-${html(choice.id)}">${html(t(SETTING_HELP[choice.id] || choice.subtitle))}</span></span></label>`).join('')}</div>
    </fieldset>`;
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
    return `
      <section class="sl-settings-page sl-settings-info" data-sl-tab-content="info" aria-label="About Studio.lab" ${activeTab === 'info' ? '' : 'hidden'}>
        <section class="sl-info-overview sl-settings-list" aria-label="Extension status and updates">
          <div class="sl-setting-row sl-health-card"><span class="sl-health-mark" aria-hidden="true"></span><div class="sl-setting-copy"><h3 class="sl-setting-label" data-sl-diag-badge>Checking compatibility</h3><p class="sl-setting-help sl-health-subtitle">Review the extension's status on this page.</p></div></div>
          <div class="sl-setting-row"><div class="sl-setting-copy"><h3 class="sl-setting-label">Version ${html(VERSION)}</h3><p class="sl-setting-help" data-sl-update-status>Not checked yet</p></div><div class="sl-setting-actions"><button type="button" class="sl-settings-button primary" data-sl-check-updates>Check for updates</button><a class="sl-settings-button" data-sl-release-link target="_blank" rel="noopener noreferrer" hidden>View release<span class="sl-sr-only"> (opens a new tab)</span></a></div></div>
        </section>
        <section class="sl-info-diagnostics sl-settings-list" aria-labelledby="sl-info-diagnostics">
          <div class="sl-setting-row"><div class="sl-setting-copy"><h2 class="sl-setting-label" id="sl-info-diagnostics">Diagnostics</h2><p class="sl-setting-help">Review or copy a compatibility report for a bug report.</p></div><button type="button" class="sl-settings-button" data-sl-copy-diagnostics>Copy report</button></div>
          <details class="sl-info-expand"><summary><span class="sl-setting-copy"><span class="sl-setting-label">View report</span><span class="sl-setting-help">Technical details for troubleshooting.</span></span>${renderIcon('chevron_down', 'plain')}</summary><div class="sl-info-expand-content"><p class="sl-setting-help">Chat messages, prompts, email addresses, and credentials are excluded.</p><pre class="sl-diagnostics-snapshot" data-sl-diagnostics role="region" tabindex="0" aria-label="Diagnostic report"></pre></div></details>
        </section>
        <section class="sl-info-links sl-settings-list" aria-label="Project and community">
          <a class="sl-setting-row sl-settings-search-link" href="https://github.com/dorimommy/Studio.lab" target="_blank" rel="noopener noreferrer"><span class="sl-info-link-icon">${renderIcon('science', 'plain')}</span><span class="sl-setting-copy"><span class="sl-setting-label">Project on GitHub</span><span class="sl-setting-help">Source code, releases, and bug reports.<span class="sl-sr-only"> Opens a new tab.</span></span></span>${renderIcon('arrow_outward', 'plain')}</a>
          <a class="sl-setting-row sl-settings-search-link" href="https://reddit.com/r/GoogleAIStudio/" target="_blank" rel="noopener noreferrer"><span class="sl-info-link-icon">${renderIcon('person', 'plain')}</span><span class="sl-setting-copy"><span class="sl-setting-label">Google AI Studio community</span><span class="sl-setting-help">Discussions on Reddit.<span class="sl-sr-only"> Opens a new tab.</span></span></span>${renderIcon('arrow_outward', 'plain')}</a>
        </section>
        <details class="sl-info-privacy sl-info-expand"><summary><span class="sl-setting-copy"><span class="sl-setting-label">Data and privacy</span><span class="sl-setting-help">Local browser storage and update checks.</span></span>${renderIcon('chevron_down', 'plain')}</summary><div class="sl-info-expand-content"><p>Preferences stay locally in this browser. Chats, drafts, instructions, profiles, and credentials never leave your device.</p><p>GitHub provides update checks. No analytics are collected.</p></div></details>
      </section>
    `;
  }

  function bindModalEvents() {
    if (!modalEl) return;
    let navOwnsFocus = false;
    modalEl.addEventListener('focusin', event => {
      navOwnsFocus = !!modalEl?.querySelector('.sl-settings-nav')?.contains(event.target);
    });
    modalEl.addEventListener('pointerdown', event => {
      modalEl?.querySelector('.sl-search-container')?.removeAttribute('data-sl-keyboard-focus');
      if (!modalEl?.querySelector('.sl-settings-nav')?.contains(event.target)) navOwnsFocus = false;
    }, true);
    modalEl.addEventListener('keydown', event => {
      if (event.key === 'Tab') modalEl?.querySelector('.sl-search-container')?.setAttribute('data-sl-keyboard-focus', '');
    }, true);

    const closeButton = modalEl.querySelector('[data-sl-close]');
    if (closeButton) closeButton.addEventListener('click', closeModal);
    modalEl.querySelector('[data-sl-search-form]')?.addEventListener('submit', event => {
      event.preventDefault();
      if (!searchQuery.trim()) return;
      closeSettingsMenu(false);
      (modalEl.querySelector('[data-sl-search-result]') || modalEl.querySelector('[data-sl-settings-title]'))?.focus({ preventScroll: true });
    });
    modalEl.querySelector('[data-sl-settings-menu]')?.addEventListener('click', openSettingsMenu);
    modalEl.querySelector('[data-sl-settings-menu-close]')?.addEventListener('click', () => closeSettingsMenu());
    const settingsMenu = modalEl.querySelector('.sl-settings-mobile-menu');
    settingsMenu?.addEventListener('keydown', handleSettingsMenuKey);
    settingsMenu?.addEventListener('cancel', event => { event.preventDefault(); closeSettingsMenu(); });
    settingsMenu?.addEventListener('close', () => finishSettingsMenu(true));
    settingsMenu?.addEventListener('click', event => {
      if (event.target !== settingsMenu) return;
      const bounds = settingsMenu.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeSettingsMenu();
    });
    modalScope?.listen(window, 'resize', () => {
      if (window.innerWidth > 760 && isSettingsMenuOpen()) {
        closeSettingsMenu(false);
        modalEl?.querySelector('.sl-settings-nav [aria-current="page"]')?.focus({ preventScroll: true });
      } else if (window.innerWidth <= 760 && !isSettingsMenuOpen() &&
        (modalEl?.querySelector('.sl-settings-nav')?.contains(document.activeElement) ||
          (navOwnsFocus && document.activeElement === document.body))) {
        modalEl.querySelector('[data-sl-settings-menu]')?.focus({ preventScroll: true });
      }
    });

    modalEl.querySelectorAll('[data-sl-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        selectTab(button.dataset.slTab);
      });
      button.addEventListener('keydown', event => {
        const arrows = ['ArrowUp', 'ArrowDown'];
        if (![...arrows, 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const index = TABS.findIndex(tab => tab.id === button.dataset.slTab);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1
          : (index + (['ArrowUp', 'ArrowLeft'].includes(event.key) ? -1 : 1) + TABS.length) % TABS.length;
        modalEl.querySelector(`[data-sl-tab="${TABS[next].id}"]`)?.focus();
      });
    });
    modalEl.querySelectorAll('[data-sl-open-tab]').forEach(button => {
      button.addEventListener('click', () => selectTab(button.dataset.slOpenTab));
    });
    modalEl.querySelector('[data-sl-retry-native]')?.addEventListener('click', () => {
      closeModal();
      openModal('native');
    });
    updateNativeAvailability();

    const searchInput = modalEl.querySelector('[data-sl-search-input]');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        searchQuery = searchInput.value;
        const clearButton = modalEl.querySelector('[data-sl-search-clear]');
        if (clearButton) {
          clearButton.classList.toggle('visible', !!searchQuery);
          clearButton.disabled = !searchQuery;
        }
        applySearchFilter();
        // The small-screen drawer is navigation; selecting a result closes it.
        // Keep it open during typing so the query never loses focus.
      });
      searchInput.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || !searchQuery) return;
        event.preventDefault();
        event.stopPropagation();
        clearSearchQuery();
      });
    }

    const clearSearch = modalEl.querySelector('[data-sl-search-clear]');
    if (clearSearch) {
      clearSearch.addEventListener('click', () => {
        clearSearchQuery();
      });
    }

    modalEl.querySelectorAll('[data-sl-state-key]').forEach(control => {
      control.addEventListener('change', () => handleSettingChange(control));
    });

    const langSelect = modalEl.querySelector('[data-sl-language-select]');
    if (langSelect) {
      const styledLangSelect = window.StudioLabSelect?.enhance?.(langSelect);
      if (styledLangSelect && modalScope) modalScope.add(() => styledLangSelect.dispose());
      langSelect.addEventListener('change', () => {
        const nextLang = langSelect.value;
        if (!nextLang) return;
        window.StudioLab?.i18n?.applyLanguage?.(nextLang, ctx);
        setState({ language: nextLang });
        rerenderModalInPlace();
      });
    }

    const themeSection = modalEl.querySelector('[data-sl-tab-content="theme"]');
    if (themeSection) {
      bindThemeTabEvents(themeSection);
    }

    modules.forEach((module) => {
      const dispose = callModule(module, 'bindControls', modalEl, ctx);
      if (typeof dispose === 'function' && modalScope) modalScope.add(dispose);
    });

    const copyBtn = modalEl.querySelector('[data-sl-copy-diagnostics]');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        try {
          const diag = getDiagnostics();
          await navigator.clipboard.writeText(JSON.stringify(diag, null, 2));
          announceSettings('Diagnostic report copied to the clipboard.');
        } catch (_) {
          announceSettings('The diagnostic report could not be copied. Check clipboard permissions.', true);
        }
      });
    }

    const checkUpdatesBtn = modalEl.querySelector('[data-sl-check-updates]');
    if (checkUpdatesBtn) checkUpdatesBtn.addEventListener('click', async () => {
      announceSettings('Checking for updates…');
      await checkUpdates(true);
      announceSettings(modalEl?.querySelector('[data-sl-update-status]')?.textContent || 'Update check complete.', !updateStatus?.ok);
    });

    updateModalState();
    updateTabs();
    applySearchFilter();
  }

  function rerenderModalInPlace() {
    if (!modalEl) return;
    closeSettingsMenu(false);
    const nativeHost = nativeSettings?.getHost?.();
    const tempHolder = document.createDocumentFragment();
    if (nativeHost?.component && modalEl.contains(nativeHost.component)) {
      tempHolder.appendChild(nativeHost.component);
    }
    if (modalScope) {
      modalScope.dispose();
    }
    modalScope = window.StudioLab.createScope ? window.StudioLab.createScope() : null;
    backgroundInertObserver = null;
    searchResultsSignature = '';

    modalEl.innerHTML = renderDialog();
    const slot = modalEl.querySelector('[data-sl-native-settings]');
    if (slot && tempHolder.firstChild) {
      slot.appendChild(tempHolder.firstChild);
    }
    if (slot && nativeSettings) {
      nativeSettings.attach(modalEl, slot);
    }
    if (!nativeSettings?.usesNativeFocusTrap?.()) {
      makeBackgroundInert();
    }
    bindModalEvents();
    refreshDiagnostics();
    refreshUpdateInfo();
  }

  function clearSearchQuery() {
    searchQuery = '';
    const input = modalEl?.querySelector('[data-sl-search-input]');
    if (input) input.value = '';
    const clear = modalEl?.querySelector('[data-sl-search-clear]');
    if (clear) { clear.classList.remove('visible'); clear.disabled = true; }
    applySearchFilter();
    input?.focus({ preventScroll: true });
  }

  function handleSettingChange(control) {
    const key = control.dataset.slStateKey;
    const known = GROUPS.some(group => group.enabledKey === key) || modules.some(module => module.stateKey === key || module.modeKey === key);
    if (!known || control.matches(':disabled')) return;
    if (control.type === 'checkbox') setState({ [key]: control.checked });
    else if (control.type === 'radio' && control.checked && ['smart', 'hard'].includes(control.value)) setState({ [key]: control.value });
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

    modalEl.querySelectorAll('[data-sl-state-key]').forEach(control => {
      const value = state[control.dataset.slStateKey];
      control.checked = control.type === 'radio' ? value === control.value : !!value;
    });
    modalEl.querySelectorAll('[data-sl-dependent]').forEach(fieldset => {
      fieldset.disabled = !state[fieldset.dataset.slDependent];
    });
    modalEl.querySelectorAll('[data-sl-optimizer-help]').forEach(help => {
      help.hidden = help.dataset.slOptimizerHelp !== state.optimizerMode;
    });
    refreshLiveStats();
    refreshDiagnostics();
    applySearchFilter(false);
  }

  function updateTabs() {
    if (!modalEl) return;
    const current = activeTab === 'search' ? browseTab : activeTab;
    modalEl.querySelectorAll('[data-sl-tab]').forEach(button => {
      const selected = button.dataset.slTab === current;
      button.classList.toggle('active', selected);
      if (selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    modalEl.querySelectorAll('[data-sl-tab-content]').forEach(content => {
      const page = content.dataset.slTabContent;
      const studio = GROUPS.some(group => group.tabId === page);
      content.hidden = !(page === activeTab || (activeTab === 'all' && studio));
    });
    const shell = modalEl.querySelector('.sl-dialog');
    shell?.classList.toggle('sl-settings-home', activeTab === 'home');
    shell?.classList.toggle('sl-search-active', activeTab === 'search');
    shell?.classList.toggle('sl-native-active', activeTab === 'native');
    const heading = modalEl.querySelector('.sl-settings-main-heading');
    if (heading) heading.hidden = ['home', 'info'].includes(activeTab);
    const home = modalEl.querySelector('[data-sl-home-intro]');
    if (home) home.hidden = activeTab !== 'home';
    const t = (text) => window.StudioLab?.i18n?.t ? window.StudioLab.i18n.t(text, text) : text;
    const tab = TABS.find(item => item.id === activeTab);
    const searchInput = modalEl.querySelector('[data-sl-search-input]');
    if (searchInput) {
      searchInput.placeholder = t('Search settings');
      searchInput.setAttribute('aria-label', t('Search settings'));
      searchInput.maxLength = 256;
    }
    const title = modalEl.querySelector('[data-sl-settings-title]');
    const description = modalEl.querySelector('[data-sl-settings-description]');
    if (title) title.textContent = tab ? t(tab.label) : t('Search results');
    if (description) description.textContent = tab ? t(tab.description) : 'Search across Google AI Studio and Studio.lab.';
  }

  function scrollActiveTabIntoView() {
    const button = modalEl?.querySelector('[data-sl-tab].active');
    if (button && isSettingsMenuOpen()) button.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }

  function applySearchFilter(announce = true) {
    if (!modalEl) return;
    const query = normalizeSearch(searchQuery).slice(0, 256);
    activeTab = query ? 'search' : browseTab;
    updateTabs();
    nativeSettings?.filter('');
    const tokens = query.split(' ').filter(Boolean);
    const matches = query ? settingsSearchIndex().map(entry => {
      const title = normalizeSearch(entry.title), words = normalizeSearch(entry.words);
      const score = tokens.every(token => words.includes(token))
        ? (title === query ? 100 : title.startsWith(query) ? 80 : title.includes(query) ? 60 : 20) : 0;
      return { ...entry, score };
    }).filter(entry => entry.score).sort((a, b) => b.score - a.score || a.order - b.order) : [];
    const count = matches.length;
    renderSearchResults(matches);
    const show = modalEl.querySelector('[data-sl-search-show]');
    if (show) { show.hidden = !query; show.textContent = `Show ${count} ${count === 1 ? 'result' : 'results'}`; }
    const empty = modalEl.querySelector('[data-sl-search-empty]');
    if (empty) empty.hidden = !query || count > 0;
    if (query) {
      const description = modalEl.querySelector('[data-sl-settings-description]');
      if (description) description.textContent = `${count} ${count === 1 ? 'result' : 'results'} for “${searchQuery.trim().slice(0, 256)}”.`;
    }
    if (announce) {
      clearTimeout(searchAnnouncementTimer);
      const status = modalEl.querySelector('[data-sl-search-status]');
      const message = query ? `${count} ${count === 1 ? 'result' : 'results'} found.`
        : status?.textContent ? 'Search cleared. All settings in this section are shown.' : '';
      searchAnnouncementTimer = setTimeout(() => {
        if (status?.isConnected && status.textContent !== message) status.textContent = message;
      }, 350);
    }
  }

  function normalizeSearch(value) {
    return String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/[\s\u200b]+/g, ' ').trim();
  }

  function settingsSearchIndex() {
    const entries = [], seen = new Set();
    const aliases = {
      'response-recovery': 'recovery interrupted відповідь відновлення', optimizer: 'optimizer optimization turns chat оптимізація ліміт повідомлення чат',
      'optimizer-hard': 'automatic manual turn limit keep turns ліміт повідомлень автоматичний',
      'chat-export': 'download conversation markdown json export завантажити експорт чат',
      'chat-cleanup': 'cleanup delete think media code share fix xoá think xoá all sửa lỗi share',
      'response-history': 'multiple response options history <1/3> rerun tạo lại phản hồi',
      'default-profile': 'model system prompt instruction default profile defaults модель інструкція промпт',
      'draft-saver': 'draft save чернетка зберегти', 'word-counter': 'words characters counter слова символи',
      'text-formatter': 'markdown formatting текст форматування', 'telemetry-blocker': 'privacy analytics телеметрія приватність'
    };
    const add = (tab, title, help, target, words = '') => {
      if (!title) return;
      const key = `${tab}:${title}`;
      if (seen.has(key)) return;
      seen.add(key);
      entries.push({ key, tab, title, help, target, words: `${title} ${help} ${words}`, order: entries.length });
    };
    for (const item of modalEl.querySelectorAll('[data-sl-search-item], [data-sl-section] .sl-setting-row')) {
      const section = item.closest('[data-sl-section]');
      if (!section) continue;
      const label = item.querySelector('.sl-setting-label, legend, label, summary');
      if (label?.closest('[data-sl-search-item], .sl-setting-row') !== item) continue;
      let hidden = false;
      for (let parent = item; parent && parent !== section; parent = parent.parentElement) {
        if (parent.hidden) { hidden = true; break; }
      }
      if (hidden) continue;
      const title = label?.textContent?.trim();
      const help = item.querySelector('.sl-setting-help, .sl-sr-only')?.textContent?.trim() || '';
      const module = item.dataset.slModuleItem || section.dataset.slSection;
      add(section.dataset.slTabContent, title, help, item,
        `${item.dataset.slSearch || ''} ${aliases[module] || ''} ${section.dataset.slSection} Studio.lab`);
    }
    for (const control of modalEl.querySelectorAll('[data-sl-section] .sl-setting-tool-fields button, [data-sl-section] .sl-setting-tool-fields select')) {
      const section = control.closest('[data-sl-section]');
      const explicitLabel = control.id ? modalEl.querySelector(`label[for="${cssEscape(control.id)}"]`) : null;
      const title = explicitLabel?.textContent?.trim() || control.getAttribute('aria-label') ||
        (control.tagName === 'BUTTON' ? control.textContent.trim() : '');
      const module = control.closest('[data-sl-module-item]')?.dataset.slModuleItem;
      add(section.dataset.slTabContent, title, SETTING_HELP[module] || '', control, aliases[module] || '');
    }
    for (const item of modalEl.querySelectorAll('.sl-native-setting-row')) {
      if (item.hasAttribute('data-sl-hidden-theme') || item.hidden) continue;
      const title = item.querySelector('.setting-label, .title, label')?.textContent?.trim();
      const help = item.querySelector('.setting-description')?.textContent?.trim() || '';
      if (/^theme$/i.test(title || '') || /adjust the visual appearance/i.test(help)) continue;
      add('native', title, help, item, 'Google AI Studio GAIS ' +
        (/submit/i.test(title || '') ? 'shortcut enter keyboard клавіатура клавіша' :
          /autocomplete/i.test(title || '') ? 'completion text автодоповнення' :
            /notification/i.test(title || '') ? 'сповіщення' : /microphone/i.test(title || '') ? 'мікрофон' : ''));
    }
    for (const tab of TABS.filter(tab => ['info', 'native'].includes(tab.id))) {
      const words = tab.id === 'info' ? 'version diagnostics privacy updates версія діагностика приватність оновлення' : 'GAIS Google preferences';
      add(tab.id, tab.label, tab.description, null, words);
    }
    return entries;
  }

  function renderSearchResults(entries) {
    const list = modalEl?.querySelector('[data-sl-search-results]');
    if (!list) return;
    const signature = JSON.stringify(entries.map(entry => [entry.key, entry.help]));
    if (signature === searchResultsSignature) return;
    searchResultsSignature = signature;
    const focusedKey = document.activeElement?.dataset?.slSearchResult;
    list.replaceChildren();
    for (const entry of entries) {
      const li = el('<li></li>');
      const button = el('<button type="button" class="sl-settings-result"></button>');
      const page = TABS.find(tab => tab.id === entry.tab)?.label || 'Studio.lab';
      button.dataset.slSearchResult = entry.key;
      button.dataset.slSearchDestination = entry.tab;
      button.innerHTML = `<span class="sl-setting-copy"><span class="sl-setting-result-page">${html(page)}</span><span class="sl-setting-label">${html(entry.title)}</span>${entry.help ? `<span class="sl-setting-help">${html(entry.help)}</span>` : ''}</span>${renderIcon('arrow_outward', 'plain')}`;
      button.addEventListener('click', () => openSearchResult(entry));
      li.appendChild(button); list.appendChild(li);
      if (entry.key === focusedKey) button.focus({ preventScroll: true });
    }
  }

  function openSearchResult(entry) {
    selectTab(entry.tab, !entry.target);
    if (!entry.target?.isConnected) return;
    for (let ancestor = entry.target.parentElement; ancestor && ancestor !== modalEl; ancestor = ancestor.parentElement) {
      if (ancestor.tagName === 'DETAILS') ancestor.open = true;
    }
    const controls = entry.target.matches('button, input, select, textarea') ? [entry.target]
      : [...entry.target.querySelectorAll('button, input, select, textarea, summary, [tabindex="0"]')];
    const control = controls.find(node => !node.matches(':disabled') && !node.closest('[hidden]') && node.getClientRects().length);
    const master = entry.target.closest('[data-sl-section]')?.querySelector('[data-sl-setting-master]');
    const automaticLimit = entry.target.querySelector('[data-sl-keep-number]')?.matches(':disabled')
      ? entry.target.closest('[data-sl-controls-for]')?.querySelector('[data-sl-auto-keep]:not(:disabled)') : null;
    const focus = control || (entry.target.closest('fieldset:disabled') ? master : null) || automaticLimit || entry.target;
    if (focus === entry.target) focus.tabIndex = -1;
    entry.target.scrollIntoView({ block: 'center', behavior: 'auto' });
    focus.focus({ preventScroll: true });
    if (focus === master && !control) announceSettings('Enable this group to change its options.');
    else if (focus === automaticLimit && !control) announceSettings('Turn off the automatic limit to choose how many turns to keep.');
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
    return $$(sel).filter(turn => !turn.hasAttribute('data-sl-buffered-turn')).length;
  }

  function getDiagnostics() {
    const ngVersion = $('[ng-version]')?.getAttribute('ng-version') ||
                      $('app-root')?.getAttribute('ng-version') ||
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
      const foundNodes = $$(sel);
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
        statusBadge.textContent = 'Some tools need attention';
        if (healthCard) healthCard.dataset.health = 'error';
        if (subtitle) subtitle.textContent = 'Some modules need attention. See diagnostics below.';
      } else if (diag.aiStudio.isChat && missing > 3) {
        statusBadge.textContent = 'Compatibility needs review';
        if (healthCard) healthCard.dataset.health = 'warning';
        if (subtitle) subtitle.textContent = 'AI Studio may have changed. Review compatibility below.';
      } else {
        statusBadge.textContent = 'Ready to use';
        if (healthCard) healthCard.dataset.health = 'ok';
        if (subtitle) subtitle.textContent = 'Studio.lab is ready on this page.';
      }
    }
  }

  function escHandler(event) {
    if (event.defaultPrevented) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      focusSettingsSearch();
      return;
    }
    if (handleSettingsMenuKey(event)) return;
    // A native popup or a second CDK dialog owns its own Escape and focus trap.
    const nativeHost = nativeSettings?.getHost()?.container;
    const nativePopup = $$('.cdk-overlay-container [role="listbox"], .cdk-overlay-container [role="menu"], .cdk-overlay-container [role="dialog"], .sl-update-popup')
      .some(node => node !== nativeHost && !modalEl?.contains(node) && node.getClientRects().length);
    if (nativePopup) return;
    if (event.key === 'Escape') closeModal();
    if (event.key !== 'Tab' || !modalEl) return;
    if (nativeSettings?.usesNativeFocusTrap?.()) return; // The original Angular CDK traps an adopted view.
    const focusable = getModalFocusables();
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

  function getModalFocusables() {
    return modalEl ? [...modalEl.querySelectorAll('button, input, select, textarea, summary, a[href], iframe, [tabindex="0"]')]
      .filter(node => {
        if (node.matches(':disabled') || node.closest('[hidden], [inert]') || node.getAttribute('aria-disabled') === 'true' || node.tabIndex < 0 || !node.getClientRects().length) return false;
        if (node.type === 'radio' && node.name) {
          const group = [...modalEl.querySelectorAll(`input[type="radio"][name="${cssEscape(node.name)}"]`)].filter(input => !input.matches(':disabled'));
          return node === (group.find(input => input.checked) || group[0]);
        }
        return true;
      }) : [];
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
