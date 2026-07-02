/**
 * Studio.lab module: bypass-new
 *
 * UI descriptor for the Angular bypass (interceptor.js).
 * This file runs ONLY in the ISOLATED world — it registers the module card
 * and relays toggle state to interceptor.js via CustomEvent.
 */
(function () {
  'use strict';

  if (!window.StudioLab || typeof window.StudioLab.registerModule !== 'function') return;

  let ctxRef = null;

  window.StudioLab.registerModule({
    id: 'bypass-new',
    group: 'bypass',
    order: 10,
    title: 'Native (Angular)',
    subtitle: 'network-level-interceptor',
    icon: 'flash_on',
    badge: { text: 'Recommended', className: 'new' },
    stateKey: 'bypassEnabled',
    defaults: {
      bypassEnabled: true
    },
    details: [
      { icon: 'flash_on', text: 'Intercepts and sanitizes responses before Angular processes them.' },
      { icon: 'check_circle', text: 'Zero UI flicker — blocks abort signals and neutralizes finish reasons.' }
    ],
    init(ctx) {
      ctxRef = ctx;
      syncToggle(ctx.state);
    },
    onStateChange(ctx) {
      ctxRef = ctx;
      syncToggle(ctx.state);
    }
  });

  function syncToggle(state) {
    const enabled = !!state.bypassEnabled;
    window.dispatchEvent(new CustomEvent('__aisu_toggle', { detail: enabled }));
  }
})();
