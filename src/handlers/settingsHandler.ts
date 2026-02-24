import { Texture } from "../libraries/rapid-render/texture";
import { assetsHandler } from "./assetsHandler";
import { defaultEntityData } from "../types/bareData";
import { SettingsData } from "../types/bareTypes";
import { Helper } from "../utils/helper";
import { Scene } from "../scenes/scene";

// SETTINGS-STORE KEEPS TRACK OF RAW AND PROCESSED SETTINGS
// BIT CLUMSY TO HAVE THEM BOTH, BUT HAVING ONLY ONE WOULD MEAN I'D HAVE TO UNDO THE CHANGES THAT HAPPEN IN PROCESS()
// AND THAT'S EVEN MORE INCONVENIENT, ESPECIALLY WHEN MORE GETS PROCESSED IN THE FUTURE
// NOW THE ADVANTAGE WITH HAVING THEM BOTH IS THAT I CAN EASILY EDIT+SAVE THE RAW SETTINGS, THEN PROCESS AGAIN TO UPDATE THE PROCESSED SETTINGS

export class SettingsHandler
{
    private raw: SettingsData;
    private processed: SettingsData;

    public scene: Scene;

    constructor(scene: Scene)
    {
        this.scene = scene;
    }

    async Process(raw: SettingsData = this.raw): Promise<SettingsData>
    {
        var settings = this.clone(raw);

        // SET DEFAULTS - WILL FILL IN ANY VALUE IN defaultEntityData THAT'S NOT PRESENT
        for (const key of Object.keys(defaultEntityData) as (keyof SettingsData)[])
        {
            const rawValue = settings[key];
            const defaultValue = (defaultEntityData as any)[key];

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
                const merged = { ...defaultValue };
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
        if (settings.entityBases)
        {
            Object.entries(settings.entityBases).forEach(([key, e]) => {
                e.name = key;
            });
        }
        Object.entries(settings.entities).forEach(([key, e]) => {
            e.name = key;
        });

        if (!settings.entityBases)
        {
            settings.entityBases = {ANY: {name: "ANY"}};
        }

        // SET DEFAULT EXTEND CLASS FOR 'ANY' CASE - COULD STILL BE extendData DOESN'T EXTEND A CLASS SO SHOULD REALLY RECURSE, TODO?
        if (!settings.entityBases.ANY.extendClass)
        {
            settings.entityBases.ANY.extendClass = "GameObject";
        }

        // PROCESS EACH CATEGORY
        if (settings.categories)
        {
            for (let i = 0; i < settings.categories.length; i++)
            {
                const categoryGroup = settings.categories[i];
                for (const categoryName of Object.keys(categoryGroup))
                {
                    const categoryData = categoryGroup[categoryName];
                    if (!categoryData || !categoryData.entries || categoryData.entries.length === 0) return settings;

                    // PARSE STRING ENTRIES, EG: "roadTexture_%" 
                    if (typeof categoryData.entries === 'string') 
                    {
                        if (categoryData.entries.indexOf('%') != -1)
                        {
                            var split = categoryData.entries.split('%');
                            var name = split[0];
                            var count = parseInt(split[1], 10);

                            var entity = this.scene.ConstructEntity(name + "%", settings);

                            // TURN ENTRIES INTO ARRAY
                            categoryData.entries = [];
                            for (var j = 0; j < count; j++)
                            {
                                var entryName = name + (j + 1);
                                categoryData.entries.push(entryName);

                                // ALSO PUSH EACH AS ENTITY SO WE CAN FIND THEM LATER
                                var entityClone = {...entity};
                                entityClone.name = entryName;
                                settings.entities[entityClone.name] = entityClone;
                            }

                            // REMOVE % ENTRY
                            //delete categoryGroup[categoryName];
                        }

                        if (typeof categoryData.entries === 'string')
                        {
                            const regex = /(.+)_\[(.+)\]/; // eg "level_[editorImages]"
                            const match = categoryData.entries.match(regex);
                            if (match)
                            {
                                const prefix = match[1]; // eg "level"
                                const imagePath = match[2]; // eg "editorImages"

                                var entityName = prefix + "_*";
                                var entity = this.scene.ConstructEntity(entityName, settings);
                                var files = await Helper.GetFilesInFolder(`${bareEngine.imagePath}/` + imagePath);

                                // TURN ENTRIES INTO ARRAY
                                categoryData.entries = [];
                                for (var j = 0; j < files.length; j++)
                                {
                                    var fileName = files[j].split('.')[0];
                                    categoryData.entries.push(fileName);

                                    // ALSO PUSH EACH AS ENTITY SO WE CAN FIND THEM LATER
                                    var entityClone = {...entity};
                                    entityClone.name = fileName;
                                    if (!settings.entities[entityClone.name]) // DON'T OVERWRITE EXISTING ENTRIES
                                        settings.entities[entityClone.name] = entityClone;
                                }

                                // REMOVE * ENTRY
                                //delete categoryGroup[categoryName];
                            }
                        }
                    }
                }
            }
        }

        // PROCESS ANIMATIONS - ADD THEM AND LOAD THEIR TEXTURES IF THEY'RE NOT IN ALREADY
        if (settings.animations)
        {
            var promises: Promise<Texture>[] = [];

            for (const [animName, animDataInfo] of Object.entries(settings.animations))
            {
                var existingAnimation = assetsHandler.GetAnimation(animName);

                // TAKE PROVIDED VALUES OR FALLBACK TO DEFAULTS
                var animationFrames = animDataInfo.frames as string[] ?? existingAnimation?.animFrames ?? []; // FALLBACK TO ANIMATION FRAMES SET BEFORE IN JSON
                var framesPerSecond = animDataInfo.framesPerSecond ?? 8;
                var loop = animDataInfo.loop ?? true;

                for (var i = 0; i < animationFrames.length; i++)
                {
                    var frame = animationFrames[i];
                    var promiseTexture = assetsHandler.GetTexturePromise(frame);
                    promises.push(promiseTexture);
                }
                
                // WILL ALSO OVERRIDE PREVIOUSLY SET ANIMATION IN JSON FROM _INITIAL FOLDER
                assetsHandler.AddAnimation(animName, animationFrames, framesPerSecond, loop);
            }

            await Promise.all(promises);
        }

        settings.processed = true;

        // STORE REFERENCES
        this.raw = raw;
        this.processed = settings;

        return settings;
    }

    // HACK TO REPROCESS ANIMATIONS
    ReprocessAnimations()
    {
        var settings = this.raw;

        // REPROCESS ANIMATIONS - ADD THEM AND LOAD THEIR TEXTURES IF THEY'RE NOT IN ALREADY
        if (settings.animations)
        {
            for (const [animName, animDataInfo] of Object.entries(settings.animations))
            {
                var existingAnimation = assetsHandler.GetAnimation(animName);

                // TAKE PROVIDED VALUES OR FALLBACK TO DEFAULTS
                var animationFrames = animDataInfo.frames as string[] ?? existingAnimation?.animFrames ?? []; // FALLBACK TO ANIMATION FRAMES SET BEFORE IN JSON
                var framesPerSecond = animDataInfo.framesPerSecond ?? 8;
                var loop = animDataInfo.loop ?? true;
                
                // WILL ALSO OVERRIDE PREVIOUSLY SET ANIMATION IN JSON FROM _INITIAL FOLDER
                assetsHandler.AddAnimation(animName, animationFrames, framesPerSecond, loop);
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

    UpdateRaw(mutator: (raw: SettingsData) => void): SettingsData 
    {
        const raw = this.GetRaw();
        mutator(raw);

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
