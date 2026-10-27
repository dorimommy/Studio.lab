// Apply the saved model, system instructions, and run settings whenever a new chat starts.
(function () {
  'use strict';

  if (!window.StudioLab || typeof window.StudioLab.registerModule !== 'function') return;

  const { $, scope, store } = window.StudioLabCore;

  const STORAGE_KEY = 'sl_defaultProfile';
  const LIBRARY_KEY = 'sl_sysInstLibrary';
  const lifetime = window.StudioLab.createScope();
  let nativeInstructions = [];

  function isActive() {
    return !lifetime.disposed && window.StudioLab.isExtensionActive();
  }

  function contextError() {
    return new Error('Extension context invalidated');
  }

  function handleError(error) {
    if (!window.StudioLab.handleExtensionError(error)) return false;
    lifetime.dispose();
    return true;
  }

  function storageOperation(method, value) {
    if (!isActive()) return Promise.reject(contextError());
    return new Promise((resolve, reject) => {
      let settled = false;
      const cancel = lifetime.add(() => {
        if (settled) return;
        settled = true;
        reject(contextError());
      });
      function finish(error, result) {
        if (settled) return;
        settled = true;
        cancel();
        if (error) { handleError(error); reject(error); }
        else resolve(result);
      }
      try {
        store[method](value).then(
          result => {
            if (!isActive()) { finish(contextError()); return; }
            finish(null, result);
          },
          error => finish(error instanceof Error ? error : new Error(String((error && error.message) || error)))
        );
      } catch (error) { finish(error); }
    });
  }

  function readStorage(keys) { return storageOperation('get', keys).then(data => data || {}); }

  function executeInMainWorld(eventName, payload = {}) {
    if (!isActive()) return Promise.resolve({ error: 'Extension context invalidated' });
    return new Promise((resolve) => {
      const eventId = Math.random().toString(36).slice(2, 11);
      let settled = false;
      let cancelTimeout = () => {};
      let cancel = () => {};
      function finish(result) {
        if (settled) return;
        settled = true;
        cancelTimeout();
        cancel();
        window.removeEventListener('__sl_result_' + eventId, listener);
        resolve(result);
      }
      const listener = (e) => {
        if (e.detail?.error) handleError(new Error(e.detail.error));
        if (!isActive()) { finish({ error: 'Extension context invalidated' }); return; }
        finish(e.detail);
      };
      cancel = lifetime.add(() => finish({ error: 'Extension context invalidated' }));
      cancelTimeout = lifetime.timeout(() => {
        finish({ error: 'Timeout waiting for MAIN world' });
      }, 5000);
      window.addEventListener('__sl_result_' + eventId, listener);
      payload.eventId = eventId;
      window.dispatchEvent(new CustomEvent(eventName, { detail: payload }));
    });
  }

  let selectedInstructionId = '';
  let instructionOptions = [];
  let rebuildInstructionSelect = null;

  function writeStorage(method, value) {
    return storageOperation(method, value);
  }
  async function syncLibrary() {
    const items = await executeInMainWorld('__sl_syncLibrary');
    if (!isActive()) return t('profile_reload_reconnect', 'Reload AI Studio to reconnect Studio.lab.');
    if (!Array.isArray(items) || items.error) {
      window.StudioLab.log('Could not sync library. ' + (items?.error || 'Make sure you are in a chat.'));
      return t('profile_sync_error', 'Could not sync instructions. Open a chat and try again.');
    }
    await writeStorage('set', { [LIBRARY_KEY]: items });
    if (!isActive()) return t('profile_reload_reconnect', 'Reload AI Studio to reconnect Studio.lab.');
    renderLibraryOptions(items);
    window.StudioLab.log('Synced ' + items.length + ' instructions from your library!');
    return t('profile_synced_prefix', 'Synced') + ' ' + items.length + ' ' + t('profile_synced_suffix', 'saved instructions from AI Studio.');
  }
  function t(key, fallback) {
    return window.StudioLab?.i18n?.t ? window.StudioLab.i18n.t(key, fallback || key) : (fallback || key);
  }
  function renderLibraryOptions(items) {
    nativeInstructions = Array.isArray(items) ? items : [];
    instructionOptions = [{ value: '', text: t('no_saved_instruction', 'No saved instruction') }];
    nativeInstructions.forEach(item => instructionOptions.push({ value: item.id, text: item.text }));
    if (rebuildInstructionSelect) rebuildInstructionSelect();
  }
  async function saveCurrentAsDefault() {
    const selectedId = selectedInstructionId;
    const profile = await executeInMainWorld('__sl_captureProfile');
    if (!isActive()) return t('profile_reload_reconnect', 'Reload AI Studio to reconnect Studio.lab.');
    if (!profile || profile.error) {
      window.StudioLab.log('Could not capture settings. Ensure you have loaded a chat and selected a model.');
      return t('profile_capture_error', 'Could not read current settings. Open a chat and select a model first.');
    }
    if (selectedId !== null && selectedId !== '') {
      profile.systemInstructionId = selectedId;
      const data = await readStorage([LIBRARY_KEY]);
      const options = Array.isArray(data[LIBRARY_KEY]) ? data[LIBRARY_KEY] : [];
      const found = options.find(item => item.id === selectedId);
      if (found) profile.systemInstructions = found.instructionText || found.text;
    } else {
      profile.systemInstructionId = null;
      profile.systemInstructions = null;
    }
    await writeStorage('set', { [STORAGE_KEY]: profile });
    if (!isActive()) return t('profile_reload_reconnect', 'Reload AI Studio to reconnect Studio.lab.');
    window.dispatchEvent(new Event('__sl_profile_updated'));
    window.StudioLab.log('Default Profile Saved!');
    return t('profile_saved_success', 'Current model and run settings saved as the default profile.');
  }
  async function clearDefaultProfile() {
    await writeStorage('remove', STORAGE_KEY);
    if (!isActive()) return t('profile_reload_reconnect', 'Reload AI Studio to reconnect Studio.lab.');
    selectedInstructionId = '';
    if (rebuildInstructionSelect) rebuildInstructionSelect();
    window.dispatchEvent(new Event('__sl_profile_updated'));
    window.StudioLab.log('Default Profile Cleared.');
    return t('profile_cleared_success', 'Default profile removed. Your current chat settings are retained.');
  }

  let isAutoApplying = false;
  let autoApplyTimeout = null;

  function triggerAutoApply() {
    if (!isActive()) return;
    if (!location.pathname.startsWith('/prompts/new_chat')) return;
    if (isAutoApplying) return;

    if (autoApplyTimeout) autoApplyTimeout();
    autoApplyTimeout = lifetime.timeout(() => {
      autoApplyTimeout = null;
      if (!isActive()) return;
      if (!location.pathname.startsWith('/prompts/new_chat')) return;
      if (isAutoApplying) return;

      readStorage([STORAGE_KEY]).then(res => {
        if (!isActive()) return;
        if (!res[STORAGE_KEY]) return;
        if (!location.pathname.startsWith('/prompts/new_chat')) return;

        isAutoApplying = true;
        let attempts = 0;
        async function attemptApply() {
          if (!isActive() || !location.pathname.startsWith('/prompts/new_chat')) {
            isAutoApplying = false;
            return;
          }

          attempts++;
          try {
            const result = await executeInMainWorld('__sl_applyProfile', { profile: res[STORAGE_KEY] });
            if (!isActive()) { isAutoApplying = false; return; }
            if (result === true) {
              window.StudioLab.log('Default Profile: Applied successfully.');
              isAutoApplying = false;
              return;
            }
          } catch (error) {
            if (handleError(error)) { isAutoApplying = false; return; }
            window.StudioLab.log('Default Profile could not apply. ' + error.message, 'warn');
          }

          if (isActive() && attempts <= 30 && location.pathname.startsWith('/prompts/new_chat')) {
            lifetime.timeout(attemptApply, 500);
          } else {
            isAutoApplying = false;
          }
        }
        attemptApply();
      }).catch(error => {
        if (!handleError(error)) window.StudioLab.log('Could not read the default profile. ' + error.message, 'warn');
      });
    }, 150);
  }

  lifetime.add(window.StudioLab.onExtensionInvalidated(() => lifetime.dispose()));
  lifetime.add(() => { isAutoApplying = false; autoApplyTimeout = null; });
  lifetime.listen(window, '__sl_routeChanged', (e) => {
    const url = (e.detail && e.detail.url) || location.href;
    if (url && url.includes('/prompts/new_chat')) triggerAutoApply();
  });

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    lifetime.timeout(triggerAutoApply, 1000);
  } else {
    lifetime.listen(window, 'DOMContentLoaded', () => lifetime.timeout(triggerAutoApply, 1000), { once: true });
  }

  window.StudioLab.registerModule({
    id: 'default-profile',
    group: 'modules',
    order: 10,
    title: 'Default Profile',
    subtitle: 'Auto-apply your preferred model and instructions',
    alwaysSelected: true,
    dispose() { lifetime.dispose(); },
    onRouteChange(ctx) {
      const url = (ctx && ctx.currentUrl) || location.href;
      if (url.includes('/prompts/new_chat') || location.pathname.startsWith('/prompts/new_chat')) {
        triggerAutoApply();
      }
    },
    renderControls: () => `
      <div class="sl-setting-tool-fields" data-sl-controls-for="default-profile" data-sl-search="New chat defaults default profile model saved instruction sync library save current settings remove default">
        <div class="sl-profile-setup">
            <div class="sl-setting-row sl-profile-instruction-row">
              <div class="sl-setting-copy">
                <label class="sl-setting-label" for="sl-profile-instruction">${t('system_instruction_label', 'System instruction')}</label>
                <p class="sl-setting-help" id="sl-profile-instruction-help">${t('system_instruction_help', 'Choose a saved instruction for new chats.')}</p>
              </div>
              <div class="sl-setting-control">
                <select class="sl-setting-input" id="sl-profile-instruction" aria-describedby="sl-profile-instruction-help">
                  <option value="">${t('no_saved_instruction', 'No saved instruction')}</option>
                </select>
                <button type="button" class="sl-settings-button" id="sl-profile-sync" aria-describedby="sl-profile-instruction-help">${t('btn_refresh_library', 'Refresh library')}</button>
              </div>
            </div>
            <div class="sl-setting-row sl-profile-saved-row">
              <div class="sl-setting-copy"><span class="sl-setting-label">${t('model_run_settings_label', 'Model and run settings')}</span><p class="sl-setting-help" id="sl-current-profile-stats">${t('no_default_profile_saved', 'No default profile saved.')}</p></div>
              <div class="sl-setting-actions">
              <button type="button" class="sl-settings-button" id="sl-profile-save">${t('btn_use_current_chat', 'Use current chat')}</button>
              <button type="button" class="sl-settings-button destructive" id="sl-profile-clear" hidden>${t('btn_remove_default', 'Remove default')}</button>
              </div>
            </div>
        </div>
        <p class="sl-setting-help" id="sl-profile-status" role="status" aria-live="polite" aria-atomic="true"></p>
      </div>
    `,
    bindControls: (modalEl, ctx) => {
      if (!isActive()) return () => {};
      const select = $('#sl-profile-instruction', modalEl);
      const save = $('#sl-profile-save', modalEl);
      const clear = $('#sl-profile-clear', modalEl);
      const syncButton = $('#sl-profile-sync', modalEl);
      const status = $('#sl-profile-status', modalEl);
      const fields = $('[data-sl-controls-for="default-profile"]', modalEl);
      const styledSelect = window.StudioLabSelect?.enhance(select);
      const bindScope = scope();
      let disposed = false;
      let busy = false;
      let pendingClearHide = false;
      let selectionRevision = 0;
      let libraryRevision = 0;
      let statsRevision = 0;
      selectedInstructionId = '';
      const disposeBinding = lifetime.add(() => {
        disposed = true;
        styledSelect?.dispose();
        bindScope.dispose();
        if (rebuildInstructionSelect === rebuildSelect) rebuildInstructionSelect = null;
      });
      function listen(target, type, callback) {
        if (!target) return;
        bindScope.on(target, type, callback);
      }
      function report(message) {
        if (disposed) return;
        if (status) status.textContent = message;
        else ctx?.announceSettings?.(message);
      }
      function setBusy(value, invoker) {
        busy = value;
        fields?.setAttribute('aria-busy', String(value));
        for (const control of [select, save, clear, syncButton]) {
          if (!control) continue;
          // Keep the button focusable while busy; the shared guard prevents repeated activation.
          control.disabled = value && control !== invoker;
          if (value && control === invoker) control.setAttribute('aria-disabled', 'true');
          else control.removeAttribute('aria-disabled');
        }
        styledSelect?.refresh();
      }
      function hideClear() {
        if (!clear) return;
        const returnFocus = document.activeElement === clear;
        clear.hidden = true;
        pendingClearHide = false;
        if (returnFocus) save?.focus();
      }
      function rebuildSelect() {
        if (!select || disposed) return;
        while (select.firstChild) select.removeChild(select.firstChild);
        const items = instructionOptions.length ? instructionOptions : [{ value: '', text: t('no_saved_instruction', 'No saved instruction') }];
        if (!items.some(item => item.value === selectedInstructionId)) selectedInstructionId = '';
        for (const item of items) {
          const option = document.createElement('option');
          option.value = item.value;
          option.textContent = item.value === '' ? t('no_saved_instruction', 'No saved instruction') : (item.text || '');
          select.appendChild(option);
        }
        select.value = selectedInstructionId;
        styledSelect?.refresh();
      }
      rebuildInstructionSelect = rebuildSelect;
      function applySavedSelection(profile) {
        selectedInstructionId = typeof profile?.systemInstructionId === 'string' ? profile.systemInstructionId : '';
        rebuildSelect();
      }
      function reloadSavedSelection() {
        const revision = ++selectionRevision;
        readStorage([STORAGE_KEY]).then(data => {
          if (!disposed && selectionRevision === revision) applySavedSelection(data[STORAGE_KEY]);
        }).catch(error => {
          if (!handleError(error)) report('Could not read the default profile. ' + error.message);
        });
      }
      function updateStatsDisplay() {
        const revision = ++statsRevision;
        readStorage([STORAGE_KEY, LIBRARY_KEY]).then(data => {
          if (disposed || statsRevision !== revision) return;
          const stats = $('#sl-current-profile-stats', modalEl);
          const profile = data[STORAGE_KEY];
          if (!stats) return;
          if (clear) {
            if (profile) { clear.hidden = false; pendingClearHide = false; }
            else if (busy && document.activeElement === clear) pendingClearHide = true;
            else hideClear();
          }
          if (!profile?.model) {
            stats.textContent = t('no_default_profile_saved', 'No default profile saved.');
            return;
          }
          let instruction = t('no_saved_instruction', 'No saved instruction');
          if (profile.systemInstructionId) {
            const options = Array.isArray(data[LIBRARY_KEY]) ? data[LIBRARY_KEY] : [];
            const found = options.find(item => item.id === profile.systemInstructionId);
            if (found) instruction = found.text;
            else if (profile.systemInstructions) instruction = t('profile_saved_instruction', 'Saved instruction');
          } else if (profile.systemInstructions) instruction = t('profile_saved_instruction', 'Saved instruction');
          const tools = (profile.tools || []).filter(tool => tool.checked).length;
          stats.textContent = profile.model + ' · ' + instruction + (tools ? ' · ' + tools + ' ' + t('profile_enabled_tools', 'enabled tools') : '');
        }).catch(error => {
          if (!handleError(error)) report('Could not read the default profile. ' + error.message);
        });
      }
      async function run(action, pending, invoker) {
        if (busy || disposed) return;
        setBusy(true, invoker);
        report(pending);
        try {
          report(await action());
          if (!disposed) updateStatsDisplay();
        } catch (error) {
          if (!handleError(error)) report('The profile action could not finish. ' + (error.message || 'Try again.'));
        } finally {
          if (!disposed) {
            setBusy(false);
            if (pendingClearHide) hideClear();
          }
        }
      }
      listen(select, 'change', () => { selectedInstructionId = select.value; selectionRevision++; });
      listen(save, 'click', () => run(saveCurrentAsDefault, t('profile_reading_settings', 'Reading current settings…'), save));
      listen(clear, 'click', () => run(clearDefaultProfile, t('profile_removing_default', 'Removing default profile…'), clear));
      listen(syncButton, 'click', () => run(syncLibrary, t('profile_syncing_instructions', 'Syncing saved instructions…'), syncButton));
      listen(window, '__sl_profile_updated', () => { updateStatsDisplay(); reloadSavedSelection(); });
      let storageChanges;
      try {
        if (isActive()) storageChanges = chrome.storage.onChanged;
      } catch (error) {
        if (!handleError(error)) throw error;
      }
      if (storageChanges?.addListener) {
        const changed = (changes, area) => {
          if (disposed || area !== 'local') return;
          if (changes[LIBRARY_KEY]) {
            libraryRevision++;
            renderLibraryOptions(changes[LIBRARY_KEY].newValue);
          }
          if (changes[STORAGE_KEY]) {
            selectionRevision++;
            applySavedSelection(changes[STORAGE_KEY].newValue);
            updateStatsDisplay();
          }
        };
        try {
          storageChanges.addListener(changed);
          bindScope.add(() => {
            try { storageChanges.removeListener(changed); }
            catch (error) { if (!handleError(error)) throw error; }
          });
        } catch (error) {
          if (!handleError(error)) throw error;
        }
      }
      updateStatsDisplay();
      const initialSelectionRevision = selectionRevision;
      const initialLibraryRevision = libraryRevision;
      readStorage([STORAGE_KEY, LIBRARY_KEY]).then(data => {
        if (disposed) return;
        if (libraryRevision === initialLibraryRevision) {
          renderLibraryOptions(data[LIBRARY_KEY] || []);
        }
        if (selectionRevision === initialSelectionRevision) applySavedSelection(data[STORAGE_KEY]);
      }).catch(error => {
        if (!handleError(error)) report('Could not read saved instructions. ' + error.message);
      });
      return disposeBinding;
    }
  });

})();
