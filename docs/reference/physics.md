# Physics

Bare has two optional physics engines. Neither is included in your build unless you import it.

## Arcade physics

Simple rectangle and circle collisions, good for platformers and top-down games. Import from `bare-engine/arcade` and register it in your scene:

```ts
import { ArcadePhysicsController } from 'bare-engine/arcade';

export class Game extends Scene
{
    override OnAwake()
    {
        bare.AddClass(ArcadePhysicsController);
    }
}
```

Then give your prefabs `"baseClass": "ArcadeObject"`:

```json
{
  "name": "player",
  "baseClass": "ArcadeObject",
  "texture": "player"
},
{
  "name": "block",
  "baseClass": "ArcadeObject",
  "texture": "block",
  "static": true
}
```

Set gravity at the top level of `settingsData.json`:

```json
{
  "gravity": 5000
}
```

**Example:** the [Platformer](https://github.com/bare-engine/bare-platformer) [registers arcade physics](https://github.com/bare-engine/bare-platformer/blob/main/src/game.ts#L25-L29), [sets gravity](https://github.com/bare-engine/bare-platformer/blob/main/public/data/settingsData.json#L2), and [makes its prefabs ArcadeObjects](https://github.com/bare-engine/bare-platformer/blob/main/public/data/settingsData.json#L16-L62).

### ArcadeObject

| Property | Default | Description |
| --- | --- | --- |
| `velocity` | `{ x: 0, y: 0 }` | Speed in units per second (`Vec2`). |
| `static` | `false` | Doesn't move; other objects collide with it. |
| `collide` | `true` | Takes part in collisions. |
| `sensor` | `false` | Reports collisions but doesn't block, and ignores `stayInBounds`. Use it for triggers, like coins or checkpoints. |
| `drag` | `0` | Fraction of the velocity lost every 1/60 second, from 0 to 1. |
| `restitution` | `0` | Bounciness, from 0 to 1. Two objects bounce with the lower value of the two. |
| `stayInBounds` | `true` | Keep the object inside the level. |
| `removeOnOutOfBounds` | `false` | Remove the object when it's fully outside the level. |
| `hitbox` | the image | Rectangle as `{ x1, y1, x2, y2 }`. Values between 0 and 1 are a fraction of the image size, larger ones are pixels. `"FULL"` covers the whole image. |
| `hitboxType` / `hitboxRadius` | `"Rectangle"` | `"Rectangle"` or `"Circle"`, and the circle's radius. The circle is centered on the object's [pivot](../guide/game-objects#pivot), so use a `CENTER` pivot to center it on the image. |

A child ArcadeObject always acts as a sensor, so it reports collisions without pushing anything.

| Method | Description |
| --- | --- |
| `SetVelocity(vec)` / `SetVelocityXY(x, y)` / `ResetVelocity()` | Change velocity. |
| `IsGrounded()` | Standing on something. Same as `IsBlocked(BlockedState.Down)`. |
| `IsBlocked(direction)` | Blocked in a direction: `BlockedState.Up`, `Down`, `Left` or `Right`. |
| `IsMoving()` | Has velocity. |

**Examples:** the [Platformer](https://github.com/bare-engine/bare-platformer)'s player [moves with `velocity` and checks `IsGrounded`](https://github.com/bare-engine/bare-platformer/blob/main/src/components/playerComponent.ts#L40-L72), and [RPG](https://github.com/bare-engine/bare-rpg) enemies [roam with `SetVelocity`](https://github.com/bare-engine/bare-rpg/blob/main/src/components/enemyAIComponent.ts#L84). The [Showcase](https://github.com/bare-engine/bare-showcase) has an [arcade physics demo](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/arcadePhysics/src/DemoArcadePhysics.ts).

### Collisions

Handle collisions in a [component](../guide/components):

```ts
export class CoinComponent extends Component<ArcadeObject>
{
    override OnCollisionStart(other: GameObject)
    {
        if (other.name == 'player')
            this.go.Remove();
    }
}
```

`OnCollisionUpdate` runs every frame during contact, and `OnCollisionEnd` when it ends.

**Examples:** [Platformer](https://github.com/bare-engine/bare-platformer) coins [are collected on collision](https://github.com/bare-engine/bare-platformer/blob/main/src/components/collectableComponent.ts#L13-L20), and [Shmup](https://github.com/bare-engine/bare-shmup) ships [take damage from bullets](https://github.com/bare-engine/bare-shmup/blob/main/src/components/aliveComponent.ts#L25-L28).

### Collision layers

By default, every object collides with every other object.

::: warning
That default only holds when your `layers` list includes `"objects"`. If it doesn't, the engine adds an `objects` layer itself, and only objects on that layer collide, with each other. Add `"objects"` to `layers`, or use `collidesWith`.
:::

To choose which [layers](../guide/levels-and-layers#layers) collide, give them `collidesWith` in `layersInfo`:

```json
"layers": ["enemies", "bulletsEnemy", "bulletsPlayer", "player"],
"layersInfo": {
  "bulletsPlayer": {
    "collidesWith": ["enemies"]
  },
  "bulletsEnemy": {
    "collidesWith": ["player"]
  },
  "enemies": {
    "collidesWith": ["player"]
  }
}
```

Now your bullets hit enemies, enemy bullets and enemies hit you, and nothing else collides. Bullets don't hit each other, and enemies don't push each other around.

- A pair collides when either layer lists the other, so you only need to write it once.
- As soon as **one** layer has `collidesWith`, layers without it don't collide with anything. List every pair that should collide, including a layer with itself if needed, like `"collidesWith": ["objects"]` for `objects`.
- Children count as being on their root object's layer.

**Example:** this is the [Shmup](https://github.com/bare-engine/bare-shmup)'s [`layersInfo`](https://github.com/bare-engine/bare-shmup/blob/main/public/data/settingsData.json#L84-L94).

## Realistic physics

Rigid-body physics with rotation, friction, mass and joints, based on [Sopiro/Physics](https://github.com/Sopiro/Physics). Use it when objects should tumble, stack, swing or roll. It works, but it isn't as well supported as arcade physics yet.

Import it from `bare-engine/sopiro` and register the controller. That also registers all its body and joint classes:

```ts
import { SopiroPhysicsController } from 'bare-engine/sopiro';

export class Game extends Scene
{
    override OnAwake()
    {
        bare.AddClass(SopiroPhysicsController);
    }
}
```

Gravity is read from `gravity` in `settingsData.json`, like arcade physics. Without it, realistic physics uses a gravity of 1200.

### Bodies

Set one of these as a prefab's `baseClass`:

| Class | Shape |
| --- | --- |
| `Box` | A rectangle, the size of the object. |
| `Circle` | A circle. |
| `Polygon` | Any convex shape, from `polygonVertices`: a flat list of points, `[x1, y1, x2, y2, …]`. |

```json
{
  "name": "crate",
  "baseClass": "Box",
  "texture": "crate",
  "restitution": 0.5
},
{
  "name": "ground",
  "baseClass": "Box",
  "texture": "ground",
  "static": true
}
```

| Property | Description |
| --- | --- |
| `static` | Doesn't move; other bodies collide with it. |
| `mass` / `density` | How heavy the body is. Set one, the other follows from its size. |
| `restitution` | Bounciness, from 0 to 1. |
| `friction` | How much it grips other bodies. |
| `surfaceSpeed` | Moves whatever touches it along its surface, like a conveyor belt. |
| `linearVelocity` / `angularVelocity` | Current movement and spin. |

You can also create bodies in code. They're GameObjects, so add them like any other:

```ts
import { Circle, Type } from 'bare-engine/sopiro';

const ball = new Circle(this, 36, Type.Dynamic);
ball.restitution = 0.8;
this.AddGameObject(ball);
ball.SetPosition(x, y);
```

Collisions fire the `collision_start`, `collision_update` and `collision_end` events.

### Joints

Joints connect two bodies. Place a joint object in the [level editor](../guide/level-editor) where two bodies overlap, and it connects them. Placed on a single body, it pins that body to the spot instead. Joints are invisible in the game.

| Class | What it does |
| --- | --- |
| `RevoluteJointObject` | A hinge: the bodies rotate freely around the point, like a wheel or a door. |
| `WeldJointObject` | Glues the bodies together. |
| `AngleJointObject` | Keeps the angle between the bodies, but lets them move. |
| `DistanceJointObject` | Keeps the bodies at a distance, like a rope or spring. Set `mode` to `Pull` for a rope that can go slack, and `distance` for its length. It draws a line in `lineColor` and `lineWidth`. |
| `LineJointObject` | Lets a body slide along a line, like a piston. `lockRotation` stops it from rotating. |
| `MotorJointObject` | Drives a body: set `angularSpeed` to spin it, or `linearOffset` and `angularOffset` to move it, with `maxForce` and `maxTorque` as limits. |

Every joint also has `frequency` and `dampingRatio`, to make it stiff or springy, and `jointMass`. They're inspector fields, so you can tweak them in the [Chrome extension](../guide/chrome-extension) while the game runs.

To use a joint, make a prefab for it:

```json
{
  "name": "hinge",
  "baseClass": "RevoluteJointObject",
  "texture": "PIXEL",
  "scale": {
    "x": 32,
    "y": 32
  },
  "pivot": "CENTER"
}
```

**Example:** the [Showcase](https://github.com/bare-engine/bare-showcase)'s [realistic physics demo](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/realisticPhysics/src/DemoRealisticPhysics.ts) has [a prefab for every body and joint](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/realisticPhysics/data/settingsData.json), and creates a ball wherever you click.
