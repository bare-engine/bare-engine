import { Component, Entity, GameObject, Scene, SerializeField, Vec2 } from "bare-engine";
import { Checks } from "./checks";

// covers docs/guide: scenes, lifecycle, game-objects, custom-game-objects, prefabs, components

export class SpinDocComponent extends Component
{
    @SerializeField
    speed = 90;

    override OnUpdate(deltaTime: number)
    {
        this.go.rotation += this.speed * deltaTime;
    }
}

export class HitDocComponent extends Component
{
    hits: number[] = [];

    override OnHit(damage: number)
    {
        this.hits.push(damage);
    }
}

declare module "bare-engine"
{
    interface Component
    {
        OnHit?(damage: number): void;
    }
}

export class LifecycleDocComponent extends Component
{
    calls: string[] = [];

    override OnAwake() { this.calls.push("awake"); }
    override OnAdded() { this.calls.push("added"); }
    override OnStart() { this.calls.push("start"); }
    override OnDisable() { this.calls.push("disable"); }
    override OnEnable() { this.calls.push("enable"); }
    override OnRemoved() { this.calls.push("removed"); }
}

export interface DocEnemyEntity extends Entity
{
    health?: number;
}

export class DocEnemy extends GameObject
{
    declare entity: DocEnemyEntity | null;

    @SerializeField
    health = 3;

    override OnAwake()
    {
        this.health = 3;
    }

    Hit()
    {
        if (--this.health <= 0)
            this.Remove();
    }
}

class PayloadScene extends Scene
{
    awakePayload: any;
    startPayload: any;

    override OnAwake(payload?: any) { this.awakePayload = payload; }
    override OnStart(payload?: any) { this.startPayload = payload; }
}

class OrderScene extends Scene
{
    order: string[] = [];
    restarts = 0;

    override OnAwake() { this.order.push("awake"); }
    override OnStart() { this.order.push("start"); }
    override async OnRestart() { this.restarts++; }
}

export class DocsGuideObjectsTest extends Scene
{
    checks = new Checks();
    startProbe?: LifecycleDocComponent;

    constructor()
    {
        super({
            basePrefabs: [
                // PIXEL is 1x1, so fractional pivots read back unchanged (pivot is stored in texture pixels)
                { name: "ANY", pivot: { x: 0.25, y: 0.25 }, texture: "PIXEL" },
                { name: "block", tags: ["solid"] },
            ],
            prefabs: [
                { name: "ball", scale: { x: 2, y: 2 } },
                { name: "enemy", components: { hitDoc: {} } },
                { name: "bossEnemy", extends: "enemy", scale: { x: 3, y: 3 } },
                { name: "grassMid", extends: "block" },
                { name: "background", extends: "NONE", texture: "NONE" },
                { name: "fan", components: { spinDoc: { speed: 180 } } },
                { name: "goblin", baseClass: "DocEnemy", health: 5 } as DocEnemyEntity,
                { name: "centered", pivot: "CENTER" },
                { name: "halfScaled", scale: "HALF" },
                { name: "noScale", extends: "ball", propertiesRemoved: ["scale"] },
                { name: "noHit", extends: "enemy", componentsRemoved: ["hitDoc"] },
                { name: "ship", children: [{ name: "gun", x: 20 }] },
            ],
            presets: {
                HALF: { ANY: { x: 0.5, y: 0.5 } },
            },
            layers: ["background", "objects"],
        });
    }

    override OnAwake(): void
    {
        bare.AddClass(DocEnemy);
        bare.AddClass(SpinDocComponent);
        bare.AddClass(HitDocComponent);
        bare.AddClass(LifecycleDocComponent);
    }

