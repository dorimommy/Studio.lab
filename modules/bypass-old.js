/**
 * StudioLab module: bypass-old
 *
 * Legacy DOM restore fallback. It watches the last rendered turn, remembers a
 * fresh markdown snapshot, and writes it back through AI Studio's edit UI when
 * the blocked-state DOM appears.
 */
(function () {
  'use strict';

  if (!window.StudioLab || typeof window.StudioLab.registerModule !== 'function') return;

  const CAPTURE_EVENT = '__aisu_xhrCapture';
  const FRESHNESS_WINDOW = 15000;

  let ctxRef = null;
  let latestMarkdown = '';
  let latestSaveTime = 0;
  let restoredTurnIds = new Set();
  let isRestoring = false;
  let sseBuffer = '';
  let sseSaveTime = 0;
  let observer = null;

  window.addEventListener(CAPTURE_EVENT, (event) => {
    const text = event.detail && event.detail.text ? event.detail.text : '';
    sseBuffer = text;
    sseSaveTime = event.detail && event.detail.ts ? event.detail.ts : Date.now();
    console.log(
      `%c[StudioLab] XHR snap: ${text.length} chars (trigger: ${event.detail && event.detail.trigger})`,
      'color:#4fc3f7'
    );
  });

  window.StudioLab.registerModule({
    id: 'bypass-old',
    group: 'bypass',
    order: 20,
    title: 'Restore (Legacy)',
    subtitle: 'mutation-observer-restoration',
    icon: 'history',
    modeKey: 'bypassMode',
    modeValue: 'dom',
    enabledKey: 'bypassEnabled',
    defaults: {
      bypassMode: 'angular'
    },
    details: [
      { icon: 'visibility', text: 'Monitors the rendered DOM for blocked output states.' },
      { icon: 'edit', text: 'Restores fresh text through the native Edit and Save controls.' }
    ],
    init(ctx) {
      ctxRef = ctx;
      startObserver();
    },
    onRouteChange() {
      latestMarkdown = '';
      latestSaveTime = 0;
      restoredTurnIds = new Set();
      sseBuffer = '';
      sseSaveTime = 0;
      isRestoring = false;
    }
  });

  function isActive() {
    const state = ctxRef && ctxRef.state;
    return !!(state && state.bypassEnabled && state.bypassMode === 'dom');
  }

  function startObserver() {
    if (observer) return;

    const run = () => {
      if (!document.body) {
        setTimeout(run, 100);
        return;
      }

      observer = new MutationObserver(handleMutations);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
      });
    };

    run();
  }

  function handleMutations() {
    if (isRestoring || !isActive()) return;

    const turnContainers = document.querySelectorAll('.turn-content');
    if (!turnContainers.length) return;

    const currentTurn = turnContainers[turnContainers.length - 1];
    const chatTurn = currentTurn.closest('ms-chat-turn');
    const turnId = chatTurn ? chatTurn.id : null;
    const warningIcon = currentTurn.querySelector('span.material-symbols-outlined');
    const isBlocked = warningIcon && warningIcon.textContent.includes('warning');

    if (!isBlocked) {
      rememberLatestMarkdown(currentTurn);
      return;
    }

    restoreBlockedTurn(currentTurn, turnId);
  }

  function rememberLatestMarkdown(currentTurn) {
    const textChunk = currentTurn.querySelector('.text-chunk');
    if (!textChunk) return;

    const cmarkNode = textChunk.querySelector('ms-cmark-node.cmark-node');
    const hasOnlyThoughts = !!textChunk.querySelector('ms-thought-chunk') &&
      !textChunk.querySelector('ms-text-chunk > ms-cmark-node');
    if (!cmarkNode || hasOnlyThoughts) return;

    const markdown = domToMarkdown(textChunk);
    const isFlattenedThoughts = markdown.includes('Expand to view model thoughts') ||
      markdown.includes('gstatic.com/aistudio/watermark') ||
      markdown.includes('chevron_right');

    if (!isFlattenedThoughts) {
      latestMarkdown = markdown;
      latestSaveTime = Date.now();
    }
  }

  function restoreBlockedTurn(currentTurn, turnId) {
    const textChunk = currentTurn.querySelector('.text-chunk');
    const isThoughtsOnlyBlock = textChunk &&
      !!textChunk.querySelector('ms-thought-chunk') &&
      !textChunk.querySelector('ms-text-chunk > ms-cmark-node');
    if (isThoughtsOnlyBlock) return;

    if (turnId && restoredTurnIds.has(turnId)) return;

    const now = Date.now();
    const domFresh = !!latestMarkdown && (now - latestSaveTime) < FRESHNESS_WINDOW;
    const sseFresh = !!sseBuffer && (now - sseSaveTime) < FRESHNESS_WINDOW;
    const useSSE = (!domFresh || latestMarkdown.length < 60) && sseFresh;
    const markdown = useSSE ? sseBuffer : (domFresh ? latestMarkdown : null);

    if (!markdown) return;

    latestMarkdown = '';
    sseBuffer = '';
    isRestoring = true;
    if (turnId) restoredTurnIds.add(turnId);

    restoreViaEdit(currentTurn, markdown);
    setTimeout(() => {
      isRestoring = false;
    }, 5000);
  }

  function domToMarkdown(rootElement) {
    function collectListItems(listNode) {
      const items = [];
      const search = (parent) => {
        for (const child of parent.children) {
          const tag = child.tagName.toLowerCase();
          if (tag === 'li') items.push(child);
          else if (tag !== 'ol' && tag !== 'ul') search(child);
        }
      };
      search(listNode);
      return items;
    }

    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent;
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      if (node.classList && node.classList.contains('author-label')) return '';

      const tag = node.tagName.toLowerCase();
      const style = node.getAttribute('style') || '';
      const children = () => Array.from(node.childNodes).map(walk).join('');

      switch (tag) {
        case 'h1': return `# ${children().trim()}\n\n`;
        case 'h2': return `## ${children().trim()}\n\n`;
        case 'h3': return `### ${children().trim()}\n\n`;
        case 'h4': return `#### ${children().trim()}\n\n`;
        case 'h5': return `##### ${children().trim()}\n\n`;
        case 'h6': return `###### ${children().trim()}\n\n`;
        case 'strong':
        case 'b': return `**${children()}**`;
        case 'em':
        case 'i': return `*${children()}*`;
        case 's':
        case 'del': return `~~${children()}~~`;
        case 'code': {
          if (node.parentElement && node.parentElement.tagName.toLowerCase() === 'pre') {
            return node.textContent;
          }
          return '`' + node.textContent + '`';
        }
        case 'pre': {
          const codeElement = node.querySelector('code');
          const langMatch = codeElement ? codeElement.className.match(/language-(\S+)/) : null;
          const lang = langMatch ? langMatch[1] : '';
          const code = codeElement ? codeElement.textContent : node.textContent;
          return '```' + lang + '\n' + code + '\n```\n\n';
        }
        case 'blockquote': return children().split('\n').map(line => `> ${line}`).join('\n') + '\n\n';
        case 'ul': {
          const items = collectListItems(node);
          return items.map((li) => {
            const content = walk(li).replace(/^\n+/, '').replace(/\n+$/, '');
            return `- ${content.replace(/\n/g, '\n  ')}`;
          }).join('\n') + '\n\n';
        }
        case 'ol': {
          const items = collectListItems(node);
          return items.map((li, index) => {
            const content = walk(li).replace(/^\n+/, '').replace(/\n+$/, '');
            const prefix = `${index + 1}. `;
            return `${prefix}${content.replace(/\n/g, '\n' + ' '.repeat(prefix.length))}`;
          }).join('\n') + '\n\n';
        }
        case 'li': return children();
        case 'a': {
          const href = node.getAttribute('href') || '';
          return href ? `[${children()}](${href})` : children();
        }
        case 'img': return `![${node.getAttribute('alt') || ''}](${node.getAttribute('src') || ''})`;
        case 'hr': return '---\n\n';
        case 'br': return '\n';
        case 'p': return `${children()}\n\n`;
        case 'table': return tableToMarkdown(node, children);
        case 'span': {
          let content = children();
          if (/font-weight\s*:\s*(bold|[7-9]\d{2})/.test(style)) content = `**${content}**`;
          if (/font-style\s*:\s*italic/.test(style)) content = `*${content}*`;
          if (/text-decoration[^:]*:\s*[^;]*line-through/.test(style)) content = `~~${content}~~`;
          return content;
        }
        case 'ms-thought-chunk': return '';
        default: return children();
      }
    }

    return walk(rootElement).replace(/\n{3,}/g, '\n\n').trim();
  }

  function tableToMarkdown(node, fallback) {
    const rows = Array.from(node.querySelectorAll('tr'));
    if (!rows.length) return fallback();

    const format = row => '| ' + Array.from(row.querySelectorAll('th,td'))
      .map(cell => cell.innerText.replace(/\n/g, ' '))
      .join(' | ') + ' |';
    const head = format(rows[0]);
    const sep = '| ' + Array.from(rows[0].querySelectorAll('th,td')).map(() => '---').join(' | ') + ' |';
    return `${head}\n${sep}\n${rows.slice(1).map(format).join('\n')}\n\n`;
  }

  function restoreViaEdit(turnContentElement, markdown) {
    const container = turnContentElement.closest('.chat-turn-container');
    if (!container) return;

    const editButton = container.querySelector('button.toggle-edit-button');
    if (!editButton) return;

    editButton.click();

    let attempts = 0;
    const maxAttempts = 30;

    const waitForTextarea = () => {
      attempts++;
      const textarea = container.querySelector('ms-autosize-textarea textarea');

      if (!textarea) {
        if (attempts < maxAttempts) setTimeout(waitForTextarea, 100);
        return;
      }

      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      nativeSetter.call(textarea, markdown);

      const autosizeElement = container.querySelector('ms-autosize-textarea');
      if (autosizeElement) autosizeElement.setAttribute('data-value', markdown);

      textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      textarea.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));

      setTimeout(() => {
        const saveButton = container.querySelector('button.toggle-edit-button');
        if (saveButton) saveButton.click();
      }, 500);
    };

    waitForTextarea();
  }
})();
