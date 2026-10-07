import type { ArcadePhysicsController } from "./controllers/arcadePhysicsController";
import type { ComponentController } from "./controllers/componentController";
import type { HitboxController } from "./controllers/hitboxController";
import { KeyboardController } from "./controllers/keyboardController";
import type { MouseController } from "./controllers/mouseController";
import type { ObjectController } from "./controllers/objectController";
import type { ParticleController } from "./controllers/particleController";
import { SceneController } from "./controllers/sceneController";
import type { SopiroPhysicsController } from "./controllers/sopiroPhysicsController";
import type { TweenController } from "./controllers/tweenController";
import { AdvanceFrameWaits, GameMode, globalEvents } from "./globals";
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

export class BareEngine
{
    private initialSceneClass: SceneClass;
    private restartTimeout: ReturnType<typeof setTimeout> | null = null;
    
    public lastUpdateTimeRef:number;
    public deltaTime: number;
    public gameSpeed: number;

    public time: number = 0;
    public count: int = 0;

    public paused: boolean = false;
    public debug: boolean = false;
    public hasFocus: boolean = true;
    public readonly mobile: boolean = Helper.MobileAndTabletCheck(); // phone or tablet (touch device)
    public freezeOnUnfocus: boolean = true;
    public multiTouch: boolean = false;
    
    public fixedTimestep: number = 1 / 60;
    public maxDeltaTime: number = 1 / 15; // CAPS FRAME DELTA, USEFUL AFTER LAG OR TAB REFOCUS
    private accumulator: number = 0;
    public resolutionScale: number = 1;
    public resolution: BareOptions['resolution'];
    
    public sendEvents: boolean = true;
    
    private RunMainLoopBound: () => void;

    public dummyGameObject: GameObject; // JUST USED FOR DEFAULT VALUES AND DUMMY CONSTRUCTION
    
    get levelEditorOpen(): boolean { return bare.gameMode == GameMode.Edit; }
    
    public componentClasses: Record<string, any> = {};
    public componentDefaulValues: Record<string, Record<string, any>> = {};
    public gameObjectDefaultValues: Record<string, Entity> = {};

    private mouseDownOnLeave: boolean = false;
    
    public preloadedLevels: Map<string, LevelData>;
    
    public registeredClasses: Record<string, any> = {};
    public shaders: Record<string, CustomGlShader> = {};
    
    static gameObjectPoolSize: int = 50;
    gameObjectPools: Map<string, PoolHandler<GameObject>> = new Map();

    public gameMode:GameMode = GameMode.Play;

    public defaultFont:string = "";
    public defaultEngineFont:string = "monospace";

    // GLOBAL MODULES
    keyboard:KeyboardController;
    sound:SoundHandler;
    scene:SceneController;
    asset:typeof assetsHandler = assetsHandler;
    storage:typeof SaveDataHandler;
    pool:Map<string, PoolHandler<GameObject>> = this.gameObjectPools;
    uiScene:UIScene = uiScene; // PROXY - LAZILY CREATES THE UI SCENE ON FIRST USE

    get util(): typeof Helper { return Helper; }
    get globalEvents(): Emitter<Events> { return globalEvents; }
    get editor(): EditorScene { return bare.scene.GetAll().find(scene => scene.constructor.name == "EditorScene") as any; }

    // ANYTHING THAT CALLS bare.[module]. EG bare.object
    // GETS TRANSFORMERD BY controllerProxyTransformer.js
    // INTO EG: this.scene.object. GETTING THE INSTANCE IN SCENE

    // SCENE MODULES
    events:Emitter<Events>;
    object:ObjectController;
    component:ComponentController;
    mouse:MouseController;
    tween:TweenController;
    particle:ParticleController;
    hitbox:HitboxController;
    arcade:ArcadePhysicsController;
    sopiro:SopiroPhysicsController;
    level:LevelHandler;
    camera:CameraHandler;

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

