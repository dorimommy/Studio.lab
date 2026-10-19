// Keep Angular's turn nodes and insertion anchors intact while reducing visible history.
(function () {
  'use strict';

  if (!window.StudioLab || typeof window.StudioLab.registerModule !== 'function') return;
  const { $, $$, el } = window.StudioLabCore;

  const AUTO_KEEP = 15;
  const BUFFERED_ATTRIBUTE = 'data-sl-buffered-turn';
  const OLDER_TURNS_ATTRIBUTE = 'data-sl-older-turns';
  const STYLE_ID = 'sl-buffered-turn-style';
  let ctxRef = null;
  let watcherScope = null;
  let currentParent = null;
  let parentRoute = null;
  let bufferedTurns = new Set();
  let banner = null;
  let style = null;
  let manualReveal = false;
  let pinned = true;
  let userScrollIntent = false;
  let applying = false;

  window.StudioLab.registerModule({
    id: 'optimizer-smart',
    group: 'optimizer',
    order: 10,
    title: 'Buffered (Safe)',
    subtitle: 'Keep recent messages visible',
    icon: 'storage',
    modeKey: 'optimizerMode',
    modeValue: 'smart',
    enabledKey: 'optimizerEnabled',
    defaults: {
      optimizerEnabled: false,
      optimizerMode: 'smart',
      keepLast: 15,
      autoKeep: true
    },
    details: [
      { icon: 'visibility_off', text: 'Hides older messages while keeping their native elements in place.' },
      { icon: 'history', text: 'Restore earlier messages above the chat whenever you need them.' }
    ],
    init(ctx) { ctxRef = ctx; sync(); },
    onStateChange() { sync(); },
    onRouteChange(ctx, current, previous) {
      if (current && previous && current.key === previous.key) return;
      if (manualReveal && current?.key === parentRoute && parentRoute === currentRoute()) {
        applySmartOptimizer();
        return;
      }
      stop();
      sync();
    },
    dispose() { stop(); }
  });

  function isActive() {
    const state = ctxRef && ctxRef.state;
    return !!(state && state.optimizerEnabled && state.optimizerMode === 'smart');
  }

  function sync() {
    if (!isActive()) { stop(); return; }
    if (!watcherScope) start();
    else applySmartOptimizer();
  }

  function start() {
    watcherScope = window.StudioLab.createScope();
    style = el(`<style id="${STYLE_ID}"></style>`);
    style.textContent = `ms-chat-turn[${BUFFERED_ATTRIBUTE}]{display:none!important}`;
    (document.head || document.documentElement).appendChild(style);
    setupWatchers();
    applySmartOptimizer();
  }

  function stop() {
    if (watcherScope) watcherScope.dispose();
    watcherScope = null;
    clearChat();
    if (style) style.remove();
    style = null;
  }

  function currentRoute() {
    return window.location?.pathname?.replace(/\/+$/, '') || '/';
  }

  function turnSelector() {
    return window.StudioLab.SELECTORS?.CHAT_TURN || 'ms-chat-turn';
  }

  function currentTurns() {
    if (!currentParent?.isConnected || parentRoute !== currentRoute()) return [];
    return Array.from(currentParent.children).filter(node => node.matches?.(turnSelector()));
  }

  function clearChat() {
    for (const turn of bufferedTurns) turn.removeAttribute(BUFFERED_ATTRIBUTE);
    bufferedTurns.clear();
    if (banner) banner.remove();
    banner = null;
    currentParent = null;
    parentRoute = null;
    manualReveal = false;
    pinned = true;
    userScrollIntent = false;
  }

  function findCurrentTurns() {
    const all = $$(turnSelector());
    const parent = all[all.length - 1]?.parentNode || null;
    if (parent !== currentParent || parentRoute !== currentRoute()) {
      const revealBeforeMount = !currentParent && parentRoute === currentRoute() && manualReveal;
      clearChat();
      currentParent = parent;
      parentRoute = currentRoute();
      manualReveal = revealBeforeMount;
      if (manualReveal) pinned = false;
    }
    const turns = currentTurns();
    for (const turn of bufferedTurns) {
      if (turn.parentNode !== currentParent || !turn.isConnected) {
        turn.removeAttribute(BUFFERED_ATTRIBUTE);
        bufferedTurns.delete(turn);
      }
    }
    return turns;
  }

  function isSearchDialogOpen() {
    const omnibar = $(window.StudioLab.SELECTORS?.OMNIBAR || 'ms-omnibar');
    return !!(omnibar?.querySelector('.overlay-backdrop, .overlay-content') ||
      $('[role="dialog"][aria-label="Command Palette"], [aria-label="Command Palette"] [role="dialog"]'));
  }

  function isProtectedTurn(turn) {
    return !!(document.activeElement && turn.contains(document.activeElement)) ||
      turn.matches('.generating') || !!turn.querySelector('.generating, [data-test-id="stop-button"]');
  }

  function unmark(turn) {
    turn.removeAttribute(BUFFERED_ATTRIBUTE);
    bufferedTurns.delete(turn);
  }

  function applySmartOptimizer() {
    if (!isActive() || applying) return;
    applying = true;
    try {
      const turns = findCurrentTurns();
      if (isSearchDialogOpen()) {
        manualReveal = true;
        pinned = false;
        userScrollIntent = false;
        for (const turn of turns) unmark(turn);
      }
      const cutoff = Math.max(0, turns.length - getKeepCount());
      for (let index = 0; index < turns.length; index++) {
        const turn = turns[index];
        if (index >= cutoff || isProtectedTurn(turn)) {
          if (bufferedTurns.has(turn)) unmark(turn);
        } else if (!manualReveal && !bufferedTurns.has(turn)) {
          turn.setAttribute(BUFFERED_ATTRIBUTE, '');
          bufferedTurns.add(turn);
        }
      }
      updateBanner(turns.length);
    } finally {
      applying = false;
    }
  }

  function restoreBuffered(amount) {
    if (!isActive()) return 0;
    const turns = findCurrentTurns();
    manualReveal = true;
    pinned = false;
    userScrollIntent = false;
    const hidden = turns.filter(turn => bufferedTurns.has(turn));
    const count = typeof amount === 'number' && Number.isFinite(amount) ? Math.max(0, amount) : hidden.length;
    const restored = hidden.slice(Math.max(0, hidden.length - count));
    for (const turn of restored) unmark(turn);
    updateBanner(turns.length);
    return restored.length;
  }

  function currentSession() {
    if (!currentParent?.isConnected || parentRoute !== currentRoute()) return null;
    return currentParent.closest('ms-chat-session');
  }

  function olderTurnCount() {
    const value = currentSession()?.getAttribute(OLDER_TURNS_ATTRIBUTE);
    if (!value || !/^\d+$/.test(value)) return 0;
    const count = Number(value);
    return Number.isSafeInteger(count) ? count : 0;
  }

  function showEarlierTurns() {
    const restored = restoreBuffered(20);
    const count = Math.min(20 - restored, olderTurnCount());
    if (count > 0) window.dispatchEvent(new CustomEvent('__sl_requestOlderTurns', { detail: { count } }));
  }

  function resumeBuffering() {
    manualReveal = false;
    pinned = true;
    userScrollIntent = false;
    applySmartOptimizer();
  }

  function updateBanner(turnCount) {
    const count = bufferedTurns.size;
    const earlier = olderTurnCount();
    if (!currentParent?.isConnected || (!count && !earlier && (!manualReveal || turnCount <= getKeepCount()))) {
      if (banner) banner.remove();
      banner = null;
      return;
    }
    if (!banner) {
      banner = el('<div class="sl-load-banner"></div>');
      currentParent.insertBefore(banner, currentParent.firstChild);
    }
    const signature = `${count}:${earlier}:${manualReveal}`;
    if (banner.getAttribute('data-buffered-state') === signature) return;
    banner.setAttribute('data-buffered-state', signature);
    banner.textContent = '';
    const owner = currentParent;
    const route = parentRoute;
    const addButton = (text, action) => {
      const button = el('<button type="button"></button>');
      button.textContent = text;
      button.addEventListener('click', () => {
        if (!isActive() || currentParent !== owner || !owner.isConnected || route !== currentRoute()) return;
        action();
      });
      banner.appendChild(button);
    };
    const summary = earlier ? `${count ? count + ' hidden, ' : ''}${earlier} earlier` : `${count} hidden`;
    if (count || earlier) addButton(`Restore Everything (${summary})`, () => {
      restoreBuffered();
      window.dispatchEvent(new CustomEvent('__sl_restoreAllTurns'));
    });
    if (count || earlier) addButton(`${earlier ? 'Show earlier ' : 'Restore +'}${Math.min(20, count + earlier)}`, showEarlierTurns);
    if (manualReveal) addButton('Show recent only', resumeBuffering);
  }

  function setupWatchers() {
    watcherScope.listen(window, '__sl_chatRenderCommitted', applySmartOptimizer);
    watcherScope.listen(window, '__sl_restoreAllTurns', () => restoreBuffered());

    const recordScrollIntent = event => {
      if (event.isTrusted === false) return;
      if (currentParent && (currentParent.contains(event.target) || event.target?.contains?.(currentParent))) {
        userScrollIntent = true;
      }
    };
    watcherScope.listen(document, 'wheel', recordScrollIntent, { capture: true, passive: true });
    watcherScope.listen(document, 'touchmove', recordScrollIntent, { capture: true, passive: true });
    watcherScope.listen(document, 'pointerdown', event => {
      if (event.target?.contains?.(currentParent)) recordScrollIntent(event);
    }, { capture: true, passive: true });
    watcherScope.listen(document, 'scroll', event => {
      if (!userScrollIntent || !currentParent?.isConnected || !event.target?.contains?.(currentParent)) return;
      userScrollIntent = false;
      const scroller = event.target;
      // Only an actual user scroll samples layout; native render batches use the cached state.
      const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      if (!Number.isFinite(distance)) return;
      const wasPinned = pinned;
      pinned = distance <= 2;
      if (pinned && !wasPinned) manualReveal = false;
      applySmartOptimizer();
    }, { capture: true, passive: true });

    watcherScope.listen(document, 'keydown', event => {
      if (event.isTrusted !== false && ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) {
        recordScrollIntent(event);
      }
      // KeyF also supports search with a non-Latin keyboard layout.
      if ((event.ctrlKey || event.metaKey) && (event.code === 'KeyF' || event.key?.toLowerCase() === 'f' || event.key === '/')) {
        restoreBuffered();
      }
    }, { capture: true });

    const resultsSelector = () => window.StudioLab.SELECTORS?.OMNIBAR_RESULTS || '#omnibar-results';
    watcherScope.listen(document, 'click', event => {
      if (event.target.closest?.(`${resultsSelector()} .result-item, ${resultsSelector()} [role="option"]`)) restoreBuffered();
    }, { capture: true });
    watcherScope.listen(document, 'keydown', event => {
      if (event.key !== 'Enter') return;
      const selector = resultsSelector();
      if ($(`${selector} .result-item[aria-selected="true"], ${selector} [role="option"][aria-selected="true"]`) ||
        document.activeElement?.closest(`${selector} .result-item, ${selector} [role="option"]`)) restoreBuffered();
    }, { capture: true });
    watcherScope.listen(document, 'focusin', event => {
      const turn = event.target.closest?.(turnSelector());
      if (turn?.parentNode === currentParent && bufferedTurns.has(turn)) {
        unmark(turn);
        updateBanner(currentTurns().length);
      }
    }, { capture: true });

    const observer = new MutationObserver(records => {
      const containsTurn = node => node.nodeType === 1 && (node.matches?.(turnSelector()) || node.querySelector?.(turnSelector()));
      const changed = records.some(record => {
        if (banner && (record.target === banner || banner.contains(record.target))) return false;
        if (record.type === 'attributes' && record.attributeName === OLDER_TURNS_ATTRIBUTE) return record.target === currentSession();
        return record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].some(containsTurn);
      });
      if (changed || (isSearchDialogOpen() && !manualReveal) || (currentParent && !currentParent.isConnected)) applySmartOptimizer();
    });
    watcherScope.observe(observer, document, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'role', 'aria-label', OLDER_TURNS_ATTRIBUTE]
    });
  }

  function getKeepCount() {
    const state = ctxRef.state;
    if (state.autoKeep) return AUTO_KEEP;
    const keep = parseInt(state.keepLast, 10);
    return Number.isFinite(keep) ? Math.max(2, keep) : AUTO_KEEP;
  }

  window.StudioLab = Object.assign(window.StudioLab || {}, {
    getDetachedTurns: () => [],
    restoreDetached: amount => restoreBuffered(amount)
  });
})();
