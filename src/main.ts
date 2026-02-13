
import { Rapid, Color, Texture, GLShader, BaseTexture, RenderTexture } from './libraries/rapid-render';
import { supportsWebGL } from './libraries/rapid-render/webgl/utils';
import { ObjectController } from "./controllers/objectController";
import { Helper } from "./utils/helper";
import mitt from './libraries/mitt';
import matt from './libraries/matt';
import { Scene } from './scenes/scene';
import { Pipes, BareEvent, Events, SceneClass } from './types/bareTypes';
import { BareEngine } from './bareEngine';

export const events = mitt<Events>();
export const pipes = matt<Pipes>();

export { Scene } from './scenes/scene';

export function MakePath(...args: string[]): string
{
    // CLEAN THE EMPTY ARGS
    for (let i = args.length - 1; i >= 0; i--)
    {
        if (!args[i])
        {
            args.splice(i, 1);
        }
    }

    return args.join('/');
}

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

    var initialAssetsReady:Function;
    var initialAssets:Record<string, any>;

    var gameMode:GameMode;

    var debug:boolean;

    var whiteShader:GLShader;

    var rapid: Rapid;
    var isLocalhost:boolean;
    var isMobile:boolean;

    var destroyTextFunc:Function | null;

    var bare: Scene & BareEngine & Rapid;
    var currentSceneProcessing: Scene;
    
    var objectController:ObjectController
    var uiController:ObjectController

    var whitePixelTexture:Texture;

    var hasFocus:boolean;
    var onFocusChange: (hasFocus: boolean) => void;

    function trace(message: any, ...optionalParams: any[]): void;

    function wait(seconds: number): Promise<void>;
}

window.gameMode = GameMode.Game;

window.debug = false;

window.onFocusChange = (hasFocus) => {};

window.trace = (message: any, ...optionalParams: any[]): void => {
    if (!isLocalhost) return;
    console.log(message, ...optionalParams);
};

window.isLocalhost = ['localhost'].some(domain => window.location.href.includes(domain));
window.isMobile = Helper.MobileAndTabletCheck();
    
window.wait = (seconds: number): Promise<void> => new Promise(resolve => setTimeout(resolve, seconds * 1000));

var canvas = document.createElement("canvas");
canvas.className = "canvas";
document.body.appendChild(canvas);

export type BareOptions = {
  antiAlias?: boolean;
  premultipliedAlpha?: boolean;
  gameObjectPoolSize?: number;
  imagePath?: string;
  levelPath?: string;
};

