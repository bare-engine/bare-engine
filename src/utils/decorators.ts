import { GameMode } from "../globals";

const BUTTON_METADATA_KEY = "__editorButtons__";
const FIELD_METADATA_KEY = "__editorFields__";
const LOCKED_METADATA_KEY = "__lockedFields__";
const RANGE_METADATA_KEY = "__fieldRanges__";
const DROPDOWN_METADATA_KEY = "__fieldDropdowns__";
const DECIMAL_METADATA_KEY = "__fieldDecimals__";
const LABEL_METADATA_KEY = "__fieldLabels__";
const DESCRIPTION_METADATA_KEY = "__fieldDescriptions__";
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
    type: "input" | "dropdown" | "object";
}

export interface InspectorFieldData
{
    name: string;
    type: "input" | "dropdown" | "object";
    current: any;
    values?: any[];
    locked?: boolean;
    range?: InspectorRangeData;
    decimals?: number;
    description?: string;
}

export interface InspectorRangeData
{
    min?: number;
    max?: number;
}

export type InspectorDropdownValues = any[] | (() => any[]);

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

/** Returns the prototype chain (parent-first), stopping before Object.prototype. */
function prototypeChain(proto: any): any[]
{
    const chain: any[] = [];
    for (let p = proto; p && p !== Object.prototype; p = Object.getPrototypeOf(p))
        chain.push(p);
    return chain.reverse();
}

/** Returns all editor buttons registered on the component class and its ancestors. */
export function getButtons(componentClass: any): { label: string; methodKey: string; callback: () => void }[]
{
    const entries: ButtonEntry[] = [];
    const indexByKey = new Map<string, number>();

    // WALK PARENT-FIRST SO INHERITED BUTTONS ARE INCLUDED; A CHILD WITH THE SAME SOURCE OVERRIDES THE PARENT
    for (const proto of prototypeChain(componentClass.prototype))
    {
        if (!Object.prototype.hasOwnProperty.call(proto, BUTTON_METADATA_KEY))
            continue;

        for (const entry of (proto[BUTTON_METADATA_KEY] as ButtonEntry[]))
        {
            const key = entry.sourceKey ?? entry.methodKey;
            const existing = indexByKey.get(key);
            if (existing !== undefined)
                entries[existing] = entry;
            else
            {
                indexByKey.set(key, entries.length);
                entries.push(entry);
            }
        }
    }

    return entries.map(e => ({
        label: e.label,
        methodKey: e.methodKey,
        callback: () => componentClass.prototype[e.methodKey](),
    }));
}

