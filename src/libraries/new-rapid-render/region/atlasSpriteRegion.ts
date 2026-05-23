import { generateShader } from "../webgl/utils";
import { SpriteRegion } from "./spriteRegion";
import VsShaderSource from "../shader/sprite.vert";
import AtlasFsShaderSource from "../shader/sprite_atlas.frag";
import { Rapid } from "../render";

export class AtlasSprtieRegion extends SpriteRegion {
    KEY = "AtlasSprite"
    constructor(rapid:Rapid) {
        super(rapid)
    }

    createDefaultShader() {
        const rapid = this.rapid
        const fs = generateShader(AtlasFsShaderSource, rapid.maxTextureUnits);
        const vs = generateShader(VsShaderSource, rapid.maxTextureUnits);
        this.vs = vs;
        this.fs = fs;
        this.defaultShader = this.createShader(vs, fs)
        return this.defaultShader;
    }
}