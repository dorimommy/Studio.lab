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

    const isGenerating = checkIsGenerating();
    if (scrollButton) {
      const wasGenerating = scrollButton.classList.contains('generating');
      if (isGenerating !== wasGenerating) {
        scrollButton.classList.toggle('generating', isGenerating);
        updateButtonIcon(isGenerating);
      }
    }

    handleScroll();
  }

  function createButton() {
    const anchor = document.querySelector('ms-prompt-box');
    if (!anchor || document.querySelector('.sl-scroll-bottom-btn')) return;

    scrollButton = document.createElement('button');
    scrollButton.type = 'button';
    scrollButton.className = 'sl-scroll-bottom-btn';
    scrollButton.setAttribute('aria-label', 'Scroll to bottom');
    
    const isGenerating = checkIsGenerating();
    scrollButton.classList.toggle('generating', isGenerating);
    updateButtonIcon(isGenerating);

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

  function updateButtonIcon(isGenerating) {
    if (!scrollButton) return;
    if (isGenerating) {
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

    const isGenerating = scrollButton.classList.contains('generating');
    const distanceFromBottom = activeScroller.scrollHeight -
      activeScroller.scrollTop -
      activeScroller.clientHeight;
    
    // Always visible if generating, otherwise only when scrolled up
    scrollButton.classList.toggle('visible', isGenerating || distanceFromBottom > 40);
  }

  function checkIsGenerating() {
    // Phase 1: "Thinking" shimmer indicator
    if (document.querySelector('ms-chat-loading-indicator')) return true;
    // Phase 2: Text is streaming — AI Studio shows a stop/cancel button
    const promptBox = document.querySelector('ms-prompt-box');
    if (promptBox) {
      const stopBtn = promptBox.querySelector('button[aria-label*="top"], button[aria-label*="ancel"]');
      if (stopBtn) return true;
    }
    return false;
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
