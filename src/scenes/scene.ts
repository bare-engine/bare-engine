import type { ArcadePhysicsController } from "../controllers/arcadePhysicsController";
import type { ComponentController } from "../controllers/componentController";
import type { HitboxController } from "../controllers/hitboxController";
import type { MouseController } from "../controllers/mouseController";
import { ObjectController } from "../controllers/objectController";
import type { ParticleController } from "../controllers/particleController";
import type { SopiroPhysicsController } from "../controllers/sopiroPhysicsController";
import type { TweenController } from "../controllers/tweenController";
import { controllerNames, GameMode, globalEvents, MakePath, MakePathForEntity } from "../globals";
import type { CameraHandler } from "../handlers/cameraHandler";
import { assetsHandler } from "../handlers/assetsHandler";
import type { LevelHandler } from "../handlers/levelHandler";
import { SettingsHandler } from "../handlers/settingsHandler";
import mitt from "../libraries/mitt";
import { Color, RenderTexture, Texture, Vec2 } from "../libraries/rapid-render";
import { GameObject } from "../objects/gameObject";
import { Bare } from "../types/bare";
import { defaultSettingsData } from "../types/bareData";
import { AnyEntity, AwakePayload, BareEvent, CollisionHandlingType, ConstructEntityOptions, Entity, entityVars, Events, GameObjectClass, LayerInfo, LevelData, ProcessedSettingsData, SaveData, SceneClass, SceneI, SceneOptions, sceneOptionKeys, SettingsData } from "../types/bareTypes";
import { InspectorClass, InspectorField, Label } from "../utils/decorators";
import { GameObjectSerializer } from "../utils/entitySerializer";
import { Helper } from "../utils/helper";
import { Hitbox } from "../types/hitbox";

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
    defaultGameObject!: GameObject;
   
    @InspectorField
    get _solo(): boolean { return this.solo; }
    set _solo(solo: boolean) {
        if (solo)
        {
            bare.scene.DisableAll();
            bare.scene.GetAll().forEach(scene => scene.solo = false);
            this.enabled = true;
        }
        else
        {
            bare.scene.EnableAll();
        }

        this.solo = solo;
    }
    
    public isLevel: boolean = false;

    // CONTROLLERS ARE LAZY: FIRST ACCESS INSTANTIATES THE CLASS FROM THE globalThis[<name>Class]
    // REGISTRY (FILLED BY RegisterController WHEN A CONTROLLER MODULE IS BUNDLED), SO A SCENE ONLY
    // GETS THE CONTROLLERS IT ACTUALLY TOUCHES - AND UNUSED CONTROLLER MODULES STAY TREE-SHAKEN.
    // ENGINE PLUMBING (Update/Render/LIFECYCLE LOOPS) READS THE _ BACKING FIELDS SO IT NEVER
    // TRIGGERS CREATION; USER-FACING ACCESS GOES THROUGH THE GETTERS AND CREATES ON DEMAND
    public _object?: ObjectController;
    @InspectorClass
    get object(): ObjectController { return this._object ?? this.CreateController("object"); }
    set object(value: ObjectController) { this._object = value; }

    private _mouse?: MouseController;
    @InspectorClass
    get mouse(): MouseController { return this._mouse ?? this.CreateController("mouse"); }
    set mouse(value: MouseController) { this._mouse = value; }

    private _hitbox?: HitboxController;
    @InspectorClass
    get hitbox(): HitboxController { return this._hitbox ?? this.CreateController("hitbox"); }
    set hitbox(value: HitboxController) { this._hitbox = value; }

    private _tween?: TweenController;
    @InspectorClass
    get tween(): TweenController { return this._tween ?? this.CreateController("tween"); }
    set tween(value: TweenController) { this._tween = value; }

    private _component?: ComponentController;
    @InspectorClass
    get component(): ComponentController { return this._component ?? this.CreateController("component"); }
    set component(value: ComponentController) { this._component = value; }

    private _arcade?: ArcadePhysicsController;
    @InspectorClass
    get arcade(): ArcadePhysicsController { return this._arcade ?? this.CreateController("arcade"); }
    set arcade(value: ArcadePhysicsController) { this._arcade = value; }

    private _sopiro?: SopiroPhysicsController;
    @InspectorClass
    get sopiro(): SopiroPhysicsController { return this._sopiro ?? this.CreateController("sopiro"); }
    set sopiro(value: SopiroPhysicsController) { this._sopiro = value; }

    private _particle?: ParticleController;
    @InspectorClass
    get particle(): ParticleController { return this._particle ?? this.CreateController("particle"); }
    set particle(value: ParticleController) { this._particle = value; }

    private _level?: LevelHandler;
    @InspectorClass
    get level(): LevelHandler { return this._level ?? this.CreateController("level"); }
    set level(value: LevelHandler) { this._level = value; }

    private _camera?: CameraHandler;
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
    
    get settingsData(): ProcessedSettingsData { return this.settingsHandler.Get(); } // PROCESSED SETTINGSDATA
    get settings() { return this.settingsData.settings; } // CONSISTENT WITH OTHER BARE MODULE NAMINGS

    sceneOptionsSettingsData: SettingsData;

    // MOVE OUT? HAS SaveData REFERENCE - TODO
    get currentLevelStr(): string { return SaveData.currentLevelStr; }

    @InspectorClass
    public events = mitt<Events>();
    
    //private pipes = matt<Pipes>();
    
    constructor(sceneOptions: SceneOptions | SettingsData = {settingsData: defaultSettingsData})
    {
        let options: SceneOptions;
        const isSceneOptions =
            sceneOptions &&
            typeof sceneOptions === "object" &&
            Object.keys(sceneOptionKeys).some(key => key in sceneOptions);

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
        this.solo = options.solo ?? false;

        bare.AddClass(GameObject);
        bare.AddClass(ObjectController);

        Scene.DefineLazyControllerAccessors();

        // CREATE MOUSE CONTROLLER RIGHT AWAY, SO IT'S FIRST TO LISTEN TO pointer_down
        // DOES NOT WORK AS LAZY CONTROLLER LIKE OTHERS
        // NO-OP WHEN THE MOUSE CONTROLLER MODULE ISN'T BUNDLED (CREATECONTROLLER RETURNS UNDEFINED)
        this.CreateController("mouse");
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
                get(this: Scene) { return (this as any)["_" + name] ?? this.CreateController(name); },
                set(this: Scene, value: any) { (this as any)["_" + name] = value; },
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
        (this as any)["_" + propertyName] = instance; // SET BEFORE Awake/Start SO RE-ENTRANT ACCESS DOESN'T DOUBLE-CREATE

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

            var instance = (this as any)["_" + name];
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

        const settingsResult = this.settingsHandler.Process(payload?.settingsHandler?.GetRaw() || this.sceneOptionsSettingsData);//this.settingsData
        if (settingsResult instanceof Promise)
            await settingsResult;

        // SNAPSHOT FIRST, FLAG SECOND: CONTROLLERS CREATED DURING THE LOOP (OR LATER)
        // GET THEIR Awake AT CREATION IN CreateController INSTEAD
        var controllers = this.GetInstantiatedControllers();
        this.controllersAwoken = true;
        for (var controller of controllers)
        {
            controller.Awake?.();
        }

        const awakeResult = this.OnAwake(payload);
        if (awakeResult instanceof Promise)
            await awakeResult;

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

        this.defaultGameObject = new GameObject(this);

        // SNAPSHOT FIRST, FLAG SECOND: CONTROLLERS CREATED DURING THE LOOP (OR LATER)
        // GET THEIR Start AT CREATION IN CreateController INSTEAD
        var controllers = this.GetInstantiatedControllers();
        this.controllersStarted = true;
        for (var controller of controllers)
        {
            controller.Start?.();
        }

        await this.OnStart(payload);

        // START ALL GAME OBJECTS
        var StartGameObjectTree = (gameObject: GameObject) => 
        {
            gameObject.Start();

            for (var i = 0; i < gameObject.children.length; i++)
            {
                StartGameObjectTree(gameObject.children[i]);
            }
        }

        var gameObjects = this.object.GetAll();
        for (var i = 0; i < gameObjects.length; i++)
        {
            StartGameObjectTree(gameObjects[i]);
        }

        // START ALL COMPONENTS
        this._component?.StartAll();

        this.started = true;
    }

    OnStart(payload?: any): void | Promise<void>
    {
        // FOR OVERRIDE

        // OPTIONAL TO OVERRIDE AS ASYNC - EG TO LOAD SOME MORE ASSETS BEFORE THE LOADING SCREEN DISAPPEARS
    }

    private StartGameObjects(): void
    {
    }
    
    get layerNames(): string[]
    {
        return this.settingsData.layers;
    }

    SetPointerCollisionTypeForLayer(type: CollisionHandlingType, layerName: string = "objects"): void
    {
        const layerInfo = this.settingsData.layersInfo[layerName];
        if (!layerInfo)
            throw new Error(`Cannot set pointer collision type for unknown layer "${layerName}".`);

        layerInfo.pointerCollisionType = type;
    }

    AddLayer(name: string, layerInfo?: Partial<LayerInfo>): void
    {
        this.settingsData.layers.push(name);
        
        // DUPLICATE FROM SETTINGSDATA - TODO
        const newLayerInfo:LayerInfo = {
            name: name,
            layerI: this.settingsData.layers.length - 1,
            showInEditor: true,
            save: true,
            pointerCollisionType: CollisionHandlingType.POINT,
            collidesWith: [name],//
            
            ...layerInfo // OVERRIDES ABOVE
        };

        this.settingsData.layersInfo[name] = newLayerInfo;

        // ADJUSTING PROCESSED DATA NOW, WILL ALL BE LOST IT ITS RE-PROCESSSED
        // BUT WILL PROBABLY NOT HAPPEN AFTER INIT? TODO

        return;
        this.settingsHandler.UpdateRaw((raw) => {
            raw.layers ??= [];
            raw.layersInfo ??= {};

            raw.layers.push(name);
        
            // DUPLICATE FROM SETTINGSDATA - TODO
            const newLayerInfo:LayerInfo = {
                name: name,
                layerI: raw.layers.length - 1,
                showInEditor: true,
                save: true,
                pointerCollisionType: CollisionHandlingType.POINT,

                ...layerInfo // OVERRIDES ABOVE
            };

            raw.layersInfo[name] = newLayerInfo;
        });
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

    // MERGES sourceChildren + currentChildren
    // A currentChild THAT LINKS .extends TO A sourceChild .entityUID REPLACES IT IN PLACE
    MergeChildren(sourceChildren: Entity[] = [], currentChildren?: Entity[]): Entity[]
    {
        var possibleEntityChildren = [];
        var toStripEntityUID = [];
        const inheritedSourceUIDByChildUID = new Map<string, string>();
        for (var possibleChild of sourceChildren)
        {
            var possibleChildCopy = { ...possibleChild };
            if (possibleChild.entityUID)
            {
                // A processed inherited child can itself be a proxy: its entityUID identifies the
                // proxy while its entity points at the original source child. Plugin preprocessing
                // may already have materialized a current child using that original source UID.
                // Preserve that canonical identity before replacing .extends below.
                if (typeof possibleChild.extends === "string"
                    && this.settingsHandler.rawEntitiesMappedByUID[possibleChild.extends])
                {
                    inheritedSourceUIDByChildUID.set(possibleChild.entityUID, possibleChild.extends);
                }

                possibleChildCopy.extends = possibleChild.entityUID;
                // its children are inherited the same way, as references to the source's children. keeping the
                // source's own children would keep their uids, serializing them as the source itself (in full)
                if (possibleChild.children)
                    possibleChildCopy.children = this.MergeChildren(possibleChild.children, undefined);
                toStripEntityUID.push(possibleChildCopy);
            }
            possibleEntityChildren.push(possibleChildCopy);
        }


        const current = currentChildren ?? [];
        const usedCurrentChildren = new Set<number>();
        const merged = (possibleEntityChildren ?? []).map(sourceChild =>
        {
            const referencedSourceUID = typeof sourceChild.extends === "string"
                && this.settingsHandler.rawEntitiesMappedByUID[sourceChild.extends]
                    ? sourceChild.extends
                    : undefined;
            const sourceChildUID = sourceChild.entityUID ?? referencedSourceUID;
            if (sourceChildUID === undefined)
                return sourceChild;

            const inheritedSourceUID = sourceChild.entityUID
                ? inheritedSourceUIDByChildUID.get(sourceChild.entityUID)
                : undefined;
            const overrideIndex = current.findIndex((currentChild, index) =>
                !usedCurrentChildren.has(index)
                && (currentChild.extends === sourceChildUID
                    || (inheritedSourceUID !== undefined && currentChild.extends === inheritedSourceUID))
            );

            if (overrideIndex === -1)
                return sourceChild;

            usedCurrentChildren.add(overrideIndex);
            return current[overrideIndex];
        });

        current.forEach((currentChild, index) =>
        {
            if (!usedCurrentChildren.has(index))
                merged.push(currentChild);
        });

        
        //
        for (var childToStrip of toStripEntityUID)
        {
            delete childToStrip.entityUID; // SOURCE ENTITY SHOULD STAY ONLY ONE WITH ITS UID
        }


        return merged;
    }

    // a child built from its parent's entity has no unconstructed entity registered. rebuild one: the reference it
    // extends, plus what its parent's entity (eg a level override) changed on top of that reference. without it,
    // those changes are already in the child's entity, count as unchanged, and get dropped on the next save
    private GetChildSourceEntity(entity: Entity): Entity | undefined
    {
        if (!entity.constructed)
            return undefined;

        const source = this.ConstructEntity({ extends: entity.extends ?? "ANY" });
        const overrides: Entity = GameObjectSerializer.GetEntitiesDiff(source, entity) ?? {};

        // bookkeeping, not authored data. children are rebuilt from the live child objects
        delete overrides.constructed;
        delete overrides.extends;
        delete overrides.entityUID;
        delete overrides.children;

        return entity.extends ? { extends: entity.extends, ...overrides } : overrides;
    }

    // FINDS THE DIFFERENCE BETWEEN CURRENT SERIALIZED OBJECT AND STARTING SERIALIZED OBJECT
    // DIFFERENCE GETS MERGED WITH unconstructedEntity
    // USING unconstructedEntity, SINCE IT CAN CONTAIN VALUES LIKE PIVOT .5,.5, imagePath, entity, WHICH CAN'T BE SERIALIZED BACK FROM A GAMEOBJECT
    GetEntityFromObject(rootObject: GameObject, options: ConstructEntityOptions = { propsToIgnoreInEntity: [], fillPresets: true, forceAllEntityVars: false }): Entity
    {
        if (!rootObject.parent)
        {
            this.ApplyEntityToGameObject({extends: "ANY"}, this.defaultGameObject);
        }

        const startingEntity = rootObject.entity || {};
        const unconstructedSource = this.settingsHandler.GetUnconstructedEntity(rootObject.entity)
            ?? (rootObject.parent ? this.GetChildSourceEntity(startingEntity) : undefined)
            ?? {};

        // SERIALIZE ORIGINAL GAMEOBJECT USING STARTING ENTITY
        const serializedRootObjectOrig = this.ConstructEntityWithDefaultValues(startingEntity, this.settingsData, options);
        
        // SERIALIZE CURRENT GAMEOBJECT
        const serializedRootObject = GameObjectSerializer.SerializeObjectFully(this, rootObject, options.forceAllEntityVars);
        
        // STORE THE DIFFERENCES IN AN OBJECT (SHOULD BE EMPTY IF NO CHANGES WERE MADE)
        const diff = GameObjectSerializer.GetEntitiesDiff(serializedRootObjectOrig, serializedRootObject) ?? {};

        // REDO CHILDREN - NEEDED FOR IF A CHILD IS REMOVED THE ABOVE DIFF IS NOT CORRECT, SINCE IT'S COMPARING DIFFERENT CHILDREN THEN
        // THIS DOES MAKE THE ABOVE DIFF FINDING ALL DIFFERENCES IN CHILDREN REDUNDANT - OPTIMIZE
        // ALSO WHEN NO CHILDREN ARE LEFT BUT THE ENTITY HAD SOME: THE MERGE BELOW STARTS FROM THE UNCONSTRUCTED
        // ENTITY, SO ITS children WOULD SURVIVE THE LAST CHILD BEING REMOVED
        const redoChildren = rootObject.children.length > 0 || (unconstructedSource.children?.length ?? 0) > 0;
        const savedChildren: Entity[] = [];
        if (redoChildren)
        {
            delete diff.children;

            for (const child of rootObject.children)
            {
                if (!child.save && !options.forceAllEntityVars)
                    continue;

                const childEntity = this.GetEntityFromObject(child, options);
                if (Object.keys(childEntity).length > 0)
                    savedChildren.push(childEntity);
            }

            if (savedChildren.length > 0)
                diff.children = savedChildren;
        }

        const unconstructedEntity = Helper.DeepCopy(unconstructedSource);

        var finalEntity: Entity = {};

        if (startingEntity)
        {
            if (Object.keys(diff).length > 0 && startingEntity.extends)
                diff.extends = startingEntity.extends;

            // deep merge so a partial diff like position: {x} keeps the source's y
            finalEntity = Helper.DeepMerge(unconstructedEntity, diff);
        }
        else
        if (unconstructedSource)
        {
            Helper.DeepMerge(unconstructedEntity, diff);
            delete unconstructedEntity.id;

            finalEntity = unconstructedEntity;
        }

        // NO CHILDREN LEFT TO SAVE (EG THE LAST ONE WAS REMOVED): DROP THE ONES KEPT FROM THE UNCONSTRUCTED ENTITY
        if (redoChildren && savedChildren.length == 0)
            delete finalEntity.children;

        // objects from data are always saved, so the mark is never needed. only save: false is kept
        if (finalEntity.save === true)
            delete finalEntity.save;

        // a uid generated at runtime only links the object to its source, don't let it end up in level data
        // the prefab editor writes into the live settings data, where objects keep pointing at it (stripped from the saved copy instead)
        if (!options.keepRuntimeUIDs && this.settingsHandler.IsRuntimeGeneratedUID(finalEntity.entityUID))
            delete finalEntity.entityUID;

        // REMOVE ANY FIELDS THAT HAVE A DEFAULT VALUE
        for (var field in finalEntity)
        {
            var defaultValueField = (this.defaultGameObject as any)[field];
            var currentValueField = (finalEntity as any)[field];

            if (Helper.ObjectsAreEqual(defaultValueField, currentValueField))
                delete (finalEntity as any)[field];
        }

        // ROUND POSITION
        if (finalEntity.position)
        {
            if (finalEntity.position.x)
                finalEntity.position.x = Math.round(finalEntity.position.x);
            if (finalEntity.position.y)
                finalEntity.position.y = Math.round(finalEntity.position.y);
        }

        // STUPID FIX FOR GAMEOBJECT THAT WAS INSTANTIATED WITHOUT AN ENTITY, HAVE TO GET/SET THE TEXTURE MANUALLY
        if (!rootObject.entity && rootObject.texture)
            finalEntity.texture = rootObject.texture.texturePath;

        return finalEntity;
    }
    
    // CONSTRUCTS AN ENTITY OUT OF A ENITTY NAME OR ENTITY OBJECT
    // FOR AN ENTITY NAME: IT RETURNS THE ENTITY FOUND IN SETTINGSDATA, OR CREATES A NEW ONE IF NOT THERE
    // FOR AN ENTITY OBJECT: IT FINDS THE REFERENCED/DEFAULT ENTITY FROM SETTINGSDATA AND MERGES IT IN FOR A NEW ENTITY
    ConstructEntity(nameOrEntity: string | Entity, settingsData: SettingsData = this.settingsData, options: ConstructEntityOptions = { propsToIgnoreInEntity: [] }): Entity
    {
        if (typeof nameOrEntity === "object" && nameOrEntity.constructed)
            return Helper.DeepCopy(nameOrEntity); // ALREADY CONSTRUCTED BEFORE
            
        if (options.fillPresets === undefined)
            options.fillPresets = true;
        if (options.propsToIgnoreInEntity === undefined)
            options.propsToIgnoreInEntity = [];

        var entity!: Entity; // every branch below assigns it or throws
        
        // PROCESS THE ARGUMENT TO GET THE ENTITY TO WORK ON
        {
            if (typeof nameOrEntity === "object")
            {
                // ARG IS ENTITY OBJECT

                // CONSTRUCT - GENERALIZE THIS? SHOULD BE SAME FOR BASE
                {
                    var entityArg = Helper.DeepCopy(nameOrEntity);

                    // ANYTHING WITH A HITBOX IS A PHYSICS OBJECT
                    //if ((entityArg.hitbox || entityArg.hitboxRadius) && entityArg.baseClass == "GameObject") 
                    //    entityArg.baseClass = "ArcadeObject";
                    
                    // BIT OF A HACK TO MAKE SURE SOPIRO RIGIDBODIES HAVE A CENTER PIVOT
                    // PUT HERE TO LET THE EDITOR PREVIEW ALSO INHERIT IT
                    if (bare.gameMode == GameMode.Play)
                    {
                        var sopiroPhysicsClasses = ["Circle", "Box", "Polygon"];
                        if (entityArg.baseClass && sopiroPhysicsClasses.includes(entityArg.baseClass))
                            entityArg.pivot = { x: .5, y: .5 };
                    }
                }

                // CONSTRUCT: MERGE entityArg WITH (ALREADY CONSTRUCTED) ENTITY FROM SETTINGSDATA
                {
                    if (entityArg.name == "ANY")
                    {
                        // ANY IS THE ONLY PREFAB THAT DOES NOT EXTEND ANOTHER
                        entity = entityArg;
                    }
                    else
                    {
                        // SET DEFAULT ENTITY, IF NOT SET
                        if (!entityArg.extends)
                        {
                            entityArg.extends = "ANY";
                        }
                    }

                    // .extends HAS BEEN SET, NOW GET IT FROM SETTINGSDATA AND MERGE IT FOR NEW ENTITY
                    if (entityArg.extends)
                    {
                        var possiblePrefab: Entity | undefined = this.settingsHandler.GetProcessedPrefab(entityArg.extends, settingsData);
                        if (possiblePrefab)
                        {
                            // ENTITY WAS FOUND IN ENTITIES ARRAY IN DATA, DELETE SPECIFIED IGNORED PROPS FROM IT
                            // USING IT ATM TO FIND THE PROPS SET ON THE BASE
                            for (var prop of options.propsToIgnoreInEntity)
                            {
                                delete entityArg[prop as keyof Entity];
                            }
                            
                            //entityArg.entityUID ??= Helper.GenerateEntityUID();
                            //this.settingsHandler.rawEntitiesMappedByUID[entityArg.entityUID] = Helper.DeepCopy(entityArg);

                            var mergedChildren = this.MergeChildren(possiblePrefab.children ?? [], entityArg.children);

                            // MERGE WITH ENTITY IN SETTINGSDATA
                            entity = {
                                ...Helper.DeepMergeCopy(possiblePrefab, entityArg), // BASE + OVERRIDE
                                components: this.MergeComponents(possiblePrefab.components, entityArg.components),
                                children: mergedChildren
                            };

                            // the source's uid identifies the source only, an override referencing it doesn't take it over
                            if (entityArg.entityUID)
                                entity.entityUID = entityArg.entityUID;
                            else
                                delete entity.entityUID;

                            // CONSTRUCT ANY NEW CHILDREN IF NECESSARY
                            for (var i = 0; i < entity.children.length; i++)
                            {
                                var child = entity.children[i];
                                if (!child.constructed)
                                    entity.children[i] = this.ConstructEntity(child, settingsData, options);
                            }

                            if (!entityArg.name && (entity.name == "ANY" || entity.name == "NONE"))
                                delete entity.name; // name IS INHERITED, EXCEPT FROM THE DEFAULT PREFABS ANY AND NONE
                        }
                        else
                        {
                            throw new Error(`Could not find prefab '${entityArg.extends}' extended by '${entityArg.name}'`);
                        }
                    }

                    if(entity.extends == "ANY")
                        delete entity.extends;
                }
            }
            else
            {
                // ARG IS NAME
                var possiblePrefab = SettingsHandler.FindPrefab(settingsData, nameOrEntity);
                if (possiblePrefab)
                {
                    // ENTITY NAME IS DEFINED IN ENTITIES
                    entity = Helper.DeepCopy(possiblePrefab);
                }
                else
                {
                    // ENTITY NAME NOT FOUND, SO TAKE THE 'ANY' ENTRY AND ASSIGN A NEW NAME
                    var anyPrefab = Helper.DeepCopy(SettingsHandler.FindPrefab(settingsData, "ANY")!);
                    entity = anyPrefab;
                    entity.name = nameOrEntity;
                    entity.texture = nameOrEntity;
                }
            }
        }

        this.settingsHandler.ConstructEntity(entity, settingsData, options);

        if (entity.texture == "NAME")
        {
            // REPLACE 'NAME' VALUE OF texture WITH entity.name
            var isBase = SettingsHandler.IsBasePrefab(settingsData, entity.name!);
            if (!isBase && entity.name)
                entity.texture = entity.name;
            else
                delete entity.texture;
        }

        if (entity.imagePath && entity.texture)
        {
            // PREPEND texture WITH imagePath, NO NEED FOR imagePath ANYMORE
            entity.texture = entity.imagePath + "/" + entity.texture;
            delete entity.imagePath;
        }

        entity.constructed = true;

        return entity;
    }

    ApplyEntityToGameObject(entity: Entity, obj: GameObject, addComponents: boolean = true)
    {
        this.OnApplyEntityToGameObject(entity, obj, addComponents);

        this.ApplyEntityVarsToGameObject(entity, obj, addComponents);
        obj.OnApplyEntityToGameObject(entity, addComponents);

        obj.entity = entity;
    }

    OnApplyEntityToGameObject(entity: Entity, obj: GameObject, addComponents: boolean)
    {
        // OVERRIDE
    }

    ApplyEntityVarsToGameObject(entity: AnyEntity, obj: GameObject, addComponents: boolean = true)
    {
        obj.OnApplyEntityVarsToGameObject(entity, obj);
        
        if (!obj.texture && entity.texture && entity.texture != "NAME" && entity.texture != "NONE")//
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

            const value = (entity as any)[key];
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
            // DETECTED BY SHAPE, NOT VIA getInspectorFieldNames - PROD BUILDS STRIP THE DECORATORS,
            // SO THAT METADATA IS EMPTY THERE AND EG TextObject.text WOULD NEVER CALL SetText.
            // accessor-based @InspectorFields (e.g. `set alpha()`) fall through to the normal
            // assignment below, which invokes that accessor.
            const descriptor = (obj as any)[key];
            if (isInspectorDescriptor(descriptor)
                && (typeof descriptor.set === "function" || typeof descriptor.onChange === "function"))
            {
                (descriptor.set || descriptor.onChange).call(obj, value);
                continue;
            }

            // detect XY struct
            const isXY = value && typeof value === "object" && ("x" in value || "y" in value);

            if (isXY)
            {
                // A NULL FIELD (EG gravity) GETS A NEW Vec2, THERE'S NOTHING TO WRITE INTO
                if ((obj as any)[key] == null)
                {
                    (obj as any)[key] = new Vec2(value.x ?? 0, value.y ?? 0);
                    continue;
                }

                if ("x" in value)
                    (obj as any)[key].x = value.x;

                if ("y" in value)
                    (obj as any)[key].y = value.y;

                continue;
            }

            // generic direct assignment
            (obj as any)[key] = value;
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
        var entityConstructed: AnyEntity = this.ConstructEntity(nameOrEntity, settingsData, options);

        // INITIALIZE GAME OBJECT
        {
            var gameObject: GameObject;

            if (entityConstructed.baseClass == "GameObject")
            {
                gameObject = bare.dummyGameObject;
            }
            else
            {
                const pool = bare.gameObjectPools.get(entityConstructed.baseClass!);
                if (pool)
                    gameObject = pool.Grab();
                else
                    throw new Error(`No object pool for baseClass '${entityConstructed.baseClass}'`);
            }

            gameObject.scene = this;
            gameObject.ResetValues();
        }

        // 
        var customSerialize:Record<string, (currentValue: any) => any> = {};
    
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
                serializedValue = GameObjectSerializer.SerializeValue(gameObject, key);

            (entityConstructed as any)[varName] = serializedValue;
        }

        if (!entityConstructed.hitbox)
            entityConstructed.hitbox = { x1: 0, y1: 0, x2: 0, y2: 0 };

        entityConstructed.extends ??= "ANY";
        
        return entityConstructed;
    }

    // CONSTRUCT ENTITY FROM SETTINGSDATA AND CONSTRUCT IT INTO A GAMEOBJECT TO GET ALL ITS VALUES
    ConstructEntityWithDefaultValues(nameOrEntity: string | Entity, settingsData: SettingsData = this.settingsData, options: ConstructEntityOptions = { propsToIgnoreInEntity: [], fillPresets: true }): Entity
    {
        var entityConstructed = this.ConstructEntity(nameOrEntity, settingsData, options);

        var gameObject: GameObject;

        if (entityConstructed.baseClass == "GameObject")
        {
            gameObject = bare.dummyGameObject;
        }
        else
        {
            const pool = bare.gameObjectPools.get(entityConstructed.baseClass!);
            if (pool)
                gameObject = pool.Grab();
            else
                throw new Error(`No object pool for baseClass '${entityConstructed.baseClass}'`);
        }

        gameObject.scene = this;
        gameObject.ResetValues();

        gameObject.Awake();
        
        if (entityConstructed.texture && entityConstructed.texture != "NAME" && entityConstructed.texture != "NONE")
            gameObject.InitTexture(MakePathForEntity(entityConstructed)); // COULD BE NEEDED TO SET PIVOT RIGHT IF IT'S A PERCENTAGE
    
        // DON'T WANT COMPONENTS TO BE CREATED AT ApplyEntityToGameObject(). 
        //delete entityConstructed.components;

        // ADDING FALSE TO PREVENT COMPONENTS CREATION...
        bare.sendEvents = false;
        this.ApplyEntityToGameObject(entityConstructed, gameObject, false);
        bare.sendEvents = true;

        // forceAllEntityVars: every field, eg to compare against an object that is serialized the same way
        var entity = GameObjectSerializer.SerializeObjectFully(this, gameObject, options.forceAllEntityVars ?? false);

        // ... BUT ADDING IT BACK TO THE ENITY HERE, SO IT'S NOT LOST
        if (entityConstructed.components)
            entity.components = entityConstructed.components;

        return entity;
    }

    // INPUT CAN BE: ENTITY / ENTITY NAME / GAMEOBJECT / CLASS TO INSTANTIATE / TEXTURE
    // THE ENTITY IS TYPED BY T's entity FIELD, EG: AddGameObject<Button>({ text: "Ok" }) CHECKS AGAINST ButtonEntity
    // A GAMEOBJECT INSTANCE IS RETURNED AS ITS OWN TYPE, EG: AddGameObject(new TextObject(this)) IS A TextObject
    AddGameObject<T extends GameObject>(gameObject: T, parent?: int | string | GameObject): T;
    AddGameObject<T extends GameObject = GameObject>(input?: NonNullable<T["entity"]> | string | GameObject | (new (...args: any[]) => T) | Texture, parent?: int | string | GameObject): T;
    AddGameObject<T extends GameObject = GameObject>(input?: NonNullable<T["entity"]> | string | GameObject | (new (...args: any[]) => T) | Texture, parent: int | string | GameObject = "objects"): T
    {
        // CREATE
        {
            var gameObject: GameObject;

            if (!input)
            {
                // DEFAULT GAMEOBJECT
                gameObject = bare.GetObjectFromPool("GameObject", this);
                gameObject.pooled = true;
                gameObject.name = "gameObject"; //"pooledGameObject";
                gameObject.scene = this;
                gameObject.Awake();
            }
            else
            if (typeof input === "function")
            {
                // GameObjectClass CASE, INSTANTIATE FROM POOL IF IT EXISTS
                const pool = bare.gameObjectPools.get(input.name);
                if (pool)
                    gameObject = pool.Grab();
                else
                    gameObject = new input(this);

                if (pool)
                    gameObject.pooled = true;

                gameObject.name = "gameObject"; //(pool ? "pooledGameObjectExtend" : "gameObjectExtend");
                gameObject.scene = this;
                gameObject.Awake();
            }
            else
            if (input instanceof GameObject)
            {
                // GameObject INSTANCE ALREADY PROVIDED
                gameObject = input;
                gameObject.scene.RemoveGameObject(gameObject, false); // REMOVE IF ADDED ALREADY
                gameObject.scene = this;
                gameObject.Awake();
            }
            else
            if (input instanceof Texture)
            {
                // TEXTURE
                gameObject = bare.GetObjectFromPool("GameObject", this);
                gameObject.Awake();
                gameObject.SetTexture(input);
                gameObject.pooled = true;
                gameObject.name = input.texturePath || "gameObject"; //"PooledGameObjectFromTexture";
            }
            else
            {
                var entity: Entity;
                var unconstructedEntity: Entity;

                // SETUP unconstructedEntity
                if (typeof input === "string")
                {
                    // STRING INPUT

                    if (input.includes("/"))
                    {
                        // PATH STRING - SET UP A BASIC ENTITY USING PROVIDED STRING - SPLITTING INTO NAME AND IMAGE PATH
                        // CAN ALSO PREPEND / EG: this.AddGameObject('/player') TO PREVENT CONSTRUCTING FROM ENTITY 'PLAYER', GETTING THE IMAGE INSTEAD
                        
                        // USAGE OF / OVERIDES ANY :XXX - YOU ARE DEFINING A PATH, NOTHING ELSE
                        var path = input.includes(":") ? input.split(":")[0] : input;

                        // SET LAST ENTRY IN PATH AS NAME
                        var split = path.split("/");
                        var imagePath = split.slice(0, split.length - 1).join("/");
                        var name = split[split.length - 1];

                        unconstructedEntity = {extends: "NONE", imagePath: imagePath, texture: name, name:name, baseClass: "GameObject"}; // NONE: SINCE THIS IS JUST FOR A TEXTURE, NOT EXTENDING DEFAULT 'ANY'
                    }
                    else
                    if (input.startsWith("-"))
                    {
                        // STRING INPUT, MARKED WITH -, EG: -exlosion
                        // PREVENT A TEXTURE LOOKUP FOR THIS NAME, HANDY FOR OBJECTS THAT WILL HAVE AN ANIMATION COMPONENT
                        var name = input.substring(1);
                        unconstructedEntity = {extends: name}
                        //entity.texture = "NONE";
                    }
                    else
                    {
                        // DEFAULT - ENTITY NAME AS INPUT - CONSTRUCT IT
                        var settingsDataPrefab = SettingsHandler.FindPrefab(this.settingsData, input);
                        unconstructedEntity = settingsDataPrefab ? {extends: input} : {texture: input};
                    }
                }
                else
                {
                    // ENTITY ITSELF AS INPUT - CONSTRUCT IT - TO GET ALL DATA TO APPLY TO GAMEOBJECT BELOW
                    unconstructedEntity = input;
                }

                // register the unconstructed entity by uid before constructing, so the constructed entity carries the uid
                // GetEntityFromObject() uses it to find the source to serialize against
                if (!unconstructedEntity.constructed)
                    this.settingsHandler.RegisterUnconstructedEntity(unconstructedEntity);

                // CONSTRUCT
                entity = this.ConstructEntity(unconstructedEntity);

                // CHECK IF THE IMAGE THIS ENTITY WILL USE EXISTS, AND WARN WHEN IT DOESN'T (THE TEXTURE ISN'T CHANGED).
                // Bare.assets.images IS FILLED FROM assets.ts, IN DEV AND IN PRODUCTION. ONLY WITH stripGeneratedAssets IS IT
                // EMPTY IN PRODUCTION, SO THEN THIS IS ONLY CHECKED IN DEV
                if (Bare.assets.images.length > 0 && entity.texture && entity.texture != "NONE" && entity.texture != "placeHolder" /*&& entity.texture*/)
                {
                    var texturePath = MakePathForEntity(entity);
                    var hasEntityImage = Bare.assets.images.includes(texturePath) || assetsHandler.HasTexture(texturePath);

                    if (!hasEntityImage)
                    {
                        //entity.texture = "NONE";

                        if (entity.baseClass != "TextObject") // GETS TEXTURE FROM TEXT
                        if (__STRIP_GENERATED_ASSETS__)
                        {
                            console.warn(`Could not find an image for entity: ${entity.name}\n
"stripGeneratedAssets" is on, so the production build can't check which images exist, and will request this one and fail.\n
Give the entity an existing image, or prepend its name with - to skip the image request, eg: AddGameObject("-${entity.name}").\n
Or remove "stripGeneratedAssets": true from "bareEngine" in package.json.`);
                        }
                    }
                }

                gameObject = bare.GetObjectFromPool(entity.baseClass!, this);
                gameObject.Awake(entity);

                gameObject.Init(entity.name!);

                if (entity.texture)
                    gameObject.InitTexture(MakePathForEntity(entity));

                //if (entity.texture != "NONE")
                //    delete entity.texture; // TEXTURE HAS BEEN HANDLED ABOVE WITH Init()

                this.ApplyEntityToGameObject(entity, gameObject); // SOING THIS AFTER TEXTURE LOAD, SO % PIVOT CAN BE SET CORRECTLY
            }
        }

        // ADD
        {
            if (parent instanceof GameObject)
            {
                // ADDING TO PARENT
                var child = gameObject;
                child.parent = parent;
                parent.children.push(child);
                
                child.layer = parent.layer;
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

            if (this.started)
            {
                gameObject.Start();
                this._component?.StartAllFromObject(gameObject);
            }
        }
        
        {
            globalEvents.emit(BareEvent.game_objectAdded, { gameObject: gameObject, layer: parent });
            this.events.emit(BareEvent.game_objectAdded, { gameObject: gameObject, layer: parent });
        }

        return gameObject as T;
    }

    AddGameObjectFromImage(image: string, parent?: int | GameObject)
    {
        if (!image.startsWith("/"))
            image = "/" + image;

        return this.AddGameObject(image, parent) as GameObject;
    }

    RemoveGameObjectFromLayer(gameObject: GameObject, layer: int = -1, clear:boolean = true)
    {
        if (!gameObject.addedToScene)
        {
            // GAMEOBJECT WAS ALREADY REMOVED
            return;
        }

        var removed = false;

        // REMOVING FROM LAYER
        if (layer != -1)
        {
            removed = this.object.Remove(gameObject, layer);
        }
        else
        {
            if (!gameObject.parent)
                removed = this.object.Remove(gameObject);
        }
        
        if (!removed)
            trace("FAILED TO REMOVE GAMEOBJECT");

        this.RemoveGameObject(gameObject, clear);
    }

    RemoveGameObject(gameObject: GameObject, clear:boolean = true)
    {
        if (!gameObject.addedToScene)
        {
            // GAMEOBJECT WAS ALREADY REMOVED
            return;
        }

        if (gameObject.parent)
        {
            // REMOVING FROM PARENT
            var child = gameObject;
            var parent = gameObject.parent;
            var childIndex = parent.children.indexOf(child);

            if (childIndex != -1)
                parent.children.splice(parent.children.indexOf(child), 1);

            child.parent = null;

            parent.RefreshLifecycleHooks();

            var removed = (childIndex != -1);
            if (!removed)
                trace("FAILED TO REMOVE GAMEOBJECT");
        }
        else
        {
            // NO PARENT: THE OBJECT SITS IN A LAYER, TAKE IT OUT OF THERE OR IT KEEPS RENDERING.
            // (NO-OP WHEN CALLED VIA RemoveGameObjectFromLayer, WHICH ALREADY REMOVED IT)
            this.object.Remove(gameObject);
        }

        var wasPooled = gameObject.pooled;
        gameObject.pooled = false; // SETTING TO FALSE ALREADY HERE TO PREVENT RECURSION LOOP IN RemoveChild

        if (clear)
        {
            // NOTIFY
            // PUTTING THIS UNDER CLEAR, BIT UGLY, BUT NEEDED FOR NOW SO THAT IF A CHILD REMOVES ITSELF FROM PARENT,
            // THIS DOESN'T GET CALLED AND IN TURN REMOVE ITS COMPONENTS (ComponentController LISTENS) - TODO?
            globalEvents.emit(BareEvent.game_objectRemoved, gameObject);
            this.events.emit(BareEvent.game_objectRemoved, gameObject);

            gameObject.Removed();

            this.settingsHandler?.UnregisterUnconstructedEntity(gameObject.entity?.entityUID);

            gameObject.ResetValues();

            if (wasPooled)
            {
                const className = this.GetContructorName(gameObject);
                const pool = bare.gameObjectPools.get(className);
                const registeredClass = bare.registeredClasses[className];
                // AFTER A HOT RELOAD, AN OLD-CLASS INSTANCE MUST NOT END UP IN THE NEW CLASS'S POOL
                if (pool && (!registeredClass || gameObject.constructor === registeredClass))
                    pool.Release(gameObject);
            }
        }
        else
        {
            gameObject.pooled = wasPooled;
            gameObject.Removed();
        }
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

        this._camera?.Update(deltaTime);
    }

    FixedUpdate(fixedDeltaTime: number): void
    {
        this._object?.FixedUpdate(fixedDeltaTime);

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
            return this._camera.GetScale();
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
        return this._component?.GetAllFrom(obj) ?? [];
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
        return (this as any)[instanceName];
    }

    Has(instanceName: string): boolean
    {
        return !!(this as any)["_" + instanceName];
    }

    async Restart(full:boolean = false)
    {
        this.events.clear();
        this.Clear(full);
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
        bare.scene.Remove(this);
        return bare.scene.Add(sceneClass, payload);
    }

    async AddScene<T extends Scene>(scene: T | SceneClass<T>, payload?: AwakePayload<T>): Promise<T>
    {
        return bare.scene.Add(scene, payload);
    }

    // POINTERS
    OnPointerDown(gameObject: GameObject, callback: any):Hitbox
    {
        /* @ AddClass(HitboxController) */
        return this.hitbox?.OnPointerDown(gameObject, callback);
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

    get currentLevel(): LevelData | null | undefined
    {
        /* @ AddClass(levelHandler) */
        return this._level?.currentLevel;
    }

    async LoadLevel(levelInput: string | LevelData = ""): Promise<LevelData | undefined>
    {
        /* @ AddClass(levelHandler) */

        return await this.level?.Load(levelInput);
    }
}
