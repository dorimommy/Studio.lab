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
    group: 'modules',
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
          const turn = target && target.closest ? target.closest('ms-chat-turn') : null;
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
    document.querySelectorAll('ms-chat-turn').forEach(updateTurnWordCount);
  }

  function removeCounters() {
    document.querySelectorAll('.sl-word-counter').forEach(element => element.remove());
  }

  function updateTurnWordCount(turnNode) {
    if (!isActive()) return;

    const header = turnNode.querySelector('.author-label');
    if (!header) return;

    const headerText = header.textContent || '';
    const isModel = headerText.includes('Model');
    const isUser = headerText.includes('User');
    if (!isModel && !isUser) return;

    let text = '';

    if (isModel) {
      // Use innerText directly on ms-text-chunk elements for accurate visible text
      // This avoids double-counting from nested cmark-node textContent
      const textChunks = turnNode.querySelectorAll('ms-prompt-chunk.text-chunk ms-text-chunk');
      const parts = [];
      textChunks.forEach(chunk => {
        const t = chunk.innerText;
        if (t) parts.push(t);
      });
      text = parts.join('\n');
    } else {
      // User turn — get visible text from the content area
      const userContent = turnNode.querySelector('.user-query') ||
                          turnNode.querySelector('.prompt-text') ||
                          turnNode.querySelector('.content-wrapper') ||
                          turnNode.querySelector('.turn-content');
      if (userContent) {
        text = userContent.innerText || '';
      }
    }

    // Normalize whitespace: collapse runs of spaces/tabs but preserve word boundaries
    const trimmed = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

    // Word count: split by whitespace boundaries
    const words = trimmed ? trimmed.split(/\s+/).filter(w => w.length > 0) : [];
    const wordsCount = words.length;
    // Character count: total chars including spaces (matches Word Counter convention)
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
