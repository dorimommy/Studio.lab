(function () {
  'use strict';

  if (!window.StudioLab || typeof window.StudioLab.registerModule !== 'function') return;

  let ctxRef = null;
  let observer = null;
  let bodyTimer = null;
  let routeTimer = null;
  let frameId = null;
  const pendingTurns = new Set();
  const priorityTurns = new Set();
  const TURNS_PER_FRAME = 20;
  const TEXT_BLOCK_TAGS = /^(?:ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|BR|DD|DIV|DL|DT|FIGCAPTION|FIGURE|H[1-6]|HR|LI|OL|P|PRE|SECTION|TABLE|TD|TH|TR|UL)$/;

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
      if (isActive()) startObserver();
    },
    onStateChange() {
      if (isActive()) startObserver();
      else stop();
    },
    onRouteChange() {
      clearTimeout(routeTimer);
      clearQueue();
      if (isActive()) routeTimer = setTimeout(() => {
        routeTimer = null;
        updateAllTurns();
      }, 300);
    },
    dispose: stop
  });

  function isActive() {
    return !!(ctxRef && ctxRef.state.wordCounterEnabled);
  }

  function startObserver() {
    if (observer || bodyTimer !== null) return;

    const run = () => {
      bodyTimer = null;
      if (!isActive()) return;
      if (!document.body) {
        bodyTimer = setTimeout(run, 100);
        return;
      }

      observer = new MutationObserver((mutations) => {
        if (!isActive()) return;

        const targets = new Set();
        mutations.forEach((mutation) => {
          const target = mutation.target.nodeType === 3 ? mutation.target.parentElement : mutation.target;
          if (isCounterNode(target)) return;
          const changedNodes = [...(mutation.addedNodes || []), ...(mutation.removedNodes || [])];
          if (changedNodes.length && changedNodes.every(isCounterNode)) return;
          const turnSel = window.StudioLab.SELECTORS ? window.StudioLab.SELECTORS.CHAT_TURN : 'ms-chat-turn';
          const turn = target && target.closest ? target.closest(turnSel) : null;
          if (turn) targets.add(turn);
          for (const node of mutation.addedNodes || []) {
            if (node.nodeType !== 1) continue;
            const addedTurn = node.closest?.(turnSel);
            if (addedTurn) targets.add(addedTurn);
            node.querySelectorAll?.(turnSel).forEach(item => targets.add(item));
          }
        });

        targets.forEach(turn => queueTurnUpdate(turn));
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

  function isCounterNode(node) {
    const element = node?.nodeType === 3 ? node.parentElement : node;
    const badge = element?.closest?.('.sl-word-counter');
    return !!(badge && (badge.classList?.contains('sl-word-counter') || badge.className === 'sl-word-counter'));
  }

  function scheduleQueue() {
    if (frameId !== null || !isActive() || (!pendingTurns.size && !priorityTurns.size)) return;
    frameId = requestAnimationFrame(processQueue);
  }

  function queueTurnUpdate(turn) {
    pendingTurns.delete(turn);
    priorityTurns.add(turn);
    scheduleQueue();
  }

  function processQueue() {
    frameId = null;
    if (!isActive()) return;
    let processed = 0;
    while (processed < TURNS_PER_FRAME && (priorityTurns.size || pendingTurns.size)) {
      const queue = priorityTurns.size ? priorityTurns : pendingTurns;
      const turn = queue.values().next().value;
      queue.delete(turn);
      if (turn.isConnected === false) continue;
      updateTurnWordCount(turn);
      processed++;
    }
    scheduleQueue();
  }

  function clearQueue() {
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    pendingTurns.clear();
    priorityTurns.clear();
  }

  function stop() {
    if (observer) observer.disconnect();
    observer = null;
    clearTimeout(bodyTimer);
    bodyTimer = null;
    clearTimeout(routeTimer);
    routeTimer = null;
    clearQueue();
    removeCounters();
  }

  function updateAllTurns() {
    const turnSel = window.StudioLab.SELECTORS ? window.StudioLab.SELECTORS.CHAT_TURN : 'ms-chat-turn';
    const turns = document.querySelectorAll(turnSel);
    for (let index = turns.length - 1; index >= 0; index--) {
      if (!priorityTurns.has(turns[index])) pendingTurns.add(turns[index]);
    }
    if (frameId === null) processQueue();
  }

  function removeCounters() {
    document.querySelectorAll('.sl-word-counter').forEach(element => element.remove());
  }

  function readChunkText(chunk) {
    if (!chunk.childNodes) return chunk.innerText || chunk.textContent || '';
    const parts = [];
    function visit(node) {
      if (node.nodeType === 3) {
        parts.push(node.textContent || '');
        return;
      }
      if (node.nodeType !== 1 || node.hidden || node.style?.display === 'none' || /^(?:SCRIPT|STYLE|TEMPLATE)$/.test(node.tagName)) return;
      const block = TEXT_BLOCK_TAGS.test(node.tagName);
      if (block) parts.push(' ');
      for (const child of node.childNodes) visit(child);
      if (block) parts.push(' ');
    }
    // Reading innerText would force layout for turns skipped by content-visibility.
    visit(chunk);
    return parts.join('');
  }

  function updateTurnWordCount(turnNode) {
    if (!isActive()) return;

    // The container retains the role when .author-label is missing.
    const container = turnNode.querySelector('.chat-turn-container');
    if (!container) return;
    const isModel = container.classList.contains('model');
    const isUser = !isModel && (container.classList.contains('user') ||
      container.querySelector('[data-turn-role="User"]'));
    if (!isModel && !isUser) return;

    let header = turnNode.querySelector('.author-label');
    if (!header && isModel) {
      // A preceding thinking turn may own the model's author label.
      const prev = turnNode.previousElementSibling;
      const turnSel = window.StudioLab.SELECTORS ? window.StudioLab.SELECTORS.CHAT_TURN : 'ms-chat-turn';
      if (prev && prev.tagName === turnSel.toUpperCase()) {
        header = prev.querySelector('.author-label');
      }
    }
    if (!header) return;

    const next = turnNode.nextElementSibling;
    if (isModel && next?.matches?.('ms-chat-turn') && !next.querySelector('.author-label') &&
        next.querySelector('.chat-turn-container')?.classList.contains('model')) {
      // The following answer owns the label shared with its thinking turn.
      if (!header.querySelector('.sl-word-counter')) queueTurnUpdate(next);
      return;
    }

    const textSel = window.StudioLab.SELECTORS ? window.StudioLab.SELECTORS.TEXT_CHUNK : 'ms-text-chunk';
    const textChunks = turnNode.querySelectorAll(textSel);
    const parts = [];
    textChunks.forEach(chunk => {
      // Native ms-prompt-chunk.text-chunk can wrap ms-text-chunk. Count only
      // the innermost matching chunk so the wrapper's text is not duplicated.
      if (chunk.querySelector?.(textSel)) return;
      const t = readChunkText(chunk);
      if (t) parts.push(t);
    });
    let text = parts.join('\n');

    const trimmed = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

    const wordsCount = trimmed ? trimmed.split(/\s+/).length : 0;
    // Include normalized spaces to match the Word Counter extension.
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

    let wordsElement = badge.querySelector('.sl-word-counter-words');
    let charsElement = badge.querySelector('.sl-word-counter-chars');
    if (!wordsElement || !charsElement) {
      // Migrate older text-only badges without leaving a literal bullet in copied text.
      badge.textContent = '';
      wordsElement = document.createElement('span');
      wordsElement.className = 'sl-word-counter-words';
      charsElement = document.createElement('span');
      charsElement.className = 'sl-word-counter-chars';
      badge.append(wordsElement, charsElement);
    }

    const newContent = `${wordsCount}:${charsCount}`;
    if (badge.getAttribute('data-content') !== newContent) {
      badge.setAttribute('data-content', newContent);
      wordsElement.textContent = `${wordsCount} words`;
      charsElement.textContent = `${charsCount} chars`;
    }
  }
})();
