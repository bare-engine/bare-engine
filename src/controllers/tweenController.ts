import { BareEvent } from '../types/bareTypes';
import Easing from "../libraries/tweenJS/Easing";
import Tween, { TweenWithPromise } from "../libraries/tweenJS/Tween";
import type { Scene } from "../scenes/scene";
import { GameObject } from "../objects/gameObject";
import { RegisterController } from '../globals';

export class TweenController
{
    tweens: Array<Tween> = [];
    time: number = 0;

    public scene: Scene;

    constructor(scene: Scene)
    {
        this.scene = scene;
    }

    Start()
    {
        this.scene.events.on(BareEvent.game_objectRemoved, this.GameObjectRemoved.bind(this));
        //this.scene.events.on(BareEvent.game_focusChange, this.OnFocusChange.bind(this));
        this.scene.events.on(BareEvent.game_update, () => this.Update(bareEngine.time));
        //this.scene.events.on(BareEvent.game_clear, () => this.Deactivate());
    }

    GameObjectRemoved(obj: GameObject)
    {
        this.RemoveTweensFrom(obj);
    }
    
    OnFocusChange(hasFocus: boolean)
    {
        for (let i = 0; i < this.tweens.length; i++)
        {
            if (!hasFocus)
                this.tweens[i].pause();
            else
                this.tweens[i].resume();
        }
    }

    // COULD PUT ALL SPRING VALUES IN AN OPTIONS OBJECT - TODO
    TweenShake(object: any, property: string, duration: number, initalMove:number = -1, decay: number = 6, frequency: number = 4, phase: number = 0.075, amplitude: number = 40, overwrite: boolean = true): TweenWithPromise
    {
        var elasticOut = (amount: number) => { 
            if (amount === 0) {
                return 0;
            }
            if (amount === 1) {
                return 1;
            }
            return amplitude * Math.pow(2, -decay * amount) * Math.sin((amount - phase) * frequency * Math.PI) + 1
        };

        object[property] = initalMove;

        var props:any = {ease: elasticOut }
        props[property] = 0;
        
        return this.TweenTo(object, duration, props, overwrite);
    }

    TweenTo(object: any, seconds: number, props: any, overwrite: boolean = true): TweenWithPromise
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
            'onStart',
            'onEveryStart',
            'onUpdate',
            'onRepeat',
            'onStop'
        ]);

        const normalizedProps = this.NormalizeTweenProps(props);

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
                            propName in existingTween.valuesEnd
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
        
        // Apply TweenJS-style configuration
        if (props.yoyo) {
            tween.yoyo(props.yoyo);

            if (!props.repeat)
                props.repeat = 1;
        }
        
        if (typeof props.repeat === 'number') {
            tween.repeat(props.repeat);
        }
        
        if (props.delay) {
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
            tween.onRepeat(props.onStop);
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

        (tween as TweenWithPromise).promise = promise;
        this.Add(tween).start();

        return (tween as TweenWithPromise);
    }

    private NormalizeTweenProps(props: any): any
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

            target[path[path.length - 1]] = this.NormalizeTweenValue(props[key]);
        }

        return normalizedProps;
    }

    private NormalizeTweenValue(value: any): any
    {
        if (typeof value === 'string' && (value.startsWith('+=') || value.startsWith('-=')))
            return value[0] + value.slice(2);

        if (Array.isArray(value))
            return value.map(item => this.NormalizeTweenValue(item));

        if (value && typeof value === 'object')
            return this.NormalizeTweenProps(value);

        return value;
    }

    AddTween(object:any):Tween
    {
        return this.Add(new Tween(object));
    }

    Add(tween:Tween):Tween
    {
        this.tweens.push(tween)
        return tween;
    }

    AddChain(...tweens: Tween[]): Tween
    {
        // Add all tweens to the controller
        tweens.forEach(tween => {
            this.Add(tween);
        });
    
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
        this.AddTween(this).to({}, seconds * 1000)
            .onComplete(onComplete)
            .start();
    }

    Remove(tween:Tween)
    {
        var i = this.tweens.indexOf(tween);
        if (i != -1)
            this.tweens.splice(i, 1);
    }

    RemoveTweensFrom(obj: any)
    {
        for (var i = this.tweens.length - 1; i >= 0; i--)
        {
            if (this.tweens[i].object == obj)
            {
                this.tweens.splice(i, 1);
            }
        }
    }

    GetTweensFrom(obj: any)
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
            }
            else
            {
                i++;
            }
        }
    }

    FinishAllTweens()
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

    RemoveTimers()
    {
        this.RemoveTweensFrom(this);
    }

    Clear()
    {
        this.RemoveTweensFrom(this);
        this.tweens = [];
    }
}

// SHORTHAND TWEENTO
// EG: TweenTo(this.go, 1, { alpha: 0, innerPosition: {y: "-=" + 100 }})
// EG: TweenTo(this.go, 1, { alpha: 0, innerPosition$y: "+=" + 100 })
// EG: TweenTo(this.go, 1, { alpha: 0, "innerPosition.y": "-=" + 100 })
// EG: await TweenTo(this.go, 1, { scale: 0 }).promise
export function TweenTo(object: any, seconds: number, props: any, overwrite: boolean = true, scene: Scene | null = null): TweenWithPromise
{
    // IT NEVER ACTUALLY GETS HERE, controllerProxyTransformer TRANSFORMS IT INTO scene.tweenController.TweenTo
    return scene['tweenController'].TweenTo(object, seconds, props, overwrite);
}

export var tweenController:TweenController;
RegisterController(TweenController);
