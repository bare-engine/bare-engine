import { keyboardController } from "../controllers/keyboardController";
import { GameMode, globalEvents } from "../globals";
import { EditorControlsHandler } from "../handlers/editorControlsHandler";
import { EditorUIHandler } from "../handlers/editorUIHandler";
import { FileDropHandler } from "../handlers/fileDropHandler";
import { LevelHandler } from "../handlers/levelHandler";
import { SaveDataHandler } from "../handlers/SaveDataHandler";
import { SettingsHandler } from "../handlers/settingsHandler";
import { Color, Vec2 } from "../libraries/new-rapid-render";
import { GameObject } from "../objects/gameObject";
import { BareEvent, BareOptions, CameraScaleMode, Entity, HitboxType, LevelData, Rectangle, SaveData, SceneOptions, SettingsData, Size } from "../types/bareTypes";
import { Hitbox } from "../types/hitbox";
import { GameObjectSerializer } from "../utils/entitySerializer";
import { Helper } from "../utils/helper";
import { Scene } from "./scene";

type EditorSceneAwakePayload = {
    levelPathOrData?: string | LevelData;
    saveLevelCallback?: () => Promise<LevelData>;
    settingsHandler?: SettingsHandler;
};

export class EditorScene extends Scene
{
    readonly transformToolHandlesBodyMove: boolean = true;
    get gridEnabled(): boolean
    {
        return !!this.settingsData?.settings?.gridEnabled;
    }

    public opened: boolean = false; // DOUBLES TRUTH WITH this.levelEditorOpen

    // Component classes
    public editorControlsHandler: EditorControlsHandler;
    private ctrlPickedObject: GameObject | null = null;
    public editorUIHandler: EditorUIHandler;
    
    // State management
    private backgroundColorOrig: Color;
    private gameResolution: BareOptions['resolution'] = undefined;
    public draggingLevelEntity: GameObject | null = null;
    public currentLevelPath: string = '';
    
    saveLevelCallback: () => Promise<LevelData>;

    constructor(sceneOptions: SceneOptions | SettingsData = {solo: true, persistent: true, settingsData: bare.scene.GetLevelScene()?.settingsHandler.GetRaw()})
    {  
        super(sceneOptions);
        
        this.SetupFileDropZone();
    }

    override Awake(payload?: any): Promise<void>
    {
        bare.gameMode = GameMode.Edit;
        return super.Awake(payload);
    }

