// webpack.config.js

import path from 'path';
import { fileURLToPath } from 'url';

// Define __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import CopyWebpackPlugin from 'copy-webpack-plugin';
import webpack from 'webpack'; // Ensure webpack is imported

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
      filename: '[name]/[name].js', // Outputs as background/background.js, popup/popup.js, etc.
      clean: true,
      module: true, // Ensure output as ES modules
      library: {
        type: 'module' // Adjust target to module type
      }
    },
    devtool: env.mode === 'development' ? 'source-map' : false, // Enable source maps in development
    experiments: {
      outputModule: true // Enable module output
    },
    target: ['web', 'es2020'], // Adjust target for modern web extensions
    module: {
      rules: [
        {
          test: /\.(js|jsx)$/,
          exclude: /node_modules/, // Ensure polyfill is included
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-react', '@babel/preset-env'],
              plugins: ['@babel/plugin-transform-runtime']
            },
          },
        }
      ]
    },
    plugins: [
      new CopyWebpackPlugin({
        patterns: [
          // { from: path.resolve(__dirname, 'public'), to: 'public' }, // Ensure 'public' directory exists
          { from: `browsers/${target}/manifest.json`, to: 'manifest.json' },
          { from: `browsers/${target}/icons`, to: 'icons' },
          { from: 'popup/popup.html', to: 'popup/popup.html' },
          { from: 'popup/test-helpers.js', to: 'popup/test-helpers.js' }, // Treat as static
          { from: 'options/options.html', to: 'options/options.html' },
          { from: 'rules', to: 'rules' },
        ]
      }),
      new webpack.ProvidePlugin({
        browser: 'webextension-polyfill'
      }) // Ensure webextension-polyfill is bundled
    ],
    resolve: {
      extensions: ['.js', '.jsx'],
      modules: [
        'node_modules',
        path.resolve(__dirname)
      ],
    },
    externals: {
    }
  };
};