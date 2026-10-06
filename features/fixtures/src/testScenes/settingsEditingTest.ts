import { Helper, LevelData, Scene, SettingsData, SettingsHandler } from "bare-engine";
import { Checks } from "./checks";

// covers the prefab editing the editor and plugin do on settingsData: find, set, remove and rename prefabs,
// dangling references, runtime uids and what's filtered out before saving

const settingsData = (): SettingsData => ({
    basePrefabs: [
        { name: "ANY", texture: "PIXEL" },
        { name: "creature", scale: { x: 2, y: 2 } },
    ],
    prefabs: [
        { name: "slime", rotation: 10 },
        { name: "kingSlime", extends: "slime", scale: { x: 3, y: 3 } },
        { name: "nest", children: [{ name: "egg", extends: "slime" }, { name: "twig" }, { name: "stone", extends: "pebble" }] },
        { name: "rock" },
        { name: "pebble", rotation: 30 },
        { name: "bigPebble", extends: "pebble", scale: { x: 4, y: 4 } },
    ],
    categories: {
        monsters: { entries: ["slime"], extends: "creature" },
        props: { entries: ["rock", "slime", "boulder"] }, // boulder only exists as a category entry
    },
} as any);

export class SettingsEditingTest extends Scene
{
    checks = new Checks();

    constructor()
    {
        super(settingsData());
    }

