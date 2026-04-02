console.log("decorators.ts loaded");
const BUTTON_METADATA_KEY = "__editorButtons__";

export interface ButtonEntry
{
    label: string;
    methodKey: string;
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
// @InspectorButton
export function InspectorButton(target: any, propertyKey: string): void;
// @InspectorButton("label")
export function InspectorButton(label: string): (target: any, propertyKey: string) => void;
// @InspectorButton({label: "Fire", OnClick: "Fire()"})
export function InspectorButton(options: InspectorButtonOptions): (target: any, propertyKey: string) => void;
export function InspectorButton(targetOrOptions: any, propertyKey?: string): any
{
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
export function getButtons(componentClass: any): { label: string; callback: () => void }[]
{
    const entries: ButtonEntry[] = componentClass.prototype[BUTTON_METADATA_KEY] || [];
    return entries.map(e => ({
        label: e.label,
        callback: () => componentClass.prototype[e.methodKey](),
    }));
}
