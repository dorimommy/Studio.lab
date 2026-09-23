# Studio.lab Changelog

## v2.0-preview-4-hotfix-5
**Universal Native "Edit Title" Launch Across Mobile & Desktop, Halved Chat Bottom Spacing & Clean Token Tooltip Teardown**

`Modern Web Chat` & `Network & Interceptors Layer` (`interceptor.js`).
* **Fixed:** `Universal Native "Edit Title" Dialog Trigger (Mobile & Desktop)`.
  * *Mobile Root Cause Resolved:* Diagnosed why "Edit title" worked on PC but failed on mobile viewports: Google AI Studio's `ms-header` `ResizeObserver` evaluates `pNe(this, width)` and sets Angular signal `Ffa` to `false` on screens $\le 710\text{px}$, completely unmounting template 11 (`.title-tokencount-container`) and its native rename button from the DOM.
  * *Transparent Header Action Mounting Shim:* In `interceptor.js`, introduced non-intrusive `Element.prototype.getBoundingClientRect` and `window.ResizeObserver` shims scoped strictly to `MS-HEADER` reporting `width >= 1024`, keeping GAIS's native prompt title and rename triggers mounted in the DOM across all screen sizes while Modern Web Chat CSS keeps them visually hidden (`display: none !important; opacity: 0; width: 0; height: 0;`).
  * *Signal Fallback & Bridge:* Added `DynamicStudioAPI.openEditPromptTitleDialog()` and `__sl_openEditPromptTitle` event bridge. In the 3-dot overflow menu, tapping "Edit title" clicks the native button or signals the main world to ensure Angular signal `Ffa` is active, reliably opening native `<ms-save-prompt-dialog>` on all devices.
  * *Dialog Backdrop Race Condition Fix:* Replaced blanket backdrop closures with targeted `.mat-mdc-menu-backdrop` dismissal, preventing in-flight rename dialogs from being accidentally dismissed during mounting.

`Modern Web Chat` module (`modules/modern-web-chat.css`).
* **Fixed:** `Chat Session Bottom Spacing Halved`.
  * *Optimal Message Safe-Area:* Cut excessive empty whitespace below the conversation by half across all responsive breakpoints:
    * Desktop `.chat-session-content` bottom padding reduced from `240px` to `120px`.
    * Tablet and mobile viewports ($\le 1024\text{px}$ and $\le 768\text{px}$) reduced from `200px` to `100px`.
    * Eliminates awkward visual gaps while maintaining comfortable clearance above the floating prompt input container.

`Modern Web Chat` module (`modules/modern-web-chat.js`).
* **Fixed:** `Token Counter Floating Tooltip Overlay Cleanup`.
  * *Accurate Backdrop Dismissal:* Updated `updateSidebarTokens()` to specifically click the token tooltip backdrop (`.cdk-overlay-pane:has(.token-count-tooltip) ~ .cdk-overlay-backdrop`).
  * *Complete Teardown on UI Toggle:* Added explicit cleanup in `cleanup()` to query and remove any orphaned `.token-count-tooltip` containers and backdrops when switching from Modern Web Chat back to the default AI Studio layout.

## v2.0-preview-4-hotfix-4
**Dynamic Featured Model Discovery & Native Picker Sync, Zero-Flash Silent Updates & Repository Hygiene**

`Modern Web Chat` module.
* **Fixed:** `Elimination of Hardcoded "Gemini 2.5 Flash" Fallbacks`.
  * *Clean Model Labeling:* Completely removed deprecated, speculative `gemini-2.5-flash` and `gemini-2.5-pro` fallbacks. Header button and selector labels now authoritatively display the active model from native DOM / URL query params (`?model=...`) or cleanly fall back to `"Select model"`.
* **Added:** `Dynamic Featured Model Synchronization`.
  * *Live GAIS Featured Sync:* Implemented `refreshFeaturedModels()` which dynamically reads the 3 live featured models directly from the native Google AI Studio model dialog's "Featured" category (`button[data-test-category-button]`), keeping choices up-to-date with Google's latest releases.
  * *Zero-Flash Stealth Sync:* Introduced `.sl-syncing-model-picker` CSS safeguards rendering the native dialog completely transparent and non-interactive (`opacity: 0 !important; visibility: hidden !important; pointer-events: none !important;`) during background query and model selection, eliminating screen flash.
  * *Native Model Selection:* Updated `selectNativeModel()` to natively click the model's button inside Google AI Studio's DOM, ensuring Angular 19 writable signals and internal state update seamlessly without synthetic overrides.

