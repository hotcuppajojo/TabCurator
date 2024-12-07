module.exports = {
  presets: [
    ['@babel/preset-env', { 
      targets: { node: 'current' },
      modules: 'commonjs' 
    }],
    '@babel/preset-react'
  ],
  plugins: [
    '@babel/plugin-transform-runtime',
    '@babel/plugin-transform-modules-commonjs'
  ]
};