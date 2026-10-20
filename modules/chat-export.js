// Chat Export: full-history export via AI Studio's own RPC (MAIN-world
// transport in rpc-transport.js), with the live network capture as fallback.
//
// The RPC path fetches the whole saved conversation by its Drive id, so
// export works on any opened chat instantly — no need to send a message
// first and no lazy-loading gaps. Both paths produce the same normalized
// conversation model; the formatters below only ever see that model, so a
// new format is one small pure function.
(function () {
  'use strict';

  const { $, el, scope, store } = window.StudioLabCore;

  // ---------------------------------------------------------------------------
  // Live capture (fallback). Captures network payloads because Angular
  // virtualizes the chat DOM. Kept as-is: it is also the only path that sees
  // the current unsent session state.
  // ---------------------------------------------------------------------------

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

  function driveIdFromRoute(route) {
    const m = /^\/prompts\/([A-Za-z0-9_-]+)$/.exec(route || '');
    if (!m || /^new_(?:chat|image|video|comparison)$/.test(m[1])) return null;
    return m[1];
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

  // ---------------------------------------------------------------------------
  // MAIN-world bridge. The isolated world cannot call the MakerSuite RPC
  // directly (CORS); rpc-transport.js runs in MAIN and answers over the
  // __sl_result_<eventId> channel.
  // ---------------------------------------------------------------------------

  // Prompt payloads can be enormous (image chats inline generated images as
  // base64 — 77 MB / 80 s observed), so fetches get a far longer leash than
  // the small control calls the 20 s default was sized for.
  const FETCH_TIMEOUT_MS = 120000;

  function callMainWorld(eventName, payload, timeoutMs = 20000) {
    return new Promise((resolve) => {
      const s = scope();
      const eventId = 'sl' + Math.random().toString(36).slice(2, 11);
      let done = false;
      const finish = (result) => {
        if (done) return;
        done = true;
        s.dispose();
        resolve(result);
      };
      s.on(window, '__sl_result_' + eventId,
        (e) => finish(e.detail || { ok: false, error: 'Empty response from MAIN world' }));
      s.timeout(() => finish({ ok: false, error: 'MAIN world did not answer in time' }), timeoutMs);
      window.dispatchEvent(new CustomEvent(eventName, { detail: Object.assign({}, payload, { eventId }) }));
    });
  }

  // ---------------------------------------------------------------------------
  // Normalized conversation model. Every extractor (RPC or live capture)
  // produces this shape; every formatter consumes only this shape.
  //
  // Conversation: { id, title, url, source: 'api'|'live', exportedAt,
  //   modifiedAt, config: {model, temperature, topP, topK, maxOutputTokens}|null,
  //   systemInstruction: string|null, turns: Turn[], stats }
  // Turn: { role: 'user'|'model', isThought, text, parts: Part[],
  //   tokenCount: number|null, timestamp: epochMs|null }
  // Part: { type: 'image'|'file', name, mimeType, driveId, dataBase64 }
  // ---------------------------------------------------------------------------

  // Wire-format index maps for the ResolveDriveResource response
  // (protobuf-JSON positional arrays). Verified against live responses; every
  // read below is tolerant, so a renumbered field degrades to null metadata.
  const WIRE = {
    PROMPT: { NAME: 0, RUN_SETTINGS: 3, METADATA: 4, SYSTEM: 12, CHUNKED: 13 },
    RUN_SETTINGS: { TEMPERATURE: 0, MODEL: 2, TOP_P: 4, TOP_K: 5, MAX_TOKENS: 6 },
    METADATA: { TITLE: 0, MODIFIED: 4, KEY_VALUES: 11 },
    TURN: { TEXT: 0, DRIVE_REF: 3, ROLE: 8, ANSWER_FLAG: 16, TOKEN_COUNT: 18,
            INLINE_FILE: 23, PARTS: 29, TIMESTAMP: 32 },
    PART: { TEXT: 1, THOUGHT: 12 },
  };

  const at = (arr, i) => (Array.isArray(arr) ? arr[i] : undefined);
  const str = (v) => (typeof v === 'string' ? v : '');
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const arrOf = (v) => (Array.isArray(v) ? v : []);

  function epochMs(ts) {
    if (!Array.isArray(ts)) return null;
    const seconds = Number(ts[0]);
    if (!Number.isFinite(seconds)) return null;
    return Math.round(seconds * 1000 + (Number(ts[1]) || 0) / 1e6);
  }

  function decodeConfig(raw) {
    if (!Array.isArray(raw)) return null;
    const R = WIRE.RUN_SETTINGS;
    return {
      model: modelName(str(at(raw, R.MODEL))) || str(at(raw, R.MODEL)) || null,
      temperature: num(at(raw, R.TEMPERATURE)),
      topP: num(at(raw, R.TOP_P)),
      topK: num(at(raw, R.TOP_K)),
      maxOutputTokens: num(at(raw, R.MAX_TOKENS)),
    };
  }

  function decodeParts(rawTurn) {
    const parts = [];
    const inline = at(rawTurn, WIRE.TURN.INLINE_FILE);
    if (Array.isArray(inline) && typeof inline[1] === 'string' && inline[1]) {
      const label = str(inline[0]);
      const mime = label.includes('/');
      parts.push({
        type: mime && label.startsWith('image/') ? 'image' : 'file',
        name: mime ? null : (label || null),
        mimeType: mime ? label : null,
        driveId: null,
        dataBase64: inline[1], // bytes inlined by the API; used by zip/html exports
      });
    }
    const ref = at(rawTurn, WIRE.TURN.DRIVE_REF);
    const driveId = Array.isArray(ref) ? str(ref[0]) : '';
    if (driveId && !parts.some(p => p.driveId === driveId)) {
      parts.push({ type: 'file', name: null, mimeType: null, driveId, dataBase64: null });
    }
    return parts;
  }

  function decodeText(rawTurn) {
    const flat = str(at(rawTurn, WIRE.TURN.TEXT));
    if (flat) return flat;
    return arrOf(at(rawTurn, WIRE.TURN.PARTS)).map(p => str(at(p, WIRE.PART.TEXT))).join('');
  }

  function isThoughtTurn(rawTurn, role) {
    if (role !== 'model') return false;
    const parts = arrOf(at(rawTurn, WIRE.TURN.PARTS));
    // Part-level marker states it directly. The turn-level flag has inverted
    // polarity: it is set on answers, so its absence means reasoning.
    if (parts.length) return parts.every(p => at(p, WIRE.PART.THOUGHT) === 1);
    return at(rawTurn, WIRE.TURN.ANSWER_FLAG) !== 1;
  }

  function decodeConversation(data) {
    const prompt = at(data, 0);
    if (!Array.isArray(prompt)) throw new Error('Unexpected prompt payload');
    const P = WIRE.PROMPT;
    const id = str(at(prompt, P.NAME)).replace(/^prompts\//, '');
    const metadata = at(prompt, P.METADATA);
    const rawTurns = arrOf(at(arrOf(at(prompt, P.CHUNKED)), 0));
    const turns = [];
    for (const rawTurn of rawTurns) {
      if (!Array.isArray(rawTurn)) continue;
      const role = str(at(rawTurn, WIRE.TURN.ROLE)) === 'model' ? 'model' : 'user';
      const text = decodeText(rawTurn);
      const parts = decodeParts(rawTurn);
      if (!text.trim() && !parts.length) continue; // placeholder rows carry nothing
      turns.push({
        role,
        isThought: isThoughtTurn(rawTurn, role),
        text,
        parts,
        tokenCount: num(at(rawTurn, WIRE.TURN.TOKEN_COUNT)),
        timestamp: epochMs(at(rawTurn, WIRE.TURN.TIMESTAMP)),
      });
    }
    const conv = {
      id,
      title: str(at(metadata, WIRE.METADATA.TITLE)) || 'Untitled Conversation',
      url: id ? 'https://aistudio.google.com/prompts/' + id : location.href,
      source: 'api',
      exportedAt: Date.now(),
      modifiedAt: epochMs(at(arrOf(at(metadata, WIRE.METADATA.MODIFIED)), 0)),
      config: decodeConfig(at(prompt, P.RUN_SETTINGS)),
      systemInstruction: str(at(at(prompt, P.SYSTEM), 0)) || null,
      turns,
      stats: null,
    };
    condenseAttachmentTurns(conv);
    conv.stats = computeStats(conv);
    return conv;
  }

  // Live-capture payloads → the same normalized model (fallback path).
  function modelFromPayload(payload) {
    const input = requestTranscript(payload);
    if (!input) return null;
    const turns = input.history.map(([role, thought, text]) => ({
      role, isThought: !!thought, text, parts: [],
      tokenCount: null, timestamp: null,
    }));
    const conv = {
      id: driveIdFromRoute(currentRoute()) || '',
      title: document.title.replace(/\s*-\s*Google AI Studio\s*$/, '') || 'Untitled Conversation',
      url: location.href,
      source: 'live',
      exportedAt: Date.now(),
      modifiedAt: null,
      config: input.model ? { model: input.model, temperature: null, topP: null, topK: null, maxOutputTokens: null } : null,
      systemInstruction: input.system || null,
      turns,
      stats: null,
    };
    condenseAttachmentTurns(conv);
    conv.stats = computeStats(conv);
    return conv;
  }

  // AI Studio files each attachment as its own turn, so a message with three
  // images arrives as four turns. Fold each run of attachment-only turns into
  // the same-role turn that follows it, so exports read like the chat.
  function condenseAttachmentTurns(conv) {
    const turns = conv.turns;
    const out = [];
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      const attachmentOnly = !turn.text.trim() && turn.parts.length > 0;
      const next = turns[i + 1];
      if (!attachmentOnly || !next || next.role !== turn.role || next.isThought !== turn.isThought) {
        out.push(turn);
        continue;
      }
      next.parts = turn.parts.concat(next.parts);
      if (typeof turn.tokenCount === 'number') {
        next.tokenCount = (next.tokenCount || 0) + turn.tokenCount;
      }
      if (turn.timestamp && (!next.timestamp || turn.timestamp < next.timestamp)) {
        next.timestamp = turn.timestamp;
      }
    }
    conv.turns = out;
    return conv;
  }

  function computeStats(conv) {
    const turns = conv.turns;
    let totalTokens = null;
    let attachments = 0;
    for (const t of turns) {
      if (typeof t.tokenCount === 'number') totalTokens = (totalTokens || 0) + t.tokenCount;
      attachments += t.parts.length;
    }
    return {
      turnCount: turns.length,
      userTurns: turns.filter(t => t.role === 'user').length,
      modelTurns: turns.filter(t => t.role === 'model' && !t.isThought).length,
      thoughtTurns: turns.filter(t => t.isThought).length,
      totalTokens,
      attachments,
    };
  }

  // ---------------------------------------------------------------------------
  // Settings. One store object; the UI below edits it in place.
  // ---------------------------------------------------------------------------

  const OPTS_KEY = 'sl_export_opts';
  const DEFAULT_OPTS = {
    reasoning: 'separate', // 'separate' | 'inline' | 'exclude'
    timestamps: true,
    tokenCounts: false,
    systemInstruction: true,
    modelConfig: true,
    attachments: true,
  };

  function loadOpts() {
    return store.get(OPTS_KEY, null).then(saved =>
      Object.assign({}, DEFAULT_OPTS, saved || {}));
  }

  function applyOpts(conv, opts) {
    const out = Object.assign({}, conv, {
      turns: conv.turns.map(t => Object.assign({}, t, {
        parts: t.parts.map(p => Object.assign({}, p)),
      })),
    });
    if (opts.reasoning === 'exclude') out.turns = out.turns.filter(t => !t.isThought);
    if (!opts.systemInstruction) out.systemInstruction = null;
    if (!opts.modelConfig) out.config = null;
    if (!opts.timestamps) out.turns.forEach(t => { t.timestamp = null; });
    if (!opts.tokenCounts) out.turns.forEach(t => { t.tokenCount = null; });
    out.stats = computeStats(out);
    return out;
  }

  // ---------------------------------------------------------------------------
  // Formatters. Pure functions over the normalized model: adding a format is
  // adding one function here plus one button below.
  // ---------------------------------------------------------------------------

  function fmtDate(ms) {
    if (!ms) return '';
    try { return new Date(ms).toLocaleString(); } catch (_) { return ''; }
  }

  function turnMetaLine(t) {
    const bits = [];
    if (t.timestamp) bits.push(fmtDate(t.timestamp));
    if (typeof t.tokenCount === 'number') bits.push(t.tokenCount + ' tokens');
    return bits.length ? bits.join(' · ') : '';
  }

  function mdEscape(text) { return String(text); }

  function formatMarkdown(conv, opts) {
    const lines = ['# ' + conv.title, ''];
    const headerBits = [];
    if (conv.config?.model) headerBits.push('Model: ' + conv.config.model);
    if (conv.modifiedAt) headerBits.push('Last modified: ' + fmtDate(conv.modifiedAt));
    headerBits.push('Exported: ' + fmtDate(conv.exportedAt));
    headerBits.push(conv.source === 'api' ? 'Source: full history via API' : 'Source: live session capture');
    lines.push('> ' + headerBits.join(' · '), '');
    if (conv.config && (conv.config.temperature != null || conv.config.topP != null ||
        conv.config.topK != null || conv.config.maxOutputTokens != null)) {
      lines.push('**Settings:** ' + [
        conv.config.temperature != null && 'temperature ' + conv.config.temperature,
        conv.config.topP != null && 'topP ' + conv.config.topP,
        conv.config.topK != null && 'topK ' + conv.config.topK,
        conv.config.maxOutputTokens != null && 'max tokens ' + conv.config.maxOutputTokens,
      ].filter(Boolean).join(', '), '');
    }
    if (conv.systemInstruction) {
      lines.push('**System instruction:**', '', conv.systemInstruction, '');
    }
    for (const t of conv.turns) {
      const heading = t.role === 'user' ? '## User'
        : t.isThought ? '## Model (reasoning)' : '## Model';
      lines.push(heading, '');
      const meta = turnMetaLine(t);
      if (meta) lines.push('*' + meta + '*', '');
      if (opts.reasoning === 'inline' && t.isThought) lines.push('*Reasoning:*', '');
      lines.push(mdEscape(t.text));
      for (const p of t.parts) lines.push('', mdAttachmentLine(p));
      lines.push('', '---', '');
    }
    return lines.join('\n');
  }

  // Link into the zip's attachments/ folder when the bytes were fetched;
  // otherwise a plain note so the reader knows something was attached.
  function mdAttachmentLine(p) {
    if (p.fileName) {
      const target = 'attachments/' + p.fileName
        .replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
      return p.type === 'image'
        ? '![' + (p.name || 'image') + '](' + target + ')'
        : '[' + (p.name || p.fileName) + '](' + target + ')';
    }
    return '*[Attachment: ' + (p.name || p.driveId || p.type) + ']*';
  }

  function formatText(conv, opts) {
    const lines = [conv.title, '='.repeat(Math.min(conv.title.length, 60)), ''];
    for (const t of conv.turns) {
      const who = t.role === 'user' ? 'USER' : (t.isThought ? 'MODEL (reasoning)' : 'MODEL');
      const meta = turnMetaLine(t);
      lines.push(who + (meta ? ' [' + meta + ']' : '') + ':');
      lines.push(t.text);
      for (const p of t.parts) lines.push('[Attachment: ' + (p.fileName || p.name || p.driveId || p.type) + ']');
      lines.push('');
    }
    return lines.join('\n');
  }

  function formatJson(conv) {
    // Attachment bytes travel as files in the zip, not as base64 in the JSON.
    const clean = Object.assign({}, conv, {
      turns: conv.turns.map(t => Object.assign({}, t, {
        parts: t.parts.map(p => {
          const copy = Object.assign({}, p);
          delete copy.dataBase64;
          return copy;
        }),
      })),
    });
    return JSON.stringify(clean, null, 2);
  }

  // --- Attachments (phase 3) -------------------------------------------------
  // Parts that reference a Drive file are downloaded at full fidelity through
  // the MAIN-world transport; inline parts already carry their bytes.

  const MIME_EXT = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
    'image/svg+xml': 'svg', 'application/pdf': 'pdf', 'text/plain': 'txt',
    'text/markdown': 'md', 'text/csv': 'csv', 'application/json': 'json',
    'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'video/mp4': 'mp4',
  };

  function attachmentFileName(part, used) {
    let name = (part.name || ('attachment-' + (part.driveId || 'inline')))
      .replace(/[\\/:*?"<>|]/g, '').trim() || 'attachment';
    if (part.exportedExtension) {
      name = name.replace(/\.[^.]+$/, '') + '.' + part.exportedExtension;
    } else if (!/\.[A-Za-z0-9]{1,5}$/.test(name)) {
      name += '.' + (MIME_EXT[part.mimeType] || 'bin');
    }
    let candidate = name;
    let n = 2;
    while (used.has(candidate)) {
      candidate = name.replace(/(\.[^.]+)?$/, (m) => ' (' + n++ + ')' + (m || ''));
    }
    used.add(candidate);
    return candidate;
  }

  async function fetchAttachments(conv) {
    const used = new Set();
    let fetched = 0;
    for (const turn of conv.turns) {
      for (const part of turn.parts) {
        if (part.driveId && !part.dataBase64) {
          try {
            const res = await callMainWorld('__sl_driveDownload', { fileId: part.driveId }, 120000);
            if (res?.ok && res.base64) {
              part.dataBase64 = res.base64;
              part.name = part.name || res.meta?.name || null;
              part.mimeType = res.effectiveMimeType || part.mimeType;
              part.exportedExtension = res.exportedExtension || null;
            }
          } catch (_) { /* leave as a placeholder part */ }
        }
        if (part.dataBase64) {
          part.fileName = attachmentFileName(part, used);
          fetched++;
        }
      }
    }
    return fetched;
  }

  // --- Minimal ZIP writer (STORE, no compression) ----------------------------
  // Zero-dependency by design: ~60 lines instead of bundling JSZip. STORE is
  // fine for exports; most attachments (images, PDFs) barely compress anyway.

  const CRC_TABLE = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = -1;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  }

  function base64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  const textToBytes = (s) => new TextEncoder().encode(s);

  function makeZip(entries) { // entries: [{ name, data: Uint8Array }]
    const now = new Date();
    const dosTime = ((now.getHours() & 31) << 11) | ((now.getMinutes() & 63) << 5) | ((now.getSeconds() >> 1) & 31);
    const dosDate = (((Math.max(now.getFullYear(), 1980) - 1980) & 127) << 9) |
      (((now.getMonth() + 1) & 15) << 5) | (now.getDate() & 31);
    const chunks = [];
    const central = [];
    let offset = 0;
    for (const entry of entries) {
      const nameBytes = textToBytes(entry.name);
      const crc = crc32(entry.data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true); // UTF-8 names
      local.setUint16(8, 0, true);      // STORE
      local.setUint16(10, dosTime, true);
      local.setUint16(12, dosDate, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, entry.data.length, true);
      local.setUint32(22, entry.data.length, true);
      local.setUint16(26, nameBytes.length, true);
      chunks.push(new Uint8Array(local.buffer), nameBytes, entry.data);
      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true);
      cen.setUint16(4, 20, true);
      cen.setUint16(6, 20, true);
      cen.setUint16(8, 0x0800, true);
      cen.setUint16(10, 0, true);
      cen.setUint16(12, dosTime, true);
      cen.setUint16(14, dosDate, true);
      cen.setUint32(16, crc, true);
      cen.setUint32(20, entry.data.length, true);
      cen.setUint32(24, entry.data.length, true);
      cen.setUint16(28, nameBytes.length, true);
      cen.setUint32(42, offset, true);
      central.push(new Uint8Array(cen.buffer), nameBytes);
      offset += 30 + nameBytes.length + entry.data.length;
    }
    const centralSize = central.reduce((n, c) => n + c.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, entries.length, true);
    end.setUint16(10, entries.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);
    return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
  }

  // --- More formatters (phase 3) ----------------------------------------------

  function htmlEscape(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Small Markdown→HTML renderer: fences, headings, lists, paragraphs, and
  // inline code/bold/italic/links. Enough for a readable standalone page.
  function mdToHtml(text) {
    const out = [];
    const lines = String(text).split('\n');
    let inCode = false;
    let para = [];
    const flushPara = () => {
      if (!para.length) return;
      out.push('<p>' + para.map(inlineHtml).join('<br>') + '</p>');
      para = [];
    };
    const inlineHtml = (line) => htmlEscape(line)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    for (const line of lines) {
      if (/^```/.test(line)) {
        if (inCode) { out.push('</code></pre>'); inCode = false; }
        else { flushPara(); out.push('<pre><code>'); inCode = true; }
        continue;
      }
      if (inCode) { out.push(htmlEscape(line)); continue; }
      const h = /^(#{1,4})\s+(.*)$/.exec(line);
      if (h) { flushPara(); out.push('<h' + (h[1].length + 1) + '>' + inlineHtml(h[2]) + '</h' + (h[1].length + 1) + '>'); continue; }
      if (/^\s*[-*]\s+/.test(line)) { flushPara(); out.push('<div class="li">' + inlineHtml(line.replace(/^\s*[-*]\s+/, '• ')) + '</div>'); continue; }
      if (!line.trim()) { flushPara(); continue; }
      para.push(line);
    }
    if (inCode) out.push('</code></pre>');
    flushPara();
    return out.join('\n');
  }

  function formatHtml(conv) {
    const body = [];
    body.push('<h1>' + htmlEscape(conv.title) + '</h1>');
    const meta = [];
    if (conv.config?.model) meta.push('Model: ' + htmlEscape(conv.config.model));
    if (conv.modifiedAt) meta.push('Last modified: ' + htmlEscape(fmtDate(conv.modifiedAt)));
    meta.push('Exported: ' + htmlEscape(fmtDate(conv.exportedAt)));
    body.push('<p class="meta">' + meta.join(' · ') + '</p>');
    if (conv.systemInstruction) {
      body.push('<h2>System instruction</h2>', mdToHtml(conv.systemInstruction));
    }
    for (const t of conv.turns) {
      const cls = t.role === 'user' ? 'user' : (t.isThought ? 'thought' : 'model');
      const label = t.role === 'user' ? 'User' : (t.isThought ? 'Model (reasoning)' : 'Model');
      body.push('<section class="turn ' + cls + '"><h2>' + label + '</h2>');
      const m = turnMetaLine(t);
      if (m) body.push('<p class="meta">' + htmlEscape(m) + '</p>');
      body.push(mdToHtml(t.text));
      for (const p of t.parts) {
        if (p.type === 'image' && p.dataBase64 && p.mimeType) {
          body.push('<p><img alt="' + htmlEscape(p.name || 'image') + '" src="data:' +
            p.mimeType + ';base64,' + p.dataBase64 + '"></p>');
        } else {
          body.push('<p class="meta">[Attachment: ' + htmlEscape(p.name || p.fileName || p.type) + ']</p>');
        }
      }
      body.push('</section>');
    }
    return '<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>' + htmlEscape(conv.title) + '</title><style>' +
      'body{font-family:system-ui,sans-serif;max-width:820px;margin:2rem auto;padding:0 1rem;line-height:1.55;color:#1b1b1f}' +
      '.meta{color:#666;font-size:.85em}section.turn{border-top:1px solid #ddd;padding:1rem 0}' +
      'section.user{background:#f6f8ff}section.thought{background:#fdf6ec;color:#554433}' +
      'pre{background:#f4f4f4;padding:.75rem;overflow:auto;border-radius:8px}code{background:#f0f0f0;padding:0 .25em;border-radius:4px}' +
      'pre code{background:none;padding:0}img{max-width:100%}.li{margin-left:1rem}</style></head><body>' +
      body.join('\n') + '</body></html>';
  }

  function formatObsidian(conv, opts) {
    const fm = ['---',
      'title: ' + JSON.stringify(conv.title),
      'date: ' + new Date(conv.exportedAt).toISOString(),
      conv.config?.model ? 'model: ' + conv.config.model : null,
      'source: ' + conv.url,
      'tags: [ai-studio]',
      '---', ''].filter(x => x !== null);
    const lines = fm.slice();
    if (conv.systemInstruction) {
      lines.push('## System instruction', '', conv.systemInstruction, '');
    }
    for (const t of conv.turns) {
      if (t.isThought) {
        lines.push('> [!note]- Reasoning');
        for (const l of t.text.split('\n')) lines.push('> ' + l);
        lines.push('');
      } else {
        lines.push(t.role === 'user' ? '## User' : '## Model', '');
        const meta = turnMetaLine(t);
        if (meta) lines.push('*' + meta + '*', '');
        lines.push(t.text, '');
      }
      for (const p of t.parts) {
        lines.push(p.fileName ? '![[' + p.fileName + ']]'
          : '*[Attachment: ' + (p.name || p.driveId || p.type) + ']*', '');
      }
    }
    return lines.join('\n');
  }

  function csvCell(v) {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function formatCsv(conv) {
    const rows = [['conversation', 'role', 'is_thought', 'timestamp', 'token_count', 'text', 'attachments']];
    for (const t of conv.turns) {
      rows.push([
        t.conversation || conv.title || '', t.role, t.isThought ? 'true' : 'false',
        t.timestamp ? new Date(t.timestamp).toISOString() : '',
        t.tokenCount ?? '', t.text,
        t.parts.map(p => p.fileName || p.name || p.type).join('; '),
      ]);
    }
    return rows.map(r => r.map(csvCell).join(',')).join('\n');
  }

  function formatJsonl(conv) {
    return conv.turns.map(t => JSON.stringify({
      conversation: t.conversation || conv.title || '',
      role: t.role,
      isThought: t.isThought,
      timestamp: t.timestamp ? new Date(t.timestamp).toISOString() : null,
      tokenCount: t.tokenCount,
      text: t.text,
      attachments: t.parts.map(p => p.fileName || p.name || p.type),
    })).join('\n');
  }

  const FORMATTERS = {
    md: { ext: 'md', mime: 'text/markdown', fn: formatMarkdown, label: 'Markdown', zip: true },
    txt: { ext: 'txt', mime: 'text/plain', fn: formatText, label: 'Text', zip: true },
    json: { ext: 'json', mime: 'application/json', fn: formatJson, label: 'JSON', zip: true },
    html: { ext: 'html', mime: 'text/html', fn: formatHtml, label: 'HTML' },
    obsidian: { ext: 'md', mime: 'text/markdown', fn: formatObsidian, label: 'Obsidian', zip: true },
    csv: { ext: 'csv', mime: 'text/csv', fn: formatCsv, label: 'CSV' },
    jsonl: { ext: 'jsonl', mime: 'application/json', fn: formatJsonl, label: 'JSONL' },
  };

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = el('<a></a>');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
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
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function safeFileName(title) {
    const base = (title || 'chat-export').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 80) || 'chat-export';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return base + ' - ' + stamp;
  }

  async function buildModel() {
    // 1. API path: full saved history, instant, any opened chat.
    const driveId = driveIdFromRoute(currentRoute());
    let apiError = null;
    if (driveId) {
      try {
        const res = await callMainWorld('__sl_fetchPrompt', { driveId }, FETCH_TIMEOUT_MS);
        if (res?.ok && res.data) {
          const conv = decodeConversation(res.data);
          if (conv.turns.length) return { conv, apiError };
          apiError = 'The API returned no turns for this chat.';
        } else {
          apiError = res?.error || 'API request failed.';
        }
      } catch (err) {
        apiError = (err && err.message) || String(err);
      }
    }
    // 2. Fallback: live network capture of the current session.
    const active = currentCapture();
    if (active) {
      const payload = JSON.parse(JSON.stringify(active.payload));
      if (active.reply && Array.isArray(payload[1])) payload[1].push(active.reply);
      const conv = modelFromPayload(payload);
      if (conv && conv.turns.length) {
        return { conv, apiError: apiError ? 'API unavailable (' + apiError + ') — used live capture.' : null };
      }
    }
    return { conv: null, apiError };
  }

  // ---------------------------------------------------------------------------
  // Library export + scheduled backups (phase 4).
  //
  // Library: ListPrompts pages the whole account library; each conversation
  // is fetched, formatted and filed under its own folder in one zip, with an
  // index.md and a manifest.json that names every failure (the run continues
  // past them on purpose). CSV/JSONL produce one combined dataset instead.
  //
  // Backups: background.js owns a chrome.alarms schedule and pings open AI
  // Studio tabs; the export itself runs here, incrementally — only prompts
  // whose modifiedAt changed since the last successful run are fetched.
  // ---------------------------------------------------------------------------

  function decodePromptList(data) {
    const items = arrOf(at(data, 0)).map(entry => {
      const meta = at(entry, WIRE.PROMPT.METADATA);
      const kv = {};
      for (const pair of arrOf(at(meta, WIRE.METADATA.KEY_VALUES))) {
        if (Array.isArray(pair)) kv[pair[0]] = pair[1];
      }
      return {
        id: str(at(entry, WIRE.PROMPT.NAME)).replace(/^prompts\//, ''),
        title: str(at(meta, WIRE.METADATA.TITLE)) || 'Untitled Conversation',
        modifiedAt: epochMs(at(arrOf(at(meta, WIRE.METADATA.MODIFIED)), 0)),
        promptType: kv.promptType || null,
        hasImages: kv.hasImages === 'true',
      };
    }).filter(item => item.id);
    return { items, nextPageToken: str(at(data, 1)) || null };
  }

  async function listAllPrompts() {
    const all = [];
    let token = null;
    for (let page = 0; page < 200; page++) { // 200 pages bounds a runaway token loop
      const res = await callMainWorld('__sl_listPrompts', { pageSize: 100, pageToken: token });
      if (!res?.ok) throw new Error(res?.error || 'Could not list the library.');
      const decoded = decodePromptList(res.data);
      all.push(...decoded.items);
      token = decoded.nextPageToken;
      if (!token || !decoded.items.length) break;
    }
    return all;
  }

  function uniqueFolder(title, used) {
    let base = (title || 'Untitled Conversation')
      .replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 80) || 'Untitled Conversation';
    let candidate = base;
    let n = 2;
    while (used.has(candidate)) candidate = base + ' (' + n++ + ')';
    used.add(candidate);
    return candidate;
  }

  async function exportLibrary({ fmt, opts, incremental, onProgress }) {
    const allItems = await listAllPrompts();
    const state = incremental ? (await store.get('sl_export_state', null)) : null;
    const known = state?.knownModified || {};
    const targets = incremental
      ? allItems.filter(i => !(i.id in known) || known[i.id] !== i.modifiedAt)
      : allItems;

    // Flat dataset formats: one file for the whole library, no folders/zip.
    if (fmt === FORMATTERS.csv || fmt === FORMATTERS.jsonl) {
      const combined = { turns: [] };
      const failures = [];
      let done = 0;
      for (const item of targets) {
        done++;
        onProgress?.(done, targets.length, item.title);
        try {
          const res = await callMainWorld('__sl_fetchPrompt', { driveId: item.id }, FETCH_TIMEOUT_MS);
          if (!res?.ok) throw new Error(res?.error || 'fetch failed');
          const conv = applyOpts(decodeConversation(res.data), opts);
          for (const t of conv.turns) {
            combined.turns.push(Object.assign({ conversation: item.title }, t));
          }
        } catch (err) {
          failures.push({ id: item.id, title: item.title, error: (err && err.message) || String(err) });
        }
      }
      const failedIds = new Set(failures.map(f => f.id));
      return { flat: fmt.fn(combined, opts), count: targets.length - failures.length,
        failures, allItems, changedOnly: incremental,
        exportedIds: targets.filter(t => !failedIds.has(t.id)).map(t => t.id) };
    }

    const entries = [];
    const manifestItems = [];
    const failures = [];
    const usedFolders = new Set();
    let done = 0;
    for (const item of targets) {
      done++;
      onProgress?.(done, targets.length, item.title);
      try {
        const res = await callMainWorld('__sl_fetchPrompt', { driveId: item.id }, FETCH_TIMEOUT_MS);
        if (!res?.ok) throw new Error(res?.error || 'fetch failed');
        const conv = applyOpts(decodeConversation(res.data), opts);
        let attached = 0;
        if (opts.attachments && fmt.zip) attached = await fetchAttachments(conv);
        const folder = uniqueFolder(item.title, usedFolders);
        entries.push({ name: folder + '/conversation.' + fmt.ext, data: textToBytes(fmt.fn(conv, opts)) });
        for (const t of conv.turns) {
          for (const p of t.parts) {
            if (p.fileName && p.dataBase64) {
              entries.push({ name: folder + '/attachments/' + p.fileName, data: base64ToBytes(p.dataBase64) });
            }
          }
        }
        manifestItems.push({ id: item.id, title: item.title, folder,
          modifiedAt: item.modifiedAt, turns: conv.stats.turnCount, attachments: attached, ok: true });
      } catch (err) {
        const message = (err && err.message) || String(err);
        failures.push({ id: item.id, title: item.title, error: message });
        manifestItems.push({ id: item.id, title: item.title, ok: false, error: message });
      }
    }

    const indexLines = ['# AI Studio library', '',
      'Exported: ' + fmtDate(Date.now()) + (incremental ? ' · incremental (changed conversations only)' : ''),
      'Conversations: ' + manifestItems.filter(i => i.ok).length +
        (failures.length ? ' · Failed: ' + failures.length : ''), ''];
    for (const item of manifestItems) {
      if (item.ok) {
        indexLines.push('- [' + item.title + '](' +
          (item.folder + '/conversation.' + fmt.ext).replace(/ /g, '%20') + ')' +
          (item.modifiedAt ? ' — ' + fmtDate(item.modifiedAt) : ''));
      } else {
        indexLines.push('- ' + item.title + ' — FAILED: ' + item.error);
      }
    }
    const manifest = {
      exportedAt: new Date().toISOString(),
      incremental: !!incremental,
      format: fmt.ext,
      total: allItems.length,
      exported: manifestItems.filter(i => i.ok).length,
      failed: failures.length,
      items: manifestItems,
    };
    entries.unshift(
      { name: 'index.md', data: textToBytes(indexLines.join('\n')) },
      { name: 'manifest.json', data: textToBytes(JSON.stringify(manifest, null, 2)) }
    );
    return { blob: makeZip(entries), count: manifest.exported, failures, allItems,
      changedOnly: incremental,
      exportedIds: manifestItems.filter(i => i.ok).map(i => i.id) };
  }

  const BACKUP_KEY = 'sl_export_backup'; // { schedule: 'off'|'daily'|'weekly', format }
  const BACKUP_STATE_KEY = 'sl_export_state'; // { lastRunAt, lastOkAt, lastCount, knownModified, runningAt }

  async function runScheduledBackup() {
    const backup = await store.get(BACKUP_KEY, null);
    if (!backup || !backup.schedule || backup.schedule === 'off') return { started: false };
    // Claim the run so two open tabs do not both export.
    const prev = await store.get(BACKUP_STATE_KEY, null);
    if (prev?.runningAt && Date.now() - prev.runningAt < 30 * 60 * 1000) return { started: false };
    await store.set({ [BACKUP_STATE_KEY]: Object.assign({}, prev, { runningAt: Date.now() }) });
    try {
      const opts = await loadOpts();
      const fmt = FORMATTERS[backup.format] || FORMATTERS.md;
      const result = await exportLibrary({ fmt, opts, incremental: true, onProgress: null });
      if (result.flat) {
        downloadFile(result.flat, 'ai-studio-library-backup.' + fmt.ext, fmt.mime);
      } else if (result.count > 0) {
        downloadBlob(result.blob, 'ai-studio-library-backup - ' +
          new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.zip');
      }
      const exportedIds = new Set(result.exportedIds || []);
      const prevKnown = prev?.knownModified || {};
      const knownModified = {};
      for (const item of result.allItems) {
        if (exportedIds.has(item.id)) {
          knownModified[item.id] = item.modifiedAt;
        } else if (prevKnown[item.id] != null) {
          knownModified[item.id] = prevKnown[item.id];
        }
        // A conversation that failed and was never exported stays unknown
        // on purpose: the next backup retries it instead of believing it
        // is safely stored.
      }
      await store.set({ [BACKUP_STATE_KEY]: {
        lastRunAt: Date.now(), lastOkAt: Date.now(),
        lastCount: result.count, knownModified, runningAt: 0,
      } });
      window.StudioLab?.log?.('📦 Library backup done: ' + result.count + ' conversations.', 'info');
      return { started: true, count: result.count };
    } catch (err) {
      const prev2 = await store.get(BACKUP_STATE_KEY, null);
      await store.set({ [BACKUP_STATE_KEY]: Object.assign({}, prev2, { runningAt: 0, lastRunAt: Date.now() }) });
      return { started: true, error: (err && err.message) || String(err) };
    }
  }

  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message?.action !== 'slRunBackup') return;
      runScheduledBackup().then(sendResponse).catch(() => sendResponse({ started: false }));
      return true;
    });
  }

  // ---------------------------------------------------------------------------
  // Module UI — native settings-panel styling, nothing custom.
  // ---------------------------------------------------------------------------

  function reasoningOptions(selected) {
    const options = [
      ['separate', 'Separate section'],
      ['inline', 'Inline with answers'],
      ['exclude', 'Exclude'],
    ];
    return options.map(([value, label]) =>
      '<option value="' + value + '"' + (selected === value ? ' selected' : '') + '>' + label + '</option>').join('');
  }

  function checkboxRow(id, label, help, checked) {
    return '<div class="sl-setting-row">' +
      '<div class="sl-setting-copy">' +
        '<label class="sl-setting-label" for="' + id + '">' + label + '</label>' +
        '<p class="sl-setting-help" id="' + id + '-help">' + help + '</p>' +
      '</div>' +
      '<div class="sl-setting-control"><span class="sl-setting-checkbox-hit">' +
        '<input type="checkbox" role="switch" class="sl-setting-checkbox" id="' + id + '"' +
        ' aria-describedby="' + id + '-help"' + (checked ? ' checked' : '') + '>' +
      '</span></div></div>';
  }

  window.StudioLab.registerModule({
    id: 'chat-export',
    group: 'export',
    order: 5,
    title: 'Chat Export',
    subtitle: 'Export full chat history, with attachments, in seven formats.',
    alwaysSelected: true,
    onRouteChange() { currentCapture(); },
    renderControls: () => `
      <div class="sl-setting-tool-fields" data-sl-search-item data-sl-search="Chat Export download markdown text json html obsidian csv jsonl history attachments">
        <div class="sl-setting-actions">
          <button type="button" class="sl-settings-button" id="sl-export-md" aria-describedby="sl-export-help">Markdown</button>
          <button type="button" class="sl-settings-button" id="sl-export-txt" aria-describedby="sl-export-help">Text</button>
          <button type="button" class="sl-settings-button" id="sl-export-json" aria-describedby="sl-export-help">JSON</button>
          <button type="button" class="sl-settings-button" id="sl-export-html" aria-describedby="sl-export-help">HTML</button>
          <button type="button" class="sl-settings-button" id="sl-export-obsidian" aria-describedby="sl-export-help">Obsidian</button>
          <button type="button" class="sl-settings-button" id="sl-export-csv" aria-describedby="sl-export-help">CSV</button>
          <button type="button" class="sl-settings-button" id="sl-export-jsonl" aria-describedby="sl-export-help">JSONL</button>
        </div>
        <div class="sl-setting-actions">
          <select class="sl-setting-input" id="sl-export-lib-format" aria-label="Library export format"></select>
          <button type="button" class="sl-settings-button" id="sl-export-library" aria-describedby="sl-export-help">Export library</button>
        </div>
        <details class="sl-setting-advanced">
          <summary><span class="sl-setting-label">Export options</span><svg class="sl-setting-disclosure-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg></summary>
          <div class="sl-setting-disclosure-content">
            <div class="sl-setting-row">
              <div class="sl-setting-copy">
                <label class="sl-setting-label" for="sl-export-reasoning">Reasoning</label>
                <p class="sl-setting-help" id="sl-export-reasoning-help">How model thinking is exported.</p>
              </div>
              <div class="sl-setting-control">
                <select class="sl-setting-input" id="sl-export-reasoning" aria-describedby="sl-export-reasoning-help"></select>
              </div>
            </div>
            ${checkboxRow('sl-export-timestamps', 'Timestamps', 'Show per-message date and time.', true)}
            ${checkboxRow('sl-export-tokens', 'Token counts', 'Show per-message token counts when available.', false)}
            ${checkboxRow('sl-export-system', 'System instruction', 'Include the system instruction.', true)}
            ${checkboxRow('sl-export-config', 'Model settings', 'Include model, temperature, top-P/K and limits.', true)}
            ${checkboxRow('sl-export-attachments', 'Attachments', 'Download attached files at full quality into a zip.', true)}
            <div class="sl-setting-row">
              <div class="sl-setting-copy">
                <label class="sl-setting-label" for="sl-export-backup">Scheduled backups</label>
                <p class="sl-setting-help" id="sl-export-backup-help">Incremental library backup. Runs while an AI Studio tab is open.</p>
              </div>
              <div class="sl-setting-control">
                <select class="sl-setting-input" id="sl-export-backup" aria-describedby="sl-export-backup-help"></select>
              </div>
            </div>
          </div>
        </details>
        <p class="sl-setting-help" id="sl-export-help">Downloads the full conversation. API first, live capture as fallback.</p>
        <p class="sl-setting-help" id="sl-export-status" data-sl-export-status hidden></p>
      </div>
    `,
    bindControls: (modalEl, ctx) => {
      const s = scope();
      const status = $('#sl-export-status', modalEl);
      const say = (message, isError) => {
        if (status) { status.textContent = message; status.hidden = false; }
        ctx?.announceSettings?.(message, !!isError);
      };

      // Options: load, render, persist.
      const reasoningSel = $('#sl-export-reasoning', modalEl);
      const optInputs = {
        timestamps: $('#sl-export-timestamps', modalEl),
        tokenCounts: $('#sl-export-tokens', modalEl),
        systemInstruction: $('#sl-export-system', modalEl),
        modelConfig: $('#sl-export-config', modalEl),
        attachments: $('#sl-export-attachments', modalEl),
      };
      let opts = Object.assign({}, DEFAULT_OPTS);
      const readUi = () => ({
        reasoning: reasoningSel ? reasoningSel.value : opts.reasoning,
        timestamps: optInputs.timestamps ? optInputs.timestamps.checked : opts.timestamps,
        tokenCounts: optInputs.tokenCounts ? optInputs.tokenCounts.checked : opts.tokenCounts,
        systemInstruction: optInputs.systemInstruction ? optInputs.systemInstruction.checked : opts.systemInstruction,
        modelConfig: optInputs.modelConfig ? optInputs.modelConfig.checked : opts.modelConfig,
        attachments: optInputs.attachments ? optInputs.attachments.checked : opts.attachments,
      });
      const paintUi = () => {
        if (reasoningSel) reasoningSel.innerHTML = reasoningOptions(opts.reasoning);
        for (const [key, input] of Object.entries(optInputs)) {
          if (input) input.checked = !!opts[key];
        }
      };
      loadOpts().then(saved => { opts = saved; paintUi(); });
      paintUi();
      const persist = () => {
        opts = readUi();
        store.set({ [OPTS_KEY]: opts }).catch(() => {});
      };
      if (reasoningSel) s.on(reasoningSel, 'change', persist);
      for (const input of Object.values(optInputs)) {
        if (input) s.on(input, 'change', persist);
      }

      let busy = false;
      async function runExport(kind) {
        if (busy) return;
        busy = true;
        try {
          say('Preparing export…');
          const { conv, apiError } = await buildModel();
          if (!conv) {
            say(apiError
              ? 'Nothing to export yet: ' + apiError
              : 'No chat history captured yet. Send a message in this chat, then try again.', true);
            return;
          }
          const current = readUi();
          const final = applyOpts(conv, current);
          const fmt = FORMATTERS[kind];
          let attached = 0;
          if (current.attachments && (fmt.zip || kind === 'html')) {
            say('Fetching attachments…');
            attached = await fetchAttachments(final);
          }
          const sourceNote = final.source === 'api' ? 'full history' :
            'live capture' + (apiError ? ' (' + apiError + ')' : '');
          const hasFiles = attached > 0 &&
            final.turns.some(t => t.parts.some(p => p.fileName));
          if (fmt.zip && hasFiles) {
            const entries = [{ name: 'conversation.' + fmt.ext, data: textToBytes(fmt.fn(final, current)) }];
            for (const t of final.turns) {
              for (const p of t.parts) {
                if (p.fileName && p.dataBase64) {
                  entries.push({ name: 'attachments/' + p.fileName, data: base64ToBytes(p.dataBase64) });
                }
              }
            }
            downloadBlob(makeZip(entries), safeFileName(final.title) + '.zip');
            say(fmt.label + ' zip started — ' + final.stats.turnCount + ' turns, ' +
              attached + ' attachments, ' + sourceNote + '.');
          } else {
            downloadFile(fmt.fn(final, current), safeFileName(final.title) + '.' + fmt.ext, fmt.mime);
            say(fmt.label + ' download started — ' + final.stats.turnCount + ' turns, ' + sourceNote + '.');
          }
        } catch (err) {
          say('The download could not start. Try again.', true);
        } finally {
          busy = false;
        }
      }

      for (const kind of Object.keys(FORMATTERS)) {
        const btn = $('#sl-export-' + kind, modalEl);
        if (btn) s.on(btn, 'click', (event) => { event.stopPropagation(); runExport(kind); });
      }

      // Library export + backup schedule.
      const libFormatSel = $('#sl-export-lib-format', modalEl);
      const libBtn = $('#sl-export-library', modalEl);
      const backupSel = $('#sl-export-backup', modalEl);
      const backupHelp = $('#sl-export-backup-help', modalEl);
      if (libFormatSel) {
        libFormatSel.innerHTML = Object.entries(FORMATTERS)
          .map(([k, f]) => '<option value="' + k + '">' + f.label + '</option>').join('');
        libFormatSel.value = 'md';
      }
      const paintBackup = async () => {
        const backup = await store.get(BACKUP_KEY, null);
        const state = await store.get(BACKUP_STATE_KEY, null);
        if (backupSel) {
          backupSel.innerHTML = [['off', 'Off'], ['daily', 'Daily'], ['weekly', 'Weekly']]
            .map(([v, l]) => '<option value="' + v + '"' +
              ((backup?.schedule || 'off') === v ? ' selected' : '') + '>' + l + '</option>').join('');
        }
        if (libFormatSel && backup?.format) libFormatSel.value = backup.format;
        if (backupHelp && state?.lastOkAt) {
          backupHelp.textContent = 'Incremental library backup. Last backup: ' +
            fmtDate(state.lastOkAt) + ' (' + (state.lastCount || 0) + ' conversations). ' +
            'Runs while an AI Studio tab is open.';
        }
      };
      paintBackup();
      const saveBackupPrefs = () => {
        const prefs = { schedule: backupSel ? backupSel.value : 'off',
          format: libFormatSel ? libFormatSel.value : 'md' };
        store.set({ [BACKUP_KEY]: prefs }).catch(() => {});
        try { chrome.runtime.sendMessage({ action: 'slSyncBackupAlarm' }).catch(() => {}); } catch (_) {}
      };
      if (backupSel) s.on(backupSel, 'change', saveBackupPrefs);
      if (libFormatSel) s.on(libFormatSel, 'change', saveBackupPrefs);

      let libBusy = false;
      async function runLibrary() {
        if (libBusy || busy) return;
        libBusy = true;
        try {
          const current = readUi();
          const fmt = FORMATTERS[libFormatSel ? libFormatSel.value : 'md'] || FORMATTERS.md;
          say('Listing library…');
          const result = await exportLibrary({
            fmt, opts: current, incremental: false,
            onProgress: (done, total, title) =>
              say('Exporting library… ' + done + '/' + total + ' — ' + title),
          });
          const failNote = result.failures.length
            ? ', ' + result.failures.length + ' failed (see manifest)' : '';
          if (result.flat) {
            downloadFile(result.flat, 'ai-studio-library.' + fmt.ext, fmt.mime);
            say('Library ' + fmt.label + ' started — ' + result.count + ' conversations' + failNote + '.');
          } else {
            downloadBlob(result.blob, 'ai-studio-library - ' +
              new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.zip');
            say('Library zip started — ' + result.count + ' conversations' + failNote + '.');
          }
        } catch (err) {
          say('Library export failed: ' + ((err && err.message) || err), true);
        } finally {
          libBusy = false;
        }
      }
      if (libBtn) s.on(libBtn, 'click', (event) => { event.stopPropagation(); runLibrary(); });
      return () => s.dispose();
    }
  });
})();
