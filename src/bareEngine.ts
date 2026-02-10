import { screenController } from "./controllers/screenController";
import { events, GameMode, MakePath, pipes } from "./main";
import { GameObject } from "./objects/gameObject";
import { assetsHandler } from "./utils/assetsHandler";
import { BareEvent, Entity, SettingsData } from "./utils/bareTypes";
import { SaveDataHandler } from "./utils/SaveDataHandler";

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

    constructor(gameClass)
    {
        console.log('BareEngine');
        
        this.RunMainLoopBound = this.RunMainLoop.bind(this);

        this.lastUpdateTimeRef = performance.now();
        
        window.addEventListener('resize', this.ResizeCanvas.bind(this));

        this.ResizeCanvas();
        this.ImplementInitialTextures();

        screenController.Goto(gameClass);

        this.RunMainLoopId = requestAnimationFrame(this.RunMainLoopBound);
    }

    ResizeCanvas()
    {
        var prevWidth = rapid.width;
        var prevHeight = rapid.height;
        var newWidth = window.innerWidth;
        var newHeight = window.innerHeight;

        rapid.resize(newWidth, newHeight);

        events.emit(BareEvent.game_resize, { prevWidth: prevWidth, prevHeight: prevHeight, newWidth: newWidth, newHeight: newHeight });

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
        
        events.emit(BareEvent.game_preUpdate, { deltaTime: deltaTime });

        pipes.run("mouseController_Update", deltaTime);
        pipes.run("hitboxController_Update", deltaTime);
        pipes.run("editorController_Update", deltaTime); 
        screenController.Update(deltaTime);
        objectController.Update(deltaTime);
        uiController.Update(deltaTime);
        pipes.run("physicsController_Update", deltaTime);
        pipes.run("componentController_Update", deltaTime);

        events.emit(BareEvent.game_update, { deltaTime: deltaTime });
    }

    Render()
    {
        rapid.clear(rapid.backgroundColor);//
        
        rapid.startRender();

        rapid.save();
        
        const cameraInfo = pipes.run("cameraHandler_GetRenderInfo", this.levelEditorOpen);

        // Apply the camera transform
        rapid.matrixStack.translate(cameraInfo.offset.x, cameraInfo.offset.y);
        rapid.renderCamera({
            position: cameraInfo.position,
            scale: 1 / cameraInfo.scale,
            saveTransform: false
        });
        
        events.emit(BareEvent.game_preRender);

        pipes.run("componentController_PreRender"); // ALL THIS EMITS MIGHT BE SLOW? ESPECIALLY FOR COMPONENT-CONTROLLER, SENDING MORE TO COMPONENTS
        objectController.PreRender();
        pipes.run("componentController_Render");
        screenController.Render();
        objectController.Render();
        pipes.run("physicsController_Render");
        pipes.run("componentController_PostRender");
        objectController.PostRender();

        events.emit(BareEvent.game_postRender);
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

        //BareGame.registeredClasses = {};
        //events.clearAll();
        //pipes.clear();
    }
}