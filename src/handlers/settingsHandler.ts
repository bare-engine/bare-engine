import { Scene } from "../scenes/scene";
import { Bare } from "../types/bare";
import { defaultSettingsData } from "../types/bareData";
import { CollisionHandlingType, Entity, LayerInfo, LevelData, SettingsData } from "../types/bareTypes";
import { InspectorField, Int } from "../utils/decorators";
import { Helper } from "../utils/helper";
import { assetsHandler } from "./assetsHandler";

// SettingsHandler KEEPS TRACK OF RAW AND PROCESSED SETTINGS
// BIT CLUMSY TO HAVE THEM BOTH, BUT HAVING ONLY ONE WOULD MEAN I'D HAVE TO UNDO THE CHANGES THAT HAPPEN IN PROCESS()
// AND THAT'S EVEN MORE INCONVENIENT, ESPECIALLY WHEN MORE GETS PROCESSED IN THE FUTURE
// NOW THE ADVANTAGE WITH HAVING THEM BOTH IS THAT I CAN EASILY EDIT+SAVE THE RAW SETTINGS, THEN PROCESS AGAIN TO UPDATE THE PROCESSED SETTINGS

type ConstructEntityOptions = { fillPresets?: boolean };

export class SettingsHandler
{
    static FindPrefab(settingsData: SettingsData, name: string): Entity | undefined
    {
        const entity = settingsData.prefabs?.find(entity => entity.name === name);
        if (entity)
            return entity;

        const basePrefab = settingsData.basePrefabs?.find(entity => entity.name === name);
        if (basePrefab)
            return basePrefab;

        return undefined;
    }

    static FindPrefabCollection(settingsData: SettingsData, name: string): Entity[] | undefined
    {
        const inPrefabs = settingsData.prefabs?.some(entity => entity.name === name);
        const inBasePrefabs = settingsData.basePrefabs?.some(entity => entity.name === name);

        if (inPrefabs && inBasePrefabs)
            throw new Error(`Prefab name '${name}' exists in both prefabs and basePrefabs`);

        return inPrefabs ? settingsData.prefabs : inBasePrefabs ? settingsData.basePrefabs : undefined;
    }

    static IsBasePrefab(settingsData: SettingsData, name: string): boolean
    {
        const collection = SettingsHandler.FindPrefabCollection(settingsData, name);
        return !!collection && collection === settingsData.basePrefabs;
    }

    static SetPrefab(settingsData: SettingsData, name: string, entity: Entity): Entity
    {
        const collection = SettingsHandler.FindPrefabCollection(settingsData, name);
        if (!collection)
            throw new Error(`Cannot update missing prefab '${name}'`);

        entity.name = name;
        collection[collection.findIndex(existing => existing.name === name)] = entity;

        return entity;
    }

    static RemovePrefab(settingsData: SettingsData, name: string): Entity | undefined
    {
        const collection = SettingsHandler.FindPrefabCollection(settingsData, name);
        if (!collection)
            return undefined;

        return collection.splice(collection.findIndex(entity => entity.name === name), 1)[0];
    }

    private raw: SettingsData;
    private processed: SettingsData;
    private categoryEntryNames = new Set<string>(); // PREFAB NAMES GENERATED FROM CATEGORY ENTRIES, SEE GetCategoryEntryNames

    public scene: Scene;

    @InspectorField
    private get gravity(): number { return this.processed?.gravity; }
    private set gravity(value: number) { this.raw.gravity = value; this.Process(); }

    @InspectorField @Int
    private get defaultAnimationFramesPerSecond(): number { return this.processed?.defaultAnimationFramesPerSecond; }
    private set defaultAnimationFramesPerSecond(value: number) { this.raw.defaultAnimationFramesPerSecond = value; this.Process(); }
    
    //@InspectorButton
    //@Label("Edit")
    //private editSettings() { /*CALL PLUGIN TO GO TO (TO BE MADE) SETTINGS DATA TAB - TODO*/ }

    public rawEntitiesMappedByUID:Record<string, Entity> = {};
    private processedEntitiesMappedByUID:Record<string, Entity> = {};

    // uids of unconstructed entities registered at runtime through RegisterUnconstructedEntity() (level entities, AddGameObject() inputs)
    // these survive Process() rebuilding rawEntitiesMappedByUID from the raw settings data
    private runtimeRegisteredEntities = new Map<string, Entity>();
    // uids generated at runtime instead of coming from the data itself: registered unconstructed entities, and settings children
    // stripped again on serialization unless referenced. static, since scenes share the raw settings data
    private static runtimeGeneratedUIDs = new Set<string>();

    constructor(scene: Scene)
    {
        this.scene = scene;
    }

    Process(raw: SettingsData = this.raw, options:ConstructEntityOptions = {}): SettingsData | Promise<SettingsData>
    {
        const folderPaths = this.GetCategoryFolderPaths(raw);
        if (folderPaths.length === 0)
            return this.ProcessSync(raw, options);

        return Promise.all(folderPaths.map(async folderPath =>
            [folderPath, await Helper.GetFilesInFolder(folderPath)] as const
        )).then(folderEntries =>
            this.ProcessSync(raw, options, new Map(folderEntries))
        );
    }

