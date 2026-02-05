import { events, GameMode, MakePath, pipes } from "./main";
import { Color, FrameBufferObject, RenderTexture, Texture, Vec2 } from "./libraries/rapid-render";
import { PoolHandler } from "./utils/poolHandler";
import { Entity, GameObjectClass, Layer, LayerInfo, LevelData, SaveData, SettingsData, UI_LAYER } from "./utils/bareTypes";
import { GameObject } from "./objects/gameObject";
import { SettingsHandler as SettingsHandler } from "./utils/settingsHandler";
import { assetsHandler } from "./utils/assetsHandler";
import { defaultEntityData as defaultEntityData } from "./utils/bareData";
import { BarePlugin } from "./utils/plugin";

/*Bare.camera.SetPosition(bare.width * .5, bare.height * .5);
Bare.sound.Play()
Bare.physics.SetGravity(0, 0);
Bare.sopiro.SetFriction(0);
Bare.component.Add();
Bare.editor.Open();
Bare.tween.to();
Bare.level.Load()
Bare.keyboard.OnPress()
Bare.mouse.OnClick();
Bare.object.Add();
Bare.ui.Add();
Bare.screen.Goto();
Bare.particle.Add();
Bare.hitbox.Assign();
Bare.textures.Load(); // assetHandler
Bare.storage.Load(); // saveHandler
Bare.pool.Add(); // poolHandler */

export class BareGame
{
    static initialized: boolean = false;
    static gameObjectPoolSize: int = 50;
    static gameObjectPools: Map<string, PoolHandler<GameObject>> = new Map();
    static registeredClasses: Record<string, any> = {};
     
    static rootPath: string = "assets";
    static imagePath: string = "images";
    static levelPath: string = "_data/levels";
    static soundPath: string = "sounds";

    static plugin:any; // JUST MADE IT STATIC FOR IT TO WORK IN DEMOS

    public lastUpdateTimeRef:number;
    public deltaTime: number;
    public gameSpeed: number;

    public started: boolean = false;

    public componentClasses: Record<string, any> = {};

    public initialSettingsHandler: SettingsHandler = new SettingsHandler();
    public currentSettingsHandler: SettingsHandler;

    get initialSettings(): SettingsData { return this.initialSettingsHandler.Get(); }
    get currentSettings(): SettingsData { return this.currentSettingsHandler.Get(); }

    get plugin(): BarePlugin { return BareGame.plugin; }
    set plugin(value: BarePlugin) { BareGame.plugin = value; }

    time: number = 0;
    count: int = 0;
    
    isPaused: boolean = false;
    doRender: boolean = true;

    RunMainLoopId: number = -1;
    RunMainLoopBound: () => void;

    public dummyGameObject: GameObject = new GameObject(); // JUST USED FOR DEFAULT VALUES AND DUMMY CONSTRUCTION

    layerInfos: Record<int, LayerInfo> = {};
    layerNames: string[];

    // BIT HACKY, BUT STORING THIS SO THAT I CAN CHANGE THE OBJECTS LAYER WHEN USING OTHER SETTINGSDATA, EG GOING TO MAPDATA
    // THEN Layer.OBJECTS WILL BE CHANGED ACCORDING TO ITS NEW VALUE IN ENTITYDATA.JSON, THEN WHEN GOING BACK TO INITIAL SETTINGSDATA
    // initialObjectsLayer WILL BE USED TO SET IT BACK TO ITS ORIGINAL VALUE
    initialObjectsLayer: int = -1;

    get imagePath(): string { return BareGame.rootPath + "/" + BareGame.imagePath; }
    get levelPath(): string { return BareGame.rootPath + "/" + BareGame.levelPath; }
    get soundPath(): string { return BareGame.rootPath + "/" + BareGame.soundPath; }

    get levelEditorOpen(): boolean { return window.gameMode == GameMode.Editor; }
    get currentLevelStr(): string { return SaveData.currentLevelStr; }

    constructor(entityDataJson:SettingsData = defaultEntityData)
    {
        window.bare = this.GetRapidProxy();

        events.emit('firstStart');

        if (!pipes.has("cameraHandler_ScreenToWorld")) //IF CAMERAHANDLER HAS NOT ALREADY SET THESE
        {
            // LET THEM RETURN DEFAULT VALUES
            pipes.set("cameraHandler_GetRenderInfo", () => ({ position: new Vec2(0, 0), offset: new Vec2(0, 0), scale: 1 }));
            pipes.set("cameraHandler_ScreenToWorld", (x: number, y: number) => new Vec2(x, y));
            pipes.set("cameraHandler_WorldToScreen", (x: number, y: number) => new Vec2(x, y));
            pipes.set("cameraHandler_GetCameraZoom", () => 1);
        }

        this.RegisterGameObjectPool(GameObject, BareGame.gameObjectPoolSize);
        //this.LoadComponents();

        this.RunMainLoopBound = this.RunMainLoop.bind(this);

        this.Awake(entityDataJson);
    }

