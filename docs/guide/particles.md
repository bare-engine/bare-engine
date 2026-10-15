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

// a burst of 20 particles where the enemy was
bare.particle.OneShot(explosion, { position: enemy.position });
```

For a continuous emitter, add it with `autoStart`:

```ts
const smoke = bare.particle.CreateEmitter({ texture: 'particles/smoke', life: 2, emitRate: 10 });
bare.particle.Add(smoke, { autoStart: true });
smoke.position.set(x, y);   // move it around
```

**Example:** the [Showcase](https://github.com/bare-engine/bare-showcase)'s [particles demo](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/particles/src/DemoParticles.ts#L22-L98) has smoke that follows the mouse and random explosions.

## Settings

These work the same in a prefab's `particle` component and in `bare.particle.CreateEmitter`.

| Setting | Description |
| --- | --- |
| `texture` | Image name. |
| `life` | Seconds a particle lives, or `[min, max]`. |
| `emitRate` | Particles per second, or per burst with `emitTime`. |
| `emitTime` | When above 0, emit in bursts every this many seconds. |
| `emitShape` | `"POINT"`, `"CIRCLE"` or `"RECT"`. |
| `emitRadius` / `emitRect` | Size of the circle, or `{ width, height }` of the rectangle. |
| `maxParticles` | Upper limit on particles alive at once. |
| `localSpace` | Particles move along with the emitter. |
| `origin` | Pivot of each particle, `{ x: 0.5, y: 0.5 }` is centered. |
| `scale` | Scales the whole effect. |

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

## bare.particle

| Method | Description |
| --- | --- |
| `CreateEmitter(data, options?)` | Create an emitter from settings like the ones above. |
| `Add(emitter, options?)` | Start updating and drawing an emitter. Options: `autoStart`, `autoRemove`, `autoOneShot`. |
| `OneShot(emitter, { position? })` | Emit one burst. |
| `Remove(emitter)` / `Has(emitter)` | Manage emitters. |
| `Clear()` | Remove all emitters. |