function addField(proto: object, name: string): void
{
    const fields: FieldEntry[] = Object.prototype.hasOwnProperty.call(proto, FIELD_METADATA_KEY)
        ? (proto as any)[FIELD_METADATA_KEY]
        : [];
    if (fields.some(field => field.name === name))
        return;

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

// @InspectorBaseClass
export function InspectorBaseClass(_target: Function): void
{
    return;
}

export function getOwnInspectorFieldNames(classOrPrototype: any): string[]
{
    const proto = typeof classOrPrototype === "function" ? classOrPrototype.prototype : classOrPrototype;
    const entries: FieldEntry[] = Object.prototype.hasOwnProperty.call(proto, FIELD_METADATA_KEY)
        ? proto[FIELD_METADATA_KEY]
        : [];

    return entries.map(entry => entry.name);
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

export function Dropdown(values: InspectorDropdownValues): (target: any, propertyKey: string) => void
{
    return function (target: any, propertyKey: string): void
    {
        const dropdowns: Record<string, InspectorDropdownValues> = target[DROPDOWN_METADATA_KEY] || {};
        dropdowns[propertyKey] = values;
        target[DROPDOWN_METADATA_KEY] = dropdowns;
    };
}

export function Decimal(places: number): (target: any, propertyKey: string) => void
{
    return function (target: any, propertyKey: string): void
    {
        const decimals: Record<string, number> = target[DECIMAL_METADATA_KEY] || {};
        decimals[propertyKey] = places;
        target[DECIMAL_METADATA_KEY] = decimals;
    };
}

// @Int or @Int()
export function Int(target: any, propertyKey: string): void;
export function Int(): (target: any, propertyKey: string) => void;
export function Int(target?: any, propertyKey?: string): any
{
    const apply = Decimal(0);
    if (typeof propertyKey === "string")
    {
        apply(target, propertyKey);
        return;
    }

    return apply;
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

export function Description(description: string): (target: any, propertyKey: string) => void
{
    return function (target: any, propertyKey: string): void
    {
        const descriptions: Record<string, string> = Object.prototype.hasOwnProperty.call(target, DESCRIPTION_METADATA_KEY)
            ? target[DESCRIPTION_METADATA_KEY]
            : {};
        descriptions[propertyKey] = description;
        target[DESCRIPTION_METADATA_KEY] = descriptions;
    };
}

export function getInspectorFieldDescriptions(classOrPrototype: any): Record<string, string>
{
    const proto = typeof classOrPrototype === "function" ? classOrPrototype.prototype : classOrPrototype;
    return Object.prototype.hasOwnProperty.call(proto, DESCRIPTION_METADATA_KEY)
        ? proto[DESCRIPTION_METADATA_KEY]
        : {};
}

function getFieldValue(component: any, entry: FieldEntry): any
{
    const field = component[entry.name];
    return typeof field === "function" ? field.call(component) : field;
}

function isInspectorFieldDescriptor(value: any): boolean
{
    return value !== null
        && typeof value === "object"
        && (
            "current" in value
            || "get" in value
            || "set" in value
            || "onChange" in value
        );
}

function isInspectorObjectField(value: any): boolean
{
    return value !== null
        && typeof value === "object"
        && !Array.isArray(value);
}

function resolveDropdownValues(component: any, values: InspectorDropdownValues | undefined): any[] | undefined
{
    if (typeof values === "function")
        return values.call(component);

    return values;
}

/** Returns all editor fields registered on a component instance and its ancestor classes. */
export function getInspectorFields(component: any): InspectorFieldData[]
{
    // AGGREGATE METADATA ACROSS THE WHOLE PROTOTYPE CHAIN (parent-first) SO INHERITED @InspectorField FIELDS ARE INCLUDED.
    // Each class declares its own metadata array/record (see addField etc.), which would otherwise shadow ancestors'.
    const entries: FieldEntry[] = [];
    const indexByName = new Map<string, number>();
    const lockedFields: string[] = [];
    const ranges: Record<string, InspectorRangeData> = {};
    const dropdowns: Record<string, InspectorDropdownValues> = {};
    const decimals: Record<string, number> = {};
    const labels: Record<string, string> = {};
    const descriptions: Record<string, string> = {};

    for (const proto of prototypeChain(component.constructor.prototype))
    {
        if (Object.prototype.hasOwnProperty.call(proto, FIELD_METADATA_KEY))
        {
            for (const entry of (proto[FIELD_METADATA_KEY] as FieldEntry[]))
            {
                const existing = indexByName.get(entry.name);
                if (existing !== undefined)
                    entries[existing] = entry; // CHILD OVERRIDES PARENT, KEEPING PARENT'S POSITION
                else
                {
                    indexByName.set(entry.name, entries.length);
                    entries.push(entry);
                }
            }
        }
        if (Object.prototype.hasOwnProperty.call(proto, LOCKED_METADATA_KEY))
            lockedFields.push(...(proto[LOCKED_METADATA_KEY] as string[]));
        if (Object.prototype.hasOwnProperty.call(proto, RANGE_METADATA_KEY))
            Object.assign(ranges, proto[RANGE_METADATA_KEY]);
        if (Object.prototype.hasOwnProperty.call(proto, DROPDOWN_METADATA_KEY))
            Object.assign(dropdowns, proto[DROPDOWN_METADATA_KEY]);
        if (Object.prototype.hasOwnProperty.call(proto, DECIMAL_METADATA_KEY))
            Object.assign(decimals, proto[DECIMAL_METADATA_KEY]);
        if (Object.prototype.hasOwnProperty.call(proto, LABEL_METADATA_KEY))
            Object.assign(labels, proto[LABEL_METADATA_KEY]);
        if (Object.prototype.hasOwnProperty.call(proto, DESCRIPTION_METADATA_KEY))
            Object.assign(descriptions, proto[DESCRIPTION_METADATA_KEY]);
    }

    return entries.map(entry =>
    {
        const value = getFieldValue(component, entry);
        const isDescriptor = isInspectorFieldDescriptor(value);
        const descriptor = isDescriptor ? value : {};
        const dropdownValues = resolveDropdownValues(component, dropdowns[entry.name]);

        const range = ranges[entry.name];

        // A @Range(0, 1) field defaults to 2 decimals (integer steps would be useless on a 0..1 range);
        // an explicit @Decimal always wins.
        let resolvedDecimals = decimals[entry.name];
        if (resolvedDecimals === undefined && range && range.min === 0 && range.max === 1)
            resolvedDecimals = 2;

        return {
            name: labels[entry.name] ?? entry.name,
            type: dropdownValues !== undefined
                ? "dropdown"
                : (!isDescriptor && isInspectorObjectField(value) ? "object" : entry.type),
            current: isDescriptor
                ? descriptor.current ?? (typeof descriptor.get === "function" ? descriptor.get() : undefined)
                : value,
            values: dropdownValues,
            locked: lockedFields.includes(entry.name),
            range: range,
            decimals: resolvedDecimals,
            description: descriptions[entry.name],
        };
    });
}

/** Returns the names of every @InspectorField registered on the instance's class and its ancestors. */
export function getInspectorFieldNames(component: any): string[]
{
    const proto = typeof component === "function" ? component.prototype : component.constructor.prototype;
    const names = new Set<string>();
    for (const p of prototypeChain(proto))
    {
        if (Object.prototype.hasOwnProperty.call(p, FIELD_METADATA_KEY))
            for (const e of (p[FIELD_METADATA_KEY] as FieldEntry[]))
                names.add(e.name);
    }
    return [...names];
}

/** Finds an inspector field entry (matching by name or label) anywhere in the prototype chain. */
function findInspectorFieldEntry(component: any, fieldName: string): FieldEntry | undefined
{
    for (const proto of prototypeChain(component.constructor.prototype))
    {
        const entries: FieldEntry[] = Object.prototype.hasOwnProperty.call(proto, FIELD_METADATA_KEY)
            ? proto[FIELD_METADATA_KEY] : [];
        const labels: Record<string, string> = Object.prototype.hasOwnProperty.call(proto, LABEL_METADATA_KEY)
            ? proto[LABEL_METADATA_KEY] : {};
        const entry = entries.find(e => e.name === fieldName || labels[e.name] === fieldName);
        if (entry)
            return entry;
    }
    return undefined;
}

function isInspectorFieldLocked(component: any, fieldName: string): boolean
{
    for (const proto of prototypeChain(component.constructor.prototype))
    {
        const lockedFields: string[] = Object.prototype.hasOwnProperty.call(proto, LOCKED_METADATA_KEY)
            ? proto[LOCKED_METADATA_KEY] : [];
        if (lockedFields.includes(fieldName))
            return true;
    }
    return false;
}

export async function applyInspectorField(component: any, fieldName: string, value: any): Promise<boolean>
{
    const entry = findInspectorFieldEntry(component, fieldName);

    if (!entry)
        return false;

    if (isInspectorFieldLocked(component, entry.name))
        return true;

    const fieldValue = getFieldValue(component, entry);
    const setter = isInspectorFieldDescriptor(fieldValue)
        ? fieldValue.set || fieldValue.onChange
        : undefined;

    if (setter)
        await setter.call(component, value);
    else
        component[entry.name] = value;

    return true;
}
