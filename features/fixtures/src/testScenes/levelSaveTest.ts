import { Component, ComponentController, GameObject, LevelData, Scene, SerializeField } from "bare-engine";
import { Checks } from "./checks";

// covers docs/reference/save-data "what gets saved" and docs/reference/level: Serialize, reloading serialized levels

export class HealthSaveComponent extends Component
{
    @SerializeField
    health: number = 10;

    // not marked @SerializeField, so never saved
    regen: number = 1;
}

export class SaveCrate extends GameObject
{
    @SerializeField
    contents: string = "";
}

const levelData = (): LevelData => ({
    name: "saveTestLevel",
    dimensions: { width: 800, height: 600 },
    entitiesByLayer: {
        objects: [
            { extends: "hero", name: "h1", position: { x: 10, y: 20 } },
            { extends: "crate", name: "c1", position: { x: 50, y: 50 } },
            { extends: "hero", name: "untouched", position: { x: 70, y: 80 } },
            { extends: "hero", name: "doomed", position: { x: 90, y: 90 } },
        ],
        fx: [
            { extends: "hero", name: "spark", position: { x: 1, y: 1 } },
        ],
    },
} as any);

export class LevelSaveTest extends Scene
{
    checks = new Checks();

    constructor()
    {
        super({
            basePrefabs: [{ name: "ANY", texture: "PIXEL" }],
            prefabs: [
                { name: "hero", components: { healthSave: {} } },
                { name: "crate", baseClass: "SaveCrate", scale: { x: 4, y: 4 } },
                // children are only saved when their entity says save: true, top-level objects always are
                { name: "tower", children: [{ name: "flag", position: { x: 5, y: 0 }, save: true }, { name: "rope", position: { x: 1, y: 0 } }] },
            ],
            saveVars: {
                SaveCrate: ["rotation"],
            },
            layers: ["objects", "fx"],
            layersInfo: {
                fx: { save: false },
            },
        } as any);
    }

    override OnAwake(): void
    {
        bare.AddClass(ComponentController);
        bare.AddClass(HealthSaveComponent);
        bare.AddClass(SaveCrate);
    }

    Entity(level: LevelData, name: string): any
    {
        // {} when missing, so a failed lookup fails its checks instead of throwing
        return Object.values(level.entitiesByLayer).flat().find((entity: any) => entity.name === name) ?? {};
    }

