(function () {
  'use strict';

  const studio = window.StudioLab;
  const core = window.StudioLabCore;
  const answers = window.StudioLabAnswers;
  if (!studio?.registerModule || !core?.scope || !answers?.renderDocument || !answers?.validateDocument) return;

  const MARKED = 'ms-code-block[data-test-language="studiolab-ui"]';
  const EXCLUDED = 'ms-thought-chunk, ms-thought-activity-chunk, ms-tool-activity-chunk, ms-code-execution-chunk, ms-code-search-chunk, .thought-activity-host, .tool-activity-host, .edit, [contenteditable]:not([contenteditable="false"]), textarea';
  const SOURCE_HIDDEN = 'sl-answers-source-hidden';
  const records = new Map();
  const saved = new Map();
  const nodeIds = new WeakMap();
  const pendingSources = new WeakMap();
  const watchedTurns = new Set();
  const turnVisibility = new WeakMap();
  let sequence = 0;
  let ctxRef = null;
  let lifetime = null;
  let cancelScan = null;
  let activeRoot = null;
  let intersectionObserver = null;
  let scannedTurns = null;
  let disposed = false;
  let savedSize = 0;

  function active() {
    return !disposed && ctxRef?.state?.modernWebChatEnabled === true && ctxRef.state.interactiveAnswersEnabled !== false;
  }

  function syncGeneration() {
    window.dispatchEvent(new CustomEvent('__sl_interactiveAnswersToggle', { detail: active() }));
  }

  function node(tag, className, text) {
    const value = document.createElement(tag);
    if (className) value.className = className;
    if (text !== undefined) value.textContent = text;
    return value;
  }

  function turnKey(turn) {
    const stable = turn.id || turn.getAttribute('data-turn-id') || turn.getAttribute('data-chunk-id');
    if (stable) return stable;
    if (!nodeIds.has(turn)) nodeIds.set(turn, 'local-turn-' + ++sequence);
    return nodeIds.get(turn);
  }

  function remember(entry) {
    if (!entry.renderer) return;
    const previous = saved.get(entry.key);
    if (previous) savedSize -= previous.source.length * 2;
    saved.delete(entry.key);
    saved.set(entry.key, { source: entry.source, state: entry.renderer.getState(), sourceMode: entry.sourceMode });
    savedSize += entry.source.length * 2;
    while (saved.size > 50 || savedSize > 2 * 1024 * 1024) {
      const oldest = saved.keys().next().value;
      savedSize -= saved.get(oldest).source.length * 2;
      saved.delete(oldest);
    }
  }

  function release(block, preserve = true) {
    const entry = records.get(block);
    if (!entry) return;
    if (preserve) remember(entry);
    entry.scope?.dispose();
    entry.renderer?.dispose();
    entry.host.remove();
    block.classList.remove(SOURCE_HIDDEN);
    records.delete(block);
  }

  function park(entry, turn) {
    if (!entry.renderer) return;
    const measured = entry.host.getBoundingClientRect().height || entry.host.offsetHeight || 1;
    const height = Number.isFinite(measured) ? Math.min(100000, Math.max(1, measured)) : 1;
    remember(entry);
    entry.scope?.dispose();
    entry.renderer.dispose();
    entry.host.replaceChildren();
    entry.host.style.minHeight = height + 'px';
    entry.host.setAttribute('role', 'group');
    entry.host.setAttribute('aria-label', 'Interactive answer');
    entry.host.classList.add('sl-answers-parked');
    const local = core.scope();
    const resume = node('button', 'sl-answers-button sl-answers-resume', 'Show interactive answer');
    resume.type = 'button';
    const wake = () => {
      if (!active() || !entry.host.isConnected) return;
      turnVisibility.set(turn, true);
      scheduleScan(0);
    };
    local.on(resume, 'focus', wake);
    local.on(resume, 'click', event => { event.preventDefault(); event.stopPropagation(); wake(); });
    entry.host.append(resume);
    entry.scope = local;
    entry.renderer = null;
    entry.source = null;
    entry.parked = true;
  }

  function visible(block) {
    if (!block.isConnected || block.hidden || block.closest('[data-sl-buffered-turn], [hidden], [inert], [aria-hidden="true"]')) return false;
    for (let parent = block.parentElement; parent && parent !== activeRoot?.parentElement; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden' || style.contentVisibility === 'hidden') return false;
    }
    return true;
  }

  function candidate(block) {
    const turn = block.closest('ms-chat-turn');
    const container = block.closest('.chat-turn-container');
    const chunk = block.closest('ms-text-chunk');
    if (!turn || !container?.classList.contains('model') || container.classList.contains('user') || !chunk ||
        block.closest(EXCLUDED) || block.closest('.sl-answers-host') || !visible(block)) return null;
    const code = block.querySelector('pre > code') || block.querySelector('pre code');
    if (!code) return null;
    scannedTurns?.add(turn);
    if (intersectionObserver) {
      if (!watchedTurns.has(turn)) {
        watchedTurns.add(turn);
        turnVisibility.set(turn, false);
        intersectionObserver.observe(turn);
      }
    }
    return { turn, chunk, code, inView: !intersectionObserver || turnVisibility.get(turn) === true };
  }

  function fallback(block, details, source, text, count = 1) {
    release(block);
    const host = node('p', 'sl-answers-status', text);
    host.setAttribute('role', 'status');
    details.chunk.parentNode.insertBefore(host, details.chunk.nextSibling);
    records.set(block, { source, host, count, key: turnKey(details.turn), scope: null, renderer: null });
  }

  function mount(block, details, source, answer, sourceMode = false, restoreFocus = false) {
    const key = turnKey(details.turn);
    const old = saved.get(key);
    const host = node('div', 'sl-answers-host');
    const toolbar = node('div', 'sl-answers-toolbar');
    const toggle = node('button', 'sl-answers-button', 'Show source');
    toggle.type = 'button';
    toggle.setAttribute('aria-pressed', 'false');
    const local = core.scope();
    let renderer;
    try {
      renderer = answers.renderDocument(answer, {
        state: old?.source === source ? old.state : undefined,
        onChange() { const current = records.get(block); if (current) remember(current); }
      });
      toolbar.append(toggle);
      host.append(toolbar, renderer.element);
      details.chunk.parentNode.insertBefore(host, details.chunk.nextSibling);
      const restoredSourceMode = old?.source === source ? old.sourceMode === true : sourceMode;
      const entry = { source, host, key, count: 1, renderer, scope: local, sourceMode: restoredSourceMode };
      records.set(block, entry);
      block.classList.toggle(SOURCE_HIDDEN, !restoredSourceMode);
      renderer.element.hidden = restoredSourceMode;
      toggle.setAttribute('aria-pressed', String(restoredSourceMode));
      toggle.textContent = restoredSourceMode ? 'Show interactive answer' : 'Show source';
      local.on(toggle, 'click', () => {
        const showSource = toggle.getAttribute('aria-pressed') !== 'true';
        entry.sourceMode = showSource;
        toggle.setAttribute('aria-pressed', String(showSource));
        toggle.textContent = showSource ? 'Show interactive answer' : 'Show source';
        block.classList.toggle(SOURCE_HIDDEN, !showSource);
        renderer.element.hidden = showSource;
      });
      local.on(host, 'keydown', event => event.stopPropagation());
      remember(entry);
      if (restoreFocus) toggle.focus();
    } catch (_) {
      local.dispose();
      renderer?.dispose();
      host.remove();
      block.classList.remove(SOURCE_HIDDEN);
      fallback(block, details, source, 'The interactive answer could not be displayed. The original response is shown.');
    }
  }

  function scan() {
    cancelScan = null;
    if (!active() || !activeRoot?.isConnected) return;
    const found = new Map();
    const byTurn = new Map();
    scannedTurns = new Set();
    for (const block of activeRoot.querySelectorAll(MARKED)) {
      const details = candidate(block);
      if (!details) continue;
      found.set(block, details);
      byTurn.set(details.turn, (byTurn.get(details.turn) || 0) + 1);
    }
    for (const turn of watchedTurns) {
      if (scannedTurns.has(turn) && turn.isConnected && activeRoot.contains(turn)) continue;
      intersectionObserver?.unobserve(turn);
      watchedTurns.delete(turn);
      turnVisibility.delete(turn);
    }
    scannedTurns = null;
    for (const [block] of records) if (!found.has(block)) release(block);
    for (const [block, details] of found) {
      const previous = records.get(block);
      if (!details.inView) {
        if (previous?.renderer) {
          if (!previous.sourceMode) park(previous, details.turn);
        } else if (previous && !previous.parked) release(block);
        continue;
      }
      const source = details.code.textContent || '';
      const identity = source.length > answers.LIMITS.source ? 'oversize:' + source.length : source;
      const count = byTurn.get(details.turn);
      if (!previous?.parked && previous?.source === identity && previous.count === count && previous.host.isConnected) continue;
      const restoreFocus = previous?.parked && previous.host.contains(document.activeElement);
      if (previous) release(block);
      if (count !== 1) {
        fallback(block, details, identity, 'Use one interactive document per answer. The original response is shown.', count);
        continue;
      }
      if (source.length > answers.LIMITS.source) {
        fallback(block, details, identity, 'This interactive answer is too large. The original response is shown.');
        continue;
      }
      if (pendingSources.get(block) === source) continue;
      // Native code nodes omit Markdown fences; the language marker opts in to whole-JSON validation.
      let value;
      try { value = JSON.parse(source); }
      catch (_) { pendingSources.set(block, source); continue; }
      pendingSources.delete(block);
      const result = answers.validateDocument(value);
      if (!result.ok) {
        fallback(block, details, source, 'This interactive format is not supported. The original response is shown.');
        continue;
      }
      mount(block, details, source, result.document, previous?.sourceMode === true, restoreFocus);
    }
  }

  function scheduleScan(delay = 150) {
    if (!lifetime || !active()) return;
    cancelScan?.();
    cancelScan = lifetime.timeout(scan, delay);
  }

  function ownedMutation(record) {
    const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
    if (target?.closest('.sl-answers-host, .sl-answers-status')) return true;
    if (record.type !== 'childList') return false;
    const changed = [...record.addedNodes, ...record.removedNodes];
    return changed.length > 0 && changed.every(value => value.nodeType === 1 &&
      value.matches('.sl-answers-host, .sl-answers-status'));
  }

  function stop() {
    lifetime?.dispose(); lifetime = null;
    cancelScan = null;
    activeRoot = null;
    intersectionObserver = null;
    watchedTurns.clear();
    for (const [block] of records) release(block);
  }

  function start() {
    stop();
    if (!active()) return;
    lifetime = core.scope();
    const owned = lifetime;
    const abort = new AbortController();
    owned.add(() => abort.abort());
    core.waitFor(() => document.querySelector('ms-chunk-editor') || document.querySelector('ms-chat-session') ||
      document.querySelector('ms-prompt-box'), { timeout: 10000, interval: 200, signal: abort.signal }).then(root => {
      if (!root || owned.disposed || !active()) return;
      activeRoot = root;
      if (typeof IntersectionObserver === 'function') {
        const intersection = new IntersectionObserver(changes => {
          if (owned.disposed) return;
          let changed = false;
          for (const entry of changes) {
            if (!watchedTurns.has(entry.target)) continue;
            const visible = entry.isIntersecting && entry.target.isConnected;
            if (turnVisibility.get(entry.target) === visible) continue;
            turnVisibility.set(entry.target, visible);
            changed = true;
          }
          if (changed) scheduleScan();
        }, { root: null, rootMargin: '600px 0px', threshold: 0 });
        intersectionObserver = intersection;
        owned.add(() => intersection.disconnect());
      }
      const observer = new MutationObserver(changes => {
        if (changes.some(change => !ownedMutation(change))) scheduleScan();
      });
      owned.observe(observer, root, { childList: true, subtree: true, characterData: true, attributes: true,
        attributeFilter: ['class', 'hidden', 'inert', 'aria-hidden', 'contenteditable', 'disabled', 'readonly', 'data-sl-buffered-turn', 'data-test-language'] });
      scan();
    });
  }

  const feature = {
    id: 'interactive-answers', group: 'modules', order: 35,
    title: 'Interactive answers', subtitle: 'Tables, charts and local calculators', icon: 'table_chart',
    stateKey: 'interactiveAnswersEnabled', defaults: { interactiveAnswersEnabled: true },
    details: [{ icon: 'table_chart', text: 'Show interactive tables, charts and calculators in New layout.' }],
    init(ctx) { ctxRef = ctx; disposed = false; syncGeneration(); start(); },
    onStateChange(ctx) {
      if (ctx?.state) ctxRef = ctx;
      syncGeneration();
      if (!active()) stop(); else if (!lifetime) start();
    },
    onRouteChange(ctx) { if (ctx?.state) ctxRef = ctx; syncGeneration(); stop(); saved.clear(); savedSize = 0; if (active()) start(); },
    dispose() {
      disposed = true; syncGeneration(); stop(); saved.clear(); savedSize = 0;
      ctxRef = null;
    }
  };
  studio.registerModule(feature);
})();
