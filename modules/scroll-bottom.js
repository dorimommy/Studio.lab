(function () {
  'use strict';

  if (!window.StudioLab || typeof window.StudioLab.registerModule !== 'function') return;
  const { $, $$, debounce, el, scope } = window.StudioLabCore;
  const io = scope();
  // Було: ручний generatingTimeout + clearTimeout у трьох місцях. Debounce — те саме.
  const scheduleStopGenerating = debounce(() => setGenerating(false), 2000);

  let ctxRef = null;
  let scrollButton = null;
  let activeScroller = null;
  let resizeObserver = null;
  let isGenerating = false;
  let startRetryTimeout = null;
  let routeTimeout = null;

  window.StudioLab.registerModule({
    id: 'scroll-bottom',
    group: 'tweaks',
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
      if (scrollButton) {
        scrollButton.remove();
        scrollButton = null;
      }
      stopResizeObserver();
      clearTimeout(startRetryTimeout);
      clearTimeout(routeTimeout);
      routeTimeout = setTimeout(start, 500);
    },
    dispose() {
      clearTimeout(routeTimeout);
      clearTimeout(startRetryTimeout);
      stopResizeObserver();
      if (scrollButton) scrollButton.remove();
      scrollButton = null;
    }
  });

  function isActive() {
    return !!(ctxRef && ctxRef.state.scrollBottomEnabled);
  }

  function start() {
    if (resizeObserver) return;
    
    const scroller = findActiveScroller();
    if (!scroller) {
      clearTimeout(startRetryTimeout);
      startRetryTimeout = setTimeout(start, 1000);
      return;
    }

    tick();

    resizeObserver = new ResizeObserver(() => {
      if (!isActive()) return;

      // Content resizing is a heuristic for generation activity.
      setGenerating(true);
      scheduleStopGenerating();

      tick();
    });

    activeScroller = scroller;
    io.on(activeScroller, 'scroll', handleScroll, { passive: true });
    const content = scroller.firstElementChild || scroller;
    resizeObserver.observe(content);
  }

  function stopResizeObserver() {
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (activeScroller) {
      io.dispose();
    }
    activeScroller = null;
    setGenerating(false);
  }

  function tick() {
    if (!isActive()) {
      if (scrollButton) scrollButton.classList.remove('visible');
      return;
    }

    if (!$('.sl-scroll-bottom-btn')) {
      createButton();
    }

    handleScroll();
  }

  function createButton() {
    const promptSel = window.StudioLab.SELECTORS ? window.StudioLab.SELECTORS.PROMPT_BOX : 'ms-prompt-box';
    const anchor = $(promptSel);
    if (!anchor || $('.sl-scroll-bottom-btn')) return;

    scrollButton = el('<button type="button" class="sl-scroll-bottom-btn" aria-label="Scroll to bottom"></button>');
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

    // Generation changes the icon but does not control visibility.
    scrollButton.classList.toggle('visible', distanceFromBottom > 40);
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
    const turnSel = window.StudioLab.SELECTORS ? window.StudioLab.SELECTORS.CHAT_TURN : 'ms-chat-turn';
    const turns = $$(turnSel);
    if (turns.length > 0) {
      let node = turns[turns.length - 1].parentElement;
      while (node && node !== document.body) {
        if (node.scrollHeight > node.clientHeight + 20) return node;
        node = node.parentElement;
      }
    }

    const autoSel = window.StudioLab.SELECTORS ? window.StudioLab.SELECTORS.AUTOSCROLL_CONTAINER : 'ms-autoscroll-container';
    const autoscroll = $(autoSel);
    if (!autoscroll) return null;

    return Array.from(autoscroll.querySelectorAll('div'))
      .find(div => div.scrollHeight > div.clientHeight + 20) || autoscroll;
  }
})();
