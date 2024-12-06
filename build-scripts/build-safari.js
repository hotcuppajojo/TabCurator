const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

// Define paths for build process
const SRC_DIR = path.join(__dirname, '../src');
const SAFARI_DIR = path.join(__dirname, '../browsers/safari');
const BUILD_DIR = path.join(__dirname, '../build/safari');
const DIST_DIR = path.join(__dirname, '../dist/safari');

// Ensure a clean build directory
function cleanBuild() {
  console.log('Cleaning previous Safari build...');
  fs.removeSync(BUILD_DIR);
  fs.ensureDirSync(BUILD_DIR);
}

// Copy source files to the build directory
function copySource() {
  console.log('Copying source files...');
  fs.copySync(SRC_DIR, path.join(BUILD_DIR, 'src'));
}

// Copy Safari-specific files to the build directory
function copySafariFiles() {
  console.log('Copying Safari-specific files...');
  fs.copySync(path.join(SAFARI_DIR, 'manifest.json'), path.join(BUILD_DIR, 'manifest.json'));
  fs.copySync(path.join(SAFARI_DIR, 'icons'), path.join(BUILD_DIR, 'icons'));
}

// Copy vendor files to the build directory
function copyVendorFiles() {
  console.log('Copying vendor files...');
  fs.copySync(path.join(__dirname, '../src/vendor/browser-polyfill.js'), path.join(BUILD_DIR, 'vendor/browser-polyfill.js'));
}

// Optimize assets using Webpack
function optimizeAssets() {
  console.log('Optimizing assets with Webpack...');
  execSync('webpack --env target=safari --config webpack.config.js', { stdio: 'inherit' });
}

// Modify the manifest file for Safari compatibility
function modifyManifest() {
  console.log('Modifying manifest for Safari...');
  const manifestPath = path.join(BUILD_DIR, 'manifest.json');
  const manifest = require(manifestPath);

  // Update manifest version and browser-specific settings
  manifest.manifest_version = 2;
  manifest.browser_specific_settings = {
    gecko: {
      id: "{your-extension-id}@example.com",
      strict_min_version: "68.0"
    }
  };

  // Remove service worker and add background scripts
  delete manifest.background.service_worker;
  manifest.background = {
    scripts: ["src/background/background.js"]
  };

  // Write the updated manifest back to the build directory
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

// Package the Safari extension into a ZIP file
function packageExtension() {
  console.log('Packaging Safari extension...');
  fs.ensureDirSync(DIST_DIR);
  execSync(`zip -r ${path.join(DIST_DIR, 'safari-extension.zip')} .`, { cwd: BUILD_DIR });
}

// Execute the build steps sequentially
function buildSafari() {
  cleanBuild();
  copySource();
  copySafariFiles();
  copyVendorFiles();
  optimizeAssets();
  modifyManifest();
  packageExtension();
  console.log('Safari build completed successfully.');
}

buildSafari();