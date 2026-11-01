import { scope } from '../../core/src/index.js';
import { evaluateExpression, LIMITS } from './schema.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
let nextAnswerId = 0;

function numericText(value, format = 'number') {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value == null ? '' : String(value);
  if (format !== 'percent' && value !== 0 && Math.abs(value) < 1e-6) return String(value);
  return new Intl.NumberFormat(undefined, {
    style: format === 'percent' ? 'percent' : 'decimal',
    maximumFractionDigits: 20,
  }).format(value);
}

function cellText(value, format) {
  if (value == null) return '';
  if (format === 'number' || format === 'percent') return numericText(value, format);
  return typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);
}

export function renderDocument(answer, options = {}) {
  const doc = options.document || globalThis.document;
  const lifecycle = scope();
  const prefix = `sl-answer-${++nextAnswerId}`;
  const formStates = Object.create(null);
  const tableStates = Object.create(null);
  const disclosureStates = Object.create(null);
  const root = make('section', 'sl-interactive-answer');
  let nextLocalId = 0;

  function make(tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function svg(tag, attributes = {}, text) {
    const node = doc.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function id() { return `${prefix}-${++nextLocalId}`; }

  function blockShell(block, fallback) {
    const section = make('section', `sl-answer-block sl-answer-${block.type}`);
    const heading = make('h3', 'sl-answer-heading', block.title || fallback);
    heading.id = id();
    section.setAttribute('aria-labelledby', heading.id);
    section.append(heading);
    return { section, heading };
  }

  function table(columns, rows, name, { sortable = true, showCaption = false, exactNumbers = false, stateKey } = {}) {
    const region = make('div', 'sl-answer-table-scroll');
    region.setAttribute('role', 'region');
    region.setAttribute('aria-label', `${name}. Scroll horizontally for more columns.`);
    region.tabIndex = 0;
    const element = make('table', 'sl-answer-table');
    const caption = make('caption', showCaption ? 'sl-answer-caption' : 'sl-answer-sr-only', name);
    const head = make('thead');
    const headerRow = make('tr');
    const body = make('tbody');
    const restored = stateKey && options.state?.[stateKey]?.sort;
    let sortedColumn = columns.some(column => column.key === restored?.key) ? restored.key : null;
    let direction = restored?.direction === -1 ? -1 : 1;
    const headers = [];
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

    function drawRows(data) {
      body.replaceChildren();
      for (const row of data) {
        const tr = make('tr');
        for (const column of columns) {
          const value = exactNumbers && typeof row[column.key] === 'number' ? String(row[column.key]) : cellText(row[column.key], column.format);
          const td = make('td', column.format === 'text' ? '' : 'sl-answer-numeric', value);
          tr.append(td);
        }
        body.append(tr);
      }
    }

    function applySort() {
      const column = columns.find(candidate => candidate.key === sortedColumn);
      if (!column) return drawRows(rows);
      const ordered = rows.map((row, index) => ({ row, index }));
      ordered.sort((a, b) => {
        const left = a.row[column.key];
        const right = b.row[column.key];
        if (left == null || right == null) {
          if (left == null && right == null) return a.index - b.index;
          return left == null ? 1 : -1;
        }
        const result = typeof left === 'number' && typeof right === 'number'
          ? left - right
          : collator.compare(String(left), String(right));
        return (result * direction) || (a.index - b.index);
      });
      for (const header of headers) {
        if (header.column.key === sortedColumn) {
          header.th.setAttribute('aria-sort', direction === 1 ? 'ascending' : 'descending');
          header.arrow.textContent = direction === 1 ? '\u2191' : '\u2193';
          header.button.setAttribute('aria-label', `Sort by ${header.column.label}, ${direction === 1 ? 'descending' : 'ascending'}`);
        } else {
          header.th.removeAttribute('aria-sort');
          header.arrow.textContent = '\u2195';
          header.button.setAttribute('aria-label', `Sort by ${header.column.label}, ascending`);
        }
      }
      if (stateKey) tableStates[stateKey] = { key: sortedColumn, direction };
      drawRows(ordered.map(item => item.row));
    }

    for (const column of columns) {
      const th = make('th');
      th.scope = 'col';
      if (column.format !== 'text') th.className = 'sl-answer-numeric';
      if (sortable && rows.length > 1) {
        const button = make('button', 'sl-answer-sort');
        button.type = 'button';
        const label = make('span', '', column.label);
        const arrow = make('span', 'sl-answer-sort-direction', '\u2195');
        arrow.setAttribute('aria-hidden', 'true');
        button.append(label, arrow);
        button.setAttribute('aria-label', `Sort by ${column.label}, ascending`);
        th.append(button);
        headers.push({ th, button, arrow, column });
        lifecycle.on(button, 'click', () => {
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
    const { section } = blockShell(block, 'Table');
    if (!block.rows.length) {
      section.append(make('p', 'sl-answer-note', 'This answer contains table columns without rows. View the source for its data.'));
    } else {
      section.append(table(block.columns, block.rows, block.title || 'Answer table', { stateKey: block.id }));
    }
    return section;
  }

  function renderChart(block) {
    const { section, heading } = blockShell(block, block.kind === 'line' ? 'Line chart' : 'Bar chart');
    if (!block.data.length) {
      section.append(make('p', 'sl-answer-note', 'This answer contains a chart without data points. View the source for its data.'));
      return section;
    }
    const figure = make('figure', 'sl-answer-chart-figure');
    const graphic = svg('svg', { viewBox: '0 0 640 288', class: 'sl-answer-chart', role: 'img', 'aria-labelledby': heading.id });
    const descriptionId = id();
    graphic.setAttribute('aria-describedby', descriptionId);
    const values = block.data.map(point => point.value);
    let minimum = Math.min(0, ...values);
    let maximum = Math.max(0, ...values);
    if (minimum === maximum) maximum = minimum + 1;
    const extent = maximum - minimum;
    const compactNumber = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
    let lastWidth = 0;
    function drawChart(availableWidth) {
      const viewWidth = Math.max(160, Math.min(4096, Math.round(availableWidth)));
      if (viewWidth === lastWidth) return;
      lastWidth = viewWidth;
      const left = viewWidth < 400 ? 56 : 84;
      const right = viewWidth - 20;
      const top = 16;
      const bottom = viewWidth < 400 ? 208 : 232;
      graphic.setAttribute('viewBox', `0 0 ${viewWidth} ${bottom + 56}`);
      graphic.replaceChildren(svg('desc', { id: descriptionId }, `${block.kind === 'line' ? 'Line' : 'Bar'} chart with ${block.data.length} data points. Open View data below for exact values.`));
      const y = value => bottom - ((value - minimum) / extent) * (bottom - top);
      const zero = y(0);
      const labelCount = Math.min(block.data.length, 6, Math.max(2, Math.floor((right - left) / 110)));
      const labelEvery = Math.max(1, Math.ceil(block.data.length / labelCount));
      const labelLength = Math.max(4, Math.min(14, Math.floor((right - left) / labelCount / 7)));
      const shortNumber = value => value !== 0 && Math.abs(value) < 0.001 ? value.toExponential(0) : compactNumber.format(value);
      for (let tick = 0; tick <= 4; tick++) {
        const value = minimum + extent * tick / 4;
        const position = y(value);
        graphic.append(svg('line', { x1: left, x2: right, y1: position, y2: position, class: 'sl-answer-chart-grid' }));
        graphic.append(svg('text', { x: left - 10, y: position + 4, 'text-anchor': 'end', class: 'sl-answer-chart-label' }, shortNumber(value)));
      }
      graphic.append(svg('line', { x1: left, x2: right, y1: zero, y2: zero, class: 'sl-answer-chart-baseline' }));
      const width = right - left;
      const band = width / block.data.length;
      const x = index => block.kind === 'bar' ? left + band * (index + 0.5)
        : block.data.length === 1 ? left + width / 2 : left + width * index / (block.data.length - 1);
      if (block.kind === 'line') {
        const points = block.data.map((point, index) => `${x(index)},${y(point.value)}`).join(' ');
        graphic.append(svg('polyline', { points, class: 'sl-answer-chart-line' }));
      }
      block.data.forEach((point, index) => {
        const mark = block.kind === 'bar'
          ? svg('rect', {
            x: x(index) - band * 0.32,
            y: Math.min(zero, y(point.value)),
            width: band * 0.64,
            height: Math.abs(y(point.value) - zero),
            rx: 2,
            class: 'sl-answer-chart-bar',
          })
          : svg('circle', { cx: x(index), cy: y(point.value), r: 3.5, class: 'sl-answer-chart-point' });
        mark.append(svg('title', {}, `${point.label}: ${numericText(point.value)}`));
        graphic.append(mark);
        if (index % labelEvery === 0 || index === block.data.length - 1) {
          const label = point.label.length > labelLength ? `${point.label.slice(0, labelLength - 1)}\u2026` : point.label;
          const anchor = x(index) > right - 60 ? 'end' : x(index) < left + 30 ? 'start' : 'middle';
          const labelElement = svg('text', { x: x(index), y: bottom + 24, 'text-anchor': anchor, class: 'sl-answer-chart-label' }, label);
          labelElement.append(svg('title', {}, point.label));
          graphic.append(labelElement);
        }
      });
    }
    drawChart(640);
    const Resize = doc.defaultView?.ResizeObserver || globalThis.ResizeObserver;
    if (typeof Resize === 'function') {
      const observer = new Resize(entries => {
        if (lifecycle.disposed) return;
        const width = entries[0]?.contentRect.width;
        if (Number.isFinite(width) && width > 0) drawChart(width);
      });
      lifecycle.observe(observer, figure, {});
    }
    if (block.xLabel || block.yLabel) {
      const labels = [block.xLabel && `Horizontal: ${block.xLabel}`, block.yLabel && `Vertical: ${block.yLabel}`].filter(Boolean);
      figure.append(make('figcaption', 'sl-answer-chart-axes', labels.join('. ')));
    }
    figure.prepend(graphic);
    const details = make('details', 'sl-answer-data');
    details.open = options.state?.[block.id]?.open === true;
    disclosureStates[block.id] = details.open;
    lifecycle.on(details, 'toggle', () => {
      disclosureStates[block.id] = details.open;
      options.onChange?.({ blockId: block.id, open: details.open });
    });
    details.append(make('summary', 'sl-answer-disclosure', 'View data'));
    details.append(table([
      { key: 'label', label: block.xLabel || 'Label', format: 'text' },
      { key: 'value', label: block.yLabel || 'Value', format: 'number' },
    ], block.data, `${block.title || 'Chart'} exact data`, { exactNumbers: true, stateKey: block.id }));
    section.append(figure, details);
    return section;
  }

  function renderForm(block) {
    const { section } = blockShell(block, 'Calculator');
    const form = make('form', 'sl-answer-form');
    form.noValidate = true;
    const values = Object.create(null);
    const inputs = [];
    const outputs = [];
    const fields = make('div', 'sl-answer-fields');
    const restored = options.state?.[block.id]?.values;
    const notice = make('p', 'sl-answer-note', 'Values stay in this answer.');
    notice.id = id();
    form.setAttribute('aria-describedby', notice.id);

    function initialValue(field) {
      const value = restored?.[field.key];
      if (field.type === 'checkbox') return typeof value === 'boolean' ? value : field.value;
      if (field.type === 'number') {
        if (value === null) return null;
        if (typeof value !== 'number' || !Number.isFinite(value)) return field.value;
        return Math.min(field.max ?? Infinity, Math.max(field.min ?? -Infinity, value));
      }
      if (field.type === 'select') return field.options.some(option => option.value === value) ? value : field.value;
      return typeof value === 'string' ? value.slice(0, 2000) : field.value;
    }

    function updateOutputs() {
      for (const output of outputs) {
        const value = evaluateExpression(output.expression, values);
        output.node.textContent = value === null ? 'Enter valid values to calculate.' : numericText(value);
        output.node.classList.toggle('sl-answer-output-empty', value === null);
      }
      formStates[block.id] = { ...values };
    }

    for (const field of block.fields) {
      const fieldId = id();
      const wrapper = make('div', field.type === 'checkbox' ? 'sl-answer-field sl-answer-checkbox-field' : 'sl-answer-field');
      const label = make('label', 'sl-answer-label', field.label);
      label.htmlFor = fieldId;
      let input;
      if (field.type === 'select') {
        input = make('select', 'sl-answer-input');
        for (const choice of field.options) {
          const option = make('option', '', choice.label);
          option.value = choice.value;
          input.append(option);
        }
      } else {
        input = make('input', field.type === 'checkbox' ? 'sl-answer-checkbox' : 'sl-answer-input');
        input.type = field.type;
        if (field.type === 'number') {
          input.step = field.step === undefined ? 'any' : String(field.step);
          input.min = String(field.min ?? -LIMITS.number);
          input.max = String(field.max ?? LIMITS.number);
          input.inputMode = 'decimal';
        } else if (field.type === 'text') {
          input.maxLength = 2000;
        }
      }
      input.id = fieldId;
      input.name = field.key;
      input.autocomplete = 'off';
      values[field.key] = initialValue(field);
      if (field.type === 'checkbox') input.checked = values[field.key];
      else input.value = values[field.key] === null ? '' : String(values[field.key]);
      if (field.type === 'number' && values[field.key] !== null && !input.validity.valid) {
        values[field.key] = field.value;
        input.value = String(field.value);
      }
      const error = make('span', 'sl-answer-field-error');
      error.id = id();
      error.hidden = true;
      input.setAttribute('aria-describedby', error.id);
      if (field.type === 'number') {
        const constraints = [];
        if (field.min !== undefined) constraints.push(`Minimum ${numericText(field.min)}`);
        if (field.max !== undefined) constraints.push(`Maximum ${numericText(field.max)}`);
        if (field.step !== undefined) constraints.push(`Step ${numericText(field.step)}`);
        if (constraints.length) {
          const hint = make('span', 'sl-answer-field-hint', constraints.join('. '));
          hint.id = id();
          wrapper.append(hint);
          input.setAttribute('aria-describedby', `${hint.id} ${error.id}`);
        }
      }
      const setValue = () => {
        if (field.type === 'number') {
          const value = input.value.trim() === '' ? null : Number(input.value);
          const valid = value !== null && Number.isFinite(value) && input.validity.valid;
          values[field.key] = valid ? value : null;
          input.setAttribute('aria-invalid', valid ? 'false' : 'true');
          error.hidden = valid;
          error.textContent = valid ? '' : input.validationMessage || 'Enter a number within this field\u2019s limits.';
        } else {
          values[field.key] = field.type === 'checkbox' ? input.checked : input.value;
        }
        updateOutputs();
        options.onChange?.({ blockId: block.id, values: { ...values } });
      };
      lifecycle.on(input, field.type === 'checkbox' || field.type === 'select' ? 'change' : 'input', setValue);
      if (field.type === 'checkbox') {
        label.textContent = '';
        label.append(input, make('span', '', field.label));
        wrapper.prepend(label);
      } else {
        wrapper.prepend(label, input);
      }
      wrapper.append(error);
      fields.append(wrapper);
      inputs.push({ field, input, error });
    }
    form.append(fields);
    if (block.outputs.length) {
      const resultGroup = make('dl', 'sl-answer-outputs');
      resultGroup.setAttribute('aria-live', 'polite');
      resultGroup.setAttribute('aria-atomic', 'false');
      for (const result of block.outputs) {
        const row = make('div', 'sl-answer-output');
        const name = make('dt', 'sl-answer-output-label', result.label);
        const value = make('dd', 'sl-answer-output-value');
        row.append(name, value);
        resultGroup.append(row);
        outputs.push({ node: value, expression: result.expression });
      }
      form.append(resultGroup);
    }
    const footer = make('div', 'sl-answer-form-footer');
    const reset = make('button', 'sl-answer-button', 'Reset values');
    reset.type = 'button';
    lifecycle.on(reset, 'click', () => {
      for (const { field, input, error } of inputs) {
        values[field.key] = field.value;
        if (field.type === 'checkbox') input.checked = field.value;
        else input.value = String(field.value);
        input.removeAttribute('aria-invalid');
        error.hidden = true;
        error.textContent = '';
      }
      updateOutputs();
      options.onChange?.({ blockId: block.id, values: { ...values } });
    });
    lifecycle.on(form, 'submit', event => {
      event.preventDefault();
      event.stopPropagation();
    });
    lifecycle.on(form, 'keydown', event => event.stopPropagation());
    footer.append(notice, reset);
    form.append(footer);
    section.append(form);
    updateOutputs();
    return section;
  }

  if (answer.title) {
    const heading = make('h2', 'sl-answer-title', answer.title);
    heading.id = id();
    root.setAttribute('aria-labelledby', heading.id);
    root.append(heading);
  } else {
    root.setAttribute('aria-label', 'Interactive answer');
  }
  for (const block of answer.blocks) {
    if (block.type === 'text') root.append(make('p', 'sl-answer-text', block.text));
    else if (block.type === 'table') root.append(renderTable(block));
    else if (block.type === 'chart') root.append(renderChart(block));
    else if (block.type === 'form') root.append(renderForm(block));
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
    },
  };
}
