import { GameObject, Scene } from "bare-engine";

class FruitObject extends GameObject
{
    override OnAwake(): void
    {
        this.AddChild();
    }
}

export class PrefabsTest extends Scene
{
    constructor()
    {
        super({
            basePrefabs: [
                {
                    name: "ANY",
                    pivot: { x: 7, y: 9 },
                    texture: "NONE",
                },
                {
                    name: "big",
                    scale: { x: 2, y: 2 },
                    pivot: { x: 0, y: 0 },
                    rotation: 90,
                    texture: "NONE",
                },
                {
                    name: "bigAndNoRotation",
                    extends: "big",
                    propertiesRemoved: ["rotation"],
                },
                {
                    name: "withChild",
                    children: [{ name: "baseChild", texture: "NONE" }],
                },
            ],
            prefabs: [
                { name: "pear" },
                {
                    name: "banana",
                    baseClass: "FruitObject",
                    texture: "NONE",
                },
                {
                    name: "apple",
                    extends: "bigAndNoRotation",
                    texture: "NONE",
                },
                {
                    name: "tile",
                    children: [{ name: "tileChild", texture: "NONE" }],
                },
                {
                    name: "playerTile",
                    children: [{ name: "rent", extends: "tile" }],
                },
                {
                    name: "combinedChildren",
                    extends: "withChild",
                    children: [{ name: "ownChild", texture: "NONE" }],
                },
            ],
            layers: ["objects"],
        });
    }

    override OnAwake(): void
    {
        bare.AddClass(FruitObject);
    }

    override OnStart(): void
    {
        const pear = this.AddGameObject("pear");
        const banana = this.AddGameObject("banana");
        const apple = this.AddGameObject("apple");

        assert(pear.pivot.x === 7 && pear.pivot.y === 9, "ANY base prefab should set pivot");
        assert(banana instanceof FruitObject, "baseClass should create a registered GameObject subclass");
        assert(banana.children.length === 1, "FruitObject should run its awake behavior");
        assert(apple.scale.x === 2 && apple.scale.y === 2, "base prefab chain should apply scale");
        assert(apple.rotation === 0, "propertiesRemoved should prevent inherited rotation");

        const extendedPlayerTile = this.settingsHandler.GetExtendedPrefab("playerTile");
        assert(extendedPlayerTile.children[0].children[0].name === "tileChild", "nested extends references should extend their children");
        assert(extendedPlayerTile.extends === undefined, "implicit root defaults should not become authored extends links");
        assert(extendedPlayerTile.children[0].extends === "tile", "authored child extends links should be preserved");
        const tileChildUID = this.settingsHandler.GetRawPrefab("tile").children[0].entityUID;
        assert(extendedPlayerTile.children[0].children[0].extends === tileChildUID, "inherited children should reference their source child by uid");

        const sourceChildren = [
            { name: "first", entityUID: "firstChildUID" },
            { name: "second", entityUID: "secondChildUID" },
        ];
        const newChild = { name: "new" };
        const firstChildOverride = { extends: "firstChildUID" };
        const mergedChildren = this.MergeChildren(sourceChildren, [newChild, firstChildOverride]);

        assert(mergedChildren[0] === firstChildOverride, "child overrides should keep their source child position");
        // A source child with an entityUID comes back as a copy: MergeChildren rewrites .extends on it,
        // and the source array is shared settings data that must not be mutated.
        assert(mergedChildren[1] !== sourceChildren[1]
            && mergedChildren[1].name === sourceChildren[1].name, "unmodified source children should keep their source order");
        assert(mergedChildren[2] === newChild, "new current children should be appended after source children");

    }
}
