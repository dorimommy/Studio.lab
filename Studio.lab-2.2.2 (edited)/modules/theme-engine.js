// Modular runtime CSS generator & DOM processor for Studio.lab Custom Themes
// Maps 4-Tab Custom Theme configs onto Google AI Studio (--color-v3-*, --mat-sys-*)
// and Studio.lab Modern Web Chat (--sl-mwc-*), while keeping .sl-settings-shell neutral.
(function () {
  'use strict';

  const STYLE_ID = 'sl-custom-theme-engine-styles';
  const FONT_LINK_ID = 'sl-custom-theme-google-fonts';
  const BG_LAYER_ID = 'sl-custom-theme-bg-layer';
  const SNOW_LAYER_ID = 'sl-custom-theme-snow-layer';

  let activeConfig = null;
  let activeMode = null;
  let draftConfig = null;
  let adoptedSheet = null;
  let observer = null;
  let headObserver = null;
  let bodyClassObserver = null;
  let debounceTimer = null;

  function clamp(num, min, max) {
    return Math.min(max, Math.max(min, num));
  }

  function hexToRgbTuple(hex) {
    const clean = String(hex || '').trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{3}$/.test(clean)) {
      return [
        parseInt(clean[0] + clean[0], 16),
        parseInt(clean[1] + clean[1], 16),
        parseInt(clean[2] + clean[2], 16)
      ];
    }
    if (/^[0-9a-fA-F]{6}$/.test(clean)) {
      return [
        parseInt(clean.slice(0, 2), 16),
        parseInt(clean.slice(2, 4), 16),
        parseInt(clean.slice(4, 6), 16)
      ];
    }
    return [24, 25, 32];
  }

  function hexToRgba(hex, alpha = 1) {
    const [r, g, b] = hexToRgbTuple(hex);
    const a = clamp(Number.isFinite(Number(alpha)) ? Number(alpha) : 1, 0, 1);
    return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})`;
  }

  function blendHex(first, second, weight = 0.5) {
    const [r1, g1, b1] = hexToRgbTuple(first);
    const [r2, g2, b2] = hexToRgbTuple(second);
    const w = clamp(Number(weight) || 0, 0, 1);
    const r = Math.round(r1 * (1 - w) + r2 * w);
    const g = Math.round(g1 * (1 - w) + g2 * w);
    const b = Math.round(b1 * (1 - w) + b2 * w);
    return '#' + [r, g, b].map(v => clamp(v, 0, 255).toString(16).padStart(2, '0')).join('');
  }

  function isLightHex(hex) {
    const [r, g, b] = hexToRgbTuple(hex);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.6;
  }

  function getPageNonce() {
    try {
      const nEl = document.querySelector('style[nonce], link[nonce], script[nonce], [nonce]');
      if (!nEl) return '';
      return nEl.nonce || nEl.getAttribute('nonce') || '';
    } catch (_) {
      return '';
    }
  }

  function ensureGoogleFontsLoaded() {
    if (!document.head) return;
    if (document.getElementById(FONT_LINK_ID)) return;
    const link = document.createElement('link');
    link.id = FONT_LINK_ID;
    link.rel = 'stylesheet';
    const nonce = getPageNonce();
    if (nonce) link.setAttribute('nonce', nonce);
    link.href = 'https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Fira+Code:wght@400;500;600&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:ital,wght@0,400;0,500;0,600;1,400&family=Lora:ital,wght@0,400;0,600;1,400&family=Merriweather:ital,wght@0,400;0,700;1,400&family=Montserrat:wght@400;500;600;700&family=Nunito:ital,wght@0,400;0,600;0,700;1,400&family=Playfair+Display:ital,wght@0,500;0,700;1,400&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Quicksand:wght@400;500;600;700&display=swap';
    document.head.appendChild(link);
  }

  function ensureStyleEl() {
    const parent = document.head || document.documentElement;
    if (!parent) return null;
    let el = document.getElementById(STYLE_ID);
    const nonce = getPageNonce();
    if (!el) {
      el = document.createElement('style');
      el.id = STYLE_ID;
      if (nonce) el.setAttribute('nonce', nonce);
      parent.appendChild(el);
    } else {
      if (nonce && !el.getAttribute('nonce')) el.setAttribute('nonce', nonce);
      if (parent.lastElementChild !== el) {
        parent.appendChild(el);
      }
    }
    return el;
  }

  function installThemeCSS(css) {
    // 1. Primary: Constructable Stylesheet in document.adoptedStyleSheets
    // This bypasses Google AI Studio's strict inline-<style> nonce CSP and stays at the end of the cascade.
    if (typeof window.CSSStyleSheet === 'function' && 'adoptedStyleSheets' in document) {
      try {
        if (!adoptedSheet) {
          adoptedSheet = new window.CSSStyleSheet();
        }
        adoptedSheet.replaceSync(css);
        const current = Array.from(document.adoptedStyleSheets || []);
        if (current[current.length - 1] !== adoptedSheet) {
          document.adoptedStyleSheets = [...current.filter(item => item !== adoptedSheet), adoptedSheet];
        }
      } catch (_) {
        // Fallback to <style> element below
      }
    }

    // 2. Secondary: Nonce-aware <style> tag in <head>
    try {
      const styleEl = ensureStyleEl();
      if (styleEl) {
        styleEl.textContent = css;
      }
    } catch (_) {}
  }

  function removeThemeCSS() {
    if (adoptedSheet && 'adoptedStyleSheets' in document) {
      try {
        const current = Array.from(document.adoptedStyleSheets || []);
        if (current.includes(adoptedSheet)) {
          document.adoptedStyleSheets = current.filter(item => item !== adoptedSheet);
        }
      } catch (_) {}
      adoptedSheet = null;
    }
    const styleEl = document.getElementById(STYLE_ID);
    if (styleEl) styleEl.textContent = '';
  }

  function ensureHeadOrderObserver() {
    if (headObserver || !document.head || typeof MutationObserver === 'undefined') return;
    headObserver = new MutationObserver(() => {
      if (!activeConfig || !document.head) return;
      const el = document.getElementById(STYLE_ID);
      if (el && document.head.lastElementChild !== el) {
        document.head.appendChild(el);
      }
      if (adoptedSheet && 'adoptedStyleSheets' in document) {
        try {
          const current = Array.from(document.adoptedStyleSheets || []);
          if (current[current.length - 1] !== adoptedSheet) {
            document.adoptedStyleSheets = [...current.filter(item => item !== adoptedSheet), adoptedSheet];
          }
        } catch (_) {}
      }
    });
    headObserver.observe(document.head, { childList: true });
  }

  function ensureBgLayer(cfg) {
    if (!document.body) return;
    const pageBg = String(cfg?.mainInterface?.pageBg || '').trim();
    let layer = document.getElementById(BG_LAYER_ID);
    if (!pageBg) {
      if (layer) layer.remove();
      return;
    }
    if (!layer) {
      layer = document.createElement('div');
      layer.id = BG_LAYER_ID;
      layer.setAttribute('aria-hidden', 'true');
      layer.innerHTML = '<div class="sl-ct-bg-image"></div><div class="sl-ct-bg-dim"></div>';
      document.body.prepend(layer);
    }
    const imgEl = layer.querySelector('.sl-ct-bg-image');
    if (imgEl) {
      imgEl.style.backgroundImage = `url(${JSON.stringify(pageBg)})`;
    }
  }

  let snowAnimFrameId = null;
  let snowResizeHandler = null;
  let snowParticles = [];
  let snowCurrentSignature = '';

  function stopSnowAnimation() {
    if (snowAnimFrameId) {
      cancelAnimationFrame(snowAnimFrameId);
      snowAnimFrameId = null;
    }
    if (snowResizeHandler) {
      window.removeEventListener('resize', snowResizeHandler);
      snowResizeHandler = null;
    }
    snowParticles = [];
    snowCurrentSignature = '';
  }

  function resolveAmbientEffectSpec(cfg) {
    if (!cfg || !cfg.style) return null;
    if (cfg.style.ambientEffectEnabled === false) return null;
    const stylePreset = String(cfg.style.stylePreset || 'default').trim();
    if (stylePreset === 'winter-frost' || stylePreset === 'custom-starlit-snowglass') {
      return { type: 'snow', density: 38 };
    }
    const presetsApi = window.StudioLab?.themePresets;
    const customStyleDef = presetsApi?.getCustomStyleById ? presetsApi.getCustomStyleById(stylePreset) : null;
    if (customStyleDef && customStyleDef.ambientEffect && customStyleDef.ambientEffect.enabled !== false) {
      const t = String(customStyleDef.ambientEffect.type || 'none').toLowerCase();
      if (t === 'snow' || t === 'petals' || t === 'stars' || t === 'sparks') {
        return {
          type: t,
          density: clamp(Number(customStyleDef.ambientEffect.density) || 38, 12, 72)
        };
      }
    }
    return null;
  }

  function createAmbientParticle(width, height, effectType, randomY = false) {
    const safeW = Math.max(320, width);
    const safeH = Math.max(320, height);
    const sidePad = 36;
    const topSpawnMin = 24;
    const topSpawnMax = 48;
    const bottomCull = Math.max(120, safeH - 64);

    // 85% soft misty dust motes, 15% delicate crystal flakes / petals / stars
    const isCrystal = Math.random() < 0.15;
    const radius = isCrystal
      ? (3.2 + Math.random() * 2.1)
      : (1.0 + Math.random() * 1.5);
    return {
      x: sidePad + Math.random() * Math.max(60, safeW - sidePad * 2),
      y: randomY
        ? (topSpawnMin + Math.random() * Math.max(60, bottomCull - topSpawnMin))
        : (topSpawnMin + Math.random() * (topSpawnMax - topSpawnMin)),
      r: radius,
      isCrystal,
      vy: isCrystal ? (0.34 + Math.random() * 0.38) : (0.22 + Math.random() * 0.38),
      vx: (Math.random() - 0.5) * 0.24,
      swayAmp: 0.15 + Math.random() * 0.32,
      swaySpeed: 0.007 + Math.random() * 0.012,
      phase: Math.random() * Math.PI * 2,
      rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.011,
      alpha: isCrystal ? (0.50 + Math.random() * 0.32) : (0.22 + Math.random() * 0.38),
      effectType
    };
  }

  function drawSixPointSnowflake(ctx, x, y, r, rot, strokeStyle, glowColor) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 1.15;
    ctx.lineCap = 'round';
    if (glowColor) {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 3.5;
    }
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(0, r);
      const b = r * 0.55;
      const tip = r * 0.32;
      ctx.moveTo(-tip * 0.7, -b - tip * 0.5);
      ctx.lineTo(0, -b);
      ctx.lineTo(tip * 0.7, -b - tip * 0.5);
      ctx.moveTo(-tip * 0.7, b + tip * 0.5);
      ctx.lineTo(0, b);
      ctx.lineTo(tip * 0.7, b + tip * 0.5);
      ctx.stroke();
      ctx.rotate(Math.PI / 3);
    }
    ctx.restore();
  }

  function drawFourPointStar(ctx, x, y, r, rot, fillStyle, glowColor) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot * 0.4);
    ctx.fillStyle = fillStyle;
    if (glowColor) {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 4;
    }
    ctx.beginPath();
    const inner = r * 0.28;
    for (let i = 0; i < 4; i++) {
      const a1 = (i * Math.PI) / 2;
      const a2 = a1 + Math.PI / 4;
      ctx.lineTo(Math.cos(a1) * r, Math.sin(a1) * r);
      ctx.lineTo(Math.cos(a2) * inner, Math.sin(a2) * inner);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawSakuraPetal(ctx, x, y, r, rot, fillStyle, strokeStyle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = fillStyle;
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.bezierCurveTo(r * 0.9, -r * 0.7, r * 0.85, r * 0.6, 0, r);
    ctx.bezierCurveTo(-r * 0.85, r * 0.6, -r * 0.9, -r * 0.7, 0, -r);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function buildAmbientSprites(effectType, isLight, uiAccent) {
    const moteCoreHex = isLight ? blendHex('#ffffff', uiAccent, 0.26) : '#ffffff';
    const moteHaloHex = isLight ? blendHex(uiAccent, '#64748b', 0.25) : blendHex('#ffffff', uiAccent, 0.38);
    const crystalHex = isLight ? blendHex(uiAccent, '#334155', 0.32) : blendHex('#ffffff', uiAccent, 0.16);
    const glowRgba = hexToRgba(uiAccent, isLight ? 0.35 : 0.45);

    // Pre-render soft misty dust mote once onto an offscreen 32x32 bitmap
    const moteCanvas = document.createElement('canvas');
    moteCanvas.width = 32;
    moteCanvas.height = 32;
    const mCtx = moteCanvas.getContext('2d');
    if (mCtx) {
      mCtx.beginPath();
      mCtx.arc(16, 16, 11, 0, Math.PI * 2);
      mCtx.fillStyle = hexToRgba(moteHaloHex, isLight ? 0.38 : 0.28);
      mCtx.fill();
      mCtx.beginPath();
      mCtx.arc(16, 16, 6.2, 0, Math.PI * 2);
      mCtx.fillStyle = hexToRgba(moteCoreHex, 1);
      mCtx.fill();
    }

    // Pre-render 12 rotated crystal / petal / star frames onto 48x48 offscreen bitmaps (eliminating per-frame ctx.save/translate/rotate/restore)
    const ROT_STEPS = 12;
    const crystalFrames = [];
    for (let step = 0; step < ROT_STEPS; step++) {
      const cCanvas = document.createElement('canvas');
      cCanvas.width = 48;
      cCanvas.height = 48;
      const cCtx = cCanvas.getContext('2d');
      const angle = (step / ROT_STEPS) * Math.PI * 2;
      if (cCtx) {
        if (effectType === 'petals') {
          drawSakuraPetal(
            cCtx,
            24,
            24,
            12,
            angle,
            hexToRgba(blendHex('#ffffff', uiAccent, 0.35), 1),
            hexToRgba(crystalHex, 1)
          );
        } else if (effectType === 'stars' || effectType === 'sparks') {
          drawFourPointStar(cCtx, 24, 24, 13, angle, hexToRgba(crystalHex, 1), glowRgba);
        } else {
          drawSixPointSnowflake(cCtx, 24, 24, 12, angle, hexToRgba(crystalHex, 1), glowRgba);
        }
      }
      crystalFrames.push(cCanvas);
    }

    return { moteCanvas, crystalFrames };
  }

  function ensureSnowLayer(cfg) {
    if (!document.body) return;
    const spec = resolveAmbientEffectSpec(cfg);
    let layer = document.getElementById(SNOW_LAYER_ID);
    if (!spec) {
      stopSnowAnimation();
      if (layer) layer.remove();
      return;
    }

    const mi = cfg?.mainInterface || {};
    const uiBase = mi.uiBase || '#0e1017';
    const uiAccent = mi.uiAccent || '#a78bfa';
    const isLight = isLightHex(uiBase);
    const sig = `${spec.type}|${spec.density}|${uiAccent}|${isLight ? 'L' : 'D'}`;

    if (!layer) {
      layer = document.createElement('div');
      layer.id = SNOW_LAYER_ID;
      layer.setAttribute('aria-hidden', 'true');
      layer.innerHTML = '<canvas class="sl-ct-snow-canvas"></canvas>';
      document.body.appendChild(layer);
    }

    const canvas = layer.querySelector('canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const syncCanvasSize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(320, window.innerWidth || 1280);
      const h = Math.max(320, window.innerHeight || 720);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      return { w, h };
    };

    if (snowCurrentSignature === sig && snowAnimFrameId) {
      return;
    }

    stopSnowAnimation();
    snowCurrentSignature = sig;
    const { w: initW, h: initH } = syncCanvasSize();

    const count = spec.density;
    snowParticles = Array.from({ length: count }, () =>
      createAmbientParticle(initW, initH, spec.type, true)
    );

    const { moteCanvas, crystalFrames } = buildAmbientSprites(spec.type, isLight, uiAccent);
    const frameCount = crystalFrames.length;
    const TWO_PI = Math.PI * 2;
    let cachedW = initW;
    let cachedH = initH;
    snowResizeHandler = () => {
      const dims = syncCanvasSize();
      cachedW = dims.w;
      cachedH = dims.h;
    };
    window.addEventListener('resize', snowResizeHandler, { passive: true });

    let lastFrameTime = performance.now();

    const renderFrame = (now) => {
      if (!document.getElementById(SNOW_LAYER_ID)) {
        stopSnowAnimation();
        return;
      }
      const rawDt = now - lastFrameTime;
      lastFrameTime = now;
      // Smooth delta-time normalization (1.0 at 60fps, capped at 2.2 so main-thread spikes never cause teleports or hitches)
      const dt = clamp(rawDt / 16.667, 0.4, 2.2);

      if (!document.hidden) {
        const w = cachedW;
        const h = cachedH;
        ctx.clearRect(0, 0, w, h);

        // Viewport inset thresholds: particles spawn 24px-48px inside top edge and fade to 0 before 64px bottom / 36px side edges
        const topStart = 24;
        const topFadeSpan = 36;
        const bottomVanishY = h - 64;
        const bottomFadeSpan = 56;
        const sideVanishX = 36;
        const sideFadeSpan = 36;

        for (let i = 0; i < snowParticles.length; i++) {
          const p = snowParticles[i];
          p.phase += p.swaySpeed * dt;
          p.rot = (p.rot + p.rotSpeed * dt) % TWO_PI;
          if (p.rot < 0) p.rot += TWO_PI;
          p.x += (p.vx + Math.sin(p.phase) * p.swayAmp) * dt;
          p.y += p.vy * dt;

          // Recycle immediately before reaching the bottom (64px) or side (36px) off-screen zones
          if (p.y >= bottomVanishY || p.x <= sideVanishX || p.x >= w - sideVanishX) {
            p.y = topStart + Math.random() * 24;
            p.x = sideVanishX + sideFadeSpan + Math.random() * Math.max(60, w - (sideVanishX + sideFadeSpan) * 2);
            continue;
          }

          const topFade = clamp((p.y - topStart) / topFadeSpan, 0, 1);
          const bottomFade = clamp((bottomVanishY - p.y) / bottomFadeSpan, 0, 1);
          const leftFade = clamp((p.x - sideVanishX) / sideFadeSpan, 0, 1);
          const rightFade = clamp((w - sideVanishX - p.x) / sideFadeSpan, 0, 1);
          const boundaryFactor = topFade * bottomFade * Math.min(leftFade, rightFade);
          if (boundaryFactor <= 0.015) continue;

          if (p.isCrystal) {
            const baseAlpha = isLight ? clamp(p.alpha * 0.95, 0.32, 0.78) : clamp(p.alpha, 0.36, 0.82);
            const finalAlpha = baseAlpha * boundaryFactor;
            if (finalAlpha <= 0.015) continue;
            const drawSize = p.r * 3.8;
            const half = drawSize * 0.5;
            const rotIdx = ((p.rot / TWO_PI) * frameCount) | 0;
            const sprite = crystalFrames[rotIdx % frameCount];
            ctx.globalAlpha = finalAlpha;
            ctx.drawImage(sprite, p.x - half, p.y - half, drawSize, drawSize);
          } else {
            const baseAlpha = isLight ? clamp(p.alpha * 0.88, 0.18, 0.56) : clamp(p.alpha, 0.16, 0.58);
            const finalAlpha = baseAlpha * boundaryFactor;
            if (finalAlpha <= 0.015) continue;
            const drawSize = p.r * 3.5;
            const half = drawSize * 0.5;
            ctx.globalAlpha = finalAlpha;
            ctx.drawImage(moteCanvas, p.x - half, p.y - half, drawSize, drawSize);
          }
        }
        ctx.globalAlpha = 1;
      }
      snowAnimFrameId = requestAnimationFrame(renderFrame);
    };

    snowAnimFrameId = requestAnimationFrame(renderFrame);
  }

  function buildPaletteVariables(c, mode = 'dark') {
    const hover = blendHex(c.accent, c.text, 0.12);
    const container = mode === 'light' ? c.background : blendHex(c.background, c.surface, 0.5);
    const highest = blendHex(c.surface, c.text, 0.06);
    const button = mode === 'light' ? blendHex(c.background, c.text, 0.04) : blendHex(c.surface, c.text, 0.08);
    const buttonHigh = blendHex(mode === 'light' ? c.background : c.surface, c.text, mode === 'light' ? 0.09 : 0.16);
    const buttonHighest = blendHex(mode === 'light' ? c.background : c.surface, c.text, mode === 'light' ? 0.2 : 0.25);
    const outline = blendHex(c.background, c.border, 0.55);
    const outlineVar = blendHex(c.background, c.border, 0.35);

    const variables = {
      '--color-surface': c.background,
      '--color-on-surface': c.text,
      '--color-on-surface-variant': c.muted,
      '--color-run-settings-text': c.text,
      '--color-logo-lockup': c.text,
      '--color-inverse-surface': c.text,
      '--color-inverse-on-surface': c.background,
      '--color-tertiary': c.accent,
      '--color-error': '#f28b82',
      '--color-nav-item-active': blendHex(c.surface, c.accent, 0.18),
      '--color-nav-item-hover': highest,
      '--color-markdown-blockquote-bg': c.surface,
      '--color-loading-background': c.surface,
      '--color-loading-background-contrast': c.border,
      '--color-overlay-background': `color-mix(in srgb, ${c.background} 76%, transparent)`,
      '--color-v3-surface': c.background,
      '--color-v3-surface-container': container,
      '--color-v3-surface-container-low': c.background,
      '--color-v3-surface-container-high': c.surface,
      '--color-v3-surface-container-highest': highest,
      '--color-v3-surface-left-nav': c.surface,
      '--color-v3-surface-left-nav-border': outlineVar,
      '--color-v3-text': c.text,
      '--color-v3-text-var': c.muted,
      '--color-v3-text-subtle': c.muted,
      '--color-v3-text-disable': blendHex(c.muted, c.background, 0.35),
      '--color-v3-text-on-button': c.text,
      '--color-v3-button-container': button,
      '--color-v3-button-container-high': buttonHigh,
      '--color-v3-button-container-highest': buttonHighest,
      '--color-v3-button-container-accent': blendHex(c.surface, c.accent, 0.2),
      '--color-v3-button-container-accent-hover': blendHex(c.surface, c.accent, 0.28),
      '--color-v3-primary': c.accent,
      '--color-v3-on-primary': c.accentText,
      '--color-v3-text-link': c.accent,
      '--color-v3-hover': mode === 'light' ? highest : button,
      '--color-v3-outline': outline,
      '--color-v3-outline-var': outlineVar,
      '--color-v3-outline-accent': c.accent,
      '--color-v3-accent-light-1': c.surface,
      '--color-v3-warning-text': c.text,
      '--color-v3-overlay-background': `color-mix(in srgb, ${c.background} 76%, transparent)`,
      '--mat-sys-surface': c.background,
      '--mat-sys-surface-container': container,
      '--mat-sys-surface-container-low': c.background,
      '--mat-sys-surface-container-high': c.surface,
      '--mat-sys-surface-container-highest': highest,
      '--mat-sys-surface-variant': c.surface,
      '--mat-sys-on-surface': c.text,
      '--mat-sys-on-surface-variant': c.muted,
      '--mat-sys-primary': c.accent,
      '--mat-sys-on-primary': c.accentText,
      '--mat-sys-primary-container': c.surface,
      '--mat-sys-on-primary-container': c.text,
      '--mat-sys-secondary-container': c.surface,
      '--mat-sys-on-secondary-container': c.text,
      '--mat-sys-outline': outline,
      '--mat-sys-outline-variant': outlineVar,
      '--mat-sys-error': '#f28b82',
      '--mat-sys-on-error-container': c.text,
      '--mat-sys-neutral10': c.muted,
      '--sys-surface': c.background,
      '--sys-on-surface': c.text,
      '--sys-primary': c.accent,
      '--sl-mwc-surface': c.background,
      '--sl-mwc-raised': c.surface,
      '--sl-mwc-hover': highest,
      '--sl-mwc-border': outline,
      '--sl-mwc-text': c.text,
      '--sl-mwc-muted': c.muted,
      '--sl-mwc-accent': c.accent,
      '--mat-button-filled-hover-state-layer-color': hover,
      '--mat-button-protected-hover-state-layer-color': hover
    };

    const assign = (value, names) => {
      for (const name of names) variables[name] = value;
    };

    for (const severity of ['note', 'tip', 'important', 'warning', 'caution']) {
      variables['--color-markdown-alert-' + severity] = c.text;
      variables['--color-markdown-alert-' + severity + '-bg'] = c.surface;
    }

    assign(c.surface, [
      '--mat-menu-container-color',
      '--mat-select-panel-background-color',
      '--mat-dialog-container-color',
      '--mdc-dialog-container-color',
      '--mat-table-background-color',
      '--mat-list-list-item-container-color',
      '--mat-list-list-item-selected-container-color',
      '--mat-form-field-filled-container-color',
      '--mat-form-field-filled-disabled-container-color'
    ]);
    assign(c.text, [
      '--mat-menu-item-label-text-color',
      '--mat-option-label-text-color',
      '--mat-select-enabled-trigger-text-color',
      '--mat-select-trigger-text-color',
      '--mat-dialog-subhead-color',
      '--mat-dialog-supporting-text-color',
      '--mat-table-header-headline-color',
      '--mat-table-row-item-label-text-color',
      '--mat-slide-toggle-label-text-color',
      '--mat-checkbox-label-text-color',
      '--mat-radio-label-text-color',
      '--mat-focus-indicator-border-color',
      '--mat-form-field-outlined-focus-outline-color',
      '--mat-form-field-filled-focus-active-indicator-color'
    ]);
    assign(c.muted, [
      '--mat-menu-item-icon-color',
      '--mat-select-placeholder-text-color',
      '--mat-select-enabled-arrow-color',
      '--mat-select-disabled-arrow-color',
      '--mat-select-disabled-trigger-text-color',
      '--mat-form-field-enabled-select-arrow-color',
      '--mat-form-field-leading-icon-color',
      '--mat-form-field-trailing-icon-color'
    ]);
    assign(outline, [
      '--mat-divider-color',
      '--mat-menu-divider-color',
      '--mat-table-row-item-outline-color',
      '--mat-button-outlined-outline-color',
      '--mat-checkbox-unselected-icon-color',
      '--mat-checkbox-unselected-hover-icon-color',
      '--mat-checkbox-unselected-focus-icon-color',
      '--mat-checkbox-unselected-pressed-icon-color',
      '--mat-radio-unselected-icon-color',
      '--mat-radio-unselected-hover-icon-color',
      '--mat-radio-unselected-focus-icon-color',
      '--mat-radio-unselected-pressed-icon-color',
      '--mat-slider-inactive-track-color',
      '--mat-form-field-outlined-outline-color',
      '--mat-form-field-outlined-hover-outline-color',
      '--mat-form-field-outlined-disabled-outline-color',
      '--mat-form-field-filled-active-indicator-color',
      '--mat-form-field-filled-hover-active-indicator-color'
    ]);
    assign(c.accent, [
      '--mat-option-selected-state-label-text-color',
      '--mat-select-focused-arrow-color',
      '--mat-form-field-focus-select-arrow-color',
      '--mat-button-filled-container-color',
      '--mat-button-protected-container-color',
      '--mdc-filled-button-container-color',
      '--mdc-protected-button-container-color',
      '--mat-button-text-label-text-color',
      '--mat-button-outlined-label-text-color',
      '--mat-pseudo-checkbox-full-selected-icon-color',
      '--mat-pseudo-checkbox-minimal-selected-checkmark-color',
      '--mat-slider-handle-color',
      '--mat-slider-active-track-color'
    ]);
    assign(c.accentText, [
      '--mat-button-filled-label-text-color',
      '--mat-button-protected-label-text-color',
      '--mdc-filled-button-label-text-color',
      '--mdc-protected-button-label-text-color',
      '--mat-pseudo-checkbox-full-selected-checkmark-color',
      '--mat-checkbox-selected-checkmark-color'
    ]);
    assign(highest, [
      '--mat-menu-item-hover-state-layer-color',
      '--mat-menu-item-focus-state-layer-color',
      '--mat-option-hover-state-layer-color',
      '--mat-option-focus-state-layer-color',
      '--mat-option-selected-state-layer-color'
    ]);

    for (const variant of ['filled', 'outlined']) {
      for (const token of ['input-text-color', 'label-text-color', 'hover-label-text-color', 'focus-label-text-color']) {
        variables['--mat-form-field-' + variant + '-' + token] = c.text;
      }
      for (const token of ['input-text-placeholder-color', 'disabled-input-text-color', 'disabled-label-text-color']) {
        variables['--mat-form-field-' + variant + '-' + token] = c.muted;
      }
      variables['--mat-form-field-' + variant + '-caret-color'] = c.text;
    }

    for (const state of ['', 'hover-', 'focus-', 'pressed-']) {
      variables['--mat-checkbox-selected-' + state + 'icon-color'] = c.accent;
      variables['--mat-radio-selected-' + state + 'icon-color'] = c.accent;
      variables['--mat-slide-toggle-selected-' + state + 'track-color'] = c.accent;
      variables['--mat-slide-toggle-selected-' + state + 'handle-color'] = c.accentText;
      variables['--mat-slide-toggle-unselected-' + state + 'track-color'] = c.surface;
      variables['--mat-slide-toggle-unselected-' + state + 'handle-color'] = c.muted;
    }

    return variables;
  }

  function settingsThemeSyncCSS(scope, cfgTokens) {
    const {
      mi,
      mode,
      isLight,
      mutedColor,
      accentTextColor,
      uiTrans,
      hasPageBg,
      uiAlpha,
      uiBlurPx,
      uiBackdropCSS
    } = cfgTokens;

    const settingsPageAlpha = (uiTrans || hasPageBg) ? clamp(Math.max(uiAlpha, 0.76), 0.68, 0.95) : 1;
    const settingsSurfaceAlpha = (uiTrans || hasPageBg) ? clamp(Math.max(uiAlpha, 0.82), 0.72, 0.96) : 1;
    const settingsPageBg = hexToRgba(mi.uiBase, settingsPageAlpha);
    const settingsSurfaceBg = hexToRgba(mi.uiSurface, settingsSurfaceAlpha);
    const settingsHoverBg = hexToRgba(
      blendHex(mi.uiSurface, mi.uiText, isLight ? 0.08 : 0.12),
      settingsSurfaceAlpha
    );
    const settingsSelectedBg = hexToRgba(mi.uiAccent, isLight ? 0.18 : 0.24);
    const settingsOutline = hexToRgba(mi.uiBorder, 0.75);
    const mobileMenuBlurPx = Math.max(Number(uiBlurPx) || 0, 26);
    const mobileMenuBg = hexToRgba(mi.uiSurface, (uiTrans || hasPageBg) ? clamp(uiAlpha, 0.74, 0.88) : 0.92);

    const syncedVars = buildPaletteVariables({
      background: mi.uiBase,
      surface: mi.uiSurface,
      text: mi.uiText,
      muted: mutedColor,
      accent: mi.uiAccent,
      accentText: accentTextColor,
      border: mi.uiBorder
    }, mode);

    const declarations = Object.entries(syncedVars)
      .map(([key, value]) => `${key}: ${value} !important;`)
      .join('\n        ');

    return `
      ${scope} .sl-overlay:not(.sl-te-peek-mode) {
        background: ${(uiTrans || hasPageBg) ? hexToRgba(mi.uiBase, 0.58) : mi.uiBase} !important;
        ${uiBackdropCSS}
      }

      ${scope} .cdk-overlay-pane.sl-native-settings-host :is(
        mat-dialog-container,
        .mat-mdc-dialog-container,
        .mat-mdc-dialog-inner-container,
        .mdc-dialog__container,
        .mat-mdc-dialog-surface,
        .mdc-dialog__surface
      ) {
        background: transparent !important;
        background-color: transparent !important;
        color: ${mi.uiText} !important;
      }

      ${scope} :is(
        .sl-overlay,
        .cdk-overlay-pane.sl-native-settings-host,
        .sl-dialog.sl-settings-shell,
        .sl-settings-shell,
        .sl-native-settings-select-panel,
        .sl-theme-preview-bar,
        dialog#sl-settings-mobile-menu,
        .sl-settings-mobile-menu
      ) {
        ${declarations}
        --sl-settings-page: ${settingsPageBg} !important;
        --sl-settings-surface: ${settingsSurfaceBg} !important;
        --sl-settings-text: ${mi.uiText} !important;
        --sl-settings-muted: ${mutedColor} !important;
        --sl-settings-outline: ${settingsOutline} !important;
        --sl-settings-control-outline: ${mi.uiBorder} !important;
        --sl-settings-hover: ${settingsHoverBg} !important;
        --sl-settings-selected: ${settingsSelectedBg} !important;
        --sl-settings-selected-text: ${mi.uiAccent} !important;
        --sl-settings-link: ${mi.uiAccent} !important;
        --sl-settings-primary-ink: ${accentTextColor} !important;
        --sl-settings-focus: ${mi.uiAccent} !important;
        --color-v3-surface-container: ${settingsPageBg} !important;
        --color-v3-surface-container-high: ${settingsSurfaceBg} !important;
        --color-v3-surface-container-highest: ${settingsHoverBg} !important;
        --color-v3-text: ${mi.uiText} !important;
        --color-v3-text-var: ${mutedColor} !important;
        --color-v3-outline: ${settingsOutline} !important;
        --color-v3-outline-var: ${settingsOutline} !important;
        color-scheme: only dark !important;
        forced-color-adjust: none !important;
      }

      ${scope} :is(
        .sl-settings-shell,
        .sl-settings-shell *,
        .sl-native-settings-select-panel,
        .sl-native-settings-select-panel *
      ) {
        color-scheme: only dark !important;
        forced-color-adjust: none !important;
      }

      ${scope} .sl-dialog.sl-settings-shell {
        background: ${settingsPageBg} !important;
        background-color: ${settingsPageBg} !important;
        color: ${mi.uiText} !important;
        ${(uiTrans || hasPageBg)
          ? `backdrop-filter: blur(${Math.max(Number(uiBlurPx) || 0, 20)}px) saturate(155%) !important; -webkit-backdrop-filter: blur(${Math.max(Number(uiBlurPx) || 0, 20)}px) saturate(155%) !important;`
          : uiBackdropCSS}
      }

      /* Studio.lab Mobile Settings Navigation Drawer: True Frosted Glass Blur (never faded flat opacity) */
      ${scope} :is(dialog#sl-settings-mobile-menu, .sl-settings-mobile-menu) {
        background: ${mobileMenuBg} !important;
        background-color: ${mobileMenuBg} !important;
        border-right: 1px solid ${hexToRgba(mi.uiBorder, 0.68)} !important;
        color: ${mi.uiText} !important;
        backdrop-filter: blur(${mobileMenuBlurPx}px) saturate(170%) !important;
        -webkit-backdrop-filter: blur(${mobileMenuBlurPx}px) saturate(170%) !important;
        box-shadow: 16px 0 44px rgba(0, 0, 0, ${isLight ? '0.16' : '0.55'}) !important;
      }

      ${scope} :is(dialog#sl-settings-mobile-menu, .sl-settings-mobile-menu)::backdrop {
        background: rgba(0, 0, 0, ${isLight ? '0.28' : '0.48'}) !important;
        backdrop-filter: blur(8px) !important;
        -webkit-backdrop-filter: blur(8px) !important;
      }

      ${scope} .sl-settings-mobile-menu :is(.sl-settings-mobile-head, .sl-settings-nav) {
        background: transparent !important;
        background-color: transparent !important;
      }

      ${scope} .sl-settings-mobile-menu .sl-settings-mobile-head {
        border-bottom: 1px solid ${hexToRgba(mi.uiBorder, 0.45)} !important;
      }

      ${scope} .sl-settings-shell :is(
        .sl-settings-card,
        .sl-settings-home-card,
        .sl-te-header-card,
        .sl-te-preview-card,
        .sl-te-preview-topbar,
        .sl-search-container,
        .sl-native-setting-row,
        .sl-te-row,
        .sl-te-row-stack,
        .sl-te-subrow,
        .sl-te-subrow-stack,
        .sl-te-palette-btn,
        .sl-te-style-card,
        .sl-theme-card,
        .sl-te-avatar-box,
        .sl-te-name-input,
        .sl-te-color-control,
        .sl-te-bg-preview-bar,
        .sl-te-slider-val,
        .sl-te-val-badge,
        .sl-te-subnav,
        .sl-te-custom-style-btn,
        .sl-te-stylelab-toolbar,
        .sl-te-stylelab-modal-card,
        .sl-te-stylelab-codebox,
        .sl-te-stylelab-request-input,
        .sl-te-stylelab-paste-input,
        .sl-te-stylelab-upload-bar,
        .sl-settings-button:not(.primary),
        .sl-setting-button:not(.primary)
      ),
      ${scope} .sl-settings-shell :is(.sl-settings-rows, .sl-settings-list, .sl-settings-tools) > :not([hidden]) {
        background: ${settingsSurfaceBg} !important;
        background-color: ${settingsSurfaceBg} !important;
        border: 1px solid ${hexToRgba(mi.uiBorder, isLight ? 0.55 : 0.4)} !important;
        color: ${mi.uiText} !important;
      }

      ${scope} .sl-settings-shell :is(
        .sl-te-palette-btn:hover,
        .sl-te-palette-btn:focus-visible,
        .sl-te-style-card:hover,
        .sl-te-style-card:focus-visible,
        .sl-theme-card:hover,
        .sl-theme-card:focus-visible,
        .sl-te-custom-style-btn:hover,
        .sl-settings-home-card:hover,
        .sl-settings-button:not(.primary):hover,
        .sl-setting-button:not(.primary):hover
      ) {
        background: ${hexToRgba(mi.uiSurface, isLight ? 0.96 : 0.88)} !important;
        background-color: ${hexToRgba(mi.uiSurface, isLight ? 0.96 : 0.88)} !important;
        border-color: ${hexToRgba(mi.uiAccent, 0.55)} !important;
        color: ${mi.uiText} !important;
      }

      ${scope} .sl-settings-shell :is(
        .sl-te-palette-btn.active,
        .sl-te-palette-btn.is-selected,
        .sl-te-palette-btn:active,
        .sl-te-style-card.active,
        .sl-te-style-card.is-selected,
        .sl-te-style-card:active,
        .sl-theme-card.is-active,
        .sl-theme-card:active
      ) {
        background: ${settingsSelectedBg} !important;
        background-color: ${settingsSelectedBg} !important;
        border-color: ${mi.uiAccent} !important;
        color: ${mi.uiText} !important;
      }

      ${scope} .sl-settings-shell .sl-te-subnav-btn {
        background: transparent !important;
        background-color: transparent !important;
        color: ${mutedColor} !important;
      }

      ${scope} .sl-settings-shell .sl-te-subnav-btn:hover:not(.is-active) {
        background: ${settingsHoverBg} !important;
        background-color: ${settingsHoverBg} !important;
        color: ${mi.uiText} !important;
      }

      ${scope} .sl-settings-shell .sl-te-subnav-btn.is-active {
        background: ${mi.uiAccent} !important;
        background-color: ${mi.uiAccent} !important;
        color: ${accentTextColor} !important;
      }

      ${scope} .sl-settings-shell .sl-settings-nav-item[aria-current="page"] {
        background: ${settingsSelectedBg} !important;
        background-color: ${settingsSelectedBg} !important;
        color: ${mi.uiAccent} !important;
      }

      ${scope} .sl-native-settings-select-panel {
        background: ${hexToRgba(mi.uiSurface, 0.94)} !important;
        background-color: ${hexToRgba(mi.uiSurface, 0.94)} !important;
        border: 1px solid ${hexToRgba(mi.uiBorder, 0.7)} !important;
        color: ${mi.uiText} !important;
        backdrop-filter: blur(${Math.max(Number(uiBlurPx) || 0, 20)}px) saturate(155%) !important;
        -webkit-backdrop-filter: blur(${Math.max(Number(uiBlurPx) || 0, 20)}px) saturate(155%) !important;
      }
    `;
  }

  function buildThemeStylesheet(rawConfig) {
    const presetsApi = window.StudioLab?.themePresets;
    const cfg = presetsApi?.normalizeThemeConfig ? presetsApi.normalizeThemeConfig(rawConfig) : rawConfig;
    if (!cfg) return '';

    const rp = cfg.roleplay || {};
    const mi = cfg.mainInterface || {};
    const st = cfg.style || {};
    const typo = cfg.typography || {};
    const isCartoonPixel = st.stylePreset === 'cartoon-pixel';
    const isWinterFrost = st.stylePreset === 'winter-frost';
    const customStyleDef = (!isCartoonPixel && !isWinterFrost && st.stylePreset && st.stylePreset !== 'default')
      ? presetsApi?.getCustomStyleById?.(st.stylePreset)
      : null;
    const isGeometryStyle = isCartoonPixel || isWinterFrost || Boolean(customStyleDef);

    const hasPageBg = Boolean(String(mi.pageBg || '').trim());
    const bgDim = clamp(Number(mi.bgDim) || 0, 0, 95) / 100;
    const bgBlur = clamp(Number(mi.bgBlur) || 0, 0, 40);

    const isLight = isLightHex(mi.uiBase);
    const mode = isLight ? 'light' : 'dark';
    const accentTextColor = isLightHex(mi.uiAccent) ? '#0b1220' : '#ffffff';
    const mutedColor = blendHex(mi.uiText, mi.uiBase, 0.38);

    const paletteVars = buildPaletteVariables({
      background: mi.uiBase,
      surface: mi.uiSurface,
      text: mi.uiText,
      muted: mutedColor,
      accent: mi.uiAccent,
      accentText: accentTextColor,
      border: mi.uiBorder
    }, mode);

    const varDeclarations = Object.entries(paletteVars)
      .map(([k, v]) => `${k}: ${v} !important;`)
      .join('\n        ');

    // UI Transparency (Left/Right sidebars, Prompt Box, System Instructions, Modals)
    const uiTrans = Boolean(mi.enableTransparentUI ?? mi.transparentUiEnabled);
    const uiAlpha = uiTrans ? clamp((Number(mi.uiOpacity) || 82) / 100, 0.08, 1) : (hasPageBg ? 0.88 : 1);
    const uiBlurPx = uiTrans ? clamp(Number(mi.uiBlur) || 20, 4, 40) : (hasPageBg ? 14 : 0);
    const uiSurfaceBg = hexToRgba(mi.uiSurface, uiAlpha);
    const uiBaseBg = hexToRgba(mi.uiBase, uiTrans ? clamp(uiAlpha * 0.92, 0.08, 1) : (hasPageBg ? 0.78 : 1));
    const uiBackdropCSS = uiBlurPx > 0
      ? `backdrop-filter: blur(${uiBlurPx}px) saturate(150%) !important; -webkit-backdrop-filter: blur(${uiBlurPx}px) saturate(150%) !important;`
      : 'backdrop-filter: none !important; -webkit-backdrop-filter: none !important;';

    // Chat Bubbles & Synced Special/Think Blocks
    const bubblesMaster = mi.enableChatBubbles !== false;
    const userBubbleOn = (bubblesMaster && (mi.enableUserBubble ?? mi.userBubbleEnabled) !== false) || isGeometryStyle;
    const modelBubbleOn = (bubblesMaster && Boolean(mi.enableModelBubble ?? mi.modelBubbleEnabled)) || isGeometryStyle;

    const bubbleTrans = bubblesMaster && Boolean(mi.enableBubbleTransparency ?? mi.bubbleTransparencyEnabled);
    const bubbleAlpha = bubbleTrans ? clamp((Number(mi.bubbleOpacity) || 78) / 100, 0.05, 1) : 1;
    const bubbleBlurPx = bubbleTrans ? clamp(Number(mi.bubbleBlur) || 0, 0, 40) : 0;

    const userTransActive = bubbleTrans && (mi.transparentUserBubble ?? mi.userBubbleTransparent) !== false;
    const modelTransActive = bubbleTrans && (mi.transparentModelBubble ?? mi.modelBubbleTransparent) !== false;

    const userBubbleFinalBg = hexToRgba(mi.userBubbleBg || mi.userBubbleColor || mi.uiSurface, userTransActive ? bubbleAlpha : 1);
    const modelBubbleFinalBg = hexToRgba(mi.modelBubbleBg || mi.modelBubbleColor || mi.uiSurface, modelTransActive ? bubbleAlpha : 1);

    const userBubbleFilter = (userTransActive && bubbleBlurPx > 0)
      ? `backdrop-filter: blur(${bubbleBlurPx}px) saturate(140%) !important; -webkit-backdrop-filter: blur(${bubbleBlurPx}px) saturate(140%) !important;`
      : 'backdrop-filter: none !important; -webkit-backdrop-filter: none !important;';

    const modelBubbleFilter = (modelTransActive && bubbleBlurPx > 0)
      ? `backdrop-filter: blur(${bubbleBlurPx}px) saturate(140%) !important; -webkit-backdrop-filter: blur(${bubbleBlurPx}px) saturate(140%) !important;`
      : 'backdrop-filter: none !important; -webkit-backdrop-filter: none !important;';

    // Light-mode chat bubble highlight & depth shadow
    const bubbleBorderColor = isLight
      ? hexToRgba(blendHex(mi.uiBorder, mi.uiAccent, 0.28), 0.9)
      : hexToRgba(mi.uiBorder, 0.72);
    const bubbleShadowCSS = isLight
      ? `0 8px 24px -4px rgba(15, 23, 42, 0.11), 0 2px 6px -1px rgba(15, 23, 42, 0.07), 0 0 0 1px ${hexToRgba(mi.uiAccent, 0.12)}, inset 0 1px 0 rgba(255, 255, 255, 0.85)`
      : '0 4px 18px rgba(0, 0, 0, 0.18)';

    // Special Blocks (Code) & Think Blocks automatically sync with Bubble Blur & Opacity
    const specialBlockAlpha = bubbleTrans ? clamp(bubbleAlpha * 0.92, 0.08, 1) : (hasPageBg ? 0.9 : 1);
    const specialBlockBg = hexToRgba(mi.uiBase, specialBlockAlpha);
    const specialBlockHeaderBg = hexToRgba(mi.uiSurface, specialBlockAlpha);
    const specialBlockFilter = (bubbleTrans && bubbleBlurPx > 0)
      ? `backdrop-filter: blur(${bubbleBlurPx}px) saturate(140%) !important; -webkit-backdrop-filter: blur(${bubbleBlurPx}px) saturate(140%) !important;`
      : 'backdrop-filter: none !important; -webkit-backdrop-filter: none !important;';

    // Typography
    const fontMap = presetsApi?.FONT_OPTIONS || presetsApi?.FONT_CATALOG || [];
    const matchedFont = fontMap.find(f => f.id === typo.fontFamily || f.value === typo.fontFamily || f.css === typo.fontFamily);
    const fontCssValue = matchedFont && (matchedFont.css || matchedFont.value)
      ? (matchedFont.css || matchedFont.value)
      : (typo.fontFamily && typo.fontFamily !== 'default' ? typo.fontFamily : '');
    const fontSizePx = clamp(Number(typo.fontSize || typo.chatFontSize) || 15, 12, 24);

    const customTxtOn = Boolean(typo.enableCustomTextColor ?? typo.customTextColorEnabled);
    const modelTxt = customTxtOn ? (typo.modelTextColor || mi.uiText) : mi.uiText;
    const userTxt = customTxtOn ? (typo.userTextColor || mi.uiText) : mi.uiText;
    const quoteOn = Boolean(typo.enableQuoteHighlight ?? typo.quoteHighlightEnabled);

    // Roleplay Avatar & Name
    const avatarSizePx = clamp(Number(rp.avatarSize) || 36, 24, 96);
    const avatarRadiusPct = clamp(Number(rp.avatarRadius) ?? 50, 0, 50);
    const nameSizePx = clamp(Number(rp.nameSize) || 14, 11, 28);
    const hideNativeModelAuthor = Boolean(
      (rp.enableCustomNames ?? rp.enableNameCustom) ||
      ((rp.enableCustomAvatars ?? rp.enableAvatarCustom) && rp.showModelAvatar !== false)
    );

    // Valid high-specificity scope matching `html > body[data-sl-custom-theme]`
    const scope = ':is(:root, #sl-custom-theme-priority) body[data-sl-custom-theme][data-sl-custom-theme]';
    const notSettings = ':not(.sl-overlay):not(.sl-overlay *):not(.sl-settings-shell):not(.sl-settings-shell *):not(.sl-native-settings-select-panel):not(.sl-native-settings-select-panel *)';
    const hosts = ':is(ms-app,app-root,ms-navbar-v,ms-navbar-v2,ms-prompt-box,ms-right-side-panel,ms-run-settings,ms-prompt-run-settings,ms-system-instructions,ms-system-instructions-panel,run-safety-settings,.cdk-overlay-container,.mat-mdc-dialog-surface,.mat-mdc-menu-panel,.mat-mdc-menu-item,.mat-mdc-select-panel,.mat-mdc-option,.mat-mdc-form-field,.mat-mdc-select,.mat-mdc-slide-toggle,.mat-mdc-checkbox,.mat-mdc-radio-button,.mat-mdc-slider,.mat-mdc-tab-group,.mat-mdc-snack-bar-container,.mat-mdc-tooltip,.mat-mdc-table,.mat-mdc-button,.mat-mdc-outlined-button,.mat-mdc-unelevated-button,.mat-mdc-raised-button,.mat-mdc-icon-button)';

    return `
      /* === 1. PALETTE VARIABLES & GLOBAL TOKENS === */
      :root:has(body[data-sl-custom-theme]) {
        background-color: ${mi.uiBase} !important;
        color-scheme: only dark !important;
        forced-color-adjust: none !important;
        filter: none !important;
      }

      ${scope},
      ${scope} ${hosts}${notSettings} {
        ${varDeclarations}
        --sl-ct-ui-base: ${mi.uiBase};
        --sl-ct-ui-surface: ${mi.uiSurface};
        --sl-ct-ui-text: ${mi.uiText};
        --sl-ct-ui-accent: ${mi.uiAccent};
        --sl-ct-ui-border: ${mi.uiBorder};
        --sl-ct-model-text: ${modelTxt};
        --sl-ct-user-text: ${userTxt};
        --sl-ct-model-quote: ${typo.modelQuoteColor || mi.uiAccent};
        --sl-ct-user-quote: ${typo.userQuoteColor || mi.uiAccent};
        color-scheme: only dark !important;
        forced-color-adjust: none !important;
      }

      ${scope} {
        isolation: isolate !important;
        background-color: ${hasPageBg ? 'transparent' : mi.uiBase} !important;
        background-image: none !important;
        color: ${mi.uiText} !important;
        color-scheme: only dark !important;
        forced-color-adjust: none !important;
        filter: none !important;
      }

      /* === 2. WEBPAGE BACKGROUND WALLPAPER LAYER === */
      #${BG_LAYER_ID} {
        position: fixed !important;
        inset: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        z-index: -1 !important;
        pointer-events: none !important;
        overflow: hidden !important;
        background-color: ${mi.uiBase} !important;
      }
      #${BG_LAYER_ID} .sl-ct-bg-image {
        position: absolute !important;
        inset: -24px !important;
        background-position: center center !important;
        background-repeat: no-repeat !important;
        background-size: cover !important;
        filter: blur(${bgBlur}px) !important;
        transform: scale(1.04) !important;
      }
      #${BG_LAYER_ID} .sl-ct-bg-dim {
        position: absolute !important;
        inset: 0 !important;
        background: ${isLight ? hexToRgba(mi.uiBase, clamp(bgDim * 0.72, 0, 0.82)) : `rgba(0, 0, 0, ${bgDim})`} !important;
      }

      /* === 2B. AMBIENT DUSTY SNOWFALL / PARTICLE LAYER === */
      #${SNOW_LAYER_ID} {
        position: fixed !important;
        inset: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        z-index: 9998 !important;
        pointer-events: none !important;
        overflow: hidden !important;
        contain: strict !important;
        will-change: transform !important;
        transform: translateZ(0) !important;
      }
      #${SNOW_LAYER_ID} .sl-ct-snow-canvas {
        display: block !important;
        width: 100% !important;
        height: 100% !important;
        pointer-events: none !important;
        will-change: transform !important;
        transform: translateZ(0) !important;
      }

      /* === 3. MAIN PAGE CONTAINERS & WORKSPACE SURFACES === */
      ${scope} :is(
        ms-app, app-root, ms-chat-app, ms-prompt-renderer, ms-chunk-editor,
        ms-autoscroll-container, .makersuite-layout, .makersuite-layout.docs-top-bar,
        .makersuite-layout.docs-top-bar .layout-wrapper, .banner-and-app-container,
        .chat-container, .chat-view-container, section.chunk-editor-main, .chunk-editor-main,
        .main-content-container, .main-content, .page-content,
        ms-chat-session, ms-zero-state, .zero-state-container,
        mat-sidenav-container, mat-sidenav-content, main
      )${notSettings} {
        background: ${hasPageBg ? 'transparent' : mi.uiBase} !important;
        background-color: ${hasPageBg ? 'transparent' : mi.uiBase} !important;
        background-image: none !important;
        color: ${mi.uiText} !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }

      ${scope} .makersuite-layout.docs-top-bar .layout-wrapper {
        border-color: ${hexToRgba(mi.uiBorder, 0.45)} !important;
      }

      /* Bottom gradient above footer: hide when wallpaper or transparent UI is active, else match uiBase */
      ${scope} footer::before {
        ${hasPageBg || uiTrans
          ? 'display: none !important; background: none !important;'
          : `background: linear-gradient(to top, ${mi.uiBase} 0%, ${hexToRgba(mi.uiBase, 0.78)} 60px, transparent 100%) !important;`}
      }

      /* === 4. LEFT SIDEBAR (SINGLE-LAYER FROSTED GLASS ON DESKTOP & MOBILE EXPANDED) === */
      ${scope} :is(ms-navbar-v, ms-navbar-v2, ms-side-nav)${notSettings} {
        --color-v3-surface-left-nav: transparent !important;
        background: transparent !important;
        background-color: transparent !important;
        border: none !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }

      /* Immediately neutralize and hide any .sidebar-overlay backdrop when Left or Right Sidebar opens */
      ${scope} .sidebar-overlay,
      ${scope} div.sidebar-overlay[class*="ng-trigger"] {
        display: none !important;
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
        width: 0 !important;
        height: 0 !important;
        background: transparent !important;
        background-color: transparent !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }

      ${scope} :is(ms-navbar-v .nav-content, ms-navbar-v2 .nav-content, .v3-left-nav, .v3-left-nav.expanded)${notSettings} {
        --color-v3-surface-left-nav: transparent !important;
        background: ${uiSurfaceBg} !important;
        background-color: ${uiSurfaceBg} !important;
        background-image: none !important;
        border-right: 1px solid ${hexToRgba(mi.uiBorder, 0.55)} !important;
        color: ${mi.uiText} !important;
        ${uiBackdropCSS}
      }

      /* Force ALL nested elements inside Left Sidebar (desktop & mobile .expanded) to be 100% transparent
         so no child container paints a second opaque/semi-transparent rectangle over .v3-left-nav */
      ${scope} :is(ms-navbar-v, ms-navbar-v2, .v3-left-nav) :is(
        .navbar-header,
        .navbar-header.v3-design,
        .logo-link,
        nav,
        .nav-items-wrapper,
        ms-nav-items-v2,
        ms-nav-items-main-v2,
        ms-nav-items-playground-v2,
        ms-nav-items-build-v2,
        ul.flat-left-nav,
        .flat-left-nav,
        li,
        .section-header,
        .empty-space,
        .bottom-actions,
        ms-navbar-promo-card,
        .icon-button-row,
        .icon-box,
        ms-release-notes,
        ms-status-page,
        ms-settings-menu,
        ms-account-switcher,
        .account-switcher-container,
        #account-switcher-button,
        #account-switcher-button.container,
        .account-switcher-button,
        button.account-switcher-button.ms-button-primary,
        ms-navbar-disclaimer,
        .navbar-disclaimer,
        .disclaimer-container,
        .disclaimer,
        .nav-item-main-text,
        a[ms-button],
        button[ms-button]
      )${notSettings} {
        --color-v3-surface-left-nav: transparent !important;
        background: transparent !important;
        background-color: transparent !important;
        background-image: none !important;
        border-color: transparent !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        color: ${mi.uiText} !important;
      }

      /* Never apply filter: invert() on any theme mode */
      ${scope} :is(ms-navbar-v, ms-navbar-v2, .navbar-header) :is(.logo-link .ms-custom-icon, [style*="lockup_dark"]) {
        filter: none !important;
      }

      ${scope} :is(ms-navbar-v, ms-navbar-v2, .v3-left-nav) :is(.section-header, .disclaimer)${notSettings} {
        color: ${mutedColor} !important;
      }

      ${scope} :is(ms-navbar-v, ms-navbar-v2, .v3-left-nav) .navbar-badge${notSettings} {
        background: ${hexToRgba(mi.uiAccent, 0.16)} !important;
        color: ${mi.uiAccent} !important;
      }

      ${scope} :is(ms-navbar-v, ms-navbar-v2, .v3-left-nav) :is(a.active, a.active-override, [aria-current="page"], .nav-item.ms-button-active)${notSettings} {
        background: ${hexToRgba(mi.uiAccent, 0.16)} !important;
        background-color: ${hexToRgba(mi.uiAccent, 0.16)} !important;
        color: ${mi.uiAccent} !important;
      }
      ${scope} :is(ms-navbar-v, ms-navbar-v2, .v3-left-nav) :is(a.active, a.active-override) .nav-item-main-text${notSettings} {
        color: ${mi.uiAccent} !important;
      }
      ${scope} :is(ms-navbar-v, ms-navbar-v2, .v3-left-nav) :is(a[ms-button], button[ms-button], button.account-switcher-button):not([aria-disabled="true"]):not(:disabled):is(:hover, :focus-visible)${notSettings} {
        background: ${hexToRgba(mi.uiAccent, 0.12)} !important;
        background-color: ${hexToRgba(mi.uiAccent, 0.12)} !important;
      }

      /* === 4B. RIGHT SIDEBAR (SINGLE-LAYER FROSTED GLASS, NO STACKED CONTAINERS) === */
      ${scope} .drawer-container:has(ms-right-side-panel)${notSettings} {
        background: transparent !important;
        background-color: transparent !important;
        border: none !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }

      ${scope} :is(
        ms-right-side-panel,
        .drawer-container:has(ms-run-settings):not(:has(ms-right-side-panel))
      )${notSettings} {
        background: ${uiSurfaceBg} !important;
        background-color: ${uiSurfaceBg} !important;
        border-left: 1px solid ${hexToRgba(mi.uiBorder, 0.55)} !important;
        color: ${mi.uiText} !important;
        ${uiBackdropCSS}
      }

      ${scope} :is(
        ms-right-side-panel .overlay-header,
        ms-right-side-panel .content-container,
        ms-run-settings,
        ms-run-settings .content-container,
        ms-run-settings .settings-items-wrapper,
        ms-run-settings .scrollable-area,
        ms-run-settings .settings-group,
        ms-run-settings .item-group,
        ms-run-settings .field-group,
        ms-run-settings .settings-item,
        ms-run-settings .settings-item.settings-tool,
        ms-run-settings mat-expansion-panel,
        ms-run-settings mat-expansion-panel-header,
        ms-run-settings .mat-expansion-panel-body,
        ms-run-settings ms-tools-settings,
        ms-prompt-run-settings-switcher,
        ms-prompt-run-settings
      )${notSettings} {
        background: transparent !important;
        background-color: transparent !important;
        border: none !important;
        border-color: transparent !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        color: ${mi.uiText} !important;
      }

      /* === 4C. TOP PLAYGROUND TOOLBAR (<ms-header> & STUDIO.LAB TOOLS) === */
      ${scope} :is(
        ms-playground-toolbar,
        ms-playground-toolbar ms-header,
        ms-header,
        ms-toolbar,
        .toolbar-container,
        .toolbar-left,
        .toolbar-right,
        ms-header .title-tokencount-container,
        ms-header .page-title,
        ms-header .token-container
      )${notSettings} {
        background: transparent !important;
        background-color: transparent !important;
        background-image: none !important;
        border: none !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        color: ${mi.uiText} !important;
      }

      ${scope} ms-header .page-title h1.mode-title${notSettings} {
        color: ${mi.uiText} !important;
      }

      ${scope} ms-header .page-title button[ms-button]${notSettings} {
        color: ${mutedColor} !important;
      }

      ${scope} ms-header .page-title button[ms-button]:hover${notSettings} {
        color: ${mi.uiAccent} !important;
        background: ${hexToRgba(mi.uiAccent, 0.14)} !important;
      }

      ${scope} ms-header :is(ms-token-count .token-count-container, .v3-token-count-value)${notSettings} {
        color: ${mutedColor} !important;
      }

      ${scope} :is(
        .sl-header-btn,
        .sl-load-banner button,
        ms-header .toolbar-left > button[ms-button],
        ms-header .toolbar-right > button[ms-button],
        ms-header .toolbar-right .overflow-menu-wrapper > button,
        .toolbar-left .overflow-menu-wrapper > button,
        .toolbar-right .overflow-menu-wrapper > button,
        .toolbar-left > button[aria-label*="nav" i],
        .toolbar-left > button[aria-label*="menu" i]
      )${notSettings} {
        background: ${hexToRgba(mi.uiSurface, uiTrans ? clamp(uiAlpha, 0.25, 0.9) : 0.85)} !important;
        border: 1px solid ${hexToRgba(mi.uiBorder, 0.65)} !important;
        color: ${mi.uiText} !important;
        ${uiBackdropCSS}
      }

      ${scope} :is(
        .sl-header-btn:hover,
        .sl-load-banner button:hover,
        .sl-dropdown-item:hover,
        .sl-toc-item:hover,
        .sl-toc-item.active,
        .sl-custom-submenu .mat-mdc-menu-item:hover,
        .sl-tools-menu-item:hover,
        .sl-custom-submenu-content .mat-mdc-menu-item:hover,
        ms-header .toolbar-left > button[ms-button]:hover,
        ms-header .toolbar-right > button[ms-button]:hover,
        ms-header .toolbar-right .overflow-menu-wrapper > button:hover,
        .toolbar-left .overflow-menu-wrapper > button:hover,
        .toolbar-right .overflow-menu-wrapper > button:hover,
        .toolbar-left > button[aria-label*="nav" i]:hover,
        .toolbar-left > button[aria-label*="menu" i]:hover
      )${notSettings} {
        background: ${hexToRgba(mi.uiAccent, 0.18)} !important;
        border-color: ${mi.uiAccent} !important;
        color: ${mi.uiText} !important;
      }

      ${scope} :is(.sl-header-btn-label, .sl-header-btn .chevron, .sl-toc-item-text, .sl-dropdown-item.active, .sl-tokens-hero-value)${notSettings} {
        color: ${mi.uiText} !important;
      }
      ${scope} :is(.sl-header-btn .icon, .sl-dropdown-check, .sl-tool-check, .sl-tokens-row span.sl-highlight)${notSettings} {
        color: ${mi.uiAccent} !important;
      }
      ${scope} :is(.sl-tokens-hero-label, .sl-tokens-row, .sl-tokens-row span:last-child, .sl-model-edited-badge)${notSettings} {
        color: ${mutedColor} !important;
      }

      /* === 4D. SYSTEM INSTRUCTIONS SLIDING DRAWER & RUN SAFETY DIALOG === */
      ${scope} :is(
        .cdk-overlay-pane.ms-sliding-right-panel-dialog,
        .cdk-overlay-pane.ms-sliding-right-panel-dialog mat-dialog-container,
        .cdk-overlay-pane.ms-sliding-right-panel-dialog .mat-mdc-dialog-container,
        .cdk-overlay-pane.ms-sliding-right-panel-dialog .mat-mdc-dialog-inner-container,
        .cdk-overlay-pane.mat-mdc-dialog-panel mat-dialog-container,
        .cdk-overlay-pane.mat-mdc-dialog-panel .mat-mdc-dialog-container,
        .cdk-overlay-pane.mat-mdc-dialog-panel .mat-mdc-dialog-inner-container
      )${notSettings} {
        background: transparent !important;
        background-color: transparent !important;
        border: none !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }

      ${scope} .cdk-overlay-pane.ms-sliding-right-panel-dialog .mat-mdc-dialog-surface${notSettings} {
        background: ${uiSurfaceBg} !important;
        background-color: ${uiSurfaceBg} !important;
        border-left: 1px solid ${hexToRgba(mi.uiBorder, 0.65)} !important;
        color: ${mi.uiText} !important;
        box-shadow: -12px 0 36px rgba(0, 0, 0, ${isLight ? '0.12' : '0.45'}) !important;
        ${uiBackdropCSS}
      }

      ${scope} :is(
        ms-system-instructions,
        ms-system-instructions .system-instructions-Criteria,
        ms-system-instructions .system-instructions-container,
        ms-system-instructions .panel-header,
        ms-system-instructions .title-row
      )${notSettings} {
        background: transparent !important;
        background-color: transparent !important;
        border: none !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        color: ${mi.uiText} !important;
      }

      ${scope} ms-system-instructions .panel-header${notSettings} {
        border-bottom: 1px solid ${hexToRgba(mi.uiBorder, 0.45)} !important;
        padding-bottom: 10px !important;
        margin-bottom: 12px !important;
      }

      ${scope} ms-system-instructions :is(
        .title-row button[ms-select-button],
        .title-row input[ms-input],
        .title-row button[ms-button]
      )${notSettings} {
        background: ${hexToRgba(mi.uiBase, uiTrans ? clamp(uiAlpha * 0.78, 0.22, 0.88) : 0.72)} !important;
        background-color: ${hexToRgba(mi.uiBase, uiTrans ? clamp(uiAlpha * 0.78, 0.22, 0.88) : 0.72)} !important;
        border: 1px solid ${hexToRgba(mi.uiBorder, 0.65)} !important;
        border-radius: 12px !important;
        color: ${mi.uiText} !important;
      }

      ${scope} ms-system-instructions :is(textarea, textarea.in-run-settings)${notSettings} {
        background: ${hexToRgba(mi.uiBase, uiTrans ? clamp(uiAlpha * 0.75, 0.2, 0.88) : 0.68)} !important;
        background-color: ${hexToRgba(mi.uiBase, uiTrans ? clamp(uiAlpha * 0.75, 0.2, 0.88) : 0.68)} !important;
        border: 1px solid ${hexToRgba(mi.uiBorder, 0.68)} !important;
        border-radius: 16px !important;
        padding: 14px 16px !important;
        color: ${mi.uiText} !important;
        caret-color: ${mi.uiAccent} !important;
        font-size: 14px !important;
        line-height: 1.6 !important;
        box-shadow: inset 0 1px 4px rgba(0, 0, 0, ${isLight ? '0.04' : '0.2'}) !important;
      }

      ${scope} ms-system-instructions :is(textarea, textarea.in-run-settings, .title-row input[ms-input]):focus${notSettings} {
        border-color: ${mi.uiAccent} !important;
        outline: none !important;
      }

      /* Run Safety Settings & Material Dialogs */
      ${scope} :is(
        .sl-custom-dropdown,
        .sl-toc-popover,
        .sl-saving-pill,
        .sl-custom-submenu,
        .mat-mdc-dialog-surface,
        .mat-mdc-menu-panel,
        .mat-mdc-select-panel,
        .mat-mdc-autocomplete-panel,
        .mat-mdc-snack-bar-container .mdc-snackbar__surface,
        .mat-mdc-tooltip .mdc-tooltip__surface
      )${notSettings} {
        background: ${uiSurfaceBg} !important;
        background-color: ${uiSurfaceBg} !important;
        border: 1px solid ${hexToRgba(mi.uiBorder, 0.7)} !important;
        color: ${mi.uiText} !important;
        ${uiBackdropCSS}
      }

      ${scope} :is(
        run-safety-settings,
        run-safety-settings .run-safety-settings,
        run-safety-settings [mat-dialog-title],
        run-safety-settings [mat-dialog-content],
        run-safety-settings [mat-dialog-actions],
        run-safety-settings .safety-item-row,
        run-safety-settings .slider-With-label
      )${notSettings} {
        background: transparent !important;
        background-color: transparent !important;
        color: ${mi.uiText} !important;
      }

      ${scope} run-safety-settings :is(h1, label, .slider-value-label)${notSettings} {
        color: ${mi.uiText} !important;
      }
      ${scope} run-safety-settings .subtitle${notSettings} {
        color: ${mutedColor} !important;
      }
      ${scope} run-safety-settings button.ms-button-primary${notSettings} {
        background: ${ hexToRgba(mi.uiBase, 0.55) } !important;
        border: 1px solid ${hexToRgba(mi.uiBorder, 0.7)} !important;
        color: ${mi.uiText} !important;
      }
      ${scope} run-safety-settings button.ms-button-primary:hover${notSettings} {
        background: ${hexToRgba(mi.uiAccent, 0.16)} !important;
        border-color: ${mi.uiAccent} !important;
      }

      ${scope} :is(.mat-mdc-menu-item, .mat-mdc-option, .mat-mdc-list-item, .mat-mdc-dialog-title, .mat-mdc-dialog-content, .sl-custom-submenu .mat-mdc-menu-item, .sl-tools-menu-item)${notSettings} {
        color: ${mi.uiText} !important;
      }

      ${scope} :is(
        ms-model-selector .model-selector-card,
        ms-system-instructions-panel .system-instructions-card,
        .model-selector-card,
        .system-instructions-card,
        .sl-tokens-card,
        ms-file-chunk,
        ms-image-chunk,
        ms-video-chunk .file-chunk-container,
        ms-thinking-level-setting .mat-mdc-text-field-wrapper,
        ms-run-settings .mat-mdc-text-field-wrapper,
        ms-grid-view .model-card,
        ms-model-grid .model-card,
        ms-agent-grid .agent-card,
        .grid-card
      )${notSettings} {
        background: ${hexToRgba(mi.uiBase, uiTrans ? clamp(uiAlpha * 0.75, 0.2, 0.88) : 0.65)} !important;
        background-color: ${hexToRgba(mi.uiBase, uiTrans ? clamp(uiAlpha * 0.75, 0.2, 0.88) : 0.65)} !important;
        border: 1px solid ${hexToRgba(mi.uiBorder, 0.6)} !important;
        color: ${mi.uiText} !important;
      }

      ${scope} :is(
        ms-model-selector .model-selector-card:hover,
        ms-system-instructions-panel .system-instructions-card:hover,
        .model-selector-card:hover,
        .system-instructions-card:hover,
        ms-file-chunk:hover,
        ms-file-chunk:active,
        ms-image-chunk:hover,
        ms-image-chunk:active,
        ms-video-chunk .file-chunk-container:hover,
        ms-run-settings .mat-mdc-text-field-wrapper:hover
      )${notSettings} {
        background: ${hexToRgba(mi.uiSurface, uiTrans ? clamp(uiAlpha * 0.88, 0.3, 0.95) : 0.92)} !important;
        background-color: ${hexToRgba(mi.uiSurface, uiTrans ? clamp(uiAlpha * 0.88, 0.3, 0.95) : 0.92)} !important;
        border-color: ${mi.uiAccent} !important;
        color: ${mi.uiText} !important;
      }

      ${scope} :is(
        ms-right-side-panel .overlay-header button[ms-button],
        ms-run-settings button[ms-button],
        ms-system-instructions-panel button[ms-button]
      )${notSettings} {
        color: ${mi.uiText} !important;
      }

      ${scope} :is(
        ms-right-side-panel .overlay-header button[ms-button]:hover,
        ms-run-settings button[ms-button]:hover,
        ms-system-instructions-panel button[ms-button]:hover
      )${notSettings} {
        background: ${hexToRgba(mi.uiAccent, 0.16)} !important;
        color: ${mi.uiAccent} !important;
      }

      ${scope} :is(ms-run-settings .title, .model-selector-card .title, .system-instructions-card .title, .mat-mdc-select-value, .mat-mdc-select-arrow)${notSettings} {
        color: ${mi.uiText} !important;
      }
      ${scope} :is(ms-run-settings .subtitle, .model-selector-card .subtitle, .system-instructions-card .subtitle, .token-count-container, .model-run-time, .status-message, .hallucinations-disclaimer)${notSettings} {
        color: ${mutedColor} !important;
      }

      /* === 4E. MARKDOWN EDIT MODAL (.aistu-edit-modal-*) & INLINE EDIT === */
      ${scope} .aistu-edit-modal-overlay {
        background: rgba(0, 0, 0, ${isLight ? '0.35' : '0.62'}) !important;
        backdrop-filter: blur(8px) !important;
        -webkit-backdrop-filter: blur(8px) !important;
      }

      ${scope} .aistu-edit-modal-card {
        background: ${uiSurfaceBg} !important;
        background-color: ${uiSurfaceBg} !important;
        border: 1px solid ${hexToRgba(mi.uiBorder, 0.75)} !important;
        border-radius: 20px !important;
        color: ${mi.uiText} !important;
        box-shadow: 0 24px 64px rgba(0, 0, 0, ${isLight ? '0.18' : '0.6'}) !important;
        ${uiBackdropCSS}
      }

      ${scope} .aistu-edit-modal-header {
        background: ${hexToRgba(mi.uiBase, uiTrans ? clamp(uiAlpha * 0.7, 0.18, 0.85) : 0.55)} !important;
        border-bottom: 1px solid ${hexToRgba(mi.uiBorder, 0.6)} !important;
      }

      ${scope} .aistu-edit-modal-role-badge {
        background: ${hexToRgba(mi.uiAccent, 0.16)} !important;
        color: ${mi.uiAccent} !important;
        border: 1px solid ${hexToRgba(mi.uiAccent, 0.32)} !important;
      }

      ${scope} .aistu-edit-modal-title {
        color: ${mi.uiText} !important;
      }

      ${scope} .aistu-edit-modal-meta {
        color: ${mutedColor} !important;
      }

      ${scope} .aistu-edit-modal-btn:not(.aistu-btn-save) {
        background: ${hexToRgba(mi.uiSurface, 0.85)} !important;
        border: 1px solid ${hexToRgba(mi.uiBorder, 0.7)} !important;
        color: ${mi.uiText} !important;
      }

      ${scope} .aistu-edit-modal-btn:not(.aistu-btn-save):hover {
        background: ${hexToRgba(mi.uiAccent, 0.15)} !important;
        border-color: ${mi.uiAccent} !important;
        color: ${mi.uiText} !important;
      }

      ${scope} .aistu-edit-modal-btn.aistu-btn-save {
        background: ${mi.uiAccent} !important;
        border-color: ${mi.uiAccent} !important;
        color: ${accentTextColor} !important;
      }

      ${scope} .aistu-edit-modal-btn.aistu-btn-save:hover {
        filter: brightness(1.06) !important;
      }

      ${scope} .aistu-edit-modal-body {
        background: transparent !important;
        background-color: transparent !important;
      }

      ${scope} .aistu-edit-modal-textarea {
        background: transparent !important;
        color: ${mi.uiText} !important;
        caret-color: ${mi.uiAccent} !important;
      }

      ${scope} .aistu-edit-modal-textarea::placeholder {
        color: ${mutedColor} !important;
      }

      /* === 4F. IMPROVE RESPONSE POPUP (.aistu-improve-popup-*) === */
      ${scope} .aistu-improve-popup-overlay {
        background: transparent !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }

      ${scope} .aistu-improve-popup-card {
        position: fixed !important;
        background: ${uiSurfaceBg} !important;
        background-color: ${uiSurfaceBg} !important;
        border: 1px solid ${bubbleBorderColor} !important;
        box-shadow: ${bubbleShadowCSS}, 0 12px 32px rgba(0, 0, 0, ${isLight ? '0.18' : '0.52'}) !important;
        color: ${mi.uiText} !important;
        ${uiBackdropCSS}
      }

      ${scope} .aistu-improve-popup-header {
        background: ${hexToRgba(mi.uiBase, uiTrans ? clamp(uiAlpha * 0.7, 0.18, 0.85) : 0.55)} !important;
        border-bottom: 1px solid ${hexToRgba(mi.uiBorder, 0.6)} !important;
      }

      ${scope} .aistu-improve-popup-badge {
        background: ${hexToRgba(mi.uiAccent, 0.16)} !important;
        color: ${mi.uiAccent} !important;
        border: 1px solid ${hexToRgba(mi.uiAccent, 0.32)} !important;
      }

      ${scope} .aistu-improve-popup-title {
        color: ${mi.uiText} !important;
      }

      ${scope} .aistu-improve-close-btn {
        background: ${hexToRgba(mi.uiSurface, 0.85)} !important;
        border: 1px solid ${hexToRgba(mi.uiBorder, 0.7)} !important;
        color: ${mutedColor} !important;
      }

      ${scope} .aistu-improve-close-btn:hover {
        background: ${hexToRgba(mi.uiAccent, 0.15)} !important;
        border-color: ${mi.uiAccent} !important;
        color: ${mi.uiText} !important;
      }

      ${scope} .aistu-improve-spinner {
        border-color: ${hexToRgba(mi.uiBorder, 0.6)} !important;
        border-top-color: ${mi.uiAccent} !important;
      }

      ${scope} .aistu-improve-loading-text {
        color: ${mutedColor} !important;
      }

      ${scope} .aistu-improve-option-btn {
        background: ${hexToRgba(mi.uiSurface, 0.85)} !important;
        border: 1px solid ${hexToRgba(mi.uiBorder, 0.7)} !important;
        color: ${mi.uiText} !important;
      }

      ${scope} .aistu-improve-option-btn:hover {
        background: ${hexToRgba(mi.uiAccent, 0.15)} !important;
        border-color: ${mi.uiAccent} !important;
        color: ${mi.uiText} !important;
      }

      ${scope} .aistu-improve-option-index {
        background: ${hexToRgba(mi.uiAccent, 0.14)} !important;
        color: ${mi.uiAccent} !important;
        border: 1px solid ${hexToRgba(mi.uiAccent, 0.28)} !important;
      }

      ${scope} .aistu-improve-option-btn:hover .aistu-improve-option-index {
        background: ${mi.uiAccent} !important;
        color: ${accentTextColor} !important;
        border-color: ${mi.uiAccent} !important;
      }

      ${scope} .aistu-improve-option-arrow {
        color: ${mi.uiAccent} !important;
      }

      ${scope} .aistu-improve-custom-row {
        border-top: 1px solid ${hexToRgba(mi.uiBorder, 0.6)} !important;
      }

      ${scope} .aistu-improve-custom-input {
        background: ${hexToRgba(mi.uiSurface, 0.85)} !important;
        border: 1px solid ${hexToRgba(mi.uiBorder, 0.7)} !important;
        color: ${mi.uiText} !important;
        caret-color: ${mi.uiAccent} !important;
      }

      ${scope} .aistu-improve-custom-input::placeholder {
        color: ${mutedColor} !important;
      }

      ${scope} .aistu-improve-custom-input:focus {
        border-color: ${mi.uiAccent} !important;
        box-shadow: 0 0 0 2px ${hexToRgba(mi.uiAccent, 0.2)} !important;
      }

      ${scope} .aistu-improve-submit-btn {
        background: ${hexToRgba(mi.uiSurface, 0.85)} !important;
        border: 1px solid ${hexToRgba(mi.uiBorder, 0.7)} !important;
        color: ${mutedColor} !important;
      }

      ${scope} .aistu-improve-submit-btn:not(:disabled) {
        background: ${mi.uiAccent} !important;
        border-color: ${mi.uiAccent} !important;
        color: ${accentTextColor} !important;
      }

      ${scope} .aistu-rerun-hold-ring circle {
        stroke: ${mi.uiAccent} !important;
      }

      ${scope} .chat-turn-container.model.edit:not(.aistu-editing-silent),
      ${scope} .chat-turn-container.user.edit:not(.aistu-editing-silent) ms-autosize-textarea {
        background: ${uiSurfaceBg} !important;
        border: 1px solid ${bubbleBorderColor} !important;
        box-shadow: ${bubbleShadowCSS} !important;
        color: ${mi.uiText} !important;
        ${uiBackdropCSS}
      }

      /* === 5. PROMPT BOX (CLEAN SINGLE CONTAINER, FOCUS GLOW & TOOL CHIPS) === */
      ${scope} footer,
      ${scope} footer ms-prompt-box,
      ${scope} ms-prompt-box,
      ${scope} ms-chat-bottom-overlay {
        background: transparent !important;
        background-color: transparent !important;
        border: none !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }

      ${scope} ms-prompt-box .prompt-box-container {
        background: ${uiSurfaceBg} !important;
        background-color: ${uiSurfaceBg} !important;
        border: 1.5px solid ${bubbleBorderColor} !important;
        border-radius: 24px !important;
        color: ${mi.uiText} !important;
        box-shadow: ${isLight ? bubbleShadowCSS : '0 8px 28px rgba(0, 0, 0, 0.28)'} !important;
        transition: border-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease !important;
        ${uiBackdropCSS}
      }

      /* Focus / Typing Highlight: Bright Accent Border + Subtle Glow when typing in Prompt Box */
      ${scope} ms-prompt-box .prompt-box-container:focus-within,
      ${scope} ms-prompt-box:focus-within .prompt-box-container {
        border-color: ${mi.uiAccent} !important;
        box-shadow:
          0 0 0 3px ${hexToRgba(mi.uiAccent, isLight ? 0.22 : 0.26)},
          0 10px 30px -4px ${hexToRgba(mi.uiAccent, isLight ? 0.18 : 0.28)},
          ${isLight ? bubbleShadowCSS : '0 8px 28px rgba(0, 0, 0, 0.34)'} !important;
      }

      /* Keep all inner prompt wrappers transparent so they never stack or overlap */
      ${scope} ms-prompt-box .prompt-box-container :is(
        .text-wrapper,
        ms-prompt-input-wrapper,
        .prompt-input-wrapper,
        .input-wrapper,
        .prompt-input-container,
        ms-chunk-editor,
        ms-autosize-textarea,
        textarea,
        input[ms-input],
        .buttons-row,
        ms-prompt-box-tools,
        ms-horizontal-scroll.enabled-tool-container,
        ms-horizontal-scroll.enabled-tool-container .content-container
      ) {
        background: transparent !important;
        background-color: transparent !important;
        border: none !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }

      ${scope} ms-prompt-box :is(textarea, input[ms-input]) {
        color: ${mi.uiText} !important;
        caret-color: ${mi.uiAccent} !important;
      }
      ${scope} ms-prompt-box :is(textarea, input[ms-input])::placeholder {
        color: ${mutedColor} !important;
        opacity: 0.8 !important;
      }

      /* Inline Text Formatting Toolbar (.sl-fmt-inline) & Sub-controls */
      ${scope} ms-prompt-box .sl-fmt-inline {
        background: ${hexToRgba(mi.uiBase, uiTrans ? clamp(uiAlpha * 0.72, 0.22, 0.88) : 0.58)} !important;
        border: 1px solid ${hexToRgba(mi.uiBorder, 0.65)} !important;
        color: ${mi.uiText} !important;
      }

      ${scope} ms-prompt-box .sl-fmt-inline .sl-fmt-btn {
        color: ${mi.uiText} !important;
        background: transparent !important;
        border: 1px solid transparent !important;
      }

      ${scope} ms-prompt-box .sl-fmt-inline .sl-fmt-btn:hover {
        background: ${hexToRgba(mi.uiAccent, 0.16)} !important;
        border-color: ${hexToRgba(mi.uiAccent, 0.45)} !important;
        color: ${mi.uiAccent} !important;
      }

      ${scope} ms-prompt-box .sl-fmt-inline .sl-fmt-sep {
        background: ${hexToRgba(mi.uiBorder, 0.65)} !important;
      }

      ${scope} ms-prompt-box .sl-fmt-inline .sl-fmt-heading-menu {
        background: ${uiSurfaceBg} !important;
        border: 1px solid ${hexToRgba(mi.uiBorder, 0.75)} !important;
        color: ${mi.uiText} !important;
        ${uiBackdropCSS}
      }

      ${scope} ms-prompt-box .sl-fmt-inline .sl-fmt-heading-item {
        color: ${mi.uiText} !important;
      }
      ${scope} ms-prompt-box .sl-fmt-inline .sl-fmt-heading-item:hover {
        background: ${hexToRgba(mi.uiAccent, 0.18)} !important;
        color: ${mi.uiAccent} !important;
      }

      /* Bottom Enabled Tool Chips inside Prompt Bar (Search, Code Execution, Structured Outputs, Function Calling, etc.) */
      ${scope} ms-prompt-box .enabled-tool-container .enabled-tool {
        background: ${hexToRgba(mi.uiBase, isLight ? 0.78 : 0.58)} !important;
        background-color: ${hexToRgba(mi.uiBase, isLight ? 0.78 : 0.58)} !important;
        border: 1px solid ${hexToRgba(mi.uiAccent, isLight ? 0.42 : 0.36)} !important;
        border-radius: 999px !important;
        padding: 0 5px 0 11px !important;
        height: 32px !important;
        color: ${mi.uiText} !important;
        box-shadow: 0 2px 6px rgba(0, 0, 0, ${isLight ? '0.05' : '0.18'}) !important;
      }

      ${scope} ms-prompt-box .enabled-tool-container .enabled-tool:hover {
        background: ${hexToRgba(mi.uiAccent, 0.16)} !important;
        background-color: ${hexToRgba(mi.uiAccent, 0.16)} !important;
        border-color: ${mi.uiAccent} !important;
      }

      ${scope} ms-prompt-box .enabled-tool-container .enabled-tool .tool-chip-button {
        background: transparent !important;
        border: none !important;
        color: ${mi.uiText} !important;
      }

      ${scope} ms-prompt-box .enabled-tool-container .enabled-tool .tool-icon {
        color: ${mi.uiAccent} !important;
      }

      ${scope} ms-prompt-box .enabled-tool-container .enabled-tool .tool-name {
        color: ${mi.uiText} !important;
        font-weight: 500 !important;
      }

      ${scope} ms-prompt-box .enabled-tool-container .enabled-tool > button:last-child {
        background: transparent !important;
        border: none !important;
        color: ${mutedColor} !important;
      }

      ${scope} ms-prompt-box .enabled-tool-container .enabled-tool > button:last-child:hover {
        background: ${hexToRgba(mi.uiAccent, 0.22)} !important;
        color: ${mi.uiAccent} !important;
      }

      ${scope} :is(ms-add-media-button > button, ms-stt-button > button, .sl-fmt-toggle) {
        border: 1px solid ${hexToRgba(mi.uiBorder, 0.75)} !important;
        color: ${mi.uiText} !important;
        background: ${hexToRgba(mi.uiBase, isLight ? 0.65 : 0.42)} !important;
      }
      ${scope} :is(ms-add-media-button > button:hover, ms-stt-button > button:hover, .sl-fmt-toggle:hover, .sl-fmt-toggle.active) {
        background: ${hexToRgba(mi.uiAccent, 0.16)} !important;
        border-color: ${mi.uiAccent} !important;
        color: ${mi.uiAccent} !important;
      }

      ${scope} :is(button.run-button, ms-run-button button, button[aria-label*="Run" i]):not(:disabled) {
        background: ${mi.uiAccent} !important;
        background-color: ${mi.uiAccent} !important;
        color: ${accentTextColor} !important;
        border-color: transparent !important;
      }

      /* Scroll-to-bottom floating button above Prompt Bar */
      ${scope} #sl-scroll-bottom-btn.sl-scroll-bottom-btn {
        background: ${uiSurfaceBg} !important;
        border: 1px solid ${hexToRgba(mi.uiBorder, 0.75)} !important;
        color: ${mi.uiText} !important;
        box-shadow: 0 6px 20px rgba(0, 0, 0, ${isLight ? '0.12' : '0.35'}) !important;
        ${uiBackdropCSS}
      }
      ${scope} #sl-scroll-bottom-btn.sl-scroll-bottom-btn:hover {
        border-color: ${mi.uiAccent} !important;
        color: ${mi.uiAccent} !important;
      }

      /* === 6. CHAT BUBBLES (USER & MODEL) & UNIFIED FLOATING ACTION DOCK + <X/Y> NAVIGATOR === */
      ${scope} ms-chat-turn,
      ${scope} ms-chat-turn:hover,
      ${scope} ms-chat-turn:focus,
      ${scope} ms-chat-turn:focus-within,
      ${scope} ms-chat-turn:active,
      ${scope} ms-chat-turn.cdk-focused,
      ${scope} ms-chat-turn.cdk-keyboard-focused,
      ${scope} ms-chat-turn.cdk-program-focused,
      ${scope} .chat-turn-container,
      ${scope} .chat-turn-container:hover,
      ${scope} .chat-turn-container:focus,
      ${scope} .chat-turn-container:focus-within,
      ${scope} .chat-turn-container:active,
      ${scope} .chat-turn-container.selected,
      ${scope} .chat-turn-container.user,
      ${scope} .chat-turn-container.model,
      ${scope} .chat-turn-container .user-prompt-container,
      ${scope} .chat-turn-container .model-prompt-container {
        background: transparent !important;
        background-color: transparent !important;
        border: none !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }

      ${scope} .chat-turn-container.model.edit,
      ${scope} .chat-turn-container.user.edit ms-autosize-textarea {
        background-color: ${uiSurfaceBg} !important;
        color: ${mi.uiText} !important;
        border-color: ${hexToRgba(mi.uiAccent, 0.55)} !important;
      }

      ${scope} .mat-mdc-button-persistent-ripple::before,
      ${scope} .mat-mdc-icon-button .mat-mdc-button-persistent-ripple::before,
      ${scope} .mat-ripple-element {
        background-color: ${hexToRgba(mi.uiAccent, isLight ? 0.14 : 0.22)} !important;
      }

      ${scope} .chat-turn-container.user .turn-content {
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }

      /* Ensure Prompt Box outer wrapper never intercepts clicks on action buttons or <X/Y> navigator above it */
      ${scope} footer ms-prompt-box,
      ${scope} ms-prompt-box {
        pointer-events: none !important;
      }
      ${scope} ms-prompt-box .prompt-box-container,
      ${scope} #sl-scroll-bottom-btn.sl-scroll-bottom-btn {
        pointer-events: auto !important;
      }
      ${scope} ms-prompt-box .prompt-box-container::before,
      ${scope} ms-prompt-box .prompt-box-container::after {
        pointer-events: none !important;
      }

      /* Ensure chat scroll container stays below Prompt Bar (footer z-index: 40) and Top Header (z-index: 45) */
      ${scope} ms-autoscroll-container {
        position: relative !important;
        z-index: 1 !important;
      }
      ${scope} footer {
        z-index: 40 !important;
      }
      ${scope} ms-playground-toolbar {
        z-index: 45 !important;
      }

      /* Unified Floating Turn Action Dock (.actions.hover-or-edit) & Response Switcher (.aistu-history-navigator <X/Y>) — Top Pop-Up on Hover, Zero Layout Shift */
      ${scope} .chat-turn-container:not(.edit) {
        position: relative !important;
      }

      ${scope} .chat-turn-container:not(.edit) .actions-container {
        position: absolute !important;
        top: -14px !important;
        bottom: auto !important;
        left: auto !important;
        right: 10px !important;
        width: auto !important;
        height: auto !important;
        min-height: 0 !important;
        max-height: none !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
        display: inline-flex !important;
        flex-direction: row !important;
        align-items: center !important;
        justify-content: flex-end !important;
        gap: 6px !important;
        opacity: 0 !important;
        pointer-events: none !important;
        visibility: hidden !important;
        transform: translateY(6px) scale(0.96) !important;
        z-index: 8 !important;
        transition: opacity 0.16s cubic-bezier(0.22, 1, 0.36, 1), transform 0.16s cubic-bezier(0.22, 1, 0.36, 1), visibility 0.16s ease !important;
      }

      ${scope} .chat-turn-container:has(> .sl-rp-turn-header):not(.edit) .actions-container {
        top: 4px !important;
      }

      ${scope} ms-chat-turn:not(:has(ms-file-chunk)):not(:has(ms-image-chunk)):not(:has(ms-video-chunk)):is(
        :hover,
        :has(.actions-container [aria-expanded="true"])
      ) .chat-turn-container:not(.edit) .actions-container,
      ${scope} .chat-turn-container:not(.edit):not(:has(ms-file-chunk)):not(:has(ms-image-chunk)):not(:has(ms-video-chunk)):is(
        :hover,
        :has(.actions-container [aria-expanded="true"])
      ) > .actions-container {
        opacity: 1 !important;
        pointer-events: auto !important;
        visibility: visible !important;
        transform: translateY(0) scale(1) !important;
      }

      ${scope} .chat-turn-container.edit .actions-container {
        position: relative !important;
        top: auto !important;
        bottom: auto !important;
        left: auto !important;
        right: auto !important;
        height: auto !important;
        min-height: 32px !important;
        max-height: none !important;
        margin-top: 6px !important;
        opacity: 1 !important;
        pointer-events: auto !important;
        visibility: visible !important;
        transform: none !important;
        z-index: 8 !important;
      }

      ${scope} .chat-turn-container .actions.hover-or-edit {
        display: inline-flex !important;
        align-items: center !important;
        gap: 3px !important;
        padding: 3px 6px !important;
        border-radius: 999px !important;
        background: ${uiSurfaceBg} !important;
        background-color: ${uiSurfaceBg} !important;
        border: 1px solid ${hexToRgba(mi.uiBorder, 0.72)} !important;
        box-shadow: 0 6px 18px rgba(0, 0, 0, ${isLight ? '0.10' : '0.28'}) !important;
        width: fit-content !important;
        margin-top: 0 !important;
        opacity: 1 !important;
        visibility: visible !important;
        transform: none !important;
        pointer-events: auto !important;
        z-index: 8 !important;
        ${uiBackdropCSS}
      }

      ${scope} .chat-turn-container.user .actions.hover-or-edit {
        align-self: center !important;
        margin-left: 0 !important;
      }

      ${scope} .chat-turn-container.model .actions.hover-or-edit {
        align-self: center !important;
        margin-right: 0 !important;
      }

      ${scope} .chat-turn-container .actions.hover-or-edit button,
      ${scope} .chat-turn-container .actions.hover-or-edit button.rerun-button,
      ${scope} .chat-turn-container .actions.hover-or-edit button[name="rerun-button"],
      ${scope} .chat-turn-container .actions.hover-or-edit button.ms-button-primary,
      ${scope} .chat-turn-container .actions.hover-or-edit ms-chat-turn-options button {
        background: transparent !important;
        background-color: transparent !important;
        border: none !important;
        border-radius: 999px !important;
        box-shadow: none !important;
        color: ${mutedColor} !important;
        pointer-events: auto !important;
        transition: background-color 0.15s ease, color 0.15s ease !important;
      }

      ${scope} .chat-turn-container .actions.hover-or-edit button:hover,
      ${scope} .chat-turn-container .actions.hover-or-edit button.rerun-button:hover,
      ${scope} .chat-turn-container .actions.hover-or-edit button[name="rerun-button"]:hover,
      ${scope} .chat-turn-container .actions.hover-or-edit ms-chat-turn-options button:hover {
        background: ${hexToRgba(mi.uiAccent, 0.16)} !important;
        background-color: ${hexToRgba(mi.uiAccent, 0.16)} !important;
        color: ${mi.uiAccent} !important;
      }

      /* Response History Switcher (<X/Y> .aistu-history-navigator) — Positioned Below Model Chat Box at Bottom-Left Corner */
      ${scope} .chat-turn-container.model {
        display: flex !important;
        flex-direction: column !important;
      }

      ${scope} .aistu-history-navigator {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: flex-start !important;
        gap: 4px !important;
        padding: 3px 6px !important;
        border-radius: 999px !important;
        background: ${uiSurfaceBg} !important;
        background-color: ${uiSurfaceBg} !important;
        border: 1px solid ${hexToRgba(mi.uiBorder, 0.72)} !important;
        box-shadow: 0 6px 18px rgba(0, 0, 0, ${isLight ? '0.10' : '0.28'}) !important;
        width: fit-content !important;
        margin: 4px auto 2px 4px !important;
        align-self: flex-start !important;
        opacity: 1 !important;
        visibility: visible !important;
        pointer-events: auto !important;
        position: relative !important;
        z-index: 8 !important;
        ${uiBackdropCSS}
      }

      ${scope} .aistu-history-navigator .aistu-nav-btn {
        background: transparent !important;
        background-color: transparent !important;
        border: none !important;
        border-radius: 999px !important;
        color: ${mi.uiText} !important;
        width: 22px !important;
        height: 22px !important;
        pointer-events: auto !important;
      }

      ${scope} .aistu-history-navigator .aistu-nav-btn:hover:not(:disabled) {
        background: ${hexToRgba(mi.uiAccent, 0.18)} !important;
        background-color: ${hexToRgba(mi.uiAccent, 0.18)} !important;
        color: ${mi.uiAccent} !important;
      }

      ${scope} .aistu-history-navigator .aistu-nav-btn:disabled {
        color: ${mutedColor} !important;
        opacity: 0.35 !important;
      }

      ${scope} .aistu-history-navigator .aistu-nav-label {
        color: ${mi.uiAccent} !important;
        font-weight: 700 !important;
        padding: 0 4px !important;
      }

      /* User Chat Bubble */
      ${userBubbleOn ? `
      ${scope} .chat-turn-container.user ms-prompt-chunk:not(:has(ms-file-chunk)):not(:has(ms-video-chunk)):not(:has(ms-image-chunk)):not(:has(textarea)) {
        background: ${userBubbleFinalBg} !important;
        background-color: ${userBubbleFinalBg} !important;
        border: 1px solid ${bubbleBorderColor} !important;
        border-radius: 24px !important;
        padding: 12px 22px !important;
        color: ${userTxt} !important;
        box-shadow: ${bubbleShadowCSS} !important;
        ${userBubbleFilter}
      }
      ` : `
      ${scope} .chat-turn-container.user ms-prompt-chunk:not(:has(ms-file-chunk)):not(:has(ms-video-chunk)):not(:has(ms-image-chunk)):not(:has(textarea)) {
        background: transparent !important;
        background-color: transparent !important;
        border: none !important;
        box-shadow: none !important;
        padding: 4px 0 !important;
        color: ${userTxt} !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }
      `}

      /* Continuation turns in a contiguous same-role group NEVER repeat Author Label or Roleplay Header */
      ${scope} ms-chat-turn[data-sl-group-continuation="true"] :is(.author-label, .turn-separator, .sl-rp-turn-header) {
        display: none !important;
      }

      ${scope} ms-chat-turn[data-sl-group-continuation="true"] {
        margin-top: 0 !important;
        padding-top: 0 !important;
      }

      ${scope} ms-chat-turn[data-sl-thought-turn="true"] :is(.author-label, .turn-separator),
      ${scope} .chat-turn-container.model:has(ms-thought-chunk) :is(.author-label, .turn-separator) {
        display: none !important;
      }

      /* Compact Think Block Turn: zero top & bottom padding on container and collapse virtual-scroll height spacer */
      ${scope} ms-chat-turn[data-sl-thought-turn="true"],
      ${scope} ms-chat-turn[data-sl-thought-turn="true"] .chat-turn-container.model,
      ${scope} ms-chat-turn[data-sl-thought-turn="true"] .virtual-scroll-container.model-prompt-container,
      ${scope} ms-chat-turn[data-sl-thought-turn="true"] ms-prompt-chunk,
      ${scope} .chat-turn-container.model:has(ms-thought-chunk):not(:has(ms-text-chunk:not(ms-thought-chunk *))),
      ${scope} .chat-turn-container.model:has(ms-thought-chunk):not(:has(ms-text-chunk:not(ms-thought-chunk *))) .virtual-scroll-container.model-prompt-container,
      ${scope} .chat-turn-container.model:has(ms-thought-chunk):not(:has(ms-text-chunk:not(ms-thought-chunk *))) ms-prompt-chunk {
        padding-top: 0 !important;
        padding-bottom: 0 !important;
        min-height: 0 !important;
      }

      ${scope} ms-chat-turn[data-sl-thought-turn="true"] .virtual-scroll-container:has(> .turn-content) > div:not(.turn-content),
      ${scope} .chat-turn-container.model:has(ms-thought-chunk) .virtual-scroll-container:has(> .turn-content) > div:not(.turn-content),
      ${scope} ms-chat-turn[data-sl-thought-turn="true"] .turn-footer,
      ${scope} .chat-turn-container.model:has(ms-thought-chunk):not(:has(ms-text-chunk:not(ms-thought-chunk *))) .turn-footer {
        display: none !important;
        height: 0 !important;
        min-height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
      }

      ${scope} ms-chat-turn[data-sl-thought-turn="true"] .turn-content,
      ${scope} .chat-turn-container.model:has(ms-thought-chunk) .turn-content {
        background: transparent !important;
        background-color: transparent !important;
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
        margin: 0 !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }

      /* Model Chat Bubble: applies to .turn-content when turn has no ms-thought-chunk,
         or ONLY to ms-text-chunk OUTSIDE ms-thought-chunk if a turn contains both */
      ${modelBubbleOn ? `
      ${scope} .chat-turn-container.model:not(:has(ms-thought-chunk)):not(.thought-activity-host) .turn-content,
      ${scope} .chat-turn-container.model:has(ms-thought-chunk) ms-text-chunk:not(ms-thought-chunk *) {
        display: block !important;
        background: ${modelBubbleFinalBg} !important;
        background-color: ${modelBubbleFinalBg} !important;
        border: 1px solid ${bubbleBorderColor} !important;
        border-radius: 22px !important;
        padding: 16px 22px !important;
        box-sizing: border-box !important;
        width: 100% !important;
        box-shadow: ${bubbleShadowCSS} !important;
        ${modelBubbleFilter}
      }
      ` : `
      ${scope} .chat-turn-container.model .turn-content,
      ${scope} .chat-turn-container.model ms-text-chunk {
        background: transparent !important;
        background-color: transparent !important;
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }
      `}

      /* === 7. SPECIAL BLOCKS (SLEEK IDE CODE BLOCK) & UNIFIED THINK BLOCK === */
      /* Reset outer ms-code-block wrappers so only mat-expansion-panel forms the single card shape */
      ${scope} ms-code-block,
      ${scope} ms-code-block > .container {
        display: block !important;
        width: 100% !important;
        background: transparent !important;
        background-color: transparent !important;
        border: none !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        padding: 0 !important;
        margin: 12px 0 !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }

      ${scope} ms-code-block mat-expansion-panel {
        background: ${specialBlockBg} !important;
        background-color: ${specialBlockBg} !important;
        border: 1px solid ${hexToRgba(mi.uiBorder, isLight ? 0.82 : 0.68)} !important;
        border-radius: 14px !important;
        overflow: hidden !important;
        margin: 0 !important;
        box-shadow: ${isLight ? '0 4px 16px rgba(15, 23, 42, 0.06)' : '0 6px 20px rgba(0, 0, 0, 0.22)'} !important;
        color: ${mi.uiText} !important;
        ${specialBlockFilter}
      }

      ${scope} ms-code-block mat-expansion-panel-header {
        height: 40px !important;
        min-height: 40px !important;
        max-height: 40px !important;
        padding: 0 10px 0 12px !important;
        background: ${specialBlockHeaderBg} !important;
        background-color: ${specialBlockHeaderBg} !important;
        border-bottom: 1px solid ${hexToRgba(mi.uiBorder, 0.52)} !important;
        border-radius: 0 !important;
        color: ${mi.uiText} !important;
        display: flex !important;
        align-items: center !important;
      }

      ${scope} ms-code-block mat-expansion-panel:not(.mat-expanded) mat-expansion-panel-header {
        border-bottom: none !important;
      }

      /* Hide duplicate right-side Material expansion indicator inside ms-code-block header */
      ${scope} ms-code-block mat-expansion-panel-header .mat-expansion-indicator {
        display: none !important;
      }

      ${scope} ms-code-block mat-expansion-panel-header .mat-content {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        width: 100% !important;
        margin: 0 !important;
        overflow: visible !important;
      }

      ${scope} ms-code-block .mat-expansion-panel-header-title {
        display: inline-flex !important;
        align-items: center !important;
        gap: 6px !important;
        margin: 0 !important;
        flex: 0 1 auto !important;
        color: ${mi.uiText} !important;
      }

      ${scope} ms-code-block .title-text {
        font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;
        font-size: 12px !important;
        font-weight: 600 !important;
        letter-spacing: 0.3px !important;
        color: ${mi.uiAccent} !important;
        background: ${hexToRgba(mi.uiAccent, 0.14)} !important;
        padding: 2px 8px !important;
        border-radius: 6px !important;
      }

      ${scope} ms-code-block .mat-expansion-panel-header-description {
        margin: 0 !important;
        flex: 0 0 auto !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: flex-end !important;
      }

      ${scope} ms-code-block .actions-container {
        display: inline-flex !important;
        align-items: center !important;
        gap: 4px !important;
        margin: 0 !important;
        padding: 0 !important;
        background: transparent !important;
        border: none !important;
      }

      ${scope} ms-code-block mat-expansion-panel-header button {
        width: 28px !important;
        height: 28px !important;
        min-width: 28px !important;
        padding: 0 !important;
        margin: 0 !important;
        border-radius: 8px !important;
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
        color: ${mutedColor} !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
      }

      ${scope} ms-code-block mat-expansion-panel-header button:hover {
        background: ${hexToRgba(mi.uiAccent, 0.15)} !important;
        color: ${mi.uiAccent} !important;
      }

      ${scope} ms-code-block :is(
        .mat-expansion-panel-content-wrapper,
        .mat-expansion-panel-content,
        .mat-expansion-panel-body
      ) {
        padding: 0 !important;
        margin: 0 !important;
        background: transparent !important;
        background-color: transparent !important;
        border: none !important;
        box-shadow: none !important;
      }

      ${scope} ms-code-block pre {
        margin: 0 !important;
        padding: 14px 18px !important;
        background: transparent !important;
        background-color: transparent !important;
        border: none !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        overflow-x: auto !important;
        font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;
        font-size: 13.5px !important;
        line-height: 1.6 !important;
        color: ${mi.uiText} !important;
      }

      ${scope} ms-code-block pre code {
        background: transparent !important;
        background-color: transparent !important;
        border: none !important;
        padding: 0 !important;
        font-family: inherit !important;
        font-size: inherit !important;
        color: inherit !important;
      }

      /* Standalone <pre> blocks outside ms-code-block */
      ${scope} ms-chat-turn pre:not(ms-code-block pre) {
        background: ${specialBlockBg} !important;
        background-color: ${specialBlockBg} !important;
        border: 1px solid ${hexToRgba(mi.uiBorder, 0.65)} !important;
        border-radius: 14px !important;
        padding: 14px 18px !important;
        margin: 10px 0 !important;
        overflow-x: auto !important;
        color: ${mi.uiText} !important;
        ${specialBlockFilter}
      }

      /* Compact, Unified Think Block (ms-thought-chunk): ZERO inner text bubble or extra background */
      ${scope} ms-thought-chunk {
        display: block !important;
        position: relative !important;
        overflow: visible !important;
        width: fit-content !important;
        max-width: 100% !important;
        margin: 2px 0 !important;
        padding: 0 !important;
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
      }
      ${scope} ms-thought-chunk:has(.mat-expanded) {
        width: 100% !important;
      }

      /* Style mat-accordion as the single outer card so thought-panel and footer panel never form 2 separate boxes */
      ${scope} ms-thought-chunk mat-accordion.compact-accordion,
      ${scope} ms-thought-chunk > mat-accordion {
        display: block !important;
        position: relative !important;
        background: ${specialBlockBg} !important;
        background-color: ${specialBlockBg} !important;
        border: 1px solid ${hexToRgba(mi.uiBorder, 0.58)} !important;
        border-radius: 14px !important;
        box-shadow: ${isLight ? '0 2px 8px rgba(15, 23, 42, 0.06)' : 'none'} !important;
        margin: 0 !important;
        overflow: visible !important;
        color: ${mi.uiText} !important;
        ${specialBlockFilter}
      }

      /* Force all inner panels, wrappers, ms-text-chunk, and markdown nodes inside ms-thought-chunk to be 100% transparent */
      ${scope} ms-thought-chunk :is(
        .thought-panel,
        mat-expansion-panel,
        .mat-expansion-panel-content-wrapper,
        .mat-expansion-panel-content,
        .mat-expansion-panel-body,
        ms-text-chunk,
        [mssnapshotlink],
        ms-cmark-node,
        .thought-collapsed-text-container,
        .thought-panel-footer,
        p, ul, ol, li, blockquote
      ) {
        background: transparent !important;
        background-color: transparent !important;
        background-image: none !important;
        border: none !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }

      ${scope} ms-thought-chunk :is(mat-expansion-panel, ms-text-chunk, [mssnapshotlink], ms-cmark-node) {
        margin: 0 !important;
        padding: 0 !important;
      }

      ${scope} ms-thought-chunk mat-expansion-panel-header {
        height: auto !important;
        min-height: 36px !important;
        padding: 6px 14px !important;
        background: transparent !important;
        background-color: transparent !important;
        border: none !important;
        color: ${mutedColor} !important;
      }

      ${scope} ms-thought-chunk mat-expansion-panel.mat-expanded mat-expansion-panel-header {
        background: ${specialBlockHeaderBg} !important;
        background-color: ${specialBlockHeaderBg} !important;
        border-bottom: 1px solid ${hexToRgba(mi.uiBorder, 0.42)} !important;
      }

      ${scope} ms-thought-chunk :is(.thinking-progress-panel, mat-panel-title) {
        display: inline-flex !important;
        align-items: center !important;
        gap: 6px !important;
        margin: 0 !important;
        font-size: 12.5px !important;
        line-height: 1.3 !important;
        color: ${mutedColor} !important;
      }

      ${scope} ms-thought-chunk .thinking-label {
        font-size: 12.5px !important;
        font-weight: 600 !important;
        color: ${mi.uiText} !important;
      }

      ${scope} ms-thought-chunk .thinking-progress-icon {
        font-size: 16px !important;
        width: 16px !important;
        height: 16px !important;
        color: ${mi.uiAccent} !important;
      }

      ${scope} ms-thought-chunk .thought-panel .mat-expansion-panel-body {
        padding: 12px 16px !important;
        font-size: 13px !important;
        line-height: 1.55 !important;
        color: ${mutedColor} !important;
        max-height: 320px !important;
        overflow-y: auto !important;
      }

      ${scope} ms-thought-chunk .thought-panel .mat-expansion-panel-body :is(p, li, span:not(.material-symbols-outlined)) {
        font-size: 13px !important;
        line-height: 1.55 !important;
        color: ${mutedColor} !important;
      }

      /* Hide secondary footer expansion panel ONLY when thought-panel is collapsed; show it when expanded so user can click to collapse */
      ${scope} ms-thought-chunk:not(:has(.thought-panel.mat-expanded)):not(:has(.thought-panel mat-expansion-panel-header[aria-expanded="true"])) :is(
        mat-expansion-panel:has(.thought-panel-footer, .thought-collapsed-text-container, .thought-collapsed-text),
        mat-expansion-panel:not(.thought-panel)[disabled]
      ) {
        display: none !important;
        height: 0 !important;
        min-height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
        border: none !important;
      }

      ${scope} ms-thought-chunk:is(:has(.thought-panel.mat-expanded), :has(.thought-panel mat-expansion-panel-header[aria-expanded="true"])) :is(
        mat-expansion-panel:has(.thought-panel-footer, .thought-collapsed-text-container, .thought-collapsed-text),
        mat-expansion-panel:not(.thought-panel)[disabled]
      ) {
        display: block !important;
        border-top: 1px solid ${hexToRgba(mi.uiBorder, 0.38)} !important;
        pointer-events: auto !important;
        cursor: pointer !important;
      }

      ${scope} ms-thought-chunk:is(:has(.thought-panel.mat-expanded), :has(.thought-panel mat-expansion-panel-header[aria-expanded="true"])) :is(
        mat-expansion-panel:has(.thought-panel-footer, .thought-collapsed-text-container, .thought-collapsed-text),
        mat-expansion-panel:not(.thought-panel)[disabled]
      ) :is(mat-expansion-panel-header, .mat-content, mat-panel-title, .thought-panel-footer, .thought-collapsed-text-container, .thought-collapsed-text, .footer-icon) {
        pointer-events: auto !important;
        cursor: pointer !important;
      }

      ${scope} ms-thought-chunk:is(:has(.thought-panel.mat-expanded), :has(.thought-panel mat-expansion-panel-header[aria-expanded="true"])) :is(
        mat-expansion-panel:has(.thought-panel-footer, .thought-collapsed-text-container, .thought-collapsed-text),
        mat-expansion-panel:not(.thought-panel)[disabled]
      ) mat-expansion-panel-header {
        display: flex !important;
        align-items: center !important;
        min-height: 32px !important;
        padding: 4px 14px !important;
        pointer-events: auto !important;
        cursor: pointer !important;
      }

      ${scope} ms-chat-turn :is(code:not(pre code), span.inline-code) {
        background: ${hexToRgba(mi.uiAccent, 0.14)} !important;
        color: ${mi.uiAccent} !important;
        border: 1px solid ${hexToRgba(mi.uiAccent, 0.28)} !important;
        border-radius: 6px !important;
        padding: 1px 6px !important;
      }

      /* === 8. ROLEPLAY AVATARS & CUSTOM NAMES (SINGLE HEADER PER CONTIGUOUS GROUP) === */
      ${hideNativeModelAuthor ? `
      ${scope} .chat-turn-container.model .author-label,
      ${scope} .chat-turn-container.model .turn-separator {
        display: none !important;
      }
      ` : ''}

      ${scope} .chat-turn-container.model {
        display: flex !important;
        flex-direction: column !important;
        align-items: flex-start !important;
      }

      ${scope} .chat-turn-container.user {
        display: flex !important;
        flex-direction: column !important;
        align-items: flex-end !important;
      }

      ${scope} .sl-rp-turn-header {
        display: inline-flex !important;
        flex-direction: row !important;
        align-items: center !important;
        gap: 10px !important;
        margin-bottom: 8px !important;
        padding: 0 2px !important;
        width: fit-content !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
        user-select: none !important;
        order: -1 !important;
      }

      ${scope} .chat-turn-container.model > .sl-rp-turn-header,
      ${scope} .chat-turn-container.model .turn-content > .sl-rp-turn-header,
      ${scope} .sl-rp-turn-header.sl-rp-model-header:not(.sl-rp-group-row) {
        justify-content: flex-start !important;
        align-self: flex-start !important;
        margin-right: auto !important;
        margin-left: 0 !important;
        order: -1 !important;
      }

      /* When a single Model turn contains both ms-thought-chunk and main response text, keep the Roleplay Header right above the main chat bubble (after ms-thought-chunk) */
      ${scope} .chat-turn-container.model .turn-content > .sl-rp-turn-header {
        order: initial !important;
        margin-top: 6px !important;
        margin-bottom: 8px !important;
      }

      /* Never show Roleplay Header on a thought-only turn */
      ${scope} ms-chat-turn[data-sl-thought-turn="true"] .sl-rp-turn-header {
        display: none !important;
      }

      ${scope} .chat-turn-container.user > .sl-rp-turn-header,
      ${scope} .sl-rp-turn-header.sl-rp-user-header:not(.sl-rp-group-row) {
        justify-content: flex-end !important;
        align-self: flex-end !important;
        margin-left: auto !important;
        margin-right: 0 !important;
        order: -1 !important;
      }

      /* Full-width group header row inserted above 112px media-tile turn groups */
      ${scope} .chat-session-content > .sl-rp-turn-header.sl-rp-group-row {
        flex: 0 0 100% !important;
        width: 100% !important;
        max-width: 100% !important;
        display: flex !important;
        align-items: center !important;
        margin: 10px 0 6px 0 !important;
        padding: 0 2px !important;
        order: 0 !important;
      }

      ${scope} .chat-session-content > .sl-rp-turn-header.sl-rp-group-row.sl-rp-user-header {
        justify-content: flex-end !important;
      }

      ${scope} .chat-session-content > .sl-rp-turn-header.sl-rp-group-row.sl-rp-model-header {
        justify-content: flex-start !important;
      }

      ${scope} .sl-rp-avatar {
        width: ${avatarSizePx}px !important;
        height: ${avatarSizePx}px !important;
        min-width: ${avatarSizePx}px !important;
        min-height: ${avatarSizePx}px !important;
        border-radius: ${avatarRadiusPct}% !important;
        border: 1.5px solid ${mi.uiAccent} !important;
        background: ${mi.uiSurface} center/cover no-repeat !important;
        color: ${mi.uiAccent} !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-weight: 700 !important;
        font-size: ${Math.max(12, Math.round(avatarSizePx * 0.42))}px !important;
        overflow: hidden !important;
        flex-shrink: 0 !important;
        box-shadow: 0 2px 10px rgba(0, 0, 0, ${isLight ? '0.12' : '0.25'}) !important;
      }

      ${scope} .sl-rp-avatar img {
        width: 100% !important;
        height: 100% !important;
        object-fit: cover !important;
        display: block !important;
      }

      ${scope} .sl-rp-name {
        font-size: ${nameSizePx}px !important;
        font-weight: 700 !important;
        color: ${mi.uiAccent} !important;
        line-height: 1.25 !important;
        letter-spacing: 0.2px !important;
      }

      /* === 9. TYPOGRAPHY & QUOTED DIALOGUE HIGHLIGHTING ("abc") === */
      ${fontCssValue ? `
      ${scope} ms-chat-turn .turn-content,
      ${scope} ms-chat-turn .turn-content :is(p, li, span, div, blockquote):not(.material-symbols-outlined):not(mat-icon):not(code):not(pre):not(pre *):not(.sl-rp-turn-header):not(.sl-rp-turn-header *),
      ${scope} ms-prompt-box textarea {
        font-family: ${fontCssValue} !important;
      }
      ` : ''}

      ${scope} ms-chat-turn:not([data-sl-thought-turn="true"]) .turn-content,
      ${scope} ms-chat-turn:not([data-sl-thought-turn="true"]) .turn-content :is(p, li):not(ms-thought-chunk *),
      ${scope} .chat-turn-container.user ms-prompt-chunk {
        font-size: ${fontSizePx}px !important;
        line-height: 1.65 !important;
      }

      ${scope} .chat-turn-container.model .turn-content,
      ${scope} .chat-turn-container.model .turn-content :is(p, li, ul, ol, span:not(.sl-quote-highlight):not(.sl-rp-name):not(.sl-rp-turn-header *):not(.hljs *):not(code)):not(ms-thought-chunk *) {
        color: ${modelTxt} !important;
      }

      ${scope} .chat-turn-container.user .turn-content,
      ${scope} .chat-turn-container.user .turn-content :is(p, li, ul, ol, span:not(.sl-quote-highlight):not(.sl-rp-name):not(.sl-rp-turn-header *):not(code)),
      ${scope} .chat-turn-container.user ms-prompt-chunk :is(p, li, ul, ol, span:not(.sl-quote-highlight):not(.sl-rp-name):not(.sl-rp-turn-header *):not(code)) {
        color: ${userTxt} !important;
      }

      ${quoteOn ? `
      ${scope} .chat-turn-container.model .sl-quote-highlight,
      ${scope} .chat-turn-container.model .turn-content .sl-quote-highlight,
      ${scope} .chat-turn-container.model ms-text-chunk .sl-quote-highlight,
      ${scope} .chat-turn-container.model .sl-quote-highlight * {
        color: ${typo.modelQuoteColor || mi.uiAccent} !important;
        font-weight: 700 !important;
      }
      ${scope} .chat-turn-container.user .sl-quote-highlight,
      ${scope} .chat-turn-container.user .turn-content .sl-quote-highlight,
      ${scope} .chat-turn-container.user ms-prompt-chunk .sl-quote-highlight,
      ${scope} .chat-turn-container.user .sl-quote-highlight * {
        color: ${typo.userQuoteColor || mi.uiAccent} !important;
        font-weight: 700 !important;
      }
      ` : ''}

      /* === 9B. UI GEOMETRY & DIALOGUE STYLE PRESETS (100% THEME PALETTE INVARIANT) === */
      ${isCartoonPixel ? buildCartoonPixelStyleCSS(scope, notSettings, {
        mi,
        isLight,
        mutedColor,
        accentTextColor,
        uiSurfaceBg,
        uiBackdropCSS,
        uiTrans,
        uiAlpha,
        userBubbleFinalBg,
        modelBubbleFinalBg
      }) : ''}

      ${isWinterFrost ? buildWinterFrostStyleCSS(scope, notSettings, {
        mi,
        isLight,
        mutedColor,
        accentTextColor,
        uiSurfaceBg,
        uiBackdropCSS,
        uiTrans,
        uiAlpha,
        userBubbleFinalBg,
        modelBubbleFinalBg
      }) : ''}

      ${customStyleDef ? buildCustomStyleLabCSS(customStyleDef, scope, notSettings, {
        mi,
        isLight,
        mutedColor,
        accentTextColor,
        uiSurfaceBg,
        uiBackdropCSS,
        uiTrans,
        uiAlpha,
        userBubbleFinalBg,
        modelBubbleFinalBg
      }) : ''}

      /* === 9C. MESSENGER-STYLE GROUPED BUBBLE CORNERS & CONSECUTIVE TEXT BUBBLE 1PX MARGIN + TOP 50% / BOTTOM 50% DECORATION SPLIT === */
      /* Zero out container padding/margin on connected edges so the bubble elements themselves maintain an exact 1px gap */
      ${scope} ms-chat-turn[data-sl-bubble-pos="first"],
      ${scope} ms-chat-turn[data-sl-bubble-pos="first"] .chat-turn-container {
        padding-bottom: 0 !important;
        margin-bottom: 0 !important;
      }
      ${scope} ms-chat-turn[data-sl-bubble-pos="middle"],
      ${scope} ms-chat-turn[data-sl-bubble-pos="middle"] .chat-turn-container {
        padding-top: 0 !important;
        padding-bottom: 0 !important;
        margin-top: 0 !important;
        margin-bottom: 0 !important;
      }
      ${scope} ms-chat-turn[data-sl-bubble-pos="last"],
      ${scope} ms-chat-turn[data-sl-bubble-pos="last"] .chat-turn-container {
        padding-top: 0 !important;
        margin-top: 0 !important;
      }

      /* User consecutive filled bubbles: first points down-right (margin-bottom: 1px), middle points both ways (margin-top: 1px; margin-bottom: 1px), last points up-right (margin-top: 1px) */
      ${scope} ms-chat-turn[data-sl-bubble-pos="first"] .chat-turn-container.user ms-prompt-chunk:not(:has(ms-file-chunk)):not(:has(ms-video-chunk)):not(:has(ms-image-chunk)):not(:has(textarea)) {
        border-bottom-right-radius: 6px !important;
        margin-bottom: 1px !important;
      }
      ${scope} ms-chat-turn[data-sl-bubble-pos="middle"] .chat-turn-container.user ms-prompt-chunk:not(:has(ms-file-chunk)):not(:has(ms-video-chunk)):not(:has(ms-image-chunk)):not(:has(textarea)) {
        border-top-right-radius: 6px !important;
        border-bottom-right-radius: 6px !important;
        margin-top: 1px !important;
        margin-bottom: 1px !important;
      }
      ${scope} ms-chat-turn[data-sl-bubble-pos="last"] .chat-turn-container.user ms-prompt-chunk:not(:has(ms-file-chunk)):not(:has(ms-video-chunk)):not(:has(ms-image-chunk)):not(:has(textarea)) {
        border-top-right-radius: 6px !important;
        margin-top: 1px !important;
      }

      /* Model consecutive filled bubbles: first points down-left (margin-bottom: 1px), middle points both ways (margin-top: 1px; margin-bottom: 1px), last points up-left (margin-top: 1px) */
      ${scope} ms-chat-turn[data-sl-bubble-pos="first"] .chat-turn-container.model:not(:has(ms-thought-chunk)):not(.thought-activity-host) .turn-content,
      ${scope} ms-chat-turn[data-sl-bubble-pos="first"] .chat-turn-container.model:has(ms-thought-chunk) ms-text-chunk:not(ms-thought-chunk *) {
        border-bottom-left-radius: 6px !important;
        margin-bottom: 1px !important;
      }
      ${scope} ms-chat-turn[data-sl-bubble-pos="middle"] .chat-turn-container.model:not(:has(ms-thought-chunk)):not(.thought-activity-host) .turn-content,
      ${scope} ms-chat-turn[data-sl-bubble-pos="middle"] .chat-turn-container.model:has(ms-thought-chunk) ms-text-chunk:not(ms-thought-chunk *) {
        border-top-left-radius: 6px !important;
        border-bottom-left-radius: 6px !important;
        margin-top: 1px !important;
        margin-bottom: 1px !important;
      }
      ${scope} ms-chat-turn[data-sl-bubble-pos="last"] .chat-turn-container.model:not(:has(ms-thought-chunk)):not(.thought-activity-host) .turn-content,
      ${scope} ms-chat-turn[data-sl-bubble-pos="last"] .chat-turn-container.model:has(ms-thought-chunk) ms-text-chunk:not(ms-thought-chunk *) {
        border-top-left-radius: 6px !important;
        margin-top: 1px !important;
      }

      /* Consecutive Text Bubble Top 50% vs. Bottom 50% Decoration Split (applies only to text bubbles, excluding Think blocks):
         - First bubble (data-sl-decor-top="true"): shows Top 50% decoration, clips away Bottom 50% decoration, margin-bottom: 1px
         - Middle bubble (data-sl-decor-mid="true"): hides both Top 50% and Bottom 50% decorations, margin-top: 1px & margin-bottom: 1px
         - Last bubble (data-sl-decor-bottom="true"): shows Bottom 50% decoration, hides Top 50% decoration & mascot, margin-top: 1px */
      ${scope} :not(ms-chat-turn):is([data-sl-decor-top="true"], [data-sl-decor-pos="top"]) {
        margin-bottom: 1px !important;
      }
      ${scope} :is([data-sl-decor-top="true"], [data-sl-decor-pos="top"])::before {
        clip-path: inset(-150px -150px 50% -150px) !important;
      }
      ${scope} :not(ms-chat-turn):is([data-sl-decor-mid="true"], [data-sl-decor-pos="middle"]) {
        margin-top: 1px !important;
        margin-bottom: 1px !important;
      }
      ${scope} :is([data-sl-decor-mid="true"], [data-sl-decor-pos="middle"])::before,
      ${scope} :is([data-sl-decor-mid="true"], [data-sl-decor-pos="middle"])::after {
        display: none !important;
        content: none !important;
        background-image: none !important;
      }
      ${scope} :not(ms-chat-turn):is([data-sl-decor-bottom="true"], [data-sl-decor-pos="bottom"]) {
        margin-top: 1px !important;
      }
      ${scope} :is([data-sl-decor-bottom="true"], [data-sl-decor-pos="bottom"])::before {
        clip-path: inset(50% -150px -150px -150px) !important;
      }
      ${scope} :is([data-sl-decor-bottom="true"], [data-sl-decor-pos="bottom"])::after {
        display: none !important;
        content: none !important;
        background-image: none !important;
      }

      /* === 10. STUDIO.LAB SETTINGS PANEL THEME SYNC === */
      ${settingsThemeSyncCSS(scope, {
        mi,
        mode,
        isLight,
        mutedColor,
        accentTextColor,
        uiTrans,
        hasPageBg,
        uiAlpha,
        uiBlurPx,
        uiBackdropCSS
      })}
    `;
  }

  function buildCartoonPixelStyleCSS(scope, notSettings, {
    mi,
    isLight,
    mutedColor,
    accentTextColor,
    uiSurfaceBg,
    uiBackdropCSS,
    uiTrans,
    uiAlpha
  }) {
    // Curated optimal 8-bit RPG geometry constants (1-click perfection, no sub-settings)
    const bw = 3;
    const sh = 5;
    const smBw = 2;
    const smSh = 3;
    const shadowTone = isLight ? blendHex(mi.uiBorder, mi.uiAccent, 0.35) : mi.uiBorder;
    const cardInnerBg = hexToRgba(mi.uiBase, uiTrans ? clamp(uiAlpha * 0.78, 0.22, 0.9) : 0.72);

    return `
      /* 1. User Chat Bubble — 8-Bit Stepped Frame, Arcade Block Shadow, RPG Corner Rivet & Speech Tail */
      ${scope} .chat-turn-container.user ms-prompt-chunk:not(:has(ms-file-chunk)):not(:has(ms-video-chunk)):not(:has(ms-image-chunk)):not(:has(textarea)) {
        position: relative !important;
        border-radius: 0 !important;
        border: ${bw}px solid ${mi.uiAccent} !important;
        padding: 14px 22px !important;
        margin-top: ${bw * 3}px !important;
        margin-bottom: ${sh + 6}px !important;
        margin-right: ${sh + 4}px !important;
        overflow: visible !important;
        box-shadow:
          inset 0 0 0 ${bw}px ${mi.uiBase},
          inset ${bw * 2}px ${bw * 2}px 0 0 ${hexToRgba(mi.uiAccent, 0.20)},
          ${sh}px ${sh}px 0 0 ${shadowTone},
          ${sh + bw}px ${sh + bw}px 0 0 ${hexToRgba(mi.uiAccent, 0.42)} !important;
      }

      /* Stepped 8-bit speech tail pointing up-right toward User */
      ${scope} .chat-turn-container.user ms-prompt-chunk:not(:has(ms-file-chunk)):not(:has(ms-video-chunk)):not(:has(ms-image-chunk)):not(:has(textarea))::before {
        content: '' !important;
        position: absolute !important;
        top: -${bw * 3}px !important;
        right: 18px !important;
        width: ${bw * 2}px !important;
        height: ${bw * 2}px !important;
        background: ${mi.uiAccent} !important;
        box-shadow:
          -${bw}px ${bw}px 0 0 ${mi.uiAccent},
          ${bw}px ${bw}px 0 0 ${mi.uiAccent} !important;
        pointer-events: none !important;
        z-index: 3 !important;
      }

      /* RPG Corner Badge Rivets on User Bubble */
      ${scope} .chat-turn-container.user ms-prompt-chunk:not(:has(ms-file-chunk)):not(:has(ms-video-chunk)):not(:has(ms-image-chunk)):not(:has(textarea))::after {
        content: '' !important;
        position: absolute !important;
        top: ${bw + 3}px !important;
        left: ${bw + 3}px !important;
        width: ${bw * 2}px !important;
        height: ${bw * 2}px !important;
        background: ${mi.uiAccent} !important;
        box-shadow: ${bw * 2 + 3}px 0 0 0 ${hexToRgba(mi.uiAccent, 0.5)} !important;
        pointer-events: none !important;
        z-index: 3 !important;
      }

      /* 2. Model Chat Bubble — 8-Bit RPG Dialogue Frame, Arcade Block Shadow, RPG Corner Rivet & Speech Tail */
      ${scope} .chat-turn-container.model:not(:has(ms-thought-chunk)):not(.thought-activity-host) .turn-content,
      ${scope} .chat-turn-container.model:has(ms-thought-chunk) ms-text-chunk:not(ms-thought-chunk *) {
        position: relative !important;
        border-radius: 0 !important;
        border: ${bw}px solid ${shadowTone} !important;
        padding: 18px 24px !important;
        margin-top: ${bw * 3}px !important;
        margin-bottom: ${sh + 8}px !important;
        margin-right: ${sh + 6}px !important;
        width: calc(100% - ${sh + 8}px) !important;
        overflow: visible !important;
        box-shadow:
          inset 0 0 0 ${bw}px ${mi.uiBase},
          inset -${bw * 2}px -${bw * 2}px 0 0 ${hexToRgba(mi.uiAccent, 0.15)},
          ${sh}px ${sh}px 0 0 ${mi.uiAccent},
          ${sh + bw}px ${sh + bw}px 0 0 ${shadowTone} !important;
      }

      /* Stepped 8-bit speech tail pointing up-left toward Model */
      ${scope} .chat-turn-container.model:not(:has(ms-thought-chunk)):not(.thought-activity-host) .turn-content::before,
      ${scope} .chat-turn-container.model:has(ms-thought-chunk) ms-text-chunk:not(ms-thought-chunk *)::before {
        content: '' !important;
        position: absolute !important;
        top: -${bw * 3}px !important;
        left: 20px !important;
        width: ${bw * 2}px !important;
        height: ${bw * 2}px !important;
        background: ${shadowTone} !important;
        box-shadow:
          -${bw}px ${bw}px 0 0 ${shadowTone},
          ${bw}px ${bw}px 0 0 ${shadowTone} !important;
        pointer-events: none !important;
        z-index: 3 !important;
      }

      /* RPG Corner Badge Rivets on Model Bubble */
      ${scope} .chat-turn-container.model:not(:has(ms-thought-chunk)):not(.thought-activity-host) .turn-content::after,
      ${scope} .chat-turn-container.model:has(ms-thought-chunk) ms-text-chunk:not(ms-thought-chunk *)::after {
        content: '' !important;
        position: absolute !important;
        top: ${bw + 3}px !important;
        right: ${bw + 3}px !important;
        width: ${bw * 2}px !important;
        height: ${bw * 2}px !important;
        background: ${mi.uiAccent} !important;
        box-shadow: -${bw * 2 + 3}px 0 0 0 ${hexToRgba(mi.uiAccent, 0.5)} !important;
        pointer-events: none !important;
        z-index: 3 !important;
      }

      /* 3. Roleplay Avatar & Character Nameplate — 8-Bit Portrait Frame & Frosted Glass RPG Name Tag */
      ${scope} .sl-rp-avatar {
        border-radius: 0 !important;
        border: ${bw}px solid ${mi.uiAccent} !important;
        box-shadow:
          inset 0 0 0 2px ${mi.uiBase},
          ${smSh}px ${smSh}px 0 0 ${shadowTone} !important;
        image-rendering: pixelated !important;
      }

      /* User + Model Nameplate automatically syncs with UI Transparency / Blur setting */
      ${scope} .sl-rp-name {
        background: ${uiSurfaceBg} !important;
        background-color: ${uiSurfaceBg} !important;
        border: ${smBw}px solid ${mi.uiAccent} !important;
        border-radius: 0 !important;
        padding: 3px 10px !important;
        box-shadow:
          inset 0 0 0 1.5px ${mi.uiBase},
          ${smSh}px ${smSh}px 0 0 ${shadowTone} !important;
        letter-spacing: 0.6px !important;
        ${uiBackdropCSS}
      }

      /* 4. Unified Floating Turn Action Dock (.actions.hover-or-edit) & Response Switcher (<X/Y> .aistu-history-navigator) */
      ${scope} .chat-turn-container .actions.hover-or-edit,
      ${scope} .aistu-history-navigator {
        border-radius: 0 !important;
        background: ${uiSurfaceBg} !important;
        background-color: ${uiSurfaceBg} !important;
        border: ${smBw}px solid ${mi.uiAccent} !important;
        padding: 3px 6px !important;
        box-shadow:
          inset 0 0 0 1.5px ${mi.uiBase},
          ${smSh}px ${smSh}px 0 0 ${shadowTone} !important;
        ${uiBackdropCSS}
      }

      ${scope} .chat-turn-container .actions.hover-or-edit button,
      ${scope} .chat-turn-container .actions.hover-or-edit ms-chat-turn-options button,
      ${scope} .aistu-history-navigator .aistu-nav-btn {
        border-radius: 0 !important;
        border: 1.5px solid transparent !important;
        transition: transform 0.08s steps(2), background-color 0.08s steps(2) !important;
      }

      ${scope} .chat-turn-container .actions.hover-or-edit button:hover,
      ${scope} .chat-turn-container .actions.hover-or-edit ms-chat-turn-options button:hover,
      ${scope} .aistu-history-navigator .aistu-nav-btn:hover:not(:disabled) {
        background: ${hexToRgba(mi.uiAccent, 0.22)} !important;
        border-color: ${mi.uiAccent} !important;
        color: ${mi.uiAccent} !important;
      }

      ${scope} .chat-turn-container .actions.hover-or-edit button:active,
      ${scope} .chat-turn-container .actions.hover-or-edit ms-chat-turn-options button:active,
      ${scope} .aistu-history-navigator .aistu-nav-btn:active:not(:disabled) {
        transform: translate(1px, 1px) !important;
      }

      ${scope} .aistu-history-navigator .aistu-nav-label {
        font-family: 'JetBrains Mono', ui-monospace, monospace !important;
        font-weight: 800 !important;
        letter-spacing: 0.4px !important;
        color: ${mi.uiAccent} !important;
      }

      /* 5. Prompt Composer Box, Focus Highlight, Formatting Toolbar & Enabled Tool Chips — Arcade Command Console */
      ${scope} ms-prompt-box .prompt-box-container {
        border-radius: 0 !important;
        border: ${bw}px solid ${mi.uiAccent} !important;
        box-shadow:
          inset 0 0 0 ${bw}px ${mi.uiBase},
          ${sh}px ${sh}px 0 0 ${shadowTone} !important;
        margin-bottom: ${sh}px !important;
      }

      /* Pixel RPG Prompt Box Focus / Typing Highlight: Crisp Accent Border + Subtle Glow + Stepped Accent Shadow */
      ${scope} ms-prompt-box .prompt-box-container:focus-within,
      ${scope} ms-prompt-box:focus-within .prompt-box-container {
        border-color: ${mi.uiAccent} !important;
        box-shadow:
          inset 0 0 0 ${bw}px ${mi.uiBase},
          0 0 0 2px ${hexToRgba(mi.uiAccent, 0.38)},
          0 0 18px ${hexToRgba(mi.uiAccent, isLight ? 0.28 : 0.42)},
          ${sh}px ${sh}px 0 0 ${mi.uiAccent},
          ${sh + smBw}px ${sh + smBw}px 0 0 ${shadowTone} !important;
      }

      /* Inline Formatting Toolbar (.sl-fmt-inline) inside Prompt Box */
      ${scope} ms-prompt-box .sl-fmt-inline {
        border-radius: 0 !important;
        background: ${cardInnerBg} !important;
        border: ${smBw}px solid ${shadowTone} !important;
        box-shadow:
          inset 0 0 0 1.5px ${mi.uiBase},
          2px 2px 0 0 ${shadowTone} !important;
      }

      ${scope} ms-prompt-box .sl-fmt-inline .sl-fmt-btn {
        border-radius: 0 !important;
        border: 1.5px solid transparent !important;
      }

      ${scope} ms-prompt-box .sl-fmt-inline .sl-fmt-btn:hover {
        background: ${hexToRgba(mi.uiAccent, 0.22)} !important;
        border-color: ${mi.uiAccent} !important;
        box-shadow: 2px 2px 0 0 ${shadowTone} !important;
      }

      ${scope} ms-prompt-box .sl-fmt-inline .sl-fmt-heading-menu {
        border-radius: 0 !important;
        border: ${smBw}px solid ${mi.uiAccent} !important;
        box-shadow: ${smSh}px ${smSh}px 0 0 ${shadowTone} !important;
      }

      ${scope} ms-prompt-box .sl-fmt-inline .sl-fmt-heading-item {
        border-radius: 0 !important;
      }

      /* Enabled Tool Chips inside Prompt Box (Search, Code Execution, Structured Outputs, Function Calling) */
      ${scope} ms-prompt-box .enabled-tool-container .enabled-tool {
        border-radius: 0 !important;
        background: ${cardInnerBg} !important;
        background-color: ${cardInnerBg} !important;
        border: ${smBw}px solid ${mi.uiAccent} !important;
        padding: 0 6px 0 10px !important;
        height: 30px !important;
        box-shadow:
          inset 0 0 0 1.5px ${mi.uiBase},
          2px 2px 0 0 ${shadowTone} !important;
        transition: transform 0.08s steps(2), box-shadow 0.08s steps(2), background-color 0.08s steps(2) !important;
      }

      ${scope} ms-prompt-box .enabled-tool-container .enabled-tool:hover {
        background: ${hexToRgba(mi.uiAccent, 0.2)} !important;
        background-color: ${hexToRgba(mi.uiAccent, 0.2)} !important;
        box-shadow:
          inset 0 0 0 1.5px ${mi.uiBase},
          2px 2px 0 0 ${mi.uiAccent} !important;
      }

      ${scope} ms-prompt-box .enabled-tool-container .enabled-tool:active {
        transform: translate(1px, 1px) !important;
        box-shadow: 1px 1px 0 0 ${shadowTone} !important;
      }

      ${scope} ms-prompt-box .enabled-tool-container .enabled-tool > button:last-child {
        border-radius: 0 !important;
      }

      /* Add Media (+), Speech-to-Text, and Formatting Toggle (Aa) Buttons */
      ${scope} :is(ms-add-media-button > button, ms-stt-button > button, .sl-fmt-toggle) {
        border-radius: 0 !important;
        border: ${smBw}px solid ${shadowTone} !important;
        background: ${cardInnerBg} !important;
        box-shadow:
          inset 0 0 0 1.5px ${mi.uiBase},
          2px 2px 0 0 ${shadowTone} !important;
        transition: transform 0.08s steps(2), box-shadow 0.08s steps(2) !important;
      }

      ${scope} :is(ms-add-media-button > button:hover, ms-stt-button > button:hover, .sl-fmt-toggle:hover, .sl-fmt-toggle.active) {
        border-color: ${mi.uiAccent} !important;
        background: ${hexToRgba(mi.uiAccent, 0.2)} !important;
        box-shadow:
          inset 0 0 0 1.5px ${mi.uiBase},
          2px 2px 0 0 ${mi.uiAccent} !important;
      }

      ${scope} :is(ms-add-media-button > button:active, ms-stt-button > button:active, .sl-fmt-toggle:active) {
        transform: translate(1px, 1px) !important;
        box-shadow: 1px 1px 0 0 ${shadowTone} !important;
      }

      /* Run / Generate Button */
      ${scope} :is(button.run-button, ms-run-button button, button[aria-label*="Run" i]):not(:disabled) {
        border-radius: 0 !important;
        border: ${smBw}px solid ${mi.uiBase} !important;
        box-shadow: ${smSh}px ${smSh}px 0 0 ${shadowTone} !important;
        font-weight: 800 !important;
        letter-spacing: 0.4px !important;
        transition: transform 0.08s steps(2), box-shadow 0.08s steps(2) !important;
      }

      ${scope} :is(button.run-button, ms-run-button button, button[aria-label*="Run" i]):not(:disabled):active {
        transform: translate(2px, 2px) !important;
        box-shadow: 1px 1px 0 0 ${shadowTone} !important;
      }

      /* Floating Scroll-to-Bottom Button */
      ${scope} #sl-scroll-bottom-btn.sl-scroll-bottom-btn {
        border-radius: 0 !important;
        border: ${smBw}px solid ${mi.uiAccent} !important;
        box-shadow:
          inset 0 0 0 1.5px ${mi.uiBase},
          ${smSh}px ${smSh}px 0 0 ${shadowTone} !important;
      }

      /* 6. Code Blocks & Standalone <pre> — Retro Cartridge Terminal */
      ${scope} ms-code-block mat-expansion-panel,
      ${scope} ms-chat-turn pre:not(ms-code-block pre) {
        border-radius: 0 !important;
        border: ${bw}px solid ${shadowTone} !important;
        box-shadow:
          inset 0 0 0 2px ${mi.uiBase},
          ${sh}px ${sh}px 0 0 ${mi.uiAccent} !important;
        margin-bottom: ${sh + 4}px !important;
      }

      ${scope} ms-code-block mat-expansion-panel-header {
        border-bottom: ${smBw}px solid ${shadowTone} !important;
        border-radius: 0 !important;
      }

      ${scope} ms-code-block mat-expansion-panel-header button {
        border-radius: 0 !important;
      }

      ${scope} ms-code-block .title-text,
      ${scope} ms-chat-turn :is(code:not(pre code), span.inline-code) {
        border-radius: 0 !important;
        border: 1.5px solid ${mi.uiAccent} !important;
        box-shadow: 2px 2px 0 0 ${shadowTone} !important;
      }

      /* 7. Think Block (ms-thought-chunk) — 8-Bit Quest / Strategy Log */
      ${scope} ms-thought-chunk mat-accordion.compact-accordion,
      ${scope} ms-thought-chunk > mat-accordion {
        border-radius: 0 !important;
        border: ${smBw}px solid ${mi.uiAccent} !important;
        box-shadow:
          inset 0 0 0 2px ${mi.uiBase},
          ${smSh}px ${smSh}px 0 0 ${shadowTone} !important;
        margin-bottom: ${smSh + 4}px !important;
      }

      ${scope} ms-thought-chunk mat-expansion-panel.mat-expanded mat-expansion-panel-header {
        border-bottom: ${smBw}px solid ${mi.uiAccent} !important;
      }

      /* 8. LEFT SIDEBAR (ms-navbar-v, .v3-left-nav) & ALL DETAILED NAVIGATION BUTTONS — 8-Bit Pixel RPG Sync */
      ${scope} :is(ms-navbar-v .nav-content, ms-navbar-v2 .nav-content, .v3-left-nav, .v3-left-nav.expanded)${notSettings} {
        border-right: ${bw}px solid ${shadowTone} !important;
        box-shadow: inset -2px 0 0 0 ${mi.uiBase} !important;
      }

      ${scope} :is(ms-navbar-v, ms-navbar-v2, .v3-left-nav) :is(
        a[ms-button],
        button[ms-button],
        button.account-switcher-button,
        #account-switcher-button
      )${notSettings} {
        border-radius: 0 !important;
        border: 1.5px solid transparent !important;
        transition: transform 0.08s steps(2), box-shadow 0.08s steps(2), background-color 0.08s steps(2) !important;
      }

      ${scope} :is(ms-navbar-v, ms-navbar-v2, .v3-left-nav) :is(a.active, a.active-override, [aria-current="page"], .nav-item.ms-button-active)${notSettings} {
        border-radius: 0 !important;
        background: ${hexToRgba(mi.uiAccent, 0.2)} !important;
        border: ${smBw}px solid ${mi.uiAccent} !important;
        box-shadow:
          inset 0 0 0 1.5px ${mi.uiBase},
          ${smSh}px ${smSh}px 0 0 ${shadowTone} !important;
      }

      ${scope} :is(ms-navbar-v, ms-navbar-v2, .v3-left-nav) :is(
        a[ms-button],
        button[ms-button],
        button.account-switcher-button
      ):not([aria-disabled="true"]):not(:disabled):is(:hover, :focus-visible)${notSettings} {
        border-radius: 0 !important;
        background: ${hexToRgba(mi.uiAccent, 0.16)} !important;
        border: 1.5px solid ${mi.uiAccent} !important;
        box-shadow: 2px 2px 0 0 ${shadowTone} !important;
      }

      ${scope} :is(ms-navbar-v, ms-navbar-v2, .v3-left-nav) :is(
        a[ms-button],
        button[ms-button],
        button.account-switcher-button
      ):not([aria-disabled="true"]):not(:disabled):active${notSettings} {
        transform: translate(1px, 1px) !important;
        box-shadow: 1px 1px 0 0 ${shadowTone} !important;
      }

      ${scope} :is(ms-navbar-v, ms-navbar-v2, .v3-left-nav) .navbar-badge${notSettings} {
        border-radius: 0 !important;
        border: 1px solid ${mi.uiAccent} !important;
        box-shadow: 1.5px 1.5px 0 0 ${shadowTone} !important;
      }

      /* 9. RIGHT SIDEBAR (ms-right-side-panel, ms-run-settings) & ALL DETAILED CONTROLS — 8-Bit Pixel RPG Sync */
      ${scope} :is(ms-right-side-panel, .drawer-container:has(ms-run-settings):not(:has(ms-right-side-panel)))${notSettings} {
        border-left: ${bw}px solid ${shadowTone} !important;
        box-shadow: inset 2px 0 0 0 ${mi.uiBase} !important;
      }

      ${scope} :is(
        ms-model-selector .model-selector-card,
        ms-system-instructions-panel .system-instructions-card,
        .model-selector-card,
        .system-instructions-card,
        .sl-tokens-card,
        ms-thinking-level-setting .mat-mdc-text-field-wrapper,
        ms-run-settings .mat-mdc-text-field-wrapper,
        ms-file-chunk,
        ms-video-chunk .file-chunk-container
      )${notSettings} {
        border-radius: 0 !important;
        background: ${cardInnerBg} !important;
        border: ${smBw}px solid ${shadowTone} !important;
        box-shadow:
          inset 0 0 0 1.5px ${mi.uiBase},
          ${smSh}px ${smSh}px 0 0 ${shadowTone} !important;
      }

      ${scope} :is(
        ms-model-selector .model-selector-card:hover,
        ms-system-instructions-panel .system-instructions-card:hover,
        .model-selector-card:hover,
        .system-instructions-card:hover,
        ms-thinking-level-setting .mat-mdc-text-field-wrapper:hover,
        ms-run-settings .mat-mdc-text-field-wrapper:hover
      )${notSettings} {
        border-color: ${mi.uiAccent} !important;
        box-shadow:
          inset 0 0 0 1.5px ${mi.uiBase},
          ${smSh}px ${smSh}px 0 0 ${mi.uiAccent} !important;
      }

      ${scope} :is(
        ms-right-side-panel .overlay-header button[ms-button],
        ms-run-settings button[ms-button],
        ms-system-instructions-panel button[ms-button],
        run-safety-settings button.ms-button-primary
      )${notSettings} {
        border-radius: 0 !important;
        border: 1.5px solid ${shadowTone} !important;
        background: ${cardInnerBg} !important;
        box-shadow: 2px 2px 0 0 ${shadowTone} !important;
        transition: transform 0.08s steps(2), box-shadow 0.08s steps(2) !important;
      }

      ${scope} :is(
        ms-right-side-panel .overlay-header button[ms-button]:hover,
        ms-run-settings button[ms-button]:hover,
        ms-system-instructions-panel button[ms-button]:hover,
        run-safety-settings button.ms-button-primary:hover
      )${notSettings} {
        border-color: ${mi.uiAccent} !important;
        background: ${hexToRgba(mi.uiAccent, 0.2)} !important;
        box-shadow: 2px 2px 0 0 ${mi.uiAccent} !important;
      }

      /* Right Sidebar Sliders & Slide Toggles in 8-Bit Pixel Style */
      ${scope} ms-run-settings :is(.mdc-slider__track, .mdc-slider__track--active, .mdc-slider__track--inactive)${notSettings} {
        border-radius: 0 !important;
      }

      ${scope} ms-run-settings .mdc-slider__thumb-knob${notSettings} {
        border-radius: 0 !important;
        border: 2px solid ${mi.uiBase} !important;
        box-shadow: 2px 2px 0 0 ${shadowTone} !important;
      }

      ${scope} ms-run-settings :is(.mdc-switch, .mdc-switch__track, .mdc-switch__handle)${notSettings} {
        border-radius: 0 !important;
      }

      /* System Instructions Sliding Drawer & Inputs in 8-Bit Pixel Style */
      ${scope} .cdk-overlay-pane.ms-sliding-right-panel-dialog .mat-mdc-dialog-surface${notSettings} {
        border-radius: 0 !important;
        border-left: ${bw}px solid ${mi.uiAccent} !important;
      }

      ${scope} ms-system-instructions :is(
        textarea,
        textarea.in-run-settings,
        .title-row button[ms-select-button],
        .title-row input[ms-input],
        .title-row button[ms-button]
      )${notSettings} {
        border-radius: 0 !important;
        border: ${smBw}px solid ${shadowTone} !important;
        box-shadow:
          inset 0 0 0 1.5px ${mi.uiBase},
          ${smSh}px ${smSh}px 0 0 ${shadowTone} !important;
      }

      /* Material Menus, Select Dropdown Panels & Dialog Surfaces */
      ${scope} :is(
        .sl-custom-dropdown,
        .sl-toc-popover,
        .sl-saving-pill,
        .sl-custom-submenu,
        .mat-mdc-dialog-surface,
        .mat-mdc-menu-panel,
        .mat-mdc-select-panel,
        .mat-mdc-autocomplete-panel
      )${notSettings} {
        border-radius: 0 !important;
        border: ${smBw}px solid ${mi.uiAccent} !important;
        box-shadow:
          inset 0 0 0 2px ${mi.uiBase},
          ${sh}px ${sh}px 0 0 ${shadowTone} !important;
      }

      /* 10. MARKDOWN EDIT MODAL (Tính năng cây bút .aistu-edit-modal-*) & INLINE EDIT — 8-Bit Pixel RPG Sync */
      ${scope} .aistu-edit-modal-card {
        border-radius: 0 !important;
        border: ${bw}px solid ${mi.uiAccent} !important;
        box-shadow:
          inset 0 0 0 ${bw}px ${mi.uiBase},
          ${sh + 2}px ${sh + 2}px 0 0 ${shadowTone},
          ${sh + bw + 2}px ${sh + bw + 2}px 0 0 ${hexToRgba(mi.uiAccent, 0.45)} !important;
      }

      ${scope} .aistu-edit-modal-header {
        border-bottom: ${smBw}px solid ${shadowTone} !important;
      }

      ${scope} .aistu-edit-modal-role-badge {
        border-radius: 0 !important;
        border: 1.5px solid ${mi.uiAccent} !important;
        box-shadow: 2px 2px 0 0 ${shadowTone} !important;
      }

      ${scope} .aistu-edit-modal-btn:not(.aistu-btn-save) {
        border-radius: 0 !important;
        border: ${smBw}px solid ${shadowTone} !important;
        background: ${cardInnerBg} !important;
        box-shadow:
          inset 0 0 0 1.5px ${mi.uiBase},
          ${smSh}px ${smSh}px 0 0 ${shadowTone} !important;
        transition: transform 0.08s steps(2), box-shadow 0.08s steps(2) !important;
      }

      ${scope} .aistu-edit-modal-btn:not(.aistu-btn-save):hover {
        border-color: ${mi.uiAccent} !important;
        background: ${hexToRgba(mi.uiAccent, 0.2)} !important;
        box-shadow:
          inset 0 0 0 1.5px ${mi.uiBase},
          ${smSh}px ${smSh}px 0 0 ${mi.uiAccent} !important;
      }

      ${scope} .aistu-edit-modal-btn.aistu-btn-save {
        border-radius: 0 !important;
        border: ${smBw}px solid ${mi.uiBase} !important;
        background: ${mi.uiAccent} !important;
        color: ${accentTextColor} !important;
        box-shadow: ${smSh}px ${smSh}px 0 0 ${shadowTone} !important;
        font-weight: 800 !important;
        transition: transform 0.08s steps(2), box-shadow 0.08s steps(2) !important;
      }

      ${scope} .aistu-edit-modal-btn:active {
        transform: translate(2px, 2px) !important;
        box-shadow: 1px 1px 0 0 ${shadowTone} !important;
      }

      /* 10B. Improve Response Popup (.aistu-improve-popup-*) — 8-Bit Arcade Dialog */
      ${scope} .aistu-improve-popup-card {
        position: fixed !important;
        border-radius: 0 !important;
        border: ${bw}px solid ${mi.uiAccent} !important;
        background-color: ${cardInnerBg} !important;
        background-image:
          linear-gradient(180deg, ${hexToRgba(mi.uiAccent, 0.16)} 0px, ${hexToRgba(mi.uiAccent, 0.16)} 4px, transparent 4px),
          radial-gradient(${hexToRgba(mi.uiAccent, 0.18)} 1px, transparent 1px) !important;
        background-size: 100% 100%, 8px 8px !important;
        box-shadow:
          inset 0 0 0 2px ${mi.uiBase},
          ${sh + 2}px ${sh + 2}px 0 0 ${shadowTone} !important;
      }

      ${scope} .aistu-improve-popup-header {
        border-radius: 0 !important;
        border-bottom: ${bw}px solid ${mi.uiAccent} !important;
        background: ${hexToRgba(mi.uiAccent, 0.14)} !important;
      }

      ${scope} .aistu-improve-popup-badge,
      ${scope} .aistu-improve-option-index {
        border-radius: 0 !important;
        border: ${smBw}px solid ${mi.uiAccent} !important;
        box-shadow: 2px 2px 0 0 ${shadowTone} !important;
      }

      ${scope} .aistu-improve-option-btn,
      ${scope} .aistu-improve-close-btn {
        border-radius: 0 !important;
        border: ${smBw}px solid ${shadowTone} !important;
        background: ${cardInnerBg} !important;
        box-shadow:
          inset 0 0 0 1.5px ${mi.uiBase},
          ${smSh}px ${smSh}px 0 0 ${shadowTone} !important;
        transition: transform 0.08s steps(2), box-shadow 0.08s steps(2), border-color 0.08s steps(2) !important;
      }

      ${scope} .aistu-improve-option-btn:hover,
      ${scope} .aistu-improve-close-btn:hover {
        border-color: ${mi.uiAccent} !important;
        transform: translate(-1px, -1px) !important;
        box-shadow:
          inset 0 0 0 1.5px ${mi.uiBase},
          ${smSh + 1}px ${smSh + 1}px 0 0 ${mi.uiAccent} !important;
      }

      ${scope} .aistu-improve-custom-input {
        border-radius: 0 !important;
        border: ${smBw}px solid ${shadowTone} !important;
        background: ${cardInnerBg} !important;
        box-shadow: inset 2px 2px 0 0 ${shadowTone} !important;
      }

      ${scope} .aistu-improve-custom-input:focus {
        border-color: ${mi.uiAccent} !important;
        box-shadow: inset 2px 2px 0 0 ${mi.uiAccent} !important;
      }

      ${scope} .aistu-improve-submit-btn {
        border-radius: 0 !important;
        border: ${smBw}px solid ${mi.uiBase} !important;
        box-shadow: ${smSh}px ${smSh}px 0 0 ${shadowTone} !important;
      }

      ${scope} .chat-turn-container.model.edit:not(.aistu-editing-silent),
      ${scope} .chat-turn-container.user.edit:not(.aistu-editing-silent) ms-autosize-textarea {
        border-radius: 0 !important;
        border: ${bw}px solid ${mi.uiAccent} !important;
        box-shadow:
          inset 0 0 0 2px ${mi.uiBase},
          ${sh}px ${sh}px 0 0 ${shadowTone} !important;
      }

      /* 11. Full <ms-header> Top Toolbar & Studio.lab Header Tools — Synchronized 8-Bit Pixel Frame */
      ${scope} :is(
        ms-header .toolbar-left > button[ms-button],
        ms-header .toolbar-right > button[ms-button],
        ms-header .toolbar-right .overflow-menu-wrapper > button,
        ms-header .sl-header-btn,
        .sl-header-btn,
        ms-playground-toolbar button[ms-button]:not(.ms-button-borderless)
      )${notSettings} {
        border-radius: 0 !important;
        border: ${smBw}px solid ${mi.uiAccent} !important;
        background: ${uiSurfaceBg} !important;
        box-shadow:
          inset 0 0 0 1.5px ${mi.uiBase},
          ${smSh}px ${smSh}px 0 0 ${shadowTone} !important;
        transition: transform 0.08s steps(2), box-shadow 0.08s steps(2) !important;
        ${uiBackdropCSS}
      }

      ${scope} :is(
        ms-header .toolbar-left > button[ms-button]:hover,
        ms-header .toolbar-right > button[ms-button]:hover,
        ms-header .toolbar-right .overflow-menu-wrapper > button:hover,
        ms-header .sl-header-btn:hover,
        .sl-header-btn:hover
      )${notSettings} {
        background: ${hexToRgba(mi.uiAccent, 0.2)} !important;
        box-shadow:
          inset 0 0 0 1.5px ${mi.uiBase},
          ${smSh}px ${smSh}px 0 0 ${mi.uiAccent} !important;
      }

      ${scope} :is(
        ms-header .toolbar-left > button[ms-button]:active,
        ms-header .toolbar-right > button[ms-button]:active,
        ms-header .toolbar-right .overflow-menu-wrapper > button:active,
        ms-header .sl-header-btn:active,
        .sl-header-btn:active
      )${notSettings} {
        transform: translate(2px, 2px) !important;
        box-shadow: 1px 1px 0 0 ${shadowTone} !important;
      }

      /* <ms-header> Page Title & Edit Title Button */
      ${scope} ms-header .page-title h1.mode-title${notSettings} {
        border-bottom: 2px solid ${mi.uiAccent} !important;
        padding-bottom: 1px !important;
        letter-spacing: 0.4px !important;
      }

      ${scope} ms-header .page-title button[ms-button]${notSettings} {
        border-radius: 0 !important;
        border: 1.5px solid ${shadowTone} !important;
        background: ${uiSurfaceBg} !important;
        box-shadow: 2px 2px 0 0 ${shadowTone} !important;
      }

      /* <ms-header> Token Count Badge (ms-token-count) */
      ${scope} ms-header ms-token-count .token-count-container${notSettings} {
        border-radius: 0 !important;
        background: ${uiSurfaceBg} !important;
        border: 1.5px solid ${mi.uiAccent} !important;
        padding: 1px 8px !important;
        box-shadow:
          inset 0 0 0 1px ${mi.uiBase},
          2px 2px 0 0 ${shadowTone} !important;
        ${uiBackdropCSS}
      }

      ${scope} ms-header ms-token-count .v3-token-count-value${notSettings} {
        color: ${mi.uiAccent} !important;
        font-weight: 700 !important;
      }
    `;
  }

  function encodeSvgHexColor(val) {
    return String(val || '').replace(/#/g, '%23');
  }

  function buildWinterFrostStyleCSS(scope, notSettings, {
    mi,
    isLight,
    mutedColor,
    accentTextColor,
    uiSurfaceBg,
    uiBackdropCSS,
    uiTrans,
    uiAlpha,
    userBubbleFinalBg,
    modelBubbleFinalBg
  }) {
    // Tinh Hà Băng Tuyết (Starlit Snowglass) — Original snow cap, snowman mascot, crystal & star pendants,
    // single-border avatar, glare-free dark mode bubble/prompt backgrounds, and preserved Left/Right Sidebar crystal cords
    const cardInnerBg = hexToRgba(mi.uiBase, uiTrans ? clamp(uiAlpha * 0.78, 0.22, 0.9) : (isLight ? 0.86 : 0.72));
    const tokenMap = createStyleLabTokenMap(mi, scope, notSettings, {
      isLight,
      mutedColor,
      accentTextColor,
      uiSurfaceBg,
      cardInnerBg,
      uiBackdropCSS,
      uiTrans,
      uiAlpha,
      userBubbleFinalBg,
      modelBubbleFinalBg
    });

    const {
      uiText,
      uiAccent,
      uiBorder,
      frostBorder,
      frostRim,
      frostGlow,
      shadowColor,
      snowCapColor,
      snowMidColor,
      accentSoft,
      accentGlow,
      uiAccentEncoded,
      uiTextEncoded,
      frostBorderEncoded,
      snowCapEncoded,
      snowMidEncoded,
      snowShadeEncoded,
      snowOutlineEncoded
    } = tokenMap;

    return `
      /* === 0. TINH HÀ BĂNG TUYẾT (STARLIT SNOWGLASS) — 3-SLICE SNOW CAP + SIDEBAR CRYSTAL CORDS === */
      :root, ${scope} {
        --sl-ice-cap-left: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 46 64' preserveAspectRatio='none'><defs><linearGradient id='snow' x2='0' y2='1'><stop stop-color='${snowCapEncoded}'/><stop offset='.55' stop-color='${snowMidEncoded}'/><stop offset='1' stop-color='${snowShadeEncoded}'/></linearGradient></defs><path d='M2 44C0 20 20 1 46 4L46 30C23 34 9 40 5 60Z' fill='${snowShadeEncoded}' opacity='.65'/><path d='M2 40C0 18 20 1 46 4L46 24C23 28 9 35 5 53Z' fill='url(%23snow)'/><path d='M18 26C30 11 39 10 46 12' fill='none' stroke='${snowCapEncoded}' stroke-width='2.4' stroke-linecap='round' opacity='.85'/><path d='M11 39L12 60L15 37M24 31L26 45L28 30' fill='${snowCapEncoded}' opacity='.7'/></svg>");
        --sl-ice-cap-right: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 57 64' preserveAspectRatio='none'><defs><linearGradient id='snow' x2='0' y2='1'><stop stop-color='${snowCapEncoded}'/><stop offset='.55' stop-color='${snowMidEncoded}'/><stop offset='1' stop-color='${snowShadeEncoded}'/></linearGradient></defs><path d='M0 8C27 7 57 18 55 48L52 62C44 43 28 34 0 35Z' fill='${snowShadeEncoded}' opacity='.65'/><path d='M0 6C27 5 57 16 55 44L52 55C44 36 28 28 0 29Z' fill='url(%23snow)'/><path d='M0 12C9 12 17 15 25 19' fill='none' stroke='${snowCapEncoded}' stroke-width='2.4' stroke-linecap='round' opacity='.85'/><path d='M33 35L35 53L37 37M43 41L45 63L48 44' fill='${snowCapEncoded}' opacity='.7'/><circle cx='6' cy='25' r='1.5' fill='${snowCapEncoded}'/></svg>");
        --sl-ice-cap-mid: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='45 0 539 64' preserveAspectRatio='none'><defs><linearGradient id='snow' x2='0' y2='1'><stop stop-color='${snowCapEncoded}'/><stop offset='.55' stop-color='${snowMidEncoded}'/><stop offset='1' stop-color='${snowShadeEncoded}'/></linearGradient></defs><path d='M45 4C69 6 79 20 108 16C138 12 152 17 174 18C201 20 210 8 236 13C265 19 278 17 303 12C326 8 344 22 369 16C397 9 413 12 438 16C466 20 481 10 507 13C534 17 550 7 584 8L584 35C552 37 541 26 513 30C481 36 466 27 439 30C410 34 400 24 373 29C342 35 330 24 305 28C277 34 264 25 238 28C209 34 198 26 176 30C147 36 134 24 107 29C80 34 64 24 45 30Z' fill='${snowShadeEncoded}' opacity='.65'/><path d='M45 4C69 6 79 18 108 14C138 10 152 15 174 16C201 18 210 6 236 11C265 17 278 15 303 10C326 6 344 20 369 14C397 7 413 10 438 14C466 18 481 8 507 11C534 15 550 5 584 6L584 29C552 31 541 20 513 24C481 30 466 21 439 24C410 28 400 18 373 23C342 29 330 18 305 22C277 28 264 19 238 22C209 28 198 20 176 24C147 30 134 18 107 23C80 28 64 18 45 24Z' fill='url(%23snow)'/><path d='M45 12C54 13 63 14 72 16M99 18C129 10 147 20 171 19M211 15C239 10 263 23 289 17M315 14C338 13 350 24 374 18M405 15C432 12 451 23 477 17M531 15C554 10 570 9 584 12' fill='none' stroke='${snowCapEncoded}' stroke-width='2.4' stroke-linecap='round' opacity='.85'/><g fill='none' stroke='${snowCapEncoded}' stroke-width='1.2' stroke-linecap='round'><path d='M78 13V27M72 20H84M74 16L82 24M74 24L82 16M279 15V30M273 22H285M275 18L283 26M275 26L283 18M492 13V27M486 20H498'/></g><g fill='${snowCapEncoded}'><circle cx='57' cy='25' r='1.4'/><circle cx='154' cy='21' r='1'/><circle cx='364' cy='24' r='1.3'/></g></svg>");
        --sl-ice-cap: var(--sl-ice-cap-mid);
        --sl-ice-mascot: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 104 100'><defs><linearGradient id='ice' x1='0' y1='0' x2='1' y2='1'><stop stop-color='${snowCapEncoded}'/><stop offset='.45' stop-color='${frostBorderEncoded}'/><stop offset='1' stop-color='${uiAccentEncoded}'/></linearGradient><radialGradient id='pearl' cx='.35' cy='.25' r='.8'><stop stop-color='${snowCapEncoded}'/><stop offset='.7' stop-color='${snowMidEncoded}'/><stop offset='1' stop-color='${snowShadeEncoded}'/></radialGradient></defs><ellipse cx='54' cy='88' rx='45' ry='8' fill='${snowShadeEncoded}' opacity='.35'/><g stroke='${frostBorderEncoded}' stroke-width='.7' stroke-linejoin='round'><path d='M66 86L65 49L79 27L83 58L74 89Z' fill='url(%23ice)'/><path d='M79 27L73 58L74 89L83 58Z' fill='${snowCapEncoded}' opacity='.65'/><path d='M74 89L84 60L99 48L94 74L84 91Z' fill='url(%23ice)'/><path d='M99 48L87 73L84 91L94 74Z' fill='${uiAccentEncoded}' opacity='.38'/><path d='M62 88L57 65L63 53L71 72L69 89Z' fill='url(%23ice)'/><path d='M84 90L93 78L101 76L97 88Z' fill='${snowMidEncoded}'/></g><path d='M25 65L16 54M19 59L13 59M19 59L20 52M61 64L68 53M66 57L72 55' fill='none' stroke='${uiAccentEncoded}' stroke-width='2.1' stroke-linecap='round'/><ellipse cx='44' cy='73' rx='19' ry='18' fill='url(%23pearl)' stroke='${frostBorderEncoded}' stroke-width='1'/><circle cx='43' cy='47' r='14' fill='url(%23pearl)' stroke='${frostBorderEncoded}' stroke-width='.8'/><path d='M29 42C29 31 34 25 43 25C51 25 57 32 58 41Z' fill='${uiAccentEncoded}'/><path d='M32 35C38 31 48 31 54 35' fill='none' stroke='${frostBorderEncoded}' stroke-width='2'/><ellipse cx='43' cy='41' rx='16' ry='3.5' fill='${snowCapEncoded}'/><circle cx='43' cy='22' r='4.5' fill='${snowCapEncoded}' stroke='${frostBorderEncoded}' stroke-width='.7'/><circle cx='38' cy='47' r='1.65' fill='${uiTextEncoded}'/><circle cx='48' cy='47' r='1.65' fill='${uiTextEncoded}'/><path d='M42 50L49 52L42 54Z' fill='%23e6aa82'/><path d='M38 55Q43 58 48 55' fill='none' stroke='${uiTextEncoded}' stroke-width='1.1' stroke-linecap='round'/><ellipse cx='34' cy='52' rx='2.4' ry='1.3' fill='%23e9a5bc' opacity='.45'/><ellipse cx='52' cy='52' rx='2.4' ry='1.3' fill='%23e9a5bc' opacity='.45'/><path d='M30 58Q43 64 56 58L56 64Q43 69 30 64Z' fill='${uiAccentEncoded}'/><path d='M49 64L55 64L58 76L51 78Z' fill='${uiAccentEncoded}'/><path d='M52 73L57 72' stroke='${snowCapEncoded}' stroke-width='1.4'/><g fill='${uiAccentEncoded}'><circle cx='42' cy='71' r='1.8'/><circle cx='42' cy='79' r='1.8'/></g><path d='M9 85L7 71L13 62L17 77L15 87M18 88L18 78L24 71L26 83Z' fill='url(%23ice)' stroke='${frostBorderEncoded}' stroke-width='.7'/><path d='M11 89Q24 82 34 89Q45 93 57 87Q75 83 94 91' fill='none' stroke='${snowCapEncoded}' stroke-width='4' stroke-linecap='round'/><g fill='${snowCapEncoded}'><path d='M18 44L20 50L26 52L20 54L18 60L16 54L10 52L16 50Z'/><path d='M87 34L88 38L92 39L88 40L87 44L86 40L82 39L86 38Z'/><circle cx='28' cy='22' r='1.3'/><circle cx='62' cy='38' r='1.2'/></g></svg>");
        --sl-ice-flakes: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'><g fill='none' stroke='${frostBorderEncoded}' stroke-width='2.7' opacity='.45' stroke-linecap='round'><path d='M49 27V73M29 38L69 62M29 62L69 38'/></g><g fill='none' stroke='${snowCapEncoded}' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round'><path d='M49 27V73M29 38L69 62M29 62L69 38M44 32L49 37L54 32M44 68L49 63L54 68M31 44L38 43L37 36M61 64L60 57L67 56M31 56L38 57L37 64M61 36L60 43L67 44'/><path d='M19 52V72M10 57L28 67M10 67L28 57M16 55L19 58L22 55M16 69L19 66L22 69'/><path d='M60 4L62 12L70 14L62 16L60 24L58 16L50 14L58 12Z'/><path d='M19 14V26M13 20H25'/></g><g fill='${snowCapEncoded}'><circle cx='34' cy='25' r='1.5'/><circle cx='73' cy='32' r='1.2'/><circle cx='7' cy='43' r='1'/><circle cx='72' cy='73' r='1.4'/></g></svg>");
        --sl-ice-crystal: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 80'><defs><linearGradient id='c' x2='1' y2='1'><stop stop-color='${snowCapEncoded}'/><stop offset='.5' stop-color='${frostBorderEncoded}'/><stop offset='1' stop-color='${uiAccentEncoded}'/></linearGradient></defs><g stroke='${frostBorderEncoded}' stroke-width='.7' stroke-linejoin='round'><path d='M24 70L8 40L5 10L20 28L29 58Z' fill='url(%23c)'/><path d='M5 10L14 40L24 70L20 28Z' fill='${snowCapEncoded}' opacity='.55'/><path d='M27 72L26 47L36 29L39 53Z' fill='url(%23c)'/><path d='M36 29L32 54L27 72L39 53Z' fill='${snowMidEncoded}' opacity='.8'/><path d='M24 70L9 58L3 40L17 48Z' fill='url(%23c)'/></g><g fill='none' stroke='${snowCapEncoded}' stroke-width='1.1' stroke-linecap='round'><path d='M34 58V78M25 63L43 73M25 73L43 63M31 61L34 64L37 61M31 75L34 72L37 75'/><path d='M12 2V14M6 8H18'/></g><g fill='${snowCapEncoded}'><circle cx='43' cy='48' r='1.2'/><circle cx='20' cy='19' r='1'/></g></svg>");
        --sl-ice-pendant: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 72'><path d='M15 0V51M25 8V33M5 3V22' fill='none' stroke='${frostBorderEncoded}' stroke-width='.65' stroke-dasharray='1.5 2.5' opacity='.85'/><path d='M15 42V65' stroke='${snowCapEncoded}' stroke-width='.6'/><path d='M15 49L17 55L22 57L17 59L15 67L13 59L8 57L13 55Z' fill='%23ffe0a6'/><path d='M25 30L26 34L29 35L26 36L25 41L24 36L21 35L24 34Z' fill='${snowCapEncoded}'/><g fill='${snowCapEncoded}'><circle cx='15' cy='12' r='1.3'/><circle cx='5' cy='25' r='1'/><circle cx='15' cy='37' r='1'/></g></svg>");
        --sl-ice-hem: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 42' preserveAspectRatio='none'><path d='M0 30C80 40 126 4 213 17S351 48 436 27S559 9 640 30L640 42H0Z' fill='${uiAccentEncoded}' opacity='.1'/><path d='M0 30C80 40 126 4 213 17S351 48 436 27S559 9 640 30' fill='none' stroke='${snowMidEncoded}' stroke-width='.7' opacity='.6'/><path d='M0 33C92 44 135 6 219 20S352 44 442 30S554 13 640 33' fill='none' stroke='${frostBorderEncoded}' stroke-width='1' stroke-dasharray='1 7' opacity='.65'/><g fill='${snowCapEncoded}'><path d='M126 20L128 25L134 26L128 27L126 33L124 27L119 26L124 25Z'/><path d='M423 25L425 30L431 31L425 32L423 38L421 32L415 31L421 30Z'/><circle cx='232' cy='22' r='1.1'/><circle cx='543' cy='20' r='1.3'/><circle cx='74' cy='31' r='1'/></g></svg>");
        --sl-ice-sigil: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><g fill='none' stroke='${snowCapEncoded}' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M12 2V22M3.34 7L20.66 17M3.34 17L20.66 7M8.5 4.5L12 8L15.5 4.5M8.5 19.5L12 16L15.5 19.5M4 11L8 10L7 6M17 18L16 14L20 13M4 13L8 14L7 18M17 6L16 10L20 11'/></g></svg>");
        --sl-ice-sidebar-cord: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 26 240'><path d='M24 0Q11 30 22 60T12 120T22 180T24 240' fill='none' stroke='${snowOutlineEncoded}' stroke-width='1.35' opacity='.9'/><path d='M24 0V240' fill='none' stroke='${snowCapEncoded}' stroke-width='2' opacity='.85'/><g stroke='${snowOutlineEncoded}' stroke-width='1.1' stroke-linecap='round'><path d='M15 30H24M13 90H24M15 150H24M13 210H24'/><path d='M9 90V104M4 97H14M9 210V224M4 217H14'/></g><g fill='${snowCapEncoded}' stroke='${snowOutlineEncoded}' stroke-width='.95'><polygon points='12,24 16,30 12,36 8,30'/><polygon points='12,144 16,150 12,156 8,150'/><circle cx='19' cy='60' r='2.3'/><circle cx='18' cy='120' r='2.5'/><circle cx='19' cy='180' r='2.3'/></g><g fill='${uiAccentEncoded}'><circle cx='12' cy='30' r='1.4'/><circle cx='12' cy='150' r='1.4'/></g></svg>");
        --sl-ice-sidebar-cord-left: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 26 240'><path d='M2 0Q15 30 4 60T14 120T4 180T2 240' fill='none' stroke='${snowOutlineEncoded}' stroke-width='1.35' opacity='.9'/><path d='M2 0V240' fill='none' stroke='${snowCapEncoded}' stroke-width='2' opacity='.85'/><g stroke='${snowOutlineEncoded}' stroke-width='1.1' stroke-linecap='round'><path d='M2 30H11M2 90H13M2 150H11M2 210H13'/><path d='M17 90V104M12 97H22M17 210V224M12 217H22'/></g><g fill='${snowCapEncoded}' stroke='${snowOutlineEncoded}' stroke-width='.95'><polygon points='14,24 18,30 14,36 10,30'/><polygon points='14,144 18,150 14,156 10,150'/><circle cx='7' cy='60' r='2.3'/><circle cx='8' cy='120' r='2.5'/><circle cx='7' cy='180' r='2.3'/></g><g fill='${uiAccentEncoded}'><circle cx='14' cy='30' r='1.4'/><circle cx='14' cy='150' r='1.4'/></g></svg>");
      }

      /* === 1. USER CHAT BUBBLE — 3-SLICE SNOW CAP & LOWERED SNOWMAN === */
      ${scope} .chat-turn-container.user ms-prompt-chunk:not(:has(ms-file-chunk)):not(:has(ms-video-chunk)):not(:has(ms-image-chunk)):not(:has(textarea)) {
        position: relative !important;
        isolation: isolate !important;
        overflow: visible !important;
        min-width: 0 !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
        min-inline-size: 82px !important;
        border: 1.5px solid ${frostBorder} !important;
        border-radius: 27px 29px 26px 29px / 29px 26px 31px 25px !important;
        background-color: ${userBubbleFinalBg} !important;
        background-image: linear-gradient(180deg, ${frostGlow} 0%, transparent 36%) !important;
        box-shadow:
          inset 0 1.5px 0 ${frostRim},
          inset 0 0 0 1px ${accentSoft},
          0 0 7px ${accentGlow},
          0 8px 22px -12px ${shadowColor} !important;
        padding: 23px 21px 21px !important;
        margin-top: 48px !important;
        margin-bottom: 20px !important;
        line-height: 1.65 !important;
        overflow-wrap: anywhere !important;
      }

      ${scope} .chat-turn-container.user ms-prompt-chunk:not(:has(ms-file-chunk)):not(:has(ms-video-chunk)):not(:has(ms-image-chunk)):not(:has(textarea))::before {
        content: '' !important;
        position: absolute !important;
        pointer-events: none !important;
        z-index: 1 !important;
        background-repeat: no-repeat !important;
        inset: -11px -4px -19px !important;
        background-image:
          var(--sl-ice-cap-left),
          var(--sl-ice-cap-right),
          var(--sl-ice-cap-mid),
          var(--sl-ice-crystal),
          var(--sl-ice-flakes),
          var(--sl-ice-pendant),
          var(--sl-ice-hem) !important;
        background-position:
          left top,
          right top,
          left 24px top,
          left bottom 13px,
          right bottom 11px,
          right 10px bottom,
          center bottom 17px !important;
        background-size:
          25px 29px,
          30px 29px,
          calc(100% - 53px) 29px,
          19px 36px,
          29px 32px,
          13px 34px,
          100% 22px !important;
      }

      ${scope} .chat-turn-container.user ms-prompt-chunk:not(:has(ms-file-chunk)):not(:has(ms-video-chunk)):not(:has(ms-image-chunk)):not(:has(textarea))::after {
        content: '' !important;
        position: absolute !important;
        pointer-events: none !important;
        z-index: 2 !important;
        background: var(--sl-ice-mascot) center / contain no-repeat !important;
        filter: drop-shadow(0 0 3px ${accentGlow}) !important;
        top: -55px !important;
        right: 3px !important;
        width: 59px !important;
        height: 57px !important;
        transform: none !important;
      }

      /* === 2. MODEL CHAT BUBBLE — 3-SLICE SNOW CAP & LOWERED SNOWMAN === */
      ${scope} .chat-turn-container.model:not(:has(ms-thought-chunk)):not(.thought-activity-host) .turn-content,
      ${scope} .chat-turn-container.model:has(ms-thought-chunk) ms-text-chunk:not(ms-thought-chunk *) {
        position: relative !important;
        isolation: isolate !important;
        overflow: visible !important;
        min-width: 0 !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
        border: 1.5px solid ${frostBorder} !important;
        border-radius: 34px 34px 30px 30px / 31px 32px 34px 30px !important;
        background-color: ${modelBubbleFinalBg} !important;
        background-image: linear-gradient(180deg, ${frostGlow} 0%, transparent 36%) !important;
        box-shadow:
          inset 0 1.5px 0 ${frostRim},
          inset 0 0 0 1px ${accentSoft},
          0 0 7px ${accentGlow},
          0 8px 22px -12px ${shadowColor} !important;
        padding: 28px 25px 25px !important;
        margin-top: 56px !important;
        margin-bottom: 25px !important;
        line-height: 1.65 !important;
        overflow-wrap: anywhere !important;
      }

      ${scope} .chat-turn-container.model:not(:has(ms-thought-chunk)):not(.thought-activity-host) .turn-content::before,
      ${scope} .chat-turn-container.model:has(ms-thought-chunk) ms-text-chunk:not(ms-thought-chunk *)::before {
        content: '' !important;
        position: absolute !important;
        pointer-events: none !important;
        z-index: 1 !important;
        background-repeat: no-repeat !important;
        inset: -15px -5px -28px !important;
        background-image:
          var(--sl-ice-cap-left),
          var(--sl-ice-cap-right),
          var(--sl-ice-cap-mid),
          var(--sl-ice-crystal),
          var(--sl-ice-flakes),
          var(--sl-ice-pendant),
          var(--sl-ice-hem) !important;
        background-position:
          left top,
          right top,
          left 32px top,
          left bottom 20px,
          right bottom 17px,
          68% bottom,
          center bottom 26px !important;
        background-size:
          33px 39px,
          40px 39px,
          calc(100% - 71px) 39px,
          31px 58px,
          47px 49px,
          19px 47px,
          100% 31px !important;
      }

      ${scope} .chat-turn-container.model:not(:has(ms-thought-chunk)):not(.thought-activity-host) .turn-content::after,
      ${scope} .chat-turn-container.model:has(ms-thought-chunk) ms-text-chunk:not(ms-thought-chunk *)::after {
        content: '' !important;
        position: absolute !important;
        pointer-events: none !important;
        z-index: 2 !important;
        background: var(--sl-ice-mascot) center / contain no-repeat !important;
        filter: drop-shadow(0 0 3px ${accentGlow}) !important;
        top: -72px !important;
        right: 9px !important;
        width: 80px !important;
        height: 77px !important;
      }

      /* === 3. ROLEPLAY AVATAR (SINGLE BORDER ONLY) & CHARACTER NAMEPLATE === */
      ${scope} .sl-rp-avatar {
        position: relative !important;
        isolation: isolate !important;
        overflow: visible !important;
        border-radius: 19px !important;
        border: 1.5px solid ${frostBorder} !important;
        outline: none !important;
        background-color: ${uiSurfaceBg} !important;
        box-shadow:
          inset 0 1px 0 ${frostRim},
          0 0 6px ${accentGlow},
          0 5px 14px -6px ${shadowColor} !important;
      }

      ${scope} .sl-rp-avatar img {
        border-radius: inherit !important;
      }

      ${scope} .sl-rp-avatar::before {
        content: '' !important;
        position: absolute !important;
        pointer-events: none !important;
        z-index: 1 !important;
        background-repeat: no-repeat !important;
        inset: -7px !important;
        border: none !important;
        box-shadow: none !important;
        background-image: var(--sl-ice-flakes), var(--sl-ice-flakes) !important;
        background-position: left bottom, right top !important;
        background-size: 23px 23px, 19px 19px !important;
      }

      ${scope} .sl-rp-avatar::after {
        display: none !important;
        content: none !important;
        border: none !important;
      }

      ${scope} .sl-rp-name {
        position: relative !important;
        overflow: visible !important;
        border-radius: 999px !important;
        border: 1.5px solid ${frostBorder} !important;
        color: ${uiAccent} !important;
        background-color: ${uiSurfaceBg} !important;
        background-image: linear-gradient(180deg, ${frostGlow} 0%, transparent 45%) !important;
        box-shadow:
          inset 0 1px 0 ${frostRim},
          0 0 5px ${accentGlow},
          0 0 12px ${accentSoft} !important;
        padding: 4px 13px !important;
        font-weight: 700 !important;
        letter-spacing: 0.01em !important;
        ${uiBackdropCSS}
      }

      ${scope} .sl-rp-name::before {
        content: '' !important;
        display: inline-block !important;
        vertical-align: -0.12em !important;
        width: 0.85em !important;
        height: 0.85em !important;
        margin-inline-end: 0.35em !important;
        background-color: ${uiAccent} !important;
        -webkit-mask-image: var(--sl-ice-sigil) !important;
        mask-image: var(--sl-ice-sigil) !important;
        -webkit-mask-size: contain !important;
        mask-size: contain !important;
        -webkit-mask-repeat: no-repeat !important;
        mask-repeat: no-repeat !important;
        pointer-events: none !important;
      }

      ${scope} .sl-rp-name::after {
        content: '' !important;
        position: absolute !important;
        pointer-events: none !important;
        z-index: 1 !important;
        background-repeat: no-repeat !important;
        right: -8px !important;
        top: -6px !important;
        width: 20px !important;
        height: calc(100% + 23px) !important;
        background-image: var(--sl-ice-flakes), var(--sl-ice-pendant) !important;
        background-position: right top, right bottom !important;
        background-size: 17px 17px, 12px 28px !important;
      }

      /* === 4. ACTION DOCK & <X/Y> HISTORY NAVIGATOR === */
      ${scope} .chat-turn-container .actions.hover-or-edit,
      ${scope} .chat-turn-container .turn-footer${notSettings},
      ${scope} .aistu-history-navigator,
      ${scope} .aistu-Sibling-nav {
        position: relative !important;
        overflow: visible !important;
        border-radius: 999px !important;
        border: 1.5px solid ${frostBorder} !important;
        background-color: ${uiSurfaceBg} !important;
        background-image: linear-gradient(180deg, ${frostGlow} 0%, transparent 45%) !important;
        color: ${uiText} !important;
        box-shadow:
          inset 0 1px 0 ${frostRim},
          0 0 5px ${accentGlow},
          0 0 12px ${accentSoft} !important;
        padding: 3px 8px !important;
        ${uiBackdropCSS}
      }

      ${scope} :is(
        .chat-turn-container .actions.hover-or-edit,
        .chat-turn-container .turn-footer${notSettings},
        .aistu-history-navigator,
        .aistu-Sibling-nav
      )::before {
        content: '' !important;
        position: absolute !important;
        pointer-events: none !important;
        z-index: 1 !important;
        background-repeat: no-repeat !important;
        top: -8px !important;
        right: -6px !important;
        width: 22px !important;
        height: 25px !important;
        background-image: var(--sl-ice-flakes) !important;
        background-size: contain !important;
      }

      ${scope} :is(
        .chat-turn-container .actions.hover-or-edit,
        .chat-turn-container .turn-footer${notSettings},
        .aistu-history-navigator,
        .aistu-Sibling-nav
      )::after {
        content: '' !important;
        position: absolute !important;
        pointer-events: none !important;
        z-index: 1 !important;
        background-repeat: no-repeat !important;
        bottom: -6px !important;
        left: -5px !important;
        width: 17px !important;
        height: 19px !important;
        background-image: var(--sl-ice-flakes) !important;
        background-size: contain !important;
      }

      ${scope} .chat-turn-container .actions.hover-or-edit button,
      ${scope} .chat-turn-container .actions.hover-or-edit ms-chat-turn-options button,
      ${scope} .aistu-history-navigator .aistu-nav-btn {
        border-radius: 999px !important;
        border: 1px solid transparent !important;
        transition: background-color 0.16s ease, border-color 0.16s ease !important;
      }

      ${scope} .chat-turn-container .actions.hover-or-edit button:hover,
      ${scope} .chat-turn-container .actions.hover-or-edit ms-chat-turn-options button:hover,
      ${scope} .aistu-history-navigator .aistu-nav-btn:hover:not(:disabled) {
        background-color: ${accentSoft} !important;
        border-color: ${frostBorder} !important;
        color: ${uiAccent} !important;
        box-shadow: inset 0 1px 0 ${frostRim}, 0 0 6px ${accentGlow} !important;
      }

      /* === 5. PROMPT COMPOSER BOX — TOP-DOWN GLASS SHEEN (LIKE SIDEBAR), SNOW CAP, SNOWMAN & HEM CORD === */
      ${scope} ms-prompt-box .prompt-box-container {
        position: relative !important;
        isolation: isolate !important;
        overflow: visible !important;
        min-width: 0 !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
        border: 1.5px solid ${frostBorder} !important;
        border-radius: 34px 35px 29px 29px / 31px 32px 29px 29px !important;
        background-color: ${uiSurfaceBg} !important;
        background-image: linear-gradient(180deg, ${frostGlow} 0%, transparent 36%) !important;
        box-shadow:
          inset 0 1.5px 0 ${frostRim},
          inset 0 0 0 1px ${accentSoft},
          0 0 7px ${accentGlow},
          0 8px 22px -12px ${shadowColor} !important;
        margin-top: 56px !important;
        margin-bottom: 10px !important;
        padding-top: 21px !important;
        ${uiBackdropCSS}
      }

      ${scope} ms-prompt-box .prompt-box-container::before {
        content: '' !important;
        position: absolute !important;
        pointer-events: none !important;
        z-index: 1 !important;
        background-repeat: no-repeat !important;
        inset: -15px -5px -15px !important;
        background-image:
          var(--sl-ice-cap-left),
          var(--sl-ice-cap-right),
          var(--sl-ice-cap-mid),
          var(--sl-ice-crystal),
          var(--sl-ice-flakes),
          var(--sl-ice-hem) !important;
        background-position:
          left top,
          right top,
          left 33px top,
          left bottom 7px,
          right bottom 5px,
          center bottom 13px !important;
        background-size:
          34px 40px,
          40px 40px,
          calc(100% - 72px) 40px,
          27px 52px,
          43px 44px,
          100% 32px !important;
      }

      ${scope} ms-prompt-box .prompt-box-container::after {
        content: '' !important;
        position: absolute !important;
        pointer-events: none !important;
        z-index: 2 !important;
        background: var(--sl-ice-mascot) center / contain no-repeat !important;
        filter: drop-shadow(0 0 3px ${accentGlow}) !important;
        top: -71px !important;
        right: 9px !important;
        width: 79px !important;
        height: 76px !important;
      }

      ${scope} ms-prompt-box .prompt-box-container:focus-within,
      ${scope} ms-prompt-box:focus-within .prompt-box-container {
        border-color: ${isLight ? uiAccent : snowCapColor} !important;
        outline: 2px solid ${accentGlow} !important;
        outline-offset: 3px !important;
        box-shadow:
          inset 0 1.5px 0 ${snowCapColor},
          inset 0 0 0 1px ${accentSoft},
          0 0 9px ${accentGlow},
          0 10px 28px -12px ${shadowColor} !important;
      }

      ${scope} ms-prompt-box .sl-fmt-inline {
        border-radius: 14px !important;
        background-color: ${cardInnerBg} !important;
        background-image: linear-gradient(180deg, ${frostGlow} 0%, transparent 45%) !important;
        border: 1px solid ${frostBorder} !important;
        box-shadow: inset 0 1px 0 ${frostRim}, 0 0 5px ${accentGlow} !important;
      }

      ${scope} ms-prompt-box :is(
        .enabled-tool-container .enabled-tool,
        ms-add-media-button > button,
        ms-stt-button > button,
        .sl-fmt-toggle
      ) {
        position: relative !important;
        border-radius: 999px !important;
        border: 1.5px solid ${frostBorder} !important;
        background-color: ${cardInnerBg} !important;
        background-image: linear-gradient(180deg, ${frostGlow} 0%, transparent 45%) !important;
        color: ${uiText} !important;
        box-shadow:
          inset 0 1px 0 ${frostRim},
          0 0 5px ${accentGlow},
          0 0 12px ${accentSoft} !important;
      }

      ${scope} ms-prompt-box :is(
        .enabled-tool-container .enabled-tool:hover,
        ms-add-media-button > button:hover,
        ms-stt-button > button:hover,
        .sl-fmt-toggle:hover
      ) {
        border-color: ${snowCapColor} !important;
        background-color: ${accentSoft} !important;
        box-shadow: inset 0 1px 0 ${frostRim}, 0 0 9px ${accentGlow} !important;
      }

      ${scope} ms-prompt-box :is(button.run-button, ms-run-button button, button[aria-label*="Run" i]):not(:disabled) {
        border-radius: 999px !important;
        border: 1.5px solid ${snowCapColor} !important;
        background-color: ${uiAccent} !important;
        background-image: linear-gradient(160deg, ${accentSoft}, transparent 65%) !important;
        color: ${accentTextColor} !important;
        font-weight: 750 !important;
        box-shadow:
          inset 0 1.5px 0 ${frostRim},
          0 0 0 1px ${frostBorder},
          0 0 12px ${accentGlow} !important;
      }

      ${scope} #sl-scroll-bottom-btn.sl-scroll-bottom-btn {
        border-radius: 999px !important;
        border: 1px solid ${frostBorder} !important;
        background-color: ${uiSurfaceBg} !important;
        background-image: linear-gradient(180deg, ${frostGlow} 0%, transparent 45%) !important;
        box-shadow:
          inset 0 1px 0 ${frostRim},
          0 0 8px ${accentGlow} !important;
      }

      /* === 6. CODE BLOCKS & THINKING BLOCKS === */
      ${scope} ms-code-block mat-expansion-panel,
      ${scope} ms-chat-turn pre:not(ms-code-block pre),
      ${scope} ms-thought-chunk mat-accordion.compact-accordion,
      ${scope} ms-thought-chunk > mat-accordion {
        position: relative !important;
        min-width: 0 !important;
        overflow: visible !important;
        border-radius: 18px !important;
        border: 1px solid ${frostBorder} !important;
        border-top: 2px solid ${snowMidColor} !important;
        background-color: ${cardInnerBg} !important;
        background-image: linear-gradient(180deg, ${frostGlow} 0%, transparent 36%) !important;
        box-shadow:
          inset 0 1px 0 ${frostRim},
          0 0 8px ${accentSoft},
          0 5px 16px -10px ${shadowColor} !important;
      }

      ${scope} :is(
        ms-code-block mat-expansion-panel,
        ms-thought-chunk mat-accordion.compact-accordion,
        ms-thought-chunk > mat-accordion
      )::before {
        content: '' !important;
        position: absolute !important;
        pointer-events: none !important;
        z-index: 1 !important;
        background-repeat: no-repeat !important;
        top: -6px !important;
        right: -3px !important;
        width: 21px !important;
        height: 23px !important;
        opacity: 0.75 !important;
        background-image: var(--sl-ice-flakes) !important;
        background-size: contain !important;
      }

      ${scope} ms-code-block mat-expansion-panel-header,
      ${scope} ms-thought-chunk mat-expansion-panel-header {
        border-bottom: 1px solid ${frostBorder} !important;
        background-image: linear-gradient(90deg, ${accentSoft}, transparent 75%) !important;
      }

      /* === 7. LEFT SIDEBAR — KEPT UNTOUCHED AS REQUESTED (NO position:relative OVERRIDE SO MOBILE DRAWER NEVER BREAKS) === */
      ${scope} :is(ms-navbar-v .nav-content, ms-navbar-v2 .nav-content, .v3-left-nav, .v3-left-nav.expanded)${notSettings} {
        border-right: 1.5px solid ${frostBorder} !important;
        background-color: ${uiSurfaceBg} !important;
        background-image:
          var(--sl-ice-sidebar-cord),
          var(--sl-ice-cap),
          linear-gradient(180deg, ${accentSoft} 0%, transparent 36%) !important;
        background-position:
          right -1px top 24px,
          center top -4px,
          center top !important;
        background-size:
          22px 240px,
          100% 18px,
          100% 100% !important;
        background-repeat:
          repeat-y,
          no-repeat,
          no-repeat !important;
        box-shadow:
          inset -1px 0 0 ${frostRim},
          3px 0 14px -4px ${accentGlow} !important;
        ${uiBackdropCSS}
      }

      ${scope} :is(ms-navbar-v, ms-navbar-v2, .v3-left-nav) :is(
        a[ms-button],
        button[ms-button],
        button.account-switcher-button,
        #account-switcher-button
      )${notSettings} {
        border-radius: 14px !important;
        border: 1px solid transparent !important;
        transition: background-color 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease !important;
      }

      ${scope} :is(ms-navbar-v, ms-navbar-v2, .v3-left-nav) :is(
        a.active,
        a.active-override,
        [aria-current="page"],
        .nav-item.ms-button-active
      )${notSettings} {
        border-radius: 14px !important;
        border: 1px solid ${frostBorder} !important;
        background-color: ${accentSoft} !important;
        background-image:
          linear-gradient(90deg, ${accentSoft}, transparent 85%),
          var(--sl-ice-sigil) !important;
        background-position: center, right 10px center !important;
        background-size: 100% 100%, 14px 14px !important;
        background-repeat: no-repeat !important;
        box-shadow:
          inset 0 1px 0 ${frostRim},
          0 0 6px ${accentGlow} !important;
      }

      ${scope} :is(ms-navbar-v, ms-navbar-v2, .v3-left-nav) :is(
        a[ms-button],
        button[ms-button],
        button.account-switcher-button
      ):not([aria-disabled="true"]):not(:disabled):is(:hover, :focus-visible)${notSettings} {
        border-radius: 14px !important;
        background-color: ${accentSoft} !important;
        border: 1px solid ${frostBorder} !important;
        box-shadow: inset 0 1px 0 ${frostRim}, 0 0 5px ${accentGlow} !important;
      }

      ${scope} :is(ms-navbar-v, ms-navbar-v2, .v3-left-nav) .navbar-badge${notSettings} {
        border-radius: 999px !important;
        border: 1px solid ${frostBorder} !important;
        background-color: ${accentSoft} !important;
        box-shadow: inset 0 1px 0 ${frostRim} !important;
      }

      /* === 8. RIGHT SIDEBAR — KEPT UNTOUCHED AS REQUESTED (NO position:relative OVERRIDE SO MOBILE DRAWER NEVER BREAKS) === */
      ${scope} :is(ms-right-side-panel, .drawer-container:has(ms-run-settings):not(:has(ms-right-side-panel)))${notSettings} {
        border-left: 1.5px solid ${frostBorder} !important;
        background-color: ${uiSurfaceBg} !important;
        background-image:
          var(--sl-ice-sidebar-cord-left),
          var(--sl-ice-cap),
          linear-gradient(180deg, ${accentSoft} 0%, transparent 36%) !important;
        background-position:
          left -1px top 24px,
          center top -4px,
          center top !important;
        background-size:
          22px 240px,
          100% 18px,
          100% 100% !important;
        background-repeat:
          repeat-y,
          no-repeat,
          no-repeat !important;
        box-shadow:
          inset 1px 0 0 ${frostRim},
          -3px 0 14px -4px ${accentGlow} !important;
        ${uiBackdropCSS}
      }

      ${scope} :is(
        ms-model-selector .model-selector-card,
        ms-system-instructions-panel .system-instructions-card,
        .model-selector-card,
        .system-instructions-card,
        .sl-tokens-card,
        ms-thinking-level-setting .mat-mdc-text-field-wrapper,
        ms-run-settings .mat-mdc-text-field-wrapper,
        ms-file-chunk,
        ms-video-chunk .file-chunk-container
      )${notSettings} {
        position: relative !important;
        border-radius: 18px !important;
        border: 1.5px solid ${frostBorder} !important;
        background-color: ${cardInnerBg} !important;
        background-image:
          linear-gradient(180deg, ${accentSoft} 0%, transparent 65%),
          var(--sl-ice-sigil) !important;
        background-position: center top, right 10px top 10px !important;
        background-size: 100% 100%, 14px 14px !important;
        background-repeat: no-repeat !important;
        box-shadow:
          inset 0 1px 0 ${frostRim},
          0 0 6px ${accentGlow} !important;
      }

      /* Strictly preserve URL Context (.settings-item.settings-tool) 100% transparent */
      ${scope} ms-run-settings .settings-item.settings-tool${notSettings} {
        background: transparent !important;
        background-color: transparent !important;
        background-image: none !important;
        border: none !important;
        box-shadow: none !important;
      }

      ${scope} :is(
        ms-model-selector .model-selector-card:hover,
        ms-system-instructions-panel .system-instructions-card:hover,
        .model-selector-card:hover,
        .system-instructions-card:hover,
        ms-thinking-level-setting .mat-mdc-text-field-wrapper:hover,
        ms-run-settings .mat-mdc-text-field-wrapper:hover
      )${notSettings} {
        border-color: ${uiAccent} !important;
        box-shadow:
          inset 0 1px 0 ${snowCapColor},
          0 0 10px ${accentGlow} !important;
      }

      ${scope} :is(
        ms-right-side-panel .overlay-header button[ms-button],
        ms-run-settings button[ms-button],
        ms-system-instructions-panel button[ms-button],
        run-safety-settings button.ms-button-primary
      )${notSettings} {
        border-radius: 12px !important;
        border: 1px solid ${frostBorder} !important;
        background-color: ${cardInnerBg} !important;
        background-image: linear-gradient(180deg, ${frostGlow} 0%, transparent 45%) !important;
        color: ${uiText} !important;
        box-shadow:
          inset 0 1px 0 ${frostRim},
          0 0 4px ${accentGlow} !important;
      }

      ${scope} :is(
        ms-right-side-panel .overlay-header button[ms-button]:hover,
        ms-run-settings button[ms-button]:hover,
        ms-system-instructions-panel button[ms-button]:hover,
        run-safety-settings button.ms-button-primary:hover
      )${notSettings} {
        border-color: ${uiAccent} !important;
        background-color: ${accentSoft} !important;
      }

      ${scope} ms-run-settings .mdc-slider__thumb-knob${notSettings} {
        border: 2px solid ${snowCapColor} !important;
        box-shadow: 0 0 6px ${accentGlow} !important;
      }

      ${scope} .cdk-overlay-pane.ms-sliding-right-panel-dialog .mat-mdc-dialog-surface${notSettings} {
        border-left: 1.5px solid ${frostBorder} !important;
      }

      ${scope} ms-system-instructions :is(
        textarea,
        textarea.in-run-settings,
        .title-row button[ms-select-button],
        .title-row input[ms-input],
        .title-row button[ms-button]
      )${notSettings} {
        border-radius: 14px !important;
        border: 1.5px solid ${frostBorder} !important;
        box-shadow: inset 0 1px 0 ${frostRim}, 0 0 5px ${accentGlow} !important;
      }

      ${scope} :is(
        .sl-custom-dropdown,
        .sl-toc-popover,
        .sl-saving-pill,
        .sl-custom-submenu,
        .mat-mdc-dialog-surface,
        .mat-mdc-menu-panel,
        .mat-mdc-select-panel,
        .mat-mdc-autocomplete-panel
      )${notSettings} {
        border-radius: 18px !important;
        border: 1.5px solid ${frostBorder} !important;
        box-shadow:
          inset 0 1px 0 ${frostRim},
          0 0 10px ${accentGlow},
          0 12px 28px -8px ${shadowColor} !important;
      }

      /* === 9. MARKDOWN EDIT MODAL (.aistu-edit-modal-*) === */
      ${scope} .aistu-edit-modal-card {
        position: relative !important;
        isolation: isolate !important;
        overflow: visible !important;
        border-radius: 28px !important;
        border: 1.5px solid ${frostBorder} !important;
        background-color: ${uiSurfaceBg} !important;
        background-image:
          var(--sl-ice-cap),
          var(--sl-ice-hem),
          linear-gradient(180deg, ${frostGlow} 0%, transparent 36%) !important;
        background-position: center top, center bottom, center top !important;
        background-size: 100% 25px, 100% 28px, 100% 100% !important;
        background-repeat: no-repeat !important;
        padding-top: 24px !important;
        box-shadow:
          inset 0 1.5px 0 ${frostRim},
          0 0 13px ${accentGlow},
          0 22px 60px ${shadowColor} !important;
        ${uiBackdropCSS}
      }

      ${scope} .aistu-edit-modal-header {
        border-top-left-radius: 24px !important;
        border-top-right-radius: 24px !important;
        border-bottom: 1.5px solid ${frostBorder} !important;
      }

      ${scope} .aistu-edit-modal-role-badge,
      ${scope} .aistu-edit-modal-btn:not(.aistu-btn-save) {
        border-radius: 999px !important;
        border: 1px solid ${frostBorder} !important;
        background-color: ${cardInnerBg} !important;
        background-image: linear-gradient(180deg, ${frostGlow} 0%, transparent 45%) !important;
        box-shadow: inset 0 1px 0 ${frostRim}, 0 0 5px ${accentGlow} !important;
      }

      ${scope} .aistu-edit-modal-btn.aistu-btn-save {
        border-radius: 999px !important;
        border: 1.5px solid ${snowCapColor} !important;
        background-color: ${uiAccent} !important;
        color: ${accentTextColor} !important;
        box-shadow:
          0 0 0 1px ${frostBorder},
          inset 0 1px 0 ${snowCapColor},
          0 0 8px ${accentGlow} !important;
        font-weight: 700 !important;
      }

      /* === 9B. IMPROVE RESPONSE POPUP (.aistu-improve-popup-*) — FROSTED ICE SHEET === */
      ${scope} .aistu-improve-popup-card {
        position: fixed !important;
        border-radius: 16px !important;
        border: 1.5px solid ${frostBorder} !important;
        background-color: ${uiSurfaceBg} !important;
        background-image:
          linear-gradient(165deg, ${frostGlow} 0%, transparent 45%),
          radial-gradient(circle at 82% 18%, ${accentGlow} 0%, transparent 55%) !important;
        box-shadow:
          0 24px 60px ${shadowColor},
          0 0 12px ${accentGlow},
          inset 0 1.5px 0 ${frostRim} !important;
        ${uiBackdropCSS}
        overflow: visible !important;
      }

      ${scope} .aistu-improve-popup-card::after {
        content: "" !important;
        position: absolute !important;
        top: -2px !important;
        left: 24px !important;
        right: 24px !important;
        height: 4px !important;
        border-radius: 999px !important;
        background: linear-gradient(90deg, transparent 0%, ${snowCapColor} 20%, ${snowCapColor} 80%, transparent 100%) !important;
        box-shadow: 0 1px 5px ${accentGlow} !important;
        pointer-events: none !important;
        z-index: 6 !important;
      }

      ${scope} .aistu-improve-popup-header {
        border-bottom: 1px solid ${frostBorder} !important;
        background: linear-gradient(180deg, ${frostGlow} 0%, transparent 100%) !important;
        border-radius: 15px 15px 0 0 !important;
      }

      ${scope} .aistu-improve-popup-badge,
      ${scope} .aistu-improve-option-index {
        border-radius: 999px !important;
        border: 1px solid ${frostBorder} !important;
        box-shadow: inset 0 1px 0 ${frostRim}, 0 0 5px ${accentGlow} !important;
      }

      ${scope} .aistu-improve-option-btn,
      ${scope} .aistu-improve-close-btn {
        border-radius: 12px !important;
        border: 1px solid ${frostBorder} !important;
        background-color: ${cardInnerBg} !important;
        background-image: linear-gradient(180deg, ${frostGlow} 0%, transparent 45%) !important;
        box-shadow: inset 0 1px 0 ${frostRim}, 0 0 5px ${accentGlow} !important;
      }

      ${scope} .aistu-improve-option-btn:hover,
      ${scope} .aistu-improve-close-btn:hover {
        border-color: ${snowCapColor} !important;
        box-shadow:
          0 0 0 1px ${frostBorder},
          inset 0 1px 0 ${snowCapColor},
          0 0 10px ${accentGlow} !important;
      }

      ${scope} .aistu-improve-custom-input {
        border-radius: 10px !important;
        border: 1px solid ${frostBorder} !important;
        background-color: ${cardInnerBg} !important;
        box-shadow: inset 0 1px 0 ${frostRim} !important;
      }

      ${scope} .aistu-improve-submit-btn:not(:disabled) {
        border-radius: 10px !important;
        border: 1.5px solid ${snowCapColor} !important;
        background-color: ${uiAccent} !important;
        color: ${accentTextColor} !important;
        box-shadow:
          0 0 0 1px ${frostBorder},
          inset 0 1px 0 ${snowCapColor},
          0 0 8px ${accentGlow} !important;
      }

      /* === 10. TOP PLAYGROUND HEADER (<ms-header>) & MARKDOWN CONTENT ACCENTS === */
      ${scope} :is(
        ms-header .toolbar-left > button[ms-button],
        ms-header .toolbar-right > button[ms-button],
        ms-header .toolbar-right .overflow-menu-wrapper > button,
        ms-header .sl-header-btn,
        .sl-header-btn,
        ms-playground-toolbar button[ms-button]:not(.ms-button-borderless)
      )${notSettings} {
        position: relative !important;
        border-radius: 999px !important;
        border: 1.5px solid ${frostBorder} !important;
        background-color: ${uiSurfaceBg} !important;
        background-image:
          var(--sl-ice-flakes),
          linear-gradient(180deg, ${frostGlow} 0%, transparent 45%) !important;
        background-position: right -4px bottom -4px, center top !important;
        background-size: 19px 19px, 100% 100% !important;
        background-repeat: no-repeat !important;
        color: ${uiText} !important;
        box-shadow:
          inset 0 1px 0 ${frostRim},
          0 0 5px ${accentGlow},
          0 0 12px ${accentSoft} !important;
        ${uiBackdropCSS}
      }

      ${scope} ms-header ms-token-count .token-count-container${notSettings} {
        border-radius: 999px !important;
        border: 1.5px solid ${frostBorder} !important;
        background-color: ${uiSurfaceBg} !important;
        background-image:
          var(--sl-ice-flakes),
          linear-gradient(180deg, ${frostGlow} 0%, transparent 45%) !important;
        background-position: right -4px bottom -4px, center top !important;
        background-size: 19px 19px, 100% 100% !important;
        background-repeat: no-repeat !important;
        padding: 2px 11px !important;
        box-shadow:
          inset 0 1px 0 ${frostRim},
          0 0 5px ${accentGlow} !important;
        ${uiBackdropCSS}
      }

      ${scope} ms-header ms-token-count .v3-token-count-value${notSettings} {
        color: ${uiAccent} !important;
        font-weight: 700 !important;
      }

      ${scope} .chat-turn-container.model ms-text-chunk blockquote {
        margin-inline: 0 !important;
        padding: 0.55em 1em !important;
        border-inline-start: 2px solid ${frostBorder} !important;
        border-radius: 0 13px 13px 0 !important;
        background-color: ${accentSoft} !important;
        color: ${uiText} !important;
      }

      ${scope} .chat-turn-container.model ms-text-chunk hr {
        height: 1px !important;
        border: 0 !important;
        margin-block: 1.5em !important;
        background: linear-gradient(90deg, transparent, ${frostBorder}, transparent) !important;
      }

      ${scope} .chat-turn-container.model ms-text-chunk a {
        color: ${uiAccent} !important;
        text-decoration-thickness: 1px !important;
        text-underline-offset: 0.2em !important;
      }

      ${scope} .chat-turn-container.model ms-text-chunk table {
        border: 1px solid ${frostBorder} !important;
        border-spacing: 0 !important;
        border-radius: 12px !important;
      }

      ${scope} .chat-turn-container.model ms-text-chunk :is(th, td) {
        padding: 0.6em 0.8em !important;
        border-bottom: 1px solid ${uiBorder} !important;
      }

      ${scope} .chat-turn-container.model ms-text-chunk th {
        background-color: ${accentSoft} !important;
        color: ${uiText} !important;
      }

      ${scope} ::-webkit-scrollbar-thumb {
        border-radius: 999px !important;
        border: 1px solid ${frostBorder} !important;
        background-color: ${accentSoft} !important;
        box-shadow: inset 0 1px 0 ${frostRim} !important;
      }

      /* === 11. MOBILE VIEWPORT RESPONSIVE ADAPTATION (<= 600px) === */
      @media (max-width: 600px) {
        ${scope} .chat-turn-container.user ms-prompt-chunk:not(:has(ms-file-chunk)):not(:has(ms-video-chunk)):not(:has(ms-image-chunk)):not(:has(textarea)) {
          padding: 18px 15px 16px !important;
          margin-top: 34px !important;
          margin-bottom: 16px !important;
          border-radius: 22px 24px 21px 23px !important;
        }
        ${scope} .chat-turn-container.user ms-prompt-chunk:not(:has(ms-file-chunk)):not(:has(ms-video-chunk)):not(:has(ms-image-chunk)):not(:has(textarea))::before {
          inset: -9px -2px -15px !important;
          background-position: left top, right top, left 20px top, left bottom 11px, right bottom 9px, right 8px bottom, center bottom 14px !important;
          background-size: 21px 24px, 25px 24px, calc(100% - 44px) 24px, 16px 30px, 24px 26px, 11px 28px, 100% 18px !important;
        }
        ${scope} .chat-turn-container.user ms-prompt-chunk:not(:has(ms-file-chunk)):not(:has(ms-video-chunk)):not(:has(ms-image-chunk)):not(:has(textarea))::after {
          top: -38px !important;
          right: 2px !important;
          width: 46px !important;
          height: 45px !important;
        }
        ${scope} .chat-turn-container.model:not(:has(ms-thought-chunk)):not(.thought-activity-host) .turn-content,
        ${scope} .chat-turn-container.model:has(ms-thought-chunk) ms-text-chunk:not(ms-thought-chunk *) {
          padding: 22px 17px 19px !important;
          margin-top: 40px !important;
          margin-bottom: 18px !important;
          border-radius: 26px 26px 23px 23px !important;
        }
        ${scope} .chat-turn-container.model:not(:has(ms-thought-chunk)):not(.thought-activity-host) .turn-content::before,
        ${scope} .chat-turn-container.model:has(ms-thought-chunk) ms-text-chunk:not(ms-thought-chunk *)::before {
          inset: -11px -2px -21px !important;
          background-position: left top, right top, left 25px top, left bottom 15px, right bottom 13px, 68% bottom, center bottom 19px !important;
          background-size: 26px 30px, 31px 30px, calc(100% - 55px) 30px, 24px 44px, 36px 38px, 15px 36px, 100% 24px !important;
        }
        ${scope} .chat-turn-container.model:not(:has(ms-thought-chunk)):not(.thought-activity-host) .turn-content::after,
        ${scope} .chat-turn-container.model:has(ms-thought-chunk) ms-text-chunk:not(ms-thought-chunk *)::after {
          top: -48px !important;
          right: 6px !important;
          width: 58px !important;
          height: 56px !important;
        }
        ${scope} ms-prompt-box .prompt-box-container {
          border-radius: 26px !important;
          margin-top: 39px !important;
          padding-top: 17px !important;
        }
        ${scope} ms-prompt-box .prompt-box-container::before {
          inset: -11px -2px -12px !important;
          background-position: left top, right top, left 25px top, left bottom 5px, right bottom 4px, center bottom 10px !important;
          background-size: 26px 30px, 31px 30px, calc(100% - 55px) 30px, 21px 40px, 32px 34px, 100% 24px !important;
        }
        ${scope} ms-prompt-box .prompt-box-container::after {
          top: -46px !important;
          right: 6px !important;
          width: 56px !important;
          height: 54px !important;
        }
      }
    `;
  }

  function sanitizeStyleLabUrls(cssStr) {
    if (!cssStr || typeof cssStr !== 'string') return '';
    return cssStr.replace(/url\(\s*("data:image\/svg\+xml[^"]*"|'data:image\/svg\+xml[^']*')\s*\)/gi, (match) => {
      return match.replace(/#([0-9a-fA-F]{3,8})\b/g, '%23$1');
    });
  }

  function replaceStyleLabTokens(str, tokenMap) {
    if (!str || typeof str !== 'string') return '';
    const replaced = str.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
      return tokenMap[key] !== undefined ? tokenMap[key] : '';
    });
    return sanitizeStyleLabUrls(replaced);
  }

  function ensureImportantDeclarations(rawCssStr, tokenMap) {
    const resolved = replaceStyleLabTokens(rawCssStr, tokenMap).trim();
    if (!resolved) return '';

    const decls = [];
    let current = '';
    let parenDepth = 0;
    let inSingle = false;
    let inDouble = false;

    for (let i = 0; i < resolved.length; i++) {
      const ch = resolved[i];
      const prev = i > 0 ? resolved[i - 1] : '';
      if (ch === "'" && !inDouble && prev !== '\\') {
        inSingle = !inSingle;
      } else if (ch === '"' && !inSingle && prev !== '\\') {
        inDouble = !inDouble;
      } else if (!inSingle && !inDouble) {
        if (ch === '(') parenDepth++;
        else if (ch === ')' && parenDepth > 0) parenDepth--;
      }

      if (ch === ';' && parenDepth === 0 && !inSingle && !inDouble) {
        if (current.trim()) decls.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) decls.push(current.trim());

    return decls
      .map(decl => {
        if (!decl || !decl.includes(':')) return '';
        if (/!important\s*$/i.test(decl)) return `${decl};`;
        return `${decl} !important;`;
      })
      .filter(Boolean)
      .join('\n        ');
  }

  function buildRegionCSSDecl(reg, tokenMap, fallbackProps = {}) {
    if (!reg || typeof reg !== 'object') {
      return ensureImportantDeclarations(fallbackProps.css || '', tokenMap);
    }
    const parts = [];
    const propMap = [
      ['borderRadius', 'border-radius'],
      ['border', 'border'],
      ['borderTop', 'border-top'],
      ['borderRight', 'border-right'],
      ['borderBottom', 'border-bottom'],
      ['borderLeft', 'border-left'],
      ['boxShadow', 'box-shadow'],
      ['background', 'background'],
      ['clipPath', 'clip-path'],
      ['filter', 'filter'],
      ['transform', 'transform'],
      ['padding', 'padding'],
      ['margin', 'margin'],
      ['outline', 'outline']
    ];
    for (const [jsonKey, cssProp] of propMap) {
      const val = reg[jsonKey] ?? fallbackProps[jsonKey];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        parts.push(`${cssProp}: ${val}`);
      }
    }
    if (reg.css && String(reg.css).trim()) {
      parts.push(String(reg.css).trim());
    } else if (fallbackProps.css && parts.length === 0) {
      parts.push(String(fallbackProps.css).trim());
    }
    return ensureImportantDeclarations(parts.join('; '), tokenMap);
  }

  function createStyleLabTokenMap(mi = {}, scope = '', notSettings = '', extra = {}) {
    const uiBase = mi.uiBase || '#0d0e14';
    const uiSurface = mi.uiSurface || '#151722';
    const uiText = mi.uiText || '#eef2f8';
    const uiAccent = mi.uiAccent || '#a78bfa';
    const uiBorder = mi.uiBorder || '#26293d';
    const isLight = extra.isLight !== undefined ? extra.isLight : isLightHex(uiBase);
    const uiTrans = Boolean(extra.uiTrans ?? mi.transparentUiEnabled);
    const uiAlpha = extra.uiAlpha !== undefined ? extra.uiAlpha : clamp((Number(mi.uiOpacity) || 75) / 100, 0.08, 1);

    const uiSurfaceBg = extra.uiSurfaceBg || (uiTrans ? hexToRgba(uiSurface, uiAlpha) : uiSurface);
    const cardInnerBg = extra.cardInnerBg || hexToRgba(uiBase, uiTrans ? clamp(uiAlpha * 0.78, 0.22, 0.9) : (isLight ? 0.84 : 0.72));
    const uiBackdropCSS = extra.uiBackdropCSS !== undefined
      ? extra.uiBackdropCSS
      : (uiTrans ? `backdrop-filter: blur(${Number(mi.uiBlur) || 14}px) saturate(140%) !important; -webkit-backdrop-filter: blur(${Number(mi.uiBlur) || 14}px) saturate(140%) !important;` : '');

    const userBubbleBg = mi.userBubbleColor || mi.userBubbleBg || '#1f1d33';
    const modelBubbleBg = mi.modelBubbleColor || mi.modelBubbleBg || '#131520';
    const userBubbleFinalBg = extra.userBubbleFinalBg || userBubbleBg;
    const modelBubbleFinalBg = extra.modelBubbleFinalBg || modelBubbleBg;
    const mutedColor = extra.mutedColor || blendHex(uiText, uiBase, 0.38);
    const accentTextColor = extra.accentTextColor || (isLightHex(uiAccent) ? '#0b0d13' : '#ffffff');

    const shadowTone = isLight
      ? blendHex(uiBorder, '#0f172a', 0.42)
      : blendHex('#05060a', uiBorder, 0.35);
    const shadowColor = hexToRgba(isLight ? '#0f172a' : '#000000', isLight ? 0.16 : 0.45);
    const borderStrong = blendHex(uiBorder, uiAccent, 0.42);

    const snowCapColor = blendHex('#ffffff', uiAccent, isLight ? 0.10 : 0.10);
    const snowMidColor = blendHex(isLight ? '#e2e8f0' : '#f1f5f9', uiAccent, isLight ? 0.26 : 0.20);
    const snowShadeColor = blendHex(isLight ? '#94a3b8' : '#cbd5e1', uiAccent, isLight ? 0.40 : 0.32);
    const frostBorder = isLight
      ? blendHex(uiAccent, '#64748b', 0.28)
      : blendHex(uiAccent, '#ffffff', 0.42);
    const snowOutlineColor = isLight
      ? blendHex(uiAccent, '#475569', 0.42)
      : frostBorder;
    const frostRim = hexToRgba('#ffffff', isLight ? 0.92 : 0.48);
    const frostGlow = hexToRgba(uiAccent, isLight ? 0.12 : 0.16);

    return {
      scope,
      notSettings,
      uiBg: uiBase,
      uiBase,
      uiSurface,
      uiText,
      uiAccent,
      uiBorder,
      userBubbleBg,
      userBubbleText: mi.userBubbleText || uiText,
      modelBubbleBg,
      modelBubbleText: mi.modelBubbleText || uiText,
      uiSurfaceBg,
      cardInnerBg,
      uiBackdropCSS,
      userBubbleFinalBg,
      modelBubbleFinalBg,
      mutedColor,
      accentTextColor,
      shadowTone,
      shadowColor,
      borderStrong,
      snowCapColor,
      snowMidColor,
      snowShadeColor,
      frostBorder,
      snowOutlineColor,
      frostRim,
      frostGlow,
      accentSoft: hexToRgba(uiAccent, isLight ? 0.16 : 0.24),
      accentGlow: hexToRgba(uiAccent, isLight ? 0.22 : 0.34),
      uiAccentEncoded: encodeSvgHexColor(uiAccent),
      uiBaseEncoded: encodeSvgHexColor(uiBase),
      uiSurfaceEncoded: encodeSvgHexColor(uiSurface),
      uiTextEncoded: encodeSvgHexColor(uiText),
      uiBorderEncoded: encodeSvgHexColor(uiBorder),
      frostBorderEncoded: encodeSvgHexColor(frostBorder),
      snowOutlineEncoded: encodeSvgHexColor(snowOutlineColor),
      shadowToneEncoded: encodeSvgHexColor(shadowTone),
      snowCapEncoded: encodeSvgHexColor(snowCapColor),
      snowMidEncoded: encodeSvgHexColor(snowMidColor),
      snowShadeEncoded: encodeSvgHexColor(snowShadeColor),
      userBubbleBgEncoded: encodeSvgHexColor(userBubbleBg),
      modelBubbleBgEncoded: encodeSvgHexColor(modelBubbleBg)
    };
  }

  function buildCustomStylePreviewCardCSS(customStyleDef, mi = {}) {
    if (!customStyleDef || typeof customStyleDef !== 'object' || !customStyleDef.id) return '';
    const cardScope = `.sl-te-style-card[data-sl-te-style-preset="${customStyleDef.id}"]`;
    const tokenMap = createStyleLabTokenMap(mi, cardScope, '');
    const prev = customStyleDef.preview || {};
    const reg = customStyleDef.regions || {};
    const g = customStyleDef.geometry || {};

    const containerDecl = ensureImportantDeclarations(prev.containerCSS || '', tokenMap);

    const userBubbleDecl = ensureImportantDeclarations(
      prev.userBubbleCSS || reg.userBubble?.css || [
        prev.bubbleRadius || reg.userBubble?.borderRadius || g.bubbleRadius ? `border-radius: ${prev.bubbleRadius || reg.userBubble?.borderRadius || g.bubbleRadius}` : '',
        prev.bubbleBorder || reg.userBubble?.border ? `border: ${prev.bubbleBorder || reg.userBubble?.border}` : '',
        prev.bubbleShadow || reg.userBubble?.boxShadow ? `box-shadow: ${prev.bubbleShadow || reg.userBubble?.boxShadow}` : ''
      ].filter(Boolean).join('; '),
      tokenMap
    );
    const userBeforeDecl = ensureImportantDeclarations(
      prev.userBubbleBeforeCSS || reg.userBubble?.beforeCSS || '',
      tokenMap
    );
    const userAfterDecl = ensureImportantDeclarations(
      prev.userBubbleAfterCSS || reg.userBubble?.afterCSS || '',
      tokenMap
    );

    const modelBubbleDecl = ensureImportantDeclarations(
      prev.modelBubbleCSS || reg.modelBubble?.css || userBubbleDecl,
      tokenMap
    );
    const modelBeforeDecl = ensureImportantDeclarations(
      prev.modelBubbleBeforeCSS || reg.modelBubble?.beforeCSS || '',
      tokenMap
    );
    const modelAfterDecl = ensureImportantDeclarations(
      prev.modelBubbleAfterCSS || reg.modelBubble?.afterCSS || '',
      tokenMap
    );

    const avatarDecl = ensureImportantDeclarations(
      prev.avatarCSS || reg.avatar?.css || (prev.avatarRadius || reg.avatar?.borderRadius ? `border-radius: ${prev.avatarRadius || reg.avatar?.borderRadius}` : ''),
      tokenMap
    );

    const rawPreviewCSS = replaceStyleLabTokens(prev.previewCSS || '', Object.assign({}, tokenMap, {
      scope: cardScope
    }));
    const rawCustomVarsCSS = replaceStyleLabTokens(customStyleDef.customCSS || '', Object.assign({}, tokenMap, {
      scope: cardScope
    }));

    return `
      ${rawCustomVarsCSS}
      ${containerDecl ? `${cardScope} .sl-te-style-visual {\n        position: relative !important;\n        overflow: visible !important;\n        ${containerDecl}\n      }` : ''}
      ${userBubbleDecl ? `${cardScope} .sl-te-sv-bubble--user {\n        position: relative !important;\n        overflow: visible !important;\n        ${userBubbleDecl}\n      }` : ''}
      ${userBeforeDecl ? `${cardScope} .sl-te-sv-bubble--user::before {\n        pointer-events: none !important;\n        ${userBeforeDecl}\n      }` : ''}
      ${userAfterDecl ? `${cardScope} .sl-te-sv-bubble--user::after {\n        pointer-events: none !important;\n        ${userAfterDecl}\n      }` : ''}
      ${modelBubbleDecl ? `${cardScope} .sl-te-sv-bubble--model {\n        position: relative !important;\n        overflow: visible !important;\n        ${modelBubbleDecl}\n      }` : ''}
      ${modelBeforeDecl ? `${cardScope} .sl-te-sv-bubble--model::before {\n        pointer-events: none !important;\n        ${modelBeforeDecl}\n      }` : ''}
      ${modelAfterDecl ? `${cardScope} .sl-te-sv-bubble--model::after {\n        pointer-events: none !important;\n        ${modelAfterDecl}\n      }` : ''}
      ${avatarDecl ? `${cardScope} .sl-te-sv-avatar {\n        position: relative !important;\n        ${avatarDecl}\n      }` : ''}
      ${rawPreviewCSS}
    `;
  }

  function buildCustomStyleStageCSS(customStyleDef, mi = {}, stageSelector = '.sl-te-preview-stage.is-style-custom-lab') {
    if (!customStyleDef || typeof customStyleDef !== 'object') return '';
    const isLight = isLightHex(mi.uiBase);
    const hasBg = Boolean(String(mi.pageBg || '').trim());
    const uiTrans = Boolean(mi.transparentUiEnabled);
    const uiAlpha = uiTrans ? clamp((Number(mi.uiOpacity) || 82) / 100, 0.1, 1) : (hasBg ? 0.88 : 1);
    const uiBlur = uiTrans ? Math.max(0, Number(mi.uiBlur) || 0) : (hasBg ? 10 : 0);
    const uiSurfaceBg = hexToRgba(mi.uiSurface || '#151722', uiAlpha);
    const uiBackdropCSS = uiBlur > 0 ? `backdrop-filter: blur(${uiBlur}px) saturate(140%) !important; -webkit-backdrop-filter: blur(${uiBlur}px) saturate(140%) !important;` : '';

    const bubbleTrans = mi.enableChatBubbles !== false && Boolean(mi.bubbleTransparencyEnabled);
    const bAlpha = bubbleTrans ? clamp((Number(mi.bubbleOpacity) || 78) / 100, 0.08, 1) : 1;
    const userBubbleFinalBg = hexToRgba(mi.userBubbleColor || '#1f1d33', (bubbleTrans && mi.userBubbleTransparent !== false) ? bAlpha : 1);
    const modelBubbleFinalBg = hexToRgba(mi.modelBubbleColor || '#131520', (bubbleTrans && mi.modelBubbleTransparent !== false) ? bAlpha : 1);

    const tokenMap = createStyleLabTokenMap(mi, stageSelector, '', {
      isLight,
      uiTrans,
      uiAlpha,
      uiSurfaceBg,
      uiBackdropCSS,
      userBubbleFinalBg,
      modelBubbleFinalBg
    });

    const reg = customStyleDef.regions || {};
    const prev = customStyleDef.preview || {};
    const g = customStyleDef.geometry || {};
    const defaultBubbleRadius = g.bubbleRadius || '14px';
    const defaultCardRadius = g.cardRadius || '10px';
    const defaultButtonRadius = g.buttonRadius || '8px';
    const defaultBorder = `${g.borderWidth || '1.5px'} ${g.borderStyle || 'solid'} ${tokenMap.frostBorder}`;
    const defaultShadow = `inset 0 1.5px 0 0 ${tokenMap.frostRim}, 0 4px 12px -2px ${tokenMap.shadowColor}`;

    const userBubbleDecl = buildRegionCSSDecl(reg.userBubble, tokenMap, {
      borderRadius: defaultBubbleRadius,
      border: defaultBorder,
      boxShadow: defaultShadow
    });
    const userBeforeDecl = ensureImportantDeclarations(
      reg.userBubble?.beforeCSS || prev.userBubbleBeforeCSS || '',
      tokenMap
    );
    const userAfterDecl = ensureImportantDeclarations(
      reg.userBubble?.afterCSS || prev.userBubbleAfterCSS || '',
      tokenMap
    );

    const modelBubbleDecl = buildRegionCSSDecl(reg.modelBubble, tokenMap, {
      borderRadius: defaultBubbleRadius,
      border: defaultBorder,
      boxShadow: defaultShadow
    });
    const modelBeforeDecl = ensureImportantDeclarations(
      reg.modelBubble?.beforeCSS || prev.modelBubbleBeforeCSS || '',
      tokenMap
    );
    const modelAfterDecl = ensureImportantDeclarations(
      reg.modelBubble?.afterCSS || prev.modelBubbleAfterCSS || '',
      tokenMap
    );

    const avatarDecl = buildRegionCSSDecl(reg.avatar, tokenMap, {
      borderRadius: defaultCardRadius,
      border: defaultBorder,
      boxShadow: defaultShadow
    });
    const nameplateDecl = buildRegionCSSDecl(reg.nameplate, tokenMap, {
      borderRadius: defaultButtonRadius,
      border: defaultBorder,
      padding: '2px 10px',
      boxShadow: defaultShadow
    });
    const nameplateBeforeDecl = ensureImportantDeclarations(reg.nameplate?.beforeCSS || '', tokenMap);
    const nameplateAfterDecl = ensureImportantDeclarations(reg.nameplate?.afterCSS || '', tokenMap);

    const promptBoxDecl = buildRegionCSSDecl(reg.promptBox, tokenMap, {
      borderRadius: defaultBubbleRadius,
      border: defaultBorder,
      boxShadow: defaultShadow
    });
    const promptBeforeDecl = ensureImportantDeclarations(reg.promptBox?.beforeCSS || '', tokenMap);
    const promptAfterDecl = ensureImportantDeclarations(reg.promptBox?.afterCSS || '', tokenMap);

    const promptToolsDecl = buildRegionCSSDecl(reg.promptTools, tokenMap, {
      borderRadius: defaultButtonRadius,
      border: defaultBorder,
      boxShadow: defaultShadow
    });
    const codeThinkDecl = buildRegionCSSDecl(reg.codeAndThink, tokenMap, {
      borderRadius: defaultCardRadius,
      border: defaultBorder,
      boxShadow: defaultShadow
    });
    const leftSidebarDecl = ensureImportantDeclarations(reg.leftSidebar?.css || '', tokenMap);
    const leftBeforeDecl = ensureImportantDeclarations(reg.leftSidebar?.beforeCSS || '', tokenMap);
    const leftAfterDecl = ensureImportantDeclarations(reg.leftSidebar?.afterCSS || '', tokenMap);
    const leftItemDecl = ensureImportantDeclarations(reg.leftSidebar?.itemCSS || '', tokenMap);
    const leftActiveDecl = ensureImportantDeclarations(reg.leftSidebar?.activeCSS || '', tokenMap);
    const rightSidebarDecl = ensureImportantDeclarations(reg.rightSidebar?.css || '', tokenMap);
    const rightBeforeDecl = ensureImportantDeclarations(reg.rightSidebar?.beforeCSS || '', tokenMap);
    const rightAfterDecl = ensureImportantDeclarations(reg.rightSidebar?.afterCSS || '', tokenMap);
    const rightCardDecl = ensureImportantDeclarations(reg.rightSidebar?.cardCSS || '', tokenMap);
    const headerBtnDecl = ensureImportantDeclarations(reg.editModalAndHeader?.headerButtonCSS || '', tokenMap);

    const extraCSS = replaceStyleLabTokens(customStyleDef.customCSS || '', tokenMap);

    return `
      ${extraCSS}
      ${stageSelector} [data-sl-te-stage-user-bubble] {
        position: relative !important;
        overflow: visible !important;
        ${userBubbleDecl}
      }
      ${userBeforeDecl ? `${stageSelector} [data-sl-te-stage-user-bubble]::before {\n        pointer-events: none !important;\n        z-index: 4 !important;\n        ${userBeforeDecl}\n      }` : ''}
      ${userAfterDecl ? `${stageSelector} [data-sl-te-stage-user-bubble]::after {\n        pointer-events: none !important;\n        z-index: 5 !important;\n        ${userAfterDecl}\n      }` : ''}
      ${stageSelector} [data-sl-te-stage-model-bubble] {
        position: relative !important;
        overflow: visible !important;
        ${modelBubbleDecl}
      }
      ${modelBeforeDecl ? `${stageSelector} [data-sl-te-stage-model-bubble]::before {\n        pointer-events: none !important;\n        z-index: 4 !important;\n        ${modelBeforeDecl}\n      }` : ''}
      ${modelAfterDecl ? `${stageSelector} [data-sl-te-stage-model-bubble]::after {\n        pointer-events: none !important;\n        z-index: 5 !important;\n        ${modelAfterDecl}\n      }` : ''}
      ${stageSelector} [data-sl-te-stage-user-avatar],
      ${stageSelector} [data-sl-te-stage-model-avatar] {
        position: relative !important;
        ${avatarDecl}
      }
      ${stageSelector} [data-sl-te-stage-user-name],
      ${stageSelector} [data-sl-te-stage-model-name] {
        position: relative !important;
        background: ${uiSurfaceBg} !important;
        ${nameplateDecl}
        ${uiBackdropCSS}
      }
      ${nameplateBeforeDecl ? `${stageSelector} [data-sl-te-stage-user-name]::before, ${stageSelector} [data-sl-te-stage-model-name]::before { ${nameplateBeforeDecl} }` : ''}
      ${nameplateAfterDecl ? `${stageSelector} [data-sl-te-stage-user-name]::after, ${stageSelector} [data-sl-te-stage-model-name]::after { ${nameplateAfterDecl} }` : ''}
      ${stageSelector} [data-sl-te-stage-prompt] {
        position: relative !important;
        overflow: visible !important;
        ${promptBoxDecl}
      }
      ${promptBeforeDecl ? `${stageSelector} [data-sl-te-stage-prompt]::before {\n        pointer-events: none !important;\n        z-index: 4 !important;\n        ${promptBeforeDecl}\n      }` : ''}
      ${promptAfterDecl ? `${stageSelector} [data-sl-te-stage-prompt]::after {\n        pointer-events: none !important;\n        z-index: 5 !important;\n        ${promptAfterDecl}\n      }` : ''}
      ${promptToolsDecl ? `${stageSelector} [data-sl-te-stage-run] { ${promptToolsDecl} }` : ''}
      ${codeThinkDecl ? `${stageSelector} [data-sl-te-stage-think] { ${codeThinkDecl} }` : ''}
      ${leftSidebarDecl ? `${stageSelector} [data-sl-te-stage-sidebar] { position: relative !important; ${leftSidebarDecl} }` : ''}
      ${leftBeforeDecl ? `${stageSelector} [data-sl-te-stage-sidebar]::before { pointer-events: none !important; ${leftBeforeDecl} }` : ''}
      ${leftAfterDecl ? `${stageSelector} [data-sl-te-stage-sidebar]::after { pointer-events: none !important; ${leftAfterDecl} }` : ''}
      ${leftItemDecl ? `${stageSelector} [data-sl-te-stage-sidebar] .sl-te-preview-pill { ${leftItemDecl} }` : ''}
      ${leftActiveDecl ? `${stageSelector} [data-sl-te-stage-nav-active] { ${leftActiveDecl} }` : ''}
      ${rightSidebarDecl ? `${stageSelector} [data-sl-te-stage-rightpanel] { position: relative !important; ${rightSidebarDecl} }` : ''}
      ${rightBeforeDecl ? `${stageSelector} [data-sl-te-stage-rightpanel]::before { pointer-events: none !important; ${rightBeforeDecl} }` : ''}
      ${rightAfterDecl ? `${stageSelector} [data-sl-te-stage-rightpanel]::after { pointer-events: none !important; ${rightAfterDecl} }` : ''}
      ${rightCardDecl ? `${stageSelector} [data-sl-te-stage-model-box], ${stageSelector} [data-sl-te-stage-chip] { ${rightCardDecl} }` : ''}
      ${headerBtnDecl ? `${stageSelector} [data-sl-te-stage-preset-badge] { padding: 2px 8px !important; ${headerBtnDecl} }` : ''}
    `;
  }

  function buildCustomStyleLabCSS(customStyleDef, scope, notSettings, {
    mi,
    isLight,
    mutedColor,
    accentTextColor,
    uiSurfaceBg,
    uiBackdropCSS,
    uiTrans,
    uiAlpha,
    userBubbleFinalBg,
    modelBubbleFinalBg
  }) {
    if (!customStyleDef || typeof customStyleDef !== 'object') return '';
    const cardInnerBg = hexToRgba(mi.uiBase, uiTrans ? clamp(uiAlpha * 0.78, 0.22, 0.9) : (isLight ? 0.84 : 0.72));
    const tokenMap = createStyleLabTokenMap(mi, scope, notSettings, {
      isLight,
      mutedColor,
      accentTextColor,
      uiSurfaceBg,
      cardInnerBg,
      uiBackdropCSS,
      uiTrans,
      uiAlpha,
      userBubbleFinalBg,
      modelBubbleFinalBg
    });

    const reg = customStyleDef.regions || {};
    const g = customStyleDef.geometry || {};
    const d = customStyleDef.decorations || {};

    const defaultBubbleRadius = g.bubbleRadius || '16px';
    const defaultCardRadius = g.cardRadius || '14px';
    const defaultButtonRadius = g.buttonRadius || '12px';
    const defaultBorder = `${g.borderWidth || '1.5px'} ${g.borderStyle || 'solid'} ${tokenMap.frostBorder}`;
    const defaultShadow = replaceStyleLabTokens(
      g.shadowStyle || `inset 0 1.5px 0 0 {{frostRim}}, 0 6px 18px -4px {{shadowColor}}`,
      tokenMap
    );

    // 1. User Bubble
    const userBubbleDecl = buildRegionCSSDecl(reg.userBubble, tokenMap, {
      borderRadius: defaultBubbleRadius,
      border: defaultBorder,
      boxShadow: defaultShadow
    });
    const userBubbleBeforeDecl = ensureImportantDeclarations(reg.userBubble?.beforeCSS || '', tokenMap);
    const userBubbleAfterDecl = ensureImportantDeclarations(reg.userBubble?.afterCSS || '', tokenMap);
    const userBubbleHoverDecl = ensureImportantDeclarations(reg.userBubble?.hoverCSS || '', tokenMap);
    const userBubbleTextDecl = ensureImportantDeclarations(reg.userBubble?.textCSS || '', tokenMap);
    const userBubbleMediaDecl = ensureImportantDeclarations(reg.userBubble?.mediaCSS || '', tokenMap);

    // 2. Model Bubble
    const modelBubbleDecl = buildRegionCSSDecl(reg.modelBubble, tokenMap, {
      borderRadius: defaultBubbleRadius,
      border: defaultBorder,
      boxShadow: defaultShadow
    });
    const modelBubbleBeforeDecl = ensureImportantDeclarations(reg.modelBubble?.beforeCSS || '', tokenMap);
    const modelBubbleAfterDecl = ensureImportantDeclarations(reg.modelBubble?.afterCSS || '', tokenMap);
    const modelBubbleHoverDecl = ensureImportantDeclarations(reg.modelBubble?.hoverCSS || '', tokenMap);
    const modelBubbleTextDecl = ensureImportantDeclarations(reg.modelBubble?.textCSS || '', tokenMap);
    const modelBlockquoteDecl = ensureImportantDeclarations(reg.modelBubble?.blockquoteCSS || '', tokenMap);
    const modelHrDecl = ensureImportantDeclarations(reg.modelBubble?.hrCSS || '', tokenMap);
    const modelTableDecl = ensureImportantDeclarations(reg.modelBubble?.tableCSS || '', tokenMap);
    const modelTableHeaderDecl = ensureImportantDeclarations(reg.modelBubble?.tableHeaderCSS || '', tokenMap);
    const modelTableCellDecl = ensureImportantDeclarations(reg.modelBubble?.tableCellCSS || '', tokenMap);
    const modelLinkDecl = ensureImportantDeclarations(reg.modelBubble?.linkCSS || '', tokenMap);
    const modelGroundingDecl = ensureImportantDeclarations(reg.modelBubble?.groundingCSS || '', tokenMap);
    const modelImageDecl = ensureImportantDeclarations(reg.modelBubble?.imageCSS || '', tokenMap);

    // 3. Avatar
    const avatarDecl = buildRegionCSSDecl(reg.avatar, tokenMap, {
      borderRadius: defaultCardRadius,
      border: defaultBorder,
      boxShadow: defaultShadow
    });
    const avatarBeforeDecl = ensureImportantDeclarations(reg.avatar?.beforeCSS || '', tokenMap);
    const avatarAfterDecl = ensureImportantDeclarations(reg.avatar?.afterCSS || '', tokenMap);
    const userAvatarDecl = ensureImportantDeclarations(reg.avatar?.userAvatarCSS || '', tokenMap);
    const modelAvatarDecl = ensureImportantDeclarations(reg.avatar?.modelAvatarCSS || '', tokenMap);

    // 4. Nameplate (Always inherits UI Blur & UI Surface Opacity)
    const nameplateDecl = buildRegionCSSDecl(reg.nameplate, tokenMap, {
      borderRadius: defaultButtonRadius,
      border: defaultBorder,
      padding: '3px 12px',
      boxShadow: defaultShadow
    });
    const namePrefix = reg.nameplate?.prefix ? String(reg.nameplate.prefix).replace(/"/g, '\\"') : '';
    const nameSuffix = (reg.nameplate?.suffix || d.badgeSuffix || '').replace(/"/g, '\\"');
    const nameplateBeforeDecl = ensureImportantDeclarations(
      reg.nameplate?.beforeCSS || (namePrefix ? `content: "${namePrefix}"; color: {{uiAccent}}; font-weight: 700;` : ''),
      tokenMap
    );
    const nameplateAfterDecl = ensureImportantDeclarations(
      reg.nameplate?.afterCSS || (nameSuffix ? `content: " ${nameSuffix}"; color: {{uiAccent}}; font-size: 0.88em;` : ''),
      tokenMap
    );
    const userNameDecl = ensureImportantDeclarations(reg.nameplate?.userNameCSS || '', tokenMap);
    const modelNameDecl = ensureImportantDeclarations(reg.nameplate?.modelNameCSS || '', tokenMap);

    // 5. Action Dock (Hover & Edit toolbar) & <X/Y> Turn Pager & Inline Turn Edit
    const actionDockDecl = buildRegionCSSDecl(reg.actionDock, tokenMap, {
      borderRadius: defaultButtonRadius,
      border: defaultBorder,
      boxShadow: defaultShadow
    });
    const actionDockBeforeDecl = ensureImportantDeclarations(reg.actionDock?.beforeCSS || '', tokenMap);
    const actionDockAfterDecl = ensureImportantDeclarations(reg.actionDock?.afterCSS || '', tokenMap);
    const actionDockButtonDecl = ensureImportantDeclarations(reg.actionDock?.buttonCSS || '', tokenMap);
    const actionDockButtonHoverDecl = ensureImportantDeclarations(reg.actionDock?.buttonHoverCSS || reg.actionDock?.hoverCSS || '', tokenMap);
    const actionDockEditButtonDecl = ensureImportantDeclarations(reg.actionDock?.editButtonCSS || '', tokenMap);
    const pagerDecl = ensureImportantDeclarations(reg.actionDock?.pagerCSS || '', tokenMap);
    const pagerButtonDecl = ensureImportantDeclarations(reg.actionDock?.pagerButtonCSS || '', tokenMap);
    const pagerCounterDecl = ensureImportantDeclarations(reg.actionDock?.pagerCounterCSS || '', tokenMap);
    const inlineEditDecl = ensureImportantDeclarations(reg.actionDock?.inlineEditCSS || '', tokenMap);

    // 6. Prompt Box (Main input bar + focus state + ::before/::after + input/formatBar/scrollBottom/attachment)
    const promptBoxDecl = buildRegionCSSDecl(reg.promptBox, tokenMap, {
      borderRadius: defaultBubbleRadius,
      border: defaultBorder,
      boxShadow: defaultShadow
    });
    const promptBoxFocusDecl = ensureImportantDeclarations(
      reg.promptBox?.focusCSS || [
        reg.promptBox?.focusBorderColor ? `border-color: ${reg.promptBox.focusBorderColor}` : `border-color: {{uiAccent}}`,
        reg.promptBox?.focusBoxShadow ? `box-shadow: ${reg.promptBox.focusBoxShadow}` : `box-shadow: inset 0 1.5px 0 0 {{frostRim}}, 0 0 0 2px {{accentGlow}}, ${defaultShadow}`
      ].join('; '),
      tokenMap
    );
    const promptBoxBeforeDecl = ensureImportantDeclarations(reg.promptBox?.beforeCSS || '', tokenMap);
    const promptBoxAfterDecl = ensureImportantDeclarations(reg.promptBox?.afterCSS || '', tokenMap);
    const promptInputDecl = ensureImportantDeclarations(reg.promptBox?.inputCSS || '', tokenMap);
    const promptPlaceholderDecl = ensureImportantDeclarations(reg.promptBox?.placeholderCSS || '', tokenMap);
    const promptFormatBarDecl = ensureImportantDeclarations(reg.promptBox?.formatBarCSS || '', tokenMap);
    const promptFormatButtonDecl = ensureImportantDeclarations(reg.promptBox?.formatButtonCSS || '', tokenMap);
    const promptFormatButtonHoverDecl = ensureImportantDeclarations(reg.promptBox?.formatButtonHoverCSS || '', tokenMap);
    const promptAttachmentDecl = ensureImportantDeclarations(reg.promptBox?.attachmentCSS || '', tokenMap);
    const scrollBottomBtnDecl = ensureImportantDeclarations(reg.promptBox?.scrollBottomButtonCSS || '', tokenMap);

    // 7. Prompt Tools (+, Aa, STT/Mic, Run button, .enabled-tool chips)
    const promptToolsDecl = buildRegionCSSDecl(reg.promptTools, tokenMap, {
      borderRadius: defaultButtonRadius,
      border: defaultBorder,
      boxShadow: defaultShadow
    });
    const promptToolsBeforeDecl = ensureImportantDeclarations(reg.promptTools?.beforeCSS || '', tokenMap);
    const promptToolsAfterDecl = ensureImportantDeclarations(reg.promptTools?.afterCSS || '', tokenMap);
    const promptToolsHoverDecl = ensureImportantDeclarations(reg.promptTools?.hoverCSS || '', tokenMap);
    const promptToolsFocusDecl = ensureImportantDeclarations(reg.promptTools?.focusCSS || '', tokenMap);
    const promptAddBtnDecl = ensureImportantDeclarations(reg.promptTools?.addButtonCSS || '', tokenMap);
    const promptChipDecl = ensureImportantDeclarations(reg.promptTools?.chipCSS || '', tokenMap);
    const promptChipHoverDecl = ensureImportantDeclarations(reg.promptTools?.chipHoverCSS || '', tokenMap);
    const promptSttBtnDecl = ensureImportantDeclarations(reg.promptTools?.sttButtonCSS || '', tokenMap);
    const runButtonDecl = ensureImportantDeclarations(reg.promptTools?.runButtonCSS || '', tokenMap);
    const runButtonHoverDecl = ensureImportantDeclarations(reg.promptTools?.runButtonHoverCSS || '', tokenMap);
    const runButtonDisabledDecl = ensureImportantDeclarations(reg.promptTools?.runButtonDisabledCSS || '', tokenMap);

    // 8. Code Block, Inline Code & Think Block
    const codeAndThinkDecl = buildRegionCSSDecl(reg.codeAndThink, tokenMap, {
      borderRadius: defaultCardRadius,
      border: defaultBorder,
      boxShadow: defaultShadow
    });
    const codeAndThinkBeforeDecl = ensureImportantDeclarations(reg.codeAndThink?.beforeCSS || '', tokenMap);
    const codeAndThinkAfterDecl = ensureImportantDeclarations(reg.codeAndThink?.afterCSS || '', tokenMap);
    const codeAndThinkHeaderDecl = ensureImportantDeclarations(reg.codeAndThink?.headerCSS || '', tokenMap);
    const codeSpecificDecl = ensureImportantDeclarations(reg.codeAndThink?.codeCSS || '', tokenMap);
    const codeBeforeDecl = ensureImportantDeclarations(reg.codeAndThink?.codeBeforeCSS || '', tokenMap);
    const codeAfterDecl = ensureImportantDeclarations(reg.codeAndThink?.codeAfterCSS || '', tokenMap);
    const codeHeaderDecl = ensureImportantDeclarations(reg.codeAndThink?.codeHeaderCSS || '', tokenMap);
    const codeButtonDecl = ensureImportantDeclarations(reg.codeAndThink?.codeButtonCSS || '', tokenMap);
    const inlineCodeDecl = ensureImportantDeclarations(reg.codeAndThink?.inlineCodeCSS || '', tokenMap);
    const thinkSpecificDecl = ensureImportantDeclarations(reg.codeAndThink?.thinkCSS || '', tokenMap);
    const thinkBeforeDecl = ensureImportantDeclarations(reg.codeAndThink?.thinkBeforeCSS || '', tokenMap);
    const thinkAfterDecl = ensureImportantDeclarations(reg.codeAndThink?.thinkAfterCSS || '', tokenMap);
    const thinkHeaderDecl = ensureImportantDeclarations(reg.codeAndThink?.thinkHeaderCSS || '', tokenMap);

    // 9. Left Sidebar (Outer Boundary Border + ::before/::after + Header + New Prompt + Nav Items + Badges + Footer)
    // Filter out position: relative on the outer container so mobile slide-over drawers are never broken
    const leftSidebarRaw = reg.leftSidebar?.css || (reg.leftSidebar?.borderRight ? `border-right: ${reg.leftSidebar.borderRight}` : `border-right: ${defaultBorder}`);
    const leftSidebarSafe = String(leftSidebarRaw).replace(/position\s*:\s*relative\s*(!important)?\s*;?/gi, '');
    const leftSidebarDecl = ensureImportantDeclarations(leftSidebarSafe, tokenMap);
    const leftBeforeDecl = ensureImportantDeclarations(reg.leftSidebar?.beforeCSS || '', tokenMap);
    const leftAfterDecl = ensureImportantDeclarations(reg.leftSidebar?.afterCSS || '', tokenMap);
    const leftHeaderDecl = ensureImportantDeclarations(reg.leftSidebar?.headerCSS || '', tokenMap);
    const leftNewPromptDecl = ensureImportantDeclarations(reg.leftSidebar?.newPromptButtonCSS || '', tokenMap);
    const leftItemDecl = ensureImportantDeclarations(
      reg.leftSidebar?.itemCSS || (reg.leftSidebar?.itemRadius ? `border-radius: ${reg.leftSidebar.itemRadius}` : `border-radius: ${defaultButtonRadius}`),
      tokenMap
    );
    const leftItemBeforeDecl = ensureImportantDeclarations(reg.leftSidebar?.itemBeforeCSS || '', tokenMap);
    const leftItemAfterDecl = ensureImportantDeclarations(reg.leftSidebar?.itemAfterCSS || '', tokenMap);
    const leftActiveDecl = ensureImportantDeclarations(
      reg.leftSidebar?.activeCSS || [
        reg.leftSidebar?.itemRadius ? `border-radius: ${reg.leftSidebar.itemRadius}` : `border-radius: ${defaultButtonRadius}`,
        `background: {{accentSoft}}`,
        reg.leftSidebar?.activeBorder ? `border: ${reg.leftSidebar.activeBorder}` : `border: ${defaultBorder}`,
        reg.leftSidebar?.activeShadow ? `box-shadow: ${reg.leftSidebar.activeShadow}` : `box-shadow: ${defaultShadow}`
      ].join('; '),
      tokenMap
    );
    const leftHoverDecl = ensureImportantDeclarations(reg.leftSidebar?.hoverCSS || '', tokenMap);
    const leftBadgeDecl = ensureImportantDeclarations(reg.leftSidebar?.badgeCSS || '', tokenMap);
    const leftSectionTitleDecl = ensureImportantDeclarations(reg.leftSidebar?.sectionTitleCSS || '', tokenMap);
    const leftFooterDecl = ensureImportantDeclarations(reg.leftSidebar?.footerCSS || '', tokenMap);
    const leftAccountBtnDecl = ensureImportantDeclarations(reg.leftSidebar?.accountButtonCSS || '', tokenMap);

    // 10. Right Sidebar (Outer Boundary Border + ::before/::after + Header + Cards + Sliders + Toggles + Inputs + Buttons, keeping URL context 100% transparent!)
    // Filter out position: relative on the outer container so mobile slide-over drawers are never broken
    const rightSidebarRaw = reg.rightSidebar?.css || (reg.rightSidebar?.borderLeft ? `border-left: ${reg.rightSidebar.borderLeft}` : `border-left: ${defaultBorder}`);
    const rightSidebarSafe = String(rightSidebarRaw).replace(/position\s*:\s*relative\s*(!important)?\s*;?/gi, '');
    const rightSidebarDecl = ensureImportantDeclarations(rightSidebarSafe, tokenMap);
    const rightBeforeDecl = ensureImportantDeclarations(reg.rightSidebar?.beforeCSS || '', tokenMap);
    const rightAfterDecl = ensureImportantDeclarations(reg.rightSidebar?.afterCSS || '', tokenMap);
    const rightHeaderDecl = ensureImportantDeclarations(reg.rightSidebar?.headerCSS || '', tokenMap);
    const rightCloseBtnDecl = ensureImportantDeclarations(reg.rightSidebar?.closeButtonCSS || '', tokenMap);
    const rightCardDecl = ensureImportantDeclarations(
      reg.rightSidebar?.cardCSS || [
        reg.rightSidebar?.cardRadius ? `border-radius: ${reg.rightSidebar.cardRadius}` : `border-radius: ${defaultCardRadius}`,
        `background: {{cardInnerBg}}`,
        reg.rightSidebar?.cardBorder ? `border: ${reg.rightSidebar.cardBorder}` : `border: ${defaultBorder}`,
        reg.rightSidebar?.cardShadow ? `box-shadow: ${reg.rightSidebar.cardShadow}` : `box-shadow: ${defaultShadow}`
      ].join('; '),
      tokenMap
    );
    const rightCardBeforeDecl = ensureImportantDeclarations(reg.rightSidebar?.cardBeforeCSS || '', tokenMap);
    const rightCardAfterDecl = ensureImportantDeclarations(reg.rightSidebar?.cardAfterCSS || '', tokenMap);
    const rightCardHoverDecl = ensureImportantDeclarations(reg.rightSidebar?.cardHoverCSS || '', tokenMap);
    const rightModelSelectorDecl = ensureImportantDeclarations(reg.rightSidebar?.modelSelectorCSS || '', tokenMap);
    const rightSystemInstrDecl = ensureImportantDeclarations(reg.rightSidebar?.systemInstructionsCSS || '', tokenMap);
    const rightSectionTitleDecl = ensureImportantDeclarations(reg.rightSidebar?.sectionTitleCSS || '', tokenMap);
    const rightSliderDecl = ensureImportantDeclarations(reg.rightSidebar?.sliderCSS || '', tokenMap);
    const rightSliderTrackDecl = ensureImportantDeclarations(reg.rightSidebar?.sliderTrackCSS || '', tokenMap);
    const rightSliderThumbDecl = ensureImportantDeclarations(reg.rightSidebar?.sliderThumbCSS || '', tokenMap);
    const rightToggleDecl = ensureImportantDeclarations(reg.rightSidebar?.toggleCSS || '', tokenMap);
    const rightInputDecl = ensureImportantDeclarations(reg.rightSidebar?.inputCSS || '', tokenMap);
    const rightButtonDecl = ensureImportantDeclarations(
      reg.rightSidebar?.buttonCSS || `border-radius: ${defaultButtonRadius}; border: ${defaultBorder}; background: {{cardInnerBg}};`,
      tokenMap
    );
    const rightButtonHoverDecl = ensureImportantDeclarations(reg.rightSidebar?.buttonHoverCSS || '', tokenMap);

    // 11. Edit Modal (.aistu-edit-modal-*), Top Playground Toolbar (<ms-header>), Dropdowns, Scrollbars & Zero-State Cards
    const modalBackdropDecl = ensureImportantDeclarations(reg.editModalAndHeader?.modalBackdropCSS || '', tokenMap);
    const modalCardDecl = ensureImportantDeclarations(
      reg.editModalAndHeader?.modalCSS || reg.editModalAndHeader?.css || [
        reg.editModalAndHeader?.modalRadius ? `border-radius: ${reg.editModalAndHeader.modalRadius}` : `border-radius: ${defaultBubbleRadius}`,
        reg.editModalAndHeader?.modalBorder ? `border: ${reg.editModalAndHeader.modalBorder}` : `border: ${defaultBorder}`,
        reg.editModalAndHeader?.modalShadow ? `box-shadow: ${reg.editModalAndHeader.modalShadow}` : `box-shadow: ${defaultShadow}`
      ].join('; '),
      tokenMap
    );
    const modalBeforeDecl = ensureImportantDeclarations(reg.editModalAndHeader?.modalBeforeCSS || '', tokenMap);
    const modalAfterDecl = ensureImportantDeclarations(reg.editModalAndHeader?.modalAfterCSS || '', tokenMap);
    const modalHeaderDecl = ensureImportantDeclarations(reg.editModalAndHeader?.modalHeaderCSS || '', tokenMap);
    const modalRoleBadgeDecl = ensureImportantDeclarations(reg.editModalAndHeader?.modalRoleBadgeCSS || '', tokenMap);
    const modalTitleDecl = ensureImportantDeclarations(reg.editModalAndHeader?.modalTitleCSS || '', tokenMap);
    const modalBodyDecl = ensureImportantDeclarations(reg.editModalAndHeader?.modalBodyCSS || '', tokenMap);
    const modalTextareaDecl = ensureImportantDeclarations(reg.editModalAndHeader?.modalTextareaCSS || '', tokenMap);
    const modalFooterDecl = ensureImportantDeclarations(reg.editModalAndHeader?.modalFooterCSS || '', tokenMap);
    const modalButtonDecl = ensureImportantDeclarations(reg.editModalAndHeader?.modalButtonCSS || '', tokenMap);
    const modalSaveButtonDecl = ensureImportantDeclarations(reg.editModalAndHeader?.modalSaveButtonCSS || '', tokenMap);
    const improvePopupDecl = ensureImportantDeclarations(reg.editModalAndHeader?.improvePopupCSS || '', tokenMap);
    const improveOptionDecl = ensureImportantDeclarations(reg.editModalAndHeader?.improveOptionCSS || '', tokenMap);
    const improveInputDecl = ensureImportantDeclarations(reg.editModalAndHeader?.improveInputCSS || '', tokenMap);

    const toolbarDecl = ensureImportantDeclarations(reg.editModalAndHeader?.toolbarCSS || '', tokenMap);
    const toolbarBeforeDecl = ensureImportantDeclarations(reg.editModalAndHeader?.toolbarBeforeCSS || '', tokenMap);
    const toolbarAfterDecl = ensureImportantDeclarations(reg.editModalAndHeader?.toolbarAfterCSS || '', tokenMap);
    const titleDecl = ensureImportantDeclarations(reg.editModalAndHeader?.titleCSS || '', tokenMap);
    const titleEditBtnDecl = ensureImportantDeclarations(reg.editModalAndHeader?.titleEditButtonCSS || '', tokenMap);
    const headerButtonDecl = ensureImportantDeclarations(
      reg.editModalAndHeader?.headerButtonCSS || [
        reg.editModalAndHeader?.headerButtonRadius ? `border-radius: ${reg.editModalAndHeader.headerButtonRadius}` : `border-radius: ${defaultButtonRadius}`,
        reg.editModalAndHeader?.headerButtonBorder ? `border: ${reg.editModalAndHeader.headerButtonBorder}` : `border: ${defaultBorder}`,
        `background: {{uiSurfaceBg}}`,
        `box-shadow: ${defaultShadow}`
      ].join('; '),
      tokenMap
    );
    const headerButtonHoverDecl = ensureImportantDeclarations(reg.editModalAndHeader?.headerButtonHoverCSS || '', tokenMap);
    const tokenPillDecl = ensureImportantDeclarations(reg.editModalAndHeader?.tokenPillCSS || headerButtonDecl, tokenMap);
    const tokenValueDecl = ensureImportantDeclarations(reg.editModalAndHeader?.tokenValueCSS || '', tokenMap);
    const dropdownDecl = ensureImportantDeclarations(reg.editModalAndHeader?.dropdownCSS || '', tokenMap);
    const scrollbarDecl = ensureImportantDeclarations(reg.editModalAndHeader?.scrollbarCSS || '', tokenMap);
    const zeroStateDecl = ensureImportantDeclarations(reg.editModalAndHeader?.zeroStateCSS || '', tokenMap);

    // 12. Top-level Freeform customCSS
    const extraCSS = replaceStyleLabTokens(customStyleDef.customCSS || '', tokenMap);

    return `
      /* === CUSTOM .STYLELAB PRESET (FULL-DOM FREEFORM CSS & SVG): ${customStyleDef.name || customStyleDef.id} === */

      /* 1. User Chat Bubble */
      ${scope} .chat-turn-container.user ms-prompt-chunk:not(:has(ms-file-chunk)):not(:has(ms-video-chunk)):not(:has(ms-image-chunk)):not(:has(textarea)) {
        position: relative !important;
        overflow: visible !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
        ${userBubbleDecl}
      }
      ${userBubbleBeforeDecl ? `
      ${scope} .chat-turn-container.user ms-prompt-chunk:not(:has(ms-file-chunk)):not(:has(ms-video-chunk)):not(:has(ms-image-chunk)):not(:has(textarea))::before {
        pointer-events: none !important;
        z-index: 4 !important;
        ${userBubbleBeforeDecl}
      }` : ''}
      ${userBubbleAfterDecl ? `
      ${scope} .chat-turn-container.user ms-prompt-chunk:not(:has(ms-file-chunk)):not(:has(ms-video-chunk)):not(:has(ms-image-chunk)):not(:has(textarea))::after {
        pointer-events: none !important;
        z-index: 6 !important;
        ${userBubbleAfterDecl}
      }` : ''}
      ${userBubbleHoverDecl ? `
      ${scope} .chat-turn-container.user ms-prompt-chunk:not(:has(ms-file-chunk)):not(:has(ms-video-chunk)):not(:has(ms-image-chunk)):not(:has(textarea)):hover {
        ${userBubbleHoverDecl}
      }` : ''}
      ${userBubbleTextDecl ? `${scope} .chat-turn-container.user ms-text-chunk { ${userBubbleTextDecl} }` : ''}
      ${userBubbleMediaDecl ? `
      ${scope} .chat-turn-container.user :is(ms-image-chunk img, ms-video-chunk, ms-audio-chunk, ms-file-chunk) {
        ${userBubbleMediaDecl}
      }` : ''}

      /* 2. Model Chat Bubble */
      ${scope} .chat-turn-container.model:not(:has(ms-thought-chunk)):not(.thought-activity-host) .turn-content,
      ${scope} .chat-turn-container.model:has(ms-thought-chunk) ms-text-chunk:not(ms-thought-chunk *) {
        position: relative !important;
        overflow: visible !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
        ${modelBubbleDecl}
      }
      ${modelBubbleBeforeDecl ? `
      ${scope} .chat-turn-container.model:not(:has(ms-thought-chunk)):not(.thought-activity-host) .turn-content::before,
      ${scope} .chat-turn-container.model:has(ms-thought-chunk) ms-text-chunk:not(ms-thought-chunk *)::before {
        pointer-events: none !important;
        z-index: 4 !important;
        ${modelBubbleBeforeDecl}
      }` : ''}
      ${modelBubbleAfterDecl ? `
      ${scope} .chat-turn-container.model:not(:has(ms-thought-chunk)):not(.thought-activity-host) .turn-content::after,
      ${scope} .chat-turn-container.model:has(ms-thought-chunk) ms-text-chunk:not(ms-thought-chunk *)::after {
        pointer-events: none !important;
        z-index: 6 !important;
        ${modelBubbleAfterDecl}
      }` : ''}
      ${modelBubbleHoverDecl ? `
      ${scope} .chat-turn-container.model:not(:has(ms-thought-chunk)):not(.thought-activity-host) .turn-content:hover,
      ${scope} .chat-turn-container.model:has(ms-thought-chunk) ms-text-chunk:not(ms-thought-chunk *):hover {
        ${modelBubbleHoverDecl}
      }` : ''}
      ${modelBubbleTextDecl ? `${scope} .chat-turn-container.model ms-text-chunk:not(ms-thought-chunk *) { ${modelBubbleTextDecl} }` : ''}
      ${modelBlockquoteDecl ? `${scope} .chat-turn-container.model ms-text-chunk blockquote { ${modelBlockquoteDecl} }` : ''}
      ${modelHrDecl ? `${scope} .chat-turn-container.model ms-text-chunk hr { ${modelHrDecl} }` : ''}
      ${modelTableDecl ? `${scope} .chat-turn-container.model ms-text-chunk table { ${modelTableDecl} }` : ''}
      ${modelTableHeaderDecl ? `${scope} .chat-turn-container.model ms-text-chunk :is(thead, th) { ${modelTableHeaderDecl} }` : ''}
      ${modelTableCellDecl ? `${scope} .chat-turn-container.model ms-text-chunk :is(td, tbody tr) { ${modelTableCellDecl} }` : ''}
      ${modelLinkDecl ? `${scope} .chat-turn-container.model ms-text-chunk a { ${modelLinkDecl} }` : ''}
      ${modelGroundingDecl ? `${scope} .chat-turn-container.model :is(ms-grounding-sources, .grounding-chip, .citation-chip, .search-entry-chip) { ${modelGroundingDecl} }` : ''}
      ${modelImageDecl ? `${scope} .chat-turn-container.model :is(ms-image-chunk img, ms-cmark-node img) { ${modelImageDecl} }` : ''}

      /* 3. Roleplay Avatar */
      ${scope} .sl-rp-avatar {
        position: relative !important;
        ${avatarDecl}
      }
      ${avatarBeforeDecl ? `${scope} .sl-rp-avatar::before { pointer-events: none !important; ${avatarBeforeDecl} }` : ''}
      ${avatarAfterDecl ? `${scope} .sl-rp-avatar::after { pointer-events: none !important; ${avatarAfterDecl} }` : ''}
      ${userAvatarDecl ? `${scope} .sl-rp-user-header .sl-rp-avatar { ${userAvatarDecl} }` : ''}
      ${modelAvatarDecl ? `${scope} .sl-rp-model-header .sl-rp-avatar { ${modelAvatarDecl} }` : ''}

      /* 4. Roleplay Nameplate (Synchronized with UI Blur) */
      ${scope} .sl-rp-name {
        position: relative !important;
        background: ${uiSurfaceBg} !important;
        ${nameplateDecl}
        ${uiBackdropCSS}
      }
      ${nameplateBeforeDecl ? `${scope} .sl-rp-name::before { ${nameplateBeforeDecl} }` : ''}
      ${nameplateAfterDecl ? `${scope} .sl-rp-name::after { ${nameplateAfterDecl} }` : ''}
      ${userNameDecl ? `${scope} .sl-rp-user-header .sl-rp-name { ${userNameDecl} }` : ''}
      ${modelNameDecl ? `${scope} .sl-rp-model-header .sl-rp-name { ${modelNameDecl} }` : ''}

      /* 5. Action Dock (Hover & Edit) & <X/Y> Turn Pager & Inline Turn Edit */
      ${scope} .chat-turn-container .actions.hover-or-edit,
      ${scope} .chat-turn-container .turn-footer${notSettings},
      ${scope} .aistu-history-navigator,
      ${scope} .aistu-Sibling-nav {
        position: relative !important;
        overflow: visible !important;
        background: ${uiSurfaceBg} !important;
        ${actionDockDecl}
        ${uiBackdropCSS}
      }
      ${actionDockBeforeDecl ? `
      ${scope} :is(.chat-turn-container .actions.hover-or-edit, .chat-turn-container .turn-footer${notSettings}, .aistu-history-navigator, .aistu-Sibling-nav)::before {
        pointer-events: none !important;
        z-index: 3 !important;
        ${actionDockBeforeDecl}
      }` : ''}
      ${actionDockAfterDecl ? `
      ${scope} :is(.chat-turn-container .actions.hover-or-edit, .chat-turn-container .turn-footer${notSettings}, .aistu-history-navigator, .aistu-Sibling-nav)::after {
        pointer-events: none !important;
        z-index: 3 !important;
        ${actionDockAfterDecl}
      }` : ''}
      ${actionDockButtonDecl ? `
      ${scope} .chat-turn-container .actions.hover-or-edit button${notSettings},
      ${scope} .chat-turn-container .turn-footer button${notSettings},
      ${scope} .aistu-history-navigator .aistu-nav-btn,
      ${scope} .aistu-Sibling-nav .aistu-nav-btn {
        ${actionDockButtonDecl}
      }` : ''}
      ${actionDockButtonHoverDecl ? `
      ${scope} .chat-turn-container .actions.hover-or-edit button:hover${notSettings},
      ${scope} .chat-turn-container .turn-footer button:hover${notSettings},
      ${scope} .aistu-history-navigator .aistu-nav-btn:hover:not(:disabled),
      ${scope} .aistu-Sibling-nav .aistu-nav-btn:hover:not(:disabled) {
        ${actionDockButtonHoverDecl}
      }` : ''}
      ${actionDockEditButtonDecl ? `${scope} .aistu-turn-edit-btn { ${actionDockEditButtonDecl} }` : ''}
      ${pagerDecl ? `${scope} .aistu-history-navigator, ${scope} .aistu-Sibling-nav { ${pagerDecl} }` : ''}
      ${pagerButtonDecl ? `${scope} .aistu-history-navigator .aistu-nav-btn, ${scope} .aistu-Sibling-nav .aistu-nav-btn { ${pagerButtonDecl} }` : ''}
      ${pagerCounterDecl ? `${scope} .aistu-history-navigator .aistu-nav-counter, ${scope} .aistu-Sibling-nav .aistu-Sibling-count { ${pagerCounterDecl} }` : ''}
      ${inlineEditDecl ? `${scope} .chat-turn-container ms-prompt-chunk:has(textarea), ${scope} .chat-turn-container textarea { ${inlineEditDecl} }` : ''}

      /* 6. Prompt Box (Main Input Bar + Focus State + Decorations + Format Bar + Attachments + Scroll Bottom) */
      ${scope} ms-prompt-box .prompt-box-container {
        position: relative !important;
        overflow: visible !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
        ${promptBoxDecl}
      }
      ${scope} ms-prompt-box .prompt-box-container:focus-within,
      ${scope} ms-prompt-box:focus-within .prompt-box-container {
        ${promptBoxFocusDecl}
      }
      ${promptBoxBeforeDecl ? `
      ${scope} ms-prompt-box .prompt-box-container::before {
        pointer-events: none !important;
        z-index: 4 !important;
        ${promptBoxBeforeDecl}
      }` : ''}
      ${promptBoxAfterDecl ? `
      ${scope} ms-prompt-box .prompt-box-container::after {
        pointer-events: none !important;
        z-index: 6 !important;
        ${promptBoxAfterDecl}
      }` : ''}
      ${promptInputDecl ? `${scope} ms-prompt-box :is(textarea, .ql-editor) { ${promptInputDecl} }` : ''}
      ${promptPlaceholderDecl ? `${scope} ms-prompt-box textarea::placeholder { ${promptPlaceholderDecl} }` : ''}
      ${promptFormatBarDecl ? `${scope} ms-prompt-box .sl-fmt-inline { ${promptFormatBarDecl} }` : ''}
      ${promptFormatButtonDecl ? `${scope} ms-prompt-box .sl-fmt-inline button { ${promptFormatButtonDecl} }` : ''}
      ${promptFormatButtonHoverDecl ? `${scope} ms-prompt-box .sl-fmt-inline button:hover { ${promptFormatButtonHoverDecl} }` : ''}
      ${promptAttachmentDecl ? `${scope} ms-prompt-box :is(ms-file-chunk, ms-image-chunk, ms-audio-chunk, .attachment-chip, .media-preview-chip) { ${promptAttachmentDecl} }` : ''}
      ${scrollBottomBtnDecl ? `${scope} #sl-scroll-bottom-btn.sl-scroll-bottom-btn { ${scrollBottomBtnDecl} }` : ''}

      /* 7. Prompt Tools (+, Aa, STT/Mic, Run Button & .enabled-tool Chips) */
      ${scope} ms-prompt-box :is(
        .button-wrapper button,
        button[ms-button],
        .sl-fmt-toggle-btn,
        .sl-fmt-toggle,
        button.run-button,
        ms-run-button button,
        .enabled-tool
      )${notSettings} {
        position: relative !important;
        ${promptToolsDecl}
      }
      ${promptToolsBeforeDecl ? `
      ${scope} ms-prompt-box :is(.button-wrapper button, .sl-fmt-toggle, .enabled-tool)${notSettings}::before {
        pointer-events: none !important;
        ${promptToolsBeforeDecl}
      }` : ''}
      ${promptToolsAfterDecl ? `
      ${scope} ms-prompt-box :is(.button-wrapper button, .sl-fmt-toggle, .enabled-tool)${notSettings}::after {
        pointer-events: none !important;
        ${promptToolsAfterDecl}
      }` : ''}
      ${promptToolsHoverDecl ? `
      ${scope} ms-prompt-box :is(.button-wrapper button, button[ms-button], .sl-fmt-toggle, .enabled-tool):hover${notSettings} {
        ${promptToolsHoverDecl}
      }` : ''}
      ${promptToolsFocusDecl ? `
      ${scope} ms-prompt-box :is(.button-wrapper button, button[ms-button], .sl-fmt-toggle, .enabled-tool):focus-visible${notSettings} {
        ${promptToolsFocusDecl}
      }` : ''}
      ${promptAddBtnDecl ? `${scope} ms-prompt-box :is(ms-add-media-button > button, .sl-fmt-toggle)${notSettings} { ${promptAddBtnDecl} }` : ''}
      ${promptChipDecl ? `${scope} ms-prompt-box .enabled-tool${notSettings} { ${promptChipDecl} }` : ''}
      ${promptChipHoverDecl ? `${scope} ms-prompt-box .enabled-tool:hover${notSettings} { ${promptChipHoverDecl} }` : ''}
      ${promptSttBtnDecl ? `${scope} ms-prompt-box :is(ms-speech-to-text button, button[aria-label*="microphone" i], button[aria-label*="voice" i])${notSettings} { ${promptSttBtnDecl} }` : ''}
      ${runButtonDecl ? `
      ${scope} ms-prompt-box :is(button.run-button, ms-run-button button)${notSettings} {
        ${runButtonDecl}
      }` : ''}
      ${runButtonHoverDecl ? `
      ${scope} ms-prompt-box :is(button.run-button, ms-run-button button):hover:not(:disabled)${notSettings} {
        ${runButtonHoverDecl}
      }` : ''}
      ${runButtonDisabledDecl ? `
      ${scope} ms-prompt-box :is(button.run-button, ms-run-button button):disabled${notSettings} {
        ${runButtonDisabledDecl}
      }` : ''}

      /* 8. Code Block, Inline Code & Think Block */
      ${scope} ms-code-block,
      ${scope} ms-code-block mat-expansion-panel,
      ${scope} ms-thought-chunk mat-accordion.compact-accordion,
      ${scope} ms-thought-chunk > mat-accordion {
        position: relative !important;
        ${codeAndThinkDecl}
      }
      ${codeAndThinkBeforeDecl ? `
      ${scope} :is(ms-code-block mat-expansion-panel, ms-thought-chunk mat-accordion.compact-accordion, ms-thought-chunk > mat-accordion)::before {
        pointer-events: none !important;
        z-index: 2 !important;
        ${codeAndThinkBeforeDecl}
      }` : ''}
      ${codeAndThinkAfterDecl ? `
      ${scope} :is(ms-code-block mat-expansion-panel, ms-thought-chunk mat-accordion.compact-accordion, ms-thought-chunk > mat-accordion)::after {
        pointer-events: none !important;
        z-index: 2 !important;
        ${codeAndThinkAfterDecl}
      }` : ''}
      ${codeAndThinkHeaderDecl ? `
      ${scope} :is(ms-code-block mat-expansion-panel-header, ms-thought-chunk mat-expansion-panel-header) {
        ${codeAndThinkHeaderDecl}
      }` : ''}
      ${codeSpecificDecl ? `${scope} ms-code-block, ${scope} ms-code-block mat-expansion-panel { ${codeSpecificDecl} }` : ''}
      ${codeBeforeDecl ? `${scope} ms-code-block mat-expansion-panel::before { pointer-events: none !important; ${codeBeforeDecl} }` : ''}
      ${codeAfterDecl ? `${scope} ms-code-block mat-expansion-panel::after { pointer-events: none !important; ${codeAfterDecl} }` : ''}
      ${codeHeaderDecl ? `${scope} ms-code-block mat-expansion-panel-header { ${codeHeaderDecl} }` : ''}
      ${codeButtonDecl ? `${scope} ms-code-block :is(button, .code-block-actions button)${notSettings} { ${codeButtonDecl} }` : ''}
      ${inlineCodeDecl ? `${scope} :is(ms-text-chunk, ms-cmark-node) :not(pre) > code { ${inlineCodeDecl} }` : ''}
      ${thinkSpecificDecl ? `${scope} ms-thought-chunk mat-accordion.compact-accordion, ${scope} ms-thought-chunk > mat-accordion { ${thinkSpecificDecl} }` : ''}
      ${thinkBeforeDecl ? `${scope} :is(ms-thought-chunk mat-accordion.compact-accordion, ms-thought-chunk > mat-accordion)::before { pointer-events: none !important; ${thinkBeforeDecl} }` : ''}
      ${thinkAfterDecl ? `${scope} :is(ms-thought-chunk mat-accordion.compact-accordion, ms-thought-chunk > mat-accordion)::after { pointer-events: none !important; ${thinkAfterDecl} }` : ''}
      ${thinkHeaderDecl ? `${scope} ms-thought-chunk mat-expansion-panel-header { ${thinkHeaderDecl} }` : ''}

      /* 9. Left Sidebar (Never override position on mobile drawers!) */
      ${scope} :is(ms-navbar-v .nav-content, ms-navbar-v2 .nav-content, .v3-left-nav, .v3-left-nav.expanded)${notSettings} {
        ${leftSidebarDecl}
      }
      ${leftBeforeDecl ? `${scope} :is(ms-navbar-v .nav-content, ms-navbar-v2 .nav-content, .v3-left-nav, .v3-left-nav.expanded)${notSettings}::before { pointer-events: none !important; z-index: 3 !important; ${leftBeforeDecl} }` : ''}
      ${leftAfterDecl ? `${scope} :is(ms-navbar-v .nav-content, ms-navbar-v2 .nav-content, .v3-left-nav, .v3-left-nav.expanded)${notSettings}::after { pointer-events: none !important; z-index: 3 !important; ${leftAfterDecl} }` : ''}
      ${leftHeaderDecl ? `${scope} :is(ms-navbar-v, ms-navbar-v2, .v3-left-nav) :is(.logo-container, .nav-header)${notSettings} { ${leftHeaderDecl} }` : ''}
      ${leftNewPromptDecl ? `${scope} :is(ms-navbar-v, ms-navbar-v2, .v3-left-nav) :is(a.create-prompt-btn, button.create-prompt-btn, .new-prompt-button)${notSettings} { ${leftNewPromptDecl} }` : ''}
      ${scope} :is(ms-navbar-v, ms-navbar-v2, .v3-left-nav) :is(a[ms-button], button[ms-button], button.account-switcher-button, #account-switcher-button)${notSettings} {
        position: relative !important;
        ${leftItemDecl}
      }
      ${leftItemBeforeDecl ? `${scope} :is(ms-navbar-v, ms-navbar-v2, .v3-left-nav) :is(a[ms-button], button[ms-button])${notSettings}::before { pointer-events: none !important; ${leftItemBeforeDecl} }` : ''}
      ${leftItemAfterDecl ? `${scope} :is(ms-navbar-v, ms-navbar-v2, .v3-left-nav) :is(a[ms-button], button[ms-button])${notSettings}::after { pointer-events: none !important; ${leftItemAfterDecl} }` : ''}
      ${scope} :is(ms-navbar-v, ms-navbar-v2, .v3-left-nav) :is(a.active, a.active-override, [aria-current="page"], .nav-item.ms-button-active)${notSettings} {
        ${leftActiveDecl}
      }
      ${leftHoverDecl ? `
      ${scope} :is(ms-navbar-v, ms-navbar-v2, .v3-left-nav) :is(a[ms-button], button[ms-button]):hover${notSettings} {
        ${leftHoverDecl}
      }` : ''}
      ${leftBadgeDecl ? `${scope} :is(ms-navbar-v, ms-navbar-v2, .v3-left-nav) .navbar-badge${notSettings} { ${leftBadgeDecl} }` : ''}
      ${leftSectionTitleDecl ? `${scope} :is(ms-navbar-v, ms-navbar-v2, .v3-left-nav) :is(.nav-section-title, .history-header)${notSettings} { ${leftSectionTitleDecl} }` : ''}
      ${leftFooterDecl ? `${scope} :is(ms-navbar-v, ms-navbar-v2, .v3-left-nav) :is(.bottom-actions, .nav-footer)${notSettings} { ${leftFooterDecl} }` : ''}
      ${leftAccountBtnDecl ? `${scope} :is(ms-navbar-v, ms-navbar-v2, .v3-left-nav) :is(button.account-switcher-button, #account-switcher-button, .sl-sidebar-entry)${notSettings} { ${leftAccountBtnDecl} }` : ''}

      /* 10. Right Sidebar (Never override position on mobile drawers; URL context .settings-item.settings-tool strictly transparent) */
      ${scope} :is(ms-right-side-panel, .drawer-container:has(ms-run-settings):not(:has(ms-right-side-panel)))${notSettings} {
        ${rightSidebarDecl}
      }
      ${rightBeforeDecl ? `${scope} :is(ms-right-side-panel, .drawer-container:has(ms-run-settings):not(:has(ms-right-side-panel)))${notSettings}::before { pointer-events: none !important; z-index: 3 !important; ${rightBeforeDecl} }` : ''}
      ${rightAfterDecl ? `${scope} :is(ms-right-side-panel, .drawer-container:has(ms-run-settings):not(:has(ms-right-side-panel)))${notSettings}::after { pointer-events: none !important; z-index: 3 !important; ${rightAfterDecl} }` : ''}
      ${rightHeaderDecl ? `${scope} ms-right-side-panel .overlay-header${notSettings} { ${rightHeaderDecl} }` : ''}
      ${rightCloseBtnDecl ? `${scope} ms-right-side-panel .overlay-header button[ms-button]${notSettings} { ${rightCloseBtnDecl} }` : ''}
      ${scope} :is(
        ms-model-selector .model-selector-card,
        ms-system-instructions-panel .system-instructions-card,
        .model-selector-card,
        .system-instructions-card,
        .sl-tokens-card,
        ms-thinking-level-setting .mat-mdc-text-field-wrapper,
        ms-run-settings .mat-mdc-text-field-wrapper,
        ms-file-chunk,
        ms-video-chunk .file-chunk-container
      )${notSettings} {
        position: relative !important;
        ${rightCardDecl}
      }
      ${rightCardBeforeDecl ? `${scope} :is(.model-selector-card, .system-instructions-card, .sl-tokens-card)${notSettings}::before { pointer-events: none !important; ${rightCardBeforeDecl} }` : ''}
      ${rightCardAfterDecl ? `${scope} :is(.model-selector-card, .system-instructions-card, .sl-tokens-card)${notSettings}::after { pointer-events: none !important; ${rightCardAfterDecl} }` : ''}
      ${rightCardHoverDecl ? `${scope} :is(.model-selector-card, .system-instructions-card, .sl-tokens-card, ms-run-settings .mat-mdc-text-field-wrapper):hover${notSettings} { ${rightCardHoverDecl} }` : ''}
      ${rightModelSelectorDecl ? `${scope} ms-model-selector .model-selector-card${notSettings} { ${rightModelSelectorDecl} }` : ''}
      ${rightSystemInstrDecl ? `${scope} ms-system-instructions-panel .system-instructions-card${notSettings}, ${scope} ms-system-instructions textarea${notSettings} { ${rightSystemInstrDecl} }` : ''}
      ${rightSectionTitleDecl ? `${scope} ms-run-settings :is(.settings-group-header, .section-header, h3, label)${notSettings} { ${rightSectionTitleDecl} }` : ''}
      ${rightSliderDecl ? `${scope} ms-run-settings :is(.mdc-slider__track, .mdc-slider__thumb-knob)${notSettings} { ${rightSliderDecl} }` : ''}
      ${rightSliderTrackDecl ? `${scope} ms-run-settings .mdc-slider__track${notSettings} { ${rightSliderTrackDecl} }` : ''}
      ${rightSliderThumbDecl ? `${scope} ms-run-settings .mdc-slider__thumb-knob${notSettings} { ${rightSliderThumbDecl} }` : ''}
      ${rightToggleDecl ? `${scope} ms-run-settings :is(mat-slide-toggle, .mdc-switch)${notSettings} { ${rightToggleDecl} }` : ''}
      ${rightInputDecl ? `${scope} ms-system-instructions :is(textarea, textarea.in-run-settings, input[ms-input])${notSettings}, ${scope} ms-run-settings input${notSettings} { ${rightInputDecl} }` : ''}
      ${scope} ms-run-settings .settings-item.settings-tool${notSettings} {
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
      }
      ${scope} :is(
        ms-right-side-panel .overlay-header button[ms-button],
        ms-run-settings button[ms-button],
        ms-system-instructions-panel button[ms-button],
        run-safety-settings button.ms-button-primary
      )${notSettings} {
        ${rightButtonDecl}
      }
      ${rightButtonHoverDecl ? `
      ${scope} :is(
        ms-right-side-panel .overlay-header button[ms-button]:hover,
        ms-run-settings button[ms-button]:hover,
        ms-system-instructions-panel button[ms-button]:hover,
        run-safety-settings button.ms-button-primary:hover
      )${notSettings} {
        ${rightButtonHoverDecl}
      }` : ''}

      /* 11. Markdown Edit Modal, <ms-header> Top Playground Toolbar, Dropdowns, Scrollbars & Zero-State */
      ${modalBackdropDecl ? `${scope} .aistu-edit-modal-backdrop { ${modalBackdropDecl} }` : ''}
      ${scope} .aistu-edit-modal-card {
        position: relative !important;
        overflow: visible !important;
        ${modalCardDecl}
      }
      ${modalBeforeDecl ? `${scope} .aistu-edit-modal-card::before { pointer-events: none !important; z-index: 4 !important; ${modalBeforeDecl} }` : ''}
      ${modalAfterDecl ? `${scope} .aistu-edit-modal-card::after { pointer-events: none !important; z-index: 6 !important; ${modalAfterDecl} }` : ''}
      ${modalHeaderDecl ? `${scope} .aistu-edit-modal-header { ${modalHeaderDecl} }` : ''}
      ${modalRoleBadgeDecl ? `${scope} .aistu-edit-modal-role-badge { ${modalRoleBadgeDecl} }` : ''}
      ${modalTitleDecl ? `${scope} .aistu-edit-modal-title { ${modalTitleDecl} }` : ''}
      ${modalBodyDecl ? `${scope} .aistu-edit-modal-body { ${modalBodyDecl} }` : ''}
      ${modalTextareaDecl ? `${scope} .aistu-edit-modal-textarea { ${modalTextareaDecl} }` : ''}
      ${modalFooterDecl ? `${scope} .aistu-edit-modal-footer { ${modalFooterDecl} }` : ''}
      ${modalButtonDecl ? `${scope} .aistu-edit-modal-btn:not(.aistu-btn-save) { ${modalButtonDecl} }` : ''}
      ${modalSaveButtonDecl ? `${scope} .aistu-edit-modal-btn.aistu-btn-save { ${modalSaveButtonDecl} }` : ''}

      /* 11B. Improve Response Popup (.aistu-improve-popup-*) — Synchronized with Custom StyleLab */
      ${scope} .aistu-improve-popup-overlay {
        background: transparent !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }
      ${scope} .aistu-improve-popup-card {
        position: fixed !important;
        overflow: visible !important;
        ${modalCardDecl}
        ${improvePopupDecl}
      }
      ${modalBeforeDecl ? `${scope} .aistu-improve-popup-card::before { pointer-events: none !important; z-index: 4 !important; ${modalBeforeDecl} }` : ''}
      ${modalAfterDecl ? `${scope} .aistu-improve-popup-card::after { pointer-events: none !important; z-index: 6 !important; ${modalAfterDecl} }` : ''}
      ${modalHeaderDecl ? `${scope} .aistu-improve-popup-header { ${modalHeaderDecl} }` : ''}
      ${modalRoleBadgeDecl ? `${scope} .aistu-improve-popup-badge, ${scope} .aistu-improve-option-index { ${modalRoleBadgeDecl} }` : ''}
      ${modalTitleDecl ? `${scope} .aistu-improve-popup-title { ${modalTitleDecl} }` : ''}
      ${modalButtonDecl || improveOptionDecl ? `${scope} .aistu-improve-option-btn, ${scope} .aistu-improve-close-btn { ${modalButtonDecl} ${improveOptionDecl} }` : ''}
      ${improveInputDecl ? `${scope} .aistu-improve-custom-input { ${improveInputDecl} }` : ''}
      ${modalSaveButtonDecl ? `${scope} .aistu-improve-submit-btn:not(:disabled) { ${modalSaveButtonDecl} }` : ''}

      ${toolbarDecl ? `${scope} ms-header${notSettings}, ${scope} ms-playground-toolbar${notSettings} { position: relative !important; ${toolbarDecl} }` : ''}
      ${toolbarBeforeDecl ? `${scope} ms-header${notSettings}::before, ${scope} ms-playground-toolbar${notSettings}::before { pointer-events: none !important; ${toolbarBeforeDecl} }` : ''}
      ${toolbarAfterDecl ? `${scope} ms-header${notSettings}::after, ${scope} ms-playground-toolbar${notSettings}::after { pointer-events: none !important; ${toolbarAfterDecl} }` : ''}
      ${titleDecl ? `${scope} ms-header .page-title h1.mode-title${notSettings} { ${titleDecl} }` : ''}
      ${titleEditBtnDecl ? `${scope} ms-header .page-title button[ms-button]${notSettings} { ${titleEditBtnDecl} }` : ''}

      ${scope} :is(
        ms-header .toolbar-left > button[ms-button],
        ms-header .toolbar-right > button[ms-button],
        ms-header .toolbar-right .overflow-menu-wrapper > button,
        ms-header .sl-header-btn,
        .sl-header-btn,
        ms-playground-toolbar button[ms-button]:not(.ms-button-borderless)
      )${notSettings} {
        ${headerButtonDecl}
        ${uiBackdropCSS}
      }
      ${headerButtonHoverDecl ? `
      ${scope} :is(
        ms-header .toolbar-left > button[ms-button]:hover,
        ms-header .toolbar-right > button[ms-button]:hover,
        ms-header .toolbar-right .overflow-menu-wrapper > button:hover,
        ms-header .sl-header-btn:hover,
        .sl-header-btn:hover,
        ms-playground-toolbar button[ms-button]:not(.ms-button-borderless):hover
      )${notSettings} {
        ${headerButtonHoverDecl}
      }` : ''}
      ${scope} ms-header ms-token-count .token-count-container${notSettings} {
        ${tokenPillDecl}
        ${uiBackdropCSS}
      }
      ${tokenValueDecl ? `${scope} ms-header ms-token-count .v3-token-count-value${notSettings} { ${tokenValueDecl} }` : ''}
      ${dropdownDecl ? `${scope} .cdk-overlay-pane :is(.mat-mdc-menu-panel, .mat-mdc-select-panel, .mat-mdc-dialog-surface)${notSettings} { ${dropdownDecl} }` : ''}
      ${scrollbarDecl ? `${scope} ::-webkit-scrollbar-thumb { ${scrollbarDecl} }` : ''}
      ${zeroStateDecl ? `${scope} :is(ms-zero-state, .zero-state-card, .prompt-gallery-card, .starter-card)${notSettings} { ${zeroStateDecl} }` : ''}

      /* Mobile Viewport Safety Rules */
      @media (max-width: 600px) {
        ${scope} .chat-turn-container.user ms-prompt-chunk:not(:has(ms-file-chunk)):not(:has(ms-video-chunk)):not(:has(ms-image-chunk)):not(:has(textarea))::after {
          width: 46px !important;
          height: 45px !important;
          top: -38px !important;
        }
        ${scope} .chat-turn-container.model:not(:has(ms-thought-chunk)):not(.thought-activity-host) .turn-content::after,
        ${scope} .chat-turn-container.model:has(ms-thought-chunk) ms-text-chunk:not(ms-thought-chunk *)::after {
          width: 58px !important;
          height: 56px !important;
          top: -48px !important;
        }
        ${scope} ms-prompt-box .prompt-box-container::after {
          width: 56px !important;
          height: 54px !important;
          top: -46px !important;
        }
      }

      /* 12. Freeform Custom CSS */
      ${extraCSS}
    `;
  }

  function isThoughtTurn(turnEl) {
    if (!turnEl) return false;
    const hasThought = Boolean(turnEl.querySelector('ms-thought-chunk, .thought-panel, .thought-chunk'));
    if (!hasThought && !turnEl.classList?.contains('thought-activity-host')) return false;
    // Note: Google AI Studio wraps the thought body inside <ms-thought-chunk><ms-text-chunk><ms-cmark-node>.
    // Only treat a turn as having response text if it has a text/code chunk OUTSIDE ms-thought-chunk.
    const hasResponseOutsideThought = Array.from(
      turnEl.querySelectorAll('ms-text-chunk, ms-cmark-node, ms-code-block')
    ).some(el => !el.closest('ms-thought-chunk, .thought-panel, .thought-chunk'));
    return !hasResponseOutsideThought;
  }

  function isCompactUserMediaTurn(turnEl, role) {
    if (!turnEl || role !== 'user') return false;
    const hasMedia = Boolean(turnEl.querySelector('ms-file-chunk, ms-image-chunk'));
    if (!hasMedia) return false;
    const hasTextOrVideo = Boolean(turnEl.querySelector('ms-text-chunk, ms-video-chunk, textarea'));
    return !hasTextOrVideo;
  }

  function detectTurnRole(turnEl) {
    if (!turnEl) return null;
    const container = turnEl.querySelector('.chat-turn-container');
    if (container) {
      if (container.classList.contains('user')) return 'user';
      if (container.classList.contains('model')) return 'model';
    }
    const roleAttr = (turnEl.getAttribute('data-turn-role') || '').toLowerCase();
    if (roleAttr === 'user' || roleAttr === 'model') return roleAttr;
    if (turnEl.querySelector('.user-prompt-container')) return 'user';
    if (turnEl.querySelector('.model-prompt-container')) return 'model';
    return null;
  }

  function buildRoleplayHeader(role, cfg) {
    const rp = cfg?.roleplay || {};
    const wantAvatar = Boolean(rp.enableCustomAvatars ?? rp.enableAvatarCustom) &&
      (role === 'model' ? rp.showModelAvatar !== false : rp.showUserAvatar !== false);
    const wantName = Boolean(rp.enableCustomNames ?? rp.enableNameCustom);
    if (!wantAvatar && !wantName) return null;

    const header = document.createElement('div');
    header.className = `sl-rp-turn-header sl-rp-${role}-header`;
    header.setAttribute('data-sl-rp-role', role);

    let avatarEl = null;
    if (wantAvatar) {
      avatarEl = document.createElement('div');
      avatarEl.className = 'sl-rp-avatar';
      const src = String(role === 'model' ? (rp.modelAvatar || rp.modelAvatarUrl || '') : (rp.userAvatar || rp.userAvatarUrl || '')).trim();
      if (src) {
        const img = document.createElement('img');
        img.src = src;
        img.alt = '';
        img.loading = 'lazy';
        avatarEl.appendChild(img);
      } else {
        const fallbackLabel = String(role === 'model' ? (rp.modelName || 'M') : (rp.userName || 'U')).trim();
        avatarEl.textContent = (fallbackLabel[0] || (role === 'model' ? 'M' : 'U')).toUpperCase();
      }
    }

    let nameEl = null;
    if (wantName) {
      nameEl = document.createElement('span');
      nameEl.className = 'sl-rp-name';
      nameEl.textContent = String(role === 'model' ? (rp.modelName || 'AI Studio') : (rp.userName || 'Bạn')).trim();
    }

    if (role === 'user') {
      // For right-aligned user turns: [Name] [Avatar] in normal row order
      if (nameEl) header.appendChild(nameEl);
      if (avatarEl) header.appendChild(avatarEl);
    } else {
      // For left-aligned model turns: [Avatar] [Name]
      if (avatarEl) header.appendChild(avatarEl);
      if (nameEl) header.appendChild(nameEl);
    }

    return header;
  }

  function clearRoleplayHeaders() {
    document.querySelectorAll('.sl-rp-turn-header').forEach(el => el.remove());
  }

  function unwrapQuoteHighlights(root = document) {
    root.querySelectorAll('span.sl-quote-highlight').forEach(span => {
      const parent = span.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(span.textContent || ''), span);
      parent.normalize();
    });
  }

  const QUOTE_REGEX = /(["“][^"”\n]{1,800}["”]|«[^»\n]{1,800}»)/g;

  function setAttrIfChanged(el, name, val) {
    if (!el) return;
    if (val === null || val === undefined) {
      if (el.hasAttribute(name)) el.removeAttribute(name);
    } else if (el.getAttribute(name) !== val) {
      el.setAttribute(name, val);
    }
  }

  function pruneThoughtFooterPanels(root = document) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('ms-thought-chunk mat-expansion-panel').forEach(panel => {
      if (panel.classList.contains('thought-panel')) return;
      if (
        panel.hasAttribute('disabled') ||
        panel.querySelector('.thought-panel-footer, .thought-collapsed-text-container, .thought-collapsed-text')
      ) {
        panel.remove();
      }
    });
  }

  function highlightQuotesInTurn(turnEl) {
    const contentRoot = turnEl.querySelector('.turn-content') || turnEl;
    if (!contentRoot) return;

    // Fast signature check so unchanged turns skip TreeWalker completely
    const textLen = (contentRoot.textContent || '').length;
    const prevLen = contentRoot.getAttribute('data-sl-quotes-len');
    if (prevLen === String(textLen) && contentRoot.querySelector('.sl-quote-highlight')) {
      return;
    }

    const walker = document.createTreeWalker(contentRoot, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const text = node.nodeValue;
        if (!text || !/["“«]/.test(text)) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest('pre, code, .inline-code, ms-code-block, ms-thought-chunk, textarea, input, button, style, script, .sl-quote-highlight, .sl-rp-turn-header, .author-label')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const textNodes = [];
    let current;
    while ((current = walker.nextNode())) {
      textNodes.push(current);
    }

    for (const textNode of textNodes) {
      const raw = textNode.nodeValue || '';
      QUOTE_REGEX.lastIndex = 0;
      if (!QUOTE_REGEX.test(raw)) continue;
      QUOTE_REGEX.lastIndex = 0;

      const frag = document.createDocumentFragment();
      let lastIdx = 0;
      let match;
      while ((match = QUOTE_REGEX.exec(raw)) !== null) {
        if (match.index > lastIdx) {
          frag.appendChild(document.createTextNode(raw.slice(lastIdx, match.index)));
        }
        const span = document.createElement('span');
        span.className = 'sl-quote-highlight';
        span.textContent = match[0];
        frag.appendChild(span);
        lastIdx = match.index + match[0].length;
      }
      if (lastIdx < raw.length) {
        frag.appendChild(document.createTextNode(raw.slice(lastIdx)));
      }
      textNode.parentNode?.replaceChild(frag, textNode);
    }

    setAttrIfChanged(contentRoot, 'data-sl-quotes-len', String((contentRoot.textContent || '').length));
  }

  function processAllChatTurns() {
    pruneThoughtFooterPanels(document);
    if (!activeConfig) return;
    const rp = activeConfig.roleplay || {};
    const mi = activeConfig.mainInterface || {};
    const st = activeConfig.style || {};
    const typo = activeConfig.typography || {};
    const cb = activeConfig.chatBubbles || {};

    const wantAvatar = Boolean(rp.enableCustomAvatars ?? rp.enableAvatarCustom) &&
      (rp.showModelAvatar !== false || rp.showUserAvatar !== false);
    const wantName = Boolean(rp.enableCustomNames ?? rp.enableNameCustom);
    const wantHeaders = Boolean(
      wantAvatar ||
      wantName ||
      (rp.showTurnHeader && (rp.showAvatar || rp.showSpeakerName))
    );
    const wantQuotes = Boolean(
      (typo.enableQuoteHighlight ?? typo.quoteHighlightEnabled) ??
      cb.highlightQuotes
    );
    const isGeometryStyle = Boolean(st.stylePreset && st.stylePreset !== 'default');
    const modelBubbleOn =
      (mi.enableChatBubbles !== false &&
        Boolean(mi.enableModelBubble ?? mi.modelBubbleEnabled ?? cb.showModelBubble)) ||
      isGeometryStyle;

    const turns = Array.from(document.querySelectorAll('ms-chat-turn'));
    let prevRole = null;
    const roleGroups = [];
    let currentGroup = null;

    // Identify the latest turn overall (User or Model)
    const latestTurnEl = turns.length > 0 ? turns[turns.length - 1] : null;

    turns.forEach(turn => {
      setAttrIfChanged(turn, 'data-sl-latest-turn', turn === latestTurnEl ? 'true' : null);

      const role = detectTurnRole(turn);
      if (!role) return;

      const container = turn.querySelector('.chat-turn-container') || turn;
      const existingInnerHeader = container.querySelector('.sl-rp-turn-header');
      const prevEl = turn.previousElementSibling;
      const existingSiblingHeader = (prevEl && prevEl.classList?.contains('sl-rp-group-row')) ? prevEl : null;

      // Mark thought-only turns so they never receive a Model Chat Bubble, Roleplay Header, or font-size override
      const thoughtOnly = (role === 'model' && isThoughtTurn(turn));
      setAttrIfChanged(turn, 'data-sl-thought-turn', thoughtOnly ? 'true' : null);

      // Contiguous group detection by role
      const isNewRoleGroup = (role !== prevRole);
      prevRole = role;

      if (isNewRoleGroup || !currentGroup) {
        currentGroup = { role, turns: [turn], headerPlaced: false };
        roleGroups.push(currentGroup);
      } else {
        currentGroup.turns.push(turn);
      }

      // Model Think Block turns NEVER receive the Roleplay Avatar & Name header;
      // the header is deferred to the first actual main chat response turn in the Model group.
      let shouldPlaceHeader = false;
      if (role === 'model' && thoughtOnly) {
        setAttrIfChanged(turn, 'data-sl-group-start', null);
        setAttrIfChanged(turn, 'data-sl-group-continuation', null);
        if (existingInnerHeader) existingInnerHeader.remove();
        if (existingSiblingHeader) existingSiblingHeader.remove();
      } else if (!currentGroup.headerPlaced) {
        currentGroup.headerPlaced = true;
        shouldPlaceHeader = true;
        setAttrIfChanged(turn, 'data-sl-group-start', 'true');
        setAttrIfChanged(turn, 'data-sl-group-continuation', null);
      } else {
        setAttrIfChanged(turn, 'data-sl-group-continuation', 'true');
        setAttrIfChanged(turn, 'data-sl-group-start', null);
      }

      if (wantHeaders && shouldPlaceHeader) {
        const nextHeader = buildRoleplayHeader(role, activeConfig);
        if (nextHeader) {
          const isCompactMedia = isCompactUserMediaTurn(turn, role);
          if (isCompactMedia && turn.parentNode) {
            nextHeader.classList.add('sl-rp-group-row');
            if (existingInnerHeader) existingInnerHeader.remove();
            const nextSig = nextHeader.innerHTML;
            if (!existingSiblingHeader || existingSiblingHeader.innerHTML !== nextSig) {
              if (existingSiblingHeader) existingSiblingHeader.remove();
              turn.parentNode.insertBefore(nextHeader, turn);
            }
          } else {
            if (existingSiblingHeader) existingSiblingHeader.remove();
            const nextSig = nextHeader.innerHTML;

            // If this Model turn contains both an inline <ms-thought-chunk> and the main chat response,
            // anchor the Roleplay Header inside .turn-content right above the main response chunk (below ms-thought-chunk).
            const turnContent = container.querySelector('.turn-content');
            const thoughtChunk = (role === 'model' && turnContent)
              ? turnContent.querySelector('ms-thought-chunk, .thought-panel, .thought-chunk')
              : null;
            const mainResponseTarget = (thoughtChunk && turnContent)
              ? Array.from(turnContent.children).find(
                  ch =>
                    !ch.matches('ms-thought-chunk, .thought-panel, .thought-chunk, .sl-rp-turn-header, .author-label, .turn-separator') &&
                    !ch.querySelector?.('ms-thought-chunk')
                )
              : null;

            if (mainResponseTarget && turnContent) {
              if (
                !existingInnerHeader ||
                existingInnerHeader.parentNode !== turnContent ||
                existingInnerHeader.nextElementSibling !== mainResponseTarget ||
                existingInnerHeader.innerHTML !== nextSig
              ) {
                if (existingInnerHeader) existingInnerHeader.remove();
                turnContent.insertBefore(nextHeader, mainResponseTarget);
              }
            } else {
              if (
                !existingInnerHeader ||
                existingInnerHeader.parentNode !== container ||
                existingInnerHeader.innerHTML !== nextSig
              ) {
                if (existingInnerHeader) existingInnerHeader.remove();
                container.prepend(nextHeader);
              }
            }
          }
        } else {
          if (existingInnerHeader) existingInnerHeader.remove();
          if (existingSiblingHeader) existingSiblingHeader.remove();
        }
      } else if (!thoughtOnly) {
        if (existingInnerHeader) existingInnerHeader.remove();
        if (existingSiblingHeader) existingSiblingHeader.remove();
      }

      if (wantQuotes) {
        highlightQuotesInTurn(turn);
      }
    });

    // Compute Messenger-style grouped bubble corners (data-sl-bubble-pos)
    // and Top 50% / Bottom 50% decoration placement (data-sl-decor-top / data-sl-decor-mid / data-sl-decor-bottom)
    // across consecutive TEXT bubbles only (excluding ms-thought-chunk Think blocks)
    roleGroups.forEach(group => {
      const { role, turns: groupTurns } = group;
      const bubbleTurns = [];
      const visualBlocks = [];

      groupTurns.forEach(turn => {
        if (role === 'user') {
          const userBubbleEl = turn.querySelector('ms-prompt-chunk:not(:has(ms-file-chunk)):not(:has(ms-video-chunk)):not(:has(ms-image-chunk)):not(:has(textarea))');
          if (userBubbleEl) {
            bubbleTurns.push(turn);
            visualBlocks.push({ turn, blockEl: userBubbleEl });
          } else {
            setAttrIfChanged(turn, 'data-sl-bubble-pos', null);
            setAttrIfChanged(turn, 'data-sl-decor-top', null);
            setAttrIfChanged(turn, 'data-sl-decor-mid', null);
            setAttrIfChanged(turn, 'data-sl-decor-bottom', null);
          }
        } else if (role === 'model') {
          const isThoughtOnly = turn.getAttribute('data-sl-thought-turn') === 'true';
          if (!isThoughtOnly) {
            if (modelBubbleOn) {
              bubbleTurns.push(turn);
            } else {
              setAttrIfChanged(turn, 'data-sl-bubble-pos', null);
            }
            const hasThoughtChunk = Boolean(turn.querySelector('ms-thought-chunk'));
            const modelTextEl = hasThoughtChunk
              ? turn.querySelector('ms-text-chunk:not(ms-thought-chunk *)')
              : turn.querySelector('.turn-content');
            if (modelTextEl && modelBubbleOn) {
              visualBlocks.push({ turn, blockEl: modelTextEl });
            } else {
              setAttrIfChanged(turn, 'data-sl-decor-top', null);
              setAttrIfChanged(turn, 'data-sl-decor-mid', null);
              setAttrIfChanged(turn, 'data-sl-decor-bottom', null);
            }
          } else {
            setAttrIfChanged(turn, 'data-sl-bubble-pos', null);
            setAttrIfChanged(turn, 'data-sl-decor-top', null);
            setAttrIfChanged(turn, 'data-sl-decor-mid', null);
            setAttrIfChanged(turn, 'data-sl-decor-bottom', null);
          }
        }
      });

      if (bubbleTurns.length === 1) {
        setAttrIfChanged(bubbleTurns[0], 'data-sl-bubble-pos', 'single');
      } else if (bubbleTurns.length >= 2) {
        bubbleTurns.forEach((bTurn, idx) => {
          const pos = idx === 0 ? 'first' : (idx === bubbleTurns.length - 1 ? 'last' : 'middle');
          setAttrIfChanged(bTurn, 'data-sl-bubble-pos', pos);
        });
      }

      if (visualBlocks.length === 1) {
        const { turn, blockEl } = visualBlocks[0];
        setAttrIfChanged(blockEl, 'data-sl-decor-pos', 'both');
        setAttrIfChanged(blockEl, 'data-sl-decor-top', null);
        setAttrIfChanged(blockEl, 'data-sl-decor-mid', null);
        setAttrIfChanged(blockEl, 'data-sl-decor-bottom', null);
        setAttrIfChanged(turn, 'data-sl-decor-top', null);
        setAttrIfChanged(turn, 'data-sl-decor-mid', null);
        setAttrIfChanged(turn, 'data-sl-decor-bottom', null);
      } else if (visualBlocks.length >= 2) {
        visualBlocks.forEach(({ turn, blockEl }, idx) => {
          if (idx === 0) {
            setAttrIfChanged(blockEl, 'data-sl-decor-pos', 'top');
            setAttrIfChanged(blockEl, 'data-sl-decor-top', 'true');
            setAttrIfChanged(blockEl, 'data-sl-decor-mid', null);
            setAttrIfChanged(blockEl, 'data-sl-decor-bottom', null);
            setAttrIfChanged(turn, 'data-sl-decor-top', 'true');
            setAttrIfChanged(turn, 'data-sl-decor-mid', null);
            setAttrIfChanged(turn, 'data-sl-decor-bottom', null);
          } else if (idx === visualBlocks.length - 1) {
            setAttrIfChanged(blockEl, 'data-sl-decor-pos', 'bottom');
            setAttrIfChanged(blockEl, 'data-sl-decor-top', null);
            setAttrIfChanged(blockEl, 'data-sl-decor-mid', null);
            setAttrIfChanged(blockEl, 'data-sl-decor-bottom', 'true');
            setAttrIfChanged(turn, 'data-sl-decor-top', null);
            setAttrIfChanged(turn, 'data-sl-decor-mid', null);
            setAttrIfChanged(turn, 'data-sl-decor-bottom', 'true');
          } else {
            setAttrIfChanged(blockEl, 'data-sl-decor-pos', 'middle');
            setAttrIfChanged(blockEl, 'data-sl-decor-top', null);
            setAttrIfChanged(blockEl, 'data-sl-decor-mid', 'true');
            setAttrIfChanged(blockEl, 'data-sl-decor-bottom', null);
            setAttrIfChanged(turn, 'data-sl-decor-top', null);
            setAttrIfChanged(turn, 'data-sl-decor-mid', 'true');
            setAttrIfChanged(turn, 'data-sl-decor-bottom', null);
          }
        });
      }
    });

    // Clean up any orphaned .sl-rp-group-row elements not immediately preceding a group-start turn
    document.querySelectorAll('.sl-rp-group-row').forEach(row => {
      const next = row.nextElementSibling;
      if (!wantHeaders || !next || next.tagName?.toLowerCase() !== 'ms-chat-turn' || next.getAttribute('data-sl-group-start') !== 'true') {
        row.remove();
      }
    });

    if (!wantQuotes) {
      unwrapQuoteHighlights(document);
    }
  }

  function removeSidebarOverlays() {
    document.querySelectorAll('.sidebar-overlay').forEach(el => {
      el.remove();
    });
  }

  function scheduleTurnProcessing() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(() => processAllChatTurns(), { timeout: 220 });
      } else {
        processAllChatTurns();
      }
    }, 110);
  }

  function syncBodyThemeAttributes() {
    if (!activeConfig || !activeMode || !document.body) return;
    if (document.body.getAttribute('data-sl-custom-theme') !== 'true') {
      document.body.setAttribute('data-sl-custom-theme', 'true');
    }
    if (document.body.getAttribute('data-sl-theme-mode') !== activeMode) {
      document.body.setAttribute('data-sl-theme-mode', activeMode);
    }
  }

  const IGNORED_MUTATION_SELECTOR = 'ms-prompt-box, footer, ms-header, ms-playground-toolbar, .cdk-overlay-container, .mat-ripple, .mat-mdc-button-ripple, .mat-mdc-focus-indicator, textarea, input, #sl-custom-theme-snow-layer, #sl-custom-theme-bg-layer, .sl-overlay, .sl-rp-turn-header, .sl-quote-highlight, .sl-word-counter, .sl-saving-pill';

  function ensureObserver() {
    if (!document.body || typeof MutationObserver === 'undefined') return;
    if (!observer) {
      observer = new MutationObserver((mutations) => {
        if (!activeConfig) return;
        let shouldProcess = false;
        let checkOverlay = false;
        for (const m of mutations) {
          const targetEl = m.target?.nodeType === 1 ? m.target : m.target?.parentElement;
          if (!targetEl) continue;
          if (targetEl.closest && targetEl.closest(IGNORED_MUTATION_SELECTOR)) {
            continue;
          }
          if (m.type === 'childList' && m.addedNodes?.length) {
            checkOverlay = true;
          }
          if (targetEl.closest && targetEl.closest('ms-chat-turn, ms-chat-session, ms-autoscroll-container')) {
            shouldProcess = true;
            break;
          }
          if (m.type === 'childList') {
            for (const n of m.addedNodes) {
              if (n.nodeType === 1 && (n.tagName === 'MS-CHAT-TURN' || n.querySelector?.('ms-chat-turn'))) {
                shouldProcess = true;
                break;
              }
            }
          }
          if (shouldProcess) break;
        }
        if (checkOverlay) removeSidebarOverlays();
        if (shouldProcess) scheduleTurnProcessing();
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }
    if (!bodyClassObserver) {
      bodyClassObserver = new MutationObserver(() => {
        if (!activeConfig || !activeMode) return;
        syncBodyThemeAttributes();
      });
      bodyClassObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ['class', 'data-sl-theme-mode', 'data-sl-custom-theme']
      });
    }
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (bodyClassObserver) {
      bodyClassObserver.disconnect();
      bodyClassObserver = null;
    }
    clearTimeout(debounceTimer);
  }

  function applyConfig(rawConfig) {
    const presetsApi = window.StudioLab?.themePresets;
    const cfg = presetsApi?.normalizeThemeConfig ? presetsApi.normalizeThemeConfig(rawConfig) : rawConfig;
    activeConfig = cfg;
    activeMode = isLightHex(cfg?.mainInterface?.uiBase) ? 'light' : 'dark';

    if (!document.body) {
      document.addEventListener('DOMContentLoaded', () => applyConfig(cfg), { once: true });
      return;
    }

    ensureGoogleFontsLoaded();
    ensureHeadOrderObserver();
    syncBodyThemeAttributes();
    ensureBgLayer(cfg);
    ensureSnowLayer(cfg);

    const css = buildThemeStylesheet(cfg);
    installThemeCSS(css);

    removeSidebarOverlays();
    ensureObserver();
    processAllChatTurns();
    window.dispatchEvent(new Event('sl-theme-changed'));
  }

  function clearCustomTheme() {
    activeConfig = null;
    activeMode = null;
    draftConfig = null;
    stopObserver();

    if (document.body) {
      document.body.removeAttribute('data-sl-custom-theme');
      document.body.removeAttribute('data-sl-theme-mode');
    }
    removeThemeCSS();

    const bgLayer = document.getElementById(BG_LAYER_ID);
    if (bgLayer) bgLayer.remove();
    stopSnowAnimation();
    const snowLayer = document.getElementById(SNOW_LAYER_ID);
    if (snowLayer) snowLayer.remove();

    clearRoleplayHeaders();
    unwrapQuoteHighlights(document);
    window.dispatchEvent(new Event('sl-theme-changed'));
  }

  function previewDraftConfig(rawDraft) {
    draftConfig = rawDraft;
    applyConfig(rawDraft);
  }

  function isDraftActive() {
    return Boolean(draftConfig);
  }

  function syncFromState(state) {
    if (!state || state.activeThemeId === 'original' || !state.activeThemeId) {
      clearCustomTheme();
      return;
    }
    const list = Array.isArray(state.customThemes) ? state.customThemes : [];
    const found = list.find(item => item && item.id === state.activeThemeId);
    if (!found || !found.config) {
      clearCustomTheme();
      return;
    }
    draftConfig = null;
    applyConfig(found.config);
  }

  // Re-apply background layer and chat turn headers on SPA route changes
  window.addEventListener('__sl_routeChanged', () => {
    if (!activeConfig) return;
    ensureBgLayer(activeConfig);
    ensureSnowLayer(activeConfig);
    scheduleTurnProcessing();
  });

  window.addEventListener('sl-custom-styles-changed', () => {
    if (!activeConfig) return;
    applyConfig(activeConfig);
  });

  window.StudioLab = window.StudioLab || {};
  window.StudioLab.themeEngine = {
    applyConfig,
    applyThemeConfig: previewDraftConfig,
    previewDraftConfig,
    clearCustomTheme,
    syncFromState,
    processAllChatTurns,
    buildThemeStylesheet,
    buildCustomStylePreviewCardCSS,
    buildCustomStyleStageCSS,
    createStyleLabTokenMap,
    isDraftActive,
    getActiveConfig: () => activeConfig,
    getActiveMode: () => activeMode
  };
})();
