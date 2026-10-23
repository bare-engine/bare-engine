import { CanvasScale, Scene } from "bare-engine";
import { Checks } from "./checks";

// covers CanvasScale.Expand: the canvas covers the window, the game is at least the given size at Fit's scale and
// grows on the side the window has room on, a left out height only keeps the width, integerScale scales by whole
// numbers, scenes get OnResize with the new size, and a press at the window's corner lands on the game's corner
export class ResolutionTest extends Scene
{
    checks = new Checks();
    lastResize: number[] = [];

    override OnResize(prevWidth: number, prevHeight: number, newWidth: number, newHeight: number): void
    {
        this.lastResize = [newWidth, newHeight];
    }

    override OnStart(): void
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

        bare.SetResolution(previous);
        this.checks.flush();
    }
}
