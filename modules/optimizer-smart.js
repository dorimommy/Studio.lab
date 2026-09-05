/**
 * StudioLab module: optimizer-smart
 *
 * Buffered mode detaches old rendered turns and keeps them available through a
 * restore banner. It avoids touching AI Studio's saved chat data.
 * Fully coordinates with native AI Studio search (Ctrl+Shift+F) and smooth upward scrolling.
 */
(function () {
  'use strict';

  if (!window.StudioLab || typeof window.StudioLab.registerModule !== 'function') return;

  const AUTO_KEEP = 15;

  let ctxRef = null;
  let intervalId = null;
  let detachedTurns = [];
  let detachedParent = null;
  let pauseUntil = 0;
  let bottomStayStartTime = 0;
  let watchersInitialized = false;

  window.StudioLab.registerModule({
    id: 'optimizer-smart',
    group: 'optimizer',
    order: 10,
    title: 'Buffered (Safe)',
    subtitle: 'auto-detach-on-overflow',
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
      { icon: 'visibility_off', text: 'Hides old messages from the DOM while keeping them restorable.' },
      { icon: 'history', text: 'Adds restore controls above the chat when turns are buffered.' }
    ],
    init(ctx) {
      ctxRef = ctx;
      sync();
      if (!watchersInitialized) {
        setupSearchAndScrollWatchers();
        watchersInitialized = true;
      }
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
    if (isActive()) {
      start();
    } else {
      stop();
      restoreDetached();
    }
  }

  function start() {
    if (intervalId) return;
    intervalId = setInterval(applySmartOptimizer, 800);
    applySmartOptimizer();

    // Clean up any legacy intrusive styles
    const legacyStyle = document.getElementById('sl-fast-render-style');
    if (legacyStyle) legacyStyle.remove();
  }

  function stop() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    const legacyStyle = document.getElementById('sl-fast-render-style');
    if (legacyStyle) legacyStyle.remove();
  }

  function isSearchDialogOpen() {
    const omnibarSel = window.StudioLab.SELECTORS ? window.StudioLab.SELECTORS.OMNIBAR : 'ms-omnibar';
    const omnibar = document.querySelector(omnibarSel);
    if (omnibar && (omnibar.querySelector('.overlay-backdrop') || omnibar.querySelector('.overlay-content'))) {
      return true;
    }
    return !!document.querySelector('.overlay-content[role="dialog"], [aria-label="Command Palette"]');
  }

  function applySmartOptimizer() {
    if (!isActive()) return;

    // Never detach if search palette is active or during navigation grace period
    if (isSearchDialogOpen() || Date.now() < pauseUntil) {
      return;
    }

    const turnSel = window.StudioLab.SELECTORS ? window.StudioLab.SELECTORS.CHAT_TURN : 'ms-chat-turn';
    const turns = Array.from(document.querySelectorAll(turnSel));
    if (!turns.length) return;

    const keep = getKeepCount();
    if (turns.length <= keep) return;

    const autoSel = window.StudioLab.SELECTORS ? window.StudioLab.SELECTORS.AUTOSCROLL_CONTAINER : 'ms-autoscroll-container';
    const scroller = findScroller(turns[0]) ||
      document.querySelector(autoSel) ||
      document.querySelector(`${autoSel} div`);
    if (!scroller) return;

    // Check if user is at the bottom of the chat
    const distFromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    const isAtBottom = distFromBottom <= 250;

    if (!isAtBottom) {
      bottomStayStartTime = 0;
      return;
    }

    // Require the user to stay at the bottom for at least 5 seconds before buffering older turns
    const now = Date.now();
    if (bottomStayStartTime === 0) {
      bottomStayStartTime = now;
      return;
    }
    if (now - bottomStayStartTime < 5000) {
      return;
    }

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

  function setupSearchAndScrollWatchers() {
    // 1. Keyboard shortcuts: Restore detached turns when native search is triggered
    // Handles English (KeyF / 'f') and international Cyrillic layouts (where key might be 'а')
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyF' || (e.key && e.key.toLowerCase() === 'f') || e.key === '/')) {
        pauseUntil = Date.now() + 20000;
        bottomStayStartTime = 0;
        if (detachedTurns.length > 0) {
          restoreDetached();
        }
      }
    }, { capture: true });

    // 2. Watch for native Command Palette / Omnibar dialog appearing
    const paletteObserver = new MutationObserver(() => {
      if (isSearchDialogOpen()) {
        pauseUntil = Date.now() + 20000;
        bottomStayStartTime = 0;
        if (detachedTurns.length > 0) {
          restoreDetached();
        }
      }
    });
    if (document.body) {
      paletteObserver.observe(document.body, { childList: true, subtree: true });
    }

    // 3. Search result selection interceptor (click and Enter)
    const handleResultSelection = (targetItem) => {
      if (!targetItem) return;

      // Always restore everything so the turn exists in the DOM for AI Studio's scrollIntoView
      pauseUntil = Date.now() + 30000;
      bottomStayStartTime = 0;
      if (detachedTurns.length > 0) {
        restoreDetached();
      }

      // Extract target turn UUID if available from MakerSuiteVeMetadataKey in jslog
      let targetTurnId = null;
      const jslog = targetItem.getAttribute('jslog') || '';
      const metaMatch = jslog.match(/MakerSuiteVeMetadataKey:([^;]+)/);
      if (metaMatch) {
        try {
          const decoded = atob(metaMatch[1]);
          const idMatch = decoded.match(/chat-result-([A-Fa-f0-9-]+)/);
          if (idMatch) {
            targetTurnId = 'turn-' + idMatch[1];
          }
        } catch (err) {}
      }

      // Ensure smooth navigation to target and trigger brief visual highlight
      const verifyNavigation = (attemptsLeft) => {
        let targetEl = targetTurnId ? document.getElementById(targetTurnId) : null;
        if (!targetEl && targetTurnId) {
          targetEl = document.querySelector(`[id*="${targetTurnId}"]`);
        }

        if (targetEl) {
          const rect = targetEl.getBoundingClientRect();
          // If not currently in top view, smoothly scroll it
          if (rect.top < 0 || rect.top > 400) {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
          targetEl.classList.add('sl-turn-highlight');
          setTimeout(() => targetEl.classList.remove('sl-turn-highlight'), 3000);
        } else if (attemptsLeft > 0) {
          setTimeout(() => verifyNavigation(attemptsLeft - 1), 100);
        }
      };

      setTimeout(() => verifyNavigation(3), 80);
    };

    document.addEventListener('click', (e) => {
      const resultsSel = window.StudioLab.SELECTORS ? window.StudioLab.SELECTORS.OMNIBAR_RESULTS : '#omnibar-results';
      const item = e.target.closest(`${resultsSel} .result-item, ${resultsSel} [role="option"]`);
      if (item) {
        handleResultSelection(item);
      }
    }, { capture: true });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const resultsSel = window.StudioLab.SELECTORS ? window.StudioLab.SELECTORS.OMNIBAR_RESULTS : '#omnibar-results';
        const activeItem = document.querySelector(`${resultsSel} .result-item[aria-selected="true"], ${resultsSel} .result-item:hover, ${resultsSel} [role="option"][aria-selected="true"]`) ||
          (document.activeElement && document.activeElement.closest(`${resultsSel} .result-item`));
        if (activeItem) {
          handleResultSelection(activeItem);
        }
      }
    }, { capture: true });

    // 4. Listen for scroll on chat container to automatically restore when scrolling UP
    const watchScroller = () => {
      const turnSel = window.StudioLab.SELECTORS ? window.StudioLab.SELECTORS.CHAT_TURN : 'ms-chat-turn';
      const autoSel = window.StudioLab.SELECTORS ? window.StudioLab.SELECTORS.AUTOSCROLL_CONTAINER : 'ms-autoscroll-container';
      const scroller = findScroller(document.querySelector(turnSel)) ||
        document.querySelector(autoSel) ||
        document.querySelector(`${autoSel} div`);

      if (!scroller) {
        setTimeout(watchScroller, 500);
        return;
      }

      let lastScrollTop = scroller.scrollTop;
      scroller.addEventListener('scroll', () => {
        if (!isActive()) return;

        const currentScrollTop = scroller.scrollTop;
        const scrollingUp = currentScrollTop < lastScrollTop;
        lastScrollTop = currentScrollTop;

        const distFromBottom = scroller.scrollHeight - currentScrollTop - scroller.clientHeight;
        if (distFromBottom > 300) {
          bottomStayStartTime = 0;
        }

        if (detachedTurns.length === 0) return;

        // When scrolling up towards history or approaching the top banner, restore all turns seamlessly
        if (currentScrollTop < 800 || (scrollingUp && currentScrollTop < 2000)) {
          restoreDetached();
        }
      }, { passive: true });
    };

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      watchScroller();
    } else {
      window.addEventListener('DOMContentLoaded', watchScroller);
    }
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
    pauseUntil = Date.now() + 20000;
    bottomStayStartTime = 0;

    const banner = document.querySelector('.sl-load-banner');
    const turnSel = window.StudioLab.SELECTORS ? window.StudioLab.SELECTORS.CHAT_TURN : 'ms-chat-turn';
    const anchor = detachedParent ? detachedParent.querySelector(turnSel) : null;

    if (!detachedTurns.length || !detachedParent) {
      if (banner) banner.remove();
      return;
    }

    const countToRestore = typeof amount === 'number' ? amount : detachedTurns.length;
    let toRestore;

    if (countToRestore >= detachedTurns.length) {
      toRestore = detachedTurns;
      detachedTurns = [];
      if (banner) banner.remove();
    } else {
      toRestore = detachedTurns.splice(detachedTurns.length - countToRestore, countToRestore);
      injectLoadBanner();
    }

    // Insert turns in order before current anchor.
    // Chromium's native scroll anchoring (overflow-anchor: auto) preserves visible position without manual jitter.
    toRestore.forEach((turn) => {
      if (anchor) detachedParent.insertBefore(turn, anchor);
      else detachedParent.appendChild(turn);
    });
  }

  function clearDetachedState() {
    detachedTurns = [];
    detachedParent = null;
    pauseUntil = 0;
    bottomStayStartTime = 0;

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

  window.StudioLab = Object.assign(window.StudioLab || {}, {
    getDetachedTurns: () => detachedTurns,
    restoreDetached: (amount) => restoreDetached(amount)
  });
})();
