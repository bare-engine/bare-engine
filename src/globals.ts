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

    function wait(seconds: number, persistent?: boolean): Promise<void>;
    function waitRealTime(seconds: number, persistent?: boolean): Promise<void>;
    function waitFrame(frames?: number, persistent?: boolean): Promise<void>;
    function cancelWaits(): void;
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

let _waitGen = 0;

// A CANCELLED WAIT (cancelWaits, EG ON A SCENE CHANGE) NEVER RESOLVES, SO CODE AFTER ITS await DOESN'T
// RUN ON A SCENE THAT'S GONE. NOTHING HOLDS ON TO IT AFTERWARDS, SO THE SUSPENDED FUNCTION IS GARBAGE COLLECTED
window.waitRealTime = (seconds: number, persistent = false): Promise<void> => {
    const gen = _waitGen;
    return new Promise(resolve => {
        setTimeout(() => {
            if (persistent || _waitGen == gen)
                resolve();
        }, seconds * 1000);
    });
};

type TimeWait = {
    until: number; // bare.gameTime TO RESOLVE AT
    generation: number;
    persistent: boolean;
    resolve: () => void;
};

let _timeWaits: TimeWait[] = [];

// GAME TIME: FOLLOWS bare.timeScale, WAITS WHILE THE GAME IS PAUSED OR FROZEN WITHOUT FOCUS
window.wait = (seconds: number, persistent = false): Promise<void> => {
    // BEFORE THE GAME LOOP RUNS (OnInit, THE FIRST SCENE'S OnAwake / OnStart) GAME TIME STANDS STILL,
    // SO A GAME-TIME WAIT WOULD NEVER END - USE REAL TIME THEN
    if (!window.bare?.loopStarted)
        return window.waitRealTime(seconds, persistent);

    return new Promise(resolve => {
        _timeWaits.push({
            until: bare.gameTime + seconds * 1000,
            generation: _waitGen,
            persistent,
            resolve,
        });
    });
};

// CALLED BY THE GAME LOOP ONCE GAME TIME HAS MOVED ON
export function AdvanceTimeWaits(gameTime: number): void
{
    if (_timeWaits.length == 0)
        return;

    const pending: TimeWait[] = [];

    for (const timeWait of _timeWaits)
    {
        if (!timeWait.persistent && timeWait.generation !== _waitGen)
            continue;

        if (timeWait.until <= gameTime)
            timeWait.resolve();
        else
            pending.push(timeWait);
    }

    _timeWaits = pending;
}

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
    _timeWaits = _timeWaits.filter(timeWait => timeWait.persistent);
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
