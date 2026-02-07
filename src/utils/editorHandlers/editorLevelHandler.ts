import { Texture } from "../../libraries/rapid-render";
import { GameObject } from "../../objects/gameObject";
import { Hitbox } from "../hitbox";
import { Color } from "../../libraries/rapid-render";
import { Helper } from "../helper";
import { assetsHandler } from "../assetsHandler";
import { Entity, LevelData, SaveData, BareEvent } from '../bareTypes';
import { EditorController } from "../../controllers/editorController";
import { HitboxType } from "../gamesTypes";
import { events, MakePath } from "../../main";
import { levelController } from "../../controllers/levelController";

/*
    LEVEL FUNCTIONALITY AND ENTITY CREATION
    Handles level loading, saving, entity creation, and level management
*/

export class EditorLevelHandler {
    public currentLevel: LevelData;
    private editorController: EditorController;

    componentsData: Record<string, Record<string, any>> = {};

    constructor(editorController: any) {
        this.editorController = editorController;
    }

    async LoadLevel(levelPath: string): Promise<LevelData> {
        const level = await Helper.loadJSON<LevelData>(levelPath);
        await this.LoadLevelFromData(level);

        return level;
    }

    async LoadLevelFromData(level: LevelData): Promise<LevelData>
    {
        this.currentLevel = level;

        this.componentsData = {};
        
        // LOAD ALL TEXTURES
        var promisesAr: Array<Promise<Texture>> = [];
        var texturesFound = new Set<string>();
        for (var layerName in level.entitiesByLayer) {
            var entities = level.entitiesByLayer[layerName];
            entities.forEach((entity: any) => {
                var entityConstructed = bare.ConstructEntity(entity);
                var imagePath = entityConstructed.imagePath;
                var fullPath = imagePath + "/" + entity.name;

                if (texturesFound.has(fullPath))
                    return;

                promisesAr.push(assetsHandler.GetTexturePromise(MakePath(imagePath!, entity.name)));
                texturesFound.add(fullPath);
            });
        }
        await Promise.all(promisesAr);

        for (var layerName in level.entitiesByLayer) {
            var entities = level.entitiesByLayer[layerName];

            var layerNameLowerCase = Helper.CapitalizeFirstLetter(layerName.toLowerCase());
            var layerI = bare.layerNames.indexOf(layerNameLowerCase);

            entities.forEach((entityLevel: Entity) => {
                this.AddGameObjectFromLevelEntity(entityLevel, layerI);

                //gameObject.visible = true; // IN CASE THE ENTITY VISIBILITY IS FALSE, DO WANT TO SEE IT IN EDITOR
            });
        }

        if (level.background?.color)
            rapid.backgroundColor = Color.fromHex(level.background.color);

        return level;
    }

    AddGameObjectFromLevelEntity(entityLevel: Entity, layerI: number): GameObject
    {
        var entity = bare.ConstructEntity(entityLevel);

        //entity = { ...entity, hitbox: entity.hitbox, pivot: entity.pivot, imagePath: entity.imagePath};

        entity.components = {}; // DON'T WANT TO LOAD COMPONENTS IN EDITOR

        var gameObject = this.AddGameObject(entity, layerI);
        gameObject.levelEntity = entityLevel;

        return gameObject;
    }

    // HERE WE ACTUALLY SAVE THE LEVEL TO DISK
    // DIFFERENT FROM LEVELCONTROLLER WHERE WE SAVE TO LOCALSTORAGE
    async SaveLevel(): Promise<void>
    {
        var level = (this.currentLevel as LevelData);
        var levelPath = this.editorController.currentLevelPath;
    
        levelController.SerializeLevel(level);
            
        try {
            const response = await fetch('/api/save-level', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    levelData: level,
                    levelPath: levelPath
                })
            });

            if (response.ok) {
                const result = await response.json();
                console.log('✅ Level saved:', result.message);
            } else {
                const errorResult = await response.json();
                console.error('❌ Failed to save level:', errorResult.error);
            }
        } catch (error) {
            console.error('❌ Save error:', error);
        }

        events.emit(BareEvent.level_savedToDisk, {levelStr: SaveData.currentLevelStr, level: this.currentLevel});
    }

    AddGameObject(entityOrName: Entity | string, layer: int = 0): GameObject
    {
        const gameObject = bare.AddGameObject(entityOrName, layer);

        //gameObject.physicsHitbox.rectangle = {x: 0, y: 0, width: 0, height: 0};

        // Hitbox linkage
        if (gameObject.entity!.interactableInEditor !== false) // UNDEFINED OR TRUE...
        {
            gameObject.tapHitbox = new Hitbox(gameObject, 0);
            gameObject.tapHitbox.shouldReleaseOnTop = false;
            gameObject.tapHitbox.OnPress = (_levelEntiy: GameObject, event: PointerEvent) => {
                if (bare.MouseIsOnEditor(event))
                    return;

                this.editorController.editorControlsHandler.StartDrag(gameObject);
            };
            gameObject.tapHitbox.OnRelease = (_levelEntiy: GameObject, event: PointerEvent) => {
                this.editorController.editorControlsHandler.EndDrag(gameObject)
            };

            gameObject.tapHitbox.type = HitboxType.Rectangle;
            var w = gameObject.texture!.width * gameObject.totalScaleX;
            var h = gameObject.texture!.height * gameObject.totalScaleY;
            gameObject.tapHitbox.rectangle = {x: 0, y: 0, width: w, height: h};
        }

        gameObject.save = true; //

        return gameObject;
    }

    AddGameObjectAtPosition(x: number, y: number, entityOrName: Entity | string, layer: int = 0): GameObject
    {
        var gameObject = this.AddGameObject(entityOrName, layer);
        gameObject.SetPosition(x, y);
        return gameObject;
    }

    GetTilesheetEntity(name: string): Entity {
        var tilesheetEntity = this.editorController.data.tilesheets!.find((e: any) => e.name == name)
        if (!tilesheetEntity)
        {
            // ENTITY NAME NOT FOUND, SO TAKE THE 'ANY' ENTRY, CLONE IT, AND ASSIGN A NEW NAME
            var cloneEntity = Object.assign({}, this.editorController.data.tilesheets!.find((e: any) => e.name == "ANY")!);
            cloneEntity.name = name;
            
            tilesheetEntity = cloneEntity;
        }

        return tilesheetEntity;
    }

    RemoveGameObject(entity: GameObject): void {
        
    }
}