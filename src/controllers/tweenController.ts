import { BareEvent } from '../types/bareTypes';
import Easing from "../libraries/tweenJS/Easing";
import Tween, { TweenWithPromise } from "../libraries/tweenJS/Tween";
import { setNow } from "../libraries/tweenJS/Now";
import type { Scene } from "../scenes/scene";
import { GameObject } from "../objects/gameObject";
import { RegisterController } from '../globals';
import { InspectorField } from '../utils/decorators';

// TWEENS RUN ON GAME TIME, SO THEY FOLLOW bare.timeScale AND STAND STILL WHILE THE GAME IS PAUSED
setNow(() => bare.gameTime);

export class TweenController
{
    tweens: Array<Tween> = [];
    time: number = 0;

    public scene: Scene;

    @InspectorField
    private get tweensNum():int { return this.tweens.length; }

    constructor(scene: Scene)
    {
        this.scene = scene;
    }

    Start()
    {
        bare.events.on(BareEvent.game_objectRemoved, this.GameObjectRemoved.bind(this));
        //bare.events.on(BareEvent.game_focusChange, this.OnFocusChange.bind(this));
        bare.events.on(BareEvent.game_update, () => this.Update(bare.gameTime));
        //bare.events.on(BareEvent.game_clear, () => this.Deactivate());
    }

    private GameObjectRemoved(obj: GameObject)
    {
        this.RemoveAllFrom(obj);
    }
    
    private OnFocusChange(hasFocus: boolean)
    {
        for (let i = 0; i < this.tweens.length; i++)
        {
            if (!hasFocus)
                this.tweens[i].pause();
            else
                this.tweens[i].resume();
        }
    }

    // THE VALUE EACH PROPERTY RESTS AT WHILE IT'S SHAKING, SO A NEW SHAKE MID-WOBBLE SETTLES WHERE THE FIRST ONE STARTED
    private shakeRests = new WeakMap<object, Record<string, { value: number }>>();

    // SWINGS property UP TO amount AWAY FROM ITS CURRENT VALUE, THEN WOBBLES IT BACK. WITH THE DEFAULTS IT STARTS AT amount
    // COULD PUT ALL SPRING VALUES IN AN OPTIONS OBJECT - TODO
    Shake(object: any, property: string, duration: number, amount: number = -32, decay: number = 6, frequency: number = 4, phase: number = 0.075, overwrite: boolean = true): TweenWithPromise
    {
        const spring = (t: number) => Math.pow(2, -decay * t) * Math.sin((t - phase) * frequency * Math.PI);

        // SCALE THE SPRING SO ITS BIGGEST SWING IS 1, AND ITS FIRST SWING IS POSITIVE (IN THE DIRECTION OF amount)
        let peak = 0;
        let firstSign = 0;
        for (let i = 0; i <= 200; i++)
        {
            const value = spring(i / 200);
            peak = Math.max(peak, Math.abs(value));
            if (firstSign === 0 && Math.abs(value) > 1e-6)
                firstSign = Math.sign(value);
        }
        const scale = peak * (firstSign || 1);
        const wobble = (t: number) => spring(t) / scale;

        // THE TWEEN GOES FROM rest + amount TO rest, SO value = rest + amount * (1 - ease) = rest + amount * wobble
        var elasticOut = (t: number) => {
            if (t === 0) {
                return 0;
            }
            if (t === 1) {
                return 1;
            }
            return 1 - wobble(t);
        };

        // REST AT THE CURRENT VALUE (0 FOR innerRotation, 1 FOR A SCALE), OR WHERE A RUNNING SHAKE ON IT RESTS
        const rests = this.shakeRests.get(object) ?? {};
        this.shakeRests.set(object, rests);
        const rest = { value: rests[property]?.value ?? object[property] ?? 0 };
        rests[property] = rest;

        const forget = () => {
            if (rests[property] === rest)
                delete rests[property];
        };

        object[property] = rest.value + amount; // THE TWEEN READS ITS START VALUE WHEN IT'S CREATED

        var props:any = { ease: elasticOut, onComplete: forget, onStop: forget };
        props[property] = rest.value;

        const tween = this.To(object, duration, props, overwrite);
        object[property] = rest.value + amount * wobble(0); // UNTIL THE FIRST UPDATE. amount WITH THE DEFAULTS
        return tween;
    }

