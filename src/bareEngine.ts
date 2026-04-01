import { sceneController } from "./controllers/sceneController";
import { globalEvents, GameMode, Scene } from "./main";
import { GameObject } from "./objects/gameObject";
import { assetsHandler } from "./handlers/assetsHandler";
import { BareEvent, BareOptions, Events, GameObjectClass, SceneClass } from "./types/bareTypes";
import { EventArgs } from "./libraries/mitt";
import { PoolHandler } from "./handlers/poolHandler";
import { TextureCache, IGraphicRenderOptions, ICircleRenderOptions, IRenderLineOptions, IRectRenderOptions, ISpriteRenderOptions, Color } from "./exports";

export class BareEngine
{
    private initialSceneClass: SceneClass;

    public lastUpdateTimeRef:number;
    public deltaTime: number;
    public gameSpeed: number;

    public time: number = 0;
    public count: int = 0;

    public fixedTimestep: number = 1 / 60;
    private accumulator: number = 0;
    
    private RunMainLoopBound: () => void;

    public dummyGameObject: GameObject; // JUST USED FOR DEFAULT VALUES AND DUMMY CONSTRUCTION

    get levelEditorOpen(): boolean { return window.gameMode == GameMode.Editor; }
    
    public componentClasses: Record<string, any> = {};

    private mouseDownOnLeave: boolean = false;
     
    rootDir: string = "assets";
    imageDir: string = "images";
    dataDir: string = "data";
    levelDir: string = "data/levels";
    soundDir: string = "sounds";

    get imagePath(): string { return this.rootDir + "/" + this.imageDir; }
    get levelPath(): string { return this.rootDir + "/" + this.levelDir; }
    get soundPath(): string { return this.rootDir + "/" + this.soundDir; }
    get dataPath(): string { return this.rootDir + "/" + this.dataDir; }

    get width(): int { return rapid.width; }
    get height(): int { return rapid.height; }
    get textures(): TextureCache { return rapid.textures; }

    get renderGraphic(): (options: IGraphicRenderOptions) => void { return rapid.renderGraphic.bind(rapid); }
    get renderCircle(): (options: ICircleRenderOptions) => void { return rapid.renderCircle.bind(rapid); }
    get renderLine(): (options: IRenderLineOptions) => void { return rapid.renderLine.bind(rapid); }
    get renderRect(): (options: IRectRenderOptions) => void { return rapid.renderRect.bind(rapid); }
    get renderSprite(): (options: ISpriteRenderOptions) => void { return rapid.renderSprite.bind(rapid); }

    static gameObjectPoolSize: int = 50;
    gameObjectPools: Map<string, PoolHandler<GameObject>> = new Map();

    constructor(sceneClass: SceneClass, options?: BareOptions)
    {
        this.Start(sceneClass, options);
    }

    // SEPARATE METHOD TO MAKE ASYNC
    async Start(sceneClass: SceneClass, options?: BareOptions) 
    {
        if (options?.fixedTimestep)
            this.fixedTimestep = options.fixedTimestep;

        this.initialSceneClass = sceneClass;
        
        // REGISTER THE whitePixelTexture, HANDY FOR MANY THINGS
        assetsHandler.AddTexture("whitePixel", window.whitePixelTexture);
        // GETS USED FOR COLLISION RECT ATM
        // DOWNSIDE IS THAT IT'S NOT PART OF THE ATLAS GENERATED FROM INITIAL TEXTURES (texturePackImages)
        // SO YOU GET EXTRA DRAW CALL(S)
        // YOU COULD ADD AN IMAGE IN THE texturePackImages FOLDER NAMED whitePixel AND IT WILL OVERRIDE THIS
        // BUT IF ANTI-ALIAS IS ON, THAT TEXTURE USES LINEAR FILTERING, SO STRETCHING THAT PIXEL IS NOT GREAT AND GETS KINDA BLURRY
        
        this.ImplementInitialTextures();
        this.ResizeCanvas();

        window.bareEngine = this;
        
        bareEngine.RegisterGameObjectPool(GameObject, options?.gameObjectPoolSize);

        //rapid.backgroundColor = Color.White;
        
        globalEvents.emit(BareEvent.game_awake);

        var scene = await sceneController.Goto(sceneClass);

        this.dummyGameObject = new GameObject(scene); // TOO LATE IF USER WANTS TO USE IT IN sceneClass, BUT FINE FOR MY CURRENT USAGE

        window.addEventListener('resize', this.ResizeCanvas.bind(this));

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
                assetsHandler.ProcessAtlas(json, img);

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
            var texture = rapid.textures.addImageFromSource(asset);
            var nameMinusExt = name.split('.')[0];
            assetsHandler.AddTexture(nameMinusExt, texture);
        }
    }

    ResizeCanvas()
    {
        var prevWidth = rapid.width;
        var prevHeight = rapid.height;
        var newWidth = window.innerWidth;
        var newHeight = window.innerHeight;

        rapid.resize(newWidth, newHeight);

        globalEvents.emit(BareEvent.game_resize, { prevWidth: prevWidth, prevHeight: prevHeight, newWidth: newWidth, newHeight: newHeight });

        // PERSIST UI LAYOUT
        sceneController.OnResize(prevWidth, prevHeight, newWidth, newHeight);
    }

    RunMainLoop()
    {
        if (window.isLocalhost || hasFocus)
        {
            const currentTime = performance.now();
            this.deltaTime = (currentTime - this.lastUpdateTimeRef) / 1000;
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
        rapid.clear(rapid.backgroundColor);//
        
        rapid.startRender();

        rapid.save();
        
        globalEvents.emit(BareEvent.game_preRender);

        sceneController.Render();

        globalEvents.emit(BareEvent.game_postRender);
        rapid.restore();
        
        rapid.endRender();
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
        var scenes = sceneController.GetAllScenes();
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


    
    public static controllerNames: string[] = [];
    
    static RegisterController(controllerClass: new (...args: any[]) => any): void
    {
        var name = (controllerClass as any).name;
        
        name = controllerClass.name.replace(/^_/, ''); //REMOVE LEADING _
        const controllerName = name.charAt(0).toLowerCase() + name.slice(1); // LOWERCASE FIRST LETTER

        const classKey = controllerName + "Class";
        (globalThis as any)[classKey] = controllerClass;

        this.controllerNames.push(controllerName);
    }

    static SetControllerReferencesOnScene(scene:Scene)
    {
        for (const controllerName of this.controllerNames)
        {
            // THIS WILL INSTANTIATE THE CONTROLLER ON THE SCENE, IF THE CONTROLLER REFERENCE EXSIST
            scene.CreateClassIfNotExist(controllerName, scene);
        }
    }
}
