import { MakePathForEntity } from "../globals";
import { Texture, Vec2 } from "../libraries/new-rapid-render";
import { Scene } from "../scenes/scene";
import { BareEvent, BlockedState, ConstructEntityOptions, Entity, HitboxType, Rectangle, Rectangle2Vec } from "../types/bareTypes";
import { Hitbox } from "../types/hitbox";
import { Dropdown, InspectorField, Int } from "../utils/decorators";
import { GameObject } from "./gameObject";

export class ArcadeObject extends GameObject
{
    public isPhysicsObject = true;
    
    physicsHitbox: Hitbox = new Hitbox(this, {x1 : 0, y1 : 0, x2 : 0, y2 : 0});

    @InspectorField static: boolean = false;
    @InspectorField collide: boolean = true;
    @InspectorField sensor:boolean = false; // IF TRUE, WILL NOT RESPECT stayInBounds
    @InspectorField velocity: Vec2 = new Vec2(0, 0);
    @InspectorField drag: number = 0//.15;
    @InspectorField restitution: number = 0//.8;
    @InspectorField stayInBounds: boolean = true;
    @InspectorField removeOnOutOfBounds: boolean = false;
    
    blocked:BlockedState = BlockedState.None;
    collidingObjects: ArcadeObject[] = [];

    static dummyPhysicsObjectBare: ArcadeObject = new ArcadeObject();

    // ENTITY VALUES ON OBJECT
    @InspectorField
    @Dropdown(["Rectangle", "Circle"])
    hitboxType = {
        // physicsHitbox.type is a numeric HitboxType; map it to/from its key name so the
        // dropdown value matches the options.
        get: () => HitboxType[this.physicsHitbox.type] ?? "Rectangle",
        set: (type: string) => this.physicsHitbox.type = HitboxType[type as keyof typeof HitboxType],
    };

    @InspectorField 
    get hitboxRect(): Rectangle
    {
        return this.physicsHitbox.rectangle;
    }
    set hitboxRect(rect: Rectangle)
    {
        this.physicsHitbox.rectangle = rect;
    }

    @InspectorField
    @Int
    get hitboxRadius(): number
    {
        return this.physicsHitbox?.radius || 0;
    }
    set hitboxRadius(radius: number)
    {
        this.physicsHitbox.radius = radius;
    }
    
    constructor(scene: Scene | null = null, texturePath: string = "", x: number = 0, y: number = 0)
    {
        super(scene, texturePath, x, y);

        if (this.texture)
            this.physicsHitbox.rectangle = {x: 0, y: 0, width: this.texture!.width, height: this.texture!.height};
    }

    override OnAdded(): void
    {
        // TOUCH THE LAZY scene.arcade CONTROLLER SO IT EXISTS AND IS LISTENING BEFORE
        // game_objectAdded FIRES FOR THIS OBJECT (IT TRACKS PHYSICS OBJECTS VIA THAT EVENT)
        this.scene.arcade;
    }

    override SetTexture(texture:Texture): this
    {
        if (this.physicsHitbox && this.physicsHitbox.rectangle.x == 0 && this.physicsHitbox.rectangle.y == 0 && this.physicsHitbox.rectangle.width == 0 && this.physicsHitbox.rectangle.height == 0)
            this.physicsHitbox.rectangle = {x: 0, y: 0, width: texture!.width, height: texture!.height};

        return super.SetTexture(texture);
    }

