import { sceneController } from "../controllers/sceneController";
import { PivotComponent } from "../editorComponents/pivotComponent";
import { PivotRemoveComponent } from "../editorComponents/pivotRemoveComponent";
import { PositionPivotComponent } from "../editorComponents/positionPivotComponent";
import { ResizableComponent } from "../editorComponents/resizableComponent";
import { ResizableRemoveComponent } from "../editorComponents/resizableRemoveComponent";
import { PhysicsObjectBare } from "../exports/barePhysics";
import { assetsHandler } from "../handlers/assetsHandler";
import { cameraHandler } from "../handlers/cameraHandler";
import { EditorControlsHandler } from "../handlers/editorControlsHandler";
import { EditorUIHandler } from "../handlers/editorUIHandler";
import { FileDropHandler } from "../handlers/fileDropHandler";
import { levelHandler, LevelHandler } from "../handlers/levelHandler";
import { SaveDataHandler } from "../handlers/SaveDataHandler";
import { SettingsHandler } from "../handlers/settingsHandler";
import { Color, Vec2 } from "../libraries/rapid-render";
import { GameMode, globalEvents, MakePath, Scene } from "../main";
import { GameObject } from "../objects/gameObject";
import { BareEvent, Dimensions, Entity, LevelData, SaveData, SettingsData } from "../types/bareTypes";
import { CameraScaleMode, HitboxType } from "../types/gamesTypes";
import { Hitbox } from "../types/hitbox";
import { Helper } from "../utils/helper";

type EditorSceneAwakePayload = {
    levelPathOrData?: string | LevelData;
    saveLevelCallback?: () => Promise<LevelData>;
    settingsHandler?: SettingsHandler;
};

export class EditorScene extends Scene
{
    public opened: boolean = false; // DOUBLES TRUTH WITH this.levelEditorOpen
    
    // Component classes
    public editorControlsHandler: EditorControlsHandler;
    public editorUIHandler: EditorUIHandler;
    
    // State management
    private backgroundColorOrig: Color;
    public draggingLevelEntity: GameObject | null = null;
    public currentLevelPath: string = '';
    
    saveLevelCallback: () => Promise<LevelData>;

    constructor()
    {  
        var entityData = sceneController.GetLevelScene().sceneOptions.entityData;
        super({entityData: entityData, persistent: true });
        
        this.SetupFileDropZone();
    }

    OnAwake(payload?: EditorSceneAwakePayload): void | Promise<void>
    {
        this.editorControlsHandler = new EditorControlsHandler(this);
        this.editorUIHandler = new EditorUIHandler(this);

        this.RegisterEditorComponents();

        if (__DEV__)
            globalThis.plugin?.AddDebugAction("Toggle Level Editor", () => this.Toggle(this.settingsHandler));

        this.editorControlsHandler.scene = this;
        this.editorUIHandler.scene = this;

        cameraHandler.SetScaleMode(CameraScaleMode.Contain);

        // OPEN
        const { levelPathOrData, saveLevelCallback, settingsHandler } = payload ?? {};

        return this.Open(
            levelPathOrData ?? '',
            saveLevelCallback ?? this.SaveLevel,
            settingsHandler ?? this.settingsHandler
        );
    }

    OnStart(): void | Promise<void>
    {
        //window.gameMode = GameMode.Editor;
    }

