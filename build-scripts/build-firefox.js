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

// Run the build steps
function buildFirefox() {
  cleanBuild();
  copySource();
  copyFirefoxFiles();
  optimizeAssets();
  packageExtension();
  console.log('Firefox build completed successfully.');
}

// Execute the build
buildFirefox();