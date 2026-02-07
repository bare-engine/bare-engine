import { events } from "../main";
import { GameObject } from "../objects/gameObject";
import { BareEventPayload, Dimensions, UI_LAYER, BareEvent } from '../utils/bareTypes';
export class PhysicsControllerBase
{
  	public collisionsEnabled: boolean = true;

	constructor()
	{
		events.persistent.on(BareEvent.physicsController_Update, this.Update.bind(this));
		events.persistent.on(BareEvent.physicsController_Render, this.Render.bind(this));
		events.persistent.on(BareEvent.game_resize, this.OnResize.bind(this));
		events.persistent.on(BareEvent.game_objectAdded, this.OnGameObjectAdded.bind(this));
		events.persistent.on(BareEvent.game_objectRemoved, this.OnGameObjectRemoved.bind(this));
		events.persistent.on(BareEvent.level_Loaded, this.OnLevelLoaded.bind(this));

		if (__DEV__)
        	globalThis.plugin?.AddDebugAction("Toggle Collision", () => this.setCollisionsEnabled(!this.collisionsEnabled));
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

	OnLevelLoaded({ level }: BareEventPayload['level_Loaded']): void
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
