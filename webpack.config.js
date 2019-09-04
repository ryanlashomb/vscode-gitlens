'use strict';
/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('fs');
const path = require('path');
const glob = require('glob');
const webpack = require('webpack');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const { CleanWebpackPlugin: CleanPlugin } = require('clean-webpack-plugin');
const CircularDependencyPlugin = require('circular-dependency-plugin');
const CspHtmlPlugin = require('csp-html-webpack-plugin');
const ForkTsCheckerPlugin = require('fork-ts-checker-webpack-plugin');
const HtmlExcludeAssetsPlugin = require('html-webpack-exclude-assets-plugin');
const HtmlPlugin = require('html-webpack-plugin');
const ImageminPlugin = require('imagemin-webpack-plugin').default;
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = function(env, argv) {
	env = env || {};
	env.analyzeBundle = Boolean(env.analyzeBundle);
	env.analyzeDeps = Boolean(env.analyzeDeps);
	env.production = env.analyzeBundle || Boolean(env.production);
	env.optimizeImages = Boolean(env.optimizeImages) || (env.production && !env.analyzeBundle);

	if (!env.optimizeImages && !fs.existsSync(path.resolve(__dirname, 'images/settings'))) {
		env.optimizeImages = true;
	}

	return [getExtensionConfig(env), getWebviewsConfig(env)];
};

function getExtensionConfig(env) {
	/**
	 * @type any[]
	 */
	const plugins = [
		new CleanPlugin({ cleanOnceBeforeBuildPatterns: ['**/*', '!**/webviews/**'] }),
		new ForkTsCheckerPlugin({
			async: false,
			eslint: true,
			useTypescriptIncrementalApi: true
		})
	];

	if (env.analyzeDeps) {
		plugins.push(
			new CircularDependencyPlugin({
				cwd: __dirname,
				exclude: /node_modules/,
				failOnError: false,
				onDetected: function({ module: webpackModuleRecord, paths, compilation }) {
					if (paths.some(p => /container\.ts/.test(p))) return;

					compilation.warnings.push(new Error(paths.join(' -> ')));
				}
			})
		);
	}

	if (env.analyzeBundle) {
		plugins.push(new BundleAnalyzerPlugin());
	}

	return {
		name: 'extension',
		entry: './src/extension.ts',
		mode: env.production ? 'production' : 'development',
		target: 'node',
		node: {
			__dirname: false
		},
		devtool: 'source-map',
		output: {
			libraryTarget: 'commonjs2',
			filename: 'extension.js'
		},
		optimization: {
			minimizer: [
				new TerserPlugin({
					cache: true,
					parallel: true,
					sourceMap: true,
					terserOptions: {
						ecma: 8,
						// Keep the class names otherwise @log won't provide a useful name
						// eslint-disable-next-line @typescript-eslint/camelcase
						keep_classnames: true,
						module: true
					}
				})
			]
		},
		externals: {
			vscode: 'commonjs vscode'
		},
		module: {
			rules: [
				{
					exclude: /node_modules|\.d\.ts$/,
					test: /\.tsx?$/,
					use: {
						loader: 'ts-loader',
						options: {
							transpileOnly: true,
							experimentalWatchApi: true
						}
					}
				}
			]
		},
		resolve: {
			extensions: ['.ts', '.tsx', '.js', '.jsx', '.json']
		},
		plugins: plugins,
		stats: {
			all: false,
			assets: true,
			builtAt: true,
			env: true,
			errors: true,
			timings: true,
			warnings: true
		}
	};
}

