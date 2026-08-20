import { assetsHandler } from "./assetsHandler";
import { defaultSettingsData } from "../types/bareData";
import { CollisionHandlingType, Entity, LayerInfo, SettingsData } from "../types/bareTypes";
import { Helper } from "../utils/helper";
import { Scene } from "../scenes/scene";
import { Bare } from "../types/bare";
import { InspectorButton, InspectorField, Int, Label, Locked } from "../utils/decorators";
import { GameMode } from "../globals";

// SettingsHandler KEEPS TRACK OF RAW AND PROCESSED SETTINGS
// BIT CLUMSY TO HAVE THEM BOTH, BUT HAVING ONLY ONE WOULD MEAN I'D HAVE TO UNDO THE CHANGES THAT HAPPEN IN PROCESS()
// AND THAT'S EVEN MORE INCONVENIENT, ESPECIALLY WHEN MORE GETS PROCESSED IN THE FUTURE
// NOW THE ADVANTAGE WITH HAVING THEM BOTH IS THAT I CAN EASILY EDIT+SAVE THE RAW SETTINGS, THEN PROCESS AGAIN TO UPDATE THE PROCESSED SETTINGS

type ConstructEntityOptions = { fillPresets?: boolean };

export class SettingsHandler
{
    private raw: SettingsData;
    private processed: SettingsData;

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

