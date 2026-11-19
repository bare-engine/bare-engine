import { Scene, type Atlas } from "bare-engine";
import { Checks } from "./checks";

// covers GameObject.textureName: a texture added by name, an atlas frame, and an object without an image

export class TextureNameTest extends Scene
{
    checks = new Checks();

    constructor()
    {
        super({ settingsData: { layers: ["objects"] } });
    }

    override OnStart(): void
    {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 8;
        if (!bare.asset.HasTexture("namedTexture"))
            bare.asset.AddTexture("namedTexture", bare.texture.create(canvas));
        if (!bare.asset.HasTexture("namedFrame"))
        {
            const frame = { frame: { x: 0, y: 0, w: 4, h: 4 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 4, h: 4 }, sourceSize: { w: 4, h: 4 } };
            bare.asset.ProcessAtlas({ frames: { namedFrame: frame } } as Atlas, bare.texture.create(canvas));
        }

        const c = this.checks;
        const named = this.AddGameObject("namedTexture");
        c.check(named.textureName === "namedTexture", `textureName should be the asset name, was "${named.textureName}"`);
        const framed = this.AddGameObject("namedFrame");
        c.check(framed.textureName === "namedFrame", `textureName of an atlas frame should be its name, was "${framed.textureName}"`);
        named.SetTexture(bare.asset.GetTexture("namedFrame"));
        c.check(named.textureName === "namedFrame", "textureName should follow SetTexture");
        c.check(this.AddGameObject().textureName === "", "textureName should be empty without an image");
        c.flush();
    }
}
