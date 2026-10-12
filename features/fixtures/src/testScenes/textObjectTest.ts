import { Button, Color, GameObject, Scene, TextObject, Vec2 } from "bare-engine";
import { Checks } from "./checks";

// covers TextObject and Button: text changes resize the texture, pivots and hitboxes follow, style fields

const LONG_TEXT = "a much longer text than before";

export class TextObjectTest extends Scene
{
    checks = new Checks();

    constructor()
    {
        super({
            basePrefabs: [{ name: "ANY", texture: "PIXEL" }],
            prefabs: [
                { name: "label", baseClass: "TextObject", text: "Hi", pivot: { x: 5, y: 6 } } as any,
            ],
        } as any);
    }

    override OnAwake(): void
    {
        bare.AddClass(TextObject);
    }

    Text(text = "Hi"): TextObject
    {
        return this.AddGameObject(new TextObject(this, { text, fontSize: 22 })).SetPosition(100, 100) as TextObject;
    }

    Button(text = "Hi", handlers: any = {}): Button
    {
        return this.AddGameObject(new Button(this, { text, fontSize: 22, ...handlers } as any)).SetPosition(100, 400) as Button;
    }

    // whether a point inside the object, near its right edge, hits its own hitbox
    HitsNearRightEdge(obj: GameObject, width: number): boolean
    {
        const point = new Vec2(obj.x - obj.pivotX + width - 3, obj.y - obj.pivotY + 3);
        return this.hitbox.GetHitboxAtPoint(point)?.parent === obj;
    }

    // calls a hitbox handler the way the hitbox controller does on pointer input
    Fire(obj: GameObject, handler: "OnPress" | "OnEnter" | "OnLeave"): void
    {
        (obj.tapHitbox as any)[handler]();
    }

