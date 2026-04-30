import { assetsHandler } from "./assetsHandler";
import { defaultSettingsData } from "../types/bareData";
import { Entity, SettingsData } from "../types/bareTypes";
import { Helper } from "../utils/helper";
import { Scene } from "../scenes/scene";

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

    constructor(scene: Scene)
    {
        this.scene = scene;
    }

    async Process(raw: SettingsData = this.raw, options:ConstructEntityOptions = {}): Promise<SettingsData>
    {
        var settings = this.clone(raw);

        // SET DEFAULTS - WILL FILL IN ANY VALUE IN settings WITH VALUES FROM defaultEntityData THAT'S NOT PRESENT
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
                (settings as any)[key] = defaultValue;
            }
        }

        // ASSIGN ENTITY NAMES BASED ON KEY
        Object.entries(settings.entities).forEach(([key, e]) => {
            e.name = key;
        });

        this.ProcessAnimations(settings);

        // CATEGORIES FIRST, SINCE ENTITIES CAN BE CREATED - THEY WILL LATER GET A NAME ASSIGEND TO THEM
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

                // PARSE STRING ENTRIES, EG: "roadTexture_1#12" 
                if (typeof categoryData.entries === 'string') 
                {
                    if (typeof categoryData.entries === 'string' && categoryData.entries.indexOf('#') != -1)
                    {
                        const entityBaseName = this.GetNumberedNameBaseName(categoryData.entries);
                        const entity = this.scene.ConstructEntity(entityBaseName, settings, options);
                        const entryNames = this.ProcessNumberedNames([categoryData.entries]) ?? [];

                        categoryData.entries = entryNames;
                        for (const entryName of entryNames)
                        {
                            // ALSO PUSH EACH AS ENTITY SO WE CAN FIND THEM LATER
                            const entityClone = {...entity, name: entryName};
                            if (!settings.entities[entryName]) // DON'T OVERWRITE EXISTING ENTRIES
                                settings.entities[entryName] = entityClone;
                        }
                    }

                    if (typeof categoryData.entries === 'string')
                    {
                        const regex = /(.+)_\[(.+)\]/; // eg "level_[editorImages]"
                        const match = categoryData.entries.match(regex);
                        if (match)
                        {
                            const prefix = match[1]; // eg "level"
                            const imagePath = match[2]; // eg "editorImages"

                            var entityBaseName = prefix + "_*";
                            var entity = this.scene.ConstructEntity(entityBaseName, settings, options);
                            var files = await Helper.GetFilesInFolder(`${bareEngine.imagePath}/` + imagePath);

                            // TURN ENTRIES INTO ARRAY
                            categoryData.entries = [];
                            for (var j = 0; j < files.length; j++)
                            {
                                var fileName = files[j].split('.')[0];
                                categoryData.entries.push(fileName);

                                // ALSO PUSH EACH AS ENTITY SO WE CAN FIND THEM LATER
                                var entityClone = {...entity};
                                if (!settings.entities[entityClone.name]) // DON'T OVERWRITE EXISTING ENTRIES
                                    settings.entities[entityClone.name] = entityClone;
                            }
                        }
                    }
                }
            }
        }

        // PROCESS saveVars - WILL FIND EXTENDED CLASSES FOR EACH AND ADD THEIR SAVE VARS
        //
        // EG:
        // "saveVars": {
        //      "GameObject": ["name", "position"],
        //      "PhysicsObjectBare": ["mass"]
        // },
        //
        // BECOMES:
        // "saveVars": {
        //      "GameObject": ["name", "position"],
        //      "PhysicsObjectBare": ["name", "position", "mass"] // <--
        // }
        if (settings.saveVars)
        {
            for (const [className, saveVars] of Object.entries(settings.saveVars))
            {
                if (!Scene.registeredClasses[className])
                {
                    console.warn(`Class ${className} is not registered.\nAdd it in scene with: this.AddClass(${className})`);
                    continue;
                }

                var cls = Scene.registeredClasses[className];
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

        // ENTITIES - CONSTRUCT THEM ALL, FOR FASTER LOOKUP LATER
        // CAN BECOME HEAVY, WILL NOT ALWAYS BE NECESSARY - CAN ADD FLAG
        if (settings.entities)
        {
            for (var entityBaseName in settings.baseEntities)
            {
                var entityBase = settings.baseEntities[entityBaseName];
                entityBase.name = entityBaseName; // FOR CONSTRUCT

                // ENTITY BASE - IF EXTEND DATA NOT SET, DEFAULT TO ANY BASE
                if (entityBaseName == "NONE")
                    continue;

                if (!entityBase.baseEntity && entityBaseName != "ANY")
                {
                    entityBase.baseEntity = "ANY";
                }
            }

            for (var entityName in settings.entities)
            {
                // ENTITY - IF EXTEND DATA NOT SET, DEFAULT TO ANY_ENTITY BASE
                if (entityName == "NONE")
                    continue;

                var entity = settings.entities[entityName];
                if (!entity.baseEntity)
                {
                    entity.baseEntity = "ANY_ENTITY";
                }
            }

            /*if (globalThis.plugin)
            {
                globalThis.plugin.ProcessSettingsData(settings);
            }*/

            // CONSTRUCT ALL ENTITY BASES
            for (var entityBaseName in settings.baseEntities)
            {
                if (entityBaseName == "NONE")
                    continue;

                var entityBase = settings.baseEntities[entityBaseName];

                // SET DEFAULT baseEntity - IN PREPARATION FOR CONSTRUCT
                if (!entityBase.baseEntity && entityBaseName != "ANY")
                {
                    entityBase.baseEntity = "ANY";
                }

                // CONSTRUCT BASE ENTITY - NOW IT EXTENDS SOMETHING
                this.ConstructEntity(entityBase, settings, options);

                //delete entityBase.name; // DON'T NEED IT ANYMORE
                
                // SET DEFAULT extendClass - IF NOT BEEN SET BY CONSTRUCT
                if (!entityBase.extendClass)
                {
                    entityBase.extendClass = "GameObject";
                }
            }

            // CONSTRUCT ALL ENTITIES
            for (var entityName in settings.entities)
            {
                var entity = settings.entities[entityName];
                this.ConstructEntity(entity, settings, options);
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
                
                // WILL ALSO OVERRIDE PREVIOUSLY SET ANIMATION IN JSON FROM 'initial' FOLDER
                assetsHandler.AddAnimation(animName, animationFrames, framesPerSecond, loop);
            }
        }
    }

    // FIND IF # OR + ARE PRESENT, ADDS THE NUMBERED NAMES
    // EG: "player_walk1#3"       -> ["player_walk1", "player_walk2", "player_walk3"]
    // EG: "player_walk1_00#03"    -> ["player_walk1_00", "player_walk1_01", "player_walk1_02", "player_walk1_03"]
    // EG: "player_walk1#2+4+6#8" -> ["player_walk1", "player_walk2", "player_walk4", "player_walk6", "player_walk7", "player_walk8"]
    // ALSO, WHEN imagePath IS SET, ADDS IT BEFORE EVERY NAME
    private ProcessNumberedNames(names?: string[], imagePath: string = ""): string[] | null
    {
        if (!names)
            return null;

        if (imagePath)
            imagePath += "/";

        const processedNames: string[] = [];
        for (const name of names)
        {
            const match = name.includes('#') ? name.match(/^(.+?)(\d+.*)$/) : null;
            if (match)
            {
                const base = imagePath + match[1];
                const segments = match[2].split('+');
                for (const segment of segments)
                {
                    const rangeMatch = segment.match(/^(\d+)#(\d+)$/);
                    if (rangeMatch)
                    {
                        const startText = rangeMatch[1];
                        const endText = rangeMatch[2];
                        const start = parseInt(startText);
                        const end = parseInt(endText);
                        const paddingLength = Math.max(startText.length, endText.length);
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

    private GetNumberedNameBaseName(name: string): string
    {
        const match = name.includes('#') ? name.match(/^(.+?)(\d+.*)$/) : null;
        return match ? match[1] + "#" : name;
    }
    
    // THIS MUTATES THE entity ITSELF
    // GOING DOWN IT'S constructData RECURSIVELY AND ASSIGNING VALUES
    ConstructEntity(entity:Entity, rawSettingsData:SettingsData, options:ConstructEntityOptions): Entity
    {
        // (MOSTLY THE SAME AS SCENE Construct(), COULD GENERALIZE SOME PARTS)
        var final = (entity:Entity) => {
            // CONSTRUCT ALL CHILDREN
            if (entity.children)
            {
                for (var i = 0; i < entity.children.length; i++)
                {
                    var child = entity.children[i];
                    this.ConstructEntity(child, rawSettingsData, options);
                }
            }

            // ANYTHING WITH A HITBOX IS A PHYSICS OBJECT
            if ((entity.hitbox || entity.physicsRadius) && entity.extendClass == "GameObject") 
                entity.extendClass = "PhysicsObjectBare";

            // BIT OF A HACK TO MAKE SURE SOPIRO RIGIDBODIES HAVE A CENTER PIVOT
            // PUT HERE TO LET THE EDITOR PREVIEW ALSO INHERIT IT
            var sopiroPhysicsClasses = ["Circle", "Box", "Polygon"];
            if (sopiroPhysicsClasses.includes(entity.extendClass))
                entity.pivot = { x: .5, y: .5 };

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

            return entity
        }

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

        // RECURSIVELY EXTEND DATA
        var baseEntity = entity.baseEntity;
        while (baseEntity)
        {
            var entityBase = rawSettingsData.baseEntities[baseEntity];

            // INSERT MEMBERS FROM ENTITY BASE WE DIDN'T DEFINE ALREADY IN ENTITY
            for (const key of Object.keys(entityBase))
            {
                if (!(key in entity))
                {
                    entity[key] = entityBase[key];
                }
            }

            entity.components = mergeComponents(entityBase.components, entity.components);

            baseEntity = entityBase.baseEntity;
        }

        return final(entity);
    }

    FillPresets(entity: Record<string, any>, rawSettingsData: SettingsData)
    {
        var presets = rawSettingsData.presets;

        if (!presets)
            return;

        for (const key in entity)
        {
            var propName = key as keyof Entity;
            var value = entity[propName];

            if (typeof value === "object" && value !== null)
            {
                // IF VALUE IS OBJECT, RECURSE
                this.FillPresets(value, rawSettingsData);
            }
            else
            if (typeof value === "string")
            {
                const preset = presets[value];
                if (preset !== undefined)
                {
                    const presetValue = preset?.[propName];
                    if (presetValue)
                    {
                        // REPLACING SPECIFIC PROP OF ENTITY VALUE WITH VALUE FROM PRESET
                        entity[propName] = presetValue;
                    }
                    else
                    {
                        // PRESET DIDN'T DEFINE WHAT PROPERY IT WAS MEANT TO REPLACE, REPLACE ANY PROP WITH THIS PRESET
                        entity[propName] = preset;
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
        this.raw = raw;
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
        return this.clone(this.raw);
    }

    private clone<T>(data: T): T
    {
        return JSON.parse(JSON.stringify(data));
    }
}
