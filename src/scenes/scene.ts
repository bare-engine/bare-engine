import { globalEvents, GameMode, MakePath } from "../main";
import { Color, FrameBufferObject, ICircleRenderOptions, IGraphicRenderOptions, IRectRenderOptions, IRenderLineOptions, ISpriteRenderOptions, MaskType, RenderTexture, Texture, TextureCache, Vec2 } from "../libraries/rapid-render";
import { PoolHandler } from "../handlers/poolHandler";
import { AwakePayload, BareEvent, SceneClass, Entity, GameObjectClass, LayerInfo, LevelData, SaveData, SceneOptions, SettingsData, SceneI, Events } from "../types/bareTypes";
import { GameObject } from "../objects/gameObject";
import { SettingsHandler as SettingsHandler } from "../handlers/settingsHandler";
import { defaultEntityData as defaultEntityData } from "../types/bareData";
import { PhysicsControllerBare, PhysicsObjectBare } from "../exports/barePhysics";
import { ObjectController } from "../controllers/objectController";
import { sceneController } from "../controllers/sceneController";
import { BareEngine } from "../bareEngine";
import mitt from "../libraries/mitt";
import { CameraHandler, ComponentController, HitboxController, LevelHandler, MouseController, ParticleController, TweenController } from "../exports";
import { PhysicsControllerSopiro } from "../exports/sopiroPhysics";

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

export class Scene implements SceneI
{
    //private pipes = matt<Pipes>();
    //private pipes = matt<Pipes>();
    static registeredClasses: Record<string, any> = {};
     
    static rootPath: string = "assets";
    static imagePath: string = "images";
    static dataPath: string = "data";
    static levelPath: string = "data/levels";
    static soundPath: string = "sounds";

    public started: boolean = false;
    public enabled: boolean = true;
    public paused: boolean = false;
    public persistent: boolean = false;
    public UI: boolean = false;

    public isLevel: boolean = false;

    public objectController: ObjectController;

    public mouseController: MouseController;
    public hitboxController: HitboxController;
    public tweenController: TweenController; 
    public componentController: ComponentController; 
    public physicsControllerBare: PhysicsControllerBare; 
    public physicsControllerSopiro: PhysicsControllerSopiro; 
    public particleController: ParticleController; 
    public levelHandler: LevelHandler; 
    public cameraHandler: CameraHandler; 

    public settingsHandler: SettingsHandler = new SettingsHandler(this); // COULD ALSO MAKE THIS WORK LIKE CONTROLLERS ABOVE
    get settingsData(): SettingsData { return this.settingsHandler.Get(); }
    
    isPaused: boolean = false;//
    doRender: boolean = true;

    layerInfos: Record<int, LayerInfo> = {};
    layerNames: string[];

    sceneOptions: SceneOptions;

    get currentLevelStr(): string { return SaveData.currentLevelStr; }

    get width(): int { return rapid.width; }
    get height(): int { return rapid.height; }
    get textures(): TextureCache { return rapid.textures; }

    get renderGraphic(): (options: IGraphicRenderOptions) => void { return rapid.renderGraphic.bind(rapid); }
    get renderCircle(): (options: ICircleRenderOptions) => void { return rapid.renderCircle.bind(rapid); }
    get renderLine(): (options: IRenderLineOptions) => void { return rapid.renderLine.bind(rapid); }
    get renderRect(): (options: IRectRenderOptions) => void { return rapid.renderRect.bind(rapid); }
    get renderSprite(): (options: ISpriteRenderOptions) => void { return rapid.renderSprite.bind(rapid); }
    get drawMask(): (type: MaskType, cb: () => void) => void { return rapid.drawMask.bind(rapid); }
    get clearMask(): () => void { return rapid.clearMask.bind(rapid); }
    public events = mitt<Events>(); // private todo
    //private pipes = matt<Pipes>();
    
