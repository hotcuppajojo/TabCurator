# TabCurator

## An Advanced Cross-Browser Tab Management Extension

TabCurator is a browser extension designed to streamline tab management for users who handle multiple tabs daily. Key features include intelligent grouping, memory optimization through tab suspension, and session management across Chrome, Firefox, and Safari.

## Features

- **Tab Grouping**: Automatically groups tabs by domain or user-defined categories (e.g., Work, Social).
- **Memory Optimization**: Suspends inactive tabs to conserve system resources.
- **Session Management**: Allows users to save, restore, and auto-save groups of tabs.
- **Time-Based Reminders**: Prompts users to revisit or close dormant tabs.

## Repository Structure

- **`develop`**: Main development branch where new features and fixes are integrated and tested.
- **`main`**: Stable production branch used for official releases.
- **`chrome-release`**, **`firefox-release`**, **`safari-release`**: Browser-specific branches for preparing and managing releases tailored to each browser.

## Directory Structure

```plaintext
TabCurator/
├── src/                    # Core source code (cross-browser compatible)
│   ├── popup/              # Popup UI components
│   ├── background/         # Background scripts
│   ├── content/            # Content scripts
│   └── options/            # Options/settings page
├── browsers/               # Browser-specific configuration files
│   ├── chrome/             # Chrome-specific configuration
│   ├── firefox/            # Firefox-specific configuration
│   └── safari/             # Safari-specific configuration
├── build/                  # Build output directory
├── build-scripts/          # Scripts for building extensions per browser
├── dist/                   # Distribution files
├── tests/                  # Test files
│   ├── playwright/         # Playwright integration tests
│   └── jest/               # Jest unit tests
├── .github/workflows/      # CI/CD workflow files for automated builds and deployments
├── test-results/           # Test result artifacts
├── LICENSE                 # License file
├── README.md               # Project documentation
├── package.json            # Node.js dependencies and scripts
└── playwright.config.js    # Playwright configuration
```

## License

### Proprietary

All rights reserved. Unauthorized use, modification, or distribution of this software is strictly prohibited. For licensing inquiries, please contact <jojo@petersky.dev>

Please see the LICENSE file for full details.