    override OnStart(): void
    {
        const c = this.checks;
        const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

        // TextObject text
        const text = this.Text();
        const shortWidth = text.texture.width;
        text.SetText(LONG_TEXT);
        c.check(text.GetText() === LONG_TEXT, "SetText should change GetText");
        c.check(text.texture.width > shortWidth, "a longer text should make the texture wider: " + shortWidth + " -> " + text.texture.width);
        c.check(text.text === LONG_TEXT, "the text field should read the current text");
        text.text = "Hi";
        c.check(text.GetText() === "Hi" && near(text.texture.width, shortWidth), "the text field should set the text: " + text.texture.width);

        // pivots
        const centered = this.Text().CenterPivot() as TextObject;
        centered.SetText(LONG_TEXT);
        c.check(near(centered.pivotX, centered.texture.width / 2) && near(centered.pivotY, centered.texture.height / 2),
            "a centered pivot should stay centered when the text changes: " + centered.pivotX + " of " + centered.texture.width);

        const rightAligned = this.Text().SetPivot(1, 0) as TextObject;
        rightAligned.SetText(LONG_TEXT);
        c.check(near(rightAligned.pivotX, rightAligned.texture.width) && rightAligned.pivotY === 0,
            "a right pivot should stay on the right edge when the text changes: " + rightAligned.pivotX + " of " + rightAligned.texture.width);

        const pixelPivot = this.Text().SetPivot(5, 6) as TextObject;
        pixelPivot.SetText(LONG_TEXT);
        c.check(pixelPivot.pivotX === 5 && pixelPivot.pivotY === 6, "a pivot in pixels should be kept when the text changes: " + pixelPivot.pivotX + "," + pixelPivot.pivotY);

        const prefabPivot = this.AddGameObject<TextObject>("label");
        prefabPivot.SetText(LONG_TEXT);
        c.check(prefabPivot.pivotX === 5 && prefabPivot.pivotY === 6, "a prefab pivot in pixels should be kept when the text changes: " + prefabPivot.pivotX + "," + prefabPivot.pivotY);

        const directPivot = this.Text();
        directPivot.pivotX = 5;
        directPivot.SetText(LONG_TEXT);
        c.check(directPivot.pivotX === 5, "a pivotX set directly should be kept when the text changes: " + directPivot.pivotX);

        const defaultPivot = this.Text();
        defaultPivot.SetText(LONG_TEXT);
        c.check(defaultPivot.pivotX === 0 && defaultPivot.pivotY === 0, "the default pivot should stay at the top-left");

        // style fields
        const styled = this.Text().CenterPivot() as TextObject;
        const smallHeight = styled.texture.height;
        styled.fontSize = 44;
        c.check(styled.fontSize === 44 && styled.texture.height > smallHeight, "a bigger fontSize should make the texture taller: " + smallHeight + " -> " + styled.texture.height);
        c.check(near(styled.pivotX, styled.texture.width / 2), "a centered pivot should stay centered when the font size changes");

        styled.fill = "#ff0000";
        c.check(styled.fill.toHex() === "#ff0000ff", "fill should accept a hex string: " + styled.fill.toHex());
        styled.fill = Color.fromHex("#00ff00");
        c.check(styled.fill.toHex() === "#00ff00ff", "fill should accept a Color: " + styled.fill.toHex());
        styled.stroke = "#0000ff";
        styled.strokeThickness = 3;
        c.check(styled.stroke.toHex() === "#0000ffff" && styled.strokeThickness === 3, "stroke and strokeThickness should be set");
        styled.align = "right";
        c.check(styled.align === "right", "align should be set");

        // name shown in the editor
        const unnamed = new TextObject(this, { text: "short" });
        c.check(unnamed.pluginName === "short", "an unnamed TextObject should be shown by its text: " + unnamed.pluginName);
        unnamed.SetText("012345678901234567890123");
        c.check(unnamed.pluginName === "01234567890123456...", "a long text should be shortened for its shown name: " + unnamed.pluginName);
        const named = this.Text();
        named.name = "score";
        named.SetText("other");
        c.check(named.name === "score", "SetText should not rename a named TextObject");

        // the hitbox should cover the text after it grows
        const clickable = this.Text();
        clickable.OnPointerDown(() => {});
        clickable.SetText(LONG_TEXT);
        c.check(this.HitsNearRightEdge(clickable, clickable.texture.width), "a TextObject's hitbox should grow with its text");

        const customHitbox = this.Text();
        customHitbox.OnPointerDown(() => {});
        Object.assign(customHitbox.tapHitbox!.rectangle, { x: 0, y: 0, width: 10, height: 10 });
        customHitbox.SetText(LONG_TEXT);
        c.check(customHitbox.tapHitbox!.rectangle.width === 10, "a custom TextObject hitbox should not be resized with the text: " + customHitbox.tapHitbox!.rectangle.width);

        // Button
        const button = this.Button();
        const shortButtonWidth = button.width;
        c.check(near(button.width, button.textTexture.width + 20) && near(button.height, button.textTexture.lineBoxHeight + 20),
            "a button should be its text plus the margin on each side: " + button.width + "x" + button.height);
        // height comes from the font, not the glyphs, so a descender doesn't make a button taller
        const menuButton = this.Button("Menu");
        const retryButton = this.Button("Retry");
        c.check(near(menuButton.height, retryButton.height),
            "buttons with the same style should be the same height: " + menuButton.height + " vs " + retryButton.height);
        button.margin = 4;
        c.check(near(button.width, button.textTexture.width + 8), "changing the margin should resize the button");
        button.margin = 10;
        button.SetText(LONG_TEXT);
        c.check(button.GetText() === LONG_TEXT && button.width > shortButtonWidth, "a longer text should make the button wider: " + shortButtonWidth + " -> " + button.width);
        c.check(button.name === "Hi", "SetText should not change a button's name, it's used to look it up: " + button.name);
        c.check(near(button.tapHitbox!.rectangle.width, button.width) && near(button.tapHitbox!.rectangle.height, button.height),
            "a button's hitbox should be resized with it: " + button.tapHitbox!.rectangle.width + " vs " + button.width);
        c.check(this.HitsNearRightEdge(button, button.width), "a button should be clickable where it grew");

        const centeredButton = this.Button().CenterPivot() as Button;
        centeredButton.SetText(LONG_TEXT);
        c.check(near(centeredButton.pivotX, centeredButton.width / 2) && near(centeredButton.pivotY, centeredButton.height / 2),
            "a centered button should stay centered when the text changes: " + centeredButton.pivotX + " of " + centeredButton.width);
        centeredButton.fontSize = 40;
        c.check(near(centeredButton.pivotX, centeredButton.width / 2), "a centered button should stay centered when the font size changes");

        const pixelButton = this.Button().SetPivot(5, 6) as Button;
        pixelButton.SetText(LONG_TEXT);
        c.check(pixelButton.pivotX === 5 && pixelButton.pivotY === 6, "a button pivot in pixels should be kept when the text changes");

        pixelButton.textColor = "#ff0000";
        c.check(pixelButton.textColor.toHex() === "#ff0000ff", "textColor should accept a hex string: " + pixelButton.textColor.toHex());

        // handlers
        const pressedWith: GameObject[] = [];
        const handled = this.Button("Go", { OnPress: (go: GameObject) => pressedWith.push(go) });
        this.Fire(handled, "OnPress");
        c.check(pressedWith.length === 1 && pressedWith[0] === handled, "a button's OnPress should be called with the button");

        let interactivePresses = 0;
        const interactive = this.Button("Go").MakeInteractive(() => interactivePresses++);
        this.Fire(interactive, "OnPress");
        bare.tween.FinishAllFrom(interactive);
        c.check(interactivePresses === 1, "MakeInteractive should call onPress");
        c.check(near(interactive.scale.x, 0.95), "MakeInteractive should shrink the button on press: " + interactive.scale.x);
        this.Fire(interactive, "OnEnter");
        bare.tween.FinishAllFrom(interactive);
        c.check(near(interactive.scale.x, 1.1), "MakeInteractive should grow the button on hover: " + interactive.scale.x);
        this.Fire(interactive, "OnLeave");
        bare.tween.FinishAllFrom(interactive);
        c.check(near(interactive.scale.x, 1), "MakeInteractive should reset the scale on leave: " + interactive.scale.x);

        // minWidth: buttons with different texts can be the same width, a longer text still grows past it
        const narrow = this.AddGameObject(new Button(this, { text: "Go", fontSize: 22, minWidth: 200 })) as Button;
        const wide = this.AddGameObject(new Button(this, { text: "Go somewhere far", fontSize: 22, minWidth: 200 })) as Button;
        c.check(narrow.width === 200, "minWidth should make a short button that wide: " + narrow.width);
        c.check(near(narrow.tapHitbox!.rectangle.width, 200), "a minWidth button should be clickable over its full width: " + narrow.tapHitbox!.rectangle.width);
        c.check(wide.width === Math.max(200, wide.textTexture.width + 20), "a text longer than minWidth should still grow the button: " + wide.width);
        narrow.minWidth = 0;
        c.check(near(narrow.width, narrow.textTexture.width + 20), "setting minWidth to 0 should shrink the button to its text: " + narrow.width);

        // a removed text object that doesn't go back to a pool frees its text texture, adding it again restores it
        const released = this.Text("Bye");
        const releasedTexture = released.textTexture;
        released.Remove();
        c.check(releasedTexture.released && !releasedTexture.glTexture, "a removed TextObject should free its text texture");
        this.AddGameObject(released);
        c.check(!released.textTexture.released && released.texture === released.textTexture && released.width > 0,
            "a TextObject added again should get its text texture back: " + released.width);

        const releasedButton = this.Button("Bye");
        releasedButton.Remove();
        c.check(releasedButton.textTexture.released, "a removed Button should free its text texture");
        this.AddGameObject(releasedButton);
        c.check(!releasedButton.textTexture.released && releasedButton.textTexture.width > 0, "a Button added again should get its text texture back");

        // pooled text objects keep their texture, the pool reuses them
        const pooled = this.AddGameObject(TextObject);
        const pooledTexture = pooled.textTexture;
        pooled.Remove();
        c.check(!pooledTexture.released, "a pooled TextObject should keep its text texture for its next use");

        // buttons use the same default font as text objects
        const previousFont = bare.defaultFont;
        bare.defaultFont = "";
        c.check(new Button(this, "Arial?").textTexture.style.fontFamily === "Arial", "a Button should fall back to Arial without bare.defaultFont");
        bare.defaultFont = "Georgia";
        c.check(new Button(this, "Georgia?").textTexture.style.fontFamily === "Georgia", "a Button should use bare.defaultFont");
        bare.defaultFont = previousFont;

        c.flush();
    }
}
