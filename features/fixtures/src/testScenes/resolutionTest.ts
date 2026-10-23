import { BareEvent, CanvasScale, Scene } from "bare-engine";
import { Checks } from "./checks";

let resizedWhileFirstSceneStarts: boolean | undefined;
let turning = false;

// lying down or standing up, the way the window is, as in guide/resolution.md's Portrait and landscape
function turningResolution()
{
    const view = bare.GetViewportSize();
    return view.width >= view.height
        ? { width: 400, height: 200, scale: CanvasScale.Expand }
        : { width: 200, height: 400, scale: CanvasScale.Expand };
}

// the fixture's OnInit, like a game that swaps its resolution when the screen turns. Only on while ResolutionTest turns
export function listenForTurns(): void
{
    window.addEventListener("resize", () => { if (turning) bare.SetResolution(turningResolution()); });
}

// run by the fixture's first scene from its OnStart, so inside StartBare before the first Goto returns: turning the
// screen then must still resize the canvas. Halves the window by stubbing the viewport, then puts it back
export function resizeWhileFirstSceneStarts(): void
{
    const view = bare.GetViewportSize();
    const cssWidth = rapid.canvas.style.width;
    bare.GetViewportSize = () => ({ width: view.width / 2, height: view.height / 2 });
    window.dispatchEvent(new Event("resize"));
    resizedWhileFirstSceneStarts = rapid.canvas.style.width != cssWidth;
    delete (bare as any).GetViewportSize;
    window.dispatchEvent(new Event("resize"));
}

// resizes twice during an async OnStart, and records each OnResize with whether the scene had started
class ResizedWhileStarting extends Scene
{
    sizeBefore: number[] = [];
    resizes: { started: boolean, sizes: number[] }[] = [];

    override async OnStart(): Promise<void>
    {
        this.sizeBefore = [bare.width, bare.height];
        bare.SetResolution({ width: 234, height: 56 });
        await this.WaitRealTime(0.01);
        bare.SetResolution({ width: 345, height: 67 });
    }

    override OnResize(prevWidth: number, prevHeight: number, newWidth: number, newHeight: number): void
    {
        this.resizes.push({ started: this.started, sizes: [prevWidth, prevHeight, newWidth, newHeight] });
    }
}

// covers CanvasScale.Expand: the canvas covers the window, the game is at least the given size at Fit's scale and
// grows on the side the window has room on, a left out height only keeps the width, integerScale scales by whole
// numbers, scenes get OnResize with the new size, and a press at the window's corner lands on the game's corner.
// also covers when OnResize runs: once per new size, only on started scenes, which catch up after an async OnStart,
// the window's resize listener works while the first scene is still starting, and runs after a game's own from OnInit
export class ResolutionTest extends Scene
{
    checks = new Checks();
    running = false;
    resizeCount = 0;
    lastResize: number[] = [];

    override OnResize(prevWidth: number, prevHeight: number, newWidth: number, newHeight: number): void
    {
        this.resizeCount++;
        this.lastResize = [newWidth, newHeight];
    }

    // scenes only get OnResize once started, so the checks run from the first update
    override OnUpdate(): void
    {
        if (this.running) return;
        this.running = true;
        void this.RunChecks().then(() => this.checks.flush());
    }

