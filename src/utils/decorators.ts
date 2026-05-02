import { GameMode } from "../globals";

const BUTTON_METADATA_KEY = "__editorButtons__";
const FIELD_METADATA_KEY = "__editorFields__";
const LOCKED_METADATA_KEY = "__lockedFields__";
const RANGE_METADATA_KEY = "__fieldRanges__";
const LABEL_METADATA_KEY = "__fieldLabels__";
const RUN_MODES_KEY = "__runModes__";
const SAVE_METADATA_KEY = "__saveFields__";

/**
 * Restricts when a component is active based on GameMode.
 *
 * @Run(GameMode.Editor)                — component is only added in Editor mode
 * @Run(GameMode.Game, GameMode.Editor) — component is added in both modes
 */
export function Run(...modes: GameMode[])
{
    return function (target: any)
    {
        target[RUN_MODES_KEY] = modes;
        return target;
    };
}

export { RUN_MODES_KEY };

export interface ButtonEntry
{
    label: string;
    methodKey: string;
    sourceKey?: string;
}

export interface FieldEntry
{
    name: string;
    type: "input" | "dropdown";
}

export interface InspectorFieldData
{
    name: string;
    type: "input" | "dropdown";
    current: any;
    values?: any[];
    locked?: boolean;
    range?: InspectorRangeData;
}

export interface InspectorRangeData
{
    min?: number;
    max?: number;
}

export interface InspectorButtonOptions
{
    label?: string;
    OnClick?: string;
}

function addButton(proto: object, name: string, options?: string | InspectorButtonOptions): void
{
    const buttons: ButtonEntry[] = (proto as any)[BUTTON_METADATA_KEY] || [];

    let label = name;
    let methodKey = name;

    if (typeof options === "string")
    {
        label = options;
        if (typeof (proto as any)[options] === "function")
            methodKey = options;
    }
    else if (options)
    {
        if (options.OnClick) methodKey = options.OnClick.replace("()", "");
        label = options.label || methodKey;
    }

    const entry = { label, methodKey, sourceKey: name };
    const sameSourceIndex = buttons.findIndex(button => (button.sourceKey ?? button.methodKey) === name);

    if (sameSourceIndex === -1)
        buttons.push(entry);
    else
        buttons.splice(sameSourceIndex, 0, entry);

    (proto as any)[BUTTON_METADATA_KEY] = buttons;
}

/**
 * Marks a method as an editor button.
 *
 * @Button                                     — label = method name
 * @Button("Fire")                             — label = "Fire"
 * @Button({label: "Fire", OnClick: "Fire()"}) — label + explicit method
 */
// @InspectorButton("label")
export function InspectorButton(label: string): (target: any, propertyKey: string) => void;
// @InspectorButton("label", "method")
export function InspectorButton(label: string, methodKey: string): (target: any, propertyKey: string) => void;
// @InspectorButton({label: "Fire", OnClick: "Fire()"})
export function InspectorButton(options: InspectorButtonOptions): (target: any, propertyKey: string) => void;
// @InspectorButton
export function InspectorButton(target: any, propertyKey: string): void;
export function InspectorButton(targetOrOptions: any, propertyKey?: string): any
{
    if (typeof targetOrOptions === "string" && typeof propertyKey === "string")
    {
        const label = targetOrOptions;
        const methodKey = propertyKey;

        return function (target: any, key: string): void
        {
            addButton(target, key, { label, OnClick: methodKey });
        };
    }

    // @InspectorButton — bare, legacy decorator called with (target, propertyKey)
    if (typeof propertyKey === "string")
    {
        addButton(targetOrOptions, propertyKey);
        return;
    }

    // @InspectorButton("label") or @Button({...}) — factory
    const options = targetOrOptions as string | InspectorButtonOptions;
    return function (target: any, key: string): void
    {
        addButton(target, key, options);
    };
}

/** Returns all editor buttons registered on the component class. */
export function getButtons(componentClass: any): { label: string; methodKey: string; callback: () => void }[]
{
    const entries: ButtonEntry[] = componentClass.prototype[BUTTON_METADATA_KEY] || [];
    return entries.map(e => ({
        label: e.label,
        methodKey: e.methodKey,
        callback: () => componentClass.prototype[e.methodKey](),
    }));
}

