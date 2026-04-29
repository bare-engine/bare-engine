const { sources } = require('webpack');

class ComponentParamPreserverPlugin {
    constructor(options = {}) {
        this.classPattern = options.classPattern || /Component$/;
        this.debug = options.debug || false;
        this.reservedParams = new Set();
    }

    apply(compiler) {
        const pluginName = 'ComponentParamPreserverPlugin';

        // Extract constructor params BEFORE minification
        compiler.hooks.compilation.tap(pluginName, (compilation) => {
            compilation.hooks.optimizeModules.tap(pluginName, (modules) => {
                for (const module of modules) {
                    if (!module._source) continue;
                    const sourceCode = module._source.source();
                    this.extractComponentParams(sourceCode);
                }
            });
        });

        // Inject reserved params into Terser BEFORE minification
        compiler.hooks.afterEnvironment.tap(pluginName, () => {
            const minimizers = compiler.options.optimization?.minimizer || [];
            minimizers.forEach((minimizer) => {
                if (minimizer.constructor.name === 'TerserPlugin') {
                    minimizer.options.terserOptions = minimizer.options.terserOptions || {};
                    minimizer.options.terserOptions.mangle = minimizer.options.terserOptions.mangle || {};
                    minimizer.options.terserOptions.mangle.reserved = [
                        ...(minimizer.options.terserOptions.mangle.reserved || []),
                        ...Array.from(this.reservedParams),
                    ];
                    if (this.debug) {
                        console.log(`${pluginName}: Injected reserved params:`, this.reservedParams);
                    }
                }
            });
        });

        compiler.hooks.done.tap(pluginName, () => {
            if (this.debug && this.reservedParams.size > 0) {
                console.log(`${pluginName}: Preserved ${this.reservedParams.size} parameter names:`);
                console.log([...this.reservedParams].join(', '));
            }
        });
    }

    extractComponentParams(source) {
        const constructorRegex = /class\s+(\w*Component\w*)\s*(?:extends\s+\w+\s*)?\{[\s\S]*?constructor\s*\(\s*([^)]*?)\s*\)/g;
        let match;

        while ((match = constructorRegex.exec(source)) !== null) {
            const className = match[1];
            const params = match[2];

            if (!this.classPattern.test(className)) continue;

            if (params.trim()) {
                const paramList = params.split(',').map(p =>
                    p.trim()
                     .replace(/=.*$/, '')         // remove default values
                     .replace(/:\s*.*$/, '')      // remove TS types
                     .replace(/\{|\}|\[|\]/g, '') // remove destructuring brackets
                     .trim()
                ).filter(p => p && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(p));

                paramList.forEach(param => this.reservedParams.add(param));

                if (this.debug && paramList.length) {
                    console.log(`  ${className}: ${paramList.join(', ')}`);
                }
            }
        }
    }
}

module.exports = ComponentParamPreserverPlugin;
