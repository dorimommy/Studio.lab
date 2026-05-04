/**
 * StudioLab module: optimizer-hard
 *
 * Physical cleanup mode removes old rendered turns from the current browser
 * session. This is intentionally manual via an explicit button.
 */
(function () {
  'use strict';

  if (!window.StudioLab || typeof window.StudioLab.registerModule !== 'function') return;

  const AUTO_KEEP = 15;

  window.StudioLab.registerModule({
    id: 'optimizer-hard',
    group: 'optimizer',
    order: 20,
    title: 'Physical (Aggressive)',
    subtitle: 'permanent-memory-cleanup',
    icon: 'delete',
    badge: { text: 'Deleting', className: 'danger' },
    modeKey: 'optimizerMode',
    modeValue: 'hard',
    enabledKey: 'optimizerEnabled',
    defaults: {
      optimizerEnabled: false,
      optimizerMode: 'smart',
      keepLast: 15,
      autoKeep: true
    },
    details: [
      { icon: 'delete', text: 'Permanently removes old messages from the active browser session.' },
      { icon: 'speed', text: 'Useful for extremely long chats where history scrolling is not needed.' }
    ],
    renderControls(ctx) {
      const turnCount = ctx.getTurnCount();
      const max = Math.max(turnCount + 10, 50);
      const keepValue = ctx.state.autoKeep ? AUTO_KEEP : ctx.state.keepLast;
      const disabled = ctx.state.autoKeep ? 'disabled' : '';
      const active = isSelected(ctx.state) ? 'active' : '';
      return `
        <div class="sl-slider-panel ${active}" data-sl-controls-for="optimizer-hard">
          <div class="sl-auto-row">
            <button type="button" class="sl-auto-toggle ${ctx.state.autoKeep ? 'active' : ''}" data-sl-auto-keep aria-label="Auto limit"></button>
            <span>Auto-Limit (Recommended for large prompts)</span>
          </div>
          <div class="sl-slider-row">
            <span class="sl-slider-label">Keep last</span>
            <input type="range" class="sl-range" data-sl-keep-slider min="2" max="${max}" value="${keepValue}" ${disabled}>
            <span class="sl-slider-value" data-sl-keep-value>${keepValue}</span>
          </div>
          <button type="button" class="sl-apply-btn destructive" data-sl-apply-hard>Enforce Physical Cleanup</button>
        </div>
      `;
    },
    bindControls(root, ctx) {
      const panel = root.querySelector('[data-sl-controls-for="optimizer-hard"]');
      if (!panel) return;

      const autoToggle = panel.querySelector('[data-sl-auto-keep]');
      const slider = panel.querySelector('[data-sl-keep-slider]');
      const value = panel.querySelector('[data-sl-keep-value]');
      const applyButton = panel.querySelector('[data-sl-apply-hard]');

      if (slider) updateSliderFill(slider);

      if (autoToggle) {
        autoToggle.addEventListener('click', () => {
          if (!ctx.state.optimizerEnabled) return;
          const nextAuto = !ctx.state.autoKeep;
          const patch = { autoKeep: nextAuto };
          if (nextAuto) patch.keepLast = AUTO_KEEP;
          ctx.setState(patch, { render: false });
        });
      }

      if (slider) {
        slider.addEventListener('input', () => {
          const keepLast = parseInt(slider.value, 10);
          ctx.setState({ keepLast }, { render: false });
          if (value) value.textContent = String(keepLast);
          updateSliderFill(slider);
        });
      }

      if (applyButton) {
        applyButton.addEventListener('click', () => {
          if (!ctx.state.optimizerEnabled || ctx.state.optimizerMode !== 'hard') return;
          applyHardCleanup(ctx);
          ctx.refreshLiveStats();
        });
      }
    },
    updateControls(root, ctx) {
      const panel = root.querySelector('[data-sl-controls-for="optimizer-hard"]');
      if (!panel) return;

      panel.classList.toggle('active', isSelected(ctx.state));

      const autoToggle = panel.querySelector('[data-sl-auto-keep]');
      const slider = panel.querySelector('[data-sl-keep-slider]');
      const value = panel.querySelector('[data-sl-keep-value]');

      if (autoToggle) autoToggle.classList.toggle('active', !!ctx.state.autoKeep);
      if (slider) {
        slider.disabled = !!ctx.state.autoKeep;
        slider.value = ctx.state.autoKeep ? AUTO_KEEP : ctx.state.keepLast;
        slider.max = Math.max(ctx.getTurnCount() + 10, 50);
        updateSliderFill(slider);
      }
      if (value) value.textContent = String(ctx.state.autoKeep ? AUTO_KEEP : ctx.state.keepLast);
    }
  });

  function isSelected(state) {
    return state.optimizerEnabled && state.optimizerMode === 'hard';
  }

  function applyHardCleanup(ctx) {
    const turns = Array.from(document.querySelectorAll('ms-chat-turn'));
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

  function updateSliderFill(slider) {
    const min = parseFloat(slider.min) || 0;
    const max = parseFloat(slider.max) || 100;
    const value = parseFloat(slider.value) || 0;
    const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;
    slider.style.setProperty('--sl-fill', `${pct}%`);
  }
})();
