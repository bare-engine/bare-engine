import type { Scene } from "../scenes/scene";
import { GameObject } from "../objects/gameObject";
import { BareEvent, BareEventPayload, Size, SaveData } from '../types/bareTypes';

export class PhysicsControllerBase
{
  	public collisionsEnabled: boolean = true;

	public scene: Scene;

	constructor(scene: Scene)
	{
		this.scene = scene;
	
		this.scene.events.persistent.on(BareEvent.game_completeClear, () => {
			//pipes.remove("physicsController_Update");
			//pipes.remove("physicsController_Render");
		});

		if (__DEV__)
        	globalThis.plugin?.AddDebugAction("Toggle Collision", () => this.setCollisionsEnabled(!this.collisionsEnabled));
		
		// ALREADY LISTENING TO EVENTS HERE, SO THAT OBJECTS CREATED BEFORE Start(), EG AT Awake(), GET REGISTERED
		this.ListenToEvents();
	}

	Start(): void
	{ 

	}

	Restart(): void
	{  
		this.ListenToEvents();
	}

	ListenToEvents(): void
	{  
		this.scene.events.on(BareEvent.game_resize, this.OnResize.bind(this));
		this.scene.events.on(BareEvent.game_objectAdded, this.OnGameObjectAdded.bind(this));
		this.scene.events.on(BareEvent.game_objectRemoved, this.OnGameObjectRemoved.bind(this));
		this.scene.events.on(BareEvent.level_loaded, this.OnLevelLoaded.bind(this));

		//pipes.set("physicsController_Update", this.Update.bind(this));
		//pipes.set("physicsController_Render", this.Render.bind(this));	
	}

	OnResize({ newWidth, newHeight }: BareEventPayload['game_resize']): void
	{
		if (SaveData.currentLevelStr == '') /// ONLY SET BOUNDS TO SCREEN IF THERE IS NO LEVEL
       		this.setDimensions(0, 0, newWidth, newHeight);
	}

	OnGameObjectAdded({ gameObject, layer }: BareEventPayload['game_objectAdded']): void
	{
		if ((gameObject as any).isPhysicsObject)
		{
			// SHOULD WE ONLY ADD OBJECTS WITH hasPhysics ENABLED IN LAYER? TODO
			// FOR NOW: IF IT HAS A HITBOX, ITS PHYSICS OBJECT, IT GETS ADDED
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
		var dims:Size = level.dimensions;
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

	FixedUpdate(fixedDeltaTime: number = 0): void
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
