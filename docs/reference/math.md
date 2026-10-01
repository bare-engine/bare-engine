# Math & Utilities

## Vec2

A 2D vector, used for positions, scales and velocities.

```ts
import { Vec2 } from 'bare-engine';

const a = new Vec2(10, 20);
const b = a.add(new Vec2(5, 5));   // new Vec2(15, 25), a is unchanged
a.set(0, 0);                       // changes a
```

| Method | Description |
| --- | --- |
| `add(v)`, `subtract(v)`, `multiply(f)`, `divide(f)` | Arithmetic. `f` is a number or a Vec2. |
| `dot(v)`, `cross(v)` | Dot and cross product. |
| `length()`, `squaredLength()` | Length. |
| `distanceTo(v)` | Distance to another point. |
| `normalized()` | Same direction, length 1. |
| `angle()` | Angle in **radians**. |
| `clone()` | A copy. |
| `equals(v)`, `isZero()` | Comparisons. |
| `set(x, y)` | **Changes** the vector. |
| `normalize()`, `invert()`, `perpendicular()` | **Change** the vector. |
| `Vec2.fromAngle(radians)` | A vector pointing in a direction. |
| `Vec2.fromArray([[x, y], …])` | A list of vectors. |

## Color

Colors use 0–255 for red, green, blue and alpha.

```ts
import { Color } from 'bare-engine';

const red = new Color(255, 0, 0);          // alpha defaults to 255
const blue = Color.fromHex('#3060c0');
const faded = Color.fromHex('#ffffff80');
obj.SetColor(Color.Orange);
```

| Method | Description |
| --- | --- |
| `Color.fromHex(hex)` | From `#rrggbb` or `#rrggbbaa`. |
| `Color.fromRGB(r, g, b)` / `Color.fromHSL(h, s, l)` | From other formats. |
| `Color.fromNorm(r, g, b, a?)` | From 0–1 values. |
| `toHex()` | To a hex string. |
| `r`, `g`, `b`, `a` | Read or change a channel. |
| `clone()`, `equals(color)` | Copy and compare. |
| `add`, `subtract`, `multiply`, `divide` | Mix colors. |

Named colors: `Color.Red`, `Green`, `Blue`, `Yellow`, `Orange`, `Purple`, `Pink`, `Cyan`, `Magenta`, `Lime`, `Brown`, `Gray`, `White`, `Black` and `Transparent`.

## Util

Small utilities, available as `bare.util`.

```ts
bare.util.RandomRange(1, 6);              // a random number between 1 and 6
bare.util.Choose('red', 'green', 'blue'); // one of these at random
bare.util.Clamp(health, 0, 100);
```

| Method | Description |
| --- | --- |
| `RandomRange(min, max)` | Random number in a range. |
| `Choose(...items)` | Random item. |
| `Clamp(value, min, max)` | Keep a value within bounds. |
| `Lerp(a, b, t)` | Blend between two numbers. |
| `GetRanged(inMin, inMax, outMin, outMax, value)` | Map a value from one range to another. |
| `DegreesToRadians(deg)` / `RadiansToDegrees(rad)` | Convert angles. |
| `Direction(from, to)` | Angle between two points, in **degrees**. |
| `PointTowards(direction, distance)` | A point at an angle and distance. |
| `AngleDifference(a, b)` | Smallest difference between two angles. |
| `AlmostEqual(a, b, eps?)` | Compare numbers with a margin. |
| `IsPointInRectangle(point, rect)` | Hit test. |
| `DeepCopy(obj)` | Copy an object and everything in it. |
| `MobileAndTabletCheck()`, `IsAndroid()` | Device checks. |