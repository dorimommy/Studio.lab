# Studio.lab Changelog

## v2.2.1

**Fullscreen Settings Hotfix**

* **Fixed:** Fullscreen Settings removes its own native GAIS backdrop from the DOM, including backdrops mounted late or inside CDK popovers. This prevents the blurred screen on mobile and in desktop mode without new CSS overrides. A stationary Settings shell also parks its original empty host; unrelated menus keep their backdrops, and a still-open native dialog regains its original backdrop on adapter disposal.

## v2.2

**Fast Chat Opening, Unified Settings, Accounts & Market**

`Chat Opening & Compatibility` (`content.js`, `modules/`, `account/account.css`).

* **Added:** `Fast Chat Opening`.
  * *One Saved Preference:* Controls document-start history rendering, offscreen layout deferral and native height-read optimization. Unsupported frontend shapes retain native rendering.
  * *On-Demand History:* The native template starts with the latest 20 message views. Upward user intent near the history boundary or an explicit history control requests older views through native signals; idle time alone does not mount the remaining history.
  * *Preserved Native Context:* The template receives a render-only view. Canonical message IDs, text, model context, editing, generation and save data remain native and complete.
* **Changed:** `Partial History Rendering`.
  * *Bounded Requests:* Each request adds up to 20 older views, split according to measured rendering cost, idle budget and pending input. Work stops when the requested budget is consumed.
  * *Scoped Native Work:* Author lookups reuse indexed IDs only for render slices. Native scroll checks coalesce after a changed partial-history pass; native resize handling and full-view behavior remain in place.
  * *Committed Views:* A post-template event lets Buffered and pending turn navigation act on newly rendered hosts. Route changes, detached hosts and disposal cancel pending work.
* **Fixed:** `Buffered and Native Navigation`.
  * *Retained Angular Anchors:* Buffered hides older native hosts with an owned CSS marker instead of detaching them or their subtrees. Rendered controls and Angular insertion anchors remain in place.
  * *Earlier History Controls:* Show earlier reveals retained hidden rows first, then requests the rest of its batch from the native history view. Restore Everything reveals retained rows and requests the complete native view.
  * *Explicit Full Rendering:* Native find/search and navigation to an absent target can materialize all views before a jump. Tab focus alone does not expand history, and a deferred navigator resolves its current target once after rendering.
* **Changed:** `Incremental Chat Enhancements`.
  * *Word Counts:* Recent turns take priority. Mutation records queue only new or changed turns, owned badges do not trigger recounts, and text traversal avoids forced layout.
  * *Modern Web Chat:* History commits no longer trigger unrelated header and menu scans. Navigator state follows the current scroller and route.
* **Fixed:** `Expired Extension Contexts`.
  * *Lifetime Cleanup:* Settings, native-control adapters, module scopes, delayed default-profile work and pending prompt bridges release their timers and listeners. Late callbacks cannot reactivate disposed features.
* **Fixed:** `Interface Visibility`.
  * *Current Welcome:* Cleanup supports model promotions and example cards while retaining the personal greeting. Sidebar promotions have an independent switch; actual request and quota errors stay visible.
  * *Connected Corners:* Trailing hidden feedback controls no longer prevent the Market moderator row's lower corners from rounding.

`Market, Public Profiles & Modern Web Chat Preview` (`account/`, `content.js`, `modules/custom-theme.js`, `supabase/`).

