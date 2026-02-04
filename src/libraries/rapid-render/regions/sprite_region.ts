import RenderRegion from "./region";
import fragString from "../shader/sprite.frag";
import vertString from "../shader/sprite.vert";

import Rapid from "../render";
import { WebglElementBufferArray } from "../math";
import { UniformType, WebGLContext } from "../interface";
import GLShader from "../webgl/glshader";
import { FLOAT, UNSIGNED_BYTE } from "../webgl/utils";
import { Uniform } from "../webgl/uniform";
import { spriteAttributes } from "./attributes"

const INDEX_PER_SPRITE = 6
const VERTEX_PER_SPRITE = 4

const SPRITE_ELMENT_PER_VERTEX = 6

const FLOAT32_PER_SPRITE = VERTEX_PER_SPRITE * SPRITE_ELMENT_PER_VERTEX
// 2 ** 16 = Unit16 MAX_VALUE / VERTEX_PER_SPRITE = MAX_BATCH
const MAX_BATCH = Math.floor(2 ** 16 / VERTEX_PER_SPRITE)

class SpriteElementArray extends WebglElementBufferArray {
    constructor(gl: WebGLContext, max: number) {
        super(gl, INDEX_PER_SPRITE, VERTEX_PER_SPRITE, max)
    }
    protected override AddObject(vertex: number): void {
        super.AddObject()
        this.pushUint16(vertex)
        this.pushUint16(vertex + 1)
        this.pushUint16(vertex + 2)

        this.pushUint16(vertex)
        this.pushUint16(vertex + 3)
        this.pushUint16(vertex + 2)
    }
}

class SpriteRegion extends RenderRegion {
    private batchSprite: number = 0
    private indexBuffer: SpriteElementArray
    private spriteTextureUnits: number[] = []
    private spriteTextureUnitIndexOffset: number = 0

    constructor(rapid: Rapid) {
        const gl = rapid.gl
        super(rapid)
        this.setShader("default", vertString, fragString, spriteAttributes)
        this.indexBuffer = new SpriteElementArray(gl, MAX_BATCH)
    }

    protected override addVertex(
        x: number,
        y: number,
        u: number,
        v: number,
        textureUnit: number,
        color: number
    ): void {
        super.addVertex(x, y)

        this.webglArrayBuffer.pushFloat32(u)
        this.webglArrayBuffer.pushFloat32(v)
        this.webglArrayBuffer.pushFloat32(textureUnit)
        this.webglArrayBuffer.pushUint32(color)
    }
    renderSprite(texture: WebGLTexture,
        width: number,
        height: number,
        u0: number,
        v0: number,
        u1: number,
        v1: number,
        rotate: boolean,
        offsetX: number,
        offsetY: number,
        color: number,
        uniforms?: Uniform,
        flipX?: boolean,
        flipY?: boolean,
        additionalTexturenit: number = 0
    ) {
        if (
            1 + additionalTexturenit > this.freeTextureUnitNum
            || this.batchSprite >= MAX_BATCH
            || this.isUnifromChanged(uniforms)
            || this.rapid.projectionDirty
        ) {
            this.render()

            if (uniforms && this.isUnifromChanged(uniforms)) {
                this.currentShader!.setUniforms(uniforms, this)
                this.setCurrentUniform(uniforms)
            }
            if (this.rapid.projectionDirty) this.updateProjection()
        }

        this.batchSprite++
        this.webglArrayBuffer.resize(FLOAT32_PER_SPRITE)

        const [textureUnit, isNew] = this.useTexture(texture)
        if (isNew) {
            this.spriteTextureUnits.push(textureUnit)
            this.spriteTextureUnitIndexOffset = this.spriteTextureUnits[0]
        }
        const textureIndex = textureUnit - this.spriteTextureUnitIndexOffset
        const isRotated = rotate
        /**
         * 0-----1
         * | \   |
         * |   \ |
         * 3-----2
         */

        const shaderPadding = this.currentShader?.padding ?? { x: 0, y: 0 };
        const paddingX = shaderPadding?.x ?? 0;
        const paddingY = shaderPadding?.y ?? 0;
        const uvRangeX = Math.abs(u1 - u0);
        const uvRangeY = Math.abs(v1 - v0);
        const useRotatedPadding = isRotated;
        const uvPadX = width !== 0
            ? (useRotatedPadding ? uvRangeY : uvRangeX) * paddingX / width
            : 0;
        const uvPadY = height !== 0
            ? (useRotatedPadding ? uvRangeX : uvRangeY) * paddingY / height
            : 0;

        const paddedU0 = u0 - uvPadX;
        const paddedU1 = u1 + uvPadX;
        const paddedV0 = v0 - uvPadY;
        const paddedV1 = v1 + uvPadY;

        const uA = flipX ? paddedU1 : paddedU0
        const uB = flipX ? paddedU0 : paddedU1
        const vA = flipY ? paddedV1 : paddedV0
        const vB = flipY ? paddedV0 : paddedV1

        const x1 = offsetX - paddingX
        const x2 = offsetX + width + paddingX
        const y1 = offsetY - paddingY
        const y2 = offsetY + height + paddingY

        const regionOriginX = Math.min(paddedU0, paddedU1)
        const regionOriginY = Math.min(paddedV0, paddedV1)
        const regionSizeX = Math.abs(paddedU1 - paddedU0)
        const regionSizeY = Math.abs(paddedV1 - paddedV0)
        const rotateUv90 = (u: number, v: number) => {
            const localU = regionSizeX !== 0 ? (u - regionOriginX) / regionSizeX : 0;
            const localV = regionSizeY !== 0 ? (v - regionOriginY) / regionSizeY : 0;
            const rotU = 1 - localV;
            const rotV = localU;
            return [regionOriginX + rotU * regionSizeX, regionOriginY + rotV * regionSizeY] as const;
        };

        const uv00 = isRotated ? rotateUv90(uA, vA) : [uA, vA];
        const uv10 = isRotated ? rotateUv90(uB, vA) : [uB, vA];
        const uv11 = isRotated ? rotateUv90(uB, vB) : [uB, vB];
        const uv01 = isRotated ? rotateUv90(uA, vB) : [uA, vB];

        this.addVertex(x1, y1, uv00[0], uv00[1], textureIndex, color)
        this.addVertex(x2, y1, uv10[0], uv10[1], textureIndex, color)
        this.addVertex(x2, y2, uv11[0], uv11[1], textureIndex, color)
        this.addVertex(x1, y2, uv01[0], uv01[1], textureIndex, color)
    }

    protected override executeRender(): void {
        super.executeRender()
        if (this.batchSprite <= 0) return

        const gl = this.gl
        if (this.spriteTextureUnits.length > 0) {
            this.gl.uniform1iv(
                this.currentShader!.uniformLoc["uTextures"],
                this.spriteTextureUnits
            )
        }
        gl.drawElements(gl.TRIANGLES, this.batchSprite * INDEX_PER_SPRITE, gl.UNSIGNED_SHORT, 0)
    }
    override enterRegion(customShader?: GLShader | undefined): void {
        super.enterRegion(customShader)
        this.indexBuffer.bindBuffer()
    }
    protected override initializeForNextRender(): void {
        super.initializeForNextRender()
        this.batchSprite = 0
        this.spriteTextureUnits.length = 0
    }
    override hasPendingContent(): boolean {
        return this.batchSprite > 0
    }
}

export default SpriteRegion
