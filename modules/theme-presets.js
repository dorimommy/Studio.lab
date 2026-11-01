(function () {
  'use strict';

  if (!window.StudioLab) window.StudioLab = {};

  const PRESET_PALETTES = {
    purple: {
      id: 'purple', group: 'dark', label: 'Purple',
      uiBase: '#0d0e14', uiSurface: '#151722', uiAccent: '#a78bfa', uiText: '#eef2f8', uiBorder: '#26293d',
      modelBubble: '#131520', userBubble: '#1f1d33',
      modelText: '#f1f5f9', userText: '#ede9fe',
      modelQuote: '#f5c26b', userQuote: '#c4b5fd'
    },
    slate: {
      id: 'slate', group: 'dark', label: 'Slate Blue',
      uiBase: '#0b0f17', uiSurface: '#131a27', uiAccent: '#60a5fa', uiText: '#f1f5f9', uiBorder: '#232f46',
      modelBubble: '#101723', userBubble: '#19263c',
      modelText: '#f8fafc', userText: '#e2e8f0',
      modelQuote: '#38bdf8', userQuote: '#93c5fd'
    },
    cyan: {
      id: 'cyan', group: 'dark', label: 'Cyber Cyan',
      uiBase: '#091116', uiSurface: '#111d24', uiAccent: '#22d3ee', uiText: '#ecf6f9', uiBorder: '#1f3542',
      modelBubble: '#0e1920', userBubble: '#152b36',
      modelText: '#f0fdfa', userText: '#cffafe',
      modelQuote: '#67e8f9', userQuote: '#2dd4bf'
    },
    amber: {
      id: 'amber', group: 'dark', label: 'Warm Amber',
      uiBase: '#110f0d', uiSurface: '#1b1714', uiAccent: '#f59e0b', uiText: '#f5f0eb', uiBorder: '#332b22',
      modelBubble: '#171411', userBubble: '#282018',
      modelText: '#faf6f0', userText: '#fef3c7',
      modelQuote: '#fbbf24', userQuote: '#fb923c'
    },
    matrix: {
      id: 'matrix', group: 'dark', label: 'Matrix Green',
      uiBase: '#0a110e', uiSurface: '#121e19', uiAccent: '#34d399', uiText: '#ebf5f0', uiBorder: '#1f362c',
      modelBubble: '#0f1a15', userBubble: '#162b22',
      modelText: '#f0fdf4', userText: '#d1fae5',
      modelQuote: '#6ee7b7', userQuote: '#2dd4bf'
    },
    midnight: {
      id: 'midnight', group: 'dark', label: 'Midnight Blue',
      uiBase: '#090c15', uiSurface: '#111625', uiAccent: '#818cf8', uiText: '#eef2ff', uiBorder: '#222b45',
      modelBubble: '#0e1320', userBubble: '#1a213b',
      modelText: '#f1f5f9', userText: '#e0e7ff',
      modelQuote: '#7dd3fc', userQuote: '#a5b4fc'
    },
    forest: {
      id: 'forest', group: 'dark', label: 'Deep Forest',
      uiBase: '#0c1210', uiSurface: '#141f1b', uiAccent: '#4ade80', uiText: '#edf5f1', uiBorder: '#243830',
      modelBubble: '#111a17', userBubble: '#1a2c25',
      modelText: '#f0fdf4', userText: '#dcfce7',
      modelQuote: '#a3e635', userQuote: '#6ee7b7'
    },
    dracula: {
      id: 'dracula', group: 'dark', label: 'Dracula',
      uiBase: '#14151f', uiSurface: '#1e202e', uiAccent: '#bd93f9', uiText: '#f8f8f2', uiBorder: '#34374d',
      modelBubble: '#191b27', userBubble: '#282a3e',
      modelText: '#f8f8f2', userText: '#f1eefc',
      modelQuote: '#f1fa8c', userQuote: '#ff79c6'
    },
    sunset: {
      id: 'sunset', group: 'dark', label: 'Sunset Glow',
      uiBase: '#130e14', uiSurface: '#1e1620', uiAccent: '#fb7185', uiText: '#f7eef2', uiBorder: '#38273b',
      modelBubble: '#19121b', userBubble: '#2b1d2e',
      modelText: '#fdf2f8', userText: '#ffe4e6',
      modelQuote: '#fdba74', userQuote: '#fda4af'
    },
    nord: {
      id: 'nord', group: 'dark', label: 'Nordic Frost',
      uiBase: '#1b1f27', uiSurface: '#242933', uiAccent: '#88c0d0', uiText: '#eceff4', uiBorder: '#3b4252',
      modelBubble: '#20252e', userBubble: '#2e3440',
      modelText: '#eceff4', userText: '#e5e9f0',
      modelQuote: '#ebcb8b', userQuote: '#81a1c1'
    },
    cosmos: {
      id: 'cosmos', group: 'dark', label: 'Deep Cosmos',
      uiBase: '#0b0a14', uiSurface: '#141224', uiAccent: '#c084fc', uiText: '#f2effa', uiBorder: '#282345',
      modelBubble: '#100e1d', userBubble: '#1d1836',
      modelText: '#f5f3ff', userText: '#ede9fe',
      modelQuote: '#f472b6', userQuote: '#d8b4fe'
    },
    terminal: {
      id: 'terminal', group: 'dark', label: 'Retro Terminal',
      uiBase: '#0b0d0c', uiSurface: '#131715', uiAccent: '#22c55e', uiText: '#e4efe9', uiBorder: '#233029',
      modelBubble: '#0f1311', userBubble: '#18241d',
      modelText: '#ecfdf5', userText: '#d1fae5',
      modelQuote: '#eab308', userQuote: '#4ade80'
    },
    crimson: {
      id: 'crimson', group: 'dark', label: 'Crimson Night',
      uiBase: '#120c0e', uiSurface: '#1d1317', uiAccent: '#f43f5e', uiText: '#f6edf0', uiBorder: '#38222a',
      modelBubble: '#171013', userBubble: '#291820',
      modelText: '#fff1f2', userText: '#ffe4e6',
      modelQuote: '#fda4af', userQuote: '#fb7185'
    },
    pinkglow: {
      id: 'pinkglow', group: 'dark', label: 'Pink Glow',
      uiBase: '#130d14', uiSurface: '#1e1520', uiAccent: '#f472b6', uiText: '#f8eef5', uiBorder: '#39253d',
      modelBubble: '#18111a', userBubble: '#2b1b2e',
      modelText: '#fdf2f8', userText: '#fce7f3',
      modelQuote: '#f9a8d4', userQuote: '#e879f9'
    },
    lava: {
      id: 'lava', group: 'dark', label: 'Volcanic Lava',
      uiBase: '#120e0c', uiSurface: '#1d1613', uiAccent: '#f97316', uiText: '#f7efe9', uiBorder: '#382922',
      modelBubble: '#171210', userBubble: '#2a1e18',
      modelText: '#fff7ed', userText: '#ffedd5',
      modelQuote: '#fdba74', userQuote: '#fb923c'
    },

    lightsnow: {
      id: 'lightsnow', group: 'light', label: 'Light Snow',
      uiBase: '#f4f6fa', uiSurface: '#ffffff', uiAccent: '#5a5ddb', uiText: '#0f172a', uiBorder: '#dce2ec',
      modelBubble: '#ffffff', userBubble: '#eef2ff',
      modelText: '#1e293b', userText: '#1e1b4b',
      modelQuote: '#b45309', userQuote: '#4f46e5'
    },
    mintfresh: {
      id: 'mintfresh', group: 'light', label: 'Mint Fresh',
      uiBase: '#f2f7f5', uiSurface: '#ffffff', uiAccent: '#0b7970', uiText: '#11221d', uiBorder: '#d3e3dd',
      modelBubble: '#ffffff', userBubble: '#e6f4f1',
      modelText: '#162c25', userText: '#113028',
      modelQuote: '#0f766e', userQuote: '#047857'
    },
    peachsoft: {
      id: 'peachsoft', group: 'light', label: 'Peach Soft',
      uiBase: '#faf5f0', uiSurface: '#ffffff', uiAccent: '#bb460a', uiText: '#241712', uiBorder: '#eadbd0',
      modelBubble: '#ffffff', userBubble: '#faeee5',
      modelText: '#2c1c16', userText: '#3b1f14',
      modelQuote: '#c2410c', userQuote: '#a34a08'
    },
    celesteblue: {
      id: 'celesteblue', group: 'light', label: 'Celeste Blue',
      uiBase: '#f2f6fa', uiSurface: '#ffffff', uiAccent: '#0272ab', uiText: '#0f2030', uiBorder: '#d5e2ee',
      modelBubble: '#ffffff', userBubble: '#e6f1fa',
      modelText: '#162a3d', userText: '#0c2e4a',
      modelQuote: '#0369a1', userQuote: '#1d4ed8'
    },
    sakurablossom: {
      id: 'sakurablossom', group: 'light', label: 'Sakura Blossom',
      uiBase: '#faf4f6', uiSurface: '#ffffff', uiAccent: '#d11b43', uiText: '#261319', uiBorder: '#ebd8de',
      modelBubble: '#ffffff', userBubble: '#fae8ee',
      modelText: '#2e161d', userText: '#3f1221',
      modelQuote: '#be123c', userQuote: '#be185d'
    },
    lavenderfield: {
      id: 'lavenderfield', group: 'light', label: 'Lavender Field',
      uiBase: '#f6f4fa', uiSurface: '#ffffff', uiAccent: '#7c3aed', uiText: '#1c152b', uiBorder: '#e1daee',
      modelBubble: '#ffffff', userBubble: '#efeafa',
      modelText: '#241b38', userText: '#2e1065',
      modelQuote: '#6d28d9', userQuote: '#7e22ce'
    },
    lemonhoney: {
      id: 'lemonhoney', group: 'light', label: 'Lemon Honey',
      uiBase: '#faf7f0', uiSurface: '#ffffff', uiAccent: '#a55a05', uiText: '#241e14', uiBorder: '#e8dfd0',
      modelBubble: '#ffffff', userBubble: '#f7efe0',
      modelText: '#2b2317', userText: '#3b2b14',
      modelQuote: '#b45309', userQuote: '#92400e'
    },
    oceanpearl: {
      id: 'oceanpearl', group: 'light', label: 'Ocean Pearl',
      uiBase: '#f2f7f8', uiSurface: '#ffffff', uiAccent: '#067590', uiText: '#112329', uiBorder: '#d3e3e7',
      modelBubble: '#ffffff', userBubble: '#e5f3f6',
      modelText: '#162d34', userText: '#0f2e38',
      modelQuote: '#0e7490', userQuote: '#0369a1'
    },
    matchacream: {
      id: 'matchacream', group: 'light', label: 'Matcha Cream',
      uiBase: '#f5f7f2', uiSurface: '#ffffff', uiAccent: '#4d7c0f', uiText: '#192214', uiBorder: '#dce3d3',
      modelBubble: '#ffffff', userBubble: '#ebf1e2',
      modelText: '#202b19', userText: '#1e2e14',
      modelQuote: '#3f6212', userQuote: '#126b33'
    },
    sweetamber: {
      id: 'sweetamber', group: 'light', label: 'Sweet Amber',
      uiBase: '#faf6f0', uiSurface: '#ffffff', uiAccent: '#c2410c', uiText: '#261a12', uiBorder: '#e8ddd0',
      modelBubble: '#ffffff', userBubble: '#f7ece0',
      modelText: '#2e2016', userText: '#3d2414',
      modelQuote: '#9a3412', userQuote: '#a34a08'
    }
  };

  const FONT_CATALOG = [
    { value: 'default', id: 'default', css: '', label: 'Default' },
    { value: "'Google Sans', sans-serif", id: 'google-sans', css: "'Google Sans', sans-serif", label: 'Google Sans' },
    { value: "'Inter', sans-serif", id: 'inter', css: "'StudioLab Inter', 'Inter', sans-serif", label: 'Inter' },
    { value: "'Segoe UI', sans-serif", id: 'segoe-ui', css: "'Segoe UI', sans-serif", label: 'Segoe UI' }
  ];
  const STYLE_CATALOG = [
    { id: 'default', labelKey: 'te_style_default_title', descKey: 'te_style_default_desc' },
    { id: 'cartoon-pixel', labelKey: 'te_style_pixel_title', descKey: 'te_style_pixel_desc' },
    { id: 'winter-frost', labelKey: 'te_style_winter_title', descKey: 'te_style_winter_desc' }
  ];
  function clampVal(num, min, max) {
    const n = Number(num);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function hexToRgbTuple(hex) {
    const clean = String(hex || '').replace('#', '').trim();
    if (clean.length === 3) {
      return [
        parseInt(clean[0] + clean[0], 16) || 0,
        parseInt(clean[1] + clean[1], 16) || 0,
        parseInt(clean[2] + clean[2], 16) || 0
      ];
    }
    if (clean.length >= 6) {
      return [
        parseInt(clean.slice(0, 2), 16) || 0,
        parseInt(clean.slice(2, 4), 16) || 0,
        parseInt(clean.slice(4, 6), 16) || 0
      ];
    }
    return [18, 16, 27];
  }

  function blendHex(hexA, hexB, ratio = 0.5) {
    const t = clampVal(ratio, 0, 1);
    const [r1, g1, b1] = hexToRgbTuple(hexA);
    const [r2, g2, b2] = hexToRgbTuple(hexB);
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    return `#${[r, g, b].map(x => clampVal(x, 0, 255).toString(16).padStart(2, '0')).join('')}`;
  }

  // Tint blends each surface toward the selected accent, with separate light and dark bases.
  function computeTintedPalette(presetKey = 'purple', tintPct = 15) {
    const preset = PRESET_PALETTES[presetKey] || PRESET_PALETTES.purple;
    const pct = clampVal(tintPct ?? 15, 0, 100);
    const t = pct / 100;

    if (preset.group === 'light') {
      const base0 = '#f9fafc';
      const surface0 = '#ffffff';
      const modelBub0 = '#ffffff';
      const userBub0 = blendHex('#ffffff', preset.uiAccent, 0.06);
      const border0 = '#dfe5ef';

      return {
        uiBase: blendHex(base0, preset.uiAccent, t * 0.24),
        uiSurface: blendHex(surface0, preset.uiAccent, t * 0.16),
        modelBubble: blendHex(modelBub0, preset.uiAccent, t * 0.15),
        userBubble: blendHex(userBub0, preset.uiAccent, t * 0.28),
        uiBorder: blendHex(border0, preset.uiAccent, t * 0.38)
      };
    }

    const base0 = blendHex('#08090e', preset.uiBase, 0.45);
    const surface0 = blendHex('#10121b', preset.uiSurface, 0.45);
    const modelBub0 = blendHex('#0d0f17', preset.modelBubble, 0.45);
    const userBub0 = blendHex('#151824', preset.userBubble, 0.55);
    const border0 = blendHex('#1f2332', preset.uiBorder, 0.50);

    return {
      uiBase: blendHex(base0, preset.uiAccent, t * 0.22),
      uiSurface: blendHex(surface0, preset.uiAccent, t * 0.26),
      modelBubble: blendHex(modelBub0, preset.uiAccent, t * 0.22),
      userBubble: blendHex(userBub0, preset.uiAccent, t * 0.30),
      uiBorder: blendHex(border0, preset.uiAccent, t * 0.42)
    };
  }

  function createDefaultThemeConfig(presetKey = 'purple') {
    const preset = PRESET_PALETTES[presetKey] || PRESET_PALETTES.purple;
    const defaultTint = 15;
    const tinted = computeTintedPalette(preset.id, defaultTint);

    return {
      roleplay: {
        enableAvatarCustom: false,
        enableCustomAvatars: false,
        avatarStyle: 'above',
        showModelAvatar: true,
        showUserAvatar: true,
        modelAvatarUrl: '',
        modelAvatar: '',
        userAvatarUrl: '',
        userAvatar: '',
        avatarSize: 40,
        avatarRadius: 50,
        enableNameCustom: false,
        enableCustomNames: false,
        modelName: 'Model',
        userName: 'User',
        nameSize: 14
      },

      mainInterface: {
        presetKey: preset.id,
        presetId: preset.id,
        uiTint: defaultTint,
        colorTint: defaultTint,
        uiBase: tinted.uiBase,
        uiSurface: tinted.uiSurface,
        uiAccent: preset.uiAccent,
        uiText: preset.uiText,
        uiBorder: tinted.uiBorder,
        pageBg: '',
        bgDim: 60,
        bgBlur: 2,
        enableChatBubbles: true,
        userBubbleEnabled: true,
        enableUserBubble: true,
        modelBubbleEnabled: false,
        enableModelBubble: false,
        bubbleTransparencyEnabled: false,
        enableBubbleTransparency: false,
        userBubbleTransparent: true,
        transparentUserBubble: true,
        modelBubbleTransparent: true,
        transparentModelBubble: true,
        bubbleBlur: 16,
        bubbleOpacity: 82,
        userBubbleColor: tinted.userBubble,
        userBubbleBg: tinted.userBubble,
        modelBubbleColor: tinted.modelBubble,
        modelBubbleBg: tinted.modelBubble,
        transparentUiEnabled: false,
        enableTransparentUI: false,
        uiBlur: 20,
        uiOpacity: 78
      },

      style: {
        stylePreset: 'default',
        ambientEffectEnabled: false
      },

      typography: {
        fontFamily: 'default',
        chatFontSize: 15,
        fontSize: 15,
        customTextColorEnabled: true,
        enableCustomTextColor: true,
        modelTextColor: preset.modelText,
        userTextColor: preset.userText,
        quoteHighlightEnabled: true,
        enableQuoteHighlight: true,
        modelQuoteColor: preset.modelQuote,
        userQuoteColor: preset.userQuote
      }
    };
  }

  const isolatedPreview = (window.location?.protocol === 'chrome-extension:' || window.location?.origin === 'http://127.0.0.1:8766') &&
    /\/account\/theme-preview\.html$/.test(window.location.pathname || '');
  const store = isolatedPreview ? null : window.StudioLabCore?.store;
  const STYLE_KEY = 'slCustomStyles_v2';
  const MAX_STYLE_TEXT = 65536;
  const MAX_THEME_TEXT = 6 * 1024 * 1024;
  const HEX = /^#[0-9a-f]{6}$/i;
  const STYLE_ID = /^custom-[a-z0-9-]{1,60}$/;
  let styles = [];
  let legacyStyles = [];
  let styleGeneration = 0;

  function object(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }
  function number(value, fallback, min, max) {
    return typeof value === 'number' && Number.isFinite(value) ? clampVal(value, min, max) : fallback;
  }
  function color(value, fallback) {
    return typeof value === 'string' && HEX.test(value) ? value.toLowerCase() : fallback;
  }
  function label(value, fallback) {
    if (typeof value !== 'string') return fallback;
    return value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 60) || fallback;
  }
  function flag(value, fallback) {
    return typeof value === 'boolean' ? value : fallback;
  }
  function validImageData(value, kind) {
    if (value === '') return true;
    const limit = kind === 'avatar' ? 512 * 1024 : 2 * 1024 * 1024;
    if (typeof value !== 'string' || value.length > Math.ceil(limit / 3) * 4 + 32) return false;
    const match = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    return Boolean(match && match[1].length % 4 === 0);
  }
  function rawImages(raw) {
    const roleplay = object(raw?.roleplay), main = object(raw?.mainInterface);
    return { modelAvatarUrl: roleplay.modelAvatarUrl || roleplay.modelAvatar || '',
      userAvatarUrl: roleplay.userAvatarUrl || roleplay.userAvatar || '', pageBg: main.pageBg || '' };
  }
  function unsupportedImageFields(raw) {
    const roleplay = object(raw?.roleplay), main = object(raw?.mainInterface);
    return ['modelAvatarUrl', 'modelAvatar', 'userAvatarUrl', 'userAvatar'].some(key =>
      roleplay[key] !== undefined && !validImageData(roleplay[key], 'avatar')) ||
      Boolean(roleplay.modelAvatarUrl && roleplay.modelAvatar && roleplay.modelAvatarUrl !== roleplay.modelAvatar) ||
      Boolean(roleplay.userAvatarUrl && roleplay.userAvatar && roleplay.userAvatarUrl !== roleplay.userAvatar) ||
      (main.pageBg !== undefined && !validImageData(main.pageBg, 'background'));
  }
  function hasUnsupportedThemeData(raw) {
    const id = object(raw?.style).stylePreset;
    return unsupportedImageFields(raw) || Boolean(id && !(typeof id === 'string' &&
        (STYLE_CATALOG.some(item => item.id === id) || ['custom-starlit-snowglass', 'custom-imperial-jade-scroll-novel'].includes(id) || getCustomStyleById(id))));
  }

  // Storage is normalized to a fixed set of data fields. No CSS or remote assets enter the renderer.
  function normalizeThemeConfig(raw = {}) {
    raw = object(raw);
    const r = object(raw.roleplay), m = object(raw.mainInterface);
    const s = object(raw.style), t = object(raw.typography);
    const requestedPreset = m.presetKey || m.presetId;
    const presetKey = Object.hasOwn(PRESET_PALETTES, requestedPreset) ? requestedPreset : 'purple';
    const defaults = createDefaultThemeConfig(presetKey);
    const tint = number(m.uiTint ?? m.colorTint, 15, 0, 100);
    const tinted = computeTintedPalette(presetKey, tint);
    const preset = PRESET_PALETTES[presetKey];
    const roleplay = defaults.roleplay;
    roleplay.enableAvatarCustom = roleplay.enableCustomAvatars = flag(r.enableAvatarCustom ?? r.enableCustomAvatars, false);
    roleplay.showModelAvatar = flag(r.showModelAvatar, true);
    roleplay.showUserAvatar = flag(r.showUserAvatar, true);
    const images = rawImages(raw);
    roleplay.modelAvatarUrl = validImageData(images.modelAvatarUrl, 'avatar') ? images.modelAvatarUrl : '';
    roleplay.userAvatarUrl = validImageData(images.userAvatarUrl, 'avatar') ? images.userAvatarUrl : '';
    roleplay.modelAvatar = roleplay.userAvatar = '';
    roleplay.avatarStyle = 'above';
    roleplay.avatarSize = number(r.avatarSize, 40, 24, 96);
    roleplay.avatarRadius = number(r.avatarRadius, 50, 0, 50);
    roleplay.enableNameCustom = roleplay.enableCustomNames = flag(r.enableNameCustom ?? r.enableCustomNames, false);
    roleplay.modelName = label(r.modelName, 'Model');
    roleplay.userName = label(r.userName, 'User');
    roleplay.nameSize = number(r.nameSize, 14, 11, 28);

    const mainInterface = defaults.mainInterface;
    mainInterface.uiTint = mainInterface.colorTint = tint;
    mainInterface.uiBase = color(m.uiBase, tinted.uiBase);
    mainInterface.uiSurface = color(m.uiSurface, tinted.uiSurface);
    mainInterface.uiAccent = color(m.uiAccent, preset.uiAccent);
    mainInterface.uiText = color(m.uiText, preset.uiText);
    mainInterface.uiBorder = color(m.uiBorder, tinted.uiBorder);
    mainInterface.pageBg = validImageData(images.pageBg, 'background') ? images.pageBg : '';
    mainInterface.bgDim = number(m.bgDim, 60, 0, 95);
    mainInterface.bgBlur = number(m.bgBlur, 2, 0, 24);
    mainInterface.enableChatBubbles = flag(m.enableChatBubbles, true);
    mainInterface.userBubbleEnabled = mainInterface.enableUserBubble = flag(m.userBubbleEnabled ?? m.enableUserBubble, true);
    mainInterface.modelBubbleEnabled = mainInterface.enableModelBubble = flag(m.modelBubbleEnabled ?? m.enableModelBubble, false);
    mainInterface.bubbleTransparencyEnabled = mainInterface.enableBubbleTransparency = flag(m.bubbleTransparencyEnabled ?? m.enableBubbleTransparency, false);
    mainInterface.userBubbleTransparent = mainInterface.transparentUserBubble = flag(m.userBubbleTransparent ?? m.transparentUserBubble, true);
    mainInterface.modelBubbleTransparent = mainInterface.transparentModelBubble = flag(m.modelBubbleTransparent ?? m.transparentModelBubble, true);
    mainInterface.bubbleBlur = number(m.bubbleBlur, 16, 0, 32);
    mainInterface.bubbleOpacity = number(m.bubbleOpacity, 82, 5, 100);
    mainInterface.userBubbleColor = mainInterface.userBubbleBg = color(m.userBubbleColor ?? m.userBubbleBg, tinted.userBubble);
    mainInterface.modelBubbleColor = mainInterface.modelBubbleBg = color(m.modelBubbleColor ?? m.modelBubbleBg, tinted.modelBubble);
    mainInterface.transparentUiEnabled = mainInterface.enableTransparentUI = flag(m.transparentUiEnabled ?? m.enableTransparentUI, false);
    mainInterface.uiBlur = number(m.uiBlur, 20, 0, 40);
    mainInterface.uiOpacity = number(m.uiOpacity, 78, 10, 100);

    const styleId = s.stylePreset ?? s.preset;
    const style = { stylePreset: STYLE_CATALOG.some(item => item.id === styleId) || STYLE_ID.test(styleId || '') ? styleId : 'default',
      ambientEffectEnabled: flag(s.ambientEffectEnabled, false) };
    const typography = defaults.typography;
    const font = FONT_CATALOG.find(item => item.id === t.fontFamily || item.value === t.fontFamily);
    typography.fontFamily = font?.value || 'default';
    typography.chatFontSize = typography.fontSize = number(t.chatFontSize ?? t.fontSize, 15, 12, 24);
    typography.customTextColorEnabled = typography.enableCustomTextColor = flag(t.customTextColorEnabled ?? t.enableCustomTextColor, true);
    typography.modelTextColor = color(t.modelTextColor, preset.modelText);
    typography.userTextColor = color(t.userTextColor, preset.userText);
    typography.quoteHighlightEnabled = typography.enableQuoteHighlight = flag(t.quoteHighlightEnabled ?? t.enableQuoteHighlight, true);
    typography.modelQuoteColor = color(t.modelQuoteColor, preset.modelQuote);
    typography.userQuoteColor = color(t.userQuoteColor, preset.userQuote);
    return { roleplay, mainInterface, style, typography };
  }

  function rgb(hex) { return [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16)); }
  function composite(foreground, opacity, background) {
    return foreground.map((channel, index) => channel * opacity + background[index] * (1 - opacity));
  }
  function luminance(channels) {
    return channels.map(channel => channel / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
      .reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
  }
  function contrast(foreground, background) {
    const a = luminance(foreground), b = luminance(background);
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  }
  function validateThemeContrast(raw) {
    const config = normalizeThemeConfig(raw);
    const m = config.mainInterface, t = config.typography;
    const base = rgb(m.uiBase);
    const alpha = m.transparentUiEnabled ? m.uiOpacity / 100 : m.pageBg ? .88 : 1;
    const pages = [m.pageBg ? '#000000' : '#191919', '#ffffff'].map(canvas => composite(base, alpha, rgb(canvas)));
    const surfaces = pages.map(page => composite(rgb(m.uiSurface), alpha, page));
    const backgrounds = [pages, surfaces];
    const check = (label, colorValue, ranges) => {
      const foreground = rgb(colorValue), level = luminance(foreground);
      const fails = ranges.some(range => {
        const levels = range.map(luminance), low = Math.min(...levels), high = Math.max(...levels);
        return (level >= low && level <= high) || range.some(background => contrast(foreground, background) < 4.5);
      });
      if (fails) {
        throw new Error(`${label} must have at least 4.5:1 contrast against its background. Choose a lighter or darker color, or increase opacity.`);
      }
    };
    check('Interface text', m.uiText, backgrounds);
    check('Accent and links', m.uiAccent, backgrounds);
    const bubbleAlpha = m.bubbleTransparencyEnabled ? m.bubbleOpacity / 100 : 1;
    const bubbleSurfaces = (enabled, transparent, colorValue) => enabled
      ? backgrounds.map(range => range.map(background => composite(rgb(colorValue), transparent ? bubbleAlpha : 1, background))) : backgrounds;
    const user = bubbleSurfaces(m.enableChatBubbles && m.userBubbleEnabled, m.userBubbleTransparent, m.userBubbleColor);
    const model = bubbleSurfaces(m.enableChatBubbles && m.modelBubbleEnabled, m.modelBubbleTransparent, m.modelBubbleColor);
    check('User text', t.customTextColorEnabled ? t.userTextColor : m.uiText, user);
    check('Model text', t.customTextColorEnabled ? t.modelTextColor : m.uiText, model);
    if (t.quoteHighlightEnabled) {
      check('User quote text', t.userQuoteColor, user);
      check('Model quote text', t.modelQuoteColor, model);
    }
    return config;
  }
  async function sanitizeThemeImages(raw) {
    const images = rawImages(raw);
    if (unsupportedImageFields(raw)) {
      throw new Error('This theme contains unsupported or conflicting image data. Export the original and replace it with a local PNG, JPEG or WebP image.');
    }
    const oldStyle = object(raw?.style).stylePreset;
    if (oldStyle && !(typeof oldStyle === 'string' && (STYLE_CATALOG.some(item => item.id === oldStyle) ||
        ['custom-starlit-snowglass', 'custom-imperial-jade-scroll-novel'].includes(oldStyle) || getCustomStyleById(oldStyle)))) {
      throw new Error('This theme uses an unsupported legacy CSS style. Export its original and choose a supported style.');
    }
    const config = normalizeThemeConfig(raw);
    const helper = window.StudioLabThemeImages;
    if (Object.values(images).some(Boolean) && !helper) throw new Error('Local image validation is unavailable.');
    helper?.assertThemeBudget(config);
    if (images.modelAvatarUrl) config.roleplay.modelAvatarUrl = await helper.validateDataUrl(images.modelAvatarUrl, 'avatar');
    if (images.userAvatarUrl) config.roleplay.userAvatarUrl = await helper.validateDataUrl(images.userAvatarUrl, 'avatar');
    if (images.pageBg) config.mainInterface.pageBg = await helper.validateDataUrl(images.pageBg, 'background');
    helper?.assertThemeBudget(config);
    return validateThemeContrast(config);
  }

  function applyUiTintToConfig(config, tintPct) {
    const key = config?.mainInterface?.presetKey || 'purple';
    const tint = number(tintPct, 15, 0, 100);
    const next = computeTintedPalette(key, tint);
    Object.assign(config.mainInterface, { uiTint: tint, colorTint: tint, uiBase: next.uiBase,
      uiSurface: next.uiSurface, uiBorder: next.uiBorder, userBubbleColor: next.userBubble,
      userBubbleBg: next.userBubble, modelBubbleColor: next.modelBubble, modelBubbleBg: next.modelBubble });
    return config;
  }
  function applyPresetToConfig(config, presetKey) {
    if (!Object.hasOwn(PRESET_PALETTES, presetKey)) return config;
    const next = normalizeThemeConfig(config);
    const preset = PRESET_PALETTES[presetKey];
    next.mainInterface.presetKey = next.mainInterface.presetId = presetKey;
    Object.assign(next.mainInterface, { uiAccent: preset.uiAccent, uiText: preset.uiText });
    applyUiTintToConfig(next, next.mainInterface.uiTint);
    Object.assign(next.typography, { modelTextColor: preset.modelText, userTextColor: preset.userText,
      modelQuoteColor: preset.modelQuote, userQuoteColor: preset.userQuote });
    return next;
  }

  function assertThemeConfig(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid theme configuration.');
    const defaults = createDefaultThemeConfig();
    for (const [section, entries] of Object.entries(raw)) {
      if (!Object.hasOwn(defaults, section) || !entries || typeof entries !== 'object' || Array.isArray(entries)) throw new Error('Unsupported theme field.');
      for (const [key, value] of Object.entries(entries)) {
        if (!Object.hasOwn(defaults[section], key) && !(section === 'style' && key === 'preset')) throw new Error('Unsupported theme field.');
        if (['pageBg', 'modelAvatar', 'modelAvatarUrl', 'userAvatar', 'userAvatarUrl'].includes(key) &&
          !validImageData(value, key === 'pageBg' ? 'background' : 'avatar')) throw new Error('Only local PNG, JPEG or WebP image data is supported.');
        if (['uiBase', 'uiSurface', 'uiAccent', 'uiText', 'uiBorder', 'userBubbleColor', 'modelBubbleColor',
          'userBubbleBg', 'modelBubbleBg', 'modelTextColor', 'userTextColor', 'modelQuoteColor', 'userQuoteColor'].includes(key) &&
          (typeof value !== 'string' || !HEX.test(value))) throw new Error('Theme colors must be six-digit HEX values.');
        const expected = defaults[section][key];
        if (expected !== undefined && (typeof value !== typeof expected || (typeof value === 'number' && !Number.isFinite(value)))) throw new Error('Invalid theme value.');
        if (typeof value === 'string' && !['pageBg', 'modelAvatar', 'modelAvatarUrl', 'userAvatar', 'userAvatarUrl'].includes(key) && value.length > 256) throw new Error('Theme value is too long.');
        if (key === 'fontFamily' && !FONT_CATALOG.some(font => font.id === value || font.value === value)) throw new Error('Unsupported font.');
      }
    }
  }
  function parseThemelab(rawText, fallbackName = 'Imported Theme') {
    if (typeof rawText !== 'string' || !rawText.trim() || rawText.length > MAX_THEME_TEXT) throw new Error('Invalid or oversized theme file.');
    const parsed = JSON.parse(rawText);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid theme file.');
    if (parsed.format !== undefined && parsed.format !== 'studiolab-themelab') throw new Error('Unsupported theme format.');
    const node = parsed.theme || parsed;
    const wrapperFields = parsed.theme ? ['format', 'version', 'exportedAt', 'theme']
      : ['format', 'version', 'exportedAt', 'name', 'description', 'config', 'roleplay', 'mainInterface', 'style', 'typography'];
    if (Object.keys(parsed).some(key => !wrapperFields.includes(key))) throw new Error('Unsupported theme file fields.');
    if (!node || typeof node !== 'object' || Array.isArray(node) || (parsed.theme && Object.keys(node).some(key => !['name', 'description', 'config'].includes(key)))) {
      throw new Error('Unsupported theme fields.');
    }
    const config = node.config || Object.fromEntries(['roleplay', 'mainInterface', 'style', 'typography']
      .filter(key => Object.hasOwn(node, key)).map(key => [key, node[key]]));
    if (!Object.keys(config).length) throw new Error('Missing theme configuration.');
    assertThemeConfig(config);
    return { name: label(node.name, label(fallbackName, 'Imported Theme')),
      description: typeof node.description === 'string' ? node.description.slice(0, 500) : '',
      config: validateThemeContrast(config) };
  }
  function serializeThemelab(theme = {}) {
    return JSON.stringify({ format: 'studiolab-themelab', version: '2.2.2', theme: {
      name: label(theme.name, 'Custom Theme'), description: String(theme.description || '').slice(0, 500),
      config: normalizeThemeConfig(theme.config) } }, null, 2);
  }

  const PREVIEW_FIELDS = {
    roleplay: { enableAvatarCustom: 'bool', showModelAvatar: 'bool', showUserAvatar: 'bool', modelAvatarUrl: 'avatar', userAvatarUrl: 'avatar', avatarSize: [24, 96],
      avatarRadius: [0, 50], enableNameCustom: 'bool', modelName: 'name', userName: 'name', nameSize: [11, 28] },
    mainInterface: { uiBase: 'color', uiSurface: 'color', uiAccent: 'color', uiText: 'color', uiBorder: 'color',
      enableChatBubbles: 'bool', userBubbleEnabled: 'bool', modelBubbleEnabled: 'bool', bubbleTransparencyEnabled: 'bool',
      userBubbleTransparent: 'bool', modelBubbleTransparent: 'bool', bubbleBlur: [0, 32], bubbleOpacity: [5, 100],
      userBubbleColor: 'color', modelBubbleColor: 'color', pageBg: 'background', bgDim: [0, 95], bgBlur: [0, 24], transparentUiEnabled: 'bool', uiBlur: [0, 40], uiOpacity: [10, 100] },
    style: { base: 'base', bubbleRadius: [0, 28], buttonRadius: [0, 24], borderWidth: [0, 4], custom: 'bool', ambientEffectEnabled: 'bool' },
    typography: { fontFamily: 'font', chatFontSize: [12, 24], customTextColorEnabled: 'bool', modelTextColor: 'color',
      userTextColor: 'color', quoteHighlightEnabled: 'bool', modelQuoteColor: 'color', userQuoteColor: 'color' }
  };
  function exactFields(value, fields) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).length !== fields.length || fields.some(key => !Object.hasOwn(value, key))) {
      throw new Error('Unsupported preview data.');
    }
  }
  function validateEditorPreview(input) {
    exactFields(input, ['version', ...Object.keys(PREVIEW_FIELDS)]);
    if (input.version !== 1) throw new Error('Unsupported preview version.');
    const clean = { version: 1 };
    for (const [section, rules] of Object.entries(PREVIEW_FIELDS)) {
      const source = input[section];
      exactFields(source, Object.keys(rules));
      clean[section] = {};
      for (const [key, rule] of Object.entries(rules)) {
        const value = source[key];
        const valid = Array.isArray(rule) ? typeof value === 'number' && Number.isFinite(value) && value >= rule[0] && value <= rule[1]
          : rule === 'bool' ? typeof value === 'boolean'
          : rule === 'name' ? typeof value === 'string' && value.length > 0 && value.length <= 60 && !/[\u0000-\u001f\u007f]/.test(value)
          : rule === 'color' ? typeof value === 'string' && HEX.test(value)
          : rule === 'avatar' || rule === 'background' ? validImageData(value, rule)
          : rule === 'font' ? FONT_CATALOG.some(font => font.value === value)
          : rule === 'base' ? ['default', 'cartoon-pixel', 'winter-frost'].includes(value) : false;
        if (!valid) throw new Error('Invalid preview value.');
        clean[section][key] = rule === 'color' ? value.toLowerCase() : value;
      }
    }
    validateThemeContrast(clean);
    window.StudioLabThemeImages?.assertThemeBudget(clean);
    return clean;
  }
  async function sanitizeEditorPreview(value) {
    const clean = validateEditorPreview(value);
    const safe = await sanitizeThemeImages(clean);
    clean.roleplay.modelAvatarUrl = safe.roleplay.modelAvatarUrl;
    clean.roleplay.userAvatarUrl = safe.roleplay.userAvatarUrl;
    clean.mainInterface.pageBg = safe.mainInterface.pageBg;
    return validateEditorPreview(clean);
  }
  function createEditorPreview(raw) {
    const cfg = normalizeThemeConfig(raw);
    const selected = getCustomStyleById(cfg.style.stylePreset);
    const base = selected?.base || (['custom-starlit-snowglass', 'custom-imperial-jade-scroll-novel'].includes(cfg.style.stylePreset)
      ? 'winter-frost' : STYLE_CATALOG.some(item => item.id === cfg.style.stylePreset) ? cfg.style.stylePreset : 'default');
    const shape = selected || (base === 'cartoon-pixel' ? { bubbleRadius: 0, buttonRadius: 0, borderWidth: 2 }
      : base === 'winter-frost' ? { bubbleRadius: 18, buttonRadius: 12, borderWidth: 1 }
        : { bubbleRadius: 24, buttonRadius: 12, borderWidth: 0 });
    const values = { ...cfg, style: { base, bubbleRadius: shape.bubbleRadius, buttonRadius: shape.buttonRadius,
      borderWidth: shape.borderWidth, custom: Boolean(selected), ambientEffectEnabled: cfg.style.ambientEffectEnabled } };
    const out = { version: 1 };
    for (const [section, fields] of Object.entries(PREVIEW_FIELDS)) {
      out[section] = Object.fromEntries(Object.keys(fields).map(key => [key, values[section][key]]));
    }
    return validateEditorPreview(out);
  }

  function normalizeStyle(value) {
    const raw = value?.style || value;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid style file.');
    const allowed = ['id', 'name', 'description', 'base', 'bubbleRadius', 'buttonRadius', 'borderWidth'];
    if (Object.keys(raw).some(key => !allowed.includes(key))) throw new Error('This style contains unsupported fields or CSS.');
    const name = label(raw.name, '');
    if (!name) throw new Error('A style name is required.');
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'style';
    const id = raw.id === undefined ? `custom-${slug}` : raw.id;
    if (typeof id !== 'string' || !STYLE_ID.test(id)) throw new Error('Invalid style ID.');
    if (!['default', 'cartoon-pixel', 'winter-frost'].includes(raw.base)) throw new Error('Invalid base style.');
    for (const [key, max] of [['bubbleRadius', 28], ['buttonRadius', 24], ['borderWidth', 4]]) {
      if (!Number.isInteger(raw[key]) || raw[key] < 0 || raw[key] > max) throw new Error(`Invalid ${key}.`);
    }
    if (raw.description !== undefined && (typeof raw.description !== 'string' || raw.description.length > 500)) throw new Error('Invalid description.');
    return { id, name, description: String(raw.description || '').trim(), base: raw.base,
      bubbleRadius: raw.bubbleRadius, buttonRadius: raw.buttonRadius, borderWidth: raw.borderWidth };
  }
  function parseStyleLab(text) {
    if (typeof text !== 'string' || !text.trim() || text.length > MAX_STYLE_TEXT) throw new Error('Invalid or oversized style file.');
    const parsed = JSON.parse(text);
    if (parsed?.format !== 'studiolab-stylelab' || parsed.version !== 2) throw new Error('Older CSS-based styles cannot be applied safely. Keep the original file and import a declarative StyleLab version 2 style.');
    if (Object.keys(parsed).some(key => !['format', 'version', 'style'].includes(key))) throw new Error('Unsupported style file fields.');
    return normalizeStyle(parsed.style);
  }
  function serializeStyleLab(style) {
    return JSON.stringify({ format: 'studiolab-stylelab', version: 2, style: normalizeStyle(style) }, null, 2);
  }
  function notifyStyles() { window.dispatchEvent(new CustomEvent('sl-custom-styles-changed')); }
  async function persistStyles(next) {
    styleGeneration++;
    if (store) await store.set({ [STYLE_KEY]: next });
    styles = next;
    notifyStyles();
  }
  async function saveCustomStyle(raw) {
    const item = typeof raw === 'string' ? parseStyleLab(raw) : normalizeStyle(raw);
    const index = styles.findIndex(style => style.id === item.id);
    if (index >= 0) throw new Error('A style with this name already exists.');
    if (styles.length >= 100) throw new Error('The style list is full.');
    await persistStyles([...styles, item]);
    return item;
  }
  async function deleteCustomStyle(id) {
    const next = styles.filter(style => style.id !== id);
    if (next.length === styles.length) return false;
    await persistStyles(next); return true;
  }
  const getCustomStyles = () => styles.slice();
  const getCustomStyleById = id => styles.find(style => style.id === id) || null;
  const getLegacyStyles = () => legacyStyles.map((item, index) => ({ index, name: label(item?.name, `Legacy style ${index + 1}`), id: String(item?.id || '') }));
  function serializeLegacyStyle(index) {
    if (!Number.isInteger(index) || index < 0 || index >= legacyStyles.length) throw new Error('Legacy style is unavailable.');
    return JSON.stringify({ format: 'studiolab-stylelab', version: '1.0', style: legacyStyles[index] }, null, 2);
  }
  function readStyles(items) {
    if (!Array.isArray(items)) return [];
    return items.slice(0, 100).flatMap(item => { try { return [normalizeStyle(item)]; } catch (_) { return []; } });
  }
  if (store) {
    const lifetime = window.StudioLabCore.scope();
    const generation = styleGeneration;
    store.get(STYLE_KEY, []).then(items => {
      if (generation !== styleGeneration || !Array.isArray(items)) return;
      styles = readStyles(items);
      notifyStyles();
    }).catch(() => {});
    store.get('slCustomStyles_v1', []).then(items => {
      if (!Array.isArray(items) || lifetime.disposed) return;
      legacyStyles = items.filter(item => item && typeof item === 'object' &&
        !['cartoon-pixel', 'winter-frost', 'custom-starlit-snowglass', 'custom-imperial-jade-scroll-novel'].includes(item.id));
    }).catch(() => {});
    lifetime.add(store.onChange((changes, area) => {
      if (area !== 'local' || !Object.hasOwn(changes, STYLE_KEY)) return;
      styleGeneration++;
      styles = readStyles(changes[STYLE_KEY].newValue);
      notifyStyles();
    }));
    lifetime.add(window.StudioLab.onExtensionInvalidated(() => { styleGeneration++; lifetime.dispose(); }));
  }
  window.StudioLab.themePresets = { PRESET_PALETTES, FONT_CATALOG, FONT_OPTIONS: FONT_CATALOG, STYLE_CATALOG,
    computeTintedPalette, createDefaultThemeConfig, normalizeThemeConfig, validateThemeContrast, sanitizeThemeImages, hasUnsupportedThemeData, applyUiTintToConfig, applyPresetToConfig,
    parseThemelab, serializeThemelab, createEditorPreview, validateEditorPreview, sanitizeEditorPreview, getCustomStyles, getCustomStyleById,
    getLegacyStyles, serializeLegacyStyle,
    getAllStyles: () => [...STYLE_CATALOG, ...styles], parseStyleLab, serializeStyleLab, saveCustomStyle, deleteCustomStyle };
})();

