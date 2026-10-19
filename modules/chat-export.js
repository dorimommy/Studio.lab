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
    PROMPT: { NAME: 0, RUN_SETTINGS: 3, METADATA: 4, CHUNKED: 13 },
    RUN_SETTINGS: { TEMPERATURE: 0, MODEL: 2, TOP_P: 4, TOP_K: 5, MAX_TOKENS: 6 },
    METADATA: { TITLE: 0, MODIFIED: 4 },
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
        dataBase64: null, // not inlined into exports in phase 1
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
      systemInstruction: null,
      turns,
      stats: null,
    };
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
    conv.stats = computeStats(conv);
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
  };

  function loadOpts() {
    return store.get(OPTS_KEY, null).then(saved =>
      Object.assign({}, DEFAULT_OPTS, saved || {}));
  }

  function applyOpts(conv, opts) {
    const out = Object.assign({}, conv, {
      turns: conv.turns.map(t => Object.assign({}, t, { parts: t.parts.slice() })),
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
      for (const p of t.parts) {
        lines.push('', '*[Attachment: ' + (p.name || p.driveId || p.type) + ']*');
      }
      lines.push('', '---', '');
    }
    return lines.join('\n');
  }

  function formatText(conv, opts) {
    const lines = [conv.title, '='.repeat(Math.min(conv.title.length, 60)), ''];
    for (const t of conv.turns) {
      const who = t.role === 'user' ? 'USER' : (t.isThought ? 'MODEL (reasoning)' : 'MODEL');
      const meta = turnMetaLine(t);
      lines.push(who + (meta ? ' [' + meta + ']' : '') + ':');
      lines.push(t.text);
      for (const p of t.parts) lines.push('[Attachment: ' + (p.name || p.driveId || p.type) + ']');
      lines.push('');
    }
    return lines.join('\n');
  }

  function formatJson(conv) {
    return JSON.stringify(conv, null, 2);
  }

  const FORMATTERS = {
    md: { ext: 'md', mime: 'text/markdown', fn: formatMarkdown, label: 'Markdown' },
    txt: { ext: 'txt', mime: 'text/plain', fn: formatText, label: 'Text' },
    json: { ext: 'json', mime: 'application/json', fn: formatJson, label: 'JSON' },
  };

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
        const res = await callMainWorld('__sl_fetchPrompt', { driveId });
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
    group: 'modules',
    order: 5,
    title: 'Chat Export',
    subtitle: 'Export full chat history to Markdown, Text or JSON.',
    alwaysSelected: true,
    onRouteChange() { currentCapture(); },
    renderControls: () => `
      <div class="sl-setting-tool-fields" data-sl-search-item data-sl-search="Chat Export download markdown text json history">
        <div class="sl-setting-actions">
          <button type="button" class="sl-settings-button" id="sl-export-md" aria-describedby="sl-export-help">Markdown</button>
          <button type="button" class="sl-settings-button" id="sl-export-txt" aria-describedby="sl-export-help">Text</button>
          <button type="button" class="sl-settings-button" id="sl-export-json" aria-describedby="sl-export-help">JSON</button>
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
      };
      let opts = Object.assign({}, DEFAULT_OPTS);
      const readUi = () => ({
        reasoning: reasoningSel ? reasoningSel.value : opts.reasoning,
        timestamps: optInputs.timestamps ? optInputs.timestamps.checked : opts.timestamps,
        tokenCounts: optInputs.tokenCounts ? optInputs.tokenCounts.checked : opts.tokenCounts,
        systemInstruction: optInputs.systemInstruction ? optInputs.systemInstruction.checked : opts.systemInstruction,
        modelConfig: optInputs.modelConfig ? optInputs.modelConfig.checked : opts.modelConfig,
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
          const final = applyOpts(conv, readUi());
          const fmt = FORMATTERS[kind];
          const content = fmt.fn(final, readUi());
          downloadFile(content, safeFileName(final.title) + '.' + fmt.ext, fmt.mime);
          const sourceNote = final.source === 'api' ? 'full history' :
            'live capture' + (apiError ? ' (' + apiError + ')' : '');
          say(fmt.label + ' download started — ' + final.stats.turnCount + ' turns, ' + sourceNote + '.');
        } catch (err) {
          say('The download could not start. Try again.', true);
        } finally {
          busy = false;
        }
      }

      for (const [kind, btnId] of [['md', '#sl-export-md'], ['txt', '#sl-export-txt'], ['json', '#sl-export-json']]) {
        const btn = $(btnId, modalEl);
        if (btn) s.on(btn, 'click', (event) => { event.stopPropagation(); runExport(kind); });
      }
      return () => s.dispose();
    }
  });
})();
