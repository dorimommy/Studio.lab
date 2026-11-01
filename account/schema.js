(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StudioLabAccountSchema = api;
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';
  const DEFAULTS = Object.freeze({
    responseRecoveryEnabled: true, optimizerEnabled: false, optimizerMode: 'smart',
    keepLast: 15, autoKeep: true, scrollBottomEnabled: true, wordCounterEnabled: true,
    textFormatterEnabled: true, modernWebChatEnabled: false, cleanerEnabled: false,
    draftSaverEnabled: true, telemetryBlockerEnabled: true, cleanerTips: true,
    cleanerBanners: true, cleanerHallucinations: true, cleanerFeedback: true,
    cleanerSuggestions: true
  });
  const KEYS = Object.freeze(Object.keys(DEFAULTS));
  function plain(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value) &&
      Object.prototype.toString.call(value) === '[object Object]';
  }
  function sanitizeSettings(value, options = {}) {
    const strict = options.strict === true;
    if (!plain(value)) {
      if (strict) throw new Error('Settings must be an object.');
      value = {};
    }
    if (strict && (Object.keys(value).some(key => !KEYS.includes(key)) || JSON.stringify(value).length > 8192)) {
      throw new Error('Unsupported settings fields.');
    }
    const result = { ...DEFAULTS };
    for (const key of KEYS) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      const item = value[key];
      const valid = key === 'keepLast' ? Number.isInteger(item) && item >= 2 && item <= 500
        : key === 'optimizerMode' ? item === 'smart' || item === 'hard' : typeof item === 'boolean';
      if (!valid) {
        if (strict) throw new Error('Invalid setting: ' + key);
        if (key === 'keepLast' && Number.isFinite(item)) result[key] = Math.max(2, Math.min(500, Math.round(item)));
        continue;
      }
      result[key] = item;
    }
    return result;
  }
  function validateConfig(value) {
    if (!plain(value) || typeof value.url !== 'string' || typeof value.publishableKey !== 'string') {
      throw new Error('Enter a Supabase project URL and publishable key.');
    }
    let url;
    try { url = new URL(value.url.trim()); } catch (_) { throw new Error('Invalid Supabase project URL.'); }
    if (url.protocol !== 'https:' || !/^[a-z0-9]+(?:-[a-z0-9]+)*\.supabase\.co$/.test(url.hostname) ||
        url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('Use an HTTPS project URL such as https://your-project.supabase.co.');
    }
    const publishableKey = value.publishableKey.trim();
    if (!/^sb_publishable_[A-Za-z0-9_-]{10,200}$/.test(publishableKey)) {
      throw new Error('Use a publishable key beginning with sb_publishable_. Never enter a secret or service_role key.');
    }
    return { url: url.origin, publishableKey };
  }
  function equalSettings(a, b) {
    if (!a || !b) return a === b;
    return KEYS.every(key => a[key] === b[key]);
  }
  function mergeSettings(base, local, remote) {
    const settings = {}, conflicts = [];
    for (const key of KEYS) {
      const left = local[key], right = remote[key], before = base[key];
      if (left === right || right === before) settings[key] = left;
      else if (left === before) settings[key] = right;
      else { settings[key] = left; conflicts.push(key); }
    }
    return { settings, conflicts };
  }
  return Object.freeze({ DEFAULTS, KEYS, sanitizeSettings, validateConfig, equalSettings, mergeSettings });
});
