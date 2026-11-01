(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StudioLabCatalogSchema = api;
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';
  const LIMITS = Object.freeze({ title: 80, description: 500, tags: 5, tag: 24, author: 60,
    prompt: 16000, owned: 100, installed: 100, page: 20, query: 100 });
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const COLORS = Object.freeze(['background', 'surface', 'text', 'muted', 'accent', 'accentText', 'border']);
  const META = Object.freeze(['id', 'kind', 'title', 'description', 'tags', 'author_name', 'visibility',
    'revision', 'created_at', 'updated_at']);
  const LEGACY_DEFAULT_THEMES = Object.freeze({
    dark: Object.freeze({ version: 1, mode: 'dark', colors: Object.freeze({ background: '#191919', surface: '#252525',
      text: '#d4d4d4', muted: '#8c8c8c', accent: '#87a9ff', accentText: '#062e6f', border: '#888d94' }) }),
    light: Object.freeze({ version: 1, mode: 'light', colors: Object.freeze({ background: '#ffffff', surface: '#fcfcfc',
      text: '#1b1b1e', muted: '#565b61', accent: '#185abc', accentText: '#ffffff', border: '#747775' }) })
  });
  const THEME_TOKENS = Object.freeze(['--sl-mwc-surface', '--sl-mwc-raised', '--sl-mwc-hover', '--sl-mwc-border',
    '--sl-mwc-text', '--sl-mwc-muted', '--sl-mwc-accent', '--color-v3-primary', '--color-v3-surface',
    '--color-v3-surface-container-high', '--color-v3-surface-container-highest', '--color-v3-text',
    '--color-v3-text-subtle', '--color-v3-text-var']);
  const THEME_OPACITY_TOKENS = Object.freeze(['--sl-mwc-surface', '--sl-mwc-raised', '--sl-mwc-hover',
    '--color-v3-surface', '--color-v3-surface-container-high', '--color-v3-surface-container-highest']);
  const THEME_CANVAS = Object.freeze({ dark: '#191919', light: '#ffffff' });
  function themeDefaults(mode) {
    const dark = mode === 'dark';
    return Object.freeze({ version: 2, mode, tokens: Object.freeze({
      '--sl-mwc-surface': dark ? '#191919' : '#ffffff', '--sl-mwc-raised': dark ? '#1e1f20' : '#f4f5f7',
      '--sl-mwc-hover': dark ? '#323232' : '#e9ebef', '--sl-mwc-border': 'transparent',
      '--sl-mwc-text': dark ? '#e3e3e3' : '#1b1b1e', '--sl-mwc-muted': dark ? '#b0b0b0' : '#565b61',
      '--sl-mwc-accent': dark ? '#8ab4f8' : '#185abc', '--color-v3-primary': dark ? '#8ab4f8' : '#185abc',
      '--color-v3-surface': THEME_CANVAS[mode], '--color-v3-surface-container-high': dark ? '#252525' : '#fcfcfc',
      '--color-v3-surface-container-highest': dark ? '#2a2a2a' : '#f4f5f5', '--color-v3-text': dark ? '#d4d4d4' : '#1b1b1e',
      '--color-v3-text-subtle': dark ? '#8c8c8c' : '#565b61', '--color-v3-text-var': dark ? '#8c8c8c' : '#565b61'
    }), opacity: Object.freeze(Object.fromEntries(THEME_OPACITY_TOKENS.map(name => [name, 1]))) });
  }
  const DEFAULT_THEMES = Object.freeze({ dark: themeDefaults('dark'), light: themeDefaults('light') });
  function plain(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === null || proto === Object.prototype;
  }
  function exact(value, keys, required = keys) {
    if (!plain(value) || Object.keys(value).some(key => !keys.includes(key)) ||
        required.some(key => !Object.prototype.hasOwnProperty.call(value, key))) throw new Error('Unsupported document fields.');
  }
  function text(value, maximum, label, optional = false) {
    if (typeof value !== 'string' || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) {
      throw new Error(label + ' must be plain text, up to ' + maximum + ' characters.');
    }
    const result = value.trim();
    if (!optional && !result) throw new Error(label + ' is required.');
    return result;
  }
  function luminance(color) {
    const values = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4));
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  }
  function contrast(left, right) {
    const a = luminance(left), b = luminance(right);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }
  function composite(color, opacity, under) {
    return '#' + [1, 3, 5].map(offset => Math.round(parseInt(color.slice(offset, offset + 2), 16) * opacity
      + parseInt(under.slice(offset, offset + 2), 16) * (1 - opacity)).toString(16).padStart(2, '0')).join('');
  }
  function compositedSurfaces(theme) {
    const t = theme.tokens, a = theme.opacity;
    const page = composite(t['--color-v3-surface'], a['--color-v3-surface'], THEME_CANVAS[theme.mode]);
    const surface = composite(t['--sl-mwc-surface'], a['--sl-mwc-surface'], page);
    const high = composite(t['--color-v3-surface-container-high'], a['--color-v3-surface-container-high'], surface);
    return {
      '--color-v3-surface': page, '--sl-mwc-surface': surface,
      '--sl-mwc-raised': composite(t['--sl-mwc-raised'], a['--sl-mwc-raised'], surface),
      '--sl-mwc-hover': composite(t['--sl-mwc-hover'], a['--sl-mwc-hover'], surface),
      '--color-v3-surface-container-high': high,
      '--color-v3-surface-container-highest': composite(t['--color-v3-surface-container-highest'], a['--color-v3-surface-container-highest'], high)
    };
  }
  function validateThemeV2(value) {
    exact(value, ['version', 'mode', 'tokens', 'opacity']);
    if (value.version !== 2 || !['dark', 'light'].includes(value.mode)) throw new Error('Unsupported theme version or mode.');
    exact(value.tokens, THEME_TOKENS); exact(value.opacity, THEME_OPACITY_TOKENS);
    const tokens = {}, opacity = {};
    for (const name of THEME_TOKENS) {
      const color = value.tokens[name];
      if (name === '--sl-mwc-border') {
        if (color !== 'transparent') throw new Error('Theme outlines must remain transparent.');
      } else if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Theme colors must use six-digit HEX values.');
      tokens[name] = color.toLowerCase();
    }
    for (const name of THEME_OPACITY_TOKENS) {
      const amount = value.opacity[name];
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > 1) throw new Error('Background opacity must be between 0 and 100%.');
      opacity[name] = amount;
    }
    const clean = { version: 2, mode: value.mode, tokens, opacity };
    const surfaces = Object.values(compositedSurfaces(clean));
    for (const name of ['--sl-mwc-text', '--sl-mwc-accent', '--color-v3-text', '--color-v3-primary']) {
      if (surfaces.some(surface => contrast(tokens[name], surface) < 4.5)) throw new Error('Text and links need 4.5:1 contrast against the visible backgrounds, including transparency.');
    }
    for (const name of ['--sl-mwc-muted', '--color-v3-text-subtle', '--color-v3-text-var']) {
      if (surfaces.some(surface => contrast(tokens[name], surface) < 3)) throw new Error('Secondary text needs 3:1 contrast against the visible backgrounds, including transparency.');
    }
    return clean;
  }
  function validateTheme(value) {
    if (value?.version === 2) return validateThemeV2(value);
    exact(value, ['version', 'mode', 'colors']);
    if (value.version !== 1 || !['dark', 'light'].includes(value.mode)) throw new Error('Unsupported theme version or mode.');
    exact(value.colors, COLORS);
    const colors = {};
    for (const name of COLORS) {
      if (typeof value.colors[name] !== 'string' || !/^#[0-9a-f]{6}$/i.test(value.colors[name])) {
        throw new Error('Theme colors must use six-digit HEX values.');
      }
      colors[name] = value.colors[name].toLowerCase();
    }
    for (const surface of ['background', 'surface']) {
      for (const foreground of ['text', 'muted', 'accent']) if (contrast(colors[foreground], colors[surface]) < 4.5) {
        throw new Error('Text, secondary text and accent need at least 4.5:1 contrast against both backgrounds.');
      }
      if (contrast(colors.border, colors[surface]) < 3) throw new Error('Control borders need at least 3:1 contrast against both backgrounds.');
    }
    if (contrast(colors.accentText, colors.accent) < 4.5) throw new Error('Accent text needs at least 4.5:1 contrast.');
    return { version: 1, mode: value.mode, colors };
  }
  function upgradeTheme(value) {
    const clean = validateTheme(value);
    if (clean.version === 2) return clean;
    const c = clean.colors;
    return validateThemeV2({ version: 2, mode: clean.mode, tokens: {
      '--sl-mwc-surface': c.background, '--sl-mwc-raised': c.surface, '--sl-mwc-hover': c.surface,
      '--sl-mwc-border': 'transparent', '--sl-mwc-text': c.text, '--sl-mwc-muted': c.muted, '--sl-mwc-accent': c.accent,
      '--color-v3-primary': c.accent, '--color-v3-surface': c.background, '--color-v3-surface-container-high': c.surface,
      '--color-v3-surface-container-highest': c.surface, '--color-v3-text': c.text,
      '--color-v3-text-subtle': c.muted, '--color-v3-text-var': c.muted
    }, opacity: Object.fromEntries(THEME_OPACITY_TOKENS.map(name => [name, 1])) });
  }
  function validatePrompt(value) {
    exact(value, ['version', 'text']);
    if (value.version !== 1 || typeof value.text !== 'string' || !value.text.trim() ||
        value.text.length > LIMITS.prompt || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value.text)) {
      throw new Error('System instructions must contain plain text, up to 16,000 characters.');
    }
    return { version: 1, text: value.text };
  }
  function validateDraft(value) {
    exact(value, ['id', 'kind', 'title', 'description', 'tags', 'author_name', 'visibility', 'payload'],
      ['kind', 'title', 'description', 'tags', 'author_name', 'visibility', 'payload']);
    if (value.id !== undefined && value.id !== null && !UUID.test(value.id)) throw new Error('Invalid document id.');
    if (!['theme', 'prompt'].includes(value.kind) || !['private', 'public'].includes(value.visibility)) throw new Error('Choose a valid document type and visibility.');
    if (!Array.isArray(value.tags) || value.tags.length > LIMITS.tags) throw new Error('Use no more than five tags.');
    const tags = value.tags.map(tag => text(tag, LIMITS.tag, 'Tag').toLowerCase());
    if (new Set(tags).size !== tags.length) throw new Error('Tags must be unique.');
    const author_name = text(value.author_name, LIMITS.author, 'Public author name', value.visibility !== 'public');
    if (author_name.includes('@')) throw new Error('Use a public alias instead of an email address.');
    return { ...(value.id ? { id: value.id.toLowerCase() } : {}), kind: value.kind,
      title: text(value.title, LIMITS.title, 'Title'), description: text(value.description, LIMITS.description, 'Description', true),
      tags, author_name, visibility: value.visibility,
      payload: value.kind === 'theme' ? validateTheme(value.payload) : validatePrompt(value.payload) };
  }
  function sanitizeAsset(value, options = {}) {
    const metadata = options.metadata === true;
    exact(value, metadata ? META : [...META, 'payload']);
    if (!UUID.test(value.id || '') || !Number.isSafeInteger(value.revision) || value.revision < 1 ||
        !['created_at', 'updated_at'].every(key => typeof value[key] === 'string' && Number.isFinite(Date.parse(value[key])))) {
      throw new Error('Invalid document record.');
    }
    const draft = validateDraft({ id: value.id, kind: value.kind, title: value.title, description: value.description,
      tags: value.tags, author_name: value.author_name, visibility: value.visibility,
      payload: metadata ? value.kind === 'theme' ? DEFAULT_THEMES.dark : { version: 1, text: 'Metadata' } : value.payload });
    if (metadata) delete draft.payload;
    return { ...draft, revision: value.revision, created_at: value.created_at, updated_at: value.updated_at };
  }
  function validateQuery(value = {}) {
    if (!plain(value)) throw new Error('Invalid search request.');
    const query = text(value.query === undefined ? '' : value.query, LIMITS.query, 'Search', true);
    const kind = value.kind === undefined ? 'all' : value.kind;
    if (!['all', 'theme', 'prompt'].includes(kind)) throw new Error('Choose themes, prompts or all documents.');
    const offset = value.offset === undefined ? 0 : value.offset;
    const limit = value.limit === undefined ? LIMITS.page : value.limit;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000 || !Number.isInteger(limit) || limit < 1 || limit > LIMITS.page) {
      throw new Error('Invalid result page.');
    }
    return { query, kind, offset, limit };
  }
  function validatePayload(kind, value) {
    if (kind === 'theme') return validateTheme(value);
    if (kind === 'prompt') return validatePrompt(value);
    throw new Error('Unknown document type.');
  }
  return Object.freeze({ LIMITS, COLORS, LEGACY_DEFAULT_THEMES, DEFAULT_THEMES, THEME_TOKENS, THEME_OPACITY_TOKENS,
    THEME_CANVAS, validateTheme, upgradeTheme, compositedSurfaces, composite, validatePrompt, validateDraft,
    sanitizeAsset, validateAsset: sanitizeAsset, validatePayload, validateQuery, contrast, UUID });
});