    private GetCategoryFolderPaths(raw: SettingsData): string[]
    {
        const defaultCategories = defaultSettingsData.categories ?? {};
        const rawCategories = raw?.categories ?? {};
        const categoryNames = new Set([...Object.keys(defaultCategories), ...Object.keys(rawCategories)]);
        const folderPaths = new Set<string>();

        for (const categoryName of categoryNames)
        {
            const category = {
                ...defaultCategories[categoryName],
                ...rawCategories[categoryName],
            };
            const entries = category?.entries;
            if (typeof entries !== "string")
                continue;

            const match = entries.match(/(.+)_\[(.+)\]/);
            if (match)
                folderPaths.add(`${bare.imagePath}/` + match[2]);
        }

        return [...folderPaths];
    }

    // the prefab names category entries generate - mirrors the entry parsing in ProcessSync's category step
    private GetCategoryEntryNames(raw: SettingsData, folderFiles: Map<string, string[]>): Set<string>
    {
        const defaultCategories = defaultSettingsData.categories ?? {};
        const rawCategories = raw?.categories ?? {};
        const categoryNames = new Set([...Object.keys(defaultCategories), ...Object.keys(rawCategories)]);
        const names = new Set<string>();

        for (const categoryName of categoryNames)
        {
            const entries = { ...defaultCategories[categoryName], ...rawCategories[categoryName] }.entries;
            if (!entries)
                continue;

            if (entries instanceof Array)
            {
                for (const entry of entries)
                    names.add(entry.split("/").pop()!);
                continue;
            }

            if (this.IsNumberedName(entries))
            {
                for (const name of this.ProcessNumberedNames([entries]) ?? [])
                    names.add(name);
                continue;
            }

            const match = entries.match(/(.+)_\[(.+)\]/);
            if (match)
            {
                for (const file of folderFiles.get(`${bare.imagePath}/${match[2]}`) ?? [])
                    names.add(file.split('.')[0]);
                continue;
            }

            names.add(entries);
        }

        return names;
    }

