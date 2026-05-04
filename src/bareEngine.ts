import { sceneController } from "./controllers/sceneController";
import { PluginHandler } from "./handlers/pluginHandler";
import { GameMode, globalEvents } from "./globals";
import { assetsHandler } from "./handlers/assetsHandler";
import { PoolHandler } from "./handlers/poolHandler";
import { EventArgs } from "./libraries/mitt";
import { TextureManager, Vec2 } from "./libraries/new-rapid-render";
import { GameObject } from "./objects/gameObject";
import type { Scene } from "./scenes/scene";
import { BareEvent, BareOptions, CanvasPosition, CanvasScale, Events, GameObjectClass, SceneClass } from "./types/bareTypes";

export class BareEngine
{
    private initialSceneClass: SceneClass;

    public lastUpdateTimeRef:number;
    public deltaTime: number;
    public gameSpeed: number;

    public time: number = 0;
    public count: int = 0;

    public fixedTimestep: number = 1 / 60;
    public maxDeltaTime: number = 1 / 15; // CAPS FRAME DELTA, USEFUL AFTER LAG OR TAB REFOCUS
    private accumulator: number = 0;
    public resolutionScale: number = 1;
    
    private RunMainLoopBound: () => void;

    public dummyGameObject: GameObject; // JUST USED FOR DEFAULT VALUES AND DUMMY CONSTRUCTION

    get levelEditorOpen(): boolean { return bareEngine.gameMode == GameMode.Editor; }
    
    public componentClasses: Record<string, any> = {};

    private mouseDownOnLeave: boolean = false;
     
    rootDir: string = "assets";
    imageDir: string = "images";
    levelDir: string = "data/levels";
    soundDir: string = "sounds";
    dataDir: string = "data";
    fontDir: string = "fonts";

    get imagePath(): string { return this.rootDir + "/" + this.imageDir; }
    get levelPath(): string { return this.rootDir + "/" + this.levelDir; }
    get soundPath(): string { return this.rootDir + "/" + this.soundDir; }
    get dataPath(): string { return this.rootDir + "/" + this.dataDir; }
    get fontPath(): string { return this.rootDir + "/" + this.fontDir; }

    get width(): int { return rapid.width; }
    get height(): int { return rapid.height; }
    // get textures(): TextureCache { return rapid.textures; }
    get texture(): TextureManager { return rapid.texture }

    // get renderGraphic(): (options: IGraphicRenderOptions) => void { return rapid.renderGraphic.bind(rapid); }
    // get renderCircle(): (options: ICircleRenderOptions) => void { return rapid.renderCircle.bind(rapid); }
    // get renderLine(): (options: IRenderLineOptions) => void { return rapid.renderLine.bind(rapid); }
    // get renderRect(): (options: IRectRenderOptions) => void { return rapid.renderRect.bind(rapid); }
    // get renderSprite(): (options: ISpriteRenderOptions) => void { return rapid.renderSprite.bind(rapid); }

    get drawPolygon(): typeof rapid.drawPolygon {
        return rapid.drawPolygon.bind(rapid);
    }
    get drawCircle(): typeof rapid.drawCircle {
        return rapid.drawCircle.bind(rapid);
    }
    get drawLine(): typeof rapid.drawLine {
        return rapid.drawLine.bind(rapid);
    }
    get drawRect(): typeof rapid.drawRect {
        return rapid.drawRect.bind(rapid);
    }
    get drawSprite(): typeof rapid.drawSprite {
        return rapid.drawSprite.bind(rapid);
    }
    
    static gameObjectPoolSize: int = 50;
    gameObjectPools: Map<string, PoolHandler<GameObject>> = new Map();

    public gameMode:GameMode = GameMode.Game;

    public defaultFont:string = "";

    constructor(sceneClass: SceneClass, options?: BareOptions)
    {
        this.Init(sceneClass, options);
    }

