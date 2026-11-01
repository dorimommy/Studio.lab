(function () {
  'use strict';
  if (!window.StudioLab?.registerModule || !window.StudioLabCore) return;
  const { $, waitFor, scope } = window.StudioLabCore;
  const selectors = {
    thoughts: 'ms-thought-chunk, .thought-panel, .thought-chunk, .thought-activity-host',
    media: 'ms-image-chunk, ms-file-chunk, ms-audio-chunk, ms-video-chunk, ms-media-chunk, ms-drive-file-chunk, ms-pdf-chunk, ms-document-chunk, ms-youtube-chunk, ms-multimedia-chunk, ms-download-chunk, ms-chunk-media, ms-media-chip, ms-file-chip, ms-image-chip, ms-audio-chip, ms-video-chip, ms-drive-chip, ms-attachment-chunk, ms-inline-data-chunk, .image-chunk, .file-chunk, .audio-chunk, .video-chunk, .media-chunk',
    code: 'ms-code-execution-chunk, ms-function-call-chunk, ms-function-response-chunk, ms-code-block[data-test-language="Executable code"], ms-code-block[data-test-language="Code execution result"], ms-executable-code-chunk, ms-code-execution-result-chunk'
  };
  let lifetime = null, operation = null, report = null;

  function closeReport() { report?.dispose(); report = null; }
  function cancelOperation() {
    operation?.abort(); operation = null; closeReport();
  }
  function valid(controller, route) {
    return !controller.signal.aborted && lifetime && !lifetime.disposed && location.pathname === route;
  }
  function actionButton(turn) {
    const buttons = [...turn.querySelectorAll('button, ms-button')];
    const candidates = buttons.filter(button => {
      const label = `${button.getAttribute('aria-label') || ''} ${button.textContent || ''}`.toLowerCase();
      return /more_vert|more options|more actions/.test(label);
    });
    return candidates.length === 1 ? candidates[0] : null;
  }
  function createReport(total, controller) {
    closeReport();
    const view = scope();
    const release = lifetime.add(() => view.dispose());
    report = { dispose: release };
    const panel = document.createElement('section'); panel.className = 'sl-chat-cleanup-progress';
    panel.setAttribute('aria-label', 'Chat cleanup progress');
    const title = document.createElement('strong'); title.textContent = 'Chat cleanup';
    const status = document.createElement('p'); status.setAttribute('role', 'status');
    const list = document.createElement('ol'); list.className = 'sl-chat-cleanup-results';
    const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Cancel cleanup';
    panel.append(title, status, list, button); document.body.appendChild(panel);
    const rows = [];
    for (let i = 0; i < total; i++) {
      const row = document.createElement('li'); row.textContent = `Turn ${i + 1}: Waiting`; list.appendChild(row); rows.push(row);
    }
    view.on(button, 'click', () => {
      if (!controller.signal.aborted && operation === controller) {
        controller.abort(); status.textContent = 'Stopping cleanup…'; button.disabled = true;
      } else closeReport();
    });
    view.add(() => panel.remove());
    return {
      status(text) { if (!view.disposed) status.textContent = text; },
      row(index, text) { if (!view.disposed) rows[index].textContent = `Turn ${index + 1}: ${text}`; },
      finish(text) { if (!view.disposed) { status.textContent = text; button.disabled = false; button.textContent = 'Close'; } }
    };
  }
  async function deleteTurn(turn, controller, route, progress) {
    if (!valid(controller, route) || !turn.isConnected) return 'Unavailable';
    const button = actionButton(turn);
    if (!button) return 'Delete menu unavailable';
    const previous = new Set(document.querySelectorAll('[role="menu"], .mat-mdc-menu-panel, .mat-menu-panel'));
    button.click();
    const menu = await waitFor(() => {
      if (!valid(controller, route) || !turn.isConnected) return null;
      const candidates = [...document.querySelectorAll('[role="menu"], .mat-mdc-menu-panel, .mat-menu-panel')]
        .filter(node => !previous.has(node) && node.isConnected);
      const panels = [...new Set(candidates.map(node => node.closest('.mat-mdc-menu-panel, .mat-menu-panel') || node))];
      const controlled = button.getAttribute('aria-controls');
      if (controlled) {
        const controlledNode = candidates.find(node => node.id === controlled);
        return controlledNode ? (controlledNode.closest('.mat-mdc-menu-panel, .mat-menu-panel') || controlledNode) : null;
      }
      return panels.length === 1 ? panels[0] : null;
    }, { timeout: 1000, interval: 25, signal: controller.signal });
    if (!valid(controller, route)) return 'Cancelled';
    if (!menu || !turn.isConnected) return 'Delete menu unavailable';
    const deleteButtons = [...menu.querySelectorAll('[role="menuitem"], button')].filter(item => {
      const label = `${item.getAttribute('aria-label') || ''} ${item.textContent || ''}`.trim().toLowerCase();
      return /\bdelete\b/.test(label);
    });
    if (deleteButtons.length !== 1) return 'Delete action unavailable';
    const previousDialogs = new Set(document.querySelectorAll('mat-dialog-container, .mat-mdc-dialog-container, [role="dialog"]'));
    deleteButtons[0].click();
    if (!valid(controller, route)) return 'Cancelled';
    const outcome = await waitFor(() => {
      if (!turn.isConnected) return 'removed';
      const dialogs = [...document.querySelectorAll('mat-dialog-container, .mat-mdc-dialog-container, [role="dialog"]')]
        .filter(dialog => !previousDialogs.has(dialog) && !dialog.closest('.sl-overlay'));
      return dialogs.length === 1 ? dialogs[0] : null;
    }, { timeout: 1000, interval: 25, signal: controller.signal });
    if (!valid(controller, route)) return 'Cancelled';
    if (outcome === 'removed') return 'Removed from view';
    if (!outcome) return 'Delete was not confirmed';
    progress.status('Confirm the native delete dialog to continue, or cancel it to stop.');
    const confirmed = await waitFor(() => {
      if (!turn.isConnected) return 'removed';
      if (!outcome.isConnected) return 'closed';
      return null;
    }, { timeout: 30000, interval: 50, signal: controller.signal });
    if (!valid(controller, route)) return 'Cancelled';
    if (confirmed === 'removed') return 'Removed from view';
    if (confirmed !== 'closed') return 'Delete was not confirmed';
    const removed = await waitFor(() => !turn.isConnected, { timeout: 500, interval: 25, signal: controller.signal });
    if (!valid(controller, route)) return 'Cancelled';
    return removed ? 'Removed from view' : 'Delete was not confirmed';
  }
  async function deleteMatchingTurns(selector, label) {
    if (!lifetime || lifetime.disposed || operation) return { ok: false, count: 0 };
    const route = location.pathname;
    const matches = [...document.querySelectorAll(selector)].map(node => ({ node, turn: node.closest('ms-chat-turn') || node.closest('.chat-turn-container') }))
      .filter(item => {
        if (!item.turn) return false;
        for (let parent = item.node.parentElement; parent && parent !== item.turn; parent = parent.parentElement) {
          if (parent.matches(selector)) return false;
        }
        return true;
      });
    const turns = [...new Set(matches.map(item => item.turn))];
    if (!turns.length) {
      window.alert(`No loaded turns containing ${label} were found. Load earlier turns and try again.`);
      return { ok: true, count: 0 };
    }
    const accepted = window.confirm(`Found ${matches.length} matching item${matches.length === 1 ? '' : 's'} in ${turns.length} loaded turn${turns.length === 1 ? '' : 's'}. Delete each entire turn containing ${label}, including all its other content? Only loaded turns are included. This cannot be undone by Studio.lab.`);
    if (!accepted || location.pathname !== route || lifetime.disposed) return { ok: false, count: 0 };
    const controller = new AbortController(); operation = controller;
    const progress = createReport(turns.length, controller);
    let count = 0, attempted = 0;
    try {
      for (const turn of turns) {
        if (!valid(controller, route)) break;
        const index = attempted++;
        progress.row(index, 'Opening native delete action');
        progress.status(`Processing turn ${index + 1} of ${turns.length}.`);
        const outcome = await deleteTurn(turn, controller, route, progress);
        progress.row(index, outcome);
        if (outcome !== 'Removed from view') break;
        count++;
      }
      for (let i = attempted; i < turns.length; i++) progress.row(i, 'Not attempted');
      progress.finish(controller.signal.aborted ? `Cleanup stopped. ${count} of ${turns.length} turns were removed from view.` :
        `Cleanup finished. ${count} of ${turns.length} turns were removed from view.`);
      return { ok: count === turns.length, count };
    } finally {
      if (operation === controller) operation = null;
    }
  }
  window.StudioLab.registerModule({
    id: 'chat-cleanup', group: 'modules', order: 3,
    title: 'Chat Cleanup', subtitle: 'Review and delete loaded whole turns containing selected content.',
    defaults: { autoDeleteThoughtsEnabled: false, deleteThoughtDelay: 5 },
    init() { lifetime?.dispose(); lifetime = scope(); },
    onRouteChange(_ctx, current, previous) { if (current?.key !== previous?.key) cancelOperation(); },
    dispose() { cancelOperation(); lifetime?.dispose(); lifetime = null; },
    renderControls() {
      return '<div class="sl-setting-tool-fields" data-sl-controls-for="chat-cleanup"><p class="sl-setting-help">Automatic thought deletion is unavailable because AI Studio does not expose a verified way to remove individual blocks. Cleanup deletes entire loaded turns after confirmation.</p><button type="button" class="sl-settings-button" data-sl-load-cleanup-history>Load earlier turns for cleanup</button><p class="sl-setting-help">This requests all available turns and may take time in a large chat. Review the loaded-turn count before deleting.</p></div>';
    },
    bindControls(root) {
      const button = $('[data-sl-load-cleanup-history]', root);
      if (!button) return;
      const view = scope();
      view.on(button, 'click', () => {
        if (!lifetime || lifetime.disposed) return;
        window.dispatchEvent(new CustomEvent('__sl_restoreAllTurns'));
      });
      return () => view.dispose();
    }
  });
  window.StudioLab.ChatCleanup = {
    deleteAllThoughts: () => deleteMatchingTurns(selectors.thoughts, 'thoughts'),
    deleteAllMedia: () => deleteMatchingTurns(selectors.media, 'media'),
    deleteAllCodeExecutions: () => deleteMatchingTurns(selectors.code, 'code execution'),
    fixShareChatError: () => deleteMatchingTurns(`${selectors.media}, ${selectors.code}`, 'media or code execution'),
    isRunning: () => operation !== null
  };
})();