* **Added:** Blue verification, gold staff and moderator shield badges beside public nicknames. Account includes moderator applications and owner role controls. Moderators remove rule-breaking publications with an audited reason; the owner can restore them from a queue containing only captured public metadata. Paid verification is unavailable while payment integration is deferred.
* **Security:** Badge and moderation access uses private RLS tables, authenticated client RPCs, a service-only verification RPC and definer functions with empty search paths. Private helpers have no API access; approved applications have a concurrent-decision guard.
* **Changed:** Market now separates Discover, Saved and Your creations. Account combines sign-in, settings sync and public profile editing. Item details, other creators' profiles, creation and confirmations use inline pages with Back; no nested iframe-sized modal backdrop remains. Saved cloud bookmarks and installed device copies have separate actions. Section actions align to the right edge. Create offers a dedicated theme or system prompt editor; Appearance uses filled Light/Dark choices and text-field focus adds no label underline.
* **Changed:** Themes work only with Modern Web Chat and use all 14 actual native/MWC tokens: 13 editable colors, one transparent border and six opacity controls. Settings, native settings menus, Account and Market keep their neutral native light/dark appearance. Preview is an independent packaged document with sanitized native GAIS component markup, fixed public sample bubbles/code/composer, and the production Modern Web Chat stylesheet and header/dropdown renderers. It never loads saved chats or navigates or recolors the live workspace. Back/Escape restores the connected editor without writing preview changes to storage. Theme creation/editing is computer-only regardless of desktop window width; prompts remain available on mobile.
* **Changed:** Save draft and Publish are choices in the same editor. Description and tags stay visible; sign-in retains a new draft. Token cards put color and opacity in one compact row with 4px gaps.
* **Fixed:** Light/Dark switches untouched token values to the matching defaults while preserving edited colors and opacity. Native selected navigation and actions retain filled backgrounds; the composer uses the same raised token as message bubbles. Desktop Thinking Level uses its existing header dropdown with a native fallback when that control is unavailable. Preview has a compact 44px toolbar and displays its public sample immediately without opening a user chat. UI captions cannot be drag-selected; fields and copyable content remain selectable.
* **Added:** Safe nicknames and unique profile tags assigned automatically on verified sign-in, optional edits in Account, public profiles, following, independent likes and private cloud bookmarks. Public IDs differ from Auth IDs; Google identity is never copied into a public profile. Existing profile edits survive initialization. Social writes are idempotent, bounded and account-guarded.
* **Security:** Three owner-RLS social tables and nine authenticated RPCs, three anonymously readable, with revoked direct table/helper access, Google-provider authorization, serialized quotas, profile revisions and account-deletion cascades.

`Settings Design & Interaction` (`content.js`, `sl-panel.css`, `modules/native-settings.js`, `modules/settings-select.*`, `modules/default-profile.js`, `account/`).

* **Changed:** Restored Google Account-style colored navigation icons, a compact header with the centered section title, and a single search at the bottom of navigation. Market uses that same search. Home pairs the visible GAIS avatar with Studio.lab and offers four category shortcuts. Info uses the same content width and full-width disclosure rows.
* **Changed:** Preference groups use separate connected tiles, one shared 4px gap, larger outer corners and smaller inner corners. Switches share one right edge. Buttons, fields and menus use filled surfaces without border rings; keyboard focus uses filled controls and underlined labels. Routine preference saves are announced without a floating toast.
* **Fixed:** Settings paints before delayed native controls arrive. Original Angular controls and handlers are preserved, including Material select portals. Borrowed Material dividers no longer add extra spacing between tiles, and the full microphone control opens its original menu. Native dropdown wrappers no longer paint duplicate outlines. A delayed CDK focus attempt preserves current edits and private frame focus. Update results stay usable in Info rather than opening an inert competing popup.
* **Changed:** Market uses Discover, Saved and Your creations, with Create in Your creations. Creation opens an inline editor with a larger color preview. New-chat defaults expose the instruction and saved-profile actions directly.
* **Fixed:** Validated custom palettes use an owned constructed stylesheet without weakening CSP. The subsequent Market update scopes these palettes to GAIS and keeps Account/Market neutral. Reset removes only the owned sheet and preserves existing page styles.
* **Fixed:** Turn limit, Listing details and browser/cloud comparison now use filled full-row disclosures with right chevrons. Search tracks keyboard modality explicitly: mouse focus keeps its neutral field, while Tab/Ctrl+K gives the small search icon a visible backing in native and custom palettes. Long Home/Account names wrap at phone widths; library updates retain unsaved instruction selection and saved Market prompt titles. Modern Web Chat cleanup no longer assumes the document body exists at startup.
* **Fixed:** When atomic node movement is absent or rejected, the existing iframe-bearing Settings shell stays in place with its own focus trap. The original native host is parked reversibly, retaining live select portals without reloading an early private editor.

`Themes, System Prompts & Market` (`account/catalog*`, `modules/custom-theme.js`, `content.js`, `interceptor.js`, `supabase/`).

