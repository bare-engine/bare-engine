import type { ArcadePhysicsController } from "../controllers/arcadePhysicsController";
import type { ComponentController } from "../controllers/componentController";
import type { HitboxController } from "../controllers/hitboxController";
import type { MouseController } from "../controllers/mouseController";
import { ObjectController } from "../controllers/objectController";
import type { ParticleController } from "../controllers/particleController";
import { sceneController } from "../controllers/sceneController";
import type { SopiroPhysicsController } from "../controllers/sopiroPhysicsController";
import type { TweenController } from "../controllers/tweenController";
import { controllerNames, GameMode, globalEvents, MakePath, MakePathForEntity } from "../globals";
import type { CameraHandler } from "../handlers/cameraHandler";
import type { LevelHandler } from "../handlers/levelHandler";
import { SettingsHandler } from "../handlers/settingsHandler";
import mitt from "../libraries/mitt";
import { Color, RenderTexture, Texture, Vec2 } from "../libraries/new-rapid-render";
import { GameObject } from "../objects/gameObject";
import { Bare } from "../types/bare";
import { defaultSettingsData } from "../types/bareData";
import { AwakePayload, BareEvent, ConstructEntityOptions, Entity, entityVars, Events, GameObjectClass, LevelData, SaveData, SceneClass, SceneI, SceneOptions, SettingsData } from "../types/bareTypes";
import { getInspectorFieldNames, InspectorClass, InspectorField, Label } from "../utils/decorators";
import { EntitySerializer } from "../utils/entitySerializer";

export class Scene implements SceneI
{
    public started: boolean = false;

    @InspectorField public enabled: boolean = true;
    @InspectorField public paused: boolean = false;
    @InspectorField public render: boolean = true;
    @InspectorField public persistent: boolean = false;
    @InspectorField public UI: boolean = false;
    @InspectorField public resize: boolean = false;

    public solo: boolean = false;
   
    @InspectorField
    get _solo(): boolean { return this.solo; }
    set _solo(solo: boolean) {
        if (solo)
        {
            sceneController.DisableAll();
            sceneController.GetAll().forEach(scene => scene.solo = false);
            this.enabled = true;
        }
        else
        {
            sceneController.EnableAll();
        }

        this.solo = solo;
    }
    
    public secret: boolean = false; // IF TRUE, WILL MAKE THE SCENE NOT INCLUDE IN bare.scene.GetAll() - USED FOR PLUGIN ATM
    public isLevel: boolean = false;

    // CONTROLLERS ARE LAZY: FIRST ACCESS INSTANTIATES THE CLASS FROM THE globalThis[<name>Class]
    // REGISTRY (FILLED BY RegisterController WHEN A CONTROLLER MODULE IS BUNDLED), SO A SCENE ONLY
    // GETS THE CONTROLLERS IT ACTUALLY TOUCHES - AND UNUSED CONTROLLER MODULES STAY TREE-SHAKEN.
    // ENGINE PLUMBING (Update/Render/LIFECYCLE LOOPS) READS THE _ BACKING FIELDS SO IT NEVER
    // TRIGGERS CREATION; USER-FACING ACCESS GOES THROUGH THE GETTERS AND CREATES ON DEMAND
    public _object: ObjectController;
    @InspectorClass
    get object(): ObjectController { return this._object ?? this.CreateController("object"); }
    set object(value: ObjectController) { this._object = value; }

    public _mouse: MouseController;
    @InspectorClass
    get mouse(): MouseController { return this._mouse ?? this.CreateController("mouse"); }
    set mouse(value: MouseController) { this._mouse = value; }

    public _hitbox: HitboxController;
    @InspectorClass
    get hitbox(): HitboxController { return this._hitbox ?? this.CreateController("hitbox"); }
    set hitbox(value: HitboxController) { this._hitbox = value; }

    public _tween: TweenController;
    @InspectorClass
    get tween(): TweenController { return this._tween ?? this.CreateController("tween"); }
    set tween(value: TweenController) { this._tween = value; }

