/**
 * Studio.lab module: ui-cleaner
 * Registers multiple sub-modules for the UI Cleaner group.
 */
(function () {
  'use strict';

  if (!window.StudioLab || typeof window.StudioLab.registerModule !== 'function') return;

  let ctxRef = null;
  const styleElements = {};

  const CLEANER_MODULES = [
    {
      id: 'cleaner-tips',
      title: 'Zero State & Tips',
      subtitle: 'clean-interface-tips',
      icon: 'edit',
      css: `
        ms-zero-state .grid-views-content,
        ms-zero-state ms-model-grid,
        ms-zero-state ms-model-grid .category-grid > .category-card:first-child,
        ms-zero-state ms-model-grid .category-card:first-child,
        ms-zero-state ms-model-category-grid > div:first-child { display: none !important; }
        ms-zero-state ms-button-toggle { display: none !important; }
        ms-zero-state .carousel-title,
        ms-zero-state h1.carousel-title,
        ms-zero-state h2.carousel-title {
          visibility: hidden !important;
          position: relative !important;
        }
        ms-zero-state .carousel-title::after,
        ms-zero-state h1.carousel-title::after,
        ms-zero-state h2.carousel-title::after {
          content: var(--sl-welcome-text, "Hello!") !important;
          visibility: visible !important;
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
          white-space: nowrap !important;
        }
      `,
      details: [{ icon: 'edit', text: 'Removes "Featured" tile, toggle buttons, and personalizes the welcome message.' }]
    },
    {
      id: 'cleaner-banners',
      title: 'Paid Banner',
      subtitle: 'clean-interface-banners',
      icon: 'visibility_off',
      css: `
        ms-chat-session ms-opaque-container-485387979-1,
        ms-navbar-v2 ms-opaque-container-485387979,
        .quota-exceeded-container,
        .upgrade-card-wrapper {
          display: none !important;
        }
      `,
      details: [{ icon: 'visibility_off', text: 'Hides "Upgrade to unlock more", "Quota exceeded", and payment-related banners.' }]
    },
    {
      id: 'cleaner-hallucinations',
      title: 'Hallucinations Disclaimer',
      subtitle: 'clean-interface-hallucinations',
      icon: 'visibility_off',
      css: `ms-hallucinations-disclaimer { display: none !important; }`,
      details: [{ icon: 'visibility_off', text: 'Hides the hallucination disclaimer below the chat session.' }]
    },
    {
      id: 'cleaner-feedback',
      title: 'Feedback Buttons',
      subtitle: 'clean-interface-feedback',
      icon: 'visibility_off',
      css: `.turn-footer .response-feedback-button { display: none !important; }`,
      details: [{ icon: 'visibility_off', text: 'Hides the thumb up/down response feedback buttons.' }]
    },
    {
      id: 'cleaner-suggestions',
      title: 'Suggestions (in Apps)',
      subtitle: 'clean-interface-suggestions',
      icon: 'visibility_off',
      css: `ms-code-assistant-chat > div > div:nth-child(3) > div:first-child, ms-chat-suggestions, .suggestions-container { display: none !important; }`,
      details: [{ icon: 'visibility_off', text: 'Hides suggested prompts and apps in the code assistant chat.' }]
    }
  ];

  function extractUserName() {
    // First, try to get it from the avatar image alt text (most reliable)
    const avatarImg = document.querySelector('img.avatar[alt]');
    if (avatarImg) {
      const alt = avatarImg.getAttribute('alt').trim();
      if (alt && alt.toLowerCase() !== 'avatar' && alt.toLowerCase() !== 'profile picture') {
        return alt.split(' ')[0];
      }
    }

    // Fallback: aria-label on the account button
    const accBtn = document.querySelector('a[aria-label*="@"], button[aria-label*="@"]');
    if (accBtn) {
      const label = accBtn.getAttribute('aria-label');
      const match = label.match(/:\s*(.*?)\s*\(/);
      if (match && match[1]) return match[1].split(' ')[0];
      const match2 = label.match(/([^:\n]+)\s*\(/);
      if (match2 && match2[1]) {
         const parts = match2[1].trim().split(' ');
         if (parts.length > 0) return parts[0];
      }
    }
    return "There";
  }

  let lastTypedName = null;
  let typingInProgress = false;

  function typeText(targetText) {
    if (typingInProgress || lastTypedName === targetText) return;
    typingInProgress = true;
    lastTypedName = targetText;
    
    const target = "Hello, " + targetText + "! What are your plans?";
    let i = 6; 
    
    const typingInterval = setInterval(() => {
      if (i <= target.length) {
        document.documentElement.style.setProperty('--sl-welcome-text', '"' + target.substring(0, i) + '"');
        i++;
      } else {
        clearInterval(typingInterval);
        typingInProgress = false;
      }
    }, 40);
  }

  function updateUserName() {
    if (!ctxRef || !ctxRef.state.cleanerEnabled || !ctxRef.state.cleanerTips) return false;
    const name = extractUserName();
    if (name && name !== 'There') {
      typeText(name);
      return true;
    }
    return false;
  }

  function toggleStyle(id, css, enabled) {
    let el = styleElements[id] || document.getElementById('sl-style-' + id);
    if (enabled) {
      if (!el) {
        el = document.createElement('style');
        el.id = 'sl-style-' + id;
        document.head.appendChild(el);
      }
      el.textContent = css;
      styleElements[id] = el;
    } else {
      if (el) {
        el.remove();
      }
      const existing = document.getElementById('sl-style-' + id);
      if (existing) existing.remove();
      delete styleElements[id];
    }
  }

  CLEANER_MODULES.forEach((mod, idx) => {
    const stateKey = mod.id.replace(/-([a-z])/g, (g) => g[1].toUpperCase());

    window.StudioLab.registerModule({
      id: mod.id,
      group: 'cleaner',
      order: 30 + idx,
      title: mod.title,
      subtitle: mod.subtitle,
      icon: mod.icon,
      stateKey: stateKey,
      defaults: {
        [stateKey]: true
      },
      details: mod.details,
      init(ctx) {
        ctxRef = ctx;
        this.updateVisibility();

        if (mod.id === 'cleaner-tips') {
          if (!updateUserName()) {
            let attempts = 0;
            const poll = setInterval(() => {
              attempts++;
              if (updateUserName() || attempts > 100) clearInterval(poll);
            }, 100);
          }
          setInterval(updateUserName, 10000);
        }
      },
      onStateChange(ctx) {
        if (ctx) ctxRef = ctx;
        this.updateVisibility();
      },
      onRouteChange(ctx) {
        if (ctx) ctxRef = ctx;
        this.updateVisibility();
      },
      updateVisibility() {
        // Group toggle must be enabled AND the specific module toggle must be enabled
        const groupEnabled = !!(ctxRef && ctxRef.state.cleanerEnabled);
        const moduleEnabled = !!(ctxRef && ctxRef.state[stateKey]);
        const shouldEnable = groupEnabled && moduleEnabled;

        toggleStyle(mod.id, mod.css, shouldEnable);
      }
    });
  });

})();
