/**
 * Studio.lab module: draft-saver
 *
 * Autosaves the prompt box contents to localStorage so that if Google AI Studio
 * crashes, reloads, or re-authenticates, your unsent draft is never lost.
 */
(function () {
  'use strict';

  if (!window.StudioLab || typeof window.StudioLab.registerModule !== 'function') return;

  const STORAGE_PREFIX = 'sl_draft_';
  const LATEST_KEY = 'sl_draft_latest';

  let ctxRef = null;
  let saveTimer = null;
  let activeTextarea = null;
  let indicatorEl = null;
  let restoreTimer = null;
  let isRestoring = false;

  window.StudioLab.registerModule({
    id: 'draft-saver',
    group: 'tweaks',
    order: 25,
    title: 'Draft Crash Protection',
    subtitle: 'autosave-unsent-prompts',
    icon: 'storage',
    stateKey: 'draftSaverEnabled',
    defaults: {
      draftSaverEnabled: true
    },
    details: [
      { icon: 'storage', text: 'Autosaves your prompt draft to local storage in real time.' },
      { icon: 'history', text: 'Restores text automatically if the page reloads or crashes.' }
    ],
    init(ctx) {
      ctxRef = ctx;
      setupDraftWatchers();
      startTextareaWatcher();
    },
    onStateChange(ctx) {
      ctxRef = ctx;
      if (!isActive()) {
        removeIndicator();
      } else {
        startTextareaWatcher();
      }
    },
    onRouteChange() {
      removeIndicator();
      activeTextarea = null;
      startTextareaWatcher();
    }
  });

  function isActive() {
    return !!(ctxRef && ctxRef.state.draftSaverEnabled);
  }

  function getStorageKey() {
    const cleanPath = (location.pathname || 'default').replace(/\/+$/, '');
    return STORAGE_PREFIX + cleanPath;
  }

  function setupDraftWatchers() {
    // Listen for global input events delegated from prompt box
    document.addEventListener('input', (e) => {
      if (!isActive()) return;
      const target = e.target;
      if (isPromptTextarea(target)) {
        activeTextarea = target;
        scheduleSave(target.value);
      }
    }, { passive: true });

    // Clear draft on submission (Ctrl+Enter or Run click)
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (isPromptTextarea(e.target)) {
          clearCurrentDraft();
        }
      }
    }, { capture: true });

    document.addEventListener('click', (e) => {
      const runBtn = e.target.closest('ms-run-button button, [data-test-id="run-button"], .ms-button-primary');
      if (runBtn && isRunButton(runBtn)) {
        clearCurrentDraft();
      }
    }, { capture: true });

    // Also listen for network layer payload capture
    window.addEventListener('__sl_requestPayload', () => {
      clearCurrentDraft();
    });

    // Observer to detect prompt box dynamically being added to DOM
    const domObserver = new MutationObserver(() => {
      if (!isActive()) return;
      const ta = document.querySelector('ms-prompt-box textarea');
      if (ta && ta !== activeTextarea) {
        startTextareaWatcher();
      }
    });

    if (document.body) {
      domObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  function isPromptTextarea(el) {
    if (!el || el.tagName !== 'TEXTAREA') return false;
    return !!el.closest('ms-prompt-box');
  }

  function isRunButton(btn) {
    if (!btn) return false;
    const txt = (btn.innerText || btn.textContent || '').toLowerCase();
    return txt.includes('run') || !!btn.closest('ms-run-button') || btn.getAttribute('data-test-id') === 'run-button';
  }

  function scheduleSave(text) {
    if (isRestoring) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!isActive()) return;
      const trimmed = (text || '').trim();
      const key = getStorageKey();

      if (!trimmed) {
        try {
          localStorage.removeItem(key);
          const latest = getLatestSavedDraft();
          if (latest && latest.path === location.pathname) {
            localStorage.removeItem(LATEST_KEY);
          }
        } catch (_) {}
        removeIndicator();
      } else {
        try {
          const payload = JSON.stringify({
            text: text,
            path: location.pathname,
            ts: Date.now()
          });
          localStorage.setItem(key, payload);
          localStorage.setItem(LATEST_KEY, payload);
        } catch (_) {}
      }
    }, 300);
  }

  function clearCurrentDraft() {
    clearTimeout(saveTimer);
    try {
      localStorage.removeItem(getStorageKey());
      const latest = getLatestSavedDraft();
      if (latest && latest.path === location.pathname) {
        localStorage.removeItem(LATEST_KEY);
      }
    } catch (_) {}
    removeIndicator();
  }

  function getLatestSavedDraft() {
    try {
      const raw = localStorage.getItem(LATEST_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return null;
  }

  function startTextareaWatcher() {
    clearTimeout(restoreTimer);
    let attempts = 0;
    const maxAttempts = 40; // 40 * 250ms = 10s

    function poll() {
      if (!isActive()) return;
      attempts++;
      const textarea = document.querySelector('ms-prompt-box textarea');
      if (textarea) {
        activeTextarea = textarea;
        attemptRestore(textarea);
      } else if (attempts < maxAttempts) {
        restoreTimer = setTimeout(poll, 250);
      }
    }

    poll();
  }

  function attemptRestore(textarea) {
    if (!isActive() || !textarea) return;

    // If textarea already has user text, do not overwrite
    if (textarea.value && textarea.value.trim() !== '') return;

    const key = getStorageKey();
    let saved = null;

    try {
      const raw = localStorage.getItem(key);
      if (raw) saved = JSON.parse(raw);
    } catch (_) {}

    // Fallback: If no draft for exact pathname, check latest saved draft (within last 2 hours)
    if (!saved || !saved.text) {
      const latest = getLatestSavedDraft();
      if (latest && latest.text && latest.ts) {
        const ageHours = (Date.now() - latest.ts) / (1000 * 60 * 60);
        if (ageHours < 2) {
          saved = latest;
        }
      }
    }

    if (!saved || !saved.text || !saved.text.trim()) return;

    // Reject drafts older than 72 hours
    if (saved.ts && Date.now() - saved.ts > 72 * 60 * 60 * 1000) {
      clearCurrentDraft();
      return;
    }

    isRestoring = true;
    applyText(textarea, saved.text);
    showRestoredIndicator(textarea, saved.text);

    // Angular FormControls often overwrite textarea.value to "" during late bootstrap.
    // Verify and re-apply at 400ms and 800ms if Angular wiped it back to empty.
    setTimeout(() => {
      if (textarea && textarea.value.trim() === '') {
        applyText(textarea, saved.text);
      }
      isRestoring = false;
    }, 400);

    setTimeout(() => {
      if (textarea && textarea.value.trim() === '') {
        applyText(textarea, saved.text);
      }
    }, 800);

    if (window.StudioLab && window.StudioLab.log) {
      window.StudioLab.log('Restored unsaved prompt draft (' + saved.text.length + ' chars)', 'success');
    }
  }

  function applyText(textarea, text) {
    textarea.value = text;
    textarea.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  function showRestoredIndicator(textarea, text) {
    removeIndicator();

    const promptBox = textarea.closest('ms-prompt-box');
    if (!promptBox) return;

    indicatorEl = document.createElement('div');
    indicatorEl.className = 'sl-draft-indicator';

    const iconSpan = document.createElement('span');
    iconSpan.className = 'material-symbols-outlined notranslate sl-draft-icon';
    iconSpan.textContent = 'history';

    const textSpan = document.createElement('span');
    textSpan.className = 'sl-draft-indicator-text';
    textSpan.textContent = 'Restored unsaved draft';

    const discardBtn = document.createElement('button');
    discardBtn.type = 'button';
    discardBtn.className = 'sl-draft-discard-btn';
    discardBtn.textContent = 'Discard';
    discardBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearCurrentDraft();
      if (activeTextarea) {
        applyText(activeTextarea, '');
      }
    };

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'sl-draft-close-btn';
    closeBtn.title = 'Dismiss';
    const closeIcon = document.createElement('span');
    closeIcon.className = 'material-symbols-outlined notranslate';
    closeIcon.textContent = 'close';
    closeBtn.appendChild(closeIcon);
    closeBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      removeIndicator();
    };

    indicatorEl.appendChild(iconSpan);
    indicatorEl.appendChild(textSpan);
    indicatorEl.appendChild(discardBtn);
    indicatorEl.appendChild(closeBtn);

    // Insert above prompt-box-container or prepend to promptBox
    const container = promptBox.querySelector('.prompt-box-container') || promptBox.firstElementChild;
    if (container) {
      promptBox.insertBefore(indicatorEl, container);
    } else {
      promptBox.prepend(indicatorEl);
    }
  }

  function removeIndicator() {
    if (indicatorEl) {
      indicatorEl.remove();
      indicatorEl = null;
    }
    const existing = document.querySelector('.sl-draft-indicator');
    if (existing) existing.remove();
  }
})();
