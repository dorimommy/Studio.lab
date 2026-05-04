/**
 * StudioLab module: optimizer-smart
 *
 * Buffered mode detaches old rendered turns and keeps them available through a
 * restore banner. It avoids touching AI Studio's saved chat data.
 */
(function () {
  'use strict';

  if (!window.StudioLab || typeof window.StudioLab.registerModule !== 'function') return;

  const AUTO_KEEP = 15;

  let ctxRef = null;
  let intervalId = null;
  let detachedTurns = [];
  let detachedParent = null;
  let lastKnownTurnCount = 0;
  let userForceRestored = false;
  let userForceRestoredTime = 0;
  let userStartedReading = false;

  window.StudioLab.registerModule({
    id: 'optimizer-smart',
    group: 'optimizer',
    order: 10,
    title: 'Buffered (Safe)',
    subtitle: 'auto-detach-on-overflow',
    icon: 'storage',
    badge: { text: 'Recommended', className: 'new' },
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
      { icon: 'visibility_off', text: 'Hides old messages from the DOM while keeping them restorable.' },
      { icon: 'history', text: 'Adds restore controls above the chat when turns are buffered.' }
    ],
    init(ctx) {
      ctxRef = ctx;
      sync();
    },
    onStateChange() {
      sync();
    },
    onRouteChange() {
      clearDetachedState();
    }
  });

  function isActive() {
    const state = ctxRef && ctxRef.state;
    return !!(state && state.optimizerEnabled && state.optimizerMode === 'smart');
  }

  function sync() {
    if (isActive()) start();
    else {
      stop();
      restoreDetached();
    }
  }

  function start() {
    if (intervalId) return;
    intervalId = setInterval(applySmartOptimizer, 600);
    applySmartOptimizer();
  }

  function stop() {
    if (!intervalId) return;
    clearInterval(intervalId);
    intervalId = null;
  }

  function applySmartOptimizer() {
    if (!isActive()) return;

    const turns = Array.from(document.querySelectorAll('ms-chat-turn'));
    if (!turns.length) return;

    const keep = getKeepCount();
    if (turns.length <= keep) return;

    if (turns.length > lastKnownTurnCount) {
      userForceRestored = false;
      userStartedReading = false;
      lastKnownTurnCount = turns.length;
    } else if (turns.length < lastKnownTurnCount && turns.length > keep) {
      lastKnownTurnCount = turns.length;
    }

    const scroller = findScroller(turns[0]) ||
      document.querySelector('ms-autoscroll-container div') ||
      document.querySelector('ms-autoscroll-container');
    if (!scroller) return;

    const isAtBottom = (scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight) <= 600;

    if (userForceRestored && shouldPauseAfterRestore(scroller, isAtBottom)) {
      return;
    }

    if (!isAtBottom) return;

    if (!detachedParent && turns[0].parentNode) {
      detachedParent = turns[0].parentNode;
    }

    const cutoff = turns.length - keep;
    for (let index = 0; index < cutoff; index++) {
      detachedTurns.push(turns[index]);
      turns[index].remove();
    }

    if (cutoff > 0) injectLoadBanner();
  }

  function shouldPauseAfterRestore(scroller, isAtBottom) {
    const now = Date.now();
    const timeSinceRestore = now - userForceRestoredTime;

    if (timeSinceRestore <= 1500) return true;

    const farFromBottom = scroller.scrollTop < scroller.scrollHeight - scroller.clientHeight - 600;
    if (farFromBottom) userStartedReading = true;

    if ((userStartedReading && isAtBottom) || (isAtBottom && timeSinceRestore > 3000)) {
      userForceRestored = false;
      userStartedReading = false;
      return false;
    }

    return true;
  }

  function injectLoadBanner() {
    if (!detachedParent || detachedTurns.length === 0) return;

    let banner = document.querySelector('.sl-load-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'sl-load-banner';
      detachedParent.insertBefore(banner, detachedParent.firstChild);
    }

    const currentCount = detachedTurns.length;
    if (banner.getAttribute('data-count') === String(currentCount)) return;

    banner.setAttribute('data-count', String(currentCount));
    banner.textContent = '';

    const restoreAllButton = document.createElement('button');
    restoreAllButton.type = 'button';
    restoreAllButton.textContent = `Restore Everything (${currentCount} hidden)`;
    restoreAllButton.addEventListener('click', () => restoreDetached());
    banner.appendChild(restoreAllButton);

    if (currentCount > 20) {
      const restoreSomeButton = document.createElement('button');
      restoreSomeButton.type = 'button';
      restoreSomeButton.textContent = 'Restore +20';
      restoreSomeButton.addEventListener('click', () => restoreDetached(20));
      banner.appendChild(restoreSomeButton);
    }
  }

  function restoreDetached(amount) {
    userForceRestored = true;
    userForceRestoredTime = Date.now();
    userStartedReading = false;

    const banner = document.querySelector('.sl-load-banner');
    const anchor = detachedParent ? detachedParent.querySelector('ms-chat-turn') : null;
    const scroller = findScroller(anchor || document.querySelector('ms-chat-turn')) ||
      document.querySelector('ms-autoscroll-container div') ||
      document.querySelector('ms-autoscroll-container');

    if (!detachedTurns.length || !detachedParent) {
      if (banner) banner.remove();
      lastKnownTurnCount = document.querySelectorAll('ms-chat-turn').length;
      return;
    }

    const countToRestore = typeof amount === 'number' ? amount : detachedTurns.length;
    const previousOffset = anchor ? anchor.getBoundingClientRect().top : 0;
    let toRestore;

    if (countToRestore >= detachedTurns.length) {
      toRestore = detachedTurns;
      detachedTurns = [];
      if (banner) banner.remove();
    } else {
      toRestore = detachedTurns.splice(detachedTurns.length - countToRestore, countToRestore);
      injectLoadBanner();
    }

    toRestore.forEach((turn) => {
      if (anchor) detachedParent.insertBefore(turn, anchor);
      else detachedParent.appendChild(turn);
    });

    lastKnownTurnCount = document.querySelectorAll('ms-chat-turn').length;

    const fixScrollOffset = () => {
      if (!scroller || !anchor) return;
      const newOffset = anchor.getBoundingClientRect().top;
      scroller.scrollTop += newOffset - previousOffset;
    };

    fixScrollOffset();
    setTimeout(fixScrollOffset, 10);
  }

  function clearDetachedState() {
    detachedTurns = [];
    detachedParent = null;
    lastKnownTurnCount = 0;
    userForceRestored = false;
    userStartedReading = false;

    const banner = document.querySelector('.sl-load-banner');
    if (banner) banner.remove();
  }

  function getKeepCount() {
    const state = ctxRef.state;
    if (state.autoKeep) return AUTO_KEEP;
    const keep = parseInt(state.keepLast, 10);
    return Number.isFinite(keep) ? Math.max(2, keep) : AUTO_KEEP;
  }

  function findScroller(element) {
    let node = element;
    while (node && node !== document.body) {
      if (node.scrollHeight > node.clientHeight && getComputedStyle(node).overflowY !== 'hidden') {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }
})();
