import { BareGame, events, GameMode, MakePath } from "../main";
import { Color, Vec2 } from "../libraries/rapid-render";
import { EditorControlsHandler } from "../utils/editorHandlers/editorControlsHandler";
import { EditorUIHandler } from "../utils/editorHandlers/editorUIHandler";
import { EditorLevelHandler } from "../utils/editorHandlers/editorLevelHandler";
import { SettingsData, Entity, LevelData, Dimensions, SaveData, BareEvent } from "../utils/bareTypes";
import { SaveDataHandler } from "../utils/SaveDataHandler";
import { GameObject } from "../objects/gameObject";
import { assetsHandler } from "../utils/assetsHandler";
import { Helper } from "../utils/helper";
import { SettingsHandler } from "../utils/settingsHandler";
import { PivotComponent } from "../editorComponents/pivotComponent";
import { PivotRemoveComponent } from "../editorComponents/pivotRemoveComponent";
import { ResizableComponent } from "../editorComponents/resizableComponent";
import { ResizableRemoveComponent } from "../editorComponents/resizableRemoveComponent";
import { PositionPivotComponent } from "../editorComponents/positionPivotComponent";
import { FileDropHandler } from "../utils/fileDropHandler";
import { levelController } from "./levelController";
import { cameraHandler } from "../utils/CameraHandler";
import { PhysicsObjectBare } from "../barePhysics";

/*
    EDITOR CONTROLLER (MAIN)
    Orchestrates all editor system components and manages the overall editor state
*/

export class EditorController {
    public active: boolean = false;
    public data: SettingsData;
    
    // Component classes
    public editorControlsHandler: EditorControlsHandler;
    public editorUIHandler: EditorUIHandler;
    public levelFunctionality: EditorLevelHandler;
    
    // State management
    private backgroundColorOrig: Color;
    public draggingLevelEntity: GameObject | null = null;
    public gridSize: number = 64;
    public gridActive: boolean = false;
    public currentLevelPath: string = '';
    
    public hitboxDataHandler: SettingsHandler = new SettingsHandler();
    get hitboxData(): SettingsData { return this.hitboxDataHandler.Get(); }

    editorButton: HTMLButtonElement;
    OnClickEditorButtonBound: () => void;

    saveLevelCallback: () => Promise<void>;

    get currentLevel(): LevelData { return this.levelFunctionality.currentLevel; }

    constructor()
    {  
        this.levelFunctionality = new EditorLevelHandler(this);
        
        this.SetupFileDropZone();

        // Setup editor button
        const editorButton = document.getElementById('editor-button') as HTMLButtonElement;
        //editorButton.style.display = 'block';

        this.OnClickEditorButtonBound = this.OnClickEditorButton.bind(this);
        editorButton.addEventListener('click', this.OnClickEditorButtonBound);
        this.editorButton = editorButton;

        this.SetHitboxData(); // KEEP IN HERE? TODO

        // HIDE EDITOR BUTTON IN PRODUCTION
        if (!window.isLocalhost)
            editorButton.style.display = 'none';

        this.init();
    }

    init()
    {
        events.persistent.on(BareEvent.level_loaded, this.OnLoadedLevel.bind(this));
        events.persistent.on(BareEvent.game_started, this.Start.bind(this));
        events.persistent.on(BareEvent.game_clear, this.Clear.bind(this));
        
        if (this.editorUIHandler)
            this.editorControlsHandler.init();
    }

    OnLoadedLevel(data: LevelData)
    {
        const editorButton = document.getElementById('editor-button') as HTMLButtonElement;

        if (levelController.currentLevel)
            editorButton.style.display = 'block';
        else
            editorButton.style.display = 'none';
    }

    Start()
    {
        if (!this.editorControlsHandler && bare.currentSettingsHandler)
        {
            // ONCE
            this.editorControlsHandler = new EditorControlsHandler(this);
            this.editorUIHandler = new EditorUIHandler(this);

            this.RegisterEditorComponents();

            this.SetData(bare.currentSettings);
            
            if (__DEV__)
                globalThis.plugin?.AddDebugAction("Toggle Level Editor", () => this.Toggle(bare.baseSettingsHandler));
        }
    }

