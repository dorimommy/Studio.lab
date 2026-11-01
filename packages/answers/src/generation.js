import { INSTRUCTIONS } from './schema.js';

const MAX_BODY = 8 * 1024 * 1024;
const MARKER = '[Studio.lab answer format v1]';
const GUIDE = '\n\n' + MARKER + '\n' +
  'Use normal Markdown for ordinary answers. Only use studiolab-ui when the user asks for or clearly benefits from an interactive table, chart or calculator. ' +
  'Respect the user\u2019s system instructions and requested response format; this optional display format must not override them. ' +
  'There is no need to make every answer interactive. Do not replace a requested code example, JSON document, plain-text answer or other exact format with an interactive document.\n' + INSTRUCTIONS;

function parseRanges(raw) {
  let position = 0;
  let count = 0;
  const primitive = /(?:null|true|false|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/y;
  const whitespace = () => {
    while (position < raw.length && /[\t\n\r ]/.test(raw[position])) position++;
  };
  const fail = () => { throw new Error('Unsupported JSON request.'); };
  function read(depth = 0) {
    if (++count > 200000 || depth > 64) fail();
    whitespace();
    const start = position;
    const character = raw[position];
    if (character === '"') {
      position++;
      while (position < raw.length) {
        const next = raw[position++];
        if (next === '"') return { kind: 'string', start, end: position };
        if (next.charCodeAt(0) < 32) fail();
        if (next === '\\') {
          const escape = raw[position++];
          if (escape === 'u') {
            if (!/^[0-9a-fA-F]{4}$/.test(raw.slice(position, position + 4))) fail();
            position += 4;
          } else if (typeof escape !== 'string' || !'"\\/bfnrt'.includes(escape)) fail();
        }
      }
      fail();
    }
    if (character === '[' || character === '{') {
      const array = character === '[';
      const close = array ? ']' : '}';
      const node = { kind: array ? 'array' : 'object', start, end: 0, items: [], fields: new Map() };
      position++;
      whitespace();
      if (raw[position] === close) { node.end = ++position; return node; }
      while (position < raw.length) {
        let key;
        if (!array) {
          const token = read(depth + 1);
          if (token.kind !== 'string' || token.end - token.start > 1024) fail();
          key = JSON.parse(raw.slice(token.start, token.end));
          if (node.fields.has(key)) fail();
          whitespace();
          if (raw[position++] !== ':') fail();
        }
        const child = read(depth + 1);
        if (array) node.items.push(child);
        else node.fields.set(key, child);
        whitespace();
        if (raw[position] === close) { node.end = ++position; return node; }
        if (raw[position++] !== ',') fail();
      }
      fail();
    }
    primitive.lastIndex = position;
    const token = primitive.exec(raw)?.[0];
    if (!token) fail();
    position += token.length;
    const value = JSON.parse(token);
    if (typeof value === 'number' && !Number.isFinite(value)) fail();
    return { kind: 'primitive', start, end: position, value };
  }
  const root = read();
  whitespace();
  if (position !== raw.length) fail();
  return root;
}

const absent = node => !node || node.kind === 'primitive' && node.value === null;
const stringValue = (raw, node) => node?.kind === 'string' ? JSON.parse(raw.slice(node.start, node.end)) : null;
const replace = (raw, node, value) => raw.slice(0, node.start) + value + raw.slice(node.end);

function appendArray(raw, array, value) {
  const at = array.end - 1;
  return raw.slice(0, at) + (array.items.length ? ',' : '') + value + raw.slice(at);
}

function textModel(value) {
  return typeof value === 'string' && /^(?:models\/)?[\w.-]+$/.test(value) && !/(?:image|imagen|video|veo|audio|tts|live)/i.test(value);
}

function nativeTextMode(raw, configuration) {
  if (absent(configuration)) return true;
  if (configuration.kind !== 'array') return false;
  const mime = configuration.items[7];
  if (!absent(mime) && !['', 'text/plain'].includes(stringValue(raw, mime))) return false;
  if (!absent(configuration.items[8])) return false;
  const modalities = configuration.items[14];
  if (!absent(modalities) && (modalities.kind !== 'array' || modalities.items.some(item => item.kind !== 'primitive' || item.value !== 1))) return false;
  return [15, 26, 27, 31].every(index => absent(configuration.items[index]));
}

function rewriteNative(raw, root) {
  if (!textModel(stringValue(raw, root.items[0])) || root.items[1]?.kind !== 'array' || !root.items[1].items.length) return raw;
  if (!root.items[1].items.every(turn => turn.kind === 'array' && turn.items[0]?.kind === 'array' && turn.items[0].items.length &&
      turn.items[0].items.every(part => part.kind === 'array') &&
      ['user', 'model'].includes(stringValue(raw, turn.items[1])))) return raw;
  if (![2, 6].every(index => absent(root.items[index]) || root.items[index].kind === 'array')) return raw;
  if (!absent(root.items[4]) && root.items[4].kind !== 'string') return raw;
  if (!nativeTextMode(raw, root.items[3])) return raw;
  // Server continuation/cache and secondary-instruction profiles have not been verified.
  if ((!absent(root.items[11]) && stringValue(raw, root.items[11]) !== '') || !absent(root.items[15])) return raw;
  const instruction = root.items[5];
  if (!absent(instruction)) {
    if (instruction.kind !== 'array' || instruction.items.length !== 2 || instruction.items[0]?.kind !== 'array' ||
        stringValue(raw, instruction.items[1]) !== 'user') return raw;
    const parts = instruction.items[0];
    for (const part of parts.items) {
      if (part.kind !== 'array' || !absent(part.items[0]) || part.items[1]?.kind !== 'string' ||
          part.items.slice(2).some(item => !absent(item))) return raw;
      if (stringValue(raw, part.items[1]).includes(MARKER)) return raw;
    }
    return appendArray(raw, parts, JSON.stringify([null, GUIDE]));
  }
  const content = JSON.stringify([[[null, GUIDE]], 'user']);
  if (instruction) return replace(raw, instruction, content);
  const missing = Math.max(0, 5 - root.items.length);
  return appendArray(raw, root, Array(missing).fill('null').concat(content).join(','));
}

function restTextMode(raw, root) {
  if (['cachedContent', 'cached_content', 'system_instruction', 'generation_config'].some(key => !absent(root.fields.get(key)))) return false;
  const configuration = root.fields.get('generationConfig');
  if (!absent(configuration)) {
    if (configuration.kind !== 'object') return false;
    const mime = configuration.fields.get('responseMimeType');
    if (!absent(mime) && !['', 'text/plain'].includes(stringValue(raw, mime))) return false;
    if (['responseSchema', 'responseJsonSchema', 'imageConfig', 'speechConfig', 'videoConfig'].some(key => !absent(configuration.fields.get(key)))) return false;
    const modalities = configuration.fields.get('responseModalities');
    if (!absent(modalities) && (modalities.kind !== 'array' || modalities.items.some(item => stringValue(raw, item) !== 'TEXT'))) return false;
  }
  const tools = root.fields.get('toolConfig');
  const calling = tools?.kind === 'object' && tools.fields.get('functionCallingConfig');
  if (calling?.kind === 'object' && stringValue(raw, calling.fields.get('mode')) === 'ANY') return false;
  return true;
}

function rewriteRest(raw, root) {
  const model = root.fields.get('model');
  if (model && !textModel(stringValue(raw, model))) return raw;
  const contents = root.fields.get('contents');
  if (contents?.kind !== 'array' || !contents.items.length || !contents.items.every(content => content.kind === 'object' &&
      content.fields.get('parts')?.kind === 'array' && content.fields.get('parts').items.length &&
      content.fields.get('parts').items.every(part => part.kind === 'object') && (absent(content.fields.get('role')) ||
        ['user', 'model'].includes(stringValue(raw, content.fields.get('role')))))) return raw;
  if (!restTextMode(raw, root)) return raw;
  const instruction = root.fields.get('systemInstruction');
  if (!absent(instruction)) {
    if (instruction.kind !== 'object' || [...instruction.fields.keys()].some(key => !['parts', 'role'].includes(key))) return raw;
    const role = instruction.fields.get('role');
    if (!absent(role) && !['user', 'system'].includes(stringValue(raw, role))) return raw;
    const parts = instruction.fields.get('parts');
    if (parts?.kind !== 'array') return raw;
    for (const part of parts.items) {
      if (part.kind !== 'object' || part.fields.size !== 1 || part.fields.get('text')?.kind !== 'string') return raw;
      if (stringValue(raw, part.fields.get('text')).includes(MARKER)) return raw;
    }
    return appendArray(raw, parts, JSON.stringify({ text: GUIDE }));
  }
  const value = JSON.stringify({ parts: [{ text: GUIDE }] });
  if (instruction) return replace(raw, instruction, value);
  const at = root.end - 1;
  return raw.slice(0, at) + (root.fields.size ? ',' : '') + '"systemInstruction":' + value + raw.slice(at);
}

export function rewriteRequest(body) {
  if (typeof body !== 'string' || !body || body.length > MAX_BODY) return body;
  try {
    const root = parseRanges(body);
    if (root.kind === 'array') return rewriteNative(body, root);
    if (root.kind === 'object') return rewriteRest(body, root);
  } catch (_) { /* An unrecognized request keeps its native bytes. */ }
  return body;
}
