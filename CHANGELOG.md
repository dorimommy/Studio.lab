# Studio.lab Changelog

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