    async OnStart(payload?: EditorSceneAwakePayload): Promise<void>
    {
        if (__DEV__)
            this.RegisterEditorComponents(); // JUST FOR PLUGIN - PREFAB EDITOR

        bare.camera.SetScaleMode(CameraScaleMode.Contain);

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

        //this.settingsHandler = settingsHandler; // SETTING IT HERE, MAYBE NOT THE BEST PLACE, BUT TO MAKE ABOVE CHECK WORK
        this.settingsHandler.SetRaw(settingsHandler.GetRaw());
        this.settingsHandler.Process();
        //this.settingsHandler.scene = this;
        // ALSO SCENE HAS SET AND PROCESSED DEFAULT SETTINGSHANDLER, WHICH IS PRETTY USELESS IN THIS CASE. TODO
        // COULD SEND ALONG THE PAYLOAD (CONTAINING settingsHandler) TO SCENE CONTRUCTOR, BUT NOT SURE IF THAT WILL PLAY WELL WITH EditorSceneAwakePayload
        // WILL CREATE MORE CONTRAINTS TO ALIGN WITH CONSTRUCTOR ARG TYPE

        bare.gameMode = GameMode.Edit;
        
        this.backgroundColorOrig = rapid.backgroundColor;
        
        var levelNameOrData:string | LevelData = '';
        if (levelPathOrData == '')
        {
            levelNameOrData = SaveData.currentLevelStr;
            levelPathOrData = `${bare.levelPath}/${levelNameOrData}.json`;
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
        LevelHandler.ClearCache();
        SaveData.levelCache.clear();
        SaveDataHandler.Save();
        
        var level = await this.LoadLevel(levelNameOrData);

        bare.gameMode = GameMode.Edit; // JUST SET TO GAME IN OnClear()
        if (!this.opened)
            this.gameResolution = bare.resolution;

        if (this.gameResolution)
            bare.SetResolution();

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
        var dims:Size = this.currentLevel.dimensions;
        var s = Math.max(dims.width / rapid.width, dims.height / rapid.height);
        var shouldFrameNextToSidebar = this.settingsData.showUI !== false && SaveData.minimized !== true;

        if (shouldFrameNextToSidebar)
        {
            // POSIION CAMERA SO THAT LEVEL SITS A BIT RIGHT, NEXT TO OBJECTS UI
            bare.camera.zoom = 1/s * .62; // ZOOM OUT A BIT, TO FIT RIGHT OF ENTITES WINDOW
            bare.camera.SetPosition(dims.width * .25, dims.height / 2); // AND CAMERA LEFT A BIT FOR SAME REASON
        }
        else
        {
            // CENTER CAMERA, BIT ZOOMED OUT
            bare.camera.zoom = 1/s * .85;
            bare.camera.SetPosition(dims.width / 2, dims.height / 2);
        }

        bare.camera.DisableBounds();

        rapid.backgroundColor = Color.fromHex('#3b3b3f');

        bare.SendEvent(BareEvent.editor_opened, {settingsDataName: this.settingsData.name || 'levelEditor', levelName: level.isData ? "data" : SaveData.currentLevelStr});
    }

    OnClear(): void
    {
        if (this.opened) // CHECKING, SINCE THIS ALSO RUNS ON INIT WHEN CALLING LoadLevel()
        {
            this.opened = false;
            bare.gameMode = GameMode.Play; // SETTING IT IN BARE.START() NOW, BUT ALSO KINDA MAKES SENSE HERE
            
            if (this.gameResolution)
                bare.SetResolution(this.gameResolution);

            bare.SendEvent(BareEvent.editor_closed, {settingsDataName: this.settingsData.name || 'levelEditor', levelName: SaveData.currentLevelStr});
        }
        
        rapid.backgroundColor = this.backgroundColorOrig;

        this.editorUIHandler.Clear();
        this.editorControlsHandler.Clear();
    }

    async Close()
    {
        bare.scene.Remove(EditorScene); // CALLS ONCLEAR
        bare.scene.EnableAll(); // COULD ENABLE SCENES THAT WERE PREVIOUSLY DISABLED - TODO

        var level = bare.scene.GetLevelScene();

        if (level)
        {                   
            //SaveData.levelCache.clear();
            await level.level.Restart();
        }
        else
            bare.scene.Restart(); // CAN GET HERE WHEN LOADED LEVEL FROM PLUGIN, BUT LAST GAME SCENE DOESN'T LOAD LEVEL
    }

    async Toggle(settingsHandler: SettingsHandler, levelPathOrData: string | LevelData = '', saveLevelCallback: () => Promise<LevelData> = this.SaveLevel)
    {
        if (this.settingsHandler == settingsHandler && bare.gameMode == GameMode.Edit)
        {
            await this.Close();
            return;
        }

        await this.Open(levelPathOrData, saveLevelCallback, settingsHandler);
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
            var files = await Helper.GetFilesInFolder(`${bare.levelPath}/`, true);
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
            const subDir = filePath.replace(bare.levelPath + "/", "").replace(".json", "");
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
        /*bareEngine.AddClass(PivotComponent);
        bareEngine.AddClass(PivotRemoveComponent);
        bareEngine.AddClass(ResizableComponent);
        bareEngine.AddClass(ResizableRemoveComponent);
        bareEngine.AddClass(PositionPivotComponent);*/
    }

    SelectEntity(entity: Entity, childEntity: HTMLElement | null = null): void {
        this.editorUIHandler.SelectUIEntity(entity, childEntity);

        /*if (entity.name != this.editorControlsHandler.currentPreviewEntity.name || !this.editorControlsHandler.currentPreviewEntity.visible)
            this.editorControlsHandler.SetCurrentPreviewEntity(entity);
        else
            this.editorControlsHandler.SetCurrentPreviewEntity(null);*/
    }

    // NOTIFIES THE PLUGIN OF THE CURRENT SELECTION. OVERRIDDEN BY SCENES (EG PrefabScene) THAT
    // NEED A DIFFERENT PLUGIN MESSAGE SHAPE FOR THEIR SELECTION (EG CHILDPATH-BASED).
    NotifySelectionToPlugin(objs: GameObject[]): void
    {
        var selectedIds = objs.map(o => o.uniqueID);
        if (selectedIds.length == 1)
        {
            // parent ids let the plugin expand the tree down to a selected child
            var parentIds: string[] = [];
            for (var parent = objs[0].parent; parent; parent = parent.parent)
                parentIds.push(parent.uniqueID);

            globalThis.plugin?.SelectObjectInPlugin(selectedIds[0], true, parentIds);
        }
        else if (selectedIds.length > 1)
            globalThis.plugin?.SelectObjectsInPlugin(selectedIds);
    }

    // WHETHER EditorControlsHandler MAY START A MARQUEE/RECT SELECTION DRAG (AND WHETHER
    // TransformToolHandler MAY DEFER AN EMPTY-SPACE CLICK TO LET ONE START - SEE ITS
    // OnPointerDown). SEPARATE FROM settingsData.selectionEnabled, WHICH ALSO GATES THE OLDER
    // PER-OBJECT TAP-HITBOX CLICK/DRAG PATH THAT ENTITY-STYLE SCENES DELIBERATELY DON'T USE.
    AllowsRectSelection(): boolean
    {
        return this.settingsData.selectionEnabled !== false;
    }

    // CANDIDATE OBJECTS AND THEIR SELECTION BOUNDS FOR RECT/MARQUEE SELECTION. DEFAULT USES THE
    // EDITOR TAP HITBOX OF OBJECTS ON THE SELECTED LAYER (OR ALL OBJECTS WITH includeAllLayers).
    // OVERRIDDEN BY PrefabScene, WHOSE OBJECTS HAVE NO TAP HITBOX (SEE EditorScene.AddGameObject
    // VS PrefabScene.AddGameObject).
    GetRectSelectionCandidates(includeAllLayers: boolean): Array<{ obj: GameObject, rect: Rectangle }>
    {
        var objs: GameObject[];
        if (includeAllLayers)
        {
            objs = bare.object.GetAll();
        }
        else
        {
            var selectedLayer = document.querySelector('.selected-layer');
            var layerName = selectedLayer?.id;
            objs = layerName ? bare.object.GetLayerByName(layerName) : [];
        }

        var candidates: Array<{ obj: GameObject, rect: Rectangle }> = [];
        for (const obj of objs)
        {
            if (!obj.tapHitbox)
                continue; // COULD BE THE PREVIEW OBJECT

            const hitboxRect = bare.hitbox.GetRect(obj.tapHitbox);
            candidates.push({
                obj,
                rect: { x: hitboxRect.x1, y: hitboxRect.y1, width: hitboxRect.width, height: hitboxRect.height }
            });
        }

        return candidates;
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

        if (!this.gridEnabled || keyboardController.IsKeyDown("alt"))
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
        bare.SendEvent(BareEvent.level_preSavedToDisk, {levelStr: SaveData.currentLevelStr});
        
        var level = this.currentLevel;
        var levelPath = this.currentLevelPath;
    
        bare.level.Serialize(level);
            
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

                // a level child overriding a settings child references the child's uid, which may only exist at runtime so far
                if (SettingsHandler.PersistUIDsReferencedBy(level))
                    await this.SaveSettingsData(this.settingsHandler.GetRaw());
            } else {
                const errorResult = await response.json();
                console.error('❌ Failed to save level:', errorResult.error);
            }
        } catch (error) {
            console.error('❌ Save error:', error);
        }