* **Added:** Private Google-account library with safe theme editing, live previews, system prompt editing, revision conflicts, explicit publishing and unpublishing. A public searchable Market offers previews, local installation, use, JSON export and import.
* **Added:** Themes and prompts share Market before Account, with public discovery, saved items and private creation. Installed items remain available after sign-out; installed prompts appear in new-chat defaults. Theme reset restores native colors.
* **Security:** Separate owner-only library RPCs, revoked direct table grants, Google-provider checks, request and document limits, revision checks and account-deletion cascades. Market responses expose public aliases, never account email or owner IDs. Themes contain only bounded color tokens; system prompts remain text.
* **Changed:** Applying a selected prompt confirms the native instruction input update and aborts if the chat changes. Creation and publication are separate from the existing 17-preference backup.
* **Fixed:** Account changes clear previous private library views and pause unsaved drafts for their original account. Captured-owner checks stop a draft from being uploaded to another signed-in account. Confirmed saves remain committed if a subsequent list refresh fails; installed updates retain the current palette until Use is selected.

`Settings Internal Layout & Accessibility` (`content.js`, `sl-panel.css`, `modules/native-settings.js`, `modules/default-profile.js`, `modules/optimizer-hard.js`, `modules/chat-export.js`, `account/`).

* **Changed:** Rebuilt the inner layout with connected preference lists, native switches and radio choices, linked help and short actions. Home shows the visible GAIS profile and category shortcuts. Formatting and chat layout appear in Workspace; analytics blocking has a separate Privacy group in Tools. Preference keys and storage remain unchanged.
* **Added:** A native mobile menu drawer reuses the same navigation nodes and listeners. It keeps keyboard focus inside the open drawer, restores the previous inert states on close, and returns focus to the menu button. Desktop retains the sidebar; resizing moves focus out of navigation that becomes hidden.
* **Added:** Named navigation, search-result and save announcements, visible error feedback, real disabled dependent fieldsets, reduced-motion and forced-colors styling. Native GAIS controls keep their Angular handlers and original CDK focus trap; reversible label/help associations and pressed-button state expose their actual DOM state.
* **Changed:** New chat defaults show visible instruction/library and saved-profile actions with linked status. Busy actions preserve the invoking button's focus; removing a focused default returns focus to Use current chat without interrupting navigation.
* **Fixed:** Both optimizer strategies expose shared limits in a native disclosure whose summary shows Automatic, 15 or the saved manual limit. Only Physical shows Apply cleanup outside the disclosure. Live statistics refresh preserves unfinished numeric edits. Invalid limits show linked errors and are not saved; range and number fields remain genuinely disabled until manual limits are available.
* **Added:** Search lists specific setting and action destinations. Choosing a result opens its section and any containing disclosure, then focuses the actual control; typing does not dump entire settings cards into results.
* **Changed:** Chat Export reports downloads and readable errors inside Settings without blocking browser alerts. Account actions and confirmations expose named controls, live feedback and keyboard focus while identity stays in the private extension frame.
* **Added:** Documented the Settings keyboard and semantic contract, including focus restoration, native controls and private-frame boundaries.

`Unified Google AI Studio & Studio.lab Settings` (`content.js`, `sl-panel.css`, `modules/native-settings.js`).

* **Changed:** The native GAIS Settings button opens a fullscreen Google-style Home with shared search, desktop navigation and a mobile menu drawer. All Studio.lab sections are included, with Account immediately before Info.
* **Added:** The actual GAIS theme, submit prompt key, autocomplete, applet notifications and microphone controls inside the original Angular/CDK dialog. Native controls, focus management, closure and GAIS persistence are preserved; GAIS preferences are excluded from Studio.lab storage and sync.
* **Added:** Home uses the profile name/avatar already visible in GAIS. Private Studio.lab identity stays inside the Account frame.

`Optional Accounts & Preference Sync` (`account/`, `content.js`, `background.js`, `supabase/`).

