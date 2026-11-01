(function () {
  'use strict';
  const embedded = window.self !== window.top;
  document.documentElement.classList.toggle('embedded', embedded);
  const $ = id => document.getElementById(id);
  const { $$, el, debounce } = window.StudioLabCore;
  const schema = window.StudioLabCatalogSchema;
  let view = window.location.hash === '#profile' ? 'profile' : window.location.hash === '#library' ? 'library' : 'market';
  const searchState = { market: { query: '', kind: 'all' }, library: { query: '', kind: 'all' }, profile: { query: '', kind: 'all' } };
  let account = null;
  let localItems = [];
  let ownItems = [];
  let marketItems = [];
  let activeTheme = null;
  let modernEnabled = false;
  let ownNext = null;
  let marketNext = null;
  let localOffset = 0;
  let ownOffset = 0;
  let marketOffset = 0;
  const pageSize = 10;
  let busy = false;
  let stopped = false;
  let marketRequest = 0;
  let ownRequest = 0;
  let marketReading = false;
  let ownReading = false;
  let detailAsset = null;
  let detailSource = '';
  let editorAsset = null;
  let editorOriginal = '';
  let editorThemeMode = 'dark';
  let confirmation = null;
  let confirmationTrigger = null;
  let discardTrigger = null;
  let dialogTrigger = null;
  let lastHeight = 0;
  let layoutFrame = null;
  let layoutObserver = null;
  let viewport = null;
  const showContrastFeedback = debounce((ok, feedback) => {
    text($('contrast-status'), feedback);
    $('contrast-status').dataset.invalid = String(!ok);
  }, 250);
  let editorOwnerId = null;
  let pausedDraft = null;
  let discardPaused = false;
  const paletteCache = new Map();
  let dialogFocus = null;
  let hostQuery = '';
  let searchTimer = null;
  const colorNames = Object.freeze({
    '--sl-mwc-surface': 'Chat background', '--sl-mwc-raised': 'Bubbles and composer', '--sl-mwc-hover': 'Chat hover',
    '--sl-mwc-text': 'Chat text', '--sl-mwc-muted': 'Secondary chat text', '--sl-mwc-accent': 'Chat accent',
    '--color-v3-primary': 'Buttons and links', '--color-v3-surface': 'Page background',
    '--color-v3-surface-container-high': 'Panels', '--color-v3-surface-container-highest': 'Raised panels',
    '--color-v3-text': 'Interface text', '--color-v3-text-subtle': 'Quiet text', '--color-v3-text-var': 'Secondary interface text'
  });
  const dialogIds = ['public-profile-dialog', 'create-dialog', 'detail-dialog', 'editor-dialog', 'confirm-dialog', 'discard-dialog'];
  let ownProfile = null, publicProfile = null;
  let savedItems = [], profileItems = [], savedNext = null, savedOffset = 0, profileNext = null, profileOffset = 0;
  let socialGeneration = 0, socialReadGeneration = 0, savedRequest = 0, profileRequest = 0;
  const social = new Map();
  const moderationStates = new Map();
  let membership = null, membershipRequest = 0;
  let detailModeration = null, moderationEditing = false;
  let discoveredProfile = null;
  let previewRequest = null;
  const inlineStack = [];
  const viewTriggers = new Map();
  function desktopDevice() {
    if (typeof viewport?.desktop === 'boolean') return viewport.desktop;
    const mobile = navigator.userAgentData?.mobile;
    const tablet = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || /Mac/i.test(navigator.platform || '') && navigator.maxTouchPoints > 1;
    return mobile !== true && !tablet;
  }
  function syncInlineViews() {
    const current = topDialog();
    document.querySelector('.market-shell').hidden = !!current;
    for (const dialog of dialogIds.map($)) dialog.toggleAttribute('data-suspended', dialog.open && dialog !== current);
    scheduleLayout();
  }
  function profileStats(profile) { return profile ? `${profile.followers || 0} followers · ${profile.followingCount || 0} following · ${profile.publications || 0} creations` : ''; }
  function profileInitial(profile) { return (profile?.nickname || 'S').slice(0, 1).toLocaleUpperCase(); }
  function identityBadges(profile) {
    const badges = document.createElement('span'); badges.className = 'identity-badges';
    for (const [kind, label] of [['verified', 'Verified subscriber'], ['staff', 'Studio.lab team or affiliate'], ['moderator', 'Market moderator']]) {
      if (profile?.badges?.[kind] !== true) continue;
      const mark = document.createElement('span'); mark.className = 'identity-mark ' + kind; mark.title = label; mark.setAttribute('role', 'img'); mark.setAttribute('aria-label', label);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
      const shape = document.createElementNS(svg.namespaceURI, 'path'); shape.setAttribute('d', kind === 'moderator' ? 'M12 2 3.5 5.5V11c0 5.5 3.8 9.2 8.5 11 4.7-1.8 8.5-5.5 8.5-11V5.5Z' : 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z');
      const check = document.createElementNS(svg.namespaceURI, 'path'); check.setAttribute('class', 'badge-check'); check.setAttribute('d', 'm7 12 3 3 6-6'); svg.append(shape, check); mark.append(svg); badges.append(mark);
    }
    return badges;
  }
  function creatorButton(profile, compact = false) {
    const link = button('', node => showProfile(profile.id, node), { control: 'author', name: 'View profile of ' + profile.nickname + ' · @' + profile.handle }); link.classList.add(compact ? 'asset-author' : 'creator-button');
    const name = document.createElement('span'); name.className = 'author-name'; name.textContent = profile.nickname;
    const copy = document.createElement('span'); copy.className = 'author-copy'; copy.append(name, identityBadges(profile));
    if (!compact) {
      const avatar = document.createElement('span'); avatar.className = 'creator-avatar'; avatar.setAttribute('aria-hidden', 'true'); avatar.textContent = profileInitial(profile);
      const tag = document.createElement('span'); tag.className = 'author-tag'; tag.textContent = '@' + profile.handle; copy.append(tag); link.append(avatar);
    }
    link.append(copy); return link;
  }
  async function refreshMembership() {
    const owner = accountId(), request = ++membershipRequest; if (!owner) { membership = null; return; }
    const response = await send('membershipGet', { expectedUserId: owner });
    if (request !== membershipRequest || owner !== accountId() || stopped) return;
    membership = response; if (publicProfile) renderPublicProfile(); renderModeration();
  }
  async function findCreator(query, request) {
    const handle = /^@([a-z][a-z0-9_]{2,23})$/i.exec(query)?.[1]?.toLowerCase(), owner = accountId();
    if (!handle) { discoveredProfile = null; renderDiscoveredProfile(); return null; }
    const result = await send('profileGet', { handle, ...(owner ? { expectedUserId: owner } : { anonymous: true }) });
    if (request !== marketRequest || owner !== accountId() || stopped || searchState.market.query !== query) return null;
    discoveredProfile = result.profile || null; renderDiscoveredProfile();
    return discoveredProfile;
  }
  function renderDiscoveredProfile() {
    const result = $('creator-result'); result.replaceChildren(); result.hidden = !discoveredProfile;
    if (!discoveredProfile) return;
    const copy = document.createElement('div'); copy.className = 'creator-result-copy';
    const label = document.createElement('p'); label.className = 'eyebrow'; label.textContent = 'Creator';
    const link = creatorButton(discoveredProfile); copy.append(label, link);
    const stats = document.createElement('p'); stats.className = 'help'; stats.textContent = profileStats(discoveredProfile); copy.append(stats); result.append(copy);
    if (!discoveredProfile.self) { const follow = button(discoveredProfile.following ? 'Following' : 'Follow', node => followProfile(discoveredProfile, node), { control: 'follow' }); follow.setAttribute('aria-pressed', String(!!discoveredProfile.following)); result.append(follow); }
    scheduleLayout();
  }
  function renderProfile() {
    $('creations-profile').hidden = !account?.signedIn;
    text($('creations-profile-name'), ownProfile?.nickname || 'Your profile'); text($('creations-profile-avatar'), profileInitial(ownProfile));
    $('creations-profile-badges').replaceChildren(...identityBadges(ownProfile).childNodes);
    text($('creations-profile-note'), ownProfile ? '@' + ownProfile.handle + ' · ' + profileStats(ownProfile) : 'Your public nickname and @tag are assigned automatically on sign-in.');
    $('manage-account-profile').disabled = busy || !account?.signedIn;
    $('creations-profile-name').disabled = busy || !ownProfile;
  }
  async function refreshProfile() {
    const owner = accountId(), generation = socialGeneration;
    if (!owner) { ownProfile = null; renderProfile(); return; }
    const response = await send('profileGet', { expectedUserId: owner });
    if (owner !== accountId() || generation !== socialGeneration || stopped) return;
    ownProfile = response.profile || null; renderProfile();
  }
  async function readSocial(items) {
    if (!items.length) return;
    const generation = socialGeneration, readGeneration = socialReadGeneration, owner = accountId();
    const response = await send('catalogSocialGet', { ids: items.map(item => item.id), ...(owner ? { expectedUserId: owner } : { anonymous: true }) });
    if (generation !== socialGeneration || readGeneration !== socialReadGeneration || owner !== accountId() || stopped) return;
    for (const item of response.items || []) social.set(item.id, item);
  }
  async function readOwnModeration(items) {
    const owner = accountId(), generation = socialGeneration; if (!owner || !items.length) return;
    const result = await send('catalogModeration', { ids: items.map(item => item.id), expectedUserId: owner });
    if (owner !== accountId() || generation !== socialGeneration || stopped) return;
    for (const item of items) moderationStates.delete(item.id);
    for (const state of result.items || []) moderationStates.set(state.id, state);
  }
  function renderSaved() {
    $('saved-list').replaceChildren(...savedItems.map(item => card(item, 'saved')));
    $('saved-empty').hidden = savedItems.length > 0;
    text($('saved-empty'), account?.signedIn ? 'You have not saved anything here yet. Explore Discover to find something you like.' : 'Sign in to keep your saved items across devices.');
    $('previous-saved').hidden = savedOffset === 0; $('more-saved').hidden = savedNext === null;
    scheduleLayout();
  }
  async function refreshSaved(offset = 0) {
    const request = ++savedRequest, owner = accountId();
    if (!owner) { savedItems = []; savedNext = null; savedOffset = 0; renderSaved(); return; }
    const response = await send('catalogSavedList', { ...searchState.library, offset, limit: pageSize, expectedUserId: owner });
    if (request !== savedRequest || owner !== accountId() || stopped) return;
    savedItems = checked(response.items, true); savedOffset = offset; savedNext = Number.isInteger(response.nextOffset) ? response.nextOffset : null;
    await readSocial(savedItems); if (request === savedRequest && owner === accountId()) renderSaved();
  }
  function renderPublicProfile() {
    if (!publicProfile) return;
    text($('public-profile-name'), publicProfile.nickname); text($('public-profile-handle'), '@' + publicProfile.handle);
    text($('public-profile-avatar'), profileInitial(publicProfile)); text($('public-profile-stats'), profileStats(publicProfile));
    $('public-profile-badges').replaceChildren(...identityBadges(publicProfile).childNodes);
    $('profile-account').hidden = !publicProfile.self;
    $('profile-follow').hidden = !!publicProfile.self;
    text($('profile-follow'), publicProfile.following ? 'Following' : 'Follow');
    $('profile-follow').setAttribute('aria-pressed', String(!!publicProfile.following));
    $('public-profile-roles').hidden = membership?.capabilities?.owner !== true;
    text($('profile-role-action'), publicProfile.badges?.staff === true ? 'Revoke gold badge' : 'Grant gold badge');
    $('profile-role-action').classList.toggle('danger-button', publicProfile.badges?.staff === true);
    $('profile-role-action').disabled = busy || membership?.capabilities?.owner !== true;
    $('profile-list').replaceChildren(...profileItems.map(item => card(item, 'profile')));
    $('profile-empty').hidden = profileItems.length > 0;
    $('previous-profile').hidden = profileOffset === 0; $('more-profile').hidden = profileNext === null;
    scheduleLayout();
  }
  async function refreshPublicProfile(offset = 0) {
    if (!publicProfile) return;
    const request = ++profileRequest, id = publicProfile.id;
    const owner = accountId();
    const response = await send('profileAssets', { profileId: id, offset, limit: pageSize, ...(owner ? { expectedUserId: owner } : { anonymous: true }) });
    if (request !== profileRequest || publicProfile?.id !== id || owner !== accountId() || stopped) return;
    profileItems = checked(response.items, true); profileOffset = offset; profileNext = Number.isInteger(response.nextOffset) ? response.nextOffset : null;
    await readSocial(profileItems); if (request === profileRequest && publicProfile?.id === id) renderPublicProfile();
  }
  async function showProfile(profileId, control) {
    const owner = accountId(), generation = socialGeneration;
    const result = await act(control, () => send('profileGet', { profileId, ...(owner ? { expectedUserId: owner } : { anonymous: true }) }));
    if (owner !== accountId() || generation !== socialGeneration || stopped) return;
    if (!result?.profile) { notice('This profile is no longer available.'); return; }
    publicProfile = result.profile; profileItems = []; profileOffset = 0; profileNext = null;
    $('profile-role-reason').value = '';
    rememberTrigger(control); renderPublicProfile(); openDialog($('public-profile-dialog'), $('public-profile-name'));
    refreshPublicProfile().catch(showError);
  }
  async function followProfile(profile, control) {
    if (!account?.signedIn) { openAccount(); return; }
    const owner = accountId();
    const result = await act(control, async () => {
      if (!await stillSameAccount(owner)) return null;
      return send('profileFollow', { profileId: profile.id, following: !profile.following, expectedUserId: owner });
    });
    if (!result?.profile || owner !== accountId()) return;
    const restoreFocus = hasUiFocus() && (document.activeElement === control || document.activeElement === document.body);
    ++socialReadGeneration;
    if (publicProfile?.id === profile.id) publicProfile = result.profile;
    if (discoveredProfile?.id === profile.id) { discoveredProfile = result.profile; renderDiscoveredProfile(); }
    for (const state of social.values()) if (state.author?.id === profile.id) state.author = result.profile;
    renderPublicProfile(); renderDetailSocial();
    if (restoreFocus) focus(control) || focus($('creator-result').querySelector('[data-control=follow]')) || focus($('detail-creator').querySelector('[data-control=follow]')) || focus($('profile-follow'));
  }
  async function socialAction(kind, control, selectedAsset = detailAsset) {
    if (!account?.signedIn) { openAccount(); return; }
    const asset = selectedAsset, owner = accountId(); if (!asset || busy) return;
    const state = social.get(asset.id) || { liked: false, saved: false, likes: 0 };
    const result = await act(control, async () => {
      if (!await stillSameAccount(owner)) return null;
      return send(kind === 'like' ? 'catalogLike' : 'catalogBookmark', { id: asset.id, ...(kind === 'like' ? { liked: !state.liked } : { saved: !state.saved }), expectedUserId: owner });
    });
    if (!result || owner !== accountId()) return;
    if (!result.item) {
      social.delete(asset.id); marketItems = marketItems.filter(item => item.id !== asset.id); savedItems = savedItems.filter(item => item.id !== asset.id); profileItems = profileItems.filter(item => item.id !== asset.id);
      renderMarket(); renderSaved(); if (publicProfile) renderPublicProfile(); if (detailAsset?.id === asset.id) closeDetail();
      notice('This publication is no longer available in Market.'); return;
    }
    const restoreFocus = hasUiFocus() && (document.activeElement === control || document.activeElement === document.body);
    ++socialReadGeneration; social.set(asset.id, result.item); renderDetailSocial(); renderMarket(); renderOwn(); if (publicProfile) renderPublicProfile();
    if (restoreFocus) {
      const key = kind === 'like' ? 'like' : 'bookmark';
      const replacement = control.closest('[data-asset-id]') ? $$('[data-asset-id]').find(node => node.dataset.assetId === asset.id)?.querySelector('[data-control=' + key + ']') : $('detail-social').querySelector('[data-control=' + key + ']');
      focus(replacement);
    }
    if (kind === 'save') refreshSaved().catch(showError);
  }
  function socialIcon(kind) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', kind === 'like' ? 'M20.5 4.8a5.5 5.5 0 0 0-7.8 0l-.7.7-.7-.7a5.5 5.5 0 0 0-7.8 7.8L12 21l8.5-8.4a5.5 5.5 0 0 0 0-7.8Z' : 'M6 3h12v18l-6-4-6 4V3Z'); svg.append(path); return svg;
  }
  function renderDetailSocial() {
    if (!detailAsset) return;
    const state = social.get(detailAsset.id);
    $('detail-social').replaceChildren(); $('detail-creator').replaceChildren();
    $('detail-creator').hidden = !state?.author;
    if (state?.author) {
      const author = state.author;
      const link = creatorButton(author);
      $('detail-creator').append(link);
      if (!author.self) { const follow = button(author.following ? 'Following' : 'Follow', node => followProfile(author, node), { control: 'follow' }); follow.setAttribute('aria-pressed', String(!!author.following)); $('detail-creator').append(follow); }
    }
    if (detailAsset.visibility !== 'public') return;
    const like = button((state?.liked ? 'Liked' : 'Like') + (state?.likes ? ' · ' + state.likes : ''), node => socialAction('like', node), { control: 'like' });
    const save = button(state?.saved ? 'Saved' : 'Save', node => socialAction('save', node), { control: 'bookmark' });
    like.setAttribute('aria-pressed', String(!!state?.liked)); save.setAttribute('aria-pressed', String(!!state?.saved));
    like.prepend(socialIcon('like')); save.prepend(socialIcon('save'));
    $('detail-social').append(like, save);
  }
  function showCreate(control = $('create-asset')) {
    if (busy || !account) return;
    if (view !== 'profile') { rememberSearch(); view = 'profile'; renderView(); if (account?.signedIn) refreshOwn().catch(showError); }
    rememberTrigger(control); $('create-theme').disabled = !desktopDevice(); $('theme-desktop-note').hidden = desktopDevice(); openDialog($('create-dialog'), $('create-title'));
  }
  function previewTheme(theme, control) {
    if (busy || previewRequest) return;
    let palette; try { palette = schema.validateTheme(theme); } catch (error) { showError(error, $('editor-dialog').open); return; }
    if (!embedded) { notice('Open Market in Google AI Studio to use Preview.'); announce('Preview is available in Google AI Studio.'); return; }
    const requestId = crypto.randomUUID(); previewRequest = { requestId, control, owner: accountId() };
    signalParent('preview-theme', { palette, requestId });
  }


  function text(node, value) {
    const next = String(value ?? '');
    if (node.textContent !== next) node.textContent = next;
  }
  function message(error) {
    const raw = typeof error === 'string' ? error : error?.message;
    return typeof raw === 'string' ? raw.slice(0, 500) : 'The action could not be completed. Try again.';
  }
  function showError(error, editor = false) {
    const current = editor ? $('editor-dialog') : topDialog();
    let node = current?.querySelector('[role=alert]');
    if (!node && current) { node = el('<div class="notice error" role="alert"></div>'); current.prepend(node); }
    node ||= $('catalog-error'); text(node, message(error)); node.hidden = false;
    if (node.id === 'catalog-error') $('catalog-retry').hidden = false;
    announce(message(error)); scheduleLayout();
  }
  function clearError(editor = false) {
    const nodes = editor ? [$('editor-error')] : $$('.notice.error');
    for (const node of nodes) { text(node, ''); node.hidden = true; }
    if (!editor) $('catalog-retry').hidden = true;
  }
  function announce(value) { text(topDialog()?.querySelector('[data-dialog-live]') || $('catalog-status'), value); }
  function notice(value) {
    const current = topDialog();
    let node = current?.querySelector('.view-notice');
    if (!node && current) { node = el('<div class="notice view-notice" role="status" aria-live="polite"></div>'); current.append(node); }
    node ||= $('catalog-notice'); text(node, value); node.hidden = !value;
    scheduleLayout();
  }
  async function send(command, payload = {}) {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) throw new Error('Open this page from the installed Studio.lab extension.');
    const response = await chrome.runtime.sendMessage({ action: 'slAccount', command, ...payload });
    if (response?.ok !== true) {
      if (response?.code === 'account_changed' && command !== 'status') {
        try { const fresh = await chrome.runtime.sendMessage({ action: 'slAccount', command: 'status' }); if (fresh?.ok === true && !stopped) updateAccount(fresh.status || null); } catch (_) {}
      }
      const error = new Error(message(response?.error || 'The catalog service did not respond. Reload Studio.lab and try again.'));
      error.code = response?.code || 'unavailable';
      throw error;
    }
    return response;
  }
  function checked(items, metadata = false) {
    if (!Array.isArray(items)) return [];
    return items.map(item => schema.sanitizeAsset(item, { metadata }));
  }
  function hasUiFocus() { return typeof document.hasFocus !== 'function' || document.hasFocus(); }
  function focus(node) {
    if (!node?.isConnected || node.disabled || node.hidden || !node.getClientRects().length) return false;
    node.focus({ preventScroll: true });
    return true;
  }
  function focusPage(node) {
    if (!node?.isConnected || node.hidden || !node.getClientRects().length) return;
    node.focus();
    node.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
  function signalParent(action, extra = {}) {
    if (embedded) window.parent.postMessage({ type: 'slCatalogUi', action, ...extra }, 'https://aistudio.google.com');
  }
  function openAccount() {
    if (embedded) signalParent('open-account');
    else window.location.href = 'account.html';
  }
  function installed(id) { return localItems.some(item => item.id === id); }
  function installation(asset) {
    const local = localItems.find(item => item.id === asset.id);
    if (!local) return 'missing';
    if (local.revision < asset.revision || asset.payload && JSON.stringify(local.payload) !== JSON.stringify(asset.payload)) return 'update';
    return 'current';
  }
  function activeCopy(asset) {
    return activeTheme?.id === asset.id && activeTheme.revision === asset.revision &&
      JSON.stringify(activeTheme.payload) === JSON.stringify(asset.payload);
  }
  function owned(id) { return !!account?.signedIn && ownItems.some(item => item.id === id); }
  function accountId(value = account) { return value?.signedIn ? value.user?.id || null : null; }
  function renderPausedDraft() {
    $('paused-draft').hidden = !pausedDraft;
    $('resume-draft').hidden = !pausedDraft || pausedDraft.owner !== null && pausedDraft.owner !== accountId();
    text($('paused-draft-description'), pausedDraft && (pausedDraft.owner === null || pausedDraft.owner === accountId()) ?
      'Your unsaved draft is ready to resume. It is retained only while this tab stays open.' :
      'An unsaved draft from your previous account is paused in this tab. Sign back into that account to resume, or discard the draft.');
  }
  function updateAccount(next, adoptAnonymousDraft = false) {
    const previous = accountId();
    const changed = !!account && previous !== accountId(next);
    const adopting = adoptAnonymousDraft && editorOwnerId === null && !editorAsset && $('editor-dialog').open && !!accountId(next);
    account = next;
    if (changed) {
      ++socialGeneration; ++socialReadGeneration; ++savedRequest; ++profileRequest; ++membershipRequest; social.clear(); moderationStates.clear(); ownProfile = null; publicProfile = null; discoveredProfile = null; renderDiscoveredProfile(); membership = null; detailModeration = null; moderationEditing = false; savedItems = []; profileItems = []; savedNext = null; previewRequest = null;
      closeView($('public-profile-dialog')); closeView($('create-dialog'));
      $('profile-list').replaceChildren();
      text($('public-profile-name'), ''); text($('public-profile-handle'), ''); text($('public-profile-stats'), '');
      renderProfile(); renderSaved();
      ++ownRequest;
      ownReading = false;
      ownItems = []; ownNext = null; ownOffset = 0;
      $('own-section').removeAttribute('aria-busy');
      $('refresh-own').removeAttribute('aria-disabled');
      if ($('editor-dialog').open && !adopting) {
        if (editorChanged()) pausedDraft = { owner: editorOwnerId, value: draft(), asset: editorAsset, original: editorOriginal };
        closeView($('discard-dialog')); closeView($('editor-dialog'));
        $('editor-form').reset();
        editorAsset = null; editorOriginal = ''; editorOwnerId = null;
      }
      if (confirmation && ['publish', 'unpublish', 'delete'].includes(confirmation.type)) {
        closeView($('confirm-dialog')); confirmation = null; confirmationTrigger = null;
        text($('confirm-title'), ''); text($('confirm-description'), '');
      }
      if (detailSource === 'own') {
        closeView($('detail-dialog')); detailAsset = null; detailSource = '';
        text($('detail-title'), ''); text($('detail-description'), ''); text($('detail-author'), '');
        text($('detail-text'), ''); $('detail-tags').replaceChildren(); $('detail-actions').replaceChildren();
        $('detail-actions').removeAttribute('data-asset'); $('owner-actions').replaceChildren();
      }
      renderOwn(); renderMarket(); renderDetailSocial();
      renderAccount();
      if (!adopting) { restoreDialogFocus();
      notice(pausedDraft ? 'Account changed. Your unsaved draft is paused and cannot be saved to another account.' : 'Account changed. Private items from the previous account were cleared.');
      announce('Account changed. The previous account’s private library is closed.'); }
    }
    if (adopting) editorOwnerId = accountId();
    renderAccount();
    renderPausedDraft();
    return changed;
  }
  async function stillSameAccount(owner) {
    const response = await send('status');
    updateAccount(response.status || null);
    if (!owner || accountId() !== owner) {
      notice('Your account changed. This action was not saved to another account.');
      return false;
    }
    return true;
  }
  function kindName(kind) { return kind === 'theme' ? 'Theme' : 'System prompt'; }
  function rememberSearch() { searchState[view] = { query: $('market-query').value.trim(), kind: marketKind() }; }
  function libraryFiltered() { const state = view === 'profile' ? searchState.profile : searchState.library; return !!state.query || state.kind !== 'all'; }
  function matchesLibrary(asset) {
    const { query, kind } = view === 'profile' ? searchState.profile : searchState.library;
    return (kind === 'all' || asset.kind === kind) && (!query || [asset.title, asset.description, asset.author_name, ...asset.tags].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  }
  function renderView() {
    if (embedded) searchState[view].query = hostQuery;
    $('library-view').hidden = view !== 'library'; $('market-view').hidden = view !== 'market'; $('profile-view').hidden = view !== 'profile';
    for (const [id, target] of [['browse-tab', 'market'], ['library-tab', 'library'], ['profile-tab', 'profile']]) { $(id).setAttribute('aria-selected', String(target === view)); $(id).tabIndex = target === view ? 0 : -1; }
    $('market-query').value = searchState[view].query;
    $('toolbar-create').hidden = view === 'profile';
    for (const radio of $$('input[name=market-kind]')) radio.checked = radio.value === searchState[view].kind;
    const label = view === 'library' ? 'Search saved items' : view === 'profile' ? 'Search your creations' : 'Search themes, prompts, or @creators';
    $('market-query').placeholder = label; text($('catalog-query-label'), label); $('market-search').setAttribute('aria-label', label);
    renderProfile(); syncInlineViews();
  }
  async function switchView(next, moveFocus = false) {
    if (busy || next === view) return;
    rememberSearch(); view = next; localOffset = 0; renderView(); renderLocal();
    if (moveFocus) focus($(next === 'market' ? 'browse-tab' : next === 'library' ? 'library-tab' : 'profile-tab'));
    await refreshCurrent();
  }
  function getFocusable(container) {
    return $$('button, a[href], input, select, textarea, summary, [tabindex]', container)
      .filter(node => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length > 0 &&
        getComputedStyle(node).visibility !== 'hidden' && !node.closest('[inert]'));
  }
  function topDialog() {
    return inlineStack.filter(node => node.open).at(-1) || null;
  }
  function inlineEditor(node = $('editor-dialog')) { return !!node; }
  function modalIsOpen() { return false; }
  function placeDialogs() { /* Market uses inline views; the parent owns its single scrollbar. */ }
  function openDialog(node, initialFocus) {
    $('main').append(node); node.setAttribute('role', 'region'); node.style.removeProperty('top'); node.style.removeProperty('max-height');
    viewTriggers.set(node, dialogTrigger);
    const oldIndex = inlineStack.indexOf(node); if (oldIndex >= 0) inlineStack.splice(oldIndex, 1); inlineStack.push(node);
    node.show(); syncInlineViews(); signalParent('dialog-close'); if (hasUiFocus()) focusPage(initialFocus);
  }
  function closeView(node) {
    if (!node?.open) return;
    const trigger = viewTriggers.get(node);
    const index = inlineStack.indexOf(node); if (index >= 0) inlineStack.splice(index, 1);
    viewTriggers.delete(node); node.close(); dialogTrigger = trigger || dialogTrigger;
    syncInlineViews();
  }
  function restoreDialogFocus() {
    scheduleLayout();
    if (topDialog()) { focus(dialogTrigger?.node) || focus(getFocusable(topDialog())[0]); return; }
    const target = dialogTrigger;
    dialogTrigger = null;
    if (focus(target?.node)) return;
    const buttons = $$('[data-asset-id] button');
    const match = buttons.find(node => node.closest('[data-asset-id]').dataset.assetId === target?.id &&
      node.dataset.control === target?.control);
    focus(match) || focus($(view === 'market' ? 'market-query' : 'own-heading')) || focus($('main'));
  }
  function rememberTrigger(node, asset) {
    dialogTrigger = { node, id: asset?.id, control: node?.dataset.control };
  }

  async function act(control, operation, success = '', editor = false) {
    if (busy || control?.getAttribute('aria-disabled') === 'true') return null;
    busy = true;
    const controlDialog = control?.closest('dialog');
    const controlKey = control?.dataset.control;
    clearError(editor);
    notice('');
    const buttons = $$('button').map(node => [node, node.getAttribute('aria-disabled')]);
    const inputs = $$('input, textarea, select').map(node => [node, node.disabled]);
    for (const [node] of buttons) node.setAttribute('aria-disabled', 'true');
    for (const [node] of inputs) node.disabled = true;
    if (!embedded || !$('editor-dialog').open) $('main').setAttribute('aria-busy', 'true');
    $('editor-form').setAttribute('aria-busy', 'true');
    control?.setAttribute('aria-busy', 'true');
    announce('Working…');
    try {
      const result = await operation();
      if (success && result !== null && !result?.accountChanged) { notice(success); announce(success); }
      return result;
    } catch (error) {
      showError(error, editor);
      return null;
    } finally {
      busy = false;
      for (const [node, old] of buttons) {
        if (old === null) node.removeAttribute('aria-disabled');
        else node.setAttribute('aria-disabled', old);
      }
      for (const [node, disabled] of inputs) node.disabled = disabled;
      control?.removeAttribute('aria-busy');
      $('main').removeAttribute('aria-busy');
      $('editor-form').removeAttribute('aria-busy');
      renderAccount();
      if ($('detail-dialog').open) renderDetailActions();
      scheduleLayout();
      if (hasUiFocus() && topDialog() && controlDialog?.open && (document.activeElement === document.body || document.activeElement === control)) {
        const replacement = controlKey && $$('[data-control]', controlDialog).find(node => node.dataset.control === controlKey);
        focus(control) || focus(replacement) || focus(getFocusable(controlDialog)[0]);
      }
      if (hasUiFocus() && !topDialog() && (document.activeElement === document.body || document.activeElement === control)) {
        focus(control) || focus($(view === 'market' ? 'market-query' : 'local-heading'));
      }
    }
  }
  function button(label, handler, options = {}) {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'button' + (options.primary ? ' primary' : '') + (options.danger ? ' danger-button' : '');
    node.textContent = label;
    if (options.control) node.dataset.control = options.control;
    if (options.name) node.setAttribute('aria-label', options.name);
    if (options.disabled) node.disabled = true;
    node.addEventListener('click', () => { if (!busy && node.getAttribute('aria-disabled') !== 'true') handler(node); });
    return node;
  }
  function icon(kind) {
    const wrap = document.createElement('div');
    wrap.className = 'asset-icon';
    wrap.setAttribute('aria-hidden', 'true');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', kind === 'theme' ? 'M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.7-3.1 1.5 1.5 0 0 1 1.2-2.4H18a3 3 0 0 0 3-3V12a9 9 0 0 0-9-9ZM7 10h.01M10 6.5h.01M15 7h.01M17.5 11h.01' : 'M6 3h9l4 4v14H6V3Zm9 0v5h4M9 12h7M9 16h5');
    svg.append(path); wrap.append(svg);
    return wrap;
  }
  function paletteThumbnail(node, asset, source) {
    if (asset.kind !== 'theme') return;
    const paint = full => {
      const valid = schema.validateAsset(full);
      if (valid.kind !== 'theme' || valid.id !== asset.id || valid.revision !== asset.revision ||
          source === 'market' && valid.visibility !== 'public' || !node.isConnected) return;
      node.classList.add('asset-palette');
      node.replaceChildren(...previewColors(valid.payload).slice(0, 3).map(color => {
        const swatch = document.createElement('span');
        swatch.style.backgroundColor = color;
        return swatch;
      }));
    };
    if (asset.payload) {
      requestAnimationFrame(() => { try { paint(asset); } catch (_) {} });
      return;
    }
    if (source !== 'market') return;
    const key = asset.id + ':' + asset.revision;
    if (!paletteCache.has(key)) {
      if (paletteCache.size >= 20) paletteCache.delete(paletteCache.keys().next().value);
      paletteCache.set(key, send('catalogGet', { id: asset.id }).then(response => schema.validateAsset(response.asset)));
    }
    // The list remains usable if a decorative preview cannot be fetched.
    paletteCache.get(key).then(paint).catch(() => { paletteCache.delete(key); });
  }
  function card(asset, source) {
    const article = document.createElement('article'); article.className = 'asset-card'; article.dataset.assetId = asset.id;
    const titleId = source + '-' + asset.id + '-title'; article.setAttribute('aria-labelledby', titleId);
    const thumbnail = icon(asset.kind); thumbnail.classList.add('asset-cover');
    const cover = button('', node => showDetail(asset, source, node), { control: 'cover', name: 'Open ' + asset.title }); cover.classList.add('asset-cover-button'); cover.append(thumbnail);
    const copy = document.createElement('div'); copy.className = 'asset-copy';
    const kind = document.createElement('p'); kind.className = 'asset-kind'; kind.textContent = kindName(asset.kind);
    const title = document.createElement('h3'); title.id = titleId;
    title.append(button(asset.title, node => showDetail(asset, source, node), { control: 'preview', name: 'Open ' + asset.title }));
    const description = document.createElement('p'); description.className = 'asset-description'; description.textContent = asset.description || (asset.kind === 'theme' ? 'A color palette for Google AI Studio.' : 'Reusable instructions for your chats.');
    const meta = document.createElement('div'); meta.className = 'asset-meta';
    const state = social.get(asset.id);
    if (state?.author) meta.append(creatorButton(state.author, true));
    else if (asset.author_name) { const author = document.createElement('span'); author.className = 'asset-author'; author.textContent = asset.author_name; meta.append(author); }
    const removed = source === 'own' && moderationStates.get(asset.id)?.removed === true;
    const badge = document.createElement('span'); badge.className = 'visibility-badge'; badge.textContent = source === 'own' ? removed ? 'Removed from Market' : asset.visibility === 'public' ? 'Published' : 'Draft' : source === 'local' ? activeCopy(asset) ? 'Active theme' : 'On this device' : state?.saved ? 'Saved' : ''; if (removed) badge.classList.add('removed-badge'); meta.append(badge);
    copy.append(kind, title, description, meta);
    if (removed) { const note = document.createElement('p'); note.className = 'removal-note'; note.textContent = moderationStates.get(asset.id).reason || 'A moderator removed this publication from Market.'; copy.append(note); }
    if (asset.visibility === 'public' && !['own', 'local'].includes(source)) {
      const actions = document.createElement('div'); actions.className = 'asset-social';
      const like = button(String(state?.likes || 0), node => socialAction('like', node, asset), { control: 'like', name: (state?.liked ? 'Unlike ' : 'Like ') + asset.title }); like.prepend(socialIcon('like')); like.setAttribute('aria-pressed', String(!!state?.liked));
      const save = button(state?.saved ? 'Saved' : 'Save', node => socialAction('save', node, asset), { control: 'bookmark', name: (state?.saved ? 'Unsave ' : 'Save ') + asset.title }); save.prepend(socialIcon('save')); save.setAttribute('aria-pressed', String(!!state?.saved)); actions.append(like, save); copy.append(actions);
    }
    article.append(cover, copy); paletteThumbnail(thumbnail, asset, source === 'saved' || source === 'profile' ? 'market' : source); return article;
  }
  function renderLocal() {
    const items = localItems.filter(matchesLibrary);
    if (localOffset >= items.length) localOffset = Math.max(0, Math.floor((items.length - 1) / pageSize) * pageSize);
    $('local-list').replaceChildren(...items.slice(localOffset, localOffset + pageSize).map(item => card(item, 'local')));
    $('local-empty').hidden = items.length > 0;
    text($('local-empty'), libraryFiltered() ? 'No device copies match this search.' : 'No device copies yet. Open a discovery to use it, or import a JSON file.');
    $('reset-theme').hidden = !activeTheme;
    text($('active-theme'), activeTheme ? 'Active theme: ' + (activeTheme.title || 'Custom theme') : 'The Google AI Studio theme is active.');
    $('local-pagination').hidden = items.length <= pageSize;
    $('previous-local').disabled = localOffset === 0;
    $('next-local').disabled = localOffset + pageSize >= items.length;
    text($('local-page'), items.length ? (localOffset + 1) + '–' + Math.min(localOffset + pageSize, items.length) + ' of ' + items.length : '');
    scheduleLayout();
  }
  function renderOwn() {
    $('own-list').replaceChildren(...ownItems.map(item => card(item, 'own')));
    $('own-empty').hidden = ownItems.length > 0 || ownReading;
    text($('own-empty'), libraryFiltered() ? 'No creations match this search.' : 'Create your first theme or system prompt. Choose Save draft or Publish in the same editor.');
    $('more-own').hidden = ownNext === null;
    $('previous-own').hidden = ownOffset === 0;
    $('previous-own').setAttribute('aria-disabled', String(ownReading));
    text($('own-page'), ownItems.length ? 'Items ' + (ownOffset + 1) + '–' + (ownOffset + ownItems.length) : '');
    $('more-own').setAttribute('aria-disabled', String(ownReading));
    scheduleLayout();
  }
  function renderMarket() {
    $('market-list').replaceChildren(...marketItems.map(item => card(item, 'market')));
    $('market-empty').hidden = marketItems.length > 0 || marketReading;
    const filtered = !!searchState.market.query || searchState.market.kind !== 'all';
    const creatorSearch = /^@[a-z][a-z0-9_]{2,23}$/i.test(searchState.market.query);
    text($('market-empty'), creatorSearch ? discoveredProfile ? searchState.market.kind === 'all' ? 'This creator has not published anything yet.' : 'This creator has no published creations of this type yet.' : 'No profile has this @tag. Check the spelling and try again.' : filtered ? 'No matching items. Try another name, tag, or item type.' : 'The community is getting started. New themes and prompts will appear here.');
    text($('market-count'), marketReading ? 'Loading the Market…' : marketItems.length ? 'Items ' + (marketOffset + 1) + '–' + (marketOffset + marketItems.length) + (filtered ? ' matching your search' : ' in the Market') : 'No items' + (filtered ? ' matching your search' : ' in the Market'));
    $('more-market').hidden = marketNext === null;
    $('previous-market').hidden = marketOffset === 0;
    $('previous-market').setAttribute('aria-disabled', String(marketReading));
    $('more-market').setAttribute('aria-disabled', String(marketReading));
    scheduleLayout();
  }
  function renderAccount() {
    const signedIn = !!account?.signedIn;
    $('create-asset').disabled = !account;
    $('toolbar-create').disabled = !account;
    $('toolbar-create').hidden = view === 'profile';
    $('signin-note').hidden = !account || signedIn;
    $('own-section').hidden = false;
    $('refresh-own').hidden = !signedIn;
    if (!signedIn && ownItems.length) { ownItems = []; ownNext = null; renderOwn(); }
    renderPausedDraft(); renderProfile(); syncEditorPublishing();
    scheduleLayout();
  }
  function marketKind() { return document.querySelector('input[name=market-kind]:checked')?.value || 'all'; }
  async function refreshLocal() {
    const response = await send('catalogLocal');
    localItems = checked(response.items);
    activeTheme = response.activeTheme || null;
    modernEnabled = response.modernEnabled === true;
    renderLocal();
    updateInstalled();
  }
  async function refreshOwn(offset = 0) {
    if (!account?.signedIn) return;
    const request = ++ownRequest;
    ownReading = true;
    $('own-section').setAttribute('aria-busy', 'true');
    $('refresh-own').setAttribute('aria-disabled', 'true');
    $('more-own').setAttribute('aria-disabled', 'true');
    try {
      const owner = accountId();
      let response;
      if (libraryFiltered()) {
        const all = [];
        let cursor = 0;
        for (let page = 0; page < 5; page++) {
          const part = await send('catalogList', { offset: cursor, limit: 20, expectedUserId: owner });
          if (request !== ownRequest || stopped || owner !== accountId()) return;
          all.push(...checked(part.items, true));
          if (!Number.isInteger(part.nextOffset)) break;
          cursor = part.nextOffset;
        }
        const matches = all.filter(matchesLibrary);
        response = { items: matches.slice(offset, offset + pageSize), nextOffset: offset + pageSize < matches.length ? offset + pageSize : null };
      } else response = await send('catalogList', { offset, limit: pageSize, expectedUserId: owner });
      if (request !== ownRequest || stopped) return;
      const items = checked(response.items, true);
      await Promise.all([readSocial(items), readOwnModeration(items)]); if (request !== ownRequest || owner !== accountId() || stopped) return;
      ownItems = items;
      ownOffset = offset;
      ownNext = Number.isInteger(response.nextOffset) ? response.nextOffset : null;
    } finally {
      if (request === ownRequest) {
        ownReading = false;
        $('own-section').removeAttribute('aria-busy');
        $('refresh-own').removeAttribute('aria-disabled');
        renderOwn();
      }
    }
  }
  async function refreshMarket(offset = 0) {
    const request = ++marketRequest;
    discoveredProfile = null; renderDiscoveredProfile();
    marketReading = true;
    $('market-list').setAttribute('aria-busy', 'true');
    text($('market-count'), 'Loading the Market…');
    $('market-empty').hidden = true;
    $('more-market').setAttribute('aria-disabled', 'true');
    clearError();
    try {
      const query = searchState.market.query, creatorSearch = /^@[a-z][a-z0-9_]{2,23}$/i.test(query);
      const creator = creatorSearch ? await findCreator(query, request) : null;
      if (request !== marketRequest || stopped) return;
      const owner = accountId();
      const response = creatorSearch ? creator ? await send('profileAssets', { profileId: creator.id, kind: searchState.market.kind, offset, limit: pageSize, ...(owner ? { expectedUserId: owner } : { anonymous: true }) }) : { items: [], nextOffset: null } : await send('catalogSearch', { query, kind: searchState.market.kind, offset, limit: pageSize });
      if (request !== marketRequest || stopped) return;
      const items = checked(response.items, true);
      await readSocial(items); if (request !== marketRequest || stopped) return;
      marketItems = items;
      marketOffset = offset;
      marketNext = Number.isInteger(response.nextOffset) ? response.nextOffset : null;
      marketReading = false;
      renderMarket();
    } catch (error) {
      if (request === marketRequest && !stopped) {
        marketReading = false;
        text($('market-count'), 'The Market could not be loaded.');
        $('market-empty').hidden = true;
        showError(error);
      }
    } finally {
      if (request === marketRequest) {
        marketReading = false;
        $('market-list').removeAttribute('aria-busy');
        $('more-market').removeAttribute('aria-disabled');
        $('previous-market').removeAttribute('aria-disabled');
      }
    }
  }
  function updateInstalled() {
    if ($('detail-dialog').open) renderDetailActions();
  }
  async function loadAsset(asset, source) {
    if (source === 'local') return schema.sanitizeAsset(asset);
    const response = await send('catalogGet', { id: asset.id });
    return schema.sanitizeAsset(response.asset);
  }
  async function showDetail(asset, source, control) {
    const requestOwner = accountId(), generation = socialGeneration;
    const result = await act(control, () => loadAsset(asset, source));
    if (!result || requestOwner !== accountId() || generation !== socialGeneration || stopped) return;
    const detailOwner = accountId(); await readSocial([result]).catch(() => {});
    if (detailOwner !== accountId() || stopped) return;
    detailAsset = result;
    detailSource = source;
    detailModeration = moderationStates.get(result.id) || null; moderationEditing = false; $('moderation-reason').value = ''; $('moderation-result').hidden = true;
    text($('detail-notice'), ''); $('detail-notice').hidden = true;
    text($('detail-error'), ''); $('detail-error').hidden = true;
    rememberTrigger(control, asset);
    text($('detail-title'), result.title);
    text($('detail-kind'), kindName(result.kind));
    text($('detail-description'), result.description || '');
    $('detail-description').hidden = !result.description;
    text($('detail-author'), [!social.get(result.id)?.author && result.author_name ? 'By ' + result.author_name : '', 'Version ' + result.revision, owned(result.id) ? result.visibility === 'public' ? 'Published' : 'Private to your account' : ''].filter(Boolean).join(' · '));
    $('detail-tags').replaceChildren(...result.tags.map(tag => { const node = document.createElement('span'); node.className = 'tag'; node.textContent = tag; return node; }));
    $('detail-theme-preview').hidden = result.kind !== 'theme';
    $('detail-prompt').hidden = result.kind !== 'prompt';
    if (result.kind === 'theme') applyPreview($('detail-theme-preview'), result.payload);
    else text($('detail-text'), result.payload.text);
    text($('detail-back'), source === 'profile' ? 'Back to profile' : source === 'own' ? 'Back to your creations' : source === 'local' || source === 'saved' ? 'Back to saved items' : 'Back to discoveries');
    renderDetailActions(); renderDetailSocial();
    openDialog($('detail-dialog'), $('detail-title'));
    if (membership?.capabilities?.moderate === true || source === 'own' || owned(result.id)) refreshDetailModeration(result.id).catch(showError);
  }
  function renderDetailActions() {
    if (!detailAsset) return;
    const asset = detailAsset;
    const saved = installation(asset);
    text($('detail-installed'), saved === 'current' ? 'A device copy is available offline.' : saved === 'update' ?
      'An update is available. Update replaces the installed copy; Use applies the updated item immediately.' : 'Use applies this item to Google AI Studio. Keep a device copy for offline access.');
    const signature = asset.id + '|' + asset.kind + '|' + modernEnabled;
    if ($('detail-actions').dataset.asset !== signature) {
      $('detail-actions').dataset.asset = signature;
      $('detail-actions').replaceChildren(
        button('Keep on this device', node => installAsset(detailAsset, node), { control: 'install' }),
        button(asset.kind === 'theme' ? modernEnabled ? 'Use theme' : 'Enable Modern Web Chat and use' : 'Use prompt', node => useAsset(detailAsset, node), { primary: true, control: 'use' }),
        button('Download JSON', node => downloadAsset(detailAsset, node), { control: 'download' })
      );
    }
    const install = $('detail-actions').querySelector('[data-control=install]');
    text(install, saved === 'current' ? 'On this device' : saved === 'update' ? 'Update device copy' : 'Keep on this device');
    // Keep the initiating control focusable even after it becomes Installed.
    install.setAttribute('aria-disabled', String(saved === 'current' || busy));
    const own = detailSource === 'own' && owned(asset.id);
    if (own) text($('detail-author'), ['Version ' + asset.revision, detailModeration?.removed ? 'Removed from Market' : asset.visibility === 'public' ? 'Published' : 'Draft'].join(' · '));
    const local = detailSource === 'local';
    $('owner-actions').hidden = !own && !local;
    $('owner-actions').replaceChildren();
    if (own) $('owner-actions').append(
      button('Edit', node => { const item = detailAsset; closeDetail(false); showEditor(item, node, true); }, { control: 'edit', disabled: asset.kind === 'theme' && !desktopDevice() }),
      button(detailModeration?.removed ? 'Removed from Market' : asset.visibility === 'public' ? 'Unpublish' : 'Publish in Market', node => ask(detailAsset.visibility === 'public' ? 'unpublish' : 'publish', detailAsset, node), { control: 'publish', disabled: detailModeration?.removed === true }),
      button('Delete', node => ask('delete', detailAsset, node), { danger: true, control: 'delete' })
    );
    if (!own && account?.signedIn) {
      $('owner-actions').hidden = false;
      $('owner-actions').append(button(asset.kind === 'theme' ? 'Customize a copy' : 'Edit a copy', node => {
        const item = detailAsset; closeDetail(false); showEditor(item, node, true, true);
      }, { control: 'copy', disabled: asset.kind === 'theme' && !desktopDevice() }));
    }
    if (local) $('owner-actions').append(button('Remove from this device', node => ask('remove', detailAsset, node), { danger: true, control: 'remove' }));
    renderModeration();
  }
  function renderModeration() {
    const canModerate = membership?.capabilities?.moderate === true;
    const allowed = detailAsset && (canModerate && detailAsset.visibility === 'public' || detailModeration?.removed);
    $('moderation-panel').hidden = !allowed;
    if (!allowed) return;
    const removed = detailModeration?.removed === true, restore = removed && detailModeration?.can_restore === true;
    text($('moderation-description'), removed ? 'This publication was removed from Market.' + (detailModeration.reason ? ' ' + detailModeration.reason : '') : 'Remove this publication only when it breaks Market rules.');
    text($('moderation-toggle'), restore ? 'Restore to Market' : 'Remove from Market');
    $('moderation-toggle').hidden = !canModerate || removed && !restore;
    $('moderation-toggle').disabled = busy;
    $('moderation-form').hidden = !canModerate || !moderationEditing;
    text($('moderation-submit'), restore ? 'Confirm restoration' : 'Confirm removal');
    $('moderation-reason').placeholder = restore ? 'Explain why this publication can return to Market.' : 'Name the rule and explain how this publication breaks it.';
  }
  async function refreshDetailModeration(id) {
    const owner = accountId(), generation = socialGeneration;
    if (!owner) return;
    const result = await send('catalogModeration', { ids: [id], expectedUserId: owner });
    if (owner !== accountId() || generation !== socialGeneration || detailAsset?.id !== id || stopped) return;
    detailModeration = (result.items || []).find(item => item.id === id) || null;
    if (detailModeration) moderationStates.set(id, detailModeration); else moderationStates.delete(id);
    renderDetailActions(); scheduleLayout();
  }
  async function submitModeration(event) {
    event.preventDefault(); if (busy || !detailAsset || membership?.capabilities?.moderate !== true) return;
    const asset = detailAsset, owner = accountId(), removed = detailModeration?.removed !== true;
    if (!removed && detailModeration?.can_restore !== true) return;
    const reason = $('moderation-reason').value.trim().replace(/\s+/g, ' ');
    if (reason.length < 10 || reason.length > 500) { showError('Add the rule and a reason between 10 and 500 characters.'); return; }
    const result = await act($('moderation-submit'), async () => {
      if (!await stillSameAccount(owner)) return null;
      return send('catalogModerate', { id: asset.id, removed, reason, expectedUserId: owner });
    });
    if (!result?.moderation || owner !== accountId() || detailAsset?.id !== asset.id) return;
    detailModeration = result.moderation; moderationStates.set(asset.id, result.moderation); moderationEditing = false; $('moderation-reason').value = '';
    text($('moderation-result'), removed ? 'Removed from Market. The author keeps their creation; the moderation reason is recorded.' : 'Restored to Market.'); $('moderation-result').hidden = false;
    renderModeration();
    await refreshMarket(); await refreshSaved().catch(showError); if (publicProfile) await refreshPublicProfile().catch(showError); if (account?.signedIn) await refreshOwn().catch(showError);
    scheduleLayout();
  }
  function closeDetail(restore = true) {
    if (busy) return;
    closeView($('detail-dialog'));
    detailAsset = null;
    detailSource = '';
    detailModeration = null; moderationEditing = false; $('moderation-panel').hidden = true;
    if (restore) restoreDialogFocus();
  }
  async function installAsset(asset, control) {
    const updating = installation(asset) === 'update';
    const owner = accountId();
    const response = await act(control, async () => {
      if (owner && !await stillSameAccount(owner)) return null;
      const result = await send('catalogInstall', { ...(asset.payload ? { asset } : { id: asset.id }), ...(owner ? { expectedUserId: owner } : {}) });
      if (owner && owner !== accountId()) return null;
      storeInstalled(result.asset);
      await refreshLocal().catch(error => showError('The item was installed, but the library could not refresh. ' + message(error)));
      return result;
    }, asset.title + (updating ? ' updated. Your current theme and chat instructions were retained.' : ' installed. Use it when you’re ready.'));
    return response;
  }
  async function useAsset(asset, control, expectedOwner = accountId()) {
    const owner = expectedOwner;
    await act(control, async () => {
      if (owner && !await stillSameAccount(owner)) return null;
      let response;
      try { response = await send('catalogUse', { ...(asset.payload ? { asset } : { id: asset.id }), ...(owner ? { expectedUserId: owner } : {}), ...(asset.kind === 'theme' && !modernEnabled ? { enableModern: true } : {}) }); }
      catch (error) { if (error.code === 'modern_chat_required') modernEnabled = false; throw error; }
      if (owner && owner !== accountId()) return null;
      if (response.applied !== true) throw new Error('The item was saved, but Google AI Studio did not confirm that it was applied. Try Use again from the library.');
      const applied = schema.sanitizeAsset(response.asset);
      if (applied.kind === 'theme') { activeTheme = applied; modernEnabled = true; }
      storeInstalled(applied);
      await refreshLocal().catch(error => showError('The item was applied, but the library could not refresh. ' + message(error)));
      return response;
    }, asset.kind === 'theme' ? asset.title + ' is now your active theme.' : asset.title + ' added to your library and applied to this chat’s system instructions.');
  }
  function storeInstalled(value) {
    const asset = schema.sanitizeAsset(value);
    localItems = [asset, ...localItems.filter(item => item.id !== asset.id)];
    renderLocal(); updateInstalled();
  }
  function storeCreation(value) {
    const asset = schema.sanitizeAsset(value);
    const { payload, ...metadata } = asset;
    ownItems = [metadata, ...ownItems.filter(item => item.id !== asset.id)].slice(0, pageSize);
    renderOwn();
    return asset;
  }
  function downloadAsset(asset, control) {
    try {
      const safe = schema.sanitizeAsset(asset);
      const file = { schemaVersion: 1, asset: safe };
      const blob = new Blob([JSON.stringify(file, null, 2) + '\n'], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'studio-lab-' + safe.kind + '-' + safe.title.replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) + '.json';
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      announce(safe.title + ' downloaded as JSON.');
      focus(control);
    } catch (error) { showError(error); }
  }
  async function importAsset() {
    const file = $('import-json').files?.[0];
    $('import-json').value = '';
    if (!file || busy) return;
    const result = await act($('import-asset'), async () => {
      if (file.size > 70000) throw new Error('Choose a Studio.lab JSON file smaller than 70 KB.');
      let value;
      try { value = JSON.parse(await file.text()); }
      catch (_) { throw new Error('This file is not valid JSON. Choose a file exported from Studio.lab.'); }
      if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== 1 ||
          Object.keys(value).sort().join('|') !== 'asset|schemaVersion') throw new Error('This is not a supported Studio.lab export.');
      const asset = schema.sanitizeAsset(value.asset);
      const installed = await send('catalogInstall', { asset });
      storeInstalled(installed.asset);
      await refreshLocal().catch(error => showError('The file was imported, but the library could not refresh. ' + message(error)));
      return asset;
    });
    if (result) { notice(result.title + ' imported. Use it from your library when you’re ready.'); announce(result.title + ' imported without changing this chat or your active theme.'); }
  }

  function themeMode() { return document.querySelector('input[name=theme-mode]:checked')?.value || 'dark'; }
  function defaultTheme(mode) {
    return schema.DEFAULT_THEMES[mode] || schema.DEFAULT_THEMES.dark;
  }
  function createColorFields() {
    const groups = [['Chat', '--sl-mwc-'], ['Google AI Studio', '--color-v3-']];
    $('color-fields').replaceChildren(...groups.map(([title, prefix], groupIndex) => {
      const section = document.createElement('section'); section.className = 'token-section';
      const heading = document.createElement('h4'); heading.textContent = title; heading.id = 'token-group-' + groupIndex;
      section.setAttribute('aria-labelledby', heading.id);
      const grid = document.createElement('div'); grid.className = 'color-fields token-grid';
      grid.append(...Object.entries(colorNames).filter(([key]) => key.startsWith(prefix)).map(([key, label]) => {
        const field = document.createElement('div'); field.className = 'color-field';
        const name = document.createElement('label'); name.htmlFor = 'color-' + key; name.textContent = label;
        const row = document.createElement('div'); row.className = 'color-inputs';
        const picker = document.createElement('input'); picker.type = 'color'; picker.id = 'picker-' + key; picker.defaultValue = '#000000';
        picker.setAttribute('aria-label', 'Choose ' + label.toLowerCase() + ' color');
        const input = document.createElement('input'); input.type = 'text'; input.id = 'color-' + key;
        input.maxLength = 7; input.pattern = '#[0-9a-fA-F]{6}'; input.required = true; input.autocomplete = 'off'; input.spellcheck = false;
        input.setAttribute('aria-describedby', 'contrast-help contrast-status');
        picker.addEventListener('input', () => { input.value = picker.value; updateThemePreview(); });
        input.addEventListener('input', () => { if (/^#[0-9a-f]{6}$/i.test(input.value)) picker.value = input.value; updateThemePreview(); });
        row.append(picker, input); field.append(name, row);
        if (schema.THEME_OPACITY_TOKENS.includes(key)) {
          const opacityRow = document.createElement('div'); opacityRow.className = 'opacity-field';
          const opacityLabel = document.createElement('label'); opacityLabel.className = 'visually-hidden'; opacityLabel.htmlFor = 'opacity-' + key; opacityLabel.textContent = 'Opacity';
          const opacity = document.createElement('input'); opacity.type = 'number'; opacity.id = 'opacity-' + key;
          opacity.min = '0'; opacity.max = '100'; opacity.step = 'any'; opacity.required = true; opacity.inputMode = 'decimal';
          opacity.setAttribute('aria-label', label + ' opacity'); opacity.addEventListener('input', updateThemePreview);
          const percent = document.createElement('span'); percent.textContent = '%'; percent.setAttribute('aria-hidden', 'true');
          opacityRow.append(opacityLabel, opacity, percent); row.append(opacityRow);
        }
        return field;
      }));
      section.append(heading, grid); return section;
    }));
  }
  function fillTheme(value) {
    const theme = schema.upgradeTheme(value);
    editorThemeMode = theme.mode;
    for (const node of $$('input[name=theme-mode]')) node.checked = node.value === theme.mode;
    for (const key of Object.keys(colorNames)) { $('color-' + key).value = theme.tokens[key]; $('picker-' + key).value = theme.tokens[key]; }
    for (const key of schema.THEME_OPACITY_TOKENS) $('opacity-' + key).value = Number((theme.opacity[key] * 100).toPrecision(15));
    updateThemePreview();
  }
  function switchThemeMode() {
    const nextMode = themeMode();
    if (busy || nextMode === editorThemeMode) return;
    const previous = defaultTheme(editorThemeMode), next = defaultTheme(nextMode);
    for (const key of Object.keys(colorNames)) {
      const input = $('color-' + key);
      if (input.value.trim().toLowerCase() !== previous.tokens[key]) continue;
      input.value = next.tokens[key]; $('picker-' + key).value = next.tokens[key];
    }
    for (const key of schema.THEME_OPACITY_TOKENS) {
      const input = $('opacity-' + key);
      const amount = input.value.trim() === '' ? NaN : Number(input.value) / 100;
      if (!Number.isFinite(amount) || Math.abs(amount - previous.opacity[key]) > 1e-12) continue;
      input.value = Number((next.opacity[key] * 100).toPrecision(15));
    }
    editorThemeMode = nextMode;
    updateThemePreview();
  }
  function readTheme() {
    const tokens = Object.fromEntries(Object.keys(colorNames).map(key => [key, $('color-' + key).value.trim()]));
    tokens['--sl-mwc-border'] = 'transparent';
    const opacity = Object.fromEntries(schema.THEME_OPACITY_TOKENS.map(key => [key, $('opacity-' + key).value.trim() === '' ? NaN : Number($('opacity-' + key).value) / 100]));
    return { version: 2, mode: themeMode(), tokens, opacity };
  }
  function previewColors(value) {
    const theme = schema.upgradeTheme(value);
    return ['--sl-mwc-surface','--sl-mwc-raised','--sl-mwc-accent','--sl-mwc-text'].map(key => theme.tokens[key]);
  }
  function applyPreview(node, theme) {
    const palette = node.querySelector('.preview-palette');
    if (!palette) return;
    palette.replaceChildren(...previewColors(theme).map(color => { const swatch = document.createElement('span'); swatch.style.backgroundColor = color; return swatch; }));
  }
  function updateThemePreview() {
    const theme = readTheme();
    let valid = true;
    for (const key of Object.keys(colorNames)) {
      const invalid = !/^#[0-9a-f]{6}$/i.test(theme.tokens[key]);
      $('color-' + key).setAttribute('aria-invalid', String(invalid));
      if (invalid) valid = false;
    }
    for (const key of schema.THEME_OPACITY_TOKENS) { const invalid = !Number.isFinite(theme.opacity[key]) || theme.opacity[key] < 0 || theme.opacity[key] > 1; $('opacity-' + key).setAttribute('aria-invalid', String(invalid)); if (invalid) valid = false; }
    let feedback = '';
    try { schema.validateTheme(theme); if (valid) applyPreview($('theme-preview'), theme); feedback = 'Readable contrast. Your theme is ready to save.'; }
    catch (error) { valid = false; feedback = message(error); }
    showContrastFeedback(valid, feedback);
  }
  function setEditorKind() {
    const kind = $('asset-kind').value;
    if (kind === 'theme' && !desktopDevice()) { $('asset-kind').value = 'prompt'; return setEditorKind(); }
    $('theme-fields').hidden = kind !== 'theme';
    $('prompt-fields').hidden = kind !== 'prompt';
    $('prompt-text').required = kind === 'prompt';
    for (const key of Object.keys(colorNames)) { $('color-' + key).required = kind === 'theme'; $('color-' + key).disabled = kind !== 'theme'; $('picker-' + key).disabled = kind !== 'theme'; }
    for (const key of schema.THEME_OPACITY_TOKENS) { $('opacity-' + key).required = kind === 'theme'; $('opacity-' + key).disabled = kind !== 'theme'; }
  }
  function draft() {
    return {
      ...(editorAsset ? { id: editorAsset.id } : {}), kind: $('asset-kind').value,
      title: $('asset-title').value.trim(), description: $('asset-description').value.trim(),
      author_name: ownProfile?.nickname || $('asset-author').value.trim(), tags: $('asset-tags').value.split(',').map(tag => tag.trim()).filter(Boolean),
      visibility: editorVisibility(), payload: $('asset-kind').value === 'theme' ? readTheme() : { version: 1, text: $('prompt-text').value }
    };
  }
  function assetDraft(asset, visibility = asset.visibility) {
    return { id: asset.id, kind: asset.kind, title: asset.title, description: asset.description,
      author_name: asset.author_name, tags: asset.tags, visibility, payload: asset.payload };
  }
  function editorVisibility() { return document.querySelector('input[name=asset-visibility]:checked')?.value || 'private'; }
  function syncEditorPublishing() {
    if (!$('editor-dialog').open) return;
    const blocked = moderationStates.get(editorAsset?.id)?.removed === true;
    const publishChoice = document.querySelector('input[name=asset-visibility][value=public]');
    publishChoice.disabled = busy || blocked;
    if (blocked && publishChoice.checked) { publishChoice.checked = false; document.querySelector('input[name=asset-visibility][value=private]').checked = true; }
    const publishing = editorVisibility() === 'public';
    text($('editor-save'), editorAsset && editorAsset.visibility === editorVisibility() ? 'Save changes' : publishing ? 'Publish' : 'Save draft');
    text($('publishing-summary'), publishing ? ownProfile ? 'Everyone can read, use, and save this creation. Published as ' + ownProfile.nickname + ' · @' + ownProfile.handle + '.' : account?.signedIn ? 'Your public nickname and @tag will be assigned automatically when you publish. You can change them in Account.' : 'Sign in to publish. Your public nickname and @tag are assigned automatically; you can change them in Account.' : editorAsset?.visibility === 'public' ? 'This creation will become private. People who already kept a device copy retain it.' : 'This draft is visible only to you. You can publish it later from this editor.');
    text($('editor-help'), account?.signedIn ? 'Save a draft for yourself or share this creation in Market.' : 'Write your draft now. Sign in when you save or publish; your draft stays here.');
    if (blocked) text($('publishing-summary'), 'This publication was removed from Market. You can edit and save a draft. It can be published again after Studio.lab restores access.');
  }
  function editorChanged() { return JSON.stringify(draft()) !== editorOriginal; }
  async function showEditor(asset = null, control = $('create-asset'), fromDetail = false, copy = false, resumeHeld = null, createKind = 'prompt') {
    if (busy || !account || asset && !account.signedIn) return;
    const canResume = () => resumeHeld === pausedDraft && resumeHeld?.owner === accountId();
    const reviewPaused = () => {
      const message = 'Resume or explicitly discard your paused draft before opening another editor.';
      notice(message); announce(message);
      if (!topDialog()) focus($('resume-draft')) || focus($('discard-paused-draft'));
    };
    if (pausedDraft && !canResume()) { reviewPaused(); return; }
    const requestOwner = accountId(), generation = socialGeneration;
    let full = null;
    if (asset) {
      full = asset.payload ? schema.sanitizeAsset(asset) : await act(control, () => loadAsset(asset, 'own'));
      if (!full) { if (fromDetail) restoreDialogFocus(); return; }
    }
    if (requestOwner !== accountId() || generation !== socialGeneration || stopped) return;
    if (pausedDraft && !canResume()) { reviewPaused(); return; }
    if ((full?.kind || createKind) === 'theme' && !desktopDevice()) { notice('Create and edit themes on a computer. You can still save and use them here.'); return; }
    closeView($('create-dialog'));
    editorAsset = copy ? null : full;
    editorOwnerId = accountId();
    if (!fromDetail) rememberTrigger(!asset && ['create-theme','create-prompt'].includes(control?.id) ? $('create-asset') : control, asset);
    clearError(true);
    $('editor-form').reset();
    for (const node of $$('input[name=asset-visibility]')) node.checked = node.value === (!copy && full?.visibility === 'public' && !moderationStates.get(full.id)?.removed ? 'public' : 'private');
    $('asset-kind').value = full?.kind || createKind;
    $('asset-kind').disabled = !!full && !copy;
    $('asset-title').value = copy ? (full.title + ' copy').slice(0, 80) : full?.title || '';
    $('asset-description').value = full?.description || '';
    $('asset-author').value = ownProfile?.nickname || (copy ? '' : full?.author_name || '');
    $('asset-tags').value = full?.tags.join(', ') || '';
    $('prompt-text').value = full?.kind === 'prompt' ? full.payload.text : '';
    fillTheme(full?.kind === 'theme' ? full.payload : defaultTheme(viewport?.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')));
    setEditorKind();
    text($('editor-title'), copy ? full.kind === 'theme' ? 'Customize a theme copy' : 'Edit a prompt copy' : full ? 'Edit ' + kindName(full.kind).toLowerCase() : 'Create a ' + kindName(createKind).toLowerCase());

    text($('prompt-count'), $('prompt-text').value.length.toLocaleString() + ' / 16,000 characters');
    editorOriginal = JSON.stringify(draft());
    openDialog($('editor-dialog'), $('asset-title'));
    syncEditorPublishing();
  }
  function closeEditor(discard = false) {
    if (busy) return;
    if (!discard && editorChanged()) {
      discardPaused = false;
      text($('discard-title'), 'Discard your changes?'); text($('discard-description'), 'Your unsaved changes will be lost. Keep editing to save them.'); text($('discard-keep'), 'Keep editing');
      discardTrigger = document.activeElement;
      openDialog($('discard-dialog'), $('discard-keep'));
      return;
    }
    closeView($('editor-dialog'));
    editorAsset = null;
    editorOriginal = '';
    editorOwnerId = null;
    { view = 'profile'; renderView(); renderLocal(); renderOwn(); }
    restoreDialogFocus();
  }
  async function saveEditor(event) {
    event.preventDefault();
    if (busy) return;
    if ($('asset-kind').value === 'theme' && !desktopDevice()) { showError('Create and edit themes on a computer.', true); return; }
    clearError(true);
    let value;
    // Validate content before OAuth. Public identity is obtained from the signed-in profile.
    try { value = schema.validateDraft({ ...draft(), visibility: 'private' }); }
    catch (error) { showError(error, true); focus($('editor-error')); return; }
    const visibility = editorVisibility();
    const response = await act($('editor-save'), async () => {
      if (!account?.signedIn) {
        const login = await send('login');
        if (stopped || !login.status?.signedIn || !$('editor-dialog').open) return null;
        updateAccount(login.status, true);
      }
      if (!await stillSameAccount(editorOwnerId)) return { accountChanged: true };
      if (visibility === 'public') await refreshProfile();
      if (editorOwnerId !== accountId() || !$('editor-dialog').open) return { accountChanged: true };
      value = schema.validateDraft({ ...value, visibility, author_name: ownProfile?.nickname || value.author_name });
      const result = await send('catalogSave', { asset: { ...value, ...(editorAsset ? { id: editorAsset.id } : {}) }, expectedRevision: editorAsset?.revision || 0, expectedUserId: editorOwnerId });
      if (editorOwnerId !== accountId() || stopped) return { accountChanged: true };
      editorAsset = storeCreation(result.asset);
      editorOriginal = JSON.stringify(draft());
      return result;
    }, '', true);
    if (!response || response.accountChanged) { syncEditorPublishing(); return; }
    editorOriginal = JSON.stringify(draft());
    closeEditor(true);
    view = 'profile'; searchState.profile = { query: '', kind: 'all' }; localOffset = 0;
    renderView(); renderLocal(); renderOwn();
    notice(value.visibility === 'public' ? value.title + ' published in Market.' : value.title + ' saved as a draft.');
    announce(value.title + ' saved.');
    await refreshOwn().catch(error => showError('Your item was saved, but your creations could not refresh. ' + message(error)));
  }

  const confirmations = {
    unpublish: asset => ['Unpublish this item?', '“' + asset.title + '” becomes private to your account. People who already installed or downloaded it keep their copies.', 'Unpublish'],
    delete: asset => ['Delete this creation?', '“' + asset.title + '” will be removed from your account and the Market. Copies already installed on a device are retained.', 'Delete'],
    remove: asset => ['Remove from this device?', 'Your local copy of “' + asset.title + '” will be removed. The original account or Market item is retained.' + (activeTheme?.id === asset.id ? ' Your active custom theme will also be reset.' : ''), 'Remove']
  };
  function ask(type, asset, control) {
    if (busy) return;
    if (type === 'publish') {
      closeDetail(false);
      showEditor(asset, control, true).then(() => {
        if (!$('editor-dialog').open) return;
        for (const node of $$('input[name=asset-visibility]')) node.checked = node.value === 'public';
        syncEditorPublishing(); focus($('editor-save'));
      });
      return;
    }
    confirmation = { type, asset, owner: accountId() };
    text($('confirm-error'), ''); $('confirm-error').hidden = true;
    confirmationTrigger = control;
    const [title, description, label] = confirmations[type](asset);
    text($('confirm-title'), title); text($('confirm-description'), description); text($('confirm-action'), label);
    $('confirm-action').classList.toggle('danger-button', type === 'delete' || type === 'remove');
    $('confirm-action').classList.toggle('primary', type !== 'delete' && type !== 'remove');
    openDialog($('confirm-dialog'), $('confirm-cancel'));
  }
  function closeConfirm() {
    if (busy) return;
    closeView($('confirm-dialog'));
    confirmation = null;
    const target = confirmationTrigger;
    confirmationTrigger = null;
    focus(target) || focus($('detail-close')) || restoreDialogFocus();
  }
  async function confirmAction() {
    if (busy || !confirmation) return;
    const { type, asset, owner } = confirmation;
    const response = await act($('confirm-action'), async () => {
      if (['publish', 'unpublish', 'delete'].includes(type) && !await stillSameAccount(owner)) return { accountChanged: true };
      if (type === 'delete') {
        await send('catalogDelete', { id: asset.id, expectedRevision: asset.revision, expectedUserId: owner });
        ownItems = ownItems.filter(item => item.id !== asset.id); renderOwn();
      } else if (type === 'remove') {
        await send('catalogRemove', { id: asset.id });
        localItems = localItems.filter(item => item.id !== asset.id);
        if (activeTheme?.id === asset.id) activeTheme = null;
        renderLocal(); updateInstalled();
      }
      else {
        const value = schema.validateDraft(assetDraft(asset, type === 'publish' ? 'public' : 'private'));
        const result = await send('catalogSave', { asset: { ...value, id: asset.id }, expectedRevision: asset.revision, expectedUserId: owner });
        detailAsset = storeCreation(result.asset);
      }
      return { ok: true };
    });
    if (!response || response.accountChanged) return;
    closeConfirm();
    if (type === 'delete' || type === 'remove') closeDetail();
    else {
      text($('detail-author'), ['By ' + detailAsset.author_name, 'Version ' + detailAsset.revision, detailAsset.visibility === 'public' ? 'Published' : 'Private to your account'].join(' · '));
      renderDetailActions();
    }
    const success = type === 'publish' ? asset.title + ' published in the Market.' : type === 'unpublish' ? asset.title + ' is now private. Previously installed copies are retained.' : type === 'delete' ? asset.title + ' deleted from your account.' : asset.title + ' removed from this device.';
    notice(success); announce(success);
    await refreshLocal().catch(error => showError('The action completed, but the local library could not refresh. ' + message(error)));
    if (account?.signedIn) { await refreshOwn().catch(error => showError('The action completed, but your creations could not refresh. ' + message(error))); await refreshProfile().catch(showError); }
  }

  async function refreshCurrent(identityOnly = false) {
    if (busy || stopped) return;
    clearError();
    if (identityOnly === true) {
      try {
        const response = await send('status');
        if (!stopped && !updateAccount(response.status || null)) { await refreshMembership().catch(showError); await refreshProfile().catch(showError); return; }
      } catch (error) { if (!stopped) showError(error); return; }
    }
    const results = await Promise.allSettled([send('status'), refreshLocal()]);
    if (stopped) return;
    if (results[0].status === 'fulfilled') updateAccount(results[0].value.status || null);
    else showError(results[0].reason);
    if (results[1].status === 'rejected') showError(results[1].reason);
    renderAccount();
    for (const result of await Promise.allSettled([refreshProfile(), refreshMembership()])) if (result.status === 'rejected') showError(result.reason);
    if (view === 'market') await refreshMarket();
    else if (view === 'library') { try { await refreshSaved(); } catch (error) { showError(error); } }
    else if (account?.signedIn) {
      try { await refreshOwn(); }
      catch (error) { $('own-empty').hidden = true; showError(error); }
    }
  }
  $('create-asset').addEventListener('click', () => showCreate());
  $('toolbar-create').addEventListener('click', () => showCreate($('toolbar-create')));
  $('create-theme').addEventListener('click', () => showEditor(null, $('create-theme'), false, false, null, 'theme'));
  $('create-prompt').addEventListener('click', () => showEditor(null, $('create-prompt'), false, false, null, 'prompt'));
  $('create-back').addEventListener('click', () => { closeView($('create-dialog')); restoreDialogFocus(); });
  $('profile-tab').addEventListener('click', () => switchView('profile'));
  $('manage-account-profile').addEventListener('click', () => { if (!busy) openAccount(); });
  $('creations-profile-name').addEventListener('click', () => { if (!busy && ownProfile) showProfile(ownProfile.id, $('creations-profile-name')); });
  $('public-profile-back').addEventListener('click', () => { if (!busy) { closeView($('public-profile-dialog')); publicProfile = null; ++profileRequest; restoreDialogFocus(); } });
  $('profile-follow').addEventListener('click', () => { if (publicProfile) followProfile(publicProfile, $('profile-follow')); });
  $('profile-account').addEventListener('click', () => { if (!busy) openAccount(); });
  $('profile-role-form').addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !publicProfile || membership?.capabilities?.owner !== true) return;
    const profile = publicProfile, owner = accountId(), reason = $('profile-role-reason').value.trim().replace(/\s+/g, ' ');
    if (reason.length < 10 || reason.length > 500) { showError('Add a reason between 10 and 500 characters.'); return; }
    const enabled = profile.badges?.staff !== true;
    const result = await act($('profile-role-action'), async () => { if (!await stillSameAccount(owner)) return null; return send('roleSet', { profileId: profile.id, role: 'staff', enabled, reason, expectedUserId: owner }); });
    if (!result?.profile || owner !== accountId() || publicProfile?.id !== profile.id) return;
    publicProfile = result.profile; if (ownProfile?.id === profile.id) ownProfile = result.profile;
    for (const state of social.values()) if (state.author?.id === profile.id) state.author = result.profile;
    $('profile-role-reason').value = ''; renderPublicProfile(); renderProfile(); renderMarket(); renderDetailSocial(); notice(enabled ? 'Gold badge granted.' : 'Gold badge revoked.');
  });
  $('moderation-toggle').addEventListener('click', () => { if (busy) return; moderationEditing = true; renderModeration(); scheduleLayout(); focus($('moderation-reason')); });
  $('moderation-cancel').addEventListener('click', () => { if (busy) return; moderationEditing = false; renderModeration(); scheduleLayout(); focus($('moderation-toggle')); });
  $('moderation-form').addEventListener('submit', submitModeration);
  $('more-profile').addEventListener('click', () => { if (!busy && profileNext !== null) refreshPublicProfile(profileNext).catch(showError); });
  $('previous-profile').addEventListener('click', () => { if (!busy) refreshPublicProfile(Math.max(0, profileOffset-pageSize)).catch(showError); });
  $('more-saved').addEventListener('click', () => { if (!busy && savedNext !== null) refreshSaved(savedNext).catch(showError); });
  $('previous-saved').addEventListener('click', () => { if (!busy) refreshSaved(Math.max(0, savedOffset-pageSize)).catch(showError); });
  $('preview-draft').addEventListener('click', () => previewTheme(readTheme(), $('preview-draft')));
  $('preview-detail').addEventListener('click', () => { if (detailAsset?.kind === 'theme') previewTheme(detailAsset.payload, $('preview-detail')); });
  $('detail-back').addEventListener('click', () => closeDetail());
  $('browse-tab').addEventListener('click', () => switchView('market'));
  $('library-tab').addEventListener('click', () => switchView('library'));
  for (const id of ['browse-tab', 'library-tab', 'profile-tab']) $(id).addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const tabs = ['market','library','profile']; const index = tabs.indexOf(view); switchView(event.key === 'Home' ? 'market' : event.key === 'End' ? 'profile' : tabs[(index + (event.key === 'ArrowLeft' ? 2 : 1)) % 3], true);
  });
  $('open-account').addEventListener('click', () => { if (!busy) openAccount(); });
  $('catalog-retry').addEventListener('click', refreshCurrent);
  $('refresh-own').addEventListener('click', () => { if (!busy && !ownReading) { clearError(); refreshOwn().catch(showError); } });
  $('more-own').addEventListener('click', () => { if (!busy && !ownReading && ownNext !== null) refreshOwn(ownNext).then(() => { announce($('own-page').textContent); focusPage($('own-heading')); }).catch(showError); });
  $('previous-own').addEventListener('click', () => { if (!busy && !ownReading && ownOffset > 0) refreshOwn(Math.max(0, ownOffset - pageSize)).then(() => { announce($('own-page').textContent); focusPage($('own-heading')); }).catch(showError); });
  $('more-market').addEventListener('click', () => { if (!busy && !marketReading && marketNext !== null) refreshMarket(marketNext).then(() => { announce($('market-count').textContent); focusPage($('market-query')); }); });
  $('previous-market').addEventListener('click', () => { if (!busy && !marketReading && marketOffset > 0) refreshMarket(Math.max(0, marketOffset - pageSize)).then(() => { announce($('market-count').textContent); focusPage($('market-query')); }); });
  $('previous-local').addEventListener('click', () => { if (!busy && localOffset > 0) { localOffset -= pageSize; renderLocal(); focusPage($('local-heading')); } });
  $('next-local').addEventListener('click', () => { if (!busy && localOffset + pageSize < localItems.filter(matchesLibrary).length) { localOffset += pageSize; renderLocal(); focusPage($('local-heading')); } });
  function searchCurrent() { if (busy) return; rememberSearch(); if (view === 'market') refreshMarket(); else if (view === 'library') { localOffset = 0; renderLocal(); refreshSaved().catch(showError); } else refreshOwn().catch(showError); }
  $('market-search').addEventListener('submit', event => { event.preventDefault(); searchCurrent(); });
  for (const radio of $$('input[name=market-kind]')) radio.addEventListener('change', searchCurrent);
  $('reset-theme').addEventListener('click', () => act($('reset-theme'), async () => { const response = await send('catalogResetTheme'); activeTheme = null; renderLocal(); await refreshLocal().catch(error => showError('The theme was reset, but the library could not refresh. ' + message(error))); return response; }, 'Custom theme reset. Google AI Studio’s appearance is active.'));
  $('import-asset').addEventListener('click', () => { if (!busy) $('import-json').click(); });
  $('import-json').addEventListener('change', importAsset);
  $('resume-draft').addEventListener('click', async () => {
    if (busy || !pausedDraft || pausedDraft.owner !== null && pausedDraft.owner !== accountId()) return;
    if (pausedDraft.value.kind === 'theme' && !desktopDevice()) { notice('Resume this theme draft on a computer.'); return; }
    if (pausedDraft.owner === null && accountId()) pausedDraft = { ...pausedDraft, owner: accountId() };
    const held = pausedDraft;
    await showEditor(held.asset, $('resume-draft'), false, false, held, held.value.kind);
    if (!$('editor-dialog').open || held.owner !== accountId()) return;
    $('asset-kind').value = held.value.kind;
    $('asset-title').value = held.value.title; $('asset-description').value = held.value.description;
    $('asset-author').value = held.value.author_name; $('asset-tags').value = held.value.tags.join(', ');
    for (const node of $$('input[name=asset-visibility]')) node.checked = node.value === held.value.visibility;
    if (held.value.kind === 'theme') { if (!desktopDevice()) return; fillTheme(held.value.payload); }
    else $('prompt-text').value = held.value.payload.text;
    setEditorKind(); syncEditorPublishing(); editorOriginal = held.original;
    pausedDraft = null; renderPausedDraft();
  });
  $('discard-paused-draft').addEventListener('click', () => {
    if (busy || !pausedDraft) return;
    discardPaused = true; discardTrigger = $('discard-paused-draft');
    text($('discard-title'), 'Discard the paused draft?'); text($('discard-description'), 'This removes the unsaved draft retained in this tab.'); text($('discard-keep'), 'Keep draft');
    openDialog($('discard-dialog'), $('discard-keep'));
  });
  $('asset-kind').addEventListener('change', setEditorKind);
  $('theme-preset').addEventListener('click', () => { if (!busy) fillTheme(defaultTheme(themeMode())); });
  for (const radio of $$('input[name=theme-mode]')) radio.addEventListener('change', switchThemeMode);
  $('prompt-text').addEventListener('input', () => text($('prompt-count'), $('prompt-text').value.length.toLocaleString() + ' / 16,000 characters'));
  for (const node of $$('input[name=asset-visibility]')) node.addEventListener('change', syncEditorPublishing);
  $('editor-form').addEventListener('submit', saveEditor);
  $('editor-close').addEventListener('click', () => closeEditor());
  $('editor-cancel').addEventListener('click', () => closeEditor());
  $('editor-back').addEventListener('click', () => closeEditor());
  $('detail-close').addEventListener('click', () => closeDetail());
  $('confirm-cancel').addEventListener('click', closeConfirm);
  $('confirm-action').addEventListener('click', confirmAction);
  $('discard-keep').addEventListener('click', () => { if (!busy) { closeView($('discard-dialog')); focus(discardTrigger) || focus($('asset-title')); discardTrigger = null; discardPaused = false; } });
  $('discard-changes').addEventListener('click', () => { if (!busy) { closeView($('discard-dialog')); discardTrigger = null; if (discardPaused) { pausedDraft = null; renderPausedDraft(); focus($('create-asset')) || focus($('main')); } else closeEditor(true); discardPaused = false; } });
  for (const id of dialogIds) $(id).addEventListener('close', () => { const node = $(id); if (node.open) { syncInlineViews(); return; } const index = inlineStack.indexOf(node); if (index >= 0) inlineStack.splice(index, 1); dialogTrigger = viewTriggers.get(node) || dialogTrigger; viewTriggers.delete(node); syncInlineViews(); scheduleLayout(); if (!modalIsOpen()) signalParent('dialog-close'); });
  document.addEventListener('focusin', event => {
    const node = event.target;
    const dialog = node?.closest?.('dialog');
    if (dialog?.open && dialog === topDialog() && node.matches('button, input, select, textarea, summary, [tabindex]')) dialogFocus = { node, dialog };
  });
  for (const id of dialogIds) $(id).addEventListener('cancel', event => {
    event.preventDefault();
    if (busy) return;
    if (id === 'editor-dialog') closeEditor();
    else if (id === 'detail-dialog') closeDetail();
    else if (id === 'confirm-dialog') closeConfirm();
    else if (id !== 'discard-dialog') { closeView($(id)); restoreDialogFocus(); }
    else { closeView($('discard-dialog')); focus(discardTrigger) || focus($('asset-title')); discardTrigger = null; discardPaused = false; }
  });
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented) return;
    const dialog = topDialog();
    if (dialog) {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation();
        if (busy) return;
        dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
      } else if (event.key === 'Tab' && !inlineEditor(dialog)) {
        const controls = getFocusable(dialog);
        const index = controls.indexOf(document.activeElement);
        if (event.shiftKey && index <= 0) { event.preventDefault(); focus(controls.at(-1)); }
        else if (!event.shiftKey && (index < 0 || index === controls.length - 1)) { event.preventDefault(); focus(controls[0]); }
      }
      if (!inlineEditor(dialog) || event.key !== 'Tab') return;
    }
    if (!embedded) return;
    if (event.key === 'Escape') { event.preventDefault(); signalParent('close'); return; }
    if (event.key !== 'Tab') return;
    const controls = getFocusable($('main'));
    const index = controls.indexOf(document.activeElement);
    if (event.shiftKey && index <= 0) { event.preventDefault(); signalParent('focus-previous'); }
    else if (!event.shiftKey && (controls.length === 0 || index === controls.length - 1)) { event.preventDefault(); signalParent('focus-next'); }
  });
  window.addEventListener('message', event => {
    if (embedded && event.isTrusted && event.source === window.parent && event.origin === 'https://aistudio.google.com' && event.data?.type === 'slCatalogView') {
      if (event.data.view !== 'profile' || busy || stopped) return;
      if ($('editor-dialog').open && editorChanged()) return;
      if (topDialog()) { for (const dialog of [...inlineStack]) closeView(dialog); detailAsset = null; publicProfile = null; }
      if (view === 'profile') refreshCurrent().catch(showError); else switchView('profile', true).catch(showError); return;
    }
    if (embedded && event.isTrusted && event.source === window.parent && event.origin === 'https://aistudio.google.com' && event.data?.type === 'slCatalogPreview') {
      if (!previewRequest || event.data.requestId !== previewRequest.requestId || !['return','error'].includes(event.data.action)) return;
      const request = previewRequest; previewRequest = null;
      if (event.data.action === 'error') showError('Google AI Studio preview could not be opened. Return to Market and try again.');
      focus(request.control); return;
    }
    if (embedded && event.isTrusted && event.source === window.parent && event.origin === 'https://aistudio.google.com' && event.data?.type === 'slCatalogSearch') {
      const query = event.data.query;
      if (typeof query !== 'string' || query.length > 100 || query.trim() === hostQuery) return;
      hostQuery = query.trim();
      searchState.market.query = hostQuery; searchState.library.query = hostQuery; searchState.profile.query = hostQuery;
      $('market-query').value = hostQuery;
      clearTimeout(searchTimer);
      const apply = () => {
        if (stopped) return;
        if (busy) { searchTimer = setTimeout(apply, 200); return; }
        localOffset = 0; renderLocal();
        if (view === 'market') refreshMarket(0);
        else if (view === 'library') refreshSaved(0).catch(showError); else refreshOwn(0).catch(showError);
      };
      searchTimer = setTimeout(apply, 200);
      return;
    }
    if (!embedded || !event.isTrusted || event.source !== window.parent || event.origin !== 'https://aistudio.google.com' || event.data?.type !== 'slCatalogViewport') return;
    const { top, height, theme, desktop } = event.data;
    if (!Number.isInteger(top) || !Number.isInteger(height) || top < 0 || top > 10000 || height < 1 || height > 10000 || !['dark', 'light'].includes(theme)) return;
    viewport = { top, height, theme, ...(typeof desktop === 'boolean' ? { desktop } : {}) };
    document.documentElement.dataset.theme = theme;
    $('create-theme').disabled = !desktopDevice(); $('theme-desktop-note').hidden = desktopDevice();
    if ($('detail-dialog').open) renderDetailActions();
    placeDialogs();
    scheduleLayout();
    if (event.data.restoreFocus === true && dialogFocus?.dialog === topDialog() && dialogFocus.dialog.open) focus(dialogFocus.node);
    if (event.data.refresh === true && !busy) refreshCurrent(!!topDialog());
  });

  function reportLayout() {
    layoutFrame = null;
    if (!embedded || stopped) return;
    const page = document.querySelector('.page');
    const box = page?.getBoundingClientRect();
    if (!box || box.width <= 0 || box.height <= 0) return;
    const height = Math.min(10000, Math.max(1, Math.ceil(Math.max(page.scrollHeight, box.height))));
    if (height === lastHeight) return;
    lastHeight = height;
    signalParent('resize', { height });
  }
  function scheduleLayout() {
    if (embedded && !stopped && layoutFrame === null) layoutFrame = requestAnimationFrame(reportLayout);
  }
  window.addEventListener('resize', () => { placeDialogs(); scheduleLayout(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshCurrent(!!topDialog()); });
  window.addEventListener('pagehide', () => { stopped = true; layoutObserver?.disconnect(); clearTimeout(searchTimer); if (layoutFrame !== null) cancelAnimationFrame(layoutFrame); layoutFrame = null; });
  window.addEventListener('pageshow', () => { if (stopped) { stopped = false; layoutObserver?.observe(document.querySelector('.page')); refreshCurrent(); scheduleLayout(); } });
  renderView();
  text($('page-title'), 'Market');
  document.title = 'Market · Studio.lab';
  if (!schema) { showError('The catalog validator is unavailable. Reload Studio.lab and try again.'); return; }
  createColorFields();
  $('theme-preview').parentElement.prepend($('theme-preview'));
  if (embedded && typeof ResizeObserver === 'function') { layoutObserver = new ResizeObserver(scheduleLayout); layoutObserver.observe(document.querySelector('.page')); }
  scheduleLayout();
  refreshCurrent();
})();