    To(object: any, seconds: number, props: any, overwrite: boolean = true): TweenWithPromise
    {
        //if (object.name && object.name == "sparkPickup")
        //    trace(4)
        
        // List of special config properties that shouldn't be considered for overlap
        const configProps = new Set([
            'ease',
            'onComplete',
            'yoyo',
            'repeat',
            'delay',
            'initialDelay',
            'onStart',
            'onEveryStart',
            'onUpdate',
            'onRepeat',
            'onStop',
            'persistent'
        ]);

        const normalizedProps = this.NormalizeProps(props);
        for (const configProp of configProps)
            delete normalizedProps[configProp];

        if (overwrite) 
        {
            for (let i = this.tweens.length - 1; i >= 0; i--) 
            {
                const existingTween = this.tweens[i];
                
                if (existingTween.object === object && existingTween.valuesEnd) 
                {
                    if (existingTween.getProgress() < 1) // existingTween NOT ALREADY COMPLETED? COULD BE WE ARE IN THE ONCOMPLETE OF IT
                    {
                        // Check for property overlap, excluding config properties
                        const hasOverlap = Object.keys(normalizedProps).some(propName =>
                            propName != 'delay' &&
                            !configProps.has(propName) &&
                            propName in existingTween.valuesEnd &&
                            this.PropsOverlap(normalizedProps[propName], existingTween.valuesEnd[propName])
                        );

                        if (hasOverlap)
                        {
                            this.tweens.splice(i, 1);
                        }
                    }
                }
            }
        }

        // Create new tween
        const tween = new Tween(object)
            .to(normalizedProps, seconds * 1000)
            .easing(props.ease || Easing.Quadratic.Out);
        tween.persistent = (object.persistent || props.persistent) ?? false;
        
        // Apply TweenJS-style configuration
        if (props.yoyo) {
            tween.yoyo(props.yoyo);

            if (!props.repeat)
                props.repeat = 1;
        }
        
        if (typeof props.repeat === 'number') {
            tween.repeat(props.repeat);
        }
        
        // 'delay' waits again before every repeat/yoyo pass; 'initialDelay' only waits once,
        // before the first pass, and leaves the repeats using 'delay' (none by default).
        if (props.initialDelay) {
            tween.delay(props.initialDelay * 1000);
            tween.repeatDelay((props.delay ?? 0) * 1000);
        }
        else if (props.delay) {
            tween.delay(props.delay * 1000);
        }

        /*if (props.onComplete) {
            tween.onComplete(props.onComplete);
        }*/

        if (props.onStart) {
            tween.onStart(props.onStart);
        }

        if (props.onEveryStart) {
            tween.onEveryStart(props.onEveryStart);
        }

        if (props.onUpdate) {
            tween.onUpdate(props.onUpdate);
        }

        if (props.onRepeat) {
            tween.onRepeat(props.onRepeat);
        }

        if (props.onStop) {
            tween.onStop(props.onStop);
        }

        const promise = new Promise<Tween>((resolve) => {
            if (!props.onComplete)
            {
                tween.onComplete(() => resolve(tween));
            }
            else
            {
                tween.onComplete(() => {
                    props.onComplete(tween);
                    resolve(tween);
                });
            }
        });

        // tweens only advance once the scene has started, which waits for the scene's OnStart:
        // awaiting this promise inside OnStart would never resolve. reading it there is fine as long as
        // OnStart doesn't wait on it (e.g. a 'void' async call), so only warn if the scene stays stuck
        let startCheckQueued = false;
        Object.defineProperty(tween, "promise", {
            get: () => {
                if (__DEV__ && !this.scene.started && !startCheckQueued)
                {
                    startCheckQueued = true;
                    setTimeout(() => {
                        if (!this.scene.started)
                            console.error("A tween's promise was read before its scene started, and the scene still hasn't started. Tweens don't run until the scene's OnStart has finished, so awaiting it in OnStart never resolves. Start the tween without awaiting it, or await it after OnStart, for example in OnUpdate or an event.");
                    }, 3000);
                }
                return promise;
            },
            configurable: true,
        });
        this.Add(tween).start();

        return (tween as TweenWithPromise);
    }

    // nested props only overlap where they share a leaf, so innerPosition.x and innerPosition.y can run side by side
    private PropsOverlap(a: any, b: any): boolean
    {
        const isNested = (value: any) => value && typeof value === 'object' && !Array.isArray(value);

        if (!isNested(a) || !isNested(b))
            return true;

        return Object.keys(a).some(key => key in b && this.PropsOverlap(a[key], b[key]));
    }

