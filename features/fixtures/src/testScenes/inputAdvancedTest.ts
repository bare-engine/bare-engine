import { BareEvent, GameObject, Scene, Vec2 } from "bare-engine";
import { Checks } from "./checks";

// covers docs/reference/input: pointer events from real DOM events, hitbox rules, mouse state, per-frame keys

// a UI scene on top, for presses that land on its hitboxes
class InputOverlay extends Scene
{
    constructor()
    {
        super({
            UI: true,
            basePrefabs: [{ name: "ANY", texture: "PIXEL" }],
            prefabs: [{ name: "square", scale: { x: 100, y: 100 } }],
        });
    }
}

export class InputAdvancedTest extends Scene
{
    checks = new Checks();
    running = false;
    done = false;

    // per-frame key probe, read from OnUpdate like a game would
    probeKey: string | null = null;
    pressedFrames = 0;
    releasedFrames = 0;
    probeMouse = false;
    mouseReleasedFrames = 0;
    mousePressedFrames = 0;
    // every non-zero wheel delta OnUpdate saw, as [x, y]
    wheelSeen: number[][] = [];

    constructor()
    {
        super({
            basePrefabs: [{ name: "ANY", texture: "PIXEL" }],
            prefabs: [{ name: "square", scale: { x: 100, y: 100 } }],
            layers: ["back", "front"],
        });
    }

    step = "";
    startTime = 0;

    override OnUpdate(): void
    {
        if (this.running && !this.done && performance.now() - this.startTime > 4000 && this.step != "stuck")
        {
            this.checks.check(false, "stuck after: " + this.step);
            this.step = "stuck";
            this.checks.flush();
        }
        if (this.probeKey)
        {
            if (bare.keyboard.IsKeyPressed(this.probeKey)) this.pressedFrames++;
            if (bare.keyboard.IsKeyReleased(this.probeKey)) this.releasedFrames++;
        }
        if (this.probeMouse && bare.mouse.IsReleased())
            this.mouseReleasedFrames++;
        if (bare.mouse.wheelDelta !== 0 || bare.mouse.wheelDeltaX !== 0)
            this.wheelSeen.push([bare.mouse.wheelDeltaX, bare.mouse.wheelDelta]);
        if (this.probeMouse && bare.mouse.IsPressed())
            this.mousePressedFrames++;

        if (!this.running)
        {
            this.running = true;
            this.startTime = performance.now();
            void this.RunChecks()
                .catch((error) => this.checks.check(false, "RunChecks threw: " + (error?.stack ?? error)))
                .finally(() => this.done = true);
        }

        if (this.done)
        {
            this.done = false;
            this.checks.flush();
        }
    }

    // sends a real DOM pointer event at a world position, the way a browser would
    Pointer(type: "pointermove" | "pointerdown" | "pointerup", x: number, y: number): void
    {
        const screen = bare.camera.WorldToScreen(x, y);
        const rect = rapid.canvas.getBoundingClientRect();
        const probe = bare.GetCanvasScreenPosition(rect.left + 100, rect.top + 100);
        const cssPerUnitX = 100 / probe.x;
        const cssPerUnitY = 100 / probe.y;

        document.dispatchEvent(new PointerEvent(type, {
            clientX: rect.left + screen.x * cssPerUnitX,
            clientY: rect.top + screen.y * cssPerUnitY,
            pointerType: "mouse",
            pointerId: 1,
            isPrimary: true,
            button: 0,
            buttons: type === "pointerup" ? 0 : 1,
            bubbles: true,
            cancelable: true,
        }));
    }

    async MoveTo(x: number, y: number): Promise<void>
    {
        this.step = "move " + x + "," + y + " frame " + bare.count;
        this.Pointer("pointermove", x, y);
        // hover is resolved in the hitbox controller's update
        await waitFrame(2);
    }

    async Click(x: number, y: number): Promise<void>
    {
        await this.MoveTo(x, y);
        this.Pointer("pointerdown", x, y);
        this.Pointer("pointerup", x, y);
        await waitFrame();
    }

    Square(x: number, y: number, layer = "back"): GameObject
    {
        return this.AddGameObject("square", layer).SetPosition(x, y);
    }

