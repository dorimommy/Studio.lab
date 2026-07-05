/**
 * chat-export.js — Studio.lab Module
 *
 * Exports the full chat history to Markdown or JSON.
 * Data is captured from the network layer (interceptor.js), bypassing
 * Angular's DOM virtualization entirely.
 */
(function () {
  'use strict';

  let lastPayload = null;

  // ── Capture from GenerateContent request body ──────────────────
  window.addEventListener('__sl_requestPayload', (e) => {
    try {
      if (e.detail) {
        lastPayload = JSON.parse(e.detail);
        if (window.StudioLab && window.StudioLab.log) {
          window.StudioLab.log('📦 Chat payload captured (' + (lastPayload[1] ? lastPayload[1].length : '?') + ' turns)', 'info');
        }
      }
    } catch (err) {
      if (window.StudioLab && window.StudioLab.log) {
        window.StudioLab.log('Failed to parse request payload for export', 'warn');
      }
    }
  });

  // ── Export: JSON ───────────────────────────────────────────────
  function exportAsJson() {
    if (!lastPayload) {
      alert('No chat history captured yet.\nPlease send at least one message first.');
      return;
    }
    downloadFile(
      JSON.stringify(lastPayload, null, 2),
      'chat-export.json',
      'application/json'
    );
  }

  // ── Export: Markdown ───────────────────────────────────────────
  function exportAsMarkdown() {
    if (!lastPayload || !Array.isArray(lastPayload) || lastPayload.length < 2) {
      alert('No chat history captured yet.\nPlease send at least one message first.');
      return;
    }

    const turns = lastPayload[1];
    if (!Array.isArray(turns)) {
      alert('Unrecognized chat structure.');
      return;
    }

    const lines = ['# Chat Export\n'];

    turns.forEach((turn, index) => {
      const parts = [];
      extractText(turn, parts);

      if (parts.length) {
        const role = index % 2 === 0 ? 'User' : 'Model';
        lines.push('## ' + role + '\n');
        lines.push(parts.join('\n\n'));
        lines.push('\n\n---\n');
      }
    });

    downloadFile(lines.join('\n'), 'chat-export.md', 'text/markdown');
  }

  /** Recursively walk the nested‑array payload and collect text strings. */
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

  // ── Download helper ───────────────────────────────────────────
  function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Module registration ───────────────────────────────────────
  window.StudioLab.registerModule({
    id: 'chat-export',
    group: 'modules',
    order: 5,
    title: 'Chat Export',
    subtitle: 'Export complete context to Markdown or JSON.',
    alwaysSelected: true,
    renderControls: () => `
      <div class="sl-controls-row" style="padding: 0 12px 12px; gap: 8px; display: flex; width: 100%; box-sizing: border-box;">
        <button type="button" class="sl-apply-btn" id="sl-export-md" style="flex: 1;">Export Markdown</button>
        <button type="button" class="sl-apply-btn" id="sl-export-json" style="flex: 1;">Export JSON</button>
      </div>
    `,
    bindControls: (modalEl) => {
      const btnMd = modalEl.querySelector('#sl-export-md');
      const btnJson = modalEl.querySelector('#sl-export-json');
      if (btnMd) btnMd.addEventListener('click', (e) => { e.stopPropagation(); exportAsMarkdown(); });
      if (btnJson) btnJson.addEventListener('click', (e) => { e.stopPropagation(); exportAsJson(); });
    }
  });
})();
