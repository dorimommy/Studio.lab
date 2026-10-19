var StudioLabCore = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // packages/core/src/index.js
  var index_exports = {};
  __export(index_exports, {
    $: () => $,
    $$: () => $$,
    debounce: () => debounce,
    el: () => el,
    observe: () => observe,
    onAdded: () => onAdded,
    scope: () => scope,
    store: () => store,
    waitFor: () => waitFor
  });
  var $ = (sel, root = document) => root.querySelector(sel);
  var $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function waitFor(read, { timeout = 2500, interval = 50 } = {}) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      (function tick() {
        let v = null;
        try {
          v = read();
        } catch {
        }
        if (v) return resolve(v);
        if (performance.now() - t0 >= timeout) return resolve(null);
        setTimeout(tick, interval);
      })();
    });
  }
  function debounce(fn, ms = 200) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }
  function observe(root, opts, cb) {
    const o = new MutationObserver(cb);
    if (root) o.observe(root, opts);
    return () => o.disconnect();
  }
  function onAdded(root, selector, cb) {
    $$(selector, root).forEach(cb);
    return observe(root, { childList: true, subtree: true }, (records) => {
      for (const r of records) {
        for (const n of r.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.matches?.(selector)) cb(n);
          n.querySelectorAll?.(selector).forEach(cb);
        }
      }
    });
  }
  function scope() {
    const cleanups = /* @__PURE__ */ new Set();
    let disposed = false;
    function add(cleanup) {
      let active = true;
      const cancel = () => {
        if (!active) return;
        active = false;
        cleanups.delete(cancel);
        try {
          cleanup();
        } catch (_) {
        }
      };
      if (disposed) cancel();
      else cleanups.add(cancel);
      return cancel;
    }
    function listen(target, type, handler, options) {
      if (disposed) return () => {
      };
      target.addEventListener(type, handler, options);
      return add(() => target.removeEventListener(type, handler, options));
    }
    function observeInstance(observer, target, options) {
      if (disposed) {
        observer.disconnect();
        return observer;
      }
      observer.observe(target, options);
      add(() => observer.disconnect());
      return observer;
    }
    function timeout(fn, delay) {
      if (disposed) return () => {
      };
      const id = setTimeout(() => {
        cancel();
        if (!disposed) fn();
      }, delay);
      const cancel = add(() => clearTimeout(id));
      return cancel;
    }
    function interval(fn, delay) {
      if (disposed) return () => {
      };
      const id = setInterval(() => {
        if (!disposed) fn();
      }, delay);
      return add(() => clearInterval(id));
    }
    function frame(fn) {
      if (disposed) return () => {
      };
      const id = requestAnimationFrame((time) => {
        cancel();
        if (!disposed) fn(time);
      });
      const cancel = add(() => cancelAnimationFrame(id));
      return cancel;
    }
    return {
      get disposed() {
        return disposed;
      },
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
          try {
            cleanup();
          } catch (_) {
          }
        }
      }
    };
  }
  var store = {
    get: (keys, fallback) => chrome.storage.local.get(keys ?? null).then((data) => {
      if (keys == null) return { ...fallback, ...data };
      if (typeof keys === "string") return data[keys] ?? fallback;
      const out = {};
      for (const k of keys) out[k] = data[k] ?? fallback?.[k];
      return out;
    }),
    set: (obj) => chrome.storage.local.set(obj),
    remove: (keys) => chrome.storage.local.remove(keys),
    onChange(cb) {
      const h = (changes, area) => cb(changes, area);
      chrome.storage.onChanged.addListener(h);
      return () => chrome.storage.onChanged.removeListener(h);
    }
  };
  return __toCommonJS(index_exports);
})();
