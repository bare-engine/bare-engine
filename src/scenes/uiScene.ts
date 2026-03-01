import { sceneController } from "../controllers/sceneController";
import { Scene } from "./scene";

export class UIScene extends Scene
{
    constructor()
    {
        super({UI: true});
    }
}

function GetOrCreateUIScene(): UIScene
{
    if (!sceneController.Has(UIScene))
    {
        sceneController.Add(UIScene);
    }

    return sceneController.Get(UIScene);
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