    override async OnStart()
    {
        const c = this.checks;

        // scenes: payload reaches OnAwake and OnStart
        const payloadScene = await bare.scene.Add(PayloadScene, { levelName: "level2" });
        c.check(payloadScene.awakePayload?.levelName === "level2", "scene payload should arrive in OnAwake");
        c.check(payloadScene.startPayload?.levelName === "level2", "scene payload should arrive in OnStart");
        c.check(bare.scene.Get(PayloadScene) === payloadScene, "bare.scene.Get should find a running scene");
        bare.scene.Remove(payloadScene);
        c.check(!bare.scene.Has(PayloadScene), "bare.scene.Remove should remove the scene");

        // lifecycle: Restart reruns OnRestart then OnStart but not OnAwake
        const order = await bare.scene.Add(OrderScene) as OrderScene;
        await order.Restart();
        c.check(order.order.join(",") === "awake,start,start", "restart should rerun OnStart but not OnAwake: " + order.order.join(","));
        c.check(order.restarts === 1, "restart should run OnRestart once");
        bare.scene.Remove(order);

        // game objects: chaining setters
        const ball = this.AddGameObject("ball")
            .SetPosition(100, 200)
            .SetScale(2)
            .SetRotation(45)
            .CenterPivot();
        c.check(ball.x === 100 && ball.y === 200, "SetPosition should chain");
        c.check(ball.scale.x === 2 && ball.scale.y === 2, "SetScale(n) should set both axes");
        c.check(ball.rotation === 45, "SetRotation should be in degrees");
        c.check(ball.pivot.x === 0.5 && ball.pivot.y === 0.5, "CenterPivot should set pivot to 0.5");

        // entity with extends + override
        const bigBall = this.AddGameObject({ name: "bigBall", extends: "ball", x: 50 });
        c.check(bigBall.x === 50, "entity override should apply");
        c.check(bigBall.scale.x === 2, "entity should inherit from extended prefab");

        // empty game object and class input
        const empty = this.AddGameObject();
        c.check(empty instanceof GameObject, "AddGameObject() should create an empty GameObject");
        const enemyFromClass = this.AddGameObject(DocEnemy);
        c.check(enemyFromClass instanceof DocEnemy, "AddGameObject(Class) should create that class");

        // parent argument: layer name
        const cloud = this.AddGameObject("ball", "background");
        c.check(bare.object.GetLayerOf(cloud) === bare.object.GetLayers().indexOf(bare.object.GetLayerByName("background")), "parent layer name should place the object on that layer");
        const child = this.AddGameObject("ball", ball);
        c.check(child.parent === ball, "parent GameObject argument should add as child");

        // inner transform does not move the object
        const squash = this.AddGameObject("ball").SetPosition(10, 10);
        squash.innerScale = new Vec2(1, 0.8);
        c.check(squash.x === 10 && squash.y === 10, "inner transform should not move the object");
        c.check(squash.childrenInheritInnerTransform === true, "children should inherit the inner transform by default");

        // children
        const ship = this.AddGameObject();
        const gun = ship.AddChild().SetPosition(20, 0);
        gun.name = "gun";
        c.check(ship.GetChildByName("gun") === gun, "GetChildByName should find the child");
        const shipGlobal = ship.SetPosition(100, 0);
        const gunWorld = gun.ToGlobal(new Vec2(0, 0));
        c.check(Math.abs(gunWorld.x - 120) < 0.0001, "ToGlobal should convert child space to world: " + gunWorld.x);
        const backLocal = gun.ToLocal(gunWorld);
        c.check(Math.abs(backLocal.x) < 0.0001 && Math.abs(backLocal.y) < 0.0001, "ToLocal should invert ToGlobal");
        gun.RemoveFromParent();
        c.check(!shipGlobal.children.includes(gun), "RemoveFromParent should detach the child");

        // prefab children
        const shipPrefab = this.AddGameObject("ship");
        c.check(shipPrefab.GetChildByName("gun")?.x === 20, "prefab children should be created with their position");

        // components on game objects
        const holder = this.AddGameObject();
        const spin = holder.AddComponent(SpinDocComponent);
        c.check(spin.speed === 90, "component field default should apply");
        c.check(holder.GetComponent(SpinDocComponent) === spin, "GetComponent should return the component");
        c.check(holder.HasComponent(SpinDocComponent), "HasComponent should be true after adding");
        c.check(spin.go === holder, "this.go should be the GameObject");
        c.check(spin.scene === this, "this.scene should be the scene");
        holder.rotation = 0;
        spin.OnUpdate(0.5);
        c.check(holder.rotation === 45, "SpinComponent should rotate speed * deltaTime");
        c.check(bare.component.GetAllByType(SpinDocComponent).includes(spin), "GetAllByType should find the component");
        holder.RemoveComponent(SpinDocComponent);
        c.check(!holder.HasComponent(SpinDocComponent), "RemoveComponent should remove it");

        // components from prefabs: lowercase name without Component suffix
        const fan = this.AddGameObject("fan");
        c.check(fan.GetComponent(SpinDocComponent)?.speed === 180, "prefab component values should set fields");

        // component lifecycle
        const lifeObj = this.AddGameObject();
        const life = lifeObj.AddComponent(LifecycleDocComponent);
        c.check(life.calls.slice(0, 2).join(",") === "awake,added", "component added to a started object should awake and add before AddComponent returns: " + life.calls.join(","));
        bare.component.Disable(lifeObj, LifecycleDocComponent);
        bare.component.Enable(lifeObj, LifecycleDocComponent);
        c.check(life.calls.includes("disable") && life.calls.includes("enable"), "Disable/Enable should call OnDisable/OnEnable: " + life.calls.join(","));
        lifeObj.Remove();
        c.check(life.calls[life.calls.length - 1] === "removed", "removing the object should call component OnRemoved");

        // CallMethodOnComponentsOfObject
        const enemy = this.AddGameObject("enemy");
        bare.component.CallMethodOnComponentsOfObject("OnHit", enemy, 7);
        c.check(enemy.GetComponent(HitDocComponent)?.hits[0] === 7, "CallMethodOnComponentsOfObject should call the method with args");

        // prefab extends chain
        const boss = this.AddGameObject("bossEnemy");
        c.check(boss.scale.x === 3, "extending prefab should override scale");
        c.check(boss.HasComponent(HitDocComponent), "extending prefab should inherit components");

        // base prefabs and ANY / NONE
        const grass = this.AddGameObject("grassMid");
        c.check(grass.tags.includes("solid"), "base prefab properties should be inherited");
        c.check(grass.pivot.x === 0.25, "ANY should apply to prefabs extending base prefabs");
        const bg = this.AddGameObject("background");
        c.check(bg.pivot.x === 0, "NONE should skip ANY");
        c.check(this.AddGameObject({}).pivot.x === 0.25, "entities without extends should extend ANY");

        // presets
        c.check(this.AddGameObject("centered").pivot.x === 0.5, "CENTER preset should fill pivot");
        const half = this.AddGameObject("halfScaled");
        c.check(half.scale.x === 0.5 && half.scale.y === 0.5, "ANY preset should fill any property");

        // propertiesRemoved / componentsRemoved
        c.check(this.AddGameObject("noScale").scale.x === 1, "propertiesRemoved should drop inherited properties");
        c.check(!this.AddGameObject("noHit").HasComponent(HitDocComponent), "componentsRemoved should drop inherited components");

        // custom game objects: baseClass, inspector field from prefab, pooling
        const goblin = this.AddGameObject<DocEnemy>("goblin");
        c.check(goblin instanceof DocEnemy, "baseClass should create the registered class");
        c.check(goblin.health === 5, "inspector field should be set from the prefab");
        const coded = this.AddGameObject<DocEnemy>({ baseClass: "DocEnemy", health: 4 });
        c.check(coded.health === 4, "entity baseClass with field should work from code");

        const pooled = this.AddGameObject(DocEnemy) as DocEnemy;
        pooled.health = 1;
        pooled.Hit();
        const reused = this.AddGameObject(DocEnemy) as DocEnemy;
        c.check(reused === pooled, "removed pooled objects should be reused");
        c.check(reused.health === 3, "OnAwake should reset custom fields on reuse");
        c.check(bare.pool.get("DocEnemy") !== undefined, "bare.pool should expose pools by class name");
        // the guide's "create the objects up front", for a class that's already registered (and so has a pool)
        bare.RegisterGameObjectPool(DocEnemy, 25);
        c.check(bare.pool.get("DocEnemy")!.GetSize() >= 25, "RegisterGameObjectPool should fill an existing pool: " + bare.pool.get("DocEnemy")!.GetSize());

        // ordering within a layer
        const a = this.AddGameObject();
        const b = this.AddGameObject();
        const layer = bare.object.GetLayerByName("objects");
        a.BringToFront();
        c.check(layer[layer.length - 1] === a, "BringToFront should move to the end of the layer");
        a.BringToBack();
        c.check(layer[0] === a, "BringToBack should move to the start of the layer");
        b.Remove();

        // objects and components start once the scene's OnStart has finished
        this.startProbe = this.AddGameObject().AddComponent(LifecycleDocComponent);
    }

    override OnUpdate(): void
    {
        if (!this.startProbe)
            return;

        this.checks.check(this.startProbe.calls.includes("start"), "component should start before its first update: " + this.startProbe.calls.join(","));
        this.startProbe = undefined;
        this.checks.flush();
    }
}
