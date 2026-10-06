import type { Component } from "../controllers/componentController";
import { GameMode } from "../globals";
import { Color, Texture, Vec2 } from "../libraries/rapid-render";
import { GameObject } from "../objects/gameObject";
import type { Scene } from "../scenes/scene";
import { defaultSettingsData } from "../types/bareData";
import { AnyEntity, Entity, entityVars, Rectangle2Vec, Scalar } from "../types/bareTypes";
import { getSerializeFieldEntries, getSerializeFields, isSerializedInMode, namesSavedInMode } from "./serializeFields";
import { Helper } from "./helper";

export class GameObjectSerializer
{
    static SerializeObjectFully(scene: Scene, obj: GameObject, forceAllEntityVars: boolean = false): Entity
    {
        var entity: Entity = {};

        // GET VARS TO SAVE
        var varsToSave: string[] = [];

        if (bare.gameMode == GameMode.Play && !forceAllEntityVars)
        {
            var saveVars = scene.settingsData.saveVars;
            if (saveVars) // WILL ALWAYS BE THERE REALLY
            {
                var constructorName = scene.GetContructorName(obj);

                // Class save vars extend the GameObject defaults. Keep this merge here
                // as well as in SettingsHandler so serialization remains correct when
                // settings data has not gone through preprocessing.
                const gameObjectSaveVars = saveVars.GameObject ?? defaultSettingsData.saveVars!["GameObject"];
                const classSaveVars = saveVars[constructorName] ?? [];
                varsToSave = [...new Set([...gameObjectSaveVars, ...classSaveVars])];
            }
        }
        else if (bare.gameMode == GameMode.Edit || forceAllEntityVars)
        {
            varsToSave = entityVars.slice();
            varsToSave.splice(varsToSave.indexOf("tapHitbox"), 1);

            // entityVars holds the editor fields of every registered class by name, so leave out the ones this object's
            // class redeclared for other modes (eg a subclass making a parent's GameMode.Edit field GameMode.Play)
            if (!forceAllEntityVars)
            {
                const notSavedInEditor = getSerializeFieldEntries(obj)
                    .filter(entry => !isSerializedInMode(entry, GameMode.Edit))
                    .map(entry => entry.name);
                varsToSave = varsToSave.filter(varName => !notSavedInEditor.includes(varName));
            }
        }

        // the object's own @SerializeField fields saved in this mode. in the editor most are in entityVars already,
        // this adds the ones of classes that aren't registered
        for (const saveField of getSerializeFields(obj, forceAllEntityVars ? undefined : bare.gameMode))
        {
            if (!varsToSave.includes(saveField))
                varsToSave.push(saveField);
        }

        var customSerialize: Record<string, (currentValue: any) => any> = {};

        //customSerialize["pivot"] = (pivot: Vec2) => obj.entity?.pivot ?? pivot;

        customSerialize["hitbox"] = (hitbox: Rectangle2Vec) => (obj.entity as AnyEntity | null)?.hitbox || hitbox;

        customSerialize["texture"] = (currentValue: Texture) => currentValue.texturePath;
        customSerialize["color"] = (currentValue: Color) => currentValue.toHex();

        customSerialize["children"] = (currentValue: GameObject[]): Entity[] => {
            var children: Entity[] = [];
            for (var child of currentValue)
            {
                if ((!child.persistent && child.save) || forceAllEntityVars)
                    children.push(GameObjectSerializer.SerializeObjectFully(scene, child, forceAllEntityVars));
            }
            return children.length > 0 ? children : null;
        };

        customSerialize["components"] = (currentValue: Component[]): Record<string, any> => {
            var comps: Record<string, any> = {};
            for (var comp of currentValue)
            {
                if (comp.save || forceAllEntityVars)
                {
                    var compData = GameObjectSerializer.SerializeComponent(scene, comp, forceAllEntityVars ? undefined : bare.gameMode);
                    var name = bare.GetComponentNameFromClassName(comp.constructor.name);
                    comps[name] = compData;
                }
            }
            return Object.keys(comps).length > 0 ? comps : null;
        };

        for (var varName of varsToSave)
        {
            const key = (varName as keyof GameObject);

            if (key.startsWith("_"))
                continue;

            var objValue = obj[key];
            var serializedValue = customSerialize[varName] && objValue
                ? customSerialize[varName](objValue)
                : GameObjectSerializer.SerializeValue(obj, key);

            if (serializedValue != null) // PREVENTS ADDING EMPTY CHILDREN OF COMPONENTS
                entity[varName] = serializedValue;
        }

        delete entity.save;

        return entity;
    }

