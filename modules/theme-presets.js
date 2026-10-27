// Modular preset color palettes (25 themes from Dark to Light), font catalog,
// and default 4-tab configuration schema for Studio.lab Custom Theme Editor.
(function () {
  'use strict';

  if (!window.StudioLab) window.StudioLab = {};

  // Exact 25 preset palettes (15 Dark + 10 Light) engineered with studio-grade tonal hierarchy,
  // low-saturation architectural bases, crisp high-legibility typography, and harmonious accents.
  const PRESET_PALETTES = {
    // 15 Dark Themes
    purple: {
      id: 'purple', group: 'dark', label: 'Aistu Purple',
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

    // 10 Light Themes
    lightsnow: {
      id: 'lightsnow', group: 'light', label: 'Light Snow',
      uiBase: '#f4f6fa', uiSurface: '#ffffff', uiAccent: '#6366f1', uiText: '#0f172a', uiBorder: '#dce2ec',
      modelBubble: '#ffffff', userBubble: '#eef2ff',
      modelText: '#1e293b', userText: '#1e1b4b',
      modelQuote: '#b45309', userQuote: '#4f46e5'
    },
    mintfresh: {
      id: 'mintfresh', group: 'light', label: 'Mint Fresh',
      uiBase: '#f2f7f5', uiSurface: '#ffffff', uiAccent: '#0d9488', uiText: '#11221d', uiBorder: '#d3e3dd',
      modelBubble: '#ffffff', userBubble: '#e6f4f1',
      modelText: '#162c25', userText: '#113028',
      modelQuote: '#0f766e', userQuote: '#047857'
    },
    peachsoft: {
      id: 'peachsoft', group: 'light', label: 'Peach Soft',
      uiBase: '#faf5f0', uiSurface: '#ffffff', uiAccent: '#ea580c', uiText: '#241712', uiBorder: '#eadbd0',
      modelBubble: '#ffffff', userBubble: '#faeee5',
      modelText: '#2c1c16', userText: '#3b1f14',
      modelQuote: '#c2410c', userQuote: '#b45309'
    },
    celesteblue: {
      id: 'celesteblue', group: 'light', label: 'Celeste Blue',
      uiBase: '#f2f6fa', uiSurface: '#ffffff', uiAccent: '#0284c7', uiText: '#0f2030', uiBorder: '#d5e2ee',
      modelBubble: '#ffffff', userBubble: '#e6f1fa',
      modelText: '#162a3d', userText: '#0c2e4a',
      modelQuote: '#0369a1', userQuote: '#1d4ed8'
    },
    sakurablossom: {
      id: 'sakurablossom', group: 'light', label: 'Sakura Blossom',
      uiBase: '#faf4f6', uiSurface: '#ffffff', uiAccent: '#e11d48', uiText: '#261319', uiBorder: '#ebd8de',
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
      uiBase: '#faf7f0', uiSurface: '#ffffff', uiAccent: '#d97706', uiText: '#241e14', uiBorder: '#e8dfd0',
      modelBubble: '#ffffff', userBubble: '#f7efe0',
      modelText: '#2b2317', userText: '#3b2b14',
      modelQuote: '#b45309', userQuote: '#92400e'
    },
    oceanpearl: {
      id: 'oceanpearl', group: 'light', label: 'Ocean Pearl',
      uiBase: '#f2f7f8', uiSurface: '#ffffff', uiAccent: '#0891b2', uiText: '#112329', uiBorder: '#d3e3e7',
      modelBubble: '#ffffff', userBubble: '#e5f3f6',
      modelText: '#162d34', userText: '#0f2e38',
      modelQuote: '#0e7490', userQuote: '#0369a1'
    },
    matchacream: {
      id: 'matchacream', group: 'light', label: 'Matcha Cream',
      uiBase: '#f5f7f2', uiSurface: '#ffffff', uiAccent: '#4d7c0f', uiText: '#192214', uiBorder: '#dce3d3',
      modelBubble: '#ffffff', userBubble: '#ebf1e2',
      modelText: '#202b19', userText: '#1e2e14',
      modelQuote: '#3f6212', userQuote: '#15803d'
    },
    sweetamber: {
      id: 'sweetamber', group: 'light', label: 'Sweet Amber',
      uiBase: '#faf6f0', uiSurface: '#ffffff', uiAccent: '#c2410c', uiText: '#261a12', uiBorder: '#e8ddd0',
      modelBubble: '#ffffff', userBubble: '#f7ece0',
      modelText: '#2e2016', userText: '#3d2414',
      modelQuote: '#9a3412', userQuote: '#b45309'
    }
  };

  const FONT_CATALOG = [
    { value: 'default', id: 'default', css: '', label: 'System Default (Google Sans / Inter)' },
    { value: "'Be Vietnam Pro', sans-serif", id: 'be-vietnam-pro', css: "'Be Vietnam Pro', sans-serif", label: 'Be Vietnam Pro (Hiện đại / Rõ nét)' },
    { value: "'Inter', sans-serif", id: 'inter', css: "'Inter', sans-serif", label: 'Inter (Chuẩn UI)' },
    { value: "'Plus Jakarta Sans', sans-serif", id: 'plus-jakarta', css: "'Plus Jakarta Sans', sans-serif", label: 'Plus Jakarta Sans (Thanh lịch)' },
    { value: "'Nunito', sans-serif", id: 'nunito', css: "'Nunito', sans-serif", label: 'Nunito (Bo tròn mềm mại)' },
    { value: "'Quicksand', sans-serif", id: 'quicksand', css: "'Quicksand', sans-serif", label: 'Quicksand (Nhẹ nhàng)' },
    { value: "'Lora', serif", id: 'lora', css: "'Lora', serif", label: 'Lora (Tiểu thuyết / Văn học)' },
    { value: "'Merriweather', serif", id: 'merriweather', css: "'Merriweather', serif", label: 'Merriweather (Sách in cổ điển)' },
    { value: "'Playfair Display', serif", id: 'playfair', css: "'Playfair Display', serif", label: 'Playfair Display (Nghệ thuật)' },
    { value: "'JetBrains Mono', monospace", id: 'jetbrains-mono', css: "'JetBrains Mono', monospace", label: 'JetBrains Mono (Lập trình / Sci-Fi)' }
  ];

  const STYLE_CATALOG = [
    {
      id: 'default',
      labelKey: 'te_style_default_title',
      descKey: 'te_style_default_desc',
      badgeKey: 'te_style_default_badge'
    },
    {
      id: 'cartoon-pixel',
      labelKey: 'te_style_pixel_title',
      descKey: 'te_style_pixel_desc',
      badgeKey: 'te_style_pixel_badge'
    }
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

  /**
   * Computes tinted UI surface, base, border, and bubble colors from a preset palette
   * and a UI Color Tint percentage (0% to 100%, default 15%).
   * - Light themes: 0% starts from crisp pure white/alabaster; dragging right smoothly tints
   *   surfaces toward a soft, soothing pastel hue of the chosen theme's accent.
   * - Dark themes: 0% starts from deep neutral obsidian; dragging right gently brightens and
   *   shifts surfaces harmoniously toward the chosen theme's accent color.
   */
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

    // Dark theme tint progression: 0% is deep dark neutral; 15% matches curated dark preset;
    // higher % gently brightens and infuses the dark surfaces with a soothing accent glow.
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
      // Tab 1: Roleplay
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

      // Tab 2: Main Interface
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

      // Tab 3: Style (1-click curated geometry preset + optional ambient falling effect toggle)
      style: {
        stylePreset: 'default',
        ambientEffectEnabled: true
      },

      // Tab 4: Typography & Text (Custom Text Color & Quote Highlight enabled by default)
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

  function normalizeThemeConfig(raw = {}) {
    const rawPreset = raw?.mainInterface?.presetKey || raw?.mainInterface?.presetId;
    const presetKey = rawPreset && PRESET_PALETTES[rawPreset] ? rawPreset : 'purple';
    const preset = PRESET_PALETTES[presetKey] || PRESET_PALETTES.purple;
    const defaults = createDefaultThemeConfig(presetKey);

    const rpRaw = raw.roleplay || {};
    const miRaw = raw.mainInterface || {};
    const stRaw = raw.style || {};
    const tyRaw = raw.typography || {};

    const rp = Object.assign({}, defaults.roleplay, rpRaw);
    const mi = Object.assign({}, defaults.mainInterface, miRaw);
    const st = {
      stylePreset: 'default',
      ambientEffectEnabled: stRaw.ambientEffectEnabled !== false
    };
    const ty = Object.assign({}, defaults.typography, tyRaw);

    // Sync Roleplay canonical & alias keys
    const avatarMaster = Boolean(rpRaw.enableAvatarCustom ?? rpRaw.enableCustomAvatars ?? false);
    rp.enableAvatarCustom = avatarMaster;
    rp.enableCustomAvatars = avatarMaster;
    rp.avatarStyle = 'above';
    rp.showModelAvatar = rp.showModelAvatar !== false;
    rp.showUserAvatar = rp.showUserAvatar !== false;

    const modelAv = String(rpRaw.modelAvatarUrl ?? rpRaw.modelAvatar ?? '');
    rp.modelAvatarUrl = modelAv;
    rp.modelAvatar = modelAv;

    const userAv = String(rpRaw.userAvatarUrl ?? rpRaw.userAvatar ?? '');
    rp.userAvatarUrl = userAv;
    rp.userAvatar = userAv;

    rp.avatarSize = Math.min(96, Math.max(24, Number(rp.avatarSize) || 40));
    rp.avatarRadius = Math.min(50, Math.max(0, Number(rp.avatarRadius ?? 50)));

    const nameMaster = Boolean(rpRaw.enableNameCustom ?? rpRaw.enableCustomNames ?? false);
    rp.enableNameCustom = nameMaster;
    rp.enableCustomNames = nameMaster;
    rp.modelName = String(rp.modelName ?? 'Model').trim() || 'Model';
    rp.userName = String(rp.userName ?? 'User').trim() || 'User';
    rp.nameSize = Math.min(28, Math.max(11, Number(rp.nameSize) || 14));

    // Sync Main Interface canonical & alias keys
    mi.presetKey = presetKey;
    mi.presetId = presetKey;
    const tintVal = clampVal(miRaw.uiTint ?? miRaw.colorTint ?? 15, 0, 100);
    mi.uiTint = tintVal;
    mi.colorTint = tintVal;
    const tinted = computeTintedPalette(presetKey, tintVal);

    mi.uiBase = String(tinted.uiBase);
    mi.uiSurface = String(tinted.uiSurface);
    mi.uiAccent = String(preset.uiAccent);
    mi.uiText = String(preset.uiText);
    mi.uiBorder = String(tinted.uiBorder);
    mi.pageBg = String(mi.pageBg || '');
    mi.bgDim = Math.min(95, Math.max(0, Number(mi.bgDim ?? 60)));
    mi.bgBlur = Math.min(24, Math.max(0, Number(mi.bgBlur ?? 2)));

    mi.enableChatBubbles = mi.enableChatBubbles !== false;

    const userBubOn = (miRaw.userBubbleEnabled ?? miRaw.enableUserBubble) !== false;
    mi.userBubbleEnabled = userBubOn;
    mi.enableUserBubble = userBubOn;

    const modelBubOn = Boolean(miRaw.modelBubbleEnabled ?? miRaw.enableModelBubble ?? false);
    mi.modelBubbleEnabled = modelBubOn;
    mi.enableModelBubble = modelBubOn;

    const bubTrans = Boolean(miRaw.bubbleTransparencyEnabled ?? miRaw.enableBubbleTransparency ?? false);
    mi.bubbleTransparencyEnabled = bubTrans;
    mi.enableBubbleTransparency = bubTrans;

    const userBubTrans = (miRaw.userBubbleTransparent ?? miRaw.transparentUserBubble) !== false;
    mi.userBubbleTransparent = userBubTrans;
    mi.transparentUserBubble = userBubTrans;

    const modelBubTrans = (miRaw.modelBubbleTransparent ?? miRaw.transparentModelBubble) !== false;
    mi.modelBubbleTransparent = modelBubTrans;
    mi.transparentModelBubble = modelBubTrans;

    mi.bubbleBlur = Math.min(32, Math.max(0, Number(mi.bubbleBlur ?? 16)));
    mi.bubbleOpacity = Math.min(100, Math.max(5, Number(mi.bubbleOpacity ?? 82)));

    const userBubColor = String(miRaw.userBubbleColor ?? miRaw.userBubbleBg ?? tinted.userBubble);
    mi.userBubbleColor = userBubColor;
    mi.userBubbleBg = userBubColor;

    const modelBubColor = String(miRaw.modelBubbleColor ?? miRaw.modelBubbleBg ?? tinted.modelBubble);
    mi.modelBubbleColor = modelBubColor;
    mi.modelBubbleBg = modelBubColor;

    const uiTrans = Boolean(miRaw.transparentUiEnabled ?? miRaw.enableTransparentUI ?? false);
    mi.transparentUiEnabled = uiTrans;
    mi.enableTransparentUI = uiTrans;
    mi.uiBlur = Math.min(40, Math.max(0, Number(mi.uiBlur ?? 20)));
    mi.uiOpacity = Math.min(100, Math.max(10, Number(mi.uiOpacity ?? 78)));

    // Sync Style canonical key (supports built-in presets + official/persisted .stylelab custom styles)
    const allKnownStyleIds = getAllStyles().map(s => s.id);
    let rawStylePreset = String(stRaw.stylePreset ?? stRaw.preset ?? 'default').trim();
    if (rawStylePreset === 'custom-imperial-jade-scroll-novel' || rawStylePreset === 'winter-frost') {
      rawStylePreset = 'custom-starlit-snowglass';
    }
    const isAllowedStyle = allKnownStyleIds.includes(rawStylePreset) || rawStylePreset.startsWith('custom-');
    st.stylePreset = isAllowedStyle ? rawStylePreset : 'default';
    st.ambientEffectEnabled = stRaw.ambientEffectEnabled !== false;

    // Sync Typography canonical & alias keys (default ON when creating a new theme)
    ty.fontFamily = String(ty.fontFamily || 'default');
    const fSize = Math.min(24, Math.max(12, Number(tyRaw.chatFontSize ?? tyRaw.fontSize ?? 15)));
    ty.chatFontSize = fSize;
    ty.fontSize = fSize;

    const customTxt = Boolean(tyRaw.customTextColorEnabled ?? tyRaw.enableCustomTextColor ?? true);
    ty.customTextColorEnabled = customTxt;
    ty.enableCustomTextColor = customTxt;
    ty.modelTextColor = String(ty.modelTextColor || preset.modelText);
    ty.userTextColor = String(ty.userTextColor || preset.userText);

    const quoteOn = Boolean(tyRaw.quoteHighlightEnabled ?? tyRaw.enableQuoteHighlight ?? true);
    ty.quoteHighlightEnabled = quoteOn;
    ty.enableQuoteHighlight = quoteOn;
    ty.modelQuoteColor = String(ty.modelQuoteColor || preset.modelQuote);
    ty.userQuoteColor = String(ty.userQuoteColor || preset.userQuote);

    return {
      roleplay: rp,
      mainInterface: mi,
      style: st,
      typography: ty
    };
  }

  function applyUiTintToConfig(config, tintPct) {
    if (!config) return config;
    const presetKey = config?.mainInterface?.presetKey || config?.mainInterface?.presetId || 'purple';
    const preset = PRESET_PALETTES[presetKey] || PRESET_PALETTES.purple;
    const pct = clampVal(tintPct ?? config?.mainInterface?.uiTint ?? 15, 0, 100);
    const tinted = computeTintedPalette(preset.id, pct);

    config.mainInterface = config.mainInterface || {};
    config.mainInterface.uiTint = pct;
    config.mainInterface.colorTint = pct;
    config.mainInterface.uiBase = tinted.uiBase;
    config.mainInterface.uiSurface = tinted.uiSurface;
    config.mainInterface.uiBorder = tinted.uiBorder;
    config.mainInterface.userBubbleColor = tinted.userBubble;
    config.mainInterface.userBubbleBg = tinted.userBubble;
    config.mainInterface.modelBubbleColor = tinted.modelBubble;
    config.mainInterface.modelBubbleBg = tinted.modelBubble;
    return config;
  }

  function applyPresetToConfig(config, presetKey) {
    const preset = PRESET_PALETTES[presetKey];
    if (!preset || !config) return config;
    const next = normalizeThemeConfig(config);
    const tintPct = clampVal(next.mainInterface.uiTint ?? next.mainInterface.colorTint ?? 15, 0, 100);
    const tinted = computeTintedPalette(preset.id, tintPct);

    next.mainInterface.presetKey = preset.id;
    next.mainInterface.presetId = preset.id;
    next.mainInterface.uiTint = tintPct;
    next.mainInterface.colorTint = tintPct;
    next.mainInterface.uiBase = tinted.uiBase;
    next.mainInterface.uiSurface = tinted.uiSurface;
    next.mainInterface.uiAccent = preset.uiAccent;
    next.mainInterface.uiText = preset.uiText;
    next.mainInterface.uiBorder = tinted.uiBorder;
    next.mainInterface.userBubbleColor = tinted.userBubble;
    next.mainInterface.userBubbleBg = tinted.userBubble;
    next.mainInterface.modelBubbleColor = tinted.modelBubble;
    next.mainInterface.modelBubbleBg = tinted.modelBubble;

    // Sync typography colors with the chosen preset palette
    next.typography.modelTextColor = preset.modelText;
    next.typography.userTextColor = preset.userText;
    next.typography.modelQuoteColor = preset.modelQuote;
    next.typography.userQuoteColor = preset.userQuote;
    return next;
  }

  function serializeThemelab(themeObj = {}) {
    const name = String(themeObj.name || 'Custom Theme').trim() || 'Custom Theme';
    const description = String(themeObj.description || '').trim();
    const config = normalizeThemeConfig(themeObj.config || {});
    const payload = {
      format: 'studiolab-themelab',
      version: '2.2.2',
      exportedAt: new Date().toISOString(),
      theme: {
        name,
        description,
        config
      }
    };
    return JSON.stringify(payload, null, 2);
  }

  function parseThemelab(rawText, fallbackName = 'Imported Theme') {
    const cleanText = String(rawText || '').trim();
    if (!cleanText) {
      throw new Error('Empty .themelab file');
    }
    let parsed;
    try {
      parsed = JSON.parse(cleanText);
    } catch (_) {
      throw new Error('Invalid JSON in .themelab file');
    }
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Malformed .themelab structure');
    }
    const themeNode = (parsed.format === 'studiolab-themelab' && parsed.theme && typeof parsed.theme === 'object')
      ? parsed.theme
      : (parsed.theme && typeof parsed.theme === 'object' ? parsed.theme : parsed);

    const rawConfig = themeNode.config && typeof themeNode.config === 'object'
      ? themeNode.config
      : (themeNode.mainInterface || themeNode.roleplay || themeNode.style || themeNode.typography ? themeNode : null);

    if (!rawConfig) {
      throw new Error('Missing theme configuration in .themelab file');
    }

    const name = String(themeNode.name || fallbackName || 'Imported Theme').trim() || 'Imported Theme';
    const description = String(themeNode.description || '').trim();
    const config = normalizeThemeConfig(rawConfig);
    return { name, description, config };
  }

  // ============================================================================
  // CUSTOM STYLELAB (.stylelab) ENGINE — PERSISTENT STORAGE, PARSER & AI BUILDER
  // ============================================================================
  const CUSTOM_STYLES_STORAGE_KEY = 'slCustomStyles_v1';
  const REMOVED_LEGACY_STYLE_IDS = new Set(['custom-imperial-jade-scroll-novel', 'winter-frost']);
  let customStylesCache = [];

  function sanitizeStyleId(rawId, fallbackName = '') {
    const base = String(rawId || fallbackName || 'style')
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'style';
    if (base === 'default' || base === 'cartoon-pixel') {
      return `custom-${base}`;
    }
    if (base === 'winter-frost') {
      return 'custom-starlit-snowglass';
    }
    return base.startsWith('custom-') ? base : `custom-${base}`;
  }

  const DEFAULT_CUSTOM_STYLES = [
    {
      id: 'custom-starlit-snowglass',
      isCustomStyleLab: true,
      isOfficial: true,
      name: 'Tinh Hà Băng Tuyết',
      badge: 'STARLIT FROST',
      icon: '❄️',
      description: 'Viền băng lấp lánh tĩnh, mái tuyết 3 mảnh ôm khít 2 đầu mút, người tuyết đội mũ đứng lún nhẹ trên tuyết, pha lê và sao nhỏ rủ xuống. Mặt kính sáng nhẹ từ mép trên xuống đồng bộ với 2 thanh Sidebar, Avatar 1 viền gọn gàng.',
      preview: {
        avatarCSS: 'position: relative; border-radius: 11px; border: 1.5px solid {{frostBorder}}; outline: none; box-shadow: 0 0 8px {{accentGlow}};',
        avatarRadius: '12px',
        bubbleBorder: '2px solid var(--sl-style-prev-accent)',
        bubbleRadius: '14px',
        bubbleShadow: '0 4px 10px rgba(0,0,0,0.22)',
        containerCSS: 'position: relative; isolation: isolate; overflow: visible; border-radius: 18px; border: 1px solid {{frostBorder}}; background-color: {{uiSurfaceBg}}; background-image: linear-gradient(180deg, {{frostGlow}} 0%, transparent 36%); padding: 16px 12px 12px; box-shadow: inset 0 1px 0 {{frostRim}}, 0 0 5px {{accentGlow}}, 0 0 12px {{accentSoft}}; {{uiBackdropCSS}}',
        decorBadge: '❄',
        modelBubbleAfterCSS: "content: ''; position: absolute; pointer-events: none; z-index: 2; background: var(--sl-ice-mascot) center / contain no-repeat; filter: drop-shadow(0 0 3px {{accentGlow}}); top: -41px; right: 5px; width: 46px; height: 45px;",
        modelBubbleBeforeCSS: "content: ''; position: absolute; pointer-events: none; z-index: 1; inset: -9px -3px -8px; background-image: var(--sl-ice-cap-left), var(--sl-ice-cap-right), var(--sl-ice-cap-mid), var(--sl-ice-flakes), var(--sl-ice-flakes); background-position: left top, right top, left 17px top, left bottom, right bottom; background-size: 18px 23px, 21px 23px, calc(100% - 37px) 23px, 17px 20px, 24px 27px; background-repeat: no-repeat;",
        modelBubbleCSS: 'position: relative; isolation: isolate; overflow: visible; min-width: 0; border: 1.5px solid {{frostBorder}}; color: {{uiText}}; border-radius: 19px 19px 17px 17px; background-color: {{modelBubbleFinalBg}}; background-image: linear-gradient(180deg, {{frostGlow}} 0%, transparent 36%); box-shadow: inset 0 1px 0 {{frostRim}}, 0 0 5px {{accentGlow}}, 0 0 12px {{accentSoft}}; padding: 15px 13px 12px; margin-top: 30px; margin-bottom: 12px; line-height: 1.5;',
        modelSampleText: 'Chào bạn! Mình có thể giúp gì cho bạn hôm nay?',
        previewCSS: 'position: relative; overflow: visible; border-radius: 20px; border: 1px solid {{uiBorder}}; color: {{uiText}}; background-color: {{uiSurfaceBg}}; box-shadow: 0 6px 18px -10px {{shadowColor}};',
        userBubbleAfterCSS: "content: ''; position: absolute; pointer-events: none; z-index: 2; background: var(--sl-ice-mascot) center / contain no-repeat; filter: drop-shadow(0 0 3px {{accentGlow}}); top: -35px; right: 2px; width: 39px; height: 38px;",
        userBubbleBeforeCSS: "content: ''; position: absolute; pointer-events: none; z-index: 1; inset: -8px -3px -6px; background-image: var(--sl-ice-cap-left), var(--sl-ice-cap-right), var(--sl-ice-cap-mid), var(--sl-ice-flakes); background-position: left top, right top, left 15px top, right bottom; background-size: 16px 21px, 19px 21px, calc(100% - 33px) 21px, 21px 24px; background-repeat: no-repeat;",
        userBubbleCSS: 'position: relative; isolation: isolate; overflow: visible; min-width: 0; border: 1.5px solid {{frostBorder}}; color: {{uiText}}; border-radius: 16px 17px 15px 16px; background-color: {{userBubbleFinalBg}}; background-image: linear-gradient(180deg, {{frostGlow}} 0%, transparent 36%); box-shadow: inset 0 1px 0 {{frostRim}}, 0 0 5px {{accentGlow}}, 0 0 12px {{accentSoft}}; padding: 13px 12px 10px; margin-top: 26px; margin-bottom: 12px;',
        userSampleText: 'Lô'
      },
      regions: {
        userBubble: {
          afterCSS: "content: ''; position: absolute; pointer-events: none; z-index: 2; background: var(--sl-ice-mascot) center / contain no-repeat; filter: drop-shadow(0 0 3px {{accentGlow}}); top: -55px; right: 3px; width: 59px; height: 57px;",
          beforeCSS: "content: ''; position: absolute; pointer-events: none; z-index: 1; background-repeat: no-repeat; inset: -11px -4px -19px; background-image: var(--sl-ice-cap-left), var(--sl-ice-cap-right), var(--sl-ice-cap-mid), var(--sl-ice-crystal), var(--sl-ice-flakes), var(--sl-ice-pendant), var(--sl-ice-hem); background-position: left top, right top, left 24px top, left bottom 13px, right bottom 11px, right 10px bottom, center bottom 17px; background-size: 25px 29px, 30px 29px, calc(100% - 53px) 29px, 19px 36px, 29px 32px, 13px 34px, 100% 22px;",
          css: 'position: relative; isolation: isolate; overflow: visible; min-width: 0; max-width: 100%; box-sizing: border-box; border: 1.5px solid {{frostBorder}}; color: {{uiText}}; min-inline-size: 82px; border-radius: 27px 29px 26px 29px / 29px 26px 31px 25px; background-color: {{userBubbleFinalBg}}; background-image: linear-gradient(180deg, {{frostGlow}} 0%, transparent 36%); box-shadow: inset 0 1.5px 0 {{frostRim}}, inset 0 0 0 1px {{accentSoft}}, 0 0 7px {{accentGlow}}, 0 8px 22px -12px {{shadowColor}}; padding: 23px 21px 21px; margin-top: 48px; margin-bottom: 20px; line-height: 1.65; overflow-wrap: anywhere; {{uiBackdropCSS}}'
        },
        modelBubble: {
          afterCSS: "content: ''; position: absolute; pointer-events: none; z-index: 2; background: var(--sl-ice-mascot) center / contain no-repeat; filter: drop-shadow(0 0 3px {{accentGlow}}); top: -72px; right: 9px; width: 80px; height: 77px;",
          beforeCSS: "content: ''; position: absolute; pointer-events: none; z-index: 1; background-repeat: no-repeat; inset: -15px -5px -28px; background-image: var(--sl-ice-cap-left), var(--sl-ice-cap-right), var(--sl-ice-cap-mid), var(--sl-ice-crystal), var(--sl-ice-flakes), var(--sl-ice-pendant), var(--sl-ice-hem); background-position: left top, right top, left 32px top, left bottom 20px, right bottom 17px, 68% bottom, center bottom 26px; background-size: 33px 39px, 40px 39px, calc(100% - 71px) 39px, 31px 58px, 47px 49px, 19px 47px, 100% 31px;",
          css: 'position: relative; isolation: isolate; overflow: visible; min-width: 0; max-width: 100%; box-sizing: border-box; border: 1.5px solid {{frostBorder}}; color: {{uiText}}; border-radius: 34px 34px 30px 30px / 31px 32px 34px 30px; background-color: {{modelBubbleFinalBg}}; background-image: linear-gradient(180deg, {{frostGlow}} 0%, transparent 36%); box-shadow: inset 0 1.5px 0 {{frostRim}}, inset 0 0 0 1px {{accentSoft}}, 0 0 7px {{accentGlow}}, 0 8px 22px -12px {{shadowColor}}; padding: 28px 25px 25px; margin-top: 56px; margin-bottom: 25px; line-height: 1.65; overflow-wrap: anywhere; {{uiBackdropCSS}}'
        },
        avatar: {
          afterCSS: '',
          beforeCSS: "content: ''; position: absolute; pointer-events: none; z-index: 1; background-repeat: no-repeat; inset: -7px; background-image: var(--sl-ice-flakes), var(--sl-ice-flakes); background-position: left bottom, right top; background-size: 23px 23px, 19px 19px;",
          css: 'position: relative; isolation: isolate; overflow: visible; border-radius: 19px; border: 1.5px solid {{frostBorder}}; outline: none; background-color: {{uiSurfaceBg}}; box-shadow: inset 0 1px 0 {{frostRim}}, 0 0 6px {{accentGlow}}, 0 5px 14px -6px {{shadowColor}};'
        },
        nameplate: {
          afterCSS: "content: ''; position: absolute; pointer-events: none; z-index: 1; background-repeat: no-repeat; right: -8px; top: -6px; width: 20px; height: calc(100% + 23px); background-image: var(--sl-ice-flakes), var(--sl-ice-pendant); background-position: right top, right bottom; background-size: 17px 17px, 12px 28px;",
          beforeCSS: "content: ''; display: inline-block; vertical-align: -.12em; width: .85em; height: .85em; margin-inline-end: .35em; background-color: {{uiAccent}}; -webkit-mask-image: var(--sl-ice-sigil); mask-image: var(--sl-ice-sigil); -webkit-mask-size: contain; mask-size: contain; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; pointer-events: none;",
          css: 'position: relative; overflow: visible; border-radius: 999px; border: 1.5px solid {{frostBorder}}; color: {{uiAccent}}; background-color: {{uiSurfaceBg}}; background-image: linear-gradient(180deg, {{frostGlow}} 0%, transparent 45%); box-shadow: inset 0 1px 0 {{frostRim}}, 0 0 5px {{accentGlow}}, 0 0 12px {{accentSoft}}; padding: 4px 13px; font-weight: 700; letter-spacing: .01em; {{uiBackdropCSS}}'
        },
        actionDock: {
          afterCSS: "content: ''; position: absolute; pointer-events: none; z-index: 1; background-repeat: no-repeat; bottom: -6px; left: -5px; width: 17px; height: 19px; background-image: var(--sl-ice-flakes); background-size: contain;",
          beforeCSS: "content: ''; position: absolute; pointer-events: none; z-index: 1; background-repeat: no-repeat; top: -8px; right: -6px; width: 22px; height: 25px; background-image: var(--sl-ice-flakes); background-size: contain;",
          css: 'position: relative; overflow: visible; border-radius: 999px; border: 1.5px solid {{frostBorder}}; background-color: {{uiSurfaceBg}}; background-image: linear-gradient(180deg, {{frostGlow}} 0%, transparent 45%); color: {{uiText}}; box-shadow: inset 0 1px 0 {{frostRim}}, 0 0 5px {{accentGlow}}, 0 0 12px {{accentSoft}}; padding: 3px 8px; {{uiBackdropCSS}}'
        },
        promptBox: {
          afterCSS: "content: ''; position: absolute; pointer-events: none; z-index: 2; background: var(--sl-ice-mascot) center / contain no-repeat; filter: drop-shadow(0 0 3px {{accentGlow}}); top: -71px; right: 9px; width: 79px; height: 76px;",
          beforeCSS: "content: ''; position: absolute; pointer-events: none; z-index: 1; background-repeat: no-repeat; inset: -15px -5px -15px; background-image: var(--sl-ice-cap-left), var(--sl-ice-cap-right), var(--sl-ice-cap-mid), var(--sl-ice-crystal), var(--sl-ice-flakes), var(--sl-ice-hem); background-position: left top, right top, left 33px top, left bottom 7px, right bottom 5px, center bottom 13px; background-size: 34px 40px, 40px 40px, calc(100% - 72px) 40px, 27px 52px, 43px 44px, 100% 32px;",
          css: 'position: relative; isolation: isolate; overflow: visible; min-width: 0; max-width: 100%; box-sizing: border-box; border: 1.5px solid {{frostBorder}}; color: {{uiText}}; border-radius: 34px 35px 29px 29px / 31px 32px 29px 29px; background-color: {{uiSurfaceBg}}; background-image: linear-gradient(180deg, {{frostGlow}} 0%, transparent 36%); box-shadow: inset 0 1.5px 0 {{frostRim}}, inset 0 0 0 1px {{accentSoft}}, 0 0 7px {{accentGlow}}, 0 8px 22px -12px {{shadowColor}}; margin-top: 56px; margin-bottom: 10px; padding-top: 21px; {{uiBackdropCSS}}',
          focusCSS: 'border-color: {{snowCapColor}}; outline: 2px solid {{accentGlow}}; outline-offset: 3px; box-shadow: inset 0 1.5px 0 {{snowCapColor}}, inset 0 0 0 1px {{accentSoft}}, 0 0 9px {{accentGlow}}, 0 10px 28px -12px {{shadowColor}};'
        },
        promptTools: {
          css: 'position: relative; border-radius: 999px; border: 1.5px solid {{frostBorder}}; background-color: {{cardInnerBg}}; background-image: linear-gradient(180deg, {{frostGlow}} 0%, transparent 45%); color: {{uiText}}; box-shadow: inset 0 1px 0 {{frostRim}}, 0 0 5px {{accentGlow}}, 0 0 12px {{accentSoft}}; {{uiBackdropCSS}}',
          focusCSS: 'outline: 2px solid {{uiAccent}}; outline-offset: 3px; border-color: {{snowCapColor}};',
          hoverCSS: 'border-color: {{snowCapColor}}; background-color: {{accentSoft}}; box-shadow: inset 0 1px 0 {{frostRim}}, 0 0 9px {{accentGlow}};',
          runButtonCSS: 'border-radius: 999px; border: 1.5px solid {{snowCapColor}}; background-color: {{uiAccent}}; background-image: linear-gradient(160deg, {{accentSoft}}, transparent 65%); color: {{accentTextColor}}; font-weight: 750; box-shadow: inset 0 1.5px 0 {{frostRim}}, 0 0 0 1px {{frostBorder}}, 0 0 12px {{accentGlow}};'
        },
        codeAndThink: {
          beforeCSS: "content: ''; position: absolute; pointer-events: none; z-index: 1; background-repeat: no-repeat; top: -6px; right: -3px; width: 21px; height: 23px; opacity: .75; background-image: var(--sl-ice-flakes); background-size: contain;",
          css: 'position: relative; min-width: 0; border-radius: 18px; border: 1px solid {{frostBorder}}; border-top: 2px solid {{snowMidColor}}; background-color: {{cardInnerBg}}; background-image: linear-gradient(180deg, {{frostGlow}} 0%, transparent 36%); box-shadow: inset 0 1px 0 {{frostRim}}, 0 0 8px {{accentSoft}}, 0 5px 16px -10px {{shadowColor}};',
          thinkCSS: 'position: relative; isolation: isolate; overflow: visible !important;'
        },
        leftSidebar: {
          activeCSS: 'border-radius: 14px; border: 1px solid {{frostBorder}}; background-color: {{accentSoft}}; background-image: linear-gradient(90deg, {{accentSoft}}, transparent 85%), var(--sl-ice-sigil); background-position: center, right 10px center; background-size: 100% 100%, 14px 14px; background-repeat: no-repeat; color: {{uiText}}; box-shadow: inset 0 1px 0 {{frostRim}}, 0 0 6px {{accentGlow}};',
          css: 'border-right: 1.5px solid {{frostBorder}}; background-color: {{uiSurfaceBg}}; background-image: var(--sl-ice-sidebar-cord), var(--sl-ice-cap-left), var(--sl-ice-cap-right), var(--sl-ice-cap-mid), linear-gradient(180deg, {{accentSoft}} 0%, transparent 36%); background-position: right -1px top 24px, left top -4px, right top -4px, left 15px top -4px, center top; background-size: 22px 240px, 16px 18px, 19px 18px, calc(100% - 33px) 18px, 100% 100%; background-repeat: repeat-y, no-repeat, no-repeat, no-repeat, no-repeat; box-shadow: inset -1px 0 0 {{frostRim}}, 3px 0 14px -4px {{accentGlow}}; {{uiBackdropCSS}}',
          itemCSS: 'border-radius: 14px; border: 1px solid transparent;'
        },
        rightSidebar: {
          cardCSS: 'border-radius: 18px; border: 1.5px solid {{frostBorder}}; background-color: {{cardInnerBg}}; background-image: linear-gradient(180deg, {{accentSoft}} 0%, transparent 65%), var(--sl-ice-sigil); background-position: center top, right 10px top 10px; background-size: 100% 100%, 14px 14px; background-repeat: no-repeat; box-shadow: inset 0 1px 0 {{frostRim}}, 0 0 6px {{accentGlow}};',
          css: 'border-left: 1.5px solid {{frostBorder}}; background-color: {{uiSurfaceBg}}; background-image: var(--sl-ice-sidebar-cord-left), var(--sl-ice-cap-left), var(--sl-ice-cap-right), var(--sl-ice-cap-mid), linear-gradient(180deg, {{accentSoft}} 0%, transparent 36%); background-position: left -1px top 24px, left top -4px, right top -4px, left 15px top -4px, center top; background-size: 22px 240px, 16px 18px, 19px 18px, calc(100% - 33px) 18px, 100% 100%; background-repeat: repeat-y, no-repeat, no-repeat, no-repeat, no-repeat; box-shadow: inset 1px 0 0 {{frostRim}}, -3px 0 14px -4px {{accentGlow}}; {{uiBackdropCSS}}'
        },
        editModalAndHeader: {
          headerButtonCSS: 'position: relative; border-radius: 999px; border: 1.5px solid {{frostBorder}}; background-color: {{uiSurfaceBg}}; background-image: var(--sl-ice-flakes), linear-gradient(180deg, {{frostGlow}} 0%, transparent 45%); background-position: right -4px bottom -4px, center top; background-size: 19px 19px, 100% 100%; background-repeat: no-repeat; color: {{uiText}}; box-shadow: inset 0 1px 0 {{frostRim}}, 0 0 5px {{accentGlow}}, 0 0 12px {{accentSoft}}; {{uiBackdropCSS}}',
          modalCSS: 'border-radius: 28px; border: 1.5px solid {{frostBorder}}; background-color: {{uiSurfaceBg}}; background-image: var(--sl-ice-cap-left), var(--sl-ice-cap-right), var(--sl-ice-cap-mid), var(--sl-ice-hem), linear-gradient(180deg, {{frostGlow}} 0%, transparent 36%); background-position: left top, right top, left 24px top, center bottom, center top; background-size: 25px 25px, 30px 25px, calc(100% - 53px) 25px, 100% 28px, 100% 100%; background-repeat: no-repeat; padding-top: 24px; box-shadow: inset 0 1.5px 0 {{frostRim}}, 0 0 13px {{accentGlow}}, 0 22px 60px {{shadowColor}}; {{uiBackdropCSS}}',
          improvePopupCSS: 'border-radius: 24px; border: 1.5px solid {{frostBorder}}; background-color: {{uiSurfaceBg}}; background-image: var(--sl-ice-cap-left), var(--sl-ice-cap-right), var(--sl-ice-cap-mid), var(--sl-ice-hem), linear-gradient(180deg, {{frostGlow}} 0%, transparent 38%); background-position: left top, right top, left 22px top, center bottom, center top; background-size: 22px 22px, 26px 22px, calc(100% - 46px) 22px, 100% 24px, 100% 100%; background-repeat: no-repeat; padding-top: 10px; box-shadow: inset 0 1.5px 0 {{frostRim}}, 0 0 14px {{accentGlow}}, 0 24px 64px {{shadowColor}}; {{uiBackdropCSS}}',
          improveOptionCSS: 'border-radius: 14px; border: 1px solid {{frostBorder}}; background-color: {{cardInnerBg}}; background-image: linear-gradient(180deg, {{frostGlow}} 0%, transparent 45%); box-shadow: inset 0 1px 0 {{frostRim}}, 0 0 5px {{accentGlow}};',
          improveInputCSS: 'border-radius: 12px; border: 1px solid {{frostBorder}}; background-color: {{cardInnerBg}}; box-shadow: inset 0 1px 0 {{frostRim}};'
        }
      },
      geometry: {},
      decorations: {},
      ambientEffect: {
        type: 'snow',
        enabled: true,
        density: 44
      },
      customCSS: ":root, {{scope}} {\n  --sl-ice-cap-left: url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 46 64' preserveAspectRatio='none'><defs><linearGradient id='snow' x2='0' y2='1'><stop stop-color='{{snowCapEncoded}}'/><stop offset='.55' stop-color='{{snowMidEncoded}}'/><stop offset='1' stop-color='{{snowShadeEncoded}}'/></linearGradient></defs><path d='M2 44C0 20 20 1 46 4L46 30C23 34 9 40 5 60Z' fill='{{snowShadeEncoded}}' opacity='.65'/><path d='M2 40C0 18 20 1 46 4L46 24C23 28 9 35 5 53Z' fill='url(%23snow)'/><path d='M18 26C30 11 39 10 46 12' fill='none' stroke='{{snowCapEncoded}}' stroke-width='2.4' stroke-linecap='round' opacity='.85'/><path d='M11 39L12 60L15 37M24 31L26 45L28 30' fill='{{snowCapEncoded}}' opacity='.7'/></svg>\");\n  --sl-ice-cap-right: url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 57 64' preserveAspectRatio='none'><defs><linearGradient id='snow' x2='0' y2='1'><stop stop-color='{{snowCapEncoded}}'/><stop offset='.55' stop-color='{{snowMidEncoded}}'/><stop offset='1' stop-color='{{snowShadeEncoded}}'/></linearGradient></defs><path d='M0 8C27 7 57 18 55 48L52 62C44 43 28 34 0 35Z' fill='{{snowShadeEncoded}}' opacity='.65'/><path d='M0 6C27 5 57 16 55 44L52 55C44 36 28 28 0 29Z' fill='url(%23snow)'/><path d='M0 12C9 12 17 15 25 19' fill='none' stroke='{{snowCapEncoded}}' stroke-width='2.4' stroke-linecap='round' opacity='.85'/><path d='M33 35L35 53L37 37M43 41L45 63L48 44' fill='{{snowCapEncoded}}' opacity='.7'/><circle cx='6' cy='25' r='1.5' fill='{{snowCapEncoded}}'/></svg>\");\n  --sl-ice-cap-mid: url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='45 0 539 64' preserveAspectRatio='none'><defs><linearGradient id='snow' x2='0' y2='1'><stop stop-color='{{snowCapEncoded}}'/><stop offset='.55' stop-color='{{snowMidEncoded}}'/><stop offset='1' stop-color='{{snowShadeEncoded}}'/></linearGradient></defs><path d='M45 4C69 6 79 20 108 16C138 12 152 17 174 18C201 20 210 8 236 13C265 19 278 17 303 12C326 8 344 22 369 16C397 9 413 12 438 16C466 20 481 10 507 13C534 17 550 7 584 8L584 35C552 37 541 26 513 30C481 36 466 27 439 30C410 34 400 24 373 29C342 35 330 24 305 28C277 34 264 25 238 28C209 34 198 26 176 30C147 36 134 24 107 29C80 34 64 24 45 30Z' fill='{{snowShadeEncoded}}' opacity='.65'/><path d='M45 4C69 6 79 18 108 14C138 10 152 15 174 16C201 18 210 6 236 11C265 17 278 15 303 10C326 6 344 20 369 14C397 7 413 10 438 14C466 18 481 8 507 11C534 15 550 5 584 6L584 29C552 31 541 20 513 24C481 30 466 21 439 24C410 28 400 18 373 23C342 29 330 18 305 22C277 28 264 19 238 22C209 28 198 20 176 24C147 30 134 18 107 23C80 28 64 18 45 24Z' fill='url(%23snow)'/><path d='M45 12C54 13 63 14 72 16M99 18C129 10 147 20 171 19M211 15C239 10 263 23 289 17M315 14C338 13 350 24 374 18M405 15C432 12 451 23 477 17M531 15C554 10 570 9 584 12' fill='none' stroke='{{snowCapEncoded}}' stroke-width='2.4' stroke-linecap='round' opacity='.85'/><g fill='none' stroke='{{snowCapEncoded}}' stroke-width='1.2' stroke-linecap='round'><path d='M78 13V27M72 20H84M74 16L82 24M74 24L82 16M279 15V30M273 22H285M275 18L283 26M275 26L283 18M492 13V27M486 20H498'/></g><g fill='{{snowCapEncoded}}'><circle cx='57' cy='25' r='1.4'/><circle cx='154' cy='21' r='1'/><circle cx='364' cy='24' r='1.3'/></g></svg>\");\n  --sl-ice-cap: var(--sl-ice-cap-mid);\n  --sl-ice-mascot: url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 104 100'><defs><linearGradient id='ice' x1='0' y1='0' x2='1' y2='1'><stop stop-color='{{snowCapEncoded}}'/><stop offset='.45' stop-color='{{frostBorderEncoded}}'/><stop offset='1' stop-color='{{uiAccentEncoded}}'/></linearGradient><radialGradient id='pearl' cx='.35' cy='.25' r='.8'><stop stop-color='{{snowCapEncoded}}'/><stop offset='.7' stop-color='{{snowMidEncoded}}'/><stop offset='1' stop-color='{{snowShadeEncoded}}'/></radialGradient></defs><ellipse cx='54' cy='88' rx='45' ry='8' fill='{{snowShadeEncoded}}' opacity='.35'/><g stroke='{{frostBorderEncoded}}' stroke-width='.7' stroke-linejoin='round'><path d='M66 86L65 49L79 27L83 58L74 89Z' fill='url(%23ice)'/><path d='M79 27L73 58L74 89L83 58Z' fill='{{snowCapEncoded}}' opacity='.65'/><path d='M74 89L84 60L99 48L94 74L84 91Z' fill='url(%23ice)'/><path d='M99 48L87 73L84 91L94 74Z' fill='{{uiAccentEncoded}}' opacity='.38'/><path d='M62 88L57 65L63 53L71 72L69 89Z' fill='url(%23ice)'/><path d='M84 90L93 78L101 76L97 88Z' fill='{{snowMidEncoded}}'/></g><path d='M25 65L16 54M19 59L13 59M19 59L20 52M61 64L68 53M66 57L72 55' fill='none' stroke='{{uiAccentEncoded}}' stroke-width='2.1' stroke-linecap='round'/><ellipse cx='44' cy='73' rx='19' ry='18' fill='url(%23pearl)' stroke='{{frostBorderEncoded}}' stroke-width='1'/><circle cx='43' cy='47' r='14' fill='url(%23pearl)' stroke='{{frostBorderEncoded}}' stroke-width='.8'/><path d='M29 42C29 31 34 25 43 25C51 25 57 32 58 41Z' fill='{{uiAccentEncoded}}'/><path d='M32 35C38 31 48 31 54 35' fill='none' stroke='{{frostBorderEncoded}}' stroke-width='2'/><ellipse cx='43' cy='41' rx='16' ry='3.5' fill='{{snowCapEncoded}}'/><circle cx='43' cy='22' r='4.5' fill='{{snowCapEncoded}}' stroke='{{frostBorderEncoded}}' stroke-width='.7'/><circle cx='38' cy='47' r='1.65' fill='{{uiTextEncoded}}'/><circle cx='48' cy='47' r='1.65' fill='{{uiTextEncoded}}'/><path d='M42 50L49 52L42 54Z' fill='%23e6aa82'/><path d='M38 55Q43 58 48 55' fill='none' stroke='{{uiTextEncoded}}' stroke-width='1.1' stroke-linecap='round'/><ellipse cx='34' cy='52' rx='2.4' ry='1.3' fill='%23e9a5bc' opacity='.45'/><ellipse cx='52' cy='52' rx='2.4' ry='1.3' fill='%23e9a5bc' opacity='.45'/><path d='M30 58Q43 64 56 58L56 64Q43 69 30 64Z' fill='{{uiAccentEncoded}}'/><path d='M49 64L55 64L58 76L51 78Z' fill='{{uiAccentEncoded}}'/><path d='M52 73L57 72' stroke='{{snowCapEncoded}}' stroke-width='1.4'/><g fill='{{uiAccentEncoded}}'><circle cx='42' cy='71' r='1.8'/><circle cx='42' cy='79' r='1.8'/></g><path d='M9 85L7 71L13 62L17 77L15 87M18 88L18 78L24 71L26 83Z' fill='url(%23ice)' stroke='{{frostBorderEncoded}}' stroke-width='.7'/><path d='M11 89Q24 82 34 89Q45 93 57 87Q75 83 94 91' fill='none' stroke='{{snowCapEncoded}}' stroke-width='4' stroke-linecap='round'/><g fill='{{snowCapEncoded}}'><path d='M18 44L20 50L26 52L20 54L18 60L16 54L10 52L16 50Z'/><path d='M87 34L88 38L92 39L88 40L87 44L86 40L82 39L86 38Z'/><circle cx='28' cy='22' r='1.3'/><circle cx='62' cy='38' r='1.2'/></g></svg>\");\n  --sl-ice-flakes: url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'><g fill='none' stroke='{{frostBorderEncoded}}' stroke-width='2.7' opacity='.45' stroke-linecap='round'><path d='M49 27V73M29 38L69 62M29 62L69 38'/></g><g fill='none' stroke='{{snowCapEncoded}}' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round'><path d='M49 27V73M29 38L69 62M29 62L69 38M44 32L49 37L54 32M44 68L49 63L54 68M31 44L38 43L37 36M61 64L60 57L67 56M31 56L38 57L37 64M61 36L60 43L67 44'/><path d='M19 52V72M10 57L28 67M10 67L28 57M16 55L19 58L22 55M16 69L19 66L22 69'/><path d='M60 4L62 12L70 14L62 16L60 24L58 16L50 14L58 12Z'/><path d='M19 14V26M13 20H25'/></g><g fill='{{snowCapEncoded}}'><circle cx='34' cy='25' r='1.5'/><circle cx='73' cy='32' r='1.2'/><circle cx='7' cy='43' r='1'/><circle cx='72' cy='73' r='1.4'/></g></svg>\");\n  --sl-ice-crystal: url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 80'><defs><linearGradient id='c' x2='1' y2='1'><stop stop-color='{{snowCapEncoded}}'/><stop offset='.5' stop-color='{{frostBorderEncoded}}'/><stop offset='1' stop-color='{{uiAccentEncoded}}'/></linearGradient></defs><g stroke='{{frostBorderEncoded}}' stroke-width='.7' stroke-linejoin='round'><path d='M24 70L8 40L5 10L20 28L29 58Z' fill='url(%23c)'/><path d='M5 10L14 40L24 70L20 28Z' fill='{{snowCapEncoded}}' opacity='.55'/><path d='M27 72L26 47L36 29L39 53Z' fill='url(%23c)'/><path d='M36 29L32 54L27 72L39 53Z' fill='{{snowMidEncoded}}' opacity='.8'/><path d='M24 70L9 58L3 40L17 48Z' fill='url(%23c)'/></g><g fill='none' stroke='{{snowCapEncoded}}' stroke-width='1.1' stroke-linecap='round'><path d='M34 58V78M25 63L43 73M25 73L43 63M31 61L34 64L37 61M31 75L34 72L37 75'/><path d='M12 2V14M6 8H18'/></g><g fill='{{snowCapEncoded}}'><circle cx='43' cy='48' r='1.2'/><circle cx='20' cy='19' r='1'/></g></svg>\");\n  --sl-ice-pendant: url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 72'><path d='M15 0V51M25 8V33M5 3V22' fill='none' stroke='{{frostBorderEncoded}}' stroke-width='.65' stroke-dasharray='1.5 2.5' opacity='.85'/><path d='M15 42V65' stroke='{{snowCapEncoded}}' stroke-width='.6'/><path d='M15 49L17 55L22 57L17 59L15 67L13 59L8 57L13 55Z' fill='%23ffe0a6'/><path d='M25 30L26 34L29 35L26 36L25 41L24 36L21 35L24 34Z' fill='{{snowCapEncoded}}'/><g fill='{{snowCapEncoded}}'><circle cx='15' cy='12' r='1.3'/><circle cx='5' cy='25' r='1'/><circle cx='15' cy='37' r='1'/></g></svg>\");\n  --sl-ice-hem: url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 42' preserveAspectRatio='none'><path d='M0 30C80 40 126 4 213 17S351 48 436 27S559 9 640 30L640 42H0Z' fill='{{uiAccentEncoded}}' opacity='.1'/><path d='M0 30C80 40 126 4 213 17S351 48 436 27S559 9 640 30' fill='none' stroke='{{snowMidEncoded}}' stroke-width='.7' opacity='.6'/><path d='M0 33C92 44 135 6 219 20S352 44 442 30S554 13 640 33' fill='none' stroke='{{frostBorderEncoded}}' stroke-width='1' stroke-dasharray='1 7' opacity='.65'/><g fill='{{snowCapEncoded}}'><path d='M126 20L128 25L134 26L128 27L126 33L124 27L119 26L124 25Z'/><path d='M423 25L425 30L431 31L425 32L423 38L421 32L415 31L421 30Z'/><circle cx='232' cy='22' r='1.1'/><circle cx='543' cy='20' r='1.3'/><circle cx='74' cy='31' r='1'/></g></svg>\");\n  --sl-ice-sigil: url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><g fill='none' stroke='{{snowCapEncoded}}' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M12 2V22M3.34 7L20.66 17M3.34 17L20.66 7M8.5 4.5L12 8L15.5 4.5M8.5 19.5L12 16L15.5 19.5M4 11L8 10L7 6M17 18L16 14L20 13M4 13L8 14L7 18M17 6L16 10L20 11'/></g></svg>\");\n  --sl-ice-sidebar-cord: url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 26 240'><path d='M24 0Q11 30 22 60T12 120T22 180T24 240' fill='none' stroke='{{snowOutlineEncoded}}' stroke-width='1.35' opacity='.9'/><path d='M24 0V240' fill='none' stroke='{{snowCapEncoded}}' stroke-width='2' opacity='.85'/><g stroke='{{snowOutlineEncoded}}' stroke-width='1.1' stroke-linecap='round'><path d='M15 30H24M13 90H24M15 150H24M13 210H24'/><path d='M9 90V104M4 97H14M9 210V224M4 217H14'/></g><g fill='{{snowCapEncoded}}' stroke='{{snowOutlineEncoded}}' stroke-width='.95'><polygon points='12,24 16,30 12,36 8,30'/><polygon points='12,144 16,150 12,156 8,150'/><circle cx='19' cy='60' r='2.3'/><circle cx='18' cy='120' r='2.5'/><circle cx='19' cy='180' r='2.3'/></g><g fill='{{uiAccentEncoded}}'><circle cx='12' cy='30' r='1.4'/><circle cx='12' cy='150' r='1.4'/></g></svg>\");\n  --sl-ice-sidebar-cord-left: url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 26 240'><path d='M2 0Q15 30 4 60T14 120T4 180T2 240' fill='none' stroke='{{snowOutlineEncoded}}' stroke-width='1.35' opacity='.9'/><path d='M2 0V240' fill='none' stroke='{{snowCapEncoded}}' stroke-width='2' opacity='.85'/><g stroke='{{snowOutlineEncoded}}' stroke-width='1.1' stroke-linecap='round'><path d='M2 30H11M2 90H13M2 150H11M2 210H13'/><path d='M17 90V104M12 97H22M17 210V224M12 217H22'/></g><g fill='{{snowCapEncoded}}' stroke='{{snowOutlineEncoded}}' stroke-width='.95'><polygon points='14,24 18,30 14,36 10,30'/><polygon points='14,144 18,150 14,156 10,150'/><circle cx='7' cy='60' r='2.3'/><circle cx='8' cy='120' r='2.5'/><circle cx='7' cy='180' r='2.3'/></g><g fill='{{uiAccentEncoded}}'><circle cx='14' cy='30' r='1.4'/><circle cx='14' cy='150' r='1.4'/></g></svg>\");\n}\n{{scope}} .sl-rp-avatar img { border-radius: inherit; }\n{{scope}} ms-prompt-box :is(textarea, .ql-editor) { color: {{uiText}}; line-height: 1.6; }\n{{scope}} ms-prompt-box textarea::placeholder { color: {{mutedColor}}; opacity: 1; }\n{{scope}} ms-prompt-box :is(button.run-button, ms-run-button button) { border-radius: 999px; border: 1.5px solid {{snowCapColor}}; background-color: {{uiAccent}}; background-image: linear-gradient(160deg, {{accentSoft}}, transparent 65%); color: {{accentTextColor}}; font-weight: 750; box-shadow: inset 0 1.5px 0 {{frostRim}}, 0 0 0 1px {{frostBorder}}, 0 0 12px {{accentGlow}}; }\n{{scope}} ms-prompt-box :is(button.run-button, ms-run-button button):disabled { opacity: .55; box-shadow: inset 0 1px 0 {{frostRim}}; }\n{{scope}} ms-prompt-box :is(button.run-button, ms-run-button button):focus-visible, {{scope}} ms-header button[ms-button]{{notSettings}}:focus-visible, {{scope}} .chat-turn-container .turn-footer{{notSettings}} button:focus-visible { outline: 2px solid {{uiAccent}}; outline-offset: 3px; }\n{{scope}} .chat-turn-container .turn-footer{{notSettings}} button { border-radius: 999px; }\n{{scope}} .chat-turn-container .turn-footer{{notSettings}} button:not(:disabled):hover, {{scope}} ms-header button[ms-button]{{notSettings}}:not(:disabled):hover { background-color: {{accentSoft}}; }\n{{scope}} .chat-turn-container :is(pre, code, ms-code-block) { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; overflow-wrap: normal; }\n{{scope}} .chat-turn-container.model ms-text-chunk blockquote { margin-inline: 0; padding: .55em 1em; border-inline-start: 2px solid {{frostBorder}}; border-radius: 0 13px 13px 0; background-color: {{accentSoft}}; color: {{uiText}}; }\n{{scope}} .chat-turn-container.model ms-text-chunk hr { height: 1px; border: 0; margin-block: 1.5em; background: linear-gradient(90deg, transparent, {{frostBorder}}, transparent); }\n{{scope}} .chat-turn-container.model ms-text-chunk a { color: {{uiAccent}}; text-decoration-thickness: 1px; text-underline-offset: .2em; }\n{{scope}} .chat-turn-container.model ms-text-chunk table { border: 1px solid {{frostBorder}}; border-spacing: 0; border-radius: 12px; }\n{{scope}} .chat-turn-container.model ms-text-chunk :is(th, td) { padding: .6em .8em; border-bottom: 1px solid {{uiBorder}}; }\n{{scope}} .chat-turn-container.model ms-text-chunk th { background-color: {{accentSoft}}; color: {{uiText}}; }\n@media (max-width: 600px) {\n  {{scope}} .chat-turn-container.user ms-prompt-chunk:not(:has(ms-file-chunk)):not(:has(ms-video-chunk)):not(:has(ms-image-chunk)):not(:has(textarea)) { padding: 18px 15px 16px; margin-top: 34px; margin-bottom: 16px; border-radius: 22px 24px 21px 23px; }\n  {{scope}} .chat-turn-container.user ms-prompt-chunk:not(:has(ms-file-chunk)):not(:has(ms-video-chunk)):not(:has(ms-image-chunk)):not(:has(textarea))::before { inset: -9px -2px -15px; background-position: left top, right top, left 20px top, left bottom 11px, right bottom 9px, right 8px bottom, center bottom 14px; background-size: 21px 24px, 25px 24px, calc(100% - 44px) 24px, 16px 30px, 24px 26px, 11px 28px, 100% 18px; }\n  {{scope}} .chat-turn-container.user ms-prompt-chunk:not(:has(ms-file-chunk)):not(:has(ms-video-chunk)):not(:has(ms-image-chunk)):not(:has(textarea))::after { top: -38px; right: 2px; width: 46px; height: 45px; }\n  {{scope}} .chat-turn-container.model:not(:has(ms-thought-chunk)):not(.thought-activity-host) .turn-content, {{scope}} .chat-turn-container.model:has(ms-thought-chunk) ms-text-chunk:not(ms-thought-chunk *) { padding: 22px 17px 19px; margin-top: 40px; margin-bottom: 18px; border-radius: 26px 26px 23px 23px; }\n  {{scope}} .chat-turn-container.model:not(:has(ms-thought-chunk)):not(.thought-activity-host) .turn-content::before, {{scope}} .chat-turn-container.model:has(ms-thought-chunk) ms-text-chunk:not(ms-thought-chunk *)::before { inset: -11px -2px -21px; background-position: left top, right top, left 25px top, left bottom 15px, right bottom 13px, 68% bottom, center bottom 19px; background-size: 26px 30px, 31px 30px, calc(100% - 55px) 30px, 24px 44px, 36px 38px, 15px 36px, 100% 24px; }\n  {{scope}} .chat-turn-container.model:not(:has(ms-thought-chunk)):not(.thought-activity-host) .turn-content::after, {{scope}} .chat-turn-container.model:has(ms-thought-chunk) ms-text-chunk:not(ms-thought-chunk *)::after { top: -48px; right: 6px; width: 58px; height: 56px; }\n  {{scope}} ms-prompt-box .prompt-box-container { border-radius: 26px; margin-top: 39px; padding-top: 17px; }\n  {{scope}} ms-prompt-box .prompt-box-container::before { inset: -11px -2px -12px; background-position: left top, right top, left 25px top, left bottom 5px, right bottom 4px, center bottom 10px; background-size: 26px 30px, 31px 30px, calc(100% - 55px) 30px, 21px 40px, 32px 34px, 100% 24px; }\n  {{scope}} ms-prompt-box .prompt-box-container::after { top: -46px; right: 6px; width: 56px; height: 54px; }\n}",
      updatedAt: '2026-10-26T10:25:00.000Z'
    }
  ];

  function normalizeStyleRegion(regVal) {
    if (!regVal) return {};
    if (typeof regVal === 'string') {
      return { css: regVal.trim() };
    }
    if (typeof regVal === 'object') {
      return Object.assign({}, regVal);
    }
    return {};
  }

  function trPreset(key, fallback) {
    const fn = window.StudioLab?.i18n?.t;
    if (typeof fn === 'function') {
      const out = fn(key);
      if (out && out !== key) return out;
    }
    return fallback;
  }

  function normalizeStyleLabObject(raw = {}, options = {}) {
    if (!raw || typeof raw !== 'object') {
      throw new Error(trPreset('te_stylelab_err_invalid_obj', 'Invalid .stylelab structure (must be a JSON object).'));
    }
    const node = (raw.format === 'studiolab-stylelab' && raw.style && typeof raw.style === 'object')
      ? raw.style
      : (raw.style && typeof raw.style === 'object' ? raw.style : raw);

    const name = String(node.name || node.title || '').trim();
    if (!name) {
      throw new Error(trPreset('te_stylelab_err_missing_name', 'Missing required "name" field in .stylelab structure.'));
    }

    const id = sanitizeStyleId(node.id, name);
    const isOfficial = Boolean(
      options.isOfficial ||
      raw.isOfficial ||
      node.isOfficial ||
      id === 'custom-starlit-snowglass'
    );
    const prevRaw = (node.preview && typeof node.preview === 'object') ? node.preview : {};
    const badge = String(node.badge || prevRaw.badge || node.tag || 'STYLELAB').trim().slice(0, 24) || 'STYLELAB';
    const icon = String(node.icon || prevRaw.icon || node.badgeIcon || '✨').trim().slice(0, 8) || '✨';
    const description = String(node.description || node.desc || trPreset('te_stylelab_card_default_desc', 'Custom style (.stylelab) saved permanently.')).trim();

    const preview = Object.assign({}, prevRaw, {
      bubbleRadius: String(prevRaw.bubbleRadius ?? node.geometry?.bubbleRadius ?? '14px'),
      bubbleBorder: String(prevRaw.bubbleBorder ?? '2px solid var(--sl-style-prev-accent)'),
      bubbleShadow: String(prevRaw.bubbleShadow ?? '0 4px 10px rgba(0,0,0,0.22)'),
      avatarRadius: String(prevRaw.avatarRadius ?? node.geometry?.buttonRadius ?? '12px'),
      userSampleText: String(prevRaw.userSampleText ?? prevRaw.sampleUserText ?? trPreset('te_stylelab_sample_user_default', '"Hello world!"')),
      modelSampleText: String(prevRaw.modelSampleText ?? prevRaw.sampleModelText ?? `${name} ${icon}`),
      decorBadge: String(prevRaw.decorBadge ?? icon),
      containerCSS: String(prevRaw.containerCSS || '').trim(),
      userBubbleCSS: String(prevRaw.userBubbleCSS || '').trim(),
      userBubbleBeforeCSS: String(prevRaw.userBubbleBeforeCSS || '').trim(),
      userBubbleAfterCSS: String(prevRaw.userBubbleAfterCSS || '').trim(),
      modelBubbleCSS: String(prevRaw.modelBubbleCSS || '').trim(),
      modelBubbleBeforeCSS: String(prevRaw.modelBubbleBeforeCSS || '').trim(),
      modelBubbleAfterCSS: String(prevRaw.modelBubbleAfterCSS || '').trim(),
      avatarCSS: String(prevRaw.avatarCSS || '').trim(),
      previewCSS: String(prevRaw.previewCSS || prevRaw.css || '').trim()
    });

    const regRaw = (node.regions && typeof node.regions === 'object') ? node.regions : {};
    const editHeaderRaw = Object.assign(
      {},
      normalizeStyleRegion(regRaw.playgroundBar),
      normalizeStyleRegion(regRaw.editModalAndHeader)
    );
    const regions = {
      userBubble: normalizeStyleRegion(regRaw.userBubble),
      modelBubble: normalizeStyleRegion(regRaw.modelBubble),
      avatar: normalizeStyleRegion(regRaw.avatar),
      nameplate: normalizeStyleRegion(regRaw.nameplate),
      actionDock: normalizeStyleRegion(regRaw.actionDock),
      promptBox: normalizeStyleRegion(regRaw.promptBox),
      promptTools: normalizeStyleRegion(regRaw.promptTools),
      codeAndThink: normalizeStyleRegion(regRaw.codeAndThink),
      leftSidebar: normalizeStyleRegion(regRaw.leftSidebar),
      rightSidebar: normalizeStyleRegion(regRaw.rightSidebar),
      editModalAndHeader: editHeaderRaw
    };

    const geometry = (node.geometry && typeof node.geometry === 'object') ? Object.assign({}, node.geometry) : {};
    const decorations = (node.decorations && typeof node.decorations === 'object') ? Object.assign({}, node.decorations) : {};
    delete decorations.bubbleTopCapSvg;
    delete decorations.cornerMascotSvg;

    const ambRaw = (node.ambientEffect && typeof node.ambientEffect === 'object') ? node.ambientEffect : {};
    const ambientEffect = {
      type: String(ambRaw.type || node.ambientType || 'none').trim().toLowerCase(),
      enabled: ambRaw.enabled !== false,
      density: clampVal(ambRaw.density ?? 44, 12, 90),
      customCSS: String(ambRaw.customCSS || '').trim()
    };

    const customCSS = String(node.customCSS || node.css || '').trim();

    return {
      id,
      isCustomStyleLab: true,
      isOfficial,
      name,
      badge,
      icon,
      description,
      preview,
      regions,
      geometry,
      decorations,
      ambientEffect,
      customCSS,
      updatedAt: node.updatedAt || new Date().toISOString()
    };
  }

  const BUILTIN_STYLE_IDS = new Set(['default', 'cartoon-pixel']);

  function getDirectoryBundledCustomStyles() {
    const rawList = Array.isArray(window.StudioLabBundledStyleLabs) ? window.StudioLabBundledStyleLabs : [];
    const out = [];
    for (const entry of rawList) {
      try {
        const node = entry?.style || entry;
        const rawId = String(node?.id || '').trim();
        if (!rawId || BUILTIN_STYLE_IDS.has(rawId) || REMOVED_LEGACY_STYLE_IDS.has(rawId)) continue;
        out.push(normalizeStyleLabObject(entry, { isOfficial: true }));
      } catch (_) {}
    }
    return out;
  }

  function ensureDefaultCustomStylesInCache(list = []) {
    const result = (Array.isArray(list) ? list : []).filter(
      item => item && !REMOVED_LEGACY_STYLE_IDS.has(item.id)
    );
    const defaults = [...DEFAULT_CUSTOM_STYLES, ...getDirectoryBundledCustomStyles()];
    for (const defItem of defaults) {
      const normalizedDef = normalizeStyleLabObject(defItem, { isOfficial: true });
      const idx = result.findIndex(item => item && item.id === normalizedDef.id);
      if (idx === -1) {
        result.unshift(normalizedDef);
      } else {
        result[idx] = normalizedDef;
      }
    }
    return result;
  }

  async function syncDirectoryStyleLabsAsync() {
    try {
      const indexUrl = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
        ? chrome.runtime.getURL('stylelab/index.json')
        : '/stylelab/index.json';
      const res = await fetch(indexUrl, { cache: 'no-store' });
      if (!res.ok) return;
      const indexData = await res.json();
      const files = Array.isArray(indexData?.files) ? indexData.files : [];
      let changed = false;
      for (const fileName of files) {
        if (!String(fileName).endsWith('.stylelab')) continue;
        const fileUrl = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
          ? chrome.runtime.getURL(`stylelab/${fileName}`)
          : `/stylelab/${fileName}`;
        const fRes = await fetch(fileUrl, { cache: 'no-store' });
        if (!fRes.ok) continue;
        const rawJson = await fRes.json();
        const rawId = String(rawJson?.style?.id || rawJson?.id || '').trim();
        if (!rawId || BUILTIN_STYLE_IDS.has(rawId) || REMOVED_LEGACY_STYLE_IDS.has(rawId)) continue;
        const normalized = normalizeStyleLabObject(rawJson, { isOfficial: true });
        const existingIdx = customStylesCache.findIndex(s => s && s.id === normalized.id);
        if (existingIdx === -1) {
          customStylesCache.push(normalized);
          changed = true;
        } else {
          customStylesCache[existingIdx] = normalized;
          changed = true;
        }
      }
      if (changed) {
        persistCustomStyles();
      }
    } catch (_) {}
  }

  function loadCustomStylesSync() {
    customStylesCache = ensureDefaultCustomStylesInCache([]);
    try {
      const raw = window.localStorage?.getItem(CUSTOM_STYLES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const loaded = parsed
            .filter(item => item && !REMOVED_LEGACY_STYLE_IDS.has(item.id))
            .map(item => {
              try { return normalizeStyleLabObject(item); } catch (_) { return null; }
            })
            .filter(Boolean);
          customStylesCache = ensureDefaultCustomStylesInCache(loaded);
          try {
            window.localStorage?.setItem(CUSTOM_STYLES_STORAGE_KEY, JSON.stringify(customStylesCache));
          } catch (_) {}
        }
      }
    } catch (_) {}

    // Also hydrate from chrome.storage.local if available in extension context
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.get([CUSTOM_STYLES_STORAGE_KEY], (res) => {
          const extList = res?.[CUSTOM_STYLES_STORAGE_KEY];
          if (Array.isArray(extList) && extList.length > 0) {
            const normalized = extList
              .filter(item => item && !REMOVED_LEGACY_STYLE_IDS.has(item.id))
              .map(item => {
                try { return normalizeStyleLabObject(item); } catch (_) { return null; }
              })
              .filter(Boolean);
            customStylesCache = ensureDefaultCustomStylesInCache(normalized);
            try {
              window.localStorage?.setItem(CUSTOM_STYLES_STORAGE_KEY, JSON.stringify(customStylesCache));
            } catch (_) {}
            try {
              chrome.storage.local.set({ [CUSTOM_STYLES_STORAGE_KEY]: customStylesCache });
            } catch (_) {}
            window.dispatchEvent(new CustomEvent('sl-custom-styles-changed'));
          }
        });
      }
    } catch (_) {}

    // Automatically discover any new .stylelab files placed inside /stylelab/
    syncDirectoryStyleLabsAsync();
  }

  function persistCustomStyles() {
    try {
      window.localStorage?.setItem(CUSTOM_STYLES_STORAGE_KEY, JSON.stringify(customStylesCache));
    } catch (_) {}
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ [CUSTOM_STYLES_STORAGE_KEY]: customStylesCache });
      }
    } catch (_) {}
    window.dispatchEvent(new CustomEvent('sl-custom-styles-changed'));
  }

  function getCustomStyles() {
    return customStylesCache.slice();
  }

  function getCustomStyleById(styleId) {
    if (!styleId) return null;
    if (styleId === 'winter-frost') {
      return customStylesCache.find(s => s.id === 'custom-starlit-snowglass') || null;
    }
    return customStylesCache.find(s => s.id === styleId) || null;
  }

  function getAllStyles() {
    return [...STYLE_CATALOG, ...customStylesCache];
  }

  function parseStyleLab(rawText) {
    let cleaned = String(rawText || '').trim();
    if (!cleaned) {
      throw new Error(trPreset('te_stylelab_err_empty', '.stylelab content is empty. Please paste the code or upload a .stylelab file.'));
    }
    // Automatically strip markdown code fences (```json ... ``` or ```stylelab ... ```)
    const fenceMatch = cleaned.match(/```(?:json|stylelab|javascript|js)?\s*([\s\S]*?)```/i);
    if (fenceMatch && fenceMatch[1]) {
      cleaned = fenceMatch[1].trim();
    } else {
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.slice(firstBrace, lastBrace + 1);
      }
    }

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      throw new Error(trPreset('te_stylelab_err_invalid_json', 'Invalid .stylelab JSON format. Please check brackets or commas.'));
    }

    return normalizeStyleLabObject(parsed);
  }

  function serializeStyleLab(styleObj) {
    const clean = normalizeStyleLabObject(styleObj);
    return JSON.stringify({
      format: 'studiolab-stylelab',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      style: clean
    }, null, 2);
  }

  function saveCustomStyle(rawStyleInput) {
    const styleObj = typeof rawStyleInput === 'string'
      ? parseStyleLab(rawStyleInput)
      : normalizeStyleLabObject(rawStyleInput);

    const existingIdx = customStylesCache.findIndex(s => s.id === styleObj.id);
    if (existingIdx !== -1) {
      if (customStylesCache[existingIdx].isOfficial) {
        styleObj.isOfficial = true;
      }
      customStylesCache[existingIdx] = styleObj;
    } else {
      customStylesCache.push(styleObj);
    }
    persistCustomStyles();
    return styleObj;
  }

  function deleteCustomStyle(styleId) {
    const target = customStylesCache.find(s => s && s.id === styleId);
    if (target?.isOfficial) {
      return false;
    }
    const before = customStylesCache.length;
    customStylesCache = customStylesCache.filter(s => s.id !== styleId);
    if (customStylesCache.length !== before) {
      persistCustomStyles();
      return true;
    }
    return false;
  }

  function buildStyleLabAIPromptTemplate(userPromptText = '') {
    const userReq = String(userPromptText || '').trim() || '[Mô tả phong cách bạn muốn AI thiết kế tại đây — ví dụ: Tinh Hà Băng Tuyết với viền tuyết phủ, người tuyết đội mũ len, dây pha lê sao rủ xuống ở cả khung chat, thanh Prompt lẫn 2 thanh Sidebar và hiệu ứng tuyết bụi rơi mờ ảo; hoặc Phong cách Hoa Anh Đào Mùa Xuân với cánh hoa rơi nhẹ và mèo chibi nằm trên khung chat...]';

    return `You are a Principal UI/CSS Art Director & Creative Technologist for the **Studio.lab Custom Theme (.stylelab)** engine on Google AI Studio.
Your mission is to design a visually breathtaking, full-DOM \`.stylelab\` JSON configuration that transforms **every element and sub-element of Main Content (Playground Toolbar & Sub-controls, Chat Bubbles, Attached Media/Tables/Grounding Chips, Single-Border Avatars, Nameplates, Hover & Edit Action Dock + <X/Y> Navigator + Inline Edit, Code/Inline-Code/Think Blocks, Prompt Bar & Tools/STT/Attachments, Markdown Edit Modal, Hold-to-Regenerate Improve Response Popup, Dropdowns, Scrollbars & Zero-State Cards)**, **every element + the large outer boundary border of Left Sidebar & Right Sidebar**, and **an optional soothing ambient falling particle effect**.

========================================================================
MANDATORY TWO-STEP INTERACTIVE WORKFLOW (ASK A / B / C / D QUESTIONS FIRST!)
========================================================================
**CRITICAL INSTRUCTION — DO NOT OUTPUT THE JSON CODE ON YOUR FIRST TURN** (unless the user explicitly wrote "skip questions" / "xuất code luôn"):
- **STEP 1 (First Response — Concept Pitch & 5 Multiple-Choice Questions A/B/C/D)**:
  1. Briefly propose your artistic vision for the user's requested theme in 2–3 sentences.
  2. Present **5 concise confirmation questions**, each offering **4 concrete choices (A, B, C, D)** so the user can reply quickly (e.g. \`1A, 2B, 3A, 4A, 5A\`):
     - **Question 1 — Viền Mái Trên, Hiệu Ứng Mặt Kính Sáng Nhẹ Từ Mép Trên & Viền Đáy Khung Chat / Thanh Nhập Liệu (Top Cap, Top-Down Glass Sheen & Bottom Hem Fit)**:
       Ask what top cap (\`::before\`), subtle top-down glass sheen (\`linear-gradient(180deg, {{frostGlow}} 0%, transparent 36%)\` + \`inset 0 1.5px 0 {{frostRim}}\` — never harsh center radial spotlights in Dark mode), and bottom hem/drape style they want on \`userBubble\`, \`modelBubble\`, and \`promptBox\`. Provide options **A, B, C, D**.
     - **Question 2 — Linh Vật Góc, Viền Đơn Avatar & Dây Pha Lê / Tua Rua Rủ Xuống (Corner Mascot, Single-Border Avatar & Hanging Pendants)**:
       Ask what mascot/seal (\`::after\`), single-border avatar frame, and bottom hanging pendants they prefer. Provide options **A, B, C, D**.
     - **Question 3 — Đường Viền Ranh Giới Lớn & Toàn Bộ Phần Tử Của 2 Thanh Sidebar Trái / Phải + Thanh Playground Trên Cùng**:
       Ask how the vertical outer boundary border of Left Sidebar (\`border-right\`) and Right Sidebar (\`border-left\`) should be adorned (e.g. a vertical hanging crystal-and-star cord \`--sl-ice-sidebar-cord\`) along with all inner cards, headers, sliders, inputs, buttons, and the top Playground Toolbar. Provide options **A, B, C, D**.
     - **Question 4 — Hiệu Ứng Hạt Rơi Môi Trường Nhẹ Nhàng (Ambient Falling Particle Layer — \`ambientEffect\`)**:
       Ask which subtle, eye-friendly ambient particle effect to configure (users can also toggle it on/off anytime in Studio.lab):
       - **A.** Tuyết bụi mờ ảo kèm bông tuyết pha lê điểm xuyết (\`"type": "snow"\` — 85% hạt bụi mờ + 15% bông tuyết tinh thể rơi ngẫu nhiên, dịu mắt)
       - **B.** Cánh hoa rơi nhẹ nhàng (\`"type": "petals"\` — cánh hoa bay lượn êm ái)
       - **C.** Tinh tú / đom đóm lấp lánh (\`"type": "stars"\` — hạt sáng tinh hà trôi nhẹ)
       - **D.** Tắt hiệu ứng rơi (\`"type": "none"\` — giữ giao diện tĩnh hoàn toàn)
     - **Question 5 — Độ Tương Phản Sáng / Tối & Đồng Bộ Kính Mờ (Light / Dark Mode Contrast & Glassmorphism)**:
       Ask how bold the adaptive SVG outlines (\`{{snowOutlineEncoded}}\`, \`{{frostBorderEncoded}}\`) and glass glow should be across all 25 Light & Dark palettes. Provide options **A, B, C, D**.
- **STEP 2 (Second Response — After User Replies)**:
  Immediately output **ONLY ONE valid JSON code block** (\`"format": "studiolab-stylelab"\`, wrapped in \`\`\`json ... \`\`\`) incorporating all of the user's chosen options!

========================================================================
SECTION 1: ENGINEERING PRECISION RULES (TOP-DOWN GLASS SHEEN, MOBILE DRAWER SAFETY, SINGLE-BORDER AVATAR, SIDEBAR CORDS & FULL SUB-ELEMENTS)
========================================================================
1. **TOP-DOWN GLASS SHEEN (LIKE SIDEBAR) & ZERO GLARING RADIAL SPOTLIGHTS IN DARK MODE**:
   - Use a gentle top-to-bottom glass surface sheen \`background-image: linear-gradient(180deg, {{frostGlow}} 0%, transparent 36%);\` paired with \`box-shadow: inset 0 1.5px 0 {{frostRim}}, ...\` on \`userBubble\`, \`modelBubble\`, \`promptBox\`, \`codeAndThink\`, \`actionDock\`, \`nameplate\`, \`promptTools\`, and \`editModalAndHeader\`.
   - Do **NOT** put bright center/bottom \`radial-gradient(circle at ..., {{frostRim}}, transparent ...)\` spotlights inside \`userBubble.css\`, \`modelBubble.css\`, or \`promptBox.css\` — in Dark mode those create harsh blotches behind text.
2. **MOBILE VIEWPORT & DRAWER SAFETY (CRITICAL FOR PHONES)**:
   - **NEVER** put \`position: relative\` inside \`leftSidebar.css\` or \`rightSidebar.css\`. On mobile screens, Google AI Studio renders \`.v3-left-nav\` and \`ms-right-side-panel\` as \`position: fixed\` / \`position: absolute\` slide-over drawers; overriding \`position\` breaks mobile layout!
   - Always include \`max-width: 100%; box-sizing: border-box;\` on \`userBubble\`, \`modelBubble\`, and \`promptBox\`.
3. **SINGLE-BORDER AVATAR**:
   - Keep \`avatar.css\` to a **single clean border** (\`border: 1.5px solid {{frostBorder}}; outline: none;\`) without stacking multiple outer/inner rings. Use \`avatar.beforeCSS\` for a subtle corner badge/snowflake sigil if desired.
4. **LEFT & RIGHT SIDEBAR LARGE BOUNDARY CORD + EVERY INNER SUB-ELEMENT**:
   - Style the outer boundary of **Left Sidebar** (\`ms-navbar-v .nav-content, .v3-left-nav\`) and **Right Sidebar** (\`ms-right-side-panel\`) with a vertical hanging ornament cord (e.g. \`--sl-ice-sidebar-cord\` and \`--sl-ice-sidebar-cord-left\`), and style all inner sub-elements while keeping \`.settings-item.settings-tool\` (URL context) 100% transparent.
5. **CRISP VISIBILITY IN BOTH DARK MODE AND LIGHT MODE**:
   - Stroke or shade bright/snow SVG shapes with \`{{snowOutlineEncoded}}\` or \`{{frostBorderEncoded}}\` so every ornament stays crisp on both dark obsidian and bright alabaster themes.
6. **TOP 50% vs. BOTTOM 50% DECORATION ARCHITECTURE & CONSECUTIVE TEXT BUBBLE LINKING (\x60data-sl-decor-top\x60 / \x60data-sl-decor-mid\x60 / \x60data-sl-decor-bottom\x60)**:
   - Studio.lab divides chat bubble decorations into **Top 50% Decorations** (upper-half ornaments such as top snow caps, mascots, ribbons, ears, hats sitting on the top edge via \x60::after\x60 or top layers of \x60::before\x60) and **Bottom 50% Decorations** (lower-half ornaments such as bottom hems, hanging icicles, crystal pendants, corner snowflakes hanging from the bottom edge).
   - Every decorative pseudo-element (\x60::before\x60, \x60::after\x60) MUST include \x60pointer-events: none !important;\x60 so it never blocks clicking Regenerate, Edit, or \x60<X/Y>\x60 history buttons.
   - When a speaker has **multiple consecutive text bubbles** (2+ consecutive User or Model text bubbles, excluding \x60ms-thought-chunk\x60 Think blocks):
     - The **first text bubble** (\x60[data-sl-decor-top="true"]\x60 / \x60[data-sl-decor-pos="top"]\x60) automatically shows ONLY the **Top 50% Decorations** (top snow cap & snowman mascot) and clips away the bottom 50% decorations.
     - Any **middle text bubbles** (\x60[data-sl-decor-mid="true"]\x60 / \x60[data-sl-decor-pos="middle"]\x60) hide both top and bottom decorations so consecutive bubbles connect seamlessly.
     - The **last text bubble** (\x60[data-sl-decor-bottom="true"]\x60 / \x60[data-sl-decor-pos="bottom"]\x60) shows ONLY the **Bottom 50% Decorations** (bottom hem, hanging crystal pendants, bottom corner flakes).
     - Consecutive filled chat bubbles also automatically receive Messenger-style grouped inner corners (\x60data-sl-bubble-pos="first" | "middle" | "last"\x60, where all middle bubbles in 3+ consecutive turns have sharp 6px corners on both top and bottom of the speaker's side).

========================================================================
SECTION 2: DYNAMIC COLOR, GLASSMORPHISM & ENCODED SVG TOKENS
========================================================================
Always use these dynamic tokens inside your CSS & SVG strings:
- \`{{uiAccent}}\` / \`{{uiAccentEncoded}}\` : Primary accent color (CSS / URL-encoded \`%23...\` for inline SVG)
- \`{{uiBase}}\` / \`{{uiBaseEncoded}}\` : Base background color (CSS / URL-encoded for inline SVG)
- \`{{uiSurface}}\` / \`{{uiSurfaceEncoded}}\` : Card/panel surface color (CSS / URL-encoded for inline SVG)
- \`{{uiText}}\` / \`{{uiTextEncoded}}\` : Primary text color
- \`{{mutedColor}}\` : Secondary/muted text color
- \`{{uiBorder}}\` / \`{{uiBorderEncoded}}\` : Structural border color
- \`{{frostBorder}}\` / \`{{frostBorderEncoded}}\` : Crisp accent-tinted crystal border color
- \`{{snowOutlineColor}}\` / \`{{snowOutlineEncoded}}\` : Adaptive high-contrast outline stroke for bright/white SVG shapes
- \`{{frostRim}}\` : Top inner specular highlight
- \`{{frostGlow}}\` : Subtle top-down glass sheen tint (matches Sidebar top sheen)
- \`{{shadowTone}}\` / \`{{shadowToneEncoded}}\` : Adaptive structural shadow/border color
- \`{{shadowColor}}\` : Ambient drop-shadow rgba color
- \`{{snowCapColor}}\` / \`{{snowCapEncoded}}\` : Bright snow/ivory highlight stop tinted by active accent
- \`{{snowMidColor}}\` / \`{{snowMidEncoded}}\` : Mid-tone highlight stop
- \`{{snowShadeColor}}\` / \`{{snowShadeEncoded}}\` : Deeper 3D shade stop for caps & mascots
- \`{{accentGlow}}\` : Translucent accent glow
- \`{{accentSoft}}\` : Translucent accent surface tint
- \`{{accentTextColor}}\` : High-contrast text color over \`{{uiAccent}}\`
- \`{{userBubbleFinalBg}}\` / \`{{modelBubbleFinalBg}}\` : User / Model bubble background (respects user opacity slider)
- \`{{uiSurfaceBg}}\` : Surface background with UI Opacity applied
- \`{{cardInnerBg}}\` : Inner card background for Right Sidebar cards and tool chips
- \`{{uiBackdropCSS}}\` : Synchronized \`backdrop-filter: blur(...) saturate(...);\` declaration
- \`{{scope}}\` and \`{{notSettings}}\` : Root scope selectors for rules in \`customCSS\`

========================================================================
SECTION 3: COMPLETE 11-REGION + GRANULAR SUB-ELEMENT SCHEMA & 2 REFERENCE EXAMPLES
========================================================================
Every region in \`regions\` supports full granular sub-element properties:
1. \`userBubble\`: \`css\`, \`beforeCSS\`, \`afterCSS\`, \`hoverCSS\`, \`textCSS\`, \`mediaCSS\` (attached images/files/videos/audio inside user turns)
2. \`modelBubble\`: \`css\`, \`beforeCSS\`, \`afterCSS\`, \`hoverCSS\`, \`textCSS\`, \`blockquoteCSS\`, \`hrCSS\`, \`tableCSS\`, \`tableHeaderCSS\` (\`thead, th\`), \`tableCellCSS\` (\`td, tbody tr\`), \`linkCSS\` (\`a\`), \`groundingCSS\` (search grounding & citation chips), \`imageCSS\` (generated/markdown images)
3. \`avatar\`: \`css\` (use a single clean border!), \`beforeCSS\`, \`afterCSS\`, \`userAvatarCSS\`, \`modelAvatarCSS\`
4. \`nameplate\`: \`css\`, \`beforeCSS\`, \`afterCSS\`, \`userNameCSS\`, \`modelNameCSS\`
5. \`actionDock\` (Hover & Edit bar + \`<X/Y>\` History Switcher + Inline Turn Edit):
   - \`css\`, \`beforeCSS\`, \`afterCSS\`: Main floating action dock & \`<X/Y>\` switcher container
   - \`buttonCSS\`, \`buttonHoverCSS\`, \`editButtonCSS\`: Individual action buttons & pencil edit button inside the dock
   - \`pagerCSS\`, \`pagerButtonCSS\`, \`pagerCounterCSS\`: Specific overrides for the \`<X/Y>\` response history navigator pill, prev/next arrows, and \`X/Y\` counter label
   - \`inlineEditCSS\`: Inline turn editing textarea container when editing a message in-place
6. \`promptBox\` (Single-frame Prompt Bar):
   - \`css\`, \`beforeCSS\`, \`afterCSS\`, \`focusCSS\`: Outer single-pill prompt container
   - \`inputCSS\`, \`placeholderCSS\`: Textarea input & placeholder styling
   - \`formatBarCSS\`, \`formatButtonCSS\`, \`formatButtonHoverCSS\`: Markdown formatting toolbar (\`B\`, \`I\`, \`S\`, \`Code\`, \`Quote\`) & buttons
   - \`attachmentCSS\`: Pending file/image/audio attachment chips inside the prompt bar
   - \`scrollBottomButtonCSS\`: Floating scroll-to-bottom button above prompt bar
7. \`promptTools\` (Prompt Bar Buttons, STT/Mic & Run CTA):
   - \`css\`, \`beforeCSS\`, \`afterCSS\`, \`hoverCSS\`, \`focusCSS\`: Add (\`+\`) & tool chips
   - \`addButtonCSS\`, \`chipCSS\`, \`chipHoverCSS\`, \`sttButtonCSS\` (Speech-to-text microphone button): Granular overrides for \`+\` button, tool chips, and voice input button
   - \`runButtonCSS\`, \`runButtonHoverCSS\`, \`runButtonDisabledCSS\`: Primary Run / Submit button states
8. \`codeAndThink\` (Code Blocks, Inline Code & Thinking Accordion):
   - \`css\`, \`beforeCSS\`, \`afterCSS\`, \`headerCSS\`: Shared rules for Code & Thinking blocks
   - \`codeCSS\`, \`codeBeforeCSS\`, \`codeAfterCSS\`, \`codeHeaderCSS\`, \`codeButtonCSS\` (Copy / Download / Run code action buttons): Specific overrides for \`ms-code-block\`
   - \`inlineCodeCSS\`: Inline \`code\` spans inside markdown paragraphs
   - \`thinkCSS\`, \`thinkBeforeCSS\`, \`thinkAfterCSS\`, \`thinkHeaderCSS\`: Specific overrides for \`ms-thought-chunk\` (supports \`overflow: visible\` so Top 50% decorations like \`--sl-ice-cap\` and \`--sl-ice-mascot\` sit atop the Think block when \`[data-sl-decor-pos="top"]\`)
9. \`leftSidebar\` (Left Navigation Panel & All Sub-Elements — do NOT set \`position: relative\` on \`css\`):
   - \`css\`, \`beforeCSS\`, \`afterCSS\`: Outer Left Sidebar container & boundary border cord
   - \`headerCSS\`: Top brand/logo header area
   - \`newPromptButtonCSS\`: "+ Create new prompt" CTA button
   - \`itemCSS\`, \`itemBeforeCSS\`, \`itemAfterCSS\`, \`activeCSS\`, \`hoverCSS\`: Navigation links & active state
   - \`badgeCSS\`, \`sectionTitleCSS\`: Item badges & section headers
   - \`footerCSS\`, \`accountButtonCSS\`: Bottom settings/account footer area
10. \`rightSidebar\` (Right Settings Panel & All Sub-Elements — do NOT set \`position: relative\` on \`css\`):
    - \`css\`, \`beforeCSS\`, \`afterCSS\`: Outer Right Sidebar container & boundary border cord
    - \`headerCSS\`, \`closeButtonCSS\`: Top panel header & close button
    - \`cardCSS\`, \`cardBeforeCSS\`, \`cardAfterCSS\`, \`cardHoverCSS\`: Settings cards (automatically excludes URL context \`.settings-tool\`)
    - \`modelSelectorCSS\`, \`systemInstructionsCSS\`: Model selector card & System Instructions card/textarea
    - \`sectionTitleCSS\`: Collapsible section titles
    - \`sliderCSS\`, \`sliderTrackCSS\`, \`sliderThumbCSS\`, \`toggleCSS\`: Temperature/Top-P sliders & switches
    - \`inputCSS\`, \`buttonCSS\`, \`buttonHoverCSS\`: Number/text inputs & action buttons inside Right Sidebar
11. \`editModalAndHeader\` (Top Playground Toolbar + Markdown Edit Modal "Cây Bút" + Improve Response Popup "Cải Thiện Câu Trả Lời" + Dropdowns, Scrollbars & Zero-State):
    - \`toolbarCSS\`, \`toolbarBeforeCSS\`, \`toolbarAfterCSS\`: Top Playground header bar (\`<ms-header>\`, \`.toolbar-container\`)
    - \`titleCSS\`, \`titleEditButtonCSS\`: Prompt title text & rename pencil button in the top bar
    - \`headerButtonCSS\`, \`headerButtonHoverCSS\`: Action icon buttons in the top Playground bar (Share, Compare, Clear, System Instructions, More)
    - \`tokenPillCSS\`, \`tokenValueCSS\`: Token counter & Word counter badges in the top Playground bar
    - \`modalBackdropCSS\`, \`modalCSS\`, \`modalBeforeCSS\`, \`modalAfterCSS\`: Markdown Edit Modal ("Cây bút") & Improve Response Popup backdrop & dialog box
    - \`modalHeaderCSS\`, \`modalRoleBadgeCSS\`, \`modalTitleCSS\`: Modal/Popup top bar, role/AI badge, and title
    - \`modalBodyCSS\`, \`modalTextareaCSS\`: Modal editor body & textarea
    - \`modalFooterCSS\`, \`modalButtonCSS\`, \`modalSaveButtonCSS\`: Modal bottom bar, Cancel/Option button, and Save/Submit primary button
    - \`improvePopupCSS\`, \`improveOptionCSS\`, \`improveInputCSS\`: Specific overrides for the Hold-to-Regenerate Improve Response Popup card (\`.aistu-improve-popup-card\`), AI suggestion option buttons (\`.aistu-improve-option-btn\`), and custom improvement input (\`.aistu-improve-custom-input\`)
    - \`dropdownCSS\`: CDK overlay menus, select dropdown panels, and dialogs
    - \`scrollbarCSS\`: Custom scrollbar thumb styling
    - \`zeroStateCSS\`: Welcome / zero-state starter prompt cards

--- REFERENCE EXAMPLE 1: 8-BIT PIXEL RPG STYLE (\`stylelab/cartoon-pixel.stylelab\`) ---
\`\`\`json
{
  "format": "studiolab-stylelab",
  "version": "1.0",
  "style": {
    "id": "custom-pixel-rpg-sample",
    "name": "Cartoon Pixel 8-Bit",
    "badge": "8-BIT RPG",
    "icon": "🕹️",
    "description": "Crisp 8-bit stepped borders, solid pixel block shadows, retro dialogue tails, and full 11-region synchronization.",
    "preview": {
      "userSampleText": "\\"Quest start!\\"",
      "modelSampleText": "8-bit RPG dialogue box 🕹️",
      "decorBadge": "🕹️",
      "containerCSS": "border-radius: 0px; border: 2px solid {{shadowTone}};",
      "userBubbleCSS": "border-radius: 0px; border: 2px solid {{uiAccent}}; box-shadow: inset 0 0 0 1.5px {{uiBase}}, 3px 3px 0 0 {{shadowTone}};",
      "userBubbleBeforeCSS": "content: ''; position: absolute; top: -4px; left: -4px; width: 6px; height: 6px; background: {{uiAccent}};",
      "modelBubbleCSS": "border-radius: 0px; border: 2px solid {{shadowTone}}; box-shadow: inset 0 0 0 1.5px {{uiBase}}, 3px 3px 0 0 {{uiAccent}};",
      "avatarCSS": "border-radius: 0px; border: 2px solid {{uiAccent}}; box-shadow: 2px 2px 0 0 {{shadowTone}};"
    },
    "regions": {
      "userBubble": {
        "css": "border-radius: 0px; border: 3px solid {{uiAccent}}; background-image: none; box-shadow: inset 0 0 0 3px {{uiBase}}, 5px 5px 0 0 {{shadowTone}};",
        "beforeCSS": "content: ''; position: absolute; top: -6px; left: -6px; width: 8px; height: 8px; background: {{uiAccent}}; border: 2px solid {{uiBase}}; box-shadow: 2px 2px 0 0 {{shadowTone}};",
        "afterCSS": "content: ''; position: absolute; right: -9px; bottom: 10px; width: 8px; height: 8px; background: {{userBubbleFinalBg}}; border-right: 3px solid {{uiAccent}}; border-bottom: 3px solid {{uiAccent}}; box-shadow: 3px 3px 0 0 {{shadowTone}};"
      },
      "modelBubble": {
        "css": "border-radius: 0px; border: 3px solid {{shadowTone}}; background-image: none; box-shadow: inset 0 0 0 3px {{uiBase}}, 5px 5px 0 0 {{uiAccent}};",
        "beforeCSS": "content: ''; position: absolute; top: -6px; right: -6px; width: 8px; height: 8px; background: {{uiAccent}}; border: 2px solid {{uiBase}}; box-shadow: 2px 2px 0 0 {{shadowTone}};",
        "afterCSS": "content: ''; position: absolute; left: -9px; bottom: 12px; width: 8px; height: 8px; background: {{modelBubbleFinalBg}}; border-left: 3px solid {{shadowTone}}; border-bottom: 3px solid {{shadowTone}}; box-shadow: -3px 3px 0 0 {{uiAccent}};"
      },
      "avatar": { "css": "border-radius: 0px; border: 3px solid {{uiAccent}}; box-shadow: 4px 4px 0 0 {{shadowTone}};" },
      "nameplate": {
        "css": "border-radius: 0px; border: 2px solid {{uiAccent}}; padding: 2px 9px; box-shadow: inset 0 0 0 1.5px {{uiBase}}, 3px 3px 0 0 {{shadowTone}};",
        "beforeCSS": "content: '▸ '; color: {{uiAccent}}; font-weight: 800;"
      },
      "actionDock": {
        "css": "border-radius: 0px; border: 2px solid {{uiAccent}}; box-shadow: inset 0 0 0 1.5px {{uiBase}}, 3px 3px 0 0 {{shadowTone}};",
        "buttonCSS": "border-radius: 0px;",
        "pagerCSS": "border-radius: 0px; border: 2px solid {{uiAccent}}; box-shadow: inset 0 0 0 1.5px {{uiBase}}, 3px 3px 0 0 {{shadowTone}};"
      },
      "promptBox": {
        "css": "border-radius: 0px; border: 3px solid {{uiAccent}}; background-image: none; box-shadow: inset 0 0 0 3px {{uiBase}}, 5px 5px 0 0 {{shadowTone}};",
        "focusCSS": "border-color: {{uiAccent}}; box-shadow: inset 0 0 0 3px {{uiBase}}, 0 0 0 2px {{accentGlow}}, 5px 5px 0 0 {{uiAccent}};"
      },
      "promptTools": {
        "css": "border-radius: 0px; border: 2px solid {{uiAccent}}; box-shadow: inset 0 0 0 1.5px {{uiBase}}, 2px 2px 0 0 {{shadowTone}};",
        "runButtonCSS": "border-radius: 0px; border: 2px solid {{uiBase}}; background: {{uiAccent}}; color: {{accentTextColor}}; box-shadow: 3px 3px 0 0 {{shadowTone}};"
      },
      "codeAndThink": { "css": "border-radius: 0px; border: 2px solid {{uiAccent}}; box-shadow: inset 0 0 0 2px {{uiBase}}, 4px 4px 0 0 {{shadowTone}};" },
      "leftSidebar": {
        "css": "border-right: 3px solid {{shadowTone}};",
        "itemCSS": "border-radius: 0px;",
        "activeCSS": "border-radius: 0px; border: 2px solid {{uiAccent}}; box-shadow: inset 0 0 0 1.5px {{uiBase}}, 3px 3px 0 0 {{shadowTone}};"
      },
      "rightSidebar": {
        "css": "border-left: 3px solid {{shadowTone}};",
        "cardCSS": "border-radius: 0px; border: 2px solid {{shadowTone}}; box-shadow: inset 0 0 0 1.5px {{uiBase}}, 3px 3px 0 0 {{shadowTone}};"
      },
      "editModalAndHeader": {
        "toolbarCSS": "border-bottom: 3px solid {{shadowTone}}; background-color: {{uiSurfaceBg}}; {{uiBackdropCSS}}",
        "headerButtonCSS": "border-radius: 0px; border: 2px solid {{uiAccent}}; box-shadow: inset 0 0 0 1.5px {{uiBase}}, 2px 2px 0 0 {{shadowTone}};",
        "tokenPillCSS": "border-radius: 0px; border: 2px solid {{uiAccent}}; box-shadow: 2px 2px 0 0 {{shadowTone}};",
        "modalCSS": "border-radius: 0px; border: 3px solid {{uiAccent}}; box-shadow: inset 0 0 0 3px {{uiBase}}, 7px 7px 0 0 {{shadowTone}};",
        "improvePopupCSS": "border-radius: 0px; border: 3px solid {{uiAccent}}; box-shadow: inset 0 0 0 3px {{uiBase}}, 7px 7px 0 0 {{shadowTone}};",
        "improveOptionCSS": "border-radius: 0px; border: 2px solid {{shadowTone}}; box-shadow: inset 0 0 0 1.5px {{uiBase}}, 3px 3px 0 0 {{shadowTone}};",
        "improveInputCSS": "border-radius: 0px; border: 2px solid {{shadowTone}}; box-shadow: inset 2px 2px 0 0 {{shadowTone}};"
      }
    },
    "ambientEffect": { "type": "none", "enabled": false },
    "customCSS": ""
  }
}
\`\`\`

--- REFERENCE EXAMPLE 2: TINH HÀ BĂNG TUYẾT — STARLIT SNOWGLASS STYLE (\`stylelab/winter-frost.stylelab\`) ---
\`\`\`json
${JSON.stringify(
  {
    format: 'studiolab-stylelab',
    version: '1.0',
    style: DEFAULT_CUSTOM_STYLES[0]
  },
  null,
  2
)}
\`\`\`

========================================================================
SECTION 4: USER'S STYLE DESIGN REQUEST
========================================================================
Remember: **Follow the Mandatory Two-Step Interactive Workflow!** On your first turn, pitch your concept and ask the **5 confirmation questions with A / B / C / D options** (covering 1. Top Cap & Bottom Hem fit with Top-Down Glass Sheen, 2. Corner Mascot, Single-Border Avatar & Hanging Pendants, 3. Left/Right Sidebar Large Boundary Cord & Playground Toolbar, 4. Ambient Falling Particle Layer, and 5. Light/Dark Mode contrast). Once confirmed, output the complete \`.stylelab\` JSON block!

User Request:
${userReq}`;
  }

  // Initialize custom styles cache immediately
  loadCustomStylesSync();

  window.StudioLab.themePresets = {
    PRESET_PALETTES,
    FONT_CATALOG,
    FONT_OPTIONS: FONT_CATALOG,
    STYLE_CATALOG,
    computeTintedPalette,
    applyUiTintToConfig,
    createDefaultThemeConfig,
    normalizeThemeConfig,
    applyPresetToConfig,
    serializeThemelab,
    parseThemelab,
    // StyleLab (.stylelab) Custom Style APIs
    getCustomStyles,
    getCustomStyleById,
    getAllStyles,
    parseStyleLab,
    serializeStyleLab,
    saveCustomStyle,
    deleteCustomStyle,
    buildStyleLabAIPromptTemplate
  };
})();