`Repository & Build Configuration`.
* **Cleaned:** `Dev Folder Exclusion in .gitignore`.
  * *Clean Repository Scope:* Restored `/Dev/` exclusion in `.gitignore`, keeping internal test suites, development tools, and snapshots safely isolated locally without polluting release branches.

## v2.0-preview-4-hotfix-3
**Draft Crash Protection Production Contract, Strict Fetch Override, User Bubble Typography & Architecture Hardening**

`Network & Interceptors Layer` (`interceptor.js`).
* **Fixed:** `Draft Crash Protection Production Event Contract`.
  * *Structured Event Metadata:* Structured `__sl_requestPayload` to emit `{ version: 1, requestId, route, ts, body }`, fully satisfying `draft-saver.js:129`.
  * *Guaranteed Completion Signals:* Dispatched matching `__sl_requestFinished` events on `loadend` for XHR and within `window.fetch` (passing `ok: res.ok` or `ok: false` on error), ensuring unsent drafts are properly cleared upon prompt generation and never erroneously restored.
* **Fixed:** `Strict-Mode Fetch Model Override URL Forwarding`.
  * *Argument Detachment Fix:* Replaced `_origFetch.apply(this, arguments)` with direct array forwarding (`[input, init]`), resolving JavaScript strict-mode parameter detachment so rewritten URLs and Request objects are actually dispatched.
  * *Immutable Option Passing:* Avoided mutating caller-owned options by cloning `init` (`init = { ...init, body }`) when rewriting request bodies.
* **Fixed:** `Angular 19 LView Map Memory Leak Prevention`.
  * *Bounded Cache & Cleanup:* Capped `_candidateLViewMaps` to 64 entries and introduced `stopMapCapture()`, restoring native `Map.prototype.set` and clearing candidate map references as soon as the Angular context is identified or after a 15-second safety timeout.

`Modern Web Chat` module.
* **Fixed:** `Global Capture-Listener Lifecycle & Panel Close (X) Isolation`.
  * *Module Active Guard:* Added `if (!isEnabled()) return;` at the top of `_slGlobalDrawerHandler` so it never intercepts clicks or suppresses native events when Modern Web Chat is disabled.
  * *Clean Listener Teardown:* Encapsulated capture handlers in `attachGlobalHandlers()` and `detachGlobalHandlers()`, registering them only while the module is active and cleanly removing them during `cleanup()` and `dispose()`.
  * *Non-Destructive Native Button Hiding:* Replaced destructive `b.remove()` with `hideNativeButton()`, preserving Angular's internal DOM references and restoring original display values on module teardown.
* **Fixed:** `User Bubble Markdown Typography & Paragraph Margins`.
  * *Paragraph Spacing Restored:* Removed destructive `margin: 0 !important; padding: 0 !important;` rules on user turn paragraphs. Added `margin: 0 0 0.75em !important; line-height: 1.55 !important;` with zero bottom margin on the final paragraph child, completely eliminating glued text.
  * *Full Markdown Styling:* Added rich typography inside `.chat-turn-container.user ms-prompt-chunk`:
    * Styled bullet and numbered lists (`ul`, `ol`, `li`) with `disc` and `decimal` markers and `22px` left padding.
    * Scaled headings (`h1`–`h4`) with `font-weight: 650` and proportional sizing.
    * Monospace inline code (`code`) with translucent dark background, and framed code blocks (`pre`) with horizontal scrolling.
    * Blockquotes (`blockquote`) with `#8ab4f8` accent border and italic text, bold/italic contrast, and horizontal dividers (`hr`).

`Core SPA Lifecycle & Telemetry Module`.
* **Fixed:** `SPA Route Lifecycle Contract (content.js)`.
  * *Current & Previous Route Keys:* Updated `readRoute()` and `notifyRouteChange()` to pass `(ctx, currentRoute, previousRoute)` on `onRouteChange` and emit them in `__sl_routeChanged` events, fulfilling module expectations.