    async Awake(entityDataJson:SettingsData)
    {
        this.ResizeCanvas();

        this.ImplementInitialTextures();
        
        await this.OnAwake();

        await this.initialSettingsHandler.Process(entityDataJson); // NEEDS TO GO AFTER AWAKE() SINCE IT CAN LOAD ANIMATION FRAMES THAT OVERRIDDEN SHOULD LOAD

        this.SetCurrentSettingsHandler(this.initialSettingsHandler);

        await this.Start();

        this.HideLoadingText();

        window.addEventListener('resize', this.ResizeCanvas.bind(this));

        this.lastUpdateTimeRef = performance.now();
    }

    OnAwake(): void | Promise<void>
    {
        // FOR OVERRIDE
    }

    async Start()
    {
        // IT GETS HERE ON INITIALIZATION AND RESTART

        window.gameMode = GameMode.Game;

        rapid.backgroundColor = Color.White;

        this.SetCurrentSettingsHandler(this.initialSettingsHandler);

        window.bare = this.GetRapidProxy(); // HACK FOR DEMO
        
        await this.OnStart();

        if (this.RunMainLoopId == -1)
        {
            this.RunMainLoopId = requestAnimationFrame(this.RunMainLoopBound);
        }

        this.started = true;
        
        events.emit('gameStarted');
    }

    OnStart(): void | Promise<void>
    {
        // FOR OVERRIDE

        // OPTIONAL TO OVERRIDE AS ASYNC - TO LOAD SOME MORE ASSETS BEFORE THE LOADING SCREEN DISAPPEARS
    }

    // A CATCH-ALL METHOD TO REGISTER CLASSES
    // CAN BE CONTROLLER/GAMEOBJECT/COMPONENT/PHYSICS/ETC
    AddClass(_class: any, ...args: any[]): void
    {
        const className = _class.name;

        if (BareGame.registeredClasses[className])
        {
            //console.warn(`Module ${className} is already registered`);
            return;
        }

        // CONTROLLERS - SHOULD NOT CREATE ANOTHER INSTANCE
        var classNameFirstLowercase = className.charAt(0).toLowerCase() + className.slice(1);
        if (globalThis[classNameFirstLowercase])
        {
            return;
        }

        // GAMEOBJECT
        if (_class.prototype instanceof GameObject)
        {
            this.RegisterGameObjectPool(_class, 1);

            BareGame.registeredClasses[className] = "taken";
            return;
        }

        // COMPONENT
        if (className.endsWith('Component'))
        {
            this.RegisterComponent(_class);

            //BareGame.modules[className] = "taken"; // COMMENTED OUT SINCE REGISTERED COMPONENTS ARE LOCAL TO BARE, HAS TO ADD

            return;
        }

        let instance = new _class(...args);
        BareGame.registeredClasses[className] = instance;
    }

    RegisterComponent(componentClass: any)
    {
        var classNameNoLeadingUnderscore = componentClass.name.replace(/^_/, ''); // REMOVE LEADING _ THAT SOME COMPONENTS GET
        bare.componentClasses[classNameNoLeadingUnderscore] = componentClass;
    }

    ImplementInitialTextures()
    {
        var entries = Object.entries(window.initialAssets);
        var entriesIgnore = new Set<string>();

        for (const [name, asset] of entries)
        {
            // FIND JSON WITH MATCHING WEBP, THEN ADD AS SPRITESHEET
            if (name.endsWith(".json"))
            {
                const json = window.initialAssets[name];

                if (!json.frames || !json.meta || !json.meta.image)
                    continue; // SKIP, NOT AN ATLAS

                const imgName = json.meta.image;
                const img = window.initialAssets[imgName];
                assetsHandler.ProcessAtlas(json, img);

                // ATLAS IS PROCESSED AND ADDED ANIMATIONS POTENTIALLY,
                // MORE ANIMATION DATA LIKE FPS AND LOOP CAN BE SET LATER IN ENTITY SETTINGS PROCESS()

                entriesIgnore.add(imgName); // PREVENT ADDING ATLAS TO TEXTURES BELOW
            }
        }
        
        for (const [name, asset] of entries)
        {
            if (!name.endsWith('.webp')) continue;
            if (entriesIgnore.has(name)) continue;
            
            // ADD REGULAR TEXTURE
            var texture = rapid.textures.addImageFromSource(asset);
            var nameMinusExt = name.split('.')[0];
            assetsHandler.AddTexture(nameMinusExt, texture);
        }
    }

