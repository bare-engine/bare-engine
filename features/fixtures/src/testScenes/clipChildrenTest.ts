import { Color, FlashShader, MaskType, Scene } from "bare-engine";
import { Checks } from "./checks";

// covers GameObject.clipChildren: children only draw where the parent's own image isn't transparent,
// and the clip ends with the parent, so what's drawn after it isn't clipped. Clips nest, a SetMask drawn
// earlier doesn't leak into one, and a rotated atlas frame clips to the shape it's drawn in.
// Also covers SetMask with a sprite as the mask, on its own and inside a clipping object

export class ClipChildrenTest extends Scene
{
    checks = new Checks();
    frames = 0;
    previousBackground!: Color;

    constructor()
    {
        super({ settingsData: { layers: ["objects"] } });
    }

    override OnStart(): void
    {
        // 40x40, red on the left half, transparent on the right
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 40;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#ff0000";
        ctx.fillRect(0, 0, 20, 40);
        bare.asset.AddTexture("halfRed", bare.texture.create(canvas));

        this.previousBackground = rapid.backgroundColor.clone();
        bare.SetBackgroundColor(Color.Black);

        // a blue square over all of it: only its left half shows
        const clipped = this.AddGameObject("halfRed").SetPosition(100, 100);
        clipped.clipChildren = true;
        clipped.AddChild("PIXEL").SetScale(40).SetColor(Color.Blue);

        // the same without clipChildren: all of it shows
        this.AddGameObject("halfRed").SetPosition(200, 100).AddChild("PIXEL").SetScale(40).SetColor(Color.Blue);

        // a second clipping object 20 to the left: its transparent half lies over the first one's opaque half.
        // If the first one's image were still in the stencil buffer, its green child would draw there
        const second = this.AddGameObject("halfRed").SetPosition(80, 100);
        second.clipChildren = true;
        second.AddChild("PIXEL").SetScale(40).SetColor(Color.Green);

        // drawn after the clipping objects
        this.AddGameObject("PIXEL").SetPosition(300, 100).SetScale(40).SetColor(Color.Green);

        // a SetMask drawn first, whose mask lies over the transparent half of the clipping object after it.
        // The masked sprite itself lies outside its mask, so it draws nothing
        const maskShape = this.AddGameObject("PIXEL").SetPosition(120, 200).SetScaleXY(20, 40);
        this.AddGameObject("PIXEL").SetPosition(300, 200).SetScale(10).SetMask(maskShape);
        const afterMask = this.AddGameObject("halfRed").SetPosition(100, 200);
        afterMask.clipChildren = true;
        afterMask.AddChild("PIXEL").SetScale(40).SetColor(Color.Blue);

        // a clipping object inside another one, 10 to the right: its blue child only shows where both images
        // are opaque (110..120), and the outer clip goes on for the green child after it
        const outer = this.AddGameObject("halfRed").SetPosition(100, 300);
        outer.clipChildren = true;
        const inner = outer.AddChild("halfRed").SetPosition(10, 0);
        inner.clipChildren = true;
        inner.AddChild("PIXEL").SetScale(40).SetColor(Color.Blue);
        outer.AddChild("PIXEL").SetPosition(0, 30).SetScaleXY(40, 10).SetColor(Color.Green);

        // a rotated atlas frame, 40x20 on screen, stored turned a quarter as 20x40 with its left half red.
        // The clipped one's child should cover exactly what the plain copy shows red
        const atlas = document.createElement("canvas");
        atlas.width = atlas.height = 64;
        const atlasCtx = atlas.getContext("2d")!;
        atlasCtx.fillStyle = "#ff0000";
        atlasCtx.fillRect(8, 4, 10, 40);
        const frame = bare.texture.create(atlas).getSubTexture(8, 4, 20, 40);
        frame.isRotated = true;
        bare.asset.AddTexture("rotatedFrame", frame);

        const rotated = this.AddGameObject("rotatedFrame").SetPosition(100, 400);
        rotated.clipChildren = true;
        rotated.AddChild("PIXEL").SetScale(60).SetColor(Color.Blue);
        this.AddGameObject("rotatedFrame").SetPosition(200, 400);

        // sprite masks over the left half: drawn inside it, and outside it
        const inside = this.AddGameObject("PIXEL").SetPosition(400, 100).SetScaleXY(20, 40);
        this.AddGameObject("PIXEL").SetPosition(400, 100).SetScale(40).SetColor(Color.Green).SetMask(inside);
        const outsideMask = this.AddGameObject("PIXEL").SetPosition(500, 100).SetScaleXY(20, 40);
        this.AddGameObject("PIXEL").SetPosition(500, 100).SetScale(40).SetColor(Color.Green).SetMask(outsideMask, MaskType.NOT_EQUAL);

        // a masked sprite over the first one's mask, with its own mask somewhere else: it draws nothing,
        // unless the first mask is still in the stencil buffer
        const elsewhere = this.AddGameObject("PIXEL").SetPosition(400, 160).SetScale(10);
        this.AddGameObject("PIXEL").SetPosition(400, 100).SetScaleXY(20, 40).SetColor(Color.Blue).SetMask(elsewhere);

        // masked children of a clipping object, with masks over the top half (placed in the parent's space):
        // only where both the clip and the mask allow, and the clip goes on for the blue child after them
        const maskedInClip = (x: number, type: MaskType) =>
        {
            const parent = this.AddGameObject("halfRed").SetPosition(x, 300);
            parent.clipChildren = true;
            const topHalf = this.AddGameObject("PIXEL").SetScaleXY(40, 20);
            parent.AddChild("PIXEL").SetScale(40).SetColor(Color.Green).SetMask(topHalf, type);
            parent.AddChild("PIXEL").SetPosition(0, 35).SetScaleXY(40, 5).SetColor(Color.Blue);
        };
        maskedInClip(400, MaskType.EQUAL);
        maskedInClip(500, MaskType.NOT_EQUAL);

        // a clipped child with a shader: it's drawn through a render texture first, which the clip mustn't hide
        const shaded = this.AddGameObject("halfRed").SetPosition(400, 400);
        shaded.clipChildren = true;
        shaded.AddChild("PIXEL").SetScale(40).SetColor(Color.Blue).AddShader(FlashShader, { fadePreDuration: 1000, duration: 1 });
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
        const isRed = (p: number[]) => p[0] > 200 && p[1] < 60 && p[2] < 60;

        // reads the color at a point and checks it
        const expect = (x: number, y: number, is: (p: number[]) => boolean, message: string) =>
        {
            const p = this.Read(x, y);
            c.check(is(p), message + ": " + p.join(","));
        };

        expect(110, 120, isBlue, "a clipped child should draw where the parent's image is opaque");
        expect(130, 120, isBlack, "a clipped child shouldn't draw where the parent's image is transparent");
        expect(90, 120, isGreen, "a second clipping object should clip to its own image");
        expect(230, 120, isBlue, "without clipChildren a child should draw over transparent parts too");
        expect(330, 120, isGreen, "an object drawn after a clipping object shouldn't be clipped");

        expect(130, 220, isBlack, "a SetMask drawn earlier shouldn't let a clipped child draw where its mask was");

        expect(105, 315, isRed, "a nested clip's child shouldn't draw outside its own parent's image");
        expect(115, 315, isBlue, "a nested clip's child should draw where both images are opaque");
        expect(125, 315, isBlack, "a nested clip should stay inside the outer clip");
        expect(105, 335, isGreen, "a child after a nested clip should still draw inside the outer image");
        expect(125, 335, isBlack, "a nested clip shouldn't end the outer clip");

        expect(410, 120, isGreen, "a sprite mask should let its object draw inside it, and not leak into the next masked object");
        expect(430, 120, isBlack, "a sprite mask shouldn't let its object draw outside it");
        expect(510, 120, isBlack, "a NOT_EQUAL sprite mask shouldn't let its object draw inside it");
        expect(530, 120, isGreen, "a NOT_EQUAL sprite mask should let its object draw outside it");

        const expectInClip = (x: number, type: string, topLeft: (p: number[]) => boolean, bottomLeft: (p: number[]) => boolean) =>
        {
            const masked = `a ${type} masked child of a clipping object`;
            expect(x + 10, 310, topLeft, masked + ", top left");
            expect(x + 10, 325, bottomLeft, masked + ", bottom left");
            expect(x + 30, 310, isBlack, masked + ", top right, outside the clip");
            expect(x + 30, 325, isBlack, masked + ", bottom right, outside the clip");
            expect(x + 10, 338, isBlue, masked + ", the child after it");
            expect(x + 30, 338, isBlack, masked + ", the child after it, outside the clip");
        };
        expectInClip(400, "EQUAL", isGreen, isRed);
        expectInClip(500, "NOT_EQUAL", isRed, isGreen);

        const isWhite = (p: number[]) => p[0] > 200 && p[1] > 200 && p[2] > 200;
        expect(410, 420, isWhite, "a clipped child with a shader should draw inside the clip");
        expect(430, 420, isBlack, "a clipped child with a shader shouldn't draw outside the clip");

        // inside the 40x20 frame, and two points just past it in the 20x40 of how it's stored
        for (const [x, y] of [[105, 405], [135, 405], [105, 415], [135, 415], [105, 430], [115, 435]])
        {
            const plain = this.Read(x + 100, y), clipped = this.Read(x, y);
            c.check(isRed(plain) ? isBlue(clipped) : isBlack(clipped),
                `a rotated atlas frame should clip to how it's drawn, at ${x},${y}: plain ${plain.join(",")}, clipped ${clipped.join(",")}`);
        }

        bare.SetBackgroundColor(this.previousBackground);
        c.flush();
    }
}
