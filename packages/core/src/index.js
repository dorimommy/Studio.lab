/**
 * @studiolab/core v0.1.0
 * Internal SDK for Studio.lab modules: removes the content-script boilerplate
 * (observers + polling + storage + listener cleanup) that every module used to
 * hand-roll. Zero dependencies, works in both MAIN and ISOLATED worlds.
 */

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Створити елемент з HTML-рядка */
export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/**
 * Дочекатися, поки read() поверне truthy. Резолвиться значенням або null по таймауту.
 * Замінює ручні poll-цикли (draft-saver) і waitForModelValue (modern-web-chat).
 */
export function waitFor(read, { timeout = 2500, interval = 50 } = {}) {
  return new Promise(resolve => {
    const t0 = performance.now();
    (function tick() {
      let v = null;
      try { v = read(); } catch { /* ignore */ }
      if (v) return resolve(v);
      if (performance.now() - t0 >= timeout) return resolve(null);
      setTimeout(tick, interval);
    })();
  });
}

/** debounce для частих колбеків (input, resize, мутації) */
export function debounce(fn, ms = 200) {
  let t = null;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/**
 * MutationObserver з автодисконектом.
 * Повертає dispose() — не треба пам'ятати observer.disconnect() вручну.
 */
export function observe(root, opts, cb) {
  const o = new MutationObserver(cb);
  if (root) o.observe(root, opts);
  return () => o.disconnect();
}

/**
 * Викликати cb(el) для кожного поточного і майбутнього збігу селектора.
 * Замінює ~15 рядків ручного observer-коду в кожному модулі.
 */
export function onAdded(root, selector, cb) {
  $$(selector, root).forEach(cb);
  return observe(root, { childList: true, subtree: true }, records => {
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.matches?.(selector)) cb(n);
        n.querySelectorAll?.(selector).forEach(cb);
      }
    }
  });
}

/**
 * Lifecycle scope — the single source of truth for resource cleanup.
 * (Unifies the former StudioLab.createScope from registry.js: same rich
 * semantics — disposed flag, idempotent cancels, reverse-order disposal —
 * plus the short SDK aliases `on` (= listen) and `every` (= interval).)
 *
 * Collects event listeners, observers, timers and custom cleanups;
 * dispose() releases everything exactly once. All methods are safe to call
 * after dispose (they become no-ops).
 */
export function scope() {
  const cleanups = new Set();
  let disposed = false;
  function add(cleanup) {
    let active = true;
    const cancel = () => {
      if (!active) return;
      active = false;
      cleanups.delete(cancel);
      try { cleanup(); } catch (_) {}
    };
    if (disposed) cancel();
    else cleanups.add(cancel);
    return cancel;
  }
  function listen(target, type, handler, options) {
    if (disposed) return () => {};
    target.addEventListener(type, handler, options);
    return add(() => target.removeEventListener(type, handler, options));
  }
  // Attach an already-constructed observer (registry-style API).
  // NOTE: different signature from the standalone observe(root, opts, cb).
  function observeInstance(observer, target, options) {
    if (disposed) { observer.disconnect(); return observer; }
    observer.observe(target, options);
    add(() => observer.disconnect());
    return observer;
  }
  function timeout(fn, delay) {
    if (disposed) return () => {};
    const id = setTimeout(() => { cancel(); if (!disposed) fn(); }, delay);
    const cancel = add(() => clearTimeout(id));
    return cancel;
  }
  function interval(fn, delay) {
    if (disposed) return () => {};
    const id = setInterval(() => { if (!disposed) fn(); }, delay);
    return add(() => clearInterval(id));
  }
  function frame(fn) {
    if (disposed) return () => {};
    const id = requestAnimationFrame(time => { cancel(); if (!disposed) fn(time); });
    const cancel = add(() => cancelAnimationFrame(id));
    return cancel;
  }
  return {
    get disposed() { return disposed; },
    add,
    listen,
    on: listen,
    observe: observeInstance,
    timeout,
    interval,
    every: (ms, fn) => interval(fn, ms),
    frame,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const cleanup of [...cleanups].reverse()) {
        try { cleanup(); } catch (_) {}
      }
    },
  };
}

/** Промісний врапер над chrome.storage.local — один замість копіпасти в модулях */
export const store = {
  get: (keys, fallback) =>
    chrome.storage.local.get(keys ?? null).then(data => {
      if (keys == null) return { ...fallback, ...data };
      if (typeof keys === 'string') return data[keys] ?? fallback;
      const out = {};
      for (const k of keys) out[k] = data[k] ?? fallback?.[k];
      return out;
    }),
  set: obj => chrome.storage.local.set(obj),
  remove: keys => chrome.storage.local.remove(keys),
  onChange(cb) {
    const h = (changes, area) => cb(changes, area);
    chrome.storage.onChanged.addListener(h);
    return () => chrome.storage.onChanged.removeListener(h);
  },
};
