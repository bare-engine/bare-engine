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
            baseEntities: {
                ANY: {
                    pivot: { x: 7, y: 9 },
                    texture: "NONE",
                },
                big: {
                    scale: { x: 2, y: 2 },
                    pivot: { x: 0, y: 0 },
                    rotation: 90,
                    texture: "NONE",
                },
                bigAndNoRotation: {
                    baseEntity: "big",
                    propertiesRemoved: ["rotation"],
                },
            },
            entities: {
                pear: {},
                banana: {
                    baseClass: "FruitObject",
                    texture: "NONE",
                },
                apple: {
                    baseEntity: "bigAndNoRotation",
                    texture: "NONE",
                },
            },
            layers: ["objects"],
        });
    }

    OnAwake(): void
    {
        this.AddClass(FruitObject);
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
    }
}
