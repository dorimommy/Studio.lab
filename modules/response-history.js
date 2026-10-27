// Multiple Response Options (<X/Y> response history switcher) and Rerun Button Icon replacement
// Ported from Your Aistu Chan to Studio.lab Tools.
(function () {
  'use strict';

  if (!window.StudioLab || typeof window.StudioLab.registerModule !== 'function') return;

  let ctxRef = null;
  let observer = null;
  let globalListenersAttached = false;
  const turnHistoryMap = new Map();
  let lastPromptId = '';
  let lastUserTurnsCount = 0;

  const RELOAD_ARROW_SVG_PATHS = `
    <path d="M23 4v6h-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"></path>
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"></path>
  `;

  function isMultipleResponseEnabled() {
    if (!ctxRef || !ctxRef.state) return true;
    return ctxRef.state.multipleResponseEnabled !== false;
  }

  function t(key, fallback) {
    return window.StudioLab?.i18n?.t ? window.StudioLab.i18n.t(key, fallback || key) : (fallback || key);
  }

  function optimizeRerunButtons() {
    const rerunButtons = document.querySelectorAll(
      'button.rerun-button, button[name="rerun-button"], ms-button[name="rerun-button"], [aria-label*="Rerun" i]'
    );
    rerunButtons.forEach(btn => {
      if (btn.dataset.aipoPatched === 'true') return;
      btn.dataset.aipoPatched = 'true';

      let svg = btn.querySelector('svg');
      if (svg) {
        svg.innerHTML = RELOAD_ARROW_SVG_PATHS;
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '16');
        svg.setAttribute('height', '16');
        svg.style.width = '16px';
        svg.style.height = '16px';
        svg.style.display = 'block';

        const defs = svg.querySelector('defs');
        if (defs) defs.remove();
        const g = svg.querySelector('g');
        if (g) g.removeAttribute('clip-path');
      } else {
        const iconEl = btn.querySelector('.material-symbols-outlined, mat-icon, .google-symbols');
        const newSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        newSvg.setAttribute('viewBox', '0 0 24 24');
        newSvg.setAttribute('width', '16');
        newSvg.setAttribute('height', '16');
        newSvg.style.cssText = 'width: 16px !important; height: 16px !important; display: block !important;';
        newSvg.innerHTML = RELOAD_ARROW_SVG_PATHS;
        if (iconEl) {
          iconEl.textContent = '';
          iconEl.style.cssText = 'display: inline-flex !important; align-items: center !important; justify-content: center !important; width: 18px !important; height: 18px !important;';
          iconEl.appendChild(newSvg);
        } else {
          btn.appendChild(newSvg);
        }
      }
    });
  }

  function findInputArea() {
    const selectors = [
      'ms-prompt-input textarea',
      'ms-prompt-box textarea',
      'textarea[placeholder*="prompt" i]',
      'textarea[aria-label*="prompt" i]',
      'div[contenteditable="true"][aria-label*="prompt" i]',
      'textarea'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function getDraftValue(el) {
    if (!el) return '';
    return el.value !== undefined ? el.value : (el.innerText || el.textContent || '');
  }

  function getCanonicalTurnElement(el) {
    if (!el) return null;
    const msTurn = el.closest('ms-chat-turn');
    if (msTurn) return msTurn;
    const container = el.closest('.chat-turn-container, .chat-turn');
    return container || el;
  }

  const STEALTH_SUGGEST_REQ_TAG = '[[SL_HIDDEN_SUGGEST_REQ]]';
  const STEALTH_SUGGEST_START_TAG = '[[SL_SUGGEST_START]]';
  const STEALTH_SUGGEST_END_TAG = '[[SL_SUGGEST_END]]';
  const STEALTH_IMPROVE_REQ_TAG = '[[SL_HIDDEN_IMPROVE_REQ]]';

  let isSendingStealthMessage = false;
  let activeImproveSession = null;

  function isStealthTurnElement(el) {
    if (!el) return false;
    const canonical = getCanonicalTurnElement(el) || el;
    if (
      canonical.dataset?.aistuStealthTurn === 'true' ||
      canonical.dataset?.aistuStealthThought === 'true' ||
      canonical.getAttribute?.('data-aistu-stealth-turn') === 'true' ||
      canonical.getAttribute?.('data-aistu-stealth-thought') === 'true'
    ) {
      return true;
    }
    const rawText = canonical.textContent || '';
    if (
      rawText.includes(STEALTH_SUGGEST_REQ_TAG) ||
      rawText.includes(STEALTH_SUGGEST_START_TAG) ||
      rawText.includes(STEALTH_SUGGEST_END_TAG) ||
      rawText.includes(STEALTH_IMPROVE_REQ_TAG)
    ) {
      canonical.dataset.aistuStealthTurn = 'true';
      canonical.setAttribute('data-aistu-stealth-turn', 'true');
      return true;
    }
    return false;
  }

  function markTurnAsStealth(turnEl, isThought = false) {
    if (!turnEl) return;
    const canonical = getCanonicalTurnElement(turnEl) || turnEl;
    canonical.dataset.aistuStealthTurn = 'true';
    canonical.setAttribute('data-aistu-stealth-turn', 'true');
    if (isThought) {
      canonical.dataset.aistuStealthThought = 'true';
      canonical.setAttribute('data-aistu-stealth-thought', 'true');
    }
    const inner = canonical.querySelector?.('.chat-turn-container');
    if (inner) {
      inner.dataset.aistuStealthTurn = 'true';
      inner.setAttribute('data-aistu-stealth-turn', 'true');
    }
  }

  function getAllUserTurns() {
    const turns = [];
    document.querySelectorAll('ms-chat-turn, .chat-turn-container, [data-turn-role], .chat-turn').forEach(el => {
      const isUser = el.getAttribute('data-turn-role')?.toLowerCase() === 'user' ||
                     el.querySelector('[data-turn-role="User" i]') !== null ||
                     el.classList.contains('user');
      if (isUser) {
        const container = getCanonicalTurnElement(el);
        if (container && !isStealthTurnElement(container) && !turns.includes(container)) {
          turns.push(container);
        }
      }
    });
    return turns;
  }

  function handleUserSentNewMessage() {
    if (isSendingStealthMessage || activeImproveSession) return;
    document.querySelectorAll('[data-aistu-turn-id]').forEach(el => {
      el.removeAttribute('data-aistu-turn-id');
      delete el.dataset.aistuTurnId;
    });
    turnHistoryMap.clear();
  }

  function checkNewUserMessageSent() {
    if (isSendingStealthMessage || activeImproveSession) return;
    const currentUserTurns = getAllUserTurns();
    const currentCount = currentUserTurns.length;
    if (currentCount > lastUserTurnsCount && lastUserTurnsCount > 0) {
      handleUserSentNewMessage();
    }
    lastUserTurnsCount = currentCount;
  }

  function normalizeTextForComparison(text) {
    if (!text) return '';
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  }

  function getEntryMarkdown(entry) {
    if (!entry) return '';
    return typeof entry === 'string' ? entry : (entry.markdown || '');
  }

  function getEntryHtml(entry) {
    if (!entry) return '';
    return typeof entry === 'object' && entry.html ? entry.html : '';
  }

  function createHistoryEntry(markdown, html) {
    return {
      markdown: markdown || '',
      html: html || ''
    };
  }

  function isUserChatTurn(turn) {
    if (!turn) return false;
    return (
      turn.getAttribute?.('data-turn-role')?.toLowerCase() === 'user' ||
      turn.classList?.contains('user') ||
      turn.querySelector?.('[data-turn-role="User" i], .chat-turn-container.user, .user-prompt-container') !== null
    );
  }

  function isThoughtOnlyTurn(turn) {
    if (!turn) return false;
    // Note: Google AI Studio wraps <ms-thought-chunk> inside <ms-prompt-chunk class="text-chunk">
    // and <ms-thought-chunk> itself contains <ms-text-chunk>. Always check live response nodes
    // outside ms-thought-chunk first so a turn that began with a thought block and later received
    // response text is never stuck as thought-only.
    const hasResponseOutsideThought = Array.from(
      turn.querySelectorAll('ms-text-chunk, ms-cmark-node, ms-code-block')
    ).some(el => !el.closest('ms-thought-chunk, .thought-panel, .thought-chunk'));
    if (hasResponseOutsideThought) return false;

    if (turn.getAttribute?.('data-sl-thought-turn') === 'true') return true;
    const hasThought = turn.querySelector('ms-thought-chunk, .thought-panel, .thought-chunk') !== null;
    if (!hasThought && !turn.classList?.contains('thought-activity-host')) return false;
    return true;
  }

  function getModelResponseTarget(turn) {
    if (!turn) return null;
    const outsideTextChunk = Array.from(turn.querySelectorAll('ms-text-chunk'))
      .find(el => !el.closest('ms-thought-chunk, .thought-panel, .thought-chunk'));
    if (outsideTextChunk) return outsideTextChunk;
    const outsidePromptChunk = Array.from(turn.querySelectorAll('ms-prompt-chunk.text-chunk, .text-chunk'))
      .find(el => !el.closest('ms-thought-chunk, .thought-panel, .thought-chunk') && !el.querySelector('ms-thought-chunk'));
    if (outsidePromptChunk) return outsidePromptChunk;
    return turn.querySelector('.turn-content');
  }

  function extractTurnHtml(turn) {
    if (!turn) return '';
    const target = getModelResponseTarget(turn);
    if (!target) return '';
    const cmark = Array.from(target.querySelectorAll('ms-cmark-node, .cmark-node'))
      .find(el => !el.closest('ms-thought-chunk, .thought-panel, .thought-chunk'));
    if (cmark) return cmark.innerHTML || '';
    return target.innerHTML || '';
  }

  function checkPromptIdChange() {
    const match = window.location.pathname.match(/prompts\/([A-Za-z0-9_-]+)/);
    const promptId = match ? match[1] : 'default-prompt';
    if (promptId !== lastPromptId) {
      turnHistoryMap.clear();
      lastPromptId = promptId;
      lastUserTurnsCount = 0;
    }
  }

  function getAllModelTurns() {
    const rawTurns = [];
    document.querySelectorAll('ms-chat-turn, .chat-turn-container, [data-turn-role], .model-prompt-container, .chat-turn').forEach(el => {
      const isModel = el.getAttribute('data-turn-role')?.toLowerCase() === 'model' ||
                      el.querySelector('[data-turn-role="Model" i]') !== null ||
                      el.querySelector('.model-prompt-container') !== null ||
                      el.classList.contains('model') ||
                      el.classList.contains('model-prompt-container');
      if (isModel) {
        const container = getCanonicalTurnElement(el);
        if (container && !isStealthTurnElement(container) && !rawTurns.includes(container)) {
          rawTurns.push(container);
        }
      }
    });

    // Group by turnId so standalone Thought turns do not collide with actual Model response turns
    const grouped = new Map();
    rawTurns.forEach(turn => {
      const id = getTurnId(turn);
      if (!id) return;
      if (!grouped.has(id)) {
        grouped.set(id, []);
      }
      grouped.get(id).push(turn);
    });

    const filteredTurns = [];
    grouped.forEach((groupTurns, id) => {
      const hasThoughtTurn = groupTurns.some(t => isThoughtOnlyTurn(t));
      if (hasThoughtTurn) {
        const historyData = turnHistoryMap.get(id);
        if (historyData && historyData.waitingForNewGeneration) {
          historyData.sawClearOrThink = true;
        }
      }
      // Strictly exclude Think-only blocks from <X/Y> target turns
      const textTurns = groupTurns.filter(t => !isThoughtOnlyTurn(t));
      if (textTurns.length > 0) {
        filteredTurns.push(textTurns[textTurns.length - 1]);
      }
    });

    return filteredTurns;
  }

  function getTurnId(turn) {
    const container = getCanonicalTurnElement(turn);
    if (!container) return null;

    if (container.dataset.aistuTurnId) {
      return container.dataset.aistuTurnId;
    }

    const allCanonicalTurns = [];
    document.querySelectorAll('ms-chat-turn, .chat-turn-container, .chat-turn').forEach(el => {
      const c = getCanonicalTurnElement(el);
      if (c && !isStealthTurnElement(c) && !allCanonicalTurns.includes(c)) {
        allCanonicalTurns.push(c);
      }
    });

    let userCount = 0;
    for (const t of allCanonicalTurns) {
      if (
        t.getAttribute('data-turn-role')?.toLowerCase() === 'user' ||
        t.classList.contains('user') ||
        t.querySelector('[data-turn-role="User" i], .chat-turn-container.user')
      ) {
        userCount++;
      }
      if (t === container || t.contains(container)) {
        break;
      }
    }

    const stableId = 'model-turn-group-' + userCount;
    container.dataset.aistuTurnId = stableId;
    return stableId;
  }

  function domToMarkdown(rootElement) {
    if (!rootElement) return '';
    function collectListItems(listNode) {
      const items = [];
      const search = parent => {
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

      const tag = node.tagName.toLowerCase();
      const hasClass = cls => node.classList && node.classList.contains(cls);

      if (
        hasClass('author-label') ||
        hasClass('action-bar') ||
        hasClass('actions') ||
        hasClass('turn-footer') ||
        hasClass('turn-actions') ||
        hasClass('material-symbols-outlined') ||
        hasClass('google-symbols') ||
        hasClass('material-icons') ||
        tag === 'button' ||
        tag === 'ms-button' ||
        tag === 'mat-icon' ||
        tag === 'ms-chat-turn-actions' ||
        tag === 'ms-thought-chunk' ||
        tag === 'ms-file-chunk' ||
        tag === 'ms-image-chunk' ||
        tag === 'ms-video-chunk' ||
        tag === 'ms-audio-chunk' ||
        (node.className && typeof node.className === 'string' && (
          node.className.includes('aistu-') ||
          node.className.includes('action') ||
          node.className.includes('sl-word-counter') ||
          node.className.includes('sl-rp-')
        ))
      ) {
        return '';
      }

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
          return items.map(li => {
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
        case 'table': {
          const rows = Array.from(node.querySelectorAll('tr'));
          if (!rows.length) return children();
          const format = row => '| ' + Array.from(row.querySelectorAll('th,td'))
            .map(cell => cell.innerText.replace(/\n/g, ' '))
            .join(' | ') + ' |';
          const head = format(rows[0]);
          const sep = '| ' + Array.from(rows[0].querySelectorAll('th,td')).map(() => '---').join(' | ') + ' |';
          return `${head}\n${sep}\n${rows.slice(1).map(format).join('\n')}\n\n`;
        }
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

  function formatMarkdownToHtml(markdown) {
    if (!markdown) return '';
    let html = markdown
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    html = html.replace(/```([a-zA-Z0-9_\-+]*)\n([\s\S]*?)\n```/g, (match, lang, code) => {
      return `<pre><code class="language-${lang || 'text'}">${code.trim()}</code></pre>`;
    });
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    const paragraphs = html.split(/\n\n+/);
    html = paragraphs.map(p => {
      if (p.trim().startsWith('<pre>')) return p;
      return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    }).join('');
    return html;
  }

  function findEditButton(searchArea) {
    const btn = searchArea.querySelector('button.toggle-edit-button, [aria-label="Edit"], [aria-label*="Edit" i], [aria-label*="Chỉnh sửa" i], [aria-label*="Sửa" i]');
    if (btn) return btn;

    const buttons = searchArea.querySelectorAll('button, ms-button, .toggle-edit-button');
    for (const b of buttons) {
      const ariaLabel = (b.getAttribute('aria-label') || '').toLowerCase();
      if (ariaLabel.includes('edit') || ariaLabel.includes('chỉnh sửa') || ariaLabel.includes('sửa')) return b;
      const text = (b.textContent || '').toLowerCase().trim();
      if (text === 'edit' || text === 'chỉnh sửa' || text === 'sửa') return b;
      const icon = b.querySelector('.material-symbols-outlined, mat-icon');
      if (icon) {
        const iconText = (icon.textContent || '').toLowerCase().trim();
        if (iconText === 'edit' || iconText === 'edit_note' || iconText === 'create') return b;
      }
    }
    return null;
  }

  function findSaveButton(searchArea) {
    const btn = searchArea.querySelector('[aria-label*="done" i], [aria-label*="Save" i], [aria-label*="Stop" i], [aria-label*="Lưu" i], [aria-label*="Hoàn tất" i], [aria-label*="Xong" i]');
    if (btn) return btn;

    const buttons = searchArea.querySelectorAll('button, ms-button, .button-row button');
    for (const b of buttons) {
      const text = (b.textContent || '').toLowerCase().trim();
      if (text.includes('done') || text.includes('save') || text.includes('lưu') || text.includes('hoàn tất') || text.includes('xong')) return b;
      const aria = (b.getAttribute('aria-label') || '').toLowerCase();
      if (aria.includes('done') || aria.includes('save') || aria.includes('lưu') || aria.includes('hoàn tất') || aria.includes('xong') || aria.includes('stop')) return b;
      const icon = b.querySelector('.material-symbols-outlined, mat-icon');
      if (icon) {
        const iconText = (icon.textContent || '').toLowerCase().trim();
        if (iconText === 'done' || iconText === 'done_all' || iconText === 'save' || iconText === 'check') return b;
      }
    }
    return searchArea.querySelector('button.toggle-edit-button') || null;
  }

  function findOptionsMenuButton(searchArea) {
    const actionsContainer = searchArea.querySelector('.actions, [class*="actions"]');
    let btn = null;
    if (actionsContainer) {
      const buttons = Array.from(actionsContainer.querySelectorAll('button, ms-button'));
      btn = buttons.find(b => {
        const text = b.textContent || '';
        return text.includes('more_vert') ||
               b.querySelector('mat-icon')?.textContent?.includes('more_vert') ||
               b.querySelector('.material-symbols-outlined')?.textContent?.includes('more_vert');
      });
    }
    if (!btn) {
      const allButtons = Array.from(searchArea.querySelectorAll('button'));
      btn = allButtons.find(b => {
        const text = b.textContent || '';
        return text.includes('more_vert') ||
               b.getAttribute('aria-label')?.toLowerCase().includes('more') ||
               b.getAttribute('aria-label')?.toLowerCase().includes('actions');
      });
    }
    return btn;
  }

  async function triggerNativeEditMode(searchArea) {
    const optionsMenuBtn = findOptionsMenuButton(searchArea);
    if (!optionsMenuBtn) return false;

    optionsMenuBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true }));
    optionsMenuBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 40));

    optionsMenuBtn.click();
    await new Promise(resolve => setTimeout(resolve, 140));

    const menuItems = Array.from(document.querySelectorAll('.mat-mdc-menu-item, [role="menuitem"], button[mat-menu-item], .mat-menu-item'));
    const editOption = menuItems.find(item => {
      const text = (item.textContent || '').toLowerCase().trim();
      return text.includes('edit') || text.includes('chỉnh sửa') || text.includes('sửa');
    });

    if (!editOption) {
      document.body.click();
      return false;
    }

    editOption.click();
    await new Promise(resolve => setTimeout(resolve, 100));
    return true;
  }

  function triggerHoverAndFindButton(searchArea, findFn, maxTime = 90) {
    return new Promise(resolve => {
      let btn = findFn(searchArea);
      if (btn) {
        resolve(btn);
        return;
      }

      const targetTurn = getCanonicalTurnElement(searchArea) || searchArea;
      targetTurn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true }));
      targetTurn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));

      const turnContent = targetTurn.querySelector('.turn-content, .text-chunk, ms-text-chunk');
      if (turnContent) {
        turnContent.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true }));
        turnContent.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
      }

      const startTime = Date.now();
      const check = () => {
        btn = findFn(searchArea);
        if (btn) {
          resolve(btn);
          return;
        }
        if (Date.now() - startTime < maxTime) {
          setTimeout(check, 10);
        } else {
          resolve(null);
        }
      };
      check();
    });
  }

  function visuallySwapTurnText(container, htmlContent) {
    return new Promise(resolve => {
      const responseRoot = getModelResponseTarget(container) || container;
      let target = Array.from(responseRoot.querySelectorAll('ms-cmark-node, .cmark-node'))
        .find(el => !el.closest('ms-thought-chunk, .thought-panel, .thought-chunk')) ||
        Array.from(responseRoot.querySelectorAll('[mssnapshotlink], ms-text-chunk'))
          .find(el => !el.closest('ms-thought-chunk, .thought-panel, .thought-chunk')) ||
        responseRoot;

      if (target) {
        const isCmark = target.tagName.toLowerCase().includes('cmark') || target.classList.contains('cmark-node');
        if (isCmark) {
          target.innerHTML = htmlContent;
        } else {
          target.innerHTML = `<ms-cmark-node class="cmark-node v3-font-body" style="display: block; width: 100%;">${htmlContent}</ms-cmark-node>`;
        }
        resolve(true);
      } else {
        resolve(false);
      }
    });
  }

  function visuallySwapTurnContent(container, entry) {
    const markdown = getEntryMarkdown(entry);
    const savedHtml = getEntryHtml(entry);
    const htmlContent = savedHtml || formatMarkdownToHtml(markdown);
    return visuallySwapTurnText(container, htmlContent);
  }

  function swapTurnText(container, markdown, fallbackEntry) {
    return new Promise(resolve => {
      const searchArea = getCanonicalTurnElement(container) || container;
      const innerContainer = searchArea.querySelector('.chat-turn-container') || searchArea;

      const applySilentClass = () => {
        searchArea._aistuProgrammaticEdit = true;
        innerContainer._aistuProgrammaticEdit = true;
        searchArea.classList.add('aistu-editing-silent');
        innerContainer.classList.add('aistu-editing-silent');
      };
      const removeSilentClass = () => {
        searchArea._aistuProgrammaticEdit = false;
        innerContainer._aistuProgrammaticEdit = false;
        searchArea.classList.remove('aistu-editing-silent');
        innerContainer.classList.remove('aistu-editing-silent');
      };

      const injectIntoTextareaAndSave = textarea => {
        try {
          const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
          if (nativeSetter) {
            if (textarea.value === markdown) {
              nativeSetter.call(textarea, markdown + ' ');
              textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            }
            nativeSetter.call(textarea, markdown);
          } else {
            textarea.value = markdown;
          }
        } catch (_) {
          textarea.value = markdown;
        }

        const autosizeElement = searchArea.querySelector('ms-autosize-textarea');
        if (autosizeElement) autosizeElement.setAttribute('data-value', markdown);

        textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        textarea.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));

        setTimeout(() => {
          triggerHoverAndFindButton(searchArea, findSaveButton, 80).then(saveButton => {
            if (saveButton) {
              saveButton.click();
            } else {
              const fallbackBtn = findEditButton(searchArea);
              if (fallbackBtn) fallbackBtn.click();
            }

            let closeChecks = 0;
            const waitForClose = () => {
              closeChecks++;
              if (!searchArea.querySelector('textarea') || closeChecks >= 10) {
                removeSilentClass();
                resolve(true);
              } else {
                setTimeout(waitForClose, 20);
              }
            };
            setTimeout(waitForClose, 30);
          });
        }, 90);
      };

      // If textarea is already open from a rapid consecutive click, reuse it directly
      const existingTextarea = searchArea.querySelector('ms-autosize-textarea textarea, textarea');
      if (existingTextarea) {
        applySilentClass();
        injectIntoTextareaAndSave(existingTextarea);
        return;
      }

      triggerHoverAndFindButton(searchArea, findEditButton, 80).then(async editButton => {
        applySilentClass();
        let startedEdit = false;
        if (editButton) {
          editButton.click();
          startedEdit = true;
        } else {
          startedEdit = await triggerNativeEditMode(searchArea);
        }

        if (!startedEdit) {
          removeSilentClass();
          visuallySwapTurnContent(container, fallbackEntry || markdown).then(resolve);
          return;
        }

        let attempts = 0;
        const maxAttempts = 30;

        const waitForTextarea = () => {
          attempts++;
          const textarea = searchArea.querySelector('ms-autosize-textarea textarea, textarea');

          if (!textarea) {
            if (attempts < maxAttempts) {
              setTimeout(waitForTextarea, 15);
            } else {
              removeSilentClass();
              visuallySwapTurnContent(container, fallbackEntry || markdown).then(resolve);
            }
            return;
          }

          injectIntoTextareaAndSave(textarea);
        };

        waitForTextarea();
      });
    });
  }

  function extractTurnMarkdownForEdit(turn) {
    if (!turn) return '';
    const textTarget =
      turn.querySelector('.text-chunk, ms-text-chunk') ||
      turn.querySelector('ms-prompt-chunk') ||
      turn.querySelector('.turn-content') ||
      turn;
    const md = domToMarkdown(textTarget);
    if (md) return md;
    return (textTarget.innerText || textTarget.textContent || '').trim();
  }

  function isUserChatTurn(turn) {
    if (!turn) return false;
    return (
      turn.getAttribute('data-turn-role')?.toLowerCase() === 'user' ||
      turn.classList.contains('user') ||
      turn.querySelector('[data-turn-role="User" i], .chat-turn-container.user') !== null
    );
  }

  function openMarkdownEditModal(turn) {
    const canonicalTurn = getCanonicalTurnElement(turn) || turn;
    if (!canonicalTurn) return;

    // Remove any existing edit modal
    document.querySelectorAll('.aistu-edit-modal-overlay').forEach(el => el.remove());

    const isUser = isUserChatTurn(canonicalTurn);
    const initialMarkdown = extractTurnMarkdownForEdit(canonicalTurn);

    const overlay = document.createElement('div');
    overlay.className = 'aistu-edit-modal-overlay';

    const roleLabel = isUser
      ? t('edit_modal_role_user', 'User')
      : t('edit_modal_role_model', 'Model');
    const modalTitle = t('edit_modal_title', 'Chỉnh sửa nội dung (Markdown)');
    const copyTitle = t('edit_modal_copy_title', 'Sao chép toàn bộ văn bản (Copy all text)');
    const copyLabel = t('edit_modal_copy', 'Sao chép');
    const saveTitle = t('edit_modal_save_title', 'Hoàn tất chỉnh sửa (Ctrl+Enter)');
    const saveLabel = t('edit_modal_save', 'Hoàn tất');
    const cancelTitle = t('edit_modal_cancel_title', 'Huỷ chỉnh sửa (Esc)');
    const placeholderText = t('edit_modal_placeholder', 'Nhập nội dung Markdown...');

    overlay.innerHTML = `
      <div class="aistu-edit-modal-card" role="dialog" aria-modal="true" aria-label="${modalTitle}">
        <div class="aistu-edit-modal-header">
          <div class="aistu-edit-modal-title-group">
            <span class="aistu-edit-modal-role-badge">${roleLabel}</span>
            <h3 class="aistu-edit-modal-title">${modalTitle}</h3>
            <span class="aistu-edit-modal-meta"></span>
          </div>
          <div class="aistu-edit-modal-actions">
            <button type="button" class="aistu-edit-modal-btn aistu-btn-copy" title="${copyTitle}" aria-label="${copyTitle}">
              <svg class="aistu-copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 16px; height: 16px;">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span class="aistu-copy-label">${copyLabel}</span>
            </button>
            <button type="button" class="aistu-edit-modal-btn aistu-btn-save" title="${saveTitle}" aria-label="${saveTitle}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="width: 16px; height: 16px;">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <span>${saveLabel}</span>
            </button>
            <button type="button" class="aistu-edit-modal-btn aistu-btn-cancel" title="${cancelTitle}" aria-label="${cancelTitle}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width: 16px; height: 16px;">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
        <div class="aistu-edit-modal-body">
          <textarea class="aistu-edit-modal-textarea" spellcheck="false" placeholder="${placeholderText}"></textarea>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const textarea = overlay.querySelector('.aistu-edit-modal-textarea');
    const metaEl = overlay.querySelector('.aistu-edit-modal-meta');
    const copyBtn = overlay.querySelector('.aistu-btn-copy');
    const saveBtn = overlay.querySelector('.aistu-btn-save');
    const cancelBtn = overlay.querySelector('.aistu-btn-cancel');

    textarea.value = initialMarkdown;

    const updateMeta = () => {
      const val = textarea.value || '';
      const chars = val.length;
      const words = val.trim() ? val.trim().split(/\s+/).length : 0;
      if (metaEl) {
        metaEl.textContent = `${words} ${t('edit_modal_words', 'từ')} · ${chars} ${t('edit_modal_chars', 'ký tự')}`;
      }
    };
    updateMeta();
    textarea.addEventListener('input', updateMeta);

    const closeModal = () => {
      document.removeEventListener('keydown', onModalKeydown, true);
      overlay.remove();
    };

    const commitSave = async () => {
      const editedMarkdown = textarea.value;
      closeModal();

      if (editedMarkdown === initialMarkdown) return;

      const turnId = !isUser ? getTurnId(canonicalTurn) : null;
      const historyData = turnId ? turnHistoryMap.get(turnId) : null;
      if (historyData) {
        historyData.isSwappingText = true;
      }

      await swapTurnText(canonicalTurn, editedMarkdown);

      if (historyData) {
        const updatedHtml = extractTurnHtml(canonicalTurn);
        historyData.list[historyData.currentIndex] = createHistoryEntry(editedMarkdown, updatedHtml);
        canonicalTurn.dataset.aistuActiveIndex = String(historyData.currentIndex);
        canonicalTurn.dataset.aistuActiveMarkdown = editedMarkdown;
        historyData.isSwappingText = false;
      }
    };

    const onModalKeydown = e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeModal();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        commitSave();
      }
    };
    document.addEventListener('keydown', onModalKeydown, true);

    copyBtn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      const textToCopy = textarea.value || '';
      navigator.clipboard.writeText(textToCopy).then(() => {
        const labelEl = copyBtn.querySelector('.aistu-copy-label');
        const iconEl = copyBtn.querySelector('.aistu-copy-icon');
        if (labelEl) labelEl.textContent = t('edit_modal_copied', 'Đã chép');
        if (iconEl) {
          iconEl.innerHTML = `<polyline points="20 6 9 17 4 12"></polyline>`;
        }
        setTimeout(() => {
          if (labelEl) labelEl.textContent = t('edit_modal_copy', 'Sao chép');
          if (iconEl) {
            iconEl.innerHTML = `
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            `;
          }
        }, 1400);
      });
    });

    saveBtn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      commitSave();
    });

    cancelBtn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      closeModal();
    });

    overlay.addEventListener('click', e => {
      if (e.target === overlay) {
        closeModal();
      }
    });

    requestAnimationFrame(() => {
      textarea.focus();
    });
  }

  function clearTurnAnimationTimers(turn) {
    if (turn && Array.isArray(turn._aistuAnimTimers)) {
      turn._aistuAnimTimers.forEach(t => clearTimeout(t));
      turn._aistuAnimTimers = [];
    }
  }

  async function animateAndSwap(turn, targetEntry, direction, targetIndex, historyData) {
    const canonicalTurn = getCanonicalTurnElement(turn) || turn;
    clearTurnAnimationTimers(canonicalTurn);

    const swapToken = (canonicalTurn._aistuSwapToken || 0) + 1;
    canonicalTurn._aistuSwapToken = swapToken;

    const targetMarkdown = getEntryMarkdown(targetEntry);
    const turnContent = canonicalTurn.querySelector('.turn-content');
    const outClass = direction === 'next' ? 'aistu-slide-left-out' : 'aistu-slide-right-out';
    const inClass = direction === 'next' ? 'aistu-slide-left-in' : 'aistu-slide-right-in';
    const allAnimClasses = [
      'aistu-slide-left-out',
      'aistu-slide-left-in',
      'aistu-slide-right-out',
      'aistu-slide-right-in'
    ];

    if (!turnContent) {
      await swapTurnText(canonicalTurn, targetMarkdown, targetEntry);
      if (canonicalTurn._aistuSwapToken === swapToken) {
        canonicalTurn.dataset.aistuActiveIndex = String(targetIndex);
        canonicalTurn.dataset.aistuActiveMarkdown = targetMarkdown;
        if (historyData) historyData.isSwappingText = false;
      }
      return;
    }

    // Reset any in-flight animation classes and force reflow so rapid clicks always animate cleanly
    turnContent.classList.remove(...allAnimClasses);
    turnContent.style.opacity = '';
    void turnContent.offsetWidth;

    // Phase 1: Swipe out + Fade out (165ms)
    turnContent.classList.add(outClass);
    await new Promise(resolve => {
      const t = setTimeout(resolve, 165);
      canonicalTurn._aistuAnimTimers = [t];
    });

    if (canonicalTurn._aistuSwapToken !== swapToken) return;

    turnContent.style.opacity = '0';

    // Real text mutation in AI Studio via native Edit mode (swapTurnText)
    await swapTurnText(canonicalTurn, targetMarkdown, targetEntry);

    if (canonicalTurn._aistuSwapToken !== swapToken) return;

    canonicalTurn.dataset.aistuActiveIndex = String(targetIndex);
    canonicalTurn.dataset.aistuActiveMarkdown = targetMarkdown;

    // Phase 2: Swipe in + Fade in (260ms) once the real turn content is rendered
    let checkAttempts = 0;
    const maxPolls = 40;

    const finalizeAnimation = () => {
      if (canonicalTurn._aistuSwapToken !== swapToken) return;
      checkAttempts++;
      const textarea = canonicalTurn.querySelector('textarea');
      const newTurnContent = canonicalTurn.querySelector('.turn-content');

      if (newTurnContent && !textarea) {
        newTurnContent.style.opacity = '';
        newTurnContent.classList.remove(...allAnimClasses);
        void newTurnContent.offsetWidth;
        newTurnContent.classList.add(inClass);

        const cleanupTimer = setTimeout(() => {
          newTurnContent.classList.remove(...allAnimClasses);
          newTurnContent.style.opacity = '';
          if (historyData && canonicalTurn._aistuSwapToken === swapToken) {
            historyData.isSwappingText = false;
          }
        }, 265);
        canonicalTurn._aistuAnimTimers = [cleanupTimer];
      } else if (checkAttempts < maxPolls) {
        const pollTimer = setTimeout(finalizeAnimation, 25);
        canonicalTurn._aistuAnimTimers = [pollTimer];
      } else {
        if (newTurnContent) {
          newTurnContent.style.opacity = '';
          newTurnContent.classList.remove(...allAnimClasses);
        }
        if (historyData && canonicalTurn._aistuSwapToken === swapToken) {
          historyData.isSwappingText = false;
        }
      }
    };

    finalizeAnimation();
  }

  // Mount navigator directly below the Model's chat box at the bottom-left corner (outside .actions-container).
  function mountNavigatorInTurn(turn, navigatorEl) {
    const vScroll = turn.querySelector('.virtual-scroll-container.model-prompt-container, .virtual-scroll-container');
    if (vScroll && vScroll.parentNode) {
      if (navigatorEl.parentElement !== vScroll.parentNode || navigatorEl.previousElementSibling !== vScroll) {
        vScroll.parentNode.insertBefore(navigatorEl, vScroll.nextSibling);
      }
      return;
    }

    const turnContent = turn.querySelector('.turn-content');
    if (turnContent && turnContent.parentNode) {
      if (navigatorEl.parentElement !== turnContent.parentNode || navigatorEl.previousElementSibling !== turnContent) {
        turnContent.parentNode.insertBefore(navigatorEl, turnContent.nextSibling);
      }
      return;
    }

    const modelContainer =
      turn.querySelector('.chat-turn-container.model') ||
      (turn.classList?.contains('chat-turn-container') ? turn : null);
    if (modelContainer && navigatorEl.parentElement !== modelContainer) {
      modelContainer.appendChild(navigatorEl);
    }
  }

  function updateNavigatorUI(turn, historyData) {
    const navigatorEl = turn.querySelector('.aistu-history-navigator');
    if (!navigatorEl || !historyData) return;
    const total = historyData.list.length;
    const current1Based = historyData.currentIndex + 1;
    const counterEl = navigatorEl.querySelector('.aistu-nav-counter');
    if (counterEl && counterEl.textContent !== `${current1Based}/${total}`) {
      counterEl.textContent = `${current1Based}/${total}`;
    }
    const prevBtn = navigatorEl.querySelector('.aistu-nav-prev');
    const nextBtn = navigatorEl.querySelector('.aistu-nav-next');
    if (prevBtn) prevBtn.disabled = (historyData.currentIndex <= 0);
    if (nextBtn) nextBtn.disabled = (historyData.currentIndex >= total - 1);
  }

  function stepTurnHistory(btnElement, direction) {
    const matchedTurn = getCanonicalTurnElement(btnElement);
    if (!matchedTurn) return;
    const turnId = getTurnId(matchedTurn);
    if (!turnId) return;
    const historyData = turnHistoryMap.get(turnId);
    if (!historyData || !Array.isArray(historyData.list) || historyData.list.length <= 1) return;

    // Clean up any trailing empty placeholder if user navigates away
    if (
      historyData.list.length > 1 &&
      !getEntryMarkdown(historyData.list[historyData.list.length - 1]).trim() &&
      !historyData.waitingForNewGeneration
    ) {
      historyData.list.pop();
      if (historyData.currentIndex >= historyData.list.length) {
        historyData.currentIndex = historyData.list.length - 1;
      }
    }

    if (direction === 'prev') {
      if (historyData.currentIndex <= 0) return;
      historyData.currentIndex--;
    } else {
      if (historyData.currentIndex >= historyData.list.length - 1) return;
      historyData.currentIndex++;
    }

    historyData.isSwappingText = true;
    const targetIndex = historyData.currentIndex;
    const targetEntry = historyData.list[targetIndex];

    // Immediately update <X/Y> counter & button disabled states on the very first click
    updateNavigatorUI(matchedTurn, historyData);

    // Run smooth full-turn swipe + fade transition
    animateAndSwap(matchedTurn, targetEntry, direction, targetIndex, historyData);
  }

  function handleTurnsHistoryEvents() {
    if (!isMultipleResponseEnabled()) {
      document.querySelectorAll('.aistu-history-navigator').forEach(el => el.remove());
      return;
    }

    checkPromptIdChange();
    checkNewUserMessageSent();

    const modelTurns = getAllModelTurns();
    const latestModelTurn = modelTurns.length > 0 ? modelTurns[modelTurns.length - 1] : null;

    // Immediately remove any navigator attached to a Think block or non-latest turn
    document.querySelectorAll('.aistu-history-navigator').forEach(nav => {
      const ownerTurn = getCanonicalTurnElement(nav);
      if (!ownerTurn || ownerTurn !== latestModelTurn || isThoughtOnlyTurn(ownerTurn)) {
        nav.remove();
      }
    });

    modelTurns.forEach((turn, idx) => {
      if (isThoughtOnlyTurn(turn)) return;
      const turnId = getTurnId(turn);
      if (!turnId) return;

      const turnContent = turn.querySelector('.turn-content');
      if (!turnContent) return;

      const textTarget = getModelResponseTarget(turn) || turnContent;
      const currentMarkdown = domToMarkdown(textTarget);
      const currentHtml = extractTurnHtml(turn);
      const normCurrent = normalizeTextForComparison(currentMarkdown);

      let historyData = turnHistoryMap.get(turnId);
      if (!historyData) {
        historyData = {
          list: [createHistoryEntry(currentMarkdown, currentHtml)],
          currentIndex: 0
        };
        turnHistoryMap.set(turnId, historyData);
        turn.dataset.aistuActiveIndex = '0';
        turn.dataset.aistuActiveMarkdown = currentMarkdown;
      }

      const isEditing = turn.querySelector('textarea') !== null;
      if (!isEditing && !historyData.isSwappingText) {
        const isEmptyNow = normCurrent.length === 0;

        if (historyData.waitingForNewGeneration) {
          if (isEmptyNow) {
            historyData.sawClearOrThink = true;
            if (!historyData.newSlotAllocated) {
              historyData.list.push(createHistoryEntry('', ''));
              historyData.currentIndex = historyData.list.length - 1;
              historyData.newSlotAllocated = true;
              turn.dataset.aistuActiveIndex = String(historyData.currentIndex);
              turn.dataset.aistuActiveMarkdown = '';
            }
          } else {
            const normLastKnown = normalizeTextForComparison(historyData.lastKnownText || '');
            const isDifferentFromOld = normCurrent !== normLastKnown;
            if (historyData.sawClearOrThink || isDifferentFromOld) {
              if (!historyData.newSlotAllocated) {
                historyData.list.push(createHistoryEntry(currentMarkdown, currentHtml));
                historyData.currentIndex = historyData.list.length - 1;
              } else {
                historyData.list[historyData.currentIndex] = createHistoryEntry(currentMarkdown, currentHtml);
              }
              historyData.waitingForNewGeneration = false;
              historyData.newSlotAllocated = false;
              historyData.sawClearOrThink = false;
              turn.dataset.aistuActiveIndex = String(historyData.currentIndex);
              turn.dataset.aistuActiveMarkdown = currentMarkdown;
            }
          }
        } else if (!isEmptyNow) {
          const activeIndexAttr = turn.dataset.aistuActiveIndex;
          const activeIdx = activeIndexAttr !== undefined ? Number(activeIndexAttr) : historyData.currentIndex;

          if (activeIdx !== historyData.currentIndex) {
            const expectedEntry = historyData.list[historyData.currentIndex];
            const expectedMd = getEntryMarkdown(expectedEntry);
            if (normCurrent !== normalizeTextForComparison(expectedMd)) {
              visuallySwapTurnContent(turn, expectedEntry);
            }
            turn.dataset.aistuActiveIndex = String(historyData.currentIndex);
            turn.dataset.aistuActiveMarkdown = expectedMd;
          } else if (historyData.currentIndex === historyData.list.length - 1) {
            const prevSlotMd = historyData.currentIndex > 0
              ? normalizeTextForComparison(getEntryMarkdown(historyData.list[historyData.currentIndex - 1]))
              : null;
            const currentSlotMd = normalizeTextForComparison(getEntryMarkdown(historyData.list[historyData.currentIndex]));

            if (!(prevSlotMd && currentSlotMd && currentSlotMd !== prevSlotMd && normCurrent === prevSlotMd)) {
              historyData.list[historyData.currentIndex] = createHistoryEntry(currentMarkdown, currentHtml);
              turn.dataset.aistuActiveIndex = String(historyData.currentIndex);
              turn.dataset.aistuActiveMarkdown = currentMarkdown;
            } else {
              visuallySwapTurnContent(turn, historyData.list[historyData.currentIndex]);
            }
          } else {
            const expectedEntry = historyData.list[historyData.currentIndex];
            const expectedMd = getEntryMarkdown(expectedEntry);
            if (normCurrent !== normalizeTextForComparison(expectedMd)) {
              visuallySwapTurnContent(turn, expectedEntry);
            }
            turn.dataset.aistuActiveIndex = String(historyData.currentIndex);
            turn.dataset.aistuActiveMarkdown = expectedMd;
          }
        }
      }

      let navigatorEl = turn.querySelector('.aistu-history-navigator');
      const isLatestModelTurn = (idx === modelTurns.length - 1);

      if (historyData.list.length > 1 && isLatestModelTurn) {
        if (!navigatorEl) {
          const olderLabel = t('nav_older_response', 'Phản hồi cũ hơn');
          const newerLabel = t('nav_newer_response', 'Phản hồi mới hơn');
          navigatorEl = document.createElement('div');
          navigatorEl.className = 'aistu-history-navigator';
          navigatorEl.innerHTML = `
            <button type="button" class="aistu-nav-btn aistu-nav-prev" title="${olderLabel}" aria-label="${olderLabel}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>
            <span class="aistu-nav-counter">1/1</span>
            <button type="button" class="aistu-nav-btn aistu-nav-next" title="${newerLabel}" aria-label="${newerLabel}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>
          `;
        }
        mountNavigatorInTurn(turn, navigatorEl);
        updateNavigatorUI(turn, historyData);
      } else if (navigatorEl) {
        navigatorEl.remove();
      }
    });
  }

  let lastNavPointerDownAt = 0;
  const RERUN_HOLD_MS = 500;
  let rerunHoldTimer = null;
  let activeHoldRerunBtn = null;
  let suppressNextRerunClickUntil = 0;
  let suppressActiveHoldRelease = false;

  function clearRerunHoldState() {
    if (rerunHoldTimer) {
      clearTimeout(rerunHoldTimer);
      rerunHoldTimer = null;
    }
    if (activeHoldRerunBtn) {
      activeHoldRerunBtn.classList.remove('aistu-rerun-hold-active');
      activeHoldRerunBtn.querySelectorAll('.aistu-rerun-hold-ring').forEach(el => el.remove());
      activeHoldRerunBtn = null;
    }
  }

  function resolveTargetModelTurnFromRerunBtn(rerunBtn) {
    if (!rerunBtn) return null;
    const rawTurn = rerunBtn.closest('ms-chat-turn, [data-turn-role], .chat-turn-container, .model-prompt-container');
    const clickedTurn = getCanonicalTurnElement(rawTurn);
    if (!clickedTurn) return null;

    const clickedTurnId = getTurnId(clickedTurn);
    const isUser = isUserChatTurn(clickedTurn);
    const isThink = isThoughtOnlyTurn(clickedTurn);
    const modelTurns = getAllModelTurns();

    if (!isUser && !isThink) {
      return clickedTurn;
    }
    return (
      (clickedTurnId ? modelTurns.find(m => getTurnId(m) === clickedTurnId) : null) ||
      (modelTurns.length > 0 ? modelTurns[modelTurns.length - 1] : null)
    );
  }

  function getAllCanonicalTurnsInDom() {
    const list = [];
    document.querySelectorAll('ms-chat-turn, .chat-turn-container, .chat-turn').forEach(el => {
      const c = getCanonicalTurnElement(el);
      if (c && !list.includes(c)) {
        list.push(c);
      }
    });
    return list;
  }

  function findPrecedingThoughtTurnsForModelTurn(targetModelTurn) {
    if (!targetModelTurn) return [];
    const allTurns = getAllCanonicalTurnsInDom();
    const targetIdx = allTurns.indexOf(targetModelTurn);
    if (targetIdx <= 0) return [];
    const thoughtTurns = [];
    for (let i = targetIdx - 1; i >= 0; i--) {
      const t = allTurns[i];
      if (isUserChatTurn(t) && !isStealthTurnElement(t)) {
        break;
      }
      if (isThoughtOnlyTurn(t) || t.getAttribute?.('data-sl-thought-turn') === 'true') {
        thoughtTurns.push(t);
      }
    }
    return thoughtTurns;
  }

  function findPrecedingUserPromptText(targetModelTurn) {
    const allTurns = getAllCanonicalTurnsInDom();
    const targetIdx = targetModelTurn ? allTurns.indexOf(targetModelTurn) : allTurns.length - 1;
    const startIdx = targetIdx >= 0 ? targetIdx : allTurns.length - 1;
    for (let i = startIdx; i >= 0; i--) {
      const t = allTurns[i];
      if (isUserChatTurn(t) && !isStealthTurnElement(t)) {
        const md = extractTurnMarkdownForEdit(t);
        if (md && md.trim()) return md.trim();
      }
    }
    return '';
  }

  function hasStealthKeywordInTurn(turnEl) {
    if (!turnEl) return false;
    const rawText = turnEl.textContent || '';
    if (
      rawText.includes(STEALTH_SUGGEST_REQ_TAG) ||
      rawText.includes(STEALTH_SUGGEST_START_TAG) ||
      rawText.includes(STEALTH_SUGGEST_END_TAG) ||
      rawText.includes(STEALTH_IMPROVE_REQ_TAG)
    ) {
      return true;
    }
    const autosizeNodes = turnEl.querySelectorAll?.('ms-autosize-textarea[data-value], textarea') || [];
    for (let i = 0; i < autosizeNodes.length; i++) {
      const node = autosizeNodes[i];
      const val = (node.getAttribute?.('data-value') || node.value || '').trim();
      if (
        val.includes(STEALTH_SUGGEST_REQ_TAG) ||
        val.includes(STEALTH_SUGGEST_START_TAG) ||
        val.includes(STEALTH_SUGGEST_END_TAG) ||
        val.includes(STEALTH_IMPROVE_REQ_TAG)
      ) {
        return true;
      }
    }
    return false;
  }

  function scanAndHideStealthTurns() {
    const allTurns = getAllCanonicalTurnsInDom();
    allTurns.forEach((turn, idx) => {
      if (hasStealthKeywordInTurn(turn)) {
        markTurnAsStealth(turn, isThoughtOnlyTurn(turn));
        if (activeImproveSession && !activeImproveSession.stealthTurns.includes(turn)) {
          activeImproveSession.stealthTurns.push(turn);
        }
        // If this is a User turn with STEALTH_SUGGEST_REQ_TAG, any immediately following thought/model turns belong to the stealth suggestion
        const rawText = turn.textContent || '';
        if (isUserChatTurn(turn) && rawText.includes(STEALTH_SUGGEST_REQ_TAG)) {
          for (let j = idx + 1; j < allTurns.length; j++) {
            const nextT = allTurns[j];
            if (isUserChatTurn(nextT) && !hasStealthKeywordInTurn(nextT)) break;
            if (activeImproveSession && activeImproveSession.promotedModelTurn === nextT) continue;
            markTurnAsStealth(nextT, isThoughtOnlyTurn(nextT));
            if (activeImproveSession && !activeImproveSession.stealthTurns.includes(nextT)) {
              activeImproveSession.stealthTurns.push(nextT);
            }
          }
        }
      }
    });

    if (activeImproveSession && activeImproveSession.phase === 'requesting-suggestions') {
      allTurns.forEach(turn => {
        if (!activeImproveSession.baselineTurns.has(turn)) {
          markTurnAsStealth(turn, isThoughtOnlyTurn(turn));
          if (!activeImproveSession.stealthTurns.includes(turn)) {
            activeImproveSession.stealthTurns.push(turn);
          }
        }
      });
    }

    if (activeImproveSession && activeImproveSession.phase === 'generating-improved') {
      allTurns.forEach(turn => {
        if (activeImproveSession.preImproveTurns && !activeImproveSession.preImproveTurns.has(turn)) {
          const rawText = turn.textContent || '';
          if (rawText.includes(STEALTH_IMPROVE_REQ_TAG) || hasStealthKeywordInTurn(turn)) {
            markTurnAsStealth(turn, false);
            if (!activeImproveSession.turnsToDelete.includes(turn)) {
              activeImproveSession.turnsToDelete.push(turn);
            }
          } else if (isUserChatTurn(turn) && !activeImproveSession.foundImproveUserTurn) {
            // The very first user turn created right after sending STEALTH_IMPROVE_REQ_TAG
            markTurnAsStealth(turn, false);
            activeImproveSession.foundImproveUserTurn = turn;
            if (!activeImproveSession.turnsToDelete.includes(turn)) {
              activeImproveSession.turnsToDelete.push(turn);
            }
          } else if (!isUserChatTurn(turn)) {
            // New Model thought turn or response turn — promote as active visible turn while generating!
            if (activeImproveSession.targetTurnId) {
              turn.dataset.aistuTurnId = activeImproveSession.targetTurnId;
              turn.setAttribute('data-aistu-turn-id', activeImproveSession.targetTurnId);
            }
            if (isThoughtOnlyTurn(turn)) {
              if (!activeImproveSession.improveThoughtTurns.includes(turn)) {
                activeImproveSession.improveThoughtTurns.push(turn);
              }
            } else {
              activeImproveSession.promotedModelTurn = turn;
            }
          }
        }
      });
    }
  }

  function findThinkingMatSelect() {
    return (
      document.querySelector('ms-thinking-level-setting mat-select') ||
      document.querySelector('mat-select[aria-label="Thinking Level"]') ||
      document.querySelector('mat-select[aria-label*="Thinking" i]') ||
      document.querySelector('#mat-select-0')
    );
  }

  async function ensureThinkingSelectMounted() {
    let selectEl = findThinkingMatSelect();
    if (selectEl) return { selectEl, openedDrawerTemporarily: false };

    const toggleBtn = document.querySelector(
      'button.runsettings-toggle-button, button[aria-label="Toggle run settings panel"], button[aria-label*="run settings" i]'
    );
    if (!toggleBtn) return { selectEl: null, openedDrawerTemporarily: false };

    document.body.classList.add('aistu-stealth-mounting-runsettings');
    toggleBtn.click();

    const start = Date.now();
    while (Date.now() - start < 450) {
      await new Promise(r => setTimeout(r, 25));
      selectEl = findThinkingMatSelect();
      if (selectEl) break;
    }
    return { selectEl, openedDrawerTemporarily: true };
  }

  function getThinkingSelectCurrentLabel(selectEl) {
    const el = selectEl || findThinkingMatSelect();
    if (!el) {
      const headerLabel = document.querySelector('.sl-header-thinking-btn .thinking-label');
      return headerLabel ? (headerLabel.textContent || '').trim() : '';
    }
    const minLine = el.querySelector('.mat-mdc-select-min-line, .mat-mdc-select-value-text');
    return minLine ? (minLine.textContent || '').trim() : '';
  }

  function freezeThinkingLevelUI(frozenLabel) {
    if (!frozenLabel) return;
    document.body.setAttribute('data-aistu-frozen-thinking', frozenLabel);
    document
      .querySelectorAll(
        '#mat-select-0 .mat-mdc-select-min-line, mat-select[aria-label*="Thinking" i] .mat-mdc-select-min-line, ms-thinking-level-setting mat-select .mat-mdc-select-min-line, .sl-header-thinking-btn .thinking-label'
      )
      .forEach(el => {
        el.setAttribute('data-aistu-frozen-label', frozenLabel);
      });
  }

  function unfreezeThinkingLevelUI() {
    document.body.removeAttribute('data-aistu-frozen-thinking');
    document.body.classList.remove('aistu-stealth-switching-thinking', 'aistu-stealth-mounting-runsettings');
    document
      .querySelectorAll('[data-aistu-frozen-label]')
      .forEach(el => el.removeAttribute('data-aistu-frozen-label'));
  }

  function freezeModelSelectorUI() {
    const selectors = [
      'ms-model-selector span[data-test-id="model-name"]',
      'ms-model-selector .model-title',
      'ms-model-selector .title',
      'button.model-selector-card .title',
      'ms-model-selector .subtitle',
      'button.model-selector-card .subtitle',
      '.sl-header-model-btn .model-label'
    ];
    const nodes = document.querySelectorAll(selectors.join(', '));
    let frozeAny = false;
    nodes.forEach(node => {
      if (!node.hasAttribute('data-aistu-frozen-model-label')) {
        const text = (node.textContent || '').trim();
        if (text) {
          node.setAttribute('data-aistu-frozen-model-label', text);
          try {
            const computed = window.getComputedStyle(node);
            if (computed && computed.fontSize) {
              node.style.setProperty('--aistu-frozen-model-font-size', computed.fontSize);
            }
          } catch (_) {}
          frozeAny = true;
        }
      } else {
        frozeAny = true;
      }
    });
    if (frozeAny) {
      document.body.setAttribute('data-aistu-frozen-model', 'true');
    }
  }

  function unfreezeModelSelectorUI() {
    document.body.removeAttribute('data-aistu-frozen-model');
    document.querySelectorAll('[data-aistu-frozen-model-label]').forEach(node => {
      node.removeAttribute('data-aistu-frozen-model-label');
      node.style.removeProperty('--aistu-frozen-model-font-size');
    });
  }


  function switchModelToFlashLiteStealth(targetModelId = 'gemini-3.1-flash-lite') {
    return new Promise(resolve => {
      const requestId = 'sl_sm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      let settled = false;
      const finish = detail => {
        if (settled) return;
        settled = true;
        window.removeEventListener('__sl_stealthSwitchModelResult', onResult);
        resolve({
          originalSignalModel: detail?.originalSignalModel || '',
          originalOverrideModel: detail?.originalOverrideModel || null,
          appliedModel: detail?.appliedModel || targetModelId,
          signalApplied: Boolean(detail?.signalApplied),
          restored: false
        });
      };
      const onResult = e => {
        if (e?.detail?.requestId === requestId) {
          finish(e.detail);
        }
      };
      window.addEventListener('__sl_stealthSwitchModelResult', onResult);
      window.dispatchEvent(
        new CustomEvent('__sl_stealthSwitchModel', {
          detail: { requestId, modelId: targetModelId }
        })
      );
      setTimeout(() => finish(null), 600);
    });
  }

  function restoreOriginalModelStealth(modelState) {
    if (!modelState || modelState.restored) return Promise.resolve(false);
    modelState.restored = true;
    return new Promise(resolve => {
      const requestId = 'sl_rm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      let settled = false;
      const finish = ok => {
        if (settled) return;
        settled = true;
        window.removeEventListener('__sl_stealthRestoreModelResult', onResult);
        resolve(Boolean(ok));
      };
      const onResult = e => {
        if (e?.detail?.requestId === requestId) {
          finish(true);
        }
      };
      window.addEventListener('__sl_stealthRestoreModelResult', onResult);
      window.dispatchEvent(
        new CustomEvent('__sl_stealthRestoreModel', {
          detail: {
            requestId,
            originalSignalModel: modelState.originalSignalModel || '',
            originalOverrideModel: modelState.originalOverrideModel || null
          }
        })
      );
      setTimeout(() => finish(false), 600);
    });
  }

  async function sleepInterruptible(ms, shouldAbortFn) {
    const step = 60;
    let elapsed = 0;
    while (elapsed < ms) {
      if (typeof shouldAbortFn === 'function' && shouldAbortFn()) return false;
      const wait = Math.min(step, ms - elapsed);
      await new Promise(r => setTimeout(r, wait));
      elapsed += wait;
    }
    return !(typeof shouldAbortFn === 'function' && shouldAbortFn());
  }

  async function switchThinkingLevelWithVerification(targetLevel, settleDelayMs, shouldAbortFn) {
    await ensureThinkingSelectMounted();
    let selectEl = findThinkingMatSelect();
    if (!selectEl) return { switched: false, previousLabel: '' };

    const frozenAttr = document.body.getAttribute('data-aistu-frozen-thinking');
    if (frozenAttr) {
      freezeThinkingLevelUI(frozenAttr);
    }

    const currentLabel = getThinkingSelectCurrentLabel(selectEl);
    const isMinimalTarget =
      targetLevel === '__LOWEST__' || String(targetLevel || '').trim().toLowerCase() === 'minimal';

    if (!isMinimalTarget && targetLevel && currentLabel.toLowerCase() === String(targetLevel).trim().toLowerCase()) {
      if (settleDelayMs > 0) {
        await sleepInterruptible(settleDelayMs, shouldAbortFn);
      }
      return { switched: true, previousLabel: currentLabel, newLabel: currentLabel };
    }

    document.body.classList.add('aistu-stealth-switching-thinking');
    try {
      const openSelectDropdown = async el => {
        if (!el) return [];
        el.click();
        await new Promise(r => setTimeout(r, 30));
        if (el.getAttribute('aria-expanded') !== 'true') {
          const trigger = el.querySelector('.mat-mdc-select-trigger');
          if (trigger) trigger.click();
        }
        let opts = [];
        const pollStart = Date.now();
        while (Date.now() - pollStart < 600) {
          if (typeof shouldAbortFn === 'function' && shouldAbortFn()) {
            document.body.click();
            return [];
          }
          opts = Array.from(
            document.querySelectorAll(
              '.mat-mdc-select-panel[aria-label="Thinking Level"] mat-option, .mat-mdc-select-panel[aria-label*="Thinking" i] mat-option, .cdk-overlay-pane.ms-select-panel-class mat-option'
            )
          );
          if (opts.length > 0) break;
          await new Promise(r => setTimeout(r, 20));
        }
        return opts;
      };

      const getOptionText = opt =>
        (opt?.querySelector('.mdc-list-item__primary-text')?.textContent || opt?.textContent || '')
          .trim()
          .toLowerCase();

      let options = await openSelectDropdown(selectEl);

      // If targeting Minimal for gemini-3.1-flash-lite and Angular was still re-rendering mat-select options,
      // retry once with fresh selectEl so Minimal (mat-option) is guaranteed to be present.
      if (isMinimalTarget && !options.some(opt => getOptionText(opt) === 'minimal')) {
        document.body.click();
        await new Promise(r => setTimeout(r, 90));
        selectEl = findThinkingMatSelect() || selectEl;
        if (frozenAttr) freezeThinkingLevelUI(frozenAttr);
        options = await openSelectDropdown(selectEl);
      }

      if (options.length === 0) {
        document.body.click();
        return { switched: false, previousLabel: currentLabel };
      }

      let chosenOption = null;
      if (isMinimalTarget) {
        // Strict priority: 1) exact "minimal", 2) includes "minimal", 3) exact "low", 4) first option
        chosenOption =
          options.find(opt => getOptionText(opt) === 'minimal') ||
          options.find(opt => getOptionText(opt).includes('minimal')) ||
          options.find(opt => getOptionText(opt) === 'low') ||
          options[0];
      } else {
        const normTarget = String(targetLevel || '').trim().toLowerCase();
        chosenOption =
          options.find(opt => getOptionText(opt) === normTarget) ||
          options.find(opt => {
            const txt = getOptionText(opt);
            return txt.includes(normTarget) || normTarget.includes(txt);
          });
      }

      if (!chosenOption) {
        document.body.click();
        return { switched: false, previousLabel: currentLabel };
      }

      const expectedLabel = (
        chosenOption.querySelector('.mdc-list-item__primary-text')?.textContent ||
        chosenOption.textContent ||
        ''
      ).trim();

      chosenOption.click();

      // Wait for real DOM confirmation on mat-select
      const verifyStart = Date.now();
      while (Date.now() - verifyStart < 700) {
        selectEl = findThinkingMatSelect() || selectEl;
        const nowLabel = getThinkingSelectCurrentLabel(selectEl);
        const isClosed = selectEl.getAttribute('aria-expanded') !== 'true';
        if (nowLabel.toLowerCase() === expectedLabel.toLowerCase() && isClosed) {
          break;
        }
        await new Promise(r => setTimeout(r, 25));
      }

      // Ensure dropdown panel is closed if option was already selected
      if (selectEl && selectEl.getAttribute('aria-expanded') === 'true') {
        document.body.click();
      }

      const activeFrozen = document.body.getAttribute('data-aistu-frozen-thinking');
      if (activeFrozen) {
        freezeThinkingLevelUI(activeFrozen);
      }
    } finally {
      document.body.classList.remove('aistu-stealth-switching-thinking');
    }

    if (settleDelayMs > 0) {
      await sleepInterruptible(settleDelayMs, shouldAbortFn);
    }

    return {
      switched: true,
      previousLabel: currentLabel,
      newLabel: getThinkingSelectCurrentLabel(findThinkingMatSelect() || selectEl)
    };
  }

  function isNativeGenerationRunning() {
    const stopBtn = document.querySelector(
      'ms-run-button button.stop, button.run-button.stop, ms-run-button button[aria-label*="Stop" i], button[aria-label*="Stop" i], .stop-button'
    );
    if (stopBtn && !stopBtn.disabled) return true;

    const runBtns = document.querySelectorAll('ms-run-button button, button.run-button');
    for (const btn of runBtns) {
      if (btn.disabled) continue;
      const label = ((btn.getAttribute('aria-label') || '') + ' ' + (btn.textContent || '')).toLowerCase();
      if (label.includes('stop') || label.includes('cancel') || label.includes('dừng')) {
        return true;
      }
    }

    const activeSpinner = document.querySelector(
      'ms-run-button .spin, ms-chat-turn .thinking-progress-icon.spin, ms-thought-chunk .spin, ms-chat-turn .thinking-in-progress'
    );
    return Boolean(activeSpinner);
  }

  async function stopNativeGenerationIfRunning() {
    const stopBtn = document.querySelector(
      'ms-run-button button.stop, button.run-button.stop, ms-run-button button[aria-label*="Stop" i], button[aria-label*="Stop" i], .stop-button'
    );
    if (stopBtn && !stopBtn.disabled) {
      stopBtn.click();
      const start = Date.now();
      while (Date.now() - start < 500) {
        if (!isNativeGenerationRunning()) break;
        await new Promise(r => setTimeout(r, 30));
      }
    }
  }

  function findPromptBarRunButton() {
    const promptScope =
      document.querySelector('ms-prompt-box') ||
      document.querySelector('ms-prompt-input') ||
      document.querySelector('.prompt-box-container') ||
      document.querySelector('footer');
    if (!promptScope) return null;

    const candidates = Array.from(
      promptScope.querySelectorAll(
        'ms-run-button button, button.run-button, button[type="submit"], button[aria-label*="Run" i], button[aria-label*="Send" i]'
      )
    );
    return (
      candidates.find(btn => {
        if (!btn || btn.disabled || btn.getAttribute('aria-disabled') === 'true') return false;
        if (btn.classList.contains('stop') || btn.classList.contains('rerun-button')) return false;
        if (btn.getAttribute('name') === 'rerun-button') return false;
        if (btn.closest('ms-chat-turn, .chat-turn-container')) return false;
        const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
        if (aria.includes('rerun') || aria.includes('stop')) return false;
        return true;
      }) || null
    );
  }

  function isStealthPromptString(str) {
    if (!str || typeof str !== 'string') return false;
    return (
      str.includes(STEALTH_SUGGEST_REQ_TAG) ||
      str.includes(STEALTH_IMPROVE_REQ_TAG) ||
      str.includes(STEALTH_SUGGEST_START_TAG) ||
      str.includes(STEALTH_SUGGEST_END_TAG)
    );
  }

  async function sendStealthPromptTurn(promptText, shouldAbortFn = null) {
    if (typeof shouldAbortFn === 'function' && shouldAbortFn()) return false;
    const inputEl = findInputArea();
    if (!inputEl) return false;

    const rawExistingDraft = getDraftValue(inputEl);
    const savedDraft = isStealthPromptString(rawExistingDraft) ? '' : rawExistingDraft;
    isSendingStealthMessage = true;
    document.body.classList.add('aistu-stealth-sending-prompt');

    const setInputValue = val => {
      try {
        const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        if (nativeSetter && inputEl.tagName === 'TEXTAREA') {
          nativeSetter.call(inputEl, val);
        } else if (inputEl.value !== undefined) {
          inputEl.value = val;
        } else {
          inputEl.textContent = val;
        }
      } catch (_) {
        if (inputEl.value !== undefined) inputEl.value = val;
      }
      const autosize = inputEl.closest('ms-autosize-textarea');
      if (autosize) autosize.setAttribute('data-value', val);
      inputEl.dispatchEvent(new Event('input', { bubbles: true, cancelable: true, composed: true }));
      inputEl.dispatchEvent(new Event('change', { bubbles: true, cancelable: true, composed: true }));
    };

    try {
      setInputValue(promptText);
      await new Promise(r => setTimeout(r, 45));

      if (typeof shouldAbortFn === 'function' && shouldAbortFn()) {
        setInputValue(savedDraft || '');
        return false;
      }

      let runBtn = null;
      const startWait = Date.now();
      while (Date.now() - startWait < 500) {
        if (typeof shouldAbortFn === 'function' && shouldAbortFn()) {
          setInputValue(savedDraft || '');
          return false;
        }
        runBtn = findPromptBarRunButton();
        if (runBtn) break;
        await new Promise(r => setTimeout(r, 20));
      }

      if (typeof shouldAbortFn === 'function' && shouldAbortFn()) {
        setInputValue(savedDraft || '');
        return false;
      }

      if (runBtn) {
        runBtn.click();
      } else {
        inputEl.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            ctrlKey: true,
            bubbles: true,
            cancelable: true
          })
        );
      }

      scanAndHideStealthTurns();
      await new Promise(r => setTimeout(r, 35));
      scanAndHideStealthTurns();

      // Always clear the stealth text from the prompt bar (or restore genuine user draft)
      setInputValue(savedDraft || '');

      setTimeout(() => {
        const currentVal = getDraftValue(inputEl);
        if (isStealthPromptString(currentVal)) {
          setInputValue(savedDraft || '');
        }
      }, 90);

      return true;
    } finally {
      document.body.classList.remove('aistu-stealth-sending-prompt');
      setTimeout(() => {
        const currentVal = getDraftValue(inputEl);
        if (isStealthPromptString(currentVal)) {
          setInputValue(savedDraft || '');
        }
        isSendingStealthMessage = false;
      }, 220);
    }
  }

  function fastStealthTick() {
    return new Promise(resolve => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => resolve();
      channel.port2.postMessage(null);
    });
  }

  async function deleteSingleTurnStealth(turnEl) {
    if (!turnEl || !document.body.contains(turnEl)) return false;
    const chatTurn = getCanonicalTurnElement(turnEl) || turnEl;
    if (!document.body.contains(chatTurn)) return false;

    for (let attempt = 0; attempt < 3; attempt++) {
      if (!document.body.contains(chatTurn)) return true;

      chatTurn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      chatTurn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

      let targetButton = null;
      const waitBtnStart = Date.now();
      while (Date.now() - waitBtnStart < 320) {
        const actionsContainer = chatTurn.querySelector('.actions, [class*="actions"]');
        if (actionsContainer) {
          const buttons = Array.from(actionsContainer.querySelectorAll('button, ms-button'));
          targetButton =
            buttons.find(b => {
              const text = b.textContent || '';
              return (
                text.includes('more_vert') ||
                b.querySelector('mat-icon')?.textContent?.includes('more_vert') ||
                b.querySelector('.material-symbols-outlined')?.textContent?.includes('more_vert')
              );
            }) || buttons[buttons.length - 1];
        }
        if (!targetButton) {
          const allButtons = Array.from(chatTurn.querySelectorAll('button'));
          targetButton = allButtons.find(b => {
            const text = b.textContent || '';
            const aria = (b.getAttribute('aria-label') || '').toLowerCase();
            return text.includes('more_vert') || aria.includes('more') || aria.includes('actions');
          });
        }
        if (targetButton) break;
        await new Promise(r => setTimeout(r, 20));
      }

      if (!targetButton) {
        await new Promise(r => setTimeout(r, 60));
        continue;
      }

      targetButton.click();

      let deleteOption = null;
      for (let i = 0; i < 45; i++) {
        const menuItems = document.querySelectorAll(
          '.mat-mdc-menu-item, [role="menuitem"], button[mat-menu-item], .mat-menu-item'
        );
        for (let j = 0; j < menuItems.length; j++) {
          const item = menuItems[j];
          const text = (item.textContent || '').toLowerCase();
          const iconText = (
            item.querySelector('.material-symbols-outlined, mat-icon')?.textContent || ''
          ).toLowerCase();
          if (
            text.includes('delete') ||
            text.includes('xoá') ||
            text.includes('xóa') ||
            iconText === 'delete'
          ) {
            deleteOption = item;
            break;
          }
        }
        if (deleteOption) break;
        if (i < 6) await fastStealthTick();
        else await new Promise(resolve => setTimeout(resolve, 4));
      }

      if (!deleteOption) {
        document.body.click();
        await new Promise(r => setTimeout(r, 40));
        continue;
      }

      deleteOption.click();

      if (!document.body.contains(chatTurn)) return true;

      for (let i = 0; i < 35; i++) {
        if (!document.body.contains(chatTurn)) return true;
        const dialog = document.querySelector(
          'mat-dialog-container, .mat-mdc-dialog-container, mdc-dialog, [role="dialog"]'
        );
        if (dialog && !dialog.classList.contains('sl-dialog') && !dialog.classList.contains('aistu-improve-popup-card')) {
          const dialogButtons = dialog.querySelectorAll('button');
          for (let j = 0; j < dialogButtons.length; j++) {
            const b = dialogButtons[j];
            const text = (b.textContent || '').toLowerCase();
            if (
              (text.includes('delete') || text.includes('xoá') || text.includes('xóa')) &&
              !text.includes('cancel')
            ) {
              b.click();
              break;
            }
          }
        }
        if (i < 8) await fastStealthTick();
        else await new Promise(resolve => setTimeout(resolve, 4));
      }

      if (!document.body.contains(chatTurn)) return true;
    }

    return !document.body.contains(chatTurn);
  }

  let stealthDeleteQueuePromise = Promise.resolve();

  async function deleteTurnListStealth(turns) {
    if (!Array.isArray(turns) || turns.length === 0) return;
    const uniqueTurns = [];
    turns.forEach(t => {
      const c = getCanonicalTurnElement(t) || t;
      if (c && !uniqueTurns.includes(c)) uniqueTurns.push(c);
    });
    if (uniqueTurns.length === 0) return;

    const runDeleteTask = async () => {
      document.body.classList.add('aistu-stealth-deleting-turns');
      let silentStyle = document.getElementById('aistu-stealth-fast-delete-style');
      if (!silentStyle) {
        silentStyle = document.createElement('style');
        silentStyle.id = 'aistu-stealth-fast-delete-style';
        silentStyle.textContent = `
          .cdk-overlay-container:not(:has(.aistu-improve-popup-overlay)) .mat-mdc-menu-panel,
          .cdk-overlay-container:not(:has(.aistu-improve-popup-overlay)) .mat-mdc-dialog-container,
          .cdk-overlay-container:not(:has(.aistu-improve-popup-overlay)) .cdk-overlay-backdrop {
            opacity: 0 !important;
            pointer-events: none !important;
            transition-duration: 0s !important;
            animation-duration: 0s !important;
          }
          ms-chat-turn[data-sl-buffered-turn] { display: block !important; }
        `;
        document.head.appendChild(silentStyle);
      }

      try {
        window.dispatchEvent(new CustomEvent('__sl_restoreAllTurns'));
        // Delete from newest to oldest so indices never shift unexpectedly
        for (let i = uniqueTurns.length - 1; i >= 0; i--) {
          const turn = uniqueTurns[i];
          if (turn && document.body.contains(turn)) {
            await deleteSingleTurnStealth(turn);
            await new Promise(r => setTimeout(r, 25));
          }
        }
      } finally {
        document.getElementById('aistu-stealth-fast-delete-style')?.remove();
        document.body.classList.remove('aistu-stealth-deleting-turns');
      }
    };

    stealthDeleteQueuePromise = stealthDeleteQueuePromise.then(runDeleteTask, runDeleteTask);
    return stealthDeleteQueuePromise;
  }

  async function purgeAllKeywordStealthTurns(session = null, extraTurns = []) {
    scanAndHideStealthTurns();
    const candidates = [];
    const addCandidate = t => {
      if (!t) return;
      const c = getCanonicalTurnElement(t) || t;
      if (!c || !document.body.contains(c)) return;
      if (session && session.promotedModelTurn && c === session.promotedModelTurn) return;
      if (!candidates.includes(c)) candidates.push(c);
    };

    if (session && Array.isArray(session.stealthTurns)) {
      session.stealthTurns.forEach(addCandidate);
    }
    if (Array.isArray(extraTurns)) {
      extraTurns.forEach(addCandidate);
    }

    const allTurns = getAllCanonicalTurnsInDom();
    allTurns.forEach((turn, idx) => {
      if (hasStealthKeywordInTurn(turn) || isStealthTurnElement(turn)) {
        // If this is a model turn with stealth markers, also include its preceding thought turns
        if (!isUserChatTurn(turn)) {
          findPrecedingThoughtTurnsForModelTurn(turn).forEach(addCandidate);
        }
        // If this is a stealth user request turn, also include any following thought/model turns created after it
        // unless it is the promoted final model response turn
        const rawText = turn.textContent || '';
        if (
          isUserChatTurn(turn) &&
          (rawText.includes(STEALTH_SUGGEST_REQ_TAG) ||
            rawText.includes(STEALTH_IMPROVE_REQ_TAG) ||
            hasStealthKeywordInTurn(turn))
        ) {
          for (let j = idx + 1; j < allTurns.length; j++) {
            const nextT = allTurns[j];
            if (isUserChatTurn(nextT) && !hasStealthKeywordInTurn(nextT)) break;
            if (session && session.promotedModelTurn && nextT === session.promotedModelTurn) continue;
            addCandidate(nextT);
          }
        }
        addCandidate(turn);
      }
    });

    if (candidates.length > 0) {
      await deleteTurnListStealth(candidates);
    }
    if (session && Array.isArray(session.stealthTurns)) {
      session.stealthTurns = session.stealthTurns.filter(t => document.body.contains(t));
    }
  }

  function extractCleanStealthModelText(turnEl) {
    if (!turnEl) return '';
    // Only extract from actual response markdown/text chunks outside of thought blocks
    const cmarkNodes = Array.from(
      turnEl.querySelectorAll('ms-text-chunk ms-cmark-node, .turn-content ms-cmark-node, ms-cmark-node, .cmark-node')
    ).filter(
      el =>
        !el.closest('ms-thought-chunk, .thought-panel, .thinking-panel, .thought-chunk, mat-expansion-panel') &&
        !el.closest('.actions, .action-bar, .turn-footer, button, ms-button')
    );

    if (cmarkNodes.length > 0) {
      return cmarkNodes
        .map(node => domToMarkdown(node))
        .filter(Boolean)
        .join('\n')
        .trim();
    }

    const textChunks = Array.from(turnEl.querySelectorAll('ms-text-chunk, .text-chunk')).filter(
      el =>
        !el.closest('ms-thought-chunk, .thought-panel, .thinking-panel, .thought-chunk, mat-expansion-panel') &&
        !el.closest('.actions, .action-bar, .turn-footer, button, ms-button')
    );

    if (textChunks.length > 0) {
      return textChunks
        .map(node => domToMarkdown(node))
        .filter(Boolean)
        .join('\n')
        .trim();
    }

    return '';
  }

  function extractModelAnswerFromPayloadBody(body) {
    if (!body || typeof body !== 'string') return '';
    try {
      const decoded = JSON.parse(body.replace(/^\s*\)\]\}'[^\r\n]*[\r\n]+/, ''));
      const answerChunks = [];
      function visit(value) {
        if (!Array.isArray(value)) return;
        const candidates = value[0];
        if (
          Array.isArray(candidates) &&
          candidates.some(candidate => Array.isArray(candidate?.[0]?.[0]) && candidate[0][1] === 'model')
        ) {
          const candidate = candidates.find(item => item?.[2] === 0) || candidates[0];
          const content = candidate?.[0];
          if (content?.[1] === 'model' && Array.isArray(content[0])) {
            content[0].forEach(part => {
              if (Array.isArray(part) && part[0] === null && typeof part[1] === 'string' && part[1] && !part[12]) {
                answerChunks.push(part[1]);
              }
            });
          }
          return;
        }
        value.forEach(visit);
      }
      visit(decoded);
      return answerChunks.join('').trim();
    } catch (_) {
      return '';
    }
  }

  function stripMaterialIconGarbage(text) {
    if (!text) return '';
    return text
      .replace(
        /\b(?:more_vert|thumb_up|thumb_down|content_copy|rerun|spark|auto_awesome|stop_circle|edit|flag|share|download|chevron_right|chevron_left|expand_more|expand_less|check|close)\b/gi,
        ''
      )
      .replace(
        /(?:more_vert|thumb_up|thumb_down|content_copy|rerun|expand_more|expand_less){2,}/gi,
        ''
      )
      .trim();
  }

  function enforceMaxWords(text, maxWords = 6) {
    const cleaned = String(text || '').trim().replace(/[.;,!?:]+$/, '').trim();
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) return cleaned;
    return words.slice(0, maxWords).join(' ').replace(/[,;:-]+$/, '').trim();
  }

  function parseSuggestionsFromStealthText(rawText, requireStartTag = true) {
    const cleanedRaw = stripMaterialIconGarbage(rawText);
    if (!cleanedRaw) return [];

    const startIdx = cleanedRaw.indexOf(STEALTH_SUGGEST_START_TAG);
    const endIdx = cleanedRaw.indexOf(STEALTH_SUGGEST_END_TAG);

    let body = '';
    if (startIdx !== -1) {
      const sliceFrom = startIdx + STEALTH_SUGGEST_START_TAG.length;
      body =
        endIdx !== -1 && endIdx > sliceFrom
          ? cleanedRaw.slice(sliceFrom, endIdx)
          : cleanedRaw.slice(sliceFrom);
    } else if (!requireStartTag) {
      body = cleanedRaw;
    } else {
      return [];
    }

    // Also split inline numbered lists if CommonMark rendered them inside a single paragraph
    const normalizedBody = body.replace(/(?:^|\s+)([1-5][.)]\s+)/g, '\n$1');

    const lines = normalizedBody
      .split(/\r?\n/)
      .map(line =>
        stripMaterialIconGarbage(
          line
            .replace(/^\s*(?:[-*•]|\d+[.)]|\[[0-9]+\])\s*/, '')
            .replace(/^\s*["“”'`]+|["“”'`]+\s*$/g, '')
            .replace(/\*\*+/g, '')
            .trim()
        )
      )
      .filter(line => {
        if (!line || line.length < 2) return false;
        if (line.includes('[[SL_') || line.includes(']]')) return false;
        if (/^(here are|below are|suggestions|dưới đây|đây là|5 đề xuất|gợi ý|nhiệm vụ|yêu cầu)/i.test(line)) return false;
        return true;
      });

    const unique = [];
    for (const item of lines) {
      const concise = enforceMaxWords(item, 6);
      if (concise && !unique.includes(concise)) {
        unique.push(concise);
      }
      if (unique.length >= 5) break;
    }
    return unique;
  }

  function buildContextAwareSuggestionPrompt() {
    return `${STEALTH_SUGGEST_REQ_TAG}
[SYSTEM INSTRUCTION — DO NOT CONTINUE THE CONVERSATION OR EXPLAIN]
Your task is to help the user REGENERATE (rewrite and replace) your immediately preceding assistant response so that it becomes a much better answer to the user's request.
Analyze the user's request and your previous assistant response in this conversation, then propose 5 distinct, actionable improvement directions to regenerate that response better.
Mandatory rules:
1. Write every suggestion in the exact same language currently used in the conversation.
2. Each suggestion MUST be ultra-short: maximum 5 to 6 words.
3. Output ONLY the 5 suggestions inside the tags below, one per line, with no extra text:
${STEALTH_SUGGEST_START_TAG}
1. <suggestion 1>
2. <suggestion 2>
3. <suggestion 3>
4. <suggestion 4>
5. <suggestion 5>
${STEALTH_SUGGEST_END_TAG}`;
  }

  function buildStealthImprovementRequestPrompt(selectedOptionText) {
    return `${STEALTH_IMPROVE_REQ_TAG}
[SYSTEM INSTRUCTION — REGENERATE PREVIOUS RESPONSE]
This is a REGENERATION request, NOT a continuation of the conversation.
You MUST completely rewrite and regenerate your immediately preceding main assistant response from scratch to answer the user's prior prompt, applying this specific improvement directive: "${selectedOptionText}".
Mandatory rules:
1. Produce a complete replacement for your previous response (do NOT continue from where the previous response left off, and do NOT treat this as a follow-up chat turn).
2. Write the regenerated response in the exact same language currently used in the conversation.
3. Output ONLY the regenerated response directly — do NOT repeat this instruction, do NOT add any meta-commentary or intro/outro, and do NOT explain your changes.`;
  }

  function positionImprovePopoverCard(cardEl, anchorEl, savedAnchorRect) {
    if (!cardEl) return;
    let rect = null;
    if (anchorEl && document.body.contains(anchorEl)) {
      const liveRect = anchorEl.getBoundingClientRect();
      if (liveRect && (liveRect.width > 0 || liveRect.height > 0)) {
        rect = liveRect;
      }
    }
    if (!rect && savedAnchorRect && (savedAnchorRect.width > 0 || savedAnchorRect.height > 0)) {
      rect = savedAnchorRect;
    }

    const vw = window.innerWidth || document.documentElement.clientWidth || 1024;
    const vh = window.innerHeight || document.documentElement.clientHeight || 768;
    const cardRect = cardEl.getBoundingClientRect();
    const cardW = cardRect.width || 296;
    const cardH = cardRect.height || 180;
    const margin = 10;

    if (!rect) {
      cardEl.style.left = `${Math.max(margin, Math.round((vw - cardW) / 2))}px`;
      cardEl.style.top = `${Math.max(margin, Math.round((vh - cardH) / 2))}px`;
      return;
    }

    // Horizontal alignment: align left edge with the rerun button, clamped to viewport
    let left = Math.round(rect.left);
    if (left + cardW > vw - margin) {
      left = Math.max(margin, Math.round(rect.right - cardW));
    }
    if (left + cardW > vw - margin) {
      left = Math.max(margin, vw - cardW - margin);
    }
    if (left < margin) left = margin;

    // Vertical alignment: prefer opening right above the rerun button if space allows, otherwise below
    const spaceAbove = rect.top - margin;
    const spaceBelow = vh - rect.bottom - margin;
    let top;
    let originY = 'bottom';

    if (spaceAbove >= cardH + 8 || spaceAbove >= spaceBelow) {
      top = Math.max(margin, Math.round(rect.top - cardH - 8));
      originY = 'bottom';
    } else {
      top = Math.min(vh - cardH - margin, Math.round(rect.bottom + 8));
      originY = 'top';
    }

    const originX = left + cardW / 2 < rect.left + rect.width / 2 ? 'right' : 'left';
    cardEl.style.setProperty('--aistu-popover-origin', `${originY} ${originX}`);
    cardEl.style.left = `${left}px`;
    cardEl.style.top = `${top}px`;
  }

  async function openImproveResponsePopup(targetModelTurn, anchorBtn = null, initialAnchorRect = null) {
    if (!targetModelTurn) return;

    // Close any previous popup first
    document.querySelectorAll('.aistu-improve-popup-overlay').forEach(el => el.remove());

    const targetTurnId = getTurnId(targetModelTurn);
    const textTarget = getModelResponseTarget(targetModelTurn) || targetModelTurn.querySelector('.turn-content');
    const currentMarkdown = textTarget ? domToMarkdown(textTarget) : '';
    const currentHtml = extractTurnHtml(targetModelTurn);

    // Ensure current response is recorded in turnHistoryMap
    if (targetTurnId && currentMarkdown.trim()) {
      let historyData = turnHistoryMap.get(targetTurnId);
      if (!historyData) {
        historyData = {
          list: [createHistoryEntry(currentMarkdown, currentHtml)],
          currentIndex: 0
        };
        turnHistoryMap.set(targetTurnId, historyData);
      } else {
        historyData.list[historyData.currentIndex] = createHistoryEntry(currentMarkdown, currentHtml);
      }
    }

    const session = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      openedAt: Date.now(),
      phase: 'initializing',
      cancelled: false,
      executed: false,
      targetModelTurn,
      targetTurnId,
      currentMarkdown,
      currentHtml,
      modelState: null,
      originalThinkingLevel: '',
      thinkingRestored: false,
      restorePromise: null,
      baselineTurns: new Set(getAllCanonicalTurnsInDom()),
      stealthTurns: [],
      turnsToDelete: [],
      improveThoughtTurns: [],
      preImproveTurns: null,
      foundImproveUserTurn: null,
      promotedModelTurn: null
    };
    activeImproveSession = session;

    const popupTitle = t('improve_popup_title', 'Bạn muốn cải thiện câu trả lời như thế nào?');
    const waitingText = t(
      'improve_popup_waiting',
      'Đợi AI đưa ra đề xuất... thời gian chờ sẽ phụ thuộc vào model bạn đã chọn'
    );
    const customPlaceholder = t('improve_popup_custom_placeholder', 'Tự nhập yêu cầu cải thiện khác...');
    const submitTitle = t('improve_popup_submit_title', 'Thực thi cải thiện ngay (Enter)');
    const closeTitle = t('improve_popup_close_title', 'Đóng & huỷ đề xuất (Esc)');

    const overlay = document.createElement('div');
    overlay.className = 'aistu-improve-popup-overlay';
    overlay.innerHTML = `
      <div class="aistu-improve-popup-card" role="dialog" aria-modal="false" aria-label="${popupTitle}">
        <div class="aistu-improve-popup-header">
          <div class="aistu-improve-popup-title-wrap">
            <span class="aistu-improve-popup-badge" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width: 13px; height: 13px;">
                <path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3z"></path>
              </svg>
            </span>
            <h3 class="aistu-improve-popup-title">${popupTitle}</h3>
          </div>
          <button type="button" class="aistu-improve-close-btn" title="${closeTitle}" aria-label="${closeTitle}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width: 13px; height: 13px;">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="aistu-improve-popup-body">
          <div class="aistu-improve-dynamic-area">
            <div class="aistu-improve-loading">
              <div class="aistu-improve-spinner" aria-hidden="true"></div>
              <p class="aistu-improve-loading-text">${waitingText}</p>
            </div>
          </div>
          <div class="aistu-improve-custom-row">
            <input type="text" class="aistu-improve-custom-input" placeholder="${customPlaceholder}" spellcheck="false" autocomplete="off" />
            <button type="button" class="aistu-improve-submit-btn" title="${submitTitle}" aria-label="${submitTitle}" disabled>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const cardEl = overlay.querySelector('.aistu-improve-popup-card');
    const closeBtn = overlay.querySelector('.aistu-improve-close-btn');
    const dynamicArea = overlay.querySelector('.aistu-improve-dynamic-area');
    const customInput = overlay.querySelector('.aistu-improve-custom-input');
    const submitBtn = overlay.querySelector('.aistu-improve-submit-btn');

    const updateCardPosition = () => {
      positionImprovePopoverCard(cardEl, anchorBtn, initialAnchorRect);
    };
    updateCardPosition();
    requestAnimationFrame(updateCardPosition);
    window.addEventListener('resize', updateCardPosition, { passive: true });

    const cleanupOverlayListeners = () => {
      document.removeEventListener('keydown', onPopupKeydown, true);
      window.removeEventListener('resize', updateCardPosition);
      if (overlay.parentNode) overlay.remove();
    };

    const restoreModelAndThinkingState = async (settleThinkingMs = 0, shouldAbortFn = () => false) => {
      if (session.restorePromise) {
        await session.restorePromise;
        return;
      }
      const doRestore = async () => {
        try {
          if (session.modelState && !session.modelState.restored) {
            await restoreOriginalModelStealth(session.modelState);
            await new Promise(r => setTimeout(r, 220));
          }
          if (session.originalThinkingLevel && !session.thinkingRestored) {
            await switchThinkingLevelWithVerification(session.originalThinkingLevel, settleThinkingMs, shouldAbortFn);
            session.thinkingRestored = true;
          } else if (settleThinkingMs > 0) {
            await sleepInterruptible(settleThinkingMs, shouldAbortFn);
          }
        } finally {
          unfreezeModelSelectorUI();
          unfreezeThinkingLevelUI();
        }
      };
      session.restorePromise = doRestore();
      await session.restorePromise;
      session.restorePromise = null;
    };

    const cancelImproveSession = async () => {
      if (session.cancelled || session.executed) return;
      session.cancelled = true;
      cleanupOverlayListeners();

      try {
        await stopNativeGenerationIfRunning();
        scanAndHideStealthTurns();

        // Allow Angular 180ms to finalize any aborted stealth turn and mount its more_vert button
        await new Promise(r => setTimeout(r, 180));
        scanAndHideStealthTurns();

        await restoreModelAndThinkingState(0, () => false);

        await purgeAllKeywordStealthTurns(session);
        // Second silent sweep 350ms later to catch any trailing chunk mounted right after stream stop
        setTimeout(() => {
          purgeAllKeywordStealthTurns(session);
        }, 350);
      } finally {
        unfreezeModelSelectorUI();
        unfreezeThinkingLevelUI();
        if (activeImproveSession === session) {
          activeImproveSession = null;
        }
        handleTurnsHistoryEvents();
      }
    };

    const executeImprovementChoice = async chosenInstruction => {
      const instruction = String(chosenInstruction || '').trim();
      if (!instruction || session.cancelled || session.executed) return;
      session.executed = true;
      cleanupOverlayListeners();

      try {
        // 1. If the suggestion turn was still generating when user submitted custom text, stop it first
        if (isNativeGenerationRunning()) {
          await stopNativeGenerationIfRunning();
          await new Promise(r => setTimeout(r, 140));
        }
        scanAndHideStealthTurns();

        // 2. Allocate <Y+1/Y+1> history slot on targetTurnId and animate swipe-out on current turn
        let historyData = targetTurnId ? turnHistoryMap.get(targetTurnId) : null;
        if (targetTurnId) {
          if (!historyData) {
            historyData = {
              list: [createHistoryEntry(currentMarkdown, currentHtml)],
              currentIndex: 0
            };
            turnHistoryMap.set(targetTurnId, historyData);
          } else if (currentMarkdown.trim()) {
            historyData.list[historyData.currentIndex] = createHistoryEntry(currentMarkdown, currentHtml);
          }

          // Always append at the end of list so <X/Y> jumps to <Y+1/Y+1>
          historyData.list.push(createHistoryEntry('', ''));
          historyData.currentIndex = historyData.list.length - 1;
          historyData.newSlotAllocated = true;
          historyData.waitingForNewGeneration = true;
          historyData.sawClearOrThink = true;
          historyData.lastKnownText = currentMarkdown;
          updateNavigatorUI(targetModelTurn, historyData);
        }

        const oldTurnContent = targetModelTurn.querySelector('.turn-content');
        if (oldTurnContent) {
          oldTurnContent.classList.add('aistu-slide-left-out');
        }

        // 3. Guarantee original Model AND original Thinking Level are restored before generating final response
        await restoreModelAndThinkingState(400, () => false);

        // 4. Immediately hide the old Model turn (both prompt chunk AND thought chunk!) + all suggestion turns
        // right when the new turn is about to start thinking and generating
        const oldThoughtTurns = findPrecedingThoughtTurnsForModelTurn(targetModelTurn);
        const turnsToDelete = [];

        oldThoughtTurns.forEach(t => {
          markTurnAsStealth(t, true);
          if (!turnsToDelete.includes(t)) turnsToDelete.push(t);
        });

        markTurnAsStealth(targetModelTurn, false);
        if (!turnsToDelete.includes(targetModelTurn)) {
          turnsToDelete.push(targetModelTurn);
        }

        session.stealthTurns.forEach(t => {
          markTurnAsStealth(t, isThoughtOnlyTurn(t));
          if (!turnsToDelete.includes(t)) turnsToDelete.push(t);
        });

        session.turnsToDelete = turnsToDelete;
        session.preImproveTurns = new Set(getAllCanonicalTurnsInDom());
        session.phase = 'generating-improved';

        // 5. Send the hidden improvement request turn (using the restored original Model & original Thinking Level)
        const improvePrompt = buildStealthImprovementRequestPrompt(instruction);
        await sendStealthPromptTurn(improvePrompt);
        scanAndHideStealthTurns();

        // 6. Monitor the new turn as it thinks and streams, keeping <Y+1/Y+1> attached to the new Model turn,
        // and once generation completes, delete all hidden turns AND the Think chunk in the background
        const waitGenStart = Date.now();
        let sawGenerationActive = false;
        while (Date.now() - waitGenStart < 120000) {
          scanAndHideStealthTurns();
          handleTurnsHistoryEvents();

          const running = isNativeGenerationRunning();
          if (running) sawGenerationActive = true;

          const promoted = session.promotedModelTurn;
          const promotedText = promoted
            ? domToMarkdown(getModelResponseTarget(promoted) || promoted.querySelector('.turn-content'))
            : '';

          if (
            promoted &&
            promotedText.trim().length > 0 &&
            !running &&
            (sawGenerationActive || Date.now() - waitGenStart > 1800)
          ) {
            break;
          }
          await new Promise(r => setTimeout(r, 120));
        }

        // Give AI Studio 250ms to finalize turn DOM before background deletion of hidden turns + Think chunk
        await new Promise(r => setTimeout(r, 250));
        const finalCleanupList = [...session.turnsToDelete, ...session.improveThoughtTurns];
        if (session.promotedModelTurn) {
          findPrecedingThoughtTurnsForModelTurn(session.promotedModelTurn).forEach(t => {
            if (!finalCleanupList.includes(t)) finalCleanupList.push(t);
          });
        }
        await purgeAllKeywordStealthTurns(session, finalCleanupList);
      } finally {
        if (activeImproveSession === session) {
          activeImproveSession = null;
        }
        handleTurnsHistoryEvents();
      }
    };

    const renderSuggestionButtons = suggestions => {
      if (session.cancelled || session.executed || !overlay.parentNode) return;
      const finalOptions =
        Array.isArray(suggestions) && suggestions.length > 0
          ? suggestions.slice(0, 5)
          : [
              t('improve_fallback_1', 'Phân tích sâu và chi tiết hơn'),
              t('improve_fallback_2', 'Ngắn gọn, súc tích trọng tâm'),
              t('improve_fallback_3', 'Thêm ví dụ thực tế cụ thể'),
              t('improve_fallback_4', 'Diễn đạt tự nhiên, cuốn hút hơn'),
              t('improve_fallback_5', 'Trình bày mạch lạc từng bước')
            ];

      const listEl = document.createElement('div');
      listEl.className = 'aistu-improve-options-list';

      finalOptions.forEach((optText, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'aistu-improve-option-btn';
        btn.title = optText;
        btn.innerHTML = `
          <span class="aistu-improve-option-start">
            <span class="aistu-improve-option-index">${idx + 1}</span>
            <span class="aistu-improve-option-text"></span>
          </span>
          <svg class="aistu-improve-option-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        `;
        const textSpan = btn.querySelector('.aistu-improve-option-text');
        if (textSpan) textSpan.textContent = optText;
        btn.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          executeImprovementChoice(optText);
        });
        listEl.appendChild(btn);
      });

      dynamicArea.innerHTML = '';
      dynamicArea.appendChild(listEl);
      updateCardPosition();
      requestAnimationFrame(updateCardPosition);
    };

    const onPopupKeydown = e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cancelImproveSession();
      }
    };
    document.addEventListener('keydown', onPopupKeydown, true);

    closeBtn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      cancelImproveSession();
    });

    const onOutsideOverlayTrigger = e => {
      if (e.target === overlay && !cardEl.contains(e.target)) {
        if (Date.now() - session.openedAt < 80) return;
        e.preventDefault();
        e.stopPropagation();
        cancelImproveSession();
      }
    };
    overlay.addEventListener('pointerdown', onOutsideOverlayTrigger);
    overlay.addEventListener('click', onOutsideOverlayTrigger);

    customInput.addEventListener('input', () => {
      submitBtn.disabled = !customInput.value.trim();
    });

    customInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        const val = customInput.value.trim();
        if (val) {
          e.preventDefault();
          e.stopPropagation();
          executeImprovementChoice(val);
        }
      }
    });

    submitBtn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      const val = customInput.value.trim();
      if (val) {
        executeImprovementChoice(val);
      }
    });

    // Start background AI suggestion flow:
    // 1. Mount Run Settings & freeze Model Selector UI & Thinking Level UI
    const { selectEl } = await ensureThinkingSelectMounted();
    if (session.cancelled || session.executed) return;

    const initialLevel = getThinkingSelectCurrentLabel(selectEl);
    session.originalThinkingLevel = initialLevel;
    freezeModelSelectorUI();
    if (initialLevel) {
      freezeThinkingLevelUI(initialLevel);
    }

    // 2. Switch Model to gemini-3.1-flash-lite FIRST, then select "Minimal" Thinking Level
    session.modelState = await switchModelToFlashLiteStealth('gemini-3.1-flash-lite');
    if (session.cancelled || session.executed) {
      await restoreOriginalModelStealth(session.modelState);
      return;
    }
    freezeModelSelectorUI();
    await sleepInterruptible(240, () => session.cancelled || session.executed);
    if (session.cancelled || session.executed) {
      await restoreOriginalModelStealth(session.modelState);
      return;
    }

    if (initialLevel) {
      freezeThinkingLevelUI(initialLevel);
    }
    await switchThinkingLevelWithVerification(
      'Minimal',
      600,
      () => session.cancelled || session.executed
    );

    if (session.cancelled || session.executed) {
      await restoreModelAndThinkingState(0, () => false);
      return;
    }

    // 3. Send hidden suggestion turn and listen to both network stream payload and DOM
    let networkCapturedText = '';
    const onResponsePayload = e => {
      const body = e?.detail?.body;
      const extracted = extractModelAnswerFromPayloadBody(body);
      if (extracted) {
        networkCapturedText = extracted;
      }
    };
    const onXhrCapture = e => {
      const txt = e?.detail?.text;
      if (typeof txt === 'string' && txt.includes(STEALTH_SUGGEST_START_TAG)) {
        networkCapturedText = txt;
      }
    };
    window.addEventListener('__sl_responsePayload', onResponsePayload);
    window.addEventListener('__aisu_xhrCapture', onXhrCapture);

    try {
      session.baselineTurns = new Set(getAllCanonicalTurnsInDom());
      session.phase = 'requesting-suggestions';
      const suggestPrompt = buildContextAwareSuggestionPrompt();
      const sentOk = await sendStealthPromptTurn(suggestPrompt, () => session.cancelled || session.executed);
      if (!sentOk || session.cancelled || session.executed) return;
      scanAndHideStealthTurns();

      // 4. Poll hidden model response for [[SL_SUGGEST_START]]...[[SL_SUGGEST_END]]
      const pollStart = Date.now();
      let parsedSuggestions = [];
      let lastCleanText = '';
      let lastTextChangedAt = 0;

      while (Date.now() - pollStart < 45000) {
        if (session.cancelled || session.executed) return;
        scanAndHideStealthTurns();

        let latestCleanText = networkCapturedText || '';

        // Also inspect stealth model turns in DOM
        for (const stTurn of session.stealthTurns) {
          if (!isUserChatTurn(stTurn)) {
            const cleanText = extractCleanStealthModelText(stTurn);
            if (!cleanText) continue;
            if (!latestCleanText || cleanText.includes(STEALTH_SUGGEST_END_TAG)) {
              latestCleanText = cleanText;
            }
          }
        }

        if (latestCleanText && latestCleanText.includes(STEALTH_SUGGEST_END_TAG)) {
          const candidate = parseSuggestionsFromStealthText(latestCleanText, false);
          if (candidate.length >= 3) {
            parsedSuggestions = candidate;
            break;
          }
        }

        if (latestCleanText && latestCleanText !== lastCleanText) {
          lastCleanText = latestCleanText;
          lastTextChangedAt = Date.now();
        }

        const running = isNativeGenerationRunning();
        // If network payload already arrived or text has stabilized while not running
        if (
          lastCleanText &&
          (networkCapturedText || (!running && lastTextChangedAt > 0 && Date.now() - lastTextChangedAt >= 550 && Date.now() - pollStart > 1800))
        ) {
          const candidate = parseSuggestionsFromStealthText(lastCleanText, false);
          if (candidate.length >= 3) {
            parsedSuggestions = candidate;
            break;
          }
          if (!running && Date.now() - lastTextChangedAt >= 1200) {
            parsedSuggestions = candidate;
            break;
          }
        }

        await new Promise(r => setTimeout(r, 80));
      }

      if (session.cancelled || session.executed) return;

      renderSuggestionButtons(parsedSuggestions);
    } finally {
      window.removeEventListener('__sl_responsePayload', onResponsePayload);
      window.removeEventListener('__aisu_xhrCapture', onXhrCapture);
    }

    // 5. Immediately once suggestions are generated:
    //    - Wait briefly for stream completion if still wrapping up
    //    - Restore original Model & original Thinking Level so they are ready for the user's choice
    //    - Delete the stealth suggestion turns and unfreeze Prompt Bar
    if (!session.cancelled && !session.executed) {
      const waitFinishStart = Date.now();
      while (isNativeGenerationRunning() && Date.now() - waitFinishStart < 800) {
        if (session.cancelled || session.executed) break;
        await new Promise(r => setTimeout(r, 40));
      }
      if (!session.cancelled && !session.executed) {
        await restoreModelAndThinkingState(350, () => session.cancelled || session.executed);
      }
      if (!session.cancelled && !session.executed) {
        await purgeAllKeywordStealthTurns(session);
      }
    }
  }

  function onGlobalPointerDown(e) {
    if (!isMultipleResponseEnabled()) return;
    if (e.button !== undefined && e.button !== 0) return;

    const prevBtn = e.target.closest?.('.aistu-nav-prev');
    if (prevBtn) {
      if (prevBtn.disabled) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      lastNavPointerDownAt = Date.now();
      stepTurnHistory(prevBtn, 'prev');
      return;
    }

    const nextBtn = e.target.closest?.('.aistu-nav-next');
    if (nextBtn) {
      if (nextBtn.disabled) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      lastNavPointerDownAt = Date.now();
      stepTurnHistory(nextBtn, 'next');
      return;
    }

    // 500ms Long-Press Detection on Rerun Button with Radial Progress Ring
    const rerunBtn = e.target.closest?.(
      'button[name="rerun-button"], ms-button[name="rerun-button"], .rerun-button, [aria-label*="Rerun" i]'
    );
    if (rerunBtn && !rerunBtn.disabled && rerunBtn.getAttribute('aria-disabled') !== 'true') {
      clearRerunHoldState();
      suppressActiveHoldRelease = false;
      activeHoldRerunBtn = rerunBtn;
      rerunBtn.classList.add('aistu-rerun-hold-active');

      const initialBtnRect = rerunBtn.getBoundingClientRect();
      const savedAnchorRect = initialBtnRect
        ? {
            top: initialBtnRect.top,
            bottom: initialBtnRect.bottom,
            left: initialBtnRect.left,
            right: initialBtnRect.right,
            width: initialBtnRect.width,
            height: initialBtnRect.height
          }
        : null;

      const ringSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      ringSvg.setAttribute('class', 'aistu-rerun-hold-ring');
      ringSvg.setAttribute('viewBox', '0 0 32 32');
      ringSvg.innerHTML = `<circle cx="16" cy="16" r="14"></circle>`;
      rerunBtn.appendChild(ringSvg);

      const cleanupListeners = () => {
        window.removeEventListener('pointerup', onReleaseBeforeHold, true);
        window.removeEventListener('pointercancel', onReleaseBeforeHold, true);
        rerunBtn.removeEventListener('pointerleave', onReleaseBeforeHold, true);
      };

      const onReleaseBeforeHold = () => {
        cleanupListeners();
        clearRerunHoldState();
      };

      window.addEventListener('pointerup', onReleaseBeforeHold, true);
      window.addEventListener('pointercancel', onReleaseBeforeHold, true);
      rerunBtn.addEventListener('pointerleave', onReleaseBeforeHold, true);

      rerunHoldTimer = setTimeout(() => {
        cleanupListeners();
        clearRerunHoldState();
        suppressActiveHoldRelease = true;
        suppressNextRerunClickUntil = Date.now() + 8000;
        rerunBtn._aistuSuppressClick = true;

        // Swallow the upcoming pointerup/mouseup/click when user finishes releasing the long-press
        const swallowHoldRelease = ev => {
          ev.preventDefault();
          ev.stopPropagation();
          ev.stopImmediatePropagation();
        };
        const releaseFinishCleanup = () => {
          setTimeout(() => {
            suppressActiveHoldRelease = false;
            window.removeEventListener('pointerup', swallowHoldRelease, true);
            window.removeEventListener('mouseup', swallowHoldRelease, true);
          }, 120);
        };
        window.addEventListener('pointerup', swallowHoldRelease, true);
        window.addEventListener('mouseup', swallowHoldRelease, true);
        window.addEventListener('pointerup', releaseFinishCleanup, { capture: true, once: true });
        window.addEventListener('mouseup', releaseFinishCleanup, { capture: true, once: true });

        const targetModelTurn = resolveTargetModelTurnFromRerunBtn(rerunBtn);
        if (targetModelTurn) {
          openImproveResponsePopup(targetModelTurn, rerunBtn, savedAnchorRect);
        }
      }, RERUN_HOLD_MS);
    }
  }

  function onGlobalClick(e) {
    // 0. Intercept user click on Edit button (button.toggle-edit-button) for both User & Model turns
    const editToggleBtn = e.target.closest?.(
      '.actions.hover-or-edit button.toggle-edit-button, .actions-container button.toggle-edit-button, button.toggle-edit-button'
    );
    if (editToggleBtn && e.isTrusted) {
      const targetTurn = getCanonicalTurnElement(editToggleBtn);
      if (
        targetTurn &&
        !targetTurn._aistuProgrammaticEdit &&
        !targetTurn.classList.contains('aistu-editing-silent') &&
        !isThoughtOnlyTurn(targetTurn) &&
        !targetTurn.querySelector('textarea')
      ) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        openMarkdownEditModal(targetTurn);
        return;
      }
    }

    if (!isMultipleResponseEnabled()) return;

    // 1. Detect User clicked Run/Send button
    const runBtn = e.target.closest?.('ms-run-button, .run-button, button[aria-label*="Run" i], button[title*="Run" i], button[aria-label*="Send" i]');
    const isRerun = e.target.closest?.('button[name="rerun-button"], ms-button[name="rerun-button"], .rerun-button, [aria-label*="Rerun" i]');
    if (runBtn && !isRerun && !isSendingStealthMessage && !activeImproveSession) {
      const inputEl = findInputArea();
      const textValue = getDraftValue(inputEl);
      if (textValue.trim()) {
        handleUserSentNewMessage();
      }
    }

    // 2. Intercept Rerun button click synchronously
    const rerunBtn = e.target.closest?.('button[name="rerun-button"], ms-button[name="rerun-button"], .rerun-button, [aria-label*="Rerun" i]');
    if (rerunBtn || suppressActiveHoldRelease || Date.now() < suppressNextRerunClickUntil) {
      if (
        suppressActiveHoldRelease ||
        (rerunBtn && rerunBtn._aistuSuppressClick) ||
        Date.now() < suppressNextRerunClickUntil ||
        activeImproveSession
      ) {
        if (rerunBtn) rerunBtn._aistuSuppressClick = false;
        suppressNextRerunClickUntil = 0;
        suppressActiveHoldRelease = false;
        if (rerunBtn || e.target?.closest?.('.aistu-improve-popup-overlay') === null) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return;
        }
      }
      if (!rerunBtn) return;
      clearRerunHoldState();

      const targetModelTurn = resolveTargetModelTurnFromRerunBtn(rerunBtn);
      const rawTurn = rerunBtn.closest('ms-chat-turn, [data-turn-role], .chat-turn-container, .model-prompt-container');
      const clickedTurn = getCanonicalTurnElement(rawTurn);
      if (clickedTurn) {
        const clickedTurnId = getTurnId(clickedTurn);
        const effectiveTurnId = (targetModelTurn ? getTurnId(targetModelTurn) : null) || clickedTurnId;
        if (effectiveTurnId) {
          let historyData = turnHistoryMap.get(effectiveTurnId);
          const textTarget = targetModelTurn ? getModelResponseTarget(targetModelTurn) : null;
          const currentMarkdown = textTarget ? domToMarkdown(textTarget) : '';
          const currentHtml = targetModelTurn ? extractTurnHtml(targetModelTurn) : '';

          if (!historyData) {
            if (currentMarkdown.trim()) {
              historyData = {
                list: [createHistoryEntry(currentMarkdown, currentHtml)],
                currentIndex: 0
              };
              turnHistoryMap.set(effectiveTurnId, historyData);
            }
          } else if (currentMarkdown.trim()) {
            historyData.list[historyData.currentIndex] = createHistoryEntry(currentMarkdown, currentHtml);
          }

          if (historyData) {
            historyData.waitingForNewGeneration = true;
            historyData.newSlotAllocated = false;
            historyData.sawClearOrThink = false;
            historyData.lastKnownText = currentMarkdown.trim()
              ? currentMarkdown
              : getEntryMarkdown(historyData.list[historyData.currentIndex]);
          }
        }
      }
      return;
    }

    // 3. Inline prev arrow click (fallback for keyboard activation if pointerdown didn't just handle it)
    const prevBtn = e.target.closest?.('.aistu-nav-prev');
    if (prevBtn) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (Date.now() - lastNavPointerDownAt < 350) return;
      stepTurnHistory(prevBtn, 'prev');
      return;
    }

    // 4. Inline next arrow click (fallback for keyboard activation if pointerdown didn't just handle it)
    const nextBtn = e.target.closest?.('.aistu-nav-next');
    if (nextBtn) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (Date.now() - lastNavPointerDownAt < 350) return;
      stepTurnHistory(nextBtn, 'next');
    }
  }

  function onGlobalKeydown(e) {
    if (!isMultipleResponseEnabled()) return;
    if (e.key === 'Enter' && !e.shiftKey && !isSendingStealthMessage && !activeImproveSession) {
      const activeEl = document.activeElement;
      if (activeEl) {
        const isInputLike = activeEl.tagName === 'TEXTAREA' ||
                            activeEl.tagName === 'INPUT' ||
                            activeEl.getAttribute('contenteditable') === 'true';
        if (isInputLike) {
          const isPromptInput = activeEl.closest('ms-prompt-input, ms-prompt-box, .prompt-input-wrapper') ||
                                activeEl.placeholder?.toLowerCase().includes('type') ||
                                activeEl.getAttribute('aria-label')?.toLowerCase().includes('prompt');
          if (isPromptInput) {
            const textValue = getDraftValue(activeEl);
            if (textValue.trim()) {
              handleUserSentNewMessage();
            }
          }
        }
      }
    }
  }

  function onLanguageChanged() {
    const olderLabel = t('nav_older_response', 'Phản hồi cũ hơn');
    const newerLabel = t('nav_newer_response', 'Phản hồi mới hơn');
    document.querySelectorAll('.aistu-history-navigator').forEach(nav => {
      const prevBtn = nav.querySelector('.aistu-nav-prev');
      const nextBtn = nav.querySelector('.aistu-nav-next');
      if (prevBtn) {
        prevBtn.title = olderLabel;
        prevBtn.setAttribute('aria-label', olderLabel);
      }
      if (nextBtn) {
        nextBtn.title = newerLabel;
        nextBtn.setAttribute('aria-label', newerLabel);
      }
    });
  }

  function attachListeners() {
    if (globalListenersAttached) return;
    document.addEventListener('pointerdown', onGlobalPointerDown, true);
    document.addEventListener('click', onGlobalClick, true);
    document.addEventListener('keydown', onGlobalKeydown, true);
    window.addEventListener('__sl_languageChanged', onLanguageChanged);
    globalListenersAttached = true;
  }

  function detachListeners() {
    if (!globalListenersAttached) return;
    document.removeEventListener('pointerdown', onGlobalPointerDown, true);
    document.removeEventListener('click', onGlobalClick, true);
    document.removeEventListener('keydown', onGlobalKeydown, true);
    window.removeEventListener('__sl_languageChanged', onLanguageChanged);
    globalListenersAttached = false;
  }

  let mutationScheduled = false;
  function startObserver() {
    if (observer) return;
    const mount = () => {
      if (!document.body) {
        requestAnimationFrame(mount);
        return;
      }
      scanAndHideStealthTurns();
      optimizeRerunButtons();
      handleTurnsHistoryEvents();
      observer = new MutationObserver(() => {
        scanAndHideStealthTurns();
        if (window.StudioLab.ChatCleanup?.isRunning?.()) return;
        if (mutationScheduled) return;
        mutationScheduled = true;
        requestAnimationFrame(() => {
          mutationScheduled = false;
          scanAndHideStealthTurns();
          optimizeRerunButtons();
          handleTurnsHistoryEvents();
        });
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    };
    mount();
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  window.StudioLab.registerModule({
    id: 'response-history',
    group: 'modules',
    order: 4,
    title: 'Multiple Response Options (Xem & Chọn phản hồi tốt nhất)',
    subtitle: 'Keep response variants on regenerate and switch between them with <X/Y>.',
    stateKey: 'multipleResponseEnabled',
    defaults: {
      multipleResponseEnabled: true
    },
    init(ctx) {
      ctxRef = ctx;
      attachListeners();
      startObserver();
    },
    onStateChange(ctx) {
      ctxRef = ctx;
      optimizeRerunButtons();
      handleTurnsHistoryEvents();
    },
    onRouteChange(ctx) {
      ctxRef = ctx;
      optimizeRerunButtons();
      handleTurnsHistoryEvents();
    },
    dispose() {
      stopObserver();
      detachListeners();
      clearRerunHoldState();
      unfreezeThinkingLevelUI();
      document.querySelectorAll('.aistu-history-navigator, .aistu-improve-popup-overlay').forEach(el => el.remove());
    }
  });
})();
