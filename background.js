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

const RELEASES_URL = 'https://api.github.com/repos/dorimommy/Studio.lab/releases?per_page=20';
const RELEASE_CACHE_KEY = 'slReleaseCheck';
const RELEASE_CACHE_MS = 24 * 60 * 60 * 1000;
let updateCheckPromise = null;

function versionParts(value) {
  const match = /^v?(\d+)\.(\d+)(?:\.(\d+))?(?:-(preview|beta)-(\d+)(?:-hotfix-(\d+))?)?(?:-release)?$/i.exec(value || '');
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3] || 0), match[4] ? 0 : 1,
    Number(match[5] || 0), Number(match[6] || 0)];
}

function compareVersions(a, b) {
  const left = versionParts(a);
  const right = versionParts(b);
  if (!left || !right) return null;
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  }
  return 0;
}

function validRelease(item) {
  if (!item || item.draft || !versionParts(item.tag_name)) return null;
  try {
    const url = new URL(item.html_url);
    if (url.origin !== 'https://github.com' ||
        !/^\/dorimommy\/Studio\.lab\/releases\/tag\/[^/]+$/.test(url.pathname)) return null;
    return { tag: item.tag_name, url: url.href };
  } catch (_) { return null; }
}

async function checkForUpdates(force = false) {
  if (updateCheckPromise) return updateCheckPromise;
  updateCheckPromise = (async () => {
    const manifest = chrome.runtime.getManifest();
    const currentVersion = manifest.version_name || manifest.version;
    const stored = await chrome.storage.local.get([RELEASE_CACHE_KEY]);
    let cache = stored[RELEASE_CACHE_KEY];
    let stale = false;
    const cacheIsFresh = cache && Number.isFinite(cache.checkedAt) &&
      cache.checkedAt <= Date.now() && Date.now() - cache.checkedAt < RELEASE_CACHE_MS;
    if (force || !cacheIsFresh) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(RELEASES_URL, {
          headers: { Accept: 'application/vnd.github+json' },
          credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal
        });
        if (!response.ok) throw new Error('GitHub release check failed');
        const releases = await response.json();
        if (!Array.isArray(releases)) throw new Error('Unexpected GitHub response');
        const latest = releases.map(validRelease).filter(Boolean).reduce((best, release) =>
          !best || compareVersions(release.tag, best.tag) > 0 ? release : best, null);
        cache = { checkedAt: Date.now(), latest };
        await chrome.storage.local.set({ [RELEASE_CACHE_KEY]: cache });
      } catch (_) {
        if (!cache) return { ok: false, currentVersion };
        stale = true;
      } finally {
        clearTimeout(timeout);
      }
    }
    const latest = cache?.latest
      ? validRelease({ tag_name: cache.latest.tag, html_url: cache.latest.url })
      : null;
    return {
      ok: true,
      stale,
      currentVersion,
      latestVersion: latest?.tag || null,
      releaseUrl: latest?.url || null,
      updateAvailable: !!(latest && compareVersions(latest.tag, currentVersion) > 0),
      checkedAt: cache?.checkedAt || null
    };
  })();
  try { return await updateCheckPromise; }
  finally { updateCheckPromise = null; }
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.action === 'checkForUpdates') {
    checkForUpdates(message.force === true).then(reply).catch(() => reply({ ok: false }));
    return true;
  }
  if (message?.action !== 'getTelemetryStatus') return;
  queue.then(async () => {
    try {
      const active = await chrome.declarativeNetRequest.getEnabledRulesets();
      reply({ enabled: active.includes('telemetry_blocker'), ok: !lastError, error: lastError });
    } catch (_) { reply({ enabled: null, ok: false, error: 'Network rule status unavailable.' }); }
  });
  return true;
});
