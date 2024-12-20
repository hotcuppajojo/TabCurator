// babel.config.js
module.exports = {
  // Set sourceType to "unambiguous" to allow both ESM and CJS
  sourceType: "unambiguous",
  
  presets: [
    ["@babel/preset-env", {
      targets: { 
        node: 'current',
        chrome: '88'
      },
      modules: 'commonjs'
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
};