    override async OnStart()
    {
        const c = this.checks;

        await bare.level.Load(levelData());
        const h1 = bare.object.GetByName("h1")!;
        const crate = bare.object.GetByName("c1") as SaveCrate;
        c.check(h1 && crate instanceof SaveCrate, "the level should create its objects");

        // change the level while playing
        h1.SetPosition(30.4, 40.6);
        h1.SetRotation(45);
        h1.GetComponent(HealthSaveComponent)!.health = 3;
        h1.GetComponent(HealthSaveComponent)!.regen = 5;
        crate.SetRotation(90);
        crate.contents = "gold";
        bare.object.GetByName("doomed")!.Remove();
        bare.object.GetByName("spark")!.x = 500;

        // names come from the entity: the default saveVars don't include name, so renaming at runtime isn't saved
        const added = this.AddGameObject({ extends: "hero", name: "added" });
        added.SetPosition(200, 210);
        const renamed = this.AddGameObject({ extends: "hero", name: "before" });
        renamed.name = "after";

        const keeper = this.AddGameObject({ extends: "hero", name: "keeper" });
        keeper.persistent = true;

        const unsaved = this.AddGameObject({ extends: "hero", name: "unsaved" });
        unsaved.save = false;

        const tower = this.AddGameObject({ extends: "tower", name: "tower1" });
        tower.GetChildByName("flag")!.SetPosition(15, 0);
        tower.GetChildByName("rope")!.SetPosition(25, 0);
        tower.AddChild({ extends: "hero", name: "banner", save: true });
        tower.AddChild({ extends: "hero", name: "loose" });
        tower.AddChild({ extends: "hero", name: "marked" }).save = true;

        const level = bare.level.Serialize();
        const names = level.entitiesByLayer.objects.map((entity: any) => entity.name);

        // which objects are saved
        c.check(names.includes("h1") && names.includes("c1") && names.includes("untouched") && names.includes("added"), "level and added objects should be saved: " + names.join(","));
        c.check(!names.includes("doomed"), "removed objects should not be saved");
        c.check(!names.includes("keeper"), "persistent objects should not be saved");
        c.check(!names.includes("unsaved"), "objects with save = false should not be saved");
        c.check(names.includes("before") && !names.includes("after"), "name is not in the default saveVars, so a runtime rename should not be saved: " + names.join(","));
        c.check(!level.entitiesByLayer.fx || this.Entity(level, "spark")?.position?.x !== 500, "layers with save: false should not be updated: " + JSON.stringify(level.entitiesByLayer.fx));

        // which properties are saved
        const h1Entity = this.Entity(level, "h1");
        c.check(h1Entity.position.x === 30 && h1Entity.position.y === 41, "positions should be saved, rounded: " + JSON.stringify(h1Entity.position));
        c.check(h1Entity.rotation === undefined, "rotation is not in the default saveVars: " + h1Entity.rotation);
        c.check(h1Entity.components?.healthSave?.health === 3, "@SerializeField component fields should be saved: " + JSON.stringify(h1Entity.components));
        c.check(h1Entity.components?.healthSave?.regen === undefined, "component fields without @SerializeField should not be saved");
        const crateEntity = this.Entity(level, "c1");
        c.check(crateEntity.rotation === 90, "saveVars should add properties for that class: " + JSON.stringify(crateEntity));
        c.check(crateEntity.contents === "gold", "@SerializeField fields on a GameObject class should be saved: " + crateEntity.contents);
        c.check(crateEntity.scale === undefined, "prefab values should not be repeated in the entity: " + JSON.stringify(crateEntity.scale));
        const untouchedEntity = this.Entity(level, "untouched");
        c.check(untouchedEntity.components === undefined && untouchedEntity.position.x === 70, "an unchanged object should only keep what it had: " + JSON.stringify(untouchedEntity));
        const towerEntity = this.Entity(level, "tower1");
        // a prefab child is saved as a reference to its source child, so it has no name of its own
        const towerChildren: any[] = towerEntity.children ?? [];
        c.check(towerChildren.length === 3 && towerChildren.some((child) => child.position?.x === 15) && towerChildren.some((child) => child.name === "banner"),
            "children with save: true should be saved, including added ones: " + JSON.stringify(towerChildren));
        c.check(!towerChildren.some((child) => child.name === "loose"), "an added child without save: true should not be saved");

        // reloading the serialized level, through JSON like a save file
        keeper.persistent = false;
        keeper.Remove();
        await bare.level.Load(JSON.parse(JSON.stringify(level)));
        const h1Again = bare.object.GetByName("h1")!;
        c.check(h1Again.x === 30 && h1Again.y === 41, "a reloaded object should have its saved position: " + h1Again.x + "," + h1Again.y);
        c.check(h1Again.rotation === 0, "an unsaved property should come back as the prefab value");
        c.check(h1Again.GetComponent(HealthSaveComponent)?.health === 3, "a saved component field should come back: " + h1Again.GetComponent(HealthSaveComponent)?.health);
        c.check(h1Again.GetComponent(HealthSaveComponent)?.regen === 1, "an unsaved component field should come back as its default");
        const crateAgain = bare.object.GetByName("c1") as SaveCrate;
        c.check(crateAgain.rotation === 90 && crateAgain.contents === "gold" && crateAgain.scale.x === 4, "a reloaded class object should have its saved and prefab values: " + crateAgain.rotation + " " + crateAgain.contents + " " + crateAgain.scale.x);
        c.check(bare.object.GetByName("added")?.x === 200, "an object added while playing should come back");
        c.check(bare.object.GetByName("doomed") === null, "a removed object should stay removed");
        const towerAgain = bare.object.GetByName("tower1")!;
        c.check(towerAgain.GetChildByName("flag")?.x === 15 && towerAgain.GetChildByName("banner") !== null, "saved children should come back with their changes");
        c.check(towerAgain.GetChildByName("rope")?.x === 1, "an unsaved prefab child should come back as the prefab has it: " + towerAgain.GetChildByName("rope")?.x);
        c.check(towerAgain.GetChildByName("loose") === null, "an unsaved added child should not come back");
        const towerNames = towerAgain.children.map((child) => child.name).join(",");
        c.check(towerAgain.GetChildByName("marked")?.save === true, "a child marked save in code should still be saved after loading");
        c.check(towerNames === "flag,rope,banner,marked", "children should not be duplicated or reordered: " + towerNames);

        // saving twice in a row gives the same level
        const again = bare.level.Serialize(JSON.parse(JSON.stringify(level)));
        c.check(JSON.stringify(again.entitiesByLayer.objects) === JSON.stringify(level.entitiesByLayer.objects),
            "serializing an unchanged reloaded level should give the same data:\n" + JSON.stringify(again.entitiesByLayer.objects) + "\n" + JSON.stringify(level.entitiesByLayer.objects));

        c.flush();
    }
}
