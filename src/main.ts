
import { BareEngine } from './bareEngine';
import { BaseTexture, Color, CustomGlShader, Rapid, Texture, TextureFilterMode } from './libraries/new-rapid-render';
import { supportsWebGL } from './libraries/new-rapid-render/webgl/utils';
import { BareEvent, BareOptions, SceneClass } from './types/bareTypes';
import { globalEvents, Scene } from './globals';
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
        imagePath: '',
        levelPath: '',
        textureFilter: TextureFilterMode.LINEAR,
        editorButtonPosition: {x: 0, y: 0},
        showEditorButton: undefined,
        debugKeys: [
            {e: () => window.debug = !window.debug},
            {p: () => {
                bare.TogglePause();
            }},
            {r: () => bare.Restart()},
            {l: () => bare.scene.GetLevelScene()?.level.Restart()},
        ],
    }, ...options };
}

export function StartBare(gameClass: SceneClass, options?: BareOptions): Promise<Scene>
{
    // DEFAULTS + OVERRIDE OPTIONS
    options = GetBareOptions(options);

    if (__DEV__ && window.bare) {
        bare.Restart(gameClass, options);
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

            window.whiteShader = new CustomGlShader(rapid,
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

            const glTexture2: WebGLTexture | null = gl.createTexture();
            if (!glTexture2) { throw new Error("Failed to create texture"); }
            gl.bindTexture(gl.TEXTURE_2D, glTexture2);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 0, 0, 255]));
            const baseTexture2 = new BaseTexture(glTexture2, 1, 1);
            window.redPixelTexture = new Texture(baseTexture2);

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
                globalEvents.emit(BareEvent.game_focusChange, window.hasFocus);
                //bare.scene.SendEvent(BareEvent.game_focusChange, window.hasFocus);
            };

            window.hasFocus = true;
            /*document.addEventListener('visibilitychange', function() {
                window.hasFocus = !document.hidden;
                window.onFocusChange(hasFocus);

                if (window.hasFocus)
                    bareEngine.lastUpdateTimeRef = performance.now(); // TO PREVENT DELTA TIME FROM SHOOTING UP

                updateFocus();
            });*/

            // Additional window focus/blur events for better coverage
            /*window.addEventListener('focus', function() {
                window.hasFocus = true;
                updateFocus();
            });

            window.addEventListener('blur', function() {
                window.hasFocus = false;
                updateFocus();
            });*/

            // NO FOCUS EVENTS FOR MOBILE
            // SINCE SOMETIMES THEY FIRE ON MOBILE
            if (!isMobile)
            {
                rapid.canvas.addEventListener('focus', function() {
                    window.hasFocus = true;
                    updateFocus();
                });

                rapid.canvas.addEventListener('blur', function() {
                    window.hasFocus = false;
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