* **Fixed:** `Telemetry Blocker Console Noise Reduction`.
  * *Filtered Logging:* Removed blanket logging of non-telemetry network requests in `modules/telemetry-blocker.js`, retaining only verified blocked tracking notices.

`Chat Export` module.
* **Fixed:** `Dual Payload Format Compatibility`.
  * *Resilient Parsing:* Enhanced `__sl_requestPayload` listener to seamlessly parse both structured metadata objects (`e.detail.body`) and legacy raw JSON strings.

## v2.0-preview-4-hotfix-2
**Mobile Viewport Overhaul, Mutual Drawer Closing, Clean Header Hierarchy & Robust UX Alignment**

`Modern Web Chat` module.
* **Fixed:** `Header Layout & Element Sequence`.
  * *Clean Control Hierarchy:* Restructured `.toolbar-left` so the navigation menu drawer toggle `[☰]` is always first, followed immediately by the overflow menu `[⋮]`.
  * *Absolute New Chat Button Removal:* Completely eliminated the redundant `+` (New chat) button across both desktop and mobile viewports, purging rogue CSS rules that unintentionally styled it as a rectangular button and ensuring Angular cannot re-inject it.
  * *Responsive Thinking Level Placement:* Moved thinking level selector into the right panel on mobile viewports ($\le 768\text{px}$) matching native Google AI Studio behavior, preventing toolbar crowding while keeping it in the desktop header where space is abundant.
* **Fixed:** `Mutual Drawer Closing & Phantom Overlay Cleanup`.
  * *Mutual Drawer Toggling:* Opening the right settings drawer automatically closes the left navigation menu, and triggering the left navigation menu immediately closes the right drawer, eliminating confusing drawer overlaps on mobile.
  * *Lingering Dimming Overlay Dismissal:* Eliminated stuck `.sidebar-overlay` and orphaned `.cdk-overlay-backdrop` elements after closing drawers or the "More models..." dialog, allowing instant scrolling without requiring clicks on empty space.
* **Fixed:** `Single Styled "Share prompt" in Overflow Menu`.
  * *Native Share Item Hidden:* Corrected ligature-based CSS and JS filtering to hide the unstyled native "Share" item on both empty and active chats, displaying only the styled "Share prompt" action.
* **Fixed:** `Turn Textarea Edit Slicing & Scroll Trapping`.
  * *Ascender Protection:* Added dedicated top padding (`padding: 6px 0 12px 0`) to user and model turn edit textareas, preventing the tops of capital letters from being horizontally sliced off under the rounded container border.
  * *Native-Feel Smooth Scrolling:* Moved `overflow-y: auto` directly onto the textarea with thin scrollbar styling, setting `overflow: visible` and `max-height: none` on `ms-autosize-textarea` to prevent scroll traps.
* **Fixed:** `Prompt Box & Content Spacing Alignment`.
  * *Desktop Safe Area Clearance:* Reduced desktop chat content top padding from `68px` to `48px`, bringing content closer to the floating header and eliminating excessive dead space.
  * *Pixel-Perfect 16px Edge Margins:* Eliminated native `12px` horizontal margins on `ms-prompt-box .prompt-box-container`, aligning the prompt box edge-to-edge with the header's 16px clearance.
* **Fixed:** `Right Sidebar Animation & Close (X) Ghost-Click Loop`.
  * *Smooth Slide-Out Animation:* Replaced abrupt `display: none` toggles with hardware-accelerated `transform: translateX(100%)` transitions (`0.22s cubic-bezier(0.4, 0, 0.2, 1)`), smoothly matching the left navigation drawer.
  * *Ghost Re-Open Prevention:* Scoped close button interception strictly to `ms-right-side-panel` and added timestamp debouncing (`_slLastDrawerCloseTime`) on `.sl-header-settings-btn.onclick` to prevent pointer release events from immediately re-triggering the drawer.
  * *Native Dialog Close Buttons Restored:* Removed global `button[aria-label="close" i]` capture listeners, ensuring native Google AI Studio modals (Camera, Paid API key, Drive picker) close without interference.