function getWebviewsConfig(env) {
	const clean = ['**/*'];
	if (env.optimizeImages) {
		console.log('Optimizing images (src/webviews/apps/images/settings/*.png)...');
		clean.push(path.resolve(__dirname, 'images/settings/*'));
	}

	const cspPolicy = {
		'default-src': "'none'",
		'img-src': ['vscode-resource:', 'https:', 'data:'],
		'script-src': ['vscode-resource:', "'nonce-Z2l0bGVucy1ib290c3RyYXA='"],
		'style-src': ['vscode-resource:']
	};

	if (!env.production) {
		cspPolicy['script-src'].push("'unsafe-eval'");
	}

	/**
	 * @type any[]
	 */
	const plugins = [
		new CleanPlugin({ cleanOnceBeforeBuildPatterns: clean }),
		new ForkTsCheckerPlugin({
			tsconfig: path.resolve(__dirname, 'tsconfig.webviews.json'),
			async: false,
			eslint: true,
			useTypescriptIncrementalApi: true
		}),
		new MiniCssExtractPlugin({
			filename: '[name].css'
		}),
		new HtmlPlugin({
			excludeAssets: [/.+-styles\.js/],
			excludeChunks: ['timeline', 'timeline-styles', 'welcome'],
			template: 'settings/index.html',
			filename: path.resolve(__dirname, 'dist/webviews/settings.html'),
			inject: true,
			cspPlugin: {
				enabled: true,
				policy: cspPolicy,
				nonceEnabled: {
					'script-src': true,
					'style-src': true
				}
			},
			minify: env.production
				? {
						removeComments: true,
						collapseWhitespace: true,
						removeRedundantAttributes: true,
						useShortDoctype: true,
						removeEmptyAttributes: true,
						removeStyleLinkTypeAttributes: true,
						keepClosingSlash: true,
						minifyCSS: true
				  }
				: false
		}),
		new HtmlPlugin({
			excludeAssets: [/.+-styles\.js/],
			excludeChunks: ['main-styles', 'settings', 'welcome'],
			template: 'timeline/index.html',
			filename: path.resolve(__dirname, 'dist/webviews/timeline.html'),
			inject: true,
			cspPlugin: {
				enabled: true,
				policy: cspPolicy,
				nonceEnabled: {
					'script-src': true,
					'style-src': true
				}
			},
			minify: env.production
				? {
						removeComments: true,
						collapseWhitespace: true,
						removeRedundantAttributes: true,
						useShortDoctype: true,
						removeEmptyAttributes: true,
						removeStyleLinkTypeAttributes: true,
						keepClosingSlash: true,
						minifyCSS: true
				  }
				: false
		}),
		new HtmlPlugin({
			excludeAssets: [/.+-styles\.js/],
			excludeChunks: ['timeline', 'timeline-styles', 'settings'],
			template: 'welcome/index.html',
			filename: path.resolve(__dirname, 'dist/webviews/welcome.html'),
			inject: true,
			cspPlugin: {
				enabled: true,
				policy: cspPolicy,
				nonceEnabled: {
					'script-src': true,
					'style-src': true
				}
			},
			minify: env.production
				? {
						removeComments: true,
						collapseWhitespace: true,
						removeRedundantAttributes: true,
						useShortDoctype: true,
						removeEmptyAttributes: true,
						removeStyleLinkTypeAttributes: true,
						keepClosingSlash: true,
						minifyCSS: true
				  }
				: false
		}),
		new HtmlExcludeAssetsPlugin(),
		new CspHtmlPlugin(),
		new ImageminPlugin({
			disable: !env.optimizeImages,
			externalImages: {
				context: path.resolve(__dirname, 'src/webviews/apps/images'),
				sources: glob.sync('src/webviews/apps/images/settings/*.png'),
				destination: path.resolve(__dirname, 'images')
			},
			cacheFolder: path.resolve(__dirname, 'node_modules', '.cache', 'imagemin-webpack-plugin'),
			gifsicle: null,
			jpegtran: null,
			optipng: null,
			pngquant: {
				quality: '85-100',
				speed: env.production ? 1 : 10
			},
			svgo: null
		})
	];

	return {
		name: 'webviews',
		context: path.resolve(__dirname, 'src/webviews/apps'),
		entry: {
			'main-styles': ['./scss/main.scss'],
			'timeline-styles': ['./scss/timeline.scss'],
			settings: ['./settings/index.ts'],
			timeline: ['./timeline/index.ts'],
			welcome: ['./welcome/index.ts']
		},
		mode: env.production ? 'production' : 'development',
		devtool: env.production ? undefined : 'eval-source-map',
		output: {
			filename: '[name].js',
			path: path.resolve(__dirname, 'dist/webviews'),
			publicPath: '#{root}/dist/webviews/'
		},
		module: {
			rules: [
				{
					exclude: /node_modules|\.d\.ts$/,
					test: /\.tsx?$/,
					use: {
						loader: 'ts-loader',
						options: {
							configFile: 'tsconfig.webviews.json',
							transpileOnly: true,
							experimentalWatchApi: true
						}
					}
				},
				{
					test: /\.scss$/,
					use: [
						{
							loader: MiniCssExtractPlugin.loader
						},
						{
							loader: 'css-loader',
							options: {
								sourceMap: true,
								url: false
							}
						},
						{
							loader: 'sass-loader',
							options: {
								sourceMap: true
							}
						}
					],
					exclude: /node_modules/
				}
			]
		},
		resolve: {
			extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
			modules: [path.resolve(__dirname, 'src/webviews/apps'), 'node_modules']
		},
		plugins: plugins,
		stats: {
			all: false,
			assets: true,
			builtAt: true,
			env: true,
			errors: true,
			timings: true,
			warnings: true
		}
	};
}
