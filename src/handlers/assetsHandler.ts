
import { Texture } from '../libraries/rapid-render';
import { AnimationData, Atlas } from '../types/bareTypes';
import { Helper } from '../utils/helper';

class AssetsHandler
{
    textures: Map<string, Texture> = new Map();
    loading: Map<string, Promise<Texture>> = new Map();

    private animationData: Map<string, AnimationData> = new Map();

    LoadTexturesBatchAr(texturePaths: string[]): Promise<Texture[]> 
    {
        const promises = texturePaths.map(p => this.GetTexturePromise(p));
        return Promise.all(promises);
    }

    async GetTexturePromise(texturePath: string = "", isfullPath:boolean = false): Promise<Texture>
    {
        const cached = this.GetTexture(texturePath);
        if (cached)
            return cached;

        const loadingPromise = this.loading.get(texturePath);
        if (loadingPromise)
            return loadingPromise;

        const fullPath = (isfullPath ? texturePath : this.GetFullImagePath(texturePath));
        const texturePromise = rapid.textures.textureFromUrl(fullPath).then(tex => {
            this.AddTexture(texturePath, tex);
            this.loading.delete(texturePath);
            return tex;
        }).catch(() => {
            this.loading.delete(texturePath);
            return window.whitePixelTexture; // JUST TO RETURN SOMETHING, TODO?
        });

        this.loading.set(texturePath, texturePromise);

        return texturePromise;
    }

    AddTexture(texturePath: string, texture: Texture): void
    {
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

    GetFullImagePath(path: string): string
    {
        return `${bareEngine.imagePath}/${path}.webp`;
    }

    async LoadAtlas(atlasPath: string): Promise<void>
    {
        var promises = [];
        promises.push(Helper.loadJSON<Atlas>(`${bareEngine.imagePath}/${atlasPath}.json`));
        promises.push(bareEngine.textures.loadImage(`${bareEngine.imagePath}/${atlasPath}.webp`)); // DON'T HARDCODE WEBP, TODO

        const [json, img] = await Promise.all(promises);

        assetsHandler.ProcessAtlas(json, img);
    }

    ProcessAtlas(json: any, img: any):void
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

    AddTexturesFromAtlas(atlas: Atlas, atlasImg: HTMLImageElement):void
    {
        var atlasBaseTex = rapid.textures.addImageFromSource(atlasImg);

        for (var name in atlas.frames)
        {
            const frame = atlas.frames[name];

            const tx = new Texture(atlasBaseTex.base);
            let fx = frame.frame.x;
            let fy = frame.frame.y;
            let fw = frame.frame.w;
            let fh = frame.frame.h;

            tx.isRotated = frame.rotated;
            if (frame.rotated)
                tx.setClipRegion(fx, fy, fh, fw);
            else
                tx.setClipRegion(fx, fy, fw, fh);

            tx.sourceSize = frame.sourceSize;
            tx.spriteSourceSize = frame.spriteSourceSize;
            tx.frame = frame.frame;

            var nameMinusExt = name.split('.')[0];
            
            this.AddTexture(nameMinusExt, tx);
        }
    }

    AddAnimation(animName: string, animFrames: string[], framesPerSecond: number = 8, loop: boolean = true)
    {
        var animationData = new AnimationData(animName, animFrames, framesPerSecond, loop);
        this.animationData.set(animName, animationData);
    }

    GetAnimation(animName: string): AnimationData | undefined
    {
        return this.animationData.get(animName);
    }
    
    Clear()
    {
        for (var tex of this.textures.values())
            rapid.textures.destroy(tex.base);

        this.textures.clear();
        this.loading.clear();
        this.animationData.clear();
    }
}

export const assetsHandler = new AssetsHandler();