`Smart Optimizer` module.
* **Fixed:** `Restore Button Squircle Styling & Compact Spacing`.
  * *Header-Matched Squircle Buttons:* Styled `.sl-load-banner button` with frosted-glass squircle aesthetics (`border-radius: 12px`, `height: 32px`, `background: rgba(40, 40, 42, 0.45)`, `backdrop-filter: blur(20px)`), perfectly harmonizing with header buttons.
  * *Compact Banner Padding:* Reduced banner padding to `4px 0 12px 0`, eliminating awkward gaps above the chat conversation.

`Core Architecture & Styling Engine`.
* **Fixed:** `Sidebar Z-Index Hierarchy (Modern Web Chat Disabled)`.
  * *Stacking Context Fix:* In `sl-panel.css`, eliminated forced high `z-index` (10, 11) on `footer` and `ms-prompt-box`. Assigned `z-index: 1000 !important` to mobile sliding drawers (`.v3-left-nav`, `ms-navbar-v2`, `ms-right-side-panel`, `mat-sidenav`), ensuring sidebars never render underneath the prompt box on mobile when Modern Web Chat is toggled off.
* **Added:** `__sl_setTool Direct Signal Listener`.
  * *Instant Tool Synchronization:* In `interceptor.js`, added listener for `__sl_setTool` delegating directly to `DynamicStudioAPI.setTool(name, enabled)` for zero-latency tool manipulation in the main world.

`Text Formatter` module.
* **Added:** `Mobile Combined Heading Dropdown (H ▾)`.
  * *Compact Space-Saving Control:* On viewports $\le 768\text{px}$, individual `H1`, `H2`, `H3` buttons are condensed into a single `H ▾` dropdown button, saving over 60px of toolbar width and preventing awkward line wraps on mobile.

## v2.0-preview-4-hotfix-1
**Smart Optimizer Immediate Chat Entry & Selective Turn Navigator Restoration**

`Optimizer (Smart / Buffered)` module.
* **Fixed:** `Immediate Optimizer Application upon Chat Entry`.
  * *Fast-Track Initial Entry:* Introduced an `isInitialEntry` lifecycle state triggered on extension initialization and SPA route changes (`onRouteChange`). As soon as turns load and reach the bottom, older turns are buffered immediately without waiting for a 5-second stationary delay.
  * *Human Scroll vs. Programmatic Scroll Isolation:* Separated true user scroll interactions (`wheel`, `touchmove`, navigation keys) from passive layout `scroll` events. Angular's turn rendering, autoscrolling, and image loading no longer falsely refresh `lastUserScrollTime` or prevent buffering.
  * *Adaptive Bottom Detection:* Broadened settling tolerance (`distFromBottom <= 350px` or viewport visibility of the final turn), ensuring chats consistently optimize from 100+ turns down to the user's configured limit within ~500ms of entering.

`Modern Web Chat` module.
* **Fixed:** `Selective Turn Navigator Restoration & Viewport-Aware Navigation`.
  * *Preserved Detached State on Attached Clicks:* In `jumpToTurn`, clicking any turn in the Turn Navigator (TOC popover or dash indicators) now verifies if the target turn element already exists in the DOM. If the target turn is already rendered (e.g. the second-to-last turn), `restoreDetached()` and `__sl_restoreAllTurns` are bypassed, keeping all buffered turns safely detached.
  * *Non-Jarring Viewport Navigation:* If the selected turn is already visible on screen, redundant scrolling is skipped entirely and the turn is gently emphasized with `sl-turn-highlight`. Only off-screen turns trigger smooth navigation (`block: 'nearest'`), eliminating sudden jump-scrolls.

## v2.0-preview-4
**Modern Web Chat Major Overhaul, Angular 19 Signals & Architectural Stabilization**

