import type { ArcadePhysicsController } from "./controllers/arcadePhysicsController";
import type { ComponentController } from "./controllers/componentController";
import type { HitboxController } from "./controllers/hitboxController";
import { KeyboardController } from "./controllers/keyboardController";
import { PerfOverlay } from "./handlers/perfOverlay";
import type { MouseController } from "./controllers/mouseController";
import type { ObjectController } from "./controllers/objectController";
import type { ParticleController } from "./controllers/particleController";
import { SceneController } from "./controllers/sceneController";
import type { SopiroPhysicsController } from "./controllers/sopiroPhysicsController";
import type { TweenController } from "./controllers/tweenController";
import { AdvanceFrameWaits, AdvanceTimeWaits, GameMode, globalEvents } from "./globals";
import { assetsHandler } from "./handlers/assetsHandler";
import type { CameraHandler } from "./handlers/cameraHandler";
import type { LevelHandler } from "./handlers/levelHandler";
import { PluginHandler } from "./handlers/pluginHandler";
import { PoolHandler } from "./handlers/poolHandler";
import { SaveDataHandler } from "./handlers/SaveDataHandler";
import { SoundHandler } from "./handlers/soundHandler";
import { Emitter, EventArgs } from "./libraries/mitt";
import { Color, CustomGlShader, TextureManager, Vec2 } from "./libraries/rapid-render";
import { GameObject } from "./objects/gameObject";
import { EditorScene } from "./scenes/editorScene";
import { Scene } from "./scenes/scene";
import { UIScene, uiScene } from "./scenes/uiScene";
import { BareEvent, BareOptions, CanvasPosition, CanvasScale, Entity, Events, GameObjectClass, LevelData, SceneClass } from "./types/bareTypes";
import { getInspectorFieldNames } from "./utils/decorators";
import { GameObjectSerializer } from "./utils/entitySerializer";
import { Helper } from "./utils/helper";

export interface BareRestartOptions
{
    sceneClass?: SceneClass;
    bareOptions?: BareOptions;
    clearSaveData?: boolean;
}

// THE KEY A DEBUG KEY IS NAMED BY: event.key FOR A LETTER OR DIGIT, SO IT FOLLOWS THE KEYBOARD LAYOUT. ON A MAC, OPTION
// TURNS THE KEY INTO ANOTHER CHARACTER (OPTION+R IS ®), SO THEN USE THE KEY'S POSITION: "KeyR" IS "r"
function DebugKeyName(event: KeyboardEvent): string
{
    const key = event.key.toLowerCase();
    if (/^[a-z0-9]$/.test(key))
        return key;
    if (/^Key[A-Z]$/.test(event.code))
        return event.code.slice(3).toLowerCase();
    if (/^Digit[0-9]$/.test(event.code))
        return event.code.slice(5);
    return key == " " ? "space" : key;
}

export class BareEngine
{
    private initialSceneClass!: SceneClass;
    private restartPromise: Promise<Scene> | null = null;
    private restartOptions: BareRestartOptions = {};
    
    public lastUpdateTimeRef!: number;
    public deltaTime!: number; // SCALED BY timeScale
    public unscaledDeltaTime: number = 0;
    public timeScale: number = 1;
    public gameTime: number = 0;
    public loopStarted: boolean = false; // TRUE ONCE THE GAME LOOP RUNS, AFTER THE FIRST SCENE STARTED
    public gameSpeed!: number;

    public time: number = 0;
    public count: int = 0;

    public paused: boolean = false;
    public debug: boolean = false;
    public hasFocus: boolean = true;
    public readonly mobile: boolean = Helper.MobileAndTabletCheck(); // phone or tablet (touch device)
    public freezeOnUnfocus: boolean = true;
    public multiTouch: boolean = false;
    
    public fixedTimestep: number = 1 / 60;
    private onInit?: () => void | Promise<void>;
    public maxDeltaTime: number = 1 / 15; // CAPS FRAME DELTA, USEFUL AFTER LAG OR TAB REFOCUS
    private accumulator: number = 0;
    public fixedStepsBehind: boolean = false;
    private perfOverlay: PerfOverlay | null = null;

    private debugKeyActions = new Map<string, () => void>();
    public resolutionScale: number = 1;
    public resolution: BareOptions['resolution'];
    
    public sendEvents: boolean = true;
    
    private RunMainLoopBound!: () => void;

    public dummyGameObject!: GameObject; // JUST USED FOR DEFAULT VALUES AND DUMMY CONSTRUCTION
    
    get levelEditorOpen(): boolean { return bare.gameMode == GameMode.Edit; }
    
    public componentClasses: Record<string, any> = {};
    public componentDefaulValues: Record<string, Record<string, any>> = {};
    public gameObjectDefaultValues: Record<string, Entity> = {};

    private mouseDownOnLeave: boolean = false;
    
