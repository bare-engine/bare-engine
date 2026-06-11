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
                if (!foundHitboxHover && scene.hitbox?.GetCurrentHover())
                {
                    for (var j = i - 1; j >= 0; j--)
                    {
                        var scene = this.currentScenes[j];
                        if (scene.started && scene.enabled && !scene.paused)
                            if (scene.hitbox)
                                scene.hitbox.preventUpdateOneFrame = true
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

            if (targetScene.sceneOptions.solo)
                this.EnableAll();
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
                scene.Clear(false);
            }
        }
        for (var scene of sceneController.currentScenes)
        {
            if (!scene.persistent)
            {
                scene.RestartClasses();
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
    // EG LIKE: this.go.SetScale(previousScene.camera.GetZoom());
    MoveGameObjectTo(gameObject: GameObject, scene: UIScene)
    {
        if (gameObject.scene != scene)
        {
            // MOVE BETWEEN objectControllers
            gameObject.scene.object.Remove(gameObject);
            scene.object.Add(gameObject);

            // MOVE BETWEEN tweenControllers
            var tweens = gameObject.scene.tween.GetAllFrom(gameObject);
            gameObject.scene.tween.RemoveAllFrom(gameObject);
            for (var tween of tweens)
            {
                scene.tween.Add(tween);
            }

            // MOVE BETWEEN componentControllers
            var components = gameObject.scene.component.GetAllFrom(gameObject);
            gameObject.scene.component.RemoveAllFrom(gameObject);
            for (var component of components)
            {
                scene.component.AddComponent(gameObject, component);
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

    GetAll(includeIgnored: boolean = false): Scene[]
    {
        return this.currentScenes.filter(current => includeIgnored || !current.secret);
    }

    GetAllObjects()
    {
        return this.currentScenes
            .map(scene => scene.object)
            .flatMap(controller => controller.GetLayers().flat());
    }

    GetLevelScene(checkEnabled: boolean = true): Scene | null
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
        return this.GetLevelScene(checkEnabled) || this.currentScenes[0];
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
        for (var scene of this.currentScenes)
        {
            scene.Resize(prevWidth, prevHeight, newWidth, newHeight);
        }
    }
}

export const sceneController = new SceneController();
globalThis.sceneController = sceneController;
