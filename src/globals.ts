import mitt, { type Emitter } from './libraries/mitt';
import type { BareEngine } from './bareEngine';
import type { CustomGlShader, Rapid, Texture } from './libraries/new-rapid-render';
import type { Scene } from './scenes/scene';
import type { Entity, Events } from './types/bareTypes';
import { Helper } from './utils/helper';

export const globalEvents = mitt<Events>();
//export const pipes = matt<Pipes>(); // NOT USING ANYMORE - STILL KEEPING PIPES IN ENGINE, JUST NOT REFERENCED. USER CAN STIL USE IT

export type { Scene } from './scenes/scene';

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

    var textureNotFoundString:string;

    var initialAssetsReady:Function;
    var initialAssets:Record<string, any>;

    var debug:boolean;

    var whiteShader:CustomGlShader;

    var rapid: Rapid;
    var isDev:boolean;
    var isMobile:boolean;

    var destroyTextFunc:Function | null;

    var bScene: Scene; // bare.scene... -> this.scene
    
    var whitePixelTexture:Texture;
    var redPixelTexture:Texture;

    var hasFocus:boolean;
    var onFocusChange: (hasFocus: boolean) => void;

    function trace(message: any, ...optionalParams: any[]): void;

    function wait(seconds: number, persistent?: boolean): Promise<void>;
    function waitFrame(frames?: number, persistent?: boolean): Promise<void>;
    function cancelWaits(): void;

    function assert(condition: boolean, message?: string): void;
}

window.debug = false;

window.onFocusChange = (hasFocus) => {};

window.trace = (message: any, ...optionalParams: any[]): void => {
    if (!__DEV__) return;
    console.log(message, ...optionalParams);
};

window.assert = (condition: boolean, message?: string): void => {
    if (!condition)
        throw new Error(message);
};

window.isDev = __DEV__;
window.isMobile = Helper.MobileAndTabletCheck();
    
let _waitGen = 0;
window.wait = (seconds: number, persistent = false): Promise<void> => {
    const gen = _waitGen;
    return new Promise(resolve => {
        setTimeout(() => {
            if (persistent ||_waitGen == gen)
                resolve(); 
            // ELSE... WE DON'T RESOLVE AND TIME OUT WILL STAY SUSPENDED UNTIL GC CLEANS IT UP (DOES IT?? TODO)
        }, seconds * 1000);
    });
};

type FrameWait = {
    remaining: number;
    generation: number;
    persistent: boolean;
    resolve: () => void;
};

let _frameWaits: FrameWait[] = [];
window.waitFrame = (frames: number = 1, persistent = false): Promise<void> => {
    return new Promise(resolve => {
        _frameWaits.push({
            remaining: Math.max(1, Math.ceil(frames)),
            generation: _waitGen,
            persistent,
            resolve,
        });
    });
};

// A game frame is a fixed simulation frame, not a monitor refresh. Advancing
// here ensures movement and collision callbacks have run before waitFrame()
// continuations resume, including on displays faster than the fixed timestep.
export function AdvanceFrameWaits(): void
{
    const pending: FrameWait[] = [];

    for (const frameWait of _frameWaits)
    {
        if (!frameWait.persistent && frameWait.generation !== _waitGen)
            continue;

        frameWait.remaining--;
        if (frameWait.remaining <= 0)
            frameWait.resolve();
        else
            pending.push(frameWait);
    }

    _frameWaits = pending;
}

window.cancelWaits = (): void => {
    _waitGen++;
    _frameWaits = _frameWaits.filter(frameWait => frameWait.persistent);
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
    const name = controllerClass.name.replace(/^_/, "");
    const controllerName = controllerFieldNames[name] || name.charAt(0).toLowerCase() + name.slice(1);

    const classKey = controllerName + "Class";
    (globalThis as any)[classKey] = controllerClass;

    controllerNames.push(controllerName);
}


export function MakePath(...args: string[]): string
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
