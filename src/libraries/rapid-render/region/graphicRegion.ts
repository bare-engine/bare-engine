import type { Rapid } from "../render";
import { Region } from "./region";
import GLShader from "../webgl/glshader";
import { ArrayType, WebglBufferArray } from "../buffer";
import { Texture } from "../texture";

import VsShaderSource from "../shader/graphic.vert?raw";
import FsShaderSource from "../shader/graphic.frag?raw";

import MaskVsShaderSource from "../shader/mask.vert?raw";
import MaskFsShaderSource from "../shader/mask.frag?raw";

// Per-vertex layout (stride = 20 bytes): 8 + 4 + 8
//   aPosition  vec2   float32×2  offset  8
//   aColor     vec4   u8×4       offset  12
//   aUV        vec2   float32×2  offset  20
const VERTEX_STRIDE = 20;

// A BATCH IS DRAWN ONCE IT HAS THIS MANY VERTICES
const MAX_BATCH_VERTICES = 65536;
// BATCHED SHAPES ARE ALREADY IN WORLD SPACE, SO THEY'RE DRAWN WITH AN IDENTITY MATRIX
const IDENTITY_ROW0 = [1, 0, 0];
const IDENTITY_ROW1 = [0, 1, 0];

export class GraphicRegion extends Region {
    private vertexBuffer!: WebglBufferArray;
    private vertexCount: number = 0;
    protected override extraTextureUnit: number = 1;
    
    matrixIndex: number = -1
    drawMode: number = this.gl.TRIANGLES

    texture?: Texture
    /** Wrap uvs outside 0..1 inside the texture's frame (works for atlas sub-textures). */
    repeatTexture: boolean = false
    // uv bounds of the current graphic, so repeating can clamp to them (see sampleRepeatTexture)
    private uvMinX = 0
    private uvMinY = 0
    private uvMaxX = 0
    private uvMaxY = 0

    private _maskShader?: GLShader
    override KEY = "Graphic"

    // Shapes drawn with the default shader, as triangles or a triangle fan, without a repeating texture
    // (drawRect, drawCircle, drawLine, ...) are collected and drawn together: one draw call for a run of
    // them with the same texture, instead of one each. Their vertices are moved to world space on the CPU
    // when the shape ends, since the matrix they use (often the shared temporary one) changes right after.
    // Anything else, or anything that changes GL state, draws the batch first (see hasPendingContent)
    private batchOpen = false
    // the current shape goes into the batch: its vertices wait in shapeVertices until endGraphic
    private batchingShape = false
    private shapeVertices: number[] = []
    private shapeVertexCount = 0

    constructor(rapid: Rapid) {
        super(rapid);

        this.createBuffer()
    }

    override createBuffer(){
        const gl = this.gl;

        this.vertexBuffer = new WebglBufferArray(gl, ArrayType.Float32, gl.ARRAY_BUFFER, gl.DYNAMIC_DRAW);
    }

    /** built on first use, like the default shader; most scenes never mask */
    get maskShader(): GLShader {
        return this._maskShader ??= this.createMaskShader(MaskVsShaderSource, MaskFsShaderSource);
    }

    override createDefaultShader() {
        this.vs = VsShaderSource;
        this.fs = FsShaderSource;
        this.defaultShader = this.createShader(this.vs, this.fs)
        return this.defaultShader;
    }

    createMaskShader(vs: string, fs: string) {
        const gl = this.gl;
        const shader = new GLShader(gl, vs, fs);
        shader.onReady(() => {
            shader.bindVAO();
            this.vertexBuffer.bindBuffer();
            shader.setAttributes([
                { name: "aPosition", size: 2, type: gl.FLOAT, stride: VERTEX_STRIDE - 4, offset: 0, divisor: 0 },
                { name: "aUV", size: 2, type: gl.FLOAT, stride: VERTEX_STRIDE - 4, offset: 8, divisor: 0 },
            ]);
            shader.unbindVAO();
        });
        return shader;
    }

