import { GameObject, Scene } from "bare-engine";
import { Box, Type } from "bare-engine/sopiro";
import { Checks } from "./checks";

// joints added while the game runs, in a scene without a level (docs/reference/physics, Joints)
export class SopiroJointsTest extends Scene
{
    checks = new Checks();
    running = false;
    done = false;

    constructor()
    {
        super({
            basePrefabs: [{ name: "ANY", texture: "PIXEL" }],
            prefabs: [],
            gravity: 1200,
        } as any);
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

    AddBox(x: number, y: number, name: string): Box
    {
        const box = new Box(this, 40, 40, Type.Dynamic);
        box.name = name;
        this.AddGameObject(box);
        box.SetPosition(x, y);
        return box;
    }

    async RunChecks()
    {
        const c = this.checks;
        const joints = () => this.sopiro.world.joints.length;

        // on a single body, a joint pins it to the spot, also with SetPosition chained after AddGameObject
        const pinned = this.AddBox(200, 100, "pinned");
        const pin = this.AddGameObject<GameObject>({ baseClass: "RevoluteJointObject" } as any).SetPosition(200, 100);
        await this.WaitFrame(30);
        c.check(joints() === 1, "a joint added mid-game should connect: " + joints());
        c.check(Math.abs(pinned.y - 100) < 2, "a joint on one body should pin it: " + pinned.y);

        // removing the joint lets go of the body
        pin.Remove();
        c.check(joints() === 0, "a removed joint should leave the world: " + joints());
        await this.WaitFrame(30);
        c.check(pinned.y > 130, "a body should fall once its joint is removed: " + pinned.y);

        // body names set after AddGameObject count too
        this.AddBox(400, 100, "left");
        this.AddBox(440, 100, "right");
        const weld = this.AddGameObject<GameObject & { baseName: string, targetName: string }>({ baseClass: "WeldJointObject" } as any);
        weld.baseName = "left";
        weld.targetName = "right";
        await this.WaitFrame(2);
        c.check(joints() === 1, "a joint should connect the bodies named after AddGameObject: " + joints());

        // removed in the same frame it was added: never connects
        this.AddGameObject<GameObject>({ baseClass: "RevoluteJointObject" } as any).SetPosition(400, 100).Remove();
        await this.WaitFrame(2);
        c.check(joints() === 1, "a joint removed before it connected should not connect: " + joints());
    }
}
