import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import { minify } from 'terser'; // Changed from `import terser from 'terser';`
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

// Separate browser-specific files to support multi-browser architecture
function copyChromeFiles() {
  console.log('Copying Chrome-specific files...');
  fs.copySync(path.join(CHROME_DIR, 'manifest.json'), path.join(BUILD_DIR, 'manifest.json'));
  fs.copySync(path.join(CHROME_DIR, 'icons'), path.join(BUILD_DIR, 'icons'));
  fs.copySync(path.join(PROJECT_DIR, 'rules'), path.join(BUILD_DIR, 'rules'));
  fs.copySync(path.join(PROJECT_DIR, 'popup', 'popup.css'), path.join(BUILD_DIR, 'popup', 'popup.css')); // Ensure popup.css is copied
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
  cleanBuild();
  
  // Run Webpack first to generate the output files
  execSync('webpack --env target=chrome --config webpack.config.js', { stdio: 'inherit' });
  
  // After webpack outputs, copy necessary files
  copyChromeFiles();
  copyNonCompiledSource();
  copyTestFiles();

  await optimizeAssets();
  
  packageExtension();
  console.log('Chrome build completed successfully.');
}

// Direct execution for CLI usage and CI/CD integration
if (__filename === process.argv[1]) { // Changed condition to properly compare file paths
  buildChrome();
}