# Events

Events let parts of your game react to each other without knowing about each other. A coin can say "I was collected", and the score counter, the sound and the level logic can all listen for it.

```ts
// somewhere in a component
bare.events.emit('coinCollected', { value: 10 });

// somewhere in your scene
bare.events.on('coinCollected', ({ value }) => {
    this.score += value;
});
```

**Example:** a [Platformer](https://github.com/bare-engine/bare-platformer) coin [emits `collectableCollected`](https://github.com/bare-engine/bare-platformer/blob/main/src/components/collectableComponent.ts#L25), and the scene [listens to it](https://github.com/bare-engine/bare-platformer/blob/main/src/game.ts#L62-L72) to count coins and win.

## Three event buses

| Bus | Scope |
| --- | --- |
| `bare.events` | The current scene. Most game events go here. |
| `bare.globalEvents` | The whole game, across all scenes. |
| `gameObject.events` | A single GameObject, for example its collisions. |

`bare.SendEvent(type, ...args)` sends an event to `bare.globalEvents` **and** to every active scene's `bare.events` at once.

## Listening

```ts
bare.events.on(BareEvent.key_pressed, ({ key }) => { ... });
bare.events.once(BareEvent.level_loaded, () => { ... });   // only the first time
bare.events.off(BareEvent.key_pressed, handler);
```

**Example:** the [RPG](https://github.com/bare-engine/bare-rpg) [hides the touch joystick](https://github.com/bare-engine/bare-rpg/blob/main/src/game.ts#L53-L55) the first time a key is pressed, using `once`.

You can give a listener an alias, so you can remove it later without keeping a reference to the function:

```ts
bare.events.on(BareEvent.pointer_down, this.OnDown.bind(this), 'drag');
bare.events.offAlias('drag');
```

**Example:** the [RPG](https://github.com/bare-engine/bare-rpg)'s joystick [registers its pointer listeners with aliases](https://github.com/bare-engine/bare-rpg/blob/main/src/ui/joystick.ts#L28-L30).

Scene listeners are removed when the scene restarts. To keep one, use `bare.events.persistent.on(...)`. Global listeners need explicit cleanup when their owner is removed; see [Lifecycle & Cleanup](./lifecycle#global-listeners).

## Built-in events

Use the `BareEvent` constants for autocomplete:

```ts
import { BareEvent } from 'bare-engine';
```

| Event | Payload |
| --- | --- |
| `game_started`, `game_restart` | `{ full }` on restart |
| `game_update` | `{ deltaTime }` |
| `game_resize` | `{ prevWidth, prevHeight, newWidth, newHeight }` |
| `game_pauseToggled`, `game_focusChange` | `boolean` |
| `game_objectAdded` | `{ gameObject, layer }` |
| `game_objectRemoved` | the GameObject |
| `scene_added`, `scene_removed` | `{ scene }` |
| `scene_changed` | `{ scene, type }`, where `type` is `"added"` or `"removed"` |
| `level_loaded` | `{ levelStr, level }` |
| `level_restart` | |
| `pointer_down`, `pointer_up` | `{ mouseX, mouseY, event }` |
| `pointer_move` | `{ mouseX, mouseY, movedX, movedY, event, isLeftButton }` |
| `pointer_doubleClick` | `{ mouseX, mouseY, event }` |
| `key_pressed`, `key_down`, `key_released` | `{ key, allKeys }` |
| `collision_start`, `collision_update`, `collision_end` | the two objects (with [physics](../reference/physics)) |

## Collision events on an object

With physics, each object also gets its own collision events:

```ts
sword.events.on(BareEvent.collision_start, (other) => {
    if (other.tags.includes('enemy'))
        other.Remove();
});
```

**Example:** the [Platformer](https://github.com/bare-engine/bare-platformer) [restarts when the player touches a saw](https://github.com/bare-engine/bare-platformer/blob/main/src/game.ts#L75-L82).

In a component, the `OnCollisionStart` method is usually simpler. See [Components](./components#lifecycle).

## Your own events

Any string works as an event name. To get autocomplete and type checking for your events, describe them once:

```ts
declare module 'bare-engine'
{
    interface BareUserEvents
    {
        coinCollected: { value: number };
        playerDied: void;
    }
}
```

Now `bare.events.emit('coinCollected', { value: 10 })` is checked, and the listener knows `value` is a number.

**Example:** the [Showcase](https://github.com/bare-engine/bare-showcase)'s [extend demo](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/extend/src/DemoExtend.ts#L35-L60) adds an event, a prefab property, a component method and a save data field this way.

The same trick works for other engine types: add fields to `interface Entity` for your own prefab properties, or to `interface Component` for methods you call on all components.
