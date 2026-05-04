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
      const contentEl = turnNode.querySelector('.turn-content');
      if (contentEl) {
        const clone = contentEl.cloneNode(true);
        // Remove thought chunks, tool calls, buttons, and invisible markdown artifacts
        clone.querySelectorAll('ms-thought-chunk, expandable-content, .sl-word-counter, button, ms-feedback-buttons, ms-copy-button, style, script, [hidden], .hidden, .hide, .invisible').forEach(el => el.remove());
        // Sometimes AI Studio has multiple versions of text (rendered/raw). Pick only the visible one.
        const rendered = clone.querySelector('ms-markdown') || clone;
        text = rendered.textContent || '';
      }
    } else {
      const userContent = turnNode.querySelector('.user-query') ||
                          turnNode.querySelector('.prompt-text') ||
                          turnNode.querySelector('.content-wrapper');
      if (userContent) {
        const clone = userContent.cloneNode(true);
        clone.querySelectorAll('style, script, [hidden], .hidden, .hide, .invisible').forEach(el => el.remove());
        text = clone.textContent || '';
      }
    }

    const trimmed = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

    const words = trimmed ? trimmed.split(' ').filter(w => w.trim().length > 0) : [];
    const wordsCount = words.length;
    const charsCount = trimmed.replace(/\s/g, '').length;

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

    const newContent = `\u00A0\u2022\u00A0${wordsCount} words / ${charsCount} chars`;
    if (badge.textContent !== newContent) {
      badge.textContent = newContent;
    }
  }
})();
