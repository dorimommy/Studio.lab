chrome.action.onClicked.addListener((tab) => {
  if (tab.url && tab.url.includes("aistudio.google.com")) {
    chrome.tabs.sendMessage(tab.id, { action: "openStudioLab" }).catch(() => {
      console.log("[Studio.lab] Could not open panel. Is the page fully loaded?");
    });
  }
});

// Sync Telemetry Blocker UI state with declarativeNetRequest ruleset
function syncTelemetryRules(enabled) {
  if (typeof chrome.declarativeNetRequest === 'undefined') return;
  
  const options = enabled
    ? { enableRulesetIds: ['telemetry_blocker'], disableRulesetIds: [] }
    : { disableRulesetIds: ['telemetry_blocker'], enableRulesetIds: [] };
    
  chrome.declarativeNetRequest.updateEnabledRulesets(options).catch(err => {
    console.error('[Studio.lab] Error updating ruleset:', err);
  });
}

// Initial sync on extension load
chrome.storage.local.get(['slState'], (data) => {
  const state = data.slState || {};
  // Default to true if not set
  const isEnabled = state.telemetryBlockerEnabled !== false;
  syncTelemetryRules(isEnabled);
});

// Watch for toggle changes in UI
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.slState) {
    const newState = changes.slState.newValue || {};
    const oldState = changes.slState.oldValue || {};
    if (newState.telemetryBlockerEnabled !== oldState.telemetryBlockerEnabled) {
      const isEnabled = newState.telemetryBlockerEnabled !== false;
      syncTelemetryRules(isEnabled);
    }
  }
});
