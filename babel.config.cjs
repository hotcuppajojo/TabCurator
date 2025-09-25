// babel.config.js
module.exports = {
  // Set sourceType to "unambiguous" to allow both ESM and CJS
  sourceType: "unambiguous",
  
  presets: [
    ["@babel/preset-env", {
      targets: { 
        node: "current" // Use current Node version for tests
      },
      modules: "cjs", // Convert to CommonJS for Jest
      useBuiltIns: "usage",
      corejs: 3
    }],
    ["@babel/preset-react", {
      runtime: "automatic"
    }]
  ],
  plugins: [
    ["@babel/plugin-transform-runtime", { 
      corejs: false, // Disable corejs in runtime to avoid conflicts
      helpers: true,
      regenerator: true
    }]
  ]
};
