// babel.config.js
module.exports = {
  // Set sourceType to "unambiguous" to allow both ESM and CJS
  sourceType: "unambiguous",
  
  presets: [
    '@babel/preset-react', // Add preset-react for JSX
    ["@babel/preset-env", {
      targets: { node: 'current' },  // Output modern ESM code
      modules: 'commonjs'                 // Don't transform to CommonJS by default
    }]
  ],
  plugins: [
    ['@babel/plugin-transform-runtime', { 
      regenerator: true,
      useESModules: false,
      helpers: true
    }],
    '@babel/plugin-transform-class-properties',
    '@babel/plugin-transform-object-rest-spread'
  ],
  env: {
    test: {
      // Configure Babel for Jest to use CommonJS modules
      presets: [
        ["@babel/preset-env", {
          targets: { node: "current" },
          modules: "commonjs" // Ensure modules are transformed to CommonJS
        }],
        '@babel/preset-react'
      ],
      plugins: [
        ['@babel/plugin-transform-runtime', {
          regenerator: true,
          useESModules: false,
          helpers: true
        }]
      ]
    }
  }
};
