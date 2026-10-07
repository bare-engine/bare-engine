import { BareEvent, Component, GameObject, Scene, Vec2 } from "bare-engine";
import { Checks } from "./checks";

// covers docs/guide/game-objects and lifecycle: nested transforms, bounds, sizing, removal of trees, pooled resets

export class RemovalProbeComponent extends Component
{
    static removed: string[] = [];

    override OnRemoved() { RemovalProbeComponent.removed.push(this.go.name); }
}

export class PoolProbe extends GameObject {}

const near = (a: number, b: number, epsilon = 0.0001) => Math.abs(a - b) < epsilon;
const nearVec = (v: Vec2, x: number, y: number, epsilon = 0.0001) => near(v.x, x, epsilon) && near(v.y, y, epsilon);
const show = (v: { x: number, y: number }) => `(${v.x.toFixed(3)}, ${v.y.toFixed(3)})`;

export class HierarchyAdvancedTest extends Scene
{
    checks = new Checks();

    constructor()
    {
        super({
            basePrefabs: [{ name: "ANY", texture: "PIXEL" }],
            prefabs: [{ name: "box" }],
            layers: ["objects"],
        });
    }

    override OnAwake(): void
    {
        bare.AddClass(RemovalProbeComponent);
        bare.AddClass(PoolProbe);
    }

