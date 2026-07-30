import { Scene } from "./scene";

export class UIScene extends Scene
{
    constructor()
    {
        super({UI: true/*, persistent: true*/});
    }
}

function GetOrCreateUIScene(): UIScene
{
    if (!bare.scene.Has(UIScene))
    {
        bare.scene.Add(UIScene);
    }

    return bare.scene.Get(UIScene);
}

export const uiScene = new Proxy({} as UIScene, {
    get(_target, prop, _receiver)
    {
        const scene = GetOrCreateUIScene() as any;
        const value = scene[prop];
        return (typeof value === "function") ? value.bind(scene) : value;
    },
    set(_target, prop, value, _receiver)
    {
        const scene = GetOrCreateUIScene() as any;
        scene[prop] = value;
        return true;
    }
});
