# Particles

Particles are small images that are emitted, move and fade, for smoke, sparks, explosions and so on.

## From a prefab

The easiest way is `ParticleComponent`. Its settings are plain data, so they can live in a prefab, and a [preset](./prefabs#presets) lets you reuse an effect:

```json
"presets": {
  "SPARKLE": {
    "particle": {
      "texture": "particles/star",
      "life": 1,
      "emitRate": 5,
      "emitShape": "CIRCLE",
      "emitRadius": 0,
      "localSpace": true,
      "origin": {
        "x": 0.5,
        "y": 0.5
      },
      "animation": {
        "scale": {
          "start": [0.7, 1],
          "end": 0.01
        },
        "rotation": {
          "start": [0, 360]
        },
        "color": {
          "start": "#ffffff",
          "end": "#ffcb02"
        },
        "speed": {
          "start": [500, 600]
        }
      }
    }
  }
},
"prefabs": [
  {
    "name": "coin",
    "texture": "coin",
    "components": {
      "particle": "SPARKLE"
    }
  }
]
```

The emitter follows its GameObject, but doesn't emit until you tell it to:

```ts
coin.GetComponent(ParticleComponent).Fire();            // one burst of emitRate particles
coin.GetComponent(ParticleComponent).emitter.start();   // emit continuously
coin.GetComponent(ParticleComponent).emitter.stop();
```

**Examples:** [Platformer](https://github.com/bare-engine/bare-platformer) coins [fire their sparkle](https://github.com/bare-engine/bare-platformer/blob/main/src/components/collectableComponent.ts#L30) when collected, and [RPG](https://github.com/bare-engine/bare-rpg) characters [fire particles when hit](https://github.com/bare-engine/bare-rpg/blob/main/src/components/hitComponent.ts#L16).

## From code

```ts
const explosion = bare.particle.CreateEmitter({
    texture: 'particles/stripe',
    life: 0.8,
    emitRate: 20,
    emitShape: 'CIRCLE',
    emitRadius: 10,
    animation: {
        scale: { start: 1, end: 0.2 },
        color: { start: '#ff0000', end: '#ffff00' },
        speed: { start: [300, 400] },
    },
});

// a burst of 20 particles (the emitRate) where the enemy was
bare.particle.OneShot(explosion, { position: enemy.position });

// a bigger burst from the same emitter
bare.particle.OneShot(explosion, { position: boss.position, count: 60 });
```

For a continuous emitter, add it with `autoStart`. `position` places it, and the emitter's own `position` moves it later:

```ts
const smoke = bare.particle.CreateEmitter({ texture: 'particles/smoke', life: 2, emitRate: 10, localSpace: false, position: { x: 100, y: 200 } });
bare.particle.Add(smoke, { autoStart: true });
smoke.position.set(x, y);   // move it around
```

With `localSpace: false` the smoke stays where it was emitted and trails behind as the emitter moves. With the default `true`, the particles move along with it.

To change how much a running emitter emits, for example thicker smoke as a fire grows:

```ts
smoke.setEmitRate(30);   // particles per second, or per burst with emitTime
smoke.setEmitTime(0.5);  // emit in bursts every 0.5 seconds, 0 to emit continuously again
```

**Example:** the [Showcase](https://github.com/bare-engine/bare-showcase)'s [particles demo](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/particles/src/DemoParticles.ts#L22-L98) has smoke that follows the mouse and random explosions.

## Settings

These work the same in a prefab's `particle` component and in `bare.particle.CreateEmitter`. In TypeScript they're typed `ParticleData`, so a misspelled setting is an error.

| Setting | Description |
| --- | --- |
| `texture` | Image name. |
| `position` | Where the emitter is, as `{ x, y }`. In a `particle` component it's an offset from the GameObject. |
| `life` | Seconds a particle lives, or `[min, max]`. |
| `emitRate` | Particles per second, or per burst with `emitTime`. |
| `emitTime` | When above 0, emit in bursts every this many seconds. |
| `emitShape` | `"POINT"`, `"CIRCLE"` or `"RECT"`. |
| `emitRadius` / `emitRect` | Size of the circle, or `{ width, height }` of the rectangle. |
| `maxParticles` | Upper limit on particles alive at once. |
| `localSpace` | Particles move along with the emitter. Defaults to `true` in `CreateEmitter` and `false` in a `particle` component. |
| `origin` | Pivot of each particle, `{ x: 0.5, y: 0.5 }` is centered. |
| `scale` | Scales the whole effect around `position`. Change it later with `emitter.scale`. |

### Animation

Each value in `animation` changes over a particle's life:

| Value | Description |
| --- | --- |
| `scale` | Size. |
| `rotation` | Angle in degrees, like a GameObject's `rotation`. Without it, `"POINT"` particles get a random angle and `"CIRCLE"` particles face outward from the center, so a burst spreads in all directions. `"RECT"` particles default to 0 (facing right); give them a `rotation` or a `velocity` to move them. |
| `speed` | Speed in the particle's direction (its `rotation`), in pixels per second. |
| `velocity` | Extra movement as `{ x, y }`. A `delta` of `{ x: 0, y: 300 }` works like gravity. |
| `color` | Tint as a hex string, including alpha (`"#ffffff00"` is transparent). |

Each one takes `start` and `end`, or `start` and `delta`, the change per second. Any value can be a `[min, max]` range for randomness, and `damping` slows a value down over time:

```json
"speed": {
  "start": [300, 400],
  "damping": 0.9
}
```

## Storing an emitter

To create an emitter once and fire it many times, keep it in a field. Its type is `ParticleEmitter`:

```ts
import { Scene, Vec2, type ParticleEmitter } from 'bare-engine';

export class Game extends Scene
{
    sparks!: ParticleEmitter;

    override OnStart()
    {
        this.sparks = bare.particle.CreateEmitter({ texture: 'spark', life: 0.5, emitRate: 20 });
    }

    Explode(x: number, y: number)
    {
        bare.particle.OneShot(this.sparks, { position: new Vec2(x, y) });
    }
}
```

The settings you pass to `CreateEmitter` are typed `ParticleData`, and the options of `Add` are `ParticleEmitterOptions`.

## Which scene the emitters belong to

Every scene has its own `scene.particle`, and `bare.particle` is the one of the current scene. Emitters are updated and drawn with their scene and go away with it, so an emitter that should last as long as a scene goes on that scene's `particle`:

```ts
export class Museum extends Scene
{
    override OnStart()
    {
        // gold sparkles over the floor of a hall, for as long as this scene runs
        const sparkles = this.particle.CreateEmitter({
            texture: 'particles/star',
            emitShape: 'RECT',
            emitRect: { width: 800, height: 400 },
            position: { x: 400, y: 300 },
            emitRate: 8,
            animation: { color: { start: '#ffcb02', end: '#ffcb0200' } },
        });
        this.particle.Add(sparkles, { autoStart: true });
    }
}
```

## bare.particle

| Method | Description |
| --- | --- |
| `CreateEmitter(data, options?)` | Create an emitter from settings like the ones above. |
| `Add(emitter, options?)` | Start updating and drawing an emitter. Options: `autoStart`, `autoRemove`, `autoOneShot`. |
| `OneShot(emitter, { position?, count? })` | Emit one burst of `count` particles (defaults to `emitRate`), at `position` if given. |
| `Remove(emitter)` / `Has(emitter)` | Manage emitters. |
| `Clear()` | Remove all emitters. |

## ParticleEmitter

| Method | Description |
| --- | --- |
| `start()` / `stop()` | Emit continuously, or stop emitting. Particles already alive finish their life. |
| `oneShot(count?)` | Emit `count` particles right away (defaults to `emitRate`). |
| `setEmitRate(rate)` | Change `emitRate`: particles per second, or per burst with `emitTime`. |
| `setEmitTime(time)` | Change `emitTime`: emit in bursts every this many seconds, `0` for continuous. |
| `position` / `scale` | Move the emitter, or scale the whole effect around its position. |
