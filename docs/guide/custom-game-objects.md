# Custom GameObjects

Most behavior belongs in [components](./components), because they can be mixed and attached from data. Sometimes a GameObject class of your own is the better fit: when a type of object always needs the same fields, or when you create very many of them.

## Creating a class

```ts
import { GameObject, InspectorBaseClass, InspectorField } from 'bare-engine';

@InspectorBaseClass
export class Enemy extends GameObject
{
    @InspectorField
    health = 3;

    OnUpdate(deltaTime: number)
    {
        this.x -= 50 * deltaTime;
    }

    Hit()
    {
        if (--this.health <= 0)
            this.Remove();
    }
}
```

Lifecycle methods are the same as on a scene: `OnAwake`, `OnStart`, `OnAdded`, `OnUpdate`, `OnFixedUpdate`, `OnPreRender`, `OnRender`, `OnPostRender`, `OnRemoved` and `OnResize`.

**Examples:** the [RPG](https://github.com/bare-engine/bare-rpg)'s [`Weapon`](https://github.com/bare-engine/bare-rpg/blob/main/src/objects/weapon.ts) extends `ArcadeObject` with a `strength` field and a `Slash` button, and its [`Joystick`](https://github.com/bare-engine/bare-rpg/blob/main/src/ui/joystick.ts) is a GameObject with its own update.

## Using it

In code:

```ts
const enemy = this.AddGameObject(Enemy);
const goblin = this.AddGameObject<Enemy>({
    baseClass: 'Enemy',
    texture: 'goblin',
    health: 5,
});
```

In a prefab, with `baseClass`:

```json
{
  "name": "goblin",
  "baseClass": "Enemy",
  "texture": "goblin",
  "health": 5
}
```

`@InspectorBaseClass` registers the class with the engine automatically, so it can be used by name in prefabs and shows up in the [Chrome extension](./chrome-extension). Without it, register the class yourself with `bare.AddClass(Enemy)`.

Fields marked `@InspectorField` can be set from prefabs and edited in the extension.

**Example:** the [Showcase](https://github.com/bare-engine/bare-showcase)'s [extend demo](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/extend/src/DemoExtend.ts#L67-L71) uses an `EmojiObject` class as a prefab's `baseClass`, and the [prefabs demo](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/prefabs/src/DemoPrefabs.ts#L85-L97) does the same with `Fruit`.

## Typed prefab fields

To get autocomplete for your class's prefab fields, describe them:

```ts
import { Entity } from 'bare-engine';

export interface EnemyEntity extends Entity
{
    health?: number;
}

export class Enemy extends GameObject
{
    declare entity: EnemyEntity | null;
}

this.AddGameObject<Enemy>({ health: 5 });   // checked
```

**Example:** the engine's own [`Button`](https://github.com/bare-engine/bare-engine/blob/main/src/objects/button.ts#L17-L29) does this with `ButtonEntity`, which adds `text`, `fontSize`, `buttonColor` and more.

## Object pools

Creating and removing many objects, like bullets, costs time and memory. A pool keeps removed objects and hands them out again.

Registered GameObject classes get a pool automatically. When you `Remove()` a pooled object, it goes back to its pool, and the next `AddGameObject(Bullet)` reuses it.

To create the objects up front:

```ts
bare.RegisterGameObjectPool(Bullet, 200);
```

Pooled objects get their standard values back when they're reused. To be sure your own fields start fresh too, set them in `OnAwake`, which runs every time the object is reused:

```ts
OnAwake()
{
    this.health = 3;
}
```

`bare.pool` gives access to all pools by class name, for example `bare.pool.get('Bullet').GetSize()`.