    private ApplyOptions(options?: BareOptions): void
    {
        this.fixedTimestep = options.fixedTimestep ?? 1 / 60;
        this.freezeOnUnfocus = options.freezeOnUnfocus ?? true;
        this.multiTouch = options.multiTouch ?? false;
        this.resolution = options.resolution;

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

    private SetDebugKeys(debugKeys?: BareOptions['debugKeys']): void
    {
        globalEvents.persistent.offAlias('debugKeys');

        if (!__DEV__ || !debugKeys || debugKeys.length == 0)
            return;

        const debugKeyActions = new Map<string, () => void>();

        for (const debugKeyGroup of debugKeys)
        {
            for (const [key, action] of Object.entries(debugKeyGroup))
            {
                if (action)
                    debugKeyActions.set(key.toLocaleLowerCase(), action);
            }
        }

        if (debugKeyActions.size == 0)
            return;

        var debugKeysHandler = ({ key, allKeys }: { key: string; allKeys: string[] }) => {
            if (allKeys.length > 1)
                return; // MORE THAN ONE KEY PRESSED, EG: CTRL-C

            const action = debugKeyActions.get(key.toLocaleLowerCase());
            if (action)
                action();
        };

        globalEvents.persistent.on(BareEvent.key_pressed, debugKeysHandler, 'debugKeys');
    }

    public SetResolution(resolution?: BareOptions['resolution']): void
    {
        this.resolution = resolution;
        this.ResizeCanvas(this.resolution);
    }

    // SEPARATE METHOD TO MAKE ASYNC
    public async Init(sceneClass: SceneClass, options?: BareOptions): Promise<Scene>
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

        this.RunMainLoopBound = this.RunMainLoop.bind(this);
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

    RunMainLoop()
    {
        if (!this.freezeOnUnfocus || this.hasFocus)
        {
            const currentTime = performance.now();
            this.deltaTime = Math.min((currentTime - this.lastUpdateTimeRef) / 1000, this.maxDeltaTime);
            this.lastUpdateTimeRef = currentTime;
            this.time = currentTime;
            this.gameSpeed = 1 / (this.deltaTime / .0166666);
            this.count++;
            //trace("gameSpeed", this.gameSpeed);

            this.accumulator += this.deltaTime;

            // CAPPING ACCUMULATOR - TO PREVENT TOO MANY FIXED UPDATES AFTER LAG
            if (!this.paused)
            {
                if (this.accumulator > this.fixedTimestep * 5)
                    this.accumulator = this.fixedTimestep * 5;

                while (this.accumulator >= this.fixedTimestep)
                {
                    this.FixedUpdate(this.fixedTimestep);
                    AdvanceFrameWaits();
                    this.accumulator -= this.fixedTimestep;
                }

                this.Update(this.deltaTime);
            }

            this.Render();
        }   

        requestAnimationFrame(this.RunMainLoopBound);
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
        // The auto-register plugin passes the true source name; for a manual
        // AddClass(Cls) we strip the decorator-added suffix off the mangled .name
        // as a best-effort guess. Either way, write it back onto cls.name so every
        // later read - cls.name, instance.constructor.name, GetNameFromClass - is clean.
        const className = name ?? Helper.GetNameFromClass(_class);
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
        // The components plugin calls this directly with the true source name; for a
        // direct call without one, strip the decorator-added suffix off .name. Write
        // it back so every cls.name / instance.constructor.name read stays clean.
        const className = name ?? Helper.GetNameFromClass(componentClass);
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


    Restart(options: BareRestartOptions = {}): void
    {
        const {
            sceneClass,
            bareOptions,
            clearSaveData = false
        } = options;

        if (sceneClass)
            this.initialSceneClass = sceneClass;

        if (this.restartTimeout)
            clearTimeout(this.restartTimeout);

        this.restartTimeout = setTimeout(async () => {
            this.restartTimeout = null;
            bare.paused = false;
            
            bare.scene.Clear(true);

            if (clearSaveData)
                globalEvents.emit(BareEvent.game_completeClear);
            
            if (bareOptions)
                this.ApplyOptions(bareOptions);

            this.ResizeCanvas(this.resolution);
            await bare.scene.Goto(this.initialSceneClass);
            this.lastUpdateTimeRef = performance.now();

            this.SendEvent(BareEvent.game_started);
        }, 0);
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

        if (this.gameObjectPools.has(className))
        {
            // SET DIFFERENT defaultPoolSize?
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

        return obj;
    }
}

