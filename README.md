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

## Branching Strategy

To maintain a clean and efficient workflow, TabCurator utilizes the following branching strategy:

- **`feature/*`**: Temporary branches for developing specific features or fixes. These branches are merged into `develop` upon completion.
- **`develop`**: The main development branch where all feature branches are integrated and tested.
- **`main`**: The stable production branch from which official releases are tagged.
- **`chrome-release`**, **`firefox-release`**, **`safari-release`**: Dedicated branches for building and deploying releases specific to each browser.

## Development Workflow

### Develop New Features

1. **Create a `feature/*` branch** for each new feature or bug fix.
2. **Implement the feature** and ensure it meets the project requirements.
3. **Merge the feature branch into `develop`** after thorough testing.

### Testing and Building

1. **All changes in `develop` trigger the Test and Build CI workflow.**
2. **Automated tests are run**, and builds are generated for Chrome, Firefox, and Safari.
3. **Build artifacts are uploaded** for further use.

### Preparing for Release

1. **Once `develop` is stable and all features are integrated, merge `develop` into `main`.**
2. **Create a version tag** (e.g., `v1.0.0`) to signify a new release.

### Release and Deploy

1. **Merging into `main` or pushing a version tag triggers the Release and Deploy CI workflow.**
2. **The extension is built, packaged, and deployed** to the respective browser stores automatically.

## Continuous Integration and Deployment (CI/CD)

TabCurator employs GitHub Actions to automate the testing, building, and deployment processes.

### Test and Build Workflow

**File:** `.github/workflows/test-and-build.yml`

**Triggers:**

- Pushes and pull requests to the `develop` branch.

**Jobs:**

- **Checkout Code**
- **Set Up Node.js**
- **Install Dependencies**
- **Run Tests**
- **Build for Each Browser**
- **Upload Build Artifacts**

### Release and Deploy Workflow

**File:** `.github/workflows/release.yml`

**Triggers:**

- Pushes to `main`, `chrome-release`, `firefox-release`, `safari-release` branches.
- Tags matching `v*.*.*`.

**Jobs:**

- **Build and Package for Each Browser**
- **Deploy to Browser Stores**

## Testing

TabCurator utilizes both Jest for unit testing and Playwright for integration testing to ensure code reliability and cross-browser compatibility.

- **Jest:** Located in `tests/jest/` for unit tests.
- **Playwright:** Located in `tests/playwright/` for integration tests across browsers.

## License

### Proprietary

All rights reserved. Unauthorized use, modification, or distribution of this software is strictly prohibited. For licensing inquiries, please contact <jojo@petersky.dev>

Please see the LICENSE file for full details.
