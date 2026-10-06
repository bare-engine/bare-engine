import { AnimationComponent, AnimationEvent, RenderTexture, Scene } from "bare-engine";
import { Checks } from "./checks";

// covers docs/guide/animations: frame stepping, events, loop/complete, chaining, callbacks, removeOnComplete, imagePath

export class AnimationsAdvancedTest extends Scene
{
    checks = new Checks();

    constructor()
    {
        super({
            basePrefabs: [{ name: "ANY", texture: "PIXEL" }],
            prefabs: [
                { name: "knight", texture: "NONE" },
            ],
            animations: {
                // each frame is a different size, so the shown frame can be read from the texture width
                knight_walk: { frames: ["animF1", "animF2", "animF3"], framesPerSecond: 10 },
                knight_attack: { frames: ["animF3", "animF2"], framesPerSecond: 10, loop: false },
                knight_idle: { frames: ["animF1"], framesPerSecond: 10 },
                knight_die: { frames: ["animF2"], framesPerSecond: 10, loop: false },
                knight_dust: { frames: ["animF1", "animF2"], framesPerSecond: 10, loop: false, removeOnComplete: true },
                knight_folder: { imagePath: "animDir", frames: ["frame"], framesPerSecond: 10 },
            },
            layers: ["objects"],
        } as any);
    }

    OnAwake(): void
    {
        for (const [name, size] of [["animF1", 10], ["animF2", 20], ["animF3", 30], ["animDir/frame", 40]] as const)
            bare.asset.AddTexture(name, new RenderTexture(rapid, { width: size, height: size }) as any);
    }

    OnClear(): void
    {
        for (const name of ["animF1", "animF2", "animF3", "animDir/frame"])
            bare.asset.RemoveTexture(name);
    }

    // everything is stepped by hand with OnUpdate(seconds), inside OnStart where the engine doesn't update objects yet
    async OnStart()
    {
        const c = this.checks;
        const step = (anim: AnimationComponent, times: number) => { for (let i = 0; i < times; i++) anim.OnUpdate(0.1); };

        const knight = this.AddGameObject("knight");
        const anim = knight.AddComponent(AnimationComponent);
        const frames: number[] = [];
        let loops = 0;
        let completes = 0;
        let starts = 0;
        anim.events.on(AnimationEvent.frameChanged, ({ frame }) => frames.push(frame));
        anim.events.on(AnimationEvent.looped, () => loops++);
        anim.events.on(AnimationEvent.completed, () => completes++);
        anim.events.on(AnimationEvent.started, () => starts++);

        // stepping frames and showing their texture
        await anim.Play("walk");
        c.check(starts === 1 && anim.current.get() === "walk", "Play should start 'walk': " + anim.current.get());
        c.check(knight.width === 10, "the first frame should be shown right away: " + knight.width);
        anim.OnUpdate(0.05);
        c.check(anim.frame.get() === 0, "half a frame's time should not advance the frame");
        anim.OnUpdate(0.05);
        c.check(anim.frame.get() === 1 && knight.width === 20, "framesPerSecond should decide when the next frame shows: " + knight.width);
        step(anim, 1);
        c.check(knight.width === 30 && frames.join(",") === "1,2", "frameChanged should report every new frame: " + frames.join(","));

        // looping starts over and emits looped, never completed
        step(anim, 1);
        c.check(loops === 1 && completes === 0, "a looping animation should loop, not complete: " + loops + "/" + completes);
        c.check(anim.frame.get() === 0 && knight.width === 10, "looping should show the first frame again: " + knight.width);
        step(anim, 3);
        c.check(loops === 2, "every pass should emit looped: " + loops);

        // GotoFrame clamps, Pause and Resume toggle playing
        anim.GotoFrame(99);
        c.check(anim.frame.get() === 2 && knight.width === 30, "GotoFrame should clamp to the last frame");
        anim.Pause();
        c.check(!anim.playing.get(), "Pause should stop playing");
        anim.Resume();
        c.check(anim.playing.get(), "Resume should continue playing");

        // a non-looping animation completes once and pauses on its last frame
        frames.length = 0;
        loops = 0;
        await anim.Play("attack");
        step(anim, 2);
        c.check(completes === 1 && loops === 0, "a non-looping animation should complete once: " + completes);
        c.check(!anim.playing.get(), "a completed animation should pause");

        // Play(name, nextName) plays the next one once the first ends
        await anim.Play("attack", "idle");
        step(anim, 2);
        c.check(anim.current.get() === "idle", "Play(attack, idle) should go back to idle: " + anim.current.get());
        c.check(anim.playing.get(), "the follow-up animation should be playing");
        await anim.Play("attack");
        step(anim, 2);
        c.check(anim.current.get() === "attack", "the follow-up should only apply to that play: " + anim.current.get());

        // Play(name, fn) calls fn once, a later play without it doesn't
        let died = 0;
        await anim.Play("die", () => died++);
        step(anim, 1);
        await anim.Play("die");
        step(anim, 1);
        c.check(died === 1, "a Play callback should only run for that play: " + died);

        // OnComplete runs every time the animation ends
        let attackEnds = 0;
        anim.OnComplete("attack", () => attackEnds++);
        await anim.Play("attack");
        step(anim, 2);
        await anim.Play("attack");
        step(anim, 2);
        c.check(attackEnds === 2, "OnComplete should run every time: " + attackEnds);

        // Data.Animation style full names work too
        await anim.Play("knight_walk");
        c.check(anim.current.get() === "walk", "a full 'knight_walk' name should play 'walk': " + anim.current.get());

        // imagePath is put in front of every frame name
        await anim.Play("folder");
        c.check(knight.width === 40, "imagePath should prefix the frame names: " + knight.width);

        // a missing animation leaves the current one alone
        const errors: unknown[] = [];
        const error = console.error;
        console.error = (...args: unknown[]) => errors.push(args);
        try
        {
            await anim.Play("doesNotExist");
        }
        finally
        {
            console.error = error;
        }
        c.check(errors.length === 1 && anim.current.get() === "folder", "playing a missing animation should log and keep the current one");

        // removeOnComplete removes the GameObject at the end
        const dusty = this.AddGameObject("knight");
        const dust = dusty.AddComponent(AnimationComponent);
        await dust.Play("dust");
        step(dust, 1);
        c.check(dusty.scene === this && bare.object.GetAll().includes(dusty), "removeOnComplete should wait for the end");
        step(dust, 1);
        c.check(!bare.object.GetAll().includes(dusty), "removeOnComplete should remove the GameObject when it ends");

        // components on separate objects keep their own frame state
        const a = this.AddGameObject("knight").AddComponent(AnimationComponent);
        const b = this.AddGameObject("knight").AddComponent(AnimationComponent);
        await a.Play("walk");
        await b.Play("walk");
        step(a, 2);
        c.check(a.frame.get() === 2 && b.frame.get() === 0, "two objects playing the same animation should not share frames");

        // framesPerSecond can change at runtime, only for that object
        a.framesPerSecond.set(20);
        a.GotoFrame(0);
        a.OnUpdate(0.05);
        c.check(a.frame.get() === 1, "a higher framesPerSecond should advance faster");
        c.check(b.framesPerSecond.get() === 10, "changing framesPerSecond should not affect other objects");

        c.flush();
    }
}
