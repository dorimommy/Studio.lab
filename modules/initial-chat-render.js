(function () {
  'use strict';

  if (window.__slInitialChatRender) return;

  const PREFERENCE_KEY = 'sl_initialChatRenderEnabled';
  let enabled = true;
  try { enabled = window.localStorage.getItem(PREFERENCE_KEY) !== 'false'; } catch (_) {}
  let status = 'waiting';
  let deferred = 0;
  let native = 0;
  let timer = null;
  let retainDirectiveWatch = null;
  const cleanups = [];

  const diagnostics = Object.freeze({
    version: 1,
    get enabled() { return enabled; },
    get status() { return status; },
    get deferred() { return deferred; },
    get native() { return native; }
  });
  Object.defineProperty(window, '__slInitialChatRender', { value: diagnostics, configurable: true });
  window.addEventListener('__sl_initialChatRenderToggle', event => {
    if (typeof event.detail?.enabled !== 'boolean') return;
    enabled = event.detail.enabled;
    if (event.detail.persist === true) {
      try { window.localStorage.setItem(PREFERENCE_KEY, String(enabled)); } catch (_) {}
    }
  });

  function finish(nextStatus) {
    status = nextStatus;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    for (const cleanup of cleanups.splice(0).reverse()) {
      try { cleanup(); } catch (_) {}
    }
    retainDirectiveWatch = null;
  }

  function savedChat() {
    const location = window.location;
    const match = location?.origin === 'https://aistudio.google.com' &&
      location.pathname.match(/^\/prompts\/([A-Za-z0-9_-]+)\/?$/);
    return !!match && !/^new_(?:chat|image|video|comparison)$/.test(match[1]);
  }

  function escapePattern(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function targetHook(metadata) {
    if (!Array.isArray(metadata?.da) || metadata.da.length !== 1 ||
        JSON.stringify(metadata.da[0]) !== '["","msHeightChanged",""]' ||
        typeof metadata.type !== 'function') return null;
    const prototype = metadata.type.prototype;
    const candidates = [];
    for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(prototype))) {
      if (name === 'constructor' || typeof descriptor.value !== 'function') continue;
      const source = Function.prototype.toString.call(descriptor.value).replace(/\s+/g, '');
      const match = source.match(/^(?:[\w$]+|function(?:[\w$]+)?)\(\)\{this\.([\w$]+)\.observe\(this\.([\w$]+)\.nativeElement\);this\.([\w$]+)=this\.\2\.nativeElement\.offsetHeight;this\.([\w$]+)\.emit\(this\.\3\);?\}$/);
      if (match && metadata.outputs?.[match[4]] === 'heightChanged') candidates.push({ name, descriptor, match });
    }
    if (candidates.length !== 1) return null;
    const candidate = candidates[0];
    const [, observer, element, height, emitter] = candidate.match;
    const constructor = Function.prototype.toString.call(metadata.type).replace(/\s+/g, '');
    const observerStart = constructor.indexOf('this.' + observer + '=newResizeObserver(');
    const callback = constructor.slice(observerStart, constructor.indexOf('}' + candidate.name + '(', observerStart));
    const initialHeight = new RegExp('this\\.' + escapePattern(height) + '=0[;,]');
    const notification = new RegExp('([\\w$]+)!==this\\.' + escapePattern(height) +
      '&&\\(this\\.' + escapePattern(height) + '=\\1,this\\.' + escapePattern(emitter) +
      '\\.emit\\(this\\.' + escapePattern(height) + '\\)\\)');
    if (observerStart < 0 || !initialHeight.test(constructor.slice(0, observerStart)) ||
        !callback.includes('.contentRect.height') || !notification.test(callback)) return null;
    return { ...candidate, prototype, observer, element, emitter };
  }

  function patch(metadata) {
    const target = targetHook(metadata);
    if (!target) { finish('unsupported'); return; }
    const original = target.descriptor.value;
    const replacement = function () {
      if (enabled && savedChat()) {
        try {
          const element = this[target.element]?.nativeElement;
          const observer = this[target.observer];
          if (element?.closest?.('ms-chat-session') && observer instanceof ResizeObserver &&
              typeof this[target.emitter]?.emit === 'function') {
            // The existing ResizeObserver emits the initial height after one browser layout.
            observer.observe(element);
            deferred++;
            return;
          }
        } catch (_) {}
      }
      native++;
      return Reflect.apply(original, this, arguments);
    };
    Object.defineProperty(target.prototype, target.name, { ...target.descriptor, value: replacement });
    finish('active');
  }

  function observeDirectiveExport(namespace) {
    if (!namespace || typeof namespace !== 'object') { finish('unsupported'); return; }
    const descriptor = Object.getOwnPropertyDescriptor(namespace, 'ne');
    if (descriptor && (!('value' in descriptor) || !descriptor.configurable || !descriptor.writable)) {
      finish('unsupported');
      return;
    }
    let value = descriptor?.value;
    let wrapper = null;
    const wrap = original => {
      if (typeof original !== 'function') return original;
      wrapper = function () {
        const result = Reflect.apply(original, this, arguments);
        const metadata = arguments[0];
        if (Array.isArray(metadata?.da) && metadata.da.some(selector =>
          Array.isArray(selector) && selector.includes('msHeightChanged'))) {
          try { patch(metadata); } catch (_) { finish('unsupported'); }
        }
        return result;
      };
      return wrapper;
    };
    let assigned = !!descriptor;
    let original = value;
    value = wrap(value);
    const getter = () => value;
    const setter = next => {
      assigned = true;
      original = next;
      value = wrap(next);
    };
    Object.defineProperty(namespace, 'ne', { configurable: true, enumerable: descriptor?.enumerable ?? true,
      get: getter, set: setter });
    cleanups.push(() => {
      const current = Object.getOwnPropertyDescriptor(namespace, 'ne');
      const ownedAccessor = current?.get === getter && current.set === setter;
      if (!ownedAccessor && current?.value !== wrapper) return;
      if (!assigned) delete namespace.ne;
      else Object.defineProperty(namespace, 'ne', { value: original, configurable: true,
        enumerable: descriptor?.enumerable ?? true, writable: true });
    });
    retainDirectiveWatch = () => {
      if (typeof original !== 'function' || typeof wrapper !== 'function') return false;
      const current = Object.getOwnPropertyDescriptor(namespace, 'ne');
      if (current?.get === getter && current.set === setter) {
        Object.defineProperty(namespace, 'ne', { value: wrapper, configurable: true,
          enumerable: descriptor?.enumerable ?? true, writable: true });
        return true;
      }
      return current?.value === wrapper;
    };
  }

  try {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'default_MakerSuite');
    if (descriptor?.value && typeof descriptor.value === 'object') {
      observeDirectiveExport(descriptor.value);
    } else if (!descriptor || 'value' in descriptor && descriptor.configurable && descriptor.writable) {
      let value = descriptor?.value;
      let assigned = !!descriptor;
      const getter = () => value;
      const setter = next => {
        value = next;
        assigned = true;
        Object.defineProperty(window, 'default_MakerSuite', { value, configurable: true,
          enumerable: descriptor?.enumerable ?? true, writable: true });
        observeDirectiveExport(next);
      };
      Object.defineProperty(window, 'default_MakerSuite', { configurable: true,
        enumerable: descriptor?.enumerable ?? true, get: getter, set: setter });
      cleanups.push(() => {
        const current = Object.getOwnPropertyDescriptor(window, 'default_MakerSuite');
        if (current?.get !== getter || current.set !== setter) return;
        if (!assigned) delete window.default_MakerSuite;
        else Object.defineProperty(window, 'default_MakerSuite', { ...descriptor, value });
      });
    } else finish('unsupported');
    if (status === 'waiting') timer = setTimeout(() => {
      timer = null;
      try { if (retainDirectiveWatch?.()) return; } catch (_) {}
      finish('unsupported');
    }, 20000);
  } catch (_) { finish('unsupported'); }
})();
