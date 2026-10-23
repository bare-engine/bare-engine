import type { Texture } from "./texture";

/**
 * An image that sprites are clipped to (see Rapid.pushClip): they only draw where it isn't fully transparent.
 * The sprite shader tests it per pixel, so clipped sprites batch like any others.
 */
export class ClipShape {
    texture!: Texture;
    /** The clip this one is in, so a sprite in both draws only where both images are. */
    parent: ClipShape | null = null;
    /** The matrix the image is drawn with, to draw it into the stencil buffer when a shape is clipped. */
    readonly matrix = new Float32Array(6);
    /** The rows of the matrix from the sprites' space to 0..1 across the image, as drawMaskSprite lays it out. */
    readonly row0 = new Float32Array(3);
    readonly row1 = new Float32Array(3);
    /** Whether it's also in the stencil buffer, for shapes and other non-sprites drawn inside it. */
    stencilled = false;
    /** The sprite batch that has it in its clip table, and where (see SpriteRegion.addClip). */
    batch = -1;
    slot = 0;

    /**
     * @param data The matrix store's data.
     * @param offset Where the image's matrix starts in it.
     * @param roundPixels Round the translation, as the mask graphics the stencil used do.
     */
    set(texture: Texture, data: Float32Array, offset: number, roundPixels: boolean, parent: ClipShape | null): this {
        this.texture = texture;
        this.parent = parent;
        this.stencilled = false;
        this.batch = -1;

        const m = this.matrix;
        for (let i = 0; i < 6; i++) m[i] = data[offset + i];
        const [a, b, c, d] = m;
        const tx = roundPixels ? Math.round(m[4]) : m[4];
        const ty = roundPixels ? Math.round(m[5]) : m[5];

        // the corner at uv (0, 0), and the steps to uv (1, 0) and (0, 1), as in drawMaskSprite
        const flipY = !!texture.flipY;
        const w = texture.width, h = texture.height;
        const x = texture.offsetX;
        let y: number, ax: number, ay: number, bx: number, by: number;
        if (texture.isRotated) {
            y = texture.offsetY + (flipY ? 0 : h);
            ax = 0; ay = flipY ? h : -h;
            bx = w; by = 0;
        } else {
            y = texture.offsetY + (flipY ? h : 0);
            ax = w; ay = 0;
            bx = 0; by = flipY ? -h : h;
        }

        // on screen: origin + s * u + t * v for (s, t) in 0..1, and back
        const ox = a * x + c * y + tx, oy = b * x + d * y + ty;
        const ux = a * ax + c * ay, uy = b * ax + d * ay;
        const vx = a * bx + c * by, vy = b * bx + d * by;
        const det = ux * vy - vx * uy;
        if (Math.abs(det) < 1e-12) {
            // scaled to nothing: every point is outside it
            this.row0.set([0, 0, -1]);
            this.row1.set([0, 0, -1]);
            return this;
        }
        this.row0.set([vy / det, -vx / det, (vx * oy - vy * ox) / det]);
        this.row1.set([-uy / det, ux / det, (uy * ox - ux * oy) / det]);
        return this;
    }
}
