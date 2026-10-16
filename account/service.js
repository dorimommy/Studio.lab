(function (root, factory) {
  'use strict';
  const schema = typeof module === 'object' && module.exports ? require('./schema.js') : root.StudioLabAccountSchema;
  const catalog = typeof module === 'object' && module.exports ? require('./catalog-schema.js') : root.StudioLabCatalogSchema;
  const social = typeof module === 'object' && module.exports ? require('./social-schema.js') : root.StudioLabSocialSchema;
  const api = factory(schema, catalog, social);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StudioLabAccount = api;
})(typeof globalThis !== 'undefined' ? globalThis : self, function (schema, catalog, social) {
  'use strict';
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ALARM = 'sl-account-sync';
  const COMMANDS = new Set(['status', 'login', 'logout', 'logoutAll', 'sync',
    'resolve', 'pause', 'resume', 'deleteCloud', 'deleteAccount', 'export']);
  const CATALOG_COMMANDS = new Set(['catalogList', 'catalogSearch', 'catalogGet', 'catalogSave', 'catalogDelete',
    'catalogInstall', 'catalogUse', 'catalogLocal', 'catalogRemove', 'catalogResetTheme']);
  const SOCIAL_COMMANDS = new Set(['profileGet', 'profileUpdate', 'profileFollow', 'catalogSocialGet',
    'catalogLike', 'catalogBookmark', 'catalogSavedList', 'profileAssets']);
  const MEMBERSHIP_COMMANDS = new Set(['membershipGet', 'profileLookup', 'moderatorApply',
    'moderatorApplications', 'moderatorReview', 'roleSet', 'catalogModerate', 'catalogModeration', 'removedCatalog']);
  class AccountError extends Error {
    constructor(code, message) { super(message); this.code = code; }
  }
  function failure(code, message) { return new AccountError(code, message); }
  function parseCallback(raw, expected, state) {
    let url;
    try { url = new URL(raw); } catch (_) { throw failure('invalid_callback', 'The sign-in response was invalid. Please retry.'); }
    const target = new URL(expected);
    if (url.origin !== target.origin || url.pathname !== target.pathname || url.hash ||
        url.searchParams.getAll('sl_state').length !== 1 || url.searchParams.get('sl_state') !== state) {
      throw failure('invalid_callback', 'The sign-in response did not match this request. Please retry.');
    }
    if (url.searchParams.has('error')) throw failure('login_cancelled', 'Sign-in was cancelled or denied.');
    const codes = url.searchParams.getAll('code');
    if (codes.length !== 1 || !/^[A-Za-z0-9._~-]{8,2048}$/.test(codes[0])) {
      throw failure('invalid_callback', 'No valid sign-in code was returned. Please retry.');
    }
    return codes[0];
  }
  function createService(options) {
    const chrome = options.chrome, fetch = options.fetch, crypto = options.crypto, vault = options.vault;
    const fixedConfig = options.config ? schema.validateConfig(options.config) : null;
    const now = options.now || Date.now;
    const schedule = options.setTimeout || setTimeout, cancel = options.clearTimeout || clearTimeout;
    let data, loading, chain = Promise.resolve(), debounce, transientError = null, stateOverride = null;
    function serialize(work) {
      const result = chain.then(work);
      chain = result.catch(() => {});
      return result;
    }
    async function load() {
      if (!loading) loading = (async () => {
        const stored = await vault.get();
        data = stored?.version === 1 ? stored : {
          version: 1, config: fixedConfig ? { ...fixedConfig } : null,
          session: null, binding: null, profiles: {}, localOwner: null
        };
        data.profiles ||= {};
        let changed = false;
        // Never reuse another project's tokens; the bundled project is authoritative.
        // Local slState is independent of these private account records.
        if ((data.config?.url || null) !== (fixedConfig?.url || null)) {
          data.session = null;
          data.binding = null;
          data.profiles = {};
          data.localOwner = null;
          changed = true;
        }
        if (data.config?.url !== fixedConfig?.url ||
            data.config?.publishableKey !== fixedConfig?.publishableKey) changed = true;
        data.config = fixedConfig ? { ...fixedConfig } : null;
        if (data.session && (!UUID.test(data.session.user?.id || '') ||
            typeof data.session.access_token !== 'string' || typeof data.session.refresh_token !== 'string' ||
            !Number.isFinite(data.session.expires_at))) {
          data.session = null;
          data.binding = null;
          changed = true;
        }
        if (changed) await persist();
      })().catch(error => { loading = null; throw error; });
      await loading;
    }
    async function persist() { await vault.set(data); }
    async function readLocal() {
      const stored = await chrome.storage.local.get(['slState']);
      return schema.sanitizeSettings(stored.slState);
    }
    async function applyLocal(settings) {
      // Preference sync changes only this allowlist. Catalog documents have a
      // separate, explicit API and are never implicitly included in a backup.
      await chrome.storage.local.set({ slState: schema.sanitizeSettings(settings, { strict: true }) });
    }
    function userView(user) {
      if (!user || !UUID.test(user.id || '')) throw failure('invalid_session', 'The account session was invalid. Sign in again.');
      return {
        id: user.id,
        email: typeof user.email === 'string' ? user.email.slice(0, 254) : '',
        name: typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name.slice(0, 120)
          : typeof user.user_metadata?.name === 'string' ? user.user_metadata.name.slice(0, 120) : ''
      };
    }
    function sessionView(result, user) {
      if (typeof result?.access_token !== 'string' || !result.access_token || result.access_token.length > 16384 ||
          typeof result.refresh_token !== 'string' || !result.refresh_token || result.refresh_token.length > 4096 ||
          !Number.isFinite(result.expires_in) || result.expires_in < 1 || result.expires_in > 86400) {
        throw failure('invalid_session', 'The account session was invalid. Sign in again.');
      }
      // Provider (Google) tokens and raw identity metadata are deliberately discarded.
      return {
        access_token: result.access_token, refresh_token: result.refresh_token,
        expires_at: Math.floor(now() / 1000) + result.expires_in, user: userView(user)
      };
    }
    async function permissionGranted() {
      return !!(data.config && await chrome.permissions.contains({ origins: [data.config.url + '/*'] }));
    }
    async function request(path, settings = {}) {
      if (!data.config) throw failure('not_configured', 'Connect a Supabase project first.');
      if (!await permissionGranted()) throw failure('permission_required', 'Allow access to the connected Supabase project and retry.');
      const controller = new AbortController();
      const timeout = schedule(() => controller.abort(), 12000);
      let response;
      try {
      try {
        response = await fetch(data.config.url + path, {
          method: settings.method || 'GET',
          headers: { apikey: data.config.publishableKey, ...(settings.token ? { Authorization: 'Bearer ' + settings.token } : {}),
            ...(settings.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
          ...(settings.body !== undefined ? { body: JSON.stringify(settings.body) } : {}),
          credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', redirect: 'error', signal: controller.signal
        });
      } catch (_) { throw failure('offline', 'Could not reach the account service. Local settings are saved; retry when connected.'); }
      let payload = null;
      try {
        if (response.status !== 204) {
          if (Number(response.headers?.get('content-length')) > 131072) throw new Error('large');
          if (response.body?.getReader) {
            const reader = response.body.getReader();
            const chunks = [];
            let bytes = 0;
            try {
              while (true) {
                const part = await reader.read();
                if (part.done) break;
                bytes += part.value.byteLength;
                if (bytes > 131072) { controller.abort(); throw new Error('large'); }
                chunks.push(part.value);
              }
              const joined = new Uint8Array(bytes);
              let offset = 0;
              for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
              payload = JSON.parse(new TextDecoder().decode(joined));
            } finally { reader.releaseLock(); }
          } else payload = await response.json();
          if (JSON.stringify(payload).length > 131072) throw new Error('large');
        }
      } catch (_) {
        if (response.ok) throw failure('invalid_response', 'The account service returned an invalid response.');
      }
      if (!response.ok) {
        if (payload?.code === 'reauth_required') throw failure('reauth_required', 'Sign in with Google again before deleting your account.');
        if (payload?.code === 'mfa_required') throw failure('mfa_required', 'This account has Supabase two-factor authentication enabled. Complete that verification before deleting the account.');
        if (response.status === 429) throw failure('rate_limited', 'Too many requests. Wait a minute and retry.');
        if (response.status === 401 || response.status === 403) throw failure('unauthorized', 'The account session was rejected. Sign in again.');
        if (response.status === 404 && path.startsWith('/rest/v1/rpc/')) throw failure('backend_missing', 'Apply the Studio.lab Supabase migration before enabling sync.');
        if (response.status >= 500) throw failure('offline', 'The account service is unavailable. Local settings are saved.');
        throw failure('request_failed', 'The account service rejected this request. Check the project setup and retry.');
      }
      if (payload?.rate_limited === true) throw failure('rate_limited', 'Too many sync requests. Wait a minute and retry.');
      return payload;
      } finally { cancel(timeout); }
    }
    async function refreshSession() {
      if (!data.session) throw failure('sign_in_required', 'Sign in to synchronize settings.');
      let result;
      try {
        result = await request('/auth/v1/token?grant_type=refresh_token', {
          method: 'POST', body: { refresh_token: data.session.refresh_token }
        });
      } catch (error) {
        if (['unauthorized', 'request_failed'].includes(error.code)) {
          data.session = null;
          stateOverride = 'signed_out';
          await persist();
          throw failure('sign_in_required', 'Your session has expired or was revoked. Sign in again.');
        }
        throw error;
      }
      const previousUser = data.session.user;
      const previousId = previousUser.id;
      // Persist rotation before another network operation. An outage while
      // verifying /user must not strand the user with a consumed refresh token.
      data.session = sessionView(result, { id: previousId, email: previousUser.email,
        user_metadata: { full_name: previousUser.name } });
      data.session.needsVerification = true;
      await persist();
      const verified = await request('/auth/v1/user', { token: result.access_token });
      const next = sessionView(result, verified);
      if (next.user.id !== previousId) {
        data.session = null;
        data.binding = null;
        await persist();
        throw failure('invalid_session', 'The account changed unexpectedly. Sign in again.');
      }
      data.session = next;
      await persist();
      return next.access_token;
    }
    async function accessToken() {
      if (!data.session) throw failure('sign_in_required', 'Sign in to synchronize settings.');
      if (data.session.expires_at * 1000 <= now() + 60000) return refreshSession();
      if (data.session.needsVerification) {
        const verified = userView(await request('/auth/v1/user', { token: data.session.access_token }));
        if (verified.id !== data.session.user.id) {
          data.session = null;
          data.binding = null;
          await persist();
          throw failure('invalid_session', 'The account changed unexpectedly. Sign in again.');
        }
        data.session.user = verified;
        data.session.needsVerification = false;
        await persist();
      }
      return data.session.access_token;
    }
    async function authenticated(path, settings = {}) {
      let token = await accessToken();
      try { return await request(path, { ...settings, token }); }
      catch (error) {
        if (error.code !== 'unauthorized') throw error;
        token = await refreshSession();
        return request(path, { ...settings, token });
      }
    }
    function recordView(value) {
      if (value === null) return null;
      if (!value || value.schema_version !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 1 ||
          typeof value.deleted !== 'boolean' || value.deleted && value.settings !== null ||
          typeof value.updated_at !== 'string' || !Number.isFinite(Date.parse(value.updated_at))) {
        throw failure('incompatible_settings', 'Cloud settings use an unsupported format. Update the extension or check the backend migration.');
      }
      return { revision: value.revision, schema_version: 1, updated_at: value.updated_at, deleted: value.deleted,
        settings: value.deleted ? null : schema.sanitizeSettings(value.settings, { strict: true }) };
    }
    async function cloudRecord() {
      return recordView(await authenticated('/rest/v1/rpc/studio_lab_get_settings', { method: 'POST', body: {} }));
    }
    function bindingFor(id) {
      return data.binding?.userId === id ? data.binding : null;
    }
    function remember(settings) {
      const id = data.session?.user.id;
      if (!id) return;
      data.profiles[id] = { local: settings, savedAt: now() };
      const keys = Object.keys(data.profiles).sort((a, b) => data.profiles[b].savedAt - data.profiles[a].savedAt);
      for (const key of keys.slice(10)) delete data.profiles[key];
    }
    async function localCandidate() {
      if (data.binding?.pendingChoice && data.localOwner && data.localOwner !== data.session?.user.id) {
        return schema.sanitizeSettings(data.profiles[data.session.user.id]?.local);
      }
      return readLocal();
    }
    async function publicStatus() {
      await load();
      const binding = data.session ? bindingFor(data.session.user.id) : null;
      return {
        configured: !!data.config,
        config: data.config ? { ...data.config } : null,
        redirectUrl: chrome.identity?.getRedirectURL ? chrome.identity.getRedirectURL('studio-lab') : '',
        redirectAllowlist: chrome.identity?.getRedirectURL ? chrome.identity.getRedirectURL('studio-lab') + '?sl_state=*' : '',
        signedIn: !!data.session,
        user: data.session ? { ...data.session.user } : null,
        sync: {
          enabled: !!binding?.enabled,
          state: stateOverride || (!data.config ? 'unconfigured' : !data.session ? 'signed_out'
            : binding?.pendingChoice ? 'choosing' : binding?.conflicts?.length ? binding.remote?.deleted ? 'cloud_deleted' : 'conflict'
              : !binding?.enabled ? 'paused' : binding?.lastSyncedAt ? 'synced' : 'idle'),
          lastSyncedAt: binding?.lastSyncedAt || null, revision: binding?.baseRevision || 0,
          pendingChoice: !!binding?.pendingChoice, conflict: binding?.conflicts || [], error: transientError
        },
        localSettings: await localCandidate(),
        cloudSettings: binding?.remote?.settings ? { ...binding.remote.settings } : null
      };
    }
    async function updateBase(record, settings, apply = false) {
      const binding = bindingFor(data.session.user.id);
      if (apply) await applyLocal(settings);
      binding.baseRevision = record?.revision || 0;
      binding.baseSettings = settings;
      binding.remote = record;
      binding.conflicts = [];
      binding.pendingChoice = false;
      binding.lastSyncedAt = new Date(now()).toISOString();
      data.localOwner = data.session.user.id;
      remember(settings);
      transientError = null;
      stateOverride = null;
      await persist();
    }
    async function saveCloud(settings, expectedRevision) {
      const validated = schema.sanitizeSettings(settings, { strict: true });
      const response = await authenticated('/rest/v1/rpc/studio_lab_save_settings', {
        method: 'POST', body: { p_settings: validated, p_expected_revision: expectedRevision }
      });
      if (response?.ok === true) {
        const record = recordView(response.record);
        if (!record || record.deleted || record.revision !== expectedRevision + 1 || !schema.equalSettings(record.settings, validated)) {
          throw failure('invalid_response', 'The settings update could not be confirmed. Retry sync.');
        }
        return { ok: true, record };
      }
      if (response?.conflict === true) return { ok: false, record: recordView(response.record) };
      throw failure('invalid_response', 'The settings update could not be confirmed. Retry sync.');
    }
    async function reconcileLocal(record, target, snapshot) {
      const latest = await readLocal();
      const rebased = schema.mergeSettings(snapshot, latest, target);
      if (rebased.conflicts.length) {
        await updateBase(record, target);
        markConflict(record, rebased.conflicts);
        remember(latest);
        await persist();
        return;
      }
      if (!schema.equalSettings(latest, rebased.settings)) await applyLocal(rebased.settings);
      await updateBase(record, target);
      remember(await readLocal());
      await persist();
    }
    function markConflict(record, fields) {
      data.binding.remote = record;
      data.binding.conflicts = fields.length ? fields : ['cloudVersion'];
      stateOverride = record?.deleted ? 'cloud_deleted' : 'conflict';
    }
    async function synchronize() {
      if (!data.session) return;
      const binding = bindingFor(data.session.user.id);
      if (!binding || !binding.enabled || binding.pendingChoice || binding.conflicts?.length) return;
      stateOverride = 'syncing';
      const local = await readLocal();
      const remote = await cloudRecord();
      if (remote?.deleted) {
        markConflict(remote, ['cloudDeleted']);
        await persist();
        return;
      }
      if (!remote && binding.baseRevision > 0) {
        throw failure('incompatible_settings', 'Cloud history disappeared. Check the backend before uploading settings.');
      }
      const base = binding.baseSettings || schema.sanitizeSettings({});
      let target = local;
      if (remote && remote.revision !== binding.baseRevision) {
        const merged = schema.mergeSettings(base, local, remote.settings);
        if (merged.conflicts.length) {
          markConflict(remote, merged.conflicts);
          await persist();
          return;
        }
        target = merged.settings;
      }
      if (remote && schema.equalSettings(target, remote.settings)) {
        await reconcileLocal(remote, target, local);
        return;
      }
      const saved = await saveCloud(target, remote?.revision || 0);
      if (!saved.ok) {
        markConflict(saved.record, ['cloudVersion']);
        await persist();
        return;
      }
      await reconcileLocal(saved.record, target, local);
    }
    async function resolve(choice) {
      if (!['local', 'cloud'].includes(choice)) throw failure('invalid_command', 'Choose local or cloud settings.');
      if (!data.session) throw failure('sign_in_required', 'Sign in to synchronize settings.');
      const binding = bindingFor(data.session.user.id);
      if (!binding) throw failure('invalid_session', 'Sign in again to initialize sync.');
      const remote = await cloudRecord();
      if ((remote?.revision || 0) !== (binding.remote?.revision || 0)) {
        markConflict(remote, ['cloudVersion']);
        await persist();
        return;
      }
      if (choice === 'cloud') {
        if (!remote || remote.deleted) throw failure('no_cloud_settings', 'There are no saved cloud settings. Choose local settings to create a cloud copy.');
        binding.enabled = true;
        await updateBase(remote, remote.settings, true);
      } else {
        const local = await localCandidate();
        const saved = await saveCloud(local, remote?.revision || 0);
        if (!saved.ok) { markConflict(saved.record, ['cloudVersion']); await persist(); return; }
        binding.enabled = true;
        await updateBase(saved.record, local, data.localOwner !== data.session.user.id);
      }
    }
    function randomString(length = 32) {
      const bytes = new Uint8Array(length);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    }
    async function challenge(verifier) {
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
      let raw = '';
      for (const byte of digest) raw += String.fromCharCode(byte);
      return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    async function login() {
      if (!data.config) throw failure('not_configured', 'Connect a Supabase project first.');
      if (!await permissionGranted()) throw failure('permission_required', 'Allow access to the connected project before signing in.');
      const verifier = randomString(), state = randomString();
      const callback = chrome.identity.getRedirectURL('studio-lab');
      const redirect = new URL(callback);
      redirect.searchParams.set('sl_state', state);
      const authorize = new URL(data.config.url + '/auth/v1/authorize');
      authorize.searchParams.set('provider', 'google');
      authorize.searchParams.set('redirect_to', redirect.href);
      authorize.searchParams.set('code_challenge', await challenge(verifier));
      authorize.searchParams.set('code_challenge_method', 's256');
      authorize.searchParams.set('scopes', 'openid email profile');
      authorize.searchParams.set('prompt', 'select_account');
      let callbackUrl;
      try { callbackUrl = await chrome.identity.launchWebAuthFlow({ url: authorize.href, interactive: true }); }
      catch (_) { throw failure('login_cancelled', 'Sign-in was cancelled or could not finish. Try again.'); }
      const code = parseCallback(callbackUrl, callback, state);
      const result = await request('/auth/v1/token?grant_type=pkce', {
        method: 'POST', body: { auth_code: code, code_verifier: verifier }
      });
      const verified = await request('/auth/v1/user', { token: result?.access_token });
      const session = sessionView(result, verified);
      if (data.session && data.localOwner === data.session.user.id) remember(await readLocal());
      data.session = session;
      data.binding = { userId: session.user.id, enabled: false, pendingChoice: true, baseRevision: 0,
        baseSettings: null, remote: null, conflicts: [], lastSyncedAt: null };
      transientError = null;
      stateOverride = null;
      await persist();
      // Save the new session before reading settings so a transient sync failure
      // does not throw away an otherwise successful login.
      try { await ensurePublicProfile(); }
      catch (error) { transientError = safeError(error).error; }
      try { data.binding.remote = await cloudRecord(); await persist(); }
      catch (error) { transientError = safeError(error).error; }
    }
    async function logout(scope) {
      if (data.session && data.localOwner === data.session.user.id) remember(await readLocal());
      let revokeError = null;
      if (data.session) {
        try { await authenticated('/auth/v1/logout?scope=' + scope, { method: 'POST' }); }
        catch (error) { revokeError = error; }
      }
      data.session = null;
      data.binding = null;
      await persist();
      stateOverride = revokeError ? 'signed_out_pending_revocation' : null;
      transientError = revokeError ? 'Signed out on this device. Server revocation could not be confirmed; use another signed-in device to revoke all sessions.' : null;
    }
    async function deleteCloud() {
      if (!data.session) throw failure('sign_in_required', 'Sign in before deleting cloud settings.');
      const remote = await cloudRecord();
      const response = await authenticated('/rest/v1/rpc/studio_lab_delete_settings', {
        method: 'POST', body: { p_expected_revision: remote?.revision || 0 }
      });
      if (response?.conflict) { markConflict(recordView(response.record), ['cloudVersion']); await persist(); return; }
      if (response?.ok !== true) throw failure('invalid_response', 'Cloud deletion could not be confirmed. Retry.');
      const record = recordView(response.record);
      const expected = remote?.deleted ? remote.revision : (remote?.revision || 0) + 1;
      if (!record?.deleted || record.revision !== expected) {
        throw failure('invalid_response', 'Cloud deletion could not be confirmed. Retry.');
      }
      data.binding.enabled = false;
      data.binding.pendingChoice = false;
      data.binding.conflicts = [];
      data.binding.baseRevision = record.revision;
      data.binding.remote = record;
      data.binding.baseSettings = await readLocal();
      data.binding.lastSyncedAt = new Date(now()).toISOString();
      stateOverride = 'cloud_deleted';
      transientError = null;
      await persist();
    }
    async function deleteAccount() {
      const id = data.session?.user.id;
      if (!id) throw failure('sign_in_required', 'Sign in before deleting your account.');
      const result = await authenticated('/functions/v1/delete-account', { method: 'POST', body: { confirmation: 'DELETE' } });
      if (result?.ok !== true) throw failure('invalid_response', 'Account deletion could not be confirmed. Your local session is retained.');
      delete data.profiles[id];
      data.session = null;
      data.binding = null;
      if (data.localOwner === id) data.localOwner = null;
      transientError = null;
      stateOverride = null;
      await persist();
    }
    function safeError(error) {
      return error instanceof AccountError ? { ok: false, code: error.code, error: error.message }
        : { ok: false, code: 'storage_error', error: 'The account operation could not finish. Reload the account page and retry.' };
    }
    function catalogError(error) {
      if (error instanceof AccountError) return safeError(error);
      return { ok: false, code: 'invalid_catalog', error: 'The document is invalid or storage is unavailable. Check its fields and retry.' };
    }
    function catalogDraft(value) {
      try { return catalog.validateDraft(value); }
      catch (error) { throw failure('invalid_catalog', error.message); }
    }
    function catalogAsset(value, metadata = false) {
      try { return catalog.sanitizeAsset(value, { metadata }); }
      catch (_) { throw failure('invalid_response', 'The library returned an invalid document.'); }
    }
    function catalogId(value) {
      if (typeof value !== 'string' || !UUID.test(value)) throw failure('invalid_catalog', 'Choose a valid document.');
      return value.toLowerCase();
    }
    function catalogRevision(value) {
      if (!Number.isSafeInteger(value) || value < 0) throw failure('invalid_catalog', 'Invalid document revision.');
      return value;
    }
    async function catalogRpc(name, body, requireAuth = false) {
      const path = '/rest/v1/rpc/studio_lab_catalog_' + name;
      const result = requireAuth ? await authenticated(path, { method: 'POST', body })
        : await request(path, { method: 'POST', body });
      if (result?.validation_error) throw failure('invalid_catalog', 'The library rejected this document. Check its fields and contrast.');
      if (result?.google_required) throw failure('google_sign_in_required', 'Sign in with Google to create or edit library documents.');
      if (result?.quota_exceeded) throw failure('catalog_full', 'Your cloud library can contain up to 100 documents. Delete one before adding another.');
      return result;
    }
    function catalogPage(result, options, publicOnly = false) {
      if (!result || !Array.isArray(result.items) || result.items.length > options.limit ||
          result.next_offset !== null && result.next_offset !== options.offset + options.limit) {
        throw failure('invalid_response', 'The library returned an invalid result page.');
      }
      const items = result.items.map(item => catalogAsset(item, true));
      if (publicOnly && items.some(item => item.visibility !== 'public')) throw failure('invalid_response', 'The market returned a private document.');
      return { ok: true, items, nextOffset: result.next_offset };
    }
    async function catalogGet(id) {
      const result = await catalogRpc('get', { p_id: catalogId(id) }, !!data.session);
      if (result === null) throw failure('not_found', 'This document is private or has been removed.');
      const asset = catalogAsset(result);
      if (!data.session && asset.visibility !== 'public') throw failure('invalid_response', 'The market returned a private document.');
      return asset;
    }
    async function localCatalog() {
      const stored = await chrome.storage.local.get(['slInstalledAssets', 'slActiveTheme', 'slState']);
      const items = [];
      if (Array.isArray(stored.slInstalledAssets)) {
        for (const item of stored.slInstalledAssets.slice(0, catalog.LIMITS.installed)) {
          try {
            const asset = catalog.sanitizeAsset(item);
            if (!items.some(existing => existing.id === asset.id)) items.push(asset);
          } catch (_) { /* Never return or execute an invalid stored document. */ }
        }
      }
      let activeTheme = null;
      try {
        if (stored.slActiveTheme) {
          const candidate = catalog.sanitizeAsset(stored.slActiveTheme);
          if (candidate.kind === 'theme') activeTheme = candidate;
        }
      } catch (_) { /* Invalid palettes fall back to native colors. */ }
      return { ok: true, items, activeTheme, modernEnabled: stored.slState?.modernWebChatEnabled === true };
    }
    function installable(value) {
      if (value && Object.prototype.hasOwnProperty.call(value, 'revision')) return catalogAsset(value);
      const draft = catalogDraft(value);
      const date = new Date(now()).toISOString();
      return { ...draft, id: draft.id || crypto.randomUUID(), revision: 1, created_at: date, updated_at: date };
    }
    async function installAsset(asset) {
      const current = await localCatalog();
      const existing = current.items.findIndex(item => item.id === asset.id);
      if (existing < 0 && current.items.length >= catalog.LIMITS.installed) throw failure('catalog_full', 'Your installed library is full. Remove a document before adding another.');
      if (existing >= 0) current.items[existing] = asset;
      else current.items.unshift(asset);
      await chrome.storage.local.set({ slInstalledAssets: current.items });
      return asset;
    }
    function socialValue(validate, value) {
      try { return validate(value); }
      catch (error) { throw failure('invalid_catalog', error.message); }
    }
    function socialProfile(value) {
      try { return social.sanitizeProfile(value); }
      catch (_) { throw failure('invalid_response', 'The Market returned an invalid profile.'); }
    }
    function socialItem(value) {
      try { return social.sanitizeItem(value); }
      catch (_) { throw failure('invalid_response', 'The Market returned invalid item reactions.'); }
    }
    async function ensurePublicProfile() {
      const result = await socialRpc('profile_ensure', {}, true);
      if (result?.ok !== true) throw failure('invalid_response', 'Your public profile could not be initialized. Retry from Account.');
      const profile = socialProfile(result.profile);
      if (!profile.self) throw failure('invalid_response', 'The profile service returned another account.');
      return profile;
    }
    function socialOwner(message, required = false) {
      if (required && !data.session) throw failure('sign_in_required', 'Sign in with Google to use your Market account.');
      if (required && message.expectedUserId === undefined) throw failure('account_changed', 'Reopen Market before using this account.');
      if (message.expectedUserId !== undefined) {
        const owner = socialValue(social.id, message.expectedUserId);
        if (owner !== data.session?.user.id) throw failure('account_changed', 'The Studio.lab account changed. Reopen Market from the intended account.');
      }
    }
    async function socialRpc(name, body, auth = false, personalized = false) {
      const path = '/rest/v1/rpc/studio_lab_' + name;
      const result = auth || personalized && data.session ? await authenticated(path, { method: 'POST', body })
        : await request(path, { method: 'POST', body });
      if (result?.validation_error) throw failure('invalid_catalog', 'Check the profile tag or Market action and try again.');
      if (result?.handle_taken) throw failure('handle_taken', 'This tag is already taken. Choose another tag.');
      if (result?.not_found) throw failure('not_found', 'This profile or item is no longer public.');
      if (result?.quota_exceeded) throw failure('social_full', 'You can save or like up to 1,000 items and follow up to 1,000 profiles. Remove one before adding another.');
      const memberErrors = { forbidden: 'This account does not have permission for that action.',
        already_moderator: 'You already have moderation permission.', profile_required: 'Refresh your public profile before applying.',
        pending: 'Your moderator application is already awaiting review.', application_cooldown: 'Wait seven days before submitting another application.',
        application_conflict: 'This application has already been reviewed. Refresh the list.',
        application_required: 'Approve this member’s application before granting the moderator role.',
        moderation_blocked: 'This item was removed from Market. Only the owner can restore publication.' };
      for (const [code, error] of Object.entries(memberErrors)) if (result?.[code] === true) throw failure(code, error);
      return result;
    }
    function memberResult(validate, value) {
      try { return validate(value); }
      catch (_) { throw failure('invalid_response', 'The membership service returned an invalid response.'); }
    }
    async function handleMembership(message) {
      socialOwner(message, true);
      if (message.anonymous !== undefined) throw failure('invalid_catalog', 'Sign in with your current account for this action.');
      if (message.command === 'membershipGet' || message.command === 'profileLookup') {
        const membership = memberResult(social.sanitizeMembership, await socialRpc('membership_status', {}, true));
        if (message.command === 'membershipGet') {
          // Payments are deferred. No checkout call or client action can
          // enable a paid badge while the payment integration is absent.
          membership.verification.billing_ready = false;
          return { ok: true, ...membership };
        }
        if (!membership.capabilities.owner) throw failure('forbidden', 'Only the owner can look up members for role management.');
        const handle = socialValue(social.handle, message.handle);
        const result = await socialRpc('profile_get', { p_id: null, p_handle: handle, p_own: false }, true);
        const profile = result === null ? null : socialProfile(result);
        if (profile && profile.handle !== handle) throw failure('invalid_response', 'The lookup returned another profile.');
        return { ok: true, profile };
      }
      if (message.command === 'moderatorApply') {
        const text = socialValue(social.applicationMessage, message.message);
        const result = await socialRpc('moderator_apply', { p_message: text }, true);
        if (result?.ok !== true) throw failure('invalid_response', 'The application could not be confirmed.');
        const application = memberResult(social.sanitizeApplication, result.application);
        if (!application || application.status !== 'pending' || application.message !== text) throw failure('invalid_response', 'The application could not be confirmed.');
        return { ok: true, application };
      }
      if (message.command === 'moderatorApplications') {
        const status = message.status === undefined ? 'pending' : message.status;
        const offset = message.offset === undefined ? 0 : message.offset, limit = message.limit === undefined ? 20 : message.limit;
        if (!['pending', 'approved', 'rejected', 'all'].includes(status) || !Number.isInteger(offset) || offset < 0 || offset > 10000 ||
            !Number.isInteger(limit) || limit < 1 || limit > 20) throw failure('invalid_catalog', 'Choose a valid application page.');
        const result = await socialRpc('moderator_applications', { p_status: status, p_offset: offset, p_limit: limit }, true);
        if (!result || !Array.isArray(result.items) || result.items.length > limit ||
            result.next_offset !== null && result.next_offset !== offset + limit) throw failure('invalid_response', 'The application list is invalid.');
        const items = result.items.map(entry => ({ profile: socialProfile(entry?.profile),
          application: memberResult(social.sanitizeApplication, entry?.application) }));
        if (new Set(items.map(entry => entry.profile.id)).size !== items.length || items.some(entry => !entry.application || status !== 'all' && entry.application.status !== status)) {
          throw failure('invalid_response', 'The application list is invalid.');
        }
        return { ok: true, items, nextOffset: result.next_offset };
      }
      if (message.command === 'moderatorReview' || message.command === 'roleSet') {
        const profileId = socialValue(social.id, message.profileId);
        let result;
        if (message.command === 'moderatorReview') {
          if (typeof message.approved !== 'boolean') throw failure('invalid_catalog', 'Choose whether to approve this application.');
          const response = socialValue(social.reviewResponse, message.response === undefined ? '' : message.response);
          result = await socialRpc('moderator_review', { p_profile_id: profileId, p_approved: message.approved, p_response: response }, true);
        } else {
          if (!['staff', 'moderator'].includes(message.role) || typeof message.enabled !== 'boolean') throw failure('invalid_catalog', 'Choose a staff or moderator role.');
          result = await socialRpc('role_set', { p_profile_id: profileId, p_role: message.role, p_enabled: message.enabled,
            p_reason: socialValue(social.moderationReason, message.reason) }, true);
        }
        if (result?.ok !== true) throw failure('invalid_response', 'The role change could not be confirmed.');
        const profile = socialProfile(result.profile);
        if (profile.id !== profileId) throw failure('invalid_response', 'The role change returned another profile.');
        if (message.command === 'roleSet' && profile.badges[message.role === 'staff' ? 'staff' : 'moderator'] !== message.enabled) {
          throw failure('invalid_response', 'The role change could not be confirmed.');
        }
        if (message.command === 'moderatorReview') {
          const application = memberResult(social.sanitizeApplication, result.application);
          if (!application || application.status !== (message.approved ? 'approved' : 'rejected') || message.approved && !profile.badges.moderator) {
            throw failure('invalid_response', 'The application review could not be confirmed.');
          }
          return { ok: true, profile, application };
        }
        return { ok: true, profile };
      }
      if (message.command === 'catalogModerate') {
        const id = socialValue(social.id, message.id);
        if (typeof message.removed !== 'boolean') throw failure('invalid_catalog', 'Choose whether to remove this publication.');
        const reason = socialValue(social.moderationReason, message.reason);
        const result = await socialRpc('catalog_moderate', { p_id: id, p_removed: message.removed, p_reason: reason }, true);
        if (result?.ok !== true) throw failure('invalid_response', 'The moderation action could not be confirmed.');
        const moderation = memberResult(social.sanitizeModeration, result.moderation);
        // Concurrent/repeated removals preserve the first audited reason.
        // Treat that authoritative, already-matching state as success.
        if (moderation.id !== id || moderation.removed !== message.removed) {
          throw failure('invalid_response', 'The moderation action could not be confirmed.');
        }
        return { ok: true, moderation };
      }
      if (message.command === 'removedCatalog') {
        const offset = message.offset === undefined ? 0 : message.offset, limit = message.limit === undefined ? 20 : message.limit;
        if (!Number.isInteger(offset) || offset < 0 || offset > 10000 || !Number.isInteger(limit) || limit < 1 || limit > 20) {
          throw failure('invalid_catalog', 'Choose a valid moderation page.');
        }
        const result = await socialRpc('removed_catalog', { p_offset: offset, p_limit: limit }, true);
        if (!result || !Array.isArray(result.items) || result.items.length > limit ||
            result.next_offset !== null && result.next_offset !== offset + limit) throw failure('invalid_response', 'The moderation queue is invalid.');
        const items = result.items.map(entry => ({ asset: catalogAsset(entry?.asset, true),
          moderation: memberResult(social.sanitizeModeration, entry?.moderation), author: entry?.author === null ? null : socialProfile(entry?.author) }));
        if (new Set(items.map(entry => entry.asset.id)).size !== items.length ||
            items.some(entry => entry.asset.visibility !== 'public' || entry.asset.id !== entry.moderation.id || !entry.moderation.removed || !entry.moderation.can_restore)) {
          throw failure('invalid_response', 'The moderation queue is invalid.');
        }
        return { ok: true, items, nextOffset: result.next_offset };
      }
      if (message.command === 'catalogModeration') {
        const ids = socialValue(social.ids, message.ids);
        const result = await socialRpc('catalog_moderation', { p_ids: ids }, true);
        if (!result || !Array.isArray(result.items) || result.items.length > ids.length) throw failure('invalid_response', 'The moderation list is invalid.');
        const items = result.items.map(entry => memberResult(social.sanitizeModeration, entry));
        if (new Set(items.map(entry => entry.id)).size !== items.length || items.some(entry => !ids.includes(entry.id))) {
          throw failure('invalid_response', 'The moderation list is invalid.');
        }
        return { ok: true, items };
      }
      throw failure('invalid_command', 'Unknown membership command.');
    }
    async function handleSocial(message) {
      const mutation = ['profileUpdate', 'profileFollow', 'catalogLike', 'catalogBookmark'].includes(message.command);
      if (message.anonymous !== undefined && typeof message.anonymous !== 'boolean' ||
          message.anonymous === true && message.expectedUserId !== undefined) throw failure('invalid_catalog', 'Choose an anonymous view or your current account.');
      socialOwner(message, mutation);
      if (message.command === 'profileGet') {
        if (message.profileId !== undefined && message.handle !== undefined) throw failure('invalid_catalog', 'Choose one profile.');
        const own = message.profileId === undefined && message.handle === undefined;
        const anonymous = !own && (message.anonymous === true || message.expectedUserId === undefined);
        if (own) {
          if (message.anonymous === true) throw failure('sign_in_required', 'Sign in with Google to view your Market profile.');
          socialOwner(message, true);
        }
        const result = await socialRpc('profile_get', { p_id: message.profileId === undefined ? null : socialValue(social.id, message.profileId),
          p_handle: message.handle === undefined ? null : socialValue(social.handle, message.handle), p_own: own }, own, !own && !anonymous);
        const profile = result === null ? own ? await ensurePublicProfile() : null : socialProfile(result);
        if (profile && (own && !profile.self || message.profileId !== undefined && profile.id !== message.profileId.toLowerCase() ||
            message.handle !== undefined && profile.handle !== message.handle || anonymous && (profile.following || profile.self))) {
          throw failure('invalid_response', 'The Market returned the wrong profile.');
        }
        return { ok: true, profile };
      }
      if (message.command === 'profileUpdate') {
        const nickname = socialValue(social.nickname, message.nickname), handle = socialValue(social.handle, message.handle);
        const expected = socialValue(social.revision, message.expectedRevision);
        const result = await socialRpc('profile_save', { p_nickname: nickname, p_handle: handle, p_expected_revision: expected }, true);
        if (result?.conflict === true) return { ok: false, code: 'profile_conflict', error: 'Your profile changed on another device. Reload it before saving.',
          profile: result.profile === null ? null : socialProfile(result.profile) };
        if (result?.ok !== true) throw failure('invalid_response', 'The profile save could not be confirmed.');
        const profile = socialProfile(result.profile);
        if (!profile.self || profile.nickname !== nickname || profile.handle !== handle || profile.revision !== expected + 1) {
          throw failure('invalid_response', 'The profile save could not be confirmed.');
        }
        return { ok: true, profile };
      }
      if (message.command === 'profileFollow') {
        const id = socialValue(social.id, message.profileId);
        if (typeof message.following !== 'boolean') throw failure('invalid_catalog', 'Choose whether to follow this profile.');
        const result = await socialRpc('profile_follow', { p_id: id, p_following: message.following }, true);
        if (result?.ok !== true) throw failure('invalid_response', 'The follow action could not be confirmed.');
        const profile = socialProfile(result.profile);
        if (profile.id !== id || profile.self || profile.following !== message.following) throw failure('invalid_response', 'The follow action could not be confirmed.');
        return { ok: true, profile };
      }
      if (message.command === 'catalogSocialGet') {
        const ids = socialValue(social.ids, message.ids);
        const anonymous = message.anonymous === true || message.expectedUserId === undefined;
        const result = await socialRpc('catalog_social', { p_ids: ids }, false, !anonymous);
        if (!result || !Array.isArray(result.items) || result.items.length > ids.length) throw failure('invalid_response', 'The Market returned invalid item reactions.');
        const items = result.items.map(socialItem);
        if (new Set(items.map(item => item.id)).size !== items.length || items.some(item => !ids.includes(item.id)) ||
            anonymous && items.some(item => item.liked || item.saved || item.author?.following || item.author?.self)) {
          throw failure('invalid_response', 'The Market returned reactions for the wrong item.');
        }
        return { ok: true, items };
      }
      if (message.command === 'catalogLike' || message.command === 'catalogBookmark') {
        const id = socialValue(social.id, message.id), like = message.command === 'catalogLike', value = like ? message.liked : message.saved;
        if (typeof value !== 'boolean') throw failure('invalid_catalog', 'Choose whether to like or save this item.');
        const result = await socialRpc(like ? 'catalog_like' : 'catalog_bookmark', { p_id: id, p_value: value }, true);
        if (result?.ok !== true || result.item === null && value) throw failure('invalid_response', 'The Market action could not be confirmed.');
        const item = result.item === null ? null : socialItem(result.item);
        if (item && (item.id !== id || item[like ? 'liked' : 'saved'] !== value)) throw failure('invalid_response', 'The Market action could not be confirmed.');
        return { ok: true, item };
      }
      if (message.command === 'catalogSavedList' || message.command === 'profileAssets') {
        const options = socialValue(catalog.validateQuery, message), saved = message.command === 'catalogSavedList';
        const result = await socialRpc(saved ? 'catalog_saved' : 'profile_assets', { p_query: options.query, p_kind: options.kind,
          p_offset: options.offset, p_limit: options.limit, ...(!saved ? { p_id: socialValue(social.id, message.profileId) } : {}) }, saved);
        return catalogPage(result, options, true);
      }
      throw failure('invalid_command', 'Unknown Market profile command.');
    }
    async function handleCatalog(message, sender) {
      // Frames may remain mounted while Account in another tab changes the
      // session. A captured owner prevents a draft silently moving accounts.
      if (['catalogList', 'catalogSave', 'catalogDelete', 'catalogUse', 'catalogInstall'].includes(message.command) && message.expectedUserId !== undefined) {
        if (typeof message.expectedUserId !== 'string' || !UUID.test(message.expectedUserId)) {
          throw failure('invalid_catalog', 'Invalid library account. Reload the library and retry.');
        }
        if (message.expectedUserId !== data.session?.user.id) {
          throw failure('account_changed', 'The Studio.lab account changed. Reopen the library from the intended account before continuing.');
        }
      }
      if (message.command === 'catalogLocal') return localCatalog();
      if (message.command === 'catalogList' || message.command === 'catalogSearch') {
        let options;
        try { options = catalog.validateQuery(message); }
        catch (error) { throw failure('invalid_catalog', error.message); }
        const own = message.command === 'catalogList';
        const result = await catalogRpc(own ? 'list' : 'search', { p_query: options.query,
          p_kind: options.kind, p_offset: options.offset, p_limit: options.limit }, own);
        return catalogPage(result, options, !own);
      }
      if (message.command === 'catalogGet') return { ok: true, asset: await catalogGet(message.id) };
      if (message.command === 'catalogSave') {
        const draft = catalogDraft(message.asset);
        const id = draft.id || null;
        delete draft.id;
        const expected = catalogRevision(message.expectedRevision);
        if (!id && expected !== 0 || id && expected < 1) throw failure('invalid_catalog', 'Reload the document before saving changes.');
        const result = await catalogRpc('save', { p_id: id, p_asset: draft, p_expected_revision: expected }, true);
        if (result?.conflict === true) return { ok: false, code: 'catalog_conflict', error: 'This document changed on another device. Reload it before saving.',
          asset: result.asset ? catalogAsset(result.asset) : null };
        if (result?.ok !== true || !result.asset || result.asset.revision !== expected + 1) throw failure('invalid_response', 'The document save could not be confirmed.');
        const saved = catalogAsset(result.asset);
        if (id && saved.id !== id || ['kind', 'title', 'description', 'author_name', 'visibility'].some(key => saved[key] !== draft[key]) ||
            JSON.stringify(saved.tags) !== JSON.stringify(draft.tags) || JSON.stringify(saved.payload) !== JSON.stringify(draft.payload)) {
          throw failure('invalid_response', 'The document save could not be confirmed.');
        }
        return { ok: true, asset: saved };
      }
      if (message.command === 'catalogDelete') {
        const result = await catalogRpc('delete', { p_id: catalogId(message.id), p_expected_revision: catalogRevision(message.expectedRevision) }, true);
        if (result?.conflict === true) return { ok: false, code: 'catalog_conflict', error: 'This document changed or was removed. Reload your library before deleting.' };
        if (result?.ok !== true) throw failure('invalid_response', 'Deletion could not be confirmed.');
        return { ok: true, deleted: true };
      }
      if (message.command === 'catalogRemove') {
        const id = catalogId(message.id), current = await localCatalog();
        await chrome.storage.local.set({ slInstalledAssets: current.items.filter(item => item.id !== id),
          ...(current.activeTheme?.id === id ? { slActiveTheme: null } : {}) });
        return { ok: true, removed: true };
      }
      if (message.command === 'catalogResetTheme') {
        await chrome.storage.local.set({ slActiveTheme: null });
        return { ok: true, applied: true };
      }
      if (message.command === 'catalogInstall' || message.command === 'catalogUse') {
        if (message.enableModern !== undefined && typeof message.enableModern !== 'boolean') throw failure('invalid_catalog', 'Confirm whether to enable Modern Web Chat.');
        if (message.id !== undefined && message.asset !== undefined) throw failure('invalid_catalog', 'Choose one document source.');
        const asset = message.id !== undefined ? await catalogGet(message.id) : installable(message.asset);
        const use = message.command === 'catalogUse';
        const local = await localCatalog();
        if (message.enableModern === true && (!use || asset.kind !== 'theme')) throw failure('invalid_catalog', 'Only a theme can enable Modern Web Chat.');
        if (use && asset.kind === 'theme' && !local.modernEnabled && message.enableModern !== true) {
          throw failure('modern_chat_required', 'Enable Modern Web Chat to use this theme.');
        }
        if (!local.items.some(item => item.id === asset.id) && local.items.length >= catalog.LIMITS.installed) {
          throw failure('catalog_full', 'Your installed library is full. Remove a document before adding another.');
        }
        if (use && asset.kind === 'prompt') {
          if (!Number.isInteger(sender.tab?.id)) throw failure('open_studio_required', 'Open this library from Google AI Studio to use system instructions.');
          let result;
          try {
            result = await chrome.tabs.sendMessage(sender.tab.id, { action: 'slApplyPrompt', text: asset.payload.text,
              requestId: crypto.randomUUID() }, { frameId: 0 });
          } catch (_) { throw failure('prompt_apply_failed', 'Open a chat in Google AI Studio, then try using the prompt again.'); }
          if (result?.ok !== true) throw failure('prompt_apply_failed', typeof result?.error === 'string'
            ? result.error.slice(0, 240) : 'The current chat did not accept these instructions.');
        }
        if (use && asset.kind === 'theme') {
          const items = local.items.filter(item => item.id !== asset.id); items.unshift(asset);
          const stored = await chrome.storage.local.get(['slState']);
          const current = stored.slState && typeof stored.slState === 'object' && !Array.isArray(stored.slState) ? stored.slState : {};
          if (current.modernWebChatEnabled !== true && message.enableModern !== true) throw failure('modern_chat_required', 'Modern Web Chat was disabled. Enable it before using this theme.');
          await chrome.storage.local.set({ slInstalledAssets: items, slActiveTheme: asset,
            ...(current.modernWebChatEnabled !== true ? { slState: { ...current, modernWebChatEnabled: true } } : {}) });
        } else await installAsset(asset);
        return { ok: true, asset, installed: true, applied: use, ...(use && asset.kind === 'theme' ? { modernEnabled: true } : {}) };
      }
      throw failure('invalid_command', 'Unknown library command.');
    }
    function isTrusted(sender) {
      const accountUrl = chrome.runtime.getURL('account/account.html');
      const catalogUrl = chrome.runtime.getURL('account/catalog.html');
      const trustedUrl = sender?.url === accountUrl || sender?.url === catalogUrl ||
        sender?.url === catalogUrl + '#library' || sender?.url === catalogUrl + '#market' || sender?.url === catalogUrl + '#profile';
      if (sender?.id !== chrome.runtime.id || !trustedUrl ||
          sender.origin !== 'chrome-extension://' + chrome.runtime.id) return false;
      if (sender.documentLifecycle && sender.documentLifecycle !== 'active') return false;
      // Chrome's sender.url/origin describe the sending frame, while tab.url
      // describes its containing tab. Never authorize the host content script.
      if (!sender.tab) return sender.frameId === undefined || sender.frameId === 0;
      if (sender.frameId === undefined || sender.frameId === 0) {
        return !sender.tab.url || sender.tab.url === sender.url;
      }
      if (!Number.isInteger(sender.frameId) || sender.frameId < 1) return false;
      try {
        return new URL(sender.tab.url).origin === 'https://aistudio.google.com';
      } catch (_) { return false; }
    }
    async function handle(message, sender) {
      if (!message || message.action !== 'slAccount') return undefined;
      if (!isTrusted(sender)) return { ok: false, code: 'forbidden', error: 'Use the extension account page for this operation.' };
      if (!COMMANDS.has(message.command) && !CATALOG_COMMANDS.has(message.command) && !SOCIAL_COMMANDS.has(message.command) && !MEMBERSHIP_COMMANDS.has(message.command)) return { ok: false, code: 'invalid_command', error: 'Unknown account command.' };
      // Account owns the current user's profile editor. Public profile browsing,
      // social actions and catalog documents stay inside the packaged Market.
      if (sender.url === chrome.runtime.getURL('account/account.html') &&
          (CATALOG_COMMANDS.has(message.command) || SOCIAL_COMMANDS.has(message.command) &&
            (!['profileGet', 'profileUpdate'].includes(message.command) ||
              message.command === 'profileGet' && (message.profileId !== undefined || message.handle !== undefined || message.anonymous !== undefined)))) {
        return { ok: false, code: 'forbidden', error: 'Open Market for this operation.' };
      }
      return serialize(async () => {
        if (MEMBERSHIP_COMMANDS.has(message.command)) {
          try { await load(); return await handleMembership(message); }
          catch (error) { return catalogError(error); }
        }
        if (SOCIAL_COMMANDS.has(message.command)) {
          try { await load(); return await handleSocial(message); }
          catch (error) { return catalogError(error); }
        }
        if (CATALOG_COMMANDS.has(message.command)) {
          try { await load(); return await handleCatalog(message, sender); }
          catch (error) { return catalogError(error); }
        }
        try {
          await load();
          if (message.command === 'status') return { ok: true, status: await publicStatus() };
          if (message.command === 'login') await login();
          else if (message.command === 'logout') await logout('local');
          else if (message.command === 'logoutAll') await logout('global');
          else if (message.command === 'sync') {
            if (!data.session) throw failure('sign_in_required', 'Sign in to synchronize settings.');
            await synchronize();
          } else if (message.command === 'resolve') await resolve(message.choice);
          else if (message.command === 'pause') {
            if (!data.binding || !data.session) throw failure('sign_in_required', 'Sign in first.');
            data.binding.enabled = false;
            stateOverride = null;
            transientError = null;
            await persist();
          } else if (message.command === 'resume') {
            if (!data.binding || !data.session) throw failure('sign_in_required', 'Sign in first.');
            data.binding.enabled = true;
            stateOverride = null;
            await persist();
            await synchronize();
          } else if (message.command === 'deleteCloud') {
            if (message.confirm !== true) throw failure('confirmation_required', 'Confirm cloud data deletion.');
            await deleteCloud();
          } else if (message.command === 'deleteAccount') {
            if (message.confirm !== 'DELETE') throw failure('confirmation_required', 'Type DELETE to confirm account deletion.');
            await deleteAccount();
          } else if (message.command === 'export') return { ok: true, settings: await readLocal() };
          return { ok: true, status: await publicStatus() };
        } catch (error) {
          const response = safeError(error);
          transientError = response.error;
          if (!['login_cancelled', 'confirmation_required', 'invalid_command', 'sign_out_first', 'no_cloud_settings', 'reauth_required'].includes(response.code)) {
            stateOverride = response.code === 'offline' ? 'offline' : data?.session ? 'error' : 'signed_out';
          }
          return response;
        }
      });
    }
    async function backgroundSync() {
      return serialize(async () => {
        try { await load(); await synchronize(); }
        catch (error) {
          const response = safeError(error);
          transientError = response.error;
          stateOverride = response.code === 'offline' ? 'offline' : data?.session ? 'error' : 'signed_out';
        }
      });
    }
    function onLocalChange(changes, area) {
      if (area !== 'local' || !changes.slState) return;
      if (debounce) cancel(debounce);
      debounce = schedule(() => { debounce = null; void backgroundSync(); }, 1500);
    }
    function onAlarm(alarm) { return alarm?.name === ALARM ? backgroundSync() : Promise.resolve(); }
    async function start() {
      try {
        await load();
        await chrome.alarms.create(ALARM, { periodInMinutes: 1 });
        await backgroundSync();
      } catch (_) { transientError = 'Private account storage is unavailable. Local extension features still work.'; }
    }
    return Object.freeze({ handle, start, onLocalChange, onAlarm });
  }
  return Object.freeze({ createService, parseCallback, ALARM });
});