export function StartBare(gameClass: SceneClass, options?: BareOptions): void
{
    // DEFAULTS + OVERRIDE OPTIONS
    options = { ...{
        antiAlias: true,
        premultipliedAlpha: true,
        gameObjectPoolSize: 50,
        imagePath: '',
        levelPath: ''
    }, ...options };

    // MAYBE NOT THE BEST SETTING THESE AS STATIC
    // BUT WILL DO FOR NOW TO SET THE VARS BEFORE GAME-CLASS GETS CONSTRUCTED - TODO
    if (options.imagePath)
        Scene.imagePath = options.imagePath;

    if (options.levelPath)
        Scene.levelPath = options.levelPath;

    window.initialAssetsReady =(assets = [])=>{
        const doesSupportWebGL = supportsWebGL(canvas);
        if (doesSupportWebGL)
        {
            if (options.gameObjectPoolSize !== undefined)
                Scene.gameObjectPoolSize = options.gameObjectPoolSize;

            // START RAPID
            let rapid = new Rapid({
                canvas: canvas,
                backgroundColor: new Color(159/255, 202/255, 74/255, 255/255),
                antialias: options.antiAlias ?? true,
                premultiplyAlpha: options.premultipliedAlpha ?? true
            });
                
            rapid.canvas.tabIndex = 0; // Make canvas focusable
            rapid.canvas.style.outline = 'none';

            document.addEventListener('click', () => {
                rapid.canvas.focus();
            });

            window.whiteShader = new GLShader(rapid,
                // Vertex shader (unchanged)
                `precision mediump float;
                attribute vec2 aPosition;
                attribute vec2 aRegion;
                uniform mat4 uProjectionMatrix;
                varying vec2 vRegion;
                void main(void) {
                    vRegion = aRegion;
                    gl_Position = uProjectionMatrix * vec4(aPosition, 0.0, 1.0);
                }`,
                // Fragment shader
                `precision mediump float;
                uniform sampler2D uTexture;
                uniform float uFadeTime;  // 0.0 = white, 1.0 = normal texture
                varying vec2 vRegion;
                void main(void) {
                    vec4 originalColor = texture2D(uTexture, vRegion);
                    if(originalColor.a > 0.0) { 
                        vec4 whiteColor = vec4(1.0, 1.0, 1.0, originalColor.a);
                        // Interpolate between white and original color based on fade time
                        gl_FragColor = mix(whiteColor, originalColor, uFadeTime);
                    } else {
                        gl_FragColor = vec4(0.0);
                    }
                }`
            );

            //document.body.appendChild(rapid.canvas);
            //rapid.canvas.style.display = "none"; // HIDE GAME, SHOWN AGAIN WHEN LOADED

            window.rapid = rapid;

            window.objectController = new ObjectController();
            window.uiController = new ObjectController();

            const gl = rapid.gl;
            const glTexture:WebGLTexture | null = gl.createTexture();
            if (!glTexture) {throw new Error("Failed to create texture");}
            gl.bindTexture(gl.TEXTURE_2D, glTexture);
            // Force nearest filtering for the 1x1 white pixel, even if global antialias is on.
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
            const baseTexture = new BaseTexture(glTexture, 1, 1);
            window.whitePixelTexture = new Texture(baseTexture);
            //window.whitePixelTexture = new RenderTexture(1, 1, false, Color.White);

            // PREVENT TEXT SELECTION AND IOS MAGNIFIER
            var style = (rapid.canvas.style as any);
            style['-ms-content-zooming'] = 'none';
            style['-ms-touch-action'] = 'none';
            style['touch-action'] = 'none';
            style['-webkit-touch-callout'] = 'none';
            style['-webkit-user-select'] = 'none';
            style['-khtml-user-select'] = 'none';
            style['-moz-user-select'] = 'none';
            style['-ms-user-select'] = 'none';
            style['user-select'] = 'none';
            style['-webkit-tap-highlight-color'] = 'rgba(0, 0, 0, 0)';

            // PREVENT DEFAULT TOUCH BEHAVIORS
            rapid.canvas.addEventListener('touchstart', function(e) {
                if (!bare.isPaused)
                    e.preventDefault();
            }, { passive: false });

            rapid.canvas.addEventListener('touchmove', function(e) {
                e.preventDefault();
            }, { passive: false });

            rapid.canvas.addEventListener('touchend', function(e) {
                e.preventDefault();
            }, { passive: false });
            
            // PREVENT SCROLLING WITH KEYBOARD KEYS OR MOUSE WHEEL
            var preventScrollCheck = (ev:MouseEvent | WheelEvent | KeyboardEvent)=>{
                if (!(ev instanceof KeyboardEvent) && !bare.MouseIsOnEditor(ev as any))
                    ev.preventDefault();
            };
            window.addEventListener("keydown", function(ev:KeyboardEvent) {
                if(["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].indexOf(ev.code) > -1) {
                    preventScrollCheck(ev);
                }
            }, false);
            window.addEventListener('wheel', ev => preventScrollCheck(ev), { passive: false });
                
            // PREVENT DEFAULT RIGHT CLICK MENU
            document.addEventListener('contextmenu', (ev) =>{
                if (bare.isPaused)
                    return;

                ev.preventDefault();

                return false;
            }, false);

            rapid.canvas.addEventListener('webglcontextlost', function(event) {
                event.preventDefault();
                window.location.reload();
            }, false);

            // HANDLE FOCUS FEEDBACK
            const focusOverlay = document.getElementById('focusOverlay') as HTMLElement;

            var updateFocus = () => {
                if (window.isLocalhost)
                    return; // CAN BE ANNOYING TO LOSE GAME FOCUS DURING DEVELOPEMENT, SO DISABLING IT HERE 

                if (bare.levelEditorOpen)
                    return;

                events.emit(BareEvent.game_focusChange, window.hasFocus);

                // HANDLE VISUAL OF focusOverlay
                if (window.hasFocus) {
                    focusOverlay.classList.remove('show');
                } else {
                    focusOverlay.classList.add('show');
                }
            };

            window.hasFocus = true;
            document.addEventListener('visibilitychange', function() {
                window.hasFocus = !document.hidden;
                window.onFocusChange(hasFocus);

                if (window.hasFocus)
                    bare.lastUpdateTimeRef = performance.now(); // TO PREVENT DELTA TIME FROM SHOOTING UP

                updateFocus();
            });

            // Additional window focus/blur events for better coverage
            window.addEventListener('focus', function() {
                window.hasFocus = true; 
                updateFocus();
            });

            window.addEventListener('blur', function() {
                window.hasFocus = false; 
                updateFocus();
            });

            // START!
            var start = async () => {
                window.bareEngine = new BareEngine(gameClass);
            };

            var testGetElementById = document.getElementById('editor-overlay');
            if (!testGetElementById)
            {
                // NEED TO WAIT FOR DOM CONTENT TO LOAD, SINCE BUNDLE JS LOADS ASYNC AND COULD GET HERE BEFORE DOM
                console.log("WAITING ON DOM LOAD");
                document.addEventListener('DOMContentLoaded', start);
            }
            else
            {
                start();
            }
        }
        else
        {
            var el = document.getElementById("loading-text")!;
            el.innerHTML = "Can't play this game.<br>No support for WebGL.<br><br>Update your browser if possible.<br>Or try another one.";
            el.style.opacity = "1";
            el.style.animationName = "none";
        }
    }

    if (window.initialAssets)
    {
        // IN CASE INITIAL ASSETS ARE ALREADY LOADED, TRIGGER RIGHT AWAY
        window.initialAssetsReady(window.initialAssets);
    }
}

window.bare = new Proxy({} as unknown as Scene & BareEngine & Rapid, {
    get(_, prop: string)
    {
        if (window.bareEngine?.isEngine && prop in window.bareEngine)
        {
            const v = (window.bareEngine as any)[prop];
            if (v !== undefined) return typeof v === "function" ? v.bind(window.bareEngine) : v;
        }

        if (window.rapid?.isRapid && prop in window.rapid)
        {
            const v = (window.rapid as any)[prop];
            if (v !== undefined) return typeof v === "function" ? v.bind(window.rapid) : v;
        }

        if (window.currentSceneProcessing?.isScene && prop in window.currentSceneProcessing)
        {
            const v = (window.currentSceneProcessing as any)[prop];
            return typeof v === "function" ? v.bind(window.currentSceneProcessing) : v;
        }

        return undefined;
    },

    set(_, prop: string, value)
    {
        if (window.bareEngine?.isEngine && prop in window.bareEngine)
        {
            (window.bareEngine as any)[prop] = value;
            return true;
        }

        if (window.rapid?.isRapid && prop in window.rapid)
        {
            (window.rapid as any)[prop] = value;
            return true;
        }

        if (window.currentSceneProcessing?.isScene && prop in window.currentSceneProcessing)
        {
            (window.currentSceneProcessing as any)[prop] = value;
            return true;
        }

        return false;
    }
    ,
    has(_, prop: string)
    {
        if (window.bareEngine?.isEngine && prop in window.bareEngine) return true;
        if (window.rapid?.isRapid && prop in window.rapid) return true;
        if (window.currentSceneProcessing?.isScene && prop in window.currentSceneProcessing) return true;
        return false;
    }
});
