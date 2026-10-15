import type { Rapid } from "../render";
import { Region } from "./region";
import { QUAD_VERTICES } from "./spriteRegion";
import VsShaderSource from "../shader/tile.vert?raw";
import FsShaderSource from "../shader/tile.frag?raw";

// fixed in the shader with layout(location = N), so one VAO works for every program
const VERTEX_LOCATION = 0;
const TILE_LOCATION = 1;
const BYTES_PER_TILE = 4;

export interface ITileLayerDraw {
    /** one uint32 per map cell, chunk after chunk, each chunk row by row */
    buffer: WebGLBuffer;
    /** tile and frame definitions, see tile.vert */
    defs: WebGLTexture;
    frameBase: number;
    /** the tile images' textures, by the texture unit their frames name */
    textures: (WebGLTexture | null)[];
    chunkShift: number;
    chunksX: number;
    tileWidth: number;
    tileHeight: number;
    /** seconds, for animated tiles */
    time: number;
    /** premultiplied when the renderer is */
    tint: Float32Array;
    /** the map's transform: a, b, c, d, tx, ty */
    matrix: Float32Array;
    /** pairs of first instance and instance count, one draw call each */
    ranges: number[];
    rangeCount: number;
}

/**
 * Draws tile maps from buffers that stay on the GPU. A map's cells are uploaded once and
 * again only where they change, so a frame costs a few uniforms and a draw call per range.
 * Not in Rapid's regions list: it's created on first use, so games without tile maps don't
 * include its shaders.
 */
export class TileRegion extends Region {
    override KEY = "Tile";
    protected override extraTextureUnit = 1;

    private vao: WebGLVertexArrayObject;
    private quadBuffer: WebGLBuffer;
    private textureUnits: Int32Array;
    private world0 = new Float32Array(3);
    private world1 = new Float32Array(3);
    private tileSize = new Float32Array(2);

    private static instances = new WeakMap<Rapid, TileRegion>();

    static Get(rapid: Rapid): TileRegion {
        let region = TileRegion.instances.get(rapid);
        if (!region) {
            region = new TileRegion(rapid);
            TileRegion.instances.set(rapid, region);
        }
        return region;
    }

    constructor(rapid: Rapid) {
        super(rapid);
        const gl = this.gl;

        this.quadBuffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTICES, gl.STATIC_DRAW);

        this.vao = gl.createVertexArray()!;
        gl.bindVertexArray(this.vao);
        gl.vertexAttribPointer(VERTEX_LOCATION, 2, gl.FLOAT, false, 8, 0);
        gl.enableVertexAttribArray(VERTEX_LOCATION);
        gl.enableVertexAttribArray(TILE_LOCATION);
        gl.vertexAttribDivisor(TILE_LOCATION, 1);
        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        const units = this.getMaxTexutreUnit();
        this.textureUnits = Int32Array.from({ length: units }, (_, i) => i);
    }

    /** how many different textures one map can draw from */
    get maxTextures(): number {
        return this.textureUnits.length;
    }

    protected override createDefaultShader() {
        this.vs = VsShaderSource;
        this.fs = FsShaderSource;
        this.defaultShader = this.createShader(VsShaderSource, FsShaderSource);
        return this.defaultShader;
    }

    // Region.prepareRender binds the sprite textures and sets uniforms this shader doesn't have
    protected override prepareRender(): void {
    }

    drawLayer(layer: ITileLayerDraw): void {
        if (layer.rangeCount === 0)
            return;

        this.rapid.enterRegion(this);

        const gl = this.gl;
        const shader = this.currentShader;
        shader.use();

        const defsUnit = this.textureUnits.length;
        for (let unit = 0; unit < layer.textures.length; unit++) {
            gl.activeTexture(gl.TEXTURE0 + unit);
            gl.bindTexture(gl.TEXTURE_2D, layer.textures[unit]);
        }
        gl.activeTexture(gl.TEXTURE0 + defsUnit);
        gl.bindTexture(gl.TEXTURE_2D, layer.defs);
        gl.activeTexture(gl.TEXTURE0);

        const m = layer.matrix;
        this.world0[0] = m[0]; this.world0[1] = m[2]; this.world0[2] = m[4];
        this.world1[0] = m[1]; this.world1[1] = m[3]; this.world1[2] = m[5];
        this.tileSize[0] = layer.tileWidth; this.tileSize[1] = layer.tileHeight;
        shader.setUniform("u_projection", this.rapid.projection);
        shader.setUniform("uWorld0", this.world0);
        shader.setUniform("uWorld1", this.world1);
        shader.setUniform("uTileSize", this.tileSize);
        shader.setUniform("uChunkShift", layer.chunkShift);
        shader.setUniform("uChunksX", layer.chunksX);
        shader.setUniform("uTextures", this.textureUnits);
        shader.setUniform("uDefs", defsUnit);
        shader.setUniform("uFrameBase", layer.frameBase);
        shader.setUniform("uTime", layer.time);
        shader.setUniform("uTint", layer.tint);

        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, layer.buffer);

        // no base instance in WebGL2: each range points the tile attribute at its first cell instead
        const ranges = layer.ranges;
        for (let i = 0; i < layer.rangeCount; i++) {
            const first = ranges[i * 2];
            const count = ranges[i * 2 + 1];
            gl.vertexAttribIPointer(TILE_LOCATION, 1, gl.UNSIGNED_INT, BYTES_PER_TILE, first * BYTES_PER_TILE);
            shader.setUniform("uFirstInstance", first);
            gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
            this.rapid.drawcallCount++;
        }

        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
}