* **Added:** Google authorization-code login with PKCE and per-attempt callback state inside **Settings → Account**, persistent private sessions, refresh, and local/global sign-out. An extension-origin frame isolates account identity and controls from the host page.
* **Changed:** Account appears immediately before Info and shares Settings' Search field and scrollbar. Frame autoheight and visible confirmation placement use a bounded numeric layout bridge; account data and worker commands stay inside the extension origin.
* **Changed:** The backend connection is bundled and fixed at runtime, with one exact required project host and matching CSP. Sign-in needs no project setup form or additional host-permission popup.
* **Added:** Allowlisted cloud preferences with first-sync choice, account-specific local copies, offline retry, pause/resume, manual sync, preference export, automatic merges for independent changes, and visible conflicts.
* **Added:** Owner-derived Supabase RPC access with RLS, revoked direct API grants, bounded server validation, compare-and-swap revisions, deletion tombstones, and persistent per-user request quotas.
* **Added:** Cloud-backup deletion and caller-only account deletion with explicit confirmation, verified authentication, recent OAuth login, active-session checks, and server-only administrative credentials.
* **Changed:** Privacy/security documentation now describes optional identity and cloud storage. Chats, drafts, system instructions, default profiles and API credentials are excluded from synchronization. Local use remains available without sign-in.
* **Added:** Backend migrations and an authenticated account-deletion Edge Function. Backend deployment remains separate from loading the extension.

`Release Packaging` (`manifest.json`, `.gitignore`, `account/fonts/`).

* **Changed:** Publication uses an explicit runtime/resource allowlist. Local tests, tooling, backend sources, captures and generated release files remain outside the repository publication set; the extension archive contains runtime files and required license notices.
* **Changed:** Replaced the pre-OFL Google Sans binary with the current OFL Latin variable font and included the matching Google Sans, Inter and Material Symbols license notices.

## v2.1

**Full Studio.lab 2.1 Release: Response Recovery, Reliable Native Controls & Chat Export**

`Response Recovery & Network Integration` (`interceptor.js`, `modules/response-recovery.js`, `modules/default-profile.js`, `content.js`).

* **Changed:** `Response Recovery Identity and Preference Migration`.
  * *Consistent Naming:* Updated the interface, module filename and ID, state key, event bridge, manifest, and documentation to use Response Recovery.
  * *Preserved Preferences:* Existing enabled and disabled preferences migrate before defaults are applied. An explicit current preference takes priority, including `false`, and external settings updates use the same migration.
* **Fixed:** `Protocol Field Recovery Without Content Rewrites`.
  * *Scoped Status Changes:* Recovery edits verified response status, finish-reason, and feedback fields while preserving prompt text, generated content, media, signatures, and usage data. Unknown framing passes through; incomplete streams retain their unfinished content.
* **Fixed:** `Model Override Isolation and Lifecycle`.
  * *Exact Model Fields:* XHR and fetch overrides change the model URL or protocol field without rewriting model-looking text in prompts or history. `fetch(Request)` honors caller options and reads a clone without consuming the original body.
  * *Current Native Selection:* Successful profile, direct, and native selections, plus chat-route changes, clear stale overrides. A native model mounted later establishes the fallback baseline instead of incorrectly cancelling recovery.
* **Fixed:** `Native Stop and Reused XHR Controls`.
  * *Actual Stop Detection:* Explicit Stop and navigation cancellation reach the native abort path. The current Run/Stop button is recognized by its rendered Stop label when AI Studio omits a Stop class or accessible label; cancelled replies are not captured as completed answers.
  * *Native XHR Restoration:* Reopening a generation XHR restores its original response getters and abort behavior before an unrelated request. Reopened save requests cannot attribute the next response to an earlier save.
* **Fixed:** `Image Search Profile Selection`.
  * *Correct Native Signal:* Image Search updates its own control rather than enabling Google Search through the general search-name match.

`Modern Web Chat` module (`modules/modern-web-chat.js`, `modules/modern-web-chat.css`, `interceptor.js`).

* **Fixed:** `Generated Images and Attachment Downloads`.
  * *Preserved Image Dimensions:* Model images retain their dimensions and aspect ratio, including image-only replies and replies with captions. The 112px thumbnail rules remain scoped to user attachments.
  * *Selected Media Target:* Download is associated with the selected media chunk, trigger, and native menu. Unrelated menus and ambiguous menus containing several attachments receive no guessed download action.