    public _component: ComponentController;
    @InspectorClass
    get component(): ComponentController { return this._component ?? this.CreateController("component"); }
    set component(value: ComponentController) { this._component = value; }

    public _arcade: ArcadePhysicsController;
    @InspectorClass
    get arcade(): ArcadePhysicsController { return this._arcade ?? this.CreateController("arcade"); }
    set arcade(value: ArcadePhysicsController) { this._arcade = value; }

    public _sopiro: SopiroPhysicsController;
    @InspectorClass
    get sopiro(): SopiroPhysicsController { return this._sopiro ?? this.CreateController("sopiro"); }
    set sopiro(value: SopiroPhysicsController) { this._sopiro = value; }

    public _particle: ParticleController;
    @InspectorClass
    get particle(): ParticleController { return this._particle ?? this.CreateController("particle"); }
    set particle(value: ParticleController) { this._particle = value; }

    public _level: LevelHandler;
    @InspectorClass
    get level(): LevelHandler { return this._level ?? this.CreateController("level"); }
    set level(value: LevelHandler) { this._level = value; }

    public _camera: CameraHandler;
    @InspectorClass
    get camera(): CameraHandler { return this._camera ?? this.CreateController("camera"); }
    set camera(value: CameraHandler) { this._camera = value; }

    // TRACKS HOW FAR THE SCENE LIFECYCLE HAS RUN, SO A CONTROLLER CREATED LATE (FIRST TOUCH
    // MID-GAME) CATCHES UP ON Awake/Start AT CREATION IN CreateController
    private controllersAwoken: boolean = false;
    private controllersStarted: boolean = false;

    @InspectorClass
    @Label("settings")
    public settingsHandler: SettingsHandler = new SettingsHandler(this);
    
    get settingsData(): SettingsData { return this.settingsHandler.Get(); }

    sceneOptionsSettingsData: SettingsData;

    // MOVE OUT? HAS SaveData REFERENCE - TODO
    get currentLevelStr(): string { return SaveData.currentLevelStr; }