    constructor(sceneOptions: SceneOptions | SettingsData = {entityData: defaultEntityData})
    {
        let options: SceneOptions;
        const isSceneOptions =
            sceneOptions &&
            typeof sceneOptions === "object" &&
            ("entityData" in sceneOptions || "UI" in sceneOptions || "persistent" in sceneOptions);

        if (isSceneOptions)
        {
            // IS A SCENEOPTIONS
            options = sceneOptions as SceneOptions;
        }
        else
        {
            // IS A SETTINGSDATA DIRECTLY
            options = { entityData: sceneOptions as SettingsData };
        }

        if (!options.entityData)
            options.entityData = defaultEntityData;
        
        this.sceneOptions = options;

        this.UI = options.UI ?? false;
        this.persistent = options.persistent ?? false;

        this.AddClass(ObjectController);
        this.AddClass(PhysicsObjectBare); // ADDING THIS SINCE AN ENTITY COULD HAVE A HITBOX AND BECOME A PHYSICS OBJECT

        BareEngine.SetControllerReferencesOnScene(this);
    }

    async Awake(payload?: any): Promise<void>
    {
        this.enabled = true;
        this.paused = false;
        this.started = false;

        await this.settingsHandler.Process(this.sceneOptions.entityData);//this.settingsData

        this.ApplyLayerInfoToSettings(this.settingsData);
        //this.layerNames = this.settingsData.layers.slice();

        globalEvents.emit(BareEvent.scene_awake);

        var classes = BareEngine.controllerNames;
        for (let i = 0; i < classes.length; i++)
        {
            this[classes[i]].Awake?.();
        }

        await this.OnAwake(payload);

        this.settingsHandler.ReprocessAnimations(); // NEEDED SINCE AN ATLAS WITH ANIMATIONS CAN BE LOADED IN AT AWAKE() ABOVE

        await this.Start(payload);

        this.HideLoadingText();
    }

    OnAwake(payload?: any): void | Promise<void>
    {
        // FOR OVERRIDE
    }

    // START IS CALLED ON INITIALIZATION AND RESTART
    async Start(payload?: any): Promise<void>
    {
        this.started = false;

        var classes = BareEngine.controllerNames;
        for (let i = 0; i < classes.length; i++)
        {
            this[classes[i]].Start?.();
        }

        //window.gameMode = GameMode.Game;

        //rapid.backgroundColor = Color.White;

        await this.OnStart(payload);

        this.started = true;
    }

    OnStart(payload?: any): void | Promise<void>
    {
        // FOR OVERRIDE

        // OPTIONAL TO OVERRIDE AS ASYNC - TO LOAD SOME MORE ASSETS BEFORE THE LOADING SCREEN DISAPPEARS
    }

