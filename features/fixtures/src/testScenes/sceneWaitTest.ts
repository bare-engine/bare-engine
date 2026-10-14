import { Scene } from 'bare-engine';
import { Checks } from './checks';

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
}
