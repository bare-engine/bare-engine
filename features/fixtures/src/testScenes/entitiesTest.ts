import { GameObject, Scene } from "bare-engine";

class FruitObject extends GameObject
{
    OnAwake(): void
    {
        this.AddChild();
    }
}

export class EntitiesTest extends Scene
{
    constructor()
    {
        super({
            baseEntities: [
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
                    entity: "big",
                    propertiesRemoved: ["rotation"],
                },
                {
                    name: "withChild",
                    children: [{ name: "baseChild", texture: "NONE" }],
                },
            ],
            entities: [
                { name: "pear" },
                {
                    name: "banana",
                    baseClass: "FruitObject",
                    texture: "NONE",
                },
                {
                    name: "apple",
                    entity: "bigAndNoRotation",
                    texture: "NONE",
                },
                {
                    name: "tile",
                    children: [{ name: "tileChild", texture: "NONE" }],
                },
                {
                    name: "playerTile",
                    children: [{ name: "rent", entity: "tile" }],
                },
                {
                    name: "combinedChildren",
                    entity: "withChild",
                    children: [{ name: "ownChild", texture: "NONE" }],
                },
            ],
            layers: ["objects"],
        });
    }

    OnAwake(): void
    {
        bare.AddClass(FruitObject);
    }

    OnStart(): void
    {
        const pear = this.AddGameObject("pear");
        const banana = this.AddGameObject("banana");
        const apple = this.AddGameObject("apple");

        assert(pear.pivot.x === 7 && pear.pivot.y === 9, "ANY base entity should set pivot");
        assert(banana instanceof FruitObject, "baseClass should create a registered GameObject subclass");
        assert(banana.children.length === 1, "FruitObject should run its awake behavior");
        assert(apple.scale.x === 2 && apple.scale.y === 2, "base entity chain should apply scale");
        assert(apple.rotation === 0, "propertiesRemoved should prevent inherited rotation");

        const extendedPlayerTile = this.settingsHandler.GetExtendedEntity("playerTile");
        assert(extendedPlayerTile.children[0].children[0].name === "tileChild", "nested entity references should extend their children");
        assert(extendedPlayerTile.entity === undefined, "implicit root defaults should not become authored entity links");
        assert(extendedPlayerTile.children[0].entity === "tile", "authored child entity links should be preserved");
        assert(extendedPlayerTile.children[0].children[0].entity === undefined, "implicit child defaults should not become authored entity links");

        const sourceChildren = [
            { name: "first", entityUID: "firstChildUID" },
            { name: "second", entityUID: "secondChildUID" },
        ];
        const newChild = { name: "new" };
        const firstChildOverride = { entity: "firstChildUID" };
        const mergedChildren = this.MergeChildren(sourceChildren, [newChild, firstChildOverride]);

        assert(mergedChildren[0] === firstChildOverride, "child overrides should keep their source child position");
        assert(mergedChildren[1] === sourceChildren[1], "unmodified source children should keep their source order");
        assert(mergedChildren[2] === newChild, "new current children should be appended after source children");

    }
}
