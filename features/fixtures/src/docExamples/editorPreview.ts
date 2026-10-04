import { Color, EditorScene, Scene } from 'bare-engine';

// Deterministic, asset-free scene used by scripts/captureDocs.cjs.
export class EditorPreview extends Scene
{
    constructor()
    {
        super({
            name: 'Documentation example',
            settings: { gridEnabled: true, gridSize: 32 },
            layers: ['objects'],
            prefabs: [
                { name: 'player', texture: 'PIXEL', scale: { x: 32, y: 48 }, color: '#ffb454' },
                { name: 'platform', texture: 'PIXEL', scale: { x: 160, y: 24 }, color: '#68d5ba' },
                { name: 'goal', texture: 'PIXEL', scale: { x: 24, y: 64 }, color: '#b9a0ff' },
            ],
            categories: { gameplay: { entries: ['player', 'platform', 'goal'], expanded: true } },
        });
    }

    async OnStart()
    {
        bare.SetBackgroundColor(Color.fromHex('#172338'));
        const level = await this.level.Load({
            name: 'first-level',
            dimensions: { width: 800, height: 448 },
            entitiesByLayer: { objects: [
                { extends: 'platform', position: { x: 64, y: 352 } },
                { extends: 'player', position: { x: 96, y: 304 } },
                { extends: 'platform', position: { x: 288, y: 256 } },
                { extends: 'platform', position: { x: 512, y: 160 } },
                { extends: 'goal', position: { x: 608, y: 96 } },
            ] },
        });
        await bare.scene.Add(EditorScene, { levelPathOrData: level, settingsHandler: this.settingsHandler });
    }
}
