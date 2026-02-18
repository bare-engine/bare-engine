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
        var moreThanOneScene = (this.currentScenes.length > 1);

        for (var scene of this.currentScenes)
        {
            if (moreThanOneScene)
                BareEngine.SetControllerReferencesOnScene(scene);

            if (scene.started && scene.enabled && !scene.paused)
                scene.Update(deltaTime);
        }
    }
    
    Render(): void
    {
        var moreThanOneScene = (this.currentScenes.length > 1);

        for (var scene of this.currentScenes)
        {
            if (moreThanOneScene)
                BareEngine.SetControllerReferencesOnScene(scene);

            if (scene.started && scene.enabled)
                scene.Render();
        }
    }

    async Goto<T extends Scene>(sceneClass: SceneClass<T>, payload?: AwakePayload<T>): Promise<T>
    {
        var currentScene = window.currentSceneProcessing;
        
        this.Clear();
        var scene = await this.Add(sceneClass, payload);

        if (currentScene)
            BareEngine.SetControllerReferencesOnScene(currentScene); // DON'T WANT TO SWITCH SCENES
        
        return scene;
    }

    async Add<T extends Scene>(scene: Scene | SceneClass<T>, payload?: AwakePayload<T>): Promise<T>
    {
        var currentScene = window.currentSceneProcessing;
        
        var newScene: T;

        if (typeof scene === "function")
        {
            newScene = new scene();
            this.currentScenes.push(newScene);
        }
        else
            this.currentScenes.push(scene);

        BareEngine.SetControllerReferencesOnScene(newScene);
        
        await newScene.Awake(payload);

        if (currentScene)
            BareEngine.SetControllerReferencesOnScene(currentScene); // DON'T WANT TO SWITCH SCENES

        globalEvents.emit(BareEvent.scene_added, { scene: newScene });
        globalEvents.emit(BareEvent.scene_changed, { scene: newScene, type: "added" });

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
        }
        else
        {
            console.warn("Scene not found");
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