* **Fixed:** `Native Thinking Controls and Confirmed Selection`.
  * *Available Native Choices:* Thinking levels come from enabled native options instead of inferred model names. The displayed selection changes only after the native value confirms it.
  * *Thinking Budget Access:* Models with a native thinking budget retain their operable budget control in Run Settings instead of receiving an unsupported level menu.
* **Fixed:** `Keyboard Navigation and Menu Focus`.
  * *Accessible Controls:* Model and thinking choices use focusable buttons with menu roles and selected-state attributes. Arrow keys, Home, End, Tab, and Escape support navigation, dismissal, and focus restoration; upload and tool submenus also support keyboard entry and exit.
* **Fixed:** `Turn Navigator Reattachment and Teardown`.
  * *Current Native Scroller:* The navigator reconnects when AI Studio replaces its scroller or native turn buttons, removing old listeners and scheduled updates.
  * *Disabled State Respected:* Resize cannot rebuild navigation after the module is disabled. Reenabling attaches one active navigator to the current chat.
* **Fixed:** `Retained Native Menus and Header Cleanup`.
  * *Restored Host Controls:* Teardown restores moved upload items, their order and display values, native Share, and menu markers. Injected controls, viewer handlers, pending callbacks, and token overlays are removed so retained native menus can be enhanced again after reenabling.
* **Fixed:** `Retained Model Catalog Search`.
  * *Unfiltered Featured Selection:* Custom model selection and Featured refresh clear a retained native search query, then wait for the enabled Featured category and requested row. Filtered native results cannot replace the Featured cache.
  * *Preserved Manual Browsing:* Opening More models retains the user's native search query. Internal picker actions no longer cancel an opening custom menu.
* **Fixed:** `Responsive Header State`.
  * *Module-Scoped Geometry:* The desktop-action mounting shim follows the Modern Web Chat enabled state. Disabling restores native header geometry and refreshes existing header observations without requiring a physical resize.

`Chat Export` module (`modules/chat-export.js`, `interceptor.js`).

* **Fixed:** `Latest Completed Answer and Chat Isolation`.
  * *Complete Current Context:* JSON and Markdown include the latest completed model reply once, joining streaming text deltas while keeping reasoning and media parts separate. Markdown uses native turn roles.
  * *Request Ownership:* Captures follow the current chat route and request ID. Late, failed, incomplete, or cancelled responses cannot append an answer to a different request or chat.
* **Fixed:** `Verified First Text-Chat Autosave`.
  * *Confirmed Saved Route:* The first autosave preserves export across the native transition from a new text chat only when its completed transcript, model, system instructions, save result, and chat epoch match the exact returned prompt ID.
  * *Pending Route Quarantine:* Navigation may precede the save response or generation response clone. The candidate stays unavailable for export until ownership is confirmed; failed, unrelated, or unsupported media saves do not authorize transfer. Pending save candidates are bounded and cleared with capture teardown.
* **Fixed:** `Same-Path New Chat Reset`.
  * *Immediate Invalidation:* Starting another new chat invalidates previous captures and pending saves before the native action, even when the pathname remains unchanged.
  * *Modified Link Clicks:* Ctrl, Meta, Shift, Alt, and non-primary clicks on New Chat links do not reset the current tab when opening or handling the link elsewhere.

`Composer, Counts & Scrolling` (`modules/word-counter.js`, `modules/text-formatter.js`, `modules/scroll-bottom.js`).

* **Fixed:** `Streaming Word Counts Without Duplication`.
  * *Text Mutation Coverage:* Counts update when streaming changes a Text node or adds a new turn. Nested `ms-prompt-chunk.text-chunk` and `ms-text-chunk` content is counted once.
* **Fixed:** `Numeric Input and Link Editing`.
  * *Markdown Marker Spacing:* Enter after plain numbers such as `-42` or `1.25` no longer starts a list. Properly spaced Markdown markers retain list continuation.
  * *Supported Input Selection:* The link editor avoids unsupported selection-range calls on `input[type="url"]`.
* **Fixed:** `Scroll Listener and Timer Cleanup`.
  * *Detached Scroller Release:* Route changes and teardown remove listeners from the previous scroller before clearing its reference, and cancel pending scroll callbacks and timers.