    // SEPARATE METHOD TO MAKE ASYNC
    async Init(sceneClass: SceneClass, options?: BareOptions) 
    {
        if (__DEV__)
            PluginHandler.Init(options?.editorButtonPosition);
        
        if (options?.fixedTimestep)
            this.fixedTimestep = options.fixedTimestep;

        this.initialSceneClass = sceneClass;
        
        // REGISTER THE whitePixelTexture, HANDY FOR MANY THINGS
        assetsHandler.AddTexture("whitePixel", window.whitePixelTexture);
        // GETS USED FOR COLLISION RECT ATM
        // DOWNSIDE IS THAT IT'S NOT PART OF THE ATLAS GENERATED FROM INITIAL TEXTURES (texturePackImages)
        // SO YOU GET EXTRA DRAW CALL(S)
        // YOU COULD ADD AN IMAGE IN THE texturePackImages FOLDER NAMED whitePixel AND IT WILL OVERRIDE THIS
        // BUT IF ANTI-ALIAS IS ON, THAT TEXTURE USES LINEAR FILTERING, SO STRETCHING THAT PIXEL IS NOT GREAT AND GETS BLURRY
        
        this.ImplementInitialTextures();
        this.ResizeCanvas(options?.resolution);

        window.bareEngine = this;
        
        bareEngine.RegisterGameObjectPool(GameObject, options?.gameObjectPoolSize);

        globalEvents.emit(BareEvent.game_awake);

        var scene = await sceneController.Goto(sceneClass);

        this.dummyGameObject = new GameObject(scene); // TOO LATE IF USER WANTS TO USE IT IN sceneClass, BUT FINE FOR MY CURRENT USAGE
        
        window.addEventListener('resize', ()=>this.ResizeCanvas(options?.resolution));

        document.addEventListener('pointerdown', this.PointerDown.bind(this), { passive: false });
        document.addEventListener('pointerup', this.PointerUp.bind(this), { passive: false });
        document.addEventListener('pointerenter', this.PointerEnter.bind(this), { passive: false });
        document.addEventListener('pointerleave', this.PointerLeave.bind(this), { passive: false });
        document.addEventListener('dblclick', this.DoubleClick.bind(this), { passive: false });
        document.addEventListener('pointermove', this.PointerMove.bind(this), { passive: false });

        this.RunMainLoopBound = this.RunMainLoop.bind(this);
        requestAnimationFrame(this.RunMainLoopBound);
        this.lastUpdateTimeRef = performance.now();
        
        this.SendEvent(BareEvent.game_started);
    }
    
    ImplementInitialTextures()
    {
        var entries = Object.entries(window.initialAssets);
        var entriesIgnore = new Set<string>();

        for (const [name, asset] of entries)
        {
            // FIND JSON WITH MATCHING WEBP, THEN ADD AS SPRITESHEET
            if (name.endsWith(".json"))
            {
                const json = window.initialAssets[name];

                if (!json.frames || !json.meta || !json.meta.image)
                    continue; // SKIP, NOT AN ATLAS

                const imgName = json.meta.image;
                const img = window.initialAssets[imgName];
                const tex = rapid.texture.create(img)
                assetsHandler.ProcessAtlas(json, tex);

                // ATLAS IS PROCESSED AND ADDED ANIMATIONS POTENTIALLY,
                // MORE ANIMATION DATA LIKE FPS AND LOOP CAN BE SET LATER IN ENTITY SETTINGS PROCESS()

                entriesIgnore.add(imgName); // PREVENT ADDING ATLAS TO TEXTURES BELOW
            }
        }
        
        for (const [name, asset] of entries)
        {
            if (!name.endsWith('.webp')) continue;
            if (entriesIgnore.has(name)) continue;
            
            // ADD REGULAR TEXTURE
            //var texture = rapid.textures.addImageFromSource(asset);
            var texture = rapid.texture.create(asset);
            var nameMinusExt = name.split('.')[0];
            assetsHandler.AddTexture(nameMinusExt, texture);
        }
    }

    ResizeCanvas(resolution?: BareOptions['resolution'])
    {
        var prevWidth = rapid.width;
        var prevHeight = rapid.height;

        var viewportSize = this.GetViewportSize();
        var gameWidth = resolution?.gameWidth ?? viewportSize.width;
        var gameHeight = resolution?.gameHeight ?? viewportSize.height;

        var scale = this.CalculateResolutionScale(resolution, gameWidth, gameHeight);
        var cssWidth = gameWidth * scale;
        var cssHeight = gameHeight * scale;
        this.resolutionScale = scale;

        rapid.resize(
            gameWidth, gameHeight, // LOGIC SIZE
            cssWidth, cssHeight    // CSS SIZE
        );

        this.PositionCanvas(resolution, cssWidth, cssHeight);

        globalEvents.emit(BareEvent.game_resize, { prevWidth: prevWidth, prevHeight: prevHeight, newWidth: gameWidth, newHeight: gameHeight });

        // PERSIST UI LAYOUT
        sceneController.OnResize(prevWidth, prevHeight, gameWidth, gameHeight);
    }

    private GetViewportSize(): { width: number, height: number }
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
        const cssPixel = new Vec2(clientX - rect.left, clientY - rect.top);
        const devicePixel = rapid.cssToDevicePixel(cssPixel);

        return rapid.physicsToLogic(devicePixel);
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

    private PositionCanvas(resolution: BareOptions['resolution'], cssWidth: number, cssHeight: number)
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

