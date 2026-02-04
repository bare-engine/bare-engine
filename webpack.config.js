const path = require("path");

module.exports = {
  mode: "production",
  entry: "./src/index.ts",
  output: {
    filename: "bare-engine.js",
    path: path.resolve(__dirname, "dist"),
    library: {
      name: "BareEngine",
      type: "umd",
    },
    globalObject: "this",
    clean: true,
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
      {
        test: /\.(frag|vert)$/,
        type: "asset/source",
      },
    ],
  },
  devtool: "source-map",
};