    override createShader(vs: string, fs: string) {
        const gl = this.gl;
        const shader = super.createShader(vs, fs);

        shader.onReady(() => {
            shader.bindVAO();
            this.vertexBuffer.bindBuffer();
            shader.setAttributes([
                { name: "aPosition", size: 2, type: gl.FLOAT, stride: VERTEX_STRIDE, offset: 0, divisor: 0 },
                { name: "aColor", size: 4, type: gl.UNSIGNED_BYTE, normalized: true, stride: VERTEX_STRIDE, offset: 8, divisor: 0 },
                { name: "aUV", size: 2, type: gl.FLOAT, stride: VERTEX_STRIDE, offset: 12, divisor: 0 },
            ]);
            shader.unbindVAO();
        });
        return shader;
    }

    /**
     * Begins a new polygon drawing sequence. Must be followed by addVertex() calls and endGraphic().
     * @param matrixIndex The index targeting a specific transform matrix in the MatrixStore.
     * @param drawMode The WebGL drawing primitive mode (e.g., gl.TRIANGLES).
     * @param texture Optional texture to apply over the polygon.
     * @param repeatTexture Wrap uvs outside 0..1 inside the texture's frame.
     */
    startGraphic(
        matrixIndex: number,
        drawMode: number = this.gl.TRIANGLES,
        texture?: Texture,
        repeatTexture: boolean = false,
    ): void {
        const gl = this.gl;
        const batchable = this.isDefaultShader && !repeatTexture
            && (drawMode === gl.TRIANGLES || drawMode === gl.TRIANGLE_FAN);

        // a shape that can't join the batch so far: draw the batch first, keeping the order
        if (this.batchOpen && (!batchable || texture !== this.texture))
            this.flush();

        if (batchable) {
            if (!this.batchOpen) {
                this.vertexBuffer.clear();
                this.vertexCount = 0;
                this.batchOpen = true;
                this.drawMode = gl.TRIANGLES;
                this.texture = texture;
                this.repeatTexture = false;

                if (texture?.glTexture)
                    this.useTexture(texture.glTexture, 0, 0);
            }

            this.batchingShape = true;
            this.matrixIndex = matrixIndex;
            this.shapeDrawMode = drawMode;
            this.shapeVertexCount = 0;
            return;
        }

        this.batchingShape = false;
        this.vertexBuffer.clear();
        this.vertexCount = 0;
        this.uvMinX = this.uvMinY = Infinity;
        this.uvMaxX = this.uvMaxY = -Infinity;

        this.matrixIndex = matrixIndex;
        this.drawMode = drawMode;
        this.texture = texture;
        this.repeatTexture = repeatTexture;

        if (this.texture?.glTexture) {
            // It does not rely on the region to set the texture;
            // it merely occupies a texture unit to prevent the custom shader from overwriting it
            this.useTexture(this.texture.glTexture, 0, 0)
        }
    }

    /**
     * Adds a vertex to the current polygon. Local coordinates and color settings.
     * @param x Local X coordinate.
     * @param y Local Y coordinate.
     * @param u UV mapped X value (0-1, default 0).
     * @param v UV mapped Y value (0-1, default 0).
     * @param color Pre-multiplied hex color combined using ABGR byte order (default 0xFFFFFFFF).
     */
    addVertex(
        x: number, y: number,
        u: number = 0, v: number = 0,
        color: number = 0xFFFFFFFF,
    ): void {
        if (this.batchingShape) {
            const i = this.shapeVertexCount++ * 5;
            const vertices = this.shapeVertices;
            vertices[i] = x;
            vertices[i + 1] = y;
            vertices[i + 2] = u;
            vertices[i + 3] = v;
            vertices[i + 4] = color;
            return;
        }

        const buf = this.vertexBuffer;
        buf.pushFloat32(x);
        buf.pushFloat32(y);
        if (this.currentShader != this._maskShader) {
            buf.pushUint32(color);
        }
        buf.pushFloat32(u);
        buf.pushFloat32(v);
        if (u < this.uvMinX) this.uvMinX = u;
        if (u > this.uvMaxX) this.uvMaxX = u;
        if (v < this.uvMinY) this.uvMinY = v;
        if (v > this.uvMaxY) this.uvMaxY = v;
        this.vertexCount++;
        this.vertexBuffer.makeDirty();
    }

