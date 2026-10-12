import { Easing, FlashShader, Scene, TweenTo } from "bare-engine";
import { Checks } from "./checks";

// covers bare.timeScale and bare.gameTime, and what runs on game time: fixed updates, tweens, FlashShader.
// also tween.Shake settling at the property's own value, and AddShader replacing a shader of the same class

export class GameSpeedTest extends Scene
{
    checks = new Checks();
    running = false;
    done = false;
    fixedSteps = 0;

    constructor()
    {
        super({
            basePrefabs: [{ name: "ANY", texture: "PIXEL" }],
            layers: ["objects"],
        });
    }

    override OnFixedUpdate(): void
    {
        this.fixedSteps++;
    }

    override OnUpdate(): void
    {
        if (!this.running)
        {
            this.running = true;
            void this.RunChecks().finally(() => {
                bare.timeScale = 1;
                this.done = true;
            });
        }

        if (this.done)
        {
            this.done = false;
            this.checks.flush();
        }
    }

    async RunChecks()
    {
        const c = this.checks;

        // timeScale 2: game time and fixed updates run about twice as fast as real time
        bare.timeScale = 2;
        await waitFrame();
        const startGame = bare.gameTime;
        const startSteps = this.fixedSteps;
        const startReal = performance.now();
        await waitRealTime(0.3);
        const realMs = performance.now() - startReal;
        const gameMs = bare.gameTime - startGame;
        const steps = this.fixedSteps - startSteps;
        c.check(gameMs > realMs * 1.5 && gameMs < realMs * 2.5, `game time should run twice as fast at timeScale 2: ${gameMs.toFixed(0)}ms in ${realMs.toFixed(0)}ms`);
        c.check(steps > realMs / 1000 * 60 * 1.5, `timeScale 2 should run more fixed updates: ${steps} in ${realMs.toFixed(0)}ms`);
        c.check(Math.abs(bare.deltaTime - bare.unscaledDeltaTime * 2) < 1e-9, `deltaTime should be unscaledDeltaTime times timeScale: ${bare.deltaTime} vs ${bare.unscaledDeltaTime}`);

        // tweens follow the time scale: a 0.4s tween is done after 0.2s of real time
        const fast = { x: 0 };
        TweenTo(fast, 0.4, { x: 100, ease: Easing.Linear.None });
        await waitRealTime(0.25);
        c.check(fast.x > 90, "a tween should run twice as fast at timeScale 2: " + fast.x);

        // a tween updates once per frame, not once per update source
        bare.timeScale = 1;
        let tweenUpdates = 0;
        const counted = { x: 0 };
        TweenTo(counted, 10, { x: 100, onUpdate: () => tweenUpdates++ });
        await waitFrame();
        const startFrame = bare.count;
        const startUpdates = tweenUpdates;
        await wait(0.25);
        const frames = bare.count - startFrame;
        c.check(Math.abs((tweenUpdates - startUpdates) - frames) <= 1, `a tween should update once per frame: ${tweenUpdates - startUpdates} updates in ${frames} frames`);
        bare.tween.RemoveAllFrom(counted);

        // timeScale 0 stops game time and tweens
        bare.timeScale = 0;
        await waitRealTime(0.05);
        const frozenAt = bare.gameTime;
        const frozen = { x: 0 };
        TweenTo(frozen, 0.1, { x: 100 });
        await waitRealTime(0.15);
        c.check(bare.gameTime === frozenAt, "game time should stand still at timeScale 0");
        c.check(frozen.x === 0, "a tween should not move at timeScale 0: " + frozen.x);
        bare.tween.RemoveAllFrom(frozen);
        bare.timeScale = 1;

        // Shake settles at the property's own value, not at 0
        const scaled = { v: 1 };
        await bare.tween.Shake(scaled, "v", 0.2, 0.5).promise;
        c.check(scaled.v === 1, "Shake should settle at the value it started from: " + scaled.v);

        const zero = { v: 0 };
        await bare.tween.Shake(zero, "v", 0.2, 10).promise;
        c.check(zero.v === 0, "Shake on a value at 0 should settle at 0: " + zero.v);

        // shaking again mid-wobble settles where the first shake started
        const twice = { v: 1 };
        bare.tween.Shake(twice, "v", 0.3, 0.5);
        await wait(0.05);
        await bare.tween.Shake(twice, "v", 0.2, 0.5).promise;
        c.check(twice.v === 1, "a second Shake mid-wobble should settle at the first one's rest value: " + twice.v);

        // AddShader replaces a shader of the same class
        const obj = this.AddGameObject("PIXEL").SetScale(10);
        const first = obj.AddShader(FlashShader);
        const second = obj.AddShader(FlashShader, { duration: 0.05 });
        c.check(obj.shaders.length === 1 && obj.shaders[0] === second && first !== second, "adding a FlashShader again should replace the running one: " + obj.shaders.length);

        // FlashShader without settings uses the defaults (0.1s white, 0.3s fade) and removes itself
        obj.RemoveShaders();
        obj.AddShader(FlashShader);
        await wait(0.6);
        c.check(!obj.HasShader(FlashShader), "a FlashShader without settings should be done after its default duration");

        // FlashShader runs on game time, so it waits at timeScale 0
        obj.AddShader(FlashShader, { duration: 0.05, fadePreDuration: 0 });
        bare.timeScale = 0;
        await waitRealTime(0.15);
        c.check(obj.HasShader(FlashShader), "a FlashShader should not finish at timeScale 0");
        bare.timeScale = 1;
        await wait(0.2);
        c.check(!obj.HasShader(FlashShader), "a FlashShader should finish once game time runs again");

        // wait() runs on game time: faster at timeScale 2, not at all at timeScale 0
        bare.timeScale = 2;
        const waitStartGame = bare.gameTime;
        const waitStartReal = performance.now();
        await wait(0.3);
        const waitGameMs = bare.gameTime - waitStartGame;
        const waitRealMs = performance.now() - waitStartReal;
        c.check(waitGameMs >= 300, "wait should last its seconds in game time: " + waitGameMs.toFixed(0));
        c.check(waitRealMs < waitGameMs * 0.75, `wait should take less real time at timeScale 2: ${waitRealMs.toFixed(0)}ms real for ${waitGameMs.toFixed(0)}ms game`);

        bare.timeScale = 0;
        let waitDone = false;
        void wait(0.05).then(() => waitDone = true);
        await waitRealTime(0.15);
        c.check(!waitDone, "wait should not finish at timeScale 0");
        bare.timeScale = 1;
        await waitRealTime(0.15);
        c.check(waitDone, "wait should finish once game time runs again");

        // a cancelled wait never finishes, and is dropped right away
        let cancelledDone = false;
        void wait(0.05).then(() => cancelledDone = true);
        cancelWaits();
        await waitRealTime(0.15);
        c.check(!cancelledDone, "a cancelled wait should never finish");

        // DisableRightClick turns off the development right click select
        const before = bare.rightClickSelect;
        bare.DisableRightClick();
        c.check(!bare.rightClickSelect, "DisableRightClick should turn off right click select");
        bare.rightClickSelect = before;
    }
}