    // EXTEND THE BASE SPECIAL MAP WITH HITBOX HANDLING - SETS THE physicsHitbox RECTANGLE DIRECTLY
    override get specialMap(): Record<string, (obj: GameObject, value: any) => void>
    {
        return {
            ...super.specialMap,
            hitbox: (o, v) => {
                var obj = o as ArcadeObject;
                var hb = (v as Rectangle2Vec);

                obj.physicsHitbox.rectangle = {x: 0, y: 0, width: 0, height: 0};

                obj.WhenTextureLoaded(() => {
                    if (!obj.texture) // NO, TODO - SHOULD NOT GET HERE, BUT NEEDED FOR COLLISION RECT IN ENTITY TO SHOW UP FOR SOME REASON
                        return; // RELATED TO WhenTextureLoaded() IN GameObject AND if (texturePath == "NONE") return; IN InitTexture()

                    var rect: Rectangle = {x: 0, y: 0, width: 0, height: 0};
                    var w = obj.texture!.width * 1; //this.totalScaleX;
                    var h = obj.texture!.height * 1; //this.totalScaleY;

                    var allArePercentages = (hb.x1 >= 0 && hb.x1 <= 1 && hb.y1 >= 0 && hb.y1 <= 1 && hb.x2 >= 0 && hb.x2 <= 1 && hb.y2 >= 0 && hb.y2 <= 1);

                    if (allArePercentages)
                    {
                        rect.x = hb.x1 * w;
                        rect.y = hb.y1 * h;
                        rect.width = (hb.x2 * w) - rect.x;
                        rect.height = (hb.y2 * h) - rect.y;
                    }
                    else
                    {
                        rect.x = hb.x1;
                        rect.y = hb.y1;
                        rect.width = (hb.x2) - rect.x;
                        rect.height = (hb.y2) - rect.y;
                    }

                    // APPLY
                    obj.physicsHitbox.rectangle = rect;
                });
            },
        };
    }

    override OnApplyEntityToGameObject(entity: Entity, addComponents: boolean)
    {
        // RECTANGLE IS SET BY THE hitbox SPECIAL MAP HANDLER (RUNS FIRST); HERE WE APPLY THE
        // ENTITY-DEPENDENT EXTRAS (CIRCLE TYPE / RADIUS / pivotBasedOnHitbox) ON TOP OF IT.
        if (entity.hitbox)
        {
            this.WhenTextureLoaded(() => {
                if (!this.texture)
                    return;

                if (entity.hitboxType == "Circle")
                {
                    this.physicsHitbox.type = HitboxType.Circle;
                    this.physicsHitbox.radius = (entity.hitboxRadius || Math.max(this.physicsHitbox.rectangle.width, this.physicsHitbox.rectangle.height) / 2);
                }

                // pivotBasedOnHitbox
                if (entity.pivot == undefined)
                {
                    // THIS SHOULD REALLY ONLY HAPPENS WHEN TEXTURE IS LOADED ABOVE, IF IT ISN'T, THIS BREAKS.
                    // TODO, CACHE IMAGE SIZES?
                    var hbRect = (this.physicsHitbox.rectangle!);

                    if (entity.pivotBasedOnHitbox)
                    {
                        // X
                        if (entity.pivotBasedOnHitbox.x > 0 && entity.pivotBasedOnHitbox.x <= 1)
                            this.pivot.x = (hbRect.x + hbRect.width * entity.pivotBasedOnHitbox.x); // RELATIVE
                        else
                            this.pivot.x = (hbRect.x + entity.pivotBasedOnHitbox.x); // ABSOLUTE (IF YOU'D WANT THIS FOR SOME REASON!)

                        // Y
                        if (entity.pivotBasedOnHitbox.y > 0 && entity.pivotBasedOnHitbox.y <= 1)
                            this.pivot.y = (hbRect.y + hbRect.height * entity.pivotBasedOnHitbox.y); // RELATIVE
                        else
                            this.pivot.y = (hbRect.y + entity.pivotBasedOnHitbox.y); // ABSOLUTE (IF YOU'D WANT THIS FOR SOME REASON!)

                        //if (this.levelEntity)
                        //    this.levelEntity.pivot = this.pivot.clone();
                    }
                }
            });

            // CAN COLLIDE
            if (entity.collide)
            {
                this.collide = true;
            }
        }

        // APPLY CIRCLE HITBOX TYPE EVEN WITHOUT AN EXPLICIT HITBOX
        if (entity.hitboxType == "Circle" && !entity.hitbox)
        {
            this.WhenTextureLoaded(() => {
                this.physicsHitbox.type = HitboxType.Circle;
                this.physicsHitbox.radius = (entity.hitboxRadius || Math.max(this.physicsHitbox.rectangle.width, this.physicsHitbox.rectangle.height) / 2);
            });
        }
    }

