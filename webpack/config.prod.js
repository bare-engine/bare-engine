const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const CopyPlugin = require("copy-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const HtmlReplaceWebpackPlugin = require("html-replace-webpack-plugin");
const path = require("path");
const webpack = require("webpack");
const fs = require("fs");
const CompressionPlugin = require("compression-webpack-plugin");
const rimraf = require("rimraf");
const ComponentParamPreserverPlugin = require('./ComponentParamPreserverPlugin');
const InjectInitialAssetsPlugin = require("./InjectInitialAssetsPlugin");
const { EsbuildPlugin } = require("esbuild-loader");
const createControllerProxyTransformer = require("./controllerProxyTransformer");
const createGameObjectNameTransformer = require("./gameObjectNameTransformer");


module.exports = {
    mode: "production",
    entry: "./src/game.ts",
    output: {
        path: path.resolve(process.cwd(), "dist"),
        filename: "./bundle.min.js"
    },
    resolve: {
        extensions: [".ts", ".js", ".json"],
        alias: {
        }
    },
    devtool: false,
    performance: {
        maxEntrypointSize: 2500000,
        maxAssetSize: 1200000
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: "babel-loader"
                }
            },
            {
                test: /\.tsx?$/,
                exclude: /node_modules[\\/](?!bare-engine)/,
                use: [
                    {
                        loader: "ts-loader",
                        options: {
                            transpileOnly: false,
                            getCustomTransformers: (program) => ({
                                before: [createControllerProxyTransformer(program), createGameObjectNameTransformer(program)]
                            })
                        }
                    }
                ]
            },
            {
                test: [/\.vert$/, /\.frag$/],
                use: "raw-loader"
            },
            {
                test: /\.(gif|png|jpe?g|svg|xml|glsl)$/i,
                use: "file-loader"
            },
            {
                test: /\.json$/,
                type: "json"
            }
        ]
    },
    optimization: {
        minimizer: [
            new EsbuildPlugin({
                target: "es2020",
                legalComments: "none",
                minify: true,
                keepNames: true
            })
        ]
    },
    plugins: [
        new CleanWebpackPlugin(),
        new HtmlWebpackPlugin({
            template: "./public/index.html",
            inject: false,
            minify: false
        }),
        new HtmlReplaceWebpackPlugin([
            {
                pattern: /<!-- js:bootstrap -->/g,
                replacement: '<script src="./bundle.min.js"></script>',
                scriptLoading: "blocking",
                inject: 'head'
            }
        ]),
		new webpack.DefinePlugin({
			__DEV__: JSON.stringify(false)
		}),
        new InjectInitialAssetsPlugin(),
        new CopyPlugin({
            patterns: [{ from: "public", to: "", globOptions: { ignore: ["**/index.html"] } }]
        }),
        new (class {
            apply(compiler) {
                compiler.hooks.done.tap("Remove EmojiData", () => {
                    rimraf.sync("./dist/assets/data/emojiData.json");
                });
            }
        })()
    ]
};