    SetCurrentSettingsHandler(settingsHandler:SettingsHandler): SettingsHandler
    {
        this.currentSettingsHandler = settingsHandler;

        var isBase = (this.currentSettingsHandler === this.initialSettingsHandler);
        this.ApplyLayerInfoToSettings(this.currentSettings, isBase);

        return this.currentSettingsHandler;
    }

    // SEPARATE THIS OUT? TODO
    private ApplyLayerInfoToSettings(data: SettingsData, isBase: boolean)
    {
        // SET UP NEW LAYER INFOS
        this.layerInfos = {};
        data.layersInfo ??= {};
        
        for (var j = 0; j < data.layers.length; j++)
        {
            const layerName = data.layers[j];
            const storedInfo = data.layersInfo[layerName] ?? {};
            const layerInfo = {
                name: layerName,
                layerI: j,
                ...storedInfo
            } as LayerInfo;

            if (layerInfo.showInEditor === undefined)
                layerInfo.showInEditor = true;

            this.layerInfos[j] = layerInfo;

            // only persist data that belongs in settingsdata
            const { showInEditor } = layerInfo;
            data.layersInfo[layerName] = { ...storedInfo, ...(showInEditor === undefined ? {} : { showInEditor }) };
        }
        this.layerNames = data.layers.slice();

        // ASSIGN LAYER DATA TO layerInfos
        if (data.uiLayers)
        {
            for (var j = 0; j < data.uiLayers.length; j++)
            {
                const layerName = data.uiLayers[j];
                const storedInfo = data.layersInfo[layerName] ?? {};
                const layerInfo = {
                    name: layerName,
                    layerI: j,
                    ...storedInfo
                } as LayerInfo;

                if (layerInfo.showInEditor === undefined)
                    layerInfo.showInEditor = true;

                this.layerInfos[UI_LAYER + j] = layerInfo;

                // only persist data that belongs in settingsdata
                const { showInEditor } = layerInfo;
                data.layersInfo[layerName] = { ...storedInfo, ...(showInEditor === undefined ? {} : { showInEditor }) };
            }
        }

        // HANDLE CHANGE OF OBJECTS LAYER, COULD BE DIFFERENT IN ANOTHER ENTITYDATA.JSON
        // WHICH MESSES WITH CODE HERE THAT USES Layer.OBJECTS, SO CHANGING OR REVERTING THE VALUE HERE
        var layerIndexObjects = this.layerNames.indexOf("Objects");
        if (isBase)
        {
            if (this.initialObjectsLayer == -1)
            {
                // SAVING FOR REVERT - HAPPENS ONCE
                this.initialObjectsLayer = layerIndexObjects;
            }
            else
            {
                // REVERTING BACK
                Layer.OBJECTS = this.initialObjectsLayer;
            }
        }
        else
        {
            if (layerIndexObjects != -1)
            {
                // CHANGING TO NEW VALUE
                Layer.OBJECTS = layerIndexObjects;
            }
        }
    }

    // HOW USEFUL IS THIS POOLING REALLY? TODO
    // NO CONTROL OVER CACHE LOCALITY IN JS, MAYBE FASTER INITIALIZATION FOR MANY OBJECTS
    RegisterGameObjectPool(cls: GameObjectClass, defaultPoolSize: number = 10): void
    {
        const name = cls.name.startsWith("_") ? cls.name.substring(1) : cls.name;
        BareGame.gameObjectPools.set(name, new PoolHandler(() => new cls(), defaultPoolSize));
    }
    
    HideLoadingText()
    {
        rapid.canvas.style.display = "block";

        if (window.destroyTextFunc)
        {
            window.destroyTextFunc();
            window.destroyTextFunc = null;
        }
    }
    
