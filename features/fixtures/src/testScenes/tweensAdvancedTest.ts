import { Easing, Scene, Tween, TweenTo } from "bare-engine";
import { Checks } from "./checks";

// covers docs/reference/tweens: options, callbacks, nested properties, chains, persistence

class TweenHelperScene extends Scene {}

const near = (a: number, b: number, epsilon = 0.001) => Math.abs(a - b) < epsilon;

export class TweensAdvancedTest extends Scene
{
    checks = new Checks();
    running = false;
    done = false;

    constructor()
    {
        super({ settingsData: {
            basePrefabs: [{ name: "ANY", texture: "PIXEL" }],
            layers: ["objects"],
        } });
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

    // tweens only advance once OnStart has finished, so everything runs from the first update
    async RunChecks()
    {
        const c = this.checks;

        // a custom ease is used for every step, and the value ends exactly at the target
        const eased = { x: 0 };
        const easeInputs: number[] = [];
        await TweenTo(eased, 0.1, { x: 100, ease: (k: number) => { easeInputs.push(k); return k * k; } }).promise;
        c.check(easeInputs.length > 0, "a custom ease function should be called");
        c.check(easeInputs.every((k) => k >= 0 && k <= 1), "ease input should stay between 0 and 1: " + easeInputs.join(","));
        c.check(eased.x === 100, "a tween should end exactly at its target: " + eased.x);

        // linear ease halfway is roughly half the value, the default quadratic out is further along
        const linear = { x: 0 };
        const quadOut = { x: 0 };
        TweenTo(linear, 0.4, { x: 100, ease: Easing.Linear.None });
        TweenTo(quadOut, 0.4, { x: 100 });
        await this.Wait(0.2);
        c.check(linear.x > 20 && linear.x < 80, "linear ease should be partway at the halfway point: " + linear.x);
        c.check(quadOut.x > linear.x, "the default Quadratic.Out ease should be ahead of linear halfway: " + quadOut.x + " vs " + linear.x);
        bare.tween.RemoveAllFrom(linear);
        bare.tween.RemoveAllFrom(quadOut);

        // delay holds back the start and onStart
        const delayed = { x: 0 };
        let delayedStarted = 0;
        const delayedTween = TweenTo(delayed, 0.05, { x: 10, delay: 0.2, onStart: () => delayedStarted++ });
        await this.Wait(0.08);
        c.check(delayed.x === 0 && delayedStarted === 0, "delay should hold back the tween and onStart: " + delayed.x);
        await delayedTween.promise;
        c.check(delayed.x === 10 && delayedStarted === 1, "a delayed tween should still finish and start once");

        // yoyo goes there and back, and implies one repeat
        const yoyo = { x: 0 };
        let yoyoRepeats = 0;
        let yoyoCompletes = 0;
        await TweenTo(yoyo, 0.05, { x: 50, yoyo: true, onRepeat: () => yoyoRepeats++, onComplete: () => yoyoCompletes++ }).promise;
        c.check(near(yoyo.x, 0), "yoyo should come back to the start value: " + yoyo.x);
        c.check(yoyoRepeats === 1, "yoyo without repeat should repeat once: " + yoyoRepeats);
        c.check(yoyoCompletes === 1, "onComplete should run once after the last pass: " + yoyoCompletes);

        // repeat runs the pass again, onEveryStart sees every pass, onStart only the first
        const repeated = { x: 0 };
        let starts = 0;
        let everyStarts = 0;
        let repeats = 0;
        let updates = 0;
        await TweenTo(repeated, 0.04, {
            x: 10,
            repeat: 2,
            onStart: () => starts++,
            onEveryStart: () => everyStarts++,
            onRepeat: () => repeats++,
            onUpdate: () => updates++,
        }).promise;
        c.check(starts === 1, "onStart should run once with repeats: " + starts);
        c.check(everyStarts === 3, "onEveryStart should run for the first pass and each repeat: " + everyStarts);
        c.check(repeats === 2, "onRepeat should run once per repeat: " + repeats);
        c.check(updates >= 3, "onUpdate should run every step: " + updates);
        c.check(repeated.x === 10, "a repeating tween should end at its target");

        // initialDelay only waits before the first pass, delay waits before every repeat
        const initial = { x: 0 };
        const initialStart = bare.time;
        await TweenTo(initial, 0.03, { x: 5, initialDelay: 0.15, repeat: 2 }).promise;
        const initialElapsed = (bare.time - initialStart) / 1000;
        const everyDelay = { x: 0 };
        const everyStart = bare.time;
        await TweenTo(everyDelay, 0.03, { x: 5, delay: 0.15, repeat: 2 }).promise;
        const everyElapsed = (bare.time - everyStart) / 1000;
        c.check(initialElapsed >= 0.2 && initialElapsed < 0.4, "initialDelay should wait once: " + initialElapsed);
        c.check(everyElapsed >= 0.5, "delay should wait before every pass: " + everyElapsed);

        // relative values in both directions
        const relative = { x: 50, y: 50 };
        TweenTo(relative, 0.05, { x: "+=25", y: "-=25" } as any);
        bare.tween.FinishAllFrom(relative);
        c.check(near(relative.x, 75) && near(relative.y, 25), "'+=' and '-=' should add and subtract: " + JSON.stringify(relative));

        // nested properties: object form, dot path and $ path
        const nested = this.AddGameObject().SetPosition(0, 0);
        TweenTo(nested, 0.05, { innerPosition: { x: 10 } });
        TweenTo(nested, 0.05, { "innerPosition.y": 20 } as any);
        TweenTo(nested, 0.05, { innerScale$x: 3 } as any);
        bare.tween.FinishAllFrom(nested);
        c.check(near(nested.innerPosition.x, 10), "an object prop should tween a nested property: " + nested.innerPosition.x);
        c.check(near(nested.innerPosition.y, 20), "a 'a.b' prop should tween a nested property: " + nested.innerPosition.y);
        c.check(near(nested.innerScale.x, 3), "an 'a$b' prop should tween a nested property: " + nested.innerScale.x);
        c.check(nested.x === 0 && nested.y === 0, "inner tweens should not move the object");

        // overwrite only replaces tweens that share a property
        const split = { x: 0, y: 0 };
        TweenTo(split, 1, { x: 10 });
        TweenTo(split, 1, { y: 10 });
        c.check(bare.tween.GetAllFrom(split).length === 2, "tweens on different properties should both keep running");
        TweenTo(split, 1, { x: 20, y: 20 });
        c.check(bare.tween.GetAllFrom(split).length === 1, "a tween on both properties should replace both older ones");
        bare.tween.RemoveAllFrom(split);

        // removing a GameObject stops its tweens
        const removed = this.AddGameObject();
        TweenTo(removed, 1, { x: 100 });
        removed.Remove();
        c.check(bare.tween.GetAllFrom(removed).length === 0, "removing a GameObject should stop its tweens");

        // stopping a tween calls onStop, not onRepeat
        const stopped = { x: 0 };
        let stopCalls = 0;
        let stopRepeats = 0;
        const stopTween = TweenTo(stopped, 0.05, { x: 10, repeat: 1, onStop: () => stopCalls++, onRepeat: () => stopRepeats++ });
        await this.WaitFrame(2);
        stopTween.stop();
        c.check(stopCalls === 1, "stop() should call onStop: " + stopCalls);
        bare.tween.Remove(stopTween);

        const stopRepeat = { x: 0 };
        let stopOnRepeat = 0;
        await TweenTo(stopRepeat, 0.03, { x: 10, repeat: 1, onStop: () => stopOnRepeat++ }).promise;
        c.check(stopOnRepeat === 0, "onStop should not run when the tween repeats or finishes: " + stopOnRepeat);

        // AddChain plays tweens one after another
        const chained = { x: 0, y: 0 };
        const order: string[] = [];
        const first = new Tween(chained).to({ x: 10 }, 50).onComplete(() => order.push("x:" + chained.y));
        const second = new Tween(chained).to({ y: 10 }, 50).onStart(() => order.push("start y")).onComplete(() => order.push("y"));
        bare.tween.AddChain(first, second);
        await this.Wait(0.03);
        c.check(chained.x > 0 && chained.y === 0, "the second chained tween should wait for the first: " + JSON.stringify(chained));
        await this.Wait(0.3);
        c.check(chained.x === 10 && chained.y === 10, "a chain should run every tween: " + JSON.stringify(chained));
        c.check(order.join(",") === "x:0,start y,y", "chained tweens should run in order: " + order.join(","));

        // SetTimer callbacks run in order of their delay
        const timerOrder: number[] = [];
        bare.tween.SetTimer(0.08, () => timerOrder.push(2));
        bare.tween.SetTimer(0.02, () => timerOrder.push(1));
        await this.Wait(0.2);
        c.check(timerOrder.join(",") === "1,2", "timers should fire in order of their delay: " + timerOrder.join(","));

        // Shake starts at amount, never swings further than amount, and settles back to 0
        const shaken = this.AddGameObject();
        let biggestSwing = 0;
        bare.tween.Shake(shaken, "innerRotation", 0.3, 15).onUpdate(() => biggestSwing = Math.max(biggestSwing, Math.abs(shaken.innerRotation)));
        c.check(shaken.innerRotation === 15, "Shake should start at amount: " + shaken.innerRotation);
        await this.Wait(0.45);
        c.check(biggestSwing <= 15.001, "Shake should not swing further than amount: " + biggestSwing);
        c.check(near(shaken.innerRotation, 0), "Shake should settle at 0: " + shaken.innerRotation);

        // FinishAll jumps every tween to its end
        const all = [{ x: 0 }, { x: 0 }];
        TweenTo(all[0], 5, { x: 1 });
        TweenTo(all[1], 5, { x: 2 });
        bare.tween.FinishAll();
        c.check(all[0].x === 1 && all[1].x === 2, "FinishAll should finish every tween: " + JSON.stringify(all));

        // persistent tweens survive a scene restart, ordinary ones don't
        const helper = await bare.scene.Add(TweenHelperScene);
        const kept = { x: 0 };
        const dropped = { x: 0 };
        helper.tween.To(kept, 0.1, { x: 10, persistent: true });
        helper.tween.To(dropped, 0.1, { x: 10 });
        await helper.Restart();
        await this.Wait(0.25);
        c.check(kept.x === 10, "a persistent tween should survive a restart: " + kept.x);
        c.check(dropped.x < 10, "an ordinary tween should be cleared by a restart: " + dropped.x);
        bare.scene.Remove(helper);
    }
}