        // ONLY SENDING TO globalEvents NOT TO ALL WITH bareEngine.SendEvent, SINCE IT WON'T REACH OTHER SCENES ANYWAY, THEY'RE DISABLED
        globalEvents.emit(BareEvent.level_savedToDisk, {levelStr: SaveData.currentLevelStr, level: this.currentLevel});
        
        return level;
    }

    override AddGameObject<T extends GameObject = GameObject>(entity: Entity | string, parent: int | string | GameObject = "objects"): T
    {
        //var entity = this.ConstructEntity(entityLevel);

        // MAKE SURE IT'S NOT PERSISTENT, SO IT'S SERIALIZED/SAVED
        //entity.persistent = false;

        //entity = { ...entity, hitbox: entity.hitbox, pivot: entity.pivot, imagePath: entity.imagePath};

        //entity.components = {}; // DON'T WANT TO LOAD COMPONENTS IN EDITOR

        var gameObject = super.AddGameObject<T>(entity, parent);

        //gameObject.physicsHitbox.rectangle = {x: 0, y: 0, width: 0, height: 0};

        // Hitbox linkage
        if (!gameObject.entity || gameObject.entity.interactableInEditor !== false) // UNDEFINED OR TRUE...
        {
            gameObject.tapHitbox ??= new Hitbox(gameObject, 0);
            gameObject.tapHitbox.shouldReleaseOnTop = false;
            let pointerSelectionTarget: GameObject | null = null;
            gameObject.tapHitbox.OnPress = (_levelEntiy: GameObject, event: PointerEvent) => {
                // ctrl presses are picked by SelectDeepestChildAt, called from the transform tool
                if (bare.MouseIsOnEditor(event) || event.ctrlKey || !this.SelectsOnHitboxPress())
                {
                    pointerSelectionTarget = null;
                    return;
                }

                pointerSelectionTarget = gameObject;
                while (pointerSelectionTarget.parent)
                    pointerSelectionTarget = pointerSelectionTarget.parent;

                this.editorControlsHandler.StartDrag(pointerSelectionTarget);
            };
            gameObject.tapHitbox.OnRelease = (_levelEntiy: GameObject, event: PointerEvent) => {
                if (pointerSelectionTarget)
                    this.editorControlsHandler.EndDrag(pointerSelectionTarget)
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
                gameObject.tapHitbox.rectangle = {x: 0, y: 0, width: gameObject.width, height: gameObject.height};
            }
        }

        gameObject.save = true; //

        return gameObject;
    }

    // false for scenes that do all their click selection through the transform tool (PrefabScene)
    protected SelectsOnHitboxPress(): boolean
    {
        return true;
    }

    // ctrl + click: select the deepest visible child under the pointer across all root objects,
    // regardless of which hitbox is on top or whether its parent is already selected
    SelectDeepestChildAt(mouseWorld: Vec2): boolean
    {
        if (this.editorControlsHandler.currentPreviewActive)
            return false;

        var roots = this.object.GetLayers().flat();
        for (var i = roots.length - 1; i >= 0; i--)
        {
            var root = roots[i];
            if (!root.visible || !root.visibleInEditor || root.entity?.interactableInEditor === false)
                continue;

            var found = root.GetDeepestChildAt(mouseWorld);
            if (found)
            {
                this.ctrlPickedObject = found;
                this.editorControlsHandler.StartDrag(found, mouseWorld);
                return true;
            }
        }

        return false;
    }

    EndCtrlPick(): void
    {
        if (!this.ctrlPickedObject)
            return;

        this.editorControlsHandler.EndDrag(this.ctrlPickedObject);
        this.ctrlPickedObject = null;
    }

    AddGameObjectAtPosition(x: number, y: number, entityOrName: Entity | string, parent?: int | string | GameObject): GameObject
    {
        // TURING ARG INTO AN ENTITY WITH POSITION - SO BY THE TIME GameObject REACHES OnStart(), ITS POSITION HAS BEEN SET
        if (typeof entityOrName == "string")
            entityOrName = {extends: entityOrName, position: {x: x, y: y}};
        else
            entityOrName.position = {x: x, y: y};

        var gameObject = this.AddGameObject(entityOrName, parent);
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

    async SaveSettingsData(newRawData: SettingsData)
    {
        if (newRawData.processed)
        {
            throw new Error('Cannot save processed data. Something went really wrong!');
        }

        //if (globalThis.plugin)
        //    globalThis.plugin.FilterSettingsDataDefaults(newRawData);

        const dataToSave = Helper.DeepCopy(newRawData);

        // strip the unreferenced runtime uids of settings children, and editor-only props
        GameObjectSerializer.CleanEntities([dataToSave.prefabs ?? [], dataToSave.basePrefabs ?? []], this.settingsHandler.rawEntitiesMappedByUID,
            undefined, entityUID => this.settingsHandler.IsRuntimeGeneratedUID(entityUID));

        this.settingsHandler.FilterSettingsDataDefaults(dataToSave);

        await this.OnPreSaveSettingsData(dataToSave);

        // Persist to disk via dev-server endpoint when available (local only)
        if (!window.isLocalhost) {
          return { ok: true, saved: false, message: 'Save skipped (not localhost)' };
        }
    
        try {
            const res = await fetch('/api/save-settings-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: bare.dataPath,
                settingsData: dataToSave,
                skipReload: true
            })
          });
          const json = await res.json().catch(() => null);
        
          // TELL THE PLUGIN
          //window.__GAME_DEBUG_API__.notifyPrefabChanged(dataToSave)

          await this.OnPostSaveSettingsData(dataToSave);

          return { ok: res.ok, saved: res.ok, response: json };
        } catch (error: any) {
          console.error('Failed to save settings data', error);
          return { ok: false, error: error?.message ?? String(error) };
        }
    }

    async OnPreSaveSettingsData(rawData: SettingsData)
    {
        // FOR OVERRIDE
    }

    async OnPostSaveSettingsData(rawData: SettingsData)
    {
        // FOR OVERRIDE
    }

    // duck-typed hook transformtoolhandler calls during a body-move gesture to grid/pivot-snap the
    // primary dragged object. entityscene inherits this since it extends editorscene.
    GetTransformToolMovePosition(obj: GameObject, desiredX: number, desiredY: number, mouseX: number, mouseY: number, ignoreGrid: boolean): Vec2
    {
        return this.editorControlsHandler.GetGridAlignedDragPosition(obj, desiredX, desiredY, mouseX, mouseY, ignoreGrid);
    }
}

//SaveDataHandler.Load();

//export const editorController = new EditorController();
//globalThis.editorController = editorController;
