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
  // Create utils directory first
  fs.ensureDirSync(path.join(BUILD_DIR, 'src/utils'));
  
  // Copy source files with proper directory structure
  fs.copySync(
    path.join(SRC_DIR, 'background'),
    path.join(BUILD_DIR, 'src/background')
  );
  fs.copySync(
    path.join(SRC_DIR, 'popup'),
    path.join(BUILD_DIR, 'src/popup')
  );
  fs.copySync(
    path.join(SRC_DIR, 'options'),
    path.join(BUILD_DIR, 'src/options')
  );
  fs.copySync(
    path.join(SRC_DIR, 'content'),
    path.join(BUILD_DIR, 'src/content')
  );
  fs.copySync(
    path.join(SRC_DIR, 'utils'),
    path.join(BUILD_DIR, 'src/utils')
  );
}

// Separate browser-specific files to support multi-browser architecture
function copyChromeFiles() {
  console.log('Copying Chrome-specific files...');
  fs.copySync(path.join(CHROME_DIR, 'manifest.json'), path.join(BUILD_DIR, 'manifest.json'));
  fs.copySync(path.join(CHROME_DIR, 'icons'), path.join(BUILD_DIR, 'icons'));
  fs.copySync(path.join(__dirname, '../rules'), path.join(BUILD_DIR, 'rules'));
}

// Copy vendor files to support additional functionalities
function copyVendorFiles() {
  console.log('Copying vendor files...');
  const vendorDir = path.join(BUILD_DIR, 'vendor');
  fs.ensureDirSync(vendorDir);

  // Corrected path to the polyfill
  fs.copySync(
    path.join(__dirname, '../node_modules/webextension-polyfill/dist/browser-polyfill.js'),
    path.join(vendorDir, 'browser-polyfill.js')
  );
}

// Minify assets to reduce extension size and improve load times
function optimizeAssets() {
  console.log('Optimizing assets...');
  
  const targetDirs = [
    path.join(BUILD_DIR, 'background'),
    path.join(BUILD_DIR, 'popup'),
    path.join(BUILD_DIR, 'options'),
    path.join(BUILD_DIR, 'content')
  ];
  
  // Find and optimize JS files in the output directories
  targetDirs.forEach(dir => {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir)
        .filter(file => file.endsWith('.js'))
        .map(file => path.join(dir, file));
        
      files.forEach(async (filePath) => {
        try {
          const code = fs.readFileSync(filePath, 'utf8');
          const result = await terser.minify(code, {
            compress: true,
            mangle: true
          });
          if (result.code) {
            fs.writeFileSync(filePath, result.code);
          }
        } catch (error) {
          console.error(`Error optimizing ${filePath}:`, error);
        }
      });
    }
  });
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
  
  // Run Webpack first to generate the output files
  execSync('webpack --env target=chrome --config webpack.config.js', { stdio: 'inherit' });
  
  copyChromeFiles();
  copyVendorFiles();
  
  // Now optimize the webpack output files
  optimizeAssets();
  
  packageExtension();
  console.log('Chrome build completed successfully.');
}

// Direct execution for CLI usage and CI/CD integration
buildChrome();