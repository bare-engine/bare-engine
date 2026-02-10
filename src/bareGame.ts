import { events, GameMode, MakePath, pipes } from "./main";
import { Color, FrameBufferObject, RenderTexture, Texture, Vec2 } from "./libraries/rapid-render";
import { PoolHandler } from "./utils/poolHandler";
import { BareEvent, Entity, GameObjectClass, Layer, LayerInfo, LevelData, SaveData, SettingsData, UI_LAYER } from "./utils/bareTypes";
import { GameObject } from "./objects/gameObject";
import { SettingsHandler as SettingsHandler } from "./utils/settingsHandler";
import { assetsHandler } from "./utils/assetsHandler";
import { defaultEntityData as defaultEntityData } from "./utils/bareData";
import { PhysicsObjectBare } from "./barePhysics";
import { SaveDataHandler } from "./utils/SaveDataHandler";
import { ObjectController } from "./controllers/objectController";

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

    public started: boolean = false;
    public persistent: boolean = false;

    public componentClasses: Record<string, any> = {};

    public baseSettingsHandler: SettingsHandler = new SettingsHandler();
    public currentSettingsHandler: SettingsHandler;

    get baseSettings(): SettingsData { return this.baseSettingsHandler.Get(); }
    get currentSettings(): SettingsData { return this.currentSettingsHandler.Get(); }
    
    isPaused: boolean = false;
    doRender: boolean = true;

    layerInfos: Record<int, LayerInfo> = {};
    layerNames: string[];

    // BIT HACKY, BUT STORING THIS SO THAT I CAN CHANGE THE OBJECTS LAYER WHEN USING OTHER SETTINGSDATA, EG GOING TO MAPDATA
    // THEN Layer.OBJECTS WILL BE CHANGED ACCORDING TO ITS NEW VALUE IN ENTITYDATA.JSON, THEN WHEN GOING BACK TO INITIAL SETTINGSDATA
    // initialObjectsLayer WILL BE USED TO SET IT BACK TO ITS ORIGINAL VALUE
    initialObjectsLayer: int = -1;

    get imagePath(): string { return BareGame.rootPath + "/" + BareGame.imagePath; }
    get levelPath(): string { return BareGame.rootPath + "/" + BareGame.levelPath; }
    get soundPath(): string { return BareGame.rootPath + "/" + BareGame.soundPath; }

    get currentLevelStr(): string { return SaveData.currentLevelStr; }

    constructor(entityDataJson:SettingsData = defaultEntityData)
    {
        window.bare = this.GetRapidProxy();

        this.AddClass(PhysicsObjectBare); // ADDING THIS SINCE AN ENTITY COULD HAVE A HITBOX AND BECOME A PHYSICS OBJECT

        if (!pipes.has("cameraHandler_ScreenToWorld")) //IF CAMERAHANDLER HAS NOT ALREADY SET THESE
        {
            // LET THEM RETURN DEFAULT VALUES
            pipes.set("cameraHandler_GetRenderInfo", () => ({ position: new Vec2(0, 0), offset: new Vec2(0, 0), scale: 1 }));
            pipes.set("cameraHandler_ScreenToWorld", (x: number, y: number) => new Vec2(x, y));
            pipes.set("cameraHandler_WorldToScreen", (x: number, y: number) => new Vec2(x, y));
            pipes.set("cameraHandler_GetZoom", () => 1);
        }

        this.RegisterGameObjectPool(GameObject, BareGame.gameObjectPoolSize);
        //this.LoadComponents();

        this.Awake(entityDataJson);
    }

    async Awake(entityDataJson:SettingsData)
    {
        rapid.backgroundColor = Color.White;

        await this.baseSettingsHandler.Process(entityDataJson);
        this.SetCurrentSettingsHandler(this.baseSettingsHandler);

        events.emit(BareEvent.game_awake);

        await this.OnAwake();

        this.baseSettingsHandler.ReprocessAnimations(); // NEEDED SINCE AN ATLAS WITH ANIMATIONS CAN BE LOADED IN AT AWAKE() ABOVE

        await this.Start();

        this.HideLoadingText();
    }

    OnAwake(): void | Promise<void>
    {
        // FOR OVERRIDE
    }

    async Start()
    {
        // IT GETS HERE ON INITIALIZATION AND RESTART

        window.gameMode = GameMode.Game;

        //rapid.backgroundColor = Color.White;

        this.SetCurrentSettingsHandler(this.baseSettingsHandler);// DOUBLE

        window.bare = this.GetRapidProxy(); // HACK FOR DEMO
        
        await this.OnStart();

        this.started = true;
        
        events.emit(BareEvent.game_started);
    }

    OnStart(): void | Promise<void>
    {
        // FOR OVERRIDE

        // OPTIONAL TO OVERRIDE AS ASYNC - TO LOAD SOME MORE ASSETS BEFORE THE LOADING SCREEN DISAPPEARS
    }

    // A CATCH-ALL METHOD TO REGISTER CLASSES
    // CAN BE CONTROLLER/GAMEOBJECT/COMPONENT/PHYSICS/ETC
    // DOESN'T ALWAYS DO SOMETHING, BUT JUST A HOAX TO LET THE DEV REFFERENCE THE CLASS
    AddClass(_class: any, ...args: any[]): void
    {
        const className = _class.name;

        if (BareGame.registeredClasses[className])
        {
            //console.warn(`Module ${className} is already registered`);
            return;
        }

        // CONTROLLERS
        var classNameFirstLowercase = className.charAt(0).toLowerCase() + className.slice(1);
        if (globalThis[classNameFirstLowercase])
        {
            if (globalThis[classNameFirstLowercase].Init)
            {
                globalThis[classNameFirstLowercase].Init(); // USED FOR PhysicsControllerBase, TO RE-SET PIPES, NEED FOR DEMO
            }

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

        //let instance = new _class(...args);
        //BareGame.registeredClasses[className] = instance;
    }

    RegisterComponent(componentClass: any)
    {
        var classNameNoLeadingUnderscore = componentClass.name.replace(/^_/, ''); // REMOVE LEADING _ THAT SOME COMPONENTS GET
        bare.componentClasses[classNameNoLeadingUnderscore] = componentClass;
    }

    SetCurrentSettingsHandler(settingsHandler:SettingsHandler): SettingsHandler
    {
        this.currentSettingsHandler = settingsHandler;

        var isBase = (this.currentSettingsHandler === this.baseSettingsHandler);
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
    // REUSE OF OBJECTS IS KINDA NICE
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
            if (entity.hitbox && entity.extendClass == "GameObject") 
                entity.extendClass = "PhysicsObjectBare";

            // BIT OF A HACK TO MAKE SURE SOPIRO RIGIDBODIES HAVE A CENTER PIVOT
            // PUT HERE TO LET THE EDITOR PREVIEW ALSO INHERIT IT
            var sopiroPhysicsClasses = ["Circle", "Box", "Polygon"];
            if (sopiroPhysicsClasses.includes(entity.extendClass))
                entity.pivot = { x: .5, y: .5 };

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

            if (entity.extendClass)
                return final(entity); // ENTITY HAS ALREADY BEEN CONSTRUCTED
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
    
        if (!entity.extendData)
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
        if (!entity.extendData)
        {
            if (settingsData.entityBases && settingsData.entityBases["ANY"])
            {
                entity.extendData = "ANY";
            }
            else
            {
                // NOT ANY BASE DATA TO TAKE FROM, JUST EXTEND GAMEOBJECT CLASS
                entity.extendClass = "GameObject";
                return final(entity); // EXIT OUT
            }
        }

        while (entity.extendData)
        {
            // ENTITY BASE DATA THERE, USE THAT AS BASE
            var entityBaseMaybe = settingsData.entityBases![entity!.extendData];
            if (!entityBaseMaybe)
            {
                entityBaseMaybe = this.ConstructEntity(entity.extendData);
            }

            var entityBase = entityBaseMaybe as Entity;
        
            // IF EXTEND DATA NOT SET, DEFAULT TO ANY
            if (!entityBase.extendData && !entityBase.extendClass)
            {
                if (settingsData.entityBases && settingsData.entityBases["ANY"])
                {
                    entityBase.extendData = "ANY";
                }
                else
                {
                    // NOT ANY BASE DATA TO TAKE FROM, JUST EXTEND GAMEOBJECT CLASS
                    entity.extendClass = "GameObject";
                    return final(entity); // EXIT OUT
                }
            }

            // INSERT MEMBERS FROM ENTITY BASE WE DIDN'T DEFINE ALREADY IN ENTITY
            entity = { 
                ...entityBase,
                ...entity, // TAKES PRECEDENCE OVER BASE
                extendData: entityBase.extendData, 
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
        obj.entity = entity;
        
        this.ApplyEntityVarsToGameObject(entity, obj);
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

    ApplyEntityVarsToGameObject(entity: Entity, obj: GameObject)
    {
        obj.ApplyEntityVarsToGameObject(entity, obj);

        // PROCESS POLYGON VERTICES FIRST, SET THE AREA THAT OTHER PHYSICS PROPERTIES NEED
        if (entity.polygonVertices)
        {
            // THIS SHOULD BE A POLYGON OBJECT, BUT SETTING AS ANY SINCE I DON'T WANT TO IMPORT POLYGON CLASS HERE
            (obj as any).polygonVertices = entity.polygonVertices;
            delete entity.polygonVertices;
        }

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

    GetDummpyDataFromEntity(nameOrEntity: string | Entity, settingsData: SettingsData = this.baseSettingsHandler.Get(), options: { propsToIgnoreInEntity?: string[] } = { propsToIgnoreInEntity: [] }): {entity: Entity, gameObject: GameObject}
    {
        var entityConstructed = this.ConstructEntity(nameOrEntity, settingsData, options);
        bare.dummyGameObject.ResetValues();
        bare.dummyGameObject.InitTexture(MakePath(entityConstructed.imagePath!, entityConstructed.name)); // COULD BE NEEDED TO SET PIVOT RIGHT IF IT'S A PERCENTAGE
        this.ApplyEntityToGameObject(entityConstructed, bare.dummyGameObject);

        return {entity: entityConstructed, gameObject: bare.dummyGameObject};
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

                entity = {imagePath: imagePath, name:name, extendClass: "GameObject"};
            }
            else
            {
                // ENTITY OR ENTITY NAME - CONSTRUCT IT
                entity = this.ConstructEntity(input);
            }

            gameObject = this.GetObjectFromPool(entity.extendClass!);
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
        events.emit(BareEvent.game_objectAdded, { gameObject: gameObject, layer: parent });

        return gameObject;
    }

    // STILL NEEDED?
    public AddGameObjectFromImagePath(path:string, parent: int | GameObject = Layer.OBJECTS): GameObject
    {
        if (!path.startsWith("/"))
            path = "/" + path; // NEEDS A SLASH IN FRONT FOR ADDGAMEOBJECT() TO RECOGNIZE IT'S A PATH

        var gameObject = this.AddGameObject(path, parent);

        return gameObject;
    }

    RemoveGameObject(gameObject: GameObject, parent?: int | GameObject)
    {
        var isUI = (parent !== undefined && !(parent instanceof GameObject) && parent >= UI_LAYER);
        if (!gameObject.addedToLevel && !isUI)
        {
            // GAMEOBJECT WAS ALREADY REMOVED
            return;
        }

        var wasPooled = gameObject.pooled;
        gameObject.pooled = false; // SETTING TO FALSE ALREADY HERE TO PREVENT RECURSION LOOP IN RemoveChild

        var removed = false;

        if (parent !== undefined)
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
        events.emit(BareEvent.game_objectRemoved, gameObject);

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
        if (!bare.levelEditorOpen)
            return false;

        const target = event.target as HTMLElement;
        var name = (target.id || target.className);

        var onEditor = (name != "canvas");

        return onEditor;
    }

    OnUpdate(deltaTime: number)
    {
        // FOR OVERRIDE    
    }

    // CAN BE OVERRIDEN TO INSERT SOME POST PROCESSING https://nightre.github.io/Rapid.js/docs/docs.html?doc=fbo
    /*RenderOuter()
    {
        rapid.clear(rapid.backgroundColor);//
        
        rapid.startRender();
        this.Render();
        rapid.endRender();
    }*/

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
        return pipes.run("cameraHandler_GetZoom");
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

    // THIS SHOULD NOT BE HERE, TODO
    async SaveEntityData(newRawData: SettingsData)
    {
        this.baseSettingsHandler.SetRaw(newRawData);
        await this.baseSettingsHandler.Process();
    
        // Persist to disk via dev-server endpoint when available (local only)
        if (!window.isLocalhost) {
          return { ok: true, saved: false, message: 'Save skipped (not localhost)' };
        }
    
        try {
            const res = await fetch('/api/save-entity-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                entityData: this.baseSettingsHandler.GetRaw(),
                skipReload: true
            })
          });
          const json = await res.json().catch(() => null);
        
          // TELL THE PLUGIN
          window.__GAME_DEBUG_API__.notifyEntityDataChanged(this.baseSettingsHandler.GetRaw())

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
    // ALSO HANDY TO OVERRIDE THOUGH
    async BeforeLoadLevel()
    {
        this.Clear();
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

    // full = true WILL REMOVE ALL OBJECTS, INCLUDING PERSISTENT
    RemoveAll(full:boolean = false)
    {
        var removeAllFrom = (objectControllerArg: ObjectController, isUI: boolean = false) => {
            var layers = objectControllerArg.GetLayers();
            for (var i = 0; i < layers.length; i++)
            {
                var layer = layers[i];
                for (var j = layer.length - 1; j >= 0; j--)
                {
                    var obj = layer[j];
                    
                    if (!full && obj.persistent)
                        continue;

                    var actualLayer = (isUI ? (UI_LAYER + i) : i);
                    bare.RemoveGameObject(obj, actualLayer);
                }
            }
        }

        removeAllFrom(objectController);

        if (full)
            removeAllFrom(uiController, true);
        
        if (full)
        {
            objectController.Clear();
            uiController.Clear();
        }

        // WAY I DID IT BEFORE. WAY FASTER, DIRECT, BUT DOESN'T TAKE INTO ACCOUNT POOLS AND PERSISTENT PROPERTY
        //objectController.Clear();
        //uiController.Clear();
    }

    async Restart(full:boolean = false)
    {
        this.Clear(full);
        await this.Start();
    }

    Clear(full:boolean = false)
    {
        events.emit(BareEvent.game_clear, { full: full });

        this.ClearScene(full);
        this.OnClear(full);
    }

    OnClear(full:boolean = false)
    {
        // FOR OVERRIDE
    }

    ClearScene(full:boolean = false)
    {
        // NOT SENDING CLEAR EVENT HERE... WANT THAT?

        this.ApplyLayerInfoToSettings(this.currentSettings, true); // ?

        this.RemoveAll(full);

        events.clear(); // LEAVES PERSISTENT EVENTS
    }
}
