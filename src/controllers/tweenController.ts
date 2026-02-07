import { BareEvent } from '../utils/bareTypes';
import Easing from "../libraries/tweenJS/Easing";
import Tween from "../libraries/tweenJS/Tween";
import { events } from "../main";
import { GameObject } from "../objects/gameObject";

export class TweenController
{
    tweens: Array<Tween> = [];
    time: number = 0;

    constructor()
    {
        this.init();
    }

    init()
    {
        events.persistent.on(BareEvent.gameObjectRemoved, this.GameObjectRemoved.bind(this));
        events.persistent.on(BareEvent.focusChange, this.OnFocusChange.bind(this));
        events.persistent.on(BareEvent.update, () => this.Update(bare.time));
        events.persistent.on(BareEvent.clear, () => this.Deactivate());
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

    TweenTo(object: any, duration: number, props: any, overwrite: boolean = true): TweenWithPromise
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
                        const hasOverlap = Object.keys(props).some(propName => 
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
            .to(props, duration * 1000)
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

    Deactivate()
    {
        this.RemoveTweensFrom(this);

        this.tweens = [];
    }
}

// SHORTHAND TWEENTO
export function TweenTo(object: any, duration: number, props: any, overwrite: boolean = true): TweenWithPromise
{
    return tweenController.TweenTo(object, duration, props, overwrite);
}

export const tweenController = new TweenController();
globalThis.tweenController = tweenController;