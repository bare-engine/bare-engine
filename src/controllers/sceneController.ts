import { BareEngine } from "../bareEngine";
import { Scene, globalEvents } from "../main";
import { EventArgs } from "../libraries/mitt";
import { AwakePayload, BareEvent, Events, SceneClass, SceneOptions } from "../types/bareTypes";

export class SceneController
{
    currentScenes: Scene[] = [];

    constructor()
    {
    }

    init()
    {
        //pipes.set("screenController_Update", this.Update.bind(this));
        //pipes.set("screenController_Render", this.Render.bind(this));
        //events.persistent.on(BareEvent.game_clear, this.Clear.bind(this));
    }

    Clear()
    {
        for (var i = this.currentScenes.length - 1; i >= 0; i--)
        {
            const scene = this.currentScenes[i];
        
            if (scene.persistent)
                continue;

            this.Remove(scene, i);
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
            console.warn("SceneController: Scene already added: " + (scene as SceneClass<T>).name);
            return this.Get(scene as SceneClass<T>);
        }

        var newScene: T;

        if (typeof scene === "function")
        {
            newScene = new scene();
            this.currentScenes.push(newScene);
        }
        else
            this.currentScenes.push(scene);

        if (newScene.sceneOptions.solo)
            this.DisableAllScenes();

        await newScene.Awake(payload); // WILL ENABLE THE SCENE AGAIN TOO

        //globalEvents.emit(BareEvent.scene_added, { scene: newScene });
        //globalEvents.emit(BareEvent.scene_changed, { scene: newScene, type: "added" });
        bareEngine.SendEvent(BareEvent.scene_added, { scene: newScene });
        bareEngine.SendEvent(BareEvent.scene_changed, { scene: newScene, type: "added" });

        return newScene;
    }

    Remove<T extends Scene>(scene: Scene | SceneClass<T>, i = -1): void
    {
        const targetIndex = (i === -1)
            ? (typeof scene === "function"
                ? this.currentScenes.findIndex(current => current instanceof scene)
                : this.currentScenes.indexOf(scene))
            : i;

        const targetScene = this.currentScenes[targetIndex];

        if (targetIndex !== -1 && targetScene)
        {
            targetScene.Clear(true);
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

    Has<T extends Scene>(sceneClass: SceneClass<T>): boolean
    {
        return this.currentScenes.some(current => current instanceof sceneClass);
    }

    Get<T extends Scene>(sceneClass: SceneClass<T>): T
    {
        return this.currentScenes.find(current => current instanceof sceneClass) as T;
    }

    GetAllScenes()
    {
        return this.currentScenes;
    }

    GetAllSceneObjects()
    {
        return this.currentScenes
            .map(scene => scene.objectController)
            .flatMap(controller => controller.GetLayers().flat());
    }

    GetLevelScene(): Scene | null
    {
        return this.currentScenes.find(current => current.isLevel);
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
