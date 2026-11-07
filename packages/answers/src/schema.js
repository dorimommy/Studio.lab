export const LIMITS = Object.freeze({
  source: 262144,
  blocks: 16,
  columns: 8,
  rows: 120,
  points: 120,
  fields: 12,
  outputs: 8,
  expressionNodes: 64,
  expressionDepth: 8,
  number: 1e15
});

const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_-]{0,47}$/;
const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const fail = message => { throw new Error(message); };
const finite = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= LIMITS.number;
const onStep = (value, step, base) => {
  const steps = (value - base) / step;
  return Number.isFinite(steps) && Math.abs(steps - Math.round(steps)) <= 1e-7;
};

function copyJSON(value, budget = { nodes: 0, text: 0, active: new Set() }, depth = 0) {
  if (++budget.nodes > 20000 || depth > 32) fail('Document is too complex.');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!finite(value)) fail('Numbers must be finite and within the supported range.');
    return value;
  }
  if (typeof value === 'string') {
    budget.text += value.length;
    if (value.length > 12000 || budget.text > 96000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
      fail('Text exceeds the supported size or contains control characters.');
    }
    return value;
  }
  if (typeof value !== 'object') fail('Only JSON values are supported.');
  const array = Array.isArray(value);
  const proto = Object.getPrototypeOf(value);
  if ((!array && proto !== Object.prototype && proto !== null) || (array && proto !== Array.prototype)) {
    fail('Only plain JSON objects and arrays are supported.');
  }
  if (budget.active.has(value)) fail('Circular values are not supported.');
  budget.active.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length > 2001 || (array && value.length > 2000)) fail('A collection is too large.');
  const result = array ? [] : Object.create(null);
  for (const key of keys) {
    if (array && key === 'length') continue;
    if (typeof key !== 'string' || FORBIDDEN_KEYS.has(key)) fail('Unsupported property name.');
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !has(descriptor, 'value')) fail('Only plain JSON properties are supported.');
    if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) fail('Invalid array property.');
    result[key] = copyJSON(descriptor.value, budget, depth + 1);
  }
  if (array && result.length !== value.length) fail('Sparse arrays are not supported.');
  if (array) {
    for (let index = 0; index < value.length; index++) if (!has(result, index)) fail('Sparse arrays are not supported.');
  }
  budget.active.delete(value);
  return result;
}

function object(value, allowed, required = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Expected an object.');
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail('Unknown property.');
  for (const key of required) if (!has(value, key)) fail('A required property is missing.');
  return value;
}

function list(value, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail('A collection has an unsupported size.');
  return value;
}

function text(value, max, empty = false) {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) fail('Invalid text value.');
  return value;
}

function identifier(value) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value) || FORBIDDEN_KEYS.has(value)) fail('Invalid identifier.');
  return value;
}

function oneOf(value, options) {
  if (!options.includes(value)) fail('Unsupported value.');
  return value;
}

function title(source, target) {
  if (has(source, 'title')) target.title = text(source.title, 200);
  return target;
}

function expression(source, fields, budget = { nodes: 0 }, depth = 0) {
  if (++budget.nodes > LIMITS.expressionNodes || depth > LIMITS.expressionDepth) fail('Calculation is too complex.');
  if (finite(source)) return source;
  object(source, ['field', 'op', 'args']);
  if (has(source, 'field')) {
    object(source, ['field'], ['field']);
    const key = identifier(source.field);
    if (!fields.has(key)) fail('Calculations can reference only numeric or checkbox fields.');
    return { field: key };
  }
  object(source, ['op', 'args'], ['op', 'args']);
  const op = oneOf(source.op, ['add', 'subtract', 'multiply', 'divide', 'min', 'max', 'round']);
  const args = list(source.args, op === 'round' ? 1 : 2, op === 'round' || op === 'subtract' || op === 'divide' ? 2 : 12);
  return { op, args: args.map(argument => expression(argument, fields, budget, depth + 1)) };
}