    ConstructEntity(nameOrEntity: string | Entity, settingsData: SettingsData = this.currentSettings, options: { propsToIgnoreInEntity?: string[] } = { propsToIgnoreInEntity: [] }): Entity
    {
        var final = (entity:Entity) => {
            // ANYTHING WITH A HITBOX IS A PHYSICS OBJECT
            if (entity.hitbox && entity.extend == "GameObject") 
                entity.extend = "PhysicsObjectBare";

            this.FillPresets(entity, settingsData);

            return entity
        }

        options.propsToIgnoreInEntity ||= [];

        function mergeComponents(comp1: any, comp2: any):Record<string, Record<string, any>>
        {
            const merged = { ...comp1 };
            
            if (comp2) {
                for (const [key, value] of Object.entries(comp2)) {
                    if (merged[key] && typeof value === 'object' && !Array.isArray(value)) {
                        merged[key] = { ...merged[key], ...value };
                    } else {
                        merged[key] = value;
                    }
                }
            }
            
            return merged;
        }

        var foundEntityInEntities = false;

        var entity:Entity;
        
        if (typeof nameOrEntity === "object")
        {
            // ARG IS ENTITY
            entity = { ...nameOrEntity }; // CLONING SINCE WE DO entity.extendData = "ANY"; LATER AND DON'T WANT THAT TO APPLY TO ORIGINAL ENTITY, ELSE IT GETS SAVED TOO

            if (entity.extend && settingsData.entityBases && !settingsData.entityBases[entity.extend])
                return final(entity); // ENTITY HAS ALREADY BEEN CONSTRUCTED, IT'S EXTENDING A CLASS, SINCE IT'S NOT IN ENTITY BASES
        }
        else
        {
            // ARG IS NAME
            var possibleEntity = settingsData.entities[nameOrEntity] as Entity;
            if (possibleEntity)
            {
                // ENTITY NAME IS DEFINED IN ENTITIES
                entity = { ...possibleEntity };
                foundEntityInEntities = true;
            }
            else
            {
                // ENTITY NAME NOT FOUND, SO TAKE THE 'ANY' ENTRY, CLONE IT, AND ASSIGN A NEW NAME
                if (settingsData.entityBases && settingsData.entityBases["ANY"])
                {
                    var entityBase = settingsData.entityBases!["ANY"] as Entity;
                    entity = { ...entityBase };
                    entity.name = (nameOrEntity as string);
                }
                else
                {
                    // NO 'ANY' BASE, JUST USE THE NAME
                    entity = { name: (nameOrEntity as string) };
                }
            }
        }
    
        if (!entity.extend)
        {
            // ENTITY DATA THERE, USE THAT AS BASE
            var entityBaseMaybe = settingsData.entities[entity!.name!];
            if (entityBaseMaybe)
            {
                // ENTITY NAME IS DEFINED IN ENTITIES, MERGE THAT DATA WITH CURRENT (LEVEL DATA)
                entity = {
                    ...entityBaseMaybe,
                    ...entity,
                    components: mergeComponents(entityBaseMaybe.components, entity.components),
                    editorComponents: mergeComponents(entityBaseMaybe.editorComponents, entity.editorComponents)
                };

                foundEntityInEntities = true;
            }
        }

        // ENTITY WAS FOUND IN ENTITIES ARRAY IN DATA, DELETE SPECIFIED IGNORED PROPS FROM IT
        // USING IT ATM TO FIND THE PROPS SET ON THE BASE
        if (foundEntityInEntities)
        {
            for (var prop of options.propsToIgnoreInEntity)
            {
                delete entity[prop as keyof Entity];
            }
        }

        // IF EXTEND DATA NOT SET, DEFAULT TO ANY BASE
        if (!entity.extend)
        {
            if (settingsData.entityBases && settingsData.entityBases["ANY"])
            {
                entity.extend = "ANY";
            }
            else
            {
                // NOT ANY BASE DATA TO TAKE FROM, JUST EXTEND GAMEOBJECT CLASS
                entity.extend = "GameObject";
                return final(entity); // EXIT OUT
            }
        }

        while (entity!.extend && settingsData.entityBases![entity!.extend])
        {
            // ENTITY BASE DATA THERE, USE THAT AS BASE
            var entityBaseMaybe = settingsData.entityBases![entity!.extend];
            if (!entityBaseMaybe)
            {
                entityBaseMaybe = this.ConstructEntity(entity.extend);
            }

            var entityBase = entityBaseMaybe as Entity;
        
            // IF EXTEND DATA NOT SET, DEFAULT TO ANY
            if (!entityBase.extend)
            {
                if (settingsData.entityBases && settingsData.entityBases["ANY"])
                {
                    entityBase.extend = "ANY";
                }
                else
                {
                    // NOT ANY BASE DATA TO TAKE FROM, JUST EXTEND GAMEOBJECT CLASS
                    entity.extend = "GameObject";
                    return final(entity); // EXIT OUT
                }
            }

            // INSERT MEMBERS FROM ENTITY BASE WE DIDN'T DEFINE ALREADY IN ENTITY
            entity = { 
                ...entityBase,
                ...entity, // TAKES PRECEDENCE OVER BASE
                extend: entityBase.extend, 
                components: mergeComponents(entityBaseMaybe.components, entity.components),
                editorComponents: mergeComponents(entityBaseMaybe.editorComponents, entity.editorComponents)
            };
        }
        
        // REMOVE PROPERTIES SPECIFICALLY LISTED TO REMOVE IN ENTITY
        if (entity.propertiesRemoved)
        {
            for (const propertyName of entity.propertiesRemoved)
            {
                delete (entity as Record<string, any>)[propertyName];
            }
        }

        return final(entity);
    }

    ApplyEntityToGameObject(entity: Entity, obj: GameObject, addComponents: boolean = true)
    {
        this.ApplyEntityVarsToGameObject(entity, obj);

        obj.entity = entity;
        
        obj.ApplyEntityToGameObject(entity, addComponents);

        if (addComponents)
            pipes.run("componentController_ProcessCompentsFromEntity", entity, obj);
    }

