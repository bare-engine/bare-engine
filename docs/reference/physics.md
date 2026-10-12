# Physics

Bare has two optional physics engines. Neither is included in your build unless you import it.

## Arcade physics

Simple rectangle and circle collisions, good for platformers and top-down games.

Hitboxes are axis-aligned boxes (AABB) and circles. Rotating an `ArcadeObject` doesn't rotate its hitbox; the box grows to fit around the rotated object. For bodies that rotate, use [realistic physics](#realistic-physics).

Import from `bare-engine/arcade` and register it in your scene. When a prefab or entity has `"baseClass": "ArcadeObject"`, or a class extending it, this happens automatically:

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
| `gravity` | `null` | The object's own gravity, in units per second², in any direction, like `{ x: -500, y: 0 }`. `null` uses `gravity` from `settingsData.json`. |
| `static` | `false` | Doesn't move; other objects collide with it. |
| `collide` | `true` | Takes part in collisions. |
| `sensor` | `false` | Reports collisions but doesn't block, and ignores `stayInBounds`. Use it for triggers, like coins or checkpoints. |
| `drag` | `0` | Fraction of the velocity lost every 1/60 second, from 0 to 1. Below 5 units per second the object stops completely; change that with `ArcadePhysicsController.DRAG_STOP_SPEED`. |
| `restitution` | `0` | Bounciness, from 0 to 1. Two objects bounce with the higher value of the two, so a bouncy ball also bounces off walls left at 0. |
| `stayInBounds` | `true` | Keep the object inside the level. |
| `removeOnOutOfBounds` | `false` | Remove the object when it's fully outside the level. |
| `continuous` | `false` | Stop a fast object from passing through walls. See [Fast objects](#fast-objects). |
| `hitbox` | the image | Rectangle as `{ x1, y1, x2, y2 }`. Values between 0 and 1 are a fraction of the image size, larger ones are pixels. `"FULL"` covers the whole image. |
| `hitboxType` / `hitboxRadius` | `"Rectangle"` | `"Rectangle"` or `"Circle"`, and the circle's radius, by default half the hitbox's smaller side. The circle is centered on the object's [pivot](../guide/game-objects#pivot), so use a `CENTER` pivot to center it on the image. |

A child ArcadeObject always acts as a sensor, so it reports collisions without pushing anything.

| Method | Description |
| --- | --- |
| `SetVelocity(vec)` / `SetVelocityXY(x, y)` / `ResetVelocity()` | Change velocity. |
| `IsGrounded()` | Standing on something. Same as `IsBlocked(BlockedState.Down)`. |
| `IsBlocked(direction)` | Blocked in a direction: `BlockedState.Up`, `Down`, `Left` or `Right`. |
| `IsMoving()` | Has velocity. |

### Fast objects

Objects move a full step at a time, 1/60 second by default. An object that moves further than its own size in one step can jump over a thin wall without touching it. Set `continuous` on fast objects like bullets or a golf ball:

```json
{
  "name": "ball",
  "baseClass": "ArcadeObject",
  "hitboxType": "Circle",
  "pivot": "CENTER",
  "restitution": 0.8,
  "continuous": true
}
```

When a `continuous` object would move more than half its size in one step, it moves in smaller steps instead, and collides after each one. It stops at walls and bounces off them, then uses the rest of the step to move in its new direction. Sensors it passes still report a collision. A slow `continuous` object costs no extra work. `ArcadePhysicsController.MAX_CONTINUOUS_STEPS` limits the number of smaller steps, 64 by default.

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

A [custom](../guide/custom-game-objects) `ArcadeObject` can override the same three methods itself.

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

Import it from `bare-engine/sopiro` and register the controller. That also registers all its body and joint classes. When a prefab or entity has a Sopiro `baseClass`, like `"Box"` or `"Circle"`, this happens automatically:

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

Gravity is read from `gravity` in `settingsData.json`, like arcade physics. Without it, realistic physics uses a gravity of 1200. A body can have its own `gravity` instead, see below.

### Bodies

Set one of these as a prefab's `baseClass`:

| Class | Shape |
| --- | --- |
| `Box` | A rectangle, the size of its image times its scale. `rigidbodyRect: { width, height }` sets another size, in image pixels. |
| `Circle` | A circle with a radius of half the image's smaller side, times its scale. `hitboxRadius` sets another radius. |
| `Polygon` | Any convex shape, from `polygonVertices`: a flat list of points, `[x1, y1, x2, y2, …]`. |

A body turns around its center, so while the game runs its pivot is always the center of its image, whatever the prefab says. Children and `SetPosition` work from that center too.

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
| `mass` / `density` | How heavy the body is. Set one, the other follows from its size: mass is density times the area in game units, divided by 10,000. Density is 1 by default. |
| `restitution` | Bounciness, from 0 to 1. Default `0`. |
| `friction` | How much it grips other bodies. Default `0.7`. |
| `surfaceSpeed` | Moves whatever touches it along its surface, like a conveyor belt. |
| `linearVelocity` / `angularVelocity` | Current movement and spin. |
| `gravity` | The body's own gravity, in units per second², in any direction, like `{ x: 0, y: -500 }` to fall up. `null`, the default, uses `gravity` from `settingsData.json`. |

You can also create bodies in code. They're GameObjects, so add them like any other:

```ts
import { Circle, Type } from 'bare-engine/sopiro';

const ball = new Circle(this, 36, Type.Dynamic);
ball.restitution = 0.8;
this.AddGameObject(ball);
ball.SetPosition(x, y);
```

Collisions fire the `collision_start`, `collision_update` and `collision_end` events. A custom `RigidBody` class can also override `OnCollisionStart`, `OnCollisionUpdate` and `OnCollisionEnd`, like an `ArcadeObject`.

### Friction and bounce between two bodies

When two bodies touch, their friction is the square root of the two frictions multiplied, and their bounce is the higher of the two restitutions, like in Box2D. So a ball with a restitution of 1 bounces on any floor, and a slippery body slides on everything.

### Placing bodies

Bodies that start out overlapping are pushed apart over a few steps, without gaining speed, so a careful stack stays standing. Overlaps of up to `penetrationSlop` (half a unit) are left alone, which keeps resting bodies touching.

### Sleeping

Bodies that touch each other fall asleep together, once all of them have been still for half a second. Sleeping bodies stop moving and cost almost nothing. They wake up when something they touch is removed or hits them, when you call `SetPosition`, or when you call `body.awake()`. Read `body.sleeping` to see if a body is asleep. Setting `linearVelocity` or `angularVelocity` doesn't wake a body, so call `awake()` after.

### Finding the body at a point

The physics world can tell which body is at a point, for example under the pointer:

```ts
import { Vec2 } from 'bare-engine';

const mouse = bare.mouse.world.position;
const body = this.sopiro.world.queryPoint(new Vec2(mouse.x, mouse.y))[0];
```

`queryPoint` returns a list with at most one body. It finds the exact shape, so clicking the empty corner next to a circle finds nothing.

### Tuning

Set solver settings for a scene with `sopiro` in its `settingsData.json`. Units are game units and seconds:

```json
{
  "gravity": 1200,
  "sopiro": {
    "numIterations": 15,
    "sleepingWait": 1
  }
}
```

Each scene can have its own, and settings it leaves out keep their default. To change a default for every scene, change `Settings`, exported from `bare-engine/sopiro`, once at startup, for example in [`OnInit`](./configuration#oninit).

| Setting | Default | Description |
| --- | --- | --- |
| `numIterations` | `10` | Solver passes per step. More makes stacks steadier and costs more. |
| `splitImpulse` | `true` | Push overlapping bodies apart without giving them speed. With `false`, the push is added to their velocity, which is cheaper but can make stacks bounce and fall. |
| `positionCorrectionBeta` | `0.2` | How much of an overlap is corrected per step. |
| `penetrationSlop` | `0.5` | Overlap that's left alone, so resting bodies stay touching. |
| `restitutionThreshold` | `50` | Bodies hitting each other slower than this, in units per second, don't bounce. Keep it above gravity times the fixed timestep, 20 by default, or resting bodies jitter. |
| `sleepEnabled` | `true` | Whether bodies fall asleep. |
| `sleepingWait` | `0.5` | Seconds bodies must be still before they sleep. |
| `restLinearTolerance` | `1` | Speed below which a body counts as still, squared: 1 unit per second. |
| `restAngularTolerance` | about `0.0012` | Turning speed below which a body counts as still, in radians per second, squared: 2 degrees per second. |
| `warmStartingThreshold` | `1` | A contact reuses last step's result when it moved less than this, squared. Reusing it keeps stacks steady. |
| `defaultFriction` / `defaultRestitution` / `defaultDensity` | `0.7` / `0` / `1` | Values for bodies that don't set their own. |

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

Every joint also has `frequency` and `dampingRatio`, to make it stiff or springy, and `jointMass`. They're inspector fields, so you can tweak them in the [Chrome extension](https://chromewebstore.google.com/detail/bare-engine/dbohigkcdpdnchgaffmofeoffnpkmphb) ([Firefox](https://addons.mozilla.org/en-GB/firefox/addon/bare-engine/)) while the game runs.

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
