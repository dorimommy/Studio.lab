/**
 * Studio.lab module: banner-remover
 * Removes "Upgrade" and "Quota Exceeded" banners from the UI.
 */
(function () {
  'use strict';

  if (!window.StudioLab || typeof window.StudioLab.registerModule !== 'function') return;

  let ctxRef = null;
  let styleEl = null;

  const CSS = `
    /* Quota exceeded banner in chat */
    ms-chat-session ms-opaque-container-485387979-1,
    /* Navbar upgrade card */
    ms-navbar-v2 ms-opaque-container-485387979,
    /* Fallback for class names if tags change */
    .quota-exceeded-container,
    .upgrade-card-wrapper {
      display: none !important;
    }
  `;

  window.StudioLab.registerModule({
    id: 'banner-remover',
    group: 'tweaks',
    order: 30,
    title: 'Paid Banner Remover',
    subtitle: 'clean-interface',
    icon: 'visibility_off',
    stateKey: 'bannerRemoverEnabled',
    defaults: {
      bannerRemoverEnabled: true
    },
    details: [
      { icon: 'visibility_off', text: 'Hides "Upgrade to unlock more", "Quota exceeded", and payment-related banners.' }
    ],
    init(ctx) {
      ctxRef = ctx;
      this.updateVisibility();
    },
    onStateChange() {
      this.updateVisibility();
    },
    updateVisibility() {
      const enabled = !!(ctxRef && ctxRef.state.bannerRemoverEnabled);
      
      if (enabled) {
        if (!styleEl) {
          styleEl = document.createElement('style');
          styleEl.id = 'sl-banner-remover-styles';
          styleEl.textContent = CSS;
          document.head.appendChild(styleEl);
        }
      } else {
        if (styleEl) {
          styleEl.remove();
          styleEl = null;
        }
      }
    }
  });
})();
