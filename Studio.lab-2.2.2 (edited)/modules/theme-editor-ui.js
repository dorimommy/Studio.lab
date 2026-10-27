// Modular 4-Tab Custom Theme Editor UI for Studio.lab
// Renders Roleplay, Main Interface, Style, and Typography tabs with built-in Live Visual Stage, Peek Mode, and Randomizer.
(function () {
  'use strict';

  if (!window.StudioLab) window.StudioLab = {};

  let activeSubTab = 'roleplay';
  let draftThemeName = '';
  let draftConfig = null;
  let draftSessionKey = '';
  let isDirty = false;
  let isStageExpanded = true;

  function html(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function t(key, fallback) {
    const fn = window.StudioLab?.i18n?.t;
    return fn ? fn(key, fallback || key) : (fallback || key);
  }

  function hexToRgba(hex, alpha = 1) {
    const clean = String(hex || '').replace('#', '').trim();
    let r = 30, g = 27, b = 38;
    if (clean.length === 3) {
      r = parseInt(clean[0] + clean[0], 16);
      g = parseInt(clean[1] + clean[1], 16);
      b = parseInt(clean[2] + clean[2], 16);
    } else if (clean.length === 6) {
      r = parseInt(clean.slice(0, 2), 16);
      g = parseInt(clean.slice(2, 4), 16);
      b = parseInt(clean.slice(4, 6), 16);
    }
    if (Number.isNaN(r)) r = 30;
    if (Number.isNaN(g)) g = 27;
    if (Number.isNaN(b)) b = 38;
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, Number(alpha) ?? 1)).toFixed(3)})`;
  }

  function compressImageFile(file, maxW = 1600, maxH = 1000, quality = 0.84) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error('No file'));
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          let w = img.naturalWidth || img.width;
          let h = img.naturalHeight || img.height;
          if (w > maxW || h > maxH) {
            const ratio = Math.min(maxW / w, maxH / h);
            w = Math.round(w * ratio);
            h = Math.round(h * ratio);
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx2d = canvas.getContext('2d');
          ctx2d.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/webp', quality);
          resolve(dataUrl);
        };
        img.onerror = reject;
        img.src = String(reader.result || '');
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function ensureDraftSession(editorState, customThemes = []) {
    const sessionKey = `${editorState?.mode || 'create'}:${editorState?.themeId || 'new'}`;
    const presets = window.StudioLab.themePresets;
    if (draftSessionKey === sessionKey && draftConfig) return;

    draftSessionKey = sessionKey;
    activeSubTab = 'roleplay';
    isDirty = false;

    if (editorState?.mode === 'edit' && editorState.themeId) {
      const existing = customThemes.find(item => item.id === editorState.themeId);
      draftThemeName = existing?.name || 'Custom Theme';
      draftConfig = presets.normalizeThemeConfig(existing?.config || {});
    } else {
      draftThemeName = `Custom Theme ${(customThemes?.length || 0) + 1}`;
      draftConfig = presets.createDefaultThemeConfig('purple');
    }
  }

  function resetDraftSession() {
    draftSessionKey = '';
    draftConfig = null;
    draftThemeName = '';
    isDirty = false;
  }

  function renderSwitch(attrName, checked) {
    return `
      <span class="sl-setting-checkbox-hit">
        <input type="checkbox" role="switch" class="sl-setting-checkbox" ${attrName} ${checked ? 'checked' : ''}>
      </span>
    `;
  }

  function renderVisualPreviewStage(renderIcon) {
    return `
      <div class="sl-te-preview-card" data-sl-te-preview-card>
        <div class="sl-te-preview-topbar">
          <span class="sl-te-preview-topbar-title">
            <span class="sl-te-preview-dot"></span>
            <span>${html(t('te_preview_title', 'Real-Time Visual Preview Stage'))}</span>
          </span>
          <div class="sl-te-header-actions">
            <button type="button" class="sl-settings-button" data-sl-te-stage-toggle>
              <span>${html(t('te_preview_toggle', 'Toggle Stage'))}</span>
            </button>
          </div>
        </div>
        <div class="sl-te-preview-stage" data-sl-te-stage ${isStageExpanded ? '' : 'hidden'}>
          <style class="sl-te-stage-custom-style" data-sl-te-stage-custom-style></style>
          <div class="sl-te-preview-bg" data-sl-te-stage-bg></div>
          <div class="sl-te-preview-bg-dim" data-sl-te-stage-dim></div>

          <!-- Left Sidebar (ms-navbar-v) -->
          <aside class="sl-te-preview-sidebar" data-sl-te-stage-sidebar>
            <div class="sl-te-preview-brand" data-sl-te-stage-brand>✦ AI Studio</div>
            <div class="sl-te-preview-pill" data-sl-te-stage-nav-active>${html(t('te_prev_create_new', '+ Create new'))}</div>
            <div class="sl-te-preview-pill" style="opacity:0.75">${html(t('te_prev_chat_prompt', 'Chat prompt'))}</div>
            <div class="sl-te-preview-pill" style="opacity:0.65">${html(t('te_prev_history', 'History'))}</div>
            <div class="sl-te-preview-pill" style="margin-top:auto;opacity:0.8">⚙ Studio.lab</div>
          </aside>

          <!-- Center Chat Canvas -->
          <div class="sl-te-preview-main">
            <header class="sl-te-preview-header" data-sl-te-stage-header>
              <span data-sl-te-stage-title>${html(t('te_prev_untitled', 'Untitled prompt'))}</span>
              <span data-sl-te-stage-preset-badge style="font-size:10px;opacity:0.85">Purple</span>
            </header>

            <div class="sl-te-preview-chat" data-sl-te-stage-chat>
              <!-- User Turn (Right-Aligned: [Name] [Avatar] above Bubble) -->
              <div class="sl-te-preview-turn sl-te-preview-turn--user">
                <div class="sl-te-preview-rp-header sl-te-preview-rp-header--user" data-sl-te-stage-user-rp>
                  <span class="sl-te-preview-rp-name" data-sl-te-stage-user-name>User</span>
                  <span class="sl-te-preview-rp-avatar" data-sl-te-stage-user-avatar>U</span>
                </div>
                <div class="sl-te-preview-bubble" data-sl-te-stage-user-bubble>
                  <span data-sl-te-stage-user-text>${html(t('te_prev_user_part1', 'Hãy thiết kế giao diện '))}</span>
                  <span data-sl-te-stage-user-quote>${html(t('te_prev_user_quote', '"Roleplay & Glassmorphism"'))} </span>
                  <span data-sl-te-stage-user-text2>${html(t('te_prev_user_part2', 'cho Google AI Studio nhé!'))}</span>
                </div>
              </div>

              <!-- Model Turn (Left-Aligned: [Avatar] [Name] above Bubble) -->
              <div class="sl-te-preview-turn sl-te-preview-turn--model">
                <div class="sl-te-preview-rp-header sl-te-preview-rp-header--model" data-sl-te-stage-model-rp>
                  <span class="sl-te-preview-rp-avatar" data-sl-te-stage-model-avatar>M</span>
                  <span class="sl-te-preview-rp-name" data-sl-te-stage-model-name>Gemini</span>
                </div>
                <div class="sl-te-preview-bubble" data-sl-te-stage-model-bubble>
                  <div class="sl-te-preview-think" data-sl-te-stage-think>
                    <span>${html(t('te_prev_thoughts_title', '▾ Thoughts (Synced Blur & Opacity)'))}</span>
                  </div>
                  <div>
                    <span data-sl-te-stage-model-text>${html(t('te_prev_model_part1', 'Đã đồng bộ toàn bộ bảng màu và khung chat! '))}</span>
                    <span data-sl-te-stage-model-quote>${html(t('te_prev_model_quote', '"Mọi thay đổi đều hiển thị ngay lập tức."'))}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Single-Pill Prompt Box -->
            <div class="sl-te-preview-prompt-wrap">
              <div class="sl-te-preview-prompt-box" data-sl-te-stage-prompt>
                <span style="opacity:0.75">${html(t('te_prev_input_placeholder', 'Type something or tab to choose an example prompt...'))}</span>
                <span class="sl-te-preview-run-btn" data-sl-te-stage-run>Run ⌘↵</span>
              </div>
            </div>
          </div>

          <!-- Right Panel (Run Settings) -->
          <aside class="sl-te-preview-rightpanel" data-sl-te-stage-rightpanel>
            <div style="font-weight:700;font-size:10.5px">${html(t('te_prev_run_settings', 'Run settings'))}</div>
            <div class="sl-te-preview-pill" data-sl-te-stage-model-box>Gemini 2.5 Pro</div>
            <div style="font-size:10px;opacity:0.75;margin-top:4px">${html(t('te_prev_temperature', 'Temperature'))}</div>
            <div style="height:5px;border-radius:999px;overflow:hidden;background:rgba(128,128,128,0.25)">
              <div data-sl-te-stage-slider-fill style="width:65%;height:100%"></div>
            </div>
            <div style="font-size:10px;opacity:0.75;margin-top:4px">${html(t('te_prev_thinking_mode', 'Thinking mode'))}</div>
            <div class="sl-te-preview-pill" data-sl-te-stage-chip>${html(t('te_prev_enabled', 'Enabled'))}</div>
          </aside>
        </div>
      </div>
    `;
  }

  function updateVisualStage(root) {
    if (!root || !draftConfig) return;
    const stage = root.querySelector('[data-sl-te-stage]');
    if (!stage) return;

    const cfg = window.StudioLab.themePresets.normalizeThemeConfig(draftConfig);
    const rp = cfg.roleplay;
    const mi = cfg.mainInterface;
    const st = cfg.style || {};
    const ty = cfg.typography;
    const presetObj = window.StudioLab.themePresets.PRESET_PALETTES[mi.presetKey];

    const stylePreset = st.stylePreset || 'default';
    const isPixelStyle = stylePreset === 'cartoon-pixel';
    const isWinterStyle = stylePreset === 'winter-frost';
    const customStyleObj = (!isPixelStyle && !isWinterStyle && stylePreset !== 'default')
      ? window.StudioLab?.themePresets?.getCustomStyleById?.(stylePreset)
      : null;
    const isGeometryStyle = isPixelStyle || isWinterStyle || Boolean(customStyleObj);

    stage.classList.toggle('is-style-cartoon-pixel', isPixelStyle);
    stage.classList.toggle('is-pixel-tail-on', isPixelStyle);
    stage.classList.toggle('is-style-winter-frost', isWinterStyle);
    stage.classList.toggle('is-style-custom-lab', Boolean(customStyleObj));
    const stageCustomStyleEl = stage.querySelector('[data-sl-te-stage-custom-style]');
    if (customStyleObj) {
      stage.style.setProperty('--sl-te-custom-bubble-radius', customStyleObj.geometry?.bubbleRadius || '16px');
      stage.style.setProperty('--sl-te-custom-card-radius', customStyleObj.geometry?.cardRadius || '12px');
      stage.style.setProperty('--sl-te-custom-btn-radius', customStyleObj.geometry?.buttonRadius || '10px');
      if (stageCustomStyleEl && window.StudioLab?.themeEngine?.buildCustomStyleStageCSS) {
        stageCustomStyleEl.textContent = window.StudioLab.themeEngine.buildCustomStyleStageCSS(
          customStyleObj,
          mi,
          '.sl-te-preview-stage.is-style-custom-lab'
        );
      }
    } else if (stageCustomStyleEl) {
      stageCustomStyleEl.textContent = '';
    }
    stage.style.setProperty('--sl-te-stage-accent', mi.uiAccent);
    stage.style.setProperty('--sl-te-stage-border', mi.uiBorder);
    stage.style.setProperty('--sl-te-stage-surface', mi.uiSurface);
    stage.style.setProperty('--sl-te-stage-base', mi.uiBase);
    stage.style.setProperty('--sl-te-stage-pixel-bw', '2px');
    stage.style.setProperty('--sl-te-stage-pixel-sh', '4px');

    const hasBg = Boolean(String(mi.pageBg || '').trim());
    const bgEl = stage.querySelector('[data-sl-te-stage-bg]');
    const dimEl = stage.querySelector('[data-sl-te-stage-dim]');

    stage.style.backgroundColor = mi.uiBase;
    stage.style.color = mi.uiText;

    // Font family
    const fonts = window.StudioLab.themePresets.FONT_OPTIONS || [];
    const matchedFont = fonts.find(f => f.id === ty.fontFamily || f.value === ty.fontFamily || f.css === ty.fontFamily);
    const fontCss = matchedFont?.css || (ty.fontFamily && ty.fontFamily !== 'default' ? ty.fontFamily : 'inherit');
    stage.style.fontFamily = fontCss;

    if (bgEl) {
      bgEl.style.backgroundImage = hasBg ? `url("${mi.pageBg.replace(/"/g, '\\"')}")` : 'none';
      bgEl.style.filter = hasBg && mi.bgBlur > 0 ? `blur(${Math.min(20, mi.bgBlur)}px)` : 'none';
      bgEl.style.transform = hasBg && mi.bgBlur > 0 ? 'scale(1.06)' : 'none';
    }
    if (dimEl) {
      const dimRatio = Math.max(0, Math.min(95, Number(mi.bgDim) || 0)) / 100;
      dimEl.style.backgroundColor = hasBg
        ? (presetObj?.group === 'light'
          ? hexToRgba(mi.uiBase || '#f5f5f4', dimRatio * 0.72)
          : `rgba(0, 0, 0, ${dimRatio.toFixed(2)})`)
        : 'transparent';
    }

    const uiTrans = Boolean(mi.transparentUiEnabled);
    const uiAlpha = uiTrans ? Math.max(0.1, Math.min(1, (Number(mi.uiOpacity) || 82) / 100)) : (hasBg ? 0.88 : 1);
    const uiBlur = uiTrans ? Math.max(0, Number(mi.uiBlur) || 0) : (hasBg ? 10 : 0);
    const surfaceRgba = hexToRgba(mi.uiSurface, uiAlpha);
    const backdropFilter = uiBlur > 0 ? `blur(${uiBlur}px) saturate(140%)` : 'none';

    stage.style.setProperty('--sl-te-stage-surface-rgba', surfaceRgba);
    stage.style.setProperty('--sl-te-stage-backdrop', backdropFilter);

    const sidebar = stage.querySelector('[data-sl-te-stage-sidebar]');
    const rightpanel = stage.querySelector('[data-sl-te-stage-rightpanel]');
    const header = stage.querySelector('[data-sl-te-stage-header]');
    const promptBox = stage.querySelector('[data-sl-te-stage-prompt]');

    [sidebar, rightpanel, header].forEach(el => {
      if (!el) return;
      el.style.backgroundColor = surfaceRgba;
      el.style.borderColor = mi.uiBorder;
      el.style.backdropFilter = backdropFilter;
      el.style.webkitBackdropFilter = backdropFilter;
    });

    const navActive = stage.querySelector('[data-sl-te-stage-nav-active]');
    if (navActive) {
      navActive.style.backgroundColor = hexToRgba(mi.uiAccent, 0.2);
      navActive.style.color = mi.uiAccent;
      navActive.style.border = `1px solid ${hexToRgba(mi.uiAccent, 0.4)}`;
    }

    const presetBadge = stage.querySelector('[data-sl-te-stage-preset-badge]');
    if (presetBadge) {
      const pName = presetObj ? presetObj.label : mi.presetKey;
      presetBadge.textContent = customStyleObj
        ? `${customStyleObj.icon || '✨'} ${customStyleObj.badge || customStyleObj.name} · ${pName}`
        : pName;
      presetBadge.style.color = mi.uiAccent;
    }

    const modelBox = stage.querySelector('[data-sl-te-stage-model-box]');
    if (modelBox) {
      modelBox.style.backgroundColor = hexToRgba(mi.uiBase, 0.75);
      modelBox.style.border = `1px solid ${mi.uiBorder}`;
    }

    const sliderFill = stage.querySelector('[data-sl-te-stage-slider-fill]');
    if (sliderFill) sliderFill.style.backgroundColor = mi.uiAccent;

    const chip = stage.querySelector('[data-sl-te-stage-chip]');
    if (chip) {
      chip.style.backgroundColor = hexToRgba(mi.uiAccent, 0.16);
      chip.style.color = mi.uiAccent;
    }

    if (promptBox) {
      promptBox.style.backgroundColor = surfaceRgba;
      promptBox.style.border = `1px solid ${mi.uiBorder}`;
      promptBox.style.backdropFilter = backdropFilter;
      promptBox.style.webkitBackdropFilter = backdropFilter;
    }

    const runBtn = stage.querySelector('[data-sl-te-stage-run]');
    if (runBtn) {
      runBtn.style.backgroundColor = mi.uiAccent;
      runBtn.style.color = '#0b1220';
    }

    // Roleplay Header updates (User on Right: [Name] [Avatar], Model on Left: [Avatar] [Name])
    const wantAvatar = Boolean(rp.enableAvatarCustom);
    const wantName = Boolean(rp.enableNameCustom);
    const scaledAvatarPx = Math.max(20, Math.min(44, Math.round((Number(rp.avatarSize) || 36) * 0.72)));
    const scaledNamePx = Math.max(10, Math.min(18, Math.round((Number(rp.nameSize) || 14) * 0.85)));

    const userRp = stage.querySelector('[data-sl-te-stage-user-rp]');
    const userAvatar = stage.querySelector('[data-sl-te-stage-user-avatar]');
    const userName = stage.querySelector('[data-sl-te-stage-user-name]');
    const showUserAvatar = wantAvatar && rp.showUserAvatar !== false;
    if (userRp) userRp.hidden = !showUserAvatar && !wantName;
    if (userName) {
      userName.hidden = !wantName;
      userName.textContent = rp.userName || 'User';
      userName.style.color = mi.uiAccent;
      userName.style.fontSize = `${scaledNamePx}px`;
    }
    if (userAvatar) {
      userAvatar.hidden = !showUserAvatar;
      userAvatar.style.width = `${scaledAvatarPx}px`;
      userAvatar.style.height = `${scaledAvatarPx}px`;
      userAvatar.style.borderRadius = `${rp.avatarRadius}%`;
      userAvatar.style.backgroundColor = mi.uiSurface;
      userAvatar.style.color = mi.uiAccent;
      userAvatar.style.border = `1.5px solid ${mi.uiAccent}`;
      if (rp.userAvatarUrl) {
        userAvatar.innerHTML = `<img src="${html(rp.userAvatarUrl)}" alt="">`;
      } else {
        userAvatar.textContent = (rp.userName || 'U').trim().charAt(0).toUpperCase() || 'U';
      }
    }

    const modelRp = stage.querySelector('[data-sl-te-stage-model-rp]');
    const modelAvatar = stage.querySelector('[data-sl-te-stage-model-avatar]');
    const modelName = stage.querySelector('[data-sl-te-stage-model-name]');
    const showModelAvatar = wantAvatar && rp.showModelAvatar !== false;
    if (modelRp) modelRp.hidden = !showModelAvatar && !wantName;
    if (modelName) {
      modelName.hidden = !wantName;
      modelName.textContent = rp.modelName || 'Model';
      modelName.style.color = mi.uiAccent;
      modelName.style.fontSize = `${scaledNamePx}px`;
    }
    if (modelAvatar) {
      modelAvatar.hidden = !showModelAvatar;
      modelAvatar.style.width = `${scaledAvatarPx}px`;
      modelAvatar.style.height = `${scaledAvatarPx}px`;
      modelAvatar.style.borderRadius = `${rp.avatarRadius}%`;
      modelAvatar.style.backgroundColor = mi.uiSurface;
      modelAvatar.style.color = mi.uiAccent;
      modelAvatar.style.border = `1.5px solid ${mi.uiAccent}`;
      if (rp.modelAvatarUrl) {
        modelAvatar.innerHTML = `<img src="${html(rp.modelAvatarUrl)}" alt="">`;
      } else {
        modelAvatar.textContent = (rp.modelName || 'M').trim().charAt(0).toUpperCase() || 'M';
      }
    }

    // Chat Bubbles & Transparency
    const bubblesMaster = mi.enableChatBubbles !== false;
    const userBubbleOn = (bubblesMaster && mi.userBubbleEnabled !== false) || isGeometryStyle;
    const modelBubbleOn = (bubblesMaster && Boolean(mi.modelBubbleEnabled)) || isGeometryStyle;
    const bubbleTrans = bubblesMaster && Boolean(mi.bubbleTransparencyEnabled);
    const bAlpha = bubbleTrans ? Math.max(0.08, Math.min(1, (Number(mi.bubbleOpacity) || 78) / 100)) : 1;
    const bBlur = bubbleTrans ? Math.max(0, Number(mi.bubbleBlur) || 0) : 0;

    const userTransOn = bubbleTrans && mi.userBubbleTransparent !== false;
    const modelTransOn = bubbleTrans && mi.modelBubbleTransparent !== false;

    const userBubbleEl = stage.querySelector('[data-sl-te-stage-user-bubble]');
    const modelBubbleEl = stage.querySelector('[data-sl-te-stage-model-bubble]');
    const thinkEl = stage.querySelector('[data-sl-te-stage-think]');

    const scaledChatFontPx = Math.max(11, Math.min(18, Math.round((Number(ty.chatFontSize) || 15) * 0.84)));
    const userTxtColor = ty.customTextColorEnabled ? ty.userTextColor : mi.uiText;
    const modelTxtColor = ty.customTextColorEnabled ? ty.modelTextColor : mi.uiText;

    if (userBubbleEl) {
      userBubbleEl.classList.toggle('is-bubble-on', userBubbleOn);
      userBubbleEl.style.fontSize = `${scaledChatFontPx}px`;
      userBubbleEl.style.color = userTxtColor;
      if (userBubbleOn) {
        userBubbleEl.style.backgroundColor = hexToRgba(mi.userBubbleColor, userTransOn ? bAlpha : 1);
        userBubbleEl.style.border = isPixelStyle
          ? `2px solid ${mi.uiAccent}`
          : isWinterStyle
          ? `1.5px solid ${mi.uiAccent}`
          : `1px solid ${mi.uiBorder}`;
        userBubbleEl.style.backdropFilter = userTransOn && bBlur > 0 ? `blur(${bBlur}px)` : 'none';
        userBubbleEl.style.webkitBackdropFilter = userTransOn && bBlur > 0 ? `blur(${bBlur}px)` : 'none';
        userBubbleEl.style.padding = '9px 13px';
      } else {
        userBubbleEl.style.backgroundColor = 'transparent';
        userBubbleEl.style.border = '1px solid transparent';
        userBubbleEl.style.backdropFilter = 'none';
        userBubbleEl.style.webkitBackdropFilter = 'none';
        userBubbleEl.style.padding = '2px 0';
      }
    }

    if (modelBubbleEl) {
      modelBubbleEl.classList.toggle('is-bubble-on', modelBubbleOn);
      modelBubbleEl.style.fontSize = `${scaledChatFontPx}px`;
      modelBubbleEl.style.color = modelTxtColor;
      if (modelBubbleOn) {
        modelBubbleEl.style.backgroundColor = hexToRgba(mi.modelBubbleColor, modelTransOn ? bAlpha : 1);
        modelBubbleEl.style.border = isPixelStyle
          ? `2px solid ${mi.uiBorder}`
          : isWinterStyle
          ? `1.5px solid ${mi.uiAccent}`
          : `1px solid ${mi.uiBorder}`;
        modelBubbleEl.style.backdropFilter = modelTransOn && bBlur > 0 ? `blur(${bBlur}px)` : 'none';
        modelBubbleEl.style.webkitBackdropFilter = modelTransOn && bBlur > 0 ? `blur(${bBlur}px)` : 'none';
        modelBubbleEl.style.padding = '10px 14px';
      } else {
        modelBubbleEl.style.backgroundColor = 'transparent';
        modelBubbleEl.style.border = '1px solid transparent';
        modelBubbleEl.style.backdropFilter = 'none';
        modelBubbleEl.style.webkitBackdropFilter = 'none';
        modelBubbleEl.style.padding = '2px 0';
      }
    }

    if (thinkEl) {
      const thinkAlpha = bubbleTrans ? Math.max(0.1, bAlpha * 0.9) : 0.85;
      thinkEl.style.backgroundColor = hexToRgba(mi.uiBase, thinkAlpha);
      thinkEl.style.border = isPixelStyle
        ? `2px solid ${mi.uiAccent}`
        : isWinterStyle
        ? `1.5px solid ${mi.uiAccent}`
        : `1px solid ${mi.uiBorder}`;
      thinkEl.style.color = mi.uiAccent;
    }

    const userQuoteEl = stage.querySelector('[data-sl-te-stage-user-quote]');
    const modelQuoteEl = stage.querySelector('[data-sl-te-stage-model-quote]');
    if (userQuoteEl) {
      userQuoteEl.style.color = ty.quoteHighlightEnabled ? (ty.userQuoteColor || mi.uiAccent) : userTxtColor;
      userQuoteEl.style.fontWeight = ty.quoteHighlightEnabled ? '700' : '400';
    }
    if (modelQuoteEl) {
      modelQuoteEl.style.color = ty.quoteHighlightEnabled ? (ty.modelQuoteColor || mi.uiAccent) : modelTxtColor;
      modelQuoteEl.style.fontWeight = ty.quoteHighlightEnabled ? '700' : '400';
    }

    // Also sync live theme colors into the Style tab mini-previews & custom .stylelab cards
    root.querySelectorAll('[data-sl-te-style-preview]').forEach(el => {
      el.style.setProperty('--sl-style-prev-base', mi.uiBase);
      el.style.setProperty('--sl-style-prev-surface', mi.uiSurface);
      el.style.setProperty('--sl-style-prev-accent', mi.uiAccent);
      el.style.setProperty('--sl-style-prev-border', mi.uiBorder);
      el.style.setProperty('--sl-style-prev-user', mi.userBubbleColor);
      el.style.setProperty('--sl-style-prev-model', mi.modelBubbleColor);
      el.style.setProperty('--sl-style-prev-text', mi.uiText);
    });

    root.querySelectorAll('.sl-te-style-card--custom[data-sl-te-style-preset]').forEach(cardEl => {
      const sid = cardEl.getAttribute('data-sl-te-style-preset');
      const cStyle = window.StudioLab?.themePresets?.getCustomStyleById?.(sid);
      const styleTag = cardEl.querySelector('.sl-te-custom-card-css');
      if (cStyle && styleTag && window.StudioLab?.themeEngine?.buildCustomStylePreviewCardCSS) {
        styleTag.textContent = window.StudioLab.themeEngine.buildCustomStylePreviewCardCSS(cStyle, mi);
      }
    });
  }

  function renderPaletteSwatches(group) {
    const palettes = Object.values(window.StudioLab?.themePresets?.PRESET_PALETTES || {})
      .filter(p => p.group === group);
    const currentKey = draftConfig?.mainInterface?.presetKey || 'purple';

    return palettes.map(p => {
      const selected = p.id === currentKey;
      return `
        <button type="button" class="sl-te-palette-btn ${selected ? 'is-selected' : ''}" data-sl-te-preset="${html(p.id)}" title="${html(p.label)}">
          <span class="sl-te-palette-swatches">
            <span class="sl-te-swatch-dot" style="background:${html(p.uiBase)}"></span>
            <span class="sl-te-swatch-dot" style="background:${html(p.uiAccent)}"></span>
            <span class="sl-te-swatch-dot" style="background:${html(p.userBubble)}"></span>
          </span>
          <span class="sl-te-palette-name">${html(p.label)}</span>
        </button>
      `;
    }).join('');
  }

  function renderRoleplayTab() {
    const rp = draftConfig.roleplay;
    const modelInitial = (rp.modelName || 'M').trim().charAt(0).toUpperCase() || 'M';
    const userInitial = (rp.userName || 'U').trim().charAt(0).toUpperCase() || 'U';

    return `
      <div class="sl-te-pane" data-sl-te-pane="roleplay" ${activeSubTab === 'roleplay' ? '' : 'hidden'}>
        <!-- 1. Avatar Customization Section -->
        <div class="sl-te-card-group">
          <div class="sl-te-row">
            <div class="sl-setting-copy">
              <h3 class="sl-setting-label">${html(t('te_rp_avatar_master_title'))}</h3>
              <p class="sl-setting-help">${html(t('te_rp_avatar_master_desc'))}</p>
            </div>
            <div class="sl-setting-control">
              ${renderSwitch('data-sl-te-bind="roleplay.enableAvatarCustom"', rp.enableAvatarCustom)}
            </div>
          </div>

          <div class="sl-te-accordion" data-sl-te-accordion="roleplay.enableAvatarCustom" ${rp.enableAvatarCustom ? '' : 'hidden'}>
            <div class="sl-te-subrow">
              <div class="sl-setting-copy">
                <span class="sl-setting-label">${html(t('te_rp_avatar_style_label'))}</span>
              </div>
              <div class="sl-setting-control">
                <select class="sl-setting-input" data-sl-te-bind="roleplay.avatarStyle">
                  <option value="above" selected>${html(t('te_rp_avatar_style_above'))}</option>
                </select>
              </div>
            </div>

            <div class="sl-te-subrow-stack">
              <div class="sl-te-avatar-grid">
                <!-- Model Avatar Box -->
                <div class="sl-te-avatar-box">
                  <div class="sl-te-avatar-box-top">
                    <div class="sl-te-avatar-preview-wrap">
                      <span class="sl-te-avatar-preview" data-sl-te-avatar-preview="model" style="border-radius:${rp.avatarRadius}%">
                        ${rp.modelAvatarUrl ? `<img src="${html(rp.modelAvatarUrl)}" alt="Model">` : html(modelInitial)}
                      </span>
                      <div>
                        <div class="sl-setting-label">${html(t('te_rp_model_avatar_card'))}</div>
                        <div class="sl-setting-help">${html(t('te_rp_show_model_avatar'))}</div>
                      </div>
                    </div>
                    ${renderSwitch('data-sl-te-bind="roleplay.showModelAvatar"', rp.showModelAvatar)}
                  </div>
                  <div class="sl-te-avatar-actions">
                    <label class="sl-settings-button">
                      <span>${html(t('te_rp_upload_avatar'))}</span>
                      <input type="file" accept="image/*" hidden data-sl-te-avatar-file="model">
                    </label>
                    <button type="button" class="sl-settings-button" data-sl-te-avatar-clear="model">${html(t('te_rp_clear_avatar'))}</button>
                  </div>
                  <input type="text" class="sl-te-name-input" placeholder="${html(t('te_rp_avatar_url_placeholder'))}" value="${html(rp.modelAvatarUrl.startsWith('data:') ? '' : rp.modelAvatarUrl)}" data-sl-te-avatar-url="model">
                </div>

                <!-- User Avatar Box -->
                <div class="sl-te-avatar-box">
                  <div class="sl-te-avatar-box-top">
                    <div class="sl-te-avatar-preview-wrap">
                      <span class="sl-te-avatar-preview" data-sl-te-avatar-preview="user" style="border-radius:${rp.avatarRadius}%">
                        ${rp.userAvatarUrl ? `<img src="${html(rp.userAvatarUrl)}" alt="User">` : html(userInitial)}
                      </span>
                      <div>
                        <div class="sl-setting-label">${html(t('te_rp_user_avatar_card'))}</div>
                        <div class="sl-setting-help">${html(t('te_rp_show_user_avatar'))}</div>
                      </div>
                    </div>
                    ${renderSwitch('data-sl-te-bind="roleplay.showUserAvatar"', rp.showUserAvatar)}
                  </div>
                  <div class="sl-te-avatar-actions">
                    <label class="sl-settings-button">
                      <span>${html(t('te_rp_upload_avatar'))}</span>
                      <input type="file" accept="image/*" hidden data-sl-te-avatar-file="user">
                    </label>
                    <button type="button" class="sl-settings-button" data-sl-te-avatar-clear="user">${html(t('te_rp_clear_avatar'))}</button>
                  </div>
                  <input type="text" class="sl-te-name-input" placeholder="${html(t('te_rp_avatar_url_placeholder'))}" value="${html(rp.userAvatarUrl.startsWith('data:') ? '' : rp.userAvatarUrl)}" data-sl-te-avatar-url="user">
                </div>
              </div>
            </div>

            <div class="sl-te-subrow">
              <div class="sl-setting-copy">
                <span class="sl-setting-label">${html(t('te_rp_avatar_size'))}</span>
              </div>
              <div class="sl-te-slider-control">
                <input type="range" min="24" max="96" step="2" value="${rp.avatarSize}" data-sl-te-bind="roleplay.avatarSize" data-sl-te-unit="px">
                <span class="sl-te-slider-val" data-sl-te-val="roleplay.avatarSize">${rp.avatarSize}px</span>
              </div>
            </div>

            <div class="sl-te-subrow">
              <div class="sl-setting-copy">
                <span class="sl-setting-label">${html(t('te_rp_avatar_radius'))}</span>
              </div>
              <div class="sl-te-slider-control">
                <input type="range" min="0" max="50" step="2" value="${rp.avatarRadius}" data-sl-te-bind="roleplay.avatarRadius" data-sl-te-unit="%">
                <span class="sl-te-slider-val" data-sl-te-val="roleplay.avatarRadius">${rp.avatarRadius}%</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 2. Name Customization Section -->
        <div class="sl-te-card-group">
          <div class="sl-te-row">
            <div class="sl-setting-copy">
              <h3 class="sl-setting-label">${html(t('te_rp_name_master_title'))}</h3>
              <p class="sl-setting-help">${html(t('te_rp_name_master_desc'))}</p>
            </div>
            <div class="sl-setting-control">
              ${renderSwitch('data-sl-te-bind="roleplay.enableNameCustom"', rp.enableNameCustom)}
            </div>
          </div>

          <div class="sl-te-accordion" data-sl-te-accordion="roleplay.enableNameCustom" ${rp.enableNameCustom ? '' : 'hidden'}>
            <div class="sl-te-subrow">
              <div class="sl-setting-copy">
                <span class="sl-setting-label">${html(t('te_rp_model_name_label'))}</span>
              </div>
              <div class="sl-setting-control">
                <input type="text" class="sl-te-name-input" value="${html(rp.modelName)}" maxlength="48" data-sl-te-bind="roleplay.modelName">
              </div>
            </div>

            <div class="sl-te-subrow">
              <div class="sl-setting-copy">
                <span class="sl-setting-label">${html(t('te_rp_user_name_label'))}</span>
              </div>
              <div class="sl-setting-control">
                <input type="text" class="sl-te-name-input" value="${html(rp.userName)}" maxlength="48" data-sl-te-bind="roleplay.userName">
              </div>
            </div>

            <div class="sl-te-subrow">
              <div class="sl-setting-copy">
                <span class="sl-setting-label">${html(t('te_rp_name_size_label'))}</span>
              </div>
              <div class="sl-te-slider-control">
                <input type="range" min="11" max="28" step="1" value="${rp.nameSize}" data-sl-te-bind="roleplay.nameSize" data-sl-te-unit="px">
                <span class="sl-te-slider-val" data-sl-te-val="roleplay.nameSize">${rp.nameSize}px</span>
              </div>
            </div>

            <div class="sl-te-subrow-stack">
              <div class="sl-te-note-banner">${html(t('te_rp_name_sync_note'))}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderMainInterfaceTab() {
    const mi = draftConfig.mainInterface;

    return `
      <div class="sl-te-pane" data-sl-te-pane="main" ${activeSubTab === 'main' ? '' : 'hidden'}>
        <!-- 1. 25 Preset Color Palettes (Dark to Light) -->
        <div class="sl-te-card-group">
          <div class="sl-te-row-stack">
            <div class="sl-setting-copy">
              <h3 class="sl-setting-label">${html(t('te_main_palettes_title'))}</h3>
              <p class="sl-setting-help">${html(t('te_main_palettes_desc'))}</p>
            </div>
            <div>
              <div class="sl-te-palette-group-label">${html(t('te_main_dark_group'))}</div>
              <div class="sl-te-palette-grid" data-sl-te-palette-grid="dark">
                ${renderPaletteSwatches('dark')}
              </div>
            </div>
            <div>
              <div class="sl-te-palette-group-label">${html(t('te_main_light_group'))}</div>
              <div class="sl-te-palette-grid" data-sl-te-palette-grid="light">
                ${renderPaletteSwatches('light')}
              </div>
            </div>
          </div>

          <div class="sl-te-subrow">
            <div class="sl-setting-copy">
              <span class="sl-setting-label">${html(t('te_main_tint_label'))}</span>
              <p class="sl-setting-help">${html(t('te_main_tint_desc'))}</p>
            </div>
            <div class="sl-te-slider-control">
              <input type="range" min="0" max="100" step="1" value="${mi.uiTint ?? 15}" data-sl-te-bind="mainInterface.uiTint" data-sl-te-unit="%">
              <span class="sl-te-val-badge" data-sl-te-val="mainInterface.uiTint">${mi.uiTint ?? 15}%</span>
            </div>
          </div>
        </div>

        <!-- 2. Webpage Background Image + Dim & Blur -->
        <div class="sl-te-card-group">
          <div class="sl-te-row-stack">
            <div class="sl-setting-copy">
              <h3 class="sl-setting-label">${html(t('te_main_bg_title'))}</h3>
              <p class="sl-setting-help">${html(t('te_main_bg_desc'))}</p>
            </div>
            <div class="sl-te-bg-preview-bar">
              <div class="sl-te-bg-thumb" data-sl-te-bg-thumb style="${mi.pageBg ? `background-image:url('${html(mi.pageBg)}')` : ''}">
                ${mi.pageBg ? '' : html(t('te_main_bg_no_image', 'No Image'))}
              </div>
              <div class="sl-te-avatar-actions">
                <label class="sl-settings-button primary">
                  <span>${html(t('te_main_bg_upload'))}</span>
                  <input type="file" accept="image/*" hidden data-sl-te-bg-file>
                </label>
                <button type="button" class="sl-settings-button" data-sl-te-bg-clear>${html(t('te_main_bg_clear'))}</button>
              </div>
            </div>
          </div>

          <div class="sl-te-subrow">
            <div class="sl-setting-copy">
              <span class="sl-setting-label">${html(t('te_main_bg_dim'))}</span>
            </div>
            <div class="sl-te-slider-control">
              <input type="range" min="0" max="95" step="5" value="${mi.bgDim}" data-sl-te-bind="mainInterface.bgDim" data-sl-te-unit="%">
              <span class="sl-te-slider-val" data-sl-te-val="mainInterface.bgDim">${mi.bgDim}%</span>
            </div>
          </div>

          <div class="sl-te-subrow">
            <div class="sl-setting-copy">
              <span class="sl-setting-label">${html(t('te_main_bg_blur'))}</span>
            </div>
            <div class="sl-te-slider-control">
              <input type="range" min="0" max="24" step="1" value="${mi.bgBlur}" data-sl-te-bind="mainInterface.bgBlur" data-sl-te-unit="px">
              <span class="sl-te-slider-val" data-sl-te-val="mainInterface.bgBlur">${mi.bgBlur}px</span>
            </div>
          </div>
        </div>

        <!-- 3. Chat Bubbles Customization -->
        <div class="sl-te-card-group">
          <div class="sl-te-row">
            <div class="sl-setting-copy">
              <h3 class="sl-setting-label">${html(t('te_main_bubbles_master_title'))}</h3>
              <p class="sl-setting-help">${html(t('te_main_bubbles_master_desc'))}</p>
            </div>
            <div class="sl-setting-control">
              ${renderSwitch('data-sl-te-bind="mainInterface.enableChatBubbles"', mi.enableChatBubbles)}
            </div>
          </div>

          <div class="sl-te-accordion" data-sl-te-accordion="mainInterface.enableChatBubbles" ${mi.enableChatBubbles ? '' : 'hidden'}>
            <div class="sl-te-subrow">
              <div class="sl-setting-copy">
                <span class="sl-setting-label">${html(t('te_main_user_bubble_toggle'))}</span>
                <p class="sl-setting-help">${html(t('te_main_user_bubble_desc'))}</p>
              </div>
              <div class="sl-setting-control">
                ${renderSwitch('data-sl-te-bind="mainInterface.userBubbleEnabled"', mi.userBubbleEnabled)}
              </div>
            </div>

            <div class="sl-te-subrow">
              <div class="sl-setting-copy">
                <span class="sl-setting-label">${html(t('te_main_model_bubble_toggle'))}</span>
                <p class="sl-setting-help">${html(t('te_main_model_bubble_desc'))}</p>
              </div>
              <div class="sl-setting-control">
                ${renderSwitch('data-sl-te-bind="mainInterface.modelBubbleEnabled"', mi.modelBubbleEnabled)}
              </div>
            </div>

            <!-- Bubble Transparency Accordion -->
            <div class="sl-te-subrow">
              <div class="sl-setting-copy">
                <span class="sl-setting-label">${html(t('te_main_bubble_trans_toggle'))}</span>
                <p class="sl-setting-help">${html(t('te_main_bubble_trans_desc'))}</p>
              </div>
              <div class="sl-setting-control">
                ${renderSwitch('data-sl-te-bind="mainInterface.bubbleTransparencyEnabled"', mi.bubbleTransparencyEnabled)}
              </div>
            </div>

            <div class="sl-te-accordion" data-sl-te-accordion="mainInterface.bubbleTransparencyEnabled" ${mi.bubbleTransparencyEnabled ? '' : 'hidden'}>
              <div class="sl-te-subrow">
                <div class="sl-setting-copy">
                  <span class="sl-setting-label">${html(t('te_main_bubble_trans_user'))}</span>
                </div>
                <div class="sl-setting-control">
                  ${renderSwitch('data-sl-te-bind="mainInterface.userBubbleTransparent"', mi.userBubbleTransparent)}
                </div>
              </div>

              <div class="sl-te-subrow">
                <div class="sl-setting-copy">
                  <span class="sl-setting-label">${html(t('te_main_bubble_trans_model'))}</span>
                </div>
                <div class="sl-setting-control">
                  ${renderSwitch('data-sl-te-bind="mainInterface.modelBubbleTransparent"', mi.modelBubbleTransparent)}
                </div>
              </div>

              <div class="sl-te-subrow">
                <div class="sl-setting-copy">
                  <span class="sl-setting-label">${html(t('te_main_bubble_blur'))}</span>
                </div>
                <div class="sl-te-slider-control">
                  <input type="range" min="0" max="32" step="1" value="${mi.bubbleBlur}" data-sl-te-bind="mainInterface.bubbleBlur" data-sl-te-unit="px">
                  <span class="sl-te-slider-val" data-sl-te-val="mainInterface.bubbleBlur">${mi.bubbleBlur}px</span>
                </div>
              </div>

              <div class="sl-te-subrow">
                <div class="sl-setting-copy">
                  <span class="sl-setting-label">${html(t('te_main_bubble_opacity'))}</span>
                </div>
                <div class="sl-te-slider-control">
                  <input type="range" min="5" max="100" step="5" value="${mi.bubbleOpacity}" data-sl-te-bind="mainInterface.bubbleOpacity" data-sl-te-unit="%">
                  <span class="sl-te-slider-val" data-sl-te-val="mainInterface.bubbleOpacity">${mi.bubbleOpacity}%</span>
                </div>
              </div>

              <div class="sl-te-subrow-stack">
                <div class="sl-te-note-banner">${html(t('te_main_bubble_sync_note'))}</div>
              </div>
            </div>

            <!-- Bubble Custom Colors -->
            <div class="sl-te-subrow">
              <div class="sl-setting-copy">
                <span class="sl-setting-label">${html(t('te_main_user_bubble_color'))}</span>
              </div>
              <label class="sl-te-color-control">
                <input type="color" class="sl-te-color-input" value="${html(mi.userBubbleColor)}" data-sl-te-bind="mainInterface.userBubbleColor">
                <span class="sl-te-color-hex" data-sl-te-hex="mainInterface.userBubbleColor">${html(mi.userBubbleColor)}</span>
              </label>
            </div>

            <div class="sl-te-subrow">
              <div class="sl-setting-copy">
                <span class="sl-setting-label">${html(t('te_main_model_bubble_color'))}</span>
              </div>
              <label class="sl-te-color-control">
                <input type="color" class="sl-te-color-input" value="${html(mi.modelBubbleColor)}" data-sl-te-bind="mainInterface.modelBubbleColor">
                <span class="sl-te-color-hex" data-sl-te-hex="mainInterface.modelBubbleColor">${html(mi.modelBubbleColor)}</span>
              </label>
            </div>
          </div>
        </div>

        <!-- 4. Transparent UI -->
        <div class="sl-te-card-group">
          <div class="sl-te-row">
            <div class="sl-setting-copy">
              <h3 class="sl-setting-label">${html(t('te_main_ui_trans_title'))}</h3>
              <p class="sl-setting-help">${html(t('te_main_ui_trans_desc'))}</p>
            </div>
            <div class="sl-setting-control">
              ${renderSwitch('data-sl-te-bind="mainInterface.transparentUiEnabled"', mi.transparentUiEnabled)}
            </div>
          </div>

          <div class="sl-te-accordion" data-sl-te-accordion="mainInterface.transparentUiEnabled" ${mi.transparentUiEnabled ? '' : 'hidden'}>
            <div class="sl-te-subrow">
              <div class="sl-setting-copy">
                <span class="sl-setting-label">${html(t('te_main_ui_blur'))}</span>
              </div>
              <div class="sl-te-slider-control">
                <input type="range" min="0" max="40" step="1" value="${mi.uiBlur}" data-sl-te-bind="mainInterface.uiBlur" data-sl-te-unit="px">
                <span class="sl-te-slider-val" data-sl-te-val="mainInterface.uiBlur">${mi.uiBlur}px</span>
              </div>
            </div>

            <div class="sl-te-subrow">
              <div class="sl-setting-copy">
                <span class="sl-setting-label">${html(t('te_main_ui_opacity'))}</span>
              </div>
              <div class="sl-te-slider-control">
                <input type="range" min="10" max="100" step="5" value="${mi.uiOpacity}" data-sl-te-bind="mainInterface.uiOpacity" data-sl-te-unit="%">
                <span class="sl-te-slider-val" data-sl-te-val="mainInterface.uiOpacity">${mi.uiOpacity}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderCustomStyleCardHtml(item, currentStyle) {
    const isSelected = currentStyle === item.id;
    const prev = item.preview || {};
    const icon = item.icon || prev.icon || item.badgeIcon || '✨';
    const badge = item.badge || prev.badge || item.tag || 'STYLELAB';
    const sampleUser = prev.userSampleText || prev.sampleUserText || t('te_stylelab_sample_user_default', '"Hello world!"');
    const sampleModel = prev.modelSampleText || prev.sampleModelText || `${item.name} ${icon}`;
    const bRadius = prev.bubbleRadius || item.regions?.userBubble?.borderRadius || item.geometry?.bubbleRadius || '14px';
    const bStyle = item.geometry?.borderStyle || 'solid';
    const aRadius = prev.avatarRadius || item.regions?.avatar?.borderRadius || item.geometry?.buttonRadius || '12px';

    const scopedCardCSS = window.StudioLab?.themeEngine?.buildCustomStylePreviewCardCSS
      ? window.StudioLab.themeEngine.buildCustomStylePreviewCardCSS(item, draftConfig?.mainInterface || {})
      : '';

    return `
      <div class="sl-te-style-card sl-te-style-card--custom ${isSelected ? 'is-selected' : ''}" data-sl-te-style-preset="${html(item.id)}" role="button" tabindex="0">
        <style class="sl-te-custom-card-css">${scopedCardCSS}</style>
        <div class="sl-te-style-visual sl-te-style-visual--custom" style="border-radius:${html(item.geometry?.cardRadius || '12px')};border-style:${html(bStyle)}">
          <div class="sl-te-sv-row sl-te-sv-row--user">
            <span class="sl-te-sv-bubble sl-te-sv-bubble--user" style="border-radius:${html(bRadius)};border-style:${html(bStyle)};border-color:var(--sl-style-prev-accent)">${html(sampleUser)}</span>
            <span class="sl-te-sv-avatar" style="border-radius:${html(aRadius)}">${html(icon)}</span>
          </div>
          <div class="sl-te-sv-row sl-te-sv-row--model">
            <span class="sl-te-sv-avatar" style="border-radius:${html(aRadius)}">M</span>
            <span class="sl-te-sv-bubble sl-te-sv-bubble--model" style="border-radius:${html(bRadius)};border-style:${html(bStyle)};border-color:var(--sl-style-prev-accent)">${html(sampleModel)}</span>
          </div>
        </div>
        <div class="sl-te-style-meta">
          <div class="sl-te-style-title-row">
            <span class="sl-te-style-title">${html(icon)} ${html(item.name)}</span>
            <span class="sl-te-style-badge sl-te-style-badge--custom">${html(badge)}</span>
          </div>
          <p class="sl-te-style-desc">${html(item.description || t('te_stylelab_card_default_desc', 'Custom style (.stylelab) saved permanently.'))}</p>
          <div class="sl-te-custom-style-actions">
            <button type="button" class="sl-te-custom-style-btn" data-sl-te-stylelab-export="${html(item.id)}" title="${html(t('te_stylelab_export_title', 'Export .stylelab file'))}">
              📤 ${html(t('te_stylelab_export_btn', 'Export .stylelab'))}
            </button>
            ${item.isOfficial ? '' : `
            <button type="button" class="sl-te-custom-style-btn is-danger" data-sl-te-stylelab-delete="${html(item.id)}" title="${html(t('te_stylelab_delete_title', 'Delete this style'))}">
              🗑️ ${html(t('te_stylelab_delete_btn', 'Delete'))}
            </button>
            `}
          </div>
        </div>
      </div>
    `;
  }

  function renderStyleTab() {
    const st = draftConfig?.style || {};
    const mi = draftConfig?.mainInterface || {};
    const rawStyle = st.stylePreset || 'default';
    const currentStyle = rawStyle === 'winter-frost' ? 'custom-starlit-snowglass' : rawStyle;
    const customStyles = window.StudioLab?.themePresets?.getCustomStyles?.() || [];
    const defaultPromptTemplate = window.StudioLab?.themePresets?.buildStyleLabAIPromptTemplate?.('') || '';

    const previewVars = [
      `--sl-style-prev-base:${html(mi.uiBase || '#0d0e14')}`,
      `--sl-style-prev-surface:${html(mi.uiSurface || '#151722')}`,
      `--sl-style-prev-accent:${html(mi.uiAccent || '#a78bfa')}`,
      `--sl-style-prev-border:${html(mi.uiBorder || '#26293d')}`,
      `--sl-style-prev-user:${html(mi.userBubbleColor || '#1f1d33')}`,
      `--sl-style-prev-model:${html(mi.modelBubbleColor || '#131520')}`,
      `--sl-style-prev-text:${html(mi.uiText || '#eef2f8')}`
    ].join(';');

    const customCardsHtml = customStyles.map(item => renderCustomStyleCardHtml(item, currentStyle)).join('');

    return `
      <div class="sl-te-pane" data-sl-te-pane="style" ${activeSubTab === 'style' ? '' : 'hidden'}>
        <!-- 1-Click Curated Geometry Style Presets + Official/Custom .stylelab Presets -->
        <div class="sl-te-card-group">
          <div class="sl-te-row-stack">
            <div class="sl-setting-copy">
              <h3 class="sl-setting-label">${html(t('te_style_section_title', 'Phong cách hình khối giao diện (UI Geometry Style)'))}</h3>
              <p class="sl-setting-help">${html(t('te_style_section_desc', 'Biến đổi toàn diện hình khối bong bóng chat, thanh công cụ <ms-header>, khung nhập liệu, Avatar, Code và Think block chỉ với 1 chạm chuẩn đẹp nhất mà vẫn giữ nguyên 100% bảng màu của Theme.'))}</p>
            </div>

            <div class="sl-te-style-grid" data-sl-te-style-preview data-sl-te-style-grid style="${previewVars}">
              <!-- Style Card 1: Default (Smooth Modern) -->
              <button type="button" class="sl-te-style-card ${currentStyle === 'default' ? 'is-selected' : ''}" data-sl-te-style-preset="default">
                <div class="sl-te-style-visual sl-te-style-visual--default">
                  <div class="sl-te-sv-row sl-te-sv-row--user">
                    <span class="sl-te-sv-bubble sl-te-sv-bubble--user">${html(t('te_style_default_sample_user', '"Hello there!"'))}</span>
                    <span class="sl-te-sv-avatar">U</span>
                  </div>
                  <div class="sl-te-sv-row sl-te-sv-row--model">
                    <span class="sl-te-sv-avatar">M</span>
                    <span class="sl-te-sv-bubble sl-te-sv-bubble--model">${html(t('te_style_default_sample_model', 'Smooth modern corners ✨'))}</span>
                  </div>
                </div>
                <div class="sl-te-style-meta">
                  <div class="sl-te-style-title-row">
                    <span class="sl-te-style-title">${html(t('te_style_default_title', 'Mặc định (Hiện đại Mượt mà)'))}</span>
                    <span class="sl-te-style-badge">${html(t('te_style_default_badge', 'Chuẩn Studio'))}</span>
                  </div>
                  <p class="sl-te-style-desc">${html(t('te_style_default_desc', 'Bo tròn mềm mại, bóng đổ mịn và hiệu ứng kính mờ tiêu chuẩn của Studio.lab.'))}</p>
                </div>
              </button>

              <!-- Style Card 2: Cartoon Pixel RPG (8-Bit Arcade) -->
              <button type="button" class="sl-te-style-card ${currentStyle === 'cartoon-pixel' ? 'is-selected' : ''}" data-sl-te-style-preset="cartoon-pixel">
                <div class="sl-te-style-visual sl-te-style-visual--pixel">
                  <div class="sl-te-sv-row sl-te-sv-row--user">
                    <span class="sl-te-sv-bubble sl-te-sv-bubble--user sl-te-sv-bubble--pixel">${html(t('te_style_pixel_sample_user', '"Quest start!"'))}</span>
                    <span class="sl-te-sv-avatar sl-te-sv-avatar--pixel">U</span>
                  </div>
                  <div class="sl-te-sv-row sl-te-sv-row--model">
                    <span class="sl-te-sv-avatar sl-te-sv-avatar--pixel">M</span>
                    <span class="sl-te-sv-bubble sl-te-sv-bubble--model sl-te-sv-bubble--pixel">${html(t('te_style_pixel_sample_model', '8-bit RPG dialogue box 🕹️'))}</span>
                  </div>
                </div>
                <div class="sl-te-style-meta">
                  <div class="sl-te-style-title-row">
                    <span class="sl-te-style-title">🕹️ ${html(t('te_style_pixel_title', 'Pixel Hoạt Hình (Cartoon Pixel RPG)'))}</span>
                    <span class="sl-te-style-badge sl-te-style-badge--accent">${html(t('te_style_pixel_badge', '8-BIT RPG'))}</span>
                  </div>
                  <p class="sl-te-style-desc">${html(t('te_style_pixel_desc', 'Viền bậc thang 8-bit sắc nét, bóng đổ khối cứng, đuôi bong bóng thoại Pixel, nhãn tên làm mờ kính và đồng bộ toàn diện Sidebar trái/phải, thanh công cụ nổi + <X/Y>, bảng chỉnh sửa cây bút, Khung nhập kèm chip công cụ, Avatar, Code & Think block.'))}</p>
                </div>
              </button>

              ${customCardsHtml}
            </div>

            <!-- Ambient Falling Effect Toggle (Snowfall / Particles) -->
            <div class="sl-te-subrow" style="border-radius:14px;margin-top:4px;border:1px solid var(--sl-settings-outline, #3c4043)">
              <div class="sl-setting-copy">
                <span class="sl-setting-label">❄️ ${html(t('te_style_ambient_toggle_title', 'Hiệu ứng rơi nền (Bụi tuyết / Hạt không gian)'))}</span>
                <p class="sl-setting-help">${html(t('te_style_ambient_toggle_desc', 'Bật hoặc tắt hiệu ứng bụi tuyết rơi lất phất mờ ảo ngẫu nhiên trên màn hình khi chọn phong cách Tinh Hà Băng Tuyết hoặc .stylelab có hiệu ứng môi trường.'))}</p>
              </div>
              <div class="sl-setting-control">
                ${renderSwitch('data-sl-te-bind="style.ambientEffectEnabled"', st.ambientEffectEnabled !== false)}
              </div>
            </div>

            <!-- Custom Style Lab Action Bar: Tuỳ chỉnh phong cách & Nhập phong cách (.stylelab) -->
            <div class="sl-te-stylelab-toolbar">
              <div class="sl-te-stylelab-toolbar-info">
                <div class="sl-te-stylelab-toolbar-title">${html(t('te_stylelab_toolbar_title', '🧪 Studio.lab StyleLab (.stylelab)'))}</div>
                <div class="sl-te-stylelab-toolbar-sub">${html(t('te_stylelab_toolbar_sub', 'Create limitless custom pure-CSS styles with AI or import a .stylelab file to save permanently to your style list.'))}</div>
              </div>
              <div class="sl-te-stylelab-toolbar-btns">
                <button type="button" class="sl-settings-button" data-sl-te-open-stylelab-prompt>
                  <span>✨ ${html(t('te_stylelab_customize_btn', 'Customize Style'))}</span>
                </button>
                <button type="button" class="sl-settings-button primary" data-sl-te-open-stylelab-import>
                  <span>📥 ${html(t('te_stylelab_import_btn', 'Import Style (.stylelab)'))}</span>
                </button>
              </div>
            </div>

            <!-- Modal 1: Customize Style with AI (100% English Blueprint + User Request) -->
            <div class="sl-te-stylelab-modal" data-sl-te-stylelab-prompt-modal hidden>
              <div class="sl-te-stylelab-modal-card">
                <div class="sl-te-stylelab-modal-header">
                  <div>
                    <h4 class="sl-te-stylelab-modal-title">${html(t('te_stylelab_prompt_modal_title', '✨ Customize Style with AI (.stylelab)'))}</h4>
                    <p class="sl-te-stylelab-modal-subtitle">${html(t('te_stylelab_prompt_modal_subtitle', 'Copy this complete English AI blueprint & schema with your custom request to let any AI generate a valid .stylelab style.'))}</p>
                  </div>
                  <button type="button" class="sl-settings-button" data-sl-te-close-stylelab-prompt>✕ ${html(t('te_stylelab_close_btn', 'Close'))}</button>
                </div>

                <div class="sl-te-stylelab-modal-body">
                  <label class="sl-te-stylelab-field-label">${html(t('te_stylelab_prompt_label_1', '1. Complete Reference Blueprint & Schema for AI (Automatically updates as you type below)'))}</label>
                  <textarea class="sl-te-stylelab-codebox" data-sl-te-stylelab-template-box readonly rows="10">${html(defaultPromptTemplate)}</textarea>

                  <label class="sl-te-stylelab-field-label" style="margin-top:10px">${html(t('te_stylelab_prompt_label_2', '2. Enter your custom style request (Automatically appended to the blueprint when copying)'))}</label>
                  <textarea class="sl-te-stylelab-request-input" data-sl-te-stylelab-user-request rows="3" placeholder="${html(t('te_stylelab_prompt_placeholder', 'Example: Design a sleek Mecha Sci-Fi style with angled clip-path polygon corners, or a cozy Neko style with pure CSS cat ears on chat bubbles...'))}"></textarea>
                </div>

                <div class="sl-te-stylelab-modal-footer">
                  <span class="sl-te-stylelab-hint">${html(t('te_stylelab_prompt_hint', '💡 Tip: Click the Copy button on the right, then paste directly into any AI chat.'))}</span>
                  <button type="button" class="sl-settings-button primary" data-sl-te-stylelab-copy-btn>
                    <span>${html(t('te_stylelab_copy_btn', '📋 Copy Full Blueprint & Request'))}</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- Modal 2: Import Style (.stylelab) (Upload file or paste JSON code directly) -->
            <div class="sl-te-stylelab-modal" data-sl-te-stylelab-import-modal hidden>
              <div class="sl-te-stylelab-modal-card">
                <div class="sl-te-stylelab-modal-header">
                  <div>
                    <h4 class="sl-te-stylelab-modal-title">${html(t('te_stylelab_import_modal_title', '📥 Import Style (.stylelab)'))}</h4>
                    <p class="sl-te-stylelab-modal-subtitle">${html(t('te_stylelab_import_modal_subtitle', 'Upload a .stylelab file from your device or paste the JSON code generated by AI to save it permanently to your Style list.'))}</p>
                  </div>
                  <button type="button" class="sl-settings-button" data-sl-te-close-stylelab-import>✕ ${html(t('te_stylelab_close_btn', 'Close'))}</button>
                </div>

                <div class="sl-te-stylelab-modal-body">
                  <div class="sl-te-stylelab-upload-bar">
                    <div>
                      <div style="font-weight:700;font-size:12.5px">${html(t('te_stylelab_upload_title', 'Upload .stylelab file from device'))}</div>
                      <div style="font-size:11.5px;opacity:0.75">${html(t('te_stylelab_upload_desc', 'Supports .stylelab or .json files exported from Studio.lab'))}</div>
                    </div>
                    <label class="sl-settings-button">
                      <span>${html(t('te_stylelab_choose_file_btn', '📂 Choose .stylelab file...'))}</span>
                      <input type="file" accept=".stylelab,.json,application/json,text/plain" hidden data-sl-te-stylelab-file-input>
                    </label>
                  </div>

                  <label class="sl-te-stylelab-field-label" style="margin-top:10px">${html(t('te_stylelab_paste_label', 'Or paste the .stylelab (JSON) code generated by AI directly here:'))}</label>
                  <textarea class="sl-te-stylelab-paste-input" data-sl-te-stylelab-paste-box rows="8" placeholder="${html(t('te_stylelab_paste_placeholder', 'Paste the .stylelab JSON or ```json ... ``` block returned by AI here...'))}"></textarea>
                  <div class="sl-te-stylelab-status" data-sl-te-stylelab-status hidden></div>
                </div>

                <div class="sl-te-stylelab-modal-footer">
                  <button type="button" class="sl-settings-button" data-sl-te-close-stylelab-import>${html(t('te_stylelab_cancel_btn', 'Cancel'))}</button>
                  <button type="button" class="sl-settings-button primary" data-sl-te-stylelab-import-confirm>
                    <span>${html(t('te_stylelab_confirm_import_btn', '✅ Import & Save Style'))}</span>
                  </button>
                </div>
              </div>
            </div>

            <div class="sl-te-note-banner">${html(t('te_style_color_lock_note', '🎨 Giữ nguyên màu Theme: Mọi đường viền, góc huy hiệu, nền hộp thoại, hiệu ứng làm mờ kính và bóng đổ của từng phong cách đều tự động lấy trực tiếp từ bảng màu và độ ngã màu bạn đã chọn ở mục Giao diện chính.'))}</div>
          </div>
        </div>
      </div>
    `;
  }

  function renderTypographyTab() {
    const ty = draftConfig.typography;
    const fonts = window.StudioLab?.themePresets?.FONT_CATALOG || [];

    const fontOptionsHtml = fonts.map(f => `
      <option value="${html(f.value)}" ${(ty.fontFamily === f.value || ty.fontFamily === f.id) ? 'selected' : ''}>${html(f.label)}</option>
    `).join('');

    return `
      <div class="sl-te-pane" data-sl-te-pane="typography" ${activeSubTab === 'typography' ? '' : 'hidden'}>
        <!-- Font Family & Size -->
        <div class="sl-te-card-group">
          <div class="sl-te-row">
            <div class="sl-setting-copy">
              <h3 class="sl-setting-label">${html(t('te_typo_font_title'))}</h3>
              <p class="sl-setting-help">${html(t('te_typo_font_desc'))}</p>
            </div>
            <div class="sl-setting-control">
              <select class="sl-setting-input" data-sl-te-bind="typography.fontFamily">
                ${fontOptionsHtml}
              </select>
            </div>
          </div>

          <div class="sl-te-row">
            <div class="sl-setting-copy">
              <h3 class="sl-setting-label">${html(t('te_typo_size_title'))}</h3>
              <p class="sl-setting-help">${html(t('te_typo_size_desc'))}</p>
            </div>
            <div class="sl-te-slider-control">
              <input type="range" min="12" max="24" step="1" value="${ty.chatFontSize}" data-sl-te-bind="typography.chatFontSize" data-sl-te-unit="px">
              <span class="sl-te-slider-val" data-sl-te-val="typography.chatFontSize">${ty.chatFontSize}px</span>
            </div>
          </div>
        </div>

        <!-- Custom Text Color -->
        <div class="sl-te-card-group">
          <div class="sl-te-row">
            <div class="sl-setting-copy">
              <h3 class="sl-setting-label">${html(t('te_typo_text_color_title'))}</h3>
              <p class="sl-setting-help">${html(t('te_typo_text_color_desc'))}</p>
            </div>
            <div class="sl-setting-control">
              ${renderSwitch('data-sl-te-bind="typography.customTextColorEnabled"', ty.customTextColorEnabled)}
            </div>
          </div>

          <div class="sl-te-accordion" data-sl-te-accordion="typography.customTextColorEnabled" ${ty.customTextColorEnabled ? '' : 'hidden'}>
            <div class="sl-te-subrow">
              <div class="sl-setting-copy">
                <span class="sl-setting-label">${html(t('te_typo_model_text_color'))}</span>
              </div>
              <label class="sl-te-color-control">
                <input type="color" class="sl-te-color-input" value="${html(ty.modelTextColor)}" data-sl-te-bind="typography.modelTextColor">
                <span class="sl-te-color-hex" data-sl-te-hex="typography.modelTextColor">${html(ty.modelTextColor)}</span>
              </label>
            </div>

            <div class="sl-te-subrow">
              <div class="sl-setting-copy">
                <span class="sl-setting-label">${html(t('te_typo_user_text_color'))}</span>
              </div>
              <label class="sl-te-color-control">
                <input type="color" class="sl-te-color-input" value="${html(ty.userTextColor)}" data-sl-te-bind="typography.userTextColor">
                <span class="sl-te-color-hex" data-sl-te-hex="typography.userTextColor">${html(ty.userTextColor)}</span>
              </label>
            </div>
          </div>
        </div>

        <!-- Quotation "abc" Highlight -->
        <div class="sl-te-card-group">
          <div class="sl-te-row">
            <div class="sl-setting-copy">
              <h3 class="sl-setting-label">${html(t('te_typo_quote_title'))}</h3>
              <p class="sl-setting-help">${html(t('te_typo_quote_desc'))}</p>
            </div>
            <div class="sl-setting-control">
              ${renderSwitch('data-sl-te-bind="typography.quoteHighlightEnabled"', ty.quoteHighlightEnabled)}
            </div>
          </div>

          <div class="sl-te-accordion" data-sl-te-accordion="typography.quoteHighlightEnabled" ${ty.quoteHighlightEnabled ? '' : 'hidden'}>
            <div class="sl-te-subrow">
              <div class="sl-setting-copy">
                <span class="sl-setting-label">${html(t('te_typo_model_quote_color'))}</span>
              </div>
              <label class="sl-te-color-control">
                <input type="color" class="sl-te-color-input" value="${html(ty.modelQuoteColor)}" data-sl-te-bind="typography.modelQuoteColor">
                <span class="sl-te-color-hex" data-sl-te-hex="typography.modelQuoteColor">${html(ty.modelQuoteColor)}</span>
              </label>
            </div>

            <div class="sl-te-subrow">
              <div class="sl-setting-copy">
                <span class="sl-setting-label">${html(t('te_typo_user_quote_color'))}</span>
              </div>
              <label class="sl-te-color-control">
                <input type="color" class="sl-te-color-input" value="${html(ty.userQuoteColor)}" data-sl-te-bind="typography.userQuoteColor">
                <span class="sl-te-color-hex" data-sl-te-hex="typography.userQuoteColor">${html(ty.userQuoteColor)}</span>
              </label>
            </div>
          </div>
        </div>

        <!-- Reset Typography Button -->
        <div class="sl-te-card-group">
          <div class="sl-te-row">
            <div class="sl-setting-copy">
              <span class="sl-setting-label">${html(t('te_typo_reset_btn'))}</span>
            </div>
            <div class="sl-setting-control">
              <button type="button" class="sl-settings-button" data-sl-te-reset-typo>${html(t('te_typo_reset_btn'))}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderEditorWorkspace({ editorState, customThemes, renderIcon }) {
    ensureDraftSession(editorState, customThemes);

    return `
      <div class="sl-te-workspace" data-sl-theme-editor-view>
        <!-- Top Header Bar (2-Row Structure) -->
        <div class="sl-te-header-card">
          <div class="sl-te-header-top">
            <button type="button" class="sl-settings-button sl-theme-back-btn" data-sl-theme-editor-back>
              ${renderIcon ? renderIcon('arrow_back', 'plain') : ''}
              <span>${html(t('theme_editor_back_btn', 'Back'))}</span>
            </button>
            <button type="button" class="sl-settings-button primary sl-te-save-btn" data-sl-te-save>
              ${renderIcon ? renderIcon('check', 'plain') : ''}
              <span>${html(t('te_save_btn'))}</span>
            </button>
          </div>
          <div class="sl-te-header-bottom">
            <div class="sl-te-name-field">
              <label class="sl-te-name-label" for="sl-te-theme-name-input">${html(t('te_name_label'))}</label>
              <input id="sl-te-theme-name-input" type="text" class="sl-te-name-input" value="${html(draftThemeName)}" placeholder="${html(t('te_name_placeholder'))}" maxlength="64" data-sl-te-name>
            </div>
            <div class="sl-te-name-row-actions">
              <span class="sl-te-live-badge">${html(t('te_live_preview_badge'))}</span>
              <button type="button" class="sl-settings-button" data-sl-te-random title="${html(t('te_random_btn', 'Randomize'))}">
                <span>🎲 ${html(t('te_random_btn', 'Ngẫu nhiên'))}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Real-Time Interactive Visual Preview Stage -->
        ${renderVisualPreviewStage(renderIcon)}

        <!-- 4-Tab Navigation Bar -->
        <nav class="sl-te-subnav" role="tablist" aria-label="Custom Theme Tabs">
          <button type="button" role="tab" class="sl-te-subnav-btn ${activeSubTab === 'roleplay' ? 'is-active' : ''}" data-sl-te-subtab="roleplay">
            ${renderIcon ? renderIcon('person', 'plain') : ''}
            <span>${html(t('te_tab_roleplay'))}</span>
          </button>
          <button type="button" role="tab" class="sl-te-subnav-btn ${activeSubTab === 'main' ? 'is-active' : ''}" data-sl-te-subtab="main">
            ${renderIcon ? renderIcon('palette', 'plain') : ''}
            <span>${html(t('te_tab_main'))}</span>
          </button>
          <button type="button" role="tab" class="sl-te-subnav-btn ${activeSubTab === 'style' ? 'is-active' : ''}" data-sl-te-subtab="style">
            ${renderIcon ? renderIcon('tune', 'plain') : ''}
            <span>${html(t('te_tab_style'))}</span>
          </button>
          <button type="button" role="tab" class="sl-te-subnav-btn ${activeSubTab === 'typography' ? 'is-active' : ''}" data-sl-te-subtab="typography">
            ${renderIcon ? renderIcon('notes', 'plain') : ''}
            <span>${html(t('te_tab_typography'))}</span>
          </button>
        </nav>

        <!-- 4 Tab Panes -->
        ${renderRoleplayTab()}
        ${renderMainInterfaceTab()}
        ${renderStyleTab(renderIcon)}
        ${renderTypographyTab()}
      </div>
    `;
  }

  function setDeepValue(obj, path, val) {
    const parts = path.split('.');
    if (parts.length !== 2) return;
    const [sec, key] = parts;
    if (!obj[sec]) obj[sec] = {};
    obj[sec][key] = val;
    // Normalize aliases immediately so both naming conventions stay in sync
    const normalized = window.StudioLab?.themePresets?.normalizeThemeConfig?.(obj);
    if (normalized) {
      obj.roleplay = normalized.roleplay;
      obj.mainInterface = normalized.mainInterface;
      obj.style = normalized.style;
      obj.typography = normalized.typography;
    }
  }

  function triggerLivePreview(root) {
    if (!draftConfig) return;
    window.StudioLab?.themeEngine?.previewDraftConfig?.(draftConfig);
    if (root) updateVisualStage(root);
  }

  function refreshAllBoundControls(root) {
    if (!root || !draftConfig) return;
    const cfg = window.StudioLab.themePresets.normalizeThemeConfig(draftConfig);
    draftConfig = cfg;

    root.querySelectorAll('[data-sl-te-bind]').forEach(control => {
      const path = control.getAttribute('data-sl-te-bind');
      if (!path) return;
      const [sec, key] = path.split('.');
      const val = cfg[sec]?.[key];
      if (val === undefined) return;
      if (control.type === 'checkbox') {
        control.checked = Boolean(val);
        const acc = root.querySelector(`[data-sl-te-accordion="${path}"]`);
        if (acc) acc.hidden = !control.checked;
      } else if (control.type === 'range') {
        control.value = String(val);
        const unit = control.getAttribute('data-sl-te-unit') || '';
        const badge = root.querySelector(`[data-sl-te-val="${path}"]`);
        if (badge) badge.textContent = `${val}${unit}`;
      } else if (control.type === 'color') {
        control.value = String(val);
        const hex = root.querySelector(`[data-sl-te-hex="${path}"]`);
        if (hex) hex.textContent = String(val);
      } else {
        control.value = String(val);
      }
    });

    root.querySelectorAll('[data-sl-te-preset]').forEach(b => {
      b.classList.toggle('is-selected', b.getAttribute('data-sl-te-preset') === cfg.mainInterface.presetKey);
    });

    root.querySelectorAll('[data-sl-te-style-preset]').forEach(b => {
      b.classList.toggle('is-selected', b.getAttribute('data-sl-te-style-preset') === (cfg.style?.stylePreset || 'default'));
    });

    root.querySelectorAll('[data-sl-te-avatar-preview]').forEach(p => {
      const role = p.getAttribute('data-sl-te-avatar-preview');
      p.style.borderRadius = `${cfg.roleplay.avatarRadius}%`;
      const url = role === 'model' ? cfg.roleplay.modelAvatarUrl : cfg.roleplay.userAvatarUrl;
      if (url) {
        p.innerHTML = `<img src="${html(url)}" alt="${role}">`;
      } else {
        const nameVal = role === 'model' ? cfg.roleplay.modelName : cfg.roleplay.userName;
        p.textContent = (nameVal || role).trim().charAt(0).toUpperCase();
      }
    });
  }

  function randomizeDraftTheme(root, announce) {
    const presets = window.StudioLab?.themePresets;
    if (!presets || !draftConfig) return;
    const keys = Object.keys(presets.PRESET_PALETTES || {});
    if (!keys.length) return;
    const randomKey = keys[Math.floor(Math.random() * keys.length)];
    const palette = presets.PRESET_PALETTES[randomKey];

    draftConfig = presets.applyPresetToConfig(draftConfig, randomKey);

    const rpPairs = [
      ['Celeste AI', 'Voyager'],
      ['Aethelgard', 'Kaelen'],
      ['Seraphina', 'Baka'],
      ['Nova Core', 'Architect'],
      ['Lumiere', 'Wanderer']
    ];
    const [mName, uName] = rpPairs[Math.floor(Math.random() * rpPairs.length)];

    draftConfig.roleplay.enableAvatarCustom = true;
    draftConfig.roleplay.showModelAvatar = true;
    draftConfig.roleplay.showUserAvatar = true;
    draftConfig.roleplay.avatarSize = [34, 38, 42, 46][Math.floor(Math.random() * 4)];
    draftConfig.roleplay.avatarRadius = [24, 36, 50][Math.floor(Math.random() * 3)];
    draftConfig.roleplay.enableNameCustom = true;
    draftConfig.roleplay.modelName = mName;
    draftConfig.roleplay.userName = uName;
    draftConfig.roleplay.nameSize = [14, 15, 16][Math.floor(Math.random() * 3)];

    draftConfig.mainInterface.enableChatBubbles = true;
    draftConfig.mainInterface.userBubbleEnabled = true;
    draftConfig.mainInterface.modelBubbleEnabled = true;
    draftConfig.mainInterface.bubbleTransparencyEnabled = true;
    draftConfig.mainInterface.userBubbleTransparent = true;
    draftConfig.mainInterface.modelBubbleTransparent = true;
    draftConfig.mainInterface.bubbleBlur = [10, 14, 18][Math.floor(Math.random() * 3)];
    draftConfig.mainInterface.bubbleOpacity = [75, 80, 85][Math.floor(Math.random() * 3)];

    const fontList = presets.FONT_CATALOG || [];
    if (fontList.length > 1) {
      const randomFont = fontList[Math.floor(Math.random() * fontList.length)];
      draftConfig.typography.fontFamily = randomFont.value;
    }
    draftConfig.typography.chatFontSize = [15, 16, 17][Math.floor(Math.random() * 3)];
    draftConfig.typography.quoteHighlightEnabled = true;

    draftConfig = presets.normalizeThemeConfig(draftConfig);
    draftThemeName = `${palette.label} · ${mName}`;
    const nameInput = root?.querySelector('[data-sl-te-name]');
    if (nameInput) nameInput.value = draftThemeName;

    isDirty = true;
    refreshAllBoundControls(root);
    triggerLivePreview(root);

    if (typeof announce === 'function') {
      announce(t('te_random_toast', 'Randomized theme and applied live preview!'));
    }
  }

  function bindEditorEvents(root, { onSave, onBack, announce }) {
    if (!root || !draftConfig) return;

    // Trigger live preview & visual stage immediately on mount
    triggerLivePreview(root);

    // Stage collapse/expand toggle
    const stageToggleBtn = root.querySelector('[data-sl-te-stage-toggle]');
    if (stageToggleBtn) {
      stageToggleBtn.addEventListener('click', () => {
        isStageExpanded = !isStageExpanded;
        const stage = root.querySelector('[data-sl-te-stage]');
        if (stage) stage.hidden = !isStageExpanded;
      });
    }

    // Randomize button
    const randomBtn = root.querySelector('[data-sl-te-random]');
    if (randomBtn) {
      randomBtn.addEventListener('click', () => {
        randomizeDraftTheme(root, announce);
      });
    }

    // Name input
    const nameInput = root.querySelector('[data-sl-te-name]');
    if (nameInput) {
      nameInput.addEventListener('input', () => {
        draftThemeName = nameInput.value;
        isDirty = true;
      });
    }

    // Back button (explicit cancel/back)
    root.querySelectorAll('[data-sl-theme-editor-back]').forEach(btn => {
      btn.addEventListener('click', () => {
        resetDraftSession();
        if (typeof onBack === 'function') onBack();
      });
    });

    // Save button
    const saveBtn = root.querySelector('[data-sl-te-save]');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const finalName = String(draftThemeName || '').trim() || 'Custom Theme';
        const finalConfig = window.StudioLab.themePresets.normalizeThemeConfig(draftConfig);
        resetDraftSession();
        if (typeof onSave === 'function') {
          onSave({ name: finalName, config: finalConfig });
        }
        if (typeof announce === 'function') {
          announce(t('te_saved_toast'));
        }
      });
    }

    // Sub-tab switching
    root.querySelectorAll('[data-sl-te-subtab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-sl-te-subtab');
        if (!targetTab) return;
        activeSubTab = targetTab;
        root.querySelectorAll('[data-sl-te-subtab]').forEach(b => {
          b.classList.toggle('is-active', b.getAttribute('data-sl-te-subtab') === activeSubTab);
        });
        root.querySelectorAll('[data-sl-te-pane]').forEach(pane => {
          pane.hidden = pane.getAttribute('data-sl-te-pane') !== activeSubTab;
        });
        btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      });
    });

    // Generic bound controls ([data-sl-te-bind])
    root.querySelectorAll('[data-sl-te-bind]').forEach(control => {
      const path = control.getAttribute('data-sl-te-bind');
      if (!path) return;
      const isCheckbox = control.type === 'checkbox';
      const isRange = control.type === 'range';
      const isColor = control.type === 'color';
      const eventName = (isRange || isColor || control.type === 'text') ? 'input' : 'change';

      control.addEventListener(eventName, () => {
        const val = isCheckbox
          ? control.checked
          : isRange
            ? Number(control.value)
            : control.value;
        isDirty = true;
        setDeepValue(draftConfig, path, val);

        // Accordion toggle if applicable
        if (isCheckbox) {
          const acc = root.querySelector(`[data-sl-te-accordion="${path}"]`);
          if (acc) acc.hidden = !control.checked;
        }

        // Range readout update
        if (isRange) {
          const unit = control.getAttribute('data-sl-te-unit') || '';
          const badge = root.querySelector(`[data-sl-te-val="${path}"]`);
          if (badge) badge.textContent = `${val}${unit}`;
          if (path === 'roleplay.avatarRadius') {
            root.querySelectorAll('[data-sl-te-avatar-preview]').forEach(p => {
              p.style.borderRadius = `${val}%`;
            });
          }
          if (path === 'mainInterface.uiTint' && window.StudioLab?.themePresets?.applyUiTintToConfig) {
            window.StudioLab.themePresets.applyUiTintToConfig(draftConfig, val);
            refreshAllBoundControls(root);
          }
        }

        // Color hex readout update
        if (isColor) {
          const hexEl = root.querySelector(`[data-sl-te-hex="${path}"]`);
          if (hexEl) hexEl.textContent = val;
        }

        triggerLivePreview(root);
      });
    });

    // 25 Preset Palette buttons
    root.querySelectorAll('[data-sl-te-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const presetKey = btn.getAttribute('data-sl-te-preset');
        if (!presetKey) return;
        isDirty = true;
        draftConfig = window.StudioLab.themePresets.applyPresetToConfig(draftConfig, presetKey);
        refreshAllBoundControls(root);
        triggerLivePreview(root);
      });
    });

    // Style Preset cards (Built-in + Custom .stylelab) via delegated click on style grid
    const styleGridEl = root.querySelector('[data-sl-te-style-grid]');
    const refreshCustomStyleGrid = () => {
      if (!styleGridEl) return;
      styleGridEl.querySelectorAll('.sl-te-style-card--custom').forEach(el => el.remove());
      const customList = window.StudioLab?.themePresets?.getCustomStyles?.() || [];
      const curStyle = draftConfig?.style?.stylePreset || 'default';
      if (customList.length) {
        styleGridEl.insertAdjacentHTML(
          'beforeend',
          customList.map(item => renderCustomStyleCardHtml(item, curStyle)).join('')
        );
      }
      refreshAllBoundControls(root);
    };

    if (styleGridEl) {
      styleGridEl.addEventListener('click', (e) => {
        const exportBtn = e.target.closest('[data-sl-te-stylelab-export]');
        if (exportBtn) {
          e.stopPropagation();
          const styleId = exportBtn.getAttribute('data-sl-te-stylelab-export');
          const styleObj = window.StudioLab?.themePresets?.getCustomStyleById?.(styleId);
          if (styleObj) {
            const content = window.StudioLab.themePresets.serializeStyleLab(styleObj);
            const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const safeSlug = String(styleObj.name || styleObj.id || 'custom-style')
              .toLowerCase()
              .replace(/[^a-z0-9-_]+/g, '-')
              .replace(/^-+|-+$/g, '') || 'custom-style';
            a.href = url;
            a.download = `${safeSlug}.stylelab`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            if (typeof announce === 'function') {
              announce(t('te_stylelab_exported_toast', 'Exported {name}.stylelab successfully!').replace('{name}', safeSlug));
            }
          }
          return;
        }

        const deleteBtn = e.target.closest('[data-sl-te-stylelab-delete]');
        if (deleteBtn) {
          e.stopPropagation();
          const styleId = deleteBtn.getAttribute('data-sl-te-stylelab-delete');
          if (!styleId) return;
          window.StudioLab?.themePresets?.deleteCustomStyle?.(styleId);
          if (draftConfig?.style?.stylePreset === styleId) {
            setDeepValue(draftConfig, 'style.stylePreset', 'default');
          }
          isDirty = true;
          refreshCustomStyleGrid();
          triggerLivePreview(root);
          if (typeof announce === 'function') announce(t('te_stylelab_deleted_toast', 'Removed custom style from list.'));
          return;
        }

        const card = e.target.closest('[data-sl-te-style-preset]');
        if (!card) return;
        const styleId = card.getAttribute('data-sl-te-style-preset');
        if (!styleId) return;
        isDirty = true;
        setDeepValue(draftConfig, 'style.stylePreset', styleId);
        refreshAllBoundControls(root);
        triggerLivePreview(root);
      });
    }

    // StyleLab Modals: "Tuỳ chỉnh phong cách" & "Nhập phong cách (.stylelab)"
    const promptModal = root.querySelector('[data-sl-te-stylelab-prompt-modal]');
    const importModal = root.querySelector('[data-sl-te-stylelab-import-modal]');
    const openPromptBtn = root.querySelector('[data-sl-te-open-stylelab-prompt]');
    const openImportBtn = root.querySelector('[data-sl-te-open-stylelab-import]');
    const templateBox = root.querySelector('[data-sl-te-stylelab-template-box]');
    const userReqInput = root.querySelector('[data-sl-te-stylelab-user-request]');
    const copyPromptBtn = root.querySelector('[data-sl-te-stylelab-copy-btn]');
    const fileInputLab = root.querySelector('[data-sl-te-stylelab-file-input]');
    const pasteBoxLab = root.querySelector('[data-sl-te-stylelab-paste-box]');
    const statusLab = root.querySelector('[data-sl-te-stylelab-status]');
    const confirmImportBtn = root.querySelector('[data-sl-te-stylelab-import-confirm]');

    const updatePromptTemplateBox = () => {
      if (!templateBox) return;
      const reqText = userReqInput ? userReqInput.value : '';
      templateBox.value = window.StudioLab?.themePresets?.buildStyleLabAIPromptTemplate?.(reqText) || '';
    };

    if (userReqInput) {
      userReqInput.addEventListener('input', updatePromptTemplateBox);
    }

    if (openPromptBtn && promptModal) {
      openPromptBtn.addEventListener('click', () => {
        if (importModal) importModal.hidden = true;
        updatePromptTemplateBox();
        promptModal.hidden = !promptModal.hidden;
      });
    }

    root.querySelectorAll('[data-sl-te-close-stylelab-prompt]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (promptModal) promptModal.hidden = true;
      });
    });

    if (copyPromptBtn) {
      copyPromptBtn.addEventListener('click', async () => {
        updatePromptTemplateBox();
        const fullText = templateBox ? templateBox.value : '';
        try {
          await navigator.clipboard.writeText(fullText);
          const origHtml = copyPromptBtn.innerHTML;
          copyPromptBtn.innerHTML = `<span>${html(t('te_stylelab_copied_status', '✅ Copied full blueprint & request!'))}</span>`;
          setTimeout(() => {
            copyPromptBtn.innerHTML = origHtml;
          }, 2200);
          if (typeof announce === 'function') {
            announce(t('te_stylelab_copied_toast', 'Copied Customize Style (.stylelab) AI blueprint!'));
          }
        } catch (_) {
          if (templateBox) {
            templateBox.focus();
            templateBox.select();
            document.execCommand('copy');
          }
        }
      });
    }

    const showImportStatus = (msg, isError) => {
      if (!statusLab) return;
      statusLab.hidden = !msg;
      statusLab.textContent = msg || '';
      statusLab.classList.toggle('is-error', Boolean(isError));
      statusLab.classList.toggle('is-success', !isError && Boolean(msg));
    };

    if (openImportBtn && importModal) {
      openImportBtn.addEventListener('click', () => {
        if (promptModal) promptModal.hidden = true;
        showImportStatus('', false);
        importModal.hidden = !importModal.hidden;
      });
    }

    root.querySelectorAll('[data-sl-te-close-stylelab-import]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (importModal) importModal.hidden = true;
      });
    });

    const handleImportStyleLabText = (rawText) => {
      try {
        const parsed = window.StudioLab.themePresets.parseStyleLab(rawText);
        const saved = window.StudioLab.themePresets.saveCustomStyle(parsed);
        isDirty = true;
        setDeepValue(draftConfig, 'style.stylePreset', saved.id);
        refreshCustomStyleGrid();
        triggerLivePreview(root);
        showImportStatus(t('te_stylelab_imported_status', '✅ Imported and permanently saved style "{name}"!').replace('{name}', saved.name), false);
        if (pasteBoxLab) pasteBoxLab.value = '';
        setTimeout(() => {
          if (importModal) importModal.hidden = true;
        }, 700);
        if (typeof announce === 'function') {
          announce(t('te_stylelab_imported_toast', 'Saved style "{name}" to your list and applied immediately!').replace('{name}', saved.name));
        }
      } catch (err) {
        showImportStatus(err?.message || t('te_stylelab_err_invalid_json', 'Invalid .stylelab JSON format.'), true);
      }
    };

    if (fileInputLab) {
      fileInputLab.addEventListener('change', async () => {
        const file = fileInputLab.files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          if (pasteBoxLab) pasteBoxLab.value = text;
          handleImportStyleLabText(text);
        } catch (_) {
          showImportStatus(t('te_stylelab_err_invalid_json', 'Invalid .stylelab JSON format.'), true);
        }
        fileInputLab.value = '';
      });
    }

    if (confirmImportBtn) {
      confirmImportBtn.addEventListener('click', () => {
        const raw = pasteBoxLab ? pasteBoxLab.value.trim() : '';
        if (!raw) {
          showImportStatus(t('te_stylelab_err_empty', '.stylelab content is empty. Please paste the code or upload a .stylelab file.'), true);
          return;
        }
        handleImportStyleLabText(raw);
      });
    }

    // Roleplay Avatar upload / URL / clear
    ['model', 'user'].forEach(role => {
      const fileInput = root.querySelector(`[data-sl-te-avatar-file="${role}"]`);
      const urlInput = root.querySelector(`[data-sl-te-avatar-url="${role}"]`);
      const clearBtn = root.querySelector(`[data-sl-te-avatar-clear="${role}"]`);
      const previewEl = root.querySelector(`[data-sl-te-avatar-preview="${role}"]`);
      const key = role === 'model' ? 'modelAvatarUrl' : 'userAvatarUrl';

      const updateAvatarPreview = (url) => {
        isDirty = true;
        setDeepValue(draftConfig, `roleplay.${key}`, url);
        if (previewEl) {
          if (url) {
            previewEl.innerHTML = `<img src="${html(url)}" alt="${role}">`;
          } else {
            const nameVal = role === 'model' ? draftConfig.roleplay.modelName : draftConfig.roleplay.userName;
            previewEl.textContent = (nameVal || role).trim().charAt(0).toUpperCase();
          }
        }
        triggerLivePreview(root);
      };

      if (fileInput) {
        fileInput.addEventListener('change', async () => {
          const file = fileInput.files?.[0];
          if (!file) return;
          try {
            const dataUrl = await compressImageFile(file, 256, 256, 0.86);
            if (urlInput) urlInput.value = '';
            updateAvatarPreview(dataUrl);
          } catch (_) {}
          fileInput.value = '';
        });
      }

      if (urlInput) {
        urlInput.addEventListener('input', () => {
          updateAvatarPreview(urlInput.value.trim());
        });
      }

      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          if (urlInput) urlInput.value = '';
          updateAvatarPreview('');
        });
      }
    });

    // Webpage Background Image upload / clear
    const bgFileInput = root.querySelector('[data-sl-te-bg-file]');
    const bgClearBtn = root.querySelector('[data-sl-te-bg-clear]');
    const bgThumb = root.querySelector('[data-sl-te-bg-thumb]');

    const updateBgThumb = (url) => {
      isDirty = true;
      setDeepValue(draftConfig, 'mainInterface.pageBg', url);
      if (bgThumb) {
        if (url) {
          bgThumb.style.backgroundImage = `url("${url.replace(/"/g, '\\"')}")`;
          bgThumb.textContent = '';
        } else {
          bgThumb.style.backgroundImage = 'none';
          bgThumb.textContent = t('te_main_bg_no_image', 'No Image');
        }
      }
      triggerLivePreview(root);
    };

    if (bgFileInput) {
      bgFileInput.addEventListener('change', async () => {
        const file = bgFileInput.files?.[0];
        if (!file) return;
        try {
          const dataUrl = await compressImageFile(file, 1920, 1080, 0.82);
          updateBgThumb(dataUrl);
        } catch (_) {}
        bgFileInput.value = '';
      });
    }

    if (bgClearBtn) {
      bgClearBtn.addEventListener('click', () => {
        updateBgThumb('');
      });
    }

    // Reset Typography button
    const resetTypoBtn = root.querySelector('[data-sl-te-reset-typo]');
    if (resetTypoBtn) {
      resetTypoBtn.addEventListener('click', () => {
        isDirty = true;
        const presetKey = draftConfig?.mainInterface?.presetKey || 'purple';
        const fresh = window.StudioLab.themePresets.createDefaultThemeConfig(presetKey);
        draftConfig.typography = fresh.typography;
        refreshAllBoundControls(root);
        triggerLivePreview(root);
        if (typeof announce === 'function') {
          announce(t('te_typo_reset_toast'));
        }
      });
    }
  }

  function getDraft() {
    if (!draftConfig) return null;
    return {
      name: String(draftThemeName || '').trim() || 'Custom Theme',
      config: window.StudioLab.themePresets.normalizeThemeConfig(draftConfig),
      isDirty
    };
  }

  window.StudioLab.themeEditorUI = {
    renderEditorWorkspace,
    bindEditorEvents,
    resetDraftSession,
    getDraft
  };
})();