    async OnStart()
    {
        const c = this.checks;
        const json = (value: any) => JSON.stringify(value);

        // static helpers, on a copy of the raw data
        const raw = Helper.DeepCopy(this.settingsHandler.GetRaw());

        c.check(SettingsHandler.FindPrefab(raw, "slime")?.rotation === 10, "FindPrefab should find a prefab");
        c.check(SettingsHandler.FindPrefab(raw, "creature")?.scale?.x === 2, "FindPrefab should find a base prefab");
        c.check(SettingsHandler.FindPrefab(raw, "missing") === undefined, "FindPrefab should return undefined when missing");
        c.check(SettingsHandler.IsBasePrefab(raw, "creature") && !SettingsHandler.IsBasePrefab(raw, "slime"), "IsBasePrefab should only be true for base prefabs");
        c.check(SettingsHandler.FindPrefabCollection(raw, "missing") === undefined, "FindPrefabCollection should return undefined when missing");
        await c.checkThrows(() => SettingsHandler.FindPrefabCollection({ prefabs: [{ name: "x" }], basePrefabs: [{ name: "x" }] } as any, "x"),
            "a name in both prefabs and basePrefabs should throw");

        const rockIndex = raw.prefabs!.findIndex(prefab => prefab.name === "rock");
        const newRock = SettingsHandler.SetPrefab(raw, "rock", { scale: { x: 5, y: 5 } } as any);
        c.check(raw.prefabs![rockIndex] === newRock && newRock.name === "rock", "SetPrefab should replace the prefab in place and keep its name");
        await c.checkThrows(() => SettingsHandler.SetPrefab(raw, "missing", {}), "SetPrefab should throw for a missing prefab");

        const prefabCount = raw.prefabs!.length;
        c.check(SettingsHandler.RemovePrefab(raw, "missing") === undefined && raw.prefabs!.length === prefabCount, "RemovePrefab should leave the data alone for a missing prefab");
        c.check(SettingsHandler.RemovePrefab(raw, "rock") === newRock && !SettingsHandler.FindPrefab(raw, "rock"), "RemovePrefab should remove and return the prefab");

        await c.checkThrows(() => SettingsHandler.RenamePrefab(raw, "slime", ""), "renaming to an empty name should throw");
        await c.checkThrows(() => SettingsHandler.RenamePrefab(raw, "ANY", "everything"), "renaming a default prefab should throw");
        await c.checkThrows(() => SettingsHandler.RenamePrefab(raw, "slime", "nest"), "renaming to an existing prefab should throw");
        await c.checkThrows(() => SettingsHandler.RenamePrefab(raw, "slime", "NONE"), "renaming to a default prefab should throw");
        await c.checkThrows(() => SettingsHandler.RenamePrefab(raw, "missing", "other"), "renaming a missing prefab should throw");

        SettingsHandler.RenamePrefab(raw, "slime", "ooze");
        c.check(SettingsHandler.FindPrefab(raw, "ooze")?.rotation === 10 && !SettingsHandler.FindPrefab(raw, "slime"), "RenamePrefab should rename the prefab");
        c.check(SettingsHandler.FindPrefab(raw, "kingSlime")?.extends === "ooze", "RenamePrefab should update prefabs extending it");
        c.check(SettingsHandler.FindPrefab(raw, "nest")?.children?.[0].extends === "ooze", "RenamePrefab should update children extending it");
        c.check(json(raw.categories!.monsters.entries) === json(["ooze"]) && json(raw.categories!.props.entries) === json(["rock", "ooze", "boulder"]),
            "RenamePrefab should update category entries: " + json(raw.categories));
        SettingsHandler.RenamePrefab(raw, "creature", "beast");
        c.check(raw.categories!.monsters.extends === "beast", "RenamePrefab should update a category's extends: " + raw.categories!.monsters.extends);
        c.check(SettingsHandler.IsBasePrefab(raw, "beast"), "a renamed base prefab should stay a base prefab");

        // the live settings: edit the raw data, then reprocess
        await this.settingsHandler.UpdateRaw(raw => SettingsHandler.RenamePrefab(raw, "slime", "ooze"));
        const ooze = this.AddGameObject("ooze");
        c.check(ooze.rotation === 10 && ooze.scale.x === 2, "a renamed prefab should keep its values and its category's extends: " + ooze.rotation + " " + ooze.scale.x);
        const king = this.AddGameObject("kingSlime");
        c.check(king.rotation === 10 && king.scale.x === 3, "a prefab extending a renamed prefab should still inherit from it: " + king.rotation + " " + king.scale.x);
        const egg = this.AddGameObject("nest").GetChildByName("egg");
        c.check(egg?.rotation === 10, "a child extending a renamed prefab should still inherit from it: " + egg?.rotation);
        c.check(SettingsHandler.FindPrefab(this.settingsData, "slime") === undefined, "the old name should be gone from the processed settings");

        await this.settingsHandler.UpdateRaw(raw =>
        {
            SettingsHandler.SetPrefab(raw, "ooze", { ...SettingsHandler.FindPrefab(raw, "ooze")!, rotation: 20 });
        });
        c.check(this.AddGameObject("kingSlime").rotation === 20, "a prefab change should reach prefabs extending it after reprocessing");

        // a settings child gets a runtime uid, so level objects can reference it; it's only kept when referenced
        const twig = this.settingsHandler.GetRawPrefab("nest").children!.find(child => child.name === "twig")!;
        const twigUID = twig.entityUID!;
        c.check(!!twigUID && this.settingsHandler.IsRuntimeGeneratedUID(twigUID), "a settings child should get a runtime uid: " + twigUID);
        c.check(this.settingsHandler.GetRawEntitiesMappedByUID()[twigUID] === twig, "a settings child should be findable by its uid");
        c.check(!this.settingsHandler.IsRuntimeGeneratedUID(undefined), "no uid should not count as a runtime uid");

        const unreferencingLevel = { entitiesByLayer: { objects: [{ extends: "nest" }] } } as unknown as LevelData;
        c.check(!SettingsHandler.PersistUIDsReferencedBy(unreferencingLevel) && this.settingsHandler.IsRuntimeGeneratedUID(twigUID),
            "a level not referencing a runtime uid should leave it a runtime uid");
        const referencingLevel = { entitiesByLayer: { objects: [{ extends: "nest", children: [{ extends: twigUID, rotation: 5 }] }] } } as unknown as LevelData;
        c.check(SettingsHandler.PersistUIDsReferencedBy(referencingLevel), "a level referencing a runtime uid should report it needs the settings saved");
        c.check(!this.settingsHandler.IsRuntimeGeneratedUID(twigUID), "a referenced runtime uid should become permanent");

        const registered: any = { name: "spawned" };
        this.settingsHandler.RegisterUnconstructedEntity(registered);
        const registeredUID = registered.entityUID;
        c.check(this.settingsHandler.GetUnconstructedEntity({ entityUID: registeredUID }) === registered, "a registered entity should be found by its uid");
        await this.settingsHandler.UpdateRaw(() => {});
        c.check(this.settingsHandler.GetUnconstructedEntity({ entityUID: registeredUID }) === registered, "a registered entity should survive reprocessing");
        this.settingsHandler.UnregisterUnconstructedEntity(registeredUID);
        c.check(this.settingsHandler.GetUnconstructedEntity({ entityUID: registeredUID }) === undefined && !this.settingsHandler.IsRuntimeGeneratedUID(registeredUID),
            "an unregistered entity should be forgotten");

        // a prefab extending a removed prefab can't be processed, the editor has to deal with it before removing
        const withoutPebble = Helper.DeepCopy(this.settingsHandler.GetRaw());
        SettingsHandler.RemovePrefab(withoutPebble, "pebble");
        await c.checkThrows(() => new SettingsHandler(this).Process(withoutPebble), "a prefab extending a removed prefab should fail processing");

        // removing a prefab drops the children referencing it
        await this.settingsHandler.UpdateRaw(raw =>
        {
            SettingsHandler.RemovePrefab(raw, "bigPebble");
            SettingsHandler.RemovePrefab(raw, "pebble");
        });
        const nestChildren = this.settingsHandler.GetRawPrefab("nest").children?.map(child => child.name) ?? [];
        c.check(json(nestChildren) === json(["egg", "twig"]), "a child extending a removed prefab should be removed: " + json(nestChildren));
        const dangling = this.settingsHandler.RemoveDanglingReferences([
            { name: "keep", extends: "nest" },
            { name: "keepUID", extends: twigUID },
            { name: "keepCategoryEntry", extends: "boulder" },
            { name: "drop", extends: "pebble" },
            { name: "parent", children: [{ name: "dropChild", extends: "pebble" }, { name: "keepChild" }] },
        ] as any);
        c.check(json(dangling.map(entity => entity.name)) === json(["keep", "keepUID", "keepCategoryEntry", "parent"]) && json(dangling[3].children!.map(child => child.name)) === json(["keepChild"]),
            "RemoveDanglingReferences should drop entities, and children, extending a missing prefab: " + json(dangling));

        // what's filtered out before saving the settings data
        const toSave = Helper.DeepCopy(this.settingsHandler.GetRaw()) as any;
        toSave.prefabs[0].__fields = [{ name: "rotation" }];
        toSave.prefabs[0].__buttons = [];
        toSave.prefabs.find((prefab: any) => prefab.name === "nest").children[0].id = 12;
        toSave.prefabs.find((prefab: any) => prefab.name === "nest").children[0].components = { thing: { __fields: [], value: 1 } };
        this.settingsHandler.FilterSettingsDataDefaults(toSave);
        const savedNest = toSave.prefabs.find((prefab: any) => prefab.name === "nest");
        c.check(!json(toSave).includes("__fields") && !json(toSave).includes("__buttons"), "inspector metadata should not be saved: " + json(toSave.prefabs[0]));
        c.check(savedNest.children[0].id === undefined, "runtime ids should not be saved");
        c.check(savedNest.children[0].components.thing.value === 1, "stripping metadata should keep the rest of the data");
        c.check(!toSave.basePrefabs.some((prefab: any) => prefab.name === "NONE"), "NONE should not be saved");
        c.check(toSave.basePrefabs.find((prefab: any) => prefab.name === "ANY")?.texture === "PIXEL", "a changed ANY should be saved");

        const defaultsOnly = { basePrefabs: [{ name: "ANY" }, { name: "NONE" }], prefabs: [] } as any;
        this.settingsHandler.FilterSettingsDataDefaults(defaultsOnly);
        c.check(defaultsOnly.basePrefabs.length === 0, "an unchanged ANY should not be saved: " + json(defaultsOnly.basePrefabs));

        c.flush();
    }
}