    async Open(levelPathOrData: string | LevelData = '', saveLevelCallback: () => Promise<void> = this.levelFunctionality.SaveLevel,
                   settingsHandler: SettingsHandler = bare.baseSettingsHandler)
    {
        if (typeof levelPathOrData != 'string')
            if (settingsHandler.GetRaw().name == bare.currentSettingsHandler.GetRaw().name)
                if (levelPathOrData.name == this.levelFunctionality.currentLevel?.name)
                    return; // ALREADY IN TARGET EDITOR AT TARGET LEVEL

        //this.levelLoadedBeforeOpen = levelController.currentLevel;

        bare.Clear();
        
        if (settingsHandler != bare.currentSettingsHandler)
        {
            await bare.SetCurrentSettingsHandler(settingsHandler);
            this.SetData(bare.currentSettings);
        }
        
        if (levelPathOrData == '')
            levelPathOrData = `${bare.levelPath}/${SaveData.currentLevelStr}.json`;

        if (typeof levelPathOrData == 'string')
            this.currentLevelPath = levelPathOrData;

        this.saveLevelCallback = saveLevelCallback.bind(this.levelFunctionality);

        window.gameMode = GameMode.Editor;

        events.on(BareEvent.game_preRender, this.PreRender.bind(this));

        this.active = true;

        const el = document.getElementById("editor-content");
        const hasEditorContent = (el.children.length > 0);

        if (!hasEditorContent)
        {
            await this.editorUIHandler.LoadEditorPage();
            this.editorUIHandler.SetupEditorControls();
        }

        this.editorUIHandler.PopulateWithData(this.data);
        this.editorUIHandler.SyncSettingsUI(this.gridActive, this.gridSize);

        const editorButton = document.getElementById('editor-button') as HTMLButtonElement;
        editorButton.style.display = 'none';

        this.editorControlsHandler.OpenEditor();
        this.editorUIHandler.OpenEditor();
        
        this.backgroundColorOrig = rapid.backgroundColor;

        if (typeof levelPathOrData == 'string')
            await this.levelFunctionality.LoadLevel(levelPathOrData);
        else
            await this.levelFunctionality.LoadLevelFromData(levelPathOrData);

        if (bare.currentSettings.showUI) 
        {
            // POSIION CAMERA SO THAT LEVEL SITS A BIT RIGHT, NEXT TO OBJECTS UI
            var dims:Dimensions = this.levelFunctionality.currentLevel.dimensions;
            var s = Math.max(dims.width / rapid.width, dims.height / rapid.height);
            cameraHandler.zoom = 1/s * .62; // ZOOM OUT A BIT, TO FIT RIGHT OF ENTITES WINDOW
            cameraHandler.SetPosition(dims.width * .25, dims.height / 2); // AND CAMERA LEFT A BIT FOR SAME REASON
        }
        else
        {
            // CENTER CAMERA, BIT ZOOMED OUT
            var dims:Dimensions = this.levelFunctionality.currentLevel.dimensions;
            var s = Math.max(dims.width / rapid.width, dims.height / rapid.height);
            cameraHandler.zoom = 1/s * .7;
            cameraHandler.SetPosition(dims.width / 2, dims.height / 2);
        }

        cameraHandler.DisableBounds();

        this.editorUIHandler.ProcessCurrentData();

        rapid.backgroundColor = new Color(60, 60, 60, 255);
        
        // SELECT OBJECTS LAYER AS DEFAULT
        var layerElement = document.getElementById('Objects') as HTMLElement;
        this.editorUIHandler.SelectLayerItem(layerElement);

        if (this.data.showUI === false)
        {
            this.editorUIHandler.Hide();
        }
        else
        {
            this.editorUIHandler.Show();
        }

        events.emit(BareEvent.editor_opened, {name: bare.currentSettings.name || 'levelEditor'});
    }

    Close(loadLevelAfter: boolean = true)
    {
        this.active = false;

        rapid.backgroundColor = this.backgroundColorOrig;
        
        const editorButton = document.getElementById('editor-button') as HTMLButtonElement;
        editorButton.style.display = 'block';

        this.editorControlsHandler.Close();
        this.editorUIHandler.Close();

        events.emit(BareEvent.editor_closed, {name: bare.currentSettings.name || 'levelEditor'});

        // DISABLE THE LEVEL CACHE, SO LEVELS GETS RELOADED
        SaveData.levelCache.clear();
        SaveDataHandler.Save();
        
        window.gameMode = GameMode.Game; // SETTING IT IN BARE.START() NOW, BUT ALSO KINDA MAKES SENSE HERE

        if (loadLevelAfter)
            levelController.LoadCurrentLevel();
    }

