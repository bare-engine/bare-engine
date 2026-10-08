# Tweens

Tweens animate any numeric property over time.

```ts
import { TweenTo } from 'bare-engine';

TweenTo(player, 0.5, { x: 300, rotation: 90 });
```

`TweenTo(object, seconds, props)` is shorthand for `bare.tween.To(...)`. Both return a tween with a `promise`, so you can wait for it:

```ts
await TweenTo(door, 1, { y: 0 }).promise;
```

::: warning
Tweens only run once the scene has started, and a scene starts after its `OnStart` has finished. So don't await a tween inside a scene's `OnStart`: it would wait forever. Start the tween there without awaiting it, or await it later, for example from `OnUpdate` or an event. During development, reading `.promise` before the scene has started logs an error.
:::

**Example:** a [Platformer](https://github.com/bare-engine/bare-platformer) coin [waits for its fade-out tween](https://github.com/bare-engine/bare-platformer/blob/main/src/components/collectableComponent.ts#L33-L35) before removing itself.

## Options

Add these to `props` next to the values you animate:

| Option | Description |
| --- | --- |
| `ease` | An easing function, for example `Easing.Back.Out`. Default `Easing.Quadratic.Out`. |
| `delay` | Seconds to wait before starting. With `repeat` or `yoyo`, it also waits before every repeat. |
| `initialDelay` | Seconds to wait once, before the first pass only. Repeats then wait `delay`, which is 0 if not set. Useful with `yoyo`. |
| `yoyo` | Play back and forth. |
| `repeat` | Number of repeats, `-1` for forever. |
| `onStart`, `onUpdate`, `onComplete`, `onRepeat`, `onStop` | Callbacks. |
| `onEveryStart` | Callback at the start of every pass, including repeats. |
| `persistent` | Keep the tween when the scene is cleared. |

```ts
import { Easing, TweenTo } from 'bare-engine';

TweenTo(coin, 0.4, { innerY: '+=10', ease: Easing.Sinusoidal.InOut, yoyo: true, repeat: -1 });
```

Relative values like `'+=10'` and `'-=10'` add to the current value.

By default, a new tween on the same object and property replaces the old one. Pass `false` as the fourth argument to keep both.

**Example:** the [Showcase](https://github.com/bare-engine/bare-showcase)'s [tweens demo](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/tweens/src/DemoTweens.ts#L26-L79) shows pulsing, spinning, bouncing, fading and swaying.

## bare.tween

| Method | Description |
| --- | --- |
| `To(object, seconds, props, overwrite?)` | Start a tween. |
| `Shake(object, property, duration, …)` | Shake a property and settle back to 0. See [Shake](#shake). |
| `SetTimer(seconds, onComplete)` | Call a function after a delay. |
| `AddChain(...tweens)` | Play tweens one after another. |
| `GetAllFrom(object)` | All tweens running on an object. |
| `RemoveAllFrom(object)` | Stop all tweens on an object. |
| `FinishAllFrom(object)` / `FinishAll()` | Jump tweens to their end. |
| `RemoveTimers()` | Cancel all timers. |

**Example:** the [RPG](https://github.com/bare-engine/bare-rpg)'s weapon [checks `GetAllFrom`](https://github.com/bare-engine/bare-rpg/blob/main/src/objects/weapon.ts#L10-L14) so it can't slash again mid-swing.

## Shake

`Shake` swings a property up to `amount` away from 0, then springs it back to 0 with a wobble. It suits properties that rest at 0, like `innerRotation` or an `innerPosition` axis. An `innerPosition` is multiplied by the object's `scale`, see [Inner transform](../guide/game-objects#inner-transform):

```ts
bare.tween.Shake(enemy, 'innerRotation', 0.5, 15);   // a quick wiggle, starting at 15°
```

The property never goes further from 0 than `amount`, whatever the other settings. With the defaults, the first swing is the biggest, so the property starts at `amount`.

| Parameter | Default | Description |
| --- | --- | --- |
| `object`, `property` | | What to shake. |
| `duration` | | Seconds until it's back at 0. |
| `amount` | `-32` | How far it swings. The sign picks the direction of the first swing. |
| `decay` | `6` | How fast the wobble dies down. |
| `frequency` | `4` | How many times it wobbles. |
| `phase` | `0.075` | Shifts the wobble in time. |
| `overwrite` | `true` | Replace other tweens on the same property. |

**Example:** the [Showcase](https://github.com/bare-engine/bare-showcase) [shakes a heart](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/tweens/src/DemoTweens.ts#L30) with `Shake(heart.innerPosition, "y", 1.2, -12, 3)`.
