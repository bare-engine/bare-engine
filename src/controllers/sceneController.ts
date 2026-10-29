import { EventArgs } from "../libraries/mitt";
import { globalEvents } from "../globals";
import { GameObject } from "../objects/gameObject";
import { Scene } from "../scenes/scene";
import { UIScene } from "../scenes/uiScene";
import { AwakePayload, BareEvent, Events, SceneClass } from "../types/bareTypes";

export class SceneController
{
    private currentScenes: Scene[] = [];

    constructor()
    {
    }

    init()
    {
        //pipes.set("screenController_Update", this.Update.bind(this));
        //pipes.set("screenController_Render", this.Render.bind(this));
        //events.persistent.on(BareEvent.game_clear, this.Clear.bind(this));
    }
    
    FixedUpdate(fixedDeltaTime: number): void
    {
        for (var i = this.currentScenes.length - 1; i >= 0; i--)
        {
            var scene = this.currentScenes[i];
            if (scene.started && scene.enabled && !scene.paused)
                scene.FixedUpdate(fixedDeltaTime);
        }
    }

    Update(deltaTime: number): void
    {
        // UPDATE FROM TOP TO BOTTOM SO hitbox?.Update() CLAIMS POINTER INPUT 
        // AND SKIPS REMAINING HITBOX UPDATES
        for (var i = this.currentScenes.length - 1; i >= 0; i--)
        {
            var scene = this.currentScenes[i];
            if (scene.started && scene.enabled && !scene.paused)
                scene.Update(deltaTime);
        }
    }
    
    Render(): void
    {
        for (var scene of this.currentScenes)
        {
            if (scene.started && scene.enabled)
                scene.Render();
        }
    }

    async Goto<T extends Scene>(sceneClass: SceneClass<T>, payload?: AwakePayload<T>): Promise<T>
    {
        this.Clear();
        var scene = await this.Add(sceneClass, payload);

        return scene;
    }

    /** Recommended to await this method */
    async Add<T extends Scene>(scene: T | SceneClass<T>, payload?: AwakePayload<T>): Promise<T>
    {
        const sceneClass: SceneClass<T> = typeof scene === "function" ? scene : scene.constructor as SceneClass<T>;
        if (this.Has(sceneClass))
        {
            //console.warn("SceneController: Scene already added: " + (scene as SceneClass<T>).name + ". It will be replaced");
            this.Remove(scene);
        }

        var sceneInstance: T;
        if (typeof scene === "function")
        {
            sceneInstance = new scene();
        }
        else
            sceneInstance = (scene as T);

        var iInsert = this.currentScenes.length;
        if (!sceneInstance.UI)
        {
            // MAKE SURE UI SCENES ALWAYS STAY ON TOP, INSERT BELOW
            for (var i = 0; i < this.currentScenes.length; i++)
            {
                if (this.currentScenes[i].UI)
                {
                    iInsert = i;
                    break;
                }
            }
        }
        this.currentScenes.splice(iInsert, 0, sceneInstance);
        

        if (sceneInstance.solo)
            this.DisableAll();

        await sceneInstance.Awake(payload); // WILL ENABLE THE SCENE AGAIN TOO

        bare.SendEvent(BareEvent.scene_added, { scene: sceneInstance });
        bare.SendEvent(BareEvent.scene_changed, { scene: sceneInstance, type: "added" });

        return sceneInstance;
    }