    override OnStart(): void
    {
        const c = this.checks;

        // nested transforms: rotation and scale of every ancestor apply to children
        const root = this.AddGameObject().SetPosition(100, 100).SetRotation(90).SetScale(2);
        const child = root.AddChild().SetPosition(10, 0).SetRotation(90);
        const grandchild = child.AddChild().SetPosition(5, 0);
        c.check(nearVec(child.ToGlobal(), 100, 120), "a child should be rotated and scaled by its parent: " + show(child.ToGlobal()));
        c.check(nearVec(grandchild.ToGlobal(), 90, 120), "a grandchild should combine both rotations: " + show(grandchild.ToGlobal()));
        c.check(nearVec(grandchild.ToGlobal(new Vec2(1, 0)), 88, 120), "a grandchild's x axis should point left after 180 degrees, scaled by 2: " + show(grandchild.ToGlobal(new Vec2(1, 0))));
        c.check(nearVec(root.ToLocal(grandchild.ToGlobal()), 10, 5), "root.ToLocal should give the grandchild in root space: " + show(root.ToLocal(grandchild.ToGlobal())));

        // moving the root moves the whole tree, the children's own positions stay the same
        root.SetPosition(0, 0);
        c.check(nearVec(grandchild.ToGlobal(), -10, 20), "moving the root should move its grandchildren: " + show(grandchild.ToGlobal()));
        c.check(grandchild.x === 5 && grandchild.y === 0, "a child's position should stay relative to its parent");

        // ToLocal inverts ToGlobal through flips, non-uniform scale and inner transforms
        const a = this.AddGameObject().SetPosition(-40, 75).SetRotation(33);
        a.scale.set(1.5, -0.5);
        a.innerPosition.set(7, -3);
        a.innerRotation = 20;
        a.innerScale = new Vec2(0.8, 1.2);
        const b = a.AddChild().SetPosition(12, -9).SetRotation(-71);
        b.flipped = true;
        const cc = b.AddChild().SetPosition(3, 4);
        cc.scale.set(2, 3);
        const point = new Vec2(13, -6);
        const world = cc.ToGlobal(point);
        c.check(nearVec(cc.ToLocal(world), point.x, point.y, 0.001), "ToLocal should invert ToGlobal through a complex tree: " + show(cc.ToLocal(world)));

        // children follow the inner transform unless childrenInheritInnerTransform is off
        const holder = this.AddGameObject().SetPosition(200, 200);
        const rider = holder.AddChild().SetPosition(10, 0);
        const before = rider.ToGlobal();
        holder.innerRotation = 90;
        const inherited = rider.ToGlobal();
        holder.childrenInheritInnerTransform = false;
        const notInherited = rider.ToGlobal();
        c.check(!nearVec(inherited, before.x, before.y), "children should follow the inner rotation by default");
        c.check(nearVec(notInherited, before.x, before.y), "with childrenInheritInnerTransform off, the inner rotation should not move children: " + show(notInherited));
        c.check(holder.x === 200 && holder.y === 200, "an inner rotation should not move the object itself");

        // bounds of a rotated, scaled image
        const plank = this.AddGameObject("box").SetPosition(0, 0);
        plank.scale.set(10, 20);
        let bounds = plank.GetBounds();
        c.check(near(bounds.width, 10) && near(bounds.height, 20), "GetBounds should be the scaled image size: " + JSON.stringify(bounds));
        plank.SetRotation(90);
        bounds = plank.GetBounds();
        c.check(near(bounds.width, 20) && near(bounds.height, 10), "GetBounds should follow rotation: " + JSON.stringify(bounds));
        plank.SetRotation(0);

        // bounds with children cover the whole tree
        const group = this.AddGameObject().SetPosition(100, 0);
        group.AddChild("box").SetPosition(0, 0).SetScale(10);
        group.AddChild("box").SetPosition(50, 40).SetScale(10);
        const groupBounds = group.GetBoundsWithChildren();
        c.check(near(groupBounds.x, 100) && near(groupBounds.y, 0) && near(groupBounds.width, 60) && near(groupBounds.height, 50),
            "GetBoundsWithChildren should cover every child: " + JSON.stringify(groupBounds));
        group.SetScale(2);
        const scaledGroupBounds = group.GetBoundsWithChildren();
        c.check(near(scaledGroupBounds.width, 120) && near(scaledGroupBounds.height, 100), "GetBoundsWithChildren should follow the parent's scale: " + JSON.stringify(scaledGroupBounds));

        // pivots: SetPivotWhileKeepingPosition doesn't move the image, CenterPivot centers it on the position
        const sign = this.AddGameObject("box").SetPosition(300, 300).SetScale(40);
        const signBounds = sign.GetBounds();
        sign.SetPivotWhileKeepingPosition(0.5, 0.5);
        const keptBounds = sign.GetBounds();
        c.check(near(signBounds.x, keptBounds.x) && near(signBounds.y, keptBounds.y), "SetPivotWhileKeepingPosition should not move the image: " + JSON.stringify(keptBounds));
        const mount = this.AddGameObject().SetPosition(50, 50).SetRotation(30).SetScale(2);
        const flag = mount.AddChild("box").SetPosition(10, 5).SetRotation(45).SetScale(8);
        const flagBounds = flag.GetBounds();
        flag.SetPivotWhileKeepingPosition(0.5, 1);
        const keptFlagBounds = flag.GetBounds();
        c.check(near(flagBounds.x, keptFlagBounds.x, 0.001) && near(flagBounds.y, keptFlagBounds.y, 0.001) && near(flagBounds.width, keptFlagBounds.width, 0.001),
            "SetPivotWhileKeepingPosition should not move a rotated child of a scaled parent: " + JSON.stringify(flagBounds) + " vs " + JSON.stringify(keptFlagBounds));
        const centered = this.AddGameObject("box").SetPosition(300, 300).SetScale(40).CenterPivot();
        const centeredBounds = centered.GetBounds();
        c.check(near(centeredBounds.x, 280) && near(centeredBounds.y, 280), "CenterPivot should center the image on the position: " + JSON.stringify(centeredBounds));
        c.check(nearVec(centered.GetCenterPosition(), 300, 300), "GetCenterPosition should be the image center: " + show(centered.GetCenterPosition()));
        c.check(nearVec(centered.GetTopLeftPosition(), 280, 280), "GetTopLeftPosition should be the image's top-left: " + show(centered.GetTopLeftPosition()));

        // sizing to dimensions
        const banner = this.AddGameObject("box").SetScaleToReachDimensions(64, 32);
        c.check(banner.scale.x === 64 && banner.scale.y === 32, "SetScaleToReachDimensions should stretch to the size");
        const icon = this.AddGameObject("box").SetScaleToReachDimensions(64, 32, true);
        c.check(icon.scale.x === 32 && icon.scale.y === 32, "keepRatio should use the smaller scale: " + show(icon.scale));
        banner.FlipX();
        c.check(banner.scale.x === -64, "FlipX should negate the x scale");

        // removing a parent removes the whole tree, and its components hear about it
        RemovalProbeComponent.removed = [];
        const removedObjects: GameObject[] = [];
        const onRemoved = (obj: GameObject) => removedObjects.push(obj);
        bare.events.on(BareEvent.game_objectRemoved, onRemoved);
        const tree = this.AddGameObject();
        tree.name = "tree";
        const branch = tree.AddChild();
        branch.name = "branch";
        const leaf = branch.AddChild();
        leaf.name = "leaf";
        tree.AddComponent(RemovalProbeComponent);
        leaf.AddComponent(RemovalProbeComponent);
        const leafID = leaf.uniqueID;
        tree.Remove();
        bare.events.off(BareEvent.game_objectRemoved, onRemoved);
        c.check(bare.object.GetById(leafID) === null, "removing a parent should remove its grandchildren");
        c.check(RemovalProbeComponent.removed.includes("tree") && RemovalProbeComponent.removed.includes("leaf"),
            "components on every removed object should get OnRemoved: " + RemovalProbeComponent.removed.join(","));
        c.check(removedObjects.length === 3, "game_objectRemoved should fire for the parent and every descendant: " + removedObjects.length);

        // RemoveFromParent on a child only removes that child
        const ship = this.AddGameObject();
        const gun = ship.AddChild();
        const shield = ship.AddChild();
        gun.RemoveFromParent();
        c.check(ship.children.length === 1 && ship.children[0] === shield, "RemoveFromParent should only remove that child");
        c.check(gun.parent === null, "a removed child should have no parent");

        // a reused pooled object starts clean
        const used = this.AddGameObject(PoolProbe);
        used.name = "used";
        used.SetPosition(10, 20).SetRotation(45).SetScale(3).SetAlpha(0.2).SetPivot(0.5, 0.5);
        used.innerScale = new Vec2(2, 2);
        used.innerRotation = 30;
        used.flipped = true;
        used.visible = false;
        used.persistent = true;
        used.tags.push("dirty");
        used.AddChild();
        used.AddComponent(RemovalProbeComponent);
        used.persistent = false;
        used.Remove();
        const reused = this.AddGameObject(PoolProbe);
        c.check(reused === used, "the pooled object should be reused");
        c.check(reused.x === 0 && reused.y === 0 && reused.rotation === 0 && reused.scale.x === 1, "a reused object should have a default transform: " + show(reused.position) + " " + reused.rotation + " " + show(reused.scale));
        c.check(reused.innerScale.x === 1 && reused.innerRotation === 0 && !reused.flipped, "a reused object should have a default inner transform");
        c.check(reused.alpha === 1 && reused.visible && !reused.persistent, "a reused object should be visible, opaque and not persistent");
        c.check(reused.pivot.x === 0 && reused.pivot.y === 0, "a reused object should have a default pivot");
        c.check(reused.tags.length === 0, "a reused object should have no tags: " + reused.tags.join(","));
        c.check(reused.children.length === 0, "a reused object should have no children: " + reused.children.length);
        c.check(!reused.HasComponent(RemovalProbeComponent), "a reused object should have no components");
        c.check(reused.uniqueID !== "" && bare.object.GetById(reused.uniqueID) === reused, "a reused object should be findable by its id");

        c.flush();
    }
}
