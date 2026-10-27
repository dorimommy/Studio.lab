// Removing old rendered turns affects the current session and requires an explicit button press.
(function () {
  'use strict';

  if (!window.StudioLab || typeof window.StudioLab.registerModule !== 'function') return;
  const { $, $$, el, scope } = window.StudioLabCore;

  const AUTO_KEEP = 15;

  window.StudioLab.registerModule({
    id: 'optimizer-hard',
    group: 'optimizer',
    order: 20,
    title: 'Physical (Aggressive)',
    subtitle: 'permanent-memory-cleanup',
    icon: 'delete',
    modeKey: 'optimizerMode',
    modeValue: 'hard',
    enabledKey: 'optimizerEnabled',
    defaults: {
      optimizerEnabled: true,
      optimizerMode: 'smart',
      keepLast: 15,
      autoKeep: true
    },
    details: [
      { icon: 'delete', text: 'Permanently removes old messages from the active browser session.' },
      { icon: 'speed', text: 'Useful for extremely long chats where history scrolling is not needed.' }
    ],
    init(ctx) {
      sync(ctx);
    },
    onStateChange(ctx) {
      sync(ctx);
    },
    renderControls(ctx) {
      const t = (k, fb) => (window.StudioLab.i18n ? window.StudioLab.i18n.t(k, fb) : fb);
      const keepValue = ctx.state.autoKeep ? AUTO_KEEP : ctx.state.keepLast;
      const disabled = ctx.state.autoKeep || !ctx.state.optimizerEnabled ? 'disabled' : '';
      return `
        <div class="sl-setting-tool-fields" data-sl-controls-for="optimizer-hard" data-sl-search-item data-sl-search="Turn limits automatic manual keep latest rendered turns cleanup">
          <details class="sl-setting-advanced">
            <summary data-sl-keep-summary><span class="sl-setting-label" data-sl-keep-summary-text>${turnLimitSummary(ctx.state)}</span><svg class="sl-setting-disclosure-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg></summary>
          <div class="sl-setting-disclosure-content">
          <div class="sl-setting-row">
            <div class="sl-setting-copy">
              <label class="sl-setting-label" for="sl-hard-auto-keep">${t('auto_turn_limit_label', 'Automatic turn limit')}</label>
              <p class="sl-setting-help" id="sl-hard-auto-help">${t('auto_turn_limit_help', `Keep the latest ${AUTO_KEEP} rendered turns.`)}</p>
            </div>
            <div class="sl-setting-control">
              <span class="sl-setting-checkbox-hit">
                <input type="checkbox" role="switch" class="sl-setting-checkbox" id="sl-hard-auto-keep" data-sl-auto-keep aria-describedby="sl-hard-auto-help" ${ctx.state.autoKeep ? 'checked' : ''} ${ctx.state.optimizerEnabled ? '' : 'disabled'}>
              </span>
            </div>
          </div>
          <div class="sl-setting-row">
            <div class="sl-setting-copy">
              <label class="sl-setting-label" for="sl-hard-keep-number">${t('turns_to_keep_label', 'Turns to keep')}</label>
              <p class="sl-setting-help" id="sl-hard-keep-help">${t('turns_to_keep_help', 'Turn off the automatic limit to choose between 2 and 500 turns.')}</p>
            </div>
            <div class="sl-setting-control">
              <input type="number" class="sl-setting-input" id="sl-hard-keep-number" data-sl-keep-number min="2" max="500" step="1" value="${keepValue}" aria-describedby="sl-hard-keep-help sl-hard-keep-error" ${disabled}>
              <p class="sl-setting-help" id="sl-hard-keep-error" data-sl-keep-error hidden></p>
            </div>
          </div>
          </div>
          </details>
          <div class="sl-setting-row" data-sl-hard-cleanup-row ${ctx.state.optimizerMode !== 'hard' ? 'hidden' : ''}>
            <div class="sl-setting-copy">
              <p class="sl-setting-label">${t('cleanup_chat_label', 'Clean up this chat')}</p>
              <p class="sl-setting-help" id="sl-hard-cleanup-help">${t('cleanup_chat_help', 'Remove older rendered turns from this browser session. This cannot be undone here.')}</p>
            </div>
            <div class="sl-setting-actions">
              <button type="button" class="sl-settings-button destructive" data-sl-apply-hard aria-describedby="sl-hard-cleanup-help" ${ctx.state.optimizerEnabled ? '' : 'disabled'}>${t('btn_apply_cleanup', 'Apply cleanup')}</button>
            </div>
          </div>
        </div>
      `;
    },
    bindControls(root, ctx) {
      const panel = $('[data-sl-controls-for="optimizer-hard"]', root);
      if (!panel) return;

      const autoToggle = $('[data-sl-auto-keep]', panel);
      const number = $('[data-sl-keep-number]', panel);
      const error = $('[data-sl-keep-error]', panel);
      const applyButton = $('[data-sl-apply-hard]', panel);
      const io = scope();
      function listen(element, type, callback) {
        if (!element) return;
        io.on(element, type, callback);
      }

      if (autoToggle) {
        listen(autoToggle, 'change', () => {
          if (!ctx.state.optimizerEnabled) return;
          const nextAuto = autoToggle.checked;
          const patch = { autoKeep: nextAuto };
          if (nextAuto) patch.keepLast = AUTO_KEEP;
          ctx.setState(patch, { render: false });
        });
      }

      function setError(invalid) {
        if (number) {
          if (invalid) number.setAttribute('aria-invalid', 'true');
          else number.removeAttribute('aria-invalid');
        }
        if (error) {
          error.textContent = invalid ? 'Enter a whole number from 2 to 500. The last valid limit remains saved.' : '';
          error.hidden = !invalid;
        }
      }
      function setKeep(control) {
          if (!ctx.state.optimizerEnabled || ctx.state.autoKeep) return;
          const keepLast = Number(control.value);
          const invalid = control.value.trim() === '' || !Number.isInteger(keepLast) || keepLast < 2 || keepLast > 500;
          setError(invalid);
          if (invalid) return;
          ctx.setState({ keepLast }, { render: false });
          if (number && number !== control) number.value = String(keepLast);
      }
      listen(number, 'input', () => setKeep(number));
      listen(number, 'blur', () => {
        if (number?.getAttribute('aria-invalid') === 'true') {
          ctx.announceSettings?.('Enter a whole number from 2 to 500. The last valid limit remains saved.', true);
        }
      });

      if (applyButton) {
        listen(applyButton, 'click', () => {
          if (!ctx.state.optimizerEnabled || ctx.state.optimizerMode !== 'hard') return;
          const previousCount = ctx.getTurnCount();
          applyHardCleanup(ctx);
          ctx.refreshLiveStats();
          const removed = Math.max(0, previousCount - ctx.getTurnCount());
          ctx.announceSettings?.(removed ? 'Removed ' + removed + ' older rendered turns.' : 'No older turns needed cleanup.');
        });
      }
      return () => io.dispose();
    },
    updateControls(root, ctx) {
      const panel = $('[data-sl-controls-for="optimizer-hard"]', root);
      if (!panel) return;

      panel.hidden = false;
      const cleanupRow = $('[data-sl-hard-cleanup-row]', panel);
      if (cleanupRow) cleanupRow.hidden = ctx.state.optimizerMode !== 'hard';
      const summary = $('[data-sl-keep-summary-text]', panel);
      const summaryText = turnLimitSummary(ctx.state);
      if (summary && summary.textContent !== summaryText) summary.textContent = summaryText;

      const autoToggle = $('[data-sl-auto-keep]', panel);
      const number = $('[data-sl-keep-number]', panel);
      const applyButton = $('[data-sl-apply-hard]', panel);
      const keepValue = String(ctx.state.autoKeep ? AUTO_KEEP : ctx.state.keepLast);
      const disabled = !!ctx.state.autoKeep || !ctx.state.optimizerEnabled;

      if (autoToggle) {
        autoToggle.checked = !!ctx.state.autoKeep;
        autoToggle.disabled = !ctx.state.optimizerEnabled;
      }
      if (number) {
        number.disabled = disabled;
        if (disabled) {
          number.removeAttribute('aria-invalid');
          const error = $('[data-sl-keep-error]', panel);
          if (error) { error.textContent = ''; error.hidden = true; }
        }
        // Live turn statistics refresh every two seconds. Preserve an unfinished
        // edit (and its visible error) instead of replacing it with saved state.
        if (number !== document.activeElement && (disabled || number.getAttribute('aria-invalid') !== 'true') &&
            number.value !== keepValue) number.value = keepValue;
      }
      if (applyButton) applyButton.disabled = !ctx.state.optimizerEnabled;
    }
  });

  function isSelected(state) {
    return state.optimizerEnabled && state.optimizerMode === 'hard';
  }

  function turnLimitSummary(state) {
    const t = (k, fb) => (window.StudioLab.i18n ? window.StudioLab.i18n.t(k, fb) : fb);
    return state.autoKeep
      ? t('turn_limit_summary_auto', 'Turn limit · Automatic, ') + AUTO_KEEP
      : t('turn_limit_summary_manual', 'Turn limit · Manual, ') + state.keepLast;
  }

  function sync(ctx) {
    if (isSelected(ctx.state)) start();
    else stop();
  }

  function start() {
    let style = $('#sl-fast-render-style');
    if (!style) {
      style = el('<style id="sl-fast-render-style"></style>');
      style.textContent = `
        ms-chat-turn {
          content-visibility: auto;
          contain-intrinsic-size: auto 500px;
        }
      `;
      document.head.appendChild(style);
    }
  }

  function stop() {
    const style = $('#sl-fast-render-style');
    if (style) style.remove();
  }

  function applyHardCleanup(ctx) {
    const turnSel = window.StudioLab.SELECTORS ? window.StudioLab.SELECTORS.CHAT_TURN : 'ms-chat-turn';
    const turns = $$(turnSel);
    if (!turns.length) return;

    const keep = ctx.state.autoKeep
      ? AUTO_KEEP
      : Math.max(2, parseInt(ctx.state.keepLast, 10) || AUTO_KEEP);
    const cutoff = Math.max(0, turns.length - keep);

    for (let index = 0; index < cutoff; index++) {
      if (!turns[index].hasAttribute('data-sl-hard-removed')) {
        turns[index].setAttribute('data-sl-hard-removed', 'true');
        turns[index].remove();
      }
    }
  }

})();