    async Open(levelPathOrData: string | LevelData = '', saveLevelCallback: () => Promise<LevelData> = this.SaveLevel,
                   settingsHandler: SettingsHandler = this.settingsHandler)
    {
        if (typeof levelPathOrData != 'string')
            if (settingsHandler.GetRaw().name == this.settingsHandler.GetRaw().name)
                if (levelPathOrData.name == this.currentLevel?.name)
                    return; // ALREADY IN TARGET EDITOR AT TARGET LEVEL

        var levelName = '';
        if (levelPathOrData == '')
        {
            levelName = SaveData.currentLevelStr;
            levelPathOrData = `${bareEngine.levelPath}/${levelName}.json`;
        }
        
        if (typeof levelPathOrData == 'string')
        {
            levelName = levelPathOrData.split('/').pop()!.split('.')[0];
            this.currentLevelPath = levelPathOrData;
        }

        //if (settingsHandler != this.currentSettingsHandler)
        {
            await this.SetCurrentSettingsHandler(settingsHandler);
        }

        this.saveLevelCallback = saveLevelCallback.bind(this);

        const el = document.getElementById("editor-content");
        const hasEditorContent = (el.children.length > 0);

        if (!hasEditorContent)
        {
            await this.editorUIHandler.LoadEditorPage();
            this.editorUIHandler.SetupEditorControls();
        }

        this.editorUIHandler.PopulateWithData(this.settingsData);
        this.editorUIHandler.SyncSettingsUI();

        this.editorControlsHandler.OpenEditor();
        this.editorUIHandler.OpenEditor();
        
        this.backgroundColorOrig = rapid.backgroundColor;

        // ALSO HAPPENS WHEN ADDED, TODO
        sceneController.DisableAllScenes();
        this.enabled = true;
        
        window.gameMode = GameMode.Editor;
        await this.LoadLevel(levelName);

        this.opened = true;

        if (this.settingsData.showUI !== false)
        {
            // POSIION CAMERA SO THAT LEVEL SITS A BIT RIGHT, NEXT TO OBJECTS UI
            var dims:Dimensions = this.currentLevel.dimensions;
            var s = Math.max(dims.width / rapid.width, dims.height / rapid.height);
            cameraHandler.zoom = 1/s * .62; // ZOOM OUT A BIT, TO FIT RIGHT OF ENTITES WINDOW
            cameraHandler.SetPosition(dims.width * .25, dims.height / 2); // AND CAMERA LEFT A BIT FOR SAME REASON
        }
        else
        {
            // CENTER CAMERA, BIT ZOOMED OUT
            var dims:Dimensions = this.currentLevel.dimensions;
            var s = Math.max(dims.width / rapid.width, dims.height / rapid.height);
            cameraHandler.zoom = 1/s * .7;
            cameraHandler.SetPosition(dims.width / 2, dims.height / 2);
        }

        cameraHandler.DisableBounds();

        this.editorUIHandler.ProcessCurrentData();

        rapid.backgroundColor = new Color(60, 60, 60, 255);
        
        // SELECT OBJECTS LAYER AS DEFAULT
        var layerElement = document.getElementById('objects') as HTMLElement;
        this.editorUIHandler.SelectLayerItem(layerElement);

        if (this.settingsData.showUI === false)
        {
            this.editorUIHandler.Hide();
        }
        else
        {
            this.editorUIHandler.Show();
        }

        globalEvents.emit(BareEvent.editor_opened, {name: this.settingsData.name || 'levelEditor'});// TODO
    }

    OnClear(full?: boolean): void
    {
        window.gameMode = GameMode.Game;
    }

    // NOT USING ATM?
    async Close(loadLevelAfter: boolean = true)
    {
        this.opened = false;

        rapid.backgroundColor = this.backgroundColorOrig;
        
        this.editorControlsHandler.Close();
        this.editorUIHandler.Close();

        globalEvents.emit(BareEvent.editor_closed, {name: this.settingsData.name || 'levelEditor'});

        // DISABLE THE LEVEL CACHE, SO LEVELS GETS RELOADED
        // DON'T NECESSARY WANT SAVEDATA FOR EACH LEVEL - TODO
        if (!window.isLocalhost) // FOR PRODUCTION, LEVEL IS ONLY SAVED TO CACHE, NOT TO DISK, SO KEEPING CACHE IN THAT CASE
        {
            SaveData.levelCache.clear();
            SaveDataHandler.Save();
        }
        
        window.gameMode = GameMode.Game; // SETTING IT IN BARE.START() NOW, BUT ALSO KINDA MAKES SENSE HERE

        sceneController.Remove(EditorScene); // this DIDN'T WORK, FIX! TODO
        sceneController.EnableAllScenes();

        bareEngine.Restart();

        //if (loadLevelAfter)
        //    levelController.LoadCurrentLevel();
    }

