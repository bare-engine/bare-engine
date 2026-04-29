const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, '../public/assets/data/settingsData.json');
const outputPath = path.join(__dirname, '../src/generated/layers.ts');

function toConstantCase(str) {
    return str.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
}

function generateLayers() {
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
    apply(compiler) {
        generateLayers();

        if (compiler.options.mode === 'development' && fs.existsSync(jsonPath)) {
            fs.watch(jsonPath, (eventType) => {
                if (eventType === 'change') {
                    generateLayers();
                }
            });
        }
    }
}

module.exports = GenerateLayersPlugin;
