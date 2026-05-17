# Studio.lab

An unofficial performance optimizer and content bypass extension for Google AI Studio. 

Google AI Studio currently suffers from two significant architectural limitations during extended usage: 
1) Aggressive client-side content filters that discard already-generated text via `xhr.abort()`.
2) Lack of DOM virtualization, leading to severe memory leaks and UI latency as conversation threads grow.

Studio.lab resolves these issues by intercepting network requests before framework initialization and implementing custom memory management routines, transforming the platform into a stable environment for long-context workflows.

## Core Features

### 1. Content Filter Bypass
When the native backend flags a response, the client executes an abort signal, replacing the output with a warning and permanently deleting the received payload.
*   **Network-Level Interception (Default):** Hooks into the `XMLHttpRequest` prototype in the `MAIN` execution world before Angular loads. It suppresses the `abort()` call and sanitizes the Server-Sent Events (SSE) stream in real-time, modifying violation codes to standard completion flags. The framework renders the output naturally without UI flicker.
*   **DOM Restoration (Fallback):** A `MutationObserver` monitors the DOM for blocked states and restores the captured raw markdown payload via simulated native UI input events.

### 2. Memory & DOM Optimization
Native AI Studio retains all historical chat nodes (markdown, code blocks, listeners) in active memory, causing rapid performance degradation.
*   **Buffered Mode (Smart):** Implements pseudo-virtualization. It continuously detaches off-screen conversational nodes from the DOM while maintaining their state in isolated memory. Nodes are seamlessly reattached upon upward scroll triggers.
*   **Physical Mode (Hard):** Enforces a strict numerical limit on rendered turns. Exceeding the threshold triggers permanent deletion of older nodes from the session memory. 
*   Both modes support automated threshold enforcement to prevent manual intervention during generation.

### 3. Interface Modules
*   **Improved Media View:** Replaces the default attachment layout with a scoped, native-parity CSS grid and introduces a full-screen media viewer with proper layering and interaction.
*   **Real-time Analytics:** Injects non-blocking character and word counters directly into rendered turns via localized mutation observers.
*   **Workspace Decluttering:** Automatically suppresses intrusive promotional elements, such as "Upgrade" and "Quota Exceeded" banners.
*   **Contextual Navigation:** Implements a dynamic scroll-to-bottom utility that monitors container offsets and generation states, appearing only when required.

## System Architecture

The extension operates without build tools or external dependencies. It relies on a decoupled architecture where a core shell orchestrates isolated feature modules.

├── manifest.json
├── background.js
├── interceptor.js
├── content.js
├── sl-panel.css
└── modules/
    ├── registry.js
    └── [feature-modules].js

*   **`interceptor.js`**: Operates in the `MAIN` world context. Injected at `document_start` to ensure `XMLHttpRequest` is patched before the host application initializes. Communicates with the isolated world via `CustomEvent`.
*   **`content.js`**: Operates in the `ISOLATED` world. Functions as the primary controller. It handles state persistence (`chrome.storage.local`), injects the native-styled control panel into the host sidebar, and triggers the module lifecycle.
*   **`sl-panel.css`**: Contains CSS variable mappings and structural classes designed to perfectly match the host application's native design system.
*   **`modules/`**: Contains self-contained, domain-specific logic. Each file evaluates independently and registers a configuration object (ID, UI descriptors, lifecycle hooks like `init` and `onStateChange`) with the central `registry.js`.

## Installation

1. Clone or download the source code of this repository.
2. Open your Chromium-based browser and navigate to `chrome://extensions` (or `edge://extensions`).
3. Toggle **Developer mode** in the top right corner.
4. Click **Load unpacked** and select the extracted project directory.
5. Navigate to or refresh `aistudio.google.com`. The Studio.lab configuration panel will be accessible in the right sidebar below the System Instructions module.

## Privacy and Security

Studio.lab is built with strict adherence to local-only execution:
*   Zero external dependencies, trackers, or analytics.
*   Zero outbound network requests.
*   State is maintained exclusively via local browser storage.
*   The source code is provided completely unobfuscated for comprehensive security auditing.

## Support

[![Support Studio.lab](images/Banner.png)](https://ko-fi.com/astierdoriana)

If this extension ensures your workflow continuity and mitigates data loss, consider supporting the development through Ko-Fi. 

---
Disclaimer: Studio.lab is an unofficial modification. It is not affiliated with, endorsed by, or connected to Google LLC or Google AI Studio.
