import { Component, Scene } from 'bare-engine';
import { Checks } from './checks';

class WaitingComponent extends Component {}

class WaitTarget extends Scene
{
    steps = 0;
    startupWait = false;

    constructor() { super({ UI: true, settingsData: { layers: ['objects'] } }); }
    override async OnStart() { this.startupWait = await this.WaitRealTime(0.01); }
    override OnFixedUpdate() { this.steps++; }
}

export class SceneWaitTest extends Scene
{
    private running = false;
    private checks = new Checks();

    override OnUpdate()
    {
        if (this.running) return;
        this.running = true;
        void this.RunChecks().then(() => this.checks.flush());
    }

    private async RunChecks()
    {
        const c = this.checks;
        const target = await bare.scene.Add(WaitTarget);
        c.check(target.startupWait, 'real-time waits must work during scene startup');
        c.check(typeof (window as any).wait === 'undefined' && typeof (window as any).waitFrame === 'undefined'
            && typeof (window as any).waitRealTime === 'undefined' && typeof (window as any).cancelWaits === 'undefined',
            'global wait helpers must be removed');

        target.paused = true;
        let timed: boolean | undefined;
        let framed: boolean | undefined;
        void target.Wait(0.05).then(done => timed = done);
        void target.WaitFrame(2).then(done => framed = done);
        c.check(await target.WaitRealTime(0.08), 'real-time waits must work during scene pause');
        c.check(timed === undefined && framed === undefined, 'game-time/frame waits must stop on scene pause');
        c.check(await this.WaitFrame(), 'another scene must keep advancing during scene pause');
        target.paused = false;
        const step = target.steps;
        c.check(await target.WaitFrame(2), 'frame wait must complete');
        c.check(target.steps - step >= 2, 'frame continuation must observe completed fixed updates');
        c.check(await target.Wait(0.08), 'time wait must complete after unpause');
        c.check(timed === true && framed === true, 'paused waits must resume');

        target.enabled = false;
        timed = undefined;
        framed = undefined;
        void target.Wait(0.01).then(done => timed = done);
        void target.WaitFrame().then(done => framed = done);
        await this.WaitRealTime(0.04);
        c.check(timed === undefined && framed === undefined, 'disabled scenes must not advance game/frame waits');
        target.enabled = true;
        await target.Wait(0.04);
        c.check(timed === true && framed === true, 'disabled waits must resume when enabled');

        bare.timeScale = 0;
        timed = undefined;
        framed = undefined;
        void target.Wait(0.01).then(done => timed = done);
        void target.WaitFrame().then(done => framed = done);
        await this.WaitRealTime(0.04);
        c.check(timed === undefined && framed === undefined, 'timeScale zero must stop scene game/frame waits');
        bare.timeScale = 1;
        await target.Wait(0.04);
        c.check(timed === true && framed === true, 'scene waits must resume after timeScale zero');

        let cleanedUp = false;
        const cancelTime = (async () => {
            try { return await target.Wait(10); }
            finally { cleanedUp = true; }
        })();
        const cancelFrame = target.WaitFrame(1000);
        const cancelReal = target.WaitRealTime(10);
        const unrelated = this.Wait(0.04);
        const persistentTime = target.Wait(0.04, true);
        const persistentFrame = target.WaitFrame(2, true);
        const persistentReal = target.WaitRealTime(0.04, true);
        await target.LoadLevel({ name: 'waitLevel', dimensions: { width: 320, height: 180 }, entitiesByLayer: { objects: [] } });
        c.check((await Promise.all([cancelTime, cancelFrame, cancelReal])).every(done => done === false),
            'level load must settle nonpersistent waits false');
        c.check(cleanedUp, 'cancellation must run finally');
        c.check(await unrelated, 'level loading must not cancel another scene waits');
        c.check((await Promise.all([persistentTime, persistentFrame, persistentReal])).every(Boolean),
            'persistent waits must survive level loading');

        const removed = [target.Wait(10, true), target.WaitFrame(1000, true), target.WaitRealTime(10, true)];
        bare.scene.Remove(target);
        c.check((await Promise.all(removed)).every(done => done === false), 'removal must cancel every persistent wait');

        await this.RunComponentChecks();
        await this.RunGameObjectChecks();

        const sleep = this.Sleep(0.01);
        c.check(this.paused, 'Sleep must pause the scene');
        c.check(await sleep, 'Sleep must finish using real time while paused');
        c.check(!this.paused, 'Sleep must restore the original pause state');
        const cancelledSleep = this.Sleep(10);
        this.CancelWaits();
        c.check(await cancelledSleep === false && !this.paused, 'cancelled Sleep must restore pause state');
        await c.checkThrows(() => this.Wait(-1), 'negative wait must throw');
        await c.checkThrows(() => this.WaitFrame(Infinity), 'infinite frame wait must throw');
    }

