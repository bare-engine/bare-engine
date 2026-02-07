import { events, pipes } from "../main";
import { GameObject } from "../objects/gameObject";
import { BareEventPayload, Dimensions, UI_LAYER, BareEvent } from '../utils/bareTypes';
export class PhysicsControllerBase
{
  	public collisionsEnabled: boolean = true;

	constructor()
	{
		events.persistent.on(BareEvent.game_resize, this.OnResize.bind(this));
		events.persistent.on(BareEvent.game_objectAdded, this.OnGameObjectAdded.bind(this));
		events.persistent.on(BareEvent.game_objectRemoved, this.OnGameObjectRemoved.bind(this));
		events.persistent.on(BareEvent.level_loaded, this.OnLevelLoaded.bind(this));

		events.persistent.on(BareEvent.game_clear, () => {
			pipes.remove("physicsController_Update");
			pipes.remove("physicsController_Render");
		});

		this.Init();

		if (__DEV__)
        	globalThis.plugin?.AddDebugAction("Toggle Collision", () => this.setCollisionsEnabled(!this.collisionsEnabled));
	}

	Init(): void
	{
		pipes.set("physicsController_Update", this.Update.bind(this));
		pipes.set("physicsController_Render", this.Render.bind(this));	
	}

	OnResize({ newWidth, newHeight }: BareEventPayload['game_resize']): void
	{
        this.setDimensions(0, 0, newWidth, newHeight);
	}

	OnGameObjectAdded({ gameObject, layer }: BareEventPayload['game_objectAdded']): void
	{
		if (typeof layer === 'number' && layer < UI_LAYER && (gameObject as any).isPhysicsObject)
		{
			this.Add(gameObject);
		}
	}

	OnGameObjectRemoved(gameObject: GameObject, ignoring: any[] = []): void
	{
		if ((gameObject as any).isPhysicsObject)
		{
			this.Remove(gameObject);
		}
	}

	OnLevelLoaded({ level }: BareEventPayload['level_loaded']): void
	{
		var dims:Dimensions = level.dimensions;
        this.setDimensions(0, 0, dims.width, dims.height);
	}

	Add(object: any): void
	{
	}

	Remove(object: any): void
	{
	}

	RefreshBody(object: any): void
	{
	}

	setDimensions(x: number = 0, y: number = 0, width: number = 0, height: number = 0)
	{
	}

	Update(deltaTime: number = 0): void
	{
	}

    Render(): void
    {
    }

	setCollisionsEnabled(enabled: boolean): void
	{
		this.collisionsEnabled = enabled;
	}
}
