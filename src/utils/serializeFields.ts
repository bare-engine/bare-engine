const SAVE_METADATA_KEY = "__saveFields__";

/**
 * Marks a member for serialization (level saving and SaveData).
 *
 * Lives outside decorators.ts on purpose: @Save carries real runtime semantics (read via
 * getSaveFields in the level serializer), so it must survive the production build that strips
 * the editor-only inspector decorators and tree-shakes decorators.ts away. Same reasoning as
 * @Run in ./runModes.ts.
 */
export function Save(target: any, propertyKey: string): void
{
    const saveFields: string[] = Object.prototype.hasOwnProperty.call(target, SAVE_METADATA_KEY)
        ? target[SAVE_METADATA_KEY]
        : [];
    if (!saveFields.includes(propertyKey))
        saveFields.push(propertyKey);

    target[SAVE_METADATA_KEY] = saveFields;
}

/** Returns the prototype chain (parent-first), stopping before Object.prototype. */
export function prototypeChain(proto: any): any[]
{
    const chain: any[] = [];
    for (let p = proto; p && p !== Object.prototype; p = Object.getPrototypeOf(p))
        chain.push(p);
    return chain.reverse();
}

/** @Save fields declared on this class only (not inherited). */
export function getOwnSaveFieldNames(classOrPrototype: any): string[]
{
    const proto = typeof classOrPrototype === "function" ? classOrPrototype.prototype : classOrPrototype;
    return Object.prototype.hasOwnProperty.call(proto, SAVE_METADATA_KEY)
        ? [...(proto[SAVE_METADATA_KEY] as string[])]
        : [];
}

/** @Save fields of the component class and its ancestors (parent-first). */
export function getSaveFields(component: any): string[]
{
    const proto = typeof component === "function" ? component.prototype : component.constructor.prototype;
    const fields: string[] = [];

    for (const p of prototypeChain(proto))
    {
        if (!Object.prototype.hasOwnProperty.call(p, SAVE_METADATA_KEY))
            continue;

        for (const field of (p[SAVE_METADATA_KEY] as string[]))
            if (!fields.includes(field))
                fields.push(field);
    }

    return fields;
}

export { SAVE_METADATA_KEY };
