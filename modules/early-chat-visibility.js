(function () {
  'use strict';

  if (window.__slEarlyChatVisibility) return;
  Object.defineProperty(window, '__slEarlyChatVisibility', { value: true, configurable: true });
  const { observe } = window.StudioLabCore;

  const ATTRIBUTE = 'data-sl-fast-chat-render';
  const PREFERENCE_KEY = 'sl_initialChatRenderEnabled';
  let enabled = true;
  let disposeObserver = null;
  let root = null;
  let style = null;
  try { enabled = window.localStorage.getItem(PREFERENCE_KEY) !== 'false'; } catch (_) {}

  window.addEventListener('__sl_initialChatRenderToggle', event => {
    if (typeof event.detail?.enabled !== 'boolean') return;
    enabled = event.detail.enabled;
    if (event.detail.persist === true) {
      try { window.localStorage.setItem(PREFERENCE_KEY, String(enabled)); } catch (_) {}
    }
    sync();
  });

  function sync() {
    if (!enabled) { stop(); return; }
    try {
      if (mount()) {
        disposeObserver?.();
        disposeObserver = null;
      } else if (!disposeObserver) {
        disposeObserver = observe(document, { childList: true, subtree: true }, sync);
      }
    } catch (_) { stop(); }
  }

  function mount() {
    if (style?.isConnected) return true;
    if (!document.documentElement) return false;
    root = document.documentElement;
    style = document.createElement('style');
    style.id = 'sl-fast-chat-render-style';
    // auto preserves native find/focus behavior; Angular still owns every turn and its data.
    style.textContent = `@supports (content-visibility: auto) {
      html[${ATTRIBUTE}] ms-chat-turn:nth-last-of-type(n + 21):not(:focus-within) {
        content-visibility: auto;
        contain-intrinsic-size: auto 600px;
      }
    }`;
    (document.head || root).appendChild(style);
    root.setAttribute(ATTRIBUTE, '');
    return true;
  }

  function stop() {
    disposeObserver?.();
    disposeObserver = null;
    root?.removeAttribute(ATTRIBUTE);
    style?.remove();
    root = null;
    style = null;
  }

  sync();
})();
