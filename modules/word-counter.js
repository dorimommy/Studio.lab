(function () {
  'use strict';

  if (!window.StudioLab || typeof window.StudioLab.registerModule !== 'function') return;
  const { $, $$, el, observe } = window.StudioLabCore;

  let ctxRef = null;
  let disposeObserver = null;
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
      window.addEventListener('__sl_languageChanged', () => {
        if (isActive()) updateAllTurns();
      });
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
    if (disposeObserver || bodyTimer !== null) return;

    const run = () => {
      bodyTimer = null;
      if (!isActive()) return;
      if (!document.body) {
        bodyTimer = setTimeout(run, 100);
        return;
      }

      disposeObserver = observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
      }, (mutations) => {
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
            $$(turnSel, node).forEach(item => targets.add(item));
          }
        });

        targets.forEach(turn => queueTurnUpdate(turn));
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
    if (disposeObserver) {
      disposeObserver();
      disposeObserver = null;
    }
    clearTimeout(bodyTimer);
    bodyTimer = null;
    clearTimeout(routeTimer);
    routeTimer = null;
    clearQueue();
    removeCounters();
  }

  function updateAllTurns() {
    const turnSel = window.StudioLab.SELECTORS ? window.StudioLab.SELECTORS.CHAT_TURN : 'ms-chat-turn';
    const turns = $$(turnSel);
    for (let index = turns.length - 1; index >= 0; index--) {
      if (!priorityTurns.has(turns[index])) pendingTurns.add(turns[index]);
    }
    if (frameId === null) processQueue();
  }

  function removeCounters() {
    $$('.sl-word-counter').forEach(element => element.remove());
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
    const container = $('.chat-turn-container', turnNode);
    if (!container) return;
    const isModel = container.classList.contains('model');
    const isUser = !isModel && (container.classList.contains('user') ||
      $('[data-turn-role="User"]', container));
    if (!isModel && !isUser) return;

    let header = $('.author-label', turnNode);
    if (!header && isModel) {
      // A preceding thinking turn may own the model's author label.
      const prev = turnNode.previousElementSibling;
      const turnSel = window.StudioLab.SELECTORS ? window.StudioLab.SELECTORS.CHAT_TURN : 'ms-chat-turn';
      if (prev && prev.tagName === turnSel.toUpperCase()) {
        header = $('.author-label', prev);
      }
    }
    if (!header) return;

    const next = turnNode.nextElementSibling;
    if (isModel && next?.matches?.('ms-chat-turn') && !$('.author-label', next) &&
        $('.chat-turn-container', next)?.classList.contains('model')) {
      // The following answer owns the label shared with its thinking turn.
      if (!$('.sl-word-counter', header)) queueTurnUpdate(next);
      return;
    }

    const textSel = window.StudioLab.SELECTORS ? window.StudioLab.SELECTORS.TEXT_CHUNK : 'ms-text-chunk';
    const textChunks = $$(textSel, turnNode);
    const parts = [];
    textChunks.forEach(chunk => {
      // Native ms-prompt-chunk.text-chunk can wrap ms-text-chunk. Count only
      // the innermost matching chunk so the wrapper's text is not duplicated.
      if ($(textSel, chunk)) return;
      const t = readChunkText(chunk);
      if (t) parts.push(t);
    });
    let text = parts.join('\n');

    const trimmed = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

    const wordsCount = trimmed ? trimmed.split(/\s+/).length : 0;
    // Include normalized spaces to match the Word Counter extension.
    const charsCount = trimmed.length;

    if (wordsCount === 0 && charsCount === 0) {
      const existing = $('.sl-word-counter', header);
      if (existing) existing.remove();
      return;
    }

    let badge = $('.sl-word-counter', header);
    if (!badge) {
      badge = el('<span class="sl-word-counter"></span>');
      header.appendChild(badge);
    }

    let wordsElement = $('.sl-word-counter-words', badge);
    let charsElement = $('.sl-word-counter-chars', badge);
    if (!wordsElement || !charsElement) {
      // Migrate older text-only badges without leaving a literal bullet in copied text.
      badge.textContent = '';
      wordsElement = el('<span class="sl-word-counter-words"></span>');
      charsElement = el('<span class="sl-word-counter-chars"></span>');
      badge.append(wordsElement, charsElement);
    }

    const t = (key, fb) => window.StudioLab?.i18n?.t ? window.StudioLab.i18n.t(key, fb || key) : (fb || key);
    const wordsLabel = t('edit_modal_words', 'words');
    const charsLabel = t('edit_modal_chars', 'chars');
    const newContent = `${wordsCount}:${charsCount}:${wordsLabel}:${charsLabel}`;
    if (badge.getAttribute('data-content') !== newContent) {
      badge.setAttribute('data-content', newContent);
      wordsElement.textContent = `${wordsCount} ${wordsLabel}`;
      charsElement.textContent = `${charsCount} ${charsLabel}`;
    }
  }
})();
