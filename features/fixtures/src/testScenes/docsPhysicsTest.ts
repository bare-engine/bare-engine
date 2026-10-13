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

        // continuous: a fast object moves 100 units per fixed step, so without it, it skips over a 4 wide wall
        const thinWall = (y: number) => this.AddGameObject<ArcadeObject>({ extends: "block", scale: { x: 4, y: 100 } } as any).SetPosition(300, y);
        const fast = (y: number, entity: object = {}) => this.AddGameObject<ArcadeObject>({ extends: "enemy", ...entity } as any)
            .SetPosition(150, y)
            .SetVelocityXY(6000, 0) as ArcadeObject;

        let wall = thinWall(50);
        const tunneling = fast(100);
        await waitFrame(2);
        c.check(tunneling.x > 304, "without continuous, a fast object should pass through a thin wall: " + tunneling.x);
        tunneling.Remove();

        let wallHits = 0;
        const stopped = fast(100, { continuous: true });
        stopped.events.on(BareEvent.collision_start, ((other: GameObject) => { if (other === wall) wallHits++; }) as any);
        await waitFrame(2);
        c.check(stopped.x + 8 <= 300.5, "a continuous object should stop at a thin wall: " + stopped.x);
        c.check(Math.abs(stopped.velocity.x) < 1, "a continuous object without restitution should lose its speed on the wall: " + stopped.velocity.x);
        c.check(wallHits === 1, "a continuous object should get collision_start from the wall it stopped at: " + wallHits);
        stopped.Remove();

        wall.restitution = 1;
        const bouncing = fast(100, { continuous: true, restitution: 1 });
        // the 2nd step moves 42 units to the wall, then the remaining 58 back
        await waitFrame(2);
        c.check(bouncing.velocity.x < -5000, "a continuous object should bounce off a thin wall: " + bouncing.velocity.x);
        c.check(bouncing.x < 250, "after bouncing, a continuous object should spend the rest of the step moving back: " + bouncing.x);
        bouncing.Remove();
        wall.Remove();

        wall = thinWall(50);
        const ball = fast(100, { continuous: true, hitboxType: "Circle", pivot: "CENTER" });
        await waitFrame(2);
        c.check(ball.x + 4 <= 300.5, "a continuous circle should stop at a thin wall: " + ball.x);
        ball.Remove();
        wall.Remove();

        // continuous objects still pass through sensors, and report them
        const gate = this.AddGameObject<ArcadeObject>({ extends: "coin", scale: { x: 4, y: 100 } } as any).SetPosition(300, 200);
        let gateHits = 0;
        const runner = fast(250, { continuous: true });
        runner.events.on(BareEvent.collision_start, ((other: GameObject) => { if (other === gate) gateHits++; }) as any);
        await waitFrame(2);
        c.check(runner.x > 304, "a continuous object should pass through a sensor: " + runner.x);
        c.check(gateHits === 1, "a continuous object should report a sensor it passed within one step: " + gateHits);
        runner.Remove();
        gate.Remove();

        // two objects bounce with the higher restitution, so a bouncy object bounces off a wall left at 0
        wall = thinWall(50);
        const bouncy = fast(100, { continuous: true, restitution: 1 });
        await waitFrame(2);
        c.check(wall.restitution === 0 && bouncy.velocity.x < -5000, "a bouncy object should bounce off a wall without restitution: " + bouncy.velocity.x);
        bouncy.Remove();
        wall.Remove();

        // drag alone never reaches 0, so slow objects with drag stop completely. without gravity, like a top-down game
        this.settingsData.gravity = 0;
        const drifting = this.AddGameObject<ArcadeObject>({ extends: "enemy", drag: 0.1 } as any).SetPosition(450, 100);
        drifting.SetVelocityXY(200, 0);
        await waitFrame(60);
        c.check(drifting.velocity.x === 0 && !drifting.IsMoving(), "an object with drag should come to a full stop: " + drifting.velocity.x);
        drifting.Remove();
        this.settingsData.gravity = 5000;

        // a circle hitbox defaults to half the image's smaller side
        const oval = this.AddGameObject<ArcadeObject>({ baseClass: "ArcadeObject", texture: "PIXEL", hitboxType: "Circle", hitbox: { x1: 0, y1: 0, x2: 32, y2: 16 }, static: true } as any).SetPosition(450, 300);
        await waitFrame(1);
        c.check(oval.hitboxRadius === 8, "a circle hitbox should default to half the smaller side: " + oval.hitboxRadius);
        oval.Remove();

        // bounds: without a level they follow the screen, until the game sets its own
        const physics = this.arcade;
        const screenResize = { prevWidth: bare.width, prevHeight: bare.height, newWidth: 640, newHeight: 480 };
        if (this.currentLevelStr === "") {
            physics.OnResize(screenResize);
            c.check(physics.GetBounds().width === 640 && physics.GetBounds().height === 480, "without a level, bounds should follow the screen: " + JSON.stringify(physics.GetBounds()));
        }
        physics.SetBounds({ x: -100, y: -50, width: 3000, height: 2000 });
        physics.OnResize({ ...screenResize, newWidth: 800, newHeight: 600 });
        const bounds = physics.GetBounds();
        c.check(bounds.x === -100 && bounds.y === -50 && bounds.width === 3000 && bounds.height === 2000, "bounds set with SetBounds should stay when the screen resizes: " + JSON.stringify(bounds));
    }
}