    async Toggle(settingsHandler: SettingsHandler, levelPathOrData: string | LevelData = '', saveLevelCallback: () => Promise<void> = this.levelFunctionality.SaveLevel)
    {
        if (bare.currentSettingsHandler == settingsHandler && window.gameMode == GameMode.Editor)
        {
            this.Close();
            return;
        }

        this.Open(levelPathOrData, saveLevelCallback, settingsHandler);
    }

    // COULD DO THIS BETTER, BY JUST CLEARING THE LEVEL AND REPOPULATING IT
    // THOUGH THAT'S NOT ALWAYS SUFFICIENT FOR ALL USE CASES, EG CATEGORIES GET CHANGED
    // THIS COVERS ALL CASES OVER-SUFFICIENTLY ATM
    async Restart()
    {
        var levelPath: string | LevelData;
        
        if (bare.currentSettingsHandler.GetRaw().name == 'hitboxEditor')
            levelPath = await editorController.CreateHitboxDataFor(this.levelFunctionality.currentLevel.name, editorController.hitboxData);
        else
            levelPath = this.levelFunctionality.currentLevel ? this.levelFunctionality.currentLevel : this.currentLevelPath;
        
        var saveLevelCallback = this.saveLevelCallback;
        var settingsHandler = bare.currentSettingsHandler;
        
        this.Clear();
        await this.Open(levelPath, saveLevelCallback, settingsHandler);
    }

    async OnClickEditorButton()
    {
        if (SaveData.currentLevelStr === '')
        {
            console.warn('[editor] No level loaded, cannot open editor');
            return;
        }

        this.Open();
    }

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
            // JSON FILE DROPPED, SHOULD BE IN ${bare.levelPath}/, BUT CAN STILL BE IN SUBDIRECTORY
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