    FillPresets(entity: Entity, settingsData: SettingsData = this.currentSettings)
    {
        var presets = settingsData.presets;

        if (!presets)
            return;

        for (const key in entity)
        {
            var propName = key as keyof Entity;
            var value = entity[propName];

            // IF ENTITY VALUE IS DEFINED AS PRESET AND PRESET HOLD ENTITY PROPERTY NAME
            if (typeof value === "string")
            {
                const preset = presets[value];
                const presetValue = preset?.[propName];

                if (presetValue !== undefined)
                {
                    // OVERWRITE ENTITY VALUE WITH VALUE FROM PRESET
                    (entity as Record<string, any>)[propName] = presetValue;
                }
            }
        }
    }

    private specialMap: Record<string, (obj: GameObject, value: any) => void> =
    {
        pivot: (o, v) => o.SetPivot(v.x, v.y), // SETPIVOT DOES SOME EXTRA WORK FOR PERCENTAGES, SO CUSTOM MAPPING
    };

    ApplyEntityVarsToGameObject(entity: any, obj: any)
    {
        // PUT STATIC LAST - FOR SOPIRO PHYSICS, IT NEEDS ALL OTHER RIGIDBODY DATA LIKE MASS FIRST, THEN SET STATIC
        if (entity.static)
        {
            var val = entity.static;
            delete entity.static;
            entity.static = val;
        }

        for (const key in entity) {
            const value = entity[key];
            if (value === undefined) continue;

            // skip if obj doesn't have the field
            if (!(key in obj)) continue;

            // if special mapping exists — use it
            const special = this.specialMap[key];
            if (special) {
                special(obj, value);
                continue;
            }

            // detect XY struct
            const isXY =
                value &&
                typeof value === "object" &&
                "x" in value &&
                "y" in value;

            if (isXY && obj[key] && typeof obj[key] === "object") {
                if ("x" in obj[key] && "y" in obj[key]) {
                    obj[key].x = value.x;
                    obj[key].y = value.y;
                    continue;
                }
            }

            // generic direct assignment
            obj[key] = value;
        }
    }

    GetDummpyDataFromEntity(nameOrEntity: string | Entity, settingsData: SettingsData = this.initialSettingsHandler.Get(), options: { propsToIgnoreInEntity?: string[] } = { propsToIgnoreInEntity: [] }): {entity: Entity, gameObject: GameObject}
    {
        var entityConstructed = this.ConstructEntity(nameOrEntity, settingsData, options);
        this.dummyGameObject.ResetValues();
        this.dummyGameObject.InitTexture(MakePath(entityConstructed.imagePath!, entityConstructed.name)); // COULD BE NEEDED TO SET PIVOT RIGHT IF IT'S A PERCENTAGE
        this.ApplyEntityToGameObject(entityConstructed, this.dummyGameObject);

        return {entity: entityConstructed, gameObject: this.dummyGameObject};
    }

    GetObjectFromPool(objectName: string): GameObject
    {
        var pool = BareGame.gameObjectPools.get(objectName);
        if (!pool)
        {
            throw new Error(`No pool found for ${objectName}`);
            //this.RegisterGameObjectPool(objectName, () => new GameObject(), 20);
        }

        return pool.Grab();
    }

