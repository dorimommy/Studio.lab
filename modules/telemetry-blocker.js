/**
 * Studio.lab module: telemetry-blocker
 * Provides UI control and logging for the telemetry blocker.
 * The actual network blocking is handled by declarativeNetRequest in manifest.json.
 */
(function () {
  'use strict';

  if (!window.StudioLab || typeof window.StudioLab.registerModule !== 'function') return;

  let ctxRef = null;
  let blockedCount = 0;
  let hasLoggedWarning = false;

  window.StudioLab.registerModule({
    id: 'telemetry-blocker',
    group: 'modules',
    order: 35,
    title: 'Telemetry Blocker',
    subtitle: 'privacy-shield',
    icon: 'visibility_off',
    stateKey: 'telemetryBlockerEnabled',
    defaults: {
      telemetryBlockerEnabled: true
    },
    details: [
      { icon: 'visibility_off', text: 'Blocks Google Analytics, Play logging, CSP reports, and tracking pixels from AI Studio.' },
      { icon: 'check_circle', text: 'Telemetry is dynamically blocked by Manifest V3 network rules.' }
    ],
    init(ctx) {
      ctxRef = ctx;
      window.addEventListener('__sl_networkRequest', this.handleNetworkEvent.bind(this));
    },
    onStateChange(ctx, prev) {
      if (ctx.state.telemetryBlockerEnabled) {
        if (!hasLoggedWarning) {
          hasLoggedWarning = true;
          console.log(
            '%c[Studio.lab] 🛡️ Telemetry Blocker is enabled (declarativeNetRequest rules active)',
            'color:#66bb6a;font-weight:bold'
          );
        }
      }
    },
    handleNetworkEvent(e) {
      const enabled = !!(ctxRef && ctxRef.state.telemetryBlockerEnabled);
      if (!enabled) return;
      
      const { url, method, isTelemetry } = e.detail || {};
      if (url) {
        if (isTelemetry) {
          blockedCount++;
          console.log('%c[Studio.lab] 🛡️ Telemetry blocked: ' + method + ' ' + url, 'color:#ef5350');
        } else {
          console.log('%c[Studio.lab] 🟡 Network Request: ' + method + ' ' + url, 'color:#ffca28');
        }
      }
    }
  });
})();
