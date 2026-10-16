// Hosts AI Studio's existing settings view; Angular retains controls, persistence, and the CDK dialog.
(function () {
  'use strict';

  if (!window.StudioLab) return;

  const SETTINGS_BUTTON = 'ms-settings-menu button[data-test-id="settings-menu"], ms-settings-menu button[aria-label="Settings"]';
  const USER_SETTINGS_ITEM = '[data-test-id="user-settings-menu"]';
  const OPEN_TIMEOUT = 3000;
  let adapterSequence = 0;

  function isUserSettingsItem(element) {
    if (!element?.closest('.mat-mdc-menu-panel') || element.closest('.sl-overlay')) return false;
    if (element.matches(USER_SETTINGS_ITEM)) return true;
    // Material icon text may prefix the label; match all remaining text to avoid other settings actions.
    return text(element).toLowerCase().replace(/^settings\s*(?=user settings$)/, '') === 'user settings';
  }

  function triggerElement(target) {
    const opener = target?.closest?.(SETTINGS_BUTTON);
    if (opener && !opener.closest('.sl-overlay')) return opener;
    const item = target?.closest?.(USER_SETTINGS_ITEM + ', button, a, [role="menuitem"]');
    return isUserSettingsItem(item) ? item : null;
  }

  function isSettingsTrigger(target) { return !!triggerElement(target); }

  function disabled(element) {
    return !element || element.disabled || element.getAttribute('aria-disabled') === 'true';
  }

  function visible(element) {
    return !!(element?.isConnected && !element.hidden &&
      element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length);
  }

  function text(element, limit = 2000) {
    return (element?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, limit);
  }

  function createAdapter({ onClosed, onChange, onRestoreFrameFocus } = {}) {
    const scope = window.StudioLab.createScope();
    const waiters = new Set();
    const originalHidden = new Map();
    let host = null;
    let shell = null;
    let borrowedSlot = null;
    let requestedShell = null;
    let requestedSlot = null;
    let originalParent = null;
    let originalNext = null;
    let hadPaneClass = false;
    let hadComponentClass = false;
    let disposed = false;
    let opening = false;
    let openingPromise = null;
    let closing = false;
    let closedReported = false;
    let lastSnapshot = '';
    let observerStarted = false;
    let notificationQueued = false;
    let containerAttributes = null;
    let stationaryShell = false;
    let previewActive = false;
    const shellDialogAttributes = new Map();
    const semanticAttributes = new Map();
    const semanticClasses = new Map();
    const popupClasses = new Map();
    const chipActiveClasses = new WeakMap();
    const chipPressedStates = new WeakMap();
    const semanticIdPrefix = 'sl-native-setting-' + (++adapterSequence) + '-';
    let semanticIdSequence = 0;

    function readAttributes(element, names) {
      return names.map(name => [name, element.getAttribute(name)]);
    }

    function restoreAttributes(element, attributes) {
      for (const [name, value] of attributes) {
        if (value === null) element.removeAttribute(name);
        else element.setAttribute(name, value);
      }
    }

    function setSemanticAttribute(element, name, value) {
      if (element.getAttribute(name) === value) return;
      let attributes = semanticAttributes.get(element);
      if (!attributes) semanticAttributes.set(element, attributes = new Map());
      if (!attributes.has(name)) attributes.set(name, element.getAttribute(name));
      if (value === null) element.removeAttribute(name);
      else element.setAttribute(name, value);
    }

    function addSemanticClass(element, name) {
      if (element.classList.contains(name)) return;
      let classes = semanticClasses.get(element);
      if (!classes) semanticClasses.set(element, classes = new Set());
      classes.add(name);
      element.classList.add(name);
    }

    function semanticId(element) {
      const existing = element.getAttribute('id');
      if (existing) return existing;
      let id;
      do { id = semanticIdPrefix + (++semanticIdSequence); }
      while (document.getElementById(id));
      setSemanticAttribute(element, 'id', id);
      return id;
    }

    function describeControl(element, descriptionId) {
      if (!descriptionId) return;
      const ids = (element.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
      if (!ids.includes(descriptionId)) ids.push(descriptionId);
      setSemanticAttribute(element, 'aria-describedby', ids.join(' '));
    }

    function enhanceLayout(section, label, description) {
      if (label) addSemanticClass(label, 'sl-native-setting-label');
      if (description) addSemanticClass(description, 'sl-native-setting-help');
      const candidates = [...section.querySelectorAll('.button-group, .native-options, mat-select, mat-slide-toggle, mat-checkbox, mat-form-field, select, input, textarea, button, [role="combobox"], [role="switch"]')]
        .filter(control => !label?.contains(control) && !description?.contains(control));
      const controls = candidates.filter(control => !candidates.some(parent => parent !== control && parent.contains(control)));
      // Classify existing branches without adding wrappers to Angular's view.
      let layout = label?.parentElement || section;
      while (layout !== section && (!layout.contains(description || label) ||
          controls.some(control => !layout.contains(control)))) layout = layout.parentElement || section;
      addSemanticClass(layout, 'sl-native-setting-layout');
      if (layout !== section) addSemanticClass(section, 'sl-native-setting-nested');
      function branch(node) {
        if (!node || node === layout) return null;
        while (node.parentElement && node.parentElement !== layout) node = node.parentElement;
        return node.parentElement === layout ? node : null;
      }
      for (const copy of new Set([branch(label), branch(description)].filter(Boolean))) {
        if (controls.some(control => copy.contains(control))) continue;
        addSemanticClass(copy, 'sl-native-setting-copy');
        addSemanticClass(copy, 'sl-setting-copy');
        if (label && description && copy.contains(label) && copy.contains(description)) {
          addSemanticClass(copy, 'sl-native-setting-copy-combined');
        }
      }
      const controlBranches = new Set();
      for (const control of controls) {
        addSemanticClass(control, 'sl-native-setting-control');
        const wrapper = branch(control);
        if (wrapper && !wrapper.contains(label) && !wrapper.contains(description)) {
          addSemanticClass(wrapper, 'sl-native-setting-controls');
          addSemanticClass(wrapper, 'sl-setting-control');
          controlBranches.add(wrapper);
        }
      }
      if (controlBranches.size > 1) addSemanticClass(layout, 'sl-native-setting-multiple-controls');
      for (const group of section.querySelectorAll('.button-group, .native-options')) {
        addSemanticClass(group, 'sl-native-setting-choice-group');
      }
    }

    function updatePopupClasses(targets) {
      for (const [element, classes] of popupClasses) {
        const wanted = targets.get(element);
        for (const name of [...classes]) if (!wanted?.has(name)) {
          element.classList.remove(name);
          classes.delete(name);
        }
        if (!classes.size) popupClasses.delete(element);
      }
      for (const [element, names] of targets) for (const name of names) {
        if (element.classList.contains(name)) continue;
        let classes = popupClasses.get(element);
        if (!classes) popupClasses.set(element, classes = new Set());
        classes.add(name);
        element.classList.add(name);
      }
    }

    function enhanceSelectPanels() {
      const targets = new Map();
      const controls = [...host.component.querySelectorAll('mat-select, [role="combobox"], select')];
      const expanded = new Set(controls.filter(control => control.getAttribute('aria-expanded') === 'true')
        .map(control => control.closest('mat-select') || control));
      const panels = new Set();
      const knownPanel = panel => panel?.matches('.mat-mdc-select-panel, .mat-select-panel') &&
        visible(panel) && !!panel.closest('.cdk-overlay-pane');
      for (const control of controls) {
        addSemanticClass(control, 'sl-native-setting-select');
        const field = control.closest('mat-form-field');
        if (field && host.component.contains(field)) {
          // Mark Material's skin separately so CSS can remove its outline while retaining container handlers.
          addSemanticClass(field, 'sl-native-setting-select-field');
          for (const skin of field.querySelectorAll('.mat-mdc-text-field-wrapper, .mat-form-field-wrapper')) {
            addSemanticClass(skin, 'sl-native-setting-select-skin');
          }
          for (const layout of field.querySelectorAll('.mat-mdc-form-field-flex, .mat-form-field-flex')) {
            addSemanticClass(layout, 'sl-native-setting-select-layout');
          }
          for (const content of field.querySelectorAll('.mat-mdc-form-field-infix, .mat-form-field-infix')) {
            addSemanticClass(content, 'sl-native-setting-select-content');
          }
          for (const decoration of field.querySelectorAll('.mdc-notched-outline, .mdc-line-ripple, .mat-form-field-underline, .mat-form-field-ripple, .mat-mdc-form-field-focus-overlay')) {
            addSemanticClass(decoration, 'sl-native-setting-select-decoration');
          }
        }
        for (const trigger of control.querySelectorAll('.mat-mdc-select-trigger, .mat-select-trigger')) {
          addSemanticClass(trigger, 'sl-native-setting-select-trigger');
        }
        const ids = ((control.getAttribute('aria-controls') || '') + ' ' +
          (control.getAttribute('aria-owns') || '')).split(/\s+/).filter(Boolean).slice(0, 8);
        const id = control.getAttribute('id');
        if (id && id.length <= 256 && control.matches('mat-select, .mat-mdc-select, .mat-select')) ids.push(id + '-panel');
        for (const panelId of ids) {
          if (panelId.length > 256) continue;
          const panel = document.getElementById(panelId);
          if (knownPanel(panel)) panels.add(panel);
        }
      }
      // aria-controls can arrive after the portal; fall back only for one owned select and one Material portal.
      if (!panels.size && expanded.size === 1) {
        const visiblePanels = [...document.querySelectorAll('.mat-mdc-select-panel, .mat-select-panel')].filter(knownPanel);
        if (visiblePanels.length === 1) panels.add(visiblePanels[0]);
      }
      function mark(element, name) {
        let names = targets.get(element);
        if (!names) targets.set(element, names = new Set());
        names.add(name);
      }
      for (const panel of panels) {
        mark(panel, 'sl-native-settings-select-panel');
        const pane = panel.closest('.cdk-overlay-pane');
        if (pane !== host.pane) mark(pane, 'sl-native-settings-select-overlay');
        for (const option of panel.querySelectorAll('mat-option, [role="option"]')) {
          mark(option, 'sl-native-settings-select-option');
        }
      }
      updatePopupClasses(targets);
    }

    function enhanceSemantics() {
      if (!hostConnected() || !shell) {
        updatePopupClasses(new Map());
        return;
      }
      for (const content of host.component.querySelectorAll('mat-dialog-content')) {
        addSemanticClass(content, 'sl-native-settings-list');
        addSemanticClass(content, 'sl-settings-rows');
        if (content.getAttribute('role') === 'dialog') setSemanticAttribute(content, 'role', null);
        if (content.hasAttribute('aria-modal')) setSemanticAttribute(content, 'aria-modal', null);
      }
      if (host.component.getAttribute('role') === 'dialog') setSemanticAttribute(host.component, 'role', null);
      if (host.component.hasAttribute('aria-modal')) setSemanticAttribute(host.component, 'aria-modal', null);
      for (const section of sections()) {
        addSemanticClass(section, 'sl-native-setting-row');
        addSemanticClass(section, 'sl-setting-row');
        const label = section.querySelector('.setting-label') || section.querySelector('.title') || section.querySelector('label');
        const description = section.querySelector('.setting-description');
        enhanceLayout(section, label, description);
        const labelId = text(label) ? semanticId(label) : null;
        const descriptionId = text(description) ? semanticId(description) : null;
        if (labelId) {
          addSemanticClass(label, 'sl-setting-label');
          setSemanticAttribute(section, 'role', 'group');
          setSemanticAttribute(section, 'aria-labelledby', labelId);
          if (!/^H[1-6]$/.test(label.tagName) && label.tagName !== 'LABEL' && !label.hasAttribute('role')) {
            setSemanticAttribute(label, 'role', 'heading');
            setSemanticAttribute(label, 'aria-level', '3');
          }
        }
        if (descriptionId) {
          addSemanticClass(description, 'sl-setting-help');
          describeControl(section, descriptionId);
        }
        for (const group of section.querySelectorAll('.button-group, .native-options')) addSemanticClass(group, 'sl-setting-control');
        for (const button of section.querySelectorAll('.button-group button, .native-options button')) {
          const role = button.getAttribute('role');
          if (role && role !== 'button' || button.hasAttribute('aria-haspopup')) continue;
          // Project Angular's selection into button semantics without adding selection handlers.
          const selected = button.getAttribute('aria-selected');
          const active = button.classList.contains('ms-button-active');
          const previousActive = chipActiveClasses.get(button);
          const nativePressed = button.getAttribute('aria-pressed');
          const externalPressed = /^(true|false)$/.test(nativePressed || '') &&
            (!chipPressedStates.has(button) || chipPressedStates.get(button) !== nativePressed);
          // Angular can change aria-selected and the active class independently.
          // Keep the projected state until either native source changes.
          const pressed = selected !== null
            ? selected === 'true' || selected !== 'false' && active
            : externalPressed ? nativePressed === 'true'
            : previousActive === undefined || previousActive !== active
              ? active : button.getAttribute('aria-pressed') === 'true';
          setSemanticAttribute(button, 'aria-pressed', String(pressed));
          if ((externalPressed || chipPressedStates.has(button) && chipPressedStates.get(button) !== nativePressed) &&
              semanticAttributes.get(button)?.has('aria-pressed')) {
            semanticAttributes.get(button).set('aria-pressed', nativePressed);
          }
          if (selected !== null) {
            setSemanticAttribute(button, 'aria-selected', null);
            // Restore the latest framework value, not a stale opening value.
            semanticAttributes.get(button).set('aria-selected', selected);
          } else if (previousActive !== undefined && previousActive !== active &&
              semanticAttributes.get(button)?.has('aria-selected')) {
            semanticAttributes.get(button).set('aria-selected', String(active));
          }
          chipActiveClasses.set(button, active);
          chipPressedStates.set(button, String(pressed));
          describeControl(button, descriptionId);
        }
        for (const control of section.querySelectorAll('[role="combobox"]')) {
          addSemanticClass(control, 'sl-setting-control');
          if (labelId && !control.getAttribute('aria-label') && !control.getAttribute('aria-labelledby')) {
            setSemanticAttribute(control, 'aria-labelledby', labelId);
          }
          describeControl(control, descriptionId);
        }
      }
      enhanceSelectPanels();
    }

    function notify(callback, value) {
      if (typeof callback !== 'function' || disposed) return;
      try { callback(value); }
      catch (error) { window.StudioLab.log?.('Native settings callback failed.', 'warn'); }
    }

    function findHost() {
      const component = document.querySelector('ms-user-settings-dialog');
      const surface = component?.closest('.mat-mdc-dialog-surface');
      const container = surface?.closest('mat-dialog-container');
      const pane = container?.closest('.cdk-overlay-pane');
      const closeButton = component?.querySelector('[mat-dialog-close]');
      if (!component?.isConnected || !surface || !container || !pane || !closeButton) return null;
      return { component, surface, container, pane, closeButton };
    }

    function hostConnected() {
      // Rebuilding shell content can temporarily detach the borrowed component.
      // Only the original CDK host's removal means the native dialog closed.
      return !!(host?.pane.isConnected && host.container.isConnected && host.surface.isConnected);
    }

    function sections() {
      if (!host) return [];
      return [...host.component.querySelectorAll('.setting-section')];
    }

    function snapshot() {
      if (!hostConnected()) return { available: false, attached: false, sections: [] };
      return {
        available: true,
        attached: !!(shell?.isConnected && shell.contains(host.component)),
        sections: sections().map((section, index) => {
          const label = text(section.querySelector('.setting-label') ||
            section.querySelector('.title') || section.querySelector('label'));
          return {
            id: section.getAttribute('data-test-id') ||
              label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section-' + index,
            label,
            description: text(section.querySelector('.setting-description'))
          };
        })
      };
    }

    function announce() {
      const current = snapshot();
      const serialized = JSON.stringify(current);
      if (serialized === lastSnapshot) return;
      lastSnapshot = serialized;
      notify(onChange, current);
    }

    function reconcile() {
      if (disposed) return;
      if (host && !hostConnected()) {
        if (!closedReported) {
          closedReported = true;
          notify(onClosed);
        }
      } else if (!host && !closedReported) {
        host = findHost();
        if (host) {
          originalParent = host.component.parentNode;
          originalNext = host.component.nextSibling;
          hadPaneClass = host.pane.classList.contains('sl-native-settings-host');
          hadComponentClass = host.component.classList.contains('sl-native-settings-component');
        }
      }
      commitAttachment();
      for (const waiter of [...waiters]) waiter.check();
      enhanceSemantics();
      announce();
    }

    function startObserver() {
      if (observerStarted || disposed) return;
      observerStarted = true;
      const observer = new MutationObserver(records => {
        if (records.every(record => record.type === 'attributes' && record.attributeName === 'class' &&
            !record.target.matches('.button-group button, .native-options button'))) return;
        if (notificationQueued || disposed) return;
        notificationQueued = true;
        Promise.resolve().then(() => {
          notificationQueued = false;
          reconcile();
        });
      });
      scope.observe(observer, document.documentElement, {
        childList: true, subtree: true, characterData: true, attributes: true,
        attributeFilter: ['aria-selected', 'aria-pressed', 'aria-expanded', 'aria-controls', 'aria-owns', 'aria-disabled', 'disabled', 'class', 'id']
      });
      reconcile();
    }

    function waitFor(predicate, deadline) {
      if (disposed) return Promise.resolve(false);
      return new Promise(resolve => {
        let complete = false;
        let cancelTimeout = () => {};
        const waiter = {
          finish(result) {
            if (complete) return;
            complete = true;
            waiters.delete(waiter);
            cancelTimeout();
            resolve(result);
          },
          check() {
            if (disposed || closedReported) return waiter.finish(false);
            if (predicate()) waiter.finish(true);
          }
        };
        waiters.add(waiter);
        cancelTimeout = scope.timeout(() => waiter.finish(false), Math.max(0, deadline - Date.now()));
        waiter.check();
      });
    }

    function menuItem() {
      return [...document.querySelectorAll('.mat-mdc-menu-panel ' + USER_SETTINGS_ITEM +
        ', .mat-mdc-menu-panel button, .mat-mdc-menu-panel a, .mat-mdc-menu-panel [role="menuitem"]')]
        .find(element => isUserSettingsItem(element) && visible(element) && !disabled(element)) || null;
    }

    async function performOpen(trigger) {
      const deadline = Date.now() + OPEN_TIMEOUT;
      startObserver();
      if (hostConnected()) return true;
      if (disposed || closedReported) return false;
      const provided = trigger ? triggerElement(trigger) : null;
      if (trigger && !provided) return false;
      let item = isUserSettingsItem(provided) ? provided : menuItem();
      if (!item) {
        const opener = provided || [...document.querySelectorAll(SETTINGS_BUTTON)]
          .find(element => visible(element) && !disabled(element) && !element.closest('.sl-overlay'));
        if (!visible(opener) || disabled(opener)) return false;
        opener.click();
        if (!(await waitFor(() => hostConnected() || !!menuItem(), deadline))) return false;
        if (hostConnected()) return true;
        item = menuItem();
      }
      if (!visible(item) || disabled(item) || disposed) return false;
      item.click();
      return await waitFor(hostConnected, deadline);
    }

    function open({ trigger } = {}) {
      if (disposed || closing || closedReported) return Promise.resolve(false);
      if (openingPromise) return openingPromise;
      opening = true;
      // The capture hook permits native handlers while opening, preventing recursive opens.
      openingPromise = performOpen(trigger).catch(() => false).finally(() => {
        opening = false;
        openingPromise = null;
      });
      return openingPromise;
    }

    function preserveFocus(nextShell, focused) {
      const initial = nextShell.querySelector('[cdkFocusInitial]');
      if (!focused || focused === initial || !nextShell.contains(focused) || typeof focused.focus !== 'function') return;
      let cancelled = false;
      const cleanups = [];
      function finish() {
        if (cancelled) return;
        cancelled = true;
        for (const cancel of cleanups) cancel();
      }
      function restore() {
        if (cancelled || disposed || closing || shell !== nextShell || !hostConnected() ||
            !focused.isConnected || !nextShell.contains(focused) || disabled(focused) || focused.closest('[inert]')) return;
        const current = document.activeElement;
        // Moving a focused element can blur it; CDK's delayed autofocus can
        // then choose the initial heading. A later user interaction wins.
        if (!current || current === document.body || current === document.documentElement || current === initial) {
          focused.focus({ preventScroll: true });
          if (focused.tagName === 'IFRAME' && document.activeElement === focused) {
            // Ask the trusted frame to restore its private focus state without reading its document or account data.
            notify(onRestoreFrameFocus, focused);
          }
        }
      }
      cleanups.push(scope.listen(document, 'pointerdown', finish, { capture: true }));
      cleanups.push(scope.listen(document, 'keydown', finish, { capture: true }));
      restore();
      cleanups.push(scope.timeout(restore, 20));
      cleanups.push(scope.timeout(restore, 300));
      cleanups.push(scope.timeout(finish, 350));
    }

    function tryAtomicMove(parent, node, before = null) {
      if (typeof parent.moveBefore === 'function' && parent.isConnected && node.isConnected &&
          parent.ownerDocument === node.ownerDocument) {
        try {
          // Atomic moves preserve the open Market iframe, draft, focus, and native control state.
          parent.moveBefore(node, before);
          return true;
        } catch (_) { /* Keep a connected private frame in its existing parent. */ }
      }
      return false;
    }

    function moveNode(parent, node, before = null) {
      if (tryAtomicMove(parent, node, before)) return;
      parent.insertBefore(node, before);
    }

    function parkNativeHost() {
      // Reparenting reloads private iframes on pre-133 Chromium; hide only this dialog's empty host and focus anchors.
      // Angular retains its view, and separately mounted select portals stay live.
      addSemanticClass(host.pane, 'sl-native-settings-parked');
      setSemanticAttribute(host.pane, 'hidden', '');
      setSemanticAttribute(host.pane, 'inert', '');
      const wrapper = host.pane.closest('.cdk-global-overlay-wrapper') || host.pane;
      const siblings = [...(wrapper.parentElement?.children || [])];
      const backdrop = siblings[siblings.indexOf(wrapper) - 1];
      // CDK's backdrop precedes its wrapper or pane; leave other dialog and select backdrops alone.
      if (backdrop?.matches('.cdk-overlay-backdrop')) {
        addSemanticClass(backdrop, 'sl-native-settings-parked');
        setSemanticAttribute(backdrop, 'hidden', '');
        setSemanticAttribute(backdrop, 'inert', '');
      }
    }

    function commitAttachment() {
      if (previewActive) return false;
      const nextShell = requestedShell;
      const slot = requestedSlot;
      if (disposed || closing || closedReported || !hostConnected() || !nextShell?.contains(slot) ||
          host.component.contains(slot) || host.component.contains(nextShell) ||
          nextShell.contains(host.surface) || slot === host.surface) return false;
      if (shell === nextShell && host.component.parentNode === slot &&
          (stationaryShell || nextShell.parentNode === host.surface)) return true;
      const oldShell = shell;
      const focused = nextShell.contains(document.activeElement) ? document.activeElement : null;
      moveNode(slot, host.component);
      host.pane.classList.add('sl-native-settings-host');
      host.component.classList.add('sl-native-settings-component');
      stationaryShell = false;
      if (nextShell.parentNode !== host.surface) {
        if (nextShell.isConnected) stationaryShell = !tryAtomicMove(host.surface, nextShell);
        else moveNode(host.surface, nextShell);
      }
      if (stationaryShell) {
        addSemanticClass(nextShell, 'sl-native-settings-stationary');
        parkNativeHost();
      }
      shell = nextShell;
      borrowedSlot = slot;
      // CDK can hide the foreground shell as a body sibling while opening its dialog.
      setSemanticAttribute(nextShell, 'aria-hidden', null);
      const shellDialog = nextShell.querySelector('.sl-dialog');
      if (!stationaryShell && shellDialog) {
        if (!containerAttributes) containerAttributes = readAttributes(host.container, ['aria-label', 'aria-labelledby']);
        host.container.setAttribute('aria-label', 'Google AI Studio and Studio.lab Settings');
        host.container.removeAttribute('aria-labelledby');
        if (!shellDialogAttributes.has(shellDialog)) {
          shellDialogAttributes.set(shellDialog, readAttributes(shellDialog, ['role', 'aria-modal', 'aria-label', 'aria-labelledby']));
        }
        shellDialog.removeAttribute('role');
        shellDialog.removeAttribute('aria-modal');
        shellDialog.removeAttribute('aria-label');
        shellDialog.removeAttribute('aria-labelledby');
      }
      if (oldShell && oldShell !== shell && oldShell.parentNode === host.surface) oldShell.remove();
      enhanceSemantics();
      preserveFocus(nextShell, focused);
      return true;
    }

    function attach(nextShell, slot) {
      if (disposed || closing || closedReported || !slot?.appendChild || !nextShell?.contains(slot)) return false;
      if (host && (host.component.contains(slot) || host.component.contains(nextShell) ||
          nextShell.contains(host.surface) || slot === host.surface)) return false;
      // The observer commits when Angular's asynchronous CDK host arrives.
      // Disposal prevents a late response from reviving a closed shell.
      requestedShell = nextShell;
      requestedSlot = slot;
      startObserver();
      reconcile();
      return !!(shell === nextShell && hostConnected() && host.component.parentNode === slot);
    }

    function filter(query = '') {
      const normalized = String(query).trim().toLocaleLowerCase().slice(0, 256);
      let count = 0;
      for (const section of sections()) {
        if (!originalHidden.has(section)) originalHidden.set(section, section.hidden);
        const matches = !normalized || text(section, 6000).toLocaleLowerCase().includes(normalized);
        const hidden = originalHidden.get(section) || !matches;
        if (section.hidden !== hidden) section.hidden = hidden;
        if (!hidden) count++;
      }
      return count;
    }

    function close() {
      if (disposed || closing || !hostConnected() || !host.closeButton.isConnected ||
          disabled(host.closeButton)) return false;
      closing = true;
      host.closeButton.click();
      return true;
    }

    function dispose() {
      if (disposed) return;
      disposed = true;
      for (const waiter of [...waiters]) waiter.finish(false);
      scope.dispose();
      updatePopupClasses(new Map());
      for (const [section, hidden] of originalHidden) section.hidden = hidden;
      originalHidden.clear();
      if (host) {
        if (!hadPaneClass) host.pane.classList.remove('sl-native-settings-host');
        if (!hadComponentClass) host.component.classList.remove('sl-native-settings-component');
        const componentParent = host.component.parentNode;
        const stillOwned = !componentParent || componentParent === originalParent ||
          componentParent === borrowedSlot || shell?.contains(host.component);
        // A rebuild can disconnect the slot before disposal; restore the view only while we still own it.
        if (stillOwned && host.surface.isConnected && originalParent?.isConnected) {
          moveNode(originalParent, host.component,
            originalNext?.parentNode === originalParent ? originalNext : null);
        }
        if (containerAttributes) restoreAttributes(host.container, containerAttributes);
        if (shell?.parentNode === host.surface) shell.remove();
      }
      for (const [dialog, attributes] of shellDialogAttributes) restoreAttributes(dialog, attributes);
      shellDialogAttributes.clear();
      for (const [element, attributes] of semanticAttributes) {
        // A framework update may arrive just before teardown's observer turn.
        const selected = element.getAttribute('aria-selected');
        const pressed = element.getAttribute('aria-pressed');
        if (attributes.has('aria-pressed') && chipPressedStates.has(element) &&
            chipPressedStates.get(element) !== pressed) attributes.set('aria-pressed', pressed);
        if (attributes.has('aria-selected')) {
          if (selected !== null) attributes.set('aria-selected', selected);
          else if (chipActiveClasses.has(element) &&
              chipActiveClasses.get(element) !== element.classList.contains('ms-button-active')) {
            attributes.set('aria-selected', String(element.classList.contains('ms-button-active')));
          }
        }
        restoreAttributes(element, attributes);
      }
      semanticAttributes.clear();
      for (const [element, classes] of semanticClasses) for (const name of classes) element.classList.remove(name);
      semanticClasses.clear();
      shell = null;
      borrowedSlot = null;
      requestedShell = null;
      requestedSlot = null;
      stationaryShell = false;
      host = null;
    }

    return Object.freeze({
      open, isOpening: () => opening,
      setPreviewActive(value) { previewActive = value === true; if (!previewActive) reconcile(); },
      getHost: () => hostConnected() ? host : null,
      usesNativeFocusTrap: () => !!(hostConnected() && !stationaryShell && shell?.parentNode === host.surface),
      getOverlayRoot: () => hostConnected() ? host.pane.closest('.cdk-overlay-container') : null,
      attach, snapshot, filter, close, dispose
    });
  }

  window.StudioLab.NativeSettings = Object.freeze({ createAdapter, isSettingsTrigger });
})();