    async RunChecks()
    {
        const c = this.checks;
        const log: string[] = [];
        const track = (obj: GameObject, name: string) =>
        {
            obj.OnPointerDown(() => log.push(name + ":down"));
            obj.OnPointerUp(() => log.push(name + ":up"));
            obj.OnPointerEnter(() => log.push(name + ":enter"));
            obj.OnPointerLeave(() => log.push(name + ":leave"));
        };
        const take = () => log.splice(0).join(",");
        const expectLog = (expected: string, message: string) =>
        {
            const got = take();
            c.check(got === expected, message + ": " + got);
        };

        bare.camera.SetPosition(bare.width / 2, bare.height / 2);
        await this.MoveTo(-5000, -5000);

        // enter, down, up and leave on a single object
        const a = this.Square(100, 100);
        track(a, "a");
        await this.MoveTo(150, 150);
        expectLog("a:enter", "moving over an object should call OnPointerEnter: ");
        c.check(bare.hitbox.GetCurrentHover()?.parent === a, "GetCurrentHover should be the hovered object's hitbox");
        this.Pointer("pointerdown", 150, 150);
        expectLog("a:down", "pressing on it should call OnPointerDown");
        c.check(bare.hitbox.GetCurrentDown()?.parent === a, "GetCurrentDown should be the pressed object's hitbox");
        this.Pointer("pointerup", 150, 150);
        expectLog("a:up", "releasing on it should call OnPointerUp");
        c.check(bare.hitbox.GetCurrentDown() == null, "GetCurrentDown should clear after release");
        await this.MoveTo(500, 500);
        expectLog("a:leave", "moving off should call OnPointerLeave");

        // releasing somewhere else doesn't count as a release on the object
        await this.MoveTo(150, 150);
        this.Pointer("pointerdown", 150, 150);
        await this.MoveTo(500, 500);
        this.Pointer("pointerup", 500, 500);
        c.check(!log.includes("a:up"), "releasing away from the object should not call OnPointerUp: " + log.join(","));
        take();

        // a higher layer is hit first, SetExclusiveLayer limits input to some layers
        const b = this.Square(150, 150, "front");
        track(b, "b");
        await this.Click(180, 180);
        c.check(log.includes("b:down") && !log.includes("a:down"), "the object on the higher layer should take the press: " + log.join(","));
        take();
        bare.hitbox.SetExclusiveLayer(bare.object.GetLayers().indexOf(bare.object.GetLayerByName("back")));
        await this.Click(185, 185);
        c.check(log.includes("a:down") && !log.includes("b:down"), "SetExclusiveLayer should only accept input on that layer: " + log.join(","));
        bare.hitbox.ClearExclusiveLayers();
        take();
        await this.MoveTo(-5000, -5000);
        a.Remove();
        b.Remove();
        take();

        // within a layer, the object drawn last is on top
        const under = this.Square(300, 100);
        const over = this.Square(320, 120);
        track(under, "under");
        track(over, "over");
        await this.Click(350, 150);
        c.check(log.includes("over:down") && !log.includes("under:down"), "the object drawn last should take the press: " + log.join(","));
        take();
        under.BringToFront();
        await this.MoveTo(-5000, -5000);
        take();
        await this.Click(355, 155);
        c.check(log.includes("under:down") && !log.includes("over:down"), "BringToFront should also put it on top for input: " + log.join(","));
        take();
        under.Remove();
        over.Remove();
        await this.MoveTo(-5000, -5000);
        take();

        // hover follows the hierarchy: entering a child keeps its parent hovered
        const parent = this.Square(500, 100);
        const child = parent.AddChild("square").SetPosition(0.5, 0.5);
        child.SetScale(0.2);
        track(parent, "parent");
        track(child, "child");
        await this.MoveTo(510, 110);
        expectLog("parent:enter", "hovering the parent should enter only the parent: ");
        await this.MoveTo(560, 160);
        expectLog("child:enter", "moving onto the child should enter the child and keep the parent: ");
        await this.MoveTo(520, 120);
        expectLog("child:leave", "moving back to the parent should only leave the child: ");
        await this.MoveTo(-5000, -5000);
        expectLog("parent:leave", "moving away should leave the parent: ");
        parent.Remove();

        // invisible objects and objects without callbacks don't take input
        const hidden = this.Square(700, 100);
        track(hidden, "hidden");
        hidden.visible = false;
        await this.Click(750, 150);
        expectLog("", "an invisible object should not take input: ");
        hidden.visible = true;
        hidden.OffPointers();
        await this.Click(755, 155);
        expectLog("", "OffPointers should remove every callback: ");
        hidden.Remove();
        await this.MoveTo(-5000, -5000);

        // a circle hitbox is centered on the pivot, so with a centered pivot it ignores the corners of the square
        const round = this.Square(150, 350).CenterPivot();
        track(round, "round");
        bare.hitbox.SetCircleHitbox(round);
        await this.Click(105, 305);
        c.check(!log.includes("round:down"), "a corner outside the circle should not hit: " + log.join(","));
        await this.MoveTo(-5000, -5000);
        take();
        await this.Click(150, 350);
        c.check(log.includes("round:down"), "the circle's center should hit: " + log.join(","));
        round.Remove();
        await this.MoveTo(-5000, -5000);
        take();

        // AssignButton with separate handlers and the hand cursor
        const button = this.Square(300, 300);
        let pressed = 0;
        let released = 0;
        bare.hitbox.AssignButton(button, { OnPress: () => pressed++, OnRelease: () => released++ });
        await this.MoveTo(350, 350);
        c.check(rapid.canvas.style.cursor === "pointer", "a button should show the hand cursor on hover: " + rapid.canvas.style.cursor);
        this.Pointer("pointerdown", 350, 350);
        this.Pointer("pointerup", 350, 350);
        c.check(pressed === 1 && released === 1, "AssignButton should call OnPress and OnRelease: " + pressed + "/" + released);
        await this.MoveTo(-5000, -5000);
        c.check(rapid.canvas.style.cursor !== "pointer", "the cursor should reset after leaving the button");

        // a paused game ignores pointer input. no frames run while paused, so nothing here may wait for one
        await this.MoveTo(350, 350);
        bare.TogglePause();
        this.Pointer("pointerdown", 350, 350);
        this.Pointer("pointerup", 350, 350);
        bare.TogglePause();
        c.check(pressed === 1, "pointer presses should be ignored while paused: " + pressed);
        button.Remove();

        // bare.mouse follows the camera, and remembers where the pointer went down
        bare.camera.SetPosition(bare.width / 2 + 200, bare.height / 2 + 100);
        const center = bare.camera.WorldToScreen(bare.width / 2 + 200, bare.height / 2 + 100);
        c.check(Math.abs(center.x - bare.width / 2) < 1 && Math.abs(center.y - bare.height / 2) < 1, "WorldToScreen should follow SetPosition right away: " + JSON.stringify(center));
        let pointerDownPayload: any = null;
        bare.events.once(BareEvent.pointer_down, (payload) => pointerDownPayload = payload);
        await this.MoveTo(1000, 800);
        const world = bare.mouse.world.position;
        c.check(Math.abs(world.x - 1000) < 1 && Math.abs(world.y - 800) < 1, "mouse.world.position should follow the camera: " + JSON.stringify(world));
        const expectedScreen = bare.camera.WorldToScreen(1000, 800);
        const screen = bare.mouse.screen.position;
        c.check(Math.abs(screen.x - expectedScreen.x) < 1 && Math.abs(screen.y - expectedScreen.y) < 1, "mouse.screen.position should be in screen space: " + JSON.stringify(screen) + " expected " + JSON.stringify(expectedScreen));
        this.Pointer("pointerdown", 1000, 800);
        c.check(bare.mouse.IsDown(), "IsDown should be true while pressed");
        c.check(pointerDownPayload && Math.abs(pointerDownPayload.mouseX - expectedScreen.x) < 1, "pointer_down should carry the screen position: " + JSON.stringify(pointerDownPayload && { x: pointerDownPayload.mouseX }));
        await this.MoveTo(1100, 850);
        const onDown = bare.mouse.world.positionOnDown;
        c.check(Math.abs(onDown.x - 1000) < 1 && Math.abs(onDown.y - 800) < 1, "world.positionOnDown should keep where the pointer went down: " + JSON.stringify(onDown));
        this.probeMouse = true;
        this.Pointer("pointerup", 1100, 850);
        c.check(!bare.mouse.IsDown(), "IsDown should be false after release");
        await waitFrame(3);
        c.check(this.mouseReleasedFrames === 1, "IsReleased should be seen in exactly one update: " + this.mouseReleasedFrames);

        // a quick tap, down and up between two frames, is still pressed and released for one frame
        this.mousePressedFrames = 0;
        this.mouseReleasedFrames = 0;
        this.Pointer("pointerdown", 1100, 850);
        this.Pointer("pointerup", 1100, 850);
        await waitFrame(3);
        c.check(this.mousePressedFrames === 1 && this.mouseReleasedFrames === 1, "a tap should be pressed and released in exactly one update: " + this.mousePressedFrames + "/" + this.mouseReleasedFrames);
        c.check(!bare.mouse.IsDown() && !bare.mouse.IsPressed() && !bare.mouse.IsReleased(), "after a tap nothing should be down, pressed or released");
        this.probeMouse = false;

        // the world position stays under the pointer when only the camera moves
        bare.camera.AddPosition(40, 30);
        await waitFrame(2);
        const moved = bare.mouse.world.position;
        c.check(Math.abs(moved.x - 1140) < 1 && Math.abs(moved.y - 880) < 1, "mouse.world.position should follow a moving camera: " + JSON.stringify(moved));
        c.check(!bare.mouse.IsMoving(), "a moving camera shouldn't count as pointer movement");
        bare.camera.SetPosition(bare.width / 2, bare.height / 2);

        // keys: pressed and released are true for exactly one frame, key_pressed ignores key repeat
        let keyPressedEvents = 0;
        let keyDownEvents = 0;
        bare.events.on(BareEvent.key_pressed, ({ key }) => { if (key === "k") keyPressedEvents++; });
        bare.events.on(BareEvent.key_down, ({ key }) => { if (key === "k") keyDownEvents++; });
        this.probeKey = "k";
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", code: "KeyK" }));
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", code: "KeyK", repeat: true }));
        await waitFrame(3);
        c.check(this.pressedFrames === 1, "IsKeyPressed should be seen in exactly one update: " + this.pressedFrames);
        c.check(keyPressedEvents === 1 && keyDownEvents === 2, "key_pressed should fire once, key_down for every repeat: " + keyPressedEvents + "/" + keyDownEvents);
        c.check(bare.keyboard.IsKeyDown("k") && !bare.keyboard.IsKeyPressed("k"), "a held key should be down but no longer pressed");
        document.dispatchEvent(new KeyboardEvent("keyup", { key: "k", code: "KeyK" }));
        await waitFrame(3);
        c.check(this.releasedFrames === 1, "IsKeyReleased should be seen in exactly one update: " + this.releasedFrames);

        // a quick tap, down and up between two frames, is still pressed and released for one frame
        this.pressedFrames = 0;
        this.releasedFrames = 0;
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", code: "KeyK" }));
        document.dispatchEvent(new KeyboardEvent("keyup", { key: "k", code: "KeyK" }));
        c.check(bare.keyboard.IsKeyPressed("k") && bare.keyboard.IsKeyReleased("k") && !bare.keyboard.IsKeyDown("k"), "a tap should be pressed and released, but not down");
        await waitFrame(3);
        c.check(this.pressedFrames === 1 && this.releasedFrames === 1, "a tap should be pressed and released in exactly one update: " + this.pressedFrames + "/" + this.releasedFrames);
        this.probeKey = null;

        // keyup releases the key keydown added, even if event.key changed (shift released first)
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "!", code: "Digit1", shiftKey: true }));
        document.dispatchEvent(new KeyboardEvent("keyup", { key: "1", code: "Digit1" }));
        c.check(!bare.keyboard.IsKeyDown("!"), "keyup should release the key by its code: " + bare.keyboard.GetKeysDown().join(","));
        document.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space" }));
        c.check(bare.keyboard.IsKeyDown("space"), "the space bar should be called 'space'");
        document.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space" }));
        bare.keyboard.ClearAll();

        // alt_ debug keys need Alt, matched by letter or (Mac Option characters) by key position, and the game doesn't see them
        let debugHits = 0;
        bare.SetDebugKey("alt_j", () => debugHits++);
        const press = (init: KeyboardEventInit) =>
        {
            document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyJ", bubbles: true, ...init }));
            document.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyJ", bubbles: true, ...init }));
        };
        press({ key: "j" });
        c.check(debugHits === 0, "a debug key without Alt should be a normal key: " + debugHits);
        press({ key: "j", altKey: true });
        c.check(debugHits === 1, "Alt+J should run the debug key: " + debugHits);
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "j", code: "KeyJ", altKey: true, bubbles: true }));
        c.check(!bare.keyboard.IsKeyDown("j"), "the game shouldn't see a debug key press");
        document.dispatchEvent(new KeyboardEvent("keyup", { key: "j", code: "KeyJ", altKey: true, bubbles: true }));
        press({ key: "∆", altKey: true });
        c.check(debugHits === 3, "Option+J on a Mac types another character, but should still run the debug key: " + debugHits);
        press({ key: "j", altKey: true, ctrlKey: true });
        c.check(debugHits === 3, "Ctrl+Alt (AltGr) shouldn't run a debug key: " + debugHits);
        bare.SetDebugKey("alt_j", null);
        press({ key: "j", altKey: true });
        c.check(debugHits === 3, "a removed debug key shouldn't run: " + debugHits);

        // a debug key without alt_ fires on its own, not with Alt or Ctrl
        let plainHits = 0;
        bare.SetDebugKey("j", () => plainHits++);
        press({ key: "j" });
        press({ key: "j", altKey: true });
        press({ key: "j", ctrlKey: true });
        c.check(plainHits === 1, "a plain debug key should only fire on its own: " + plainHits);
        bare.SetDebugKey("j", null);
        bare.keyboard.ClearAll();

        // the wheel: what scrolled since the last frame, seen in one frame, lines turned into pixels
        this.wheelSeen.length = 0;
        document.dispatchEvent(new WheelEvent("wheel", { deltaY: 120 }));
        document.dispatchEvent(new WheelEvent("wheel", { deltaX: -1, deltaY: 3, deltaMode: WheelEvent.DOM_DELTA_LINE }));
        await waitFrame(3);
        c.check(JSON.stringify(this.wheelSeen) === "[[-16,168]]", "the wheel should add up to one frame's delta, in pixels: " + JSON.stringify(this.wheelSeen));

        // a press on a hitbox in a scene above belongs to that scene: here the mouse isn't down, pressed or released
        const overlay = await bare.scene.Add(InputOverlay);
        const buttonAt = bare.camera.WorldToScreen(700, 300);
        let overlayPresses = 0;
        overlay.AddGameObject("square").SetTexture(bare.asset.whiteTexture).SetScale(100).SetPosition(buttonAt.x - 50, buttonAt.y - 50).OnPointerDown(() => overlayPresses++);
        this.probeMouse = true;
        this.mousePressedFrames = 0;
        this.mouseReleasedFrames = 0;
        await this.MoveTo(700, 300);
        this.Pointer("pointerdown", 700, 300);
        await waitFrame(2);
        c.check(overlayPresses === 1, "the button in the UI scene should get the press: " + overlayPresses);
        c.check(overlay.mouse.IsDown(), "the UI scene's own mouse should be down");
        c.check(this.mousePressedFrames === 0 && !bare.mouse.IsDown(), "a press on a button in a UI scene above shouldn't press the mouse here: " + this.mousePressedFrames);
        this.Pointer("pointerup", 700, 300);
        await waitFrame(2);
        c.check(this.mouseReleasedFrames === 0, "nor release it: " + this.mouseReleasedFrames);

        // next to the button, the press is this scene's again
        await this.Click(900, 300);
        await waitFrame(2);
        c.check(this.mousePressedFrames === 1 && this.mouseReleasedFrames === 1, "a press next to the button should count here: " + this.mousePressedFrames + "/" + this.mouseReleasedFrames);
        this.probeMouse = false;
        bare.scene.Remove(overlay);
    }
}