`Core Architecture & Network Engine`.
* **Added:** `Angular 19 Signals Direct State Mutation & LView Interceptor`.
  * *LView Map Interception:* Intercepts Angular 19's internal LView registry at `document_start` in the `MAIN` execution world via multi-candidate `Map.prototype.set` monitoring with active DOM context resolution (`ms-run-settings`, `app-root`), accessing over 600–1,200 runtime component LViews.
  * *DynamicStudioAPI & Zero-Flicker Mutation:* Direct programmatic inspection and mutation of Angular 19 Writable Signals (`model.set()`, `temperature.set()`, `thinkingBudget.set()`, `maxOutputTokens.set()`, `enableSearchAsATool.set()`, `enableCodeExecution.set()`).
  * *Purge of Invisible DOM Hacks:* Completely removed `injectInvisibleCSS()`, `toggleInvisibleDOM()`, and `opacity: 0.0001` DOM-hiding hacks along with modal dialog click-polling. Settings and models apply instantaneously with zero UI flicker or dialog popups.
  * *Clean System Instructions Injection:* Injects instructions via native prototype descriptor (`HTMLTextAreaElement.prototype.value`) and synthetic `input` events, binding directly to Angular's `FormControl` before silently dismissing the slide panel.
* **Fixed:** `Bypass Toggle & Abort Delegation`.
  * *Native Abort Delegation:* In `interceptor.js`, `xhr.abort` now checks `bypassEnabled`. If bypass is disabled in settings, abort calls delegate cleanly to the host environment's native abort routine, restoring user cancellation for streaming generations.
* **Consolidated:** `Unified XMLHttpRequest Open Patch & Telemetry Logging`.
  * *Consolidated Patching:* Merged duplicate `XMLHttpRequest.prototype.open` monkey-patches in `interceptor.js` into a single unified implementation handling model swapping, telemetry logging, and runtime model discovery (`ListModels`).
* **Cleaned:** `Production Media Download Fallback`.
  * *Dead Code Removal:* Removed unreachable `window.ng.getComponent` branch in `interceptor.js`, ensuring direct fallback downloads via native buttons and anchor elements.

`Modern Web Chat` module.
* **Added:** `Modular Architecture & CSS Extraction`.
  * *Dedicated Stylesheet:* Extracted 2,242 lines of CSS from embedded JavaScript template strings into standalone `modules/modern-web-chat.css`, registered under `web_accessible_resources` in `manifest.json`.
  * *Dynamic Link Injection:* Updated `updateStyles()` to inject `<link rel="stylesheet">`, reducing script size by over 55% (~4,100 lines down to 1,833 lines) for improved maintainability, parsing speed, and browser caching.
* **Fixed:** `Observer Lifecycle & State Toggle`.
  * *Conditional Observer Attachment:* Observers (`mainObserver`, `overlayObserver`) now attach strictly when the module is enabled. Toggling off cleanly disconnects observers; toggling back on immediately re-instantiates them so new turns, menus, and media continue processing.
* **Fixed:** `Stealth Thought Deletion & Reasoning Tokens Preservation`.
  * *Non-Destructive Thought Handling:* Removed automated physical clicking of delete/close buttons on `ms-thought-chunk`, preserving model reasoning tokens and thinking chunks within the session while maintaining full user control over thought blocks. Completely purged dead `autoDeleteThoughts` and `__sl_deleteThought` event hooks.
* **Fixed:** `More Models Dialog & Drawer Isolation`.
  * *Direct Native Trigger & Persistent Availability:* Clicking "More models..." triggers Google AI Studio's native model selection dialog directly without prematurely expanding the right settings drawer. Preserved the settings component in the DOM when closing the right drawer and implemented `ensureRunSettingsMounted` to ensure "More models..." opens reliably even after repeatedly toggling the drawer.
* **Added:** `Centered Top Saving Pill Banner`.
  * *Header Harmony & Slide-Down Animation:* Replaced native toolbar saving indicators in `toolbar-right` with a centered pill banner that slides down smoothly from the top viewport edge (`translate(-50%, -32px)` -> `translate(-50%, 0)`).
  * *Authentic Header Styling:* Matched the exact aesthetic of header buttons (`rgba(30, 30, 30, 0.92)` frosted glass, `backdrop-filter: blur(16px)`, `16px` border-radius, elevation shadow, `#8ab4f8` spinning sync icon, and Google Sans typography), with real-time sync across XHR/fetch saving requests and DOM status mutations.
* **Fixed:** `Settings Search Bar Uniformity`.
  * *Background Stripe Elimination:* Enforced transparent background on the search input element, eliminating host stylesheet background layering and the visible vertical stripe at the end of the input field.
