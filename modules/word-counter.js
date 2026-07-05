/**
 * Studio.lab module: word-counter
 */
(function () {
  'use strict';

  if (!window.StudioLab || typeof window.StudioLab.registerModule !== 'function') return;

  let ctxRef = null;
  let observer = null;
  const timers = new WeakMap();

  window.StudioLab.registerModule({
    id: 'word-counter',
    group: 'tweaks',
    order: 20,
    title: 'Word Counter',
    subtitle: 'real-time-turn-stats',
    icon: 'calculate',
    stateKey: 'wordCounterEnabled',
    defaults: {
      wordCounterEnabled: true
    },
    details: [
      { icon: 'calculate', text: 'Adds live words and characters count to rendered user and model turns.' }
    ],
    init(ctx) {
      ctxRef = ctx;
      startObserver();
    },
    onStateChange() {
      if (isActive()) updateAllTurns();
      else removeCounters();
    },
    onRouteChange() {
      if (isActive()) setTimeout(updateAllTurns, 300);
    }
  });

  function isActive() {
    return !!(ctxRef && ctxRef.state.wordCounterEnabled);
  }

  function startObserver() {
    if (observer) return;

    const run = () => {
      if (!document.body) {
        setTimeout(run, 100);
        return;
      }

      observer = new MutationObserver((mutations) => {
        if (!isActive()) return;

        const targets = new Set();
        mutations.forEach((mutation) => {
          const target = mutation.target;
          const turnSel = window.StudioLab.SELECTORS ? window.StudioLab.SELECTORS.CHAT_TURN : 'ms-chat-turn';
          const turn = target && target.closest ? target.closest(turnSel) : null;
          if (turn) targets.add(turn);
        });

        targets.forEach(queueTurnUpdate);
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
      });

      updateAllTurns();
    };

    run();
  }

  function queueTurnUpdate(turn) {
    if (timers.has(turn)) return;

    const timer = setTimeout(() => {
      timers.delete(turn);
      updateTurnWordCount(turn);
    }, 300);

    timers.set(turn, timer);
  }

  function updateAllTurns() {
    const turnSel = window.StudioLab.SELECTORS ? window.StudioLab.SELECTORS.CHAT_TURN : 'ms-chat-turn';
    document.querySelectorAll(turnSel).forEach(updateTurnWordCount);
  }

  function removeCounters() {
    document.querySelectorAll('.sl-word-counter').forEach(element => element.remove());
  }

  function updateTurnWordCount(turnNode) {
    if (!isActive()) return;

    // Detect turn type from container class (works even when .author-label is missing)
    const container = turnNode.querySelector('.chat-turn-container');
    if (!container) return;
    const isModel = container.classList.contains('model');
    const isUser = !isModel && (container.classList.contains('user') ||
      container.querySelector('[data-turn-role="User"]'));
    if (!isModel && !isUser) return;

    // Find .author-label — may be in this turn or a previous sibling (thinking turn case)
    let header = turnNode.querySelector('.author-label');
    if (!header && isModel) {
      // Thinking turn above might hold the author-label
      const prev = turnNode.previousElementSibling;
      const turnSel = window.StudioLab.SELECTORS ? window.StudioLab.SELECTORS.CHAT_TURN : 'ms-chat-turn';
      if (prev && prev.tagName === turnSel.toUpperCase()) {
        header = prev.querySelector('.author-label');
      }
    }
    if (!header) return;

    // Extract text ONLY from ms-text-chunk — works for both user and model turns
    const textSel = window.StudioLab.SELECTORS ? window.StudioLab.SELECTORS.TEXT_CHUNK : 'ms-text-chunk';
    const textChunks = turnNode.querySelectorAll(textSel);
    const parts = [];
    textChunks.forEach(chunk => {
      const t = chunk.innerText;
      if (t) parts.push(t);
    });
    let text = parts.join('\n');

    // Normalize whitespace
    const trimmed = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

    // Word count: split by whitespace
    const words = trimmed ? trimmed.split(/\s+/).filter(w => w.length > 0) : [];
    const wordsCount = words.length;
    // Character count: total including spaces (matches Word Counter extension convention)
    const charsCount = trimmed.length;

    if (wordsCount === 0 && charsCount === 0) {
      const existing = header.querySelector('.sl-word-counter');
      if (existing) existing.remove();
      return;
    }

    let badge = header.querySelector('.sl-word-counter');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'sl-word-counter';
      header.appendChild(badge);
    }

    const newContent = `${wordsCount} words \u2022 ${charsCount} chars`;
    if (badge.getAttribute('data-content') !== newContent) {
      badge.setAttribute('data-content', newContent);
      badge.textContent = newContent;
    }
  }
})();
