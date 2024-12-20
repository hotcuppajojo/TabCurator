// webpack.config.js

import path from 'path';
import { fileURLToPath } from 'url';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import webpack from 'webpack';

// Define __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default (env) => {
  const target = env.target || 'chrome';

  return {
    mode: env.mode || 'production',

    entry: {
      background: './background/background.js',
      popup: './popup/popup.jsx',
      options: './options/options.jsx',
      content: './content/content.js'
    },

    output: {
      path: path.resolve(__dirname, `build/${target}`),
      filename: '[name]/[name].js',
      clean: true,
      module: true, // Output as ES modules
      library: {
        type: 'module' // Ensure output in ES module format
      }
    },

    devtool: env.mode === 'development' ? 'source-map' : false,

    experiments: {
      outputModule: true // Allow module output
    },

    // Target a service worker environment
    target: 'webworker',

    module: {
      rules: [
        {
          test: /\.(js|jsx)$/,
          exclude: /node_modules\/(?!(@babel\/runtime))/,
          use: {
            loader: 'babel-loader',
            options: {
              sourceType: 'unambiguous',
              presets: [
                '@babel/preset-react',
                ['@babel/preset-env', { targets: { esmodules: true }, modules: false }]
              ],
              plugins: [
                ['@babel/plugin-transform-runtime', { useESModules: true }]
              ]
            }
          }
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader']
        }        
      ]
    },

    plugins: [
      new CopyWebpackPlugin({
        patterns: [
          { from: `browsers/${target}/manifest.json`, to: 'manifest.json' },
          { from: `browsers/${target}/icons`, to: 'icons' },
          { from: 'popup/popup.html', to: 'popup/popup.html' },
          // { from: 'popup/test-helpers.js', to: 'popup/test-helpers.js' },
          { from: 'options/options.html', to: 'options/options.html' },
          { from: 'rules', to: 'rules' }
        ]
      }),
      new webpack.ProvidePlugin({
        browser: 'webextension-polyfill'
      })
    ],

    resolve: {
      extensions: ['.js', '.jsx'], // Add .jsx extension
      modules: [
        'node_modules',
        path.resolve(__dirname)
      ]
    },

    externals: {
      // Add externals if needed
    }
  };
};
