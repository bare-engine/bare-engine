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
        var moneThanOneScene = (this.currentScenes.length > 1);

        for (var scene of this.currentScenes)
        {
            if (moneThanOneScene)
                BareEngine.SetControllerReferencesOnScene(scene);

            if (scene.started)
                scene.Update(deltaTime);
        }
    }
    
    Render(): void
    {
        for (var scene of this.currentScenes)
        {
            if (scene.started)
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
        var newScene: T;

        if (typeof scene === "function")
        {
            newScene = new scene();
            this.currentScenes.push(newScene);
        }
        else
            this.currentScenes.push(scene);

        await newScene.Awake(payload);

        globalEvents.emit(BareEvent.scene_added, { scene: newScene });
        globalEvents.emit(BareEvent.scene_changed, { scene: newScene, type: "added" });

        return newScene;
    }

    Remove(scene: Scene, i = -1): void
    {
        var i = (i == -1 ? this.currentScenes.indexOf(scene) : i);
        if (i != -1)
        {
            scene.Clear();
            this.currentScenes.splice(i, 1);

            globalEvents.emit(BareEvent.scene_removed, { scene: scene });
            globalEvents.emit(BareEvent.scene_changed, { scene: scene, type: "removed" });
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
    
    SendEvent<K extends keyof Events>(type: K, ...event: EventArgs<Events[K]>): void
    {
        for (var scene of this.currentScenes)
        {
            if (scene.started)
                scene.events.emit(type, ...event);
        }
    }
}

export const sceneController = new SceneController();
globalThis.sceneController = sceneController;
