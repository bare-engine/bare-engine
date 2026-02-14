import { sceneController } from "./controllers/sceneController";
import { globalEvents, GameMode, pipes, Scene } from "./main";
import { GameObject } from "./objects/gameObject";
import { assetsHandler } from "./handlers/assetsHandler";
import { BareEvent, SceneClass } from "./types/bareTypes";

export class BareEngine
{
    public lastUpdateTimeRef:number;
    public deltaTime: number;
    public gameSpeed: number;

    public time: number = 0;
    public count: int = 0;
    
    private RunMainLoopId: number = -1;
    private RunMainLoopBound: () => void;

    public dummyGameObject: GameObject = new GameObject(); // JUST USED FOR DEFAULT VALUES AND DUMMY CONSTRUCTION

    public isPaused: boolean = false;
    
    get levelEditorOpen(): boolean { return window.gameMode == GameMode.Editor; }
    
    public componentClasses: Record<string, any> = {};

    public isEngine: boolean = true;

    constructor(sceneClass: SceneClass)
    {
        this.Start(sceneClass);
    }

    async Start(sceneClass: SceneClass)
    {
        this.ImplementInitialTextures();
        this.ResizeCanvas();

        window.bareEngine = this;
        
        globalEvents.emit(BareEvent.game_awake);

        await sceneController.Goto(sceneClass);

        window.addEventListener('resize', this.ResizeCanvas.bind(this));

        this.RunMainLoopBound = this.RunMainLoop.bind(this);
        this.RunMainLoopId = requestAnimationFrame(this.RunMainLoopBound);
        this.lastUpdateTimeRef = performance.now();
        
        globalEvents.emit(BareEvent.game_started);
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
        var uiControllerObjs = uiController.GetLayers();
        for (var i = 0; i < uiControllerObjs.length; i++)
        {
            var objs = uiControllerObjs[i];
            for (var j = 0; j < objs.length; j++)
            {
                var obj = objs[j];
                obj.SetPosition(obj.x * newWidth / prevWidth, obj.y * newHeight / prevHeight);
            }
        }
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

            this.Update(this.deltaTime);
            this.Render();
        }   

        this.RunMainLoopId = requestAnimationFrame(this.RunMainLoopBound);
    }

    Update(deltaTime:number)
    {
        if (this.isPaused)
            return;
        
        globalEvents.emit(BareEvent.game_preUpdate, { deltaTime: deltaTime });

        pipes.run("mouseController_Update", deltaTime); // -TODO
        sceneController.Update(deltaTime);
        //objectController.Update(deltaTime);
        uiController.Update(deltaTime);

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
        
        uiController.Render();
        
        rapid.endRender();
    }

    ClearAll()
    {
        // CLEAR ALL OF BARE
        // SHOULDN'T REALLY BE NECESSARY, BUT THE DEMO PROJECT NEEDS IT SINCE IT 
        // HANDLES MULTIPLE BARE-GAME CLASSES. NOT RECOMMEND FOR OTHER PROJECTS

        //SaveDataHandler.Clear(); // DONT HARD REF THIS - TODO
        
        bare.Clear(true);
        assetsHandler.Clear();
        
        cancelAnimationFrame(this.RunMainLoopId);
        this.RunMainLoopId = -1;

        //Scene.registeredClasses = {};
        //events.clearAll();
        //pipes.clear();
    }



    
    private static controllerCallbacks: any[] = [];
    public static controllerNames: string[] = [];
    
    // THIS REGISTERS A CONTROLLER
    // A PROXY IS MADE TO BE ABLE TO REDEFINE THE GLOBAL REFERENCE OF THE CONTROLLER
    // THIS IS USED BEFORE SCENE FUNCTIONALITY IS CALLED, EG: UPDATE()
    // THEN, FOR EXAMPLE, CALLING tweenController.TweenTo(), WILL GET THE tweenController INSTANCE FROM THE SCENE
    static RegisterControllerProxy<T extends object>(controllerClass: new (...args: any[]) => T, setGlobal: boolean = true): T
    {
        var name = (controllerClass as any).name;
        
        name = controllerClass.name.replace(/^_/, ''); //REMOVE LEADING _
        const controllerName = name.charAt(0).toLowerCase() + name.slice(1); // LOWERCASE FIRST LETTER

        const classKey = controllerName + "Class";
        (globalThis as any)[classKey] = controllerClass;

        let _instance: T;

        const proxy = new Proxy({} as T, {
            get(_, prop)
            {
                if (!_instance)
                    throw new Error(
                        `${controllerClass.name} not registered. Call bare.AddClass(${controllerClass.name}) at Awake() of your game.`
                    );

                return (_instance as any)[prop];
            },
            set(_, prop, value)
            {
                (_instance as any)[prop] = value;
                return true;
            }
        });

        this.controllerNames.push(controllerName);
        this.controllerCallbacks.push((controllerArg: T) => {
            _instance = controllerArg;
            if (setGlobal)
                (globalThis as any)[controllerName] = proxy;
        });

        return proxy;
    }

    static SetControllerReferencesOnScene(scene:Scene)
    {
        window.currentSceneProcessing = scene;

        var i = 0;
        for (const callback of this.controllerCallbacks)
        {
            var controllerName = this.controllerNames[i];

            // THIS WILL INSTANTIATE THE CONTROLLER ON THE SCENE, IF THE CONTROLLER REFERENCE EXSIST
            scene.CreateClassIfNotExist(controllerName);

            // THIS PASSES ON THE CONTROLLER INSTANCE FROM THE SCENE TO THE CALLBACK
            // WHICH WILL SET IT AS THE GLOBAL REFERENCE
            callback(scene[controllerName]);

            i++;
        }
    }
}
