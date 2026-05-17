import { sceneController } from "../controllers/sceneController";
import { PivotComponent } from "../editorComponents/pivotComponent";
import { PivotRemoveComponent } from "../editorComponents/pivotRemoveComponent";
import { PositionPivotComponent } from "../editorComponents/positionPivotComponent";
import { ResizableComponent } from "../editorComponents/resizableComponent";
import { ResizableRemoveComponent } from "../editorComponents/resizableRemoveComponent";
import { GameMode, globalEvents } from "../globals";
import { cameraHandler } from "../handlers/cameraHandler";
import { EditorControlsHandler } from "../handlers/editorControlsHandler";
import { EditorUIHandler } from "../handlers/editorUIHandler";
import { FileDropHandler } from "../handlers/fileDropHandler";
import { levelHandler } from "../handlers/levelHandler";
import { SaveDataHandler } from "../handlers/SaveDataHandler";
import { SettingsHandler } from "../handlers/settingsHandler";
import { Color, Vec2 } from "../libraries/new-rapid-render";
import { GameObject } from "../objects/gameObject";
import { BareEvent, BareOptions, CameraScaleMode, Entity, HitboxType, LevelData, SaveData, SceneOptions, SettingsData, Size } from "../types/bareTypes";
import { Hitbox } from "../types/hitbox";
import { Helper } from "../utils/helper";
import { Scene } from "./scene";

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
    private gameResolution: BareOptions['resolution'] = undefined;
    public draggingLevelEntity: GameObject | null = null;
    public currentLevelPath: string = '';
    
    saveLevelCallback: () => Promise<LevelData>;

    constructor(sceneOptions: SceneOptions | SettingsData = {solo: true, persistent: true, settingsData: sceneController.GetLevelScene()?.sceneOptions.settingsData})
    {  
        super(sceneOptions);
        
        this.SetupFileDropZone();
    }

    async OnStart(payload?: EditorSceneAwakePayload): Promise<void>
    {
        if (__DEV__)
            this.RegisterEditorComponents(); // JUST FOR PLUGIN - ENTITY EDITOR

        cameraHandler.SetScaleMode(CameraScaleMode.Contain);

        this.editorControlsHandler = new EditorControlsHandler(this);
        this.editorUIHandler = new EditorUIHandler(this);

        // OPEN
        const { levelPathOrData, saveLevelCallback, settingsHandler } = payload ?? {};

        if (__DEV__)
            globalThis.plugin?.AddDebugAction("Toggle Level Editor", () => this.Toggle(settingsHandler));

        return await this.Open(
            levelPathOrData ?? '',
            saveLevelCallback ?? this.SaveLevel,
            settingsHandler ?? this.settingsHandler
        );
    }

    async Open(levelPathOrData: string | LevelData = '', saveLevelCallback: () => Promise<LevelData> = this.SaveLevel,
                   settingsHandler: SettingsHandler = this.settingsHandler)
    {
        if (typeof levelPathOrData != 'string')
            if (settingsHandler.GetRaw().name == this.settingsHandler.GetRaw().name)
                if (levelPathOrData.name == this.currentLevel?.name)
                    return; // ALREADY IN TARGET EDITOR AT TARGET LEVEL

        this.settingsHandler = settingsHandler; // SETTING IT HERE, MAYBE NOT THE BEST PLACE, BUT TO MAKE ABOVE CHECK WORK
        // ALSO SCENE HAS SET AND PROCESSED DEFAULT SETTINGSHANDLER, WHICH IS PRETTY USELESS IN THIS CASE. TODO
        // COULD SEND ALONG THE PAYLOAD (CONTAINING settingsHandler) TO SCENE CONTRUCTOR, BUT NOT SURE IF THAT WILL PLAY WELL WITH EditorSceneAwakePayload
        // WILL CREATE MORE CONTRAINTS TO ALIGN WITH CONSTRUCTOR ARG TYPE

        bareEngine.gameMode = GameMode.Editor;
        
        this.backgroundColorOrig = rapid.backgroundColor;
        
        var levelNameOrData:string | LevelData = '';
        if (levelPathOrData == '')
        {
            levelNameOrData = SaveData.currentLevelStr;
            levelPathOrData = `${bareEngine.levelPath}/${levelNameOrData}.json`;
        }
        
        if (typeof levelPathOrData == 'string')
        {
            levelNameOrData = levelPathOrData.split('/').pop()!.split('.')[0];
            this.currentLevelPath = levelPathOrData;
        }
        else
        {
            levelNameOrData = levelPathOrData;//
        }
        
        // CLEAR LEVEL CACHE SO IT'S NOT USED FOR LEVEL LOAD
        // INSTEAD, THE LEVEL FROM DISK GETS LOADED
        SaveData.levelCache.clear();
        SaveDataHandler.Save();
        
        var level = await this.LoadLevel(levelNameOrData);

        bareEngine.gameMode = GameMode.Editor; // JUST SET TO GAME IN OnClear()
        if (!this.opened)
            this.gameResolution = bareEngine.resolution;

        if (this.gameResolution)
            bareEngine.SetResolution();

        this.saveLevelCallback = saveLevelCallback.bind(this);

        const el = document.getElementById("editor-content");
        const hasEditorContent = (el.children.length > 0);
        if (!hasEditorContent)
        {
            // WILL ONLY HAPPEN ON FIRST LOAD
            await this.editorUIHandler.LoadEditorPage();
        }

        this.editorUIHandler.SetupEditorControls();
        this.editorUIHandler.PopulateWithData(this.settingsData);
        this.editorUIHandler.SyncSettingsUI();
        this.editorUIHandler.OpenEditor();

        this.editorUIHandler.ProcessCurrentData();

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
        this.editorControlsHandler.OpenEditor();

        this.opened = true;

        // HANDLE CAMERA POSITION
        if (this.settingsData.showUI !== false)
        {
            // POSIION CAMERA SO THAT LEVEL SITS A BIT RIGHT, NEXT TO OBJECTS UI
            var dims:Size = this.currentLevel.dimensions;
            var s = Math.max(dims.width / rapid.width, dims.height / rapid.height);
            cameraHandler.zoom = 1/s * .62; // ZOOM OUT A BIT, TO FIT RIGHT OF ENTITES WINDOW
            cameraHandler.SetPosition(dims.width * .25, dims.height / 2); // AND CAMERA LEFT A BIT FOR SAME REASON
        }
        else
        {
            // CENTER CAMERA, BIT ZOOMED OUT
            var dims:Size = this.currentLevel.dimensions;
            var s = Math.max(dims.width / rapid.width, dims.height / rapid.height);
            cameraHandler.zoom = 1/s * .7;
            cameraHandler.SetPosition(dims.width / 2, dims.height / 2);
        }

        cameraHandler.DisableBounds();

        rapid.backgroundColor = Color.fromHex('#3b3b3f');

        bareEngine.SendEvent(BareEvent.editor_opened, {settingsDataName: this.settingsData.name || 'levelEditor', levelName: level.isData ? "data" : SaveData.currentLevelStr});
    }

    OnClear(): void
    {
        if (this.opened) // CHECKING, SINCE THIS ALSO RUNS ON INIT WHEN CALLING LoadLevel()
        {
            this.opened = false;
            bareEngine.gameMode = GameMode.Game; // SETTING IT IN BARE.START() NOW, BUT ALSO KINDA MAKES SENSE HERE
            
            if (this.gameResolution)
                bareEngine.SetResolution(this.gameResolution);

            bareEngine.SendEvent(BareEvent.editor_closed, {settingsDataName: this.settingsData.name || 'levelEditor', levelName: SaveData.currentLevelStr});
        }
        
        rapid.backgroundColor = this.backgroundColorOrig;

        this.editorUIHandler.Clear();
        this.editorControlsHandler.Clear();
    }

    async Close()
    {
        sceneController.Remove(EditorScene); // CALLS ONCLEAR
        sceneController.EnableAllScenes(); // COULD ENABLE SCENES THAT WERE PREVIOUSLY DISABLED - TODO

        var level = sceneController.GetLevelScene();

        if (level)
            level.Restart();
        else
            sceneController.Restart(); // CAN GET HERE WHEN LOADED LEVEL FROM PLUGIN, BUT LAST GAME SCENE DOESN'T LOAD LEVEL
    }

    async Toggle(settingsHandler: SettingsHandler, levelPathOrData: string | LevelData = '', saveLevelCallback: () => Promise<LevelData> = this.SaveLevel)
    {
        if (this.settingsHandler == settingsHandler && bareEngine.gameMode == GameMode.Editor)
        {
            this.Close();
            return;
        }

        this.Open(levelPathOrData, saveLevelCallback, settingsHandler);
    }

    //OnUpdate(deltaTime: number): void
    OnPreUpdate(deltaTime: number): void
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
        bareEngine.AddClass(PivotComponent);
        bareEngine.AddClass(PivotRemoveComponent);
        bareEngine.AddClass(ResizableComponent);
        bareEngine.AddClass(ResizableRemoveComponent);
        bareEngine.AddClass(PositionPivotComponent);
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
        rapid.drawRect({
            width: this.currentLevel.dimensions.width,
            height: this.currentLevel.dimensions.height,
            color: this.currentLevel.backgroundColor ? Color.fromHex(this.currentLevel.backgroundColor) : Color.fromHex('666666'),
        });
    }

    OnPostRender()
    {
        if (!this.opened)
            return;

        if (!this.currentLevel)
            return;

        this.editorControlsHandler.PostRender();

        if (!this.settingsData?.settings?.gridEnabled)
            return;
        
        // DRAW GRID
        var gridSize = this.settingsData.settings.gridSize;
        var gridLineWidth = 2;
        var gridColor = new Color(0, 50, 50, 80);
        for (var i = 0; i <= this.currentLevel.dimensions.width; i += gridSize)
        {
            rapid.drawLine({
                points: [
                    new Vec2(i, 0),
                    new Vec2(i, this.currentLevel.dimensions.height),
                ],
                width: gridLineWidth,
                roundCap: false,
                color: gridColor,
            });
        }
        for (var i = 0; i <= this.currentLevel.dimensions.height; i += gridSize)
        {
            rapid.drawLine({
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

    /*Clear()
    {
        trace(44)
    }*/



    // LEVEL STUFF:
    
    componentsData: Record<string, Record<string, any>> = {};

    // HERE WE ACTUALLY SAVE THE LEVEL TO DISK
    // DIFFERENT FROM LEVELCONTROLLER WHERE WE SAVE TO LOCALSTORAGE
    async SaveLevel(): Promise<LevelData>
    {
        var level = this.currentLevel;
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

    override AddGameObject(entityLevel: Entity | string, parent: int | string | GameObject = "objects"): GameObject
    {
        if (entityLevel instanceof GameObject)
        {
            return super.AddGameObject(entityLevel, parent); //
        }
        
        var entity = this.ConstructEntity(entityLevel);

        //entity = { ...entity, hitbox: entity.hitbox, pivot: entity.pivot, imagePath: entity.imagePath};

        //entity.components = {}; // DON'T WANT TO LOAD COMPONENTS IN EDITOR

        var gameObject = super.AddGameObject(entity, parent);

        //gameObject.physicsHitbox.rectangle = {x: 0, y: 0, width: 0, height: 0};

        // Hitbox linkage
        if (entity.interactableInEditor !== false) // UNDEFINED OR TRUE...
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

            if (gameObject.texture)
            {
                var w = gameObject.texture!.width;
                var h = gameObject.texture!.height;
                gameObject.tapHitbox.rectangle = {x: 0, y: 0, width: w, height: h};
            }
            else
            {
                // COULD GET HERE IF TEXTURE WAS SET TO "NONE" - EG FOR PIVOT
                gameObject.tapHitbox.rectangle = {x: 0, y: 0, width: 0, height: 0};
            }
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

    async SaveEntityData(newRawData: SettingsData)
    {
        //if (globalThis.plugin)
        //    globalThis.plugin.FilterSettingsDataDefaults(newRawData);

        await this.OnPreSaveEntityData(newRawData);

        // Persist to disk via dev-server endpoint when available (local only)
        if (!window.isLocalhost) {
          return { ok: true, saved: false, message: 'Save skipped (not localhost)' };
        }
    
        try {
            const res = await fetch('/api/save-entity-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: bareEngine.dataPath,
                settingsData: newRawData,
                skipReload: true
            })
          });
          const json = await res.json().catch(() => null);
        
          // TELL THE PLUGIN
          //window.__GAME_DEBUG_API__.notifyEntityDataChanged(newRawData)

          await this.OnPostSaveEntityData(newRawData);

          return { ok: res.ok, saved: res.ok, response: json };
        } catch (error: any) {
          console.error('Failed to save entity data', error);
          return { ok: false, error: error?.message ?? String(error) };
        }
    }

    async OnPreSaveEntityData(rawData: SettingsData)
    {
        // FOR OVERRIDE
    }

    async OnPostSaveEntityData(rawData: SettingsData)
    {
        // FOR OVERRIDE
    }
}

//SaveDataHandler.Load();

//export const editorController = new EditorController();
//globalThis.editorController = editorController;