    public preloadedLevels: Map<string, LevelData> | null = null;
    
    public registeredClasses: Record<string, any> = {};
    public shaders: Record<string, CustomGlShader> = {};
    
    static gameObjectPoolSize: int = 50;
    gameObjectPools: Map<string, PoolHandler<GameObject>> = new Map();

    public gameMode:GameMode = GameMode.Play;

    public defaultFont:string = "";
    public defaultEngineFont:string = "monospace";

    // GLOBAL MODULES
    keyboard!:KeyboardController;
    sound!:SoundHandler;
    scene:SceneController;
    asset:typeof assetsHandler = assetsHandler;
    storage!:typeof SaveDataHandler;
    pool:Map<string, PoolHandler<GameObject>> = this.gameObjectPools;
    uiScene:UIScene = uiScene; // PROXY - LAZILY CREATES THE UI SCENE ON FIRST USE

    get util(): typeof Helper { return Helper; }
    get globalEvents(): Emitter<Events> { return globalEvents; }
    get editor(): EditorScene { return bare.scene.GetAll().find(scene => scene.constructor.name == "EditorScene") as any; }

    // ANYTHING THAT CALLS bare.[module]. EG bare.object
    // GETS TRANSFORMERD BY controllerProxyTransformer.js
    // INTO EG: this.scene.object. GETTING THE INSTANCE IN SCENE

    // SCENE MODULES
    events!:Emitter<Events>;
    object!:ObjectController;
    component!:ComponentController;
    mouse!:MouseController;
    tween!:TweenController;
    particle!:ParticleController;
    hitbox!:HitboxController;
    arcade!:ArcadePhysicsController;
    sopiro!:SopiroPhysicsController;
    level!:LevelHandler;
    camera!:CameraHandler;

    get texture(): TextureManager { return rapid.texture }
    
    rootDir: string = "";
    imageDir: string = "images";
    levelDir: string = "data/levels";
    soundDir: string = "sounds";
    dataDir: string = "data";
    fontDir: string = "fonts";

    get imagePath(): string { return this.MakeRootPath(this.imageDir); }
    get levelPath(): string { return this.MakeRootPath(this.levelDir); }
    get soundPath(): string { return this.MakeRootPath(this.soundDir); }
    get dataPath(): string { return this.MakeRootPath(this.dataDir); }
    get fontPath(): string { return this.MakeRootPath(this.fontDir); }

    get width(): int { return rapid.width; }
    get height(): int { return rapid.height; }

    get drawCircle(): typeof rapid.drawCircle {
        return rapid.drawCircle.bind(rapid);
    }
    get drawLine(): typeof rapid.drawLine {
        return rapid.drawLine.bind(rapid);
    }
    get drawGraphic(): typeof rapid.drawGraphic {
        return rapid.drawGraphic.bind(rapid);
    }
    get drawRect(): typeof rapid.drawRect {
        return rapid.drawRect.bind(rapid);
    }
    get drawRoundedRect(): typeof rapid.drawRoundedRect {
        return rapid.drawRoundedRect.bind(rapid);
    }
    get drawSprite(): typeof rapid.drawSprite {
        return rapid.drawSprite.bind(rapid);
    }

    constructor()
    {
        this.scene = new SceneController();
    }

    private MakeRootPath(dir: string): string
    {
        const rootDir = this.rootDir.replace(/\/+$/, "");
        return rootDir ? `${rootDir}/${dir}` : dir;
    }

    private ApplyOptions(options: BareOptions = {}): void
    {
        this.fixedTimestep = options.fixedTimestep ?? 1 / 60;
        this.timeScale = 1;
        this.freezeOnUnfocus = options.freezeOnUnfocus ?? true;
        this.multiTouch = options.multiTouch ?? false;
        this.resolution = options.resolution;
        this.onInit = options.OnInit;

        if (options.textureFilter !== undefined)
        {
            rapid.setTextureFilter(options.textureFilter);

            var baseTextures = new Set([...assetsHandler.textures.values()].map(texture => texture.base).filter(base => base));
            for (var baseTexture of baseTextures)
                baseTexture!.setFilterMode(rapid.gl, options.textureFilter);
        }

        if (options.backgroundColor !== undefined)
            this.SetBackgroundColor(options.backgroundColor);

        if (options.antiAlias !== undefined)
            rapid.setAntialias(options.antiAlias);

        if (options.gameObjectPoolSize !== undefined)
            BareEngine.gameObjectPoolSize = options.gameObjectPoolSize;

        this.SetDebugKeys(options.debugKeys);
    }

    // REPLACES ALL DEBUG KEYS. null OR [] TURNS THEM ALL OFF. DEV ONLY, A NO-OP IN PRODUCTION
    public SetDebugKeys(debugKeys?: BareOptions['debugKeys']): void
    {
        this.debugKeyActions.clear();

        for (const debugKeyGroup of debugKeys ?? [])
        {
            for (const [key, action] of Object.entries(debugKeyGroup))
            {
                if (action)
                    this.debugKeyActions.set(key.toLocaleLowerCase(), action);
            }
        }

        this.RefreshDebugKeysListener();
    }

