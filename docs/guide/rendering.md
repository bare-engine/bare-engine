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

`FlashShader` removes itself when the flash is done. Both accept settings, for example `enemy.AddShader(FlashShader, { duration: 500, fadePreDuration: 100 })`.

**Examples:** [Shmup](https://github.com/bare-engine/bare-shmup) ships [flash when hit](https://github.com/bare-engine/bare-shmup/blob/main/src/components/aliveComponent.ts#L52), and the [RPG](https://github.com/bare-engine/bare-rpg)'s [weapon flashes](https://github.com/bare-engine/bare-rpg/blob/main/src/objects/weapon.ts#L22) when it slashes.

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
            void fragment(inout vec4 color) {
                // leave the color as it is
            }
        `);
        this.SetUniforms({ uTime: 0 });
    }

    // called every frame, return true to remove the shader
    Update()
    {
        this.time += bare.deltaTime;
        this.SetUniforms({ uTime: this.time });
    }
}
```

In the fragment function, `color` starts as the texture's color at that pixel, and `vRegion` holds the texture coordinate. If your effect draws outside the image, like an outline, make room with `this.SetPadding(pixels)`.

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

OnRender()
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
        points: Vec2.FromArray([[0, 30], [120, 20], [130, 100]]),
        width: 5,
        closed: true,
        color: Color.Green,
    });
}
```

There's also `bare.drawRoundedRect`, `bare.drawSprite` (a texture) and `bare.drawGraphic` (any polygon, with per-point colors or a texture). The [Showcase](https://github.com/bare-engine/bare-showcase)'s [graphics demo](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/graphics/src/DemoGraphics.ts#L27-L127) shows all of them.

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
