// Chat Cleanup & Share Fix module ported from Your Aistu Chan to Studio.lab Tools.
// Includes: Auto-delete Think (default off, numeric delay input), Delete All (Think, Media, Code) with Progress Overlay, and Fix Share Chat Error.
(function () {
  'use strict';

  if (!window.StudioLab || typeof window.StudioLab.registerModule !== 'function') return;
  const { $, scope } = window.StudioLabCore;

  let ctxRef = null;
  let deletionQueuePromise = Promise.resolve();
  let isBulkCleanupRunning = false;
  let autoDeleteTimer = null;
  let lastKnownRunBtnState = 'run';
  let statusPollInterval = null;

  const THOUGHT_SELECTOR = 'ms-thought-chunk, .thought-panel, .thought-chunk, .thought-activity-host';

  const MEDIA_CHUNK_SELECTOR = [
    'ms-image-chunk',
    'ms-file-chunk',
    'ms-audio-chunk',
    'ms-video-chunk',
    'ms-media-chunk',
    'ms-drive-file-chunk',
    'ms-pdf-chunk',
    'ms-document-chunk',
    'ms-youtube-chunk',
    'ms-multimedia-chunk',
    'ms-download-chunk',
    'ms-chunk-media',
    'ms-media-chip',
    'ms-file-chip',
    'ms-image-chip',
    'ms-audio-chip',
    'ms-video-chip',
    'ms-drive-chip',
    'ms-attachment-chunk',
    'ms-inline-data-chunk',
    '[class*="-image-chunk"]',
    '[class*="-file-chunk"]',
    '[class*="-audio-chunk"]',
    '[class*="-video-chunk"]',
    '[class*="-media-chunk"]',
    '.image-chunk',
    '.file-chunk',
    '.audio-chunk',
    '.video-chunk',
    '.media-chunk',
    'ms-chat-turn .turn-content img:not([class*="avatar"])',
    'ms-chat-turn .turn-content .image-container',
    'ms-chat-turn .turn-content .media-container',
    'ms-chat-turn .turn-content .file-container',
    'ms-chat-turn .turn-content video',
    'ms-chat-turn .turn-content audio'
  ].join(', ');

  const CODE_EXECUTION_SELECTOR = [
    'ms-code-execution-chunk',
    'ms-function-call-chunk',
    'ms-function-response-chunk',
    'ms-code-block[data-test-language="Executable code"]',
    'ms-code-block[data-test-language="Code execution result"]',
    'ms-executable-code-chunk',
    'ms-code-execution-result-chunk',
    '[class*="code-execution"]'
  ].join(', ');

  function t(key, fallback) {
    return window.StudioLab.i18n ? window.StudioLab.i18n.t(key, fallback) : (fallback || key);
  }

  function fastTick() {
    return new Promise(resolve => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => resolve();
      channel.port2.postMessage(null);
    });
  }

  function waitForPaint() {
    return new Promise(resolve => {
      requestAnimationFrame(() => setTimeout(resolve, 16));
    });
  }

  async function deleteChatTurn(chatTurn) {
    if (!chatTurn || !document.body.contains(chatTurn)) return false;

    const actionsContainer = chatTurn.querySelector('.actions, [class*="actions"]');
    let targetButton = null;

    if (actionsContainer) {
      const buttons = Array.from(actionsContainer.querySelectorAll('button, ms-button'));
      targetButton = buttons.find(b => {
        const text = b.textContent || '';
        return text.includes('more_vert') ||
          b.querySelector('mat-icon')?.textContent?.includes('more_vert') ||
          b.querySelector('.material-symbols-outlined')?.textContent?.includes('more_vert');
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

    if (!targetButton) return false;

    targetButton.click();

    let deleteOption = null;
    for (let i = 0; i < 40; i++) {
      const menuItems = document.querySelectorAll('.mat-mdc-menu-item, [role="menuitem"], button[mat-menu-item], .mat-menu-item');
      for (let j = 0; j < menuItems.length; j++) {
        const item = menuItems[j];
        const text = (item.textContent || '').toLowerCase();
        const iconText = (item.querySelector('.material-symbols-outlined, mat-icon')?.textContent || '').toLowerCase();
        if (text.includes('delete') || text.includes('xoá') || text.includes('xóa') || iconText === 'delete') {
          deleteOption = item;
          break;
        }
      }
      if (deleteOption) break;
      if (i < 6) await fastTick();
      else await new Promise(resolve => setTimeout(resolve, 4));
    }

    if (!deleteOption) {
      document.body.click();
      return false;
    }

    deleteOption.click();

    if (!document.body.contains(chatTurn)) return true;

    for (let i = 0; i < 30; i++) {
      if (!document.body.contains(chatTurn)) return true;
      const dialog = document.querySelector('mat-dialog-container, .mat-mdc-dialog-container, mdc-dialog, [role="dialog"]');
      if (dialog && !dialog.classList.contains('sl-dialog')) {
        const dialogButtons = dialog.querySelectorAll('button');
        for (let j = 0; j < dialogButtons.length; j++) {
          const b = dialogButtons[j];
          const text = (b.textContent || '').toLowerCase();
          if ((text.includes('delete') || text.includes('xoá') || text.includes('xóa')) && !text.includes('cancel')) {
            b.click();
            break;
          }
        }
      }
      if (i < 8) await fastTick();
      else await new Promise(resolve => setTimeout(resolve, 4));
    }

    return !document.body.contains(chatTurn);
  }

  function enableCompactChatScanMode() {
    isBulkCleanupRunning = true;
    let styleEl = document.getElementById('aistu-compact-scan-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'aistu-compact-scan-style';
      styleEl.textContent = `
        body.aistu-compact-scan-active ms-app *,
        body.aistu-compact-scan-active ms-app *::before,
        body.aistu-compact-scan-active ms-app *::after,
        body.aistu-compact-scan-active .cdk-overlay-container *,
        body.aistu-compact-scan-active .mat-mdc-menu-panel,
        body.aistu-compact-scan-active .mat-mdc-dialog-container {
          transition: none !important;
          transition-duration: 0s !important;
          animation-duration: 0s !important;
          transition-delay: 0s !important;
          animation-delay: 0s !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          box-shadow: none !important;
          text-shadow: none !important;
          filter: none !important;
        }
        body.aistu-compact-scan-active .cdk-overlay-container {
          opacity: 0 !important;
          pointer-events: none !important;
        }
        body.aistu-compact-scan-active cdk-virtual-scroll-viewport,
        body.aistu-compact-scan-active .ms-autoscroll-container,
        body.aistu-compact-scan-active ms-chat-session {
          opacity: 0 !important;
          pointer-events: none !important;
        }
        body.aistu-compact-scan-active ms-chat-turn[data-sl-buffered-turn] {
          display: block !important;
        }
        body.aistu-compact-scan-active ms-chat-turn,
        body.aistu-compact-scan-active .chat-turn-container {
          display: block !important;
          content-visibility: visible !important;
          height: 6px !important;
          min-height: 6px !important;
          max-height: 6px !important;
          padding: 0 !important;
          margin: 0 !important;
          border: none !important;
          background: transparent !important;
          transform: none !important;
          overflow: hidden !important;
          contain: layout style paint !important;
        }
        body.aistu-compact-scan-active ms-chat-turn::before,
        body.aistu-compact-scan-active ms-chat-turn::after,
        body.aistu-compact-scan-active .chat-turn-container::before,
        body.aistu-compact-scan-active .chat-turn-container::after,
        body.aistu-compact-scan-active ms-chat-turn .turn-content,
        body.aistu-compact-scan-active .chat-turn-container .turn-content,
        body.aistu-compact-scan-active ms-chat-turn .author-label,
        body.aistu-compact-scan-active ms-chat-turn .role-header,
        body.aistu-compact-scan-active ms-chat-turn .aistu-history-navigator {
          display: none !important;
        }
        #aistu-cleanup-progress-overlay,
        #aistu-cleanup-progress-overlay * {
          visibility: visible !important;
        }
      `;
      document.head.appendChild(styleEl);
    }
    document.body.classList.add('aistu-compact-scan-active');
  }

  function disableCompactChatScanMode() {
    document.body.classList.remove('aistu-compact-scan-active');
    const styleEl = document.getElementById('aistu-compact-scan-style');
    if (styleEl) styleEl.remove();
    isBulkCleanupRunning = false;
  }

  function countDistinctTargetsInTurn(turn, selector) {
    if (!turn) return 0;
    const matched = Array.from(turn.querySelectorAll(selector));
    if (matched.length <= 1) return matched.length;
    const matchedSet = new Set(matched);
    let distinctCount = 0;
    for (const el of matched) {
      let hasMatchedAncestor = false;
      let parent = el.parentElement;
      while (parent && parent !== turn) {
        if (matchedSet.has(parent)) {
          hasMatchedAncestor = true;
          break;
        }
        parent = parent.parentElement;
      }
      if (!hasMatchedAncestor) distinctCount++;
    }
    return distinctCount;
  }

  function createCleanupProgressOverlay(titleText, unitLabel, _accentColor, options = {}) {
    const existing = document.getElementById('aistu-cleanup-progress-overlay');
    if (existing) existing.remove();

    if (!document.getElementById('aistu-modal-animations')) {
      const animStyle = document.createElement('style');
      animStyle.id = 'aistu-modal-animations';
      animStyle.textContent = `
        @keyframes aistu-fade-in {
          from { opacity: 0; transform: scale(0.98) translateY(4px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .aistu-spin {
          animation: aistu-spin-key 0.9s linear infinite !important;
        }
        @keyframes aistu-spin-key {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        #aistu-cleanup-progress-overlay::backdrop {
          background: transparent !important;
        }
      `;
      document.head.appendChild(animStyle);
    }

    const isLight = document.body.classList.contains('light-theme');
    const isPercentMode = options.mode === 'percent';
    const subtitleText = options.subtitleText || t('hud_subtitle_default', 'Khung chat đang được thu nhỏ tối đa để hiển thị và quét toàn bộ phiên hội thoại');
    const cleanTitle = String(titleText || '').replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\s]+/u, '').trim() || titleText;

    // Native Google AI Studio & Studio.lab Material 3 design tokens (flat, no neon glow)
    const overlayBg = isLight ? 'rgba(15, 23, 42, 0.42)' : 'rgba(15, 15, 15, 0.72)';
    const cardBg = isLight ? '#ffffff' : '#282a2c';
    const cardBorder = isLight ? '#dadce0' : '#3c4043';
    const innerBg = isLight ? '#f2f3f5' : '#1f1f1f';
    const textMain = isLight ? '#1f1f1f' : '#e3e3e3';
    const textSub = isLight ? '#555960' : '#b4b7bc';
    const primaryAccent = isLight ? '#0b57d0' : '#a8c7fa';
    const iconBg = isLight ? 'rgba(11, 87, 208, 0.08)' : 'rgba(168, 199, 250, 0.12)';
    const trackBg = isLight ? '#e0e3e7' : '#1f1f1f';

    const overlay = document.createElement('div');
    overlay.id = 'aistu-cleanup-progress-overlay';
    overlay.setAttribute('popover', 'manual');
    overlay.style.cssText = `
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      max-width: 100vw !important;
      max-height: 100vh !important;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      z-index: 2147483647 !important;
      background: ${overlayBg} !important;
      backdrop-filter: blur(4px) !important;
      -webkit-backdrop-filter: blur(4px) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      pointer-events: auto !important;
      opacity: 1 !important;
      visibility: visible !important;
      font-family: 'Google Sans', 'Segoe UI', Inter, Roboto, Arial, sans-serif !important;
    `;

    const card = document.createElement('div');
    card.style.cssText = `
      width: 92vw;
      max-width: 420px;
      background: ${cardBg};
      border: 1px solid ${cardBorder};
      border-radius: 20px;
      padding: 20px 22px;
      box-shadow: ${isLight ? '0 12px 32px rgba(0, 0, 0, 0.14)' : '0 12px 32px rgba(0, 0, 0, 0.45)'};
      color: ${textMain};
      text-align: left;
      box-sizing: border-box;
      animation: aistu-fade-in 0.16s ease-out;
    `;

    card.innerHTML = `
      <div style="display: flex; align-items: flex-start; gap: 14px; margin-bottom: 16px;">
        <div style="display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 38px; border-radius: 10px; background: ${iconBg}; color: ${primaryAccent}; flex-shrink: 0;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="aistu-spin" style="width: 20px; height: 20px;">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
          </svg>
        </div>
        <div style="min-width: 0; flex: 1;">
          <div style="font-size: 15px; font-weight: 600; color: ${textMain}; line-height: 22px; margin-bottom: 2px;">
            ${cleanTitle}
          </div>
          <div style="font-size: 12.5px; color: ${textSub}; line-height: 18px;">
            ${subtitleText}
          </div>
        </div>
      </div>
      <div style="background: ${innerBg}; border-radius: 12px; padding: 12px 14px; margin-bottom: 14px; display: flex; flex-direction: column; gap: 4px;">
        <div id="aistu-cleanup-identified-box" style="font-size: 12.5px; font-weight: 500; color: ${textSub}; line-height: 18px;">
          ${t('hud_unhiding', 'Đang mở ẩn toàn bộ tin nhắn cũ...')}
        </div>
        <div id="aistu-cleanup-progress-text" style="font-size: 13.5px; font-weight: 600; color: ${primaryAccent}; line-height: 20px;">
          ${isPercentMode ? t('hud_fixing', 'Đang xử lý...') : t('hud_preparing', 'Đang chuẩn bị...')}
        </div>
      </div>
      <div style="width: 100%; height: 6px; background: ${trackBg}; border-radius: 999px; overflow: hidden;">
        <div id="aistu-cleanup-progress-bar" style="width: 0%; height: 100%; background: ${primaryAccent}; border-radius: 999px; transition: width 0.08s linear;"></div>
      </div>
    `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    try {
      if (typeof overlay.showPopover === 'function') {
        overlay.showPopover();
      }
    } catch (_) {}

    const identifiedBox = card.querySelector('#aistu-cleanup-identified-box');
    const progressText = card.querySelector('#aistu-cleanup-progress-text');
    const progressBar = card.querySelector('#aistu-cleanup-progress-bar');

    const bringToFront = () => {
      try {
        if (overlay.isConnected && typeof overlay.showPopover === 'function') {
          overlay.hidePopover();
          overlay.showPopover();
        }
      } catch (_) {}
    };

    return {
      bringToFront,
      setScanning() {
        bringToFront();
        if (identifiedBox) {
          identifiedBox.textContent = `${t('hud_scanning', 'Đang quét và xác định số lượng')} ${unitLabel}...`;
        }
      },
      setIdentified(total) {
        bringToFront();
        if (identifiedBox) {
          identifiedBox.textContent = `${t('hud_identified', 'Đã xác định được')} ${total} ${unitLabel}`;
        }
        if (progressText) {
          if (isPercentMode) {
            progressText.textContent = total > 0 ? `0%` : `100%`;
          } else {
            progressText.textContent = total > 0
              ? `${t('hud_deleting', 'Đang tiến hành xóa:')} 0/${total} ${unitLabel}`
              : t('hud_none', 'Không có mục nào cần xóa');
          }
        }
        if (progressBar) {
          progressBar.style.width = total > 0 ? '0%' : '100%';
        }
      },
      setProgress(deleted, total) {
        bringToFront();
        const pct = total > 0 ? Math.min(100, Math.round((deleted / total) * 100)) : 100;
        if (identifiedBox) {
          identifiedBox.textContent = isPercentMode
            ? `${t('hud_identified', 'Đã xác định được')} ${total} ${unitLabel} (${deleted}/${total})`
            : `${t('hud_identified', 'Đã xác định được')} ${total} ${unitLabel}`;
        }
        if (progressText) {
          progressText.textContent = isPercentMode
            ? `${t('hud_processed_pct', 'Đã xử lý')} ${pct}%`
            : `${t('hud_deleting', 'Đang tiến hành xóa:')} ${deleted}/${total} ${unitLabel} (${pct}%)`;
        }
        if (progressBar && total > 0) {
          progressBar.style.width = `${pct}%`;
        }
      },
      setFinished(deleted, total) {
        bringToFront();
        if (identifiedBox) {
          identifiedBox.textContent = isPercentMode
            ? `${t('hud_identified', 'Đã xác định được')} ${total} ${unitLabel} (${deleted}/${total})`
            : `${t('hud_identified', 'Đã xác định được')} ${total} ${unitLabel}`;
        }
        if (progressText) {
          if (isPercentMode) {
            progressText.textContent = t('hud_done_fix', 'Hoàn tất 100%');
          } else {
            progressText.textContent = total > 0
              ? `${t('hud_done_delete', 'Hoàn tất · Đã xóa')} ${deleted}/${total} ${unitLabel}`
              : `${t('hud_identified', 'Đã xác định được')} 0 ${unitLabel}`;
          }
        }
        if (progressBar) {
          progressBar.style.width = '100%';
        }
      },
      close() {
        try {
          if (typeof overlay.hidePopover === 'function') overlay.hidePopover();
        } catch (_) {}
        overlay.remove();
      }
    };
  }

  function getAllScrollableChatContainers() {
    const containers = new Set();
    const primary = document.querySelector('cdk-virtual-scroll-viewport, .ms-autoscroll-container, .scroll-container, ms-chat-session, main');
    if (primary) containers.add(primary);
    document.querySelectorAll('cdk-virtual-scroll-viewport, .ms-autoscroll-container, .scroll-container, [class*="scroll-viewport"], [class*="chat-container"], main').forEach(el => {
      if (el.scrollHeight > el.clientHeight) containers.add(el);
    });
    const firstTurn = document.querySelector('ms-chat-turn, .chat-turn-container');
    if (firstTurn) {
      let parent = firstTurn.parentElement;
      while (parent && parent !== document.body) {
        const style = window.getComputedStyle(parent);
        if (parent.scrollHeight > parent.clientHeight || style.overflowY === 'auto' || style.overflowY === 'scroll') {
          containers.add(parent);
        }
        parent = parent.parentElement;
      }
    }
    if (containers.size === 0) containers.add(document.documentElement);
    return Array.from(containers);
  }

  async function revealAllTurnsForBulkCleanup(delayMs = 1000) {
    window.dispatchEvent(new CustomEvent('__sl_bulkCleanupStart'));
    window.dispatchEvent(new CustomEvent('__sl_restoreAllTurns'));
    document.querySelectorAll('ms-chat-turn[data-sl-buffered-turn]').forEach(turn => {
      turn.removeAttribute('data-sl-buffered-turn');
    });
    await new Promise(resolve => setTimeout(resolve, delayMs));
    await waitForPaint();
    document.querySelectorAll('ms-chat-turn[data-sl-buffered-turn]').forEach(turn => {
      turn.removeAttribute('data-sl-buffered-turn');
    });
  }

  function restoreBufferedTurnsAfterBulkCleanup() {
    window.dispatchEvent(new CustomEvent('__sl_bulkCleanupEnd'));
  }

  async function silentFastScrollAndDelete(selector) {
    const runTask = async () => {
      isBulkCleanupRunning = true;
      let noAnimStyle = document.getElementById('aistu-silent-fast-delete-style');
      if (!noAnimStyle) {
        noAnimStyle = document.createElement('style');
        noAnimStyle.id = 'aistu-silent-fast-delete-style';
        noAnimStyle.textContent = `
          .cdk-overlay-container { opacity: 0 !important; pointer-events: none !important; }
          .cdk-overlay-container *, .mat-mdc-menu-panel, .mat-mdc-dialog-container {
            transition-duration: 0s !important;
            animation-duration: 0s !important;
          }
          ms-chat-turn[data-sl-buffered-turn] { display: block !important; }
        `;
        document.head.appendChild(noAnimStyle);
      }

      await revealAllTurnsForBulkCleanup(1000);

      const viewport = document.querySelector('cdk-virtual-scroll-viewport, .ms-autoscroll-container, .scroll-container, main') || document.documentElement;
      try {
        viewport.scrollTop = viewport.scrollHeight;
        await new Promise(r => requestAnimationFrame(r));

        let consecutiveEmptyScrolls = 0;
        let keepScanning = true;
        const scrollStep = viewport.clientHeight > 0 ? viewport.clientHeight * 0.85 : 600;

        while (keepScanning) {
          while (true) {
            const targetChunks = document.querySelectorAll(selector);
            let foundTurn = null;
            for (let i = 0; i < targetChunks.length; i++) {
              const turn = targetChunks[i].closest('ms-chat-turn, .chat-turn-container');
              if (turn && !turn.dataset.aistuDeleting) {
                foundTurn = turn;
                break;
              }
            }
            if (!foundTurn) break;
            foundTurn.dataset.aistuDeleting = 'true';
            try {
              const success = await deleteChatTurn(foundTurn);
              if (!success) {
                delete foundTurn.dataset.aistuDeleting;
                break;
              }
            } catch (_) {
              delete foundTurn.dataset.aistuDeleting;
              break;
            }
          }

          const oldScrollTop = Math.round(viewport.scrollTop);
          viewport.scrollTop = Math.max(0, oldScrollTop - scrollStep);
          await new Promise(r => requestAnimationFrame(r));

          const newScrollTop = Math.round(viewport.scrollTop);
          if (newScrollTop <= 5 || Math.abs(newScrollTop - oldScrollTop) < 5) {
            consecutiveEmptyScrolls++;
            if (consecutiveEmptyScrolls >= 2) keepScanning = false;
          } else {
            consecutiveEmptyScrolls = 0;
          }
        }
        viewport.scrollTop = viewport.scrollHeight;
      } finally {
        isBulkCleanupRunning = false;
        document.getElementById('aistu-silent-fast-delete-style')?.remove();
        restoreBufferedTurnsAfterBulkCleanup();
      }
    };

    deletionQueuePromise = deletionQueuePromise.then(runTask, runTask);
    return deletionQueuePromise;
  }

  async function compactScanAndDeleteWithProgress(selector, logPrefix, uiMeta = {}) {
    const titleText = uiMeta.titleText || `Đang dọn dẹp ${logPrefix}`;
    const unitLabel = uiMeta.unitLabel || logPrefix;
    const accentColor = uiMeta.accentColor || '#a8c7fa';

    const runTask = async () => {
      // Temporarily hide Studio.lab Settings overlay so the progress board is visible over the chat
      const slOverlay = document.querySelector('.sl-overlay');
      const wasSlOverlayVisible = slOverlay && slOverlay.style.display !== 'none';
      if (wasSlOverlayVisible) slOverlay.style.display = 'none';

      const hud = createCleanupProgressOverlay(titleText, unitLabel, accentColor, {
        mode: uiMeta.mode || 'count',
        subtitleText: uiMeta.subtitleText
      });

      // Reveal 100% of buffered/windowed turns, wait 1 second (1000ms), then start compact scan
      await revealAllTurnsForBulkCleanup(1000);
      hud.setScanning();
      enableCompactChatScanMode();

      await waitForPaint();

      const containers = getAllScrollableChatContainers();
      const primaryViewport = containers[0] || document.documentElement;

      try {
        const turnItemCounts = new Map();
        const collectMountedTargets = () => {
          const chunks = document.querySelectorAll(selector);
          const candidateTurns = new Set();
          for (let i = 0; i < chunks.length; i++) {
            const turn = chunks[i].closest('ms-chat-turn, .chat-turn-container');
            if (turn) candidateTurns.add(turn);
          }
          for (const turn of candidateTurns) {
            const count = countDistinctTargetsInTurn(turn, selector) || 1;
            const prev = turnItemCounts.get(turn) || 0;
            if (count > prev) turnItemCounts.set(turn, count);
          }
        };

        collectMountedTargets();

        const maxScroll = Math.max(...containers.map(c => c.scrollHeight), 0);
        const viewH = Math.max(primaryViewport.clientHeight || window.innerHeight || 600, 400);
        const sweepStep = Math.max(400, Math.floor(viewH * 1.2));

        if (maxScroll > viewH * 1.1) {
          for (const c of containers) c.scrollTop = 0;
          await new Promise(r => requestAnimationFrame(r));
          collectMountedTargets();

          for (let pos = sweepStep; pos <= maxScroll; pos += sweepStep) {
            for (const c of containers) c.scrollTop = pos;
            await new Promise(r => requestAnimationFrame(r));
            collectMountedTargets();
          }

          for (const c of containers) c.scrollTop = c.scrollHeight;
          await new Promise(r => requestAnimationFrame(r));
          collectMountedTargets();
        }

        let totalIdentified = 0;
        for (const count of turnItemCounts.values()) {
          totalIdentified += count;
        }

        hud.setIdentified(totalIdentified);
        await waitForPaint();

        if (totalIdentified === 0) {
          hud.setFinished(0, 0);
          await waitForPaint();
          await new Promise(r => setTimeout(r, 450));
          return;
        }

        let deletedItemsCount = 0;
        let consecutiveEmptyScrolls = 0;
        let keepScanning = true;

        while (keepScanning) {
          while (true) {
            const targetChunks = document.querySelectorAll(selector);
            let foundTurn = null;

            for (let i = 0; i < targetChunks.length; i++) {
              const turn = targetChunks[i].closest('ms-chat-turn, .chat-turn-container');
              if (turn && !turn.dataset.aistuDeleting) {
                foundTurn = turn;
                break;
              }
            }

            if (!foundTurn) break;

            const liveCount = countDistinctTargetsInTurn(foundTurn, selector) || 1;
            if (!turnItemCounts.has(foundTurn)) {
              turnItemCounts.set(foundTurn, liveCount);
              totalIdentified += liveCount;
            }
            const chunksInTurn = turnItemCounts.get(foundTurn) || liveCount;

            foundTurn.dataset.aistuDeleting = 'true';

            try {
              const success = await deleteChatTurn(foundTurn);
              if (success) {
                deletedItemsCount = Math.min(totalIdentified, deletedItemsCount + chunksInTurn);
                hud.setProgress(deletedItemsCount, totalIdentified);
                await waitForPaint();
              } else {
                delete foundTurn.dataset.aistuDeleting;
                break;
              }
            } catch (_) {
              delete foundTurn.dataset.aistuDeleting;
              break;
            }
          }

          if (deletedItemsCount >= totalIdentified && document.querySelectorAll(selector).length === 0) {
            break;
          }

          const oldScrollTop = Math.round(primaryViewport.scrollTop);
          const newPos = Math.max(0, oldScrollTop - sweepStep);
          for (const c of containers) c.scrollTop = newPos;
          await new Promise(r => requestAnimationFrame(r));

          const newScrollTop = Math.round(primaryViewport.scrollTop);
          if (newScrollTop <= 5 || Math.abs(newScrollTop - oldScrollTop) < 5) {
            consecutiveEmptyScrolls++;
            if (consecutiveEmptyScrolls >= 2) keepScanning = false;
          } else {
            consecutiveEmptyScrolls = 0;
          }
        }

        hud.setFinished(deletedItemsCount, totalIdentified);
        await waitForPaint();
        await new Promise(r => setTimeout(r, 450));
      } finally {
        disableCompactChatScanMode();
        hud.close();
        for (const c of containers) {
          c.scrollTop = c.scrollHeight;
        }
        restoreBufferedTurnsAfterBulkCleanup();
        if (wasSlOverlayVisible && slOverlay && slOverlay.isConnected) {
          slOverlay.style.display = '';
        }
        ctxRef?.refreshLiveStats?.();
      }
    };

    deletionQueuePromise = deletionQueuePromise.then(runTask, runTask);
    return deletionQueuePromise;
  }

  async function deleteAllThoughts(options = {}) {
    const showProgress = options.showProgress !== false;
    if (showProgress) {
      await compactScanAndDeleteWithProgress(THOUGHT_SELECTOR, 'thoughts', {
        titleText: t('hud_title_thoughts', 'Đang dọn dẹp Khối Suy Nghĩ (Think Block)'),
        unitLabel: t('hud_unit_thoughts', 'khối think'),
        accentColor: '#a8c7fa'
      });
    } else {
      await silentFastScrollAndDelete(THOUGHT_SELECTOR);
    }
  }

  async function deleteAllMedia() {
    await compactScanAndDeleteWithProgress(MEDIA_CHUNK_SELECTOR, 'media', {
      titleText: t('hud_title_media', 'Đang dọn dẹp Media (Ảnh, File, Video, Audio)'),
      unitLabel: t('hud_unit_media', 'media'),
      accentColor: '#a8c7fa'
    });
  }

  async function deleteAllCodeExecutions() {
    await compactScanAndDeleteWithProgress(CODE_EXECUTION_SELECTOR, 'code executions', {
      titleText: t('hud_title_code', 'Đang dọn dẹp Khối Thực Thi Code (Code Execution)'),
      unitLabel: t('hud_unit_code', 'khối code execution'),
      accentColor: '#a8c7fa'
    });
  }

  async function fixShareChatError() {
    const combinedSelector = `${MEDIA_CHUNK_SELECTOR}, ${CODE_EXECUTION_SELECTOR}`;
    await compactScanAndDeleteWithProgress(combinedSelector, 'media & code execution', {
      titleText: t('hud_title_fix_share', 'Đang sửa lỗi chia sẻ đoạn chat'),
      subtitleText: t('hud_subtitle_fix_share', 'Fix lỗi không thể share đoạn chat / share đoạn chat bị lỗi trắng màn hình'),
      unitLabel: 'Media & Code Block',
      accentColor: '#a8c7fa',
      mode: 'percent'
    });
  }

  function checkRunButtonState() {
    const runBtn = document.querySelector('ms-prompt-box ms-run-button button, footer ms-run-button button, ms-run-button button');
    if (!runBtn) return 'run';
    const btnText = (runBtn.textContent || '').toLowerCase();
    const isStop = btnText.includes('stop') || btnText.includes('dừng') || runBtn.querySelector('.spin') !== null || runBtn.classList.contains('stop');
    return isStop ? 'stop' : 'run';
  }

  function pollAutoDeleteThoughts() {
    if (!ctxRef || !ctxRef.state || !ctxRef.state.autoDeleteThoughtsEnabled) {
      if (autoDeleteTimer) {
        clearTimeout(autoDeleteTimer);
        autoDeleteTimer = null;
      }
      return;
    }

    const currentState = checkRunButtonState();
    if (lastKnownRunBtnState === 'stop' && currentState === 'run') {
      if (autoDeleteTimer) clearTimeout(autoDeleteTimer);
      const delaySec = Math.max(1, parseInt(ctxRef.state.deleteThoughtDelay, 10) || 5);
      const delayMs = delaySec * 1000;
      autoDeleteTimer = setTimeout(async () => {
        autoDeleteTimer = null;
        if (!ctxRef?.state?.autoDeleteThoughtsEnabled) return;
        try {
          await deleteAllThoughts({ showProgress: false });
        } catch (_) {}
      }, delayMs);
    } else if (currentState === 'stop') {
      if (autoDeleteTimer) {
        clearTimeout(autoDeleteTimer);
        autoDeleteTimer = null;
      }
    }
    lastKnownRunBtnState = currentState;
  }

  function startAutoDeleteWatcher() {
    if (statusPollInterval) return;
    statusPollInterval = setInterval(pollAutoDeleteThoughts, 400);
  }

  function stopAutoDeleteWatcher() {
    if (statusPollInterval) {
      clearInterval(statusPollInterval);
      statusPollInterval = null;
    }
    if (autoDeleteTimer) {
      clearTimeout(autoDeleteTimer);
      autoDeleteTimer = null;
    }
  }

  window.StudioLab.registerModule({
    id: 'chat-cleanup',
    group: 'modules',
    order: 3,
    title: 'Chat Cleanup & Share Fix',
    subtitle: 'Auto-delete Think after model response. Manual bulk cleanup is located in the toolbar Trash icon.',
    defaults: {
      autoDeleteThoughtsEnabled: false,
      deleteThoughtDelay: 5
    },
    init(ctx) {
      ctxRef = ctx;
      startAutoDeleteWatcher();
    },
    onStateChange(ctx) {
      ctxRef = ctx;
      pollAutoDeleteThoughts();
    },
    dispose() {
      stopAutoDeleteWatcher();
    },
    renderControls(ctx) {
      const autoOn = !!ctx.state.autoDeleteThoughtsEnabled;
      const delayVal = Math.max(1, parseInt(ctx.state.deleteThoughtDelay, 10) || 5);
      return `
        <div class="sl-setting-tool-fields" data-sl-controls-for="chat-cleanup">
          <div class="sl-setting-row" style="padding-top: 0;">
            <div class="sl-setting-copy">
              <label class="sl-setting-label" for="sl-auto-delete-think">${t('auto_delete_think_label', 'Tự động xoá Think')}</label>
              <p class="sl-setting-help" id="sl-auto-delete-think-help">${t('auto_delete_think_help', 'Tự động xoá các khối suy nghĩ (Think block) sau khi model trả lời xong.')}</p>
            </div>
            <div class="sl-setting-control">
              <span class="sl-setting-checkbox-hit">
                <input type="checkbox" role="switch" class="sl-setting-checkbox" id="sl-auto-delete-think" data-sl-auto-delete-think aria-describedby="sl-auto-delete-think-help" ${autoOn ? 'checked' : ''}>
              </span>
            </div>
          </div>

          <div class="sl-setting-row">
            <div class="sl-setting-copy">
              <label class="sl-setting-label" for="sl-delete-thought-delay">${t('auto_delete_delay_label', 'Tự động xoá Think sau (giây)')}</label>
              <p class="sl-setting-help" id="sl-delete-thought-delay-help">${t('auto_delete_delay_help', 'Nhập số giây chờ trước khi tự động xoá khối Think (từ 1 đến 3600 giây).')}</p>
            </div>
            <div class="sl-setting-control">
              <input type="number" class="sl-setting-input" id="sl-delete-thought-delay" data-sl-thought-delay-number min="1" max="3600" step="1" value="${delayVal}" aria-describedby="sl-delete-thought-delay-help" ${autoOn ? '' : 'disabled'}>
            </div>
          </div>
        </div>
      `;
    },
    bindControls(root, ctx) {
      const panel = $('[data-sl-controls-for="chat-cleanup"]', root);
      if (!panel) return;

      const toggle = $('[data-sl-auto-delete-think]', panel);
      const delayInput = $('[data-sl-thought-delay-number]', panel);

      const io = scope();

      if (toggle) {
        io.on(toggle, 'change', () => {
          const enabled = !!toggle.checked;
          if (delayInput) delayInput.disabled = !enabled;
          ctx.setState({ autoDeleteThoughtsEnabled: enabled });
        });
      }

      if (delayInput) {
        io.on(delayInput, 'input', () => {
          const val = parseInt(delayInput.value, 10);
          if (!Number.isInteger(val) || val < 1 || val > 3600) return;
          ctx.setState({ deleteThoughtDelay: val }, { render: false });
        });
      }

      return () => io.dispose();
    },
    updateControls(root, ctx) {
      const panel = $('[data-sl-controls-for="chat-cleanup"]', root);
      if (!panel) return;
      const toggle = $('[data-sl-auto-delete-think]', panel);
      const delayInput = $('[data-sl-thought-delay-number]', panel);
      const autoOn = !!ctx.state.autoDeleteThoughtsEnabled;
      const delayVal = String(Math.max(1, parseInt(ctx.state.deleteThoughtDelay, 10) || 5));

      if (toggle) toggle.checked = autoOn;
      if (delayInput) {
        delayInput.disabled = !autoOn;
        if (delayInput !== document.activeElement && delayInput.value !== delayVal) {
          delayInput.value = delayVal;
        }
      }
    }
  });

  window.StudioLab.ChatCleanup = {
    deleteAllThoughts,
    deleteAllMedia,
    deleteAllCodeExecutions,
    fixShareChatError,
    isRunning: () => isBulkCleanupRunning
  };
})();
