class PreserveComponentPropertiesPlugin {
    constructor(options = {}) {
        this.classPattern = options.classPattern || /Component$/;
        this.debug = options.debug || false;
    }

    apply(compiler) {
        const pluginName = 'PreserveComponentPropertiesPlugin';
        
        compiler.hooks.compilation.tap(pluginName, (compilation) => {
            // Hook into the optimize phase, after Terser runs
            compilation.hooks.processAssets.tap(
                {
                    name: pluginName,
                    stage: compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE + 1
                },
                (assets) => {
                    Object.keys(assets).forEach(filename => {
                        if (!filename.endsWith('.js')) return;
                        
                        const asset = assets[filename];
                        let source = asset.source();
                        
                        if (typeof source !== 'string') {
                            source = source.toString();
                        }
                        
                        // Process the source code
                        const modifiedSource = this.processSource(source);
                        
                        if (modifiedSource !== source) {
                            // Update the asset with modified source
                            compilation.updateAsset(filename, new compiler.webpack.sources.RawSource(modifiedSource));
                            
                            if (this.debug) {
                                console.log(`PreserveComponentPropertiesPlugin: Modified ${filename}`);
                            }
                        }
                    });
                }
            );
        });
    }

    processSource(source) {
        // Find Component classes and restore their constructor parameter names
        const componentClassRegex = /class\s+(\w*Component\w*)\s*\{[\s\S]*?constructor\s*\(([^)]*)\)\s*\{/g;
        
        let modifiedSource = source;
        let match;
        const processedClasses = new Set();
        
        while ((match = componentClassRegex.exec(source)) !== null) {
            const className = match[1];
            const constructorParams = match[2];
            
            if (!this.classPattern.test(className)) continue;
            if (processedClasses.has(className)) continue;
            processedClasses.add(className);
            
            if (this.debug) {
                console.log(`Found component class: ${className}`);
                console.log(`  Original constructor params: ${constructorParams}`);
            }
            
            // Check if there's a preserve comment before this class that contains original param names
            const preserveCommentRegex = new RegExp(`/\\*\\s*@preserve\\s+params:\\s*([^*]+)\\s*\\*/\\s*(?:class\\s+${className}|[\\s\\S]{0,200}class\\s+${className})`, 'g');
            const preserveMatch = preserveCommentRegex.exec(source);
            
            if (preserveMatch) {
                const originalParamNames = preserveMatch[1].split(',').map(p => p.trim());
                const minifiedParamNames = constructorParams.split(',').map(p => p.trim());
                
                if (originalParamNames.length === minifiedParamNames.length) {
                    if (this.debug) {
                        console.log(`  Restoring params: ${minifiedParamNames.join(',')} -> ${originalParamNames.join(',')}`);
                    }
                    
                    // Find the full constructor to replace both params and body
                    const constructorRegex = new RegExp(
                        `(class\\s+${className}\\s*\\{[\\s\\S]*?constructor\\s*\\()([^)]*)\\)(\\s*\\{)([\\s\\S]*?)(?=\\n\\s*\\w+\\s*\\(|\\n\\s*\\}|$)`,
                        ''
                    );
                    const fullMatch = constructorRegex.exec(modifiedSource);
                    
                    if (fullMatch) {
                        const beforeParams = fullMatch[1];
                        const oldParams = fullMatch[2];
                        const afterParamsBeforeBody = fullMatch[3];
                        const constructorBody = fullMatch[4];
                        
                        // Build new parameter list and body with all replacements
                        let newParams = oldParams;
                        let newBody = constructorBody;
                        
                        // Replace each minified param with original name
                        minifiedParamNames.forEach((minifiedName, index) => {
                            if (minifiedName && originalParamNames[index] && minifiedName !== originalParamNames[index]) {
                                // Replace in parameter list
                                const paramRegex = new RegExp(`\\b${minifiedName}\\b`, 'g');
                                newParams = newParams.replace(paramRegex, originalParamNames[index]);
                                
                                // Replace all occurrences in the constructor body
                                newBody = newBody.replace(paramRegex, originalParamNames[index]);
                            }
                        });
                        
                        // Replace the entire constructor if anything changed
                        if (newParams !== oldParams || newBody !== constructorBody) {
                            const oldConstructor = beforeParams + oldParams + afterParamsBeforeBody + constructorBody;
                            const newConstructor = beforeParams + newParams + afterParamsBeforeBody + newBody;
                            modifiedSource = modifiedSource.replace(oldConstructor, newConstructor);
                        }
                    }
                }
            }
        }
        
        return modifiedSource;
    }
}

module.exports = PreserveComponentPropertiesPlugin;