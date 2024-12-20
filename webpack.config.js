// webpack.config.js

import path from 'path';
import { fileURLToPath } from 'url';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import webpack from 'webpack';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
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
      content: './content/content.js',
    },

    output: {
      path: path.resolve(__dirname, `build/${target}`),
      filename: '[name]/[name].js',
      clean: true,
      environment: {
        module: true,
        dynamicImport: true,
      },
    },

    devtool: env.mode === 'development' ? 'source-map' : false,

    experiments: {
      outputModule: true,
      // topLevelAwait: true,
    },

    module: {
      rules: [
        {
          test: /\.(js|jsx)$/,
          exclude: /node_modules\/(?!(@babel\/runtime))/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: [
                '@babel/preset-react',
                ['@babel/preset-env', { targets: { chrome: '88' }, modules: false }],
              ],
              plugins: [['@babel/plugin-transform-runtime', { useESModules: false }]],
            },
          },
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
        {
          test: /\.(png|svg|jpg|jpeg|gif)$/i,
          type: 'asset/resource',
        },
      ],
    },

    plugins: [
      new CopyWebpackPlugin({
        patterns: [
          { from: `browsers/${target}/manifest.json`, to: 'manifest.json' },
          { from: `browsers/${target}/icons`, to: 'icons' },
          { 
            from: path.resolve(__dirname, 'node_modules/webextension-polyfill/dist/browser-polyfill.min.js'),
            to: 'vendor/browser-polyfill.js'
          }
        ]
      }),

      new HtmlWebpackPlugin({
        filename: 'popup/popup.html',
        chunks: ['popup'],
        template: './popup/popup.html',
        inject: 'body',
      }),

      new HtmlWebpackPlugin({
        filename: 'options/options.html',
        chunks: ['options'],
        template: './options/options.html',
        inject: 'body',
      }),

      new webpack.ProvidePlugin({
        browser: require.resolve('webextension-polyfill')
      }),
    ],

    resolve: {
      extensions: ['.js', '.jsx'],
      alias: {
        'webextension-polyfill$': require.resolve('webextension-polyfill')
      }
    },

    optimization: {
      //moduleIds: 'deterministic',
      //chunkIds: 'deterministic',
    },
  };
};