    // strips data that should not end up in saved entities: unused entityUIDs, bare UID references,
    // the given props, and any entities/children left empty afterwards.
    // all lists are considered together when counting UID references.
    // NOT REALLY PART OF OBJECT SERIALIZION, BUT STILL HERE..
    static CleanEntities(entityLists: Entity[][], rawEntitiesMappedByUID: Record<string, Entity>, propsToDelete: string[] = ["interactableInEditor"], canStripUID: (entityUID: string) => boolean = () => true): void
    {
        var didClean: boolean;

        do
        {
            didClean = false;
            var stringifiedEntities = JSON.stringify(entityLists); // REFRESH AFTER EACH PASS SO REMOVED REFERENCES ARE SEEN IMMEDIATELY

            var traverseEntities = (entities: Entity[]) => {
                for (var i = entities.length - 1; i >= 0; i--)
                {
                    const entity = entities[i];

                    if (Array.isArray(entity.children))
                    {
                        traverseEntities(entity.children);

                        if (entity.children.length == 0)
                        {
                            delete entity.children;
                            didClean = true;
                        }
                    }

                    if (entity.entityUID)
                    {
                        var firstIndex = stringifiedEntities.indexOf(entity.entityUID);
                        var lastIndex = stringifiedEntities.lastIndexOf(entity.entityUID);
                        var moreThanOneRef = (firstIndex != lastIndex);

                        if (!moreThanOneRef && canStripUID(entity.entityUID))
                        {
                            delete entity.entityUID; // THIS UID IS NOT REFERENCED ANYWHERE ELSE, REMOVE IT
                            didClean = true;
                        }
                    }

                    // A bare UID reference adds no authored data; its source entity supplies the
                    // child. This also handles serialized references that have no temporary
                    // entityUID of their own.
                    if (Object.keys(entity).length == 1 && entity.extends && rawEntitiesMappedByUID[entity.extends])
                        delete entity.extends;

                    for (const prop of propsToDelete)
                        delete (entity as any)[prop];

                    if (Object.keys(entity).length == 0)
                    {
                        entities.splice(i, 1);
                        didClean = true;
                    }
                }
            }
            for (const entities of entityLists)
                traverseEntities(entities);
        }
        while (didClean);
    }

    static GetEntitiesDiff(orig: Entity, updated: Entity): any
    {
        var diff = GameObjectSerializer.GetObjectDiff(orig, updated) ?? {};

        GameObjectSerializer.AddRemovedComponents(orig, updated, diff);

        return Object.keys(diff).length > 0 ? diff : undefined;
    }

    static AddRemovedComponents(orig: Entity, updated: Entity, diff: any)
    {
        if (orig.components)
        {
            const updatedComps = updated.components ?? {};
            const removed = Object.keys(orig.components).filter(key => !(key in updatedComps));
            if (removed.length > 0)
                diff.componentsRemoved = removed;
        }

        if (orig.children && updated.children)
        {
            for (let i = 0; i < Math.min(orig.children.length, updated.children.length); i++)
            {
                // REUSE AN EXISTING CHILD DIFF IF ONE, ELSE RECURSE INTO A TEMP WE ONLY KEEP IF NON-EMPTY
                const existing = diff.children?.[i];
                const childDiff = existing ?? {};

                GameObjectSerializer.AddRemovedComponents(orig.children[i], updated.children[i], childDiff);

                if (!existing && Object.keys(childDiff).length > 0)
                {
                    // PAD EARLIER INDICES ONLY WHEN NEEDED TO KEEP ALIGNMENT FOR THIS ENTRY
                    diff.children ??= [];
                    while (diff.children.length < i)
                        diff.children.push({});
                    diff.children[i] = childDiff;
                }
            }
        }
    }

    static GetGenericDiff(orig: any, updated: any): any
    {
        if (orig === updated)
            return undefined;

        if (Array.isArray(orig) && Array.isArray(updated))
            return GameObjectSerializer.GetArrayDiff(orig, updated);

        if (GameObjectSerializer.IsPlainObject(orig) && GameObjectSerializer.IsPlainObject(updated))
            return GameObjectSerializer.GetObjectDiff(orig, updated);

        if (GameObjectSerializer.IsEmpty(updated))
            return GameObjectSerializer.IsEmpty(orig) ? undefined : updated;

        return updated;
    }

