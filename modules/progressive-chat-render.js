(function () {
  'use strict';

  if (window.__slProgressiveChatRender) return;

  const PREFERENCE_KEY = 'sl_initialChatRenderEnabled';
  const JUMP_SELECTOR = 'ms-items-scrollbar [data-test-item-id], .sl-toc-dash, .sl-toc-item';
  const SEARCH_SELECTOR = 'button[aria-label="Search (Ctrl /)"]';
  const REMAINING_ATTRIBUTE = 'data-sl-older-turns';
  const BATCH_SIZE = 20;
  const states = new Set();
  const renderIndexes = new WeakMap();
  const scrollChecks = new WeakMap();
  const pendingScrollChecks = new Set();
  let byContext = new WeakMap();
  let stateByContext = new WeakMap();
  let enabled = true;
  let status = 'waiting';
  let bootstrapTimer = null;
  let retainExport = null;
  let total = 0;
  let rendered = 0;
  let batches = 0;
  let batchSize = 0;
  let frameCost = 0;
  let scrollHookActive = false;
  let scrollChecksDeferred = 0;
  let scrollChecksRun = 0;
  let materializing = false;
  let materializedRoute = null;
  let removalObserver = null;
  const bootstrapCleanups = [];
  try { enabled = window.localStorage.getItem(PREFERENCE_KEY) !== 'false'; } catch (_) {}

  Object.defineProperty(window, '__slProgressiveChatRender', { configurable: true, value: Object.freeze({
    version: 1,
    get enabled() { return enabled; },
    get status() { return status; },
    get total() { return total; },
    get rendered() { return rendered; },
    get batches() { return batches; },
    get batchSize() { return batchSize; },
    get frameCost() { return frameCost; },
    get scrollHookActive() { return scrollHookActive; },
    get scrollChecksDeferred() { return scrollChecksDeferred; },
    get scrollChecksRun() { return scrollChecksRun; }
  }) });

  function savedChat() {
    const location = window.location;
    const match = location?.origin === 'https://aistudio.google.com' &&
      location.pathname.match(/^\/prompts\/([A-Za-z0-9_-]+)\/?$/);
    return !!match && !/^new_(?:chat|image|video|comparison)$/.test(match[1]);
  }

  function cancelPending(state) {
    if (state.timer !== null) clearTimeout(state.timer);
    if (state.idle !== null) window.cancelIdleCallback?.(state.idle);
    if (state.frame !== null) cancelAnimationFrame(state.frame);
    state.timer = state.idle = state.frame = null;
  }

  function* activeStates() {
    for (const reference of states) {
      const state = reference.deref();
      if (state) yield state;
      else states.delete(reference);
    }
  }

  function release(state) {
    cancelPending(state);
    state.observer?.disconnect();
    state.observer = null;
    state.context.Ma?.nativeElement?.removeAttribute(REMAINING_ATTRIBUTE);
    state.requested = 0;
    state.olderIntent = false;
    states.delete(state.reference);
    if (!states.size) { removalObserver?.disconnect(); removalObserver = null; }
  }

  function current(state) {
    const connected = state.context.Ma?.nativeElement?.isConnected;
    if (state.cancelled || connected === false || state.route !== window.location.href) {
      release(state);
      state.cancelled = true;
      return false;
    }
    return enabled && savedChat() && !state.full && state.start > 0;
  }

  function now() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
  }

  function inputPending() {
    try { return window.navigator?.scheduling?.isInputPending?.({ includeContinuous: true }) === true; }
    catch (_) { return false; }
  }

  function watchRemoval() {
    if (removalObserver) return;
    removalObserver = new MutationObserver(records => {
      if (!records.some(record => record.removedNodes?.length)) return;
      for (const state of activeStates()) if (!state.context.Ma?.nativeElement?.isConnected) {
        release(state);
        state.cancelled = true;
      }
    });
    removalObserver.observe(document.documentElement || document, { childList: true, subtree: true });
  }

  function requestOlder(state, count) {
    if (!current(state)) return;
    state.olderIntent = false;
    if (state.requested > 0) return;
    state.requested = Math.min(BATCH_SIZE, Math.max(1, Math.floor(count)));
    schedule(state);
  }

  function maybeRequestOlder(state) {
    if (state.olderIntent && state.nearTop) requestOlder(state, BATCH_SIZE);
  }

  function observeBoundary(state) {
    if (!state.needsObserver) return;
    state.needsObserver = false;
    state.observer?.disconnect();
    state.observer = null;
    state.nearTop = false;
    const session = state.context.Ma?.nativeElement;
    state.scroller = session?.querySelector('ms-autoscroll-container');
    const oldest = session?.querySelector('ms-chat-turn');
    if (!state.scroller || !oldest || typeof IntersectionObserver !== 'function') return;
    const reference = state.reference;
    const observer = new IntersectionObserver(entries => {
      const active = reference.deref();
      if (!active || !current(active)) { observer.disconnect(); return; }
      active.nearTop = entries.some(entry => entry.target === oldest && entry.isIntersecting);
      maybeRequestOlder(active);
    }, { root: state.scroller, rootMargin: '100% 0px 0px', threshold: 0 });
    state.observer = observer;
    observer.observe(oldest);
  }

  function cancelScrollCheck(check) {
    if (!check) return;
    if (check.frame !== null) cancelAnimationFrame(check.frame);
    if (check.timer !== null) clearTimeout(check.timer);
    check.frame = check.timer = null;
    pendingScrollChecks.delete(check.reference);
  }

  function cancelScrollChecks() {
    for (const reference of pendingScrollChecks) cancelScrollCheck(reference.deref());
    pendingScrollChecks.clear();
  }

  function partialWindow(element) {
    const session = element?.closest?.('ms-chat-session');
    if (!session) return null;
    for (const state of activeStates()) {
      if (state.context.Ma?.nativeElement === session && current(state)) return state;
    }
    return null;
  }

  function sampleWork(state, phase) {
    const work = state.work;
    if (!work) return;
    work.cost = Math.max(work.cost, now() - work.started - phase * state.frameInterval);
    if (phase !== 2) return;
    const cost = Math.max(0, work.cost);
    const perRow = Math.max(0.25, cost / work.added);
    state.costPerRow = state.costPerRow === null ? perRow : Math.max(perRow, state.costPerRow * 0.75 + perRow * 0.25);
    frameCost = cost;
    state.work = null;
  }

  function schedule(state) {
    if (state.timer !== null || state.idle !== null || state.frame !== null || !current(state) ||
        !state.requested && !state.work && !state.needsObserver) return;
    const advance = deadline => {
      state.idle = null;
      state.timer = null;
      if (!current(state) || !state.requested) return;
      const remaining = typeof deadline?.timeRemaining === 'function' ? deadline.timeRemaining() : state.frameInterval / 2;
      if (inputPending() || !(remaining > 0)) { schedule(state); return; }
      const budget = Math.min(remaining, state.frameInterval / 2);
      batchSize = Math.min(state.requested, BATCH_SIZE, Math.max(1, Math.floor(budget / (state.costPerRow ?? 0.25))));
      state.requested -= batchSize;
      batches++;
      state.count.update(value => value + batchSize);
    };
    state.frame = requestAnimationFrame(() => {
      state.frame = null;
      if (!current(state)) return;
      sampleWork(state, 1);
      const firstFrame = now();
      state.frame = requestAnimationFrame(() => {
        state.frame = null;
        if (!current(state)) return;
        const interval = now() - firstFrame;
        if (interval >= 4) state.frameInterval = Math.min(state.frameInterval, interval);
        sampleWork(state, 2);
        observeBoundary(state);
        if (!state.requested) return;
        if (inputPending()) { schedule(state); return; }
        if (typeof window.requestIdleCallback === 'function' && typeof window.cancelIdleCallback === 'function') {
          state.idle = window.requestIdleCallback(advance);
        } else state.timer = setTimeout(advance, 0);
      });
    });
  }

  function boundary(state, ids, start) {
    const entities = state.context.A?.F?.();
    if (!(entities instanceof Map)) return null;
    let result = start;
    while (result > 0 && entities.get(ids[result])?.thought && entities.get(ids[result - 1])?.thought) result--;
    if (state.context.x_?.()) {
      const groups = state.context.turns?.();
      if (!Array.isArray(groups)) return null;
      const group = groups.find(item => Array.isArray(item?.nE) && item.nE.includes(ids[result]));
      if (!group) return null;
      const first = ids.indexOf(group.nE[0]);
      if (first < 0 || first > result) return null;
      result = first;
    }
    // A partial native activity group can otherwise render no visible first row.
    return start - result <= 200 ? result : null;
  }

  function visibleIds(state) {
    state.epoch();
    const tick = state.count();
    const ids = state.context.d5();
    const owner = state.context.Ipa();
    if (!Array.isArray(ids)) return ids;
    if (state.owner !== owner) {
      cancelPending(state);
      state.observer?.disconnect();
      state.observer = null;
      state.owner = owner;
      state.base = tick;
      state.start = null;
      state.full = false;
      state.cancelled = false;
      state.route = window.location.href;
      state.slice = null;
      state.work = null;
      state.costPerRow = null;
      state.requested = 0;
      state.olderIntent = false;
    }
    total = ids.length;
    if (!enabled || !savedChat() || state.cancelled || state.full ||
        materializedRoute === window.location.href || state.context.zq?.()) {
      state.full = true;
      release(state);
      rendered = ids.length;
      return windowIds(state, ids, 0);
    }
    if (!ids.length) { release(state); rendered = 0; return windowIds(state, ids, 0); }
    const candidate = Math.max(0, ids.length - BATCH_SIZE - (tick - state.base));
    const start = boundary(state, ids, Math.min(state.start ?? candidate, candidate));
    if (start === null) {
      state.full = true;
      release(state);
      rendered = ids.length;
      return windowIds(state, ids, 0);
    }
    state.start = start;
    rendered = ids.length - start;
    if (start === 0) release(state);
    else { states.add(state.reference); watchRemoval(); }
    return windowIds(state, ids, start);
  }

  function windowIds(state, ids, start) {
    let selected = ids;
    if (start > 0) {
      selected = state.slice;
      if (!selected || selected.length !== ids.length - start || selected.some((id, index) => id !== ids[start + index])) {
        selected = ids.slice(start);
        state.slice = selected;
        if (selected.every(id => typeof id === 'string')) renderIndexes.set(selected, null);
      }
    }
    const next = { owner: state.owner, ids: selected, start, count: ids.length, first: ids[start], last: ids[ids.length - 1] };
    const previous = state.committed;
    state.pending = next;
    state.commitPending = !previous || Object.keys(next).some(key => next[key] !== previous[key]);
    return selected;
  }

  function cacheAuthorLookup(metadata) {
    const prototype = metadata.type?.prototype;
    if (!prototype) return;
    const candidates = Object.entries(Object.getOwnPropertyDescriptors(prototype)).filter(([name, descriptor]) => {
      if (name === 'constructor' || typeof descriptor.value !== 'function' || !descriptor.configurable || !descriptor.writable) return false;
      const source = Function.prototype.toString.call(descriptor.value).replace(/\s+/g, '');
      return /^[\w$]+\(([\w$]+),([\w$]+)\)\{var([\w$]+)=\2\.indexOf\(\1\);if\(\3===0\)return!0;var([\w$]+)=this\.[\w$]+\.[\w$]+\(\);\1=\4\.get\(\1\);\2=\4\.get\(\2\[\3-1\]\);return\1&&\2\?\1\.role!==\2\.role:!0;?\}$/.test(source);
    });
    if (candidates.length !== 1) return;
    const [name, descriptor] = candidates[0];
    const original = descriptor.value;
    Object.defineProperty(prototype, name, { ...descriptor, value: function (id, ids) {
      if (!enabled || !renderIndexes.has(ids)) return Reflect.apply(original, this, arguments);
      let proxy = renderIndexes.get(ids);
      if (!proxy) {
        const indexes = new Map();
        for (let index = 0; index < ids.length; index++) if (!indexes.has(ids[index])) indexes.set(ids[index], index);
        proxy = new Proxy(ids, { get(target, property, receiver) {
          if (property === 'indexOf') return value => indexes.get(value) ?? -1;
          return Reflect.get(target, property, receiver);
        } });
        renderIndexes.set(ids, proxy);
      }
      const args = Array.from(arguments);
      args[1] = proxy;
      return Reflect.apply(original, this, args);
    } });
  }

  function coalesceScrollChecks(metadata) {
    if (JSON.stringify(metadata.da) !== '[["ms-autoscroll-container"]]' ||
        typeof metadata.type !== 'function' || typeof WeakRef !== 'function') return;
    const prototype = metadata.type.prototype;
    const methods = Object.entries(Object.getOwnPropertyDescriptors(prototype));
    const candidates = [];
    const destroys = [];
    for (const [name, descriptor] of methods) {
      if (name === 'constructor' || typeof descriptor.value !== 'function' || !descriptor.configurable || !descriptor.writable) continue;
      const source = Function.prototype.toString.call(descriptor.value).replace(/\s+/g, '');
      const match = source.match(/^[\w$]+\(\)\{var([\w$]+)=this\.([\w$]+)\.nativeElement;this\.([\w$]+)\(\)&&Math\.max\(0,Math\.floor\(\1\.scrollTop\)\)===0&&this\.([\w$]+)!==0&&\(\1\.scrollTop=this\.([\w$]+)\);([\w$]+)\(this\);?\}$/);
      if (match && metadata.inputs?.[match[3]]?.[1] === 'smooth') candidates.push({ name, descriptor, match });
      const destroy = source.match(/^[\w$]+\(\)\{this\.([\w$]+)\.disconnect\(\);?\}$/);
      if (destroy) destroys.push({ name, descriptor, observer: destroy[1] });
    }
    if (candidates.length !== 1 || destroys.length !== 1) return;
    const { name, descriptor, match } = candidates[0];
    const destroy = destroys[0];
    const constructor = Function.prototype.toString.call(metadata.type).replace(/\s+/g, '');
    if (!constructor.includes('this.' + destroy.observer + '=newResizeObserver(') ||
        !['isScrollable', 'scrolledToTop', 'scrolledToBottom', 'isScrolledBottom'].every(output => Object.values(metadata.outputs || {}).includes(output))) return;
    const original = descriptor.value;
    const elementProperty = match[2], smoothProperty = match[3];
    const eligible = check => {
      const state = check.state.deref();
      return !!(enabled && savedChat() && check.route === window.location.href && check.element.isConnected &&
        !check.instance[smoothProperty]() && state && partialWindow(check.element) === state);
    };
    Object.defineProperty(prototype, name, { ...descriptor, value: function () {
      let check = scrollChecks.get(this), state = null, element;
      try {
        element = this[elementProperty]?.nativeElement;
        if (enabled && savedChat() && !this[smoothProperty]()) state = partialWindow(element);
      } catch (_) {}
      if (!state) {
        cancelScrollCheck(check);
        if (check) check.lastState = null;
        return Reflect.apply(original, this, arguments);
      }
      scrollChecksDeferred++;
      if (!check) {
        check = { instance: this, element, route: window.location.href, state: state.reference, version: state.revision,
          lastState: null, lastVersion: -1, frame: null, timer: null, args: [] };
        check.reference = new WeakRef(check);
        scrollChecks.set(this, check);
      }
      if (check.lastState === state.reference && check.lastVersion === state.revision) return;
      check.element = element;
      check.route = window.location.href;
      check.state = state.reference;
      check.version = state.revision;
      check.args = Array.from(arguments);
      if (check.frame !== null || check.timer !== null) return;
      pendingScrollChecks.add(check.reference);
      check.frame = requestAnimationFrame(() => {
        check.frame = null;
        if (!eligible(check)) { cancelScrollCheck(check); return; }
        // Run after the browser's rendering opportunity, rather than forcing layout inside Angular's write pass.
        check.timer = setTimeout(() => {
          check.timer = null;
          pendingScrollChecks.delete(check.reference);
          if (!eligible(check)) return;
          check.lastState = check.state;
          check.lastVersion = check.version;
          scrollChecksRun++;
          Reflect.apply(original, check.instance, check.args);
        }, 0);
      });
    } });
    Object.defineProperty(prototype, destroy.name, { ...destroy.descriptor, value: function () {
      cancelScrollCheck(scrollChecks.get(this));
      scrollChecks.delete(this);
      const state = partialWindow(this[elementProperty]?.nativeElement);
      if (state) { release(state); state.cancelled = true; }
      return Reflect.apply(destroy.descriptor.value, this, arguments);
    } });
    scrollHookActive = true;
  }

  function makeProxy(context, signal) {
    if (!context || typeof WeakRef !== 'function') return context;
    const descriptor = Object.getOwnPropertyDescriptor(context, 'd5');
    if (typeof context.d5 !== 'function' || typeof context.Ipa !== 'function' ||
        typeof context.A?.F !== 'function' || descriptor && descriptor.configurable === false && descriptor.writable === false) return context;
    const state = { context, owner: undefined, count: signal(0), epoch: signal(0), base: 0, start: null,
      full: false, cancelled: false, route: window.location.href, timer: null, idle: null, frame: null,
      slice: null, work: null, costPerRow: null, frameInterval: 16, revision: 0, requested: 0,
      needsObserver: false, observer: null, scroller: null, nearTop: false, olderIntent: false, touchY: null, pointerScroll: false };
    const methods = new Map();
    state.reference = new WeakRef(state);
    const read = () => {
      try { return visibleIds(state); }
      catch (_) {
        state.full = true;
        release(state);
        const ids = context.d5();
        if (Array.isArray(ids)) total = rendered = ids.length;
        return Array.isArray(ids) ? windowIds(state, ids, 0) : ids;
      }
    };
    const proxy = new Proxy(context, {
      get(target, property) {
        if (property === 'd5') return read;
        const value = Reflect.get(target, property, target);
        if (typeof value !== 'function' || Object.hasOwn(target, property)) return value;
        let prototype = Object.getPrototypeOf(target);
        while (prototype && prototype !== Object.prototype && !Object.hasOwn(prototype, property)) prototype = Object.getPrototypeOf(prototype);
        if (!prototype || prototype === Object.prototype) return value;
        if (methods.get(property)?.original !== value) methods.set(property, { original: value, bound: value.bind(target) });
        return methods.get(property).bound;
      }
    });
    stateByContext.set(context, state);
    return proxy;
  }

  function materializeAll(restore = true) {
    if (materializing) return;
    materializing = true;
    materializedRoute = window.location.href;
    cancelScrollChecks();
    try {
      if (restore) window.dispatchEvent(new CustomEvent('__sl_restoreAllTurns'));
      for (const state of activeStates()) {
        release(state);
        state.full = true;
        state.epoch.update(value => value + 1);
      }
    } finally { materializing = false; }
  }

  window.addEventListener('__sl_restoreAllTurns', () => materializeAll(false));
  window.addEventListener('__sl_requestOlderTurns', event => {
    const count = event.detail?.count;
    if (typeof count !== 'number' || !Number.isFinite(count)) return;
    for (const state of activeStates()) requestOlder(state, count);
  });

  window.addEventListener('__sl_initialChatRenderToggle', event => {
    if (typeof event.detail?.enabled !== 'boolean') return;
    const changed = enabled !== event.detail.enabled;
    enabled = event.detail.enabled;
    if (event.detail.persist === true) {
      try { window.localStorage.setItem(PREFERENCE_KEY, String(enabled)); } catch (_) {}
    }
    if (changed && !enabled) materializeAll();
  });
  window.addEventListener('__sl_routeChanged', () => {
    cancelScrollChecks();
    for (const state of activeStates()) if (state.route !== window.location.href) {
      release(state); state.cancelled = true;
      byContext.delete(state.context); stateByContext.delete(state.context);
    }
    if (materializedRoute !== window.location.href) materializedRoute = null;
  });
  window.addEventListener('pagehide', () => {
    cancelScrollChecks();
    for (const state of activeStates()) { release(state); state.cancelled = true; }
    states.clear();
    materializedRoute = null;
  });
  document.addEventListener('keydown', event => {
    const key = event.key?.toLowerCase();
    const activation = (key === 'enter' || key === ' ' || key === 'spacebar') &&
      event.target?.closest?.(JUMP_SELECTOR + ', ' + SEARCH_SELECTOR);
    if (activation || key === 'f3' || (event.ctrlKey || event.metaKey) &&
        (key === 'f' || key === 'p' || key === '/' || event.code === 'Slash')) materializeAll();
  }, true);
  window.addEventListener('beforeprint', materializeAll);
  document.addEventListener('pointerdown', event => {
    if (event.target?.closest?.(JUMP_SELECTOR + ', ' + SEARCH_SELECTOR)) materializeAll();
  }, true);
  function historyInput(event, apply) {
    if (event.isTrusted === false) return;
    for (const state of activeStates()) {
      const scroller = state.scroller;
      if (current(state) && scroller && (event.target === scroller || scroller.contains(event.target))) {
        if (state.requested > 0) state.olderIntent = false;
        else apply(state);
      }
    }
  }

  document.addEventListener('wheel', event => historyInput(event, state => {
    state.olderIntent = event.deltaY < 0;
    maybeRequestOlder(state);
  }), { capture: true, passive: true });
  document.addEventListener('touchstart', event => historyInput(event, state => {
    state.touchY = event.touches?.[0]?.clientY ?? null;
  }), { capture: true, passive: true });
  document.addEventListener('touchmove', event => historyInput(event, state => {
    const next = event.touches?.[0]?.clientY;
    if (typeof next === 'number' && state.touchY !== null) {
      state.olderIntent = next > state.touchY;
      maybeRequestOlder(state);
    }
    state.touchY = typeof next === 'number' ? next : null;
  }), { capture: true, passive: true });
  document.addEventListener('keydown', event => {
    if (event.target?.closest?.('input, textarea, [contenteditable="true"]')) return;
    if (['ArrowUp', 'PageUp', 'Home'].includes(event.key) || event.key === ' ' && event.shiftKey) historyInput(event, state => {
      state.olderIntent = true;
      maybeRequestOlder(state);
    });
  }, true);
  document.addEventListener('pointerdown', event => historyInput(event, state => {
    if (event.target !== state.scroller) return;
    state.pointerScroll = true;
    state.lastScrollTop = state.scroller.scrollTop;
  }), { capture: true, passive: true });
  document.addEventListener('pointerup', () => { for (const state of activeStates()) state.pointerScroll = false; }, { capture: true, passive: true });
  document.addEventListener('scroll', event => historyInput(event, state => {
    if (event.target !== state.scroller) return;
    if (state.pointerScroll) {
      const top = state.scroller.scrollTop;
      state.olderIntent = top < state.lastScrollTop;
      state.lastScrollTop = top;
    }
    if (!state.observer && state.olderIntent) state.nearTop = state.scroller.scrollTop <= state.scroller.clientHeight;
    maybeRequestOlder(state);
  }), { capture: true, passive: true });

  function compatibleSignal(factory) {
    if (typeof factory !== 'function') return false;
    const source = Function.prototype.toString.call(factory);
    if (!source.includes('.asReadonly') || !source.includes('.set') || !source.includes('.update')) return false;
    const probe = factory(0);
    if (typeof probe !== 'function' || typeof probe.set !== 'function' || typeof probe.update !== 'function' ||
        typeof probe.asReadonly !== 'function' || probe() !== 0) return false;
    probe.set(1);
    return probe() === 1;
  }

  function compatibleTemplate(metadata) {
    if (!Array.isArray(metadata?.da) || metadata.da.length !== 1 ||
        JSON.stringify(metadata.da[0]) !== '["ms-chat-session"]' || typeof metadata.template !== 'function') return false;
    const source = Function.prototype.toString.call(metadata.template).replace(/\s+/g, '');
    return source.includes('"ms-autoscroll-container"') && /\b([\w$]+)=([\w$]+)\.Wg\(([\w$]+)\.d5\(\)\)/.test(source) &&
      /\.Fg\([\w$]+\)/.test(source) && source.includes('"scroll"') && source.includes('"keydown"');
  }

  function finish(nextStatus) {
    status = nextStatus;
    if (bootstrapTimer !== null) clearTimeout(bootstrapTimer);
    bootstrapTimer = null;
    for (const cleanup of bootstrapCleanups.splice(0).reverse()) {
      try { cleanup(); } catch (_) {}
    }
    retainExport = null;
  }

  function watchExport(namespace) {
    if (!namespace || typeof namespace !== 'object') { finish('unsupported'); return; }
    const descriptor = Object.getOwnPropertyDescriptor(namespace, 'x');
    if (descriptor && (!('value' in descriptor) || !descriptor.configurable || !descriptor.writable)) {
      finish('unsupported'); return;
    }
    let assigned = !!descriptor, original = descriptor?.value, wrapper = null;
    const wrap = native => {
      if (typeof native !== 'function') return native;
      wrapper = function (metadata) {
        if (Array.isArray(metadata?.da) && metadata.da.some(selector => selector?.[0] === 'ms-autoscroll-container')) {
          try { coalesceScrollChecks(metadata); } catch (_) {}
        }
        if (Array.isArray(metadata?.da) && metadata.da.some(selector => Array.isArray(selector) && selector[0] === 'ms-chat-session')) {
          let supported = false;
          try { supported = compatibleTemplate(metadata) && compatibleSignal(namespace.N); } catch (_) {}
          if (!supported) {
            finish('unsupported');
            return Reflect.apply(native, this, arguments);
          }
          const template = metadata.template;
          const signal = namespace.N;
          try { cacheAuthorLookup(metadata); } catch (_) {}
          const patched = function (flags, context) {
            if (!context || typeof context !== 'object') return Reflect.apply(template, this, arguments);
            let proxy = byContext.get(context);
            if (!proxy) {
              try { proxy = makeProxy(context, signal); } catch (_) { proxy = context; }
              byContext.set(context, proxy);
            }
            const started = now();
            let complete = false;
            try {
              const result = Reflect.apply(template, this, [flags, proxy]);
              complete = true;
              return result;
            } finally {
              if (complete && (flags & 2)) {
                const state = stateByContext.get(context);
                if (state?.commitPending) {
                  const previous = state.committed;
                  const oldCount = previous?.owner === state.pending.owner ? previous.count - previous.start : 0;
                  const added = state.pending.count - state.pending.start - oldCount;
                  if (added > 0 && state.start > 0 && !state.full) {
                    const parentCost = now() - started;
                    state.work = state.work ? { started: state.work.started, added: state.work.added + added,
                      cost: state.work.cost + parentCost } : { started, added, cost: parentCost };
                  }
                  state.committed = state.pending;
                  state.commitPending = false;
                  state.revision++;
                  state.needsObserver = state.start > 0 && !state.full;
                  const session = state.context.Ma?.nativeElement;
                  if (state.start > 0 && !state.full && enabled && state.route === window.location.href) {
                    session?.setAttribute(REMAINING_ATTRIBUTE, String(state.start));
                  } else session?.removeAttribute(REMAINING_ATTRIBUTE);
                  window.dispatchEvent(new CustomEvent('__sl_chatRenderCommitted'));
                }
                if (state) schedule(state);
              }
            }
          };
          const args = Array.from(arguments);
          args[0] = { ...metadata, template: patched };
          const result = Reflect.apply(native, this, args);
          let installed = result?.template === patched;
          if (result?.template === template) {
            try { installed = Reflect.set(result, 'template', patched) && result.template === patched; } catch (_) {}
          }
          finish(installed ? 'active' : 'unsupported');
          return result;
        }
        return Reflect.apply(native, this, arguments);
      };
      return wrapper;
    };
    let value = wrap(original);
    const getter = () => value;
    const setter = next => { assigned = true; original = next; value = wrap(next); };
    Object.defineProperty(namespace, 'x', { configurable: true, enumerable: descriptor?.enumerable ?? true, get: getter, set: setter });
    bootstrapCleanups.push(() => {
      const current = Object.getOwnPropertyDescriptor(namespace, 'x');
      if (current?.get !== getter && current?.value !== wrapper) return;
      if (!assigned) delete namespace.x;
      else Object.defineProperty(namespace, 'x', { value: original, configurable: true, writable: true, enumerable: descriptor?.enumerable ?? true });
    });
    retainExport = () => {
      if (typeof original !== 'function' || typeof wrapper !== 'function') return false;
      const current = Object.getOwnPropertyDescriptor(namespace, 'x');
      if (current?.get !== getter) return current?.value === wrapper;
      Object.defineProperty(namespace, 'x', { value: wrapper, configurable: true, writable: true, enumerable: descriptor?.enumerable ?? true });
      return true;
    };
  }

  try {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'default_MakerSuite');
    const initial = descriptor?.get ? Reflect.apply(descriptor.get, window, []) : descriptor?.value;
    if (initial && typeof initial === 'object') watchExport(initial);
    else if (!descriptor || descriptor.configurable && (!('value' in descriptor) || descriptor.writable)) {
      let value = initial, assigned = !!descriptor && 'value' in descriptor;
      const getter = () => descriptor?.get ? Reflect.apply(descriptor.get, window, []) : value;
      const setter = next => {
        value = next;
        assigned = true;
        if (descriptor?.set) Reflect.apply(descriptor.set, window, [next]);
        else Object.defineProperty(window, 'default_MakerSuite', { value: next, configurable: true, writable: true, enumerable: descriptor?.enumerable ?? true });
        watchExport(next);
      };
      Object.defineProperty(window, 'default_MakerSuite', { configurable: true, enumerable: descriptor?.enumerable ?? true, get: getter, set: setter });
      bootstrapCleanups.push(() => {
        const current = Object.getOwnPropertyDescriptor(window, 'default_MakerSuite');
        if (current?.get !== getter || current.set !== setter) return;
        const expiredHeightWatch = descriptor?.get && window.__slInitialChatRender?.status === 'unsupported';
        if (descriptor && !expiredHeightWatch) Object.defineProperty(window, 'default_MakerSuite', descriptor);
        else if (assigned) Object.defineProperty(window, 'default_MakerSuite', { value, configurable: true, writable: true, enumerable: descriptor?.enumerable ?? true });
        else delete window.default_MakerSuite;
      });
    } else finish('unsupported');
    if (status === 'waiting') bootstrapTimer = setTimeout(() => {
      bootstrapTimer = null;
      try { if (retainExport?.()) return; } catch (_) {}
      finish('unsupported');
    }, 20000);
  } catch (_) { finish('unsupported'); }
})();
