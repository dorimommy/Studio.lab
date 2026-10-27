(function () {
  'use strict';

  if (!window.StudioLab || typeof window.StudioLab.registerModule !== 'function') return;
  let ctxRef = null;

  window.StudioLab.registerModule({
    id: 'initial-chat-render',
    group: 'chat-loading',
    order: 0,
    title: 'Fast chat opening',
    subtitle: 'Load long chats progressively',
    icon: 'speed',
    stateKey: 'initialChatRenderEnabled',
    defaults: { initialChatRenderEnabled: true },
    details: [
      { icon: 'speed', text: 'Shows the latest 20 messages first and loads earlier messages in batches as you scroll up or use history controls.' },
      { icon: 'edit', text: 'Keeps the complete conversation available for model context, editing, and saving.' }
    ],
    init(ctx) {
      ctxRef = ctx;
      sync();
    },
    onStateChange: sync,
    dispose() {
      ctxRef = null;
      publish(false, false);
    }
  });

  function sync() {
    if (ctxRef) publish(ctxRef.state.initialChatRenderEnabled !== false, true);
  }

  function publish(enabled, persist) {
    window.dispatchEvent(new CustomEvent('__sl_initialChatRenderToggle', { detail: { enabled, persist } }));
  }
})();