    static GetArrayDiff(orig: any[], updated: any[]): any
    {
        const diff: any[] = [];
        let hasDiff = false;

        for (let i = 0; i < Math.max(orig.length, updated.length); i++)
        {
            let value: any = undefined;

            if (i >= orig.length)
                value = updated[i];
            else if (i >= updated.length)
                continue;
            else
                value = GameObjectSerializer.GetGenericDiff(orig[i], updated[i]) ?? {};

            diff.push(value);

            if (value !== undefined && !(typeof value === "object" && value && Object.keys(value).length === 0))
                hasDiff = true;
        }

        return hasDiff ? diff : undefined;
    }

    static GetObjectDiff(orig: Record<string, any>, updated: Record<string, any>): any
    {
        const diff: Record<string, any> = {};

        for (const key in updated)
        {
            if (!(key in orig))
            {
                diff[key] = updated[key];
                continue;
            }

            const subDiff = GameObjectSerializer.GetGenericDiff(orig[key], updated[key]);
            if (subDiff !== undefined)
                diff[key] = subDiff;
        }

        return Object.keys(diff).length > 0 ? diff : undefined;
    }

    private static IsPlainObject(value: any): boolean
    {
        return !!value && typeof value === "object" && !Array.isArray(value);
    }

    private static IsEmpty(value: any): boolean
    {
        if (Array.isArray(value)) return value.length === 0;
        if (GameObjectSerializer.IsPlainObject(value)) return Object.keys(value).length === 0;
        return value === undefined || value === null;
    }

    // mode: only the @SerializeField fields saved in that GameMode, every one when left out
    static SerializeComponents(scene: Scene, components: Component[], checkSave: boolean = true, mode?: GameMode): Record<string, Record<string, Scalar>>
    {
        if (!components)
            return null;

        var componentsRec: Record<string, Record<string, Scalar>> = {};
        for (var i = 0; i < components.length; i++)
        {
            var component = components[i];

            if (checkSave && component.save === false)
                continue;

            var componentData = GameObjectSerializer.SerializeComponent(scene, component, mode);
            var compName = component.constructor.name.replace("Component", "");
            compName = Helper.DecapitalizeFirstLetter(compName);
            componentsRec[compName] = componentData;
        }

        return componentsRec;
    }

    // mode: only the @SerializeField fields saved in that GameMode, every one when left out
    static SerializeComponent(scene: Scene, component: Component, mode?: GameMode): Record<string, Scalar>
    {
        var componentData: Record<string, Scalar> = {};
        var fieldNames = GameObjectSerializer.GetComponentFieldNames(component, mode);

        // Component classes have .name normalized at registration (AddClass), so read it directly.
        var className = component.constructor.name;
        var defaultValues = bare.componentDefaulValues[className];

        for (let i = 0; i < fieldNames.length; i++)
        {
            const paramName = fieldNames[i];

            // SKIP SCENE
            if (paramName == "scene" || (component as any)[paramName] === scene)
                continue;

            const paramValue = GameObjectSerializer.SerializeValue(component, paramName);

            // SKIP IF DEFAULT
            var defaultValue = defaultValues[paramName];
            if (paramValue === defaultValue || (paramValue !== null && typeof paramValue === "object" && Helper.ObjectsAreEqual(paramValue, defaultValue)))
                continue;

            componentData[paramName] = paramValue;
        }

        return componentData;
    }

    // the fields a component is serialized with: its @SerializeField fields (saved in `mode`, or every one), or
    // without any, the props it was constructed with
    static GetComponentFieldNames(component: Component, mode?: GameMode): string[]
    {
        const entries = getSerializeFieldEntries(component);
        if (entries.length > 0)
            return namesSavedInMode(entries, mode);

        return (component as any).__paramNames || Helper.GetConstructorParamNames(component.constructor);
    }

    // a field's value as stored in an entity: descriptor fields ({ get, set }) by their getter, Vec2 as {x, y},
    // Color as hex, and nothing that can't be cloned
    static SerializeValue(owner: any, field: string): any
    {
        var objValue = owner[field];
        var serializedValue;

        if (objValue && typeof objValue === "object" && (typeof (objValue as any).get === "function")) //eg: hitboxType
            serializedValue = (objValue as any).get();
        else
        if (objValue instanceof Vec2)
            serializedValue = { x: objValue.x, y: objValue.y };
        else
        if (objValue instanceof Color)
            serializedValue = objValue.toHex();
        else
            serializedValue = objValue;

        // only emit serializable values. entityVars holds the field names of every registered class, so a name can
        // belong to something else on this object (eg DiamondUI.text, while text is a TextObject field)
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
}
