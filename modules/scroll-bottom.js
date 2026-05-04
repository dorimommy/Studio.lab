/**
 * StudioLab module: scroll-bottom
 */
(function () {
  'use strict';

  if (!window.StudioLab || typeof window.StudioLab.registerModule !== 'function') return;

  let ctxRef = null;
  let intervalId = null;
  let scrollButton = null;
  let activeScroller = null;
  let generationObserver = null;
  let lastObservedTurn = null;
  let isGenerating = false;

  window.StudioLab.registerModule({
    id: 'scroll-bottom',
    group: 'modules',
    order: 10,
    title: 'Scroll to Bottom Button',
    subtitle: 'jump-back-down-control',
    icon: 'south',
    stateKey: 'scrollBottomEnabled',
    defaults: {
      scrollBottomEnabled: true
    },
    details: [
      { icon: 'south', text: 'Shows a floating button when the chat is scrolled away from the bottom.' }
    ],
    init(ctx) {
      ctxRef = ctx;
      start();
    },
    onStateChange() {
      if (!isActive() && scrollButton) scrollButton.classList.remove('visible');
    },
    onRouteChange() {
      scrollButton = null;
      activeScroller = null;
      stopGenerationObserver();
    }
  });

  function isActive() {
    return !!(ctxRef && ctxRef.state.scrollBottomEnabled);
  }

  function start() {
    if (intervalId) return;
    intervalId = setInterval(tick, 1000);
    tick();
  }

  function tick() {
    if (!isActive()) {
      if (scrollButton) scrollButton.classList.remove('visible');
      return;
    }

    if (!document.querySelector('.sl-scroll-bottom-btn')) {
      createButton();
    }

    const scroller = findActiveScroller();
    if (scroller && scroller !== activeScroller) {
      if (activeScroller) activeScroller.removeEventListener('scroll', handleScroll);
      activeScroller = scroller;
      activeScroller.addEventListener('scroll', handleScroll);
    }

    // Watch the last ms-chat-turn for Angular content mutations
    watchLastTurn();

    handleScroll();
  }

  function createButton() {
    const anchor = document.querySelector('ms-prompt-box');
    if (!anchor || document.querySelector('.sl-scroll-bottom-btn')) return;

    scrollButton = document.createElement('button');
    scrollButton.type = 'button';
    scrollButton.className = 'sl-scroll-bottom-btn';
    scrollButton.setAttribute('aria-label', 'Scroll to bottom');
    updateButtonIcon(false);

    anchor.appendChild(scrollButton);

    scrollButton.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!activeScroller) return;
      activeScroller.scrollTo({
        top: activeScroller.scrollHeight,
        behavior: 'smooth'
      });
    });
  }

  function updateButtonIcon(generating) {
    if (!scrollButton) return;
    if (generating) {
      scrollButton.innerHTML = `
        <div class="sl-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
      `;
    } else {
      scrollButton.innerHTML = `
        <svg class="sl-icon" viewBox="0 0 24 24" focusable="false" aria-hidden="true">
          <path d="M11 4v12.175l-5.6-5.6L4 12l8 8 8-8-1.4-1.425-5.6 5.6V4h-2z" fill="currentColor"></path>
        </svg>
      `;
    }
  }

  function handleScroll() {
    if (!activeScroller || !scrollButton || !isActive()) {
      if (scrollButton) scrollButton.classList.remove('visible');
      return;
    }

    const distanceFromBottom = activeScroller.scrollHeight -
      activeScroller.scrollTop -
      activeScroller.clientHeight;

    // Only visible when scrolled away from bottom — generation only affects the icon
    scrollButton.classList.toggle('visible', distanceFromBottom > 40);
  }

  /* ── Native generation detection via MutationObserver ──────────── */

  function watchLastTurn() {
    const turns = document.querySelectorAll('ms-chat-turn');
    if (!turns.length) return;

    const lastTurn = turns[turns.length - 1];
    if (lastTurn === lastObservedTurn) return;

    stopGenerationObserver();
    lastObservedTurn = lastTurn;

    // Also check for ms-chat-loading-indicator (Thinking phase)
    const hasThinking = !!lastTurn.querySelector('ms-chat-loading-indicator');
    setGenerating(hasThinking);

    generationObserver = new MutationObserver((mutations) => {
      const hasThinking = !!lastObservedTurn.querySelector('ms-chat-loading-indicator');
      let hasContentChange = false;

      for (const m of mutations) {
        if (m.type === 'childList' && (m.addedNodes.length > 0 || m.removedNodes.length > 0)) {
          // Skip mutations in non-content areas (actions bar, tooltips, footer)
          const target = m.target;
          if (target.closest && (
            target.closest('.actions-container') ||
            target.closest('.turn-footer') ||
            target.closest('.hover-or-edit')
          )) continue;

          // Ignore our own injected elements
          const isOurs = Array.from(m.addedNodes).every(n =>
            n.nodeType === 1 && n.className && typeof n.className === 'string' && n.className.startsWith('sl-')
          );
          if (!isOurs) {
            hasContentChange = true;
            break;
          }
        }
      }

      if (hasThinking || hasContentChange) {
        setGenerating(true);
        clearTimeout(generationObserver._stopTimer);
        generationObserver._stopTimer = setTimeout(() => {
          const stillThinking = !!(lastObservedTurn && lastObservedTurn.querySelector('ms-chat-loading-indicator'));
          if (!stillThinking) setGenerating(false);
        }, 2000);
      }
    });

    // Only observe the content area, not action buttons/tooltips
    const contentArea = lastTurn.querySelector('.virtual-scroll-container') || lastTurn;
    generationObserver.observe(contentArea, {
      childList: true,
      subtree: true
    });
  }

  function stopGenerationObserver() {
    if (generationObserver) {
      clearTimeout(generationObserver._stopTimer);
      generationObserver.disconnect();
      generationObserver = null;
    }
    lastObservedTurn = null;
    setGenerating(false);
  }

  function setGenerating(value) {
    if (isGenerating === value) return;
    isGenerating = value;
    if (scrollButton) {
      scrollButton.classList.toggle('generating', value);
      updateButtonIcon(value);
    }
  }

  function findActiveScroller() {
    const turns = document.querySelectorAll('ms-chat-turn');
    if (turns.length > 0) {
      let node = turns[turns.length - 1].parentElement;
      while (node && node !== document.body) {
        if (node.scrollHeight > node.clientHeight + 20) return node;
        node = node.parentElement;
      }
    }

    const autoscroll = document.querySelector('ms-autoscroll-container');
    if (!autoscroll) return null;

    return Array.from(autoscroll.querySelectorAll('div'))
      .find(div => div.scrollHeight > div.clientHeight + 20) || autoscroll;
  }
})();
