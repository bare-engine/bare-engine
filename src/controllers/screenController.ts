import { events } from "../main";
import { BareScreen } from "../utils/bareTypes";

type BareScreenClass<T extends BareScreen = BareScreen> = new () => T;

export class ScreenController
{
    currentScreen?: BareScreen;

    constructor()
    {
        this.init();
    }

    init()
    {
        events.persistent.on('screenController_Update', this.Update.bind(this));
        events.persistent.on('screenController_Render', this.Render.bind(this));
        events.persistent.on('clear', this.Clear.bind(this));
    }

    Clear()
    {
        this.currentScreen?.OnDestroy?.();
        this.currentScreen = undefined;
    }
    
    Update(deltaTime: number): void
    {
        this.currentScreen?.OnUpdate?.(deltaTime);
    }
    
    Render(): void
    {
        this.currentScreen?.OnRender?.();
    }

    async Goto<T extends BareScreen>(screenClass: BareScreenClass<T>): Promise<T>
    {
        this.currentScreen?.OnDestroy?.();
        bare.ClearScene();

        const next = new screenClass();

        await next.OnAwake?.();
        
        this.currentScreen = next;
        next.OnStart?.();

        return next;
    }

    RestartCurrentScreen(): void
    {
        this.currentScreen?.OnDestroy?.();
        bare.ClearScene();
        this.currentScreen?.OnStart?.();
    }
}

export const screenController = new ScreenController();
globalThis.screenController = screenController;
