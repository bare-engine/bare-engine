# Getting Started

## Requirements

Install [Node.js](https://nodejs.org/en/download) and [Git](https://git-scm.com/downloads).

## Create a project

The easiest start is the [Bare Template](https://github.com/bare-engine/bare-template).

**Option 1: use the template on GitHub**

1. On the template page, click **Use this template** and create your repo.
2. Clone it and start the dev server:

```sh
git clone https://github.com/YOUR-NAME/YOUR-REPO.git bare-game
cd bare-game
npm install
npm run dev
```

**Option 2: download the ZIP**

1. On the template page, click **Code → Download ZIP** and unzip it.
2. Open a terminal in the unzipped folder.
3. Run `npm install`, then `npm run dev`.

Ctrl-click the localhost URL shown in the terminal to open your game.

## Your first scene

The template's `src/game.ts` looks like this:

```ts
import { GameObject, Scene, StartBare } from 'bare-engine';
import settingsDataJson from '../public/data/settingsData.json';

export class Game extends Scene
{
    obj: GameObject;

    constructor()
    {
        super(settingsDataJson);
    }

    OnStart()
    {
        this.obj = this.AddGameObject('⚙')
            .SetPosition(bare.width * .5, bare.height * .5)
            .CenterPivot();
    }

    OnFixedUpdate()
    {
        this.obj.rotation++;
    }
}

StartBare(Game);
```

- `StartBare(Game)` boots the engine with `Game` as the first scene. It takes options as a second argument, like a background color or a fixed resolution. See [Configuration](../reference/configuration).
- Passing `settingsData.json` to `super` gives the scene your [prefabs](./prefabs) and other game data.
- `AddGameObject('⚙')` resolves `'⚙'` to a prefab or image and adds a [GameObject](./game-objects) to the scene.
- Rotation is in degrees, so the gear turns one degree per fixed update.

**Example:** this is [`src/game.ts`](https://github.com/bare-engine/bare-template/blob/main/src/game.ts) in the [template](https://github.com/bare-engine/bare-template).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run build-zip` | Build and zip `dist/` into `dist.zip` |
| `npm run analyze` | Inspect what ends up in the bundle |

## Next steps

- Install the [Chrome extension](./chrome-extension) to inspect and edit your game while it runs.
- Read [Project Structure](./project-structure) to learn where things go.
- Explore the [Showcase](https://github.com/bare-engine/bare-showcase) and the example games: [Platformer](https://github.com/bare-engine/bare-platformer), [Shmup](https://github.com/bare-engine/bare-shmup).
