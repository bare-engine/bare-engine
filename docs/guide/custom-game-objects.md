# Custom GameObjects

Most behavior belongs in [components](./components), because they can be mixed and attached from data. Sometimes a GameObject class of your own is the better fit: when a type of object always needs the same fields, or when you create very many of them.

## Creating a class

```ts
import { Entity, GameObject, InspectorBaseClass, SerializeField } from 'bare-engine';

// the prefab fields this class adds, for autocomplete and type checks
export interface EnemyEntity extends Entity
{
    health?: number;
}

@InspectorBaseClass
export class Enemy extends GameObject
{
    declare entity: EnemyEntity | null;

    @SerializeField
    health = 3;

    override OnUpdate(deltaTime: number)
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

GameObject lifecycle hooks include `OnAwake`, `OnStart`, `OnAdded`, `OnUpdate`, `OnFixedUpdate`, `OnPreRender`, `OnRender`, `OnPostRender`, `OnRemoved` and `OnResize`. Their ownership and timing differ from scene hooks; see [Lifecycle & Cleanup](./lifecycle).

Mark hooks `override`, like `override OnUpdate`, and give your own members names the engine doesn't use, not `layer` or `name`; see [Troubleshooting](./troubleshooting#this-member-must-have-an-override-modifier).

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

`@InspectorBaseClass` registers the class with the engine automatically, so it can be used by name in prefabs and shows up in the [Chrome extension](https://chromewebstore.google.com/detail/bare-engine/dbohigkcdpdnchgaffmofeoffnpkmphb) ([Firefox](https://addons.mozilla.org/en-GB/firefox/addon/bare-engine/)). A class that's named as a `baseClass` in `settingsData.json`, or in an entity in your code, is registered automatically too, decorator or not. Otherwise, register it yourself with `bare.AddClass(Enemy)`.

Fields marked `@SerializeField` can be set from prefabs, are saved into levels, and can be edited in the extension.

**Example:** the [Showcase](https://github.com/bare-engine/bare-showcase)'s [extend demo](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/extend/src/DemoExtend.ts#L67-L71) uses an `EmojiObject` class as a prefab's `baseClass`, and the [prefabs demo](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/prefabs/src/DemoPrefabs.ts#L85-L97) does the same with `Fruit`.

## Typed prefab fields

The `EnemyEntity` interface and the `declare entity` line in the class above describe the prefab fields your class adds. They make `this.AddGameObject<Enemy>({ health: 5 })` type-checked and give you autocomplete. Without them, TypeScript only accepts the standard entity fields, and `health: 5` is an error.

**Example:** the engine's own [`Button`](https://github.com/bare-engine/bare-engine/blob/main/src/objects/button.ts#L17-L29) does this with `ButtonEntity`, which adds `text`, `fontSize`, `buttonColor` and more.

Settings data written in code, like `super({ settingsData: { prefabs: [...] } })`, checks every prefab against the fields of all GameObject classes, since a prefab can have any `baseClass`. Add your class to `EntityTypes` so its fields count too:

```ts
declare module 'bare-engine'
{
    interface EntityTypes
    {
        Enemy: EnemyEntity;
    }
}
```

`{ name: 'goblin', baseClass: 'Enemy', health: 5 }` is then accepted, and a typo like `helth` is still an error. Prefabs in `settingsData.json` don't need this; TypeScript only checks objects written in your code.

## Object pools

Creating and removing many objects, like bullets, costs time and memory. A pool keeps removed objects and hands them out again.

Registered GameObject classes get a pool automatically. When you `Remove()` a pooled object, it goes back to its pool, and the next `AddGameObject(Bullet)` reuses it.

To create the objects up front, for example in your scene's `OnAwake`:

```ts
bare.RegisterGameObjectPool(Bullet, 200);
```

This also fills the pool of a class that's already registered. Without it, a pool starts with one object and makes new ones as you add more, so a big wave of spawns creates them all mid-game.

Pooled objects get their standard values back when they're reused, but your own fields don't. Reset them in `OnAwake`, and release listeners in `OnRemoved`; see [pooled objects](./lifecycle#pooled-objects).

`bare.pool` gives access to all pools by class name, for example `bare.pool.get('Bullet').GetSize()`.