    // SEPARATE THIS OUT? TODO, PUT IN SETTINGS HANDLER PROCESS?
    private ApplyLayerInfoToSettings(data: SettingsData)
    {
        // SET UP NEW LAYER INFOS
        this.layerInfos = {};
        data.layersInfo ??= {};
        
        for (var j = 0; j < data.layers.length; j++)
        {
            const layerName = data.layers[j].toLowerCase();
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
        /*if (data.uiLayers)
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
        }*/
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
    
    ConstructEntity(nameOrEntity: string | Entity, settingsData: SettingsData = this.settingsData, options: { propsToIgnoreInEntity?: string[] } = { propsToIgnoreInEntity: [] }): Entity
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

        // HANDLE NONE CASE, WILL NOT LOOK FOR (ANY) EXTENDED DATA, JUST RETURN WITH GAMEOBJECT extendClass 
        if (entity.extendData == "NONE")
        {
            if (!entity.extendClass)
                entity.extendClass = "GameObject";

            return final(entity);
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
        obj.OnApplyEntityToGameObject(entity, addComponents);

        if (addComponents)
            this.componentController?.ProcessCompentsFromEntity(entity, obj);
    }

    FillPresets(entity: Entity, settingsData: SettingsData = this.settingsData)
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
        texture: (o, v) => o.InitTexture(v), // SETPIVOT DOES SOME EXTRA WORK FOR PERCENTAGES, SO CUSTOM MAPPING
    };

    ApplyEntityVarsToGameObject(entity: Entity, obj: GameObject)
    {
        obj.OnApplyEntityVarsToGameObject(entity, obj);

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

    GetDummpyDataFromEntity(nameOrEntity: string | Entity, settingsData: SettingsData = this.settingsHandler.Get(), options: { propsToIgnoreInEntity?: string[] } = { propsToIgnoreInEntity: [] }): {entity: Entity, gameObject: GameObject}
    {
        var entityConstructed = this.ConstructEntity(nameOrEntity, settingsData, options);
        bareEngine.dummyGameObject.ResetValues();
        bareEngine.dummyGameObject.InitTexture(MakePath(entityConstructed.imagePath!, entityConstructed.name)); // COULD BE NEEDED TO SET PIVOT RIGHT IF IT'S A PERCENTAGE
        this.ApplyEntityToGameObject(entityConstructed, bareEngine.dummyGameObject);

        return {entity: entityConstructed, gameObject: bareEngine.dummyGameObject};
    }

    // INPUT COULD BE: ENTITY, ENTITY NAME, GAMEOBJECT, CLASS TO INSTANTIATE OR TEXTURE
    AddGameObject(input?: Entity | string | GameObject | GameObjectClass | Texture, parent: int | string | GameObject = "objects"): GameObject
    {
        if (!this.settingsHandler)
        {
            throw new Error("Cannot add a GameObject yet, the scene has not awoken yet.\nCall AddGameObject() in OnAwake() or OnStart().");
        }

        // CREATE
        var gameObject: GameObject;
        if (!input)
        {
            // DEFAULT GAMEOBJECT
            gameObject = bareEngine.GetObjectFromPool("GameObject", this);
            gameObject.pooled = true;
            gameObject.name = "pooledGameObject";
        }
        else
        if (typeof input === "function")
        {
            // GameObjectClass CASE, INSTANTIATE FROM POOL IF IT EXISTS
            const pool = bareEngine.gameObjectPools.get(input.name);
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
            gameObject = bareEngine.GetObjectFromPool("GameObject", this);
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

            gameObject = bareEngine.GetObjectFromPool(entity.extendClass!, this);
            gameObject.Init(MakePath(entity.imagePath!, entity.name));
            this.ApplyEntityToGameObject(entity, gameObject);
        }

        gameObject.scene = this;

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

            // IF LAYER IS A STRING (EG objects), CHECK IF IT EXISTS, ELSE DEFAULT TO 0
            if (typeof layer === "string" && (!this.layerNames || !this.layerNames.includes(layer)))
                layer = 0; 

            this.objectController.Add(gameObject, layer);
        }

        gameObject.OnAwake();
        gameObject.Added();

        // NOTIFY
        globalEvents.emit(BareEvent.game_objectAdded, { gameObject: gameObject, layer: parent });
        this.events.emit(BareEvent.game_objectAdded, { gameObject: gameObject, layer: parent });

        return gameObject;
    }

    // STILL NEEDED?
    public AddGameObjectFromImagePath(path:string, parent: int | string | GameObject = "objects"): GameObject
    {
        if (!path.startsWith("/"))
            path = "/" + path; // NEEDS A SLASH IN FRONT FOR ADDGAMEOBJECT() TO RECOGNIZE IT'S A PATH

        var gameObject = this.AddGameObject(path, parent);

        return gameObject;
    }

    RemoveGameObject(gameObject: GameObject, parent?: int | GameObject, clear:boolean = true)
    {
        if (!gameObject.addedToLevel)
        {
            // GAMEOBJECT WAS ALREADY REMOVED - DOES THIS STOP A CHILD FROM GETTING THROUGH? TODO
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
                removed = this.objectController.Remove(gameObject, layer);
            }
        }
        else
        {
            removed = this.objectController.Remove(gameObject);
        }
        
        if (!removed)
            trace("FAILED TO REMOVE GAMEOBJECT");
        
        if (clear)
        {
            // NOTIFY
            // PUTTING THIS UNDER CLEAR, BIT UGLY, BUT NEEDED FOR NOW SO THAT IF A CHILD REMOVES ITSELF FROM PARENT,
            // THIS DOESN'T GET CALLED AND IN TURN REMOVE ITS COMPONENTS (ComponentController LISTENS) - TODO?
            globalEvents.emit(BareEvent.game_objectRemoved, gameObject);
            this.events.emit(BareEvent.game_objectRemoved, gameObject);

            gameObject.ResetValues();

            if (wasPooled)
            {
                const className = this.GetContructorName(gameObject);
                const pool = bareEngine.gameObjectPools.get(className);
                if (pool)
                    pool.Release(gameObject);
            }
        }
        else
        {
            gameObject.pooled = wasPooled;
        }

        gameObject.Removed();
    }

