// babel.config.js
module.exports = {
  // Set sourceType to "unambiguous" to allow both ESM and CJS
  sourceType: "unambiguous",
  
  presets: [
    ["@babel/preset-env", {
      targets: { 
        chrome: "88"
      },
      modules: "auto",
      useBuiltIns: "entry",
      corejs: 3
    }],
    ["@babel/preset-react", {
      runtime: "automatic"
    }]
  ],
  plugins: [
    ["@babel/plugin-transform-runtime", { 
      corejs: 3,
      helpers: true,
      regenerator: true
    }]
  ]
};
