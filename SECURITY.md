# Security Policy

## Supported Versions

Studio.lab is a community-driven project. We always recommend using the latest available version from the `main` branch to ensure you have the most up-to-date performance improvements and security patches.

## Reporting a Vulnerability

Because Studio.lab operates entirely locally within your browser and does not connect to any external third-party servers, the attack surface is extremely minimal. All user data, configuration, and state are strictly contained within `chrome.storage.local`.

If you do discover a security vulnerability (for example, related to DOM injection, content script isolation, or data handling), please **open an issue** directly on this GitHub repository. 

Because the extension has no backend and cannot expose sensitive user data to external servers, public disclosure in the issues section is perfectly acceptable.

## Security Architecture Notes
* **Zero External Dependencies:** We do not load any remote scripts or assets.
* **Zero Telemetry:** The extension does not collect or transmit any analytical data.
* **Local Only:** All settings and bypass states live exclusively in your local browser storage.
