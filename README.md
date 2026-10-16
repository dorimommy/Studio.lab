# Studio.lab

An unofficial browser extension for Google AI Studio, with controls for long chats, response recovery and a customizable workspace.

## Install

Use Chrome 116 or newer, or a compatible Chromium browser.

1. Download the extension ZIP from [Releases](https://github.com/dorimommy/Studio.lab/releases).
2. Extract the ZIP to a folder you will keep on your computer.
3. Open `chrome://extensions` or `edge://extensions` and enable **Developer mode**.
4. Choose **Load unpacked**, then select the extracted folder containing `manifest.json`.
5. Open or reload [Google AI Studio](https://aistudio.google.com/). Its **Settings** button opens the combined Google AI Studio and Studio.lab settings.

To update, replace the files in the existing extension folder with the new release, click **Reload** on its extension card, and reload open AI Studio tabs. The extension also checks GitHub for release announcements; it does not install updates automatically.

## Chat and workspace features

- **Fast chat opening:** Opens saved chats with the latest 20 message views. Scrolling up to the history boundary or using history controls requests older messages in small batches. The full conversation stays available to AI Studio for model context, editing and saving. Native find, navigation to older messages and **Restore Everything** can render the complete history. Unsupported frontend versions use native rendering.
- **Buffered history controls:** Hides older rendered messages in place while retaining their native nodes and controls. **Show earlier** reveals more history; **Restore Everything** reveals the full conversation. Physical cleanup is a separate, explicit option.
- **Response Recovery:** Keeps available streamed text visible when client-side processing interrupts a reply. It cannot recover content the server never returned.
- **Modern Web Chat:** Adds an alternate chat layout, model and thinking controls, media actions and a turn navigator, with desktop and mobile layouts.
- **Prompt tools:** Markdown formatting, keyboard shortcuts, draft autosave and restoration, word and character counts, and scroll-to-bottom controls.
- **New-chat defaults:** Saved profiles for model settings, tools and system instructions.
- **Chat Export:** Downloads conversations as JSON or Markdown.
- **Interface visibility:** Keeps the personalized welcome greeting while hiding welcome promotions and examples. Sidebar promotions have their own switch; actual request and quota errors remain visible.
- **Telemetry blocking:** Blocks supported tracking requests through browser rules and request interception.

**Fast chat opening** is enabled by default under **Settings → Performance → Chat opening**. Older views load on demand rather than mounting the entire history in the background. You can turn features on or off independently in Settings.

## Settings

Settings opens fullscreen with shared search, desktop navigation and a mobile menu drawer. It includes Studio.lab controls alongside AI Studio's original theme, prompt submission key, autocomplete, applet notification and microphone controls. AI Studio saves its own preferences.

Use **Ctrl+K** to search settings and actions. **Info** contains update checks and diagnostics. The [changelog](CHANGELOG.md) records the technical changes and release history.

## Optional accounts and Market

Studio.lab works locally without an account. **Settings → Account** offers Google sign-in and synchronization of selected extension preferences. It includes first-sync choices, conflict handling, pause/resume, export, sign-out, cloud-backup deletion and account deletion. Sync excludes chats, drafts, system instructions, default profiles, API credentials and AI Studio's own preferences.

**Settings → Market** contains Discover, Saved and Your creations. Browse themes and system prompts, install local copies, or create a private draft or public item. Signed-in users can like items, save bookmarks across devices and follow creators. Account provides an automatically assigned public nickname and unique @tag that you can edit; your Google name and email are not copied into that profile.

Themes apply to **Modern Web Chat**. They use bounded color and opacity controls; theme creation and editing are available on computers. The independent preview uses a fixed public sample conversation. Settings, Account and Market retain their own appearance. JSON import/export and theme reset are available, and installed copies continue to work after sign-out.

Public profiles can display verification, staff or moderator badges. Account includes moderator applications. Paid verification is currently unavailable.

## Privacy and security

Feature code runs locally, with no remotely loaded extension code or extension analytics. Local preferences and drafts use browser storage.

The extension contacts GitHub for release checks. Optional Google sign-in and cloud features use the bundled Supabase backend. Preference sync sends only the allowlisted extension settings. Saving a cloud draft, publishing an item and using social features send the content or action you choose. The theme preview does not read or upload your chats.

Account tokens stay in private extension-origin storage, outside the AI Studio page. The server derives ownership from the authenticated account and validates cloud requests. See [SECURITY.md](SECURITY.md) for security boundaries and vulnerability reporting.

## Support

Report bugs and suggest features through [GitHub Issues](https://github.com/dorimommy/Studio.lab/issues). News and discussion are also posted in [r/GoogleAIStudio](https://www.reddit.com/r/GoogleAIStudio/). You can support development through [Ko-fi](https://ko-fi.com/astierdoriana).

Studio.lab is not affiliated with or endorsed by Google. For AI Studio platform issues, consult [Google's documentation](https://ai.google.dev/aistudio).