`Toolbar Activation` (`background.js`).

* **Fixed:** `Chrome Action Without a Tab URL`.
  * *Available Content-Script Bridge:* The extension action reaches the AI Studio content script when Chrome omits `tab.url`, without adding tab-reading permissions.

## v2.0
**Full Studio.lab 2.0 Release: Reliable Native Controls, Responsive Workspace & Update Discovery**

`What the v2.0 Preview Series Delivered` (`preview-1` through `preview-4-hotfix-5`).
* **Added:** `Text Formatter` with inline and floating Markdown controls, keyboard shortcuts, and a compact heading menu on mobile; fixed prompt-bar alignment and light-theme readability before release.
* **Added:** `Draft Crash Protection` with per-chat autosave and restoration. Hardened it against Angular's late form initialization, failed requests, and stale completion events so unsent text is not cleared incorrectly.
* **Rebuilt:** `Modern Web Chat` as a 2.0 workspace feature, moving its styles into a dedicated stylesheet and refining responsive headers, drawers, native menus, media tiles, editing, saving status, and the turn navigator. Its earlier alpha predates this release.
* **Fixed:** Long-chat optimization and navigation: buffering waits for real user interaction and streaming state, native search restores detached turns, and selecting an already-rendered turn no longer needlessly restores the whole chat or jumps the viewport.
* **Fixed:** Mobile and desktop native controls, including reliable Edit title, drawer close-button isolation, model-dialog availability, and cleanup of token tooltip overlays when Modern Web Chat is disabled.
* **Hardened:** AI Studio integration with SPA route events, bounded Angular signal discovery, safe DOM insertion, correctly forwarded XHR/fetch requests, and matching request-completion events. The final model-selection behavior is specified below and supersedes the preview-era direct-signal description.

`Release Identity & Manifest`.
* **Changed:** `Preview` Graduation to Full `v2.0`.
  * *Clean Extension Name:* Removed `Preview version 4` from the extension name. The numeric manifest version remains `2.0`; the preview-only `version_name` override is gone, so Settings also displays `v2.0`.
  * *Local Release Asset:* Bundled the trailer's original Earth-and-Moon frame as a compact WebP background for the update announcement. The banner resolves the asset through the extension URL, so the image loads inside AI Studio.
  * *Updated Artwork:* Replaced the old extension icons and support banner with the new assets in `images/`. Restored the system-architecture illustration in README; the new logo remains available for branding.

`Modern Web Chat` module (`modules/modern-web-chat.js`, `modules/modern-web-chat.css`).
* **Fixed:** `Mobile Model Name Desynchronization after Library Navigation`.
  * *Per-Chat Model Memory:* Model names are tracked by chat route instead of reusing a stale global label. Returning to a chat no longer requires opening the right panel to replace `Select model` with the selected model.
  * *Verified Hybrid Selection:* Existing text chats retain the fast direct-signal path, with native-card confirmation. New chats and specialized models use AI Studio's hidden native picker so route and capabilities update correctly; new-chat selection verifies both card and URL.
  * *New Featured Models Remain Selectable:* A newly discovered Featured entry now selects through the native picker when the direct path is unsuitable; the custom model menu no longer appears to accept a click while leaving the previous model active.
  * *Single Active Model:* Featured checkmarks now compare exact model IDs, so selecting Flash TTS cannot also mark Flash.
* **Fixed:** `Light Theme Compatibility`.
  * *Theme-Aware Surfaces:* Custom header controls, model/thinking menus, Run Settings drawer, token widgets, turn navigation, and message/edit surfaces use a readable light palette when AI Studio is in Light mode.
  * *Prompt & Upload Menus:* Prompt-box hovers, Other uploads, Tools flyouts, and their selected states now follow the native light palette.
* **Fixed:** `Tools Submenu Selection and Compatibility`.
  * *Single Native Toggle:* Removed the duplicate signal-plus-synthetic-click path that could leave custom checkmarks out of sync. A choice clicks its actual AI Studio switch once and reads back the result.
  * *Persistent, Accurate Menu:* The submenu stays open after a selection; checkmarks and disabled incompatible tools are refreshed from native controls.
