(function () {
  'use strict';
  const embedded = window.self !== window.top;
  document.documentElement.classList.toggle('embedded', embedded);
  const $ = (id) => document.getElementById(id);
  const { $$, el } = window.StudioLabCore;
  const nodes = Object.fromEntries([
    'main', 'account-live', 'sessions-section', 'sync-heading',
    'message', 'error', 'retry', 'account-badge', 'account-heading', 'identity-description',
    'account-email', 'login', 'login-label', 'login-note', 'logout', 'logout-all', 'sync-card',
    'sync-badge', 'sync-description', 'last-synced', 'revision', 'sync', 'pause', 'resume',
    'choice', 'choice-heading', 'choice-description', 'choice-note', 'local-settings', 'cloud-settings',
    'choose-local', 'choose-cloud', 'export', 'danger-card',
    'delete-cloud', 'delete-account', 'confirm-dialog', 'confirm-form', 'confirm-title',
    'confirm-description', 'delete-field', 'delete-text', 'confirm-cancel', 'confirm-action',
    'public-profile-card', 'public-profile-heading', 'public-profile-summary', 'public-profile-stats',
    'public-profile-edit', 'public-profile-error', 'public-profile-retry', 'public-profile-form',
    'public-profile-nickname', 'public-profile-handle', 'public-profile-save', 'public-profile-cancel',
    'public-profile-avatar', 'public-profile-badges', 'public-profile-market', 'membership-group',
    'verification-description', 'verification-status', 'verification-subscribe', 'moderator-description',
    'moderator-status', 'moderator-apply-open', 'moderator-application-form', 'moderator-application-message',
    'moderator-application-cancel', 'moderator-application-submit', 'membership-error', 'membership-retry',
    'owner-tools', 'owner-lookup-form', 'owner-profile-handle', 'owner-profile-find', 'owner-profile-result',
    'owner-profile-name', 'owner-profile-tag', 'owner-profile-badges', 'owner-role-form', 'owner-role-reason',
    'owner-staff-toggle', 'owner-moderator-toggle', 'owner-applications-refresh', 'owner-applications',
    'owner-applications-empty', 'owner-applications-previous', 'owner-applications-next', 'owner-tools-error', 'owner-tools-notice',
    'owner-removed-refresh', 'owner-removed-list', 'owner-removed-empty', 'owner-removed-error', 'owner-removed-previous', 'owner-removed-next'
  ].map(id => [id, $(id)]));
  let status = null;
  let busy = false;
  let reading = false;
  let stopped = false;
  let confirmation = null;
  let confirmationTrigger = null;
  let lastAnnouncement = '';
  let transientError = '';
  let notice = '';
  let needsReauth = false;
  let pollId;
  let layoutObserver = null;
  let layoutFrame = null;
  let lastReportedHeight = 0;
  let visibleViewport = null;
  let dialogFocus = null;
  let publicProfile = null, profileReading = false, profileEditing = false, profileError = '';
  let profileRequest = 0, profileEditorOwner = null, profileEditorRevision = 0;
  let membership = null, membershipReading = false, membershipRequest = 0, membershipReadAt = 0, membershipError = '';
  let applicationEditing = false, ownerProfile = null, ownerError = '', ownerNotice = '';
  let applications = [], applicationsOffset = 0, applicationsNext = null, applicationsReading = false, applicationsRequest = 0;
  let removedCatalog = [], removedCatalogOffset = 0, removedCatalogNext = null, removedCatalogReading = false, removedCatalogRequest = 0, removedCatalogError = '';
  function accountOwner(value = status) { return value?.signedIn ? value.user?.id || null : null; }
  function acceptStatus(next) {
    const previous = accountOwner(); status = next;
    if (previous !== accountOwner()) {
      ++profileRequest; publicProfile = null; profileReading = false; profileEditing = false; profileError = ''; profileEditorOwner = null; profileEditorRevision = 0;
      nodes['public-profile-nickname'].value = ''; nodes['public-profile-handle'].value = '';
      ++membershipRequest; ++applicationsRequest; membership = null; membershipReading = false; membershipReadAt = 0; membershipError = ''; applicationEditing = false;
      applications = []; applicationsOffset = 0; applicationsNext = null; applicationsReading = false; ownerProfile = null; ownerError = ''; ownerNotice = '';
      ++removedCatalogRequest; removedCatalog = []; removedCatalogOffset = 0; removedCatalogNext = null; removedCatalogReading = false; removedCatalogError = ''; nodes['owner-removed-list'].replaceChildren();
      nodes['moderator-application-message'].value = ''; nodes['owner-profile-handle'].value = ''; nodes['owner-role-reason'].value = '';
    }
  }
  function renderPublicProfile() {
    const signedIn = !!accountOwner();
    nodes['public-profile-card'].hidden = !signedIn;
    nodes['public-profile-card'].setAttribute('aria-busy', String(profileReading));
    setText(nodes['public-profile-heading'], publicProfile?.nickname || 'Your profile');
    setText(nodes['public-profile-avatar'], (publicProfile?.nickname || 'S').slice(0, 1).toLocaleUpperCase());
    renderIdentityBadges(nodes['public-profile-badges'], publicProfile);
    setText(nodes['public-profile-summary'], publicProfile ? '@' + publicProfile.handle : profileReading ? 'Loading your profile…' : 'Your public nickname and @tag are assigned automatically on sign-in.');
    setText(nodes['public-profile-stats'], publicProfile ? `${publicProfile.followers || 0} followers · ${publicProfile.followingCount || 0} following · ${publicProfile.publications || 0} creations` : '');
    setText(nodes['public-profile-edit'], 'Edit profile');
    nodes['public-profile-edit'].hidden = profileEditing;
    nodes['public-profile-edit'].disabled = busy || profileReading || !signedIn || !publicProfile;
    nodes['public-profile-form'].hidden = !profileEditing || !signedIn;
    for (const id of ['public-profile-nickname','public-profile-handle','public-profile-save','public-profile-cancel']) nodes[id].disabled = busy || !signedIn;
    setText(nodes['public-profile-error'], profileError); nodes['public-profile-error'].hidden = !profileError;
    nodes['public-profile-retry'].hidden = !profileError || profileEditing; nodes['public-profile-retry'].disabled = busy || profileReading;
    nodes['public-profile-market'].disabled = busy || !signedIn;
  }
  async function refreshPublicProfile() {
    const owner = accountOwner(); if (!owner || stopped || busy) return;
    const request = ++profileRequest; profileReading = true; renderPublicProfile();
    try {
      const response = await send('profileGet', { expectedUserId: owner });
      if (request !== profileRequest || owner !== accountOwner() || stopped) return;
      if (!response.profile) throw new Error('Your public profile is not available yet. Try again.');
      publicProfile = response.profile; if (!profileEditing) profileError = '';
    } catch (error) {
      if (request === profileRequest && owner === accountOwner() && !stopped) profileError = safeMessage(error) || 'Your profile could not be loaded. Try again.';
    } finally {
      if (request === profileRequest) { profileReading = false; renderPublicProfile(); scheduleLayout(); }
    }
  }
  function editPublicProfile() {
    if (busy || profileReading || !status?.signedIn || !publicProfile) return;
    profileEditorOwner = accountOwner(); profileEditorRevision = publicProfile?.revision || 0;
    nodes['public-profile-nickname'].value = publicProfile?.nickname || ''; nodes['public-profile-handle'].value = publicProfile?.handle || '';
    profileEditing = true; profileError = ''; renderPublicProfile(); scheduleLayout(); focusAvailable(nodes['public-profile-nickname']);
  }
  function cancelPublicProfile() {
    if (busy) return;
    profileEditing = false; profileError = ''; nodes['public-profile-nickname'].value = ''; nodes['public-profile-handle'].value = ''; renderPublicProfile(); scheduleLayout(); focusAvailable(nodes['public-profile-edit']);
  }
  async function savePublicProfile(event) {
    event.preventDefault(); if (busy || !profileEditing || !profileEditorOwner) return;
    const owner = profileEditorOwner, nickname = nodes['public-profile-nickname'].value.trim(), handle = nodes['public-profile-handle'].value.trim().toLowerCase();
    if (!nickname || nickname.length > 60 || !/^[a-z][a-z0-9_]{2,23}$/.test(handle)) { profileError = 'Choose a nickname and a tag with 3–24 letters, numbers, or underscores.'; renderPublicProfile(); return; }
    if (owner !== accountOwner()) { cancelPublicProfile(); return; }
    ++profileRequest; profileReading = false; busy = true; profileError = ''; render();
    let saved = false;
    try {
      const response = await send('profileUpdate', { nickname, handle, expectedRevision: profileEditorRevision, expectedUserId: owner });
      if (owner !== accountOwner() || stopped) return;
      publicProfile = response.profile; profileEditing = false; nodes['public-profile-nickname'].value = ''; nodes['public-profile-handle'].value = '';
      saved = true;
    } catch (error) { if (owner === accountOwner() && !stopped) profileError = safeMessage(error) || 'Your profile could not be saved. Try again.'; }
    finally { busy = false; render(); if (saved) setText(nodes['account-live'], 'Public profile saved.'); if (!profileEditing && (typeof document.hasFocus !== 'function' || document.hasFocus())) focusAvailable(nodes['public-profile-edit']); }
  }

  function renderIdentityBadges(container, profile) {
    container.replaceChildren();
    for (const [kind, label] of [['verified', 'Verified subscriber'], ['staff', 'Studio.lab team or affiliate'], ['moderator', 'Market moderator']]) {
      if (profile?.badges?.[kind] !== true) continue;
      const mark = document.createElement('span'); mark.className = 'identity-mark ' + kind; mark.setAttribute('role', 'img'); mark.setAttribute('aria-label', label); mark.title = label;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
      const shape = document.createElementNS(svg.namespaceURI, 'path'); shape.setAttribute('d', kind === 'moderator' ? 'M12 2 3.5 5.5V11c0 5.5 3.8 9.2 8.5 11 4.7-1.8 8.5-5.5 8.5-11V5.5Z' : 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z');
      const check = document.createElementNS(svg.namespaceURI, 'path'); check.setAttribute('d', 'm7 12 3 3 6-6'); check.setAttribute('class', 'badge-check'); svg.append(shape, check); mark.append(svg); container.append(mark);
    }
  }
  function renderMembership() {
    const signedIn = !!accountOwner(), owner = signedIn && membership?.capabilities?.owner === true;
    nodes['membership-group'].hidden = !signedIn;
    nodes['membership-group'].setAttribute('aria-busy', String(membershipReading));
    nodes['owner-tools'].hidden = !owner;
    const verification = membership?.verification, application = membership?.application;
    const verified = verification?.active === true;
    setText(nodes['verification-description'], verified ? 'Your blue check appears beside your public nickname throughout Market.' : 'Blue verification is planned at $1/month. Payments are not available yet.');
    const expiry = verification?.expires_at ? new Date(verification.expires_at) : null;
    setText(nodes['verification-status'], verified ? expiry && !Number.isNaN(expiry.getTime()) ? 'Active until ' + expiry.toLocaleDateString() + '.' : 'Verified badge active.' : membershipReading && !membership ? 'Checking membership…' : 'Payments are not available yet. Blue verification cannot be purchased at this time.');
    setText(nodes['verification-subscribe'], verified ? 'Verified' : 'Unavailable');
    // The future paid badge remains server-controlled. No purchase or client unlock exists.
    nodes['verification-subscribe'].disabled = true;
    const moderator = publicProfile?.badges?.moderator === true;
    setText(nodes['moderator-description'], moderator ? 'You can remove publications that break Market rules. A rule and reason are required for each removal.' : 'Help keep Market within its rules. Moderator access is granted after your application is approved.');
    setText(nodes['moderator-status'], moderator ? 'Moderator access active.' : application?.status === 'pending' ? 'Your application is waiting for review.' : application?.status === 'rejected' ? 'Application declined.' + (application.response ? ' ' + application.response : '') : application?.status === 'approved' ? 'Application approved.' : '');
    nodes['moderator-apply-open'].hidden = moderator || applicationEditing;
    nodes['moderator-apply-open'].disabled = busy || membershipReading || !membership || application?.status === 'pending' || application?.status === 'approved';
    setText(nodes['moderator-apply-open'], application?.status === 'pending' ? 'Application pending' : application?.status === 'rejected' ? 'Apply again' : 'Apply');
    nodes['moderator-application-form'].hidden = !applicationEditing || !signedIn;
    for (const id of ['moderator-application-message', 'moderator-application-cancel', 'moderator-application-submit']) nodes[id].disabled = busy || !signedIn;
    setText(nodes['membership-error'], membershipError); nodes['membership-error'].hidden = !membershipError;
    nodes['membership-retry'].hidden = !membershipError; nodes['membership-retry'].disabled = busy || membershipReading;
    for (const id of ['owner-profile-handle', 'owner-profile-find', 'owner-role-reason', 'owner-staff-toggle', 'owner-moderator-toggle', 'owner-applications-refresh']) nodes[id].disabled = busy || !owner || id === 'owner-applications-refresh' && applicationsReading;
    nodes['owner-profile-result'].hidden = !ownerProfile || !owner;
    if (ownerProfile) {
      setText(nodes['owner-profile-name'], ownerProfile.nickname); setText(nodes['owner-profile-tag'], '@' + ownerProfile.handle); renderIdentityBadges(nodes['owner-profile-badges'], ownerProfile);
      setText(nodes['owner-staff-toggle'], ownerProfile.badges?.staff === true ? 'Revoke gold badge' : 'Grant gold badge');
      nodes['owner-staff-toggle'].classList.toggle('danger-button', ownerProfile.badges?.staff === true);
      nodes['owner-moderator-toggle'].hidden = false;
      setText(nodes['owner-moderator-toggle'], ownerProfile.badges?.moderator === true ? 'Revoke moderator access' : 'Grant moderator access');
      nodes['owner-moderator-toggle'].classList.toggle('danger-button', ownerProfile.badges?.moderator === true);
    }
    setText(nodes['owner-tools-error'], ownerError); nodes['owner-tools-error'].hidden = !ownerError;
    setText(nodes['owner-tools-notice'], ownerNotice); nodes['owner-tools-notice'].hidden = !ownerNotice;
    nodes['owner-applications-previous'].hidden = applicationsOffset === 0; nodes['owner-applications-next'].hidden = applicationsNext === null;
    nodes['owner-applications-previous'].disabled = busy || applicationsReading; nodes['owner-applications-next'].disabled = busy || applicationsReading;
    nodes['owner-applications-empty'].hidden = applications.length > 0 || applicationsReading;
    for (const control of $$('button,textarea', nodes['owner-applications'])) control.disabled = busy || !owner;
    nodes['owner-removed-list'].setAttribute('aria-busy', String(removedCatalogReading));
    nodes['owner-removed-refresh'].disabled = busy || !owner || removedCatalogReading;
    nodes['owner-removed-previous'].hidden = removedCatalogOffset === 0; nodes['owner-removed-next'].hidden = removedCatalogNext === null;
    nodes['owner-removed-previous'].disabled = busy || !owner || removedCatalogReading; nodes['owner-removed-next'].disabled = busy || !owner || removedCatalogReading;
    nodes['owner-removed-empty'].hidden = removedCatalog.length > 0 || removedCatalogReading || !!removedCatalogError;
    setText(nodes['owner-removed-error'], removedCatalogError); nodes['owner-removed-error'].hidden = !removedCatalogError;
    for (const control of $$('button,input', nodes['owner-removed-list'])) control.disabled = busy || !owner || removedCatalogReading || control.dataset.restoreAllowed !== 'true';
  }
  async function refreshMembership(force = false) {
    const owner = accountOwner(); if (!owner || stopped || busy || membershipReading || !force && Date.now() - membershipReadAt < 15000) return;
    const request = ++membershipRequest; membershipReading = true; renderMembership();
    try {
      const response = await send('membershipGet', { expectedUserId: owner });
      if (request !== membershipRequest || owner !== accountOwner() || stopped) return;
      const wasOwner = membership?.capabilities?.owner === true;
      membership = response; membershipReadAt = Date.now(); membershipError = '';
      if (response.capabilities?.owner !== true) {
        ++applicationsRequest; applications = []; applicationsReading = false; ownerProfile = null; nodes['owner-applications'].replaceChildren();
        ++removedCatalogRequest; removedCatalog = []; removedCatalogReading = false; removedCatalogError = ''; nodes['owner-removed-list'].replaceChildren();
      }
      if (response.capabilities?.owner === true && !wasOwner) { refreshApplications().catch(() => {}); refreshRemovedCatalog().catch(() => {}); }
    } catch (error) { if (request === membershipRequest && owner === accountOwner() && !stopped) membershipError = safeMessage(error); }
    finally { if (request === membershipRequest) { membershipReading = false; renderMembership(); scheduleLayout(); } }
  }
  async function membershipAction(command, payload, success, ownerOnly = false) {
    const owner = accountOwner(); if (!owner || busy || ownerOnly && membership?.capabilities?.owner !== true) return null;
    busy = true; membershipError = ''; ownerError = ''; ownerNotice = ''; render();
    try {
      const response = await send(command, { ...payload, expectedUserId: owner });
      if (owner !== accountOwner() || stopped) return null;
      if (response.profile?.id === publicProfile?.id) publicProfile = response.profile;
      if (response.profile?.id === ownerProfile?.id) ownerProfile = response.profile;
      if (ownerOnly) ownerNotice = success; else notice = success;
      return response;
    } catch (error) { if (owner === accountOwner() && !stopped) { if (ownerOnly) ownerError = safeMessage(error); else membershipError = safeMessage(error); } return null; }
    finally { busy = false; render(); scheduleLayout(); }
  }
  function renderApplications() {
    nodes['owner-applications'].replaceChildren();
    for (const entry of applications) {
      const profile = entry.profile; if (!profile?.id) continue;
      const card = document.createElement('article'); card.className = 'application-card';
      const identity = document.createElement('div'); identity.className = 'application-name';
      const name = document.createElement('strong'); name.textContent = profile.nickname; const badges = document.createElement('span'); badges.className = 'identity-badges'; renderIdentityBadges(badges, profile);
      const tag = document.createElement('span'); tag.className = 'help'; tag.textContent = '@' + profile.handle; identity.append(name, badges, tag);
      const message = document.createElement('p'); message.className = 'application-message'; message.textContent = entry.application.message;
      const form = document.createElement('form'); const field = document.createElement('div'); field.className = 'field';
      const label = document.createElement('label'); label.textContent = 'Response to the applicant'; label.htmlFor = 'application-response-' + profile.id;
      const response = document.createElement('textarea'); response.id = label.htmlFor; response.rows = 2; response.maxLength = 500; response.required = true; field.append(label, response);
      const actions = document.createElement('div'); actions.className = 'actions';
      for (const approved of [false, true]) {
        const control = document.createElement('button'); control.type = 'submit'; control.className = 'button' + (approved ? ' primary' : ''); control.textContent = approved ? 'Approve moderator' : 'Decline'; control.value = approved ? 'approve' : 'decline'; control.disabled = busy;
        actions.append(control);
      }
      form.append(field, actions); form.addEventListener('submit', async event => {
        event.preventDefault(); if (busy || !response.value.trim()) return;
        const approved = event.submitter?.value === 'approve';
        const result = await membershipAction('moderatorReview', { profileId: profile.id, approved, response: response.value.trim().replace(/\s+/g, ' ') }, approved ? 'Moderator application approved.' : 'Moderator application declined.', true);
        if (result) {
          applications = applications.filter(item => item.profile?.id !== profile.id); renderApplications(); await refreshMembership(true);
          await refreshApplications(applicationsOffset);
          if (!applications.length && applicationsOffset > 0) await refreshApplications(Math.max(0, applicationsOffset - 10));
        }
      }); card.append(identity, message, form); nodes['owner-applications'].append(card);
    }
    renderMembership(); scheduleLayout();
  }
  async function refreshApplications(offset = 0) {
    const owner = accountOwner(); if (!owner || busy || membership?.capabilities?.owner !== true || applicationsReading) return;
    const request = ++applicationsRequest; applicationsReading = true; renderMembership();
    try {
      const result = await send('moderatorApplications', { status: 'pending', offset, limit: 10, expectedUserId: owner });
      if (request !== applicationsRequest || owner !== accountOwner() || stopped) return;
      applications = (result.items || []).filter(entry => entry?.profile?.id && entry.application?.status === 'pending'); applicationsOffset = offset; applicationsNext = Number.isInteger(result.nextOffset) ? result.nextOffset : null; ownerError = '';
      renderApplications();
    } catch (error) { if (request === applicationsRequest && owner === accountOwner() && !stopped) ownerError = safeMessage(error); }
    finally { if (request === applicationsRequest) { applicationsReading = false; renderMembership(); scheduleLayout(); } }
  }
  function renderRemovedCatalog() {
    nodes['owner-removed-list'].replaceChildren();
    for (const entry of removedCatalog) {
      const asset = entry.asset, moderation = entry.moderation, author = entry.author;
      if (!asset?.id || moderation?.id !== asset.id || moderation.removed !== true) continue;
      const card = document.createElement('article'); card.className = 'application-card removed-catalog-card';
      const title = document.createElement('h4'); title.id = 'removed-title-' + asset.id; title.className = 'removed-catalog-title'; title.textContent = asset.title; card.setAttribute('aria-labelledby', title.id);
      const identity = document.createElement('div'); identity.className = 'application-name removed-catalog-author';
      if (author) {
        const name = document.createElement('strong'); name.textContent = author.nickname; const badges = document.createElement('span'); badges.className = 'identity-badges'; renderIdentityBadges(badges, author);
        const tag = document.createElement('span'); tag.className = 'help'; tag.textContent = '@' + author.handle; identity.append(name, badges, tag);
      }
      const date = moderation.removed_at ? new Date(moderation.removed_at) : null;
      const meta = document.createElement('p'); meta.className = 'help'; meta.textContent = (asset.kind === 'theme' ? 'Theme' : 'System prompt') + (date && !Number.isNaN(date.getTime()) ? ' · Removed ' + date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');
      const reason = document.createElement('p'); reason.className = 'removed-catalog-reason'; reason.textContent = moderation.reason;
      card.append(title, identity, meta, reason);
      if (moderation.can_restore === true) {
        const form = document.createElement('form'); form.className = 'restoration-form';
        const label = document.createElement('label'); label.className = 'visually-hidden'; label.htmlFor = 'restore-reason-' + asset.id; label.textContent = 'Reason for restoring ' + asset.title;
        const input = document.createElement('input'); input.id = label.htmlFor; input.type = 'text'; input.minLength = 10; input.maxLength = 500; input.required = true; input.placeholder = 'Reason for restoration'; input.dataset.restoreAllowed = 'true';
        const action = document.createElement('button'); action.type = 'submit'; action.className = 'button primary'; action.textContent = 'Restore to Market'; action.dataset.restoreAllowed = 'true';
        form.append(label, input, action);
        form.addEventListener('submit', async event => {
          event.preventDefault(); if (busy || removedCatalogReading || membership?.capabilities?.owner !== true) return;
          const reason = input.value.trim().replace(/\s+/g, ' ');
          if (reason.length < 10 || reason.length > 500) { removedCatalogError = 'Add a restoration reason between 10 and 500 characters.'; renderMembership(); return; }
          removedCatalogError = '';
          const result = await membershipAction('catalogModerate', { id: asset.id, removed: false, reason }, '“' + asset.title + '” was restored. The author can publish it if it is currently a draft.', true);
          if (!result?.moderation || result.moderation.id !== asset.id || result.moderation.removed !== false) return;
          removedCatalog = removedCatalog.filter(item => item.asset.id !== asset.id); renderRemovedCatalog();
          await refreshRemovedCatalog(removedCatalogOffset);
          if (!removedCatalog.length && removedCatalogOffset > 0) await refreshRemovedCatalog(Math.max(0, removedCatalogOffset - 10));
        }); card.append(form);
      }
      nodes['owner-removed-list'].append(card);
    }
    renderMembership(); scheduleLayout();
  }
  async function refreshRemovedCatalog(offset = 0) {
    const owner = accountOwner(); if (!owner || stopped || busy || removedCatalogReading || membership?.capabilities?.owner !== true) return;
    const request = ++removedCatalogRequest; removedCatalogReading = true; removedCatalogError = ''; renderMembership();
    try {
      const result = await send('removedCatalog', { offset, limit: 10, expectedUserId: owner });
      if (request !== removedCatalogRequest || owner !== accountOwner() || stopped || membership?.capabilities?.owner !== true) return;
      removedCatalog = (result.items || []).filter(entry => entry?.asset?.id && entry.moderation?.id === entry.asset.id && entry.moderation.removed === true);
      removedCatalogOffset = offset; removedCatalogNext = Number.isInteger(result.nextOffset) ? result.nextOffset : null; renderRemovedCatalog();
    } catch (error) { if (request === removedCatalogRequest && owner === accountOwner() && !stopped) removedCatalogError = safeMessage(error); }
    finally { if (request === removedCatalogRequest) { removedCatalogReading = false; renderMembership(); scheduleLayout(); } }
  }


  function safeMessage(value) {
    if (typeof value === 'string') return value.slice(0, 500);
    return typeof value?.message === 'string' ? value.message.slice(0, 500) : '';
  }

  async function send(command, payload = {}) {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      throw new Error('Open this page from the installed Studio.lab extension.');
    }
    const response = await chrome.runtime.sendMessage({ action: 'slAccount', command, ...payload });
    if (!response || response.ok !== true) {
      if (response?.code === 'account_changed' && command !== 'status') { try { const fresh = await chrome.runtime.sendMessage({ action: 'slAccount', command: 'status' }); if (fresh?.ok && !stopped) { acceptStatus(fresh.status || null); render(); } } catch (_) {} }
      const error = new Error(safeMessage(response?.error) || 'The account service did not respond. Reload the extension and try again.');
      error.code = response?.code || 'unavailable';
      throw error;
    }
    return response;
  }

  function setText(node, value) {
    if (node.textContent !== value) node.textContent = value;
  }

  function badge(id, text, tone = '') {
    setText(nodes[id], text);
    nodes[id].dataset.tone = tone;
  }

  const preferenceLabels = Object.freeze({
    responseRecoveryEnabled: 'Response recovery', optimizerEnabled: 'Chat optimizer',
    optimizerMode: 'Optimization mode', keepLast: 'Recent turns kept', autoKeep: 'Automatic turn limit',
    scrollBottomEnabled: 'Scroll to bottom', wordCounterEnabled: 'Word counter',
    textFormatterEnabled: 'Text formatter', modernWebChatEnabled: 'Modern chat layout',
    cleanerEnabled: 'Interface cleaner', draftSaverEnabled: 'Draft saver',
    telemetryBlockerEnabled: 'Telemetry blocker', cleanerTips: 'Hide tips', cleanerBanners: 'Hide banners',
    cleanerHallucinations: 'Hide disclaimers', cleanerFeedback: 'Hide feedback', cleanerSuggestions: 'Hide suggestions'
  });
  function renderPreferences(node, settings) {
    const entries = settings && typeof settings === 'object' && !Array.isArray(settings)
      ? Object.entries(preferenceLabels).filter(([key]) => Object.prototype.hasOwnProperty.call(settings, key))
        .map(([key, label]) => [label, typeof settings[key] === 'boolean' ? settings[key] ? 'Enabled' : 'Disabled'
          : key === 'keepLast' && Number.isInteger(settings[key]) ? String(settings[key])
          : key === 'optimizerMode' && ['smart', 'hard'].includes(settings[key]) ? settings[key] === 'smart' ? 'Smart' : 'Hard' : 'Unavailable'])
      : [['Cloud backup', 'Not created yet']];
    const signature = JSON.stringify(entries);
    if (node.dataset.preferences === signature) return;
    node.dataset.preferences = signature;
    node.replaceChildren(...entries.map(([label, value]) => {
      const row = el('<div><dt></dt><dd></dd></div>');
      row.children[0].textContent = label;
      row.children[1].textContent = value;
      return row;
    }));
  }

  function focusAvailable(node) {
    if (!node?.isConnected || node.disabled || node.hidden || !node.getClientRects().length) return false;
    node.focus({ preventScroll: true });
    return true;
  }

  function restoreConfirmationFocus() {
    const trigger = confirmationTrigger;
    confirmationTrigger = null;
    if (!trigger) return;
    focusAvailable(trigger) || focusAvailable(nodes.login) || focusAvailable(nodes['sync-heading']) || focusAvailable(nodes.main);
  }

  const states = {
    unconfigured: ['Account unavailable', 'Account sign-in is temporarily unavailable. Reload Studio.lab and try again.', ''],
    signed_out: ['Signed out', 'Sign in to start syncing your preferences.', ''],
    idle: ['Ready', 'Your account is connected. Changes to your preferences sync automatically.', ''],
    choosing: ['Your choice', 'Choose a starting point below before automatic sync begins.', 'warning'],
    syncing: ['Syncing', 'Saving your preferences to the cloud…', 'warning'],
    synced: ['Up to date', 'Your preferences are backed up. Changes sync automatically.', 'success'],
    paused: ['Paused', 'Automatic sync is paused. Your local settings remain available.', ''],
    conflict: ['Needs a choice', 'Some preferences changed in this browser and in the cloud. Choose which version to keep below.', 'warning'],
    offline: ['Waiting to retry', 'The cloud is temporarily unreachable. Your preferences remain saved locally; sync will retry when the connection returns.', 'warning'],
    error: ['Needs attention', 'Sync could not finish. Your local settings are safe. Retry after resolving the error below.', 'error'],
    cloud_deleted: ['Backup removed', 'Your cloud backup was deleted. Automatic sync waits for your choice before creating a new backup.', ''],
    signed_out_pending_revocation: ['Signed out locally', 'You are signed out of this browser. Remote session revocation could not be confirmed. Sign in again and use Sign out everywhere when online to revoke the remaining sessions.', 'warning']
  };

  function render() {
    const loaded = !!status;
    const configured = !!status?.configured;
    const signedIn = !!status?.signedIn;
    const sync = status?.sync || {};
    const state = sync.state || (configured ? 'signed_out' : 'unconfigured');
    const stateInfo = states[state] || ['Ready', 'Your preferences are saved locally.', ''];
    const cloudDeleted = state === 'cloud_deleted';
    const choosing = signedIn && (!!sync.pendingChoice || state === 'choosing' || state === 'conflict' || cloudDeleted || (Array.isArray(sync.conflict) && sync.conflict.length > 0));
    const paused = sync.enabled === false || state === 'paused' || state === 'cloud_deleted';
    const unavailable = busy || !loaded;
    const pendingRevocation = state === 'signed_out_pending_revocation';
    const identity = status?.user || {};

    badge('account-badge', busy ? 'Working…' : signedIn ? 'Connected' : loaded ? configured ? pendingRevocation ? 'Signed out locally' : 'Signed out' : 'Local only' : 'Loading', signedIn ? 'success' : pendingRevocation ? 'warning' : '');
    setText(nodes['account-heading'], 'Google account');
    setText(nodes['identity-description'], loaded ? signedIn ? 'Connected to your Studio.lab preferences.' : pendingRevocation ? stateInfo[1] : configured ? 'Sign in to back up and sync your Studio.lab preferences.' : 'Sign-in is temporarily unavailable. Your preferences are saved locally.' : 'Checking your account…');
    setText(nodes['account-email'], typeof identity.email === 'string' ? identity.email : '');
    nodes['account-email'].hidden = !signedIn || !identity.email;
    nodes.login.hidden = signedIn && !needsReauth;
    nodes.login.disabled = unavailable || !configured;
    nodes['login-label'].textContent = busy ? 'Please wait…' : needsReauth ? 'Sign in again with Google' : 'Continue with Google';
    nodes.logout.hidden = !signedIn;
    nodes.logout.disabled = unavailable;
    nodes['logout-all'].hidden = !signedIn;
    nodes['logout-all'].disabled = unavailable;
    nodes['login-note'].hidden = signedIn;
    nodes['sessions-section'].hidden = !signedIn;

    nodes['sync-card'].hidden = !signedIn;
    badge('sync-badge', busy ? 'Working…' : stateInfo[0], stateInfo[2]);
    setText(nodes['sync-description'], stateInfo[1]);
    const date = sync.lastSyncedAt ? new Date(sync.lastSyncedAt) : null;
    nodes['last-synced'].textContent = date && !Number.isNaN(date.getTime()) ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Never';
    nodes.revision.textContent = Number.isInteger(sync.revision) ? String(sync.revision) : '—';
    nodes.sync.disabled = unavailable || choosing || paused || !signedIn;
    nodes.sync.hidden = choosing;
    nodes.pause.hidden = paused || choosing;
    nodes.pause.disabled = unavailable || choosing || !signedIn;
    nodes.resume.hidden = !paused || choosing;
    nodes.resume.disabled = unavailable || choosing || !signedIn;
    nodes.choice.hidden = !choosing;
    nodes['choice-heading'].textContent = cloudDeleted ? 'Create a new cloud backup?' : state === 'conflict' ? 'Choose the preferences to keep' : 'Choose your starting point';
    nodes['choice-description'].textContent = cloudDeleted ? 'The previous cloud backup was removed. Your local preferences are retained. Choose this browser to start a new backup, or leave sync paused.' : state === 'conflict' ? 'Both copies changed since the last sync. Review them below and choose one to keep.' : 'Choose which preferences to keep. Automatic sync starts after your choice.';
    nodes['choose-local'].textContent = cloudDeleted ? 'Create new backup' : 'Use this browser';
    nodes['choice-note'].textContent = cloudDeleted ? 'Creating a backup uploads only the selected preferences shown above and resumes automatic sync.' : '“Use this browser” replaces your cloud backup. “Use cloud backup” replaces the synced preferences in this browser.';
    renderPreferences(nodes['local-settings'], status?.localSettings || {});
    renderPreferences(nodes['cloud-settings'], status?.cloudSettings);
    nodes['choose-local'].disabled = unavailable || !choosing;
    nodes['choose-cloud'].disabled = unavailable || !choosing || !status?.cloudSettings;

    nodes.export.disabled = unavailable;
    nodes['danger-card'].hidden = !signedIn;
    nodes['delete-cloud'].disabled = unavailable || !signedIn;
    nodes['delete-account'].disabled = unavailable || !signedIn;
    nodes['confirm-action'].disabled = busy || (confirmation === 'deleteAccount' && nodes['delete-text'].value !== 'DELETE');
    nodes['confirm-cancel'].disabled = busy;

    const errorText = transientError || safeMessage(sync.error);
    setText(nodes.error, errorText);
    nodes.error.hidden = !errorText;
    nodes.retry.hidden = !errorText;
    nodes.retry.disabled = busy || reading;
    setText(nodes.message, notice);
    nodes.message.hidden = !notice;
    if (loaded && !signedIn && nodes['confirm-dialog'].open) closeConfirmation();
    nodes.main.setAttribute('aria-busy', String(busy || !loaded));
    const announcement = loaded ? [configured, signedIn, state, busy].join('|') : '';
    if (announcement && announcement !== lastAnnouncement) {
      lastAnnouncement = announcement;
      setText(nodes['account-live'], busy ? 'Account action in progress.' : signedIn ? 'Settings sync: ' + stateInfo[0] + '. ' + stateInfo[1]
        : pendingRevocation ? stateInfo[1] : configured ? 'Signed out. Google sign-in is available.' : 'Account sign-in is unavailable. Settings are saved locally.');
    }
    renderPublicProfile();
    renderMembership();
    scheduleLayout();
  }

  async function refresh() {
    if (stopped || busy || reading) return;
    reading = true;
    try {
      const response = await send('status');
      if (!stopped && response.status) {
        acceptStatus(response.status);
        render();
        if (status?.signedIn) { await refreshPublicProfile(); await refreshMembership(); }
      }
    } catch (error) {
      if (!stopped) {
        transientError = safeMessage(error) || 'Unable to read account status.';
        render();
      }
    } finally {
      reading = false;
      if (!stopped) nodes.retry.disabled = busy;
    }
  }

  async function perform(command, payload = {}, success = '') {
    if (busy) return;
    const initiatingControl = document.activeElement;
    busy = true;
    transientError = '';
    notice = command === 'login' ? 'Complete the Google sign-in window to continue. Closing it cancels sign-in.' : '';
    render();
    try {
      const response = await send(command, payload);
      if (command === 'login') needsReauth = false;
      if (response.status) acceptStatus(response.status);
      const resultSync = response.status?.sync;
      const needsChoice = !!resultSync?.pendingChoice || resultSync?.state === 'conflict' || resultSync?.state === 'choosing' || (Array.isArray(resultSync?.conflict) && resultSync.conflict.length > 0);
      notice = (command === 'resolve' || command === 'deleteCloud') && needsChoice
        ? 'The cloud backup changed before this action could finish. Review the latest copies below and choose again.'
        : success;
      return response;
    } catch (error) {
      if (error.code === 'reauth_required') {
        needsReauth = true;
        transientError = 'For account deletion, sign in again with Google, then select Delete account once more.';
      } else {
        transientError = safeMessage(error) || 'The action could not be completed. Try again.';
      }
      notice = '';
    } finally {
      busy = false;
      render();
      await refresh();
      if (initiatingControl && (document.activeElement === document.body || document.activeElement === initiatingControl)) {
        if (needsReauth) focusAvailable(nodes.login);
        else focusAvailable(initiatingControl) || focusAvailable(status?.signedIn ? nodes['sync-heading'] : nodes.login) || focusAvailable(nodes.main);
      }
    }
  }

  nodes['public-profile-edit'].addEventListener('click', editPublicProfile);
  nodes['public-profile-cancel'].addEventListener('click', cancelPublicProfile);
  nodes['public-profile-form'].addEventListener('submit', savePublicProfile);
  nodes['public-profile-retry'].addEventListener('click', refreshPublicProfile);
  nodes['public-profile-market'].addEventListener('click', () => { if (busy) return; if (embedded) signalParent('open-market'); else window.location.href = 'catalog.html#profile'; });
  nodes['membership-retry'].addEventListener('click', () => refreshMembership(true));
  nodes['moderator-apply-open'].addEventListener('click', () => { if (busy || !membership || membership.application?.status === 'pending' || publicProfile?.badges?.moderator) return; applicationEditing = true; renderMembership(); scheduleLayout(); focusAvailable(nodes['moderator-application-message']); });
  nodes['moderator-application-cancel'].addEventListener('click', () => { if (busy) return; applicationEditing = false; renderMembership(); scheduleLayout(); focusAvailable(nodes['moderator-apply-open']); });
  nodes['moderator-application-form'].addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    const message = nodes['moderator-application-message'].value.trim().replace(/\s+/g, ' ');
    if (message.length < 20 || message.length > 2000) { membershipError = 'Write an application between 20 and 2,000 characters.'; renderMembership(); return; }
    const result = await membershipAction('moderatorApply', { message }, 'Your moderator application was sent.');
    if (!result) return; applicationEditing = false; nodes['moderator-application-message'].value = ''; await refreshMembership(true);
  });
  nodes['owner-lookup-form'].addEventListener('submit', async event => {
    event.preventDefault(); if (busy || membership?.capabilities?.owner !== true) return;
    const handle = nodes['owner-profile-handle'].value.trim().replace(/^@/, '').toLowerCase();
    if (!/^[a-z][a-z0-9_]{2,23}$/.test(handle)) { ownerError = 'Enter a valid public @tag.'; renderMembership(); return; }
    ownerProfile = null;
    const result = await membershipAction('profileLookup', { handle }, '', true);
    if (result) { ownerProfile = result.profile || null; nodes['owner-role-reason'].value = ''; if (!ownerProfile) ownerError = 'No profile has this @tag.'; renderMembership(); scheduleLayout(); }
  });
  async function changeOwnerRole(role) {
    if (busy || !ownerProfile || membership?.capabilities?.owner !== true) return;
    const reason = nodes['owner-role-reason'].value.trim().replace(/\s+/g, ' ');
    if (reason.length < 10 || reason.length > 500) { ownerError = 'Add a reason between 10 and 500 characters.'; renderMembership(); return; }
    const enabled = ownerProfile.badges?.[role === 'staff' ? 'staff' : 'moderator'] !== true;
    const result = await membershipAction('roleSet', { profileId: ownerProfile.id, role, enabled, reason }, role === 'staff' ? enabled ? 'Gold badge granted.' : 'Gold badge revoked.' : enabled ? 'Moderator access granted.' : 'Moderator access revoked.', true);
    if (result?.profile) { ownerProfile = result.profile; nodes['owner-role-reason'].value = ''; renderPublicProfile(); renderMembership(); }
  }
  nodes['owner-role-form'].addEventListener('submit', event => { event.preventDefault(); changeOwnerRole('staff'); });
  nodes['owner-moderator-toggle'].addEventListener('click', () => changeOwnerRole('moderator'));
  nodes['owner-applications-refresh'].addEventListener('click', () => refreshApplications());
  nodes['owner-applications-previous'].addEventListener('click', () => refreshApplications(Math.max(0, applicationsOffset - 10)));
  nodes['owner-applications-next'].addEventListener('click', () => { if (applicationsNext !== null) refreshApplications(applicationsNext); });
  nodes['owner-removed-refresh'].addEventListener('click', () => refreshRemovedCatalog());
  nodes['owner-removed-previous'].addEventListener('click', () => refreshRemovedCatalog(Math.max(0, removedCatalogOffset - 10)));
  nodes['owner-removed-next'].addEventListener('click', () => { if (removedCatalogNext !== null) refreshRemovedCatalog(removedCatalogNext); });
  nodes['public-profile-handle'].addEventListener('input', () => { const input = nodes['public-profile-handle'], start = input.selectionStart, leading = input.value.startsWith('@'), value = input.value.replace(/^@/, '').toLowerCase(); if (input.value !== value) { input.value = value; if (typeof start === 'number' && input.setSelectionRange) { const caret = Math.max(0, start - (leading ? 1 : 0)); input.setSelectionRange(caret, caret); } } });

  nodes.login.addEventListener('click', () => {
    if (!status?.configured) return;
    perform('login', {}, 'You’re signed in. Review your sync status below.');
  });
  nodes.logout.addEventListener('click', () => perform('logout', {}, 'Signed out of this browser. Your local settings are retained.'));
  nodes['logout-all'].addEventListener('click', () => openConfirmation('logoutAll'));
  nodes.sync.addEventListener('click', () => perform('sync'));
  nodes.pause.addEventListener('click', () => perform('pause', {}, 'Automatic sync paused.'));
  nodes.resume.addEventListener('click', () => perform('resume'));
  nodes['choose-local'].addEventListener('click', () => perform('resolve', { choice: 'local' }, 'This browser’s preferences were selected.'));
  nodes['choose-cloud'].addEventListener('click', () => perform('resolve', { choice: 'cloud' }, 'Cloud preferences were selected.'));
  nodes.retry.addEventListener('click', () => {
    transientError = '';
    if (status?.signedIn && status.sync?.enabled !== false && !status.sync?.pendingChoice && status.sync?.state !== 'conflict') perform('sync');
    else refresh();
  });

  nodes.export.addEventListener('click', async () => {
    const response = await perform('export');
    if (!response?.settings) return;
    const output = new Blob([JSON.stringify({ schemaVersion: 1, settings: response.settings }, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(output);
    const link = el('<a></a>');
    link.href = url;
    link.download = 'studio-lab-settings.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notice = 'Local settings exported. The file contains only syncable preferences.';
    render();
  });

  const confirmations = {
    deleteCloud: ['Delete your cloud backup?', 'This removes the saved preferences from your account and pauses sync in this browser. Other browsers will be asked to choose before recreating a backup. Your local settings are retained.', 'Delete backup'],
    deleteAccount: ['Delete your Studio.lab account?', 'Your Studio.lab account, cloud preferences, theme and prompt library, and Market publications will be permanently removed. Fresh Google sign-in is required. Local settings, installed copies and your Google account are retained.', 'Delete account'],
    logoutAll: ['Sign out everywhere?', 'This revokes your Studio.lab sessions in every browser. Already issued sessions may remain valid until their access token expires. Your local settings and cloud backup are retained.', 'Sign out everywhere']
  };
  function openConfirmation(command) {
    if (busy || !status?.signedIn) return;
    confirmationTrigger = command === 'deleteAccount' ? nodes['delete-account'] : command === 'deleteCloud' ? nodes['delete-cloud'] : nodes['logout-all'];
    confirmation = command;
    const [title, description, action] = confirmations[command];
    nodes['confirm-title'].textContent = title;
    nodes['confirm-description'].textContent = description;
    nodes['confirm-action'].textContent = action;
    nodes['delete-field'].hidden = command !== 'deleteAccount';
    nodes['delete-text'].value = '';
    if (embedded) {
      signalParent('dialog-open');
      positionConfirmation();
    }
    nodes['confirm-dialog'].showModal();
    render();
    nodes['confirm-cancel'].focus();
  }
  function closeConfirmation() {
    nodes['confirm-dialog'].close();
    confirmation = null;
    nodes['delete-text'].value = '';
    restoreConfirmationFocus();
  }
  nodes['delete-cloud'].addEventListener('click', () => openConfirmation('deleteCloud'));
  nodes['delete-account'].addEventListener('click', () => openConfirmation('deleteAccount'));
  nodes['confirm-cancel'].addEventListener('click', closeConfirmation);
  nodes['confirm-dialog'].addEventListener('cancel', () => { confirmation = null; nodes['delete-text'].value = ''; });
  nodes['confirm-dialog'].addEventListener('close', () => { restoreConfirmationFocus(); scheduleLayout(); if (embedded) signalParent('dialog-close'); });
  nodes['delete-text'].addEventListener('input', render);
  nodes['confirm-form'].addEventListener('submit', (event) => {
    event.preventDefault();
    if (busy || !confirmation || !status?.signedIn) return;
    const command = confirmation;
    if (command === 'deleteAccount' && nodes['delete-text'].value !== 'DELETE') return;
    closeConfirmation();
    if (command === 'deleteCloud') perform(command, { confirm: true }, 'Cloud backup deleted. Sync is paused; local settings are retained.');
    else if (command === 'deleteAccount') perform(command, { confirm: 'DELETE' }, 'Studio.lab account deleted. Local settings are retained.');
    else perform(command, {}, 'Signed out everywhere. Your settings are retained.');
  });

  function signalParent(action) {
    // Only navigation and numeric layout signals cross the frame boundary. Account data and
    // commands stay in this extension-origin document and its service worker.
    window.parent.postMessage({ type: 'slAccountUi', action }, 'https://aistudio.google.com');
  }

  function reportLayout() {
    layoutFrame = null;
    if (!embedded || stopped) return;
    const page = document.querySelector('.page');
    const rect = page?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const measuredHeight = Math.max(rect.height, page.scrollHeight);
    if (!Number.isFinite(measuredHeight)) return;
    const height = Math.min(10000, Math.max(1, Math.ceil(measuredHeight)));
    if (height === lastReportedHeight) return;
    lastReportedHeight = height;
    window.parent.postMessage({ type: 'slAccountUi', action: 'resize', height }, 'https://aistudio.google.com');
  }
  function scheduleLayout() {
    if (!embedded || stopped || layoutFrame !== null) return;
    layoutFrame = requestAnimationFrame(reportLayout);
  }
  function startLayoutObserver() {
    if (!embedded) return;
    if (!layoutObserver && typeof ResizeObserver === 'function') {
      layoutObserver = new ResizeObserver(scheduleLayout);
    }
    const page = document.querySelector('.page');
    if (page) layoutObserver?.observe(page);
    scheduleLayout();
  }
  function positionConfirmation() {
    if (!embedded || !confirmation) return;
    const ownHeight = Math.max(1, Math.min(10000, window.innerHeight));
    const top = Math.min(visibleViewport?.top || 0, ownHeight - 1);
    const height = Math.max(1, Math.min(visibleViewport?.height || ownHeight, ownHeight - top));
    nodes['confirm-dialog'].style.top = (top + height / 2) + 'px';
    nodes['confirm-dialog'].style.maxHeight = Math.max(1, height - 24) + 'px';
  }
  window.addEventListener('message', (event) => {
    if (!embedded || !event.isTrusted || event.source !== window.parent ||
        event.origin !== 'https://aistudio.google.com' || event.data?.type !== 'slAccountUi' ||
        event.data.action !== 'viewport') return;
    const { top, height, theme } = event.data;
    if (!Number.isInteger(top) || !Number.isInteger(height) || top < 0 || top > 10000 ||
        height < 1 || height > 10000 || theme !== undefined && !['dark', 'light'].includes(theme)) return;
    visibleViewport = { top: Math.round(top), height: Math.round(height) };
    if (theme) document.documentElement.dataset.theme = theme;
    positionConfirmation();
    if (event.data.restoreFocus === true && nodes['confirm-dialog'].open && dialogFocus?.isConnected &&
        dialogFocus.closest('dialog') === nodes['confirm-dialog']) focusAvailable(dialogFocus);
  });
  document.addEventListener('focusin', event => {
    const node = event.target;
    if (nodes['confirm-dialog'].open && node?.closest?.('dialog') === nodes['confirm-dialog'] &&
        node.matches('button, input, [tabindex]')) dialogFocus = node;
  });
  window.addEventListener('resize', () => { scheduleLayout(); positionConfirmation(); });
  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented) return;
    if (nodes['confirm-dialog'].open) {
      if (event.key !== 'Tab') return;
      const controls = $$('button, input, [tabindex]', nodes['confirm-dialog'])
        .filter(element => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length > 0);
      const current = controls.indexOf(document.activeElement);
      if (event.shiftKey && current <= 0) {
        event.preventDefault();
        controls[controls.length - 1]?.focus();
      } else if (!event.shiftKey && (current < 0 || current === controls.length - 1)) {
        event.preventDefault();
        controls[0]?.focus();
      }
      return;
    }
    if (!embedded) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      signalParent('close');
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = $$('button, a[href], input, select, textarea, summary, [tabindex]')
      .filter(element => !element.disabled && element.tabIndex >= 0 &&
      element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');
    const index = focusable.indexOf(document.activeElement);
    if (event.shiftKey && (index <= 0)) {
      event.preventDefault();
      signalParent('focus-previous');
    } else if (!event.shiftKey && (focusable.length === 0 || index === focusable.length - 1)) {
      event.preventDefault();
      signalParent('focus-next');
    }
  });

  function startPolling() {
    if (pollId) clearInterval(pollId);
    pollId = setInterval(() => { if (!document.hidden) refresh(); }, 5000);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  window.addEventListener('pagehide', () => {
    stopped = true;
    clearInterval(pollId);
    layoutObserver?.disconnect();
    if (layoutFrame !== null) cancelAnimationFrame(layoutFrame);
    layoutFrame = null;
  });
  window.addEventListener('pageshow', () => { stopped = false; startPolling(); startLayoutObserver(); refresh(); });
  render();
  startPolling();
  startLayoutObserver();
  refresh();
})();
