const path = require("path");
const fs = require("fs");
const projectRequire = require("./projectRequire");
const { CleanWebpackPlugin } = projectRequire("clean-webpack-plugin");
const CopyPlugin = projectRequire("copy-webpack-plugin");
const HtmlWebpackPlugin = projectRequire("html-webpack-plugin");
const HtmlReplaceWebpackPlugin = projectRequire("html-replace-webpack-plugin");
const webpack = projectRequire("webpack");
const InjectInitialAssetsPlugin = require("./InjectInitialAssetsPlugin");
const GenerateLayersPlugin = require("./GenerateLayersPlugin");
const { EsbuildPlugin } = projectRequire("esbuild-loader");
const createControllerProxyTransformer = require("./controllerProxyTransformer");
const createGameObjectNameTransformer = require("./gameObjectNameTransformer");
const projectRoot = process.cwd();
const projectPackage = require(path.join(projectRoot, "package.json"));
const htmlOptions = projectPackage.bareEngine?.index || {};
const engineIndexHtmlPath = path.resolve(__dirname, "../config/index.html");
const engineEditorHtmlPath = path.resolve(__dirname, "../config/editor.html");


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
            template: engineIndexHtmlPath,
            title: htmlOptions.title || "Bare Game",
            backgroundColor: htmlOptions.backgroundColor || "rgb(255, 255, 255)",
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
        new GenerateLayersPlugin(),
        new CopyPlugin({
            patterns: [
                { from: engineEditorHtmlPath, to: "editor.html" },
                { from: "public", to: "", globOptions: { ignore: ["**/index.html", "**/editor.html"] } }
            ]
        }),
        new (class {
            apply(compiler) {
                compiler.hooks.done.tap("Remove EmojiData", () => {
                    fs.rmSync(path.resolve(process.cwd(), "dist/assets/data/emojiData.json"), {
                        force: true
                    });
                });
            }
        })()
    ]
};
