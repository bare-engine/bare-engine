# Tweens

Tweens animate any numeric property over time, and colors.

```ts
import { TweenTo } from 'bare-engine';

TweenTo(player, 0.5, { x: 300, rotation: 90 });
```

`TweenTo(object, seconds, props)` is shorthand for `bare.tween.To(...)`, and works anywhere, including plain functions outside a scene or component: it runs on the object's scene, so the object must be in one. `bare.tween` only works inside a scene, component or GameObject (see [Troubleshooting](../guide/troubleshooting)); elsewhere, write `obj.scene.tween.To(...)`. Both return a tween you can await, which waits until it completes:

```ts
await TweenTo(door, 1, { y: 0 });
```

It resolves with nothing. `Promise.all` and `Promise.race` take tweens too. A stopped tween never completes, so awaiting it waits forever.

Tweens run on game time, so they follow [`bare.timeScale`](./bare#game-speed) and wait while the game is paused.

::: warning
Tweens only run once the scene has started, and a scene starts after its `OnStart` has finished. So don't await a tween inside a scene's `OnStart`: it would wait forever. Start the sequence without awaiting it instead, so `OnStart` can finish while the tweens run, or use the tween's `onComplete`:

```ts
override OnStart()
{
    void this.Intro();
}

async Intro()
{
    await TweenTo(this.logo, 1, { alpha: 1 });
    await this.Wait(0.5);
}
```

During development, awaiting a tween before the scene has started logs an error if the scene still hasn't started 3 seconds later. To hold startup for a moment, await [`this.Wait`](../guide/scenes#waiting) instead: waits do count during `OnStart`.
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

## Colors

Tween a [`Color`](./math#color) property, like an object's `color`, to a hex string or a `Color`. It fades channel by channel:

```ts
TweenTo(floor, 1.5, { color: '#ffdf6e' });                   // fade the tint to gold
TweenTo(ghost, 0.5, { color: '#ff0000', alpha: 0.5 });        // redden and fade out together
TweenTo(lamp, 0.5, { color: Color.Black, yoyo: true, repeat: -1 });
```

A hex without alpha (`#rrggbb` or `#rgb`) leaves alpha alone, so it can run next to an `alpha` tween. `#rrggbbaa` and a `Color` tween alpha too.

A property that hands out a new `Color` every time you read it, like a text object's `fill`, can't be tweened this way. Tween a number instead and mix the colors with [`Color.lerp`](./math#color):

```ts
const tween = { t: 0 };
bare.tween.To(tween, 1, { t: 1, onUpdate: () => label.fill = Color.lerp('#ffffff', '#ffdf6e', tween.t) });
```

By default, a new tween on the same object and property replaces the old one. Pass `false` as the fourth argument to keep both.

**Example:** the [Showcase](https://github.com/bare-engine/bare-showcase)'s [tweens demo](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/tweens/src/DemoTweens.ts#L26-L79) shows pulsing, spinning, bouncing, fading and swaying.

## bare.tween

| Method | Description |
| --- | --- |
| `To(object, seconds, props, overwrite?)` | Start a tween. |
| `Shake(object, property, duration, …)` | Shake a property and settle back where it was. See [Shake](#shake). |
| `SetTimer(seconds, onComplete)` | Call a function after a delay. |
| `AddChain(...tweens)` | Play tweens one after another. |
| `GetAllFrom(object)` | All tweens running on an object. |
| `RemoveAllFrom(object)` | Stop all tweens on an object. |
| `FinishAllFrom(object)` / `FinishAll()` | Jump tweens to their end. |
| `RemoveTimers()` | Cancel all timers. |

**Example:** the [RPG](https://github.com/bare-engine/bare-rpg)'s weapon [checks `GetAllFrom`](https://github.com/bare-engine/bare-rpg/blob/main/src/objects/weapon.ts#L10-L14) so it can't slash again mid-swing.

## Shake

`Shake` swings a property up to `amount` away from its current value, then springs it back to that value with a wobble. That works for properties that rest at 0, like `innerRotation` or an `innerPosition` axis, and for ones that don't, like `innerScaleY` at 1. Shaking a property again while it still wobbles settles it where the first shake started, not where it happened to be. An `innerPosition` is multiplied by the object's `scale`, see [Inner transform](../guide/game-objects#inner-transform):

```ts
bare.tween.Shake(enemy, 'innerRotation', 0.5, 15);   // a quick wiggle, starting at 15°
bare.tween.Shake(tower, 'innerScaleY', 0.4, 0.25);   // a squash, from 1.25 back to 1
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
