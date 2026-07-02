/**
 * StudioLab module: scroll-bottom
 */
(function () {
  'use strict';

  if (!window.StudioLab || typeof window.StudioLab.registerModule !== 'function') return;

  let ctxRef = null;
  let scrollButton = null;
  let activeScroller = null;
  let resizeObserver = null;
  let isGenerating = false;
  let generatingTimeout = null;

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
      if (scrollButton) {
        scrollButton.remove();
        scrollButton = null;
      }
      activeScroller = null;
      stopResizeObserver();
      setTimeout(start, 500); // re-init on route change
    }
  });

  function isActive() {
    return !!(ctxRef && ctxRef.state.scrollBottomEnabled);
  }

  function start() {
    if (resizeObserver) return;
    
    // Initial check
    tick();

    // Use ResizeObserver instead of setInterval/MutationObserver
    resizeObserver = new ResizeObserver((entries) => {
      if (!isActive()) return;
      
      // If content height changes rapidly, we assume generation
      setGenerating(true);
      clearTimeout(generatingTimeout);
      generatingTimeout = setTimeout(() => setGenerating(false), 2000);
      
      tick();
    });

    const scroller = findActiveScroller();
    if (scroller) {
      activeScroller = scroller;
      activeScroller.addEventListener('scroll', handleScroll, { passive: true });
      // Observe the content inside scroller
      const content = scroller.firstElementChild || scroller;
      resizeObserver.observe(content);
    }
  }

  function stopResizeObserver() {
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (activeScroller) {
      activeScroller.removeEventListener('scroll', handleScroll);
    }
    setGenerating(false);
  }

  function tick() {
    if (!isActive()) {
      if (scrollButton) scrollButton.classList.remove('visible');
      return;
    }

    if (!document.querySelector('.sl-scroll-bottom-btn')) {
      createButton();
    }

    handleScroll();
  }

  function createButton() {
    const promptSel = window.StudioLab.SELECTORS ? window.StudioLab.SELECTORS.PROMPT_BOX : 'ms-prompt-box';
    const anchor = document.querySelector(promptSel);
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
    const turns = document.querySelectorAll(turnSel);
    if (turns.length > 0) {
      let node = turns[turns.length - 1].parentElement;
      while (node && node !== document.body) {
        if (node.scrollHeight > node.clientHeight + 20) return node;
        node = node.parentElement;
      }
    }

    const autoSel = window.StudioLab.SELECTORS ? window.StudioLab.SELECTORS.AUTOSCROLL_CONTAINER : 'ms-autoscroll-container';
    const autoscroll = document.querySelector(autoSel);
    if (!autoscroll) return null;

    return Array.from(autoscroll.querySelectorAll('div'))
      .find(div => div.scrollHeight > div.clientHeight + 20) || autoscroll;
  }
})();
