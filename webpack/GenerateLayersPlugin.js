const fs = require('fs');
const path = require('path');

function toConstantCase(str) {
    return str.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
}

function generateLayers(jsonPath, outputPath) {
    if (!fs.existsSync(jsonPath)) return;
    try {
        const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
        const data = JSON.parse(jsonContent);

        const layers = data.layers || [];

        const layerEntries = layers
            .map((name, index) => `  ${toConstantCase(name)}: ${index},`)
            .join('\n');

        const output = `// Auto-generated from settingsData.json - DO NOT EDIT
export const Layer = {
${layerEntries}
} as const;

export type Layer = typeof Layer[keyof typeof Layer];
`;

        fs.mkdirSync(path.dirname(outputPath), { recursive: true });

        const existing = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf-8') : '';
        if (existing !== output) {
            fs.writeFileSync(outputPath, output);
            console.log(`✓ Generated layers.ts with ${layers.length} layers`);
        }
    } catch (error) {
        console.error('Error generating layers:', error);
    }
}

class GenerateLayersPlugin {
    constructor(options = {}) {
        this.projectRoot = options.projectRoot || process.cwd();
        this.jsonPath = path.join(this.projectRoot, "public/assets/data/settingsData.json");
        this.outputPath = path.join(this.projectRoot, "src/generated/layers.ts");
    }

    apply(compiler) {
        generateLayers(this.jsonPath, this.outputPath);

        if (compiler.options.mode === 'development' && fs.existsSync(this.jsonPath)) {
            fs.watch(this.jsonPath, (eventType) => {
                if (eventType === 'change') {
                    generateLayers(this.jsonPath, this.outputPath);
                }
            });
        }
    }
}

module.exports = GenerateLayersPlugin;
