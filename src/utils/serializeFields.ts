// type-only: importing the GameMode value from ../globals would cycle back through mitt.ts, which uses
// the inspector decorators, and run them before decorators.ts is initialized
import type { GameMode } from "../globals";

const SERIALIZE_METADATA_KEY = "__serializeFields__";
const ORDER_COUNTER_KEY = "__inspectorOrderCounter__";

export interface SerializeFieldEntry
{
    name: string;
    /** the GameModes the field is saved (and shown in the inspector) in. empty = every mode */
    modes: GameMode[];
    order: number;
}

// Monotonic per-class declaration index. @SerializeField / @InspectorField / @InspectorClass / @InspectorButton
// decorators run in source order, so a shared counter on the prototype records the order each
// member was declared - letting the inspector render a class's members in their source order
// (e.g. field, then class, then button) instead of grouped by decorator type.
export function nextDeclarationOrder(proto: any): number
{
    const current = Object.prototype.hasOwnProperty.call(proto, ORDER_COUNTER_KEY)
        ? (proto[ORDER_COUNTER_KEY] as number)
        : 0;
    proto[ORDER_COUNTER_KEY] = current + 1;
    return current;
}

function addSerializeField(proto: any, name: string, modes: GameMode[]): void
{
    const entries: SerializeFieldEntry[] = Object.prototype.hasOwnProperty.call(proto, SERIALIZE_METADATA_KEY)
        ? proto[SERIALIZE_METADATA_KEY]
        : [];

    const existing = entries.find(entry => entry.name === name);
    if (existing)
        existing.modes = modes;
    else
        entries.push({ name, modes, order: nextDeclarationOrder(proto) });

    proto[SERIALIZE_METADATA_KEY] = entries;
}

/**
 * Saves a field into levels and shows it in the inspector.
 *
 * @SerializeField                     — saved and shown in the editor and while playing
 * @SerializeField(GameMode.Edit)      — saved and shown in the editor only (the in-game inspector still shows it)
 * @SerializeField(GameMode.Play)      — saved by bare.level.Save() and shown in game only
 *
 * Lives outside decorators.ts on purpose: @SerializeField carries real runtime semantics (read via
 * getSerializeFields in the level serializer), so it must survive the production build that strips
 * the editor-only inspector decorators and tree-shakes decorators.ts away. Same reasoning as
 * @Run in ./runModes.ts.
 */
export function SerializeField(target: any, propertyKey: string, descriptor?: PropertyDescriptor): void;
export function SerializeField(...modes: GameMode[]): (target: any, propertyKey: string, descriptor?: PropertyDescriptor) => void;
export function SerializeField(...args: any[]): any
{
    // bare @SerializeField
    if (typeof args[1] === "string")
    {
        addSerializeField(args[0], args[1], []);
        return;
    }

    const modes = args as GameMode[];
    return function (target: any, propertyKey: string): void
    {
        addSerializeField(target, propertyKey, modes);
    };
}

export function isSerializedInMode(entry: SerializeFieldEntry, mode: GameMode): boolean
{
    return entry.modes.length === 0 || entry.modes.includes(mode);
}

/** Returns the prototype chain (parent-first), stopping before Object.prototype. */
export function prototypeChain(proto: any): any[]
{
    const chain: any[] = [];
    for (let p = proto; p && p !== Object.prototype; p = Object.getPrototypeOf(p))
        chain.push(p);
    return chain.reverse();
}

/** @SerializeField entries declared on this class only (not inherited). */
export function getOwnSerializeFieldEntries(classOrPrototype: any): SerializeFieldEntry[]
{
    const proto = typeof classOrPrototype === "function" ? classOrPrototype.prototype : classOrPrototype;
    return Object.prototype.hasOwnProperty.call(proto, SERIALIZE_METADATA_KEY)
        ? [...(proto[SERIALIZE_METADATA_KEY] as SerializeFieldEntry[])]
        : [];
}

/** @SerializeField fields declared on this class only (not inherited), optionally only those saved in `mode`. */
export function getOwnSerializeFieldNames(classOrPrototype: any, mode?: GameMode): string[]
{
    return getOwnSerializeFieldEntries(classOrPrototype)
        .filter(entry => mode === undefined || isSerializedInMode(entry, mode))
        .map(entry => entry.name);
}

/**
 * @SerializeField entries of the class and its ancestors (parent-first). A subclass that redeclares a
 * field keeps the ancestor's position but its own modes.
 */
export function getSerializeFieldEntries(objOrClass: any): SerializeFieldEntry[]
{
    const proto = typeof objOrClass === "function" ? objOrClass.prototype : objOrClass.constructor.prototype;
    const entries = new Map<string, SerializeFieldEntry>();

    for (const p of prototypeChain(proto))
    {
        for (const entry of getOwnSerializeFieldEntries(p))
        {
            const existing = entries.get(entry.name);
            entries.set(entry.name, existing ? { ...existing, modes: entry.modes } : entry);
        }
    }

    return [...entries.values()];
}

/** @SerializeField fields of the class and its ancestors (parent-first), optionally only those saved in `mode`. */
export function getSerializeFields(objOrClass: any, mode?: GameMode): string[]
{
    return getSerializeFieldEntries(objOrClass)
        .filter(entry => mode === undefined || isSerializedInMode(entry, mode))
        .map(entry => entry.name);
}

/** True when the class or one of its ancestors has a @SerializeField, in any mode. */
export function hasSerializeFields(objOrClass: any): boolean
{
    return getSerializeFieldEntries(objOrClass).length > 0;
}

export { SERIALIZE_METADATA_KEY };