    private NormalizeProps(props: any): any
    {
        const normalizedProps: any = {};

        for (const key in props)
        {
            const path = key.split(/[$.]/);
            let target = normalizedProps;

            for (let i = 0; i < path.length - 1; i++)
            {
                const pathPart = path[i];
                target[pathPart] ??= {};
                target = target[pathPart];
            }

            target[path[path.length - 1]] = this.NormalizeValue(props[key]);
        }

        return normalizedProps;
    }

    private NormalizeValue(value: any): any
    {
        if (typeof value === 'string' && (value.startsWith('+=') || value.startsWith('-=')))
            return value[0] + value.slice(2);

        if (Array.isArray(value))
            return value.map(item => this.NormalizeValue(item));

        if (value && typeof value === 'object')
            return this.NormalizeProps(value);

        return value;
    }

    Add(tween:Tween):Tween
    {
        this.tweens.push(tween)
        return tween;
    }

    AddChain(...tweens: Tween[]): Tween
    {
        // only the first is added: Update drops tweens that aren't playing, and adds chained ones once they start
        this.Add(tweens[0]);

        // Chain the tweens together
        for (let i = 0; i < tweens.length - 1; i++) {
            tweens[i].chain(tweens[i + 1]);
        }
    
        // Start the first tween
        tweens[0].start();
    
        // Return the first tween in case it's needed
        return tweens[0];
    }

    SetTimer(seconds: number, onComplete: () => void)
    {
        this.Add(new Tween(this)).to({}, seconds * 1000)
            .onComplete(onComplete)
            .start();
    }

    Remove(tween:Tween)
    {
        var i = this.tweens.indexOf(tween);
        if (i != -1)
            this.tweens.splice(i, 1);
    }

    RemoveAllFrom(obj: any)
    {
        for (var i = this.tweens.length - 1; i >= 0; i--)
        {
            if (this.tweens[i].object == obj)
            {
                this.tweens.splice(i, 1);
            }
        }
    }

    GetAllFrom(obj: any)
    {
        return this.tweens.filter(t => t.object == obj);
    }

    Update(time: number = 0)
    {
        var i = 0;
        while (i < this.tweens.length)
        {
            var tween = this.tweens[i];
            var isPlaying = tween.update(time);

            // 2ND CHECK SINCE TWEEN COULD HAVE BEEN REMOVED BY OTHER CODE IN UPDATE->COMPLETE CALLBACK->REMOVE
            if (!isPlaying && this.tweens[i] == tween)
            {
                this.tweens.splice(i, 1);

                // a finished tween starts its chained tweens, which have to be updated from now on
                for (const chained of tween._chainedTweens)
                {
                    if (chained.isPlaying() && !this.tweens.includes(chained))
                        this.tweens.push(chained);
                }
            }
            else
            {
                i++;
            }
        }
    }

    FinishAll()
    {
        while (this.tweens.length > 0)
        {
            this.tweens[0]._isPlaying = true; //

            // if (this.tweens[0]._repeat)
            // {
            //     this.tweens.splice(0, 1);
            //     continue;
            // }

            this.tweens[0].update(1000000000000);
            this.tweens.splice(0, 1);
        }
    }

    // MAKE A finish() METHOD ON TWEEN ITSELF - TODO
    FinishAllFrom(obj: any)
    {
        var tweens = this.GetAllFrom(obj);

        while (tweens.length > 0)
        {
            tweens[0]._isPlaying = true;
            tweens[0].update(1000000000000);
            tweens.splice(0, 1);
        }
    }

    RemoveTimers()
    {
        this.RemoveAllFrom(this);
    }

    Clear(includingPersistent: boolean = true)
    {
        if (includingPersistent)
        {
            this.tweens = [];
            return;
        }

        this.tweens = this.tweens.filter(tween => tween.persistent);
    }
}

// SHORTHAND TWEENTO
// EG: TweenTo(this.go, 1, { alpha: 0, innerPosition: {y: "-=" + 100 }})
// EG: TweenTo(this.go, 1, { alpha: 0, innerPosition$y: "+=" + 100 })
// EG: TweenTo(this.go, 1, { alpha: 0, "innerPosition.y": "-=" + 100 })
// EG: await TweenTo(this.go, 1, { scale: 0 }).promise
export function TweenTo(object: any, seconds: number, props: any, overwrite: boolean = true, scene: Scene | null = null): TweenWithPromise
{
    // IT NEVER ACTUALLY GETS HERE, controllerProxyTransformer TRANSFORMS IT INTO this.scene.tween.To
    return scene!['tween'].To(object, seconds, props, overwrite);
}

RegisterController(TweenController);
