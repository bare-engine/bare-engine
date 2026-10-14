import mitt, { type Emitter } from './libraries/mitt';
import type { BareEngine } from './bareEngine';
import type { PluginHandler } from './handlers/pluginHandler';
import type { Rapid } from './libraries/rapid-render';
import type { Scene } from './scenes/scene';
import type { Entity, Events } from './types/bareTypes';

export const globalEvents = mitt<Events>();
//export const pipes = matt<Pipes>(); // NOT USING ANYMORE - STILL KEEPING PIPES IN ENGINE, JUST NOT REFERENCED. USER CAN STIL USE IT

export type { Scene } from './scenes/scene';

// THE LAST PRESS THAT LANDED ON A HITBOX, AND IN WHICH SCENE. SET BY HitboxController, READ BY THE
// MouseController OF EACH SCENE BELOW IT, SO A CLICK ON A BUTTON IN A UI SCENE ISN'T A CLICK IN THE GAME TOO
export const hitboxPress: { event: PointerEvent | null; scene: Scene | null } = { event: null, scene: null };

export enum GameMode
{
  Play,
  Edit
}

// SET UP GLOBALS
declare global
{
    type int = number;

    var bare:BareEngine;
    var rapid: Rapid;

    var isDev:boolean;

    var bScene: Scene; // bare.scene... -> this.scene

    var plugin: PluginHandler | undefined; // dev only, set by pluginHandler

    var initialAssetsReady:Function;
    var initialAssets:Record<string, any>;
    
    var destroyTextFunc:Function | null;

    function trace(message: any, ...optionalParams: any[]): void;
    function assert(condition: unknown, message?: string): void;

}

window.isDev = __DEV__;

window.trace = (message: any, ...optionalParams: any[]): void => {
    if (!__DEV__) return;
    console.log(message, ...optionalParams);
};

window.assert = (condition: unknown, message?: string): void => {
    if (!condition)
        throw new Error(message);
};

export const controllerNames: string[] = [];

// SCENE FIELD NAMES FOR THE BUILT-IN CONTROLLERS (scene.tween, scene.level, ...)
// CUSTOM CONTROLLERS FALL BACK TO THE DERIVED lowerFirst(className) NAME
const controllerFieldNames: Record<string, string> = {
    ObjectController: "object",
    MouseController: "mouse",
    HitboxController: "hitbox",
    TweenController: "tween",
    ComponentController: "component",
    ArcadePhysicsController: "arcade",
    SopiroPhysicsController: "sopiro",
    ParticleController: "particle",
    LevelHandler: "level",
    CameraHandler: "camera",
};

// STORES THE CLASS ON globalThis AS <fieldName>Class - Scene'S LAZY CONTROLLER GETTERS
// INSTANTIATE FROM THAT REGISTRY ON FIRST ACCESS (Scene.CreateController), SO SCENES DON'T
// NEED VALUE IMPORTS OF THE CONTROLLERS AND UNUSED CONTROLLER MODULES STAY TREE-SHAKEN
export function RegisterController(controllerClass: new (...args: any[]) => any): void
{
    const name = controllerClass.name;
    const controllerName = controllerFieldNames[name] || name.charAt(0).toLowerCase() + name.slice(1);

    const classKey = controllerName + "Class";
    (globalThis as any)[classKey] = controllerClass;

    controllerNames.push(controllerName);
}


export function MakePath(...args: (string | undefined)[]): string
{
    for (let i = args.length - 1; i >= 0; i--)
    {
        if (!args[i])
        {
            args.splice(i, 1);
        }
    }

    return args.join("/");
}

export function MakePathForEntity(entity: Entity): string
{
    return MakePath(entity.imagePath!, (entity.texture || ""));
}
