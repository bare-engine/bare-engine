import type { Component } from "../controllers/componentController";
import { GameMode } from "../globals";
import { Color, Texture, Vec2 } from "../libraries/new-rapid-render";
import { GameObject } from "../objects/gameObject";
import type { Scene } from "../scenes/scene";
import { defaultSettingsData } from "../types/bareData";
import { Entity, entityVars, Rectangle2Vec, Scalar } from "../types/bareTypes";
import { getSaveFields } from "./decorators";
import { Helper } from "./helper";

export class EntitySerializer
{
    static SerializeObjectFully(scene: Scene, obj: GameObject, forceAllEntityVars: boolean = false, includeSaveFields: boolean = true): Entity
    {
        var entity: Entity = {};
        var varsToSave: string[] = [];

        if (bare.gameMode == GameMode.Play && !forceAllEntityVars)
        {
            var saveVars = scene.settingsData.saveVars;
            if (saveVars)
            {
                var constructorName = scene.GetContructorName(obj);

                if (saveVars[constructorName])
                    varsToSave = saveVars[constructorName];
                else if (constructorName == "GameObject")
                    varsToSave = defaultSettingsData.saveVars!["GameObject"];
            }

            varsToSave = varsToSave.slice();

            if (obj.levelEntity)
            {
                for (var varName in obj.levelEntity)
                {
                    if (varName == "name")
                        continue;

                    if (!varsToSave.includes(varName))
                        varsToSave.push(varName);
                }
            }
        }
        else if (bare.gameMode == GameMode.Edit || forceAllEntityVars)
        {
            varsToSave = entityVars.slice();
            varsToSave.splice(varsToSave.indexOf("tapHitbox"), 1);
        }

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

        customSerialize["pivot"] = (pivot: Vec2) => obj.entity?.pivot ?? pivot;

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
                    children.push(EntitySerializer.SerializeObjectFully(scene, child, forceAllEntityVars, includeSaveFields));
            }
            return children;
        };

        customSerialize["components"] = (currentValue: Component[]): Record<string, any> => {
            var comps: Record<string, any> = {};
            for (var comp of currentValue)
            {
                if (comp.save || forceAllEntityVars)
                {
                    var compData = EntitySerializer.SerializeComponent(scene, comp);
                    var name = bare.GetComponentNameFromClassName(comp.constructor.name);
                    comps[name] = compData;
                }
            }
            return comps;
        };

        for (var varName of varsToSave)
        {
            const key = (varName as keyof GameObject);
            var objValue = obj[key];
            var serializedValue = customSerialize[varName] && objValue
                ? customSerialize[varName](objValue)
                : scene.GetSerializedValueFromObject(obj, key);

            entity[varName] = serializedValue;
        }

        return entity;
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

            var componentData = EntitySerializer.SerializeComponent(scene, component);
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

        var className = component.constructor.name;
        var defaultValues = bare.componentDefaulValues[className];

        for (let i = 0; i < constructorVarNames.length; i++)
        {
            const paramName = constructorVarNames[i];
            const paramValue = component[paramName as keyof typeof component] as any;

            if (paramName == "scene" || paramValue === scene)
                continue;

            var defaultValue = defaultValues[paramName];
            if (paramValue === defaultValue)
                continue;

            componentData[paramName] = paramValue;
        }

        return componentData;
    }
}