    RunMainLoop()
    {
        if (window.isLocalhost || hasFocus)
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
            if (this.accumulator > this.fixedTimestep * 5)
                this.accumulator = this.fixedTimestep * 5;

            while (this.accumulator >= this.fixedTimestep)
            {
                this.FixedUpdate(this.fixedTimestep);
                this.accumulator -= this.fixedTimestep;
            }

            this.Update(this.deltaTime);
            this.Render();
        }   

        requestAnimationFrame(this.RunMainLoopBound);
    }

    FixedUpdate(fixedDeltaTime: number)
    {
        sceneController.FixedUpdate(fixedDeltaTime);
    }

    Update(deltaTime:number)
    {
        globalEvents.emit(BareEvent.game_preUpdate, { deltaTime: deltaTime });

        sceneController.Update(deltaTime);
        //objectController.Update(deltaTime);

        globalEvents.emit(BareEvent.game_update, { deltaTime: deltaTime });
    }

    Render()
    {
        rapid.clear();//
        
        //rapid.startRender();

        rapid.matrixStack.save();
        
        globalEvents.emit(BareEvent.game_preRender);

        sceneController.Render();

        globalEvents.emit(BareEvent.game_postRender);
        rapid.matrixStack.restore();
        
        rapid.flush();
    }




    PointerEnter(event: PointerEvent)
    {
        if (this.mouseDownOnLeave)
        if (!(event.buttons & 1))
        {
            this.PointerUp(event);
        }

        this.mouseDownOnLeave = false;
    }

    PointerLeave(event: PointerEvent)
    {
        this.mouseDownOnLeave = (event.buttons & 1) == 1;
    }

    PointerDown(event: PointerEvent)
    {
        if (this.MouseIsOnEditor(event))
            return;

        if (!this.IsFirstTouch(event))
            return;

        bareEngine.SendEvent(BareEvent.pointer_down, {mouseX: event.clientX, mouseY: event.clientY, event: event, isLeftButton: event.button == 0});
            
        event.preventDefault();
    }

    PointerUp(event: PointerEvent)
    {
        if (!this.IsFirstTouch(event))
            return;
        
        bareEngine.SendEvent(BareEvent.pointer_up, {mouseX: event.clientX, mouseY: event.clientY, event: event, isLeftButton: event.button == 0});

        event.preventDefault();
    }

    PointerMove(event: PointerEvent)
    {
        if (!this.IsFirstTouch(event))
            return;

        bareEngine.SendEvent(BareEvent.pointer_move, {mouseX: event.clientX, mouseY: event.clientY, event: event, isLeftButton: event.button == 0});

        event.preventDefault();
    }

    DoubleClick(event: MouseEvent)
    {
        bareEngine.SendEvent(BareEvent.pointer_doubleClick, {mouseX: event.clientX, mouseY: event.clientY, event: event});
    }

    IsFirstTouch(event:PointerEvent): boolean
    {
        if (event.pointerType == 'mouse')
            return true;

        return (event.pointerType == 'touch' && event.isPrimary);
    }
    
    SetCursor(cursorStr: string): void
    {
        rapid.canvas.style.cursor = cursorStr;
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



    Restart(): void
    {
        globalEvents.emit(BareEvent.game_completeClear);
        
        sceneController.Clear(true);
        sceneController.Goto(this.initialSceneClass);
    }

    SendEvent<K extends keyof Events>(type: K, ...event: EventArgs<Events[K]>): void
    {
        // SEND GLOBALLY
        globalEvents.emit(type, ...event);

        // SEND LOCALLY - TO ACTIVE SCENES
        var scenes = sceneController.GetAllScenes(true);
        for (var scene of scenes)
        {
            if (!scene.enabled || scene.paused) // HERE TO PREVENT INPUT ON DISABLED SCENES, FOR ONE
                continue;

            scene.events.emit(type, ...event);
        }
    }
    
    RegisterGameObjectPool(cls: GameObjectClass, defaultPoolSize: number = 10): void
    {
        const name = cls.name.startsWith("_") ? cls.name.substring(1) : cls.name;

        if (this.gameObjectPools.has(name))
        {
            // SET DIFFERENT defaultPoolSize?
            return;
        }

        this.gameObjectPools.set(name, new PoolHandler(() => new cls(null), defaultPoolSize));// NOT ON SCENE YET - SCENE PROP WILL GET SET IN GetObjectFromPool()
    }

    GetObjectFromPool(objectName: string, scene: Scene): GameObject
    {
        var pool = this.gameObjectPools.get(objectName);
        if (!pool)
        {
            throw new Error(`No pool found for ${objectName}`);
            //this.RegisterGameObjectPool(objectName, () => new GameObject(), 20);
        }

        var obj = pool.Grab();
        obj.scene = scene;

        return obj;
    }
}
