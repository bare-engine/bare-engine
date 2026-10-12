# Rendering

Most of the time you just add GameObjects and they draw themselves. This page covers the extras: shaders, masks, drawing shapes and render textures.

## Shaders

A shader changes how a GameObject is drawn. Two come with the engine:

```ts
import { FlashShader, OutlineShader } from 'bare-engine';

enemy.AddShader(FlashShader);    // flash white, e.g. when hit
player.AddShader(OutlineShader); // a colored outline

player.RemoveShader(OutlineShader);
player.HasShader(OutlineShader);
```

`FlashShader` removes itself when the flash is done. Both accept settings, for example `enemy.AddShader(FlashShader, { duration: 0.5, fadePreDuration: 0.1 })`, in seconds. Every setting is optional; the flash stays white for `fadePreDuration` (default `0.1`) and fades back over `duration` (default `0.3`), in game time, so it follows [`bare.timeScale`](../reference/bare#game-speed) and waits while the game is paused.

An object has one shader of each class: adding a `FlashShader` while one is running replaces it, so flashing on every hit restarts the flash instead of stacking them.

**Examples:** the [Shmup](https://github.com/bare-engine/bare-shmup)'s ships [flash when hit](https://github.com/bare-engine/bare-shmup/blob/main/src/components/aliveComponent.ts#L52), and the [RPG](https://github.com/bare-engine/bare-rpg)'s [weapon flashes](https://github.com/bare-engine/bare-rpg/blob/main/src/objects/weapon.ts#L22) when it slashes.

### Writing a shader

Extend `Shader` and pass a vertex and a fragment function. Each changes values in place:

```ts
import { Shader } from 'bare-engine';

export class WobbleShader extends Shader
{
    time = 0;

    constructor()
    {
        super(`
            uniform highp float uTime;
            void vertex(inout vec4 position, inout vec2 region) {
                position.x += sin(uTime * 5.0 + position.y * 0.01) * 10.0;
            }
        `, `
            void fragment(inout vec4 color, vec2 vRegion) {
                // leave the color as it is
            }
        `);
        this.SetUniforms({ uTime: 0 });
    }

    // called every frame, return true to remove the shader
    override Update()
    {
        this.time += bare.deltaTime;
        this.SetUniforms({ uTime: this.time });
    }
}
```

In the fragment function, `color` starts as the texture's color at that pixel, times the object's tint, and `vRegion` holds the texture coordinate. The object's alpha is applied after your shader, so whatever it draws fades along with the object. If your effect draws outside the image, like an outline, make room with `this.SetPadding(pixels)`.

**Example:** the [Showcase](https://github.com/bare-engine/bare-showcase)'s [ghost shader](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/shaders/src/ghostShader.ts) wobbles and pulses, and the [shaders demo](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/shaders/src/DemoShaders.ts) adds it to a GameObject.

## Masks

A mask limits where an object is drawn to the shape of another object:

```ts
flower.SetMask(tree);                   // only draw the flower where the tree is
flower.SetMask(tree, MaskType.NOT_EQUAL); // only draw it where the tree isn't
flower.RemoveMask();
```

**Example:** the [Showcase](https://github.com/bare-engine/bare-showcase)'s [graphics demo](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/graphics/src/DemoGraphics.ts#L17-L24) masks a flower with a tree.

## Drawing shapes

Draw shapes in a scene's `OnRender` (or a component's). They're drawn fresh every frame:

```ts
import { Color, Vec2 } from 'bare-engine';

override OnRender()
{
    bare.drawCircle({
        position: new Vec2(100, 200),
        radius: 50,
        color: Color.Red,
    });
    bare.drawRect({
        position: new Vec2(200, 150),
        width: 120,
        height: 100,
        color: Color.Blue,
    });
    bare.drawLine({
        position: new Vec2(380, 150),
        points: Vec2.fromArray([[0, 30], [120, 20], [130, 100]]),
        width: 5,
        closed: true,
        color: Color.Green,
    });
}
```

Which hook you draw in decides whether shapes end up below or above the scene's objects:

| Hook | Drawn |
| --- | --- |
| Scene `OnPreRender` | Below everything, eg a background or a game board under text |
| Component `OnPreRender`, `OnRender` | Below the objects |
| Scene `OnRender`, component `OnPostRender` | Above the objects, eg health bars or outlines |
| Scene `OnPostRender` | Above everything, including what objects draw in their own `OnPostRender` |

`drawRect`, `drawCircle` and `drawRoundedRect` can also draw a line along their edge, half inside and half outside it. Add `fill: false` for only the line:

```ts
bare.drawCircle({ position: center, radius: range, fill: false, outline: { width: 2, color: Color.White } });
bare.drawRect({ position, width: 60, height: 60, color: Color.Blue, outline: { width: 4, color: Color.Black } });
```

There's also `bare.drawRoundedRect`, `bare.drawSprite` (a texture) and `bare.drawGraphic` (any polygon, with per-point colors or a texture). The [Showcase](https://github.com/bare-engine/bare-showcase)'s [graphics demo](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/graphics/src/DemoGraphics.ts#L27-L127) shows all of them.

## Tiled textures

A GameObject stretches its texture to its scale. To repeat it instead, like a floor or a long wall, give it a `TiledComponent`. Scale the object to cover the area; every repeat is the texture's own size times `tileScale`:

```json
{
  "name": "wall",
  "baseClass": "ArcadeObject",
  "texture": "brick",
  "static": true,
  "scale": { "x": 40, "y": 4 },
  "components": {
    "tiled": { "tileScale": 4 }
  }
}
```

With a 6 pixel `brick`, this wall is 240 by 24 units: ten bricks of 24 by 24. It shows in the level editor too, so scaling it there adds bricks. Shaders and masks don't apply to a tiled object.

To move the texture, like a conveyor belt or flowing water, set `scroll` in tiles per second. It scrolls along the object's own axes, so a rotated object scrolls in its new direction:

```json
"components": {
  "tiled": { "tileScale": 4, "scroll": { "x": 1.5, "y": 0 } }
}
```

To draw the tiles differently, extend `TiledComponent` and override `RenderTiles(color, matrixIndex)`. It draws in the texture's own space, so the object covers 0 to the texture's width and height.

## Nine-slice

Stretching a panel, a button or an outlined block also stretches its border. A `NineSliceComponent` keeps the border the same: scale the object to the size you want, and the corners keep their size, the edges stretch in one direction and the middle in both. Set `tileX` or `tileY` to repeat them instead.

```json
{
  "name": "panel",
  "texture": "panel",
  "scale": { "x": 6, "y": 3 },
  "components": {
    "nineSlice": { "left": 12, "top": 12, "right": 12, "bottom": 12 }
  }
}
```

| Field | Default | Description |
| --- | --- | --- |
| `left`, `top`, `right`, `bottom` | `8` | Width of each border, in pixels of the texture. |
| `borderScale` | `1` | Size of the borders in game units per texture pixel. Use `0.5` for art drawn at twice the size. |
| `tileX`, `tileY` | `false` | Repeat the middle along that axis instead of stretching it, along with the edges beside it. A whole number of tiles is fitted and each one is stretched slightly, so no tile is cut off. Use it for patterns like bricks or grass. |

In the prefab editor, a magenta line marks each of the four cuts, so you can see where the borders end.

When the object is smaller than its two borders together, the borders shrink so they fit. The object's own size is still the texture size times its scale, so hitboxes and physics bodies match what you see. Children are scaled along with it, so put things that shouldn't stretch, like a label, next to the object rather than inside it.

**Example:** the [Platformer](https://github.com/bare-engine/bare-platformer)'s [grass block](https://github.com/bare-engine/bare-platformer/blob/main/public/data/settingsData.json#L75-L88) tiles its grass and dirt, and the level [stretches it 3 wide](https://github.com/bare-engine/bare-platformer/blob/main/public/data/levels/level.json#L97-L106) for the ground.

To draw the slices differently, extend `NineSliceComponent` and override `RenderSlices(color, matrixIndex)`. Like `RenderTiles`, it draws in the texture's own space.

## Render textures

A render texture is an image you draw into. Use it to bake many objects into one, for trails, paint, or a minimap:

```ts
import { RenderTexture } from 'bare-engine';

const canvas = new RenderTexture(rapid, { width: bare.width, height: bare.height });
this.AddGameObject(canvas);

// later, draw a GameObject (or a texture) into it
this.RenderTo(stamp, canvas);
```

`this.RenderTo(source, target, clear?)` works with a GameObject or a texture as source. Call `canvas.destroy()` when you don't need it anymore, for example in `OnClear`.

**Example:** the [Showcase](https://github.com/bare-engine/bare-showcase)'s [render texture demo](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/renderTexture/src/DemoRenderTexture.ts) stamps a random emoji into a texture every frame.