function table(source) {
  object(source, ['type', 'id', 'title', 'columns', 'rows'], ['type', 'id', 'columns', 'rows']);
  const keys = new Set();
  const columns = list(source.columns, 1, LIMITS.columns).map(column => {
    object(column, ['key', 'label', 'format'], ['key', 'label']);
    const key = identifier(column.key);
    if (keys.has(key)) fail('Column keys must be unique.');
    keys.add(key);
    return { key, label: text(column.label, 120), format: has(column, 'format') ? oneOf(column.format, ['text', 'number', 'percent']) : 'text' };
  });
  const rows = list(source.rows, 0, LIMITS.rows).map(row => {
    object(row, [...keys], [...keys]);
    const result = {};
    for (const column of columns) {
      const cell = row[column.key];
      if (column.format !== 'text' && cell !== null && !finite(cell)) fail('Numeric columns require numbers or null.');
      if (cell !== null && typeof cell !== 'boolean' && !finite(cell) && typeof cell !== 'string') fail('Table cells must be scalar values.');
      result[column.key] = typeof cell === 'string' ? text(cell, 1024, true) : cell;
    }
    return result;
  });
  return title(source, { type: 'table', id: identifier(source.id), columns, rows });
}

function chart(source) {
  object(source, ['type', 'id', 'title', 'kind', 'xLabel', 'yLabel', 'data'], ['type', 'id', 'kind', 'data']);
  const result = title(source, {
    type: 'chart', id: identifier(source.id), kind: oneOf(source.kind, ['bar', 'line']),
    data: list(source.data, 1, LIMITS.points).map(point => {
      object(point, ['label', 'value'], ['label', 'value']);
      if (!finite(point.value)) fail('Chart values must be finite numbers.');
      return { label: text(point.label, 120), value: point.value };
    })
  });
  for (const key of ['xLabel', 'yLabel']) if (has(source, key)) result[key] = text(source[key], 120);
  return result;
}

function form(source) {
  object(source, ['type', 'id', 'title', 'fields', 'outputs'], ['type', 'id', 'fields', 'outputs']);
  const keys = new Set(), numericKeys = new Set();
  const fields = list(source.fields, 1, LIMITS.fields).map(field => {
    object(field, ['key', 'label', 'type', 'value', 'min', 'max', 'step', 'options'], ['key', 'label', 'type']);
    const key = identifier(field.key), type = oneOf(field.type, ['number', 'text', 'select', 'checkbox']);
    if (keys.has(key)) fail('Field keys must be unique.');
    keys.add(key);
    const result = { key, label: text(field.label, 120), type };
    if (type === 'number') {
      numericKeys.add(key);
      if (has(field, 'options')) fail('Number fields do not accept options.');
      for (const property of ['min', 'max', 'step']) {
        if (has(field, property)) {
          if (!finite(field[property]) || (property === 'step' && field[property] <= 0)) fail('Invalid number field constraint.');
          result[property] = field[property];
        }
      }
      if (has(result, 'min') && has(result, 'max') && result.min > result.max) fail('Minimum must not exceed maximum.');
      result.value = has(field, 'value') ? field.value : Math.min(result.max ?? LIMITS.number, Math.max(result.min ?? -LIMITS.number, 0));
      if (!has(field, 'value') && has(result, 'step') && !onStep(result.value, result.step, result.min ?? 0)) {
        const base = result.min ?? 0, steps = (result.value - base) / result.step;
        result.value = base + Math.ceil(steps) * result.step;
        if (result.value > (result.max ?? LIMITS.number)) result.value = base + Math.floor(steps) * result.step;
      }
      if (!finite(result.value) || (has(result, 'min') && result.value < result.min) || (has(result, 'max') && result.value > result.max)) fail('Number field default is outside its range.');
      if (has(result, 'step') && !onStep(result.value, result.step, result.min ?? 0)) delete result.step;
    } else {
      if (['min', 'max', 'step'].some(property => has(field, property))) fail('Only number fields accept numeric constraints.');
      if (type === 'select') {
        const options = new Set();
        result.options = list(field.options, 1, 24).map(option => {
          object(option, ['value', 'label'], ['value', 'label']);
          const value = text(option.value, 120);
          if (options.has(value)) fail('Select option values must be unique.');
          options.add(value);
          return { value, label: text(option.label, 120) };
        });
        result.value = has(field, 'value') ? field.value : result.options[0].value;
        if (!options.has(result.value)) fail('Select default must match an option.');
      } else {
        if (has(field, 'options')) fail('Only select fields accept options.');
        if (type === 'checkbox') {
          numericKeys.add(key);
          result.value = has(field, 'value') ? field.value : false;
          if (typeof result.value !== 'boolean') fail('Checkbox default must be a boolean.');
        } else result.value = has(field, 'value') ? text(field.value, 2000, true) : '';
      }
    }
    return result;
  });
  const outputs = list(source.outputs, 0, LIMITS.outputs).map(output => {
    object(output, ['label', 'expression'], ['label', 'expression']);
    return { label: text(output.label, 120), expression: expression(output.expression, numericKeys) };
  });
  return title(source, { type: 'form', id: identifier(source.id), fields, outputs });
}

