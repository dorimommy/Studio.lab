(function () {
  'use strict';

  const core = window.StudioLabCore;
  const presets = window.StudioLab?.themePresets;
  if (!core || !presets) return;
  const isolatedPreview = (window.location?.protocol === 'chrome-extension:' || window.location?.origin === 'http://127.0.0.1:8766') &&
    /\/account\/theme-preview\.html$/.test(window.location.pathname || '') &&
    document.body?.getAttribute('data-sl-theme-preview') === 'true';
  if (window.location?.protocol === 'chrome-extension:' && !isolatedPreview) return;
  const lifetime = core.scope();
  const STYLE_ID = 'sl-custom-theme-engine-styles';
  const MARKER = 'data-sl-editor-theme';
  let activeConfig = null;
  let activeMode = null;
  let lastState = null;
  let sheet = null;
  let styleElement = null;
  let chatScope = null;
  let anchorScope = null;
  let ambientScope = null;
  let ambientPaused = false;
  let activeShapeOverride = null;
  let chatRoot = null;
  let headerRecords = new WeakMap();
  let discovery = null;
  let bodyDiscovery = null;
  let generation = 0;

  function rgba(hex, opacity) {
    const value = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#000000';
    const channels = [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16));
    return `rgba(${channels.join(',')},${Math.max(0, Math.min(1, opacity))})`;
  }
  function isLight(hex) {
    const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
    return (channels[0] * .299 + channels[1] * .587 + channels[2] * .114) / 255 > .6;
  }
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const hexToRgba = (hex, alpha = 1) => rgba(hex, alpha);
  const isLightHex = hex => isLight(hex);
  function blendHex(first, second, weight = .5) {
    const left = /^#[0-9a-f]{6}$/i.test(first) ? first : '#000000';
    const right = /^#[0-9a-f]{6}$/i.test(second) ? second : '#000000';
    const amount = clamp(Number(weight) || 0, 0, 1);
    return '#' + [1, 3, 5].map(index => Math.round(parseInt(left.slice(index, index + 2), 16) * (1 - amount) +
      parseInt(right.slice(index, index + 2), 16) * amount).toString(16).padStart(2, '0')).join('');
  }
  function accentInk(hex) {
    const value = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
      .map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
      .reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
    return (value + .05) / .05 >= 1.05 / (value + .05) ? '#000000' : '#ffffff';
  }
  function styleShape(config) {
    const name = config.style.stylePreset;
    const custom = presets.getCustomStyleById(name);
    if (custom) return custom;
    if (name === 'cartoon-pixel') return { bubbleRadius: 0, buttonRadius: 0, borderWidth: 2 };
    if (name === 'winter-frost') return { bubbleRadius: 18, buttonRadius: 12, borderWidth: 1 };
    return { bubbleRadius: 24, buttonRadius: 12, borderWidth: 0 };
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

    const bw = 3;
    const sh = 5;
    const smBw = 2;
    const smSh = 3;
    const shadowTone = isLight ? blendHex(mi.uiBorder, mi.uiAccent, 0.35) : mi.uiBorder;
    const cardInnerBg = hexToRgba(mi.uiBase, uiTrans ? clamp(uiAlpha * 0.78, 0.22, 0.9) : 0.72);

    return `

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


      ${scope} .sl-rp-avatar {
        border-radius: 0 !important;
        border: ${bw}px solid ${mi.uiAccent} !important;
        box-shadow:
          inset 0 0 0 2px ${mi.uiBase},
          ${smSh}px ${smSh}px 0 0 ${shadowTone} !important;
        image-rendering: pixelated !important;
      }


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


      ${scope} ms-prompt-box .prompt-box-container {
        border-radius: 0 !important;
        border: ${bw}px solid ${mi.uiAccent} !important;
        box-shadow:
          inset 0 0 0 ${bw}px ${mi.uiBase},
          ${sh}px ${sh}px 0 0 ${shadowTone} !important;
        margin-bottom: ${sh}px !important;
      }


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


      ${scope} #sl-scroll-bottom-btn.sl-scroll-bottom-btn {
        border-radius: 0 !important;
        border: ${smBw}px solid ${mi.uiAccent} !important;
        box-shadow:
          inset 0 0 0 1.5px ${mi.uiBase},
          ${smSh}px ${smSh}px 0 0 ${shadowTone} !important;
      }


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

      ${scope} {
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


  function interFontRule() {
    try {
      const runtime = window.chrome?.runtime;
      const source = runtime?.getURL ? runtime.getURL('account/fonts/inter-latin.woff2')
        : isolatedPreview && window.location.origin === 'http://127.0.0.1:8766'
          ? new URL('fonts/inter-latin.woff2', window.location.href).href : '';
      if (!source) return '';
      const url = new URL(source);
      if (!(url.protocol === 'chrome-extension:' && url.hostname === runtime?.id) &&
          !(isolatedPreview && url.origin === 'http://127.0.0.1:8766')) return '';
      return `@font-face{font-family:'StudioLab Inter';font-style:normal;font-weight:100 900;font-display:swap;src:url(${JSON.stringify(url.href)}) format('woff2');}`;
    } catch (_) { return ''; }
  }
  function buildThemeStylesheet(raw, shapeOverride, options = {}) {
    const cfg = presets.normalizeThemeConfig(raw);
    const m = cfg.mainInterface, t = cfg.typography, shape = shapeOverride || styleShape(cfg);
    const mode = isLight(m.uiBase) ? 'light' : 'dark';
    const scope = ':root:has(#sl-modern-web-chat-styles:not([disabled])) body[data-sl-editor-theme="true"]';
    const exclude = ':not(.sl-settings-shell,.sl-settings-shell *,.sl-native-settings-select-panel,.sl-native-settings-select-panel *)';
    const host = ':is(ms-navbar-v,ms-navbar-v2,ms-prompt-box,ms-right-side-panel,ms-run-settings,ms-prompt-run-settings,ms-chat-session,ms-autoscroll-container,.sl-custom-dropdown,.sl-custom-submenu,.sl-toc-popover,.mat-mdc-menu-panel,.mat-mdc-select-panel)';
    const uiAlpha = m.transparentUiEnabled ? m.uiOpacity / 100 : m.pageBg ? .88 : 1;
    const bubbleAlpha = m.bubbleTransparencyEnabled ? m.bubbleOpacity / 100 : 1;
    const font = presets.FONT_CATALOG.find(item => item.value === t.fontFamily)?.css || 'inherit';
    const variables = {
      '--sl-mwc-surface': rgba(m.uiBase, uiAlpha), '--sl-mwc-raised': rgba(m.uiSurface, uiAlpha),
      '--sl-mwc-hover': m.uiSurface, '--sl-mwc-border': m.uiBorder, '--sl-mwc-text': m.uiText,
      '--sl-mwc-muted': m.uiText, '--sl-mwc-accent': m.uiAccent, '--color-v3-primary': m.uiAccent,
      '--color-v3-surface': rgba(m.uiBase, uiAlpha), '--color-v3-surface-container-high': rgba(m.uiSurface, uiAlpha),
      '--color-v3-surface-container-highest': m.uiSurface, '--color-v3-text': m.uiText,
      '--color-v3-text-var': m.uiText, '--color-v3-text-subtle': m.uiText, '--color-v3-text-link': m.uiAccent
    };
    const declarations = Object.entries(variables).map(([name, value]) => `${name}:${value} !important;`).join('');
    const userBg = m.enableChatBubbles && m.userBubbleEnabled ? rgba(m.userBubbleColor, m.userBubbleTransparent ? bubbleAlpha : 1) : 'transparent';
    const modelBg = m.enableChatBubbles && m.modelBubbleEnabled ? rgba(m.modelBubbleColor, m.modelBubbleTransparent ? bubbleAlpha : 1) : 'transparent';
    const uiFilter = m.transparentUiEnabled ? `backdrop-filter:blur(${m.uiBlur}px);` : '';
    const userFilter = m.bubbleTransparencyEnabled && m.userBubbleTransparent ? `backdrop-filter:blur(${m.bubbleBlur}px);` : '';
    const modelFilter = m.bubbleTransparencyEnabled && m.modelBubbleTransparent ? `backdrop-filter:blur(${m.bubbleBlur}px);` : '';
    const userColor = t.customTextColorEnabled ? t.userTextColor : m.uiText;
    const modelColor = t.customTextColorEnabled ? t.modelTextColor : m.uiText;
    const chosen = presets.getCustomStyleById(cfg.style.stylePreset);
    const styleBase = shapeOverride?.base || chosen?.base ||
      (['winter-frost', 'custom-starlit-snowglass', 'custom-imperial-jade-scroll-novel'].includes(cfg.style.stylePreset)
        ? 'winter-frost' : cfg.style.stylePreset);
    const skinScope = `${scope} ms-app:not(:has(.sl-settings-shell))`;
    const skinScopes = [skinScope, `${scope} .cdk-overlay-container:not(:has(.sl-settings-shell))`];
    const skinOptions = { mi: m, isLight: mode === 'light', mutedColor: blendHex(m.uiText, m.uiBase, .38),
      accentTextColor: accentInk(m.uiAccent), uiSurfaceBg: rgba(m.uiSurface, uiAlpha),
      uiBackdropCSS: uiFilter, uiTrans: m.transparentUiEnabled, uiAlpha, userBubbleFinalBg: userBg, modelBubbleFinalBg: modelBg };
    const skin = skinScopes.map(target => styleBase === 'cartoon-pixel' ? buildCartoonPixelStyleCSS(target, exclude, skinOptions)
      : styleBase === 'winter-frost' ? buildWinterFrostStyleCSS(target, exclude, skinOptions) : '').join('\n');
    const customShape = chosen || shapeOverride?.custom;
    const customGeometry = customShape ? `${skinScope} .chat-turn-container.user ms-prompt-chunk:not(:has(ms-file-chunk,ms-image-chunk,ms-video-chunk,textarea)),
      ${skinScope} .chat-turn-container.model .turn-content{border-radius:${shape.bubbleRadius}px !important;border-width:${shape.borderWidth}px !important;}
      ${skinScope} :is(.sl-header-btn,.sl-custom-dropdown,.sl-custom-submenu){border-radius:${shape.buttonRadius}px !important;}` : '';
    const wallpaper = options.validatedImages && m.pageBg ? `
      ${scope} ms-app { position:relative;isolation:isolate; }
      ${scope} ms-app::before { content:'';position:fixed;inset:-24px;z-index:-1;pointer-events:none;
        background:linear-gradient(rgba(0,0,0,${m.bgDim / 100}),rgba(0,0,0,${m.bgDim / 100})),url(${JSON.stringify(m.pageBg)}) center / cover no-repeat;
        filter:blur(${m.bgBlur}px); }
      ${scope} :is(.banner-and-app-container,.makersuite-layout,.chunk-editor-main,.chat-container,.chat-view-container)${exclude}{background-color:transparent !important;}` : '';
    const ambient = styleBase === 'winter-frost' && cfg.style.ambientEffectEnabled ? `
      @keyframes sl-theme-snowfall { from { background-position: 0 -80px, 32px -120px; } to { background-position: 28px 260px, -12px 380px; } }
      ${skinScope}::after { content:'';position:fixed;inset:0;pointer-events:none;z-index:5;opacity:.45;
        background-image:radial-gradient(circle, ${m.uiText} 1px, transparent 2px),radial-gradient(circle, ${m.uiAccent} 1px, transparent 2px);
        background-size:120px 160px,190px 210px;animation:sl-theme-snowfall 18s linear infinite; }
      ${scope}[data-sl-snow-paused] ms-app::after { animation-play-state:paused; }
      ${scope} [data-sl-snow-control] { position:fixed;right:16px;bottom:16px;z-index:6;padding:8px 12px;border:1px solid ${m.uiAccent};border-radius:8px;background:${m.uiBase};color:${m.uiText};font:inherit;cursor:pointer; }
      ${scope} [data-sl-snow-control]:focus-visible { outline:2px solid ${m.uiAccent};outline-offset:2px; }
      @media (prefers-reduced-motion:reduce) { ${skinScope}::after { animation:none;display:none; } }` : '';
    const groups = `
      ${scope} ms-chat-turn[data-sl-bubble-pos="first"] .chat-turn-container.user ms-prompt-chunk,
      ${scope} ms-chat-turn[data-sl-bubble-pos="middle"] .chat-turn-container.user ms-prompt-chunk { border-bottom-right-radius:6px !important; }
      ${scope} ms-chat-turn[data-sl-bubble-pos="last"] .chat-turn-container.user ms-prompt-chunk,
      ${scope} ms-chat-turn[data-sl-bubble-pos="middle"] .chat-turn-container.user ms-prompt-chunk { border-top-right-radius:6px !important; }
      ${scope} ms-chat-turn[data-sl-bubble-pos="first"] .chat-turn-container.model .turn-content,
      ${scope} ms-chat-turn[data-sl-bubble-pos="middle"] .chat-turn-container.model .turn-content { border-bottom-left-radius:6px !important; }
      ${scope} ms-chat-turn[data-sl-bubble-pos="last"] .chat-turn-container.model .turn-content,
      ${scope} ms-chat-turn[data-sl-bubble-pos="middle"] .chat-turn-container.model .turn-content { border-top-left-radius:6px !important; }
      ${scope} ms-chat-turn:is([data-sl-bubble-pos="first"],[data-sl-bubble-pos="middle"]) .chat-turn-container { padding-bottom:1px !important; }
      ${scope} ms-chat-turn:is([data-sl-bubble-pos="last"],[data-sl-bubble-pos="middle"]) .chat-turn-container { padding-top:0 !important; }`;
    return `${t.fontFamily === "'Inter', sans-serif" ? interFontRule() : ''}
      ${scope} ${host}${exclude}{${declarations}color-scheme:${mode};}
      ${scope} :is(ms-chat-session,ms-autoscroll-container,ms-right-side-panel,ms-run-settings)${exclude}{background-color:var(--sl-mwc-surface);color:var(--sl-mwc-text);}
      ${scope} :is(ms-prompt-box .prompt-box-container,.sl-custom-dropdown,.sl-custom-submenu,.sl-toc-popover)${exclude}{background:var(--sl-mwc-raised);color:var(--sl-mwc-text);border-color:var(--sl-mwc-border);${uiFilter}}
      ${scope} .chat-turn-container.user ms-prompt-chunk:not(:has(ms-file-chunk,ms-image-chunk,ms-video-chunk,textarea))${exclude}{background:${userBg} !important;color:${userColor} !important;border-radius:${shape.bubbleRadius}px !important;border:${shape.borderWidth}px solid ${m.uiBorder} !important;font-size:${t.fontSize}px !important;${userFilter}}
      ${scope} .chat-turn-container.model .turn-content${exclude}{background:${modelBg} !important;color:${modelColor} !important;border-radius:${shape.bubbleRadius}px !important;${modelFilter}}
      ${scope} :is(.chat-turn-container .turn-content,.chat-turn-container .turn-content .v3-font-body,.chat-turn-container .turn-content p,.chat-turn-container .turn-content li,.chat-turn-container .turn-content blockquote,ms-prompt-box textarea)${exclude}:not(pre *,code,.material-symbols-outlined,mat-icon){font-family:${font} !important;font-size:${t.fontSize}px !important;}
      ${scope} .chat-turn-container.model .turn-content :is(.v3-font-body,p,li,blockquote)${exclude}{color:${modelColor} !important;}
      ${scope} .chat-turn-container.user .turn-content :is(.user-chunk,p,li,blockquote)${exclude}{color:${userColor} !important;}
      ${scope} :is(.sl-header-btn,.sl-custom-dropdown,.sl-custom-submenu)${exclude}{border-radius:${shape.buttonRadius}px;}
      ${cfg.roleplay.enableNameCustom ? `${scope} .chat-turn-container .author-label{display:none;}` : ''}
      ${scope} .sl-rp-turn-header{display:flex;align-items:center;gap:8px;color:${m.uiAccent};font-size:${cfg.roleplay.nameSize}px;}
      ${scope} .sl-rp-avatar{display:grid;place-items:center;overflow:hidden;width:${cfg.roleplay.avatarSize}px;height:${cfg.roleplay.avatarSize}px;border-radius:${cfg.roleplay.avatarRadius}%;background:${m.uiSurface};color:${m.uiText};flex:none;}
      ${scope} .sl-rp-avatar img{width:100%;height:100%;object-fit:cover;border-radius:inherit;}
      ::highlight(sl-model-quotes){color:${t.modelQuoteColor};font-weight:700;}
      ::highlight(sl-user-quotes){color:${t.userQuoteColor};font-weight:700;}
      ${skin}
      ${customGeometry}
      ${wallpaper}
      ${ambient}
      ${groups}
      @media (forced-colors:active){${scope} ${host}${exclude}{--sl-mwc-surface:Canvas !important;--sl-mwc-raised:Canvas !important;--sl-mwc-text:CanvasText !important;--sl-mwc-muted:CanvasText !important;--sl-mwc-accent:LinkText !important;--sl-mwc-border:ButtonText !important;}}`;
  }
  function removeStyle() {
    styleElement?.remove();
    styleElement = null;
    if (sheet && 'adoptedStyleSheets' in document) {
      document.adoptedStyleSheets = Array.from(document.adoptedStyleSheets).filter(item => item !== sheet);
    }
    sheet = null;
  }
  function installStyle(css) {
    if (typeof window.CSSStyleSheet === 'function' && 'adoptedStyleSheets' in document) {
      if (!sheet) sheet = new window.CSSStyleSheet();
      sheet.replaceSync(css);
      if (!document.adoptedStyleSheets.includes(sheet)) document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
      return;
    }
    if (isolatedPreview) throw new Error('Preview styles are unavailable.');
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(styleElement);
    }
    styleElement.textContent = css;
  }
  function clearHighlights() {
    window.CSS?.highlights?.delete('sl-model-quotes');
    window.CSS?.highlights?.delete('sl-user-quotes');
  }
  function clearHeaders() {
    document.querySelectorAll('[data-sl-roleplay-header]').forEach(node => node.remove());
    document.querySelectorAll('ms-chat-turn[data-sl-bubble-pos]').forEach(node => node.removeAttribute('data-sl-bubble-pos'));
    headerRecords = new WeakMap();
  }
  function processAllChatTurns() {
    if (!activeConfig) return;
    const roleplay = activeConfig.roleplay, typography = activeConfig.typography;
    const ranges = { user: [], model: [] };
    const groups = [];
    let group = null;
    document.querySelectorAll('ms-chat-turn').forEach(turn => {
      const container = turn.querySelector('.chat-turn-container');
      const role = container?.classList.contains('user') ? 'user' : container?.classList.contains('model') ? 'model' : null;
      if (!role || !container) return;
      if (!group || group.role !== role) { group = { role, turns: [], headerPlaced: false }; groups.push(group); }
      const thoughtOnly = role === 'model' && turn.querySelector('ms-thought-chunk') && !turn.querySelector('ms-text-chunk:not(ms-thought-chunk *)');
      if (!thoughtOnly) group.turns.push(turn);
      const showHeader = !thoughtOnly && !group.headerPlaced;
      if (showHeader) group.headerPlaced = true;
      const showAvatar = roleplay.enableAvatarCustom && (role === 'user' ? roleplay.showUserAvatar : roleplay.showModelAvatar);
      const name = role === 'user' ? roleplay.userName : roleplay.modelName;
      const source = role === 'user' ? roleplay.userAvatarUrl : roleplay.modelAvatarUrl;
      let header = container.querySelector(':scope > [data-sl-roleplay-header]');
      const signature = `${showAvatar}|${roleplay.enableNameCustom}|${name}`;
      const previous = headerRecords.get(turn);
      if (!showHeader || (!showAvatar && !roleplay.enableNameCustom)) { header?.remove(); headerRecords.delete(turn); }
      else if (!header || header.dataset.slSignature !== signature || previous?.source !== source) {
        header?.remove();
        header = document.createElement('div');
        header.dataset.slRoleplayHeader = '';
        header.dataset.slSignature = signature;
        header.className = 'sl-rp-turn-header';
        if (showAvatar) {
          const avatar = document.createElement('span');
          avatar.className = 'sl-rp-avatar';
          avatar.setAttribute('aria-hidden', 'true');
          if (source) {
            const image = document.createElement('img'); image.src = source; image.alt = ''; avatar.appendChild(image);
          } else avatar.textContent = name.charAt(0).toUpperCase();
          header.appendChild(avatar);
        }
        if (roleplay.enableNameCustom) {
          const label = document.createElement('span');
          label.textContent = name;
          header.appendChild(label);
        }
        container.prepend(header);
        headerRecords.set(turn, { source });
      }
      if (!typography.quoteHighlightEnabled || !window.CSS?.highlights || typeof window.Highlight !== 'function') return;
      const content = container.querySelector('.turn-content');
      if (!content) return;
      const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const matches = node.data.matchAll(/"[^"\n]{1,500}"/g);
        for (const match of matches) {
          if (ranges[role].length >= 512) break;
          const range = document.createRange();
          range.setStart(node, match.index); range.setEnd(node, match.index + match[0].length);
          ranges[role].push(range);
        }
      }
    });
    for (const item of groups) item.turns.forEach((turn, index) => {
      const position = item.turns.length === 1 ? 'single' : index === 0 ? 'first' : index === item.turns.length - 1 ? 'last' : 'middle';
      if (turn.getAttribute('data-sl-bubble-pos') !== position) turn.setAttribute('data-sl-bubble-pos', position);
    });
    if (window.CSS?.highlights && typeof window.Highlight === 'function') {
      window.CSS.highlights.set('sl-user-quotes', new window.Highlight(...ranges.user));
      window.CSS.highlights.set('sl-model-quotes', new window.Highlight(...ranges.model));
    }
  }
  function stopChat() {
    generation++;
    discovery?.abort(); discovery = null;
    chatScope?.dispose(); chatScope = null;
    anchorScope?.dispose(); anchorScope = null; chatRoot = null;
    clearHeaders(); clearHighlights();
  }
  function stopAmbient() {
    ambientScope?.dispose(); ambientScope = null;
    document.body?.removeAttribute('data-sl-snow-paused');
  }
  function syncAmbient(config, shapeOverride) {
    stopAmbient();
    const selected = presets.getCustomStyleById(config.style.stylePreset);
    const base = shapeOverride?.base || selected?.base || config.style.stylePreset;
    if (!config.style.ambientEffectEnabled || !['winter-frost', 'custom-starlit-snowglass', 'custom-imperial-jade-scroll-novel'].includes(base)) return;
    const app = document.querySelector('ms-app');
    if (!app) return;
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    ambientScope = core.scope();
    const control = document.createElement('button');
    control.type = 'button'; control.setAttribute('data-sl-snow-control', '');
    function update() {
      control.hidden = Boolean(media?.matches);
      control.textContent = ambientPaused ? 'Resume snow' : 'Pause snow';
      control.setAttribute('aria-pressed', String(ambientPaused));
      if (ambientPaused || document.hidden || media?.matches) document.body.setAttribute('data-sl-snow-paused', '');
      else document.body.removeAttribute('data-sl-snow-paused');
    }
    ambientScope.on(control, 'click', () => { ambientPaused = !ambientPaused; update(); });
    ambientScope.on(document, 'visibilitychange', update);
    if (media?.addEventListener) ambientScope.on(media, 'change', update);
    app.appendChild(control); ambientScope.add(() => control.remove()); update();
  }
  async function bindChat() {
    stopChat();
    if (!activeConfig) return;
    const current = generation;
    discovery = new AbortController();
    const anchor = await core.waitFor(() => document.querySelector('ms-app,app-root'),
      { timeout: 12000, interval: 150, signal: discovery.signal });
    if (!anchor || current !== generation || !activeConfig) return;
    if (!ambientScope) syncAmbient(activeConfig, activeShapeOverride);
    anchorScope = core.scope();
    function bindCurrentRoot() {
      if (chatRoot && anchor.contains(chatRoot)) return;
      chatScope?.dispose(); chatScope = null;
      chatRoot = anchor.querySelector('ms-chat-session,ms-autoscroll-container');
      clearHeaders(); clearHighlights();
      if (!chatRoot) return;
      chatScope = core.scope();
      const currentScope = chatScope;
      let cancelPending = null;
      const observer = new MutationObserver(records => {
        if (chatScope !== currentScope || !activeConfig) return;
        if (records.every(record => record.target.nodeType === 1 && record.target.closest?.('[data-sl-roleplay-header]'))) return;
        cancelPending?.();
        cancelPending = currentScope.timeout(processAllChatTurns, 100);
      });
      currentScope.observe(observer, chatRoot, { childList: true, subtree: true, characterData: true });
      processAllChatTurns();
    }
    const replacements = new MutationObserver(bindCurrentRoot);
    anchorScope.observe(replacements, anchor, { childList: true, subtree: true });
    bindCurrentRoot();
  }
  function clearCustomTheme() {
    activeConfig = null; activeMode = null;
    activeShapeOverride = null; ambientPaused = false;
    bodyDiscovery?.abort(); bodyDiscovery = null;
    stopChat(); stopAmbient(); removeStyle();
    document.body?.removeAttribute(MARKER);
    document.body?.removeAttribute('data-sl-theme-mode');
    window.dispatchEvent(new Event('sl-editor-theme-changed'));
    window.dispatchEvent(new Event('sl-theme-changed'));
  }
  async function applyConfig(raw, options = {}) {
    bodyDiscovery?.abort();
    bodyDiscovery = new AbortController();
    const current = ++generation;
    let cfg;
    try { cfg = await presets.sanitizeThemeImages(raw); }
    catch (error) {
      if (current === generation) clearCustomTheme();
      if (isolatedPreview) throw error;
      return false;
    }
    if (current !== generation) return false;
    activeConfig = cfg; activeMode = isLight(cfg.mainInterface.uiBase) ? 'light' : 'dark';
    activeShapeOverride = options.shape || null;
    if (!document.body || !document.head) {
      const ready = await core.waitFor(() => document.body && document.head,
        { timeout: 12000, interval: 100, signal: bodyDiscovery.signal });
      if (!ready || current !== generation || !activeConfig) return;
    }
    document.body.setAttribute(MARKER, 'true');
    document.body.setAttribute('data-sl-theme-mode', activeMode);
    try { installStyle(buildThemeStylesheet(cfg, options.shape, { validatedImages: true })); }
    catch (_) { clearCustomTheme(); return; }
    syncAmbient(cfg, options.shape);
    if (isolatedPreview) processAllChatTurns();
    else bindChat();
    window.dispatchEvent(new Event('sl-editor-theme-changed'));
    window.dispatchEvent(new Event('sl-theme-changed'));
    return true;
  }
  function syncFromState(state) {
    lastState = state;
    if (!state || state.modernWebChatEnabled === false || !state.activeThemeId || state.activeThemeId === 'original') {
      clearCustomTheme(); return { ok: true };
    }
    const theme = (Array.isArray(state.customThemes) ? state.customThemes : []).find(item => item?.id === state.activeThemeId);
    if (!theme?.config) { clearCustomTheme(); return { ok: false, error: 'The selected theme is unavailable.' }; }
    try {
      if (presets.hasUnsupportedThemeData(theme.config)) throw new Error('This theme contains an unsupported image URL or legacy CSS style. Export the original and choose supported replacements.');
      const clean = presets.validateThemeContrast(theme.config);
      applyConfig(clean);
      return { ok: true };
    } catch (error) {
      clearCustomTheme();
      return { ok: false, error: error.message };
    }
  }
  if (!isolatedPreview) {
    lifetime.on(window, '__sl_routeChanged', () => { if (activeConfig) bindChat(); });
    lifetime.on(window, 'sl-custom-styles-changed', () => { if (lastState) syncFromState(lastState); });
    lifetime.add(window.StudioLab.onExtensionInvalidated(() => { clearCustomTheme(); lifetime.dispose(); }));
  }
  function previewInIsolated(raw) {
    if (!isolatedPreview) throw new Error('Preview is only available in the sample document.');
    const clean = presets.validateEditorPreview(raw);
    return applyConfig(clean, { shape: clean.style });
  }
  window.StudioLab.themeEngine = {
    applyConfig, applyThemeConfig: applyConfig, previewDraftConfig() {}, clearCustomTheme, syncFromState,
    previewInIsolated, processAllChatTurns, buildThemeStylesheet, isDraftActive: () => false,
    getActiveConfig: () => activeConfig, getActiveMode: () => activeMode
  };
})();