    private ProcessSync(raw: SettingsData, options:ConstructEntityOptions, folderFiles = new Map<string, string[]>()): SettingsData
    {
        if (raw?.processed)
            throw new Error('Process() received already-processed data — caller passed Get()/settingsData instead of GetRaw()');

        raw.prefabs ??= [];
        raw.basePrefabs ??= [];
        
        const seenNames = new Set<string>();
        const duplicateNames = [...raw.prefabs, ...raw.basePrefabs]
            .map(entity => entity.name)
            .filter((name): name is string => {
                if (!name)
                    throw new Error("Every prefab and basePrefab must have a name");

                if (seenNames.has(name))
                    return true;

                seenNames.add(name);
                return false;
            });
        if (duplicateNames.length > 0)
            throw new Error(`Prefab names must be unique across prefabs and basePrefabs: ${[...new Set(duplicateNames)].join(", ")}`);

        for (const defaultName of ["ANY", "NONE"])
        {
            if (raw.prefabs.some(entity => entity.name === defaultName))
                throw new Error(`Reserved base prefab name '${defaultName}' cannot be used in prefabs`);

            if (!raw.basePrefabs.some(entity => entity.name === defaultName))
            {
                const defaultPrefab = SettingsHandler.FindPrefab(defaultSettingsData, defaultName)!;
                raw.basePrefabs.push(Helper.DeepCopy(defaultPrefab));
            }
        }

        // FILLING rawEntitiesMappedByUID - SO CHILREN REFERENCING THEIR .extends TO THIS UID, CAN QUICKLY FIND IT
        const previousRawEntitiesMappedByUID = this.rawEntitiesMappedByUID;
        this.rawEntitiesMappedByUID = {};
        var fillEntityUIDS = (entities: Entity[], areChildren: boolean) =>
        {
            for (const entity of entities)
            {
                // every settings child gets a uid, so a level object's child can reference the child it overrides
                // unreferenced ones are stripped again when saving the settings data
                if (areChildren)
                    entity.entityUID ??= SettingsHandler.GenerateRuntimeUID();

                if (entity.entityUID)
                    this.rawEntitiesMappedByUID[entity.entityUID] = entity;

                if (entity.children?.length > 0)
                    fillEntityUIDS(entity.children, true);
            }
        }
        fillEntityUIDS(raw.basePrefabs, false);
        fillEntityUIDS(raw.prefabs, false);

        // category entries (eg "tile_0000#131") only become prefabs further down, on the processed copy
        // collect their names now so references to them don't count as dangling
        this.categoryEntryNames = this.GetCategoryEntryNames(raw, folderFiles);

        // settings entities themselves are kept, only their dangling children are removed
        for (const entity of [...raw.basePrefabs, ...raw.prefabs])
        {
            if (entity.children)
                entity.children = this.RemoveDanglingReferences(entity.children, entity.name, raw);
        }

        // keep the runtime registered entities that the raw settings data doesn't provide, running objects still serialize against them
        for (const [entityUID, entity] of this.runtimeRegisteredEntities)
        {
            this.rawEntitiesMappedByUID[entityUID] ??= previousRawEntitiesMappedByUID[entityUID] ?? entity;
        }

        var settings = this.clone(raw);

        var layerObjectsIsSetByUser = settings.layers?.includes("objects");

        // SET DEFAULTS - WILL FILL IN ANY VALUE IN settings WITH VALUES FROM defaultSettingsData THAT'S NOT PRESENT
        for (const key of Object.keys(defaultSettingsData) as (keyof SettingsData)[])
        {
            const rawValue = settings[key];
            const defaultValue = (defaultSettingsData as any)[key];

            if (key === "basePrefabs" || key === "prefabs")
                continue;

            if (Array.isArray(rawValue) && Array.isArray(defaultValue))
            {
                // Arrays: add missing defaults
                for (const item of defaultValue)
                {
                    if (!rawValue.includes(item))
                    {
                        if (key == "layers") // HACK FOR LAYERS, WANT default "objects" ENTRY AT START
                            rawValue.unshift(item);
                        else
                            rawValue.push(item);
                    }
                }
            }
            else
            if (typeof rawValue === 'object' && typeof defaultValue === 'object' && defaultValue)
            {
                // Objects: deep merge
                const merged = this.clone(defaultValue);
                for (const [k, v] of Object.entries(rawValue))
                {
                    const defaultObj = defaultValue[k];
                    if (typeof v === 'object' && typeof defaultObj === 'object' && !Array.isArray(v) && defaultObj)
                    {
                        // Deep merge nested objects (like presets.DEFAULT)
                        merged[k] = { ...defaultObj, ...v };
                    }
                    else
                    if (Array.isArray(v) && Array.isArray(defaultObj))
                    {
                        // Add missing default items at front
                        const missing = defaultObj.filter((d: string) => !(v as string[]).includes(d));
                        merged[k] = [...missing, ...(v as string[])];
                    }
                    else
                    {
                        merged[k] = v;
                    }
                }
                
                (settings as any)[key] = merged;
            }
            else
            if (rawValue === undefined)
            {
                // Not set, use default
                (settings as any)[key] = this.clone(defaultValue);
            }
        }

        this.ProcessAnimations(settings);

        // PROCESS saveVars - WILL FIND EXTENDED CLASSES FOR EACH AND ADD THEIR SAVE VARS
        //
        // EG:
        // "saveVars": {
        //      "GameObject": ["name", "position"],
        //      "ArcadeObject": ["mass"]
        // },
        //
        // BECOMES:
        // "saveVars": {
        //      "GameObject": ["name", "position"],
        //      "ArcadeObject": ["name", "position", "mass"] // <--
        // }
        if (settings.saveVars)
        {
            for (const [className, saveVars] of Object.entries(settings.saveVars))
            {
                if (!bare.registeredClasses[className])
                {
                    console.warn(`Class ${className} is not registered.\nAdd it in scene with: bareEngine.AddClass(${className})`);
                    continue;
                }

                var cls = bare.registeredClasses[className];
                var parentClasses = Helper.GetParentClasses(cls);

                for (var classNameParent of parentClasses)
                {
                    if (settings.saveVars[classNameParent])
                    {
                        for (var v of settings.saveVars[classNameParent])
                        {
                            if (!saveVars.includes(v))
                                saveVars.push(v);
                        }
                    }
                }
            }
        }

        // CONSTRUCT BASE PREFABS
        if (settings.basePrefabs)
        {
            // PREPARE BASE PREFABS - SETTING name AND extends
            for (const basePrefab of settings.basePrefabs)
            {
                const basePrefabName = basePrefab.name!;

                // BASE PREFAB - IF extends NOT SET, DEFAULT TO ANY
                if (basePrefabName == "NONE")
                    continue;

                if (!basePrefab.extends && basePrefabName != "ANY")
                {
                    basePrefab.extends = "ANY";
                }
            }
            
            // CONSTRUCT ALL BASE PREFABS
            for (const basePrefab of settings.basePrefabs)
            {
                const basePrefabName = basePrefab.name!;
                if (basePrefabName == "NONE")
                    continue;

                // SET DEFAULT extends - IN PREPARATION FOR CONSTRUCT
                if (!basePrefab.extends && basePrefabName != "ANY")
                {
                    basePrefab.extends = "ANY";
                }

                // CONSTRUCT BASE PREFAB - NOW IT EXTENDS SOMETHING
                this.ExtendEntity(basePrefab, settings); // MUTATES basePrefab
                this.ConstructEntity(basePrefab, settings, options);

                //delete basePrefab.name; // DON'T NEED IT ANYMORE
                
                // SET DEFAULT baseClass - IF NOT BEEN SET BY CONSTRUCT
                /*if (!basePrefab.baseClass)
                {
                    basePrefab.baseClass = "GameObject";
                }*/
            }
        }

        // PROCESS CATEGORIES
        // AFTER BASE PREFABS CONSTRUCTION, SINCE WE CONSTRUCT PREFABS AND NEED CONSTRUCTED BASE PREFABS FOR IT
        // BEFORE PREFABS CONSTRUCTION, SINCE PREFABS CAN BE CREATED - THEY WILL LATER GET A NAME ASSIGEND TO THEM
        if (settings.categories)
        {
            // PROCES CATEGORY ENTRIES, IF PATH IS PREFIXED, REMOVE AND ADD UNDER PREFABS DATA
            for (const [key, category] of Object.entries(settings.categories))
            {
                if (category.entries instanceof Array)
                {
                    for (var i = 0; i < category.entries.length; i++)
                    {
                        var entry = category.entries[i];
                    
                        if (entry.includes("/"))
                        {
                            var entryName = entry.split("/").pop()!;
                            var entryPath = entry.split("/").slice(0, -1).join("/");

                            // REDEFINE CATEGORY ENTRY TO JUST IT'S NAME
                            (category.entries as string[])[i] = entryName;

                            // STORE ENTRY NAME IN PREFABS DATA, TOGETHER WITH PATH WE JUST FOUND
                            const existingPrefab = SettingsHandler.FindPrefab(settings, entryName);
                            if (existingPrefab)
                                SettingsHandler.SetPrefab(settings, entryName, { ...existingPrefab, imagePath: entryPath });
                            else
                                settings.prefabs.push({ name: entryName, imagePath: entryPath });
                        }
                    }
                }
            }

            // PROCESS EACH CATEGORY - HAS TO HAPPEN AFTER PREFABS ARE CONSTRUCTED, BECAUSE this.scene.ConstructEntity()
            for (const [categoryName, categoryData] of Object.entries(settings.categories))
            {
                if (!categoryData || !categoryData.entries || categoryData.entries.length === 0) continue;

                var prefabsInCategory: Entity[] = [];

                let entryNames: string[];
                let generatedEntryPrefabName: string;

                // PARSE STRING ENTRIES...
                if (typeof categoryData.entries === 'string') 
                {
                    const entries = categoryData.entries;

                    if (this.IsNumberedName(entries))
                    {
                        // ... EG: "roadTexture_1#12"
                        // CAN ALSO OMIT 1: "roadTexture_#12" (1 IS DEFAULT)
                        const numberedPrefabName = this.GetNumberedNameBaseName(entries);
                        if (SettingsHandler.FindPrefab(settings, numberedPrefabName))
                            generatedEntryPrefabName = numberedPrefabName;
                        entryNames = this.ProcessNumberedNames([entries]) ?? [];
                    }
                    
                    if (!entryNames)
                    {
                        // ... EG: "level_[editorImages]"
                        // WILL FIND ALL FILES UNDER editorImages AND CREATE level_... ENTRIES OUT OF THEM
                        const match = entries.match(/(.+)_\[(.+)\]/);
                        if (match)
                        {
                            const prefix = match[1]; // EG "level"
                            const imagePath = match[2]; // EG "editorImages"

                            entryNames = (folderFiles.get(`${bare.imagePath}/${imagePath}`) ?? [])
                                .map(file => file.split('.')[0]);
                        }
                    }

                    if (!entryNames)
                    {
                        // ASSIGN CATEGORY extends TO A SINGLE, NON-GENERATED ENTRY
                        let entity = SettingsHandler.FindPrefab(settings, entries);
                        if (!entity)
                        {
                            entity = { name: entries };
                            settings.prefabs.push(entity);
                        }
                        
                        if (categoryData.extends && (!entity.extends || entity.extends === "ANY"))
                        {
                            entity.extends = categoryData.extends;
                        }

                        categoryData.entries = [entries];
                        prefabsInCategory.push(entity);
                    }
                }
                else
                {
                    // ENTRIES IS AN ARRAY. EG ["tile_0098", "tile_0123", ...]
                    entryNames = categoryData.entries;
                }

                if (entryNames)
                {
                    // TURN EACH NAME INTO A PREFAB, TAKE EXISTING ONE OR CREATE NEW
                    categoryData.entries = entryNames;

                    // PUSH EACH AS PREFAB SO WE CAN FIND THEM LATER
                    for (const entryName of entryNames)
                    {
                        var unconstructedEntity = {
                            name: entryName,
                            extends: categoryData.extends ?? generatedEntryPrefabName
                        };

                        const existingPrefab = SettingsHandler.FindPrefab(settings, entryName);
                        if (existingPrefab)
                        {
                            if (existingPrefab.extends)
                                continue; // DON'T OVERWRITE EXISTING ENTRIES WHERE ENITY ALREADY SET

                            unconstructedEntity = {
                                ...unconstructedEntity,
                                ...existingPrefab // OVERWRITES ABOVE
                            }
                        }

                        //const entity = this.scene.ConstructEntity(unconstructedEntity, settings, options);
                        let entity: Entity;
                        if (existingPrefab)
                            entity = SettingsHandler.SetPrefab(settings, entryName, unconstructedEntity);
                        else
                        {
                            entity = unconstructedEntity;
                            settings.prefabs.push(entity);
                        }

                        prefabsInCategory.push(entity);
                    }
                }
            }
        }

        // PREFABS - CONSTRUCT THEM ALL, FOR FASTER LOOKUP LATER
        // CAN BECOME HEAVY, WILL NOT ALWAYS BE NECESSARY FOR EVERY PROCESS - CAN ADD FLAG
        if (settings.prefabs)
        {
            for (const entity of settings.prefabs)
            {
                const entityName = entity.name!;

                // PREFAB - IF extends NOT SET, DEFAULT TO ANY
                if (entityName == "NONE")
                    continue;
                if (!entity.extends)
                {
                    entity.extends = "ANY";
                }
            }

            for (const entity of settings.prefabs)
            {
                const entityName = entity.name!;
                // CONSTRUCT
                this.ExtendEntity(entity, settings); // MUTATES entity - THIS ALSO EXTENDS INTO BASE PREFABS, WHICH ARE ALREADY EXTENDED+CONSTRUCTED - OPTMIZE
                this.ConstructEntity(entity, settings, options);

                // SET ENTITY WITH ANIMATION TO TEXTURE NONE
                // SINCE ITS NAME IS NOT USED FOR TEXTURE LOOKUP, BUT FOR ANIMATION LOOKUP
                if (!entity.texture)
                {
                    var componentKeys = Object.keys(entity.components || {});
                    if (componentKeys.includes("animation") && !Bare.assets.images.includes(entityName))
                    {
                        entity.texture = "NONE";

                        // IF ENTITY HAS ANIMATION, TAKE FIRST FRAME AS TEXTURE
                        // IF ENTITY HAS imagePath, AND animationData SHARES IT, COULD REMOVE THAT. NOT SURE IF NEEDED - TODO?
                        var anims = Bare.data.animations;
                        if (anims.includes(entityName))
                        {
                            var animationData = assetsHandler.GetAnimation(entityName);
                            entity.texture = animationData.frames[0];
                        }
                        else
                        {
                            var firstMatchingAnimName = anims.find(x => x.startsWith(entityName + "_"));
                            if (firstMatchingAnimName)
                            {
                                var animationData = assetsHandler.GetAnimation(firstMatchingAnimName);
                                entity.texture = animationData.frames[0];
                            }
                        }
                    }
                }
            }
        }

        // PROCESS LAYER INFO - ADDS DEFAULTS
        {
            var anyCollidesWithSetByUser = false;

            // SET DEFAULTS
            for (var j = 0; j < settings.layers.length; j++)
            {
                const layerName = settings.layers[j];
                const currentLayerInfo = settings.layersInfo[layerName] ?? {};

                const newLayerInfo:LayerInfo = {
                    name: layerName,
                    layerI: j,
                    showInEditor: true,
                    save: true,
                    pointerCollisionType: CollisionHandlingType.POINT,
                    
                    ...currentLayerInfo // OVERRIDES ABOVE
                };

                settings.layersInfo[layerName] = newLayerInfo;

                if (currentLayerInfo.collidesWith)
                    anyCollidesWithSetByUser = true;
            }

            // IF OBJECTS LAYER WAS NOT SET AND NO COLLIDES-WITH, DEFAULT TO OBJECTS <-> OBJECTS COLLISION
            if (!layerObjectsIsSetByUser && !anyCollidesWithSetByUser)
            {
                settings.layersInfo["objects"].collidesWith = ["objects"];
            }
        }

        settings.processed = true;

        // STORE REFERENCES
        this.raw = raw;
        this.processed = settings;

        return settings;
    }

