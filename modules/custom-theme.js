(function (root, factory) {
  'use strict';
  const commonJS = typeof module === 'object' && module.exports;
  const schema = commonJS ? require('../account/catalog-schema.js') : root.StudioLabCatalogSchema;
  const api = factory(schema);
  if (commonJS) module.exports = api;
  else {
    root.StudioLabTheme = api;
    if (root.chrome?.storage?.local && root.document) api.start(root);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (schema) {
  'use strict';
  let activeMode = null;
  let activeRoot = null;
  const THEME_SCOPE = ':root:has(#sl-modern-web-chat-styles:not([disabled])) body[data-sl-custom-theme="true"][data-sl-custom-theme="true"]';
  function buildThemeCSS(asset) {
    const clean = schema.validateAsset(asset);
    if (clean.kind !== 'theme') throw new Error('Choose a theme.');
    const palette = schema.upgradeTheme(clean.payload);
    const { tokens, opacity, mode } = palette;
    const visible = schema.compositedSurfaces(palette);
    const accent = tokens['--color-v3-primary'];
    const c = { background: visible['--color-v3-surface'], surface: visible['--color-v3-surface-container-high'],
      text: tokens['--color-v3-text'], muted: tokens['--color-v3-text-var'], accent,
      accentText: schema.contrast(accent, '#000000') >= schema.contrast(accent, '#ffffff') ? '#000000' : '#ffffff',
      border: tokens['--color-v3-text-var'] };
    if (clean.payload.version === 1) c.accentText = clean.payload.colors.accentText;
    const variables = paletteVariables(c, mode);
    for (const [name, color] of Object.entries(tokens)) {
      const alpha = opacity[name];
      variables[name] = alpha === undefined || alpha === 1 ? color
        : `rgba(${[1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16)).join(',')},${alpha})`;
    }
    // References preserve surface opacity across Material menus, inputs, and panels.
    for (const name of ['--color-surface', '--mat-sys-surface', '--mat-sys-surface-container-low', '--sys-surface', '--color-v3-surface-container-low']) variables[name] = 'var(--color-v3-surface)';
    for (const name of ['--color-v3-surface-container', '--color-v3-surface-left-nav', '--mat-sys-surface-container']) variables[name] = 'var(--sl-mwc-surface)';
    for (const name of ['--mat-sys-surface-container-high', '--mat-sys-surface-variant', '--mat-menu-container-color', '--mat-select-panel-background-color', '--mat-dialog-container-color', '--mdc-dialog-container-color', '--mat-table-background-color', '--mat-list-list-item-container-color', '--mat-list-list-item-selected-container-color', '--mat-form-field-filled-container-color', '--mat-form-field-filled-disabled-container-color']) variables[name] = 'var(--color-v3-surface-container-high)';
    variables['--mat-sys-surface-container-highest'] = 'var(--color-v3-surface-container-highest)';
    variables['--color-nav-item-active'] = 'var(--color-v3-surface-container-highest)';
    variables['--color-nav-item-hover'] = 'var(--sl-mwc-hover)';
    variables['--color-v3-button-container'] = 'var(--sl-mwc-raised)';
    variables['--color-v3-hover'] = 'var(--sl-mwc-hover)';
    variables['--color-inverse-on-surface'] = schema.contrast(c.text, '#000000') >= schema.contrast(c.text, '#ffffff') ? '#000000' : '#ffffff';
    variables['--color-v3-outline'] = variables['--color-v3-outline-var'] = 'transparent';
    const declarations = Object.entries(variables).map(([key, value]) => `${key}:${value} !important;`).join('');
    const scope = THEME_SCOPE;
    const hosts = ':is(ms-app,ms-navbar-v,ms-navbar-v2,ms-prompt-box,ms-right-side-panel,ms-run-settings,ms-prompt-run-settings,.cdk-overlay-container,.mat-mdc-dialog-surface,.mat-mdc-menu-panel,.mat-mdc-menu-item,.mat-mdc-select-panel,.mat-mdc-option,.mat-mdc-form-field,.mat-mdc-select,.mat-mdc-slide-toggle,.mat-mdc-checkbox,.mat-mdc-radio-button,.mat-mdc-slider,.mat-mdc-tab-group,.mat-mdc-snack-bar-container,.mat-mdc-tooltip,.mat-mdc-table,.mat-mdc-button,.mat-mdc-outlined-button,.mat-mdc-unelevated-button,.mat-mdc-raised-button,.mat-mdc-icon-button)';
    const forced = paletteVariables({ background: 'Canvas', surface: 'Canvas', text: 'CanvasText', muted: 'CanvasText', accent: 'Highlight', accentText: 'HighlightText', border: 'ButtonText' });
    forced['--color-v3-text-link'] = forced['--sl-mwc-accent'] = 'LinkText';
    const forcedDeclarations = Object.entries(forced).map(([key, value]) => `${key}:${value} !important;`).join('');
    // Selectors and properties are packaged constants; values are validated hex colors and a fixed scheme.
    // Material components need the palette at their host because they set local tokens.
    return `:root:has(#sl-modern-web-chat-styles:not([disabled])){background-color:${schema.THEME_CANVAS[mode]} !important;}
      ${scope},${scope} ${hosts}${settingsExclusion()}{${declarations}color-scheme:${mode} !important;}
      ${scope}{background-color:var(--color-v3-surface) !important;color:var(--color-v3-text) !important;}
      ${isolateStudioCSS(nativeStudioCSS())}
      ${isolateStudioCSS(modernChatCSS())}
      @media (forced-colors:active){${scope},${scope} ${hosts}${settingsExclusion()}{${forcedDeclarations}}}
      ${settingsIsolationCSS(scope)}`;
  }
  function settingsExclusion() {
    return ':not(.sl-settings-shell,.sl-settings-shell *,.sl-native-settings-select-panel,.sl-native-settings-select-panel *)';
  }
  function isolateStudioCSS(css) {
    // Packaged selectors exclude Settings, including native Angular controls and portals.
    return css.replace(/([^{}]+)\{/g, (rule, selectors) => {
      if (selectors.trim().startsWith('@')) return rule;
      return selectors.replace(/(::placeholder)?\s*$/, (_, pseudo = '') => settingsExclusion() + pseudo) + '{';
    });
  }
  function settingsIsolationCSS(scope) {
    // Reset inherited Material/GAIS tokens so Settings keeps its neutral palette in either theme mode.
    const neutral = paletteVariables({ background: 'var(--sl-settings-page)', surface: 'var(--sl-settings-surface)',
      text: 'var(--sl-settings-text)', muted: 'var(--sl-settings-muted)', accent: 'var(--sl-settings-link)',
      accentText: 'var(--sl-settings-primary-ink)', border: 'var(--sl-settings-control-outline)' });
    neutral['--color-v3-surface-container-highest'] = 'var(--sl-settings-hover)';
    const declarations = Object.entries(neutral).map(([key, value]) => `${key}:${value} !important;`).join('');
    return `${scope} :is(.sl-settings-shell,.sl-settings-shell *,.sl-native-settings-select-panel,.sl-native-settings-select-panel *){${declarations}color-scheme:dark !important;}
      ${scope}.light-theme :is(.sl-settings-shell,.sl-settings-shell *,.sl-native-settings-select-panel,.sl-native-settings-select-panel *){color-scheme:light !important;}`;
  }
  function paletteVariables(c, mode = 'dark') {
    let hover = c.accent;
    if (/^#[0-9a-f]{6}$/i.test(c.accent) && /^#[0-9a-f]{6}$/i.test(c.text)) {
      const mix = '#' + [1, 3, 5].map(index => Math.round(parseInt(c.accent.slice(index, index + 2), 16) * .9
        + parseInt(c.text.slice(index, index + 2), 16) * .1).toString(16).padStart(2, '0')).join('');
      if (schema.contrast(mix, c.accentText) >= 4.5) hover = mix;
    }
    function blend(first, second, weight) {
      if (/^#[0-9a-f]{6}$/i.test(first) && /^#[0-9a-f]{6}$/i.test(second)) {
        return '#' + [1, 3, 5].map(index => Math.round(parseInt(first.slice(index, index + 2), 16) * (1 - weight)
          + parseInt(second.slice(index, index + 2), 16) * weight).toString(16).padStart(2, '0')).join('');
      }
      return `color-mix(in srgb,${first} ${(1 - weight) * 100}%,${second})`;
    }
    // Map the version-one seven-color palette onto the GAIS/MWC surface hierarchy.
    const container = mode === 'light' ? c.background : blend(c.background, c.surface, .5);
    const highest = blend(c.surface, c.text, .03);
    function controlSurface(base, weight) {
      const fill = blend(base, c.text, weight);
      return /^#[0-9a-f]{6}$/i.test(fill) && /^#[0-9a-f]{6}$/i.test(c.text) && schema.contrast(fill, c.text) < 4.5 ? base : fill;
    }
    const button = mode === 'light' ? c.background : controlSurface(c.surface, .075);
    const buttonHigh = controlSurface(mode === 'light' ? c.background : c.surface, mode === 'light' ? .09 : .165);
    const buttonHighest = controlSurface(mode === 'light' ? c.background : c.surface, mode === 'light' ? .24 : .275);
    const outline = blend(c.background, c.border, .24);
    const variables = {
      '--color-surface': c.background,
      '--color-on-surface': c.text,
      '--color-on-surface-variant': c.muted,
      '--color-run-settings-text': c.text,
      '--color-logo-lockup': c.text,
      '--color-inverse-surface': c.text,
      '--color-inverse-on-surface': c.background,
      '--color-tertiary': c.accent,
      '--color-error': c.text,
      '--color-nav-item-active': container,
      '--color-nav-item-hover': highest,
      '--color-markdown-blockquote-bg': c.surface,
      '--color-loading-background': c.surface,
      '--color-loading-background-contrast': c.border,
      '--color-overlay-background': `color-mix(in srgb,${c.background} 76%,transparent)`,
      '--color-v3-surface': c.background,
      '--color-v3-surface-container': container,
      '--color-v3-surface-container-low': c.background,
      '--color-v3-surface-container-high': c.surface,
      '--color-v3-surface-container-highest': highest,
      '--color-v3-surface-left-nav': c.background,
      '--color-v3-surface-left-nav-border': 'transparent',
      '--color-v3-text': c.text,
      '--color-v3-text-var': c.muted,
      '--color-v3-text-subtle': c.muted,
      '--color-v3-text-disable': c.muted,
      '--color-v3-text-on-button': c.text,
      '--color-v3-button-container': button,
      '--color-v3-button-container-high': buttonHigh,
      '--color-v3-button-container-highest': buttonHighest,
      '--color-v3-button-container-accent': blend(c.surface, c.accent, .18),
      '--color-v3-button-container-accent-hover': blend(c.surface, c.accent, .26),
      '--color-v3-primary': c.accent,
      '--color-v3-on-primary': c.accentText,
      '--color-v3-text-link': c.accent,
      '--color-v3-hover': mode === 'light' ? highest : button,
      '--color-v3-outline': outline,
      '--color-v3-outline-var': blend(c.background, c.border, .12),
      '--color-v3-outline-accent': c.accent,
      '--color-v3-accent-light-1': c.surface,
      '--color-v3-warning-text': c.text,
      '--color-v3-overlay-background': `color-mix(in srgb,${c.background} 76%,transparent)`,
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
      '--mat-sys-outline': 'transparent',
      '--mat-sys-outline-variant': 'transparent',
      '--mat-sys-error': c.text,
      '--mat-sys-on-error-container': c.text,
      '--mat-sys-neutral10': c.muted,
      '--sys-surface': c.background,
      '--sys-on-surface': c.text,
      '--sys-primary': c.accent,
      '--sl-mwc-surface': c.background,
      '--sl-mwc-raised': mode === 'light' ? blend(c.background, c.text, .045) : container,
      '--sl-mwc-hover': highest,
      '--sl-mwc-border': 'transparent',
      '--sl-mwc-text': c.text,
      '--sl-mwc-muted': c.muted,
      '--sl-mwc-accent': c.accent,
      '--mat-button-filled-hover-state-layer-color': hover,
      '--mat-button-protected-hover-state-layer-color': hover
    };
    function assign(value, names) { for (const name of names) variables[name] = value; }
    // Preserve GAIS accent-3/4: they represent danger and new statuses.
    for (const severity of ['note', 'tip', 'important', 'warning', 'caution']) {
      variables['--color-markdown-alert-' + severity] = c.text;
      variables['--color-markdown-alert-' + severity + '-bg'] = c.surface;
    }
    assign(c.surface, ['--mat-menu-container-color', '--mat-select-panel-background-color', '--mat-dialog-container-color', '--mdc-dialog-container-color', '--mat-table-background-color', '--mat-list-list-item-container-color', '--mat-list-list-item-selected-container-color', '--mat-form-field-filled-container-color', '--mat-form-field-filled-disabled-container-color']);
    assign(c.text, ['--mat-menu-item-label-text-color', '--mat-option-label-text-color', '--mat-select-enabled-trigger-text-color', '--mat-select-trigger-text-color', '--mat-dialog-subhead-color', '--mat-dialog-supporting-text-color', '--mat-table-header-headline-color', '--mat-table-row-item-label-text-color', '--mat-slide-toggle-label-text-color', '--mat-checkbox-label-text-color', '--mat-radio-label-text-color', '--mat-focus-indicator-border-color', '--mat-form-field-outlined-focus-outline-color', '--mat-form-field-filled-focus-active-indicator-color']);
    assign(c.muted, ['--mat-menu-item-icon-color', '--mat-select-placeholder-text-color', '--mat-select-enabled-arrow-color', '--mat-select-disabled-arrow-color', '--mat-select-disabled-trigger-text-color', '--mat-form-field-enabled-select-arrow-color', '--mat-form-field-leading-icon-color', '--mat-form-field-trailing-icon-color']);
    assign(c.border, ['--mat-divider-color', '--mat-menu-divider-color', '--mat-table-row-item-outline-color', '--mat-button-outlined-outline-color', '--mat-checkbox-unselected-icon-color', '--mat-checkbox-unselected-hover-icon-color', '--mat-checkbox-unselected-focus-icon-color', '--mat-checkbox-unselected-pressed-icon-color', '--mat-radio-unselected-icon-color', '--mat-radio-unselected-hover-icon-color', '--mat-radio-unselected-focus-icon-color', '--mat-radio-unselected-pressed-icon-color', '--mat-slider-inactive-track-color', '--mat-form-field-outlined-outline-color', '--mat-form-field-outlined-hover-outline-color', '--mat-form-field-outlined-disabled-outline-color', '--mat-form-field-filled-active-indicator-color', '--mat-form-field-filled-hover-active-indicator-color']);
    assign(c.accent, ['--mat-option-selected-state-label-text-color', '--mat-select-focused-arrow-color', '--mat-form-field-focus-select-arrow-color', '--mat-button-filled-container-color', '--mat-button-protected-container-color', '--mdc-filled-button-container-color', '--mdc-protected-button-container-color', '--mat-button-text-label-text-color', '--mat-button-outlined-label-text-color', '--mat-pseudo-checkbox-full-selected-icon-color', '--mat-pseudo-checkbox-minimal-selected-checkmark-color', '--mat-slider-handle-color', '--mat-slider-active-track-color']);
    assign(c.accentText, ['--mat-button-filled-label-text-color', '--mat-button-protected-label-text-color', '--mdc-filled-button-label-text-color', '--mdc-protected-button-label-text-color', '--mat-pseudo-checkbox-full-selected-checkmark-color', '--mat-checkbox-selected-checkmark-color']);
    assign(c.surface, ['--mat-menu-item-hover-state-layer-color', '--mat-menu-item-focus-state-layer-color', '--mat-option-hover-state-layer-color', '--mat-option-focus-state-layer-color', '--mat-option-selected-state-layer-color']);
    for (const variant of ['filled', 'outlined']) {
      for (const token of ['input-text-color', 'label-text-color', 'hover-label-text-color', 'focus-label-text-color']) variables['--mat-form-field-' + variant + '-' + token] = c.text;
      for (const token of ['input-text-placeholder-color', 'disabled-input-text-color', 'disabled-label-text-color']) variables['--mat-form-field-' + variant + '-' + token] = c.muted;
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
    assign(c.accent, ['--mat-slide-toggle-selected-icon-color']);
    assign(c.surface, ['--mat-slide-toggle-unselected-icon-color']);
    assign(c.border, ['--mat-slide-toggle-track-outline-color', '--mat-slide-toggle-unselected-track-outline-color']);
    assign(c.text, ['--mat-form-field-error-text-color', '--mat-form-field-error-trailing-icon-color', '--mat-form-field-error-hover-trailing-icon-color', '--mat-form-field-error-focus-trailing-icon-color']);
    for (const variant of ['filled', 'outlined']) {
      for (const token of ['caret-color', 'label-text-color', 'hover-label-text-color', 'focus-label-text-color', 'outline-color', 'hover-outline-color', 'focus-outline-color', 'active-indicator-color', 'hover-active-indicator-color', 'focus-active-indicator-color']) variables['--mat-form-field-' + variant + '-error-' + token] = c.text;
    }
    assign('transparent', ['--mat-button-outlined-outline-color', '--mat-focus-indicator-border-color',
      '--mat-form-field-outlined-outline-color', '--mat-form-field-outlined-hover-outline-color',
      '--mat-form-field-outlined-focus-outline-color', '--mat-form-field-outlined-disabled-outline-color',
      '--mat-form-field-outlined-error-outline-color', '--mat-form-field-outlined-error-hover-outline-color',
      '--mat-form-field-outlined-error-focus-outline-color', '--mat-slide-toggle-track-outline-color',
      '--mat-slide-toggle-unselected-track-outline-color']);
    return variables;
  }
  function nativeStudioCSS() {
    const scope = THEME_SCOPE;
    return `${scope} :is(ms-app,app-root,ms-chat-app,ms-prompt-renderer,ms-chunk-editor,ms-autoscroll-container,.makersuite-layout,.banner-and-app-container,.chat-container,.chat-view-container,.chunk-editor-main,.main-content-container){background-color:transparent !important;color:var(--color-v3-text) !important;}
      ${scope} :is(ms-chat-session,ms-zero-state){background-color:var(--sl-mwc-surface) !important;color:var(--sl-mwc-text) !important;}
      ${scope} :is(ms-navbar-v,ms-navbar-v2) .nav-content{background-color:var(--color-v3-surface-left-nav) !important;border-color:transparent !important;color:var(--color-v3-text) !important;}
      ${scope} :is(ms-navbar-v,ms-navbar-v2) :is(.nav-item-main-text,.section-header,.navbar-header,.account-switcher-button,.navbar-disclaimer){color:var(--color-v3-text) !important;}
      ${scope} :is(ms-navbar-v,ms-navbar-v2) :is(a[ms-button],button[ms-button]){color:var(--color-v3-text) !important;}
      ${scope} :is(ms-navbar-v,ms-navbar-v2) button[ms-button].ms-button-borderless:not([aria-current="page"],.active,.active-override,.ms-button-active){background-color:var(--color-v3-button-container) !important;}
      ${scope} :is(ms-navbar-v,ms-navbar-v2) button[ms-button].ms-button-borderless:not([aria-current="page"],.active,.active-override,.ms-button-active):not([aria-disabled="true"]):not(:disabled):is(:hover,:focus-visible){background-color:var(--color-v3-hover) !important;}
      ${scope} :is(ms-navbar-v,ms-navbar-v2) :is(a.active,a.active-override,[aria-current="page"],.nav-item.ms-button-active){background-color:var(--color-nav-item-active) !important;color:var(--color-v3-text-link) !important;}
      ${scope} :is(ms-navbar-v,ms-navbar-v2) :is(a.active,a.active-override) .nav-item-main-text{color:var(--color-v3-text-link) !important;}
      ${scope} :is(ms-navbar-v,ms-navbar-v2) :is(a[ms-button],button[ms-button]):not([aria-disabled="true"]):not(:disabled):is(:hover,:focus-visible){background-color:var(--color-nav-item-hover) !important;}
      ${scope} :is(ms-playground-toolbar,ms-header,ms-prompt-box,ms-chat-bottom-overlay,ms-run-settings,ms-prompt-run-settings,ms-prompt-run-settings-switcher){background-color:transparent !important;color:var(--color-v3-text) !important;border-color:var(--color-v3-outline) !important;}
      ${scope} :is(ms-model-selector .model-selector-card,ms-system-instructions-panel .system-instructions-card,.model-selector-card,.system-instructions-card){background-color:var(--color-v3-surface-container-high) !important;color:var(--color-v3-text) !important;border-color:var(--color-v3-outline) !important;}
      ${scope} ms-run-settings :is(.content-container,.overlay-header,.settings-items-wrapper,.scrollable-area){background-color:transparent !important;}
      ${scope} :is(ms-prompt-box,ms-chat-turn,ms-autosize-textarea,ms-run-settings,ms-system-instructions-panel) :is(textarea,input[ms-input]){background-color:transparent !important;color:var(--color-v3-text) !important;caret-color:var(--color-v3-text) !important;border-color:var(--color-v3-outline) !important;}
      ${scope} :is(ms-app,.cdk-overlay-container) :is(input,textarea)::placeholder{color:var(--color-v3-text-var) !important;opacity:1;}
      ${scope} .cdk-overlay-container :is(textarea,input[ms-input],select){background-color:var(--color-v3-surface-container-high) !important;color:var(--color-v3-text) !important;caret-color:var(--color-v3-text) !important;border-color:var(--color-v3-outline) !important;}
      ${scope} :is(ms-app,.cdk-overlay-container) :is(input[type="checkbox"],input[type="radio"],input[type="range"]){accent-color:var(--color-v3-text-link);}
      ${scope} :is(ms-run-settings .title,.model-selector-card .title,.system-instructions-card .title,.mat-mdc-select-value,.mat-mdc-select-arrow){color:var(--color-v3-text) !important;}
      ${scope} :is(ms-run-settings .subtitle,.model-selector-card .subtitle,.system-instructions-card .subtitle,.token-count-container,.model-run-time,.status-message,.hallucinations-disclaimer){color:var(--color-v3-text-var) !important;}
      ${scope} :is(.mat-mdc-dialog-surface,.mat-mdc-menu-panel,.mat-mdc-select-panel,.mat-mdc-autocomplete-panel,.mat-mdc-snack-bar-container .mdc-snackbar__surface,.mat-mdc-tooltip .mdc-tooltip__surface){background-color:var(--color-v3-surface-container-high) !important;color:var(--color-v3-text) !important;border-color:var(--color-v3-outline) !important;}
      ${scope} .cdk-overlay-dark-backdrop{background-color:color-mix(in srgb,var(--color-v3-surface) 70%,transparent) !important;}
      ${scope} :is(.mat-mdc-menu-item,.mat-mdc-option,.mat-mdc-list-item,.mat-mdc-dialog-title,.mat-mdc-dialog-content){color:var(--color-v3-text) !important;}
      ${scope} :is(.mat-mdc-menu-item:hover,.mat-mdc-menu-item.cdk-keyboard-focused,.mat-mdc-option:hover,.mat-mdc-option.mat-mdc-option-active,.mat-mdc-option.mdc-list-item--selected){background-color:var(--color-v3-surface) !important;}
      ${scope} :is(.mdc-text-field--outlined,.mdc-text-field--filled){background-color:var(--color-v3-surface-container-high) !important;}
      ${scope} :is(.mat-mdc-input-element,.mat-mdc-select-value,.mat-mdc-option .mdc-list-item__primary-text){color:var(--color-v3-text) !important;caret-color:var(--color-v3-text) !important;}
      ${scope} :is(.mat-mdc-floating-label,.mat-mdc-form-field-hint,.mat-mdc-form-field-error){color:var(--color-v3-text-var) !important;}
      ${scope} .ms-button-primary{background-color:var(--color-v3-button-container) !important;color:var(--color-v3-text-on-button) !important;border-color:transparent !important;}
      ${scope} .ms-button-primary.ms-button-as{background-color:var(--color-v3-button-container) !important;}
      ${scope} .ms-button-primary:not([aria-disabled="true"]):not(:disabled):hover{background-color:var(--color-v3-hover) !important;}
      ${scope} :is(.mat-mdc-unelevated-button:not(:disabled),.mat-mdc-raised-button:not(:disabled)){background-color:var(--mat-button-filled-container-color) !important;color:var(--mat-button-filled-label-text-color) !important;border-color:transparent !important;}
      ${scope} :is(.mat-mdc-unelevated-button:not(:disabled):hover,.mat-mdc-raised-button:not(:disabled):hover){background-color:var(--mat-button-filled-hover-state-layer-color) !important;}
      ${scope} :is([ms-button],.mat-mdc-outlined-button,.mdc-notched-outline,.mdc-notched-outline > *){border-color:transparent !important;}
      ${scope} :is(.prompt-box-container,textarea,input[ms-input],.model-selector-card,.system-instructions-card,.mat-mdc-dialog-surface,.mat-mdc-menu-panel,.mat-mdc-select-panel,.mat-mdc-autocomplete-panel,.model-card,.agent-card,.grid-card){border-color:transparent !important;}
      ${scope} :is(.ms-button-filter-chip,.ms-button-borderless,.ms-button-secondary){color:var(--color-v3-text) !important;border-color:transparent !important;}
      ${scope} .ms-button-secondary.ms-button-as{background-color:var(--color-inverse-surface) !important;color:var(--color-inverse-on-surface) !important;}
      ${scope} .ms-button-secondary.ms-button-as:not([aria-disabled="true"]):not(:disabled):is(:hover,:focus-visible){background-color:var(--sl-mwc-hover) !important;color:var(--sl-mwc-text) !important;}
      ${scope} .ms-button-borderless:not([aria-disabled="true"]):not(:disabled):hover{background-color:var(--color-v3-hover) !important;}
      ${scope} :is(.ms-button-filter-chip.ms-button-active,.ms-button-filter-chip[aria-pressed="true"]){background-color:var(--color-v3-button-container-accent) !important;color:var(--color-v3-text) !important;border-color:transparent !important;}
      ${scope} :is(ms-cmark-node,ms-code-block) :is(pre,code,.inline-code,.code-header,.sticky-header){background-color:var(--color-v3-surface-container-high) !important;color:var(--color-v3-text) !important;border-color:var(--color-v3-outline) !important;}
      ${scope} :is(ms-cmark-node,ms-code-block) pre code{background-color:transparent !important;}
      ${scope} :is(ms-cmark-node,ms-code-block) :is(.hljs,.token){color:var(--color-v3-text) !important;}
      ${scope} :is(ms-cmark-node,ms-code-block) :is(.hljs-comment,.hljs-quote,.token.comment,.token.prolog,.token.doctype){color:var(--color-v3-text-var) !important;}
      ${scope} :is(ms-cmark-node,ms-code-block) :is(.hljs-keyword,.hljs-string,.hljs-number,.token.keyword,.token.string,.token.number){color:var(--color-v3-text-link) !important;}
      ${scope} :is(ms-cmark-node,ms-code-block) a{color:var(--color-v3-text-link) !important;}
      ${scope} :is(ms-grid-view,ms-model-grid,ms-agent-grid) :is(.model-card,.agent-card,.grid-card){background-color:var(--color-v3-surface-container-high) !important;color:var(--color-v3-text) !important;border-color:var(--color-v3-outline) !important;}`;
  }
  function modernChatCSS() {
    // The second packaged attribute overrides native light-theme selectors regardless of stylesheet order.
    const scope = THEME_SCOPE;
    return `${scope} :is(.sl-header-btn,.toolbar-left .overflow-menu-wrapper > button,.toolbar-right .overflow-menu-wrapper > button,.toolbar-left > button[aria-label*="nav" i],.toolbar-left > button[aria-label*="menu" i]){background:color-mix(in srgb,var(--sl-mwc-raised) 35%,transparent) !important;border-color:var(--sl-mwc-border) !important;color:var(--sl-mwc-text) !important;}
      ${scope} .sl-load-banner button{background:var(--sl-mwc-raised) !important;border-color:var(--sl-mwc-border) !important;color:var(--sl-mwc-text) !important;}
      ${scope} :is(.sl-header-btn-label,.sl-header-btn .chevron,.sl-toc-item-text,.sl-dropdown-item.active,.sl-tokens-hero-value,.sl-tokens-row span.sl-highlight){color:var(--sl-mwc-text) !important;}
      ${scope} .sl-custom-dropdown .sl-dropdown-item{color:var(--sl-mwc-muted) !important;}
      ${scope} :is(.sl-header-btn .icon,.sl-dropdown-check,.sl-tool-check){color:var(--sl-mwc-accent) !important;}
      ${scope} .sl-custom-dropdown{background:color-mix(in srgb,var(--sl-mwc-surface) 92%,transparent) !important;border-color:var(--sl-mwc-border) !important;color:var(--sl-mwc-text) !important;}
      ${scope} :is(.sl-toc-popover,.sl-saving-pill,.sl-custom-submenu){background:var(--sl-mwc-surface) !important;border-color:var(--sl-mwc-border) !important;color:var(--sl-mwc-text) !important;}
      ${scope} :is(.sl-custom-submenu .mat-mdc-menu-item,.sl-tools-menu-item,.sl-custom-submenu-content .mat-mdc-menu-item){color:var(--sl-mwc-text) !important;}
      ${scope} :is(.sl-header-btn:hover,.sl-load-banner button:hover,.sl-dropdown-item:hover,.sl-toc-item:hover,.sl-toc-item.active,.sl-custom-submenu .mat-mdc-menu-item:hover,.sl-tools-menu-item:hover,.sl-custom-submenu-content .mat-mdc-menu-item:hover,.toolbar-left .overflow-menu-wrapper > button:hover,.toolbar-right .overflow-menu-wrapper > button:hover,.toolbar-left > button[aria-label*="nav" i]:hover,.toolbar-left > button[aria-label*="menu" i]:hover){background:var(--sl-mwc-hover) !important;border-color:var(--sl-mwc-border) !important;color:var(--sl-mwc-text) !important;}
      ${scope} :is(.sl-header-btn:hover,.toolbar-left .overflow-menu-wrapper > button:hover,.toolbar-right .overflow-menu-wrapper > button:hover,.toolbar-left > button[aria-label*="nav" i]:hover,.toolbar-left > button[aria-label*="menu" i]:hover){background:color-mix(in srgb,var(--sl-mwc-hover) 60%,transparent) !important;}
      ${scope} :is(ms-right-side-panel,.drawer-container:has(ms-run-settings):not(:has(ms-right-side-panel))){background:var(--sl-mwc-surface) !important;border-color:var(--sl-mwc-border) !important;color:var(--sl-mwc-text) !important;}
      ${scope} :is(ms-right-side-panel .overlay-header,ms-run-settings,ms-run-settings .settings-items-wrapper,ms-run-settings .scrollable-area,ms-prompt-run-settings-switcher,ms-prompt-run-settings){background:transparent !important;border-color:var(--sl-mwc-border) !important;color:var(--sl-mwc-text) !important;}
      ${scope} :is(.sl-tokens-card,ms-file-chunk,.chat-turn-container.model.edit,.chat-turn-container.user.edit ms-autosize-textarea,ms-video-chunk .file-chunk-container){background:var(--sl-mwc-raised) !important;border-color:var(--sl-mwc-border) !important;color:var(--sl-mwc-text) !important;}
      ${scope} ms-prompt-box .prompt-box-container{background:var(--sl-mwc-raised) !important;border-color:var(--sl-mwc-border) !important;color:var(--sl-mwc-text) !important;}
      ${scope} ms-prompt-box .prompt-box-container :is(textarea,input[ms-input]){color:var(--sl-mwc-text) !important;caret-color:var(--sl-mwc-text) !important;}
      ${scope} ms-prompt-box .prompt-box-container :is(textarea,input[ms-input])::placeholder{color:var(--sl-mwc-muted) !important;}
      ${scope} ms-thinking-level-setting .mat-mdc-text-field-wrapper{background:var(--sl-mwc-raised) !important;border-color:var(--sl-mwc-border) !important;border-radius:12px !important;color:var(--sl-mwc-text) !important;}
      ${scope} ms-thinking-level-setting .mat-mdc-select-trigger{background:transparent !important;color:var(--sl-mwc-text) !important;}
      ${scope} :is(.chat-turn-container.model.edit,.chat-turn-container.user.edit ms-autosize-textarea){box-shadow:none !important;}
      ${scope} .chat-turn-container.user ms-prompt-chunk:not(:has(ms-file-chunk)):not(:has(ms-video-chunk)):not(:has(ms-image-chunk)):not(:has(textarea)){background:var(--sl-mwc-raised) !important;color:var(--sl-mwc-text) !important;}
      ${scope} :is(ms-file-chunk .name,.chat-turn-container.model.edit textarea,.chat-turn-container.user.edit textarea){color:var(--sl-mwc-text) !important;}
      ${scope} :is(.sl-tokens-hero-label,.sl-tokens-row,.sl-tokens-row span:last-child,.sl-model-edited-badge,.chat-turn-container .actions.hover-or-edit button){color:var(--sl-mwc-muted) !important;}
      ${scope} .sl-model-edited-badge{opacity:1 !important;}
      ${scope} .enabled-tool-container :is(.tool-name,.tool-icon,.enabled-tool > button:last-child){color:var(--sl-mwc-muted) !important;}
      ${scope} .enabled-tool-container .enabled-tool{border-color:var(--sl-mwc-border) !important;}
      ${scope} .enabled-tool-container :is(.enabled-tool:hover,.enabled-tool > button:last-child:hover){background:var(--sl-mwc-hover) !important;color:var(--sl-mwc-text) !important;}
      ${scope} .chat-turn-container.user ms-prompt-chunk :is(code,pre){background:var(--color-v3-surface-container-high) !important;color:var(--sl-mwc-text) !important;border-color:var(--sl-mwc-border) !important;}
      ${scope} .chat-turn-container.user ms-prompt-chunk pre code{background:transparent !important;}
      ${scope} :is(ms-add-media-button > button,ms-stt-button > button){border-color:var(--sl-mwc-border) !important;color:var(--sl-mwc-text) !important;}
      ${scope} :is(ms-add-media-button > button:hover,ms-stt-button > button:hover,ms-file-chunk:hover){background:var(--sl-mwc-hover) !important;}
      ${scope} .sl-toc-dash{background:var(--sl-mwc-muted) !important;}
      ${scope} .sl-toc-dash.active{background:var(--sl-mwc-accent) !important;}
      @media (forced-colors:active){${scope}{--sl-mwc-surface:Canvas !important;--sl-mwc-raised:Canvas !important;--sl-mwc-hover:Canvas !important;--sl-mwc-border:ButtonText !important;--sl-mwc-text:CanvasText !important;--sl-mwc-muted:CanvasText !important;--sl-mwc-accent:LinkText !important;}}`;
  }
  function start(root, options = {}) {
    const { document, chrome } = root;
    // Account/Market are separate extension documents with their own theme.
    const isolatedPreview = options.isolatedPreview === true && /\/account\/theme-preview\.html$/.test(root.location?.pathname || '') &&
      document.body?.getAttribute('data-sl-theme-preview') === 'true';
    if (root.location?.protocol === 'chrome-extension:' && !isolatedPreview) return { apply() {}, preview() {}, endPreview() {} };
    activeRoot = root;
    let style = null, sheet = null, generation = 0, pendingAsset = null, storedAsset = null, previewing = false;
    const canAdopt = typeof root.CSSStyleSheet === 'function' && 'adoptedStyleSheets' in document;
    const privateDocument = root.location?.protocol === 'chrome-extension:';
    function removeStyle() {
      style?.remove(); style = null;
      if (sheet) {
        const current = Array.from(document.adoptedStyleSheets);
        if (current.includes(sheet)) document.adoptedStyleSheets = current.filter(item => item !== sheet);
        sheet = null;
      }
    }
    function installStyle(css) {
      if (canAdopt) {
        // Validated tokens and packaged selectors keep constructed sheets within the extension CSP.
        // Preserve existing native/component sheets and their ordering.
        if (!sheet) sheet = new root.CSSStyleSheet();
        sheet.replaceSync(css);
        const current = Array.from(document.adoptedStyleSheets);
        if (!current.includes(sheet)) document.adoptedStyleSheets = [...current, sheet];
        return true;
      }
      // Private extension documents cannot use inline stylesheets under their CSP.
      if (privateDocument) return false;
      if (!style) { style = document.createElement('style'); style.id = 'sl-custom-theme'; document.head.appendChild(style); }
      style.textContent = css;
      return true;
    }
    function paint(value) {
      pendingAsset = value;
      if (!document.body || !document.head) return;
      let css = null, mode = null;
      try {
        if (value) { css = buildThemeCSS(value); mode = value.payload.mode; }
      } catch (_) { /* Ignore corrupt or unsupported local theme files. */ }
      if (css) {
        try { if (!installStyle(css)) { css = null; mode = null; } }
        catch (_) { css = null; mode = null; }
      }
      if (css) document.body.setAttribute('data-sl-custom-theme', 'true');
      else {
        removeStyle();
        document.body.removeAttribute('data-sl-custom-theme');
      }
      activeMode = mode;
      root.dispatchEvent(new Event('sl-theme-changed'));
    }
    function apply(value) {
      storedAsset = value;
      if (!previewing) paint(value);
    }
    function preview(payload) {
      const clean = schema.validateTheme(payload);
      previewing = true;
      paint({ id: '00000000-0000-4000-8000-000000000000', kind: 'theme', title: 'Preview', description: '',
        tags: [], author_name: '', visibility: 'private', revision: 1, created_at: '2026-10-11T00:00:00.000Z',
        updated_at: '2026-10-11T00:00:00.000Z', payload: clean });
    }
    function endPreview() { previewing = false; paint(storedAsset); }
    // The sample shares this renderer without reading account preferences or installing a saved theme.
    if (!isolatedPreview) {
      const initialGeneration = generation;
      chrome.storage.local.get(['slActiveTheme'], stored => {
        if (!chrome.runtime?.lastError && generation === initialGeneration) apply(stored?.slActiveTheme || null);
      });
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && Object.prototype.hasOwnProperty.call(changes, 'slActiveTheme')) {
          generation++; apply(changes.slActiveTheme.newValue || null);
        }
      });
    }
    if (!document.body) document.addEventListener('DOMContentLoaded', () => paint(pendingAsset), { once: true });
    root.StudioLabThemePreview = Object.freeze({ preview, endPreview });
    return { apply, preview, endPreview };
  }
  return Object.freeze({ buildThemeCSS, start, mode: () => {
    const modern = activeRoot?.document.getElementById('sl-modern-web-chat-styles');
    return modern && !modern.hasAttribute('disabled') && !modern.disabled ? activeMode : null;
  } });
});
