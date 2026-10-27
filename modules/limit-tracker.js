/**
 * limit-tracker.js — Daily per-model request tracker for Google AI Studio.
 *
 * Built on @studiolab/core. Counts GenerateContent requests per model per
 * Pacific-Time day (Google resets free-tier daily quotas at midnight PT),
 * shows a small usage badge near the prompt box, and marks a model as
 * exhausted when the interceptor reports a real 429 quota response.
 *
 * Counts are local estimates: Google does not publish exact per-model daily
 * caps, so caps are editable and the 429 signal is the ground truth.
 * Zero backend, zero telemetry — everything stays in chrome.storage.local.
 */
(function () {
  'use strict';

  if (!window.StudioLab || typeof window.StudioLab.registerModule !== 'function') return;
  const { $, el, scope, store, waitFor } = window.StudioLabCore;

  const STORE_KEY = 'sl_limits_v1';
  const PT_TZ = 'America/Los_Angeles';
  // Free-tier daily requests-per-day ballparks (Google does not publish exact
  // per-model caps and has adjusted them before) — editable in the badge popover.
  const FAMILY_CAPS = [
    [/image|imagen|banana/i, 50],
    [/pro/i, 50],
    [/flash|lite/i, 250]
  ];
  const FALLBACK_CAP = 100;

  let io = null;
  let ctxRef = null;
  let enabled = false;
  let data = null;         // { day, counts: {model:n}, exhausted: {model:{ts,quotaId,limit}}, caps: {model:n} }
  let lastModel = null;
  let badgeEl = null;
  let popoverEl = null;
  let saveTimer = null;
  let started = false;

  function ptDayString(ts) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: PT_TZ, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date(ts));
  }

  function msUntilPTMidnight(ts) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: PT_TZ, hourCycle: 'h23',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(new Date(ts));
    const get = type => parseInt(parts.find(p => p.type === type)?.value || '0', 10);
    const intoDay = ((get('hour') * 60 + get('minute')) * 60 + get('second')) * 1000 + (ts % 1000);
    return 86400000 - intoDay;
  }

  function formatCountdown(ms) {
    const totalMinutes = Math.max(0, Math.round(ms / 60000));
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
  }

  function defaultCap(model) {
    for (const [pattern, cap] of FAMILY_CAPS) if (pattern.test(model)) return cap;
    return FALLBACK_CAP;
  }

  function capFor(model) {
    const custom = data && data.caps ? data.caps[model] : null;
    return Number.isFinite(custom) && custom > 0 ? custom : defaultCap(model);
  }

  function shortName(model) {
    if (!model) return '—';
    return String(model).replace(/^models\//, '');
  }

  function emptyData() {
    return { day: ptDayString(Date.now()), counts: {}, exhausted: {}, caps: {} };
  }

  function rolloverIfNeeded() {
    const today = ptDayString(Date.now());
    if (data && data.day !== today) {
      const caps = data.caps || {};
      data = emptyData();
      data.caps = caps;
      scheduleSave();
      return true;
    }
    return false;
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      if (data) store.set({ [STORE_KEY]: data }).catch(() => {});
    }, 250);
  }

  async function loadData() {
    try {
      const stored = await store.get([STORE_KEY]);
      const value = stored && stored[STORE_KEY];
      if (value && typeof value === 'object' && value.counts) {
        data = {
          day: typeof value.day === 'string' ? value.day : ptDayString(Date.now()),
          counts: value.counts || {},
          exhausted: value.exhausted || {},
          caps: value.caps || {}
        };
      } else {
        data = emptyData();
      }
    } catch (_) {
      data = emptyData();
    }
    rolloverIfNeeded();
  }

  function onGenerateRequest(event) {
    if (!enabled || !data) return;
    const model = shortName(event.detail && event.detail.model) || 'unknown';
    rolloverIfNeeded();
    data.counts[model] = (data.counts[model] || 0) + 1;
    lastModel = model;
    scheduleSave();
    renderBadge();
  }

  function onQuotaExceeded(event) {
    if (!enabled || !data) return;
    const detail = event.detail || {};
    const model = shortName(detail.model) || lastModel || 'unknown';
    rolloverIfNeeded();
    data.exhausted[model] = {
      ts: Date.now(),
      quotaId: typeof detail.quotaId === 'string' ? detail.quotaId : null,
      limit: Number.isFinite(detail.limit) ? detail.limit : null
    };
    if (Number.isFinite(detail.limit) && detail.limit > 0) data.caps[model] = detail.limit;
    lastModel = model;
    scheduleSave();
    renderBadge();
  }

  function currentModel() {
    if (lastModel && data && data.counts[lastModel] != null) return lastModel;
    const models = data ? Object.keys(data.counts) : [];
    return models.length ? models[models.length - 1] : null;
  }

  function badgeState(model) {
    if (!model) return { text: 'No requests yet today', tone: 'idle' };
    const used = data.counts[model] || 0;
    const cap = capFor(model);
    const reset = formatCountdown(msUntilPTMidnight(Date.now()));
    if (data.exhausted[model]) return { text: `${model}: quota reached · resets in ${reset}`, tone: 'exhausted' };
    const ratio = cap > 0 ? used / cap : 0;
    return {
      text: `${model}: ${used}/${cap} · resets in ${reset}`,
      tone: ratio >= 1 ? 'exhausted' : ratio >= 0.8 ? 'warn' : 'ok'
    };
  }

  function renderBadge() {
    if (!enabled || !data) return;
    if (!badgeEl) {
      badgeEl = el('<button type="button" class="sl-limit-badge" aria-haspopup="true"></button>');
      badgeEl.addEventListener('click', togglePopover);
    }
    // Angular bootstrap can wipe stray body children added too early;
    // re-attach whenever the badge got detached.
    if (!badgeEl.isConnected) document.body.appendChild(badgeEl);
    const state = badgeState(currentModel());
    badgeEl.textContent = state.text;
    badgeEl.dataset.tone = state.tone;
    if (popoverEl) renderPopover();
  }

  function renderPopover() {
    if (!popoverEl || !data) return;
    const models = Object.keys(data.counts);
    const reset = formatCountdown(msUntilPTMidnight(Date.now()));
    const rows = models.length ? models.map(model => {
      const used = data.counts[model] || 0;
      const cap = capFor(model);
      const hit = !!data.exhausted[model];
      return `<div class="sl-limit-row" data-model="${model}">
        <span class="sl-limit-model">${model}${hit ? ' <span class="sl-limit-hit">quota reached</span>' : ''}</span>
        <span class="sl-limit-usage">${used} / <input class="sl-limit-cap" type="number" min="1" step="1" value="${cap}" aria-label="Daily cap for ${model}"> per day</span>
      </div>`;
    }).join('') : '<p class="sl-limit-empty">No requests counted yet today.</p>';
    popoverEl.innerHTML = `
      <div class="sl-limit-head"><span>Today (Pacific)</span><span>resets in ${reset}</span></div>
      ${rows}
      <p class="sl-limit-note">Counts are local estimates from this browser. Google does not publish exact daily caps — edit them to match your AI Studio project. A model is marked only when Google actually returns a 429 quota error.</p>
    `;
    popoverEl.querySelectorAll('.sl-limit-cap').forEach(input => {
      input.addEventListener('change', () => {
        const model = input.closest('.sl-limit-row')?.dataset.model;
        const value = parseInt(input.value, 10);
        if (model && Number.isFinite(value) && value > 0) {
          data.caps[model] = value;
          scheduleSave();
          renderBadge();
        }
      });
    });
  }

  function togglePopover() {
    if (popoverEl) {
      popoverEl.remove();
      popoverEl = null;
      return;
    }
    popoverEl = el('<div class="sl-limit-popover" role="dialog" aria-label="Daily request usage"></div>');
    document.body.appendChild(popoverEl);
    renderPopover();
  }

  function closePopover() {
    if (popoverEl) {
      popoverEl.remove();
      popoverEl = null;
    }
  }

  function tick() {
    if (!enabled || !data) return;
    if (rolloverIfNeeded()) lastModel = null;
    renderBadge();
  }

  function start() {
    if (started) return;
    started = true;
    io = scope();
    io.on(window, '__sl_generateContentRequest', onGenerateRequest);
    io.on(window, '__sl_quotaExceeded', onQuotaExceeded);
    io.every(30000, tick);
    loadData().then(async () => {
      if (!enabled) return;
      // Wait for the app shell: earlier renders can be wiped by Angular bootstrap.
      await waitFor(() => $('ms-prompt-box'), { timeout: 15000, interval: 250 });
      if (enabled) renderBadge();
    });
  }

  function stop() {
    started = false;
    if (io) {
      io.dispose();
      io = null;
    }
    clearTimeout(saveTimer);
    saveTimer = null;
    if (badgeEl) {
      badgeEl.remove();
      badgeEl = null;
    }
    closePopover();
  }

  window.StudioLab.registerModule({
    id: 'limit-tracker',
    group: 'modules',
    order: 35,
    title: 'Daily Limit Tracker',
    subtitle: 'per-model-daily-usage',
    icon: 'speed',
    stateKey: 'limitTrackerEnabled',
    defaults: {
      limitTrackerEnabled: true
    },
    details: [
      { icon: 'speed', text: 'Counts requests per model for the current Pacific day and shows how much of the estimated daily quota is left.' }
    ],
    init(ctx) {
      ctxRef = ctx;
      enabled = !!(ctxRef && ctxRef.state.limitTrackerEnabled);
      if (enabled) start();
    },
    onStateChange() {
      const active = !!(ctxRef && ctxRef.state.limitTrackerEnabled);
      if (active === enabled) return;
      enabled = active;
      if (enabled) start();
      else stop();
    },
    onRouteChange() {
      if (enabled) renderBadge();
    },
    dispose() {
      enabled = false;
      stop();
    }
  });
})();