    public events = mitt<Events>();
    
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
            // IS A sceneOptions
            options = sceneOptions as SceneOptions;
        }
        else
        {
            // IS A SETTINGSDATA DIRECTLY
            options = { settingsData: sceneOptions as SettingsData };
        }

        if (!options.settingsData)
            options.settingsData = defaultSettingsData;
        
        this.sceneOptionsSettingsData = options.settingsData;

        this.UI = options.UI ?? false;
        this.resize = options.resize ?? false;
        this.persistent = options.persistent ?? false;
        this.secret = options.secret ?? false;
        this.solo = options.solo ?? false;

        bare.AddClass(GameObject);
        bare.AddClass(ObjectController);

        Scene.DefineLazyControllerAccessors();
    }

    // CUSTOM CONTROLLERS (RegisterController WITH A DERIVED FIELD NAME) GET THE SAME LAZY
    // ACCESSOR PATTERN AS THE BUILT-IN ONES, DEFINED ON THE PROTOTYPE ONCE
    private static DefineLazyControllerAccessors(): void
    {
        for (const name of controllerNames)
        {
            if (name in Scene.prototype)
                continue;

            Object.defineProperty(Scene.prototype, name, {
                get(this: Scene) { return this["_" + name] ?? this.CreateController(name); },
                set(this: Scene, value: any) { this["_" + name] = value; },
                configurable: true,
            });
        }
    }

    // LAZILY CONSTRUCTS A CONTROLLER FROM THE globalThis[<name>Class] REGISTRY (RegisterController).
    // RETURNS undefined WHEN THE CONTROLLER MODULE ISN'T BUNDLED/REGISTERED.
    // A CONTROLLER CREATED AFTER THE SCENE ALREADY AWOKE/STARTED CATCHES UP ON Awake/Start HERE
    CreateController(propertyName: string): any
    {
        const Ctor = (globalThis as any)[propertyName + "Class"];

        if (!Ctor)
            return undefined;

        const instance = new Ctor(this);
        this["_" + propertyName] = instance; // SET BEFORE Awake/Start SO RE-ENTRANT ACCESS DOESN'T DOUBLE-CREATE

        if (this.controllersAwoken)
            instance.Awake?.();

        if (this.controllersStarted)
            instance.Start?.();

        return instance;
    }

    // THE CONTROLLERS THIS SCENE HAS ACTUALLY INSTANTIATED - READS THE BACKING FIELDS,
    // SO IT NEVER TRIGGERS LAZY CREATION
    private GetInstantiatedControllers(exclude?: string): any[]
    {
        var instances: any[] = [];

        for (var name of controllerNames)
        {
            if (name == exclude)
                continue;

            var instance = this["_" + name];
            if (instance)
                instances.push(instance);
        }

        return instances;
    }

    async Awake(payload?: any): Promise<void>
    {
        this.enabled = true;
        this.paused = false;
        this.started = false;
        this.controllersStarted = false;

        await this.settingsHandler.Process(payload?.settingsHandler?.GetRaw() || this.sceneOptionsSettingsData);//this.settingsData

        // SNAPSHOT FIRST, FLAG SECOND: CONTROLLERS CREATED DURING THE LOOP (OR LATER)
        // GET THEIR Awake AT CREATION IN CreateController INSTEAD
        var controllers = this.GetInstantiatedControllers();
        this.controllersAwoken = true;
        for (var controller of controllers)
        {
            controller.Awake?.();
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

        // SNAPSHOT FIRST, FLAG SECOND: CONTROLLERS CREATED DURING THE LOOP (OR LATER)
        // GET THEIR Start AT CREATION IN CreateController INSTEAD
        var controllers = this.GetInstantiatedControllers();
        this.controllersStarted = true;
        for (var controller of controllers)
        {
            controller.Start?.();
        }

        await this.OnStart(payload);

        this.started = true;
    }

    OnStart(payload?: any): void | Promise<void>
    {
        // FOR OVERRIDE

        // OPTIONAL TO OVERRIDE AS ASYNC - TO LOAD SOME MORE ASSETS BEFORE THE LOADING SCREEN DISAPPEARS
    }
    
    get layerNames(): string[]
    {
        return this.settingsData.layers;
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

    // COMP2 OVERRIDES COMP1
    // DOESN'T REALLY BELONG HERE? TODO
    MergeComponents(comp1: any, comp2: any):Record<string, Record<string, any>>
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
                    //if ((entityArg.hitbox || entityArg.hitboxRadius) && entityArg.baseClass == "GameObject") 
                    //    entityArg.baseClass = "ArcadeObject";
                    
                    // BIT OF A HACK TO MAKE SURE SOPIRO RIGIDBODIES HAVE A CENTER PIVOT
                    // PUT HERE TO LET THE EDITOR PREVIEW ALSO INHERIT IT
                    if (bare.gameMode == GameMode.Game)
                    {
                        var sopiroPhysicsClasses = ["Circle", "Box", "Polygon"];
                        if (sopiroPhysicsClasses.includes(entityArg.baseClass))
                            entityArg.pivot = { x: .5, y: .5 };
                    }
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
                        components: this.MergeComponents(possibleEntity.components, entityArg.components),
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
                                entityArg.baseEntity = "ANY_ENTITY";
                            else
                                if (settingsData.baseEntities[entityArg.name])
                                    entityArg.baseEntity = "ANY";
                                else
                                    entityArg.baseEntity = "ANY_ENTITY";

                        var entityBase = settingsData.baseEntities[entityArg.baseEntity];

                        entity = {
                            ...entityBase, // OVERRIDE
                            ...entityArg, // START
                            components: this.MergeComponents(entityBase.components, entityArg.components),
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
        this.ApplyEntityVarsToGameObject(entity, obj, addComponents);
        obj.OnApplyEntityToGameObject(entity, addComponents);

        obj.entity = entity;
    }

    ApplyEntityVarsToGameObject(entity: Entity, obj: GameObject, addComponents: boolean = true)
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

        // PUT MASS AFTER THE OTHER PHYSICS PROPS (SCALE, DENSITY, rigidbodyRect/hitboxRadius)
        // THOSE RECOMPUTE MASS FROM DENSITY, SO AN EXPLICIT MASS MUST BE APPLIED LAST TO WIN
        if (entity.mass)
        {
            let val = entity.mass;
            delete entity.mass;
            entity.mass = val;
        }

        // PUT STATIC 3RD LAST - FOR SOPIRO PHYSICS, IT NEEDS ALL OTHER RIGIDBODY DATA LIKE MASS FIRST, THEN SET STATIC
        if (entity.static)
        {
            let val = entity.static;
            delete entity.static;
            entity.static = val;
        }

        // PUT CHILDREN 2ND LAST - SO ALL OTHER PROPS ARE SET FOR THIS PARENT
        // ALSO, CHILDREN HAVE TO BE ADDED BEFORE COMPONENTS, SO COMPONENT ADDED() CAN ACCESS THEM
        if (entity.children)
        {
            let val = entity.children;
            delete entity.children;
            entity.children = val;
        }

        // PUT COMPONENTS LAST - SO PROPS LIKE POSITION/SCALE/ROTATION ARE SET AT ADDED() OF COMPONENT
        if (entity.components)
        {
            let val = entity.components;
            delete entity.components;
            entity.components = val;
        }

        const inspectorFieldNames = new Set(getInspectorFieldNames(obj));
        const isInspectorDescriptor = (value: any): boolean => {
            if (value === null || typeof value !== "object")
                return false;

            const proto = Object.getPrototypeOf(value);
            if (proto !== Object.prototype && proto !== null)
                return false;

            return "current" in value
                || "get" in value
                || "set" in value
                || "onChange" in value;
        };
        const specialMap = obj.specialMap;

        for (const key in entity) {
            if (key == "components" && !addComponents)
                continue;

            const value = entity[key];
            if (value === undefined) continue;

            // if special mapping exists — use it (takes priority; the field need not exist on obj, eg hitbox)
            const special = specialMap[key];
            if (special) {
                special(obj, value);
                continue;
            }

            // skip if obj doesn't have the field
            if (!(key in obj)) continue;

            // @InspectorField descriptors hold a { get, set } object on the instance.
            // Route through the descriptor's setter so we don't clobber that object (which would
            // drop the dropdown values / getter and downgrade the field to a plain input).
            if (inspectorFieldNames.has(key))
            {
                const descriptor = obj[key];
                if (isInspectorDescriptor(descriptor)
                    && (typeof descriptor.set === "function" || typeof descriptor.onChange === "function"))
                {
                    (descriptor.set || descriptor.onChange).call(obj, value);
                    continue;
                }
                // otherwise it's an accessor-based @InspectorField (e.g. `set alpha()`); fall through to
                // the normal assignment below, which invokes that accessor.
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
        bare.dummyGameObject.ResetValues();
        bare.dummyGameObject.InitTexture(MakePath(entityConstructed.imagePath!, entityConstructed.name)); // COULD BE NEEDED TO SET PIVOT RIGHT IF IT'S A PERCENTAGE
        this.ApplyEntityToGameObject(entityConstructed, bare.dummyGameObject);

        return {entity: entityConstructed, gameObject: bare.dummyGameObject};
    }

    // STILL RETURNS SOME ENTITY VALUES AS undefined, EG imagePath, SHOULD BE "". TODO
    GetEntityWithDefaultValues(nameOrEntity: string | Entity, settingsData: SettingsData = this.settingsData, options: ConstructEntityOptions = { propsToIgnoreInEntity: [], fillPresets: true }): Entity
    {
        var entityConstructed = this.ConstructEntity(nameOrEntity, settingsData, options);

        // INITIALIZE GAME OBJECT
        {
            var gameObject: GameObject;

            if (entityConstructed.baseClass == "GameObject")
            {
                gameObject = bare.dummyGameObject;
            }
            else
            {
                const pool = bare.gameObjectPools.get(entityConstructed.baseClass);
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
            var serializedValue;

            var objValue = gameObject[key];

            if (customSerialize[varName] && objValue)
                serializedValue = customSerialize[varName](objValue);
            else
                serializedValue = this.GetSerializedValueFromObject(gameObject, key);

            entityConstructed[varName] = serializedValue;
        }

        if (!entityConstructed.hitbox)
            entityConstructed.hitbox = { x1: 0, y1: 0, x2: 0, y2: 0 };

        return entityConstructed;
    }

    GetSerializedValueFromObject(gameObject: GameObject, field: string): any
    {
        var objValue = gameObject[field];
        var serializedValue;

        if (objValue && typeof objValue === "object" && (typeof (objValue as any).get === "function")) //eg: hitboxType
            serializedValue = (objValue as any).get();
        else
        if (objValue instanceof Vec2)
            serializedValue = { x: objValue.x, y: objValue.y };
        else
            serializedValue = objValue;

        // Only emit serializable values - had problem with DiamondUI.text before - todo
        // because text is in entityVars, from textObject - unwanted overlap. need to refactor to only include @inspectorField and @save from object
        if (typeof serializedValue === "function")
            serializedValue = undefined;
        else
        if (serializedValue !== null && typeof serializedValue === "object")
        {
            var proto = Object.getPrototypeOf(serializedValue);
            var isPlain = Array.isArray(serializedValue) || proto === Object.prototype || proto === null;
            if (!isPlain)
            {
                try { structuredClone(serializedValue); } // throws on non-cloneable -> drop it
                catch (_e) { serializedValue = undefined; }
            }
        }

        return serializedValue;
    }

    GetAppliedEntityWithDefaultValues(nameOrEntity: string | Entity, settingsData: SettingsData = this.settingsData, options: ConstructEntityOptions = { propsToIgnoreInEntity: [], fillPresets: true }): Entity
    {
        var entityConstructed = this.ConstructEntity(nameOrEntity, settingsData, options);

        var gameObject: GameObject;

        if (entityConstructed.baseClass == "GameObject")
        {
            gameObject = bare.dummyGameObject;
        }
        else
        {
            const pool = bare.gameObjectPools.get(entityConstructed.baseClass);
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

        // ADDING FALSE TO PREVENT COMPONENTS CREATION...
        this.ApplyEntityToGameObject(entityConstructed, gameObject, false);

        var entity = EntitySerializer.SerializeObjectFully(this, gameObject);

        // ... BUT ADDING IT BACK TO THE ENITY HERE, SO IT'S NOT LOST
        if (entityConstructed.components)
            entity.components = entityConstructed.components;

        return entity;
    }

    // INPUT CAN BE: ENTITY / ENTITY NAME / GAMEOBJECT / CLASS TO INSTANTIATE / TEXTURE
    AddGameObject<T extends GameObject = GameObject>(input?: Entity | string | GameObject | GameObjectClass | Texture, parent: int | string | GameObject = "objects"): T
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
                gameObject = bare.GetObjectFromPool("GameObject", this);
                gameObject.pooled = true;
                gameObject.name = "pooledGameObject";
                gameObject.OnAwake();
            }
            else
            if (typeof input === "function")
            {
                // GameObjectClass CASE, INSTANTIATE FROM POOL IF IT EXISTS
                const pool = bare.gameObjectPools.get(input.name);
                if (pool)
                    gameObject = pool.Grab();
                else
                    gameObject = new input();

                if (pool)
                    gameObject.pooled = true;

                gameObject.name = (pool ? "pooledGameObjectExtend" : "gameObjectExtend");
                gameObject.OnAwake();
            }
            else
            if (input instanceof GameObject)
            {
                // GameObject INSTANCE ALREADY PROVIDED
                gameObject = input;
                gameObject.OnAwake();
            }
            else
            if (input instanceof Texture)
            {
                // TEXTURE
                gameObject = bare.GetObjectFromPool("GameObject", this);
                gameObject.OnAwake();
                gameObject.SetTexture(input);
                gameObject.pooled = true;
                gameObject.name = input.texturePath || "PooledGameObjectFromTexture";
            }
            else
            {
                var entity: Entity;

                if (typeof input === "string")
                {
                    // STRING INPUT

                    var processPathInput = (path: string) => {
                        var split = path.split("/");
                        var imagePath = split.slice(0, split.length - 1).join("/");
                        var name = split[split.length - 1];

                        entity = {imagePath: imagePath, name:name, baseClass: "GameObject"};
                    }

                    if (input.includes("/"))
                    {
                        // PATH STRING - SET UP A BASIC ENTITY USING PROVIDED STRING - SPLITTING INTO NAME AND IMAGE PATH
                        // CAN ALSO PREPEND / EG: this.AddGameObject('/player') TO PREVENT CONSTRUCTING FROM ENTITY 'PLAYER', GETTING THE IMAGE INSTEAD
                        
                        // USAGE OF / OVERIDES ANY :XXX - YOU ARE DEFINING A PATH, NOTHING ELSE
                        if (input.includes(":"))
                            input = input.split(":")[0];
                            
                        processPathInput(input);
                    }
                    else
                    if (input.startsWith("-"))
                    {
                        // STRING INPUT, MARKED WITH -, EG: -exlosion
                        // PREVENT A TEXTURE LOOKUP FOR THIS NAME, HANDY FOR OBJECTS THAT WILL HAVE AN ANIMATION COMPONENT
                        var name = input.substring(1);
                        entity = this.ConstructEntity(name);
                        entity.texture = "NONE";
                    }
                    else
                    {
                        // DEFAULT - ENTITY NAME AS INPUT - CONSTRUCT IT
                        entity = this.ConstructEntity(input);
                    }
                }
                else
                {
                    // ENTITY ITSELF AS INPUT - CONSTRUCT IT - TO GET ALL DATA TO APPLY TO GAMEOBJECT BELOW
                    entity = this.ConstructEntity(input);
                }

                // CHECK IF IMAGE THAT THIS ENTITY WILL USE IS AVAILABLE
                // IF NOT, SET IT TO NONE - TO PREVENT A FAILED IMAGE REQUEST
                // THIS IS ONLY CHECKED FOR DEV, FOR PRODUCTION Bare.assets.images.length = 0 ALWAYS SINCE assets.ts IS NOT INCLUDED
                if (Bare.assets.images.length > 0 && entity.texture != "NONE" && entity.texture != "placeHolder" /*&& entity.texture*/)
                {
                    var hasEntityImage = false;

                    if (entity.texture)
                    {
                        hasEntityImage = Bare.assets.images.includes(entity.texture) || entity.texture == "whitePixel";
                    }
                    else
                    {
                        var path = MakePathForEntity(entity);
                        hasEntityImage = Bare.assets.images.includes(path);
                    }
                    
                    if (!hasEntityImage)
                    {
                        entity.texture = "NONE";
                        if (__STRIP_GENERATED_ASSETS__)
                        {
                            console.warn(`Could not find image for entity: ${entity.name}\n
This is fine for dev, but for production you need to provide an exsiting image name for this entity. Or you get a failed image request.\n
Alternatively, to skip the image request, prepend it with -, eg: AddGameObject("-${entity.name}")\n
Or, add:
  "bareEngine": {
    "stripGeneratedAssets": false
  }
to package.json to keep the generated assets (can become large for big projects).`);
                        }
                    }
                }

                gameObject = bare.GetObjectFromPool(entity.baseClass!, this);
                gameObject.OnAwake(entity);

                gameObject.Init(MakePathForEntity(entity)); // LOADS TEXTURE TOO

                //if (entity.texture != "NONE")
                //    delete entity.texture; // TEXTURE HAS BEEN HANDLED ABOVE WITH Init()

                this.ApplyEntityToGameObject(entity, gameObject); // SOING THIS AFTER TEXTURE LOAD, SO % PIVOT CAN BE SET CORRECTLY
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

                this.object.Add(gameObject, layer);
            }

            gameObject.Added();
        }
        gameObject.OnStart();
        
        // NOTIFY
        globalEvents.emit(BareEvent.game_objectAdded, { gameObject: gameObject, layer: parent });
        this.events.emit(BareEvent.game_objectAdded, { gameObject: gameObject, layer: parent });


        return gameObject as T;
    }

    AddGameObjectFromImage(image: string, parent?: int | GameObject)
    {
        if (!image.startsWith("/"))
            image = "/" + image;

        return this.AddGameObject(image, parent) as GameObject;
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

        gameObject.OnRemove();
        
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
                removed = this.object.Remove(gameObject, layer);
            }
        }
        else
        {
            removed = this.object.Remove(gameObject);
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
                const pool = bare.gameObjectPools.get(className);
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
        // BACKING FIELD (_) READS: ONLY TICK CONTROLLERS THAT EXIST, NEVER LAZY-CREATE THEM
        this._mouse?.Update(deltaTime);
        this._hitbox?.Update();
        this.OnPreUpdate(deltaTime); // NOT QUITE PRE-UPDATE HUH, BUT HERE JUST FOR EditorControlsHandler ATM, SO IT DRAGS OBJECTS AT POSITION AND AFTER THEY CAN BE SNAPPED TO OTHER POSITION
        this.object.Update(deltaTime);
        this._tween?.Update(bare.time);
        this._component?.Update(deltaTime);
        this._particle?.Update(deltaTime);

        this.events.emit(BareEvent.scene_update, deltaTime);
        this.OnUpdate(deltaTime);

        this._arcade?.Update(deltaTime);
        this._sopiro?.Update(deltaTime);
    }

    FixedUpdate(fixedDeltaTime: number): void
    {
        this._arcade?.FixedUpdate(fixedDeltaTime);
        this._sopiro?.FixedUpdate(fixedDeltaTime);

        this._component?.FixedUpdate(fixedDeltaTime);

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
        if (!this.render)
            return;

        rapid.matrixStack.save();

        if (!this.UI)
            this._camera?.SetTransform();

        this._level?.PreRender();

        this.OnPreRender();

        this._component?.PreRender();
        this.object.PreRender();

        this._component?.Render();
        this.object.Render();
        this._arcade?.Render();
        this._sopiro?.Render();
        this._particle?.Render();
        this._hitbox?.Render();

        this.OnRender();

        this._component?.PostRender();
        this.object.PostRender();

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
        if (this._camera)
        {
            // THE CAMERA IS SET TO THIS SCENE EXCLUSIVELY
            return this._camera.ScreenToWorld(x, y);
        }
        else
        {
            return new Vec2(x, y)
        }
    }

    WorldToScreen(x: number, y: number)
    {
        if (this._camera)
        {
            // THE CAMERA IS SET TO THIS SCENE EXCLUSIVELY
            return this._camera.WorldToScreen(x, y);
        }
        else
        {
            return new Vec2(x, y);
        }
    }

    GetCameraZoom(): number
    {
        if (this._camera)
        {
            // THE CAMERA IS SET TO THIS SCENE EXCLUSIVELY
            return this._camera.GetZoom();
        }
        else
        {
            return 1;
        }
    }

    // World units per on-screen (CSS) pixel. Folds in the camera zoom (world -> buffer px)
    // AND bare.resolutionScale (buffer px -> CSS px), so screen-sized editor UI (gizmo handles,
    // pivot dots, outlines) keeps a constant on-screen size in low-resolution games where the
    // buffer is scaled up to fill the canvas. Use this for sizing, not ScreenToWorld (a point
    // transform that includes camera pan and works in buffer px).
    ScreenPxToWorldScale(): number
    {
        return 1 / (this.GetCameraZoom() * bare.resolutionScale);
    }

    GetContructorName(gameObject: GameObject): string
    {
        var name = gameObject.constructor.name;

        if (name.startsWith("_")) // SOMETIMES GET NAMES LIKE _GameObject, REMOVING THAT _ HERE
            name = name.substring(1);

        return name;
    }

    // OVERRIDE THIS TO LOAD SOME MORE TEXTURES DURING LEVEL LOAD
    OnLoadLevelTextures(level: LevelData): Promise<Texture>[]
    {
        return [];
    }
    
    OnPreLoadLevel(level:LevelData) : void | Promise<void>
    {
        // FOR OVERRIDE
    }

    PostLoadLevel(level:LevelData, persistenObjUIDs:string[] = [])
    {
        this.isLevel = true;

        this._component?.PostLoadLevel(persistenObjUIDs);
        this.OnPostLoadLevel(level, persistenObjUIDs);
    }
    
    OnPostLoadLevel(level:LevelData, persistenObjUIDs:string[] = [])
    {
        // FOR OVERRIDE
    }

    GetAllComponentsFrom(obj:GameObject):any[]
    {
        return this._component?.GetAllFrom(obj);
    }

    Resize(prevWidth: number, prevHeight: number, newWidth: number, newHeight: number)
    {
        if (this.resize)
        {
            // RESIZE UI
            var objs = this.object.GetAll();
            for (var i = 0; i < objs.length; i++)
            {
                var obj = objs[i];
                obj.SetPosition(obj.x * newWidth / prevWidth, obj.y * newHeight / prevHeight);
            }
        }

        this._camera?.OnResize(prevWidth, prevHeight, newWidth, newHeight);
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

    Has(instanceName: string): boolean
    {
        return !!this["_" + instanceName];
    }

    async Restart(full:boolean = false)
    {
        this.events.clear();
        this.Clear();
        this.RestartClasses();
        await this.OnRestart();
        await this.Start();
    }

    async OnRestart(): Promise<void>
    {
        // FOR OVERRIDE
    }

    RestartClasses()
    {
        for (var controller of this.GetInstantiatedControllers("level")) // DO NOT RESTART LEVEL
        {
            controller.Restart?.();
        }
    }

    Clear(includingPersistent: boolean = true)
    {
        // THIS CANCELS ALL AWAITS, PREVENTING SOME NASTY PROBLEMS ON SCENE SWITCHING AND RESTART
        // CAN STILL SUPPLY A persistent PARAMETER TO wait() TO PREVENT THIS
        window.cancelWaits();

        for (var controller of this.GetInstantiatedControllers())
        {
            controller.Clear?.(includingPersistent);
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
        this.hitbox?.OnPointerDown(gameObject, callback);
    }

    OnPointerUp(gameObject: GameObject, callback: any)
    {
        /* @ AddClass(HitboxController) */
        this.hitbox?.OnPointerUp(gameObject, callback);
    }

    OnPointerEnter(gameObject: GameObject, callback: any)
    {
        /* @ AddClass(HitboxController) */
        this.hitbox?.OnPointerEnter(gameObject, callback);
    }

    OnPointerLeave(gameObject: GameObject, callback: any)
    {
        /* @ AddClass(HitboxController) */
        this.hitbox?.OnPointerLeave(gameObject, callback);
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
        return this._level?.currentLevel;
    }

    async LoadLevel(levelInput: string | LevelData = ""): Promise<LevelData>
    {
        /* @ AddClass(levelHandler) */

        return await this.level?.Load(levelInput);
    }
}
