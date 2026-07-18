/**
 * Studio.lab module: default-profile
 * Saves the current Model, System Instructions, and Run Settings as a default profile,
 * and automatically applies them whenever a new chat is started.
 */
(function () {
  'use strict';

  if (!window.StudioLab || typeof window.StudioLab.registerModule !== 'function') return;

  const STORAGE_KEY = 'sl_defaultProfile';
  const LIBRARY_KEY = 'sl_sysInstLibrary';

  function executeInMainWorld(eventName, payload = {}) {
    return new Promise((resolve) => {
      const eventId = Math.random().toString(36).substr(2, 9);
      const listener = (e) => {
        window.removeEventListener('__sl_result_' + eventId, listener);
        resolve(e.detail);
      };
      window.addEventListener('__sl_result_' + eventId, listener);
      payload.eventId = eventId;
      window.dispatchEvent(new CustomEvent(eventName, { detail: payload }));
      setTimeout(() => {
        window.removeEventListener('__sl_result_' + eventId, listener);
        resolve({ error: 'Timeout waiting for MAIN world' });
      }, 5000);
    });
  }

  let _ddSelectedValue = '';
  let _ddSelectedText = '(No Instruction Selected)';
  let _ddItems = [];
  let _ddRebuildFn = null;

  async function syncLibrary() {
    const btn = document.getElementById('sl-profile-sync-icon');
    if (btn) btn.style.animation = 'sl-spin-anim 0.8s linear infinite';
    
    const items = await executeInMainWorld('__sl_syncLibrary');
    
    if (btn) btn.style.animation = '';

    if (!items || items.error) {
      window.StudioLab.log('Could not sync library. ' + (items && items.error ? items.error : 'Make sure you are in a chat.'));
      return;
    }

    chrome.storage.local.set({ [LIBRARY_KEY]: items }, () => {
      renderLibraryOptions(items);
      window.StudioLab.log('Synced ' + items.length + ' instructions from your library!');
    });
  }

  function renderLibraryOptions(items) {
    _ddItems = [{ value: '', text: '(No Instruction Selected)' }];
    (items || []).forEach(item => {
      _ddItems.push({ value: item.id, text: item.text });
    });

    chrome.storage.local.get([STORAGE_KEY], (res) => {
      const profile = res[STORAGE_KEY];
      if (profile && profile.systemInstructionId) {
        const found = _ddItems.find(i => i.value === profile.systemInstructionId);
        if (found) {
          _ddSelectedValue = found.value;
          _ddSelectedText = found.text;
        }
      }
      if (_ddRebuildFn) _ddRebuildFn();
    });
  }

  async function saveCurrentAsDefault() {
    const selectedInstId = _ddSelectedValue;
    let profile = await executeInMainWorld('__sl_captureProfile');
    
    if (!profile || profile.error) {
      window.StudioLab.log('Could not capture settings. Ensure you have loaded a chat and selected a model.');
      return;
    }
    
    if (selectedInstId !== null && selectedInstId !== '') {
       profile.systemInstructionId = selectedInstId;
       await new Promise((resolve) => {
         chrome.storage.local.get([LIBRARY_KEY], (res) => {
           if (res[LIBRARY_KEY]) {
             const found = res[LIBRARY_KEY].find(item => item.id === selectedInstId);
             if (found) profile.systemInstructions = found.instructionText || found.text;
           }
           resolve();
         });
       });
    } else {
       profile.systemInstructionId = null;
       profile.systemInstructions = null;
    }

    chrome.storage.local.set({ [STORAGE_KEY]: profile }, () => {
      window.dispatchEvent(new Event('__sl_profile_updated'));
      window.StudioLab.log('Default Profile Saved!');
    });
  }

  function clearDefaultProfile() {
    chrome.storage.local.remove(STORAGE_KEY, () => {
      _ddSelectedValue = '';
      _ddSelectedText = '(No Instruction Selected)';
      if (_ddRebuildFn) _ddRebuildFn();
      window.dispatchEvent(new Event('__sl_profile_updated'));
      window.StudioLab.log('Default Profile Cleared.');
    });
  }

  function triggerAutoApply() {
    if (location.pathname !== '/prompts/new_chat') return;
    chrome.storage.local.get([STORAGE_KEY], (res) => {
      if (res[STORAGE_KEY]) {
        let attempts = 0;
        async function attemptApply() {
           attempts++;
           const result = await executeInMainWorld('__sl_applyProfile', { profile: res[STORAGE_KEY] });
           if (result === true) {
              window.StudioLab.log('Default Profile: Applied successfully.');
           } else if (attempts <= 30) {
              setTimeout(attemptApply, 500);
           }
        }
        attemptApply();
      }
    });
  }

  window.addEventListener('__sl_routeChanged', (e) => {
    const url = e.detail && e.detail.url;
    if (url && url.includes('/prompts/new_chat')) triggerAutoApply();
  });

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(triggerAutoApply, 1000);
  } else {
    window.addEventListener('DOMContentLoaded', () => setTimeout(triggerAutoApply, 1000));
  }

  window.StudioLab.registerModule({
    id: 'default-profile',
    group: 'modules',
    order: 10,
    title: 'Default Profile',
    subtitle: 'Auto-apply your preferred model and instructions',
    alwaysSelected: true,
    renderControls: () => `
      <style>
        @keyframes sl-spin-anim { 100% { transform: rotate(360deg); } }
        
        .sl-dropdown-wrapper {
           position: relative; width: 100%;
        }

        .sl-dropdown-trigger {
           display: flex; align-items: center; justify-content: space-between;
           width: 100%; box-sizing: border-box;
           padding: 8px 16px;
           height: 36px;
           border: none !important; /* NO OUTLINE FUCK */
           border-radius: 12px;
           background: var(--color-v3-surface-container-high, #333);
           cursor: pointer;
           font: 500 14px/21px Inter, sans-serif;
           color: var(--color-v3-text, #d4d4d4);
           transition: background-color .15s;
           outline: none !important;
        }
        .sl-dropdown-trigger:hover {
           background: var(--color-v3-hover, #3a3a3a);
        }
        .sl-dropdown-trigger.open,
        .sl-dropdown-trigger:focus-visible {
           box-shadow: inset 0 0 0 2px var(--color-v3-primary, #a8c7fa);
        }
        
        .sl-dropdown-panel {
           display: none;
           position: absolute; left: 0; right: 0;
           top: calc(100% + 4px);
           z-index: 1000;
           background: var(--color-v3-surface-container, #1e1e1e);
           border: 1px solid var(--color-v3-outline-var, #262626);
           border-radius: 12px;
           box-shadow: rgba(0,0,0,0.3) 0px 8px 24px;
           padding: 8px;
           max-height: 250px; overflow-y: auto;
        }
        .sl-dropdown-trigger.open + .sl-dropdown-panel {
           display: block;
        }

        .sl-dropdown-option {
           display: flex; align-items: center; justify-content: space-between;
           padding: 8px 12px; width: 100%; box-sizing: border-box;
           background: transparent; border: none; text-align: left;
           color: var(--color-v3-text, #d4d4d4);
           font: 500 14px/21px Inter, sans-serif;
           border-radius: 8px;
           cursor: pointer;
           margin-bottom: 2px;
           outline: none !important;
        }
        .sl-dropdown-option:hover,
        .sl-dropdown-option:focus-visible {
           background: var(--color-v3-hover, #323232);
        }
        
        .sl-native-icon-btn {
           width: 36px; height: 36px;
           display: inline-flex; align-items: center; justify-content: center;
           border-radius: 12px;
           border: none !important;
           background: var(--color-v3-surface-container-high, #333);
           cursor: pointer;
           color: var(--color-v3-text-var, #8c8c8c);
           transition: background 0.15s, color 0.15s;
           flex-shrink: 0;
           outline: none !important;
        }
        .sl-native-icon-btn:hover,
        .sl-native-icon-btn:focus-visible {
           background: var(--color-v3-hover, #323232);
           color: var(--color-v3-text, #ffffff);
        }

        .sl-profile-card {
          width: 100%; padding: 12px; box-sizing: border-box;
          border-radius: 12px;
          border: none;
          background: var(--color-v3-surface-container-high, #333);
          display: flex; flex-direction: column; gap: 4px;
        }
        .sl-profile-card .title {
          color: var(--color-v3-text, #d4d4d4);
          font: 500 14px/21px Inter, sans-serif; margin: 0;
        }
        .sl-profile-card .subtitle {
          color: var(--color-v3-text-var, #8c8c8c);
          font: 400 12px/18px Inter, sans-serif; margin: 0;
        }
        
        /* Note: .sl-apply-btn global styles from sl-panel.css are used instead of overriding them here to prevent bloated buttons! */
      </style>
      <div class="sl-controls-row" style="padding: 0 12px 12px; display: flex; flex-direction: column; gap: 8px; width: 100%; box-sizing: border-box;">

        <div id="sl-current-profile-stats" style="display: none;"></div>

        <div style="display: flex; gap: 8px; align-items: center;">
          
          <div class="sl-dropdown-wrapper" id="sl-inst-dropdown">
            <button type="button" class="sl-dropdown-trigger" id="sl-inst-trigger">
               <span id="sl-inst-value" style="flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">(No Instruction Selected)</span>
               <span class="material-symbols-outlined notranslate" id="sl-inst-chevron" style="font-size: 20px; color: var(--color-v3-text-var, #8c8c8c);">expand_more</span>
            </button>
            <div class="sl-dropdown-panel" id="sl-inst-menu"></div>
          </div>

          <button type="button" class="sl-native-icon-btn" id="sl-profile-sync" title="Sync from AI Studio">
            <span class="material-symbols-outlined notranslate" id="sl-profile-sync-icon" style="font-size: 20px;" aria-hidden="true">sync</span>
          </button>
        </div>

        <div style="display: flex; gap: 8px; align-items: stretch;">
           <button type="button" class="sl-apply-btn" id="sl-profile-save" style="flex: 1;">Save as Default Profile</button>
           
           <button type="button" class="sl-native-icon-btn destructive" id="sl-profile-clear" style="display: none;" title="Delete">
             <span class="material-symbols-outlined notranslate" style="font-size: 20px;" aria-hidden="true">delete</span>
           </button>
        </div>
      </div>
    `,
    bindControls: (modalEl) => {
      const btnSave = modalEl.querySelector('#sl-profile-save');
      const btnClear = modalEl.querySelector('#sl-profile-clear');
      const btnSync = modalEl.querySelector('#sl-profile-sync');
      const dropdown = modalEl.querySelector('#sl-inst-dropdown');
      const trigger = modalEl.querySelector('#sl-inst-trigger');
      const chevron = modalEl.querySelector('#sl-inst-chevron');
      const menuEl = modalEl.querySelector('#sl-inst-menu');
      const triggerText = modalEl.querySelector('#sl-inst-value');

      function closeDropdown() { 
         trigger.classList.remove('open'); 
         chevron.textContent = 'expand_more';
      }
      function openDropdown() { 
         trigger.classList.add('open'); 
         chevron.textContent = 'expand_less';
      }

      function rebuildMenu() {
        menuEl.innerHTML = '';
        triggerText.textContent = _ddSelectedText;

        const items = _ddItems.length ? _ddItems : [{ value: '', text: '(No Instruction Selected)' }];
        items.forEach((item) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'sl-dropdown-option';
          
          let checkSvg = item.value === _ddSelectedValue ? '<span class="material-symbols-outlined notranslate" style="font-size: 18px; color: var(--color-v3-text, #fff);">check</span>' : '<span style="width: 18px;"></span>';
          btn.innerHTML = '<span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + item.text + '</span>' + checkSvg;
          
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            _ddSelectedValue = item.value;
            _ddSelectedText = item.text;
            triggerText.textContent = item.text;
            closeDropdown();
            rebuildMenu();
          });
          menuEl.appendChild(btn);
        });
      }
      _ddRebuildFn = rebuildMenu;

      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        if (trigger.classList.contains('open')) closeDropdown();
        else openDropdown();
      });

      document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target)) closeDropdown();
      });

      if (btnSave) btnSave.addEventListener('click', (e) => { e.stopPropagation(); saveCurrentAsDefault(); });
      if (btnClear) btnClear.addEventListener('click', (e) => { e.stopPropagation(); clearDefaultProfile(); });
      if (btnSync) btnSync.addEventListener('click', (e) => { e.stopPropagation(); syncLibrary(); });

      function updateStatsDisplay() {
         chrome.storage.local.get([STORAGE_KEY, LIBRARY_KEY], (res) => {
            const statsEl = modalEl.querySelector('#sl-current-profile-stats');
            const clearBtn = modalEl.querySelector('#sl-profile-clear');
            if (!statsEl) return;
            const profile = res[STORAGE_KEY];
            if (profile && profile.model) {
               // Show stats
               const model = profile.model || 'Unknown';
               
               let instDisplay = 'None';
               if (profile.systemInstructionId && res[LIBRARY_KEY]) {
                 const found = res[LIBRARY_KEY].find(i => i.id === profile.systemInstructionId);
                 if (found) instDisplay = found.text;
               } else if (profile.systemInstructions) {
                 instDisplay = profile.systemInstructions.substring(0, 30);
               }

               const enabledTools = (profile.tools || []).filter(t => t.checked).length;
               
               statsEl.innerHTML =
                 '<div class="sl-profile-card">' +
                   '<h3 class="title">' + model + '</h3>' +
                   '<p class="subtitle">Instruction: ' + instDisplay + (enabledTools > 0 ? ' • ' + enabledTools + ' Tools' : '') + '</p>' +
                 '</div>';
               statsEl.style.display = 'block';

               // Show delete button
               if (clearBtn) clearBtn.style.display = 'flex';
            } else {
               statsEl.style.display = 'none';
               // Hide delete button
               if (clearBtn) clearBtn.style.display = 'none';
            }
         });
      }
      
      updateStatsDisplay();
      window.addEventListener('__sl_profile_updated', updateStatsDisplay);

      chrome.storage.local.get([LIBRARY_KEY], (res) => {
        if (res[LIBRARY_KEY]) {
          renderLibraryOptions(res[LIBRARY_KEY]);
        } else {
          rebuildMenu();
        }
      });
    }
  });

})();
