/** Accessible select-only comboboxes for Studio.lab's own HTML selects. */
(function () {
  'use strict';
  const instances = new WeakMap();
  let sequence = 0;

  function enhance(select, settings = {}) {
    if (!select || select.tagName !== 'SELECT' || select.multiple || select.size > 1 || !select.parentNode) return null;
    if (instances.has(select)) return instances.get(select);
    const doc = select.ownerDocument;
    const view = doc.defaultView || window;
    const popup = doc.createElement('div');
    // Preserve the ordinary select on browsers that cannot escape clipped views.
    if (typeof popup.showPopover !== 'function' || typeof popup.hidePopover !== 'function') return null;
    let prefix;
    do { prefix = 'sl-select-' + (++sequence); } while (doc.getElementById(prefix));
    const wrapper = doc.createElement('div'); wrapper.className = 'sl-select';
    const button = doc.createElement('button'); button.type = 'button'; button.id = prefix;
    button.className = 'sl-select-trigger'; button.setAttribute('role', 'combobox');
    button.setAttribute('aria-haspopup', 'listbox'); button.setAttribute('aria-expanded', 'false');
    const value = doc.createElement('span'); value.className = 'sl-select-value';
    const chevron = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    chevron.classList.add('sl-select-chevron'); chevron.setAttribute('viewBox', '0 0 24 24');
    chevron.setAttribute('fill', 'none'); chevron.setAttribute('stroke', 'currentColor');
    chevron.setAttribute('stroke-width', '1.8'); chevron.setAttribute('aria-hidden', 'true');
    chevron.setAttribute('focusable', 'false');
    const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'm6 9 6 6 6-6'); path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round'); chevron.appendChild(path);
    button.append(value, chevron);
    popup.id = prefix + '-list'; popup.className = 'sl-select-popup';
    popup.setAttribute('popover', 'manual'); popup.setAttribute('role', 'listbox');
    const originalHidden = select.hidden;
    const labels = Array.from(select.labels || []).map(label => ({ label,
      id: label.getAttribute('id'), forValue: label.getAttribute('for'), assignedId: null }));
    for (const [index, item] of labels.entries()) {
      if (!item.label.id) {
        item.assignedId = prefix + '-label-' + index;
        item.label.id = item.assignedId;
      }
      if (item.forValue === select.id) item.label.htmlFor = button.id;
    }
    select.parentNode.insertBefore(wrapper, select);
    wrapper.append(select, button, popup); select.hidden = true;
    let disposed = false, opened = false, rows = [], active = null, typed = '', typeTimer = null, positionedClip = null;
    const removers = [];
    function listen(target, type, listener, options) {
      target.addEventListener(type, listener, options);
      removers.push(() => target.removeEventListener(type, listener, options));
    }
    function blocked() {
      return select.matches(':disabled') || select.getAttribute('aria-disabled') === 'true' ||
        !!wrapper.closest('[inert], [aria-busy="true"]');
    }
    function selectedOption() {
      const options = Array.from(select.options || select.querySelectorAll('option'));
      if (Number.isInteger(select.selectedIndex)) return options[select.selectedIndex] || null;
      return options.find(option => option.selected) ||
        options.find(option => option.value === select.value) || null;
    }
    function optionDisabled(option) {
      return option.disabled || option.parentElement?.tagName === 'OPTGROUP' && option.parentElement.disabled;
    }
    function enabledRows() { return rows.filter(row => !optionDisabled(row.option)); }
    function labelText(option) { return String(option?.label || option?.textContent || ''); }
    function syncName() {
      const labelledBy = select.getAttribute('aria-labelledby') || labels.map(item => item.label.id).filter(Boolean).join(' ');
      if (labelledBy) {
        button.setAttribute('aria-labelledby', labelledBy); popup.setAttribute('aria-labelledby', labelledBy);
        button.removeAttribute('aria-label'); popup.removeAttribute('aria-label');
      } else {
        const label = String(settings.label || select.getAttribute('aria-label') || 'Choose an option');
        button.setAttribute('aria-label', label); popup.setAttribute('aria-label', label);
        button.removeAttribute('aria-labelledby'); popup.removeAttribute('aria-labelledby');
      }
      for (const name of ['aria-describedby', 'aria-invalid', 'aria-required', 'aria-busy']) {
        const text = select.getAttribute(name);
        if (text !== null) button.setAttribute(name, text); else button.removeAttribute(name);
      }
      if (select.required) button.setAttribute('aria-required', 'true');
    }
    function clearTypeahead() { view.clearTimeout(typeTimer); typeTimer = null; typed = ''; }
    function close() {
      if (!opened) return;
      opened = false; button.setAttribute('aria-expanded', 'false'); button.removeAttribute('aria-activedescendant');
      button.removeAttribute('aria-controls');
      positionedClip = null;
      clearTypeahead();
      try { popup.hidePopover(); } catch (_) { /* The owner may have closed its dialog already. */ }
    }
    function setActive(row, scroll = true) {
      if (!row || optionDisabled(row.option)) return;
      active = row.option;
      for (const item of rows) item.node.dataset.active = String(item === row);
      if (opened) button.setAttribute('aria-activedescendant', row.node.id);
      if (scroll) {
        const top = row.node.offsetTop, bottom = top + row.node.offsetHeight;
        if (top < popup.scrollTop) popup.scrollTop = top;
        else if (bottom > popup.scrollTop + popup.clientHeight) popup.scrollTop = bottom - popup.clientHeight;
      }
    }
    function position() {
      if (!opened) return;
      const rect = button.getBoundingClientRect();
      const viewport = view.visualViewport;
      const left = viewport?.offsetLeft || 0;
      let top = viewport?.offsetTop || 0, height = viewport?.height || view.innerHeight;
      const width = viewport?.width || view.innerWidth;
      // Private extension frames may be taller than their visible Settings clip.
      // The caller supplies only local, validated layout numbers, never host DOM.
      let clip;
      try { clip = settings.getViewport?.(); } catch (_) { /* Use the ordinary viewport. */ }
      if (Number.isInteger(clip?.top) && Number.isInteger(clip?.height) && clip.top >= 0 &&
          clip.height >= 1 && clip.top + clip.height <= 10000) {
        const end = Math.min(top + height, clip.top + clip.height);
        top = Math.max(top, clip.top); height = Math.max(1, end - top);
      }
      if (rect.bottom <= top || rect.top >= top + height ||
          positionedClip && (positionedClip.top !== top || positionedClip.height !== height)) { close(); return; }
      positionedClip = { top, height };
      const margin = 8, below = top + height - rect.bottom - margin, above = rect.top - top - margin;
      const downward = below >= Math.min(220, popup.scrollHeight) || below >= above;
      const available = Math.max(44, downward ? below : above);
      const popupWidth = Math.min(Math.max(rect.width, 180), Math.max(1, width - 2 * margin));
      popup.style.width = popupWidth + 'px';
      popup.style.maxHeight = Math.min(320, Math.max(1, available), Math.max(1, height - 2 * margin)) + 'px';
      popup.style.left = Math.max(left + margin, Math.min(rect.left, left + width - margin - popupWidth)) + 'px';
      const popupHeight = Math.min(popup.scrollHeight, parseFloat(popup.style.maxHeight));
      popup.style.top = Math.max(top + margin, Math.min(downward ? rect.bottom + 4 : rect.top - popupHeight - 4,
        top + height - margin - popupHeight)) + 'px';
    }
    function refresh() {
      if (disposed) return;
      syncName(); button.disabled = blocked();
      const current = selectedOption(); value.textContent = current ? labelText(current) : 'Choose an option';
      const wasActive = active;
      popup.replaceChildren(); rows = [];
      for (const option of Array.from(select.options || select.querySelectorAll('option'))) {
        if (option.hidden || option.parentElement?.tagName === 'OPTGROUP' && option.parentElement.hidden) continue;
        const node = doc.createElement('div'); node.id = prefix + '-option-' + rows.length;
        node.className = 'sl-select-option'; node.setAttribute('role', 'option');
        node.setAttribute('aria-selected', String(option === current));
        node.setAttribute('aria-disabled', String(!!optionDisabled(option)));
        node.textContent = labelText(option); rows.push({ option, node }); popup.appendChild(node);
      }
      const next = rows.find(row => row.option === wasActive && !optionDisabled(row.option)) ||
        rows.find(row => row.option === current && !optionDisabled(row.option)) || enabledRows()[0];
      active = null; if (next) setActive(next, false);
      if (opened) {
        if (button.disabled || !button.isConnected || !button.getClientRects().length || !next) close();
        else { position(); setActive(next); }
      }
    }
    function open(edge) {
      if (disposed || blocked() || !button.isConnected || !button.getClientRects().length) return;
      refresh(); if (!enabledRows().length) return;
      try { popup.showPopover(); } catch (_) { return; }
      opened = true; button.setAttribute('aria-expanded', 'true'); button.setAttribute('aria-controls', popup.id);
      position(); if (!opened) return;
      const available = enabledRows();
      const row = edge === 'first' ? available[0] : edge === 'last' ? available.at(-1) :
        rows.find(item => item.option === selectedOption() && !optionDisabled(item.option)) || available[0];
      setActive(row); button.focus({ preventScroll: true });
    }
    function choose(row) {
      if (!opened || blocked() || !row || !select.contains(row.option) || optionDisabled(row.option)) return;
      const index = Array.from(select.options || select.querySelectorAll('option')).indexOf(row.option);
      if (index < 0) return;
      select.selectedIndex = index;
      close(); refresh();
      select.dispatchEvent(new view.Event('input', { bubbles: true }));
      select.dispatchEvent(new view.Event('change', { bubbles: true }));
    }
    listen(button, 'click', () => { if (opened) close(); else open(); });
    listen(button, 'keydown', event => {
      if (blocked() || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key;
      if (key === 'Tab') { close(); return; }
      if (key === 'Escape') { if (opened) { event.preventDefault(); event.stopPropagation(); close(); } return; }
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) {
        event.preventDefault(); event.stopPropagation();
        if (!opened) { open(key === 'Home' ? 'first' : key === 'End' ? 'last' : undefined); return; }
        if (key === 'Enter' || key === ' ') { choose(rows.find(row => row.option === active)); return; }
        const available = enabledRows(), index = available.findIndex(row => row.option === active);
        setActive(key === 'Home' ? available[0] : key === 'End' ? available.at(-1) :
          available[Math.max(0, Math.min(available.length - 1, index + (key === 'ArrowDown' ? 1 : -1)))]);
        return;
      }
      if (key.length !== 1) return;
      event.preventDefault(); event.stopPropagation(); if (!opened) open(); if (!opened) return;
      view.clearTimeout(typeTimer); typed += key.toLocaleLowerCase();
      typeTimer = view.setTimeout(clearTypeahead, 650);
      const query = Array.from(typed).every(character => character === typed[0]) ? typed[0] : typed;
      const available = enabledRows(), index = available.findIndex(row => row.option === active);
      const start = query.length === 1 ? index + 1 : Math.max(0, index);
      for (let offset = 0; offset < available.length; offset++) {
        const row = available[(start + offset) % available.length];
        if (labelText(row.option).trim().toLocaleLowerCase().startsWith(query)) { setActive(row); break; }
      }
    });
    function pointerRow(event) {
      const node = event.target.closest?.('.sl-select-option');
      return rows.find(row => row.node === node);
    }
    listen(popup, 'pointerdown', event => { if (pointerRow(event)) event.preventDefault(); });
    listen(popup, 'pointermove', event => { const row = pointerRow(event); if (row?.option !== active) setActive(row, false); });
    listen(popup, 'click', event => choose(pointerRow(event)));
    listen(doc, 'pointerdown', event => {
      if (opened && !popup.contains(event.target) && !button.contains(event.target)) close();
    }, true);
    listen(button, 'blur', () => close());
    listen(doc, 'scroll', event => { if (opened && !popup.contains(event.target)) close(); }, true);
    listen(view, 'resize', close);
    if (view.visualViewport) { listen(view.visualViewport, 'resize', close); listen(view.visualViewport, 'scroll', close); }
    listen(select, 'change', refresh); listen(select, 'input', refresh);
    listen(popup, 'toggle', event => { if (event.newState === 'closed' && opened) close(); });
    const observer = new view.MutationObserver(refresh);
    observer.observe(select, { subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ['disabled', 'label', 'selected', 'value', 'hidden', 'aria-disabled', 'aria-describedby',
        'aria-labelledby', 'aria-label', 'aria-invalid', 'aria-required', 'required', 'aria-busy'] });
    for (let parent = wrapper.parentElement; parent; parent = parent.parentElement) {
      observer.observe(parent, { attributes: true, attributeFilter: ['disabled', 'aria-busy', 'hidden', 'inert'] });
    }
    const api = { button, popup, refresh, dispose() {
      if (disposed) return;
      close(); disposed = true; clearTypeahead(); observer.disconnect(); removers.forEach(remove => remove());
      for (const item of labels) {
        if (item.label.getAttribute('for') === button.id) {
          if (item.forValue === null) item.label.removeAttribute('for'); else item.label.setAttribute('for', item.forValue);
        }
        if (item.assignedId && item.label.id === item.assignedId) item.label.removeAttribute('id');
      }
      select.hidden = originalHidden;
      if (select.parentNode === wrapper && wrapper.parentNode) wrapper.parentNode.insertBefore(select, wrapper);
      wrapper.remove(); instances.delete(select);
    } };
    instances.set(select, api); refresh(); return api;
  }
  window.StudioLabSelect = Object.freeze({ enhance });
})();
