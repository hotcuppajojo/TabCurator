// babel.config.js

module.exports = {
  presets: [
    ['@babel/preset-env', {
      targets: { node: 'current' },
      useBuiltIns: 'usage',
      corejs: 3,
      modules: 'auto' // Enable automatic module transformation
    }],
    ['@babel/preset-react', {
      runtime: 'automatic'
    }]
  ],
  // Enable faster builds in development
  compact: process.env.NODE_ENV === 'production'
};