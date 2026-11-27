import { BareEvent, Scene } from "bare-engine";
import { Checks } from "./checks";

// covers canvasOnlyInput: the engine only takes input from the canvas, html ui on the page keeps its own

export class CanvasOnlyInputTest extends Scene
{
    checks = new Checks();
    running = false;
    done = false;

    override OnUpdate(): void
    {
        if (!this.running)
        {
            this.running = true;
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

    async RunChecks()
    {
        const c = this.checks;
        const canvas = rapid.canvas;
        const rect = canvas.getBoundingClientRect();
        const x = rect.left + 10;
        const y = rect.top + 10;

        // html ui next to the canvas
        const panel = document.createElement("div");
        const input = document.createElement("input");
        const button = document.createElement("button");
        panel.append(input, button);
        document.body.appendChild(panel);

        let downs = 0, ups = 0, moves = 0, wheels = 0, doubleClicks = 0, keys = 0;
        bare.events.on(BareEvent.pointer_down, () => downs++);
        bare.events.on(BareEvent.pointer_up, () => ups++);
        bare.events.on(BareEvent.pointer_move, () => moves++);
        bare.events.on(BareEvent.pointer_wheel, () => wheels++);
        bare.events.on(BareEvent.pointer_doubleClick, () => doubleClicks++);
        bare.events.on(BareEvent.key_pressed, ({ key }) => { if (key === "j") keys++; });

        // returns whether the event's default was prevented
        const pointer = (target: EventTarget, type: string, pointerId = 1) => !target.dispatchEvent(new PointerEvent(type, {
            clientX: x, clientY: y, pointerType: "mouse", pointerId, isPrimary: true, button: 0,
            buttons: type === "pointerup" ? 0 : 1, bubbles: true, cancelable: true,
        }));
        const wheel = (target: EventTarget) => !target.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true }));
        const plain = (target: EventTarget, type: string) => !target.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
        const key = (target: EventTarget, type = "keydown") => !target.dispatchEvent(new KeyboardEvent(type, { key: "j", code: "KeyJ", bubbles: true, cancelable: true }));
        const reset = () => { downs = ups = moves = wheels = doubleClicks = keys = 0; };

        try
        {
            // off (the default): the whole page is the game's
            c.check(bare.canvasOnlyInput === false, "canvasOnlyInput should default to false");
            pointer(panel, "pointerdown");
            pointer(panel, "pointerup");
            c.check(downs === 1 && ups === 1, "without canvasOnlyInput, presses on the page should reach the game: " + downs + "/" + ups);
            c.check(wheel(panel), "without canvasOnlyInput, the wheel on the page should be prevented");
            c.check(plain(panel, "touchstart"), "without canvasOnlyInput, touches on the page should be prevented");
            c.check(key(input), "without canvasOnlyInput, keys in a text box should be prevented");
            key(input, "keyup");
            reset();

            bare.canvasOnlyInput = true;

            // presses only on the canvas
            pointer(panel, "pointerdown");
            pointer(panel, "pointermove");
            pointer(panel, "pointerup");
            c.check(downs === 0 && moves === 0 && ups === 0, "presses and moves on the page should not reach the game: " + downs + "/" + moves + "/" + ups);
            pointer(canvas, "pointerdown");
            c.check(downs === 1, "a press on the canvas should reach the game: " + downs);

            // a drag that leaves the canvas keeps its moves and release, then moves on the page stop again
            pointer(panel, "pointermove");
            c.check(moves === 1, "moves on the page during a drag from the canvas should reach the game: " + moves);
            pointer(panel, "pointerup");
            c.check(ups === 1, "releasing on the page after a drag from the canvas should reach the game: " + ups);
            pointer(panel, "pointermove");
            c.check(moves === 1, "after the release, moves on the page should not reach the game: " + moves);

            // leaving the canvas counts as a last move, so hover clears
            pointer(canvas, "pointerleave");
            c.check(moves === 2, "leaving the canvas should send a move: " + moves);

            plain(panel, "dblclick");
            c.check(doubleClicks === 0, "double clicks on the page should not reach the game: " + doubleClicks);

            // the page keeps its scrolling, touches and right-click menu
            c.check(!wheel(panel) && wheels === 0, "the wheel on the page should scroll the page and not reach the game: " + wheels);
            c.check(wheel(canvas) && wheels === 1, "the wheel on the canvas should be prevented and reach the game: " + wheels);
            c.check(!plain(panel, "touchstart") && !plain(panel, "touchmove"), "touches on the page should not be prevented");
            c.check(plain(canvas, "touchstart"), "touches on the canvas should still be prevented");
            c.check(!plain(panel, "contextmenu"), "the right-click menu on the page should not be prevented");
            c.check(plain(canvas, "contextmenu"), "the right-click menu on the canvas should still be prevented");

            // keys: text fields keep theirs, other elements pass them on without losing their own behavior
            c.check(!key(input) && keys === 0, "keys in a text box should not be prevented or reach the game: " + keys);
            key(input, "keyup");
            c.check(!key(button) && keys === 1, "keys on a button should reach the game without being prevented: " + keys);
            key(button, "keyup");
            c.check(key(canvas) && keys === 2, "keys on the canvas should be prevented and reach the game: " + keys);
            key(canvas, "keyup");

            // tabbing back in doesn't take focus from the text box
            input.focus();
            window.dispatchEvent(new FocusEvent("focus"));
            c.check(document.activeElement === input, "window focus should not take focus away from a text box");
        }
        finally
        {
            bare.canvasOnlyInput = false;
            panel.remove();
            canvas.focus();
        }
    }
}