    private async RunComponentChecks()
    {
        const c = this.checks;
        const target = await bare.scene.Add(WaitTarget);

        const go = target.AddGameObject();
        const comp = go.AddComponent(WaitingComponent);
        c.check(await comp.Wait(0.02) && await comp.WaitFrame() && await comp.WaitRealTime(0.01),
            'component waits must complete');

        let cleanedUp = false;
        const pending = [(async () => {
            try { return await comp.Wait(10); }
            finally { cleanedUp = true; }
        })(), comp.WaitFrame(1000), comp.WaitRealTime(10)];
        const other = go.AddComponent(class OtherComponent extends Component {});
        const otherWait = other.Wait(0.04);
        const sceneWait = target.Wait(0.04);
        go.RemoveComponent(comp);
        c.check((await Promise.all(pending)).every(done => done === false), 'removing a component must settle its waits false');
        c.check(cleanedUp, 'component wait cancellation must run finally');
        c.check(await otherWait && await sceneWait, 'removing a component must not cancel other waits');
        c.check(await comp.Wait(0) === false, 'a removed component must not start new waits');

        const go2 = target.AddGameObject();
        const comp2 = go2.AddComponent(WaitingComponent);
        const goWaits = [comp2.Wait(10), comp2.WaitFrame(1000), comp2.WaitRealTime(10)];
        go2.Remove();
        c.check((await Promise.all(goWaits)).every(done => done === false), 'removing a GameObject must settle its component waits false');

        const go3 = target.AddGameObject();
        go3.persistent = true;
        const comp3 = go3.AddComponent(WaitingComponent);
        const go4 = target.AddGameObject();
        const comp4 = go4.AddComponent(WaitingComponent);
        const persistentWait = comp3.Wait(0.04);
        const levelWait = comp4.Wait(10);
        await target.LoadLevel({ name: 'waitLevel', dimensions: { width: 320, height: 180 }, entitiesByLayer: { objects: [] } });
        c.check(await levelWait === false, 'level load must cancel waits of nonpersistent objects');
        c.check(await persistentWait, 'component waits on persistent objects must survive level loading');

        const manual = comp3.Wait(10);
        comp3.CancelWaits();
        c.check(await manual === false, 'component CancelWaits must settle its waits false');
        await c.checkThrows(() => comp3.Wait(-1), 'negative component wait must throw');

        bare.scene.Remove(target);
    }

    private async RunGameObjectChecks()
    {
        const c = this.checks;
        const target = await bare.scene.Add(WaitTarget);

        const go = target.AddGameObject();
        c.check(await go.Wait(0.02) && await go.WaitFrame() && await go.WaitRealTime(0.01),
            'GameObject waits must complete');

        let cleanedUp = false;
        const pending = [(async () => {
            try { return await go.Wait(10); }
            finally { cleanedUp = true; }
        })(), go.WaitFrame(1000), go.WaitRealTime(10)];
        const comp = go.AddComponent(WaitingComponent);
        const compWait = comp.Wait(10);
        const other = target.AddGameObject();
        const otherWait = other.Wait(0.04);
        go.Remove();
        c.check((await Promise.all(pending)).every(done => done === false), 'removing a GameObject must settle its waits false');
        c.check(cleanedUp, 'GameObject wait cancellation must run finally');
        c.check(await compWait === false, 'removing a GameObject must also settle its component waits false');
        c.check(await otherWait, 'removing a GameObject must not cancel other objects waits');
        c.check(await go.Wait(0) === false, 'a removed GameObject must not start new waits');

        // a pooled object can be reused right away: the old wait must not resume on the new life
        const pooledWait = other.Wait(0.04);
        other.Remove();
        const reused = target.AddGameObject();
        const reusedWait = reused.Wait(0.04);
        c.check(await pooledWait === false, 'a wait from before removal must not complete on a reused object');
        c.check(await reusedWait, 'a reused object must wait again');

        const parent = target.AddGameObject();
        const child = parent.AddChild();
        const childWait = child.Wait(10);
        parent.Remove();
        c.check(await childWait === false, 'removing a parent must settle its children waits false');

        const persistent = target.AddGameObject();
        persistent.persistent = true;
        const plain = target.AddGameObject();
        const persistentWait = persistent.Wait(0.04);
        const levelWait = plain.Wait(10);
        await target.LoadLevel({ name: 'waitLevel', dimensions: { width: 320, height: 180 }, entitiesByLayer: { objects: [] } });
        c.check(await levelWait === false, 'level load must cancel waits of nonpersistent GameObjects');
        c.check(await persistentWait, 'waits of persistent GameObjects must survive level loading');

        const manual = persistent.Wait(10);
        persistent.CancelWaits();
        c.check(await manual === false, 'GameObject CancelWaits must settle its waits false');
        await c.checkThrows(() => persistent.Wait(-1), 'negative GameObject wait must throw');

        bare.scene.Remove(target);
    }
}
