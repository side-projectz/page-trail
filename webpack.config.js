module.exports = {
  mode: "production",
  entry: { 
    background: './dev/background.ts',
    contentScript: './dev/contentScript.ts',
   },
  module: {
    rules: [
      {
        test: /\.ts?$/,
        use: [{
          loader: 'ts-loader',
          options: {
            configFile: (__dirname + '/tsconfig.chrome.json') // Path to your custom tsconfig
          }
        }],
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  output: {
    filename: '[name].js',
    path: (__dirname + '/dist')
  },
  optimization: {
    minimize: true // This disables the minification
  }
}