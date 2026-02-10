import { BareGame, events, MakePath, pipes } from "../main";
import { GameObject } from "../objects/gameObject";
import { assetsHandler } from "../utils/assetsHandler";
import { BareScreen, BareEvent } from '../utils/bareTypes';
import { SaveDataHandler } from "../utils/SaveDataHandler";
type BareGameClass<T extends BareGame = BareGame> = new () => T;

export class ScreenController
{

    currentScenes: BareGame[] = [];

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

            scene.Clear();
            this.currentScenes.splice(i, 1);
        }
    }
    
    Update(deltaTime: number): void
    {
        for (var scene of this.currentScenes)
        {
            if (scene.started)
                scene.OnUpdate(deltaTime);
        }
    }
    
    Render(): void
    {
        for (var scene of this.currentScenes)
        {
            if (scene.started)
                scene.OnRender();
        }
    }

    Goto<T extends BareGame>(sceneClass: BareGameClass<T>, ...args):T
    {
        this.Clear();

        const newScene = new sceneClass();
        this.currentScenes.push(newScene);

        // NO AWAIT...

        //await next.OnAwake?.();
        //await next.OnStart?.();

        return newScene;
    }
}

export const screenController = new ScreenController();
globalThis.screenController = screenController;
