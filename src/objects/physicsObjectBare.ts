import { Texture, Vec2 } from "../libraries/new-rapid-render";
import { BareEvent, BlockedState, ConstructEntityOptions, Entity, HitboxType, Rectangle, Rectangle2Vec } from "../types/bareTypes";
import { Hitbox } from "../types/hitbox";
import type { Scene } from "../scenes/scene";
import { MakePathForEntity } from "../globals";
import { GameObject } from "./gameObject";
import { InspectorField } from "../utils/decorators";

export class PhysicsObjectBare extends GameObject
{
    public isPhysicsObject = true;
    
    physicsHitbox: Hitbox = new Hitbox(this, {x1 : 0, y1 : 0, x2 : 0, y2 : 0});
    @InspectorField pivotBasedOnHitbox:Vec2 = new Vec2();
    @InspectorField static: boolean = false;
    @InspectorField collide: boolean = true;
    @InspectorField sensor:boolean = false;
    @InspectorField velocity: Vec2 = new Vec2(0, 0);
    @InspectorField drag: number = 0//.15;
    @InspectorField restitution: number = 0//.8;
    @InspectorField stayInBounds: boolean = true;
    
    blocked:BlockedState = BlockedState.None;

    static dummyPhysicsObjectBare: PhysicsObjectBare = new PhysicsObjectBare();
    
    constructor(scene: Scene | null = null, texturePath: string = "", x: number = 0, y: number = 0)
    {
        super(scene, texturePath, x, y);

        if (this.texture)
            this.physicsHitbox.rectangle = {x: 0, y: 0, width: this.texture!.width, height: this.texture!.height};
    }

    override SetTexture(texture:Texture): GameObject
    {
        if (this.physicsHitbox && this.physicsHitbox.rectangle.x == 0 && this.physicsHitbox.rectangle.y == 0 && this.physicsHitbox.rectangle.width == 0 && this.physicsHitbox.rectangle.height == 0)
            this.physicsHitbox.rectangle = {x: 0, y: 0, width: texture!.width, height: texture!.height};

        return super.SetTexture(texture);
    }

    override OnApplyEntityToGameObject(entity: Entity, addComponents: boolean)
    {
        // SET HITBOX, IF PROVIDED
        if (entity.hitbox)
        {
            var hb = (entity.hitbox as Rectangle2Vec);

            this.physicsHitbox.rectangle = {x: 0, y: 0, width: 0, height: 0};

            this.WhenTextureLoaded(() => {
                if (!this.texture) // NO, TODO - SHOULD NOT GET HERE, BUT NEEDED FOR COLLISION RECT IN ENTITY TO SHOW UP FOR SOME REASON
                    return; // RELATED TO WhenTextureLoaded() IN GameObject AND if (texturePath == "NONE") return; IN InitTexture()

                var rect: Rectangle = {x: 0, y: 0, width: 0, height: 0};
                var w = this.texture!.width * 1; //this.totalScaleX;
                var h = this.texture!.height * 1; //this.totalScaleY;

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
                //entity.hitbox = rect; // CHANGE IN DATA, SO DOESN'T PROCESS NEXT TIME (?)
                this.physicsHitbox.rectangle = rect;

                if (entity.hitboxType == "circle")
                {
                    this.physicsHitbox.type = HitboxType.Circle;
                    this.physicsHitbox.radius = (entity.physicsRadius || Math.max(rect.width, rect.height) / 2);
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
        if (entity.hitboxType == "circle" && !entity.hitbox)
        {
            this.WhenTextureLoaded(() => {
                this.physicsHitbox.type = HitboxType.Circle;
                this.physicsHitbox.radius = (entity.physicsRadius || Math.max(this.physicsHitbox.rectangle.width, this.physicsHitbox.rectangle.height) / 2);
            });
        }
    }
    
    OnCollisionStart(collidingObject: GameObject)
    {
        this.events.emit(BareEvent.collision_start, collidingObject, null);
    }

    OnCollisionUpdate(collidingObject: GameObject)
    {
        this.events.emit(BareEvent.collision_update, collidingObject, null);
    }

    OnCollisionEnd(collidingObject: GameObject)
    {
        this.events.emit(BareEvent.collision_end, collidingObject, null);
    }
    
    SetVelocity(velocity: Vec2): PhysicsObjectBare
    {
        this.velocity.x = velocity.x;
        this.velocity.y = velocity.y;

        return this;
    }

    SetVelocityXY(x: number, y: number): PhysicsObjectBare
    {
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

    override ResetValues(): PhysicsObjectBare
    {
        super.ResetValues();

        this.collide = true;
        this.sensor = false;
        this.static = false;
        this.drag = 0//.07;
        this.restitution = 0//.8;
        this.blocked = BlockedState.None;

        this.pivotBasedOnHitbox.set(0);
        
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
        PhysicsObjectBare.dummyPhysicsObjectBare.scene = scene;
        PhysicsObjectBare.dummyPhysicsObjectBare.ResetValues();
        PhysicsObjectBare.dummyPhysicsObjectBare.InitTexture(MakePathForEntity(entityConstructed)); // COULD BE NEEDED TO SET PIVOT RIGHT IF IT'S A PERCENTAGE
        scene.ApplyEntityToGameObject(entityConstructed, PhysicsObjectBare.dummyPhysicsObjectBare);

        return {entity: entityConstructed, gameObject: PhysicsObjectBare.dummyPhysicsObjectBare};
    }
}
