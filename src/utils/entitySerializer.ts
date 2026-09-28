import type { Component } from "../controllers/componentController";
import { GameMode } from "../globals";
import { Color, Texture } from "../libraries/new-rapid-render";
import { GameObject } from "../objects/gameObject";
import type { Scene } from "../scenes/scene";
import { defaultSettingsData } from "../types/bareData";
import { Entity, entityVars, Rectangle2Vec, Scalar } from "../types/bareTypes";
import { getSaveFields } from "./saveFields";
import { Helper } from "./helper";

export class GameObjectSerializer
{
    static SerializeObjectFully(scene: Scene, obj: GameObject, forceAllEntityVars: boolean = false, includeSaveFields: boolean = true): Entity
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

            varsToSave = varsToSave.slice();
        }
        else if (bare.gameMode == GameMode.Edit || forceAllEntityVars)
        {
            varsToSave = entityVars.slice();
            varsToSave.splice(varsToSave.indexOf("tapHitbox"), 1);
        }

        // EDGE CASE, WANT TO ALWAYS SAVE (TOP LEVEL) OBJECT WITHOUT A PARENT, NO NEED TO SUPPLY THE SAVE PROPERTY
        // CHILDREN DO NEED IT
        if (!obj.parent && varsToSave.includes("save"))
            varsToSave.splice(varsToSave.indexOf("save"), 1);

        if (includeSaveFields)
        {
            for (const saveField of getSaveFields(obj))
            {
                if (!varsToSave.includes(saveField))
                    varsToSave.push(saveField);
            }
        }

        var customSerialize: Record<string, (currentValue: any) => any> = {};

        //customSerialize["pivot"] = (pivot: Vec2) => obj.entity?.pivot ?? pivot;

        customSerialize["hitbox"] = (hitbox: Rectangle2Vec) => {
            if (obj.entity?.hitbox)
                return obj.entity.hitbox;

            return hitbox;
        };

        customSerialize["texture"] = (currentValue: Texture) => currentValue.texturePath;
        customSerialize["color"] = (currentValue: Color) => currentValue.toHex();

        customSerialize["children"] = (currentValue: GameObject[]): Entity[] => {
            var children: Entity[] = [];
            for (var child of currentValue)
            {
                if ((!child.persistent && child.save) || forceAllEntityVars)
                    children.push(GameObjectSerializer.SerializeObjectFully(scene, child, forceAllEntityVars, includeSaveFields));
            }
            return children.length > 0 ? children : null;
        };

        customSerialize["components"] = (currentValue: Component[]): Record<string, any> => {
            var comps: Record<string, any> = {};
            for (var comp of currentValue)
            {
                if (comp.save || forceAllEntityVars)
                {
                    var compData = GameObjectSerializer.SerializeComponent(scene, comp);
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
                : scene.GetSerializedValueFromObject(obj, key);

            if (serializedValue != null) // PREVENTS ADDING EMPTY CHILDREN OF COMPONENTS
                entity[varName] = serializedValue;
        }

        delete entity.save;

        return entity;
    }

    // CREATE A SELF-CONTAINED ENTITY FOR CLONING/COPY-PASTE
    static SerializeObjectSnapshot(scene: Scene, obj: GameObject): Entity
    {
        const snapshot = GameObjectSerializer.SerializeObjectFully(scene, obj, false, true);

        const makeSelfContained = (gameObject: GameObject, entity: Entity): void => {
            entity.name = gameObject.name;
            entity.baseClass = scene.GetContructorName(gameObject);

            // The snapshot already contains the applied values. Prevent ConstructEntity()
            // from merging a same-named settings entity back into it when it is restored.
            entity.constructed = true;

            if (!entity.children)
                return;

            const savedChildren = gameObject.children.filter(child => !child.persistent && child.save);
            for (var i = 0; i < Math.min(savedChildren.length, entity.children.length); i++)
                makeSelfContained(savedChildren[i], entity.children[i]);
        };

        makeSelfContained(obj, snapshot);
        return snapshot;
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
                    if (Object.keys(entity).length == 1 && entity.entity && rawEntitiesMappedByUID[entity.entity])
                        delete entity.entity;

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

    static SerializeComponents(scene: Scene, components: Component[], checkSave: boolean = true): Record<string, Record<string, Scalar>>
    {
        if (!components)
            return null;

        var componentsRec: Record<string, Record<string, Scalar>> = {};
        for (var i = 0; i < components.length; i++)
        {
            var component = components[i];

            if (checkSave && component.save === false)
                continue;

            var componentData = GameObjectSerializer.SerializeComponent(scene, component);
            var compName = component.constructor.name.replace("Component", "");
            compName = Helper.DecapitalizeFirstLetter(compName);
            componentsRec[compName] = componentData;
        }

        return componentsRec;
    }

    static SerializeComponent(scene: Scene, component: Component): Record<string, Scalar>
    {
        var componentData: Record<string, Scalar> = {};
        const saveFields = getSaveFields(component);
        var constructorVarNames = saveFields;
        const hasExplicitSaveFields = saveFields.length > 0;
        if (!hasExplicitSaveFields)
            constructorVarNames = (component as any).__paramNames || Helper.GetConstructorParamNames(component.constructor);

        // Component classes have .name normalized at registration (AddClass), so read it directly.
        var className = component.constructor.name;
        var defaultValues = bare.componentDefaulValues[className];

        // GET VALUE FROM EACH KEY OF CONSTRUCTOR PARAMS
        for (let i = 0; i < constructorVarNames.length; i++)
        {
            const paramName = constructorVarNames[i];
            const paramValue = component[paramName as keyof typeof component] as any; // SHOULD BE STRING, NUMBER OR BOOLEAN

            // SKIP SCENE
            if (paramName == "scene" || paramValue === scene)
                continue;

            // SKIP IF DEFAULT
            var defaultValue = defaultValues[paramName];
            if (paramValue === defaultValue)
                continue;

            componentData[paramName] = paramValue;
        }

        return componentData;
    }
}