    GetHitboxCenter(): Vec2
    {
        if (this.physicsHitbox.type === HitboxType.Circle)
        {
            if (this.parent)
                return this.ToGlobal(new Vec2(this.pivot.x, this.pivot.y));

            return new Vec2(this.x, this.y);
        }

        const rect = this.physicsHitbox.rectangle;
        const localCenter = new Vec2(rect.x + rect.width / 2, rect.y + rect.height / 2);

        if (this.parent)
            return this.ToGlobal(localCenter);

        return new Vec2(
            this.x - this.pivot.x + rect.x + Math.abs(rect.width * this.totalScaleX) / 2,
            this.y - this.pivot.y + rect.y + Math.abs(rect.height * this.totalScaleY) / 2
        );
    }
    
    OnCollisionStart(collidingObject: ArcadeObject)
    {
        this.events.emit(BareEvent.collision_start, collidingObject, null);
    }

    OnCollisionUpdate(collidingObject: ArcadeObject)
    {
        this.events.emit(BareEvent.collision_update, collidingObject, null);
    }

    OnCollisionEnd(collidingObject: ArcadeObject)
    {
        this.events.emit(BareEvent.collision_end, collidingObject, null);
    }

    IsMoving(): boolean
    {
        return (this.velocity.x != 0 || this.velocity.y != 0);
    }
    
    SetVelocity(velocity: Vec2): ArcadeObject
    {
        /* @ AddClass(ArcadePhysicsController) */
        
        this.velocity.x = velocity.x;
        this.velocity.y = velocity.y;

        return this;
    }

    SetVelocityXY(x: number, y: number): ArcadeObject
    {
        /* @ AddClass(ArcadePhysicsController) */
        
        this.velocity.x = x;
        this.velocity.y = y;

        return this;
    }

    IsBlocked(direction: BlockedState): boolean
    {
        return (this.blocked & direction) !== 0;
    }

    IsGrounded(): boolean
    {
        return this.IsBlocked(BlockedState.Down);
    }

    ResetVelocity(): void
    {
        this.velocity.x = 0;
        this.velocity.y = 0;
    }

    override ResetValues(): this
    {
        super.ResetValues();

        this.collide = true;
        this.sensor = false;
        this.static = false;
        this.drag = 0//.07;
        this.restitution = 0//.8;
        this.blocked = BlockedState.None;
        this.stayInBounds = true;
        this.removeOnOutOfBounds = false;

        if (this.collidingObjects)
            this.collidingObjects.length = 0;

        if (this.physicsHitbox)
        {
            this.physicsHitbox.type = HitboxType.Rectangle;
            this.physicsHitbox.rectangle.x = 0;
            this.physicsHitbox.rectangle.y = 0;
            this.physicsHitbox.rectangle.width = 0;
            this.physicsHitbox.rectangle.height = 0;
            this.physicsHitbox.parent = this;
            this.physicsHitbox.active = true;
        }

        if (this.velocity)
            this.ResetVelocity();

        return this;
    }

    static GetDummpyDataFromEntity(scene: Scene, nameOrEntity: string | Entity, options: ConstructEntityOptions = { propsToIgnoreInEntity: [], fillPresets: true }): {entity: Entity, gameObject: GameObject}
    {
        var entityConstructed = scene.ConstructEntity(nameOrEntity, scene.settingsHandler.Get(), options);
        ArcadeObject.dummyPhysicsObjectBare.scene = scene;
        ArcadeObject.dummyPhysicsObjectBare.ResetValues();
        ArcadeObject.dummyPhysicsObjectBare.InitTexture(MakePathForEntity(entityConstructed)); // COULD BE NEEDED TO SET PIVOT RIGHT IF IT'S A PERCENTAGE
        scene.ApplyEntityToGameObject(entityConstructed, ArcadeObject.dummyPhysicsObjectBare);

        return {entity: entityConstructed, gameObject: ArcadeObject.dummyPhysicsObjectBare};
    }
}
