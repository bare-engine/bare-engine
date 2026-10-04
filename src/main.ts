
import { BareEngine } from './bareEngine';
import { Color, Rapid, TextureFilterMode } from './libraries/rapid-render';
import { supportsWebGL } from './libraries/rapid-render/webgl/utils';
import { BareEvent, BareOptions, SceneClass } from './types/bareTypes';
import { globalEvents, Scene } from './globals';
import { Helper } from './utils/helper';
export { MakePath, MakePathForEntity } from "./globals";

var canvas = document.querySelector<HTMLCanvasElement>("canvas.canvas");
if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.className = "canvas";
    document.body.appendChild(canvas);
}

function GetBareOptions(options?: BareOptions): BareOptions
{
    return { ...{
        antiAlias: true,
        premultipliedAlpha: true,
        gameObjectPoolSize: 50,
        freezeOnUnfocus: true,
        multiTouch: false,
        textureFilter: TextureFilterMode.LINEAR,
        editorButtonPosition: {x: 0, y: 0},
        showEditorButton: undefined,
        debugKeys: __DEV__ ? [
            {e: () => bare.debug = !bare.debug},
            {p: () => { bare.TogglePause(); }},
            {r: () => bare.Restart()},
            {l: () => bare.scene.GetLevelScene()?.level.Restart()},
            {c: () => {bare.Restart({clearSaveData: true});}},
        ] : undefined,
    }, ...options };
}

export function StartBare(gameClass: SceneClass, options?: BareOptions): Promise<Scene>
{
    // DEFAULTS + OVERRIDE OPTIONS
    options = GetBareOptions(options);

    if (__DEV__ && window.bare) {
        bare.Restart({sceneClass: gameClass, bareOptions: options});
        return Promise.resolve(undefined); // Restart is debounced (setTimeout), new scene isn't ready yet
    }

    let resolveReady: (scene: Scene) => void;
    const ready = new Promise<Scene>(resolve => { resolveReady = resolve; });

    window.initialAssetsReady = (assets:any[] = []) => {
        const doesSupportWebGL = supportsWebGL(canvas);
        if (doesSupportWebGL)
        {
            if (options.gameObjectPoolSize !== undefined)
                BareEngine.gameObjectPoolSize = options.gameObjectPoolSize;

            // START RAPID
            let rapid = new Rapid({
                canvas: canvas,
                textureFilter: options.textureFilter,
                backgroundColor: new Color(159/255, 202/255, 74/255, 255/255),
                antialias: options.antiAlias,
                premultipliedAlpha: options.premultipliedAlpha,
                roundPixels: options.roundPixels,
                scaleMode: options.scaleMode,
            });
                
            rapid.canvas.tabIndex = 0; // Make canvas focusable
            rapid.canvas.style.outline = 'none';

            document.addEventListener('click', () => {
                rapid.canvas.focus();
            });

            //document.body.appendChild(rapid.canvas);
            //rapid.canvas.style.display = "none"; // HIDE GAME, SHOWN AGAIN WHEN LOADED

            window.rapid = rapid;

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
                e.preventDefault();
            }, { passive: false });

            rapid.canvas.addEventListener('touchmove', function(e) {
                e.preventDefault();
            }, { passive: false });

            rapid.canvas.addEventListener('touchend', function(e) {
                e.preventDefault();
            }, { passive: false });

            var preventTouchDefault = (ev: TouchEvent) => {
                if (bare.MouseIsOnEditor(ev as any))
                    return;

                if (ev.type === 'touchstart')
                    rapid.canvas.focus();

                ev.preventDefault();
            };

            document.addEventListener('touchstart', preventTouchDefault, { passive: false });
            document.addEventListener('touchmove', preventTouchDefault, { passive: false });
            document.addEventListener('touchend', preventTouchDefault, { passive: false });
            document.addEventListener('touchcancel', preventTouchDefault, { passive: false });
            
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
                ev.preventDefault();

                return false;
            }, false);

            rapid.canvas.addEventListener('webglcontextlost', function(event) {
                event.preventDefault();
                window.location.reload();
            }, false);

            // HANDLE FOCUS FEEDBACK
            var updateFocus = () => {
                if (bare.levelEditorOpen)
                    return;

                // SENDS TO KEYBOARD CONTROLLER
                globalEvents.emit(BareEvent.game_focusChange, bare.hasFocus);//
                //bare.scene.SendEvent(BareEvent.game_focusChange, bare.hasFocus);
            };

            /*document.addEventListener('visibilitychange', function() {
                bare.hasFocus = !document.hidden;

                if (bare.hasFocus)
                    bareEngine.lastUpdateTimeRef = performance.now(); // TO PREVENT DELTA TIME FROM SHOOTING UP

                updateFocus();
            });*/

            // Additional window focus/blur events for better coverage
            /*window.addEventListener('focus', function() {
                bare.hasFocus = true;
                updateFocus();
            });

            window.addEventListener('blur', function() {
                bare.hasFocus = false;
                updateFocus();
            });*/

            // NO FOCUS EVENTS FOR MOBILE
            // SINCE SOMETIMES THEY FIRE ON MOBILE
            // ALSO NOT IN DEV BECAUSE BIT ANNOYING TO SEE THIS OVERLAY EVERY TIME
            if (!Helper.MobileAndTabletCheck() && !__DEV__)
            {
                rapid.canvas.addEventListener('focus', function() {
                    bare.hasFocus = true;
                    updateFocus();
                });

                rapid.canvas.addEventListener('blur', function() {
                    bare.hasFocus = false;
                    updateFocus();
                });
            }

            // START!
            var start = async () => {
                window.bare = new BareEngine();
                const scene = await window.bare.Init(gameClass, options);
                resolveReady(scene);
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
            document.getElementById("loading-progress")?.remove();
            el.innerHTML = "Can't play this game.<br>No support for WebGL.<br><br>Update your browser if possible.<br>Or try another one.";
            el.style.display = "block";
            el.style.opacity = "1";
            el.style.animationName = "none";
        }
    }

    if (window.initialAssets)
    {
        // IN CASE INITIAL ASSETS ARE ALREADY LOADED, TRIGGER RIGHT AWAY
        window.initialAssetsReady(window.initialAssets);
    }

    return ready;
}