    private ProcessSync(raw: SettingsData, options:ConstructEntityOptions, folderFiles = new Map<string, string[]>()): SettingsData
    {
        if (raw?.processed)
            throw new Error('Process() received already-processed data — caller passed Get()/settingsData instead of GetRaw()');

        // These sentinel base entities are omitted from the persisted JSON when they only
        // contain defaults. Restore them on every load/process so GetRaw() has the same
        // usable shape after an editor close/restart as it had before saving.
        raw.baseEntities ??= {};
        raw.baseEntities.ANY ??= Helper.DeepCopy(defaultSettingsData.baseEntities.ANY);
        raw.baseEntities.ANY_ENTITY ??= Helper.DeepCopy(defaultSettingsData.baseEntities.ANY_ENTITY);
        raw.baseEntities.NONE ??= Helper.DeepCopy(defaultSettingsData.baseEntities.NONE);

        var settings = this.clone(raw);

        var layerObjectsIsSetByUser = settings.layers?.includes("objects");

        // SET DEFAULTS - WILL FILL IN ANY VALUE IN settings WITH VALUES FROM defaultSettingsData THAT'S NOT PRESENT
        for (const key of Object.keys(defaultSettingsData) as (keyof SettingsData)[])
        {
            const rawValue = settings[key];
            const defaultValue = (defaultSettingsData as any)[key];

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

        // ASSIGN ENTITY NAMES BASED ON KEY
        Object.entries(settings.entities).forEach(([key, e]) => {
            e.name = key;
        });

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

        // CONSTRUCT ENTITY BASES
        if (settings.baseEntities)
        {
            // PREPARE ENTITY BASES - SETTING name AND baseEntity
            for (var baseEntityName in settings.baseEntities)
            {
                var baseEntity = settings.baseEntities[baseEntityName];
                baseEntity.name = baseEntityName; // FOR CONSTRUCT

                // ENTITY BASE - IF EXTEND DATA NOT SET, DEFAULT TO ANY BASE
                if (baseEntityName == "NONE")
                    continue;

                if (!baseEntity.entity && baseEntityName != "ANY")
                {
                    baseEntity.entity = "ANY";
                }
            }
            
            // CONSTRUCT ALL ENTITY BASES
            for (var baseEntityName in settings.baseEntities)
            {
                if (baseEntityName == "NONE")
                    continue;

                var baseEntity = settings.baseEntities[baseEntityName];

                // SET DEFAULT baseEntity - IN PREPARATION FOR CONSTRUCT
                if (!baseEntity.entity && baseEntityName != "ANY")
                {
                    baseEntity.entity = "ANY";
                }

                // CONSTRUCT BASE ENTITY - NOW IT EXTENDS SOMETHING
                this.ConstructEntity(baseEntity, settings, options);

                //delete baseEntity.name; // DON'T NEED IT ANYMORE
                
                // SET DEFAULT baseClass - IF NOT BEEN SET BY CONSTRUCT
                /*if (!baseEntity.baseClass)
                {
                    baseEntity.baseClass = "GameObject";
                }*/
            }
        }

        // PROCESS CATEGORIES
        // AFTER BASE ENTITIES CONSTRUCTION, SINCE WE CONSTRUCT ENTITIES AND NEED CONSTRUCTED BASE ENTITIES FOR IT
        // BEFORE ENTITIES CONSTRUCTION, SINCE ENTITIES CAN BE CREATED - THEY WILL LATER GET A NAME ASSIGEND TO THEM
        if (settings.categories)
        {
            // PROCES CATEGORY ENTRIES, IF PATH IS PREFIXED, REMOVE AND ADD UNDER ENTITIES DATA
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

                            // STORE ENTRY NAME IN ENTITIES DATA, TOGETHER WITH PATH WE JUST FOUND
                            settings.entities[entryName] = { name: entryName, ...settings.entities[entryName], imagePath: entryPath };
                        }
                    }
                }
            }

            // PROCESS EACH CATEGORY - HAS TO HAPPEN AFTER ENTITIES ARE CONSTRUCTED, BECAUSE this.scene.ConstructEntity()
            for (const [categoryName, categoryData] of Object.entries(settings.categories))
            {
                if (!categoryData || !categoryData.entries || categoryData.entries.length === 0) continue;

                var entitiesInCategory: Entity[] = [];

                let entryNames: string[];

                // PARSE STRING ENTRIES...
                if (typeof categoryData.entries === 'string') 
                {
                    const entries = categoryData.entries;

                    if (this.IsNumberedName(entries))
                    {
                        // ... EG: "roadTexture_1#12"
                        // CAN ALSO OMIT 1: "roadTexture_#12" (1 IS DEFAULT)
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
                        // ASSIGN BASE ENTITY TO A SINGLE, NON-GENERATED ENTRY
                        const entity = settings.entities[entries] ??= { name: entries };
                        
                        if (categoryData.entity &&
                            (!entity.entity || entity.entity === "ANY" || entity.entity === "ANY_ENTITY"))
                        {
                            entity.entity = categoryData.entity;
                        }

                        categoryData.entries = [entries];
                        entitiesInCategory.push(entity);
                    }
                }
                else
                {
                    // ENTRIES IS AN ARRAY. EG ["tile_0098", "tile_0123", ...]
                    entryNames = categoryData.entries;
                }

                if (entryNames)
                {
                    // TURN EACH NAME INTO AN ENTITY, TAKE EXISTING ONE OR CREATE NEW
                    categoryData.entries = entryNames;

                    // PUSH EACH AS ENTITY SO WE CAN FIND THEM LATER
                    for (const entryName of entryNames)
                    {
                        var unconstructedEntity = {name: entryName, entity: categoryData.entity ?? undefined};

                        if (settings.entities[entryName])
                        {
                            if (settings.entities[entryName].entity)
                                continue; // DON'T OVERWRITE EXISTING ENTRIES WHERE ENITY ALREADY SET

                            unconstructedEntity = {
                                ...unconstructedEntity,
                                ...settings.entities[entryName] // OVERWRITES ABOVE
                            }
                        }

                        const entity = this.scene.ConstructEntity(unconstructedEntity, settings, options);
                        settings.entities[entryName] = entity;

                        entitiesInCategory.push(entity);
                    }
                }
            }
        }

        // ENTITIES - CONSTRUCT THEM ALL, FOR FASTER LOOKUP LATER
        // CAN BECOME HEAVY, WILL NOT ALWAYS BE NECESSARY FOR EVERY PROCESS - CAN ADD FLAG
        if (settings.entities)
        {
            for (var entityName in settings.entities)
            {
                // ENTITY - IF EXTEND DATA NOT SET, DEFAULT TO ANY_ENTITY BASE
                if (entityName == "NONE")
                    continue;

                var entity = settings.entities[entityName];
                if (!entity.entity)
                {
                    entity.entity = "ANY_ENTITY";
                }
            }

            for (var entityName in settings.entities)
            {
                // CONSTRUCT
                var entity = settings.entities[entityName];
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
    
    // THIS CONSTRUCTS AN ENTITY BY GOING DOWN IT'S baseEntity RECURSIVELY AND ASSIGNING VALUES
    // THIS METHOD MUTATES THE entity ARGUMENT ITSELF
    ConstructEntity(entity:Entity, rawSettingsData:SettingsData, options:ConstructEntityOptions): Entity
    {
        // RECURSIVELY EXTEND DATA
        var baseEntity = entity.entity;
        while (baseEntity)
        {
            var baseEntityCur = rawSettingsData.entities[baseEntity] || rawSettingsData.baseEntities[baseEntity];

            if (!baseEntityCur)
                throw new Error(`Could not find base entity '${baseEntity}' for entity '${entity.name}'`);
            
            // INSERT MEMBERS FROM ENTITY BASE WE DIDN'T DEFINE ALREADY IN ENTITY
            for (const key of Object.keys(baseEntityCur))
            {
                if (!(key in entity))
                {
                    entity[key] = baseEntityCur[key];
                }
            }

            var components = this.scene.MergeComponents(baseEntityCur.components, entity.components);
            if (Object.keys(components).length > 0)
                entity.components = this.scene.MergeComponents(baseEntityCur.components, entity.components);

            baseEntity = baseEntityCur.entity;
        }

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

        return entity;
    }

    GetExtendedEntity(entityName: string)
    {
        var entity = {...this.raw.entities[entityName]}; // SHALLOW COPY

        var baseEntity = entity.entity || "ANY_ENTITY";
        while (baseEntity)
        {
            var baseEntityCur = this.raw.baseEntities[baseEntity] || defaultSettingsData.baseEntities[baseEntity];

            // INSERT MEMBERS FROM ENTITY BASE WE DIDN'T DEFINE ALREADY IN ENTITY
            for (const key of Object.keys(baseEntityCur))
            {
                if (!(key in entity))
                {
                    entity[key] = baseEntityCur[key];
                }
            }

            entity.components = this.scene.MergeComponents(baseEntityCur.components, entity.components);

            baseEntity = baseEntityCur.entity;
        }

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
        // UNDO DEFAULT ADDITIONS TO ANY AND ANY_ENTITY AGAIN, DON'T WANT TO SAVE THEM
        // THIS IS ALSO ADDED AT getEntityData
        //if (entityScene.objectName == "ANY" || entityScene.objectName == "ANY_ENTITY")
        //if (entityScene.isBase)

        //
        if (settingsData.baseEntities.ANY == defaultSettingsData.baseEntities.ANY)
        {
            delete settingsData.baseEntities.ANY;
        }
        else
        if (settingsData.baseEntities.ANY)
        {
            var anyKeys = Object.keys(defaultSettingsData.baseEntities.ANY);
            for (var key of anyKeys)
            {
                if (settingsData.baseEntities.ANY[key] == defaultSettingsData.baseEntities.ANY[key]) // IF SAME AS DEFAULT
                    delete settingsData.baseEntities.ANY[key];
            }

            if (Object.keys(settingsData.baseEntities.ANY).length == 0)
                delete settingsData.baseEntities.ANY;
        }

        //
        if (settingsData.baseEntities.ANY_ENTITY == defaultSettingsData.baseEntities.ANY_ENTITY)
        {
            delete settingsData.baseEntities.ANY_ENTITY;
        }
        else
        if (settingsData.baseEntities.ANY_ENTITY)
        {
            var anyEntityKeys = Object.keys(defaultSettingsData.baseEntities.ANY_ENTITY);
            for (var key of anyEntityKeys)
            {
                if (settingsData.baseEntities.ANY_ENTITY[key] == defaultSettingsData.baseEntities.ANY_ENTITY[key])
                    delete settingsData.baseEntities.ANY_ENTITY[key];
            }

            if (Object.keys(settingsData.baseEntities.ANY_ENTITY).length == 0)
                delete settingsData.baseEntities.ANY_ENTITY;
        }
        
        // SHOULD NEVER BE ANYTHING IN NONE, JUST DELETE IT
        delete settingsData.baseEntities.NONE;

        // STRIP INSPECTOR-ONLY METADATA (__fields / __buttons) THAT THE PLUGIN INJECTS FOR DISPLAY
        // (SEE AddInspectorDataToObject) AND CAN ECHO BACK INTO THE DATA WE SAVE
        this.StripInspectorMeta(settingsData);

        // EntityScene assigns temporary numeric IDs while constructing its runtime object graph.
        // They are never part of entity source data. Remove IDs that leaked from an older scene
        // instance as well, so the next plugin edit cleans existing files automatically.
        for (const entity of Object.values(settingsData.entities ?? {}))
            this.StripEntityRuntimeIds(entity);
        for (const entity of Object.values(settingsData.baseEntities ?? {}))
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