* **Enhanced:** `Persistent ChatGPT-Style Turn Navigator & Frosted-Glass Styling`.
  * *Desktop-Wide Visibility:* Removed breakpoint restrictions that hid the 3-dash turn navigator widget when settings were open; the widget now remains consistently visible on all desktop viewports (> 768px).
  * *History Flyout Aesthetic Match:* Upgraded the turn navigator popover to use `rgba(30, 30, 30, 0.88)` frosted glass with `backdrop-filter: blur(16px)`, matching the native History flyout panel with tighter 5px dash spacing, 2px popover item gaps, and 30px compact item heights.
* **Redesigned:** `Viewport-Aligned Header & Slide-Out Settings Drawer`.
  * *Unified Header Toolbar:* Grouped navigation drawer toggle, `+` (New chat), and `⋮` (Overflow menu) into `.toolbar-left`. Relocated Model selector, Thinking level, and Run Settings trigger to `.toolbar-right`, automatically hiding the redundant `+` on empty chats.
  * *Isolated Fixed Overlay Drawer:* Replaced the docked right panel (`ms-right-side-panel`, `ms-run-settings`) with a fixed 380px slide-out drawer (`position: fixed; z-index: 1200; background: #191919`), reclaiming 300px of workspace to center the chat canvas. Dismisses cleanly via outside click or `Escape`.
  * *Left-Navigation Settings Entry:* Integrated Studio.lab Settings directly into the left navigation drawer below native User Settings with pixel-perfect native geometry, typography, and collapsed drawer support.
* **Redesigned:** `Native Material Model & Thinking Selectors`.
  * *Frosted-Glass Flyouts:* Re-engineered dropdown menus to mirror native `.nav-flyout-panel` surface aesthetics: `rgba(30, 30, 30, 0.92)` frosted glass (`backdrop-filter: blur(12px)`), 16px border-radius, elevation shadows, and squircle item hover states.
  * *Dynamic Featured Models & Constrained Thinking Levels:* Intercepts runtime models (`Gemini 3.8 Flash`, `Gemini 3.5 Flash Lite`, `Gemini 3.1 Pro Preview`) and dynamically constrains thinking levels to those officially supported by the selected model (`Minimal`, `Low`, `Medium`, `High`).
* **Redesigned:** `Square Media Tiles & Circular Frosted-Glass Controls`.
  * *Strict 112×112px Square Tiles & Flex Rows:* Enforced 112×112px square tiles with `object-fit: cover` and unclipped horizontal flex row wrapping for multiple attachments, eliminating turn clamping.
  * *Shadowless Circular Action Buttons:* Redesigned media action buttons (`⋮`) as 28×28px circular frosted-glass buttons (`backdrop-filter: blur(20px)`, zero borders, zero drop shadows).
  * *Isolated Full-Width Video Cards:* Restores full width and auto height for video chunks, preserving duration, token count, and filename metadata bars.
  * *Turn Options Download Integration:* Dynamically injects native-styled "Download" actions into active media turn menus, routing through the main-world download pipeline.
* **Enhanced:** `Prompt Box, Editing Experience & Responsive Layout`.
  * *Full-Height Autosize Editing:* Synchronized typography (`15px` font size, `1.6` line-height) across `ms-autosize-textarea`, its native `::after` element, and `textarea`, resolving CSS Grid row clamping with dedicated bottom scroll clearance (`22px`).
  * *Floating Prompt Box Overlay:* Centered 900px prompt box anchored to the bottom with fixed darkening gradient (`footer::before`) and 240px scroll clearance. Attachment chips inside prompt box use compact 18px native remove buttons.
  * *Upward-Opening Hover Submenus:* `+` prompt submenus (`Other uploads`, `Tools`) open upwards into view with direct, silent tool toggling.
  * *Responsive Adaptation:* Optimized layouts across Mobile (< 768px; hides TOC, 94% bubble width), Tablet (768–1024px; adaptive padding), and Widescreen (> 1024px) viewports with uniform 16px edge clearance.
  * *Minimalist Timestamps:* Purged timestamps from user turns and edit mode; model turns feature a single consolidated timestamp with an inline `• Edited` badge.

