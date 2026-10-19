// Capture network payloads because Angular virtualizes the chat DOM.
(function () {
  'use strict';

  const { $, el, scope } = window.StudioLabCore;

  let capture = null;
  let chatEpoch = 0;
  const pendingSaves = new Map();

  function currentRoute() {
    return location.pathname.replace(/\/+$/, '') || '/';
  }

  function routeKey(path) {
    return typeof path === 'string' ? path.replace(/\/+$/, '') || '/' : null;
  }

  function savedRoute(name) {
    return typeof name === 'string' && /^prompts\/[A-Za-z0-9_-]+$/.test(name) &&
      !/^prompts\/new_(?:chat|image|video|comparison)$/.test(name) ? '/' + name : null;
  }

  function discardCapture() {
    capture = null;
    pendingSaves.clear();
  }

  function currentCapture(allowPending = false) {
    if (!capture) return null;
    const route = currentRoute();
    if (capture.quarantineRoute && capture.quarantineRoute !== route) {
      discardCapture();
      return null;
    }
    if (capture.route !== route) {
      if (capture.promotion === route) {
        capture.route = route;
        capture.promotion = null;
        capture.quarantineRoute = null;
        pendingSaves.clear();
      } else if (capture.route === '/prompts/new_chat' && savedRoute(route.slice(1)) &&
                 [...pendingSaves.values()].some(save => save.owner === capture)) {
        // Native navigation can beat the save response clone. Retain the
        // candidate privately, but never export on an unconfirmed route.
        capture.quarantineRoute = route;
        return allowPending ? capture : null;
      } else {
        discardCapture();
        return null;
      }
    }
    return capture;
  }

  window.addEventListener('__sl_chatReset', e => {
    const detail = e.detail;
    if (detail?.version !== 1 || !Number.isSafeInteger(detail.epoch) || detail.epoch <= chatEpoch) return;
    chatEpoch = detail.epoch;
    discardCapture();
  });

  window.addEventListener('__sl_requestPayload', (e) => {
    const detail = e.detail;
    const route = routeKey(detail?.route) || currentRoute();
    if (route !== currentRoute()) return;
    const epoch = Number.isSafeInteger(detail?.epoch) && detail.epoch >= 0 ? detail.epoch : null;
    if (epoch !== null && epoch < chatEpoch) return;
    if (epoch !== null) chatEpoch = epoch;
    discardCapture();
    try {
      const raw = typeof detail === 'string' ? detail : (detail?.body ?? detail?.payload);
      if (!raw || (typeof raw !== 'string' && typeof raw !== 'object')) return;
      const payload = JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw));
      if (!payload || typeof payload !== 'object') return;
      capture = { route, requestRoute: route, epoch, requestId: detail?.requestId || null, payload, reply: null, completed: false };
      if (window.StudioLab?.log) {
        window.StudioLab.log('📦 Chat payload captured (' + (payload[1]?.length ?? payload.contents?.length ?? '?') + ' turns)', 'info');
      }
    } catch (err) {
      if (window.StudioLab && window.StudioLab.log) {
        window.StudioLab.log('Failed to parse request payload for export', 'warn');
      }
    }
  });

  window.addEventListener('__sl_responsePayload', (e) => {
    const detail = e.detail;
    const active = currentCapture(true);
    if (!active || !active.requestId || detail?.version !== 1 || !detail.ok || detail.complete !== true ||
        detail.requestId !== active.requestId || routeKey(detail.route) !== active.requestRoute || typeof detail.body !== 'string' ||
        (active.epoch !== null && detail.epoch !== active.epoch)) return;
    try {
      const parts = responseParts(detail.body);
      active.reply = parts.length ? [parts, 'model'] : null;
      active.completed = !!active.reply;
      [...pendingSaves.values()].forEach(tryConfirmSave);
    } catch (_) {
      window.StudioLab?.log?.('Could not capture the completed reply for export.', 'warn');
    }
  });

  window.addEventListener('__sl_promptSaveRequest', e => {
    const detail = e.detail;
    const active = currentCapture();
    if (!active || active.epoch === null || detail?.version !== 1 || !detail.saveId || detail.epoch !== active.epoch ||
        routeKey(detail.route) !== active.route || !['CreatePrompt', 'UpdatePrompt'].includes(detail.operation) || typeof detail.body !== 'string') return;
    try {
      const root = JSON.parse(detail.body);
      const saved = savedTranscript(Array.isArray(root) ? root[0] : null);
      const input = requestTranscript(active.payload);
      if (!saved || !input || saved.model !== input.model || saved.system !== input.system) return;
      if (detail.operation === 'CreatePrompt' ? active.route !== '/prompts/new_chat' || !!saved.name : savedRoute(saved.name) !== active.route) return;
      if (input.history[input.history.length - 1]?.[0] !== 'user' || saved.history.length <= input.history.length ||
          !sameTranscript(saved.history.slice(0, input.history.length), input.history) ||
          saved.history.slice(input.history.length).some(part => part[0] !== 'model')) return;
      const save = { owner: active, saveId: detail.saveId, operation: detail.operation, route: active.route,
        epoch: active.epoch, history: saved.history, resultRoute: null };
      if (active.completed && !matchesCompleted(save)) return;
      pendingSaves.set(save.saveId, save);
      if (pendingSaves.size > 8) discardCapture();
    } catch (_) {}
  });

  window.addEventListener('__sl_promptSaveResult', e => {
    const detail = e.detail;
    const save = pendingSaves.get(detail?.saveId);
    if (!save || detail?.version !== 1 || detail.epoch !== save.epoch || detail.operation !== save.operation ||
        routeKey(detail.route) !== save.route || save.owner !== currentCapture(true)) return;
    const target = savedRoute(detail.name);
    if (detail.complete !== true || !detail.ok || !target || (save.operation === 'UpdatePrompt' && target !== save.route)) {
      pendingSaves.delete(save.saveId);
      currentCapture();
      return;
    }
    save.resultRoute = target;
    tryConfirmSave(save);
  });

  function sameTranscript(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

  function matchesCompleted(save) {
    const active = save.owner;
    const input = requestTranscript(active.payload);
    const reply = textTurn(active.reply);
    return !!input && !!reply && active.completed && sameTranscript(save.history, input.history.concat(reply));
  }

  function tryConfirmSave(save) {
    if (!save.resultRoute || save.owner !== capture || save.epoch !== chatEpoch || !save.owner.completed) return;
    if (!matchesCompleted(save)) {
      pendingSaves.delete(save.saveId);
      currentCapture();
      return;
    }
    const route = currentRoute();
    if (route !== save.route && route !== save.resultRoute) { discardCapture(); return; }
    capture.promotion = save.resultRoute;
    pendingSaves.clear();
    currentCapture();
  }

  function addText(history, role, thought, text) {
    if (!text) return;
    const previous = history[history.length - 1];
    if (previous?.[0] === role && previous[1] === thought) previous[2] += text;
    else history.push([role, thought, text]);
  }

  function textTurn(turn) {
    if (!Array.isArray(turn?.[0]) || !['user', 'model'].includes(turn[1])) return null;
    const history = [];
    for (const part of turn[0]) {
      if (!Array.isArray(part) || part[0] != null || typeof part[1] !== 'string' ||
          (part[12] != null && ![0, 1, false, true].includes(part[12])) ||
          (part[14] != null && typeof part[14] !== 'string') ||
          part.some((value, index) => ![1, 12, 14].includes(index) && value != null)) return null;
      addText(history, turn[1], !!part[12], part[1]);
    }
    return history;
  }

  function modelName(value) {
    return typeof value === 'string' && /^(?:models\/)?[\w.-]+$/.test(value) ? value.replace(/^models\//, '') : null;
  }

  function requestTranscript(payload) {
    const model = Array.isArray(payload) && modelName(payload[0]);
    if (!model || !Array.isArray(payload[1]) || !payload[1].length) return null;
    const history = [];
    for (const turn of payload[1]) {
      const parts = textTurn(turn);
      if (!parts) return null;
      for (const [role, thought, text] of parts) addText(history, role, thought, text);
    }
    let system = '';
    if (payload[5] != null) {
      const instruction = textTurn(payload[5]);
      if (!instruction || instruction.some(part => part[0] !== 'user' || part[1])) return null;
      system = instruction.map(part => part[2]).join('');
    }
    return { model, system, history };
  }

  function savedTranscript(prompt) {
    if (!Array.isArray(prompt) || !Array.isArray(prompt[13]?.[0])) return null;
    const model = modelName(prompt[3]?.[2]);
    const system = prompt[12]?.[0] ?? '';
    if (!model || typeof system !== 'string' || (prompt[0] != null && typeof prompt[0] !== 'string')) return null;
    const history = [];
    for (const chunk of prompt[13][0]) {
      if (!Array.isArray(chunk) || typeof chunk[0] !== 'string' || !['user', 'model'].includes(chunk[8]) ||
          (chunk[19] != null && ![0, 1, false, true].includes(chunk[19])) ||
          [1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 13, 17, 20, 23].some(index => chunk[index] != null)) return null;
      if (chunk[29] != null) {
        const parts = textTurn([chunk[29], chunk[8]]);
        if (!parts || parts.map(part => part[2]).join('') !== chunk[0] || parts.some(part => part[1] !== !!chunk[19])) return null;
      }
      addText(history, chunk[8], !!chunk[19], chunk[0]);
    }
    return { name: prompt[0] || '', model, system, history };
  }

  function responseParts(body) {
    const decoded = JSON.parse(body.replace(/^\s*\)\]\}'[^\r\n]*[\r\n]+/, ''));
    const parts = [];
    function addPart(part) {
      const previous = parts[parts.length - 1];
      // Server streaming sends text deltas. Join adjacent deltas while retaining
      // the separation between reasoning and the answer and preserving media.
      if (Array.isArray(part) && part[0] === null && typeof part[1] === 'string' && part[1] &&
          Array.isArray(previous) && previous[0] === null && typeof previous[1] === 'string' &&
          !!previous[12] === !!part[12]) previous[1] += part[1];
      else parts.push(part);
    }
    function visit(value) {
      if (!Array.isArray(value)) return;
      const candidates = value[0];
      if (Array.isArray(candidates) && candidates.some(candidate => Array.isArray(candidate?.[0]?.[0]) && candidate[0][1] === 'model')) {
        const candidate = candidates.find(item => item?.[2] === 0) || candidates[0];
        const content = candidate?.[0];
        if (content?.[1] === 'model' && Array.isArray(content[0])) content[0].forEach(addPart);
        return;
      }
      value.forEach(visit);
    }
    visit(decoded);
    return parts;
  }

  function exportPayload() {
    const active = currentCapture();
    if (!active) return null;
    const payload = JSON.parse(JSON.stringify(active.payload));
    if (active.reply && Array.isArray(payload[1])) payload[1].push(active.reply);
    return payload;
  }

  function exportAsJson() {
    const payload = exportPayload();
    if (!payload) {
      return { ok: false, message: 'No chat history captured yet. Send a message in this chat, then try again.' };
    }
    downloadFile(
      JSON.stringify(payload, null, 2),
      'chat-export.json',
      'application/json'
    );
    return { ok: true, message: 'JSON download started.' };
  }

  function exportAsMarkdown() {
    const payload = exportPayload();
    if (!payload || !Array.isArray(payload) || payload.length < 2) {
      return { ok: false, message: 'No chat history captured yet. Send a message in this chat, then try again.' };
    }

    const turns = payload[1];
    if (!Array.isArray(turns)) {
      return { ok: false, message: 'This captured chat structure cannot be exported as Markdown. Try JSON instead.' };
    }

    const lines = ['# Chat Export\n'];

    turns.forEach((turn, index) => {
      const parts = [];
      extractText(turn, parts);

      if (parts.length) {
        const role = turn[1] === 'model' ? 'Model' : turn[1] === 'user' ? 'User' : index % 2 === 0 ? 'User' : 'Model';
        lines.push('## ' + role + '\n');
        lines.push(parts.join('\n\n'));
        lines.push('\n\n---\n');
      }
    });

    downloadFile(lines.join('\n'), 'chat-export.md', 'text/markdown');
    return { ok: true, message: 'Markdown download started.' };
  }

  function extractText(obj, out) {
    if (!Array.isArray(obj)) return;
    if (obj.length >= 2 && obj[0] === null && typeof obj[1] === 'string') {
      const str = obj[1];
      if (
        str.trim().length > 0 &&
        !str.startsWith('iVBORw0K') &&
        !str.startsWith('/9j/') &&
        !str.startsWith('blob:') &&
        !str.includes('image/')
      ) {
        out.push(str);
      }
    }
    for (let i = 0; i < obj.length; i++) {
      extractText(obj[i], out);
    }
  }

  function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = el('<a></a>');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  window.StudioLab.registerModule({
    id: 'chat-export',
    group: 'modules',
    order: 5,
    title: 'Chat Export',
    subtitle: 'Export complete context to Markdown or JSON.',
    alwaysSelected: true,
    onRouteChange() { currentCapture(); },
    renderControls: () => `
      <div class="sl-setting-tool-fields">
        <div class="sl-setting-actions">
          <button type="button" class="sl-settings-button" id="sl-export-md" aria-describedby="sl-help-chat-export">Download Markdown</button>
          <button type="button" class="sl-settings-button" id="sl-export-json" aria-describedby="sl-help-chat-export">Download JSON</button>
        </div>
        <p class="sl-setting-help" id="sl-export-status" hidden></p>
      </div>
    `,
    bindControls: (modalEl, ctx) => {
      const btnMd = $('#sl-export-md', modalEl);
      const btnJson = $('#sl-export-json', modalEl);
      const status = $('#sl-export-status', modalEl);
      function runExport(action) {
        let result;
        try { result = action(); }
        catch (_) { result = { ok: false, message: 'The download could not start. Try again.' }; }
        if (status) { status.textContent = result.message; status.hidden = false; }
        ctx?.announceSettings?.(result.message, !result.ok);
      }
      const onMarkdown = event => {
        event.stopPropagation();
        runExport(exportAsMarkdown);
      };
      const onJson = event => {
        event.stopPropagation();
        runExport(exportAsJson);
      };
      const s = scope();
      if (btnMd) s.on(btnMd, 'click', onMarkdown);
      if (btnJson) s.on(btnJson, 'click', onJson);
      return () => s.dispose();
    }
  });
})();