    // INPUT COULD BE: ENTITY, ENTITY NAME, GAMEOBJECT, CLASS TO INSTANTIATE OR TEXTURE
    AddGameObject(input?: Entity | string | GameObject | GameObjectClass | Texture, parent: int | GameObject = Layer.OBJECTS): GameObject
    {
        // CREATE
        var gameObject: GameObject;
        if (!input)
        {
            // DEFAULT GAMEOBJECT
            gameObject = this.GetObjectFromPool("GameObject");
            gameObject.pooled = true;
            gameObject.name = "pooledGameObject";
        }
        else
        if (typeof input === "function")
        {
            // GameObjectClass CASE, INSTANTIATE FROM POOL IF IT EXISTS
            const pool = BareGame.gameObjectPools.get(input.name);
            if (pool)
                gameObject = pool.Grab();
            else
                gameObject = new input(); 

            if (pool)
                gameObject.pooled = true;

            gameObject.name = (pool ? "pooledGameObjectExtend" : "gameObjectExtend");
        }
        else
        if (input instanceof GameObject)
        {
            // GameObject INSTANCE ALREADY PROVIDED
            gameObject = input;
        }
        else
        if (input instanceof Texture)
        {
            // TEXTURE
            gameObject = this.GetObjectFromPool("GameObject");
            gameObject.SetTexture(input);
            gameObject.pooled = true;
            gameObject.name = "pooledGameObjectFromTexture";
        }
        else
        {
            var entity: Entity;

            if (typeof input === "string" && input.startsWith("/"))
            {
                // PATH STRING - SET UP A BASIC ENTITY
                var path = input;
                var split = path.split("/");
                var imagePath = split.slice(0, split.length - 1).join("/");
                var name = split[split.length - 1];

                entity = {imagePath: imagePath, name:name, extend: "GameObject"};
            }
            else
            {
                // ENTITY OR ENTITY NAME - CONSTRUCT IT
                entity = this.ConstructEntity(input);
            }

            gameObject = this.GetObjectFromPool(entity.extend!);
            gameObject.pooled = true;
            gameObject.Init(MakePath(entity.imagePath!, entity.name));
            this.ApplyEntityToGameObject(entity, gameObject);
        }

        // ADD
        //if (gameObject.name == "")
            //trace("added gameobject with no name");

        if (parent instanceof GameObject)
        {
            // ADDING TO PARENT
            var child = gameObject;
            parent.AddChild(child);
        }
        else
        {
            // ADDING TO LAYER
            var layer = parent;

            if (layer < UI_LAYER)
                objectController.Add(gameObject, layer);
            else
                uiController.Add(gameObject, layer);
        }

        gameObject.Added();

        // NOTIFY
        events.emit('gameObjectAdded', { gameObject: gameObject, layer: parent });

        return gameObject;
    }

    public AddGameObjectFromImagePath(path:string, parent: int | GameObject = Layer.OBJECTS): GameObject
    {
        if (!path.startsWith("/"))
            path = "/" + path; // NEEDS A SLASH IN FRONT FOR ADDGAMEOBJECT() TO RECOGNIZE IT'S A PATH

        var gameObject = this.AddGameObject(path, parent);

        return gameObject;
    }

    RemoveGameObject(gameObject: GameObject, parent?: int | GameObject)
    {
        if (!gameObject.addedToLevel)
        {
            // GAMEOBJECT WAS ALREADY REMOVED
            return;
        }

        var wasPooled = gameObject.pooled;
        gameObject.pooled = false; // SETTING TO FALSE ALREADY HERE TO PREVENT RECURSION LOOP IN RemoveChild

        var removed = false;

        if (parent)
        {
            if (parent instanceof GameObject)
            {
                // REMOVING FROM PARENT
                var child = gameObject;
                removed = parent.children.includes(child);
                parent.RemoveChild(child);
            }
            else
            {
                // REMOVING FROM LAYER
                var layer = parent;

                if (layer < UI_LAYER)
                    removed = objectController.Remove(gameObject, layer);
                else
                    removed = uiController.Remove(gameObject, layer);
            }
        }
        else
        {
            removed = objectController.Remove(gameObject) || uiController.Remove(gameObject);
        }
        
        if (!removed)
            trace("FAILED TO REMOVE GAMEOBJECT");
        
        gameObject.Removed();

        // NOTIFY
        events.emit('gameObjectRemoved', gameObject);

        if (wasPooled)
        {
            const className = this.GetContructorName(gameObject);
            const pool = BareGame.gameObjectPools.get(className);
            if (pool)
                pool.Release(gameObject);
        }
    }

    MouseIsOnEditor(event: PointerEvent | WheelEvent): boolean
    {
        if (!this.levelEditorOpen)
            return false;

        const target = event.target as HTMLElement;
        var name = (target.id || target.className);

        var onEditor = (name != "canvas");

        return onEditor;
    }

    ResizeCanvas()
    {
        var prevWidth = rapid.width;
        var prevHeight = rapid.height;
        var newWidth = window.innerWidth;
        var newHeight = window.innerHeight;

        rapid.resize(newWidth, newHeight);

        events.emit('resize', { prevWidth: prevWidth, prevHeight: prevHeight, newWidth: newWidth, newHeight: newHeight });

        // PERSIST UI LAYOUT
        var uiControllerObjs = uiController.GetLayers();
        for (var i = 0; i < uiControllerObjs.length; i++)
        {
            var objs = uiControllerObjs[i];
            for (var j = 0; j < objs.length; j++)
            {
                var obj = objs[j];
                obj.SetPosition(obj.x * newWidth / prevWidth, obj.y * newHeight / prevHeight);
            }
        }
    }

    RunMainLoop()
    {
        if (window.isLocalhost || hasFocus)
        {
            const currentTime = performance.now();
            this.deltaTime = (currentTime - this.lastUpdateTimeRef) / 1000;
            this.lastUpdateTimeRef = currentTime;
            this.time = currentTime;
            this.gameSpeed = 1 / (this.deltaTime / .0166666);
            this.count++;
            //trace("gameSpeed", this.gameSpeed);

            this.Update(this.deltaTime);

            if (this.doRender)
                this.RenderOuter();
        }

        this.RunMainLoopId = requestAnimationFrame(this.RunMainLoopBound);
    }

