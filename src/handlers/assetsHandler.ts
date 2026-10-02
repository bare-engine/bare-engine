
import { Texture } from '../libraries/rapid-render';
import { AnimationData, Atlas } from '../types/bareTypes';
import { Helper } from '../utils/helper';

class AssetsHandler
{
    textures: Map<string, Texture> = new Map();
    loading: Map<string, Promise<Texture>> = new Map();

    private animationData: Map<string, AnimationData> = new Map();

    async LoadTexture(texturePath: string = ""): Promise<Texture>
    {
        const cached = this.GetTexture(texturePath);
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
            return window.redPixelTexture; // JUST TO RETURN SOMETHING, TODO? MAYBE SHOULD BE A TEXTURE WITH RED CROSS
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

    GetTexture(texturePath: string): Texture
    {
        return this.textures.get(texturePath)!;
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
        rapid.texture.destroy(texture);

        this.textures.delete(texturePath);
    }

    GetFullImagePath(path: string): string
    {
        return `${bare.imagePath}/${path}.webp`;
    }

    async LoadAtlas(atlasPath: string): Promise<void>
    {
        var promises = [];
        promises.push(Helper.loadJSON<Atlas>(`${bare.imagePath}/${atlasPath}.json`));
        promises.push(bare.texture.load(`${bare.imagePath}/${atlasPath}.webp`)); // DON'T HARDCODE WEBP, TODO

        const [json, img] = await Promise.all(promises);

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
            if (tex != window.whitePixelTexture)
                rapid.texture.destroy(tex);

        this.textures.clear();
        this.loading.clear();
        this.animationData.clear();

        // BIT HACKY, BUT WE STILL NEED THE PIXEL TEXTURE, INITIALLY CREATED IN BareEngine.ts Init()
        // ALSO PREVENTED DESTROYING IT ABOVE
        assetsHandler.AddTexture("PIXEL", window.whitePixelTexture);
    }
}

export const assetsHandler = new AssetsHandler();
