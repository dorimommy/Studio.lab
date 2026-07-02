# Security Policy

## Supported Versions

Studio.lab is a community-driven project. We always recommend using the latest available version from the `main` branch to ensure you have the most up-to-date performance improvements and security patches.

| Version | Supported          |
| ------- | ------------------ |
| 1.5.x   | :white_check_mark: |
| < 1.5.0 | :x:                |

## Reporting a Vulnerability

Because Studio.lab operates entirely locally within your browser and does not connect to any external third-party servers, the attack surface is extremely minimal. All user data, configuration, and state are strictly contained within `chrome.storage.local`.

If you do discover a security vulnerability (for example, related to DOM injection, content script isolation, or data handling), please do **not** open a public issue immediately.

Instead, please report it through one of the following channels:
* **Private Message:** Reach out to the maintainer via private message on Reddit at [r/GoogleAIStudio](https://www.reddit.com/r/GoogleAIStudio/).
* **GitHub Advisories:** If applicable, you can privately report vulnerabilities through GitHub's Security Advisories feature on this repository.

We will endeavor to respond to your report as quickly as possible and work with you to patch the vulnerability before public disclosure.

## Security Architecture Notes
* **Zero External Dependencies:** We do not load any remote scripts or assets.
* **Zero Telemetry:** The extension does not collect or transmit any analytical data.
* **Local Only:** All settings and bypass states live exclusively in your local browser storage.
