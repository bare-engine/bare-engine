const fs = require('node:fs');
const path = require('node:path');

function collectReferences(value, references) {
    if (!value || typeof value !== 'object') return;
    if (typeof value.extends === 'string') references.add(value.extends);
    for (const child of Object.values(value)) collectReferences(child, references);
}

// Check disk references before deleting IDs: the editor may have only one level loaded.
// Read failures abort the save rather than risk removing a referenced ID.
function cleanSettingsUIDs(settingsData, publicDir, settingsPath) {
    const references = new Set();
    collectReferences(settingsData, references);
    function scan(directory) {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const file = path.join(directory, entry.name);
            if (entry.isDirectory()) scan(file);
            else if (entry.isFile() && entry.name.endsWith('.json')
                && path.resolve(file) !== path.resolve(settingsPath)) {
                collectReferences(JSON.parse(fs.readFileSync(file, 'utf8')), references);
            }
        }
    }
    scan(publicDir);
    function clean(entities) {
        for (const entity of entities ?? []) {
            if (entity.entityUID && !references.has(entity.entityUID)) delete entity.entityUID;
            if (Array.isArray(entity.children)) clean(entity.children);
        }
    }
    clean(settingsData.prefabs);
    clean(settingsData.basePrefabs);
}

module.exports = { cleanSettingsUIDs };
