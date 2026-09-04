# Studio.lab Changelog

## v2.0-preview-2
**Modern Web Chat Fix & Native Sidebar Card UI Overhaul**
* **Fixed:** `Modern web chat` module.
  * *Layout & Button Visibility:* Adapted to Google's layout shift where `ms-add-media-button` was moved inside `.button-row-left`. Flattened button containers using `display: contents` so the `+` button is always crisp, visible, and placed on the far left.
  * *Bottom Bar Cleanup:* Selectively hides `ms-paid-api-key-button` and `ms-prompt-box-tools > button` from the bottom row while keeping them neatly proxied inside the `+` menu.
  * *Standardized Order:* Strict Flexbox ordering: `+` (order -2), `Text Formatter` (order -1), `Enabled Tools` (order 0), `Mic` (order 2, margin-left: auto), and `Run` (order 3).
  * *Trusted Types (CSP) Compliance:* Converted dynamic menu item injections from `innerHTML` to safe native DOM methods (`createElement`, `textContent`), preventing TrustedHTML CSP exceptions.
* **Redesigned:** Studio.lab Settings Sidebar Card (`.sl-sidebar-btn`).
  * *Native Design System Match:* Fully matched the aesthetics of Google's native `system-instructions-card` and `model-selector-card`.
  * *Elevated Surface & Shadows:* Replaced legacy `#252525` background and `#262626` outline border with Google's native `var(--color-v3-surface-container)` (`#1f1f1f`), native borderless style, and elevation shadow variables (`var(--v3-shadow-card)` and `var(--v3-shadow-card-hover)`).
  * *Spacing & Hierarchy:* Standardized spacing between cards (8px) and matched internal typography: direct `.title` with 8px bottom margin and `.subtitle` with matching line-height and color.
* **Refactored:** Codebase Cleansing.
  * *Safe DOM Insertion:* Replaced `innerHTML` in sidebar button creation with native DOM elements.
  * *Selector Hardening:* Replaced brittle component hash selectors in `ui-cleaner.js` with pattern-matching selectors.
  * *Dead Code Removal:* Purged obsolete benefit/tier spoofing checks (dev build related code) in `interceptor.js` and unused interval IDs in `optimizer-hard.js`.

## v2.0-preview-1
**New Feature: Text Formatter & Minor UI Fixes**
* **Added:** `Text Formatter` module. A rich markdown formatting suite for prompt editing.
  * *Formatting Toolbar:* Full inline and floating toolbars with quick action buttons for Bold, Italic, Strikethrough, Headings (H1-H3), Lists (Unordered, Ordered, Task), Blockquotes, Code blocks, and Link insertion.
  * *Smart Hotkeys & Auto-Lists:* Hotkeys (`Ctrl+B`, `Ctrl+I`, `Ctrl+Shift+X`, `Ctrl+K`) and list continuation on Enter/Tab.
* **Fixed:** `Modern web chat` module.
  * *Layout & Alignment:* Standardized bottom button spacing (8px gap) across `+`, `A`, `Grounding`, `Mic`, and `Run` buttons for a clean, symmetrical footer.
* **Fixed:** `Scroll button` elevation.
  * *Elevation & Visibility:* Lifted the scroll-to-bottom button above the native footer gradient overlay (`ms-chat-bottom-overlay`), ensuring it remains crisp, un-darkened, and fully interactive.

## v1.7-release
**Two New Modules Added**
* **Added:** `Default Profile` module. A highly requested feature that completely automates your workspace initialization.
  * *Environment Auto-Apply:* Seamlessly auto-applies your preferred Model, System Instructions, and Toolset immediately upon opening a new chat.
  * *Native Library Integration:* Securely reads your saved System Instructions directly from Google's native storage, accurately displaying your custom Instruction Titles in the interface.
* **Added:** `UI Cleaner` module. A dedicated toggle to remove unnecessary interface elements, including quota limit banners, hallucination disclaimers, feedback buttons, and inline code suggestions.

## v1.6-release
**Settings UI Overhaul & UX Polish**
* **Redesigned:** Settings Menu Tabs. Completely restructured the settings modal into logical categories (`Injection`, `Tweaks`, `Modules`, `Info`), making it much easier to distinguish between core network interceptors, minor UI enhancements, and major features.
* **Redesigned:** Info Tab. The "About" section was rebuilt from the ground up using a modern, card-based layout that perfectly matches the native Google AI Studio aesthetics. It now clearly presents active modules, privacy details (local storage, zero telemetry), and structured community links.
* **Enhanced:** Visual Polish & Accessibility. Fixed low-contrast text issues by strictly adopting native CSS color variables (`--color-v3-text`). Removed unnecessary and cluttered badges ("New", "Recommended") from the module list.
* **Fixed:** Module Selection States. Action-oriented modules (like Chat Export) now correctly highlight the entire card component uniformly, with fully responsive, edge-to-edge action buttons.
* **Changed:** The version number displayed in the UI is now dynamically fetched directly from `manifest.json`, eliminating hardcoded values and ensuring it's always accurate.

## v1.5-release
**Major Refactoring & Stability Update**
* **Added:** Centralized DOM Selectors Map (`window.StudioLab.SELECTORS`). All DOM querying is now abstracted into a single configuration, significantly improving resilience against Google UI changes.
* **Added:** Fail-safe Module Architecture. All module lifecycle hooks (`init`, `onStateChange`, `onRouteChange`) are now wrapped in strict error boundaries. A crash in one specific module no longer cascades; the core extension remains fully functional.
* **Added:** Health Check Mechanism. The extension monitors DOM readiness on load. If critical UI elements fail to appear within 10 seconds (e.g., due to an undocumented UI update by Google), a fallback toast notification alerts the user.
* **Enhanced:** Advanced Telemetry & API Interceptor. The telemetry blocker was heavily expanded. Beyond Manifest V3 declarative rules, `fetch` and `XMLHttpRequest` are dynamically intercepted in the `MAIN` world to deeply inspect payloads, log blocked requests to the console, and dynamically spoof `BenefitTier` and `UserRestrictions` directly within the network layer.
* **Changed:** Scrolling Optimization. Completely refactored `scroll-bottom.js`. Replaced expensive `setInterval` and `MutationObserver` polling loops with a highly efficient `ResizeObserver` tied strictly to the content container. This drastically reduces CPU footprint and battery drain during lengthy text generations.
* **Removed:** Codebase Cleansing. Completely purged the legacy `bypass-old.js` content blocking mechanism and its associated state logic from the registry.

## v1.2-release
* **Added:** Telemetry blocker (Blocks tracking using Manifest V3 declarativeNetRequest rules).

## v1-release
*Bug fix? Maybe.*
* **Added:** Chat export feature.
* **Added:** Modern web chat feature (still in development).

## v0.4-beta
* Merged branch 'main' of the repository.

## v0.1-beta
* Initial pre-release.
