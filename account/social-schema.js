(function (root, factory) {
  'use strict';
  const catalog = typeof module === 'object' && module.exports ? require('./catalog-schema.js') : root.StudioLabCatalogSchema;
  const api = factory(catalog);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StudioLabSocialSchema = api;
})(typeof globalThis !== 'undefined' ? globalThis : self, function (catalog) {
  'use strict';
  const PROFILE_KEYS = ['id', 'nickname', 'handle', 'revision', 'created_at', 'updated_at',
    'followers', 'followingCount', 'publications', 'following', 'self'];
  function plain(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value) &&
      [Object.prototype, null].includes(Object.getPrototypeOf(value));
  }
  function exact(value, keys) {
    if (!plain(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) {
      throw new Error('Unsupported profile fields.');
    }
  }
  function id(value) {
    if (typeof value !== 'string' || !catalog.UUID.test(value)) throw new Error('Choose a valid profile or item.');
    return value.toLowerCase();
  }
  function nickname(value) {
    if (typeof value !== 'string' || value.length > 60 || /[\u0000-\u001f\u007f@]/.test(value) || !value.trim()) {
      throw new Error('Choose a nickname of 1–60 characters; email addresses are not public nicknames.');
    }
    return value.trim();
  }
  function handle(value) {
    if (typeof value !== 'string' || !/^[a-z][a-z0-9_]{2,23}$/.test(value)) {
      throw new Error('Your tag must use 3–24 lowercase letters, numbers or underscores, starting with a letter.');
    }
    return value;
  }
  function revision(value) {
    if (!Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER) throw new Error('Reload the profile before saving.');
    return value;
  }
  function sanitizeProfile(value) {
    // Older deployed profile RPCs have no badges field. Treat that version as
    // unbadged; arbitrary profile edits can never supply privileged flags.
    exact(value, Object.hasOwn(value || {}, 'badges') ? [...PROFILE_KEYS, 'badges'] : PROFILE_KEYS);
    const result = { id: id(value.id), nickname: nickname(value.nickname), handle: handle(value.handle), revision: revision(value.revision) };
    if (result.revision < 1 || result.nickname !== value.nickname) throw new Error('Invalid profile record.');
    for (const key of ['created_at', 'updated_at']) {
      if (typeof value[key] !== 'string' || !Number.isFinite(Date.parse(value[key]))) throw new Error('Invalid profile date.');
      result[key] = value[key];
    }
    for (const key of ['followers', 'followingCount', 'publications']) {
      if (!Number.isSafeInteger(value[key]) || value[key] < 0) throw new Error('Invalid profile count.');
      result[key] = value[key];
    }
    for (const key of ['following', 'self']) {
      if (typeof value[key] !== 'boolean') throw new Error('Invalid profile relationship.');
      result[key] = value[key];
    }
    if (result.self && result.following) throw new Error('A profile cannot follow itself.');
    result.badges = value.badges === undefined ? { verified: false, staff: false, moderator: false } : sanitizeBadges(value.badges);
    return result;
  }
  function sanitizeBadges(value) {
    exact(value, ['verified', 'staff', 'moderator']);
    for (const flag of Object.values(value)) if (typeof flag !== 'boolean') throw new Error('Invalid profile badge.');
    return { verified: value.verified, staff: value.staff, moderator: value.moderator };
  }
  function memberText(value, minimum, maximum, label) {
    if (typeof value !== 'string' || value.trim() !== value || value.length < minimum || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) {
      throw new Error(label + ' must contain ' + minimum + '–' + maximum + ' characters on one line.');
    }
    return value;
  }
  function memberDate(value, nullable = false) {
    if (nullable && value === null) return null;
    if (typeof value !== 'string' || value.length > 100 || !Number.isFinite(Date.parse(value))) throw new Error('Invalid membership date.');
    return value;
  }
  function sanitizeApplication(value) {
    if (value === null) return null;
    exact(value, ['status', 'message', 'submitted_at', 'reviewed_at', 'response']);
    if (!['pending', 'approved', 'rejected'].includes(value.status)) throw new Error('Invalid application status.');
    const result = { status: value.status, message: memberText(value.message, 20, 2000, 'Application'),
      submitted_at: memberDate(value.submitted_at), reviewed_at: memberDate(value.reviewed_at, true),
      response: memberText(value.response, 0, 500, 'Response') };
    if ((result.status === 'pending') !== (result.reviewed_at === null)) throw new Error('Invalid application review.');
    return result;
  }
  function sanitizeMembership(value) {
    exact(value, ['capabilities', 'verification', 'application']);
    exact(value.capabilities, ['owner', 'moderate']);
    exact(value.verification, ['active', 'expires_at', 'price_usd_month', 'billing_ready']);
    const { owner, moderate } = value.capabilities;
    const { active, expires_at, price_usd_month, billing_ready } = value.verification;
    if ([owner, moderate, active, billing_ready].some(flag => typeof flag !== 'boolean') || owner && !moderate || price_usd_month !== 1) {
      throw new Error('Invalid membership permissions.');
    }
    const expiry = memberDate(expires_at, true);
    if (active && expiry === null) throw new Error('Invalid paid membership.');
    return { capabilities: { owner, moderate }, verification: { active, expires_at: expiry, price_usd_month: 1, billing_ready },
      application: sanitizeApplication(value.application) };
  }
  function sanitizeModeration(value) {
    exact(value, ['id', 'removed', 'reason', 'removed_at', 'restored_at', 'can_restore']);
    if (typeof value.removed !== 'boolean' || typeof value.can_restore !== 'boolean' || value.can_restore && !value.removed) {
      throw new Error('Invalid moderation permissions.');
    }
    const result = { id: id(value.id), removed: value.removed, reason: memberText(value.reason, value.removed ? 10 : 0, 500, 'Reason'),
      removed_at: memberDate(value.removed_at, true), restored_at: memberDate(value.restored_at, true), can_restore: value.can_restore };
    if (result.removed && result.removed_at === null) throw new Error('Invalid moderation removal.');
    return result;
  }
  function sanitizeItem(value) {
    exact(value, ['id', 'likes', 'liked', 'saved', 'author']);
    if (!Number.isSafeInteger(value.likes) || value.likes < 0 || typeof value.liked !== 'boolean' || typeof value.saved !== 'boolean') {
      throw new Error('Invalid item reactions.');
    }
    return { id: id(value.id), likes: value.likes, liked: value.liked, saved: value.saved,
      author: value.author === null ? null : sanitizeProfile(value.author) };
  }
  function ids(value) {
    if (!Array.isArray(value) || value.length < 1 || value.length > catalog.LIMITS.page) throw new Error('Choose up to 20 items.');
    const values = value.map(id);
    if (new Set(values).size !== values.length) throw new Error('Each item may appear only once.');
    return values;
  }
  return Object.freeze({ id, nickname, handle, revision, sanitizeProfile, sanitizeItem, ids, sanitizeBadges,
    sanitizeMembership, sanitizeApplication, sanitizeModeration,
    applicationMessage: value => memberText(value, 20, 2000, 'Application'),
    reviewResponse: value => memberText(value, 0, 500, 'Response'),
    moderationReason: value => memberText(value, 10, 500, 'Reason') });
});
