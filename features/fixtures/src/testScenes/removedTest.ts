import { GameObject, Scene } from "bare-engine";
import { Checks } from "./checks";

// covers GameObject.removed and generation: removing an object and its children, adding it again, a pool reusing
// a removed object, moving an object, and a scene going

class Leftover extends Scene
{
    kept!: GameObject;

    override OnStart(): void
    {
        this.kept = this.AddGameObject();
    }
}

export class RemovedTest extends Scene
{
    checks = new Checks();
    done = false;

    constructor()
    {
        super({ settingsData: { layers: ["objects"] } });
    }

    override async OnStart(): Promise<void>
    {
        const c = this.checks;

        // even an object without an image can come from a pool, so generations are compared with the one it had
        const parent = this.AddGameObject();
        const child = parent.AddChild();
        const start = parent.generation;
        c.check(!parent.removed && !child.removed, "a new object shouldn't count as removed");
        parent.Remove();
        c.check(parent.removed && parent.generation === start + 1, `a removed object should be removed, one generation on, was ${parent.removed}, ${parent.generation - start}`);
        c.check(child.removed, "the child of a removed object should be removed too");
        parent.Remove();
        c.check(parent.generation === start + 1, "removing an object twice should count once");

        this.AddGameObject(parent);
        c.check(!parent.removed && parent.generation === start + 1, "an object added again shouldn't be removed, and keep its generation");

        // an object made from an image is pooled, and the pool hands it out again once it's removed
        const pooled = this.AddGameObject("PIXEL");
        const generation = pooled.generation;
        pooled.Remove();
        c.check(pooled.removed, "a removed pooled object should be removed");
        const next = this.AddGameObject("PIXEL");
        if (next === pooled)
            c.check(!pooled.removed && pooled.generation !== generation, "a reused pooled object should have another generation");
        else
            c.check(pooled.removed, "a pooled object that wasn't reused should stay removed");

        // moving isn't removing
        const moved = this.AddGameObject();
        const holder = this.AddGameObject();
        const before = moved.generation;
        holder.AddChild(moved);
        c.check(!moved.removed && moved.generation === before && moved.parent === holder, "moving an object under a parent shouldn't remove it");
        this.AddGameObject(moved);
        c.check(!moved.removed && moved.generation === before && moved.parent === null, "moving an object back to a layer shouldn't remove it");

        const leftover = await bare.scene.Add(Leftover) as Leftover;
        const kept = leftover.kept;
        bare.scene.Remove(leftover);
        c.check(kept.removed, "an object should be removed when its scene goes");

        this.done = true;
    }

    override OnUpdate(): void
    {
        if (this.done)
        {
            this.done = false;
            this.checks.flush();
        }
    }
}
