import { BareEvent, CollisionEventComponent, Component, GameObject, Scene } from "bare-engine";
import { ArcadeObject, ArcadePhysicsController } from "bare-engine/arcade";
import { Checks } from "./checks";

// covers arcade physics from docs/reference/physics and the CollisionEventComponent from docs/guide/components

export class CoinDocComponent extends Component<ArcadeObject>
{
    collected = 0;

    override OnCollisionStart(other: GameObject)
    {
        if (other.name == "player")
            this.collected++;
    }
}

export class DocsPhysicsTest extends Scene
{
    checks = new Checks();
    running = false;
    done = false;

    constructor()
    {
        super({
            basePrefabs: [{ name: "ANY", texture: "PIXEL" }],
            prefabs: [
                { name: "player", baseClass: "ArcadeObject", scale: { x: 32, y: 32 } },
                { name: "block", baseClass: "ArcadeObject", scale: { x: 400, y: 32 }, static: true },
                { name: "coin", baseClass: "ArcadeObject", scale: { x: 16, y: 16 }, sensor: true, components: { coinDoc: {} } },
                { name: "exitDoor", baseClass: "ArcadeObject", scale: { x: 16, y: 16 }, sensor: true, components: { collisionEvent: { object: "player", event: "levelExit", once: true } } },
                { name: "bullet", baseClass: "ArcadeObject", scale: { x: 8, y: 8 } },
                { name: "enemy", baseClass: "ArcadeObject", scale: { x: 8, y: 8 } },
            ] as any,
            layers: ["objects", "bullets", "enemies"],
            layersInfo: {
                objects: { collidesWith: ["objects"] },
                bullets: { collidesWith: ["enemies"] },
            },
            gravity: 5000,
        } as any);
    }

    override OnAwake(): void
    {
        bare.AddClass(ArcadeObject);
        bare.AddClass(ArcadePhysicsController);
        bare.AddClass(CoinDocComponent);
        bare.AddClass(CollisionEventComponent);
    }

    override OnUpdate(): void
    {
        if (!this.running)
        {
            this.running = true;
            void this.RunChecks().then(() => this.done = true);
        }

        if (this.done)
        {
            this.done = false;
            this.checks.flush();
        }
    }

    // physics needs frames, and objects only update once OnStart has finished
    async RunChecks()
    {
        const c = this.checks;

        // gravity, static blocks and IsGrounded
        const ground = this.AddGameObject<ArcadeObject>("block").SetPosition(0, 400);
        const player = this.AddGameObject<ArcadeObject>("player").SetPosition(100, 300);
        player.name = "player";
        c.check(player instanceof ArcadeObject, "baseClass ArcadeObject should create an ArcadeObject");
        c.check(player.velocity.x === 0 && player.velocity.y === 0, "velocity should default to zero");
        c.check(player.collide === true && player.sensor === false && player.static === false, "collide/sensor/static defaults");
        await waitFrame(40);
        c.check(player.y > 300, "gravity should pull the player down: " + player.y);
        c.check(player.IsGrounded(), "the player should come to rest on the static block");
        c.check(player.y + 32 <= ground.y + 0.5, "the static block should stop the player: " + player.y);
        c.check(ground.y === 400, "a static object should not move");

        player.SetVelocityXY(300, 0);
        c.check(player.IsMoving(), "IsMoving should be true with velocity");
        player.ResetVelocity();
        c.check(!player.IsMoving(), "ResetVelocity should stop it");

        // OnCollisionStart in a component, sensors don't block
        const coin = this.AddGameObject<ArcadeObject>("coin").SetPosition(player.x + 8, player.y + 8);
        await waitFrame(3);
        c.check(coin.GetComponent(CoinDocComponent)?.collected === 1, "OnCollisionStart should fire once for an overlapping sensor: " + coin.GetComponent(CoinDocComponent)?.collected);

        // CollisionEventComponent sends an event, once removes the component
        let exits = 0;
        bare.events.on("levelExit" as any, () => exits++);
        const door = this.AddGameObject<ArcadeObject>("exitDoor").SetPosition(player.x + 8, player.y + 8);
        await waitFrame(5);
        c.check(exits === 1, "CollisionEventComponent should send its event once: " + exits);
        c.check(!door.HasComponent(CollisionEventComponent), "once should remove the component after firing");

        // object collision events
        let objectHits = 0;
        const coin2 = this.AddGameObject<ArcadeObject>("coin").SetPosition(player.x + 8, player.y + 8);
        // the type-check includes all of src, so both src/arcade.ts and src/sopiro.ts declare collision payloads here,
        // which games never do. the handlers are cast for that
        coin2.events.on(BareEvent.collision_start, ((other: GameObject) => { if (other === player) objectHits++; }) as any);
        await waitFrame(3);
        c.check(objectHits >= 1, "gameObject.events should receive collision_start");

        // collision layers: bullets hit enemies, bullets don't hit each other
        const enemy = this.AddGameObject<ArcadeObject>("enemy", "enemies").SetPosition(600, 100);
        enemy.static = true;
        const bulletA = this.AddGameObject<ArcadeObject>("bullet", "bullets").SetPosition(600, 100);
        const bulletB = this.AddGameObject<ArcadeObject>("bullet", "bullets").SetPosition(600, 100);
        let bulletHitsEnemy = 0;
        let bulletHitsBullet = 0;
        bulletA.events.on(BareEvent.collision_start, ((other: GameObject) =>
        {
            if (other === enemy) bulletHitsEnemy++;
            if (other === bulletB) bulletHitsBullet++;
        }) as any);
        await waitFrame(3);
        c.check(bulletHitsEnemy >= 1, "layers listed in collidesWith should collide");
        c.check(bulletHitsBullet === 0, "a layer without itself in collidesWith should not collide with itself");

    }
}
