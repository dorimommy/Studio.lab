(function () {
  'use strict';
  const presets = window.StudioLab.themePresets;
  const core = window.StudioLabCore;
  let draft = null;
  let name = '';
  let sessionKey = '';
  let activeTab = 'roleplay';
  let dirty = false;
  let draftRevision = 0;
  let legacySource = null;
  let originalSource = null;
  let eventScope = null;
  let bindingVersion = 0;
  let icon = () => '';

  const escape = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function resetDraftSession() {
    bindingVersion++;
    draftRevision++;
    eventScope?.dispose(); eventScope = null;
    draft = null; name = ''; sessionKey = ''; dirty = false; legacySource = null; originalSource = null; activeTab = 'roleplay';
  }
  function markDirty() { dirty = true; draftRevision++; }
  function begin(editorState, themes) {
    const key = `${editorState?.mode || 'create'}:${editorState?.themeId || 'new'}`;
    if (draft && key === sessionKey) return;
    resetDraftSession(); sessionKey = key;
    const existing = editorState?.mode === 'edit' ? themes.find(item => item.id === editorState.themeId) : null;
    originalSource = existing?.config || null;
    if (existing?.legacySource) legacySource = existing.legacySource;
    else if (existing?.config && presets.hasUnsupportedThemeData(existing.config)) legacySource = existing.config;
    draft = presets.normalizeThemeConfig(existing?.config || presets.createDefaultThemeConfig());
    name = existing?.name || `Custom Theme ${themes.length + 1}`;
  }
  function requirement(paths) { return paths ? ` data-requires="${paths}"` : ''; }
  function toggle(path, label, help = '', requires = '') {
    const [group, key] = path.split('.');
    return `<label class="sl-te-row"><span><strong>${escape(label)}</strong>${help ? `<small>${escape(help)}</small>` : ''}</span><input type="checkbox" data-bind="${path}"${requirement(requires)} ${draft[group][key] ? 'checked' : ''}></label>`;
  }
  function range(path, label, min, max, unit = '', requires = '') {
    const [group, key] = path.split('.');
    return `<label class="sl-te-row"><span><strong>${escape(label)}</strong></span><span class="sl-te-range"><input type="range" data-bind="${path}"${requirement(requires)} min="${min}" max="${max}" value="${draft[group][key]}"><output>${draft[group][key]}${unit}</output></span></label>`;
  }
  function textField(path, label, requires = '') {
    const [group, key] = path.split('.');
    return `<label class="sl-te-row"><span><strong>${escape(label)}</strong></span><input class="sl-te-input" type="text" maxlength="60" data-bind="${path}"${requirement(requires)} value="${escape(draft[group][key])}"></label>`;
  }
  function colorField(path, label, requires = '') {
    const [group, key] = path.split('.');
    return `<label class="sl-te-row"><span><strong>${escape(label)}</strong></span><span class="sl-te-color"><input type="color" data-bind="${path}"${requirement(requires)} value="${draft[group][key]}"><output>${draft[group][key]}</output></span></label>`;
  }
  function group(title, body) {
    return `<section class="sl-te-group"><h3>${escape(title)}</h3><div class="sl-te-rows">${body}</div></section>`;
  }
  function imageRow(kind, title, present) {
    return `<div class="sl-te-row"><span><strong>${escape(title)}</strong><small data-image-status="${kind}">${present ? 'Local image selected' : 'No image selected'}</small></span><span class="sl-te-actions"><button type="button" class="sl-settings-button" data-image-choose="${kind}">Choose image</button><input type="file" accept="image/png,image/jpeg,image/webp" data-image-file="${kind}" hidden><button type="button" class="sl-settings-button" data-image-clear="${kind}" ${present ? '' : 'disabled'}>Remove</button></span></div>`;
  }
  function renderRoleplay() {
    return group('Names and avatars',
      toggle('roleplay.enableAvatarCustom', 'Show avatars', 'Choose local images or use initials beside messages.') +
      toggle('roleplay.showModelAvatar', 'Show model avatar', '', 'roleplay.enableAvatarCustom') + toggle('roleplay.showUserAvatar', 'Show user avatar', '', 'roleplay.enableAvatarCustom') +
      imageRow('model', 'Model avatar', Boolean(draft.roleplay.modelAvatarUrl)) + imageRow('user', 'User avatar', Boolean(draft.roleplay.userAvatarUrl)) +
      range('roleplay.avatarSize', 'Avatar size', 24, 96, 'px', 'roleplay.enableAvatarCustom') + range('roleplay.avatarRadius', 'Avatar corner radius', 0, 50, '%', 'roleplay.enableAvatarCustom') +
      toggle('roleplay.enableNameCustom', 'Show custom names') + textField('roleplay.modelName', 'Model name', 'roleplay.enableNameCustom') +
      textField('roleplay.userName', 'User name', 'roleplay.enableNameCustom') + range('roleplay.nameSize', 'Name size', 11, 28, 'px', 'roleplay.enableNameCustom'));
  }
  function renderMain() {
    const palettes = Object.values(presets.PRESET_PALETTES);
    const paletteCards = groupName => `<div class="sl-te-palette-group"><h4>${groupName === 'dark' ? 'Dark palettes' : 'Light palettes'}</h4><div class="sl-te-palette-grid">${palettes.filter(item => item.group === groupName).map(item =>
      `<button type="button" class="sl-te-palette" data-preset-id="${escape(item.id)}" aria-pressed="${item.id === draft.mainInterface.presetKey}" title="${escape(item.label)}"><span class="sl-te-palette-swatch" data-palette-swatch="${escape(item.id)}"><i></i><i></i></span><span>${escape(item.label)}</span></button>`).join('')}</div></div>`;
    const palette = `<div class="sl-te-palette-list">${paletteCards('dark')}${paletteCards('light')}</div>` +
      range('mainInterface.uiTint', 'Color tint', 0, 100, '%') + colorField('mainInterface.uiBase', 'Page') +
      colorField('mainInterface.uiSurface', 'Surface') + colorField('mainInterface.uiAccent', 'Accent') + colorField('mainInterface.uiText', 'Text');
    const bubbles = toggle('mainInterface.enableChatBubbles', 'Use chat bubbles') + toggle('mainInterface.userBubbleEnabled', 'User bubble', '', 'mainInterface.enableChatBubbles') +
      toggle('mainInterface.modelBubbleEnabled', 'Model bubble', '', 'mainInterface.enableChatBubbles') + colorField('mainInterface.userBubbleColor', 'User bubble color', 'mainInterface.enableChatBubbles,mainInterface.userBubbleEnabled') +
      colorField('mainInterface.modelBubbleColor', 'Model bubble color', 'mainInterface.enableChatBubbles,mainInterface.modelBubbleEnabled') + toggle('mainInterface.bubbleTransparencyEnabled', 'Transparent bubbles', '', 'mainInterface.enableChatBubbles') +
      toggle('mainInterface.userBubbleTransparent', 'Apply transparency to user', '', 'mainInterface.enableChatBubbles,mainInterface.userBubbleEnabled,mainInterface.bubbleTransparencyEnabled') + toggle('mainInterface.modelBubbleTransparent', 'Apply transparency to model', '', 'mainInterface.enableChatBubbles,mainInterface.modelBubbleEnabled,mainInterface.bubbleTransparencyEnabled') +
      range('mainInterface.bubbleOpacity', 'Bubble opacity', 5, 100, '%', 'mainInterface.enableChatBubbles,mainInterface.bubbleTransparencyEnabled') + range('mainInterface.bubbleBlur', 'Bubble blur', 0, 32, 'px', 'mainInterface.enableChatBubbles,mainInterface.bubbleTransparencyEnabled');
    return group('Colors', palette) + group('Background image', imageRow('background', 'Wallpaper', Boolean(draft.mainInterface.pageBg)) +
      range('mainInterface.bgDim', 'Background dim', 0, 95, '%') + range('mainInterface.bgBlur', 'Background blur', 0, 24, 'px')) + group('Chat bubbles', bubbles) + group('Surfaces',
      toggle('mainInterface.transparentUiEnabled', 'Transparent surfaces') + range('mainInterface.uiOpacity', 'Surface opacity', 10, 100, '%', 'mainInterface.transparentUiEnabled') + range('mainInterface.uiBlur', 'Surface blur', 0, 40, 'px', 'mainInterface.transparentUiEnabled'));
  }
  function renderStyle() {
    const builtins = [{id:'default',name:'Default',base:'default',description:'Rounded chat surfaces.'},
      {id:'cartoon-pixel',name:'Pixel',base:'cartoon-pixel',description:'Stepped frames and speech tails.'},
      {id:'winter-frost',name:'Winter',base:'winter-frost',description:'Snowcaps, crystals and frosted surfaces.'}];
    const list = [...builtins, ...presets.getCustomStyles()];
    const current = ['custom-starlit-snowglass','custom-imperial-jade-scroll-novel'].includes(draft.style.stylePreset) ? 'winter-frost' : draft.style.stylePreset;
    const cards = list.map(item => `<button type="button" class="sl-te-style-choice" data-style-id="${escape(item.id)}" aria-pressed="${item.id === current}"><span class="sl-te-style-art sl-te-art-${escape(item.base)}"><span class="sl-te-art-user">User</span><span class="sl-te-art-model">Model</span></span><strong>${escape(item.name)}</strong><small>${escape(item.description || 'Custom shape')}</small></button>`).join('');
    const snowToggle = toggle('style.ambientEffectEnabled', 'Falling snow', 'Pause the effect at any time. Reduced-motion settings are respected.')
      .replace('data-bind="style.ambientEffectEnabled"', 'data-bind="style.ambientEffectEnabled" data-requires-style="winter-frost"');
    const legacy = presets.getLegacyStyles?.() || [];
    const legacyRows = legacy.length ? group('Older styles', legacy.map(item => `<div class="sl-te-row"><span><strong>${escape(item.name)}</strong><small>This older CSS style cannot be applied safely. Its original data is still available.</small></span><button type="button" class="sl-settings-button" data-legacy-export="${item.index}">Export original</button></div>`).join('')) : '';
    return group('Chat style', `<div class="sl-te-style-grid" data-style-grid>${cards}</div>` + snowToggle +
      `<div class="sl-te-row"><span><strong>Style file</strong><small>Import or export a declarative .stylelab shape. Older free-form CSS remains available for original export but is not executed.</small></span><span class="sl-te-actions"><button type="button" class="sl-settings-button" data-style-import>Import</button><input type="file" accept=".stylelab,.json,application/json" data-style-file hidden><button type="button" class="sl-settings-button" data-style-export>Export</button><button type="button" class="sl-settings-button" data-style-delete>Delete</button></span></div>`) +
      group('Create a shape', `<label class="sl-te-row"><span><strong>Style name</strong></span><input class="sl-te-input" data-style-name maxlength="60"></label>
      <label class="sl-te-row"><span><strong>Base style</strong></span><select class="sl-te-input" data-style-base><option value="default">Default</option><option value="cartoon-pixel">Pixel</option><option value="winter-frost">Winter</option></select></label>
      <label class="sl-te-row"><span><strong>Bubble radius</strong></span><input class="sl-te-input" type="number" data-style-radius min="0" max="28" value="18"></label>
      <label class="sl-te-row"><span><strong>Button radius</strong></span><input class="sl-te-input" type="number" data-style-button min="0" max="24" value="12"></label>
      <label class="sl-te-row"><span><strong>Border width</strong></span><input class="sl-te-input" type="number" data-style-border min="0" max="4" value="1"></label>
      <div class="sl-te-row"><span><strong>Save style</strong><small>Stores these bounded shape settings in this browser.</small></span><button type="button" class="sl-settings-button" data-style-create>Save style</button></div>`) +
      group('Paste a style', `<label class="sl-te-row sl-te-paste"><span><strong>Declarative .stylelab JSON</strong><small>Use bounded shape values and a packaged base style. CSS and URLs are not accepted.</small></span><textarea class="sl-te-input" data-style-paste rows="5"></textarea></label><div class="sl-te-row"><span><strong>Style schema</strong></span><span class="sl-te-actions"><button type="button" class="sl-settings-button" data-style-copy-schema>Copy schema</button><button type="button" class="sl-settings-button" data-style-paste-import>Import pasted style</button></span></div>`) +
      legacyRows + '<p class="sl-te-status" data-style-status role="status"></p>';
  }
  function renderTypography() {
    const fonts = presets.FONT_CATALOG.map(font => `<option value="${escape(font.value)}" ${font.value === draft.typography.fontFamily ? 'selected' : ''}>${escape(font.label)}</option>`).join('');
    return group('Text', `<label class="sl-te-row"><span><strong>Font</strong></span><select class="sl-te-input" data-bind="typography.fontFamily">${fonts}</select></label>` +
      range('typography.chatFontSize', 'Text size', 12, 24, 'px') + toggle('typography.customTextColorEnabled', 'Use custom text colors') +
      colorField('typography.modelTextColor', 'Model text', 'typography.customTextColorEnabled') + colorField('typography.userTextColor', 'User text', 'typography.customTextColorEnabled')) +
      group('Quoted text', toggle('typography.quoteHighlightEnabled', 'Highlight quoted text') +
      colorField('typography.modelQuoteColor', 'Model quote', 'typography.quoteHighlightEnabled') + colorField('typography.userQuoteColor', 'User quote', 'typography.quoteHighlightEnabled')) +
      '<div class="sl-te-row"><span><strong>Reset typography</strong><small>Restore the selected palette’s text settings.</small></span><button type="button" class="sl-settings-button" data-typography-reset>Reset</button></div>';
  }
  function markup() {
    const tabs = [['roleplay','Roleplay','person'],['main','Interface','palette'],['style','Style','tune'],['typography','Typography','edit']];
    return `<div class="sl-te-header"><button type="button" class="sl-settings-button" data-back>${icon('arrow_back','plain')}<span>Back</span></button>
      <label class="sl-te-name"><span>Theme name</span><input class="sl-te-input" data-name maxlength="60" value="${escape(name)}"></label>
      <button type="button" class="sl-settings-button" data-random>Randomize palette</button><button type="button" class="sl-settings-button" data-preview>Preview theme</button><button type="button" class="sl-settings-button primary" data-save>Save theme</button></div>
      ${legacySource ? '<p class="sl-te-legacy-note">This theme contains an older image URL or CSS style. Choose supported replacements; its original data remains available to export.</p>' : ''}<p class="sl-te-status" data-editor-status role="status"></p><nav class="sl-te-tabs" aria-label="Theme editor sections">${tabs.map(([id,title,symbol]) => `<button type="button" data-tab="${id}" aria-pressed="${activeTab === id}" class="sl-te-tab sl-te-tab-${id}">${icon(symbol,'plain')}<span>${title}</span></button>`).join('')}</nav>
      <div class="sl-te-panels"><div data-panel="roleplay" ${activeTab === 'roleplay' ? '' : 'hidden'}>${renderRoleplay()}</div><div data-panel="main" ${activeTab === 'main' ? '' : 'hidden'}>${renderMain()}</div><div data-panel="style" ${activeTab === 'style' ? '' : 'hidden'}>${renderStyle()}</div><div data-panel="typography" ${activeTab === 'typography' ? '' : 'hidden'}>${renderTypography()}</div></div>`;
  }
  function renderEditorWorkspace({ editorState, customThemes = [], renderIcon }) {
    begin(editorState, customThemes); icon = renderIcon || (() => '');
    return `<div class="sl-te-workspace" data-sl-theme-editor-view>${markup()}</div>`;
  }
  function updateDisabled(root) {
    root.querySelectorAll('[data-requires]').forEach(control => {
      control.disabled = !control.dataset.requires.split(',').every(path => {
        const [section, field] = path.split('.');
        return draft[section]?.[field] === true;
      });
    });
    root.querySelectorAll('[data-requires-style]').forEach(control => {
      const id = draft.style.stylePreset, custom = presets.getCustomStyleById(id);
      const base = custom?.base || (['custom-starlit-snowglass', 'custom-imperial-jade-scroll-novel'].includes(id) ? 'winter-frost' : id);
      control.disabled = base !== control.dataset.requiresStyle;
    });
  }
  function updateVisuals(root) {
    root.querySelectorAll('[data-palette-swatch]').forEach(swatch => {
      const item = presets.PRESET_PALETTES[swatch.dataset.paletteSwatch];
      if (!item) return;
      swatch.style.setProperty('--swatch-base', item.uiBase);
      swatch.style.setProperty('--swatch-surface', item.uiSurface);
      swatch.style.setProperty('--swatch-accent', item.uiAccent);
    });
    const grid = root.querySelector('[data-style-grid]'), mi = draft.mainInterface, ty = draft.typography;
    if (grid) for (const [name, value] of Object.entries({base:mi.uiBase,surface:mi.uiSurface,accent:mi.uiAccent,text:mi.uiText,user:mi.userBubbleColor,model:mi.modelBubbleColor,
      'user-text':ty.customTextColorEnabled ? ty.userTextColor : mi.uiText, 'model-text':ty.customTextColorEnabled ? ty.modelTextColor : mi.uiText})) grid.style.setProperty(`--style-${name}`, value);
  }
  function repaint(root) { root.innerHTML = markup(); updateDisabled(root); updateVisuals(root); }
  function bindEditorEvents(root, { onSave, onBack, onPreview, announce }) {
    eventScope?.dispose(); eventScope = core.scope();
    const version = ++bindingVersion;
    updateDisabled(root);
    updateVisuals(root);
    const status = message => { const target = root.querySelector('[data-style-status]'); if (target) target.textContent = message; };
    eventScope.on(root, 'click', async event => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.hasAttribute('data-back')) { resetDraftSession(); onBack?.(); return; }
      if (button.hasAttribute('data-save')) {
        const revision = draftRevision;
        button.disabled = true;
        root.inert = true;
        try {
          const result = getDraft();
          result.config = await presets.sanitizeThemeImages(result.config);
          if (version !== bindingVersion || revision !== draftRevision) return;
          if (await onSave?.(result)) { resetDraftSession(); announce?.('Theme saved.'); }
          else if (version === bindingVersion) root.querySelector('[data-editor-status]').textContent = 'Could not save this theme. Your draft is still here.';
        } catch (error) {
          if (version === bindingVersion) {
            if (originalSource && /image|legacy CSS/i.test(error.message || '')) legacySource ||= originalSource;
            root.querySelector('[data-editor-status]').textContent = error.message || 'Could not save this theme.';
          }
        }
        finally { if (root.isConnected) root.inert = false; if (version === bindingVersion && button.isConnected) button.disabled = false; }
        return;
      }
      if (button.hasAttribute('data-preview')) {
        const revision = draftRevision;
        button.disabled = true;
        try {
          const config = await presets.sanitizeThemeImages(draft);
          if (version !== bindingVersion || revision !== draftRevision) return;
          onPreview?.({ editorConfig: presets.createEditorPreview(config), control: button });
        } catch (error) { if (version === bindingVersion) root.querySelector('[data-editor-status]').textContent = error.message || 'Preview is unavailable.'; }
        finally { if (version === bindingVersion && button.isConnected) button.disabled = false; }
        return;
      }
      if (button.dataset.tab) {
        activeTab = button.dataset.tab;
        root.querySelectorAll('[data-tab]').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.tab === activeTab)));
        root.querySelectorAll('[data-panel]').forEach(node => { node.hidden = node.dataset.panel !== activeTab; });
        return;
      }
      if (button.dataset.presetId) {
        const selected = button.dataset.presetId;
        draft = presets.applyPresetToConfig(draft, selected); markDirty(); repaint(root);
        Array.from(root.querySelectorAll('[data-preset-id]')).find(node => node.dataset.presetId === selected)?.focus();
        return;
      }
      if (button.dataset.styleId) {
        draft.style.stylePreset = button.dataset.styleId; markDirty();
        root.querySelectorAll('[data-style-id]').forEach(node => node.setAttribute('aria-pressed', String(node === button)));
        updateDisabled(root);
        return;
      }
      if (button.hasAttribute('data-random')) {
        const keys = Object.keys(presets.PRESET_PALETTES);
        draft = presets.applyPresetToConfig(draft, keys[Math.floor(Math.random() * keys.length)]); markDirty();
        repaint(root); root.querySelector('[data-random]')?.focus(); announce?.('Palette changed.'); return;
      }
      if (button.hasAttribute('data-style-import')) { root.querySelector('[data-style-file]')?.click(); return; }
      if (button.dataset.imageChoose) {
        Array.from(root.querySelectorAll('[data-image-file]')).find(node => node.dataset.imageFile === button.dataset.imageChoose)?.click(); return;
      }
      if (button.dataset.imageClear) {
        const key = button.dataset.imageClear;
        if (key === 'background') draft.mainInterface.pageBg = '';
        else draft.roleplay[key === 'model' ? 'modelAvatarUrl' : 'userAvatarUrl'] = '';
        markDirty(); repaint(root); return;
      }
      if (button.hasAttribute('data-typography-reset')) {
        draft.typography = presets.createDefaultThemeConfig(draft.mainInterface.presetKey).typography;
        markDirty(); repaint(root); root.querySelector('[data-typography-reset]')?.focus(); return;
      }
      if (button.hasAttribute('data-style-create')) {
        button.disabled = true;
        try {
          const item = await presets.saveCustomStyle({ name: root.querySelector('[data-style-name]').value,
            base: root.querySelector('[data-style-base]').value, bubbleRadius: Number(root.querySelector('[data-style-radius]').value),
            buttonRadius: Number(root.querySelector('[data-style-button]').value), borderWidth: Number(root.querySelector('[data-style-border]').value) });
          if (version !== bindingVersion || !root.isConnected) return;
          draft.style.stylePreset = item.id; markDirty(); repaint(root); status('Style saved.');
        } catch (error) { status(error.message); }
        finally { if (button.isConnected) button.disabled = false; }
        return;
      }
      if (button.hasAttribute('data-style-delete')) {
        button.disabled = true;
        try {
          const deleted = await presets.deleteCustomStyle(draft.style.stylePreset);
          if (version !== bindingVersion || !root.isConnected) return;
          if (deleted) { draft.style.stylePreset = 'default'; markDirty(); repaint(root); status('Style deleted.'); }
          else status('Select a custom style to delete.');
        } catch (error) { status(error.message || 'Could not delete the style.'); }
        finally { if (button.isConnected) button.disabled = false; }
        return;
      }
      if (button.hasAttribute('data-style-export')) {
        const item = presets.getCustomStyleById(draft.style.stylePreset);
        if (!item) { status('Select a custom style to export.'); return; }
        const url = URL.createObjectURL(new Blob([presets.serializeStyleLab(item)], {type:'application/json'}));
        const link = document.createElement('a'); link.href = url; link.download = `${item.id}.stylelab`; link.click();
        const release = eventScope.add(() => URL.revokeObjectURL(url));
        eventScope.timeout(release, 1000); status('Style exported.');
      }
      if (button.hasAttribute('data-style-copy-schema')) {
        const example = JSON.stringify({format:'studiolab-stylelab',version:2,style:{name:'My style',base:'default',bubbleRadius:18,buttonRadius:12,borderWidth:1}}, null, 2);
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(example).then(() => status('Style schema copied.'), () => status('Could not copy the schema.'));
        else status('Clipboard is unavailable.');
      }
      if (button.hasAttribute('data-legacy-export')) {
        try {
          const raw = presets.serializeLegacyStyle(Number(button.dataset.legacyExport));
          const url = URL.createObjectURL(new Blob([raw], {type:'application/json'}));
          const link = document.createElement('a'); link.href = url; link.download = 'legacy-style.stylelab'; link.click();
          const release = eventScope.add(() => URL.revokeObjectURL(url)); eventScope.timeout(release, 1000);
          status('Original style exported. It may contain unsupported CSS.');
        } catch (error) { status(error.message); }
      }
      if (button.hasAttribute('data-style-paste-import')) {
        button.disabled = true;
        try {
          const item = await presets.saveCustomStyle(presets.parseStyleLab(root.querySelector('[data-style-paste]').value));
          if (version !== bindingVersion || !root.isConnected) return;
          draft.style.stylePreset = item.id; markDirty(); repaint(root); status('Style imported.');
        } catch (error) { status(error.message || 'Could not import the style.'); }
        finally { if (button.isConnected) button.disabled = false; }
      }
    });
    const update = event => {
      const target = event.target;
      if (target.matches('[data-name]')) { name = target.value; markDirty(); return; }
      const path = target.dataset.bind;
      if (!path) return;
      const [group, key] = path.split('.');
      const value = target.type === 'checkbox' ? target.checked : target.type === 'range' ? Number(target.value) : target.value;
      draft[group][key] = value;
      if (path === 'mainInterface.uiTint') presets.applyUiTintToConfig(draft, value);
      draft = presets.normalizeThemeConfig(draft); markDirty();
      updateVisuals(root);
      if (target.type === 'checkbox') updateDisabled(root);
      if (path === 'mainInterface.uiTint') {
        root.querySelectorAll('[data-bind]').forEach(control => {
          if (control === target) return;
          const [section, field] = control.dataset.bind.split('.');
          const current = draft[section]?.[field];
          if (control.type === 'checkbox') control.checked = current;
          else if (current !== undefined) control.value = current;
          const readout = control.parentElement.querySelector('output');
          if (readout && control.type === 'color') readout.textContent = current;
        });
      }
      const output = target.parentElement.querySelector('output');
      if (output) output.textContent = `${value}${target.type === 'range' ? (['mainInterface.uiTint','mainInterface.bgDim','mainInterface.bubbleOpacity','mainInterface.uiOpacity','roleplay.avatarRadius'].includes(path) ? '%' : 'px') : ''}`;
    };
    eventScope.on(root, 'input', event => {
      if (event.target.type !== 'checkbox' && event.target.tagName !== 'SELECT') update(event);
    });
    eventScope.on(root, 'change', async event => {
      if (event.target.matches('[data-image-file]')) {
        const file = event.target.files?.[0], kind = event.target.dataset.imageFile, revision = draftRevision;
        if (!file) return;
        try {
          const helper = window.StudioLabThemeImages;
          if (!helper) throw new Error('Local image processing is unavailable.');
          const value = await helper.fromFile(file, kind === 'background' ? 'background' : 'avatar');
          if (version !== bindingVersion || revision !== draftRevision || !root.isConnected) return;
          const next = presets.normalizeThemeConfig(draft);
          if (kind === 'background') next.mainInterface.pageBg = value;
          else next.roleplay[kind === 'model' ? 'modelAvatarUrl' : 'userAvatarUrl'] = value;
          helper.assertThemeBudget(next); draft = next; markDirty(); repaint(root);
          root.querySelector('[data-editor-status]').textContent = 'Local image added.';
        } catch (error) { if (version === bindingVersion) root.querySelector('[data-editor-status]').textContent = error.message || 'Could not use this image.'; }
        return;
      }
      if (!event.target.matches('[data-style-file]')) { if (event.target.type === 'checkbox' || event.target.tagName === 'SELECT') update(event); return; }
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        if (file.size > 65536) throw new Error('Style files must be 64 KB or smaller.');
        const text = await file.text();
        if (version !== bindingVersion || !root.isConnected) return;
        const item = await presets.saveCustomStyle(presets.parseStyleLab(text));
        if (version !== bindingVersion || !root.isConnected) return;
        draft.style.stylePreset = item.id; markDirty(); repaint(root); status('Style imported.');
      } catch (error) { if (version === bindingVersion) status(error.message || 'Could not import the style.'); }
    });
  }
  function getDraft() { return draft ? { name: name.trim() || 'Custom Theme', config: presets.normalizeThemeConfig(draft), legacySource, isDirty: dirty } : null; }
  window.StudioLab.themeEditorUI = { renderEditorWorkspace, bindEditorEvents, getDraft, resetDraftSession };
})();
