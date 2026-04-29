const path = require("node:path");
const webpack = require("webpack");
const createControllerProxyTransformer = require("../../webpack/controllerProxyTransformer");
const createGameObjectNameTransformer = require("../../webpack/gameObjectNameTransformer");

module.exports = {
  mode: "development",
  entry: path.resolve(__dirname, "src/game.ts"),
  output: {
    filename: "browser-tests.js",
    path: path.resolve(__dirname, "public"),
    clean: false,
  },
  resolve: {
    extensions: [".ts", ".js"],
    alias: {
      "bare-engine": path.resolve(__dirname, "../../src/index.ts"),
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        include: path.resolve(__dirname, "src"),
        use: {
          loader: "ts-loader",
          options: {
            transpileOnly: true,
            getCustomTransformers: () => ({
              before: [
                createControllerProxyTransformer(),
                createGameObjectNameTransformer(),
              ],
            }),
          },
        },
      },
      {
        test: /\.ts$/,
        include: path.resolve(__dirname, "../../src"),
        use: {
          loader: "ts-loader",
          options: {
            transpileOnly: true,
            getCustomTransformers: () => ({
              before: [
                createControllerProxyTransformer(),
                createGameObjectNameTransformer(),
              ],
            }),
          },
        },
        exclude: /node_modules/,
      },
      {
        test: /\.(frag|vert)$/,
        type: "asset/source",
      },
    ],
  },
  plugins: [
    new webpack.DefinePlugin({
      __DEV__: JSON.stringify(true),
    }),
  ],
  devtool: false,
};
