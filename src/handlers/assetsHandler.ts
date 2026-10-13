
import { BaseTexture, Texture } from '../libraries/rapid-render';
import { AnimationData, Atlas } from '../types/bareTypes';
import { Helper } from '../utils/helper';

class AssetsHandler
{
    textures: Map<string, Texture> = new Map();
    loading: Map<string, Promise<Texture>> = new Map();

    private animationData: Map<string, AnimationData> = new Map();

    private _whiteTexture?: Texture;
    private _missingTexture?: Texture;
    private warnedMissing = new Set<string>();

    // 1x1 white pixel, handy for solid rects and debug shapes - registered as "PIXEL"
    get whiteTexture(): Texture
    {
        return this._whiteTexture ??= this.CreatePixelTexture([255, 255, 255, 255]);
    }

    // 1x1 red pixel, returned in place of textures that failed to load
    get missingTexture(): Texture
    {
        return this._missingTexture ??= this.CreatePixelTexture([255, 0, 0, 255]);
    }

    // always nearest filtering, so stretching the pixel stays crisp even with antialias on
    private CreatePixelTexture(rgba: [number, number, number, number]): Texture
    {
        const gl = rapid.gl;
        const glTexture = gl.createTexture();
        if (!glTexture)
            throw new Error("Failed to create texture");

        gl.bindTexture(gl.TEXTURE_2D, glTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(rgba));

        return new Texture(new BaseTexture(glTexture, 1, 1));
    }

    async LoadTexture(texturePath: string = ""): Promise<Texture>
    {
        const cached = this.textures.get(texturePath);
        if (cached)
            return cached;

        const loadingPromise = this.loading.get(texturePath);
        if (loadingPromise)
            return loadingPromise;

        const fullPath = this.GetFullImagePath(texturePath);
        const texturePromise = rapid.texture.load(fullPath).then(tex => {
            this.AddTexture(texturePath, tex);
            this.loading.delete(texturePath);
            return tex;
        }).catch(() => {
            this.loading.delete(texturePath);
            return this.missingTexture; // JUST TO RETURN SOMETHING, TODO? MAYBE SHOULD BE A TEXTURE WITH RED CROSS
        });

        this.loading.set(texturePath, texturePromise);

        return texturePromise;
    }

    LoadTextureBatch(texturePaths: string[]): Promise<Texture[]> 
    {
        const promises = texturePaths.map(p => this.LoadTexture(p));
        return Promise.all(promises);
    }

    AddTexture(texturePath: string, texture: Texture): void
    {
        texture.texturePath = texturePath; // NOT THE BEST PLACE?
        this.textures.set(texturePath, texture);
    }

    /** A loaded texture. An unknown name returns the red placeholder pixel (and warns in development); check with HasTexture first. */
    GetTexture(texturePath: string): Texture
    {
        const texture = this.textures.get(texturePath);
        if (texture)
            return texture;

        if (__DEV__ && !this.warnedMissing.has(texturePath))
        {
            this.warnedMissing.add(texturePath);
            console.warn(`GetTexture: no texture "${texturePath}". It isn't in the atlas or hasn't been loaded yet; drawing a red pixel instead.`);
        }
        return this.missingTexture;
    }

    HasTexture(texturePath: string): boolean
    {
        return this.textures.has(texturePath);
    }

    RemoveTexture(texturePath: string): void
    {
        if (!this.HasTexture(texturePath))
            return;

        var texture = this.textures.get(texturePath);
        rapid.texture.destroy(texture!);

        this.textures.delete(texturePath);
    }

    GetFullImagePath(path: string): string
    {
        return `${bare.imagePath}/${path}.webp`;
    }

    async LoadAtlas(atlasPath: string): Promise<void>
    {
        const [json, img] = await Promise.all([
            Helper.loadJSON<Atlas>(`${bare.imagePath}/${atlasPath}.json`),
            bare.texture.load(`${bare.imagePath}/${atlasPath}.webp`) // DON'T HARDCODE WEBP, TODO
        ]);

        assetsHandler.ProcessAtlas(json, img);
    }

    ProcessAtlas(json: Atlas, img: Texture):void
    {
        this.AddTexturesFromAtlas(json, img);

        if (json.animations)
        {
            for (const [animName, animFrames] of Object.entries(json.animations))
            {
                var animationFrames = animFrames as string[];
                assetsHandler.AddAnimation(animName, animationFrames);
            }
        }
    }

    AddTexturesFromAtlas(atlas: Atlas, atlasTexture: Texture):void
    {
        const atlasBase = atlasTexture.base;
        if (!atlasBase) {
            throw new Error("Atlas texture was loaded without a base texture.");
        }

        for (var name in atlas.frames)
        {
            const frame = atlas.frames[name];

            const tx = new Texture(atlasBase);
            let fx = frame.frame.x;
            let fy = frame.frame.y;
            let fw = frame.frame.w;
            let fh = frame.frame.h;

            if (frame.rotated) {
                [fh, fw] = [fw, fh]
            }
            tx.isRotated = frame.rotated

            tx.setRegion(fx, fy, fw, fh);

            tx.sourceSize = frame.sourceSize;
            tx.spriteSourceSize = frame.spriteSourceSize;
            tx.frame = frame.frame;

            var nameMinusExt = name.split('.')[0];
            
            this.AddTexture(nameMinusExt, tx);
        }
    }

    AddAnimation(animName: string, animFrames: string[] = [], framesPerSecond: number = 8, loop: boolean = true, removeOnComplete: boolean = false): void
    {
        var animationData = new AnimationData(animName, animFrames, framesPerSecond, loop, removeOnComplete);
        this.animationData.set(animName, animationData);
    }

    GetAnimation(animName: string): AnimationData | undefined
    {
        return this.animationData.get(animName);
    }
    
    Clear()
    {
        for (var tex of this.textures.values())
            if (tex != this.whiteTexture)
                rapid.texture.destroy(tex);

        this.textures.clear();
        this.loading.clear();
        this.animationData.clear();

        // BIT HACKY, BUT WE STILL NEED THE PIXEL TEXTURE, INITIALLY CREATED IN BareEngine.ts Init()
        // ALSO PREVENTED DESTROYING IT ABOVE
        this.AddTexture("PIXEL", this.whiteTexture);
    }
}

export const assetsHandler = new AssetsHandler();
