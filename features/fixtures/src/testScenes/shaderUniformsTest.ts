import { FlashShader, GameObject, Scene } from "bare-engine";
import { Checks } from "./checks";

// covers shader uniforms per object: every Shader class shares one compiled GL shader, so two objects
// with the same shader at a different stage (one flash just started, one almost done) must still each
// draw with their own uniform values

export class ShaderUniformsTest extends Scene
{
    checks = new Checks();
    frames = 0;
    white!: GameObject;
    red!: GameObject;
    whiteAfter!: GameObject;

    constructor()
    {
        super({ layers: ["objects"] });
    }

    override OnStart(): void
    {
        // a red texture of its own: a tint is applied after the shader, so a tinted white
        // PIXEL would turn red again after the flash made it white
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 4;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#ff0000";
        ctx.fillRect(0, 0, 4, 4);
        bare.asset.AddTexture("redSquare", bare.texture.create(canvas));

        const square = (x: number) => this.AddGameObject("redSquare").SetPosition(x, 100).SetScale(10);

        // fully white for a long time: the flash's uniform is 0
        this.white = square(100);
        this.white.AddShader(FlashShader, { fadePreDuration: 1000, duration: 1 });

        // almost done fading back: its uniform is about 1, so it looks red
        this.red = square(200);
        this.red.AddShader(FlashShader, { fadePreDuration: -999, duration: 1000 });

        // white again after the red one, in case the last uniform set wins
        this.whiteAfter = square(300);
        this.whiteAfter.AddShader(FlashShader, { fadePreDuration: 1000, duration: 1 });
    }

    // the color drawn at the center of an object, read back from the canvas
    ReadCenter(obj: GameObject): number[]
    {
        const gl = rapid.gl;
        const scaleX = gl.drawingBufferWidth / bare.width;
        const scaleY = gl.drawingBufferHeight / bare.height;
        const x = Math.round((obj.x + 20) * scaleX);
        const y = Math.round(gl.drawingBufferHeight - (obj.y + 20) * scaleY);
        const pixel = new Uint8Array(4);
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        return [...pixel];
    }

    override OnPostRender(): void
    {
        // a few frames in, so the shaders have run their Update
        if (++this.frames !== 3)
            return;

        rapid.flush();

        const c = this.checks;
        const white = this.ReadCenter(this.white);
        const red = this.ReadCenter(this.red);
        const whiteAfter = this.ReadCenter(this.whiteAfter);
        const isWhite = (p: number[]) => p[0] > 230 && p[1] > 230 && p[2] > 230;
        const isRed = (p: number[]) => p[0] > 200 && p[1] < 60 && p[2] < 60;

        c.check(isWhite(white), "an object early in its flash should be white: " + white.join(","));
        c.check(isRed(red), "an object at the end of its flash should be its own color: " + red.join(","));
        c.check(isWhite(whiteAfter), "an object drawn after another flash should keep its own uniform: " + whiteAfter.join(","));

        c.flush();
    }
}
