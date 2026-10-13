import type { Scene } from "../scenes/scene";
import { GameObject } from "../objects/gameObject";
import { BareEvent, BareEventPayload, Rectangle, Size, SaveData } from '../types/bareTypes';

export class PhysicsControllerBase
{
    public collisionsEnabled: boolean = true;

    public scene: Scene;

    // TRUE AFTER SetBounds: THE BOUNDS STAY WHEN THE SCREEN RESIZES, UNTIL A LEVEL LOADS
    private boundsSetByGame: boolean = false;

    constructor(scene: Scene)
    {
        this.scene = scene;

        if (__DEV__)
            globalThis.plugin?.AddDebugAction("Toggle Collision", () => this.setCollisionsEnabled(!this.collisionsEnabled));

        // ALREADY LISTENING TO EVENTS HERE, SO THAT OBJECTS CREATED BEFORE Start(), EG AT Awake(), GET REGISTERED
        this.ListenToEvents();
    }

    Start(): void
    {
        // A LAZILY CREATED CONTROLLER MAY HAVE MISSED THE level_loaded EVENT - CATCH UP ON THE
        // CURRENT LEVEL'S DIMENSIONS (BACKING _level READ, DON'T CREATE A LEVEL HANDLER FOR THIS)
        var currentLevel = this.scene.Get("_level")?.currentLevel;
        if (currentLevel?.dimensions && !this.boundsSetByGame)
            this.setDimensions(0, 0, currentLevel.dimensions.width, currentLevel.dimensions.height);
    }

    Restart(): void
    {
        this.ListenToEvents();
    }

    ListenToEvents(): void
    {
        bare.events.on(BareEvent.game_resize, this.OnResize.bind(this));
        bare.events.on(BareEvent.game_objectAdded, this.OnGameObjectAdded.bind(this));
        bare.events.on(BareEvent.game_objectRemoved, this.OnGameObjectRemoved.bind(this));
        bare.events.on(BareEvent.level_loaded, this.OnLevelLoaded.bind(this));

        //pipes.set("physicsController_Update", this.Update.bind(this));
        //pipes.set("physicsController_Render", this.Render.bind(this));
    }

    OnResize({ newWidth, newHeight }: BareEventPayload['game_resize']): void
    {
        // WITHOUT A LEVEL OR BOUNDS OF ITS OWN, THE WORLD IS THE SCREEN
        if (SaveData.currentLevelStr == '' && !this.boundsSetByGame)
            this.setDimensions(0, 0, newWidth, newHeight);
    }

    // THE AREA OBJECTS WITH stayInBounds ARE KEPT IN. A LEVEL SETS IT TO ITS SIZE, WITHOUT ONE IT'S THE SCREEN.
    // BOUNDS SET HERE STAY WHEN THE SCREEN RESIZES, UNTIL THE NEXT LEVEL LOADS
    SetBounds(bounds: Rectangle): void
    {
        this.boundsSetByGame = true;
        this.setDimensions(bounds.x, bounds.y, bounds.width, bounds.height);
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
        this.boundsSetByGame = false;
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