    async Toggle(settingsHandler: SettingsHandler, levelPathOrData: string | LevelData = '', saveLevelCallback: () => Promise<LevelData> = this.SaveLevel)
    {
        if (this.settingsHandler == settingsHandler && window.gameMode == GameMode.Editor)
        {
            this.Close();
            return;
        }

        this.Open(levelPathOrData, saveLevelCallback, settingsHandler);
    }

    OnUpdate(deltaTime: number): void
    {
        this.editorControlsHandler?.Update(deltaTime);
    }

    // COULD DO THIS BETTER, BY JUST CLEARING THE LEVEL AND REPOPULATING IT
    // THOUGH THAT'S NOT ALWAYS SUFFICIENT FOR ALL USE CASES, EG CATEGORIES GET CHANGED
    // THIS COVERS ALL CASES OVER-SUFFICIENTLY ATM
    /*async Restart()
    {
        var levelPath: string | LevelData;
        
        if (this.currentSettingsHandler.GetRaw().name == 'hitboxEditor')
            levelPath = await this.CreateHitboxDataFor(this.currentLevel.name, this.hitboxData);
        else
            levelPath = this.currentLevel ? this.currentLevel : this.currentLevelPath;
        
        var saveLevelCallback = this.saveLevelCallback;
        var settingsHandler = this.currentSettingsHandler;
        
        this.Clear();
        await this.Open(levelPath, saveLevelCallback, settingsHandler);
    }*/

    private SetupFileDropZone()
    {
        if (__DEV__)
        {
            const dropZone = document.getElementById('game-container') || document.body;

            new FileDropHandler(dropZone, async (file: File) => {
                await this.handleJSONFile(file);
            });
        }
    }

    private async handleJSONFile(file: File)
    {
        try
        {
            // JSON FILE DROPPED, SHOULD BE IN ${this.levelPath}/, BUT CAN STILL BE IN SUBDIRECTORY
            // SO LOOKING THROUGH ALL THE SUBDIRECTORIES TO FIND DROPPED FILE AND ITS PATH, JUST SO IT CAN BE LOADED BACK FROM DISK LATER
            // ASSUMING ALL LEVEL FILE NAMES ARE UNIQUE
            var files = await Helper.GetFilesInFolder(`${bareEngine.levelPath}/`, true);
            var filePath = '';
            for (var i = 0; i < files.length; i++)
            {
                if (files[i].includes(file.name))
                {
                    filePath = files[i];
                    break;
                }
            }

            const levelData = await Helper.loadJSONFile<LevelData>(file);
            const subDir = filePath.replace(bareEngine.levelPath + "/", "").replace(".json", "");
            levelData.name = subDir;

            //levelController.LoadLevel(levelData);
        }
        catch (error)
        {
            console.error('Failed to load JSON:', error);
        }
    }

    private RegisterEditorComponents()
    {
        this.AddClass(PivotComponent);
        this.AddClass(PivotRemoveComponent);
        this.AddClass(ResizableComponent);
        this.AddClass(ResizableRemoveComponent);
        this.AddClass(PositionPivotComponent);
    }

    SelectEntity(entity: Entity, childEntity: HTMLElement | null = null): void {
        this.editorUIHandler.SelectUIEntity(entity, childEntity);

        /*if (entity.name != this.editorControlsHandler.currentPreviewEntity.name || !this.editorControlsHandler.currentPreviewEntity.visible)
            this.editorControlsHandler.SetCurrentPreviewEntity(entity);
        else
            this.editorControlsHandler.SetCurrentPreviewEntity(null);*/
    }