    private async RunChecks(): Promise<void>
    {
        const c = this.checks;
        const previous = bare.resolution;
        const view = bare.GetViewportSize();
        const canvas = rapid.canvas;
        const near = (a: number, b: number, tolerance = 0.01) => Math.abs(a - b) < tolerance;
        const fillsWindow = () => near(parseFloat(canvas.style.width), view.width) && near(parseFloat(canvas.style.height), view.height)
            && near(parseFloat(canvas.style.left), 0) && near(parseFloat(canvas.style.top), 0);
        const size = () => `${bare.width}×${bare.height} in a ${view.width}×${view.height} window`;

        // one design wider than any window, one taller, so both sides get to grow
        for (const [width, height] of [[400, 50], [50, 400]])
        {
            bare.SetResolution({ width, height, scale: CanvasScale.Expand });
            const scale = Math.min(view.width / width, view.height / height);
            c.check(fillsWindow(), `Expand ${width}×${height}: the canvas should cover the window, got ${canvas.style.width} × ${canvas.style.height} at ${canvas.style.left}, ${canvas.style.top}`);
            c.check(near(bare.resolutionScale, scale), `Expand ${width}×${height}: the scale should be Fit's ${scale}, got ${bare.resolutionScale}`);
            c.check(bare.width >= width - 0.01 && bare.height >= height - 0.01, `Expand ${width}×${height}: the game should be at least that size, got ${size()}`);
            c.check(near(bare.width, width) || near(bare.height, height), `Expand ${width}×${height}: one side should be the given size, got ${size()}`);
            c.check(near(bare.width / bare.height, view.width / view.height), `Expand ${width}×${height}: the game should have the window's shape, got ${size()}`);
            c.check(near(this.lastResize[0], bare.width) && near(this.lastResize[1], bare.height), `Expand ${width}×${height}: OnResize should get the new size, got ${this.lastResize}`);
            const corner = bare.GetCanvasScreenPosition(view.width, view.height);
            c.check(near(corner.x, bare.width, 0.5) && near(corner.y, bare.height, 0.5), `Expand ${width}×${height}: the window's bottom right should be the game's, got ${corner.x}, ${corner.y} for ${size()}`);
        }

        // without a height, only the width is kept and the height follows the window
        bare.SetResolution({ width: 300, scale: CanvasScale.Expand });
        c.check(fillsWindow(), "Expand with only a width: the canvas should cover the window");
        c.check(near(bare.width, 300) && near(bare.height, view.height * 300 / view.width), `Expand with only a width: the game should be 300 wide with the window's shape, got ${size()}`);

        // a scale of 2.5 is rounded down to 2, and the game grows to fill the window at that scale
        bare.SetResolution({ width: view.width / 2.5, height: view.height / 2.5, scale: CanvasScale.Expand, integerScale: true });
        c.check(bare.resolutionScale === 2, `Expand with integerScale: the scale should be 2, got ${bare.resolutionScale}`);
        c.check(fillsWindow() && near(bare.width, view.width / 2) && near(bare.height, view.height / 2), `Expand with integerScale: the game should be half the window, got ${size()}`);

        // turning the screen runs bare.SetResolution and then the window's resize listener, both at the new size: one resize
        let gameResizes = 0;
        this.events.on(BareEvent.game_resize, () => gameResizes++);
        const resizes = this.resizeCount;
        bare.SetResolution({ width: 123, height: 45 });
        bare.SetResolution({ width: 123, height: 45 });
        window.dispatchEvent(new Event("resize"));
        c.check(this.resizeCount - resizes === 1, `Resizing to the same size again should not call OnResize again, got ${this.resizeCount - resizes} calls`);
        c.check(gameResizes === 1, `Resizing to the same size again should not send game_resize again, got ${gameResizes}`);

        // a scene that is resized while its async OnStart runs gets one OnResize, once started, from the size it started at
        const starting = await bare.scene.Add(ResizedWhileStarting);
        const expected = [...starting.sizeBefore, 345, 67];
        c.check(starting.resizes.length === 1, `A scene resized during its async OnStart should get one OnResize, got ${starting.resizes.length}`);
        c.check(starting.resizes.every(resize => resize.started), "A scene should only get OnResize once started");
        c.check(starting.resizes[0]?.sizes.join() === expected.join(), `The catch up OnResize should go from the size before OnStart to the new one, expected ${expected}, got ${starting.resizes[0]?.sizes}`);
        bare.scene.Remove(starting);

        c.check(resizedWhileFirstSceneStarts === true, `A window resize while the first scene starts should resize the canvas, got ${resizedWhileFirstSceneStarts}`);

        // the game's listener from OnInit runs before the engine's, so the screen turning goes straight to the new
        // resolution's size, and the engine's own listener then finds nothing to do
        bare.GetViewportSize = () => ({ width: 800, height: 400 });
        bare.SetResolution(turningResolution());
        const beforeTurn = this.resizeCount;
        turning = true;
        bare.GetViewportSize = () => ({ width: 400, height: 800 });
        window.dispatchEvent(new Event("resize"));
        turning = false;
        delete (bare as any).GetViewportSize;
        c.check(this.resizeCount - beforeTurn === 1 && this.lastResize.join() === "200,400", `Turning the screen with a resize listener from OnInit should resize once, to 200×400, got ${this.resizeCount - beforeTurn} calls, last to ${this.lastResize}`);

        bare.SetResolution(previous);
    }
}