    // ADDS OR CHANGES ONE DEBUG KEY, OR REMOVES IT WITH null. EG: bare.SetDebugKey("c", null)
    public SetDebugKey(key: string, action: (() => void) | null): void
    {
        if (action)
            this.debugKeyActions.set(key.toLocaleLowerCase(), action);
        else
            this.debugKeyActions.delete(key.toLocaleLowerCase());

        this.RefreshDebugKeysListener();
    }

    public rightClickSelect: boolean = true;

    public DisableRightClick(): void
    {
        this.rightClickSelect = false;
    }

    public DisableAllDebugKeys(): void
    {
        this.debugKeyActions.clear();
        this.RefreshDebugKeysListener();
    }

    public DisableDebugKey(key: string): void
    {
        this.debugKeyActions.delete(key.toLocaleLowerCase());
        this.RefreshDebugKeysListener();
    }

    private debugKeysListener: ((event: KeyboardEvent) => void) | null = null;

    // A DEBUG KEY IS NAMED "r" FOR R ON ITS OWN, OR "alt_r" FOR ALT+R. THE DEFAULTS USE ALT, SO THEY NEVER CLASH WITH GAME
    // CONTROLS (R TO ROTATE, C TO CRAFT). A CAPTURING LISTENER ON window RUNS BEFORE THE KEYBOARD CONTROLLER'S ON document,
    // SO THE GAME DOESN'T ALSO SEE THE KEY
    private RefreshDebugKeysListener(): void
    {
        if (this.debugKeysListener)
        {
            window.removeEventListener('keydown', this.debugKeysListener, true);
            this.debugKeysListener = null;
        }

        if (!__DEV__ || this.debugKeyActions.size == 0)
            return;

        this.debugKeysListener = (event: KeyboardEvent) => {
            // ONLY ON ITS OWN OR WITH ALT, SO SHORTCUTS LIKE CTRL+C KEEP WORKING. CTRL+ALT IS ALTGR ON MANY KEYBOARDS, FOR TYPING
            if (event.repeat || event.ctrlKey || event.metaKey || event.shiftKey)
                return;

            const action = this.debugKeyActions.get((event.altKey ? "alt_" : "") + DebugKeyName(event));
            if (!action)
                return;

            event.preventDefault();
            event.stopPropagation();
            action();
        };

        window.addEventListener('keydown', this.debugKeysListener, true);
    }

    public SetResolution(resolution?: BareOptions['resolution']): void
    {
        this.resolution = resolution;
        this.ResizeCanvas(this.resolution);
    }