    Update(deltaTime: number): void
    {
        this.mouseController?.Update(deltaTime);
        this.hitboxController?.Update();
        this.OnPreUpdate(deltaTime); // NOT QUITE PRE-UPDATE HUH, BUT HERE JUST FOR EditorControlsHandler ATM, SO IT DRAGS OBJECTS AT POSITION AND AFTER THEY CAN BE SNAPPED TO OTHER POSITION
        this.objectController.Update(deltaTime);
        this.tweenController?.Update(bareEngine.time);
        this.physicsControllerBare?.Update(deltaTime);
        this.physicsControllerSopiro?.Update(deltaTime);
        this.componentController?.Update(deltaTime);
        this.particleController?.Update(deltaTime);

        events.emit(BareEvent.scene_update, deltaTime);
        this.OnUpdate(deltaTime);
    }

    OnPreUpdate(deltaTime: number)
    {
        // FOR OVERRIDE
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

    Render(): void
    {
        rapid.save();

        this.cameraHandler?.SetTransform();

        this.OnPreRender();

        this.componentController?.PreRender();
        this.objectController.PreRender();

        this.hitboxController?.Render();
        this.componentController?.Render();
        this.objectController.Render();
        this.physicsControllerBare?.Render();
        this.physicsControllerSopiro?.Render();
        this.particleController?.Render();

        this.OnRender();

        this.componentController?.PostRender();
        this.objectController.PostRender();

        this.OnPostRender();

        rapid.restore();
    }

    OnPreRender()
    {
        // FOR OVERRIDE
    }

    OnRender()
    {
        // FOR OVERRIDE   
    }

    OnPostRender()
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
        if (this.cameraHandler)
        {
            // THE CAMERA IS SET TO THIS SCENE EXCLUSIVELY
            return this.cameraHandler?.ScreenToWorld(x, y);
        }
        else
        {
            return new Vec2(x, y);
        }
    }

    WorldToScreen(x: number, y: number)
    {
        if (this.cameraHandler)
        {
            // THE CAMERA IS SET TO THIS SCENE EXCLUSIVELY
            return this.cameraHandler?.WorldToScreen(x, y);
        }
        else
        {
            return new Vec2(x, y);
        }
    }

    GetCameraZoom(): number 
    {
        if (this.cameraHandler)
        {
            // THE CAMERA IS SET TO THIS SCENE EXCLUSIVELY
            return this.cameraHandler?.GetZoom();
        }
        else
        {
            return 1;
        }
    }

    GetContructorName(gameObject: GameObject): string
    {
        var name = gameObject.constructor.name;

        if (name.startsWith("_")) // SOMETIMES GET NAMES LIKE _GameObject, REMOVING THAT _ HERE
            name = name.substring(1);

        return name;
    }

    async OnSaveEntityData(rawData: SettingsData)
    {
        // FOR OVERRIDE
    }

    async OnPostSaveEntityData(rawData: SettingsData)
    {
        // FOR OVERRIDE
    }