* **Fixed:** `Desktop/Mobile Drawer Behavior`.
  * *Independent Desktop Panels:* Opening the left navigation no longer closes the right settings drawer on wide screens. Mobile retains mutual closing to prevent overlap.
* **Polished:** `Prompt-Area Fade`.
  * *Theme-Matched Surface:* The bottom gradient now derives from the current AI Studio surface color instead of a fixed black strip.

`Composer, Drafts & Formatting`.
* **Fixed:** `Text Formatter in Light Mode`.
  * *Visible Controls:* The floating and inline toolbars, toggle, heading flyout, and link editor now use light surfaces with readable dark icons and hover states.
* **Fixed:** `Full-Width Text Formatter`.
  * *Prompt-Bar Alignment:* The inline formatting toolbar now spans the prompt bar without the former inset margins.
* **Polished:** `Restored Draft Banner`.
  * *Consistent Controls:* Refined the banner and its actions; discarding a draft immediately removes the stale restored-draft indicator.

`Word Counter` module (`modules/word-counter.js`, `sl-panel.css`).
* **Fixed:** `Native-Style Turn Metadata`.
  * *Separate Elements:* Word and character counts are rendered as independent spans instead of one text string.
  * *Visual-Only Separators:* The separator between words and characters is drawn with CSS, matching AI Studio's timestamp separator; copying a turn header no longer includes a literal bullet from Word Counter.

`Studio.lab Settings & Update Experience` (`content.js`, `background.js`, `sl-panel.css`).
* **Fixed:** `Settings Light Theme Contrast`.
  * *Native Hover & Readable Controls:* The Studio.lab Settings entry matches AI Studio's native menu hover; search and tabs retain clear text, borders, and selected states.
  * *Diagnostic Snapshot:* The technical JSON preview uses a consistent dark code surface and high-contrast text in both themes.
* **Redesigned:** `Info Tab`.
  * *Operational Status First:* Removed the growing Active Modules list and moved system health into its own card. Diagnostics and Community & Updates remain available without a duplicate status badge.
  * *Unified Action Styling:* Update and diagnostics actions use the same button treatment as the other Settings modules; the diagnostics copy confirmation updates the correct text label.
  * *Production Controls Only:* Removed the local `Preview update notification` button and its demo-only behavior from Info, while retaining manual update checks and the real release link.
* **Added:** `GitHub Release Checks`.
  * *Bounded Network Access:* Checks the public Studio.lab Releases endpoint, caches results for 24 hours, compares full and preview versions, and falls back to cached status when GitHub is temporarily unavailable. No chat, prompt, account, or credential data is sent.
  * *Per-Version Dismissal:* A dismissed release stays dismissed without hiding a later version. The Info tab retains a manual check; dismissing the real announcement saves only that release tag.
* **Added:** `Update Announcement`.
  * *Trailer-Matched Visual:* The centered announcement uses the actual starfield, Moon, and Earth frame with the supplied logo, blue-highlighted headline, and two pill actions arranged like the provided mockup. Text uses 100% line height and zero letter spacing, with a regular-weight Studio.lab wordmark.
  * *Readable Actions:* Explicit foreground colors prevent Google AI Studio link styles from washing out button text; the action row sits 10px lower to match the reference. The dialog also supports keyboard dismissal and focus restoration.

`Repository & Documentation`.
* **Updated:** `Privacy Disclosure`.
  * *Accurate Disclosure:* README and Settings state that update checks contact only GitHub rather than claiming zero outbound requests.

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
  * *Structured Event Metadata:* Structured `__sl_requestPayload` to emit `{ version: 1, requestId, route, ts, body }`, matching the draft-saver request contract.
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
  * *Native Tool Synchronization:* In `interceptor.js`, added a listener for `__sl_setTool` delegating to `DynamicStudioAPI.setTool(name, enabled)` in the main world.

`Text Formatter` module.
* **Added:** `Mobile Combined Heading Dropdown (H ▾)`.
  * *Compact Space-Saving Control:* On viewports $\le 768\text{px}$, individual `H1`, `H2`, `H3` buttons are condensed into a single `H ▾` dropdown button, saving over 60px of toolbar width and preventing awkward line wraps on mobile.

