/**
 * Studio.lab module: response-recovery
 *
 * UI descriptor for the Response Recovery (interceptor.js).
 * This file runs ONLY in the ISOLATED world — it registers the module card
 * and relays toggle state to interceptor.js via CustomEvent.
 */
(function () {
  'use strict';

  if (!window.StudioLab || typeof window.StudioLab.registerModule !== 'function') return;

  let ctxRef = null;

  window.StudioLab.registerModule({
    id: 'response-recovery',
    group: 'response-recovery',
    order: 10,
    title: 'Response Recovery',
    subtitle: 'Recover interrupted responses',
    icon: 'flash_on',
    stateKey: 'responseRecoveryEnabled',
    defaults: {
      responseRecoveryEnabled: true
    },
    details: [
      { icon: 'flash_on', text: 'Keeps available streamed content visible during interrupted responses.' },
      { icon: 'check_circle', text: 'Respects the native Stop button and chat navigation.' }
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
    const enabled = !!state.responseRecoveryEnabled;
    window.dispatchEvent(new CustomEvent('__sl_responseRecoveryToggle', { detail: enabled }));
  }
})();