    ProcessAnimations(settings = this.raw)
    {
        // ADD THEM AND LOAD THEIR TEXTURES IF THEY'RE NOT IN ALREADY
        if (settings.animations)
        {
            for (const [animName, animDataInfo] of Object.entries(settings.animations))
            {
                var existingAnimation = assetsHandler.GetAnimation(animName);

                // TAKE PROVIDED VALUES OR FALLBACK TO DEFAULTS
                var animationFrames = this.ProcessNumberedNames(animDataInfo.frames, animDataInfo.imagePath ?? "") ?? existingAnimation?.frames; // FALLBACK TO ANIMATION FRAMES SET BEFORE IN JSON
                var framesPerSecond = (animDataInfo.framesPerSecond ?? defaultSettingsData.defaultAnimationFramesPerSecond);
                var loop = animDataInfo.loop;
                var removeOnComplete = animDataInfo.removeOnComplete ?? false;
                
                // WILL ALSO OVERRIDE PREVIOUSLY SET ANIMATION IN JSON FROM 'initial' FOLDER
                assetsHandler.AddAnimation(animName, animationFrames, framesPerSecond, loop, removeOnComplete);
            }
        }
    }

    // FIND IF # OR + ARE PRESENT, ADDS THE NUMBERED NAMES
    // EG: "player_walk1#3"       -> ["player_walk1", "player_walk2", "player_walk3"]
    // EG: "player_walk#3"        -> ["player_walk1", "player_walk2", "player_walk3"]
    // EG: "player_walk1_00#03"    -> ["player_walk1_00", "player_walk1_01", "player_walk1_02", "player_walk1_03"]
    // EG: "player_walk1#2+4+6#8" -> ["player_walk1", "player_walk2", "player_walk4", "player_walk6", "player_walk7", "player_walk8"]
    // ALSO, WHEN imagePath IS SET, IT'S ADDED BEFORE EVERY NAME
    private ProcessNumberedNames(names?: string[], imagePath: string = ""): string[] | null
    {
        if (!names)
            return null;

        if (imagePath)
            imagePath += "/";

        const processedNames: string[] = [];
        for (const name of names)
        {
            const match = this.IsNumberedName(name) ? name.match(/^(.+?)(\d*#\d+.*)$/) : null;
            if (match)
            {
                const base = imagePath + match[1];
                const segments = match[2].split('+');
                for (const segment of segments)
                {
                    const shorthandRangeMatch = segment.match(/^#(\d+)$/);
                    if (shorthandRangeMatch)
                    {
                        const endText = shorthandRangeMatch[1];
                        const end = parseInt(endText);
                        const paddingLength = endText.startsWith("0") ? endText.length : 0;
                        for (let i = 1; i <= end; i++)
                            processedNames.push(base + i.toString().padStart(paddingLength, "0"));
                        continue;
                    }

                    const rangeMatch = segment.match(/^(\d+)#(\d+)$/);
                    if (rangeMatch)
                    {
                        const startText = rangeMatch[1];
                        const endText = rangeMatch[2];
                        const start = parseInt(startText);
                        const end = parseInt(endText);
                        const paddingLength = startText.startsWith("0") ? startText.length : 0;
                        for (let i = start; i <= end; i++)
                            processedNames.push(base + i.toString().padStart(paddingLength, "0"));
                    }
                    else
                    {
                        processedNames.push(base + segment);
                    }
                }
            }
            else
            {
                processedNames.push(imagePath + name);
            }
        }
        return processedNames;
    }

    private IsNumberedName(name: string): boolean
    {
        return name.includes('#');
    }

    private GetNumberedNameBaseName(name: string): string
    {
        const match = this.IsNumberedName(name) ? name.match(/^(.+?)(\d*#\d+.*)$/) : null;
        return match ? match[1] + "#" : name;
    }

    // EXTENDS AN ENTITY WITH EVERY PREFAB IN ITS extends CHAIN.
    // THE ENTITY ARGUMENT IS MUTATED AND ITS EXISTING VALUES TAKE PRECEDENCE.
    ExtendEntity(entity: Entity, rawSettingsData: SettingsData = this.raw, options: { includeChildren?: boolean, recurseChildren?: boolean, childDefaultExtends?: string } = {}): Entity
    {
        var includeChildren = options.includeChildren !== false;
        var recurseChildren = options.recurseChildren ?? includeChildren;

        var i = 0;
        
        var entityName = entity.extends || "ANY";
        while (entityName)
        {
            var extendedPrefab = this.GetRawPrefab(entityName, rawSettingsData);

            if (!extendedPrefab)
            {
                throw new Error(`Could not find prefab '${entityName}' extended by '${entity.name}'`);
            }

            // INSERT MEMBERS FROM THE BASE THAT THE ENTITY DIDN'T DEFINE ITSELF
            // name is never inherited, it's derived when the entity is constructed
            for (const key of Object.keys(extendedPrefab))
            {
                if (key == "extends" || key == "components" || key == "children" || key == "entityUID" || key == "name")
                    continue;

                // IGNORE componentsRemoved, childrenRemoved AND propertiesRemoved? TODO

                if (!(key in entity))
                    entity[key] = extendedPrefab[key];
            }

            var components = this.scene.MergeComponents(extendedPrefab.components, entity.components);
            if (Object.keys(components).length > 0)
                entity.components = components;

            if (includeChildren)
            {
                var children = this.scene.MergeChildren(extendedPrefab.children ?? [], entity.children);
                if (Object.keys(children).length > 0)
                    entity.children = children;
            }

            // a base without an explicit extends still extends ANY (same default Process() applies),
            var isChainEnd = entityName == "ANY" || entityName == "NONE";
            entityName = extendedPrefab.extends ?? (isChainEnd ? undefined : "ANY");

            i++
            if (i > 1000)
            {
                throw new Error(`Infinite loop while extending entity '${entity.name}'`);
            }
        }

        if (recurseChildren)
        {
            for (var child of entity.children ?? [])
            {
                this.ExtendEntity(child, rawSettingsData, options);
            }
        }


        return entity;
    }

    // RESOLVE INHERITANCE FOR AN ENTITY AND EVERY CHILD WITHOUT APPLYING
    // FULL-CONSTRUCTION POLICIES SUCH AS PRESETS OR REMOVALS.
    ExtendEntityTree(entity: Entity, rawSettingsData: SettingsData = this.raw): Entity
    {
        // Merge this node's inherited children without recursively processing them here. The loop
        // below then processes every resulting child exactly once.
        this.ExtendEntity(entity, rawSettingsData, { recurseChildren: false });

        for (const child of entity.children ?? [])
            this.ExtendEntityTree(child, rawSettingsData);

        return entity;
    }
    
    // THIS CONSTRUCTS AN ENTITY BY GOING DOWN IT'S extends CHAIN RECURSIVELY AND ASSIGNING VALUES
    // AND FOR EACH .EXTENDS FIELD CONSTRUCTING IT INTO THE ENTITY, EG ADDING ITS CHIDLREN/COMPONENTS.
    // THESE ENTITY CHILDREN REFERENCE THEIR ROOT ENTITY PARENT UID, SO LATER DURING SERIALIZATION, THEY CAN ONLY SAVE THEIR DIFFERENCE.
    // THIS METHOD MUTATES THE entity ARGUMENT ITSELF
    ConstructEntity(entity:Entity, rawSettingsData:SettingsData, options:ConstructEntityOptions): Entity
    {
        // CONSTRUCT ALL CHILDREN
        // (MOSTLY THE SAME AS SCENE ConstructEntity(), COULD GENERALIZE SOME PARTS)
        if (entity.children)
        {
            for (var i = 0; i < entity.children.length; i++)
            {
                var child = entity.children[i];
                this.ConstructEntity(child, rawSettingsData, options);
            }
        }

        // ANYTHING WITH A HITBOX IS A PHYSICS OBJECT
        //if ((entity.hitbox || entity.hitboxRadius) && entity.baseClass == "GameObject") 
        //    entity.baseClass = "ArcadeObject";

        // FILL PRESETS - LIKE hitbox: "FULL"                
        //                     hitbox: {x1: 0, y1: 0, x2: 1, y2: 1}
        if (options.fillPresets !== false)
            this.FillPresets(entity, rawSettingsData);

        // REMOVE PROPERTIES SPECIFICALLY LISTED TO REMOVE IN ENTITY
        if (entity.propertiesRemoved)
        {
            for (const propertyName of entity.propertiesRemoved)
            {
                delete entity[propertyName];
            }
        }

        // REMOVE COMPONENTS SPECIFICALLY LISTED IN ENTITY
        if (entity.components && entity.componentsRemoved)
        {
            for (const componentName of entity.componentsRemoved)
            {
                delete entity.components[componentName];
            }
        }

        if (entity.entityUID)
            this.processedEntitiesMappedByUID[entity.entityUID] = entity;

        if (!entity.baseClass)
            entity.baseClass = "GameObject";

        entity.constructed = true;

        return entity;
    }

    GetExtendedPrefab(entityName: string)
    {
        var entity = Helper.DeepCopy(this.GetRawPrefab(entityName));

        this.ExtendEntityTree(entity, this.raw);

        return entity;
    }

    // IF ANY VALUE OF record IS A STRING, IF IT MATCHES WITH A PRESET, REPLACE IT
    // RECURSIVELY GOES DOWN THE record
    FillPresets(record: Record<string, any>, rawSettingsData: SettingsData, presetProcessCallback?: (parentRecord: Record<string, any>, keyWithPreset: string, presetName: string) => void)
    {
        var presets = {
            ...(defaultSettingsData.presets ?? {}),
            ...(rawSettingsData.presets ?? {})
        };

        if (!presets)
            return;

        for (const key in record)
        {
            var propName = key;
            var value = record[propName];

            if (propName.startsWith("__"))
                continue;

            if (typeof value === "object")
            {
                // IF VALUE IS OBJECT, RECURSE
                this.FillPresets(value, rawSettingsData, presetProcessCallback);
            }
            else
            if (typeof value === "string")
            {
                const preset = presets[value];
                if (preset !== undefined)
                {
                    var fillFieldWithPreset = (presetValue) =>
                    {
                        record[propName] = presetValue;
                        presetProcessCallback?.(record, propName, value);
                        
                        // ALSO LOOK FOR PRESETS IN THE NEWLY SET VALUE
                        if (typeof presetValue === "object")
                            this.FillPresets(presetValue, rawSettingsData, presetProcessCallback);
                    }
                    
                    if (preset.ANY)
                    {
                        // PRESET IS SET TO REPLACE ANYTHING, SET THE ENTITY FIELD VALUE TO THE PRESET
                        fillFieldWithPreset(preset.ANY);
                        continue;
                    }

                    const presetValue = preset[propName];
                    if (presetValue)
                    {
                        // PRESET MATCHES SPECIFIC FIELD, SET THE ENTITY FIELD VALUE TO THE PRESET
                        fillFieldWithPreset(presetValue);
                    }
                }
            }
        }
    }

    Get(): SettingsData
    {
        return this.processed;
    }

    GetRaw(): SettingsData
    {
        return this.raw;
    }

    SetRaw(raw: SettingsData): void
    {
        if (raw?.processed)
            throw new Error('SetRaw() received already-processed data — caller passed Get()/settingsData instead of GetRaw()');

        this.raw = raw;

        // PROCESS NOW?? TODO
    }

    async UpdateRaw(mutator: (raw: SettingsData) => void | Promise<void>, options: ConstructEntityOptions = {}): Promise<SettingsData>
    {
        const raw = this.GetRaw();

        // RUN THE SUPPLIED LAMBDA THAT MODIFIES THE RAW DATA
        await mutator(raw);

        // REPROCESS THE FRESH RAW DATA
        // 
        // KINDA ANNOYING THAT THIS MAKES IT ASYNC (ABOVE AWAIT IT OPTIONAL)
        // BUT NEEDED FOR WHEN YOU WOULD WANT TO Get() THE PROCESSED DATA RIGHT AFTER.
        // HAVEN'T HAD A NEED FOR THIS SO FAR, BUT PLAYING IT SAFE FOR NOW
        await this.Process(raw, options);
    
        return raw;
    }

    GetRawPrefab(entityNameOrId: string, rawSettingsData: SettingsData = this.raw, rawChildEntities: Entity[] = []): Entity
    {
        // QUICK WAY TO FIND LINKED ENTITY UID IF RAW DATA IS GIVEN
        if (rawChildEntities.length > 0)
        {
            for (const entity of rawChildEntities)
            {
                if (entity.entityUID == entityNameOrId)
                    return entity;
            }
        }

        return SettingsHandler.FindPrefab(rawSettingsData, entityNameOrId)
            || this.rawEntitiesMappedByUID[entityNameOrId]
            || SettingsHandler.FindPrefab(defaultSettingsData, entityNameOrId)!;
    }

    GetRawEntitiesMappedByUID(): Readonly<Record<string, Entity>>
    {
        return this.rawEntitiesMappedByUID;
    }

    // makes an unconstructed entity (level entity, AddGameObject() input) findable by uid, so GetEntityFromObject() can serialize against it
    // an entity that already has a uid present in the map (eg the prefab editor's copy of a raw prefab) keeps pointing at the raw entity
    RegisterUnconstructedEntity(entity: Entity): void
    {
        entity.entityUID ??= SettingsHandler.GenerateRuntimeUID();

        this.rawEntitiesMappedByUID[entity.entityUID] ??= entity;
        this.runtimeRegisteredEntities.set(entity.entityUID, entity);
    }

    UnregisterUnconstructedEntity(entityUID: string | undefined): void
    {
        if (!entityUID)
            return;

        const registeredEntity = this.runtimeRegisteredEntities.get(entityUID);
        if (!registeredEntity)
            return;

        this.runtimeRegisteredEntities.delete(entityUID);
        SettingsHandler.runtimeGeneratedUIDs.delete(entityUID);

        // a raw settings entity sharing the uid stays in the map, only remove what was registered here
        if (this.rawEntitiesMappedByUID[entityUID] === registeredEntity)
            delete this.rawEntitiesMappedByUID[entityUID];
    }

    // the unconstructed entity a constructed entity was made from: a raw settings entity/child, or one registered at runtime
    // a child that only references its source through .extends (no entityUID of its own) resolves to nothing, it serializes as that reference plus its diff
    GetUnconstructedEntity(entity: Entity | null | undefined): Entity | undefined
    {
        const entityUID = entity?.entityUID;
        return entityUID ? this.rawEntitiesMappedByUID[entityUID] : undefined;
    }

    // removes entities whose .extends no longer exists, a removed prefab (name) or a removed settings child (uid)
    // runs before construction, which would fail on the missing prefab. returns the kept entities, children are filtered in place
    RemoveDanglingReferences(entities: Entity[], ownerName: string = "", raw: SettingsData = this.raw): Entity[]
    {
        return entities.filter(entity =>
        {
            const reference = entity.extends;
            const isDangling = typeof reference === "string" && !this.rawEntitiesMappedByUID[reference]
                && !SettingsHandler.FindPrefab(raw, reference) && !SettingsHandler.FindPrefab(defaultSettingsData, reference)
                && !this.categoryEntryNames.has(reference);

            if (isDangling)
            {
                console.warn(`Removed ${entity.name ?? "entity"}${ownerName ? ` in '${ownerName}'` : ""}, it references '${reference}' which no longer exists`);
                return false;
            }

            if (entity.children)
                entity.children = this.RemoveDanglingReferences(entity.children, entity.name ?? reference, raw);

            return true;
        });
    }

    static GenerateRuntimeUID(): string
    {
        const entityUID = Helper.GenerateEntityUID();
        SettingsHandler.runtimeGeneratedUIDs.add(entityUID);
        return entityUID;
    }

    IsRuntimeGeneratedUID(entityUID: string | undefined): boolean
    {
        return !!entityUID && SettingsHandler.runtimeGeneratedUIDs.has(entityUID);
    }

    // runtime uids of settings children that the serialized level references become permanent
    // returns whether there were any, the settings data then needs saving too
    static PersistUIDsReferencedBy(level: LevelData): boolean
    {
        const levelJson = JSON.stringify(level);
        var persisted = false;
        for (const entityUID of SettingsHandler.runtimeGeneratedUIDs)
        {
            if (levelJson.includes(entityUID))
            {
                SettingsHandler.runtimeGeneratedUIDs.delete(entityUID);
                persisted = true;
            }
        }

        return persisted;
    }

    GetProcessedPrefab(entityNameOrId: string, processedSettingsData: SettingsData = this.processed): Entity
    {        
        return SettingsHandler.FindPrefab(processedSettingsData, entityNameOrId)
            || this.processedEntitiesMappedByUID[entityNameOrId]
            || SettingsHandler.FindPrefab(defaultSettingsData, entityNameOrId)!;
        
        // return SettingsHandler.FindPrefab(processedSettingsData, entityNameOrId) || SettingsHandler.FindPrefab(defaultSettingsData, entityNameOrId)!;
    }

    SnapshotCurrent(): SettingsData
    {
        return Helper.DeepCopy(this.raw);
    }

    private clone<T>(data: T): T
    {
        return Helper.DeepCopy(data);
    }

    FilterSettingsDataDefaults(settingsData: SettingsData)
    {
        settingsData.basePrefabs ??= [];
        settingsData.prefabs ??= [];

        const defaultAny = SettingsHandler.FindPrefab(defaultSettingsData, "ANY")!;
        const any = SettingsHandler.FindPrefab(settingsData, "ANY");

        //
        if (any == defaultAny)
        {
            SettingsHandler.RemovePrefab(settingsData, "ANY");
        }
        else
        if (any)
        {
            var anyKeys = Object.keys(defaultAny) as (keyof Entity)[];
            for (var key of anyKeys)
            {
                if (key !== "name" && any[key] == defaultAny[key]) // IF SAME AS DEFAULT
                    delete any[key];
            }

            if (Object.keys(any).length == 1)
                SettingsHandler.RemovePrefab(settingsData, "ANY");
        }
        
        // SHOULD NEVER BE ANYTHING IN NONE, JUST DELETE IT
        SettingsHandler.RemovePrefab(settingsData, "NONE");

        // STRIP INSPECTOR-ONLY METADATA (__fields / __buttons) THAT THE PLUGIN INJECTS FOR DISPLAY
        // (SEE AddInspectorDataToObject) AND CAN ECHO BACK INTO THE DATA WE SAVE
        this.StripInspectorMeta(settingsData);

        // PrefabScene assigns temporary numeric IDs while constructing its runtime object graph.
        // They are never part of entity source data. Remove IDs that leaked from an older scene
        // instance as well, so the next plugin edit cleans existing files automatically.
        for (const entity of settingsData.prefabs)
            this.StripEntityRuntimeIds(entity);
        for (const entity of settingsData.basePrefabs)
            this.StripEntityRuntimeIds(entity);
    }

    // RECURSIVELY REMOVE INSPECTOR-DISPLAY KEYS SO THEY NEVER GET PERSISTED INTO settingsData
    StripInspectorMeta(value: any)
    {
        if (Array.isArray(value))
        {
            for (var item of value)
                this.StripInspectorMeta(item);
        }
        else if (value && typeof value === "object")
        {
            delete value.__fields;
            delete value.__buttons;
            for (var key in value)
                this.StripInspectorMeta(value[key]);
        }
    }

    private StripEntityRuntimeIds(entity: any)
    {
        if (!entity || typeof entity !== "object")
            return;

        delete entity.id;

        if (Array.isArray(entity.children))
        {
            for (const child of entity.children)
                this.StripEntityRuntimeIds(child);
        }
    }
}