    Remove<T extends Scene>(scene: Scene | SceneClass<T>, i = -1): void
    {
        const targetIndex = (i === -1)
            ? (typeof scene === "function"
                ? this.currentScenes.findIndex(current => current instanceof scene)
                : this.currentScenes.indexOf(scene))
            : i;

        if (targetIndex === -1)
            return;

        const targetScene = this.currentScenes[targetIndex];

        if (targetIndex !== -1 && targetScene)
        {
            targetScene.events.clearAll();
            targetScene.Clear();
            this.currentScenes.splice(targetIndex, 1);

            // NOT USING bare.SendEvent TO EMIT THIS TO ALL SCENES, JUST RELEVENT FOR ONE BEING REMOVED
            // BUT PROBABLY WILL NEVER LISTEN TO THIS? ONLY GLOBALLY - TODO, REMOVE?
            targetScene.events.emit(BareEvent.scene_removed, { scene: targetScene });
            targetScene.events.emit(BareEvent.scene_changed, { scene: targetScene, type: "removed" });

            globalEvents.emit(BareEvent.scene_removed, { scene: targetScene });
            globalEvents.emit(BareEvent.scene_changed, { scene: targetScene, type: "removed" });

            if (targetScene.solo)
                this.EnableAll();
        }
        else
        {
            console.warn("Scene not found");
        }
    }

    async Restart(): Promise<void>
    {
        const scenes = this.currentScenes.filter(scene => !scene.persistent);
        for (const scene of scenes)
        {
            scene.events.clear();
            scene.Clear(false);
        }
        await Promise.all(scenes.map(async scene =>
        {
            scene.RestartClasses();
            await scene.OnRestart();
            await scene.Start();
        }));
    }

    Clear(includePersistent: boolean = false): void
    {
        for (var i = this.currentScenes.length - 1; i >= 0; i--)
        {
            const scene = this.currentScenes[i];
        
            if (scene.persistent && !includePersistent)
                continue;

            this.Remove(scene, i);
        }
    }

    MoveUp<T extends Scene>(scene: Scene | SceneClass<T>): void
    {
        const index = (typeof scene === "function")
            ? this.currentScenes.findIndex(current => current instanceof scene)
            : this.currentScenes.indexOf(scene);
            
        if (index !== -1 && index < this.currentScenes.length - 1)
        {
            const targetScene = this.currentScenes[index];
            this.currentScenes.splice(index, 1);
            this.currentScenes.splice(index + 1, 0, targetScene);
        }
    }

    MoveDown<T extends Scene>(scene: Scene | SceneClass<T>): void
    {
        const index = (typeof scene === "function")
            ? this.currentScenes.findIndex(current => current instanceof scene)
            : this.currentScenes.indexOf(scene);

        if (index !== -1 && index > 0)
        {
            const targetScene = this.currentScenes[index];
            this.currentScenes.splice(index, 1);
            this.currentScenes.splice(index - 1, 0, targetScene);
        }
    }

    MoveToFront<T extends Scene>(scene: Scene | SceneClass<T>): void
    {
        const index = (typeof scene === "function")
            ? this.currentScenes.findIndex(current => current instanceof scene)
            : this.currentScenes.indexOf(scene);

        if (index !== -1)
        {
            const targetScene = this.currentScenes[index];
            this.currentScenes.splice(index, 1);
            this.currentScenes.push(targetScene);
        }
    }

    MoveToBack<T extends Scene>(scene: Scene | SceneClass<T>): void
    {
        const index = (typeof scene === "function")
            ? this.currentScenes.findIndex(current => current instanceof scene)
            : this.currentScenes.indexOf(scene);

        if (index !== -1)
        {
            const targetScene = this.currentScenes[index];
            this.currentScenes.splice(index, 1);
            this.currentScenes.unshift(targetScene);
        }
    }


