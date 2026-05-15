import { tweenController } from "../controllers/tweenController";
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
        // UPDATE FROM TOP TO BOTTOM
        // MOSTLY SO THAT HITBOXCONTROLLER CAN DEACTIVATE HITBOXCONTROLLERS BELOW ONCE IT DETECTS MOUSE COLLISION
        var foundHitboxHover = false;
        for (var i = this.currentScenes.length - 1; i >= 0; i--)
        {
            var scene = this.currentScenes[i];
            if (scene.started && scene.enabled && !scene.paused)
            {
                scene.Update(deltaTime);

                // DEACTIVATE HITBOXCONTROLLERS BELOW
                if (!foundHitboxHover && scene.hitboxController?.GetCurrentHitboxHover())
                {
                    for (var j = i - 1; j >= 0; j--)
                    {
                        var scene = this.currentScenes[j];
                        if (scene.started && scene.enabled && !scene.paused)
                            if (scene.hitboxController)
                                scene.hitboxController.preventUpdateOneFrame = true
                    }

                    foundHitboxHover = true;
                }
            }
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

    async Add<T extends Scene>(scene: Scene | SceneClass<T>, payload?: AwakePayload<T>): Promise<T>
    {
        if (this.Has(scene as SceneClass<T>))
        {
            console.warn("SceneController: Scene already added: " + (scene as SceneClass<T>).name + ". It will be replaced");
            this.Remove(scene as SceneClass<T>);
        }

        var sceneInstance: T;
        if (typeof scene === "function")
        {
            sceneInstance = new scene();
        }
        else
            sceneInstance = (scene as T);

        // MAKE SURE UI SCENES ALWAYS STAY ON TOP, INSERT BELOW
        var iInsert = this.currentScenes.length;
        for (var i = 0; i < this.currentScenes.length; i++)
        {
            if (this.currentScenes[i].sceneOptions.UI)
            {
                iInsert = i;
                break;
            }
        }
        this.currentScenes.splice(iInsert, 0, sceneInstance);

        if (sceneInstance.sceneOptions.solo)
            this.DisableAllScenes();

        await sceneInstance.Awake(payload); // WILL ENABLE THE SCENE AGAIN TOO

        bareEngine.SendEvent(BareEvent.scene_added, { scene: sceneInstance });
        bareEngine.SendEvent(BareEvent.scene_changed, { scene: sceneInstance, type: "added" });

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

            globalEvents.emit(BareEvent.scene_removed, { scene: targetScene });
            globalEvents.emit(BareEvent.scene_changed, { scene: targetScene, type: "removed" });

            if (targetScene.sceneOptions.solo)
                this.EnableAllScenes();
        }
        else
        {
            console.warn("Scene not found");
        }
    }

    Restart()
    {
        for (var scene of sceneController.currentScenes)
        {
            if (!scene.persistent)
            {
                scene.events.clear();
                scene.Clear();
            }
        }
        for (var scene of sceneController.currentScenes)
        {
            if (!scene.persistent)
            {
                scene.Start();
            }
        }
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


    // DOESN'T WORK ATM FOR PHYSICS OBJECTS, WOULD ALSO NEED TO MOVE
    // ALSO DOESN'T ALTER SCALE, SO OBJECT CAN CHANGE SIZE WHEN COMING FROM A ZOOMED-IN SCENE FOR EXAMPLE. HAVE TO HANDLY THIS YOURSELF IF NEEDED
    // EG LIKE: this.go.SetScale(previousScene.cameraHandler.GetZoom());
    MoveGameObjectToScene(gameObject: GameObject, scene: UIScene)
    {
        if (gameObject.scene != scene)
        {
            // MOVE BETWEEN objectControllers
            gameObject.scene.objectController.Remove(gameObject);
            scene.objectController.Add(gameObject);

            // MOVE BETWEEN tweenControllers
            var tweens = gameObject.scene.tweenController.GetTweensFrom(gameObject);
            gameObject.scene.tweenController.RemoveTweensFrom(gameObject);
            for (var tween of tweens)
            {
                scene.tweenController.Add(tween);
            }

            // MOVE BETWEEN componentControllers
            var components = gameObject.scene.componentController.GetComponentsFrom(gameObject);
            gameObject.scene.componentController.RemoveComponentsFrom(gameObject);
            for (var component of components)
            {
                scene.componentController.AddComponent(gameObject, component);
            }


            // CONVERT POSITION BETWEEN SCENES, SO IT STAYS THE SAME
            const screenPos = gameObject.scene.WorldToScreen(gameObject.x, gameObject.y);
            const newWorldPos = scene.ScreenToWorld(screenPos.x, screenPos.y);
            gameObject.x = newWorldPos.x;
            gameObject.y = newWorldPos.y;

            // REDEFINE THE SCENE
            gameObject.scene = scene;
        }
    }

    Has<T extends Scene>(sceneClass: SceneClass<T>): boolean
    {
        return this.currentScenes.some(current => current instanceof sceneClass);
    }

    Get<T extends Scene>(sceneClass: SceneClass<T>): T
    {
        return this.currentScenes.find(current => current instanceof sceneClass) as T;
    }

    GetAllScenes(includeIgnored: boolean = false): Scene[]
    {
        return this.currentScenes.filter(current => includeIgnored || !current.secret);
    }

    GetAllSceneObjects()
    {
        return this.currentScenes
            .map(scene => scene.objectController)
            .flatMap(controller => controller.GetLayers().flat());
    }

    GetLevelScene(): Scene | null
    {
        var tryEnabled = this.currentScenes.find(current => current.isLevel && current.enabled);
        if (tryEnabled)
            return tryEnabled;

        return this.currentScenes.find(current => current.isLevel);
    }

    GetMainScene(): Scene
    {
        return this.GetLevelScene() || this.currentScenes[0];
    }

    DisableAllScenes()
    {
        for (var scene of this.currentScenes)
        {
            scene.enabled = false;
        }
    }

    EnableAllScenes()
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
        for (var scene of this.currentScenes)
        {
            scene.Resize(prevWidth, prevHeight, newWidth, newHeight);
        }
    }
}

export const sceneController = new SceneController();
globalThis.sceneController = sceneController;
