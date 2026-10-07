# Build Your First Game

Start with the [template setup](./getting-started#create-a-project). This walkthrough takes you from the spinning gear to a character you can move, then to a production build.

## Move a square

Replace `src/game.ts` with the class below. It uses the built-in `PIXEL` texture, so no downloaded art or settings file is needed.

```ts
import { StartBare, Scene, GameObject, Color } from 'bare-engine';

export class FirstGame extends Scene
{
    player: GameObject;

    override OnStart()
    {
        this.player = this.AddGameObject('PIXEL')
            .SetScale(32)
            .SetColor(Color.Orange)
            .SetPosition(bare.width / 2, bare.height / 2)
            .CenterPivot();
    }

    override OnUpdate(deltaTime: number)
    {
        const direction = Number(bare.keyboard.IsRightDown()) - Number(bare.keyboard.IsLeftDown());
        this.player.x += direction * 200 * deltaTime;
    }
}

StartBare(FirstGame);
```

You should see an orange square in the center. Click the game, then hold the left or right arrow key (A/D also work). It moves at 200 game units per second; multiplying by `deltaTime` makes the speed independent of frame rate.

## Give it an image

Put a PNG named `player.png` in `texturePackImages/`. The dev server rebuilds the atlas. Change `AddGameObject('PIXEL')` to `AddGameObject('player')`, remove `.SetScale(32)` to use the image's own dimensions, and remove `.SetColor(Color.Orange)` to keep its original colors.

Save the file and you should see your image where the square was. Asset names omit the file extension. See [Assets](./assets) for streaming images and generated names.

## Build and run the result

In the template project:

```sh
npm run build
npx vite preview --config vite.config.cjs
```

Open the preview URL printed in the terminal. Check that the image appears and movement works there too. The result is in `dist/`; do not open its HTML directly from disk. See [Building & Publishing](./building-and-publishing).

## Continue building

| Goal | Read next |
| --- | --- |
| Reuse movement on several objects | [Components](./components) |
| Define a player and enemies as data | [Prefabs](./prefabs) |
| Place them in a map | [Levels & Layers](./levels-and-layers), then [Level Editor](./level-editor) |
| Add walls, gravity, or collision triggers | [Physics](../reference/physics) |
| Add a score and restart cleanly | [Text & UI](./text-and-ui), then [Lifecycle & Cleanup](./lifecycle) |

The square's source above is also compiled and run by the engine's documentation example tests.