    // MOVES AN OBJECT AND EVERYTHING UNDER IT TO ANOTHER SCENE. IT STAYS IN THE SAME PLACE ON THE SCREEN, AND ITS
    // CHILDREN, TWEENS AND COMPONENTS COME ALONG (THE COMPONENTS WITHOUT RUNNING THEIR LIFECYCLE AGAIN). POINTER
    // HANDLERS LIVE ON THE OBJECTS, SO THEY COME ALONG TOO.
    // DOESN'T WORK ATM FOR PHYSICS OBJECTS, WOULD ALSO NEED TO MOVE
    // ALSO DOESN'T ALTER SCALE, SO OBJECT CAN CHANGE SIZE WHEN COMING FROM A ZOOMED-IN SCENE FOR EXAMPLE. HAVE TO HANDLY THIS YOURSELF IF NEEDED
    // EG LIKE: this.go.SetScale(previousScene.camera.GetScale());
    MoveGameObjectTo(gameObject: GameObject, scene: UIScene)
    {
        const from = gameObject.scene;
        if (from == scene)
            return;

        // CONVERT POSITION BETWEEN SCENES, SO IT STAYS THE SAME
        const screenPos = from.WorldToScreen(gameObject.x, gameObject.y);
        const newWorldPos = scene.ScreenToWorld(screenPos.x, screenPos.y);
        gameObject.x = newWorldPos.x;
        gameObject.y = newWorldPos.y;

        // MOVE BETWEEN objectControllers. CHILDREN AREN'T IN ONE, THEY COME ALONG WITH THEIR PARENT
        from.object.Remove(gameObject);
        scene.object.Add(gameObject);

        // THE WHOLE SUBTREE: TWEENS, COMPONENTS, AND WHICH SCENE AND LAYER EACH OBJECT IS IN. THE CONTROLLERS ARE
        // MADE ON FIRST USE, SO THE NEW SCENE ONLY GETS ONE WHEN THERE'S SOMETHING TO MOVE INTO IT
        const layer = gameObject.layer;
        const oldTweenController = from.Has("tween") ? from.tween : null;
        const oldComponentController = from.Has("component") ? from.component : null;
        const move = (obj: GameObject) => {
            const tweens = oldTweenController?.GetAllFrom(obj) ?? [];
            if (tweens.length > 0)
            {
                oldTweenController!.RemoveAllFrom(obj);
                for (const tween of tweens)
                    scene.tween.Add(tween);
            }

            if (oldComponentController && oldComponentController.GetAllFrom(obj).length > 0)
                oldComponentController.TransferTo(obj, scene.component);

            obj.scene = scene;
            obj.layer = layer;
            for (const child of obj.children)
                move(child);
        };
        move(gameObject);
    }

    Has<T extends Scene>(sceneClass: SceneClass<T>): boolean
    {
        return this.currentScenes.some(current => current instanceof sceneClass);
    }

    Get<T extends Scene>(sceneClass: abstract new (...args: any[]) => T): T
    {
        return this.currentScenes.find(current => current instanceof sceneClass) as T;
    }

    GetAll(): Scene[]
    {
        return this.currentScenes.slice();
    }

    GetAllObjects()
    {
        return this.currentScenes
            .map(scene => scene.object)
            .flatMap(controller => controller.GetLayers().flat());
    }

    GetLevelScene(checkEnabled: boolean = true): Scene | undefined
    {
        if (checkEnabled)
        {
            var tryEnabled = this.currentScenes.find(current => current.isLevel && current.enabled);
            if (tryEnabled)
                return tryEnabled;
        }

        return this.currentScenes.find(current => current.isLevel);
    }

    GetMainScene(checkEnabled: boolean = true): Scene
    {
        return /*this.GetLevelScene(checkEnabled) || */this.currentScenes[0];
    }

    DisableAll()
    {
        for (var scene of this.currentScenes)
        {
            scene.enabled = false;
        }
    }

    EnableAll()
    {
        for (var scene of this.currentScenes)
        {
            scene.enabled = true;
        }
    }
    
    SendEvent<K extends keyof Events>(type: K, ...event: EventArgs<Events[K]>): void
    {
        for (var scene of this.currentScenes)
        {
            if (scene.started)
                scene.events.emit(type, ...event);
        }
    }

    OnResize(prevWidth: number, prevHeight: number, newWidth: number, newHeight: number)
    {
        // A SCENE THAT IS STILL STARTING CATCHES UP ONCE STARTED, IN Scene.Start
        for (var scene of this.currentScenes)
        {
            if (scene.started)
                scene.Resize(prevWidth, prevHeight, newWidth, newHeight);
        }
    }
}
