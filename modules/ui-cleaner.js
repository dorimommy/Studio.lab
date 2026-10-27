(function () {
  'use strict';

  if (!window.StudioLab || typeof window.StudioLab.registerModule !== 'function') return;
  const { $, el, waitFor } = window.StudioLabCore;

  let ctxRef = null;
  const styleElements = {};

  const CLEANER_MODULES = [
    {
      id: 'cleaner-tips',
      title: 'Zero State & Tips',
      subtitle: 'clean-interface-tips',
      icon: 'edit',
      css: `
        ms-zero-state ms-model-empty-state .empty-state__examples,
        ms-zero-state ms-model-empty-state .empty-state__description,
        ms-zero-state ms-model-empty-state .unlock,
        ms-zero-state .grid-views-content,
        ms-zero-state ms-model-grid,
        ms-zero-state ms-model-grid .category-grid > .category-card:first-child,
        ms-zero-state ms-model-grid .category-card:first-child,
        ms-zero-state ms-model-category-grid > div:first-child { display: none !important; }
        ms-zero-state ms-button-toggle { display: none !important; }
        ms-zero-state ms-model-empty-state .empty-state {
          grid-template-columns: minmax(0, 1fr) !important;
          text-align: center !important;
        }
        ms-zero-state .carousel-title,
        ms-zero-state h1.carousel-title,
        ms-zero-state h2.carousel-title,
        ms-zero-state ms-model-empty-state #empty-state-heading {
          visibility: hidden !important;
          position: relative !important;
        }
        ms-zero-state .carousel-title::after,
        ms-zero-state h1.carousel-title::after,
        ms-zero-state h2.carousel-title::after,
        ms-zero-state ms-model-empty-state #empty-state-heading::after {
          content: var(--sl-welcome-text, "Hello!") !important;
          visibility: visible !important;
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
          white-space: nowrap !important;
        }
        ms-zero-state ms-model-empty-state #empty-state-heading::after {
          width: 100% !important;
          white-space: normal !important;
        }
      `,
      details: [{ icon: 'edit', text: 'Keeps your personal greeting while hiding welcome promotions, examples, and toggles.' }]
    },
    {
      id: 'cleaner-banners',
      title: 'Upgrade Banners',
      subtitle: 'clean-interface-banners',
      icon: 'visibility_off',
      css: `
        ms-chat-session ms-opaque-container-485387979-1,
        ms-navbar-v2 ms-opaque-container-485387979 {
          display: none !important;
        }
      `,
      details: [{ icon: 'visibility_off', text: 'Hides promotional upgrade and payment banners without hiding chat errors.' }]
    },
    {
      id: 'cleaner-sidebar-banners',
      title: 'Sidebar Promotions',
      subtitle: 'clean-interface-sidebar-banners',
      icon: 'visibility_off',
      css: `ms-navbar-v2 ms-navbar-promo-card { display: none !important; }`,
      details: [{ icon: 'visibility_off', text: 'Hides promotional cards above the sidebar footer controls.' }]
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
    const avatarImg = $('img.avatar[alt]');
    if (avatarImg) {
      const alt = avatarImg.getAttribute('alt').trim();
      if (alt && alt.toLowerCase() !== 'avatar' && alt.toLowerCase() !== 'profile picture') {
        return alt.split(' ')[0];
      }
    }

    const accBtn = $('a[aria-label*="@"], button[aria-label*="@"]');
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
  let typingInterval = null;
  let namePoll = null;
  let namePollGen = 0;
  let nameRefresh = null;
  const POLL_CANCELLED = {};

  function typeText(targetText) {
    if (typingInProgress || lastTypedName === targetText) return;
    typingInProgress = true;
    lastTypedName = targetText;
    
    const target = "Hello, " + targetText + "! What are your plans?";
    let i = 6; 
    
    typingInterval = setInterval(() => {
      if (i <= target.length) {
        document.documentElement.style.setProperty('--sl-welcome-text', JSON.stringify(target.substring(0, i)));
        i++;
      } else {
        clearInterval(typingInterval);
        typingInterval = null;
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

  function stopWelcome() {
    namePollGen++;
    namePoll = null;
    clearInterval(nameRefresh);
    clearInterval(typingInterval);
    nameRefresh = null;
    typingInterval = null;
    typingInProgress = false;
    lastTypedName = null;
    document.documentElement.style.removeProperty('--sl-welcome-text');
  }

  function syncWelcome(enabled) {
    if (!enabled) {
      stopWelcome();
      return;
    }
    if (nameRefresh !== null) return;

    if (!updateUserName()) {
      // Було: ручний setInterval з лічильником (100 спроб × 100 мс).
      // waitFor робить те саме; покоління скасовує застарілий полл.
      const gen = ++namePollGen;
      namePoll = waitFor(() => {
        if (gen !== namePollGen) return POLL_CANCELLED;
        return updateUserName() || null;
      }, { timeout: 10000, interval: 100 }).then(() => {
        if (gen === namePollGen) namePoll = null;
      });
    }
    nameRefresh = setInterval(updateUserName, 10000);
  }

  function toggleStyle(id, css, enabled) {
    let styleEl = styleElements[id] || $('#sl-style-' + id);
    if (enabled) {
      if (!styleEl) {
        styleEl = el(`<style id="sl-style-${id}"></style>`);
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = css;
      styleElements[id] = styleEl;
    } else {
      if (styleEl) {
        styleEl.remove();
      }
      const existing = $('#sl-style-' + id);
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
      },
      onStateChange(ctx) {
        if (ctx) ctxRef = ctx;
        this.updateVisibility();
      },
      onRouteChange(ctx) {
        if (ctx) ctxRef = ctx;
        this.updateVisibility();
      },
      dispose() {
        toggleStyle(mod.id, mod.css, false);
        if (mod.id === 'cleaner-tips') stopWelcome();
      },
      updateVisibility() {
        const groupEnabled = !!(ctxRef && ctxRef.state.cleanerEnabled);
        const moduleEnabled = !!(ctxRef && ctxRef.state[stateKey]);
        const shouldEnable = groupEnabled && moduleEnabled;

        toggleStyle(mod.id, mod.css, shouldEnable);
        if (mod.id === 'cleaner-tips') syncWelcome(shouldEnable);
      }
    });
  });

})();
