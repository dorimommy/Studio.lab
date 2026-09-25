/**
 * Draft Crash Protection. Each draft belongs to one AI Studio route and lives
 * in extension-private storage, never in the host page's localStorage.
 */
(function () {
  'use strict';
  if (!window.StudioLab || typeof window.StudioLab.registerModule !== 'function') return;
  const PREFIX = 'sl_draft_v2_';
  const MAX_AGE = 72 * 60 * 60 * 1000;
  const MAX_TEXT = 500000;
  const MAX_DRAFTS = 20;
  const MAX_BYTES = 4 * 1024 * 1024;
  let ctxRef, activeTextarea, indicatorEl, saveTimer, restoreTimer, pendingSave, observer;
  let activeRoute = null;
  let revision = 0;
  let restoring = false;
  let enabled = false;
  let storageQueue = Promise.resolve();
  const listeners = [];
  const sentAt = new Map();
  const requests = new Map();

  function route() {
    return location.pathname.startsWith('/prompts/') ? location.pathname : null;
  }
  function keyFor(path) { return PREFIX + encodeURIComponent(path); }
  function log(message, type = 'warn') {
    if (window.StudioLab.log) window.StudioLab.log(message, type);
  }
  function storage(method, value) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local[method](value, result => {
          const error = chrome.runtime && chrome.runtime.lastError;
          if (error) reject(new Error(error.message));
          else resolve(result);
        });
      } catch (error) { reject(error); }
    });
  }
  function enqueue(work) {
    storageQueue = storageQueue.then(work).catch(() => {
      log('Draft storage unavailable; this prompt may not be protected.');
    });
    return storageQueue;
  }
  function validDraft(value, path) {
    return !!(value && value.version === 2 && value.route === path &&
      typeof value.text === 'string' && value.text.trim() && value.text.length <= MAX_TEXT &&
      Number.isFinite(value.ts) && value.ts <= Date.now() + 60000 &&
      Date.now() - value.ts <= MAX_AGE && value.ts > (sentAt.get(path) || 0));
  }
  async function pruneDrafts(incoming) {
    const all = await storage('get', null);
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
    if (remove.length) await storage('remove', remove);
  }
  function savePending() {
    clearTimeout(saveTimer);
    saveTimer = null;
    const draft = pendingSave;
    pendingSave = null;
    if (!draft) return;
    enqueue(async () => {
      if (!draft.text.trim()) await storage('remove', keyFor(draft.route));
      else if (draft.text.length <= MAX_TEXT && draft.ts > (sentAt.get(draft.route) || 0)) {
        // Make room before writing so the new draft does not first hit Chrome's quota.
        await pruneDrafts(draft);
        await storage('set', { [keyFor(draft.route)]: draft });
      }
    });
  }
  function onInput(event) {
    if (!enabled || restoring || !isPromptTextarea(event.target) || !route()) return;
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
      enqueue(() => storage('remove', keyFor(oversizedRoute)));
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
      const saved = await storage('get', [key]);
      if (!submissionTime || !saved?.[key] || saved[key].ts <= submissionTime) await storage('remove', key);
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
    const textarea = document.querySelector('ms-prompt-box textarea');
    if (route() !== request.route || !textarea || textarea.value.trim()) return;
    clearDraft(request.route, request.ts);
  }
  async function readDraft(path) {
    const key = keyFor(path);
    const values = await storage('get', [key]);
    if (validDraft(values && values[key], path)) return values[key];
    if (values && values[key]) await storage('remove', key);
    if (sentAt.has(path)) return null;
    // Migrate only the exact-route legacy record, never the cross-chat "latest".
    let legacy;
    try { legacy = JSON.parse(localStorage.getItem('sl_draft_' + path.replace(/\/+$/, '')) || 'null'); }
    catch (_) { return null; }
    const migrated = legacy && { version: 2, route: legacy.path, text: legacy.text, ts: legacy.ts };
    if (!validDraft(migrated, path)) return null;
    await pruneDrafts(migrated);
    await storage('set', { [key]: migrated });
    removeLegacyDraft(path);
    return migrated;
  }
  function isPromptTextarea(element) {
    return !!(element && element.tagName === 'TEXTAREA' && element.closest('ms-prompt-box'));
  }
  function watchTextarea() {
    clearTimeout(restoreTimer);
    if (!enabled || !route()) return;
    const expectedRoute = route(), expectedRevision = revision;
    let attempts = 0;
    function poll() {
      if (!enabled || route() !== expectedRoute || revision !== expectedRevision) return;
      const textarea = document.querySelector('ms-prompt-box textarea');
      if (textarea) {
        activeTextarea = textarea;
        activeRoute = expectedRoute;
        attemptRestore(textarea, expectedRoute, expectedRevision);
      } else if (++attempts < 40) restoreTimer = setTimeout(poll, 250);
    }
    poll();
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
    indicatorEl = document.createElement('div');
    indicatorEl.className = 'sl-draft-indicator';
    const icon = document.createElement('span');
    icon.className = 'material-symbols-outlined notranslate sl-draft-icon';
    icon.textContent = 'history';
    const label = document.createElement('span');
    label.className = 'sl-draft-indicator-text';
    label.textContent = 'Restored unsaved draft';
    const discard = document.createElement('button');
    discard.type = 'button';
    discard.className = 'sl-draft-discard-btn';
    discard.textContent = 'Discard';
    discard.onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      clearDraft(route());
      restoring = true;
      try { if (textarea === activeTextarea && textarea.isConnected) applyText(textarea, ''); }
      finally { restoring = false; }
      removeIndicator();
    };
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'sl-draft-close-btn';
    close.title = 'Dismiss';
    close.textContent = '\u00d7';
    close.onclick = event => { event.preventDefault(); event.stopPropagation(); removeIndicator(); };
    indicatorEl.append(icon, label, discard, close);
    promptBox.prepend(indicatorEl);
  }
  function removeIndicator() {
    if (indicatorEl) indicatorEl.remove();
    indicatorEl = null;
  }
  function updateEnabled() {
    const next = !!(ctxRef && ctxRef.state.draftSaverEnabled);
    if (next === enabled) return;
    revision++;
    enabled = next;
    clearTimeout(restoreTimer);
    if (observer) observer.disconnect();
    if (!enabled) {
      savePending();
      activeTextarea = null;
      removeIndicator();
      return;
    }
    observer = new MutationObserver(() => {
      const textarea = document.querySelector('ms-prompt-box textarea');
      if (textarea && textarea !== activeTextarea) watchTextarea();
    });
    if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true });
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
      const listen = (target, name, handler) => { target.addEventListener(name, handler); listeners.push(() => target.removeEventListener(name, handler)); };
      listen(document, 'input', onInput);
      listen(window, '__sl_requestPayload', onRequest);
      listen(window, '__sl_requestFinished', onFinished);
      listen(window, 'pagehide', savePending);
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
      clearTimeout(restoreTimer);
      if (observer) observer.disconnect();
      listeners.splice(0).forEach(dispose => dispose());
      requests.clear();
      removeIndicator();
    }
  });
})();