    OnPreRender()
    {
        if (!this.opened)
            return;

        if (!this.currentLevel)
            return;

        // DRAW COLORED RECT OF LEVEL
        rapid.renderRect({
            x: 0,
            y: 0,
            width: this.currentLevel.dimensions.width,
            height: this.currentLevel.dimensions.height,
            color: this.currentLevel.background?.color ? Color.fromHex(this.currentLevel.background.color) : Color.fromHex('666666'),
        });

        if (!this.settingsData?.settings?.gridEnabled)
            return;
        
        // DRAW GRID
        var gridSize = this.settingsData.settings.gridSize;
        var gridLineWidth = 2;
        var gridColor = new Color(0, 50, 50, 155);
        for (var i = 0; i < this.currentLevel.dimensions.width; i += gridSize)
        {
            rapid.renderLine({
                points: [
                    new Vec2(i, 0),
                    new Vec2(i, this.currentLevel.dimensions.height),
                ],
                width: gridLineWidth,
                roundCap: false,
                color: gridColor,
            });
        }
        for (var i = 0; i < this.currentLevel.dimensions.height; i += gridSize)
        {
            rapid.renderLine({
                points: [
                    new Vec2(0, i),
                    new Vec2(this.currentLevel.dimensions.width, i),
                ],
                width: gridLineWidth,
                roundCap: false,
                color: gridColor,
            });
        }
    }

    OnPostRender()
    {
        if (!this.opened)
            return;

        if (!this.currentLevel)
            return;

        this.editorControlsHandler.PostRender();
    }

    Clear()
    {
    }



    // LEVEL STUFF:
    
    componentsData: Record<string, Record<string, any>> = {};

    // HERE WE ACTUALLY SAVE THE LEVEL TO DISK
    // DIFFERENT FROM LEVELCONTROLLER WHERE WE SAVE TO LOCALSTORAGE
    async SaveLevel(): Promise<LevelData>
    {
        var level = (this.currentLevel as LevelData);
        var levelPath = this.currentLevelPath;
    
        levelHandler.SerializeLevel(level);
            
        if (!window.isLocalhost)
        {
            SaveData.levelsEditedCache.set(SaveData.currentLevelStr, level);
            SaveDataHandler.Save();
            
            //globalEvents.emit(BareEvent.level_postSave, {levelStr: SaveData.currentLevelStr, level: this.currentLevel});
            return;
        }

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

        globalEvents.emit(BareEvent.level_savedToDisk, {levelStr: SaveData.currentLevelStr, level: this.currentLevel});

        return level;
    }

    override AddGameObject(entityLevel: Entity | string, layer: int = 0): GameObject
    {
        if (entityLevel instanceof GameObject)
        {
            return super.AddGameObject(entityLevel, layer); //
        }
        
        var entity = this.ConstructEntity(entityLevel);

        //entity = { ...entity, hitbox: entity.hitbox, pivot: entity.pivot, imagePath: entity.imagePath};

        entity.components = {}; // DON'T WANT TO LOAD COMPONENTS IN EDITOR

        var gameObject = super.AddGameObject(entity, layer);

        //gameObject.physicsHitbox.rectangle = {x: 0, y: 0, width: 0, height: 0};

        // Hitbox linkage
        if (gameObject.entity && gameObject.entity.interactableInEditor !== false) // UNDEFINED OR TRUE...
        {
            gameObject.tapHitbox = new Hitbox(gameObject, 0);
            gameObject.tapHitbox.shouldReleaseOnTop = false;
            gameObject.tapHitbox.OnPress = (_levelEntiy: GameObject, event: PointerEvent) => {
                if (bareEngine.MouseIsOnEditor(event))
                    return;

                this.editorControlsHandler.StartDrag(gameObject);
            };
            gameObject.tapHitbox.OnRelease = (_levelEntiy: GameObject, event: PointerEvent) => {
                this.editorControlsHandler.EndDrag(gameObject)
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

    GetTilesheetEntity(name: string): Entity
    {
        var tilesheetEntity = this.settingsData.tilesheets!.find((e: any) => e.name == name)
        if (!tilesheetEntity)
        {
            // ENTITY NAME NOT FOUND, SO TAKE THE 'ANY' ENTRY, CLONE IT, AND ASSIGN A NEW NAME
            var cloneEntity = Object.assign({}, this.settingsData.tilesheets!.find((e: any) => e.name == "ANY")!);
            cloneEntity.name = name;
            
            tilesheetEntity = cloneEntity;
        }

        return tilesheetEntity;
    }
} 

SaveDataHandler.Load();

//export const editorController = new EditorController();
//globalThis.editorController = editorController;
