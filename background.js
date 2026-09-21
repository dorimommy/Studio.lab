'use strict';
chrome.action.onClicked.addListener(tab => {
  let url;
  try { url = new URL(tab.url); } catch (_) { return; }
  if (url.protocol !== 'https:' || url.hostname !== 'aistudio.google.com') return;
  chrome.tabs.sendMessage(tab.id, { action: 'openStudioLab' }).catch(() => {
    console.warn('[Studio.lab] Reload AI Studio to connect the extension.');
  });
});

// Serialize updates and read the latest preference inside each queued operation.
let queue = Promise.resolve();
let lastError = null;
function syncTelemetryRules() {
  queue = queue.then(async () => {
    const data = await chrome.storage.local.get(['slState']);
    const enabled = data.slState?.telemetryBlockerEnabled !== false;
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: enabled ? ['telemetry_blocker'] : [],
      disableRulesetIds: enabled ? [] : ['telemetry_blocker']
    });
    lastError = null;
  }).catch(() => { lastError = 'Could not synchronize network rules.'; });
  return queue;
}
syncTelemetryRules();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.slState) syncTelemetryRules();
});

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.action !== 'getTelemetryStatus') return;
  queue.then(async () => {
    try {
      const active = await chrome.declarativeNetRequest.getEnabledRulesets();
      reply({ enabled: active.includes('telemetry_blocker'), ok: !lastError, error: lastError });
    } catch (_) { reply({ enabled: null, ok: false, error: 'Network rule status unavailable.' }); }
  });
  return true;
});