`Default Profile` module.
* **Fixed:** `SPA Navigation & Route Auto-Apply`.
  * *Route Lifecycle Hook:* Implemented `onRouteChange(ctx)` lifecycle handler and added `__sl_routeChanged` event dispatching in `content.js`, ensuring default profile settings auto-apply reliably upon navigating to `/prompts/new_chat`.
* **Fixed:** `DOM Safety & XSS Prevention`.
  * *Safe Element Construction:* Replaced unsafe `innerHTML` concatenations with safe DOM manipulation (`textContent` and node creation) for instruction library dropdown options and profile status displays.
* **Fixed:** `Memory Leak & Listener Cleanup`.
  * *Listener Disposer Pattern:* Prior document click and profile update event listeners are cleanly unbound and guarded against duplicate registrations on modal re-open.
* **Enhanced:** `Direct Signals Integration`.
  * *Silent Profile Application:* Applies model, temperature, and toolsets directly via `DynamicStudioAPI` signals without modal popups or DOM flickering.

`Smart Optimizer` module.
* **Enhanced:** `Streaming Guard & Scroll Jitter Elimination`.
  * *Active Stream & Scroll Detection:* Suspends turn buffering while model responses are actively streaming or while the user is actively scrolling, completely eliminating scroll jumps and jitter during reading.
  * *Stationary Settle Threshold:* Buffers older turns only after 2.5 seconds of stationary idle at the bottom, keeping message restoration manual via banner buttons or search shortcuts.

`Scroll to Bottom` module.
* **Enhanced:** `Elevation & Stacking Context Polish`.
  * *Elevated Footer Hierarchy:* Added `position: relative !important; z-index: 10 !important;` to `footer` and `z-index: 11` to `ms-prompt-box`, while ensuring the darkening gradient sits at `z-index: 1` with `pointer-events: none`, keeping the scroll-to-bottom button crisp, un-shadowed, and fully interactive.

## v2.0-preview-3
**New Feature: Draft Crash Protection & Smart Optimizer Native Search Integration**
* **Added:** `Draft Crash Protection` module.
  * *Real-Time Autosave:* Debounced continuous caching of prompt input into `localStorage` keyed per prompt URL (`sl_draft_<pathname>`) with a `sl_draft_latest` fallback.
  * *Automated Restoration & Reliability:* Resilient polling + MutationObserver watcher (`startTextareaWatcher`) guarantees unsent drafts are restored even during late Angular lifecycle boots.
  * *Angular Form-Control Protection:* Guard passes at 400ms and 800ms prevent Angular's reactive form initialization from wiping restored drafts.
  * *Safe Cleanup:* Automatically clears cached drafts once the prompt is sent (via `Ctrl+Enter`, Run button, or backend request detection).
* **Fixed:** `Smart Optimizer` & Native AI Studio Search Integration.
  * *Native `Ctrl+Shift+F` Search Coordination:* Automatically and synchronously restores all buffered turns the instant native search (`Ctrl+Shift+F`, `Cmd+Shift+F`, `Ctrl+/`, or Omnibar `/find`) is triggered. Correctly detects shortcuts across international keyboard layouts (e.g. Cyrillic `e.code === 'KeyF'`).
  * *Omnibar Result Interception & Direct Jump:* Listens to search result clicks and Enter selections in `#omnibar-results`, decodes `MakerSuiteVeMetadataKey` from `jslog` to extract the target turn UUID, and guarantees the target element is rendered in the DOM before AI Studio initiates navigation.
  * *Target Turn Highlight:* Applies an animated blue pulse highlight (`.sl-turn-highlight`) to the found message upon jumping, making it immediately identifiable in long chat threads.
  * *Removal of `content-visibility` Glitches:* Purged intrusive `content-visibility: auto` CSS overrides that caused off-screen geometry miscalculations, premature scroll termination, and layout shifts during large jumps.
  * *Flawless Upward Scrolling:* Removed redundant manual `scrollTop` offsetting that conflicted with Chromium's native scroll anchoring (`overflow-anchor: auto`). Upward scrolling now smoothly and instantaneously restores earlier turns without bouncing or throwing the user downwards.
  * *Extended Read & Search Grace Period:* Requires the user to stay continuously at the bottom for at least 5 seconds before re-buffering older turns, and pauses buffering for 30 seconds after any search navigation to allow uninterrupted reading.

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
