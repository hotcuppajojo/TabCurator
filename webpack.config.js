const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = (env) => {
  const target = env.target || 'chrome'; // Default to Chrome if no target is specified

  return {
    entry: {
      popup: './src/popup/popup.jsx',
      options: './src/options/options.jsx',
      // ...other entries...
    },
    output: {
      path: path.resolve(__dirname, `build/${target}`),
      filename: '[name].bundle.js',
    },
    module: {
      rules: [
        // ...existing rules...
        {
          test: /\.jsx?$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-react'],
            },
          },
        },
      ],
    },
    plugins: [
      // ...existing plugins...
      new CopyWebpackPlugin({
        patterns: [
          {
            from: `browsers/${target}/manifest.json`,
            to: path.resolve(__dirname, `build/${target}/manifest.json`),
          },
          {
            from: `browsers/${target}/icons`,
            to: path.resolve(__dirname, `build/${target}/icons`),
          },
          {
            from: 'src/vendor/browser-polyfill.js',
            to: path.resolve(__dirname, `build/${target}/vendor/browser-polyfill.js`),
          },
          // ...additional vendor files if necessary...
        ],
      }),
    ],
    resolve: {
      extensions: ['.js', '.jsx'],
    },
    mode: 'production',
    // ...other configurations...
  };
};