    Update(deltaTime:number)
    {
        if (this.isPaused)
            return;
        
        events.emit('preUpdate', { deltaTime: deltaTime });

        events.emit('mouseController_Update', deltaTime);
        events.emit('hitboxController_Update', deltaTime);
        events.emit('editorController_Update', deltaTime); 

        this.OnUpdate(deltaTime);

        events.emit('screenController_Update', deltaTime);
        objectController.Update(deltaTime);
        uiController.Update(deltaTime);
        events.emit('physicsController_Update', deltaTime);
        events.emit('componentController_Update', deltaTime);

        events.emit('update', { deltaTime: deltaTime });
    }

    OnUpdate(deltaTime: number)
    {
        // FOR OVERRIDE    
    }

    // CAN BE OVERRIDEN TO INSERT SOME POST PROCESSING https://nightre.github.io/Rapid.js/docs/docs.html?doc=fbo
    RenderOuter()
    {
        rapid.clear(rapid.backgroundColor);//
        
        rapid.startRender();
        this.Render();
        rapid.endRender();
    }

    Render()
    {
        rapid.save();
        
        const cameraInfo = pipes.run("cameraHandler_GetRenderInfo", this.levelEditorOpen);

        // Apply the camera transform
        rapid.matrixStack.translate(cameraInfo.offset.x, cameraInfo.offset.y);
        rapid.renderCamera({
            position: cameraInfo.position,
            scale: 1 / cameraInfo.scale,
            saveTransform: false
        });
        
        events.emit('preRender');

        events.emit('componentController_PreRender'); // ALL THIS EMITS MIGHT BE SLOW? ESPECIALLY FOR COMPONENT-CONTROLLER, SENDING MORE TO COMPONENTS
        objectController.PreRender();
        events.emit('componentController_Render');
        events.emit('screenController_Render');
        objectController.Render();
        this.OnRender();
        events.emit('physicsController_Render');
        events.emit('componentController_PostRender');
        objectController.PostRender();

        events.emit('postRender');
        rapid.restore();
        
        uiController.Render();
    }

    OnRender()
    {
        // FOR OVERRIDE   
    }

    /**
     * Render a source texture into a target rendertexture
     */
    RenderTextureTo(source: Texture, target: RenderTexture | FrameBufferObject, clear: boolean = false): boolean
    {
        return rapid.renderTextureTo(source, target, clear);
    }

    /**
     * Render a game object into a target rendertexture
     */
    RenderGameObjectTo(obj: GameObject, target: RenderTexture | FrameBufferObject, clear: boolean = false): boolean
    {
        const fbo = target instanceof FrameBufferObject
            ? target
            : (target.base instanceof FrameBufferObject ? target.base : undefined);

        if (!fbo)
            return false;

        rapid.drawToFBO(fbo, () => {

            obj.Render();
        }, clear);

        return true;
    }

    /**
     * Render a texture or game object into a target rendertexture
     */
    RenderTo(source: Texture | GameObject, target: RenderTexture | FrameBufferObject, clear: boolean = false): boolean
    {
        const fbo = target instanceof FrameBufferObject
            ? target
            : (target.base instanceof FrameBufferObject ? target.base : undefined);

        if (!fbo)
            return false;

        rapid.drawToFBO(fbo, () => {
            if (source instanceof GameObject)
                source.Render();
            else
                rapid.renderSprite({ texture: source })
        }, clear);

        return true;
    }

    MoveGameObjectToUI(gameObject: GameObject, uiLayer: int = UI_LAYER): void
    {
        objectController.Remove(gameObject);
        uiController.Add(gameObject, uiLayer);

        var screenPos = this.WorldToScreenPos(gameObject.position);
        gameObject.x = screenPos.x;
        gameObject.y = screenPos.y;
    }

    MoveGameObjectToWorld(gameObject: GameObject, layer: int = 0): void
    {
        uiController.Remove(gameObject);
        objectController.Add(gameObject, layer);

        var worldPos = this.ScreenToWorldPos(gameObject.position);
        gameObject.x = worldPos.x;
        gameObject.y = worldPos.y;
    }

    ScreenToWorldPos(position:Vec2)
    {
        return this.ScreenToWorld(position.x, position.y);
    }

    WorldToScreenPos(position:Vec2)
    {
        return this.WorldToScreen(position.x, position.y);
    }

    ScreenToWorld(x:number, y:number)
    {
        return pipes.run("cameraHandler_ScreenToWorld", x, y);
    }

    WorldToScreen(x: number, y: number)
    {
        return pipes.run("cameraHandler_WorldToScreen", x, y);
    }

