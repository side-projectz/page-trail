module.exports = {
  mode: "production",
  entry: './dev/background.js',
  output: {
    path: __dirname + '/dist',
    filename: 'background.js'
  },
  optimization: {
    minimize: false // This disables the minification
  }
}