    // THIS SHOULD NOT BE HERE, TODO
    async SaveEntityData(newRawData: SettingsData)
    {
        await this.OnSaveEntityData(newRawData);

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
                entityData: newRawData,
                skipReload: true
            })
          });
          const json = await res.json().catch(() => null);
        
          // TELL THE PLUGIN
          window.__GAME_DEBUG_API__.notifyEntityDataChanged(newRawData)

          await this.OnPostSaveEntityData(newRawData);

          return { ok: res.ok, saved: res.ok, response: json };
        } catch (error: any) {
          console.error('Failed to save entity data', error);
          return { ok: false, error: error?.message ?? String(error) };
        }
    }

    // OVERRIDE THIS TO LOAD SOME MORE TEXTURES DURING LEVEL LOAD
    CreatePromiseLevelTextures(level: LevelData): Promise<Texture>[]
    {
        return [];
    }
    
    async OnBeforeLoadLevel()
    {
        // FOR OVERRIDE
    }

    AfterLoadedLevel(level:LevelData, uids:string[])
    {
        this.isLevel = true;

        this.componentController?.AfterLoadedLevel(uids);
        this.OnAfterLoadedLevel(level);
    }
    
    OnAfterLoadedLevel(level:LevelData)
    {
        // FOR OVERRIDE
    }

    GetAllComponentsFrom(obj:GameObject):any[]
    {
        return this.componentController?.GetComponentsFrom(obj);
    }

    // A CATCH-ALL METHOD TO REGISTER CLASSES
    // CAN BE CONTROLLER/GAMEOBJECT/COMPONENT/PHYSICS/ETC
    // DOESN'T ALWAYS DO SOMETHING, BUT JUST A HOAX TO LET THE DEV REFFERENCE THE CLASS
    AddClass(_class: any): void
    {
        const className = _class.name;

        if (Scene.registeredClasses[className])
        {
            //console.warn(`Module ${className} is already registered`);
            return;
        }

        // CONTROLLERS
        var classNameFirstLowercase = className.charAt(0).toLowerCase() + className.slice(1);
        if (globalThis[classNameFirstLowercase])
        {
            /*if (globalThis[classNameFirstLowercase].Init)
            {
                globalThis[classNameFirstLowercase].Init(); // USED FOR PhysicsControllerBase, TO RE-SET PIPES, NEED FOR DEMO
            }*/

            return;
        }

        // GAMEOBJECT
        if (_class.prototype instanceof GameObject)
        {
            bareEngine.RegisterGameObjectPool(_class, 1);

            Scene.registeredClasses[className] = "taken";
            return;
        }

        // COMPONENT
        if (className.endsWith('Component'))
        {
            this.RegisterComponent(_class);

            //Scene.modules[className] = "taken"; // COMMENTED OUT SINCE REGISTERED COMPONENTS ARE LOCAL TO BARE, HAS TO ADD

            return;
        }

        //let instance = new _class(...args);
        //Scene.registeredClasses[className] = instance;
    }

    RegisterComponent(componentClass: any)
    {
        var classNameNoLeadingUnderscore = componentClass.name.replace(/^_/, ''); // REMOVE LEADING _ THAT SOME COMPONENTS GET
        bareEngine.componentClasses[classNameNoLeadingUnderscore] = componentClass;
    }

    Resize(prevWidth: number, prevHeight: number, newWidth: number, newHeight: number)
    {
        if (this.UI)
        {
            // RESIZE UI
            var objs = this.objectController.GetAllObjects();
            for (var i = 0; i < objs.length; i++)
            {
                var obj = objs[i];
                obj.SetPosition(obj.x * newWidth / prevWidth, obj.y * newHeight / prevHeight);
            }
        }

        this.cameraHandler?.OnResize(prevWidth, prevHeight, newWidth, newHeight);
        this.OnResize(prevWidth, prevHeight, newWidth, newHeight);
    }

    OnResize(prevWidth: number, prevHeight: number, newWidth: number, newHeight: number)
    {
        // FOR OVERRIDE
    }

    Get(instanceName: string):any
    {
        return this[instanceName];
    }

    async Restart(full:boolean = false)
    {
        this.Clear();
        await this.Start();
    }

    Clear(full:boolean = false, isLevel:boolean = false) // -TODO
    {
        var classes = BareEngine.controllerNames;
        for (let i = 0; i < classes.length; i++)
        {
            this[classes[i]].Clear?.(!isLevel);
        }

        if (!isLevel)
        {
            if (full)
                this.events.clearAll();
            else
                this.events.clear();
        }
        
        //this.ApplyLayerInfoToSettings(this.currentSettings, true); // ?

        this.OnClear(full, isLevel);
    }

    OnClear(full:boolean = false, isLevel:boolean = false)
    {
        // FOR OVERRIDE
    }
    
    // SCENES
    async GotoScene<T extends Scene>(sceneClass: SceneClass<T>, payload?: AwakePayload<T>): Promise<T>
    {
        sceneController.Remove(this);
        return sceneController.Add(sceneClass, payload);
    }

    async AddScene<T extends Scene>(scene: Scene | SceneClass<T>, payload?: AwakePayload<T>): Promise<T>
    {
        return sceneController.Add(scene, payload);
    }

    // POINTERS
    OnPointerDown(gameObject: GameObject, callback: any)
    {
        /* @ AddClass(HitboxController) */
        this.hitboxController.OnPointerDown(gameObject, callback);
    }

    OnPointerUp(gameObject: GameObject, callback: any)
    {
        /* @ AddClass(HitboxController) */
        this.hitboxController.OnPointerUp(gameObject, callback);
    }

    OnPointerEnter(gameObject: GameObject, callback: any)
    {
        /* @ AddClass(HitboxController) */
        this.hitboxController.OnPointerEnter(gameObject, callback);
    }

    OnPointerLeave(gameObject: GameObject, callback: any)
    {
        /* @ AddClass(HitboxController) */
        this.hitboxController.OnPointerLeave(gameObject, callback);
    }

    // HELPER
    /*CheckExist(propertyName: string): boolean
    {
        const classKey = propertyName + "Class";
        const Ctor = (globalThis as any)[classKey];

        if (!Ctor)
        {
            const className = propertyName.charAt(0).toUpperCase() + propertyName.slice(1);
            throw new Error(`${className} not registered. Call bare.AddClass(${className}) at OnAwake() of your game.`);
        }

        return true;
    }*/

    CreateClassIfNotExist(propertyName: string, scene:Scene):void
    {
        if ((this as any)[propertyName])
            return;

        const classKey = propertyName + "Class";
        const Ctor = (globalThis as any)[classKey];

        if (Ctor)
        {
            (this as any)[propertyName] = new Ctor(scene);
        }
    }

    get currentLevel(): LevelData
    {
        /* @ AddClass(levelHandler) */
        return this.levelHandler?.currentLevel;
    }

    LoadLevel(levelInput: string | LevelData = ""): Promise<LevelData>
    {
        /* @ AddClass(levelHandler) */

        if (!window.isLocalhost)
        {
            // CHECK IF LEVEL IS IN EDITED CACHE, WILL BE SAVED HERE WHEN NOT ON LOCALHOST
            // SINCE CAN'T SAVE TO DISK

            var levelStr = SaveData.currentLevelStr;
            if (typeof levelInput === "string")
                levelStr = levelInput;

            var levelCached = SaveData.levelsEditedCache.get(levelStr);
            if (levelCached)
            {
                var levelPromise = this.levelHandler?.LoadLevel(levelCached);
                SaveData.currentLevelStr = levelStr; // SETTING IT HERE BECAUSE IT'S NOT SET IN LOADLEVEL() SINCE WE SUPPLY A LEVELDATA OBJECT (NOT LEVELNAME STRING)
                return levelPromise;
            }
        }

        return this.levelHandler?.LoadLevel(levelInput);
    }
}

