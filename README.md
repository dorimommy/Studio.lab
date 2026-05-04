# Studio.lab — Better AI Studio

A browser extension that fixes the two biggest pain points in Google AI Studio: content filter interruptions that silently discard generated text, and progressive UI collapse that makes long sessions unusable.

> Unofficial. Not affiliated with Google.

---

## Installation

1. Download or clone this repository.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer Mode**.
4. Click **Load unpacked** → select the repository folder.
5. Go to [aistudio.google.com](https://aistudio.google.com) — the Studio.lab card appears in the right sidebar below System Instructions.

No build step. No dependencies.

---

## Content Bypass

When Google's backend content filter triggers, AI Studio calls `xhr.abort()` on the active stream and throws away whatever the model already generated — replacing it with a red "Content Blocked" banner. The text existed. It traveled to your browser. The client deleted it.

Studio.lab patches the XHR layer before Angular loads, so it intercepts the raw response before the framework ever sees it.

**Intercept mode (recommended).** Rewrites the `finishReason` field in real time as the SSE stream comes in — violation code `8` becomes normal stop code `1`. Angular concludes the model finished naturally and renders the full output. Abort suppression runs alongside: `xhr.abort()` is replaced with a no-op on each generation request, keeping the stream alive through the full response. No flicker, no banner, no data loss.

**Restore mode (legacy).** A MutationObserver watches for the blocked-state DOM structure and reverses it after the fact by simulating Edit → Paste → Save. Less elegant — you'll see the block render briefly before it's replaced — but works as a fallback.

**Important:** Studio.lab recovers text the server generated but the client discarded. It can't recover text the server never produced. If generation stopped at token 400, you get 400 tokens. For complete outputs, send "continue" and stitch the parts manually.

---

## Chat Optimizer

AI Studio doesn't virtualize its conversation list. Every turn — rendered markdown, code blocks, components, listeners — stays fully alive in the DOM forever. Past 60–80 turns this becomes a real problem: stuttering scroll, laggy input, ballooning memory.

**Buffered mode.** Detaches old turns from the DOM when they leave the viewport, reattaches them instantly when you scroll back. The conversation history stays intact; only the rendering overhead disappears.

**Physical mode.** Permanently removes old turns. Maximum performance for very long sessions where you don't need to scroll back. Not reversible within the session.

Both modes support an **Auto-Limit** — set a turn threshold and the optimizer enforces it automatically as the chat grows.

---

## Everything Else

**Settings panel** injects natively into the AI Studio sidebar and persists all state across navigations and browser restarts.

**Scroll to Bottom button** anchors to the prompt input box, auto-detects the active scroll container, and only appears when you're actually scrolled away from the bottom.

---

## Privacy

No data leaves your browser. No analytics, no telemetry, no external requests. The only permission declared is `storage`, used exclusively for saving your settings locally. The source is fully open and unobfuscated.

---

## Support

[**Monobank Jar**](https://send.monobank.ua/jar/ARDckyv3B4) — if Studio.lab saves your workflow from the content blocked grind.
