(function () {
  'use strict';
  if (!window.StudioLab?.registerModule || !window.StudioLabCore) return;
  const { scope, waitFor } = window.StudioLabCore;
  const rerunSelector = 'button.rerun-button, button[name="rerun-button"], ms-button[name="rerun-button"], [aria-label*="Rerun" i]';
  const allowedTags = new Set(['P', 'BR', 'UL', 'OL', 'LI', 'PRE', 'CODE', 'STRONG', 'B', 'EM', 'I', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'HR']);
  const blockTags = new Set(['p', 'br', 'li', 'pre', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr', 'hr']);
  const chats = new Map();
  let ctx = null, owner = null, activeRoute = '', orphanRoot = null, pendingRefresh = null;
  let sequence = 0;
  const MAX_CHATS = 8, MAX_TURNS = 50, MAX_VERSIONS = 20, MAX_CHARS = 50000, MAX_NODES = 3000, MAX_CHAT_CHARS = 2000000;
  const enabled = () => ctx?.state?.multipleResponseEnabled !== false;
  const route = () => window.location.pathname;

  function chatFor(path) {
    if (!chats.has(path)) {
      if (chats.size >= MAX_CHATS) {
        chats.delete(chats.keys().next().value);
        showLimit('The oldest chat previews were cleared to make room.');
      }
      chats.set(path, []);
    }
    return chats.get(path);
  }
  function showLimit(message) {
    if (!owner || !document.body) return;
    let status = document.querySelector('.sl-history-capacity');
    if (!status) {
      status = document.createElement('p'); status.className = 'sl-history-capacity';
      status.setAttribute('role', 'status'); document.body.appendChild(status);
      owner.add(() => status.remove());
    }
    status.textContent = message;
  }

  function snapshot(turn) {
    const parts = [...turn.querySelectorAll('ms-text-chunk')].filter(node => !node.closest('ms-thought-chunk, .thought-panel, .thought-chunk'));
    const roots = parts.length ? parts : [turn.querySelector('.turn-content')].filter(Boolean);
    let nodes = 0, chars = 0;
    function copy(node) {
      if (++nodes > MAX_NODES || chars >= MAX_CHARS) return [];
      if (node.nodeType === 3) {
        const text = String(node.textContent || '').slice(0, MAX_CHARS - chars);
        chars += text.length;
        return text ? [{ text }] : [];
      }
      if (node.nodeType !== 1) return [];
      const tag = node.tagName.toUpperCase();
      if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'VIDEO', 'AUDIO', 'IMG'].includes(tag)) return [];
      const children = [...node.childNodes].flatMap(copy);
      if (!node.childNodes.length && node.textContent && chars < MAX_CHARS) {
        const text = String(node.textContent).slice(0, MAX_CHARS - chars);
        chars += text.length;
        children.push({ text });
      }
      return allowedTags.has(tag) ? [{ tag: tag.toLowerCase(), children }] : children;
    }
    const tree = roots.flatMap(copy);
    return { tree, text: treeText(tree), truncated: nodes > MAX_NODES || chars >= MAX_CHARS };
  }
  function treeText(nodes) {
    return nodes.map(node => node.text !== undefined ? node.text : treeText(node.children || []) + (blockTags.has(node.tag) ? '\n' : '')).join('');
  }
  function renderTree(parent, tree) {
    for (const node of tree) {
      const child = document.createElement(node.text !== undefined ? 'span' : node.tag);
      if (node.text !== undefined) child.textContent = node.text;
      else renderTree(child, node.children);
      parent.appendChild(child);
    }
  }
  function nativeId(turn) {
    const id = turn.id;
    if (!id || id.length > 200) return null;
    const matches = [...document.querySelectorAll('ms-chat-turn[id]')].filter(node => node.id === id);
    const links = [...document.querySelectorAll('ms-items-scrollbar .items-scrollbar-item button[aria-controls]')]
      .filter(button => button.getAttribute('aria-controls') === id);
    return matches.length === 1 && matches[0] === turn && links.length === 1 ? id : null;
  }
  function nativeTurnIndex() {
    const turns = new Map(), links = new Map();
    for (const node of document.querySelectorAll('ms-chat-turn[id]')) {
      const matches = turns.get(node.id) || [];
      matches.push(node); turns.set(node.id, matches);
    }
    for (const button of document.querySelectorAll('ms-items-scrollbar .items-scrollbar-item button[aria-controls]')) {
      const id = button.getAttribute('aria-controls');
      links.set(id, (links.get(id) || 0) + 1);
    }
    return { turns, links };
  }
  function ensureOrphans() {
    if (orphanRoot?.isConnected) return orphanRoot;
    orphanRoot = document.createElement('section');
    orphanRoot.className = 'sl-history-orphans';
    orphanRoot.setAttribute('aria-label', 'Saved responses from earlier views');
    const title = document.createElement('h3'); title.textContent = 'Saved responses from earlier views';
    orphanRoot.appendChild(title);
    (document.querySelector('ms-chat-session') || document.body).appendChild(orphanRoot);
    return orphanRoot;
  }
  function disposeView(item) {
    item.viewScope?.dispose(); item.viewScope = null; item.container = null;
  }
  function disposeViews() {
    for (const list of chats.values()) for (const item of list) disposeView(item);
    orphanRoot?.remove(); orphanRoot = null;
  }

  function render(item) {
    if (!item.viewScope || item.viewScope.disposed) return;
    const live = item.turn?.isConnected;
    const host = live ? item.turn.parentNode : ensureOrphans();
    if (!host) return;
    if (live) {
      if (item.container.parentNode !== host || item.container.previousElementSibling !== item.turn) host.insertBefore(item.container, item.turn.nextSibling);
    } else if (item.container.parentNode !== host) host.appendChild(item.container);
    item.label.textContent = `Saved response ${item.index + 1} of ${item.versions.length}`;
    item.notice.textContent = live ? 'The current native response remains unchanged.' : 'The original turn is unavailable. This saved response is read-only.';
    item.previous.disabled = item.index === 0;
    item.next.disabled = item.index >= item.versions.length - 1;
    item.panel.hidden = !item.open;
    item.toggle.textContent = item.open ? 'Hide saved responses' : `View saved responses (${item.versions.length})`;
    item.toggle.setAttribute('aria-expanded', String(item.open));
    const edits = live ? [...item.turn.querySelectorAll('button.toggle-edit-button')].filter(button => !button.disabled && button.getAttribute('aria-disabled') !== 'true') : [];
    item.edit.hidden = edits.length !== 1;
    const version = item.versions[item.index];
    if (item.renderedVersion !== version) {
      item.body.replaceChildren();
      renderTree(item.body, version?.tree || []);
      if (version?.truncated) {
        const notice = document.createElement('p'); notice.textContent = 'This saved preview was shortened.'; item.body.appendChild(notice);
      }
      item.renderedVersion = version;
    }
  }
  function createView(item) {
    if (item.viewScope) return;
    const view = item.viewScope = scope();
    item.container = document.createElement('div'); item.container.className = 'sl-response-history';
    item.toggle = document.createElement('button'); item.toggle.type = 'button'; item.toggle.className = 'sl-response-history-toggle';
    item.panel = document.createElement('div'); item.panel.className = 'sl-response-history-panel';
    item.controls = document.createElement('div'); item.controls.className = 'sl-response-history-controls';
    item.previous = document.createElement('button'); item.previous.type = 'button'; item.previous.textContent = 'Previous';
    item.label = document.createElement('span'); item.label.setAttribute('aria-live', 'polite');
    item.next = document.createElement('button'); item.next.type = 'button'; item.next.textContent = 'Next';
    item.edit = document.createElement('button'); item.edit.type = 'button'; item.edit.textContent = 'Edit current response';
    item.notice = document.createElement('p'); item.notice.className = 'sl-history-notice';
    item.body = document.createElement('div'); item.body.className = 'sl-response-history-text';
    item.renderedVersion = null;
    item.controls.append(item.previous, item.label, item.next, item.edit);
    item.panel.append(item.controls, item.notice, item.body); item.container.append(item.toggle, item.panel);
    view.on(item.toggle, 'click', () => { item.open = !item.open; render(item); });
    view.on(item.previous, 'click', () => { if (item.index > 0) item.index--; render(item); });
    view.on(item.next, 'click', () => { if (item.index < item.versions.length - 1) item.index++; render(item); });
    view.on(item.edit, 'click', () => {
      if (!item.turn?.isConnected || route() !== activeRoute || !enabled()) return;
      const buttons = [...item.turn.querySelectorAll('button.toggle-edit-button')].filter(button => !button.disabled && button.getAttribute('aria-disabled') !== 'true');
      if (buttons.length === 1) buttons[0].click();
    });
    view.add(() => item.container?.remove());
  }
  function refresh() {
    pendingRefresh = null;
    if (!owner || owner.disposed || route() !== activeRoute) return;
    const items = chats.get(activeRoute) || [];
    const index = items.some(item => !item.turn?.isConnected && item.id) ? nativeTurnIndex() : null;
    for (const item of items) {
      if (!item.turn?.isConnected) {
        const matches = index?.turns.get(item.id) || [];
        item.turn = matches.length === 1 && index.links.get(item.id) === 1 ? matches[0] : null;
      }
      createView(item); render(item);
    }
    if (orphanRoot && !orphanRoot.querySelector('.sl-response-history')) { orphanRoot.remove(); orphanRoot = null; }
  }
  function rememberBeforeRerun(event) {
    if (!enabled() || event.defaultPrevented || route() !== activeRoute) return;
    const button = event.target?.closest?.(rerunSelector);
    if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return;
    const turn = button.closest('ms-chat-turn') || button.closest('.chat-turn-container');
    if (!turn?.isConnected) return;
    const version = snapshot(turn);
    if (!version.text.trim()) return;
    const list = chatFor(activeRoute);
    let item = list.find(record => record.turn === turn);
    if (!item) {
      const id = nativeId(turn);
      if (id) item = list.find(record => record.id === id);
      if (!item) {
        if (list.length >= MAX_TURNS) { showLimit('This chat has reached the saved-turn limit. Existing previews are still available.'); return; }
        item = { id, turn, versions: [], index: 0, open: false, serial: ++sequence };
        list.push(item);
      }
      item.turn = turn;
    }
    const last = item.versions[item.versions.length - 1];
    if (!last || JSON.stringify(last.tree) !== JSON.stringify(version.tree)) {
      const total = list.reduce((sum, record) => sum + record.versions.reduce((n, saved) => n + saved.text.length, 0), 0);
      if (item.versions.length >= MAX_VERSIONS || total + version.text.length > MAX_CHAT_CHARS) {
        if (!item.versions.length) list.splice(list.indexOf(item), 1);
        showLimit('The saved-response limit is full. Existing previews are still available.');
        return;
      }
      item.versions.push(version);
    }
    item.index = item.versions.length - 1;
    createView(item); render(item);
  }
  function start() {
    if (!enabled() || owner) return;
    const session = owner = scope(); activeRoute = route();
    session.on(document, 'click', rememberBeforeRerun, true);
    function observeBody(body) {
      if (session.disposed || owner !== session || !body) return;
      const observer = new MutationObserver(records => {
        const relevant = records.filter(record => !record.target.closest?.('.sl-response-history, .sl-history-orphans'));
        if (!relevant.length) return;
        if (pendingRefresh || !chats.get(activeRoute)?.length) return;
        pendingRefresh = session.frame(refresh);
      });
      session.observe(observer, body, { childList: true, subtree: true });
    }
    if (document.body) observeBody(document.body);
    else {
      const controller = new AbortController();
      session.add(() => controller.abort());
      waitFor(() => document.body, { timeout: 12000, interval: 100, signal: controller.signal }).then(observeBody);
    }
    refresh();
  }
  function stop() {
    owner?.dispose(); owner = null; pendingRefresh = null; disposeViews();
  }
  window.StudioLab.registerModule({
    id: 'response-history', group: 'modules', order: 4,
    title: 'Saved response previews', subtitle: 'Review previous responses without changing the current answer.',
    stateKey: 'multipleResponseEnabled', defaults: { multipleResponseEnabled: true },
    init(context) { ctx = context; start(); },
    onStateChange(context) { if (context) ctx = context; if (enabled()) start(); else stop(); },
    onRouteChange(context, current, previous) {
      if (context) ctx = context;
      if (current?.key === previous?.key) return;
      stop();
      for (const list of chats.values()) for (const item of list) item.turn = null;
      start();
    },
    dispose() { stop(); chats.clear(); ctx = null; }
  });
})();
