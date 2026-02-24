import { Vec2, Color } from "../libraries/rapid-render";
import { MakePath, Scene } from "../main";
import { Entity, SettingsData } from "../types/bareTypes";
import { HitboxType, Rectangle, Rectangle2Vec } from "../types/gamesTypes";
import { Hitbox } from "../types/hitbox";
import { GameObject } from "./gameObject";

export class PhysicsObjectBare extends GameObject
{
    public isPhysicsObject = true;
    
    physicsHitbox: Hitbox = new Hitbox(this, {x1 : 0, y1 : 0, x2 : 0, y2 : 0});
    isStatic: boolean = false;
    canCollide: boolean = false;
    isSolid:boolean = true;
    velocity: Vec2 = new Vec2(0, 0);
    drag: number = 0;
    weight: number = 1; // CUSTOM
    strength: number = 1; // CUSTOM
    restitution: number = .8;
    stayInBounds: boolean = true;

    static dummyPhysicsObjectBare: PhysicsObjectBare = new PhysicsObjectBare();
    
    constructor(scene: Scene | null = null, x: number = 0, y: number = 0, texturePath: string = "")
    {
        super(scene, x, y, texturePath);
    }

    override ApplyEntityToGameObject(entity: Entity, addComponents: boolean)
    {
        // SET HITBOX, IF PROVIDED
        if (entity.hitbox)
        {
            var hb = (entity.hitbox as Rectangle2Vec);

            this.physicsHitbox.rectangle = {x: 0, y: 0, width: 0, height: 0};

            this.WhenTextureLoaded(() => {
                var rect: Rectangle = {x: 0, y: 0, width: 0, height: 0};
                var w = this.texture!.width * this.totalScaleX;
                var h = this.texture!.height * this.totalScaleY;

                // X/Y
                if (hb.x1 > 0 && hb.x1 <= 1)
                    rect.x = hb.x1 * w; // RELATIVE
                else
                    rect.x = hb.x1; // ABSOLUTE

                if (hb.y1 > 0 && hb.y1 <= 1)
                    rect.y = hb.y1 * h; // RELATIVE
                else
                    rect.y = hb.y1; // ABSOLUTE

                // WIDTH/HEIGHT
                if (hb.x2 > 0 && hb.x2 <= 1)
                    rect.width = (hb.x2 * w) - rect.x; // RELATIVE
                else
                    rect.width = (hb.x2) - rect.x; // ABSOLUTE

                if (hb.y2 > 0 && hb.y2 <= 1)
                    rect.height = (hb.y2 * h) - rect.y; // RELATIVE
                else
                    rect.height = (hb.y2) - rect.y; // ABSOLUTE

                rect.x = (rect.x);
                rect.y = (rect.y);
                rect.width = (rect.width);
                rect.height = (rect.height);

                // APPLY
                entity.hitbox = rect; // CHANGE IN DATA, SO DOESN'T PROCESS NEXT TIME (?)
                this.physicsHitbox.rectangle = rect;

                if (entity.hitboxType == "circle")
                {
                    this.physicsHitbox.type = HitboxType.Circle;
                    this.physicsHitbox.radius = Math.max(rect.width, rect.height) / 2;
                }
            });

            // pivotBasedOnHitbox
            if (entity.pivot == undefined)
            {
                // THIS SHOULD REALLY ONLY HAPPENS WHEN TEXTURE IS LOADED ABOVE, IF IT ISN'T, THIS BREAKS. 
                // TODO, CACHE IMAGE SIZES?
                var hbRect = (entity.hitbox! as Rectangle);

                if (entity.pivotBasedOnHitbox)
                {
                    if (entity.pivotBasedOnHitbox.x > 0 && entity.pivotBasedOnHitbox.x <= 1)
                        this.pivot.x = (hbRect.x + hbRect.width * entity.pivotBasedOnHitbox.x); // RELATIVE
                    else
                        this.pivot.x = (hbRect.x + entity.pivotBasedOnHitbox.x); // ABSOLUTE (IF YOU'D WANT THIS FOR SOME REASON!)

                    if (entity.pivotBasedOnHitbox.y > 0 && entity.pivotBasedOnHitbox.y <= 1)
                        this.pivot.y = (hbRect.y + hbRect.height * entity.pivotBasedOnHitbox.y); // RELATIVE
                    else
                        this.pivot.y = (hbRect.y + entity.pivotBasedOnHitbox.y); // ABSOLUTE (IF YOU'D WANT THIS FOR SOME REASON!)

                    this.pivot.x = (this.pivot.x);
                    this.pivot.y = (this.pivot.y);
                }
            }

            // CAN COLLIDE
            if (entity.canCollide != false)
            {
                this.canCollide = true;
                entity.canCollide = true; // SETTING CANCOLLIDE ON ENTITY TOO, SO IT DOESN'T GET SAVED, SINCE DEFAULT IS FALSE
            }
        }
    }

    override Render(inheritedColor?: Color): void
    {
        if (!this.visible)
            return;

        super.Render(inheritedColor);
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

    ResetVelocity(): void
    {
        this.velocity.x = 0;
        this.velocity.y = 0;
    }

    override ResetValues(): void
    {
        super.ResetValues();

        this.canCollide = false;
        this.isSolid = true;
        this.isStatic = false;
        this.weight = 1;
        this.strength = 1;
        this.drag = 0;
        this.restitution = .8;

        if (this.physicsHitbox)
        {
            this.physicsHitbox.type = HitboxType.Rectangle;
            this.physicsHitbox.rectangle = {x: 0, y: 0, width: 0, height: 0};
            this.physicsHitbox.parent = this;
            this.physicsHitbox.active = true;
        }

        if (this.velocity)
            this.ResetVelocity();
    }

    static GetDummpyDataFromEntity(scene: Scene, nameOrEntity: string | Entity, options: { propsToIgnoreInEntity?: string[] } = { propsToIgnoreInEntity: [] }): {entity: Entity, gameObject: GameObject}
    {
        var entityConstructed = scene.ConstructEntity(nameOrEntity, scene.settingsHandler.Get(), options);
        PhysicsObjectBare.dummyPhysicsObjectBare.ResetValues();
        PhysicsObjectBare.dummyPhysicsObjectBare.InitTexture(MakePath(entityConstructed.imagePath!, entityConstructed.name)); // COULD BE NEEDED TO SET PIVOT RIGHT IF IT'S A PERCENTAGE
        scene.ApplyEntityToGameObject(entityConstructed, PhysicsObjectBare.dummyPhysicsObjectBare);

        return {entity: entityConstructed, gameObject: PhysicsObjectBare.dummyPhysicsObjectBare};
    }
}