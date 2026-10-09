# Hitbox

Click and hover callbacks on GameObjects, handled by `bare.hitbox`. The object's texture is used as its hitbox.

```ts
button.OnPointerDown(() => bare.scene.Goto(Game));
button.OnPointerEnter(() => button.SetScale(1.1));
button.OnPointerLeave(() => button.SetScale(1));
```

| Method | Description |
| --- | --- |
| `OnPointerDown(cb)` / `OnPointerUp(cb)` | Pressed or released on the object. |
| `OnPointerEnter(cb)` / `OnPointerLeave(cb)` | Pointer moved over or off the object. |
| `OffPointers()` | Remove all pointer callbacks from the object. |

**Examples:** the [RPG](https://github.com/bare-engine/bare-rpg)'s level connectors [highlight on hover](https://github.com/bare-engine/bare-rpg/blob/main/src/components/levelConnectorComponent.ts#L26-L45), and the [Showcase](https://github.com/bare-engine/bare-showcase)'s [tweens demo](https://github.com/bare-engine/bare-showcase/blob/main/public/demos/tweens/src/DemoTweens.ts#L28-L38) uses `AssignButton` with separate press and release handlers.

## More on `bare.hitbox`

| Method | Description |
| --- | --- |
| `AssignButton(obj, onPress)` | Make an object behave like a button. |
| `SetCircleHitbox(obj, radius?)` | Use a circle instead of the texture rectangle. The circle is centered on the object's [pivot](../guide/game-objects#pivot), so call `CenterPivot()` to center it on the image. The radius defaults to half the image's smaller side. |
| `SetShowPointerCursor(obj, show)` | Show the hand cursor on hover. |
| `GetCurrentHover()` / `GetCurrentDown()` | The hitbox under the pointer, or being pressed. |
| `SetExclusiveLayer(...layers)` | Only accept pointer input on these layers. |
