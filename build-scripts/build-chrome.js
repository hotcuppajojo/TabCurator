// build-scripts/build-chrome.js

const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

// Define paths
const SRC_DIR = path.join(__dirname, '../src');
const CHROME_DIR = path.join(__dirname, '../browsers/chrome');
const BUILD_DIR = path.join(__dirname, '../build/chrome');
const DIST_DIR = path.join(__dirname, '../dist');

// Clean the build directory
function cleanBuild() {
  console.log('Cleaning previous Chrome build...');
  fs.removeSync(BUILD_DIR);
  fs.ensureDirSync(BUILD_DIR);
}

// Copy source files to build directory
function copySource() {
  console.log('Copying source files...');
  fs.copySync(SRC_DIR, path.join(BUILD_DIR, 'src'));
}

// Copy Chrome-specific manifest and configuration files
function copyChromeFiles() {
  console.log('Copying Chrome-specific files...');
  fs.copySync(path.join(CHROME_DIR, 'manifest.json'), path.join(BUILD_DIR, 'manifest.json'));
  fs.copySync(path.join(CHROME_DIR, 'icons'), path.join(BUILD_DIR, 'icons'));
}

// Optional: Minify JavaScript and CSS files in the build directory
function optimizeAssets() {
  console.log('Optimizing assets...');
  // Example: Using Terser for JavaScript minification
  const terser = require('terser');
  const jsFiles = fs.readdirSync(path.join(BUILD_DIR, 'src')).filter(file => file.endsWith('.js'));

  jsFiles.forEach(file => {
    const filePath = path.join(BUILD_DIR, 'src', file);
    const result = terser.minify(fs.readFileSync(filePath, 'utf8'));
    fs.writeFileSync(filePath, result.code);
  });

  // Add similar optimization for CSS if necessary
}

// Zip the build directory for deployment
function packageExtension() {
  console.log('Packaging Chrome extension...');
  fs.ensureDirSync(DIST_DIR);
  execSync(`zip -r ${path.join(DIST_DIR, 'chrome-extension.zip')} .`, { cwd: BUILD_DIR });
}

// Run the build steps
function buildChrome() {
  cleanBuild();
  copySource();
  copyChromeFiles();
  optimizeAssets();
  packageExtension();
  console.log('Chrome build completed successfully.');
}

// Execute the build
buildChrome();