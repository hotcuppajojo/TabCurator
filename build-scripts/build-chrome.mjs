import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import { minify } from 'terser';
import { fileURLToPath } from 'url';

// Handle __dirname and __filename in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base paths for modular organization and cross-platform compatibility
const PROJECT_DIR = path.join(__dirname, '..');
const CHROME_DIR = path.join(PROJECT_DIR, 'browsers', 'chrome');
const BUILD_DIR = path.join(PROJECT_DIR, 'build', 'chrome');
const DIST_DIR = path.join(PROJECT_DIR, 'dist');

// Ensure clean slate for each build to prevent artifacts
function cleanBuild() {
  console.log('Cleaning previous Chrome build...');
  fs.removeSync(BUILD_DIR);
  fs.ensureDirSync(BUILD_DIR);
}

// Copy non-compiled source directories (e.g., utils)
function copyNonCompiledSource() {
  console.log('Copying non-compiled source files...');
  
  const dirsToCopy = ['utils'];

  dirsToCopy.forEach(dir => {
    const sourcePath = path.join(PROJECT_DIR, dir);
    if (fs.existsSync(sourcePath)) {
      fs.copySync(sourcePath, path.join(BUILD_DIR, dir));
    } else {
      console.warn(`Directory ${dir} not found at project root, skipping.`);
    }
  });
}

// Copy test files (including test/test.html) directly from project root
function copyTestFiles() {
  console.log('Copying test files...');
  const testSrc = path.join(PROJECT_DIR, 'test');
  const testDest = path.join(BUILD_DIR, 'test');

  if (fs.existsSync(testSrc)) {
    fs.ensureDirSync(testDest);
    fs.copySync(testSrc, testDest);
  } else {
    console.warn('No test directory found at project root, skipping test file copy.');
  }
}

// Copy browser-specific files that aren't handled by webpack
function copyChromeFiles() {
  console.log('Copying additional Chrome-specific files...');
  // Webpack already copies manifest.json, icons, and rules
  // Only copy files not handled by webpack here
  fs.copySync(path.join(PROJECT_DIR, 'popup', 'popup.css'), path.join(BUILD_DIR, 'popup', 'popup.css'));

  // Copy icons directory (icons are required and validated earlier)
  const iconsSrc = path.join(CHROME_DIR, 'icons');
  const iconsDest = path.join(BUILD_DIR, 'icons');
  if (fs.existsSync(iconsSrc)) {
    fs.copySync(iconsSrc, iconsDest);
    console.log('Icons copied to build output');
  } else {
    // Defensive: this should not happen due to earlier validation
    console.warn(`Icons source not found during copy: ${iconsSrc}`);
  }
}

// Minify assets to reduce extension size and improve load times
async function optimizeAssets() {
  console.log('Optimizing assets...');
  
  const targetDirs = [
    path.join(BUILD_DIR, 'background'),
    path.join(BUILD_DIR, 'popup'),
    path.join(BUILD_DIR, 'options'),
    path.join(BUILD_DIR, 'content')
  ];
  
  for (const dir of targetDirs) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir)
        .filter(file => file.endsWith('.js'))
        .map(file => path.join(dir, file));
        
      for (const filePath of files) {
        try {
          const code = fs.readFileSync(filePath, 'utf8');
          const result = await minify(code, { // Changed from `terser.minify` to `minify`
            compress: true,
            mangle: true
          });
          if (result.code) {
            fs.writeFileSync(filePath, result.code);
          }
        } catch (error) {
          console.error(`Error optimizing ${filePath}:`, error);
        }
      }
    }
  }
}

// Create distributable ZIP for Chrome Web Store requirements
function packageExtension() {
  console.log('Packaging Chrome extension...');
  fs.ensureDirSync(DIST_DIR);
  execSync(`zip -r ${path.join(DIST_DIR, 'chrome-extension.zip')} .`, { cwd: BUILD_DIR });
}

// Sequential build process ensures dependency order and clean state
export async function buildChrome() {
  try {
    cleanBuild();

    // Verify source files exist before building. Icons are required for
    // a valid Chrome extension and must be present in browsers/chrome/icons
    const requiredPaths = [
      path.join(CHROME_DIR, 'manifest.json'),
      path.join(PROJECT_DIR, 'popup'),
      path.join(PROJECT_DIR, 'options'),
      path.join(PROJECT_DIR, 'background'),
      path.join(CHROME_DIR, 'icons')
    ];

    for (const requiredPath of requiredPaths) {
      if (!fs.existsSync(requiredPath)) {
        throw new Error(`Required path does not exist: ${requiredPath}`);
      }
    }

    // Inject private key into manifest if key.pem exists
    const keyPath = path.join(PROJECT_DIR, 'key.pem');
    const manifestPath = path.join(CHROME_DIR, 'manifest.json');
    let manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (fs.existsSync(keyPath)) {
      const key = fs.readFileSync(keyPath, 'utf8').replace(/\r?\n/g, '');
      if (manifest.key && manifest.key === '__EXTENSION_PRIVATE_KEY__') {
        manifest.key = key;
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      }
    }

    console.log('Running webpack build...');
    execSync('webpack --env target=chrome --config webpack.config.js', { stdio: 'inherit' });

    // After webpack outputs, copy additional files
    copyChromeFiles();
    copyNonCompiledSource();
    copyTestFiles();

    await optimizeAssets();

    // Ensure dist directory exists before packaging
    fs.ensureDirSync(DIST_DIR);
    packageExtension();
    console.log('Chrome build completed successfully.');
  } catch (error) {
    console.error('Build failed:', error.message);
    throw error;
  }
}

// Direct execution for CLI usage and CI/CD integration
if (__filename === process.argv[1]) { // Changed condition to properly compare file paths
  buildChrome();
}