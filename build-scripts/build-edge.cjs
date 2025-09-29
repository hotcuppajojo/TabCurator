
const fs = require('fs');
const path = require('path');

function buildEdge() {
  const manifestPath = path.join(__dirname, '..', 'manifest.json');
  const manifest = require(manifestPath);

  // Modify manifest for Edge if necessary
  // Edge supports Manifest V3, so changes may be minimal

  // Save modified manifest
  fs.writeFileSync(
    path.join(__dirname, '..', 'dist', 'edge', 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  console.log("Edge build completed.");
}

buildEdge();