function addField(proto: object, name: string): void
{
    const fields: FieldEntry[] = (proto as any)[FIELD_METADATA_KEY] || [];
    fields.push({ name, type: "input" });
    (proto as any)[FIELD_METADATA_KEY] = fields;
}

// @InspectorField
export function InspectorField(target: any, propertyKey: string): void;
export function InspectorField(targetOrType: any, propertyKey?: string): any
{
    if (typeof propertyKey === "string")
    {
        addField(targetOrType, propertyKey);
        return;
    }
}

export function Save(target: any, propertyKey: string): void
{
    const saveFields: string[] = target[SAVE_METADATA_KEY] || [];
    if (!saveFields.includes(propertyKey))
        saveFields.push(propertyKey);

    target[SAVE_METADATA_KEY] = saveFields;
}

export function getSaveFields(component: any): string[]
{
    return component.constructor.prototype[SAVE_METADATA_KEY] || [];
}

export function Locked(target: any, propertyKey: string): void
{
    const lockedFields: string[] = target[LOCKED_METADATA_KEY] || [];
    lockedFields.push(propertyKey);
    target[LOCKED_METADATA_KEY] = lockedFields;
}

export function Range(min?: number, max?: number): (target: any, propertyKey: string) => void
{
    return function (target: any, propertyKey: string): void
    {
        const ranges: Record<string, InspectorRangeData> = target[RANGE_METADATA_KEY] || {};
        ranges[propertyKey] = {
            min: min !== undefined && Number.isFinite(min) ? min : undefined,
            max: max !== undefined && Number.isFinite(max) ? max : undefined,
        };
        target[RANGE_METADATA_KEY] = ranges;
    };
}

export function Label(label: string): (target: any, propertyKey: string) => void
{
    return function (target: any, propertyKey: string): void
    {
        const labels: Record<string, string> = target[LABEL_METADATA_KEY] || {};
        labels[propertyKey] = label;
        target[LABEL_METADATA_KEY] = labels;
    };
}

function getFieldValue(component: any, entry: FieldEntry): any
{
    const field = component[entry.name];
    return typeof field === "function" ? field.call(component) : field;
}

/** Returns all editor fields registered on a component instance. */
export function getInspectorFields(component: any): InspectorFieldData[]
{
    const entries: FieldEntry[] = component.constructor.prototype[FIELD_METADATA_KEY] || [];
    const lockedFields: string[] = component.constructor.prototype[LOCKED_METADATA_KEY] || [];
    const ranges: Record<string, InspectorRangeData> = component.constructor.prototype[RANGE_METADATA_KEY] || {};
    const labels: Record<string, string> = component.constructor.prototype[LABEL_METADATA_KEY] || {};

    return entries.map(entry =>
    {
        const value = getFieldValue(component, entry) || {};

        return {
            name: labels[entry.name] ?? entry.name,
            type: value.values !== undefined ? "dropdown" : entry.type,
            current: value.current ?? (typeof value.get === "function" ? value.get() : undefined),
            values: typeof value.values === "function" ? value.values() : value.values,
            locked: lockedFields.includes(entry.name),
            range: ranges[entry.name],
        };
    });
}

export async function applyInspectorField(component: any, fieldName: string, value: any): Promise<boolean>
{
    const entries: FieldEntry[] = component.constructor.prototype[FIELD_METADATA_KEY] || [];
    const labels: Record<string, string> = component.constructor.prototype[LABEL_METADATA_KEY] || {};
    const entry = entries.find(e => e.name === fieldName || labels[e.name] === fieldName);

    if (!entry)
        return false;

    const lockedFields: string[] = component.constructor.prototype[LOCKED_METADATA_KEY] || [];
    if (lockedFields.includes(entry.name))
        return true;

    const fieldValue = getFieldValue(component, entry) || {};
    const setter = fieldValue.set || fieldValue.onChange;

    if (setter)
        await setter.call(component, value);
    else
        component[fieldName] = value;

    return true;
}
