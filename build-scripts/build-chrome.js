// build-scripts/build-chrome.js
// Centralized build script for Chrome extension packaging and optimization

const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const terser = require('terser');

// Base paths for modular organization and cross-platform compatibility
const SRC_DIR = path.join(__dirname, '../src');
const CHROME_DIR = path.join(__dirname, '../browsers/chrome');
const BUILD_DIR = path.join(__dirname, '../build/chrome');
const DIST_DIR = path.join(__dirname, '../dist');

// Ensure clean slate for each build to prevent artifacts
function cleanBuild() {
  console.log('Cleaning previous Chrome build...');
  fs.removeSync(BUILD_DIR);
  fs.ensureDirSync(BUILD_DIR);
}

// Preserve source structure for easier debugging and maintenance
function copySource() {
  console.log('Copying source files...');
  fs.copySync(SRC_DIR, path.join(BUILD_DIR, 'src'));
}

// Separate browser-specific files to support multi-browser architecture
function copyChromeFiles() {
  console.log('Copying Chrome-specific files...');
  fs.copySync(path.join(CHROME_DIR, 'manifest.json'), path.join(BUILD_DIR, 'manifest.json'));
  fs.copySync(path.join(CHROME_DIR, 'icons'), path.join(BUILD_DIR, 'icons'));
}

// Minify assets to reduce extension size and improve load times
function optimizeAssets() {
  console.log('Optimizing assets...');
  // Terser preferred over other minifiers for better ES6+ support
  const jsFiles = fs.readdirSync(path.join(BUILD_DIR, 'src')).filter(file => file.endsWith('.js'));

  jsFiles.forEach(file => {
    // Sync operations used for build predictability and simpler error handling
    const filePath = path.join(BUILD_DIR, 'src', file);
    const result = terser.minify(fs.readFileSync(filePath, 'utf8'));
    fs.writeFileSync(filePath, result.code);
  });

  // CSS minification placeholder for future optimization needs
}

// Create distributable ZIP for Chrome Web Store requirements
function packageExtension() {
  console.log('Packaging Chrome extension...');
  fs.ensureDirSync(DIST_DIR);
  execSync(`zip -r ${path.join(DIST_DIR, 'chrome-extension.zip')} .`, { cwd: BUILD_DIR });
}

// Sequential build process ensures dependency order and clean state
function buildChrome() {
  cleanBuild();
  copySource();
  copyChromeFiles();
  optimizeAssets();
  packageExtension();
  console.log('Chrome build completed successfully.');
}

// Direct execution for CLI usage and CI/CD integration
buildChrome();