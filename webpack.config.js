// webpack.config.js

const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = (env) => {
  const target = env.target || 'chrome';

  return {
    entry: {
      background: './src/background/background.js',
      popup: './src/popup/popup.jsx',
      options: './src/options/options.jsx',
      content: './src/content/content.js'
    },
    output: {
      path: path.resolve(__dirname, `build/${target}`),
      filename: '[name]/[name].js',
      clean: true
    },
    module: {
      rules: [
        {
          test: /\.(js|jsx)$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-react', '@babel/preset-env'],
            },
          },
        }
      ]
    },
    plugins: [
      new CopyWebpackPlugin({
        patterns: [
          { from: `browsers/${target}/manifest.json`, to: 'manifest.json' },
          { from: `browsers/${target}/icons`, to: 'icons' },
          { from: 'node_modules/webextension-polyfill/dist/browser-polyfill.js', to: 'vendor/browser-polyfill.js' },
          { from: 'src/popup/popup.html', to: 'popup/popup.html' },
          { from: 'src/options/options.html', to: 'options/options.html' },
          { from: 'rules', to: 'rules' },
        ]
      })
    ],
    resolve: {
      extensions: ['.js', '.jsx'],
      modules: [
        'node_modules',
        path.resolve(__dirname, 'src')
      ],
      alias: {
        utils: path.resolve(__dirname, 'src/utils')
      }
    },
    mode: env.mode || 'production'
  };
};