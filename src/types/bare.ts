export class Bare
{
    public static data: {
        prefabs: string[];
        basePrefabs: string[];
        animations: string[];
        layers: int[];
    } = {
        prefabs: [],
        basePrefabs: [],
        animations: [],
        layers: [],
    };
    public static assets: {
        images: string[];
        sounds: string[];
        fonts: string[];
        levels: string[];
        atlases: Record<string, string[]>;      // the images in each atlas in public/images, by the name LoadAtlas takes
    } = {
        images: [],
        sounds: [],
        fonts: [],
        levels: [],
        atlases: {},
    };
}
