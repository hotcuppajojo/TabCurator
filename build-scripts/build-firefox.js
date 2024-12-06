// build-scripts/build-firefox.js

const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

// Define paths
const SRC_DIR = path.join(__dirname, '../src');
const FIREFOX_DIR = path.join(__dirname, '../browsers/firefox');
const BUILD_DIR = path.join(__dirname, '../build/firefox');
const DIST_DIR = path.join(__dirname, '../dist');

// Clean the build directory
function cleanBuild() {
  fs.emptyDirSync(BUILD_DIR);
}

// Copy source files to build directory
function copySource() {
  fs.copySync(SRC_DIR, BUILD_DIR, {
    filter: (src) => !src.includes('manifest.json')
  });
}

// Copy Firefox-specific manifest and configuration files
function copyFirefoxFiles() {
  fs.copySync(path.join(FIREFOX_DIR, 'manifest.json'), path.join(BUILD_DIR, 'manifest.json'));
}

// Optimize assets if needed
function optimizeAssets() {
  // Add asset optimization steps here
}

// Package the extension
function packageExtension() {
  const zipPath = path.join(__dirname, '../dist/firefox-extension.zip');
  execSync(`zip -r ${zipPath} *`, { cwd: BUILD_DIR });
  console.log('Firefox extension packaged successfully.');
}

// Modify manifest for Firefox
function modifyManifest() {
  const manifestPath = path.join(__dirname, '..', 'manifest.json');
  const manifest = require(manifestPath);

  manifest.manifest_version = 2;
  manifest.browser_specific_settings = {
    gecko: {
      id: "{your-extension-id}@example.com",
      strict_min_version: "68.0"
    }
  };

  delete manifest.background.service_worker;
  manifest.background = {
    scripts: ["src/background/background.js"]
  };

  fs.writeFileSync(
    path.join(__dirname, '..', 'dist', 'firefox', 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
}

// Run the build steps
function buildFirefox() {
  cleanBuild();
  copySource();
  copyFirefoxFiles();
  optimizeAssets();
  modifyManifest();
  packageExtension();
  console.log('Firefox build completed successfully.');
}

// Execute the build
buildFirefox();