    GetCameraZoom(): number 
    {
        return pipes.run("cameraHandler_GetCameraZoom");
    }

    GetContructorName(gameObject: GameObject): string
    {
        var name = gameObject.constructor.name;

        if (name.startsWith("_")) // SOMETIMES GET NAMES LIKE _GameObject, REMOVING THAT _ HERE
            name = name.substring(1);

        return name;
    }

    SetCursor(cursorStr: string): void
    {
        rapid.canvas.style.cursor = cursorStr;
    }

    // NOT GREAT! BETTER WAY? MOVE OVERWRITE/CALL THROUGH ALL THE RAPID VARS? TODO
    GetRapidProxy()
    {
        const rapidProxy = new Proxy(this as any, {
            get: (target, prop, receiver) => {
                if (prop === "rapid") return rapid;
                if (prop in target)
                {
                    const value = Reflect.get(target, prop, receiver);
                    return typeof value === "function" ? value.bind(target) : value;
                }
                const rapidValue = (rapid as any)[prop];
                return typeof rapidValue === "function" ? rapidValue.bind(rapid) : rapidValue;
            },
            set: (target, prop, value, receiver) => {
                if (prop in target || prop === "rapid")
                {
                    return Reflect.set(target, prop, value, receiver);
                }
                (rapid as any)[prop] = value;
                return true;
            },
            has: (target, prop) => {
                if (prop in target || prop === "rapid") return true;
                return prop in (rapid as any);
            }
        });

        return rapidProxy;
    }

    async SaveEntityData(newRawData: SettingsData)
    {
        this.initialSettingsHandler.SetRaw(newRawData);
        await this.initialSettingsHandler.Process();
    
        // Persist to disk via dev-server endpoint when available (local only)
        if (!window.isLocalhost) {
          return { ok: true, saved: false, message: 'Save skipped (not localhost)' };
        }
    
        try {
            const res = await fetch('/api/save-entity-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                entityData: this.initialSettingsHandler.GetRaw(),
                skipReload: true
            })
          });
          const json = await res.json().catch(() => null);
          return { ok: res.ok, saved: res.ok, response: json };
        } catch (error: any) {
          console.error('Failed to save entity data', error);
          return { ok: false, error: error?.message ?? String(error) };
        }
    }

    // OVERRIDE THIS TO LOAD SOME MORE TEXTURES DURING LEVEL LOAD
    CreatePromiseLevelTextures(level: LevelData): Promise<Texture>[]
    {
        var promisesAr: Array<Promise<Texture>> = [];
        var texturesFound = new Set<string>();
        for (var layerName in level.entitiesByLayer) {
            var entities = level.entitiesByLayer[layerName];
            entities.forEach((entity: any) => {
                var entityConstructed = this.ConstructEntity(entity);
                var imagePath = entityConstructed.imagePath;
                var fullPath = imagePath + "/" + entity.name;

                if (texturesFound.has(fullPath))
                    return;

                promisesAr.push(assetsHandler.GetTexturePromise(MakePath(imagePath!, entity.name)));
                texturesFound.add(fullPath);
            });
        }

        return promisesAr;
    }
    
    // MAKE THESE EVENTS? TODO
    async BeforeLoadLevel()
    {
        this.doRender = false;
    }
    
    AfterLoadLevel(level:LevelData)
    {
        this.doRender = true;

        this.OnLoadedLevel(level);
    }

    OnLoadedLevel(level:LevelData)
    {
        // FOR OVERRIDE
    }

    RemoveAll()
    {
        objectController.Clear();
        uiController.Clear();
    }

    async Restart(full:boolean = false)
    {
        this.Clear(full);
        await this.Start();
    }

    Clear(full:boolean = false)
    {
        events.emit('clear', { full: full });

        this.ClearScene();
        this.OnClear(full);

        if (full)
        {
            cancelAnimationFrame(this.RunMainLoopId);
            this.RunMainLoopId = -1;
        }
    }

    OnClear(full:boolean = false)
    {
        // FOR OVERRIDE
    }

    ClearScene()
    {
        // NOT SENDING CLEAR EVENT HERE... WANT THAT?

        this.ApplyLayerInfoToSettings(this.currentSettings, true);

        this.RemoveAll();

        events.clear(); // LEAVES PERSISTENT EVENTS
    }

    static ClearAll()
    {
        // CLEAR ALL OF BARE
        // SHOULDN'T REALLY BE NECESSARY, BUT THE DEMO PROJECT NEEDS IT SINCE IT 
        // HANDLES MULTIPLE BARE-GAME CLASSES. NOT RECOMMEND FOR OTHER PROJECTS

        bare.Clear(true);
        assetsHandler.Clear();
        
        //BareGame.registeredClasses = {};
        //events.clearAll();
        //pipes.clear();

        bare.started = false;
    }
}
