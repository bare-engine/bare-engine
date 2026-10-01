# Physics

Bare has two optional physics engines. Neither is included in your build unless you import it.

## Arcade physics

Simple rectangle and circle collisions, good for platformers and top-down games. Import from `bare-engine/arcade` and register it in your scene:

```ts
import { ArcadeObject, ArcadePhysicsController } from 'bare-engine/arcade';

export class Game extends Scene
{
    OnAwake()
    {
        bare.AddClass(ArcadeObject);
        bare.AddClass(ArcadePhysicsController);
    }
}
```

Then give your prefabs `"baseClass": "ArcadeObject"`:

```json
{ "name": "player", "baseClass": "ArcadeObject", "texture": "player" },
{ "name": "block",  "baseClass": "ArcadeObject", "texture": "block", "static": true }
```

Set gravity at the top level of `settingsData.json`:

```json
{ "gravity": 5000 }
```

### ArcadeObject

| Property | Description |
| --- | --- |
| `velocity` | Speed in units per second (`Vec2`). |
| `static` | Doesn't move; other objects collide with it. |
| `collide` | Takes part in collisions. |
| `sensor` | Reports collisions but doesn't block. |
| `drag` | Slows the object down over time. |
| `restitution` | Bounciness. |
| `stayInBounds` | Keep the object inside the level. |
| `removeOnOutOfBounds` | Remove the object when it leaves the level. |
| `hitbox` | Rectangle as `{ x1, y1, x2, y2 }`, or `"FULL"` for the whole texture. |
| `hitboxType` / `hitboxRadius` | `"Rectangle"` or `"Circle"`, and the circle's radius. |

| Method | Description |
| --- | --- |
| `SetVelocity(vec)` / `SetVelocityXY(x, y)` / `ResetVelocity()` | Change velocity. |
| `IsGrounded()` | Standing on something. |
| `IsBlocked(direction)` | Blocked in a `BlockedState` direction. |
| `IsMoving()` | Has velocity. |

### Collisions

Handle collisions in a [component](../guide/components):

```ts
export class CoinComponent extends Component<ArcadeObject>
{
    OnCollisionStart(other: GameObject)
    {
        if (other.name == 'player')
            this.go.Remove();
    }
}
```

`OnCollisionUpdate` runs every frame during contact, and `OnCollisionEnd` when it ends.

## Sopiro physics

Realistic rigid-body physics based on [Sopiro/Physics](https://github.com/Sopiro/Physics), imported from `bare-engine/sopiro`. It works, but it isn't well supported yet.
