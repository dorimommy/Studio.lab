var StudioLabAnswers = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // packages/answers/src/index.js
  var index_exports = {};
  __export(index_exports, {
    INSTRUCTIONS: () => INSTRUCTIONS,
    LIMITS: () => LIMITS,
    evaluateExpression: () => evaluateExpression,
    parseSource: () => parseSource,
    renderDocument: () => renderDocument,
    validateDocument: () => validateDocument
  });

  // packages/answers/src/schema.js
  var LIMITS = Object.freeze({
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
  var FORBIDDEN_KEYS = /* @__PURE__ */ new Set(["__proto__", "prototype", "constructor"]);
  var IDENTIFIER = /^[A-Za-z][A-Za-z0-9_-]{0,47}$/;
  var has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  var fail = (message) => {
    throw new Error(message);
  };
  var finite = (value) => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= LIMITS.number;
  var onStep = (value, step, base) => {
    const steps = (value - base) / step;
    return Number.isFinite(steps) && Math.abs(steps - Math.round(steps)) <= 1e-7;
  };
  function copyJSON(value, budget = { nodes: 0, text: 0, active: /* @__PURE__ */ new Set() }, depth = 0) {
    if (++budget.nodes > 2e4 || depth > 32) fail("Document is too complex.");
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (!finite(value)) fail("Numbers must be finite and within the supported range.");
      return value;
    }
    if (typeof value === "string") {
      budget.text += value.length;
      if (value.length > 12e3 || budget.text > 96e3 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
        fail("Text exceeds the supported size or contains control characters.");
      }
      return value;
    }
    if (typeof value !== "object") fail("Only JSON values are supported.");
    const array = Array.isArray(value);
    const proto = Object.getPrototypeOf(value);
    if (!array && proto !== Object.prototype && proto !== null || array && proto !== Array.prototype) {
      fail("Only plain JSON objects and arrays are supported.");
    }
    if (budget.active.has(value)) fail("Circular values are not supported.");
    budget.active.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length > 2001 || array && value.length > 2e3) fail("A collection is too large.");
    const result = array ? [] : /* @__PURE__ */ Object.create(null);
    for (const key of keys) {
      if (array && key === "length") continue;
      if (typeof key !== "string" || FORBIDDEN_KEYS.has(key)) fail("Unsupported property name.");
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !has(descriptor, "value")) fail("Only plain JSON properties are supported.");
      if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) fail("Invalid array property.");
      result[key] = copyJSON(descriptor.value, budget, depth + 1);
    }
    if (array && result.length !== value.length) fail("Sparse arrays are not supported.");
    if (array) {
      for (let index = 0; index < value.length; index++) if (!has(result, index)) fail("Sparse arrays are not supported.");
    }
    budget.active.delete(value);
    return result;
  }
  function object(value, allowed, required = []) {
    if (!value || typeof value !== "object" || Array.isArray(value)) fail("Expected an object.");
    for (const key of Object.keys(value)) if (!allowed.includes(key)) fail("Unknown property.");
    for (const key of required) if (!has(value, key)) fail("A required property is missing.");
    return value;
  }
  function list(value, min, max) {
    if (!Array.isArray(value) || value.length < min || value.length > max) fail("A collection has an unsupported size.");
    return value;
  }
  function text(value, max, empty = false) {
    if (typeof value !== "string" || value.length > max || !empty && !value.trim()) fail("Invalid text value.");
    return value;
  }
  function identifier(value) {
    if (typeof value !== "string" || !IDENTIFIER.test(value) || FORBIDDEN_KEYS.has(value)) fail("Invalid identifier.");
    return value;
  }
  function oneOf(value, options) {
    if (!options.includes(value)) fail("Unsupported value.");
    return value;
  }
  function title(source, target) {
    if (has(source, "title")) target.title = text(source.title, 200);
    return target;
  }
  function expression(source, fields, budget = { nodes: 0 }, depth = 0) {
    if (++budget.nodes > LIMITS.expressionNodes || depth > LIMITS.expressionDepth) fail("Calculation is too complex.");
    if (finite(source)) return source;
    object(source, ["field", "op", "args"]);
    if (has(source, "field")) {
      object(source, ["field"], ["field"]);
      const key = identifier(source.field);
      if (!fields.has(key)) fail("Calculations can reference only numeric or checkbox fields.");
      return { field: key };
    }
    object(source, ["op", "args"], ["op", "args"]);
    const op = oneOf(source.op, ["add", "subtract", "multiply", "divide", "min", "max", "round"]);
    const args = list(source.args, op === "round" ? 1 : 2, op === "round" || op === "subtract" || op === "divide" ? 2 : 12);
    return { op, args: args.map((argument) => expression(argument, fields, budget, depth + 1)) };
  }
  function table(source) {
    object(source, ["type", "id", "title", "columns", "rows"], ["type", "id", "columns", "rows"]);
    const keys = /* @__PURE__ */ new Set();
    const columns = list(source.columns, 1, LIMITS.columns).map((column) => {
      object(column, ["key", "label", "format"], ["key", "label"]);
      const key = identifier(column.key);
      if (keys.has(key)) fail("Column keys must be unique.");
      keys.add(key);
      return { key, label: text(column.label, 120), format: has(column, "format") ? oneOf(column.format, ["text", "number", "percent"]) : "text" };
    });
    const rows = list(source.rows, 0, LIMITS.rows).map((row) => {
      object(row, [...keys], [...keys]);
      const result = {};
      for (const column of columns) {
        const cell = row[column.key];
        if (column.format !== "text" && cell !== null && !finite(cell)) fail("Numeric columns require numbers or null.");
        if (cell !== null && typeof cell !== "boolean" && !finite(cell) && typeof cell !== "string") fail("Table cells must be scalar values.");
        result[column.key] = typeof cell === "string" ? text(cell, 1024, true) : cell;
      }
      return result;
    });
    return title(source, { type: "table", id: identifier(source.id), columns, rows });
  }
  function chart(source) {
    object(source, ["type", "id", "title", "kind", "xLabel", "yLabel", "data"], ["type", "id", "kind", "data"]);
    const result = title(source, {
      type: "chart",
      id: identifier(source.id),
      kind: oneOf(source.kind, ["bar", "line"]),
      data: list(source.data, 1, LIMITS.points).map((point) => {
        object(point, ["label", "value"], ["label", "value"]);
        if (!finite(point.value)) fail("Chart values must be finite numbers.");
        return { label: text(point.label, 120), value: point.value };
      })
    });
    for (const key of ["xLabel", "yLabel"]) if (has(source, key)) result[key] = text(source[key], 120);
    return result;
  }
  function form(source) {
    object(source, ["type", "id", "title", "fields", "outputs"], ["type", "id", "fields", "outputs"]);
    const keys = /* @__PURE__ */ new Set(), numericKeys = /* @__PURE__ */ new Set();
    const fields = list(source.fields, 1, LIMITS.fields).map((field) => {
      object(field, ["key", "label", "type", "value", "min", "max", "step", "options"], ["key", "label", "type"]);
      const key = identifier(field.key), type = oneOf(field.type, ["number", "text", "select", "checkbox"]);
      if (keys.has(key)) fail("Field keys must be unique.");
      keys.add(key);
      const result = { key, label: text(field.label, 120), type };
      if (type === "number") {
        numericKeys.add(key);
        if (has(field, "options")) fail("Number fields do not accept options.");
        for (const property of ["min", "max", "step"]) {
          if (has(field, property)) {
            if (!finite(field[property]) || property === "step" && field[property] <= 0) fail("Invalid number field constraint.");
            result[property] = field[property];
          }
        }
        if (has(result, "min") && has(result, "max") && result.min > result.max) fail("Minimum must not exceed maximum.");
        result.value = has(field, "value") ? field.value : Math.min(result.max ?? LIMITS.number, Math.max(result.min ?? -LIMITS.number, 0));
        if (!has(field, "value") && has(result, "step") && !onStep(result.value, result.step, result.min ?? 0)) {
          const base = result.min ?? 0, steps = (result.value - base) / result.step;
          result.value = base + Math.ceil(steps) * result.step;
          if (result.value > (result.max ?? LIMITS.number)) result.value = base + Math.floor(steps) * result.step;
        }
        if (!finite(result.value) || has(result, "min") && result.value < result.min || has(result, "max") && result.value > result.max) fail("Number field default is outside its range.");
        if (has(result, "step") && !onStep(result.value, result.step, result.min ?? 0)) delete result.step;
      } else {
        if (["min", "max", "step"].some((property) => has(field, property))) fail("Only number fields accept numeric constraints.");
        if (type === "select") {
          const options = /* @__PURE__ */ new Set();
          result.options = list(field.options, 1, 24).map((option) => {
            object(option, ["value", "label"], ["value", "label"]);
            const value = text(option.value, 120);
            if (options.has(value)) fail("Select option values must be unique.");
            options.add(value);
            return { value, label: text(option.label, 120) };
          });
          result.value = has(field, "value") ? field.value : result.options[0].value;
          if (!options.has(result.value)) fail("Select default must match an option.");
        } else {
          if (has(field, "options")) fail("Only select fields accept options.");
          if (type === "checkbox") {
            numericKeys.add(key);
            result.value = has(field, "value") ? field.value : false;
            if (typeof result.value !== "boolean") fail("Checkbox default must be a boolean.");
          } else result.value = has(field, "value") ? text(field.value, 2e3, true) : "";
        }
      }
      return result;
    });
    const outputs = list(source.outputs, 0, LIMITS.outputs).map((output) => {
      object(output, ["label", "expression"], ["label", "expression"]);
      return { label: text(output.label, 120), expression: expression(output.expression, numericKeys) };
    });
    return title(source, { type: "form", id: identifier(source.id), fields, outputs });
  }
  function validateDocument(value) {
    try {
      const source = copyJSON(value);
      object(source, ["version", "title", "blocks"], ["version", "blocks"]);
      if (source.version !== 1) fail("Unsupported document version.");
      const ids = /* @__PURE__ */ new Set();
      const blocks = list(source.blocks, 1, LIMITS.blocks).map((block) => {
        object(block, ["type", "id", "title", "text", "columns", "rows", "kind", "xLabel", "yLabel", "data", "fields", "outputs"], ["type"]);
        let result;
        if (block.type === "text") {
          object(block, ["type", "text"], ["type", "text"]);
          result = { type: "text", text: text(block.text, 12e3) };
        } else if (block.type === "table") result = table(block);
        else if (block.type === "chart") result = chart(block);
        else if (block.type === "form") result = form(block);
        else fail("Unsupported block type.");
        if (result.id) {
          if (ids.has(result.id)) fail("Block identifiers must be unique.");
          ids.add(result.id);
        }
        return result;
      });
      return { ok: true, document: title(source, { version: 1, blocks }) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Invalid interactive document." };
    }
  }
  function parseSource(source) {
    const result = (status) => ({ status, documents: [] });
    if (typeof source !== "string") return { ...result("invalid"), error: "Expected answer text." };
    if (source.length > LIMITS.source) return source.includes("studiolab-ui") ? { ...result("invalid"), error: "Interactive answer exceeds the supported size." } : result("none");
    let fence = null, candidate = null, marked = 0, fences = 0;
    const lines = source.split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (fence) {
        const close = /^ {0,3}(`{3,}|~{3,})[\t ]*$/.exec(line);
        if (close && close[1][0] === fence.character && close[1].length >= fence.length) {
          if (fence.marked) candidate = lines.slice(fence.start, index).join("\n");
          fence = null;
        }
        continue;
      }
      const open = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)$/.exec(line);
      if (!open || open[1][0] === "`" && open[2].includes("`")) continue;
      if (++fences > 64) return { ...result(marked ? "invalid" : "none"), ...marked ? { error: "Too many code fences." } : {} };
      const isMarked = open[2].trim() === "studiolab-ui";
      if (isMarked && ++marked > 1) return { ...result("invalid"), error: "Use one interactive document per answer." };
      fence = { character: open[1][0], length: open[1].length, start: index + 1, marked: isMarked };
    }
    if (fence?.marked) return result("pending");
    if (candidate === null) return result("none");
    let value;
    try {
      value = JSON.parse(candidate);
    } catch {
      return { ...result("invalid"), error: "Interactive document is not valid JSON." };
    }
    const validation = validateDocument(value);
    return validation.ok ? { status: "ready", documents: [validation.document] } : { ...result("invalid"), error: validation.error };
  }
  function evaluateExpression(source, values) {
    try {
      const safe = copyJSON(source), fields = /* @__PURE__ */ new Set();
      const descriptors = Object.getOwnPropertyDescriptors(values ?? {});
      for (const [key, descriptor] of Object.entries(descriptors)) {
        if (has(descriptor, "value") && (finite(descriptor.value) || typeof descriptor.value === "boolean")) fields.add(key);
      }
      const normalized = expression(safe, fields);
      const read = (node) => {
        if (typeof node === "number") return node;
        if (has(node, "field")) {
          const value2 = descriptors[node.field].value;
          return typeof value2 === "boolean" ? Number(value2) : value2;
        }
        const args = node.args.map(read);
        if (args.some((value2) => value2 === null)) return null;
        let value;
        if (node.op === "add") value = args.reduce((sum, item) => sum + item, 0);
        else if (node.op === "subtract") value = args[0] - args[1];
        else if (node.op === "multiply") value = args.reduce((product, item) => product * item, 1);
        else if (node.op === "divide") value = args[1] === 0 ? null : args[0] / args[1];
        else if (node.op === "min") value = Math.min(...args);
        else if (node.op === "max") value = Math.max(...args);
        else {
          const digits = args[1] ?? 0;
          if (!Number.isInteger(digits) || digits < 0 || digits > 6) return null;
          const scale = 10 ** digits;
          value = Math.round(args[0] * scale) / scale;
        }
        return finite(value) ? value : null;
      };
      return read(normalized);
    } catch {
      return null;
    }
  }
  var INSTRUCTIONS = `Use Studio.lab interactive answers only when a table, chart or local calculator helps answer the user's question. Otherwise write ordinary Markdown.
Write one JSON document inside a code fence labelled studiolab-ui. Finish the JSON and closing fence before continuing. Use this shape: {"version":1,"title":"Optional title","blocks":[...]}. Labels and text are plain text. Do not put Markdown, HTML, URLs, scripts, event handlers, actions, CSS or executable code in a document.
Supported blocks:
- Text: {"type":"text","text":"Explanation"}.
- Table: {"type":"table","id":"unique-id","title":"Optional title","columns":[{"key":"name","label":"Name","format":"text"},{"key":"amount","label":"Amount","format":"number"}],"rows":[{"name":"Example","amount":2}]}. Formats: text, number, percent. Percent values are fractions (0.25 means 25%). Every row must have exactly the declared column keys. Cells are strings, finite numbers, booleans or null; numeric/percent columns accept only numbers or null.
- Chart: {"type":"chart","id":"unique-id","title":"Optional title","kind":"bar","xLabel":"Optional horizontal label","yLabel":"Optional vertical label","data":[{"label":"Category","value":2}]}. Kind is bar or line. Include accurate finite values from the user's data; never invent evidence or measurements.
- Form: {"type":"form","id":"unique-id","title":"Optional title","fields":[{"key":"price","label":"Price","type":"number","value":10,"min":0,"step":1}],"outputs":[{"label":"Total","expression":{"op":"multiply","args":[{"field":"price"},2]}}]}. Field types: number, text, select, checkbox. Numbers may have finite min/max and positive step; defaults must fit their range. Prefer omitting step unless the default fits its increments (step base is min, or 0 if min is absent). The decoder ignores a conflicting optional step without changing the default number or its range. Select requires options [{"value":"option-value","label":"Option label"}]; its value must match one option. Text values are strings; checkbox values are booleans. Outputs are local calculations and do not send a message or request.
Expressions are finite numbers, {"field":"numeric-or-checkbox-key"}, or {"op":"add|subtract|multiply|divide|min|max|round","args":[expressions]}. Use one operation name, not the pipe-separated list. Subtract and divide take two arguments; round takes one value and optionally integer decimal digits 0 through 6; other operations take 2 through 12 arguments. Checkbox references use 1 for checked and 0 for unchecked. Do not reference text/select fields. No executable expressions or expression strings.
Limits: 16 blocks per document; unique block IDs and field/column keys (start with a letter, then letters, digits, _ or -, at most 48 characters); 8 table columns, 120 table rows, 120 chart points, 12 fields and 8 outputs per form; 64 expression nodes and 8 nested expression levels; titles at most 200 characters, labels at most 120, table cells at most 1024, text fields at most 2000 and text blocks at most 12000. All numbers must have absolute value at most 1e15. Do not add undeclared properties. Keep ordinary Markdown explanation outside the fence.`;

  // packages/core/src/index.js
  function scope() {
    const cleanups = /* @__PURE__ */ new Set();
    let disposed = false;
    function add(cleanup) {
      let active = true;
      const cancel = () => {
        if (!active) return;
        active = false;
        cleanups.delete(cancel);
        try {
          cleanup();
        } catch (_) {
        }
      };
      if (disposed) cancel();
      else cleanups.add(cancel);
      return cancel;
    }
    function listen(target, type, handler, options) {
      if (disposed) return () => {
      };
      target.addEventListener(type, handler, options);
      return add(() => target.removeEventListener(type, handler, options));
    }
    function observeInstance(observer, target, options) {
      if (disposed) {
        observer.disconnect();
        return observer;
      }
      observer.observe(target, options);
      add(() => observer.disconnect());
      return observer;
    }
    function timeout(fn, delay) {
      if (disposed) return () => {
      };
      const id = setTimeout(() => {
        cancel();
        if (!disposed) fn();
      }, delay);
      const cancel = add(() => clearTimeout(id));
      return cancel;
    }
    function interval(fn, delay) {
      if (disposed) return () => {
      };
      const id = setInterval(() => {
        if (!disposed) fn();
      }, delay);
      return add(() => clearInterval(id));
    }
    function frame(fn) {
      if (disposed) return () => {
      };
      const id = requestAnimationFrame((time) => {
        cancel();
        if (!disposed) fn(time);
      });
      const cancel = add(() => cancelAnimationFrame(id));
      return cancel;
    }
    return {
      get disposed() {
        return disposed;
      },
      add,
      listen,
      on: listen,
      observe: observeInstance,
      timeout,
      interval,
      every: (ms, fn) => interval(fn, ms),
      frame,
      dispose() {
        if (disposed) return;
        disposed = true;
        for (const cleanup of [...cleanups].reverse()) {
          try {
            cleanup();
          } catch (_) {
          }
        }
      }
    };
  }

  // packages/answers/src/renderer.js
  var SVG_NS = "http://www.w3.org/2000/svg";
  var nextAnswerId = 0;
  function numericText(value, format = "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) return value == null ? "" : String(value);
    if (format !== "percent" && value !== 0 && Math.abs(value) < 1e-6) return String(value);
    return new Intl.NumberFormat(void 0, {
      style: format === "percent" ? "percent" : "decimal",
      maximumFractionDigits: 20
    }).format(value);
  }
  function cellText(value, format) {
    if (value == null) return "";
    if (format === "number" || format === "percent") return numericText(value, format);
    return typeof value === "boolean" ? value ? "Yes" : "No" : String(value);
  }
  function renderDocument(answer, options = {}) {
    const doc = options.document || globalThis.document;
    const lifecycle = scope();
    const prefix = `sl-answer-${++nextAnswerId}`;
    const formStates = /* @__PURE__ */ Object.create(null);
    const tableStates = /* @__PURE__ */ Object.create(null);
    const disclosureStates = /* @__PURE__ */ Object.create(null);
    const root = make("section", "sl-interactive-answer");
    let nextLocalId = 0;
    function make(tag, className, text2) {
      const node = doc.createElement(tag);
      if (className) node.className = className;
      if (text2 !== void 0) node.textContent = String(text2);
      return node;
    }
    function svg(tag, attributes = {}, text2) {
      const node = doc.createElementNS(SVG_NS, tag);
      for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
      if (text2 !== void 0) node.textContent = String(text2);
      return node;
    }
    function id() {
      return `${prefix}-${++nextLocalId}`;
    }
    function blockShell(block, fallback) {
      const section = make("section", `sl-answer-block sl-answer-${block.type}`);
      const heading = make("h3", "sl-answer-heading", block.title || fallback);
      heading.id = id();
      section.setAttribute("aria-labelledby", heading.id);
      section.append(heading);
      return { section, heading };
    }
    function table2(columns, rows, name, { sortable = true, showCaption = false, exactNumbers = false, stateKey } = {}) {
      const region = make("div", "sl-answer-table-scroll");
      region.setAttribute("role", "region");
      region.setAttribute("aria-label", `${name}. Scroll horizontally for more columns.`);
      region.tabIndex = 0;
      const element = make("table", "sl-answer-table");
      const caption = make("caption", showCaption ? "sl-answer-caption" : "sl-answer-sr-only", name);
      const head = make("thead");
      const headerRow = make("tr");
      const body = make("tbody");
      const restored = stateKey && options.state?.[stateKey]?.sort;
      let sortedColumn = columns.some((column) => column.key === restored?.key) ? restored.key : null;
      let direction = restored?.direction === -1 ? -1 : 1;
      const headers = [];
      const collator = new Intl.Collator(void 0, { numeric: true, sensitivity: "base" });
      function drawRows(data) {
        body.replaceChildren();
        for (const row of data) {
          const tr = make("tr");
          for (const column of columns) {
            const value = exactNumbers && typeof row[column.key] === "number" ? String(row[column.key]) : cellText(row[column.key], column.format);
            const td = make("td", column.format === "text" ? "" : "sl-answer-numeric", value);
            tr.append(td);
          }
          body.append(tr);
        }
      }
      function applySort() {
        const column = columns.find((candidate) => candidate.key === sortedColumn);
        if (!column) return drawRows(rows);
        const ordered = rows.map((row, index) => ({ row, index }));
        ordered.sort((a, b) => {
          const left = a.row[column.key];
          const right = b.row[column.key];
          if (left == null || right == null) {
            if (left == null && right == null) return a.index - b.index;
            return left == null ? 1 : -1;
          }
          const result = typeof left === "number" && typeof right === "number" ? left - right : collator.compare(String(left), String(right));
          return result * direction || a.index - b.index;
        });
        for (const header of headers) {
          if (header.column.key === sortedColumn) {
            header.th.setAttribute("aria-sort", direction === 1 ? "ascending" : "descending");
            header.arrow.textContent = direction === 1 ? "\u2191" : "\u2193";
            header.button.setAttribute("aria-label", `Sort by ${header.column.label}, ${direction === 1 ? "descending" : "ascending"}`);
          } else {
            header.th.removeAttribute("aria-sort");
            header.arrow.textContent = "\u2195";
            header.button.setAttribute("aria-label", `Sort by ${header.column.label}, ascending`);
          }
        }
        if (stateKey) tableStates[stateKey] = { key: sortedColumn, direction };
        drawRows(ordered.map((item) => item.row));
      }
      for (const column of columns) {
        const th = make("th");
        th.scope = "col";
        if (column.format !== "text") th.className = "sl-answer-numeric";
        if (sortable && rows.length > 1) {
          const button = make("button", "sl-answer-sort");
          button.type = "button";
          const label = make("span", "", column.label);
          const arrow = make("span", "sl-answer-sort-direction", "\u2195");
          arrow.setAttribute("aria-hidden", "true");
          button.append(label, arrow);
          button.setAttribute("aria-label", `Sort by ${column.label}, ascending`);
          th.append(button);
          headers.push({ th, button, arrow, column });
          lifecycle.on(button, "click", () => {
            direction = sortedColumn === column.key ? -direction : 1;
            sortedColumn = column.key;
            applySort();
            if (stateKey) options.onChange?.({ blockId: stateKey, sort: { ...tableStates[stateKey] } });
          });
        } else {
          th.textContent = column.label;
        }
        headerRow.append(th);
      }
      head.append(headerRow);
      applySort();
      element.append(caption, head, body);
      region.append(element);
      return region;
    }
    function renderTable(block) {
      const { section } = blockShell(block, "Table");
      if (!block.rows.length) {
        section.append(make("p", "sl-answer-note", "This answer contains table columns without rows. View the source for its data."));
      } else {
        section.append(table2(block.columns, block.rows, block.title || "Answer table", { stateKey: block.id }));
      }
      return section;
    }
    function renderChart(block) {
      const { section, heading } = blockShell(block, block.kind === "line" ? "Line chart" : "Bar chart");
      if (!block.data.length) {
        section.append(make("p", "sl-answer-note", "This answer contains a chart without data points. View the source for its data."));
        return section;
      }
      const figure = make("figure", "sl-answer-chart-figure");
      const graphic = svg("svg", { viewBox: "0 0 640 288", class: "sl-answer-chart", role: "img", "aria-labelledby": heading.id });
      const descriptionId = id();
      graphic.setAttribute("aria-describedby", descriptionId);
      const values = block.data.map((point) => point.value);
      let minimum = Math.min(0, ...values);
      let maximum = Math.max(0, ...values);
      if (minimum === maximum) maximum = minimum + 1;
      const extent = maximum - minimum;
      const compactNumber = new Intl.NumberFormat(void 0, { notation: "compact", maximumFractionDigits: 1 });
      let lastWidth = 0;
      function drawChart(availableWidth) {
        const viewWidth = Math.max(160, Math.min(4096, Math.round(availableWidth)));
        if (viewWidth === lastWidth) return;
        lastWidth = viewWidth;
        const left = viewWidth < 400 ? 56 : 84;
        const right = viewWidth - 20;
        const top = 16;
        const bottom = viewWidth < 400 ? 208 : 232;
        graphic.setAttribute("viewBox", `0 0 ${viewWidth} ${bottom + 56}`);
        graphic.replaceChildren(svg("desc", { id: descriptionId }, `${block.kind === "line" ? "Line" : "Bar"} chart with ${block.data.length} data points. Open View data below for exact values.`));
        const y = (value) => bottom - (value - minimum) / extent * (bottom - top);
        const zero = y(0);
        const labelCount = Math.min(block.data.length, 6, Math.max(2, Math.floor((right - left) / 110)));
        const labelEvery = Math.max(1, Math.ceil(block.data.length / labelCount));
        const labelLength = Math.max(4, Math.min(14, Math.floor((right - left) / labelCount / 7)));
        const shortNumber = (value) => value !== 0 && Math.abs(value) < 1e-3 ? value.toExponential(0) : compactNumber.format(value);
        for (let tick = 0; tick <= 4; tick++) {
          const value = minimum + extent * tick / 4;
          const position = y(value);
          graphic.append(svg("line", { x1: left, x2: right, y1: position, y2: position, class: "sl-answer-chart-grid" }));
          graphic.append(svg("text", { x: left - 10, y: position + 4, "text-anchor": "end", class: "sl-answer-chart-label" }, shortNumber(value)));
        }
        graphic.append(svg("line", { x1: left, x2: right, y1: zero, y2: zero, class: "sl-answer-chart-baseline" }));
        const width = right - left;
        const band = width / block.data.length;
        const x = (index) => block.kind === "bar" ? left + band * (index + 0.5) : block.data.length === 1 ? left + width / 2 : left + width * index / (block.data.length - 1);
        if (block.kind === "line") {
          const points = block.data.map((point, index) => `${x(index)},${y(point.value)}`).join(" ");
          graphic.append(svg("polyline", { points, class: "sl-answer-chart-line" }));
        }
        block.data.forEach((point, index) => {
          const mark = block.kind === "bar" ? svg("rect", {
            x: x(index) - band * 0.32,
            y: Math.min(zero, y(point.value)),
            width: band * 0.64,
            height: Math.abs(y(point.value) - zero),
            rx: 2,
            class: "sl-answer-chart-bar"
          }) : svg("circle", { cx: x(index), cy: y(point.value), r: 3.5, class: "sl-answer-chart-point" });
          mark.append(svg("title", {}, `${point.label}: ${numericText(point.value)}`));
          graphic.append(mark);
          if (index % labelEvery === 0 || index === block.data.length - 1) {
            const label = point.label.length > labelLength ? `${point.label.slice(0, labelLength - 1)}\u2026` : point.label;
            const anchor = x(index) > right - 60 ? "end" : x(index) < left + 30 ? "start" : "middle";
            const labelElement = svg("text", { x: x(index), y: bottom + 24, "text-anchor": anchor, class: "sl-answer-chart-label" }, label);
            labelElement.append(svg("title", {}, point.label));
            graphic.append(labelElement);
          }
        });
      }
      drawChart(640);
      const Resize = doc.defaultView?.ResizeObserver || globalThis.ResizeObserver;
      if (typeof Resize === "function") {
        const observer = new Resize((entries) => {
          if (lifecycle.disposed) return;
          const width = entries[0]?.contentRect.width;
          if (Number.isFinite(width) && width > 0) drawChart(width);
        });
        lifecycle.observe(observer, figure, {});
      }
      if (block.xLabel || block.yLabel) {
        const labels = [block.xLabel && `Horizontal: ${block.xLabel}`, block.yLabel && `Vertical: ${block.yLabel}`].filter(Boolean);
        figure.append(make("figcaption", "sl-answer-chart-axes", labels.join(". ")));
      }
      figure.prepend(graphic);
      const details = make("details", "sl-answer-data");
      details.open = options.state?.[block.id]?.open === true;
      disclosureStates[block.id] = details.open;
      lifecycle.on(details, "toggle", () => {
        disclosureStates[block.id] = details.open;
        options.onChange?.({ blockId: block.id, open: details.open });
      });
      details.append(make("summary", "sl-answer-disclosure", "View data"));
      details.append(table2([
        { key: "label", label: block.xLabel || "Label", format: "text" },
        { key: "value", label: block.yLabel || "Value", format: "number" }
      ], block.data, `${block.title || "Chart"} exact data`, { exactNumbers: true, stateKey: block.id }));
      section.append(figure, details);
      return section;
    }
    function renderForm(block) {
      const { section } = blockShell(block, "Calculator");
      const form2 = make("form", "sl-answer-form");
      form2.noValidate = true;
      const values = /* @__PURE__ */ Object.create(null);
      const inputs = [];
      const outputs = [];
      const fields = make("div", "sl-answer-fields");
      const restored = options.state?.[block.id]?.values;
      const notice = make("p", "sl-answer-note", "Values stay in this answer.");
      notice.id = id();
      form2.setAttribute("aria-describedby", notice.id);
      function initialValue(field) {
        const value = restored?.[field.key];
        if (field.type === "checkbox") return typeof value === "boolean" ? value : field.value;
        if (field.type === "number") {
          if (value === null) return null;
          if (typeof value !== "number" || !Number.isFinite(value)) return field.value;
          return Math.min(field.max ?? Infinity, Math.max(field.min ?? -Infinity, value));
        }
        if (field.type === "select") return field.options.some((option) => option.value === value) ? value : field.value;
        return typeof value === "string" ? value.slice(0, 2e3) : field.value;
      }
      function updateOutputs() {
        for (const output of outputs) {
          const value = evaluateExpression(output.expression, values);
          output.node.textContent = value === null ? "Enter valid values to calculate." : numericText(value);
          output.node.classList.toggle("sl-answer-output-empty", value === null);
        }
        formStates[block.id] = { ...values };
      }
      for (const field of block.fields) {
        const fieldId = id();
        const wrapper = make("div", field.type === "checkbox" ? "sl-answer-field sl-answer-checkbox-field" : "sl-answer-field");
        const label = make("label", "sl-answer-label", field.label);
        label.htmlFor = fieldId;
        let input;
        if (field.type === "select") {
          input = make("select", "sl-answer-input");
          for (const choice of field.options) {
            const option = make("option", "", choice.label);
            option.value = choice.value;
            input.append(option);
          }
        } else {
          input = make("input", field.type === "checkbox" ? "sl-answer-checkbox" : "sl-answer-input");
          input.type = field.type;
          if (field.type === "number") {
            input.step = field.step === void 0 ? "any" : String(field.step);
            input.min = String(field.min ?? -LIMITS.number);
            input.max = String(field.max ?? LIMITS.number);
            input.inputMode = "decimal";
          } else if (field.type === "text") {
            input.maxLength = 2e3;
          }
        }
        input.id = fieldId;
        input.name = field.key;
        input.autocomplete = "off";
        values[field.key] = initialValue(field);
        if (field.type === "checkbox") input.checked = values[field.key];
        else input.value = values[field.key] === null ? "" : String(values[field.key]);
        if (field.type === "number" && values[field.key] !== null && !input.validity.valid) {
          values[field.key] = field.value;
          input.value = String(field.value);
        }
        const error = make("span", "sl-answer-field-error");
        error.id = id();
        error.hidden = true;
        input.setAttribute("aria-describedby", error.id);
        if (field.type === "number") {
          const constraints = [];
          if (field.min !== void 0) constraints.push(`Minimum ${numericText(field.min)}`);
          if (field.max !== void 0) constraints.push(`Maximum ${numericText(field.max)}`);
          if (field.step !== void 0) constraints.push(`Step ${numericText(field.step)}`);
          if (constraints.length) {
            const hint = make("span", "sl-answer-field-hint", constraints.join(". "));
            hint.id = id();
            wrapper.append(hint);
            input.setAttribute("aria-describedby", `${hint.id} ${error.id}`);
          }
        }
        const setValue = () => {
          if (field.type === "number") {
            const value = input.value.trim() === "" ? null : Number(input.value);
            const valid = value !== null && Number.isFinite(value) && input.validity.valid;
            values[field.key] = valid ? value : null;
            input.setAttribute("aria-invalid", valid ? "false" : "true");
            error.hidden = valid;
            error.textContent = valid ? "" : input.validationMessage || "Enter a number within this field\u2019s limits.";
          } else {
            values[field.key] = field.type === "checkbox" ? input.checked : input.value;
          }
          updateOutputs();
          options.onChange?.({ blockId: block.id, values: { ...values } });
        };
        lifecycle.on(input, field.type === "checkbox" || field.type === "select" ? "change" : "input", setValue);
        if (field.type === "checkbox") {
          label.textContent = "";
          label.append(input, make("span", "", field.label));
          wrapper.prepend(label);
        } else {
          wrapper.prepend(label, input);
        }
        wrapper.append(error);
        fields.append(wrapper);
        inputs.push({ field, input, error });
      }
      form2.append(fields);
      if (block.outputs.length) {
        const resultGroup = make("dl", "sl-answer-outputs");
        resultGroup.setAttribute("aria-live", "polite");
        resultGroup.setAttribute("aria-atomic", "false");
        for (const result of block.outputs) {
          const row = make("div", "sl-answer-output");
          const name = make("dt", "sl-answer-output-label", result.label);
          const value = make("dd", "sl-answer-output-value");
          row.append(name, value);
          resultGroup.append(row);
          outputs.push({ node: value, expression: result.expression });
        }
        form2.append(resultGroup);
      }
      const footer = make("div", "sl-answer-form-footer");
      const reset = make("button", "sl-answer-button", "Reset values");
      reset.type = "button";
      lifecycle.on(reset, "click", () => {
        for (const { field, input, error } of inputs) {
          values[field.key] = field.value;
          if (field.type === "checkbox") input.checked = field.value;
          else input.value = String(field.value);
          input.removeAttribute("aria-invalid");
          error.hidden = true;
          error.textContent = "";
        }
        updateOutputs();
        options.onChange?.({ blockId: block.id, values: { ...values } });
      });
      lifecycle.on(form2, "submit", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      lifecycle.on(form2, "keydown", (event) => event.stopPropagation());
      footer.append(notice, reset);
      form2.append(footer);
      section.append(form2);
      updateOutputs();
      return section;
    }
    if (answer.title) {
      const heading = make("h2", "sl-answer-title", answer.title);
      heading.id = id();
      root.setAttribute("aria-labelledby", heading.id);
      root.append(heading);
    } else {
      root.setAttribute("aria-label", "Interactive answer");
    }
    for (const block of answer.blocks) {
      if (block.type === "text") root.append(make("p", "sl-answer-text", block.text));
      else if (block.type === "table") root.append(renderTable(block));
      else if (block.type === "chart") root.append(renderChart(block));
      else if (block.type === "form") root.append(renderForm(block));
    }
    return {
      element: root,
      getState() {
        const state = {};
        for (const [key, values] of Object.entries(formStates)) state[key] = { values: { ...values } };
        for (const [key, sort] of Object.entries(tableStates)) state[key] = { ...state[key], sort: { ...sort } };
        for (const [key, open] of Object.entries(disclosureStates)) state[key] = { ...state[key], open };
        return state;
      },
      dispose() {
        lifecycle.dispose();
        root.remove();
      }
    };
  }
  return __toCommonJS(index_exports);
})();
