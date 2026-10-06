import type { GameMode } from "../globals";
import { Color } from "../libraries/rapid-render";
import { getSerializeFieldEntries, isSerializedInMode, nextDeclarationOrder, prototypeChain, SERIALIZE_METADATA_KEY, SerializeFieldEntry } from "./serializeFields";

const BUTTON_METADATA_KEY = "__editorButtons__";
const FIELD_METADATA_KEY = "__editorFields__";
const INSPECTOR_CLASS_METADATA_KEY = "__inspectorClassMembers__";
const LOCKED_METADATA_KEY = "__lockedFields__";
const RANGE_METADATA_KEY = "__fieldRanges__";
const DROPDOWN_METADATA_KEY = "__fieldDropdowns__";
const ENUM_METADATA_KEY = "__fieldEnums__";
const DECIMAL_METADATA_KEY = "__fieldDecimals__";
const LABEL_METADATA_KEY = "__fieldLabels__";
const DESCRIPTION_METADATA_KEY = "__fieldDescriptions__";
const HIDDEN_METADATA_KEY = "__hiddenFields__";
const INSPECTOR_CLASS_ORDER_KEY = "__inspectorClassOrders__";

// NOTE: @Run / RUN_MODES_KEY live in ./runModes.ts and @SerializeField / getSerializeFields in ./serializeFields.ts
// (not here) because they carry runtime semantics and must survive the production build that
// strips these editor-only decorators and tree-shakes decorators.ts away.

export interface ButtonEntry
{
    label: string;
    methodKey: string;
    sourceKey?: string;
    order?: number;
}

export interface FieldEntry
{
    name: string;
    type: "input" | "dropdown" | "object";
    order?: number;
}

export interface InspectorFieldData
{
    name: string;
    type: "input" | "dropdown" | "object" | "color";
    current: any;
    values?: any[];
    locked?: boolean;
    range?: InspectorLimitData;
    decimals?: number;
    description?: string;
    /** Name of the class that declared this @InspectorField (the position-owning class, so an
     *  overriding subclass keeps the ancestor's grouping). Lets the inspector draw dividers
     *  between fields inherited from different classes. */
    source?: string;
    /** Declaration-order index within its declaring class (shared with that class's buttons/inspector
     *  classes), so the inspector can render members in source order rather than grouped by type. */
    order?: number;
}

export interface InspectorLimitData
{
    min?: number;
    max?: number;
}

/** @deprecated Use InspectorLimitData. */
export interface InspectorRangeData extends InspectorLimitData {}

export type InspectorDropdownValues = any[] | (() => any[]);

function addButton(proto: object, name: string, label: string = name): void
{
    const buttons: ButtonEntry[] = (proto as any)[BUTTON_METADATA_KEY] || [];

    const entry: ButtonEntry = { label, methodKey: name, sourceKey: name, order: nextDeclarationOrder(proto) };
    const sameSourceIndex = buttons.findIndex(button => (button.sourceKey ?? button.methodKey) === name);

    if (sameSourceIndex === -1)
        buttons.push(entry);
    else
        buttons.splice(sameSourceIndex, 0, entry);

    (proto as any)[BUTTON_METADATA_KEY] = buttons;
}

// A method-only decorator: requiring the method descriptor makes TypeScript reject the decorator on
// a field/property (a property decorator receives no descriptor), so a button can't bind to a non-method.
type ButtonMethodDecorator = (target: any, propertyKey: string, descriptor: TypedPropertyDescriptor<(...args: any[]) => any>) => void;

/**
 * Marks a method as an editor button. The label defaults to the method name; pass one inline or
 * use @Label("…") for a custom label (@Label wins if both are present).
 *
 *   @InspectorButton            Fire() { … }   // label = "Fire"
 *   @InspectorButton("Restart") Fire() { … }   // label = "Restart"
 */
// @InspectorButton("label")
export function InspectorButton(label: string): ButtonMethodDecorator;
// @InspectorButton — bare
export function InspectorButton(target: any, propertyKey: string, descriptor: TypedPropertyDescriptor<(...args: any[]) => any>): void;
export function InspectorButton(targetOrLabel: any, propertyKey?: string, _descriptor?: any): any
{
    // @InspectorButton("label") — factory; the returned decorator is still method-only.
    if (typeof targetOrLabel === "string")
    {
        const label = targetOrLabel;
        return function (target: any, key: string, _d: TypedPropertyDescriptor<(...args: any[]) => any>): void
        {
            addButton(target, key, label);
        };
    }

    // @InspectorButton — bare method decorator
    addButton(targetOrLabel, propertyKey as string);
}

