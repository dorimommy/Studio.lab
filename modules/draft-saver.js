/**
 * draft-saver.js — Migrated to @studiolab/core (SDK testing branch).
 * Публічний інтерфейс той самий: registerModule({ id: 'draft-saver', ... }) — drop-in заміна.
 * Поведінка збережена 1:1, прибрано тільки бойлерплейт (observer/poll/storage/listeners).
 */

// Drafts belong to one AI Studio route and use extension-private storage, never host localStorage.
(function () {
  'use strict';
  if (!window.StudioLab || typeof window.StudioLab.registerModule !== 'function') return;
  const { $, el, onAdded, scope, store, waitFor } = window.StudioLabCore;

  const PREFIX = 'sl_draft_v2_';
  const MAX_AGE = 72 * 60 * 60 * 1000;
  const MAX_TEXT = 500000;
  const MAX_DRAFTS = 20;
  const MAX_BYTES = 4 * 1024 * 1024;

  // Усі підписки модуля живуть тут; io.dispose() відписує все разом.
  const io = scope();

  let ctxRef, activeTextarea, indicatorEl, saveTimer, pendingSave, disposeObserver;
  let activeRoute = null;
  let revision = 0;
  let restoring = false;
  let enabled = false;
  let storageQueue = Promise.resolve();
  const sentAt = new Map();
  const requests = new Map();

  function route() {
    return location.pathname.startsWith('/prompts/') ? location.pathname : null;
  }
  function keyFor(path) { return PREFIX + encodeURIComponent(path); }
  function log(message, type = 'warn') {
    if (window.StudioLab.log) window.StudioLab.log(message, type);
  }
  function enqueue(work) {
    storageQueue = storageQueue.then(work).catch(() => {
      log('Draft storage unavailable; this prompt may not be protected.');
    });
    return storageQueue;
  }
  function isStealthDraftText(txt) {
    if (typeof txt !== 'string') return false;
    return txt.includes('[[SL_HIDDEN_SUGGEST_REQ]]') || txt.includes('[[SL_HIDDEN_IMPROVE_REQ]]');
  }
  function validDraft(value, path) {
    return !!(value && value.version === 2 && value.route === path &&
      typeof value.text === 'string' && value.text.trim() && !isStealthDraftText(value.text) && value.text.length <= MAX_TEXT &&
      Number.isFinite(value.ts) && value.ts <= Date.now() + 60000 &&
      Date.now() - value.ts <= MAX_AGE && value.ts > (sentAt.get(path) || 0));
  }
  async function pruneDrafts(incoming) {
    const all = await store.get(null);
    if (incoming) all[keyFor(incoming.route)] = incoming;
    const retained = [], remove = [];
    Object.entries(all || {}).forEach(([key, value]) => {
      if (!key.startsWith(PREFIX)) return;
      if (!value || typeof value.route !== 'string' || key !== keyFor(value.route) || !validDraft(value, value.route)) remove.push(key);
      else retained.push([key, value]);
    });
    retained.sort((a, b) => b[1].ts - a[1].ts);
    let bytes = 0;
    retained.forEach(([key, value], index) => {
      bytes += new Blob([key, JSON.stringify(value)]).size;
      if (index >= MAX_DRAFTS || bytes > MAX_BYTES) remove.push(key);
    });
    if (remove.length) await store.remove(remove);
  }
  function savePending() {
    clearTimeout(saveTimer);
    saveTimer = null;
    const draft = pendingSave;
    pendingSave = null;
    if (!draft) return;
    enqueue(async () => {
      if (!draft.text.trim() || isStealthDraftText(draft.text)) await store.remove(keyFor(draft.route));
      else if (draft.text.length <= MAX_TEXT && draft.ts > (sentAt.get(draft.route) || 0)) {
        // Make room before writing so the new draft does not first hit Chrome's quota.
        await pruneDrafts(draft);
        await store.set({ [keyFor(draft.route)]: draft });
      }
    });
  }
  function onInput(event) {
    if (!enabled || restoring || !isPromptTextarea(event.target) || !route()) return;
    if (document.body?.classList?.contains('aistu-stealth-sending-prompt') || isStealthDraftText(event.target.value || '')) return;
    revision++;
    activeTextarea = event.target;
    activeRoute = route();
    if (pendingSave && pendingSave.route !== activeRoute) savePending();
    // Capture the route before debounce; a later navigation must not rename this draft.
    pendingSave = { version: 2, route: activeRoute, text: event.target.value || '', ts: Date.now() };
    clearTimeout(saveTimer);
    if (pendingSave.text.length > MAX_TEXT) {
      log('Draft is too large to autosave (500,000 character limit).');
      const oversizedRoute = pendingSave.route;
      pendingSave = null;
      enqueue(() => store.remove(keyFor(oversizedRoute)));
      return;
    }
    saveTimer = setTimeout(savePending, 300);
    if (!pendingSave.text.trim()) removeIndicator();
  }
  function removeLegacyDraft(path) {
    try {
      localStorage.removeItem('sl_draft_' + path.replace(/\/+$/, ''));
      const latest = localStorage.getItem('sl_draft_latest');
      if (latest && JSON.parse(latest).path === path) localStorage.removeItem('sl_draft_latest');
    } catch (_) {}
  }
  function clearDraft(path, submissionTime) {
    if (!path) return;
    if (submissionTime) sentAt.set(path, submissionTime);
    if (pendingSave && pendingSave.route === path && (!submissionTime || pendingSave.ts <= submissionTime)) {
      clearTimeout(saveTimer);
      pendingSave = null;
    }
    if (path === activeRoute || path === route()) {
      revision++;
      removeIndicator();
    }
    enqueue(async () => {
      const key = keyFor(path);
      const saved = await store.get([key]);
      if (!submissionTime || !saved?.[key] || saved[key].ts <= submissionTime) await store.remove(key);
    });
    removeLegacyDraft(path);
  }
  function onRequest(event) {
    const data = event.detail;
    if (!enabled || !data || data.version !== 1 || typeof data.requestId !== 'string' ||
        typeof data.route !== 'string' || !data.route.startsWith('/prompts/') ||
        !Number.isFinite(data.ts) || Math.abs(Date.now() - data.ts) > 60000) return;
    requests.set(data.requestId, { route: data.route, ts: data.ts });
    if (requests.size > 20) requests.delete(requests.keys().next().value);
  }
  function onFinished(event) {
    const data = event.detail;
    if (!data || data.version !== 1) return;
    const request = requests.get(data.requestId);
    requests.delete(data.requestId);
    if (!enabled || !request || !data.ok || request.route !== data.route) return;
    // A rerun can generate while an unrelated unsent prompt is still in the
    // editor. Never invalidate that draft, or a newer draft typed mid-stream.
    const textarea = $('ms-prompt-box textarea');
    if (route() !== request.route || !textarea || textarea.value.trim()) return;
    clearDraft(request.route, request.ts);
  }
  async function readDraft(path) {
    const key = keyFor(path);
    const values = await store.get([key]);
    if (validDraft(values && values[key], path)) return values[key];
    if (values && values[key]) await store.remove(key);
    if (sentAt.has(path)) return null;
    // Migrate only the exact-route legacy record, never the cross-chat "latest".
    let legacy;
    try { legacy = JSON.parse(localStorage.getItem('sl_draft_' + path.replace(/\/+$/, '')) || 'null'); }
    catch (_) { return null; }
    const migrated = legacy && { version: 2, route: legacy.path, text: legacy.text, ts: legacy.ts };
    if (!validDraft(migrated, path)) return null;
    await pruneDrafts(migrated);
    await store.set({ [key]: migrated });
    removeLegacyDraft(path);
    return migrated;
  }
  function isPromptTextarea(element) {
    return !!(element && element.tagName === 'TEXTAREA' && element.closest('ms-prompt-box'));
  }

  // Було: ручний poll() з лічильником спроб + restoreTimer, який треба було
  // чистити в трьох місцях. Стало: waitFor, скасування — через revision-guard.
  async function watchTextarea() {
    if (!enabled || !route()) return;
    const expectedRoute = route(), expectedRevision = revision;
    const textarea = await waitFor(() => {
      if (!enabled || route() !== expectedRoute || revision !== expectedRevision) return null;
      return $('ms-prompt-box textarea');
    }, { timeout: 10000, interval: 250 }); // було: 40 спроб × 250 мс
    if (!textarea || !enabled || route() !== expectedRoute || revision !== expectedRevision) return;
    activeTextarea = textarea;
    activeRoute = expectedRoute;
    attemptRestore(textarea, expectedRoute, expectedRevision);
  }
  function attemptRestore(textarea, expectedRoute, expectedRevision) {
    if (textarea.value && textarea.value.trim()) return;
    enqueue(async () => {
      const saved = await readDraft(expectedRoute);
      if (!saved || !enabled || revision !== expectedRevision || route() !== expectedRoute ||
          textarea !== activeTextarea || !textarea.isConnected || textarea.value.trim() ||
          !validDraft(saved, expectedRoute)) return;
      restoring = true;
      try { applyText(textarea, saved.text); }
      finally { restoring = false; }
      showRestoredIndicator(textarea);
      log('Restored unsaved prompt draft (' + saved.text.length + ' chars)', 'success');
    });
  }
  function applyText(textarea, text) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(textarea, text);
    textarea.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }
  function showRestoredIndicator(textarea) {
    removeIndicator();
    const promptBox = textarea.closest('ms-prompt-box');
    if (!promptBox) return;
    const t = (key, fb) => window.StudioLab?.i18n?.t ? window.StudioLab.i18n.t(key, fb || key) : (fb || key);
    indicatorEl = el(
      '<div class="sl-draft-indicator">' +
      '<span class="material-symbols-outlined notranslate sl-draft-icon">history</span>' +
      `<span class="sl-draft-indicator-text">${t('draft_restored_text', 'Restored unsaved draft')}</span>` +
      `<button type="button" class="sl-draft-discard-btn">${t('draft_discard_btn', 'Discard')}</button>` +
      `<button type="button" class="sl-draft-close-btn" title="${t('draft_dismiss_title', 'Dismiss')}">×</button>` +
      '</div>'
    );
    $('.sl-draft-discard-btn', indicatorEl).onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      clearDraft(route());
      restoring = true;
      try { if (textarea === activeTextarea && textarea.isConnected) applyText(textarea, ''); }
      finally { restoring = false; }
      removeIndicator();
    };
    $('.sl-draft-close-btn', indicatorEl).onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      removeIndicator();
    };
    promptBox.prepend(indicatorEl);
  }
  function removeIndicator() {
    if (indicatorEl) indicatorEl.remove();
    indicatorEl = null;
  }

  // Було: ручний MutationObserver + observer.disconnect() в трьох місцях.
  // Стало: onAdded повертає dispose(), один виклик — і все відписано.
  function updateEnabled() {
    const next = !!(ctxRef && ctxRef.state.draftSaverEnabled);
    if (next === enabled) return;
    revision++;
    enabled = next;
    if (disposeObserver) { disposeObserver(); disposeObserver = null; }
    if (!enabled) {
      savePending();
      activeTextarea = null;
      removeIndicator();
      return;
    }
    if (document.documentElement) {
      disposeObserver = onAdded(document.documentElement, 'ms-prompt-box textarea',
        node => { if (node !== activeTextarea) watchTextarea(); });
    }
    watchTextarea();
  }

  window.StudioLab.registerModule({
    id: 'draft-saver', group: 'tweaks', order: 25,
    title: 'Draft Crash Protection', subtitle: 'autosave-unsent-prompts', icon: 'storage',
    stateKey: 'draftSaverEnabled', defaults: { draftSaverEnabled: true },
    details: [
      { icon: 'storage', text: 'Stores unsent text privately for up to 72 hours (20 drafts, 4 MiB total).' },
      { icon: 'history', text: 'Restores only the current chat draft; attachments are not saved.' }
    ],
    init(ctx) {
      ctxRef = ctx;
      // Було: ручний listen() + масив listeners. Стало: все в скоупі io.
      io.on(document, 'input', onInput);
      io.on(window, '__sl_requestPayload', onRequest);
      io.on(window, '__sl_requestFinished', onFinished);
      io.on(window, 'pagehide', savePending);
      enqueue(pruneDrafts);
      updateEnabled();
    },
    onStateChange(ctx) { ctxRef = ctx; updateEnabled(); },
    onRouteChange(ctx, current, previous) {
      if (current && previous && current.key === previous.key) return;
      ctxRef = ctx || ctxRef;
      savePending();
      revision++;
      activeRoute = route();
      activeTextarea = null;
      removeIndicator();
      watchTextarea();
    },
    dispose() {
      savePending();
      enabled = false;
      revision++;
      if (disposeObserver) { disposeObserver(); disposeObserver = null; }
      io.dispose();
      requests.clear();
      removeIndicator();
    }
  });
})();