## v2.0-preview-4-hotfix-1
**Smart Optimizer Immediate Chat Entry & Selective Turn Navigator Restoration**

`Optimizer (Smart / Buffered)` module.
* **Fixed:** `Immediate Optimizer Application upon Chat Entry`.
  * *Fast-Track Initial Entry:* Introduced an `isInitialEntry` lifecycle state triggered on extension initialization and SPA route changes (`onRouteChange`). As soon as turns load and reach the bottom, older turns are buffered immediately without waiting for a 5-second stationary delay.
  * *Human Scroll vs. Programmatic Scroll Isolation:* Separated true user scroll interactions (`wheel`, `touchmove`, navigation keys) from passive layout `scroll` events. Angular's turn rendering, autoscrolling, and image loading no longer falsely refresh `lastUserScrollTime` or prevent buffering.
  * *Adaptive Bottom Detection:* Broadened settling tolerance (`distFromBottom <= 350px` or viewport visibility of the final turn), allowing initial-entry buffering when the final turn is visible or the viewport is near the bottom.

`Modern Web Chat` module.
* **Fixed:** `Selective Turn Navigator Restoration & Viewport-Aware Navigation`.
  * *Preserved Detached State on Attached Clicks:* In `jumpToTurn`, clicking any turn in the Turn Navigator (TOC popover or dash indicators) now verifies if the target turn element already exists in the DOM. If the target turn is already rendered (e.g. the second-to-last turn), `restoreDetached()` and `__sl_restoreAllTurns` are skipped, keeping all buffered turns safely detached.
  * *Non-Jarring Viewport Navigation:* If the selected turn is already visible on screen, redundant scrolling is skipped entirely and the turn is gently emphasized with `sl-turn-highlight`. Only off-screen turns trigger smooth navigation (`block: 'nearest'`), eliminating sudden jump-scrolls.

## v2.0-preview-4
**Modern Web Chat Major Overhaul, Angular 19 Signals & Architectural Stabilization**

`Core Architecture & Network Engine`.
* **Added:** `Angular 19 Signals Direct State Mutation & LView Interceptor`.
  * *LView Map Interception:* Intercepts Angular 19's internal LView registry at `document_start` in the `MAIN` execution world via multi-candidate `Map.prototype.set` monitoring with active DOM context resolution (`ms-run-settings`, `app-root`), accessing over 600–1,200 runtime component LViews.
  * *DynamicStudioAPI & Zero-Flicker Mutation:* Direct programmatic inspection and mutation of Angular 19 Writable Signals (`model.set()`, `temperature.set()`, `thinkingBudget.set()`, `maxOutputTokens.set()`, `enableSearchAsATool.set()`, `enableCodeExecution.set()`).
  * *Removed Invisible DOM Helpers:* Removed `injectInvisibleCSS()`, `toggleInvisibleDOM()`, `opacity: 0.0001` hiding and modal click-polling from the direct-signal path.
  * *Clean System Instructions Injection:* Injects instructions via native prototype descriptor (`HTMLTextAreaElement.prototype.value`) and synthetic `input` events, binding directly to Angular's `FormControl` before silently dismissing the slide panel.
* **Fixed:** `Response Recovery Toggle & Abort Delegation`.
  * *Native Abort Delegation:* In `interceptor.js`, `xhr.abort` now checks `responseRecoveryEnabled`. If Response Recovery is disabled in settings, abort calls delegate cleanly to the host environment's native abort routine, restoring user cancellation for streaming generations.
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
  * *Active Stream & Scroll Detection:* Suspends turn buffering while model responses are actively streaming or while the user is actively scrolling.
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
  * *Upward Scroll Anchoring:* Removed redundant manual `scrollTop` offsetting that conflicted with Chromium's native scroll anchoring (`overflow-anchor: auto`) while restoring earlier turns.
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
* **Changed:** Scrolling Optimization. Completely refactored `scroll-bottom.js`. Replaced expensive `setInterval` and `MutationObserver` polling loops with a highly efficient `ResizeObserver` tied strictly to the content container. The observer follows the content container during text generation.
* **Removed:** Codebase Cleansing. Completely purged the legacy DOM response-recovery mechanism and its associated state logic from the registry.

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
