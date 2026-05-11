import { controllerNames, SetControllerReferencesOnScene } from "../globals";
import { ObjectController } from "../controllers/objectController";
import { PhysicsControllerBare } from "../controllers/physicsControllerBare";
import { PhysicsControllerSopiro } from "../controllers/physicsControllerSopiro";
import { sceneController } from "../controllers/sceneController";
import { globalEvents } from "../globals";
import { SettingsHandler } from "../handlers/settingsHandler";
import mitt from "../libraries/mitt";
import { Color, RenderTexture, Texture, TextureManager, Vec2 } from "../libraries/new-rapid-render";
import { GameObject } from "../objects/gameObject";
import { PhysicsObjectBare } from "../objects/physicsObjectBare";
import { defaultSettingsData } from "../types/bareData";
import { AwakePayload, BareEvent, ConstructEntityOptions, Entity, entityVars, Events, GameObjectClass, LayerInfo, LevelData, SaveData, SceneClass, SceneI, SceneOptions, SettingsData } from "../types/bareTypes";
import { Helper } from "../utils/helper";
import { MakePath, MakePathForEntity } from "../globals";
import type { ComponentController } from "../controllers/componentController";
import type { HitboxController } from "../controllers/hitboxController";
import type { MouseController } from "../controllers/mouseController";
import type { ParticleController } from "../controllers/particleController";
import type { TweenController } from "../controllers/tweenController";
import type { CameraHandler } from "../handlers/cameraHandler";
import type { LevelHandler } from "../handlers/levelHandler";

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

    public started: boolean = false;
    public enabled: boolean = true;
    public paused: boolean = false;
    public persistent: boolean = false;
    public UI: boolean = false;
    public resize: boolean = false;
    public ignored: boolean = false;

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
    get texture(): TextureManager { return rapid.texture; }


    get drawCircle(): typeof rapid.drawCircle {
        return rapid.drawCircle.bind(rapid);
    }
    get drawLine(): typeof rapid.drawLine {
        return rapid.drawLine.bind(rapid);
    }
    get drawGraphic(): typeof rapid.drawGraphic {
        return rapid.drawGraphic.bind(rapid);
    }
    get drawRect(): typeof rapid.drawRect {
        return rapid.drawRect.bind(rapid);
    }
    get drawSprite(): typeof rapid.drawSprite {
        return rapid.drawSprite.bind(rapid);
    }

    // get drawMask(): (type: MaskType, cb: () => void) => void { return rapid.drawMask.bind(rapid); }
    // get clearMask(): () => void { return rapid.clearMask.bind(rapid); }
    public events = mitt<Events>(); // private todo
    //private pipes = matt<Pipes>();
    
    constructor(sceneOptions: SceneOptions | SettingsData = {settingsData: defaultSettingsData})
    {
        let options: SceneOptions;
        const isSceneOptions =
            sceneOptions &&
            typeof sceneOptions === "object" &&
            ("settingsData" in sceneOptions || "UI" in sceneOptions || "persistent" in sceneOptions);

        if (isSceneOptions)
        {
            // IS A SCENEOPTIONS
            options = sceneOptions as SceneOptions;
        }
        else
        {
            // IS A SETTINGSDATA DIRECTLY
            options = { settingsData: sceneOptions as SettingsData };
        }

        if (!options.settingsData)
            options.settingsData = defaultSettingsData;
        
        this.sceneOptions = options;

        this.UI = options.UI ?? false;
        this.resize = options.resize ?? false;
        this.persistent = options.persistent ?? false;
        this.ignored = options.ignored ?? false;

        this.AddClass(GameObject);
        this.AddClass(ObjectController);
        this.AddClass(PhysicsObjectBare); // ADDING THIS SINCE AN ENTITY COULD HAVE A HITBOX AND BECOME A PHYSICS OBJECT, NOT ALWAYS NEEDED - TODO

        SetControllerReferencesOnScene(this);
    }

    async Awake(payload?: any): Promise<void>
    {
        this.enabled = true;
        this.paused = false;
        this.started = false;

        await this.settingsHandler.Process(payload?.settingsHandler?.GetRaw() || this.sceneOptions.settingsData);//this.settingsData

        this.ApplyLayerInfoToSettings(this.settingsData);
        //this.layerNames = this.settingsData.layers.slice();

        var classes = controllerNames;
        for (let i = 0; i < classes.length; i++)
        {
            this[classes[i]].Awake?.();
        }

        await this.OnAwake(payload);

        this.settingsHandler.ProcessAnimations(); // NEEDED SINCE AN ATLAS WITH ANIMATIONS CAN BE LOADED IN AT AWAKE() ABOVE

        globalEvents.emit(BareEvent.scene_awake, { scene: this });

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

        var classes = controllerNames;
        for (let i = 0; i < classes.length; i++)
        {
            this[classes[i]].Start?.();
        }

        //bareEngine.gameMode = GameMode.Game;

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
            
            if (layerInfo.doSave === undefined)
                layerInfo.doSave = true;

            if (layerInfo.showInEditor === undefined)
                layerInfo.showInEditor = true;

            this.layerInfos[j] = layerInfo;

            // only persist data that belongs in settingsdata
            const { showInEditor } = layerInfo;
            data.layersInfo[layerName] = { ...storedInfo, ...(showInEditor === undefined ? {} : { showInEditor }), ...(layerInfo.doSave === undefined ? {} : { doSave: layerInfo.doSave }) };
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
    
    ConstructEntity(nameOrEntity: string | Entity, settingsData: SettingsData = this.settingsData, options: ConstructEntityOptions = { propsToIgnoreInEntity: [] }): Entity
    {
        if (options.fillPresets === undefined)
            options.fillPresets = true;
        if (options.propsToIgnoreInEntity === undefined)
            options.propsToIgnoreInEntity = [];

        function cloneEntityData<T>(data: T): T
        {
            return JSON.parse(JSON.stringify(data));
        }

        function mergeComponents(comp1: any, comp2: any):Record<string, Record<string, any>>
        {
            const merged = { ...comp1 };
            //
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

        var entity:Entity;
        
        // PROCESS THE ARGUMENT TO GET THE ENTITY TO WORK ON
        {
            if (typeof nameOrEntity === "object")
            {
                // CONSTRUCT - GENERALIZE THIS? SHOULD BE SAME FOR BASE
                {
                    // ARG IS ENTITY
                    var entityArg = cloneEntityData(nameOrEntity);

                    // CONSTRUCT ALL CHILDREN
                    if (entityArg.children)
                    {
                        for (var i = 0; i < entityArg.children.length; i++)
                        {
                            var child = entityArg.children[i];
                            entityArg.children[i] = this.ConstructEntity(child, settingsData, options);
                        }
                    }

                    // ANYTHING WITH A HITBOX IS A PHYSICS OBJECT
                    //if ((entityArg.hitbox || entityArg.physicsRadius) && entityArg.baseClass == "GameObject") 
                    //    entityArg.baseClass = "PhysicsObjectBare";
                    
                    // BIT OF A HACK TO MAKE SURE SOPIRO RIGIDBODIES HAVE A CENTER PIVOT
                    // PUT HERE TO LET THE EDITOR PREVIEW ALSO INHERIT IT
                    var sopiroPhysicsClasses = ["Circle", "Box", "Polygon"];
                    if (sopiroPhysicsClasses.includes(entityArg.baseClass))
                        entityArg.pivot = { x: .5, y: .5 };
                }

                // entityArg HAS BEEN CONSTRUCTED, NOW MERGE IT WITH (ALREADY CONSTRUCTED) ENTITY FROM DATA
                var possibleEntity = settingsData.entities[entityArg.name] as Entity;
                if (possibleEntity)
                {
                    // ENTITY WAS FOUND IN ENTITIES ARRAY IN DATA, DELETE SPECIFIED IGNORED PROPS FROM IT
                    // USING IT ATM TO FIND THE PROPS SET ON THE BASE
                    for (var prop of options.propsToIgnoreInEntity)
                    {
                        delete entityArg[prop as keyof Entity];
                    }
                    
                    // MERGE WITH ENTITY IN DATA
                    entity = {
                        ...possibleEntity, // OVERRIDE
                        ...entityArg, // START
                        components: mergeComponents(possibleEntity.components, entityArg.components),
                    };

                    // REMOVE COMPONENTS SPECIFICALLY LISTED IN ENTITY
                    if (entity.components && entity.componentsRemoved)
                    {
                        for (const componentName of entity.componentsRemoved)
                        {
                            delete entity.components[componentName];
                        }
                    }
                }
                else
                {
                    if (entityArg.name != "ANY") // ANY IS ONLY ENTITY THAT DOES NOT NEED A BASE ENTITY
                    {
                        // NO ENTITY IN DATA - MERGE WITH baseEntity BASE
                        if (!entityArg.baseEntity)
                            if (!entityArg.name)
                                entityArg.baseEntity = "ANY"; // NO NAME, PROBABLY A BASE ENTITY?
                            else
                                if (settingsData.baseEntities[entityArg.name])
                                    entityArg.baseEntity = "ANY";
                                else
                                    entityArg.baseEntity = "ANY_ENTITY";

                        var entityBase = settingsData.baseEntities[entityArg.baseEntity];

                        entity = {
                            ...entityBase, // OVERRIDE
                            ...entityArg, // START
                            components: mergeComponents(entityBase.components, entityArg.components),
                        };

                        entity = cloneEntityData(entity);

                        // REMOVE COMPONENTS SPECIFICALLY LISTED IN ENTITY
                        if (entity.components && entity.componentsRemoved)
                        {
                            for (const componentName of entity.componentsRemoved)
                            {
                                delete entity.components[componentName];
                            }
                        }
                    }
                    else
                    {
                        entity = cloneEntityData(entityArg);
                    }
                }
            }
            else
            {
                // ARG IS NAME
                var possibleEntity = settingsData.entities[nameOrEntity] as Entity;
                if (possibleEntity)
                {
                    // ENTITY NAME IS DEFINED IN ENTITIES
                    entity = cloneEntityData(possibleEntity);
                }
                else
                {
                    // ENTITY NAME NOT FOUND, SO TAKE THE 'ANY_ENTITY' ENTRY AND ASSIGN A NEW NAME
                    var entityBase = cloneEntityData(settingsData.baseEntities!["ANY_ENTITY"] as Entity);
                    entity = entityBase;
                    entity.name = nameOrEntity;
                }
            }
        }

        // FILL PRESETS - LIKE hitbox: "FULL"                     
        //                     hitbox: {x1: 0, y1: 0, x2: 1, y2: 1}
        if (options.fillPresets)
            this.settingsHandler.FillPresets(entity, settingsData); // ALREADY DONE IN SETTINGS CONSTRUCT - BUT COULD HAVE NEW PROPS IN ENTITY

        if (!entity.baseClass)
            entity.baseClass = "GameObject";

        // NO USE FOR THIS ANYMORE, BUT GONNA REPURPOSE IT TO SHOW baseEntity PATH
        //delete entityConstructed.baseEntity;

        return entity;
    }

    ApplyEntityToGameObject(entity: Entity, obj: GameObject, addComponents: boolean = true)
    {
        this.ApplyEntityVarsToGameObject(entity, obj);
        obj.OnApplyEntityToGameObject(entity, addComponents);

        obj.entity = entity;

        //if (addComponents)
        //    this.componentController?.ProcessCompentsFromEntity(entity, obj);
    }

    private specialMap: Record<string, (obj: GameObject, value: any) => void> =
    {
        pivot: (o, v) => o.SetPivot(v.x, v.y), // SETPIVOT DOES SOME EXTRA WORK FOR PERCENTAGES, SO CUSTOM MAPPING
        texture: (o, v) => v != "NONE" && o.InitTexture(v), // PROCESS CUSTOM TEXTURE NAME
        color: (o, v) => o.SetColor(v), // PROCESS THE HEX COLOR STRING
        children: (o, v) => {
            for (const childEntity of v)
            {
                this.AddGameObject(childEntity, o);
            }
        },
        components: (o, v) => {
            for (const component in v)
            {
                const className = Helper.CapitalizeFirstLetter(component) + "Component";
                var ComponentClass = bareEngine.componentClasses[className];
                if (!ComponentClass)
                {
                    console.error('Component class not found: ' + className + '. Add it with bare.AddClass(' + Helper.CapitalizeFirstLetter(component) + 'Component);');
                }
                var componentValues = v[component];
                var componentInstance = new ComponentClass(o.scene);
                for (const key in componentValues)
                {
                    componentInstance[key] = componentValues[key];
                }
                componentInstance.__paramNames = Object.keys(componentValues);
                o.AddComponent(componentInstance);
            }
        }
    };

    ApplyEntityVarsToGameObject(entity: Entity, obj: GameObject)
    {
        obj.OnApplyEntityVarsToGameObject(entity, obj);
        
        if (!obj.texture)//
            obj.InitTexture(MakePathForEntity(entity));

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
            let val = entity.static;
            delete entity.static;
            entity.static = val;
        }

        // PUT COMPONENTS LAST - SO PROPS LIKE POSITION/SCALE/ROTATION ARE SET AT ADDED() OF COMPONENT
        if (entity.components)
        {
            let val = entity.components;
            delete entity.components;
            entity.components = val;
        }

        // PUT CHILDREN LAST
        if (entity.children)
        {
            let val = entity.children;
            delete entity.children;
            entity.children = val;
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
            const isXY = value && typeof value === "object" && ("x" in value || "y" in value);

            if (isXY)
            {
                if ("x" in value)
                    obj[key].x = value.x;

                if ("y" in value)
                    obj[key].y = value.y;

                continue;
            }

            // generic direct assignment
            obj[key] = value;
        }
    }

    // USE ONE BELOW - TODO
    GetDummpyDataFromEntity(nameOrEntity: string | Entity, settingsData: SettingsData = this.settingsHandler.Get(), options: ConstructEntityOptions = { propsToIgnoreInEntity: [], fillPresets: true }): {entity: Entity, gameObject: GameObject}
    {
        var entityConstructed = this.ConstructEntity(nameOrEntity, settingsData, options);
        bareEngine.dummyGameObject.ResetValues();
        bareEngine.dummyGameObject.InitTexture(MakePath(entityConstructed.imagePath!, entityConstructed.name)); // COULD BE NEEDED TO SET PIVOT RIGHT IF IT'S A PERCENTAGE
        this.ApplyEntityToGameObject(entityConstructed, bareEngine.dummyGameObject);

        return {entity: entityConstructed, gameObject: bareEngine.dummyGameObject};
    }

    // STILL RETURNS SOME ENTITY VALUES AS undefined, EG imagePath, SHOULD BE "". TODO
    GetEntityWithDefaultValues(nameOrEntity: string | Entity, settingsData: SettingsData = this.settingsData, options: ConstructEntityOptions = { propsToIgnoreInEntity: [], fillPresets: true }): Entity
    {
        var entityConstructed:Entity;
        
        //if (options.skipConstruct)
        {
            //entityConstructed = (typeof nameOrEntity === "string") ? this.settingsHandler.GetRaw().entities[nameOrEntity] : nameOrEntity;
        }
        //else
        {
            entityConstructed = this.ConstructEntity(nameOrEntity, settingsData, options);
        }

        {
            var gameObject: GameObject;

            if (entityConstructed.baseClass == "GameObject")
            {
                gameObject = bareEngine.dummyGameObject;
            }
            else
            {
                const pool = bareEngine.gameObjectPools.get(entityConstructed.baseClass);
                if (pool)
                    gameObject = pool.Grab();
                else
                    console.error("noo");
            }

            gameObject.scene = this;
            gameObject.ResetValues();
        }

        // 
        var customSerialize:Record<string, (currentValue) => any> = {};
    
        customSerialize["texture"] = (currentValue:Texture) => { return currentValue.texturePath; };

        customSerialize["color"] = (currentValue:Color) => { return currentValue.toHex(); };

        customSerialize["children"] = (currentValue:Entity[]):Entity[] => { 
            var children:Entity[] = [];
            for (var child of currentValue)
            {
                children.push(this.GetEntityWithDefaultValues(child));
            }
            return children;
        };

        /*customSerialize["components"] = (currentValue:Record<string, any>[]):Record<string, any> => {
            var comps = {}
            for (var comp of currentValue)
            {
                var compData = this.SerializeComponent(comp);
                var name = Helper.DecapitalizeFirstLetter(comp.constructor.name.replace('Component', ''));
                comps[name] = compData;
            }
            return comps;
        };*/

        // TAKE OUT VARS WE ALREADY HAVE
        var entityVarsCopy = entityVars.slice();
        for (var propName in entityConstructed)
        {
            if (entityVarsCopy.includes(propName))
                entityVarsCopy.splice(entityVarsCopy.indexOf(propName), 1);
        }

        for (var varName of entityVarsCopy)
        {
            const key = (varName as keyof GameObject);
            const currentValue = gameObject[key];
            
            var value = currentValue;

            if (value instanceof Vec2)
                value = { x: value.x, y: value.y };
            else
            if (customSerialize[varName] && currentValue)
                value = customSerialize[varName](currentValue);

            entityConstructed[varName] = value;
        }

        if (!entityConstructed.hitbox)
            entityConstructed.hitbox = { x1: 0, y1: 0, x2: 0, y2: 0 };

        return entityConstructed;
    }

    GetAppliedEntityWithDefaultValues(nameOrEntity: string | Entity, settingsData: SettingsData = this.settingsData, options: ConstructEntityOptions = { propsToIgnoreInEntity: [], fillPresets: true }): Entity
    {
        var entityConstructed = this.ConstructEntity(nameOrEntity, settingsData, options);

        var gameObject: GameObject;

        if (entityConstructed.baseClass == "GameObject")
        {
            gameObject = bareEngine.dummyGameObject;
        }
        else
        {
            const pool = bareEngine.gameObjectPools.get(entityConstructed.baseClass);
            if (pool)
                gameObject = pool.Grab();
            else
                console.error("noo");
        }

        gameObject.scene = this;
        gameObject.ResetValues();

        gameObject.InitTexture(MakePathForEntity(entityConstructed)); // COULD BE NEEDED TO SET PIVOT RIGHT IF IT'S A PERCENTAGE
    
        // DON'T WANT COMPONENTS TO BE CREATED AT ApplyEntityToGameObject(). 
        //delete entityConstructed.components;

        // STILL ADDING FALSE TO PREVENT COMPONENTS CREATION IN OVERRIDEN ApplyEntityToGameObject
        this.ApplyEntityToGameObject(entityConstructed, gameObject, false);

        var entity = this.levelHandler.SerializeObjectFully(gameObject);

        return entity;
    }

    // INPUT CAN BE: ENTITY / ENTITY NAME / GAMEOBJECT / CLASS TO INSTANTIATE / TEXTURE
    AddGameObject(input?: Entity | string | GameObject | GameObjectClass | Texture, parent: int | string | GameObject = "objects"): GameObject
    {
        if (!this.settingsHandler)
        {
            throw new Error("Cannot add a GameObject yet, the scene has not awoken yet.\nCall AddGameObject() in OnAwake() or OnStart().");
        }

        // CREATE
        {
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
                gameObject.name = input.texturePath || "PooledGameObjectFromTexture";
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

                    entity = {imagePath: imagePath, name:name, baseClass: "GameObject"};
                }
                else
                {
                    // ENTITY OR ENTITY NAME - CONSTRUCT IT - TO GET ALL DATA TO APPLY TO GAMEOBJECT BELOW
                    entity = this.ConstructEntity(input);
                }

                gameObject = bareEngine.GetObjectFromPool(entity.baseClass!, this);
                gameObject.Init(MakePathForEntity(entity));
                //if (entity.texture != "NONE")
                //    delete entity.texture; // TEXTURE HAS BEEN HANDLED ABOVE WITH Init()
                this.ApplyEntityToGameObject(entity, gameObject);
            }

            gameObject.scene = this;
        }

        // ADD
        {
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
        }

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
        this.componentController?.Update(deltaTime);
        this.particleController?.Update(deltaTime);

        this.events.emit(BareEvent.scene_update, deltaTime);
        this.OnUpdate(deltaTime);
    }

    FixedUpdate(fixedDeltaTime: number): void
    {
        this.physicsControllerBare?.FixedUpdate(fixedDeltaTime);
        this.physicsControllerSopiro?.FixedUpdate(fixedDeltaTime);

        this.OnFixedUpdate(fixedDeltaTime);
    }

    OnFixedUpdate(fixedDeltaTime: number)
    {
        // FOR OVERRIDE
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
        rapid.matrixStack.save();

        if (!this.UI)
            this.cameraHandler?.SetTransform();

        this.OnPreRender();

        this.componentController?.PreRender();
        this.objectController.PreRender();

        this.componentController?.Render();
        this.objectController.Render();
        this.physicsControllerBare?.Render();
        this.physicsControllerSopiro?.Render();
        this.particleController?.Render();
        this.hitboxController?.Render();

        this.OnRender();

        this.componentController?.PostRender();
        this.objectController.PostRender();

        this.OnPostRender();

        rapid.matrixStack.restore();
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
    RenderTextureTo(source: Texture, target: RenderTexture, clear: boolean = false): boolean
    {
        rapid.drawToRenderTexture(target, () => {
            rapid.drawSprite({ texture: source });
        }, clear ? (target.clearColor ?? new Color(0, 0, 0, 0)) : null);
        return true;
    }

    /**
     * Render a game object into a target rendertexture
     */
    RenderGameObjectTo(obj: GameObject, target: RenderTexture, clear: boolean = false): boolean
    {
        rapid.drawToRenderTexture(target, () => {
            obj.Render();
        }, clear ? (target.clearColor ?? new Color(0, 0, 0, 0)) : null);
        return true;
    }

    /**
     * Render a texture or game object into a target rendertexture
     */
    RenderTo(source: Texture | GameObject, target: RenderTexture, clear: boolean = false): boolean
    {
        rapid.drawToRenderTexture(target, () => {
            if (source instanceof GameObject)
                source.Render();
            else
                rapid.drawSprite({ texture: source });
        }, clear ? (target.clearColor ?? new Color(0, 0, 0, 0)) : null);
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
            return new Vec2(x, y)
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

    async LoadFont(name: string, url?: string)
    {
        // SET FIRST LOADED FONT AS DEFAULT
        bareEngine.defaultFont ||= name;

        if (!url)
            url = `${name}.ttf`; // DEFAULTING TO TTF FONT WHEN NO URL SPECIFIED

        const font = new FontFace(name, `url(${bareEngine.fontPath}/${url})`);
        await font.load();
        (document.fonts as any).add(font); // NEEDS 'as any' FOR LINUX
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
            return;
        }

        // GAMEOBJECT
        if (_class.prototype instanceof GameObject || _class === GameObject)
        {
            bareEngine.RegisterGameObjectPool(_class, 1);

            Scene.registeredClasses[className] = _class;
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
        if (this.resize)
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
        this.events.clear();
        this.Clear();
        await this.Start();
    }

    Clear(includingPersistent: boolean = true)
    {
        // THIS CANCELS ALL AWAITS, PREVENTING SOME NASTY PROBLEMS
        // THOUGHT IT MEANS YOU CANNOT RESOLVE AN AWAIT wait() AFTER A RESTART
        // BUT THAT'S PROBABLY FINE
        window.cancelWaits();

        var classes = controllerNames;
        for (let i = 0; i < classes.length; i++)
        {
            this[classes[i]].Clear?.(includingPersistent);
        }

        this.OnClear(includingPersistent);
    }

    OnClear(includingPersistent: boolean = true)
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

    async Sleep(seconds: number): Promise<void>
    {
        this.paused = true;
        await wait(seconds);
        this.paused = false;
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

