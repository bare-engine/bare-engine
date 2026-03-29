console.log("decorators.ts loaded");
const BUTTON_METADATA_KEY = "__editorButtons__";

export interface ButtonEntry
{
    label: string;
    methodKey: string;
}

export interface ButtonOptions
{
    label?: string;
    OnClick?: string;
}

function addButton(proto: object, name: string, options?: string | ButtonOptions): void
{
    const buttons: ButtonEntry[] = (proto as any)[BUTTON_METADATA_KEY] || [];

    let label = name;
    let methodKey = name;

    if (typeof options === "string")
    {
        label = options;
    }
    else if (options)
    {
        if (options.OnClick) methodKey = options.OnClick.replace("()", "");
        label = options.label || methodKey;
    }

    buttons.push({ label, methodKey });
    (proto as any)[BUTTON_METADATA_KEY] = buttons;
}

/**
 * Marks a method as an editor button.
 *
 * @Button                                     — label = method name
 * @Button("Fire")                             — label = "Fire"
 * @Button({label: "Fire", OnClick: "Fire()"}) — label + explicit method
 */
// @Button
export function Button(target: any, propertyKey: string): void;
// @Button("label")
export function Button(label: string): (target: any, propertyKey: string) => void;
// @Button({label: "Fire", OnClick: "Fire()"})
export function Button(options: ButtonOptions): (target: any, propertyKey: string) => void;
export function Button(targetOrOptions: any, propertyKey?: string): any
{
    // @Button — bare, legacy decorator called with (target, propertyKey)
    if (typeof propertyKey === "string")
    {
        addButton(targetOrOptions, propertyKey);
        return;
    }

    // @Button("label") or @Button({...}) — factory
    const options = targetOrOptions as string | ButtonOptions;
    return function (target: any, key: string): void
    {
        addButton(target, key, options);
    };
}

/** Returns all editor buttons registered on the given instance. */
export function getButtons(instance: object): { label: string; callback: () => void }[]
{
    const proto = Object.getPrototypeOf(instance);
    const entries: ButtonEntry[] = proto[BUTTON_METADATA_KEY] || [];
    return entries.map(e => ({
        label: e.label,
        callback: () => (instance as any)[e.methodKey](),
    }));
}