/** Returns all editor buttons registered on the component class and its ancestors. */
export function getButtons(componentClass: any): { label: string; methodKey: string; order?: number; source?: string; callback: () => void }[]
{
    const entries: ButtonEntry[] = [];
    const entrySources: string[] = [];
    const indexByKey = new Map<string, number>();

    // WALK PARENT-FIRST SO INHERITED BUTTONS ARE INCLUDED; A CHILD WITH THE SAME SOURCE OVERRIDES THE PARENT
    for (const proto of prototypeChain(componentClass.prototype))
    {
        if (!Object.prototype.hasOwnProperty.call(proto, BUTTON_METADATA_KEY))
            continue;

        const source: string = proto.constructor?.name ?? "";
        for (const entry of (proto[BUTTON_METADATA_KEY] as ButtonEntry[]))
        {
            const key = entry.sourceKey ?? entry.methodKey;
            const existing = indexByKey.get(key);
            if (existing !== undefined)
            {
                entries[existing] = entry;
                entrySources[existing] = source;
            }
            else
            {
                indexByKey.set(key, entries.length);
                entries.push(entry);
                entrySources.push(source);
            }
        }
    }

    return entries.map((e, i) => ({
        label: getDeclaredLabel(componentClass, e.sourceKey ?? e.methodKey) ?? e.label,
        methodKey: e.methodKey,
        order: e.order,
        source: entrySources[i],
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

    fields.push({ name, type: "input", order: nextDeclarationOrder(proto) });
    (proto as any)[FIELD_METADATA_KEY] = fields;
}

// @InspectorField — shown in the in-game inspector, never saved. use @SerializeField to edit and save a field
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

export interface InspectorClassData
{
    name: string;
    propertyName: string;
    __fields: InspectorFieldData[];
    __buttons?: { label: string; method: string }[];
    /** Name of the class that declared this @InspectorClass member, so the inspector can group it
     *  with that class's fields (e.g. a subclass's own controller sits with the subclass's fields). */
    source?: string;
    /** Declaration-order index within its declaring class (shared with that class's fields/buttons),
     *  so the inspector can render members in source order rather than grouped by decorator type. */
    order?: number;
}

function addInspectorClass(proto: object, name: string): void
{
    const members: string[] = Object.prototype.hasOwnProperty.call(proto, INSPECTOR_CLASS_METADATA_KEY)
        ? (proto as any)[INSPECTOR_CLASS_METADATA_KEY]
        : [];
    if (!members.includes(name))
        members.push(name);
    (proto as any)[INSPECTOR_CLASS_METADATA_KEY] = members;

    const orders: Record<string, number> = Object.prototype.hasOwnProperty.call(proto, INSPECTOR_CLASS_ORDER_KEY)
        ? (proto as any)[INSPECTOR_CLASS_ORDER_KEY]
        : {};
    if (!(name in orders))
        orders[name] = nextDeclarationOrder(proto);
    (proto as any)[INSPECTOR_CLASS_ORDER_KEY] = orders;
}

/**
 * Marks a member that holds another object whose @InspectorField / @InspectorButton members
 * should be surfaced in the inspector as a collapsible group (rendered like a component).
 *
 *   @InspectorClass public object: ObjectController;
 */
// @InspectorClass
export function InspectorClass(target: any, propertyKey: string): void
{
    addInspectorClass(target, propertyKey);
}

/** Returns the names of every @InspectorClass member registered on the instance's class and its ancestors. */
export function getInspectorClassNames(component: any): string[]
{
    const proto = typeof component === "function" ? component.prototype : component.constructor.prototype;
    const names: string[] = [];
    for (const p of prototypeChain(proto))
    {
        if (Object.prototype.hasOwnProperty.call(p, INSPECTOR_CLASS_METADATA_KEY))
            for (const name of (p[INSPECTOR_CLASS_METADATA_KEY] as string[]))
                if (!names.includes(name))
                    names.push(name);
    }
    return names;
}

/** Maps each @InspectorClass member name to the class that declared it (the position-owning class). */
function getInspectorClassSources(component: any): Record<string, string>
{
    const proto = typeof component === "function" ? component.prototype : component.constructor.prototype;
    const sources: Record<string, string> = {};
    for (const p of prototypeChain(proto))
    {
        if (!Object.prototype.hasOwnProperty.call(p, INSPECTOR_CLASS_METADATA_KEY))
            continue;
        const source: string = p.constructor?.name ?? "";
        for (const name of (p[INSPECTOR_CLASS_METADATA_KEY] as string[]))
            if (!(name in sources))
                sources[name] = source;
    }
    return sources;
}

/** Maps each @InspectorClass member name to its declaration-order index within its declaring class. */
function getInspectorClassOrders(component: any): Record<string, number>
{
    const proto = typeof component === "function" ? component.prototype : component.constructor.prototype;
    const orders: Record<string, number> = {};
    for (const p of prototypeChain(proto))
    {
        if (!Object.prototype.hasOwnProperty.call(p, INSPECTOR_CLASS_ORDER_KEY))
            continue;
        const protoOrders = p[INSPECTOR_CLASS_ORDER_KEY] as Record<string, number>;
        for (const name in protoOrders)
            if (!(name in orders))
                orders[name] = protoOrders[name];
    }
    return orders;
}

/** The @Label declared for a member anywhere up the prototype chain, or undefined if none. */
function getDeclaredLabel(component: any, memberName: string): string | undefined
{
    const proto = typeof component === "function" ? component.prototype : component.constructor.prototype;
    let label: string | undefined;
    for (const p of prototypeChain(proto))
    {
        if (!Object.prototype.hasOwnProperty.call(p, LABEL_METADATA_KEY))
            continue;

        const labels = p[LABEL_METADATA_KEY] as Record<string, string>;
        if (Object.prototype.hasOwnProperty.call(labels, memberName))
            label = labels[memberName];
    }

    return label;
}

function getMemberLabel(component: any, memberName: string): string
{
    return getDeclaredLabel(component, memberName) ?? memberName;
}

export function resolveInspectorClassName(component: any, nameOrLabel: string): string | undefined
{
    for (const name of getInspectorClassNames(component))
        if (name === nameOrLabel || getMemberLabel(component, name) === nameOrLabel)
            return name;

    return undefined;
}

/** Reads an @InspectorClass member without invoking a lazy accessor: getter-backed members
 *  (Scene controllers) are peeked via their `_name` backing field, so inspecting a scene
 *  doesn't instantiate controllers it never used. Plain fields are read directly. */
function peekInspectorClassInstance(component: any, name: string): any
{
    const own = Object.getOwnPropertyDescriptor(component, name);
    if (own && !own.get)
        return component[name];

    let proto = Object.getPrototypeOf(component);
    while (proto)
    {
        const descriptor = Object.getOwnPropertyDescriptor(proto, name);
        if (descriptor)
        {
            if (descriptor.get)
                return component["_" + name];
            break;
        }
        proto = Object.getPrototypeOf(proto);
    }

    return component[name];
}

/**
 * For each @InspectorClass member, reads the live instance and gathers its @InspectorField /
 * @InspectorButton members (traversing the instance's whole prototype chain via getInspectorFields).
 * Lazy getter-backed members that were never instantiated are skipped, not created.
 */
export function getInspectorClasses(component: any): InspectorClassData[]
{
    const result: InspectorClassData[] = [];
    const sources = getInspectorClassSources(component);
    const orders = getInspectorClassOrders(component);
    for (const name of getInspectorClassNames(component))
    {
        const instance = peekInspectorClassInstance(component, name);
        if (instance == null || typeof instance !== "object")
            continue;

        const entry: InspectorClassData = {
            name: getMemberLabel(component, name),
            propertyName: name,
            __fields: getInspectorFields(instance),
            source: sources[name],
            order: orders[name],
        };

        const buttons = getButtons(instance.constructor as any);
        if (buttons.length > 0)
            entry.__buttons = buttons.map(b => ({ label: b.label, method: b.methodKey }));

        result.push(entry);
    }
    return result;
}

export function getOwnInspectorFieldNames(classOrPrototype: any): string[]
{
    const proto = typeof classOrPrototype === "function" ? classOrPrototype.prototype : classOrPrototype;
    const entries: FieldEntry[] = Object.prototype.hasOwnProperty.call(proto, FIELD_METADATA_KEY)
        ? proto[FIELD_METADATA_KEY]
        : [];

    return entries.map(entry => entry.name);
}

export function Locked(target: any, propertyKey: string): void
{
    const lockedFields: string[] = target[LOCKED_METADATA_KEY] || [];
    lockedFields.push(propertyKey);
    target[LOCKED_METADATA_KEY] = lockedFields;
}

// @Hidden — keeps a @SerializeField out of the inspector, it's still saved
export function Hidden(target: any, propertyKey: string): void
{
    const hiddenFields: string[] = Object.prototype.hasOwnProperty.call(target, HIDDEN_METADATA_KEY)
        ? target[HIDDEN_METADATA_KEY]
        : [];
    if (!hiddenFields.includes(propertyKey))
        hiddenFields.push(propertyKey);
    target[HIDDEN_METADATA_KEY] = hiddenFields;
}

/** @Hidden fields of the class and its ancestors. */
export function getHiddenFieldNames(objOrClass: any): string[]
{
    const proto = typeof objOrClass === "function" ? objOrClass.prototype : objOrClass.constructor.prototype;
    const names = new Set<string>();
    for (const p of prototypeChain(proto))
        if (Object.prototype.hasOwnProperty.call(p, HIDDEN_METADATA_KEY))
            for (const name of (p[HIDDEN_METADATA_KEY] as string[]))
                names.add(name);
    return [...names];
}

export function Limit(min?: number, max?: number): (target: any, propertyKey: string) => void
{
    return function (target: any, propertyKey: string): void
    {
        const ranges: Record<string, InspectorLimitData> = target[RANGE_METADATA_KEY] || {};
        ranges[propertyKey] = {
            min: min !== undefined && Number.isFinite(min) ? min : undefined,
            max: max !== undefined && Number.isFinite(max) ? max : undefined,
        };
        target[RANGE_METADATA_KEY] = ranges;
    };
}

/** @deprecated Use Limit. */
export const Range = Limit;

// @Percentage or @Percentage() — shorthand for @Limit(0, 1) (a 0..1 value the inspector renders
// with 2 decimals, see getInspectorFields).
export function Percentage(target: any, propertyKey: string): void;
export function Percentage(): (target: any, propertyKey: string) => void;
export function Percentage(target?: any, propertyKey?: string): any
{
    const apply = Limit(0, 1);
    if (typeof propertyKey === "string")
    {
        apply(target, propertyKey);
        return;
    }

    return apply;
}

// EG: @Dropdown(Bare.data.prefabs)
// OR: @Dropdown(() => new Array(1,2,3))
// OR: @Dropdown(function (this: AnimationComponent) { return this.allAnimationNamesForObject; })
export function Dropdown(values: InspectorDropdownValues): (target: any, propertyKey: string) => void
{
    return function (target: any, propertyKey: string): void
    {
        const dropdowns: Record<string, InspectorDropdownValues> = target[DROPDOWN_METADATA_KEY] || {};
        dropdowns[propertyKey] = values;
        target[DROPDOWN_METADATA_KEY] = dropdowns;
    };
}

// @Enum(CameraScaleMode) — dropdown built from an enum's members. The inspector displays the
// member NAMES while the field keeps the enum's underlying value (eg the number for numeric enums);
// the name<->value conversion happens server-side, so the renderer still sees a flat string list.
export function Enum(enumObj: Record<string, any>): (target: any, propertyKey: string) => void
{
    return function (target: any, propertyKey: string): void
    {
        const enums: Record<string, Record<string, any>> = target[ENUM_METADATA_KEY] || {};
        enums[propertyKey] = enumObj;
        target[ENUM_METADATA_KEY] = enums;
    };
}

/** Member names of an enum, dropping the numeric reverse-mapping keys that numeric enums add (0:"Cover"). */
function enumMemberNames(enumObj: Record<string, any>): string[]
{
    return Object.keys(enumObj).filter(key => isNaN(Number(key)));
}

/** Maps an enum's underlying value back to its member name (for display); returns the value if unmatched. */
function enumNameForValue(enumObj: Record<string, any>, value: any): any
{
    for (const name of enumMemberNames(enumObj))
        if (enumObj[name] === value)
            return name;
    return value;
}

/** Maps a member name (as picked in the inspector) to the enum's underlying value; passes through otherwise. */
function enumValueForName(enumObj: Record<string, any>, name: any): any
{
    if (typeof name === "string" && isNaN(Number(name)) && Object.prototype.hasOwnProperty.call(enumObj, name))
        return enumObj[name];
    return name;
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

export const Inspector = Object.freeze({
    Button: InspectorButton,
    Field: InspectorField,
    BaseClass: InspectorBaseClass,
    Class: InspectorClass,
    Locked,
    Hidden,
    Limit,
    Percentage,
    Dropdown,
    Enum,
    Decimal,
    Int,
    Label,
    Description,
});

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

export function isInspectorFieldDescriptor(value: any): boolean
{
    // Only treat a PLAIN object literal (e.g. `{ get: () => ... }`) as a descriptor. A class instance
    // such as Vec2 has its own `set`/`get` methods but is a real field value, not a descriptor wrapper.
    if (value === null || typeof value !== "object")
        return false;

    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null)
        return false;

    return "current" in value
        || "get" in value
        || "set" in value
        || "onChange" in value;
}

/** True when `name` resolves to a native getter with no setter (e.g. `get foo() {}`) anywhere up the chain. */
function isGetterOnlyAccessor(component: any, name: string): boolean
{
    for (let proto = component; proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto))
    {
        const desc = Object.getOwnPropertyDescriptor(proto, name);
        if (desc)
            return typeof desc.get === "function" && typeof desc.set !== "function";
    }
    return false;
}

function getAccessorSetter(component: any, name: string): ((value: any) => void) | undefined
{
    for (let proto = component; proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto))
    {
        const desc = Object.getOwnPropertyDescriptor(proto, name);
        if (desc)
            return desc.set;
    }
    return undefined;
}

/** A Color instance (duck-typed via toHex) — surfaced as a "color" field and edited via a hex string. */
function isColorValue(value: any): boolean
{
    return value != null && typeof value === "object" && typeof (value as any).toHex === "function";
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

/**
 * Returns the inspector fields of a component/object instance and its ancestor classes, leaving out @Hidden ones.
 * Without `serializedInMode`, every @InspectorField and @SerializeField (the in-game inspector).
 * With it, only the @SerializeField fields saved in that mode (eg the editor's prefab view).
 */
export function getInspectorFields(component: any, serializedInMode?: GameMode): InspectorFieldData[]
{
    // a subclass can redeclare a @SerializeField with other modes, so resolve them over the whole chain first
    const serializeEntries = new Map<string, SerializeFieldEntry>(getSerializeFieldEntries(component).map(entry => [entry.name, entry]));
    const hiddenFields = new Set(getHiddenFieldNames(component));

    // AGGREGATE METADATA ACROSS THE WHOLE PROTOTYPE CHAIN (parent-first) SO INHERITED @InspectorField FIELDS ARE INCLUDED.
    // Each class declares its own metadata array/record (see addField etc.), which would otherwise shadow ancestors'.
    const entries: FieldEntry[] = [];
    const indexByName = new Map<string, number>();
    const sources: Record<string, string> = {};
    const orders: Record<string, number> = {};
    const lockedFields: string[] = [];
    const ranges: Record<string, InspectorLimitData> = {};
    const dropdowns: Record<string, InspectorDropdownValues> = {};
    const enums: Record<string, Record<string, any>> = {};
    const decimals: Record<string, number> = {};
    const labels: Record<string, string> = {};
    const descriptions: Record<string, string> = {};

    for (const proto of prototypeChain(component.constructor.prototype))
    {
        if (serializedInMode === undefined && Object.prototype.hasOwnProperty.call(proto, FIELD_METADATA_KEY))
        {
            // THE CLASS THAT OWNS THIS PROTOTYPE DECLARED THESE FIELDS
            const source: string = proto.constructor?.name ?? "";
            for (const entry of (proto[FIELD_METADATA_KEY] as FieldEntry[]))
            {
                if (hiddenFields.has(entry.name))
                    continue;

                const existing = indexByName.get(entry.name);
                if (existing !== undefined)
                    entries[existing] = entry; // CHILD OVERRIDES PARENT, KEEPING PARENT'S POSITION
                else
                {
                    indexByName.set(entry.name, entries.length);
                    entries.push(entry);
                    sources[entry.name] = source; // KEEP THE POSITION-OWNING CLASS SO OVERRIDES DON'T SPLIT A GROUP
                    if (entry.order !== undefined)
                        orders[entry.name] = entry.order;
                }
            }
        }
        if (Object.prototype.hasOwnProperty.call(proto, SERIALIZE_METADATA_KEY))
        {
            // surfaced through the inspector metadata pipeline so @Int/@Limit/@Dropdown/etc. are respected
            const source: string = proto.constructor?.name ?? "";
            for (const { name } of (proto[SERIALIZE_METADATA_KEY] as SerializeFieldEntry[]))
            {
                const entry = serializeEntries.get(name)!;
                if (indexByName.has(name) || hiddenFields.has(name))
                    continue;
                if (serializedInMode !== undefined && !isSerializedInMode(entry, serializedInMode))
                    continue;

                indexByName.set(name, entries.length);
                entries.push({ name, type: "input", order: entry.order });
                sources[name] = source;
                orders[name] = entry.order;
            }
        }
        if (Object.prototype.hasOwnProperty.call(proto, LOCKED_METADATA_KEY))
            lockedFields.push(...(proto[LOCKED_METADATA_KEY] as string[]));
        if (Object.prototype.hasOwnProperty.call(proto, RANGE_METADATA_KEY))
            Object.assign(ranges, proto[RANGE_METADATA_KEY]);
        if (Object.prototype.hasOwnProperty.call(proto, DROPDOWN_METADATA_KEY))
            Object.assign(dropdowns, proto[DROPDOWN_METADATA_KEY]);
        if (Object.prototype.hasOwnProperty.call(proto, ENUM_METADATA_KEY))
            Object.assign(enums, proto[ENUM_METADATA_KEY]);
        if (Object.prototype.hasOwnProperty.call(proto, DECIMAL_METADATA_KEY))
            Object.assign(decimals, proto[DECIMAL_METADATA_KEY]);
        if (Object.prototype.hasOwnProperty.call(proto, LABEL_METADATA_KEY))
            Object.assign(labels, proto[LABEL_METADATA_KEY]);
        if (Object.prototype.hasOwnProperty.call(proto, DESCRIPTION_METADATA_KEY))
            Object.assign(descriptions, proto[DESCRIPTION_METADATA_KEY]);
    }

    const fieldData = entries.map(entry =>
    {
        const value = getFieldValue(component, entry);
        const isDescriptor = isInspectorFieldDescriptor(value);
        const descriptor = isDescriptor ? value : {};
        const enumObj = enums[entry.name];
        const dropdownValues = enumObj !== undefined
            ? enumMemberNames(enumObj)
            : resolveDropdownValues(component, dropdowns[entry.name]);

        // A descriptor with no setter (e.g. `{ get: () => ... }`) is read-only — surface it as locked
        // so the inspector shows the value without letting it be edited (which would clobber the descriptor).
        const hasSetter = isDescriptor
            && (typeof descriptor.set === "function" || typeof descriptor.onChange === "function");
        const readOnlyDescriptor = (isDescriptor && !hasSetter) || isGetterOnlyAccessor(component, entry.name);

        const range = ranges[entry.name];

        // A @Limit(0, 1) field defaults to 2 decimals (integer steps would be useless on a 0..1 range);
        // an explicit @Decimal always wins.
        let resolvedDecimals = decimals[entry.name];
        if (resolvedDecimals === undefined && range && range.min === 0 && range.max === 1)
            resolvedDecimals = 2;

        let current = isDescriptor
            ? descriptor.current ?? (typeof descriptor.get === "function" ? descriptor.get() : undefined)
            : value;

        // Enum fields store the underlying value but display the member name in the dropdown.
        if (enumObj !== undefined)
            current = enumNameForValue(enumObj, current);

        // Color values are surfaced as a "color" field and serialized to a hex string for the picker.
        const isColor = isColorValue(current);
        if (isColor)
            current = (current as any).toHex();

        let type: InspectorFieldData["type"];
        if (dropdownValues !== undefined)
            type = "dropdown";
        else if (isColor)
            type = "color";
        else if (!isDescriptor && isInspectorObjectField(value))
            type = "object";
        else
            type = entry.type;

        return {
            name: labels[entry.name] ?? entry.name,
            type,
            current,
            values: dropdownValues,
            locked: lockedFields.includes(entry.name) || readOnlyDescriptor,
            range: range,
            decimals: resolvedDecimals,
            description: descriptions[entry.name],
            source: sources[entry.name],
            order: orders[entry.name],
        };
    });

    // DON'T SURFACE FIELDS WITH NO VALUE - THE PLUGIN HAS NOTHING TO RENDER FOR THEM
    return fieldData.filter(field => field.current !== undefined);
}

/** Returns the names of every @InspectorField and @SerializeField on the instance's class and its ancestors. */
export function getInspectorFieldNames(component: any): string[]
{
    const proto = typeof component === "function" ? component.prototype : component.constructor.prototype;
    const names = new Set<string>();
    for (const p of prototypeChain(proto))
    {
        if (Object.prototype.hasOwnProperty.call(p, FIELD_METADATA_KEY))
            for (const e of (p[FIELD_METADATA_KEY] as FieldEntry[]))
                names.add(e.name);
        if (Object.prototype.hasOwnProperty.call(p, SERIALIZE_METADATA_KEY))
            for (const e of (p[SERIALIZE_METADATA_KEY] as SerializeFieldEntry[]))
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

        const serializeFields: SerializeFieldEntry[] = Object.prototype.hasOwnProperty.call(proto, SERIALIZE_METADATA_KEY)
            ? proto[SERIALIZE_METADATA_KEY] : [];
        const serializeEntry = serializeFields.find(e => e.name === fieldName || labels[e.name] === fieldName);
        if (serializeEntry)
            return { name: serializeEntry.name, type: "input" };
    }
    return undefined;
}

/** Finds the enum object registered via @Enum for a field, anywhere in the prototype chain. */
function findFieldEnum(component: any, fieldName: string): Record<string, any> | undefined
{
    for (const proto of prototypeChain(component.constructor.prototype))
    {
        const fieldEnums: Record<string, Record<string, any>> = Object.prototype.hasOwnProperty.call(proto, ENUM_METADATA_KEY)
            ? proto[ENUM_METADATA_KEY] : {};
        if (Object.prototype.hasOwnProperty.call(fieldEnums, fieldName))
            return fieldEnums[fieldName];
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
    const isDescriptor = isInspectorFieldDescriptor(fieldValue);
    const setter = isDescriptor
        ? fieldValue.set || fieldValue.onChange
        : undefined;

    // Enum fields come back as the picked member name; map it to the enum's underlying value.
    let resolvedValue = value;
    const fieldEnum = findFieldEnum(component, entry.name);
    if (fieldEnum !== undefined)
        resolvedValue = enumValueForName(fieldEnum, value);

    // Color fields come back from the inspector as a hex string; rebuild a Color if the field holds one.
    if (fieldEnum === undefined && typeof value === "string")
    {
        const current = isDescriptor
            ? fieldValue.current ?? (typeof fieldValue.get === "function" ? fieldValue.get() : undefined)
            : fieldValue;
        if (isColorValue(current))
            resolvedValue = Color.fromHex(value);
    }

    if (setter)
        await setter.call(component, resolvedValue);
    else if (isDescriptor || isGetterOnlyAccessor(component, entry.name))
        return true; // read-only (descriptor `{ get }` or native getter) — don't clobber / throw
    else
    {
        // If the field holds an object (eg a Vec2) and we got an {x,y} struct, write into the
        // existing object rather than replacing it — replacing would drop the Vec2 and its methods.
        const current = component[entry.name];
        const resolvedKeys = resolvedValue && typeof resolvedValue === "object"
            ? Object.keys(resolvedValue)
            : [];
        const isXY = resolvedKeys.length === 2
            && resolvedKeys.includes("x")
            && resolvedKeys.includes("y");

        if (isXY && current && typeof current === "object")
        {
            if ("x" in resolvedValue) current.x = resolvedValue.x;
            if ("y" in resolvedValue) current.y = resolvedValue.y;

            const nativeSetter = getAccessorSetter(component, entry.name);
            if (nativeSetter)
                nativeSetter.call(component, current);
        }
        else
            component[entry.name] = resolvedValue;
    }

    return true;
}