    /**
     * Finishes the graphic construction and dispatches the rendering call immediately.
     */
    endGraphic(): void {
        if (!this.batchingShape) {
            this.flush();
            return;
        }

        this.batchingShape = false;
        this.addShapeToBatch();

        if (this.vertexCount >= MAX_BATCH_VERTICES)
            this.flush();
    }

    private shapeDrawMode: number = this.gl.TRIANGLES

    // THE CURRENT SHAPE'S VERTICES, IN WORLD SPACE AND AS PLAIN TRIANGLES, AT THE END OF THE BATCH
    private addShapeToBatch(): void {
        const count = this.shapeVertexCount;
        const fan = this.shapeDrawMode === this.gl.TRIANGLE_FAN;
        if (count < 3)
            return;

        const md = this.matrixStore.data;
        const o = this.matrixIndex * 6;
        const a = md[o], b = md[o + 1], c = md[o + 2], d = md[o + 3];
        let tx = md[o + 4];
        let ty = md[o + 5];

        if (this.rapid.roundPixels) {
            tx = Math.round(tx);
            ty = Math.round(ty);
        }

        // a fan of n vertices is n - 2 triangles around the first one; a triangle list only whole triangles,
        // or the next shape's vertices would end up in the wrong triangles
        const outCount = fan ? (count - 2) * 3 : count - count % 3;
        const buf = this.vertexBuffer;
        buf.resize(outCount * 5);

        const vertices = this.shapeVertices;
        const push = (index: number) => {
            const i = index * 5;
            const x = vertices[i];
            const y = vertices[i + 1];
            buf.pushFloat32(a * x + c * y + tx);
            buf.pushFloat32(b * x + d * y + ty);
            buf.pushUint32(vertices[i + 4]);
            buf.pushFloat32(vertices[i + 2]);
            buf.pushFloat32(vertices[i + 3]);
        };

        if (fan) {
            for (let i = 1; i < count - 1; i++) {
                push(0);
                push(i);
                push(i + 1);
            }
        } else {
            for (let i = 0; i < outCount; i++)
                push(i);
        }

        this.vertexCount += outCount;
        buf.makeDirty();
    }

    override render() {
        if (this.vertexCount === 0) return;
        this.prepareRender();

        const gl = this.gl;
        const shader = this.currentShader;

        if (this.batchOpen) {
            shader.setUniform("uMatrixRow0", IDENTITY_ROW0);
            shader.setUniform("uMatrixRow1", IDENTITY_ROW1);
        } else {
            const o = this.matrixIndex * 6;
            const md = this.matrixStore.data;

            let tx = md[o + 4]
            let ty = md[o + 5]

            if (this.rapid.roundPixels) {
                tx = Math.round(tx);
                ty = Math.round(ty);
            }

            shader.setUniform("uMatrixRow0", [md[o],     md[o + 2], tx]);
            shader.setUniform("uMatrixRow1", [md[o + 1], md[o + 3], ty]);
        }
        shader.setUniform("uUVRect", this.texture
            ? [this.texture.uvX, this.texture.uvY, this.texture.uvW, this.texture.uvH]
            : [0, 0, 1, 1]
        );

        if (this.texture?.glTexture) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.texture.glTexture);
            shader.setUniform("uTexture", 0);
            shader.setUniform("uUseTexture", 1);
        } else {
            shader.setUniform("uUseTexture", 0);
        }
        shader.setUniform("uRepeat", this.repeatTexture ? 1 : 0);
        if (this.repeatTexture)
            shader.setUniform("uLocalUVRange", [this.uvMinX, this.uvMinY, this.uvMaxX, this.uvMaxY]);

        this.vertexBuffer.bindBuffer();
        this.vertexBuffer.bufferData();

        shader.bindVAO();

        gl.drawArrays(this.drawMode, 0, this.vertexCount);
        this.rapid.drawcallCount++;
        this.texture = undefined;
        this.repeatTexture = false;

        if (this.batchOpen) {
            this.batchOpen = false;
            this.vertexBuffer.clear();
            this.vertexCount = 0;
        }
    }

    // A BATCH WAITS FOR MORE SHAPES, SO IT'S DRAWN WHEN THE REGION IS LEFT (rapid.flush, ANY GL STATE CHANGE)
    override hasPendingContent(): boolean {
        return this.batchOpen && this.vertexCount > 0;
    }
}