export function validateDocument(value) {
  try {
    const source = copyJSON(value);
    object(source, ['version', 'title', 'blocks'], ['version', 'blocks']);
    if (source.version !== 1) fail('Unsupported document version.');
    const ids = new Set();
    const blocks = list(source.blocks, 1, LIMITS.blocks).map(block => {
      object(block, ['type', 'id', 'title', 'text', 'columns', 'rows', 'kind', 'xLabel', 'yLabel', 'data', 'fields', 'outputs'], ['type']);
      let result;
      if (block.type === 'text') {
        object(block, ['type', 'text'], ['type', 'text']);
        result = { type: 'text', text: text(block.text, 12000) };
      } else if (block.type === 'table') result = table(block);
      else if (block.type === 'chart') result = chart(block);
      else if (block.type === 'form') result = form(block);
      else fail('Unsupported block type.');
      if (result.id) {
        if (ids.has(result.id)) fail('Block identifiers must be unique.');
        ids.add(result.id);
      }
      return result;
    });
    return { ok: true, document: title(source, { version: 1, blocks }) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid interactive document.' };
  }
}

export function parseSource(source) {
  const result = status => ({ status, documents: [] });
  if (typeof source !== 'string') return { ...result('invalid'), error: 'Expected answer text.' };
  if (source.length > LIMITS.source) return source.includes('studiolab-ui')
    ? { ...result('invalid'), error: 'Interactive answer exceeds the supported size.' } : result('none');
  let fence = null, candidate = null, marked = 0, fences = 0;
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (fence) {
      const close = /^ {0,3}(`{3,}|~{3,})[\t ]*$/.exec(line);
      if (close && close[1][0] === fence.character && close[1].length >= fence.length) {
        if (fence.marked) candidate = lines.slice(fence.start, index).join('\n');
        fence = null;
      }
      continue;
    }
    const open = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)$/.exec(line);
    if (!open || (open[1][0] === '`' && open[2].includes('`'))) continue;
    if (++fences > 64) return { ...result(marked ? 'invalid' : 'none'), ...(marked ? { error: 'Too many code fences.' } : {}) };
    const isMarked = open[2].trim() === 'studiolab-ui';
    if (isMarked && ++marked > 1) return { ...result('invalid'), error: 'Use one interactive document per answer.' };
    fence = { character: open[1][0], length: open[1].length, start: index + 1, marked: isMarked };
  }
  if (fence?.marked) return result('pending');
  if (candidate === null) return result('none');
  let value;
  try { value = JSON.parse(candidate); }
  catch { return { ...result('invalid'), error: 'Interactive document is not valid JSON.' }; }
  const validation = validateDocument(value);
  return validation.ok ? { status: 'ready', documents: [validation.document] }
    : { ...result('invalid'), error: validation.error };
}

export function evaluateExpression(source, values) {
  try {
    const safe = copyJSON(source), fields = new Set();
    const descriptors = Object.getOwnPropertyDescriptors(values ?? {});
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (has(descriptor, 'value') && (finite(descriptor.value) || typeof descriptor.value === 'boolean')) fields.add(key);
    }
    const normalized = expression(safe, fields);
    const read = node => {
      if (typeof node === 'number') return node;
      if (has(node, 'field')) {
        const value = descriptors[node.field].value;
        return typeof value === 'boolean' ? Number(value) : value;
      }
      const args = node.args.map(read);
      if (args.some(value => value === null)) return null;
      let value;
      if (node.op === 'add') value = args.reduce((sum, item) => sum + item, 0);
      else if (node.op === 'subtract') value = args[0] - args[1];
      else if (node.op === 'multiply') value = args.reduce((product, item) => product * item, 1);
      else if (node.op === 'divide') value = args[1] === 0 ? null : args[0] / args[1];
      else if (node.op === 'min') value = Math.min(...args);
      else if (node.op === 'max') value = Math.max(...args);
      else {
        const digits = args[1] ?? 0;
        if (!Number.isInteger(digits) || digits < 0 || digits > 6) return null;
        const scale = 10 ** digits;
        value = Math.round(args[0] * scale) / scale;
      }
      return finite(value) ? value : null;
    };
    return read(normalized);
  } catch { return null; }
}

export const INSTRUCTIONS = `Use Studio.lab interactive answers only when a table, chart or local calculator helps answer the user's question. Otherwise write ordinary Markdown.
Write one JSON document inside a code fence labelled studiolab-ui. Finish the JSON and closing fence before continuing. Use this shape: {"version":1,"title":"Optional title","blocks":[...]}. Labels and text are plain text. Do not put Markdown, HTML, URLs, scripts, event handlers, actions, CSS or executable code in a document.
Supported blocks:
- Text: {"type":"text","text":"Explanation"}.
- Table: {"type":"table","id":"unique-id","title":"Optional title","columns":[{"key":"name","label":"Name","format":"text"},{"key":"amount","label":"Amount","format":"number"}],"rows":[{"name":"Example","amount":2}]}. Formats: text, number, percent. Percent values are fractions (0.25 means 25%). Every row must have exactly the declared column keys. Cells are strings, finite numbers, booleans or null; numeric/percent columns accept only numbers or null.
- Chart: {"type":"chart","id":"unique-id","title":"Optional title","kind":"bar","xLabel":"Optional horizontal label","yLabel":"Optional vertical label","data":[{"label":"Category","value":2}]}. Kind is bar or line. Include accurate finite values from the user's data; never invent evidence or measurements.
- Form: {"type":"form","id":"unique-id","title":"Optional title","fields":[{"key":"price","label":"Price","type":"number","value":10,"min":0,"step":1}],"outputs":[{"label":"Total","expression":{"op":"multiply","args":[{"field":"price"},2]}}]}. Field types: number, text, select, checkbox. Numbers may have finite min/max and positive step; defaults must fit their range. Prefer omitting step unless the default fits its increments (step base is min, or 0 if min is absent). The decoder ignores a conflicting optional step without changing the default number or its range. Select requires options [{"value":"option-value","label":"Option label"}]; its value must match one option. Text values are strings; checkbox values are booleans. Outputs are local calculations and do not send a message or request.
Expressions are finite numbers, {"field":"numeric-or-checkbox-key"}, or {"op":"add|subtract|multiply|divide|min|max|round","args":[expressions]}. Use one operation name, not the pipe-separated list. Subtract and divide take two arguments; round takes one value and optionally integer decimal digits 0 through 6; other operations take 2 through 12 arguments. Checkbox references use 1 for checked and 0 for unchecked. Do not reference text/select fields. No executable expressions or expression strings.
Limits: 16 blocks per document; unique block IDs and field/column keys (start with a letter, then letters, digits, _ or -, at most 48 characters); 8 table columns, 120 table rows, 120 chart points, 12 fields and 8 outputs per form; 64 expression nodes and 8 nested expression levels; titles at most 200 characters, labels at most 120, table cells at most 1024, text fields at most 2000 and text blocks at most 12000. All numbers must have absolute value at most 1e15. Do not add undeclared properties. Keep ordinary Markdown explanation outside the fence.`;
