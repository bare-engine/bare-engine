import type { Color, Rapid, Texture } from "../libraries/rapid-render";
import { SpriteRegion } from "../libraries/rapid-render/region/spriteRegion";
import { Region } from "../libraries/rapid-render/region/region";
import { UNSIGNED_BYTE, generateShader } from "../libraries/rapid-render/webgl/utils";
import FsShaderSource from "../libraries/rapid-render/shader/sprite.frag?raw";

// Ordinary sprites can send their local transform directly to the GPU. Keep this
// separate from the affine region so existing custom shader layouts stay valid.
const STRIDE = 52;
const VS = `#version 300 es
precision highp float;
in vec2 aVertex;
in vec2 aPosition;
in vec2 aSize;
in float aRotation;
in vec2 aOffset;
in vec4 aUVRect;
in vec4 aColor;
in float aTextureId;
uniform mat4 u_projection;
uniform vec3 u_parent0;
uniform vec3 u_parent1;
out vec2 vRegion;
flat out int vTextureId;
flat out int vClampUV;
out vec4 vColor;
out vec4 vUVRect;
out vec2 vPadding;
void main() {
    vec2 local = aVertex * aSize + aOffset;
    float c = cos(aRotation), s = sin(aRotation);
    vec2 position = aPosition + vec2(local.x*c-local.y*s, local.x*s+local.y*c);
    vec3 p = vec3(position, 1.0);
    gl_Position = u_projection * vec4(dot(u_parent0,p), dot(u_parent1,p), 0.0, 1.0);
    vRegion = mix(aUVRect.xy, aUVRect.zw, aVertex);
    vUVRect = aUVRect;
    vPadding = vec2(0.0);
    vTextureId = int(aTextureId);
    vClampUV = 0;
    vColor = aColor;
}`;

export class TransformSpriteRegion extends SpriteRegion {
    KEY = "TransformSprite";
    private parent0 = new Float32Array(3);
    private parent1 = new Float32Array(3);

    override createDefaultShader() {
        this.vs = VS;
        this.fs = generateShader(FsShaderSource, this.rapid.maxTextureUnits);
        return this.defaultShader = this.createShader(this.vs, this.fs);
    }

    override createShader(vs: string, fs: string) {
        const shader = Region.prototype.createShader.call(this, vs, fs);
        // locations exist once the program has linked, i.e. on the shader's first use()
        shader.onReady(() => {
            shader.bindVAO();
            this.instanceBuffer.bindBuffer();
            shader.setAttributes([
                { name: "aPosition", size: 2, stride: STRIDE, offset: 0, divisor: 1 },
                { name: "aSize", size: 2, stride: STRIDE, offset: 8, divisor: 1 },
                { name: "aRotation", size: 1, stride: STRIDE, offset: 16, divisor: 1 },
                { name: "aOffset", size: 2, stride: STRIDE, offset: 20, divisor: 1 },
                { name: "aUVRect", size: 4, stride: STRIDE, offset: 28, divisor: 1 },
                { name: "aColor", size: 4, type: UNSIGNED_BYTE, normalized: true, stride: STRIDE, offset: 44, divisor: 1 },
                { name: "aTextureId", size: 1, type: UNSIGNED_BYTE, stride: STRIDE, offset: 48, divisor: 1 },
            ]);
            this.quadBuffer.bindBuffer();
            shader.setAttributes([{ name: "aVertex", size: 2, stride: 8, offset: 0, divisor: 0 }]);
            shader.unbindVAO();
        });
        return shader;
    }

    drawTransformed(texture: Texture, x: number, y: number, rotation: number,
        scaleX: number, scaleY: number, pivotX: number, pivotY: number, color: number): void {
        const stack = this.rapid.matrixStack;
        const m = stack.matrix.data, o = stack.curWorldM * 6;
        const p = this.parent0, q = this.parent1;
        if (p[0] !== m[o] || p[1] !== m[o+2] || p[2] !== m[o+4]
            || q[0] !== m[o+1] || q[1] !== m[o+3] || q[2] !== m[o+5]) {
            // Stack slots are mutable: compare values, never just the slot index.
            if (this.instanceCount) this.flush();
            p[0] = m[o]; p[1] = m[o+2]; p[2] = m[o+4];
            q[0] = m[o+1]; q[1] = m[o+3]; q[2] = m[o+5];
        }
        const textureId = this.useTexture(texture.glTexture!);
        const buf = this.instanceBuffer;
        buf.resize(13);
        const i = buf.usedElemNum, f = buf.float32!, u = buf.uint32!;
        f[i] = x; f[i+1] = y;
        f[i+2] = texture.rawWidth * scaleX; f[i+3] = texture.rawHeight * scaleY;
        f[i+4] = rotation;
        f[i+5] = (texture.offsetX - pivotX) * scaleX;
        f[i+6] = (texture.offsetY - pivotY) * scaleY;
        f[i+7] = texture.uvX;
        f[i+8] = texture.flipY ? texture.uvH : texture.uvY;
        f[i+9] = texture.uvW;
        f[i+10] = texture.flipY ? texture.uvY : texture.uvH;
        u[i+11] = color; u[i+12] = textureId;
        buf.usedElemNum += 13;
        buf.makeDirty();
        this.instanceCount++;
    }

    override render(): void {
        if (!this.instanceCount) return;
        this.currentShader.use();
        this.currentShader.setUniform("u_parent0", this.parent0);
        this.currentShader.setUniform("u_parent1", this.parent1);
        super.render();
    }
}

// created on first use, so scenes without plain sprites never compile its shader
let transformSpriteRegion: TransformSpriteRegion | undefined;

/** draws a default, unfiltered sprite with its local transform applied on the GPU. */
export function drawSpriteTransform(rapid: Rapid, texture: Texture, x: number, y: number, rotation: number,
    scaleX: number, scaleY: number, pivotX: number, pivotY: number, color?: Color): void
{
    if (transformSpriteRegion?.rapid !== rapid)
        transformSpriteRegion = new TransformSpriteRegion(rapid);

    rapid.enterRegion(transformSpriteRegion);
    transformSpriteRegion.drawTransformed(texture, x, y, rotation, scaleX, scaleY, pivotX, pivotY, rapid.getColorUint32(color));
}