    // SEPARATE METHOD TO MAKE ASYNC
    public async Init(sceneClass: SceneClass, options: BareOptions = {}): Promise<Scene>
    {
        this.ApplyOptions(options);

        if (__DEV__)
            PluginHandler.Init(options.showEditorButton, options.editorButtonPosition);

        this.initialSceneClass = sceneClass;
        
        // REGISTER THE WHITE PIXEL TEXTURE, HANDY FOR MANY THINGS
        assetsHandler.AddTexture("PIXEL", assetsHandler.whiteTexture);
        // GETS USED FOR COLLISION RECT ATM
        // DOWNSIDE IS THAT IT'S NOT PART OF THE ATLAS GENERATED FROM INITIAL TEXTURES (texturePackImages)
        // SO YOU GET EXTRA DRAW CALL(S)
        // YOU COULD ADD AN IMAGE IN THE texturePackImages FOLDER NAMED whitePixel AND IT WILL OVERRIDE THIS
        // BUT IF ANTI-ALIAS IS ON, THAT TEXTURE USES LINEAR FILTERING, SO STRETCHING THAT PIXEL IS NOT GREAT AND GETS BLURRY
        
        this.shaders.white = new CustomGlShader(rapid,
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

        this.ImplementInitialTextures();
        this.ResizeCanvas(this.resolution);

        window.bare = this;
        
        bare.RegisterGameObjectPool(GameObject, options.gameObjectPoolSize);

        globalEvents.emit(BareEvent.game_awake);

        await this.onInit?.();

        var scene = await bare.scene.Goto(sceneClass);

        this.dummyGameObject = new GameObject(scene); // TOO LATE IF USER WANTS TO USE IT IN sceneClass, BUT FINE FOR MY CURRENT USAGE
        
        window.addEventListener('resize', () => this.ResizeCanvas(this.resolution));

        document.addEventListener('pointerdown', this.PointerDown.bind(this), { passive: false });
        document.addEventListener('pointerup', this.PointerUp.bind(this), { passive: false });
        document.addEventListener('pointercancel', this.PointerUp.bind(this), { passive: false });
        document.addEventListener('pointerenter', this.PointerEnter.bind(this), { passive: false });
        document.addEventListener('pointerleave', this.PointerLeave.bind(this), { passive: false });
        document.addEventListener('dblclick', this.DoubleClick.bind(this), { passive: false });
        document.addEventListener('pointermove', this.PointerMove.bind(this), { passive: false });
        document.addEventListener('wheel', this.Wheel.bind(this), { passive: true });

        this.RunMainLoopBound = this.RunMainLoop.bind(this);
        this.loopStarted = true;
        requestAnimationFrame(this.RunMainLoopBound);
        this.lastUpdateTimeRef = performance.now();
        
        this.SendEvent(BareEvent.game_started);

        return scene;
    }

    ImplementInitialTextures()
    {
        var entries = Object.entries(window.initialAssets);
        var entriesIgnore = new Set<string>();

        for (const [path, asset] of entries)
        {
            // FIND JSON WITH MATCHING WEBP, THEN ADD AS SPRITESHEET
            if (path.endsWith(".json"))
            {
                const json = asset;

                if (json.entitiesByLayer)
                {
                    //LEVEL
                    if (!this.preloadedLevels)
                        this.preloadedLevels = new Map<string, LevelData>();
                    
                    this.preloadedLevels.set(Helper.RemoveExtension(path), json);
                }
                else
                if (json.frames && json.meta && json.meta.image)
                {
                    // ATLAS - FIND IMAGE BASED ON JSON ATLAS
                    const jsonImagePath = path.replace(/[^/]+$/, json.meta.image);
                    const img = window.initialAssets[jsonImagePath];
                    const tex = rapid.texture.create(img, {key: jsonImagePath});
                    assetsHandler.ProcessAtlas(json, tex);

                    // ATLAS IS PROCESSED AND ADDED ANIMATIONS POTENTIALLY,
                    // MORE ANIMATION DATA LIKE FPS AND LOOP CAN BE SET LATER IN ENTITY SETTINGS PROCESS()

                    entriesIgnore.add(jsonImagePath); // PREVENT ADDING ATLAS TO TEXTURES BELOW
                }
            }
        }
        
        for (const [path, asset] of entries)
        {
            // KEEPING THE RELATIVE PATH HERE, SO THAT IF YOU CHANGE YOUR MIND
            // ABOUT LOADING AN IMAGE FROM CACHE TO STREAMING, YOU WILL ALREADY HAVE RELATIVE PATH 
            // IN YOUR CODE. IT'S REQUIRED FOR STREAMING. DOESN'T HAVE TO FOR CACHED. BUT DO IT FOR THIS REASON
            // EG: YOU NOW HAVE TO GET 🦋 WITH AddGameObject('folder/🦋') FROM THE INITIAL FOLDER (DEMO)
            var pathUnderInitial = path.replace("initial/", "");

            if (!pathUnderInitial.endsWith('.webp')) continue;
            if (entriesIgnore.has(path)) continue;
            
            // ADD REGULAR TEXTURE
            //var texture = rapid.textures.addImageFromSource(asset);
            var texture = rapid.texture.create(asset);
            var pathUnderInitialMinusExt = Helper.RemoveExtension(pathUnderInitial);
            assetsHandler.AddTexture(pathUnderInitialMinusExt, texture);
        }
    }

    ResizeCanvas(resolution?: BareOptions['resolution'])
    {
        var prevWidth = rapid.width;
        var prevHeight = rapid.height;

        var viewportSize = this.GetViewportSize();

        var gameWidth: number;
        var gameHeight: number;
        var cssWidth: number;
        var cssHeight: number;

        if (resolution?.pixelScale)
        {
            // FIT TO WINDOW, BUT RENDER AT A LOWER LOGIC RESOLUTION SO EVERYTHING APPEARS pixelScale× BIGGER.
            // CSS STAYS THE FULL VIEWPORT, AND (IN CanvasItem SCALE MODE) THE DRAWING BUFFER STAYS HIGH-RES,
            // SO MOVEMENT REMAINS SUB-PIXEL SMOOTH (NO JITTER).
            gameWidth = Math.round(viewportSize.width / resolution.pixelScale);
            gameHeight = Math.round(viewportSize.height / resolution.pixelScale);
            cssWidth = viewportSize.width;
            cssHeight = viewportSize.height;
            this.resolutionScale = resolution.pixelScale;
        }
        else
        {
            gameWidth = resolution?.width ?? viewportSize.width;
            gameHeight = resolution?.height ?? viewportSize.height;

            var scale = this.CalculateResolutionScale(resolution, gameWidth, gameHeight);
            cssWidth = gameWidth * scale;
            cssHeight = gameHeight * scale;
            this.resolutionScale = scale;
        }

        rapid.resize(
            gameWidth, gameHeight, // LOGIC SIZE
            cssWidth, cssHeight    // CSS SIZE
        );

        this.PositionCanvas(resolution, cssWidth, cssHeight);

        this.SendEvent(BareEvent.game_resize, { prevWidth: prevWidth, prevHeight: prevHeight, newWidth: gameWidth, newHeight: gameHeight });

        // PERSIST UI LAYOUT
        bare.scene.OnResize(prevWidth, prevHeight, gameWidth, gameHeight);
    }

    GetViewportSize(): { width: number, height: number }
    {
        var visualViewport = window.visualViewport;

        return {
            width: visualViewport?.width ?? document.documentElement.getBoundingClientRect().width ?? window.innerWidth,
            height: visualViewport?.height ?? document.documentElement.getBoundingClientRect().height ?? window.innerHeight
        };
    }
    
    GetCanvasScreenPosition(clientX: number, clientY: number): Vec2
    {
        const rect = rapid.canvas.getBoundingClientRect();
        const scale = this.GetCanvasCssToLogicScale(rect);

        return new Vec2(
            (clientX - rect.left) * scale.x,
            (clientY - rect.top) * scale.y
        );

        // BEFORE: 
        // return rapid.physicsToLogic(devicePixel);
        // BUT THAT DOESNT WORK IF CSS PIXEL INPUT DOES NOT MATCH RAPID'S STORED CSS SIZE
        // WAS A PROBLEM WITH UI SCENE RIGHT CLICK
    }

    // CONVERTS A CSS-PIXEL DELTA (E.G. event.movementX/Y) TO LOGIC UNITS.
    // ACCOUNTS FOR pixelScale / resolution.scale / dpr, SO MOVEMENT MATCHES WORLD POSITIONS.
    GetCanvasScreenDelta(deltaX: number, deltaY: number): Vec2
    {
        const rect = rapid.canvas.getBoundingClientRect();
        const scale = this.GetCanvasCssToLogicScale(rect);

        return new Vec2(deltaX * scale.x, deltaY * scale.y);
    }

    private GetCanvasCssToLogicScale(rect: DOMRect): Vec2
    {
        return new Vec2(
            rapid.width / (rect.width || rapid.canvas.clientWidth || rapid.width),
            rapid.height / (rect.height || rapid.canvas.clientHeight || rapid.height)
        );
    }

    private CalculateResolutionScale(resolution: BareOptions['resolution'], gameWidth: number, gameHeight: number): number
    {
        if (!resolution)
            return 1;

        if (resolution.scale == undefined)
            return 1;

        if (resolution.scale == CanvasScale.Fit)
        {
            var viewportSize = this.GetViewportSize();
            var scale = Math.min(viewportSize.width / gameWidth, viewportSize.height / gameHeight);
            
            if (resolution.integerScale)
                scale = Math.max(1, Math.floor(scale));

            return scale;
        }

        return resolution.scale;
    }

    PositionCanvas(resolution: BareOptions['resolution'], cssWidth: number, cssHeight: number)
    {
        var position = resolution?.position ?? CanvasPosition.TopLeft;

        rapid.canvas.style.position = 'absolute';

        if (position == CanvasPosition.Center)
        {
            var viewportSize = this.GetViewportSize();
            rapid.canvas.style.left = `${(viewportSize.width - cssWidth) * .5}px`;
            rapid.canvas.style.top = `${(viewportSize.height - cssHeight) * .5}px`;
            return;
        }

        rapid.canvas.style.left = '0px';
        rapid.canvas.style.top = '0px';
    }
    
    SetBackgroundColor(backgroundColor: Color)
    {
        rapid.backgroundColor = backgroundColor;
    }
    
    SetBackgroundColorHTML(backgroundColor: Color)
    {
        const pageColor = backgroundColor.a == 255 ? `rgb(${backgroundColor.r}, ${backgroundColor.g}, ${backgroundColor.b})` : "";
        document.documentElement.style.backgroundColor = pageColor;
        document.body.style.backgroundColor = pageColor;
    }

    RunMainLoop()
    {
        // SCHEDULED FIRST, SO AN ERROR IN THIS FRAME DOESN'T STOP THE GAME. IT STAYS UNCAUGHT: IT STILL SHOWS IN
        // THE CONSOLE, PAUSES THE DEBUGGER AND REACHES window.onerror
        requestAnimationFrame(this.RunMainLoopBound);

        let updating = false;

        try
        {
            if (!this.freezeOnUnfocus || this.hasFocus)
            {
                const currentTime = performance.now();
                this.unscaledDeltaTime = Math.min((currentTime - this.lastUpdateTimeRef) / 1000, this.maxDeltaTime);
                this.deltaTime = this.unscaledDeltaTime * this.timeScale;

                // WHEN FIXED STEPS COST MORE REAL TIME THAN THEY SIMULATE, CATCHING UP MAKES THE NEXT FRAME LONGER
                // STILL, AND THE FRAME RATE COLLAPSES. THEN SIMULATE ONE STEP PER FRAME: THE WHOLE GAME (PHYSICS,
                // OnUpdate, TWEENS, WAITS) SLOWS DOWN TOGETHER, BUT KEEPS RESPONDING
                if (this.fixedStepsBehind)
                    this.deltaTime = Math.min(this.deltaTime, this.fixedTimestep);
                this.lastUpdateTimeRef = currentTime;
                this.time = currentTime;
                this.gameSpeed = 1 / (this.unscaledDeltaTime / .0166666);
                this.count++;
                //trace("gameSpeed", this.gameSpeed);

                this.accumulator += this.deltaTime;

                // CAPPING ACCUMULATOR - TO PREVENT TOO MANY FIXED UPDATES AFTER LAG
                if (!this.paused)
                {
                    this.gameTime += this.deltaTime * 1000;
                    AdvanceTimeWaits(this.gameTime);

                    const maxSteps = 5 * Math.max(1, this.timeScale);
                    if (this.accumulator > this.fixedTimestep * maxSteps)
                        this.accumulator = this.fixedTimestep * maxSteps;

                    const stepsStart = performance.now();
                    let steps = 0;

                    while (this.accumulator >= this.fixedTimestep)
                    {
                        this.FixedUpdate(this.fixedTimestep);
                        AdvanceFrameWaits();
                        this.accumulator -= this.fixedTimestep;
                        steps++;
                    }

                    const fixedTime = performance.now() - stepsStart;
                    if (steps > 0)
                        this.fixedStepsBehind = fixedTime / steps > this.fixedTimestep * 1000;

                    const updateStart = __DEV__ ? performance.now() : 0;
                    updating = true;
                    this.Update(this.deltaTime);
                    updating = false;

                    if (__DEV__ && this.perfOverlay)
                        this.perfOverlay.EndUpdate(fixedTime, steps, performance.now() - updateStart);
                }

                const renderStart = __DEV__ ? performance.now() : 0;
                this.Render();

                if (__DEV__ && this.perfOverlay)
                    this.perfOverlay.EndFrame(performance.now() - renderStart, rapid.drawcallCount);
            }   
        }
        finally
        {
            // AN ERROR DURING THE UPDATE SKIPPED game_update, WHICH CLEARS THIS FRAME'S KEY PRESSES. CLEAR THEM
            // HERE, OR THE NEXT FRAME WOULD SEE THE SAME PRESSES AGAIN
            if (updating)
                this.keyboard?.Update();
        }
    }

    FixedUpdate(fixedDeltaTime: number)
    {
        bare.scene.FixedUpdate(fixedDeltaTime);
    }

    Update(deltaTime:number)
    {
        globalEvents.emit(BareEvent.game_preUpdate, { deltaTime: deltaTime });

        bare.scene.Update(deltaTime);

        globalEvents.emit(BareEvent.game_update, { deltaTime: deltaTime });
    }

    Render()
    {
        rapid.clear();
        
        rapid.matrixStack.save();
        
        globalEvents.emit(BareEvent.game_preRender);

        bare.scene.Render();

        globalEvents.emit(BareEvent.game_postRender);
        rapid.matrixStack.restore();
        
        rapid.flush();
    }


    async LoadFont(name: string, url?: string)
    {
        // SET FIRST LOADED FONT AS DEFAULT
        bare.defaultFont ||= name;

        if (!url)
            url = `${name}.ttf`; // DEFAULTING TO TTF FONT WHEN NO URL SPECIFIED

        const font = new FontFace(name, `url(${bare.fontPath}/${url})`);
        await font.load();
        (document.fonts as any).add(font); // NEEDS 'as any' FOR LINUX
    }

    // A CATCH-ALL METHOD TO REGISTER CLASSES
    // CAN BE CONTROLLER/GAMEOBJECT/COMPONENT/PHYSICS/ETC
    // DOESN'T ALWAYS DO SOMETHING, BUT JUST A HOAX TO LET THE DEV REFFERENCE THE CLASS
    AddClass(_class: any, name?: string): void
    {
        // cls.name is already the source name (vite/classNameTransformer.js). A name passed in
        // is written onto the class, so every later cls.name / instance.constructor.name read matches
        const className = name ?? _class.name;
        Object.defineProperty(_class, "name", { value: className, configurable: true });

        const existingClass = bare.registeredClasses[className];
        if (existingClass)
        {
            //console.warn(`Module ${className} is already registered`);
            if (!__DEV__ || existingClass === _class)
                return;

            // HOT RELOAD: THE MODULE RE-RAN, SO SAME NAME BUT A NEW CLASS OBJECT
            // DROP THE STALE REGISTRATION + POOL (IT HOLDS INSTANCES OF THE OLD CLASS) AND RE-REGISTER BELOW
            delete bare.registeredClasses[className];
            this.gameObjectPools.delete(className);
        }

        // CONTROLLERS
        var classNameFirstLowercase = className.charAt(0).toLowerCase() + className.slice(1);
        if ((globalThis as any)[classNameFirstLowercase])
        {
            return;
        }

        // GAMEOBJECT
        if (_class.prototype instanceof GameObject || _class === GameObject)
        {
            try {
                new _class(null); // TESTING IF CLASS CAN BE INSTANTIATED
                bare.RegisterGameObjectPool(_class, 1); // IT CAN... POOL IT
            } catch (error) {
                
            }

            GameObject.RegisterGameObject(_class);

            bare.registeredClasses[className] = _class;
            return;
        }

        // COMPONENT
        if (className.endsWith('Component'))
        {
            this.RegisterComponent(_class, name);

            //Scene.modules[className] = "taken"; // COMMENTED OUT SINCE REGISTERED COMPONENTS ARE LOCAL TO BARE, HAS TO ADD

            return;
        }

        //let instance = new _class(...args);
        //bareEngine.registeredClasses[className] = instance;
    }

    RegisterComponent(componentClass: any, name?: string)
    {
        // Same as AddClass: a name passed in is written onto the class
        const className = name ?? componentClass.name;
        Object.defineProperty(componentClass, "name", { value: className, configurable: true });

        bare.componentClasses[className] = componentClass;

        // FIND DEFAULT VALUES, THE FIELDS SerializeComponent SAVES (IN ANY MODE)
        // also the @inspectorField-only members, so the plugin can tell an authored component prop
        // that just repeats the class default from a real override. stored serialized (eg color hex)
        // to compare against settings data and SerializeComponent's output
        var component = new componentClass();
        var fieldNames = new Set([...GameObjectSerializer.GetComponentFieldNames(component), ...getInspectorFieldNames(component)]);

        var defaulValues:Record<string, any> = {};
        for (const fieldName of fieldNames)
            defaulValues[fieldName] = GameObjectSerializer.SerializeValue(component, fieldName);

        bare.componentDefaulValues[className] = defaulValues;
    }

    public GetComponentNameFromClassName(componentName: string): string
    {
        var res = Helper.DecapitalizeFirstLetter(componentName.replace('Component', '')).replace(/\d+$/, '');
        return res;
    }

    private PointerEnter(event: PointerEvent)
    {
        if (this.mouseDownOnLeave)
        if (!(event.buttons & 1))
        {
            this.PointerUp(event);
        }

        this.mouseDownOnLeave = false;
    }

    private PointerLeave(event: PointerEvent)
    {
        this.mouseDownOnLeave = (event.buttons & 1) == 1;
    }

    private PointerDown(event: PointerEvent)
    {
        if (this.MouseIsOnEditor(event))
            return;

        if (!this.IsFirstTouch(event))
            return;

        if (this.paused)
            return;

        var pos = this.GetCanvasScreenPosition(event.clientX, event.clientY);
        var isLeftButton = (event.button == 0 || event.pointerType == 'touch');

        bare.SendEvent(BareEvent.pointer_down_any, {mouseX: pos.x, mouseY: pos.y, event: event, isLeftButton: isLeftButton});

        if (isLeftButton)
            bare.SendEvent(BareEvent.pointer_down, {mouseX: pos.x, mouseY: pos.y, event: event});
        
        event.preventDefault();
    }

    private PointerUp(event: PointerEvent)
    {
        if (!this.IsFirstTouch(event))
            return;

        if (this.paused)
            return;
        
        var pos = this.GetCanvasScreenPosition(event.clientX, event.clientY);
        var isLeftButton = (event.button == 0 || event.pointerType == 'touch');

        bare.SendEvent(BareEvent.pointer_up_any, {mouseX: pos.x, mouseY: pos.y, event: event, isLeftButton: isLeftButton});
        
        if (isLeftButton)
            bare.SendEvent(BareEvent.pointer_up, {mouseX: pos.x, mouseY: pos.y, event: event });

        event.preventDefault();
    }

    private PointerMove(event: PointerEvent)
    {
        if (!this.IsFirstTouch(event))
            return;

        if (this.paused)
            return;

        var pos = this.GetCanvasScreenPosition(event.clientX, event.clientY);
        var moved = this.GetCanvasScreenDelta(event.movementX, event.movementY);
        bare.SendEvent(BareEvent.pointer_move, {mouseX: pos.x, mouseY: pos.y, movedX: moved.x, movedY: moved.y, event: event, isLeftButton: event.button == 0});

        event.preventDefault();
    }

    private DoubleClick(event: MouseEvent)
    {
        if (this.paused)
            return;
        
        var pos = this.GetCanvasScreenPosition(event.clientX, event.clientY);
        bare.SendEvent(BareEvent.pointer_doubleClick, {mouseX: pos.x, mouseY: pos.y, event: event});
    }

    private IsFirstTouch(event:PointerEvent): boolean
    {
        if (event.pointerType == 'mouse')
            return true;

        return (event.pointerType == 'touch' && (event.isPrimary || this.multiTouch));
    }
    
    SetCursor(cursorStr: string): void
    {
        rapid.canvas.style.cursor = cursorStr;
    }

    // NEEDS TO BE HERE? TODO
    // SHOWS OR HIDES A PANEL WITH FRAME TIMINGS (FPS, FIXED / UPDATE / RENDER TIME, DRAW CALLS).
    // THE F2 DEBUG KEY. DEVELOPMENT ONLY, A NO-OP IN PRODUCTION
    TogglePerfOverlay(): void
    {
        if (!__DEV__)
            return;

        this.perfOverlay ??= new PerfOverlay();
        this.perfOverlay.Toggle();
    }

    // THE LEVEL EDITOR USES THE WHEEL ITSELF, SO THE GAME DOESN'T GET IT WHILE THE EDITOR IS OPEN
    private Wheel(event: WheelEvent)
    {
        if (this.paused || this.levelEditorOpen)
            return;

        // IN PIXELS: SOME BROWSERS REPORT LINES OR PAGES
        const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16
            : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? this.height
            : 1;

        bare.SendEvent(BareEvent.pointer_wheel, { deltaX: event.deltaX * unit, deltaY: event.deltaY * unit, event: event });
    }

    MouseIsOnEditor(event: PointerEvent | WheelEvent): boolean
    {
        if (!this.levelEditorOpen)
            return false;

        const target = event.target as HTMLElement;
        var name = (target.id || target.className);

        var onEditor = (name != "canvas");

        return onEditor;
    }

    TogglePause()
    {
        bare.paused = !bare.paused;
        globalEvents.emit(BareEvent.game_pauseToggled, bare.paused);
    }


    /** Debounced - calls in the same tick collapse into one restart (last call's options win), all resolving with the new scene */
    Restart(options: BareRestartOptions = {}): Promise<Scene>
    {
        if (options.sceneClass)
            this.initialSceneClass = options.sceneClass;

        this.restartOptions = options;
        return this.restartPromise ??= this.RunRestart();
    }

    private async RunRestart(): Promise<Scene>
    {
        await new Promise(resolve => setTimeout(resolve, 0));
        this.restartPromise = null;

        const { bareOptions, clearSaveData = false } = this.restartOptions;
        bare.paused = false;

        bare.scene.Clear(true);

        if (clearSaveData)
            globalEvents.emit(BareEvent.game_completeClear);

        if (bareOptions)
            this.ApplyOptions(bareOptions);

        this.ResizeCanvas(this.resolution);

        await this.onInit?.();

        const scene = await bare.scene.Goto(this.initialSceneClass);
        this.lastUpdateTimeRef = performance.now();
        this.fixedStepsBehind = false;

        this.SendEvent(BareEvent.game_started);
        return scene;
    }

    SendEvent<K extends keyof Events>(type: K, ...event: EventArgs<Events[K]>): void
    {
        // SEND GLOBALLY
        globalEvents.emit(type, ...event);

        // SEND LOCALLY - TO ACTIVE SCENES
        var scenes = bare.scene.GetAll();
        for (var scene of scenes)
        {
            if (!scene.enabled || scene.paused) // HERE TO PREVENT INPUT ON DISABLED SCENES, FOR ONE
                continue;

            scene.events.emit(type, ...event);
        }
    }
    
    RegisterGameObjectPool(cls: GameObjectClass, defaultPoolSize: number = 10): void
    {
        const className = cls.name;

        const pool = this.gameObjectPools.get(className);
        if (pool)
        {
            if (pool.GetSize() < defaultPoolSize)
                pool.Create(defaultPoolSize - pool.GetSize());
            return;
        }

        this.gameObjectPools.set(className, new PoolHandler(() => new cls(null), defaultPoolSize));// NOT ON SCENE YET - SCENE PROP WILL GET SET IN GetObjectFromPool()
    }

    GetObjectFromPool(objectName: string, scene: Scene): GameObject
    {
        var pool = this.gameObjectPools.get(objectName);
        if (!pool)
        {
            throw new Error(`No pool found for ${objectName}\n
            Add bareEngine.AddClass(${objectName}) to register a class for this object type.\n
            Or bareEngine.RegisterGameObjectPool(${objectName}, 10) to register a pool for this object type.`);
            //this.RegisterGameObjectPool(objectName, () => new GameObject(), 20);
        }

        var obj = pool.Grab();
        obj.scene = scene;
        obj.childrenAtPivot = GameObject.childrenAtPivotDefault;

        return obj;
    }
}

