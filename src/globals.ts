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
  Game,
  Editor
}

// SET UP GLOBALS
declare global
{
    type int = number;

    var bareEngine:BareEngine;

    var textureNotFoundString:string;

    var initialAssetsReady:Function;
    var initialAssets:Record<string, any>;

    var debug:boolean;

    var whiteShader:CustomGlShader;

    var rapid: Rapid;
    var isLocalhost:boolean;
    var isMobile:boolean;

    var destroyTextFunc:Function | null;

    var bare: Scene;
    var events: Emitter<Events>;
    
    var whitePixelTexture:Texture;
    var redPixelTexture:Texture;

    var hasFocus:boolean;
    var onFocusChange: (hasFocus: boolean) => void;

    function trace(message: any, ...optionalParams: any[]): void;

    function wait(seconds: number, persistent?: boolean): Promise<void>;
    function cancelWaits(): void;

    function assert(condition: boolean, message?: string): void;
}

window.debug = false;

window.onFocusChange = (hasFocus) => {};

window.trace = (message: any, ...optionalParams: any[]): void => {
    if (!isLocalhost) return;
    console.log(message, ...optionalParams);
};

window.assert = (condition: boolean, message?: string): void => {
    if (!condition)
        throw new Error(message);
};

window.isLocalhost = ['localhost'].some(domain => window.location.href.includes(domain));
//window.isLocalhost = __DEV__;
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
window.cancelWaits = (): void => { _waitGen++; };




export const controllerNames: string[] = [];

export function RegisterController(controllerClass: new (...args: any[]) => any): void
{
    const name = controllerClass.name.replace(/^_/, "");
    const controllerName = name.charAt(0).toLowerCase() + name.slice(1);

    const classKey = controllerName + "Class";
    (globalThis as any)[classKey] = controllerClass;

    controllerNames.push(controllerName);
}

export function SetControllerReferencesOnScene(scene: Scene): void
{
    for (const controllerName of controllerNames)
    {
        scene.CreateClassIfNotExist(controllerName, scene);
    }
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
    return MakePath(entity.imagePath!, (entity.texture || entity.name || ""));
}
