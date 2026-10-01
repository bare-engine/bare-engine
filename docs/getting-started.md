---
title: Getting Started
nav_order: 2
---

# Getting Started

## Start from the template

The quickest way to start is the [Bare Template](https://github.com/bare-engine/bare-template).
Also install the [Chrome extension](https://chromewebstore.google.com/detail/bare-engine/dbohigkcdpdnchgaffmofeoffnpkmphb) to inspect objects while the game runs.

## Your first scene

A game starts from a `Scene` class passed to `StartBare`:

```ts
import { GameObject, Scene, StartBare } from "bare-engine";

class MainGame extends Scene
{
    cog!: GameObject;

    OnStart(): void
    {
        this.cog = this.AddGameObject({ name: "cog" })
            .SetPosition(bare.width * 0.5, bare.height * 0.5)
            .CenterPivot();
    }

    OnUpdate(): void
    {
        this.cog.rotation++;
    }
}

StartBare(MainGame);
```

## More examples

- [Bare Showcase](https://github.com/bare-engine/bare-showcase) - explore the engine's features
- [Bare Demos](https://github.com/bare-engine/bare-demos) - game examples