            levelController.LoadLevel(levelData);
        }
        catch (error)
        {
            console.error('Failed to load JSON:', error);
        }
    }

    private RegisterEditorComponents()
    {
        bare.AddClass(PivotComponent);
        bare.AddClass(PivotRemoveComponent);
        bare.AddClass(ResizableComponent);
        bare.AddClass(ResizableRemoveComponent);
        bare.AddClass(PositionPivotComponent);
    }

    SetHitboxData()
    {
        var hitboxDataJson = `{
            "name": "hitboxEditor",
            "entities": 
            {
                "collisionRect":
                {
                    "hitbox": {
                        "x1": 0,
                        "y1": 0,
                        "x2": 1,
                        "y2": 1
                    },
                    "editorComponents": {
                        "resizable": {}
                    }
                }
            },
            "layers": [
                "Objects"
            ],
            "layersInfo": {
                "Objects": 
                {
                    "doSave": true
                }
            },
            "saveVars": {
                "PhysicsObjectBare": ["scale", "pivotBasedOnHitbox"]
            },
            "showUI": false,
            "selectionEnabled": false
        }`;

        var hitboxData = JSON.parse(hitboxDataJson);
        this.hitboxDataHandler.Process(hitboxData); // NO AWAIT, SINCE I KNOW NOTHING WILL TRIGGER A PROMISE IN CURRENT HITBODATA
    }

    SetData(data: SettingsData): EditorController
    {
        this.data = data;
        this.ApplySettingsFromData(data.settings);

        return this;
    }

    SaveLevel()
    {
        this.saveLevelCallback();
    }

    private ApplySettingsFromData(settings?: SettingsData['settings']): void
    {
        this.gridActive = settings?.gridEnabled ?? false;
        const gridSizeFromData = settings?.gridSize ?? 64;
        this.gridSize = gridSizeFromData > 0 ? gridSizeFromData : 64;
    }

    async PersistSettings(): Promise<void>
    {
        const settings = {
            gridEnabled: this.gridActive,
            gridSize: this.gridSize
        };

        const updated = bare.currentSettingsHandler.UpdateRaw((draft) => {
            draft.settings ??= { gridEnabled: settings.gridEnabled, gridSize: settings.gridSize };
            draft.settings.gridEnabled = settings.gridEnabled;
            draft.settings.gridSize = settings.gridSize;
        });

        try {
            await bare.SaveEntityData(updated);
        } catch (error) {
            console.error('Failed to persist settings', error);
        }
    }

    GetTilesheetEntity(name: string): Entity {
        return this.levelFunctionality.GetTilesheetEntity(name);
    }

    SelectEntity(entity: Entity, childEntity: HTMLElement | null = null): void {
        this.editorUIHandler.SelectUIEntity(entity, childEntity);

        /*if (entity.name != this.editorControlsHandler.currentPreviewEntity.name || !this.editorControlsHandler.currentPreviewEntity.visible)
            this.editorControlsHandler.SetCurrentPreviewEntity(entity);
        else
            this.editorControlsHandler.SetCurrentPreviewEntity(null);*/
    }

    PreRender() {
        if (!this.active)
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
            points: [],
        });

        if (!this.gridActive)
            return;
        
        // DRAW GRID
        var gridSize = this.gridSize;
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

    // BIT SEPARATE FROM THIS CLASS, BUT USEFUL HERE AND NOT INCLUDE IN BAREGAME
    // YOU'D ONLY WANT THIS IF YOU USE EDITOR
    async CreateHitboxDataFor(objectName: string, hitboxData: SettingsData): Promise<LevelData>
    {
        if (!hitboxData.processed)
            await bare.currentSettingsHandler.Process(hitboxData); // NEEDED? TODO

        var settingsData = bare.baseSettingsHandler.Get();

        // CONSTRUCT ENTITY FROM INITIAL ENTITY DATA, SO WE GET THE HITBOX DEFINED THERE
        var entityConstructedFromSettingsData = bare.ConstructEntity(objectName, settingsData);
        delete entityConstructedFromSettingsData.components;
        delete entityConstructedFromSettingsData.editorComponents;
        
        // NEED TO LOAD AND AWAIT TEXTURE, TO USE THE DIMENSIONS FOR THE LEVEL, SO THE CAMERA CAN BE PROPERLY SET UP BASED ON IT LATER
        var texture = await assetsHandler.GetTexturePromise(MakePath(entityConstructedFromSettingsData.imagePath!, objectName));

        // CONSTRUCT ENTITY FROM HITBODATA AND APPLY TO DUMMY GAMEOBJECT, SO WE CAN GET THE RESULTING PIVOT
        var obj = new PhysicsObjectBare();
        obj.InitTexture(MakePath(entityConstructedFromSettingsData.imagePath!, entityConstructedFromSettingsData.name));
        bare.ApplyEntityToGameObject(entityConstructedFromSettingsData, obj);
        var pivot = obj.pivot;
        var hitbox = (obj as any).physicsHitbox ? (obj as any).physicsHitbox?.rectangle : {x: 0, y: 0, width: 0, height: 0};

        // SET UP LEVEL WITH HITBOX AND PIVOT
        return {
            name: objectName,
            dimensions: {
                width: texture.width,
                height: texture.height
            },
            background: {
                color: "#3C3C3C"
            },
            entitiesByLayer: {
                "OBJECTS": [
                    {
                        ...entityConstructedFromSettingsData,
                        customName: "main",
                        position: {
                            x: 0,
                            y: 0
                        },
                        pivot: {
                            x: 0,
                            y: 0
                        },
                        interactableInEditor: false,
                    },
                    {
                        name: "collisionRect",
                        position: {
                            x: hitbox.x,
                            y: hitbox.y
                        },
                        scale: {
                            x: hitbox.width,
                            y: hitbox.height
                        },
                        editorComponents: {
                            resizable: {},
                            resizableRemove: {}
                        },
                        alpha: .8 // WORKING?
                    },
                    {
                        name: "dot",
                        position: {
                            x: pivot.x,
                            y: pivot.y
                        },
                        pivot: {
                            x: .5,
                            y: .5
                        },
                        scale: {
                            x: .75,
                            y: .75
                        },
                        imagePath: "",
                        editorComponents: {
                            pivot: {objectName: objectName, hitboxName: "collisionRect"},
                            pivotRemove: {}
                        }
                    }
                ]
            }
        };
    }

    async SaveHitboxDataToSettingsData(): Promise<void>
    {
        var level = this.currentLevel;
    
        // SERIALIZE, DATA IS EASIER TO FETCH? NO NEED, TODO
        levelController.SerializeLevel(level);

        // GET HITBOX AND PIVOT
        var mainEntity = level.entitiesByLayer.OBJECTS[0];
        var collisionRect = level.entitiesByLayer.OBJECTS[1];
        var pivotObj = level.entitiesByLayer.OBJECTS[2];
        
        var mainEntityName = mainEntity.name;

        var hitbox = {
            x1: Math.round(collisionRect.position!.x),
            y1: Math.round(collisionRect.position!.y),
            x2: Math.round(collisionRect.position!.x + collisionRect.scale!.x),
            y2: Math.round(collisionRect.position!.y + collisionRect.scale!.y)
        };

        var pivot = {
            x: Math.round(pivotObj.position!.x),
            y: Math.round(pivotObj.position!.y)
        };

        // CONSTRUCT ENTITY FROM INITIAL ENTITY DATA, SO WE GET THE RESULTING ORIGNAL VARS
        var obj = PhysicsObjectBare.GetDummpyDataFromEntity(mainEntity.name, bare.baseSettingsHandler.Get(), { propsToIgnoreInEntity: ["pivot", "hitbox", "pivotBasedOnHitbox"] }).gameObject; // NOT SEARCHING IN ENTITY DATA, SO WE GET THE ORIGNAL VARS
        var pivotOrig = obj.pivot;
        var pivotOrigRounded = { x: Math.round(pivotOrig.x), y: Math.round(pivotOrig.y) };
        var hitboxOrig = (obj as any).physicsHitbox ? (obj as any).physicsHitbox?.rectangle : {x: 0, y: 0, width: 0, height: 0};
        var hitboxVecOrig = { x1: hitboxOrig.x, y1: hitboxOrig.y, x2: hitboxOrig.x + hitboxOrig.width, y2: hitboxOrig.y + hitboxOrig.height };
        var pivotBasedOnHitboxOrig = obj.pivotBasedOnHitbox;
        var resetPivotBasedOnHitbox = (mainEntity.pivotBasedOnHitbox && mainEntity.pivotBasedOnHitbox.x == -1 && mainEntity.pivotBasedOnHitbox.y == -1);

        // APPLY NEW VALUES TO THE INITIAL ENTITY SETTING
        const newRawSettingsData = bare.baseSettingsHandler.UpdateRaw((draft) => {
            draft.entities[mainEntityName] ??= {};
            const entityDraft = draft.entities[mainEntityName];

            // PIVOT BASED ON HITBOX
            if (mainEntity.pivotBasedOnHitbox && !resetPivotBasedOnHitbox && !Helper.ObjectsAreEqual(pivotBasedOnHitboxOrig!, mainEntity.pivotBasedOnHitbox))
            {
                entityDraft.pivotBasedOnHitbox = {...mainEntity.pivotBasedOnHitbox};
            }
            else
            {
                delete entityDraft.pivotBasedOnHitbox;
            }

            // PIVOT
            if (!mainEntity.pivotBasedOnHitbox || resetPivotBasedOnHitbox) // pivotBasedOnHitbox OVERRIDE PIVOT
            {
                if (!Helper.ObjectsAreEqual(pivotOrigRounded, pivot))
                {
                    entityDraft.pivot = {...pivot};
                }
                else
                {
                    // PIVOT REMAINED AT SAME POSITION, SO SHOULD NOT BE SET IN DATA, DELETE
                    if (entityDraft.pivot)
                    {
                        delete entityDraft.pivot;
                    }
                }
            }
            else
            {
                delete entityDraft.pivot;
            }

            // HITBOX
            if (!Helper.ObjectsAreEqual(hitboxVecOrig, hitbox))
            {
                entityDraft.hitbox = {...hitbox};
            }
            else
            {
                delete entityDraft.hitbox;
            }
        });

        // SAVE TO FILE
        await bare.SaveEntityData(newRawSettingsData);
        //await window.__GAME_DEBUG_API__.setEntityData(newRawSettingsData);
    }

    Clear()
    {
        if (bare.levelEditorOpen)
        {
            this.Close(false); // DON'T WANT TO LOAD THE LEVEL
        }

        this.levelFunctionality.currentLevel = null;

        const editorButton = document.getElementById('editor-button') as HTMLButtonElement;
        editorButton.style.display = 'none';

        //this.editorButton.removeEventListener('click', this.OnClickEditorButtonBound);
    }
} 

export const editorController = new EditorController();
globalThis.editorController = editorController;