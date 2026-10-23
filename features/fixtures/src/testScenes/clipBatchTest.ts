import { Color, GameObject, RenderTexture, Scene } from "bare-engine";
import { Checks } from "./checks";

// covers clipChildren drawn by the sprite shader: clipping objects with image children batch like plain sprites,
// more clips than one batch holds still clip each one, shapes inside a clip are clipped through the stencil buffer
// without leaving it behind, and a clip works while drawing into a render texture

// a shape, which the sprite shader can't clip
class BlueBox extends GameObject
{
    override OnRender(): void
    {
        rapid.drawRect({ width: 40, height: 40, color: Color.Blue });
    }
}

// the draw calls of the objects between a start probe and an end probe
class DrawCallProbe extends GameObject
{
    static start = 0;
    end = false;
    calls = -1;

    override OnRender(): void
    {
        rapid.flush();
        if (this.end)
            this.calls = rapid.drawcallCount - DrawCallProbe.start;
        else
            DrawCallProbe.start = rapid.drawcallCount;
    }
}

export class ClipBatchTest extends Scene
{
    checks = new Checks();
    frames = 0;
    previousBackground!: Color;
    batchEnd!: DrawCallProbe;
    overflowEnd!: DrawCallProbe;
    overflowCount = 0;

    constructor()
    {
        super({ settingsData: { layers: ["objects"] } });
    }

    // 40x40, red on the left half, transparent on the right, and that many clipping ones on top of each other
    // with blue children all over them, between two probes
    AddClipped(x: number, y: number, count: number): DrawCallProbe
    {
        this.AddGameObject(DrawCallProbe);
        for (let i = 0; i < count; i++)
        {
            const clipped = this.AddGameObject("halfRed").SetPosition(x, y);
            clipped.clipChildren = true;
            clipped.AddChild("PIXEL").SetScale(40).SetColor(Color.Blue);
        }
        const end = this.AddGameObject(DrawCallProbe);
        end.end = true;
        return end;
    }

    override OnStart(): void
    {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 40;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#ff0000";
        ctx.fillRect(0, 0, 20, 40);
        if (!bare.asset.HasTexture("halfRed"))
            bare.asset.AddTexture("halfRed", bare.texture.create(canvas));

        this.previousBackground = rapid.backgroundColor.clone();
        bare.SetBackgroundColor(Color.Black);

        this.batchEnd = this.AddClipped(100, 100, 40);
        this.overflowCount = rapid.maxBatchClips + 5;
        this.overflowEnd = this.AddClipped(200, 100, this.overflowCount);

        // a shape inside a clip, then an image: both only on the left half
        const shaped = this.AddGameObject("halfRed").SetPosition(100, 200);
        shaped.clipChildren = true;
        shaped.AddChild(BlueBox);
        shaped.AddChild("PIXEL").SetPosition(0, 30).SetScaleXY(40, 10).SetColor(Color.Green);
        // drawn after it: not clipped, so the stencil was cleaned up
        this.AddGameObject("PIXEL").SetPosition(120, 200).SetScale(40).SetColor(Color.White).SetAlpha(0.5);

        // a shape in a clip inside a clip 10 to the right: only where both images are (110..120)
        const outer = this.AddGameObject("halfRed").SetPosition(200, 200);
        outer.clipChildren = true;
        const inner = outer.AddChild("halfRed").SetPosition(10, 0);
        inner.clipChildren = true;
        inner.AddChild(BlueBox);

        // a clipping object drawn into a render texture, then shown
        const rt = new RenderTexture(rapid, { width: 40, height: 40 });
        const source = this.AddGameObject("halfRed");
        source.clipChildren = true;
        source.AddChild("PIXEL").SetScale(40).SetColor(Color.Blue);
        this.RenderTo(source, rt, true);
        source.Remove();
        this.AddGameObject(rt).SetPosition(300, 200);
    }

    // the color drawn at a point, read back from the canvas
    Read(x: number, y: number): number[]
    {
        const gl = rapid.gl;
        const px = Math.round(x * gl.drawingBufferWidth / bare.width);
        const py = Math.round(gl.drawingBufferHeight - y * gl.drawingBufferHeight / bare.height);
        const pixel = new Uint8Array(4);
        gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        return [...pixel];
    }

    override OnPostRender(): void
    {
        if (++this.frames !== 3)
            return;

        rapid.flush();

        const c = this.checks;
        const isBlue = (p: number[]) => p[2] > 200 && p[0] < 60 && p[1] < 60;
        const isBlack = (p: number[]) => p[0] < 30 && p[1] < 30 && p[2] < 30;
        const isGreen = (p: number[]) => p[1] > 100 && p[0] < 60 && p[2] < 60;
        const isGrey = (p: number[]) => p[0] > 90 && p[0] < 170 && Math.abs(p[0] - p[1]) < 10 && Math.abs(p[0] - p[2]) < 10;
        const isRed = (p: number[]) => p[0] > 200 && p[1] < 60 && p[2] < 60;
        const expect = (x: number, y: number, is: (p: number[]) => boolean, message: string) =>
        {
            const p = this.Read(x, y);
            c.check(is(p), message + ": " + p.join(","));
        };

        c.check(this.batchEnd.calls >= 1 && this.batchEnd.calls <= 2, `40 clipping objects with image children should take 1 or 2 draw calls, took ${this.batchEnd.calls}`);
        expect(110, 120, isBlue, "a batched clip's children should draw on its image");
        expect(130, 120, isBlack, "none of the batched clips' children should draw past their image");

        const batches = Math.ceil(this.overflowCount / rapid.maxBatchClips);
        c.check(this.overflowEnd.calls >= batches && this.overflowEnd.calls <= batches + 1,
            `${this.overflowCount} clips, ${rapid.maxBatchClips} to a batch, should take ${batches} or ${batches + 1} draw calls, took ${this.overflowEnd.calls}`);
        expect(210, 120, isBlue, "clips over more than one batch should still let their children draw on the image");
        expect(230, 120, isBlack, "clips over more than one batch should still cut each one's children");

        expect(110, 215, isBlue, "a shape in a clip should draw on the image");
        expect(130, 215, isGrey, "a shape in a clip shouldn't draw past the image, and what's after the clip isn't clipped");
        expect(110, 235, isGreen, "an image after a shape in a clip should still be clipped, on the image");
        expect(130, 235, isGrey, "an image after a shape in a clip shouldn't draw past the image");

        expect(205, 215, isRed, "a shape in a nested clip shouldn't draw outside its own parent's image");
        expect(215, 215, isBlue, "a shape in a nested clip should draw where both images are");
        expect(225, 215, isBlack, "a shape in a nested clip should stay inside the outer image");

        expect(310, 220, isBlue, "a clip drawn into a render texture should let its children draw on the image");
        expect(330, 220, isBlack, "a clip drawn into a render texture should cut its children");

        bare.SetBackgroundColor(this.previousBackground);
        c.flush();
    }
}
