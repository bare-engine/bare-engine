import { CameraScaleMode, Color, GameObject, SaveData, Scene, TweenTo, Vec2 } from "bare-engine";
import { Checks } from "./checks";

// covers docs/reference: bare, objects, input, tweens, camera, scene-manager, level, save-data, math, globals

declare module "bare-engine"
{
    namespace SaveData
    {
        let docHighScore: number;
        let docUnlocked: Set<string>;
        let docTimes: Map<string, number>;
    }
}

class HelperScene extends Scene
{
    startCount = 0;
    OnStart() { this.startCount++; }
}

class OtherScene extends Scene {}

class StickyScene extends Scene
{
    constructor()
    {
        super({ persistent: true });
    }
}

export class DocsReferenceTest extends Scene
{
    checks = new Checks();
    running = false;
    done = false;

    constructor()
    {
        // persistent, so the Goto checks below don't remove the test itself
        super({
            settingsData: {
                basePrefabs: [{ name: "ANY", texture: "PIXEL" }],
                prefabs: [{ name: "hero" }],
                layers: ["background", "objects"],
            },
            persistent: true,
        });
    }

    // runs from the first update: tweens and timers don't advance until the scene's OnStart has finished,
    // so awaiting a tween inside OnStart would never resolve
    async RunChecks()
    {
        const c = this.checks;

        // --- the bare object
        c.check(bare.fixedTimestep === 1 / 60, "fixedTimestep should default to 1/60");
        c.check(typeof bare.deltaTime === "number" && bare.deltaTime >= 0, "deltaTime should be a number of seconds");
        const count = bare.count;
        await waitFrame(2);
        c.check(bare.count > count, "bare.count should increase as frames render");
        c.check(typeof bare.gameSpeed === "number", "gameSpeed should be a number");
        c.check(bScene === this, "bScene should be the current scene");
        c.check(isDev === __DEV__, "isDev should follow __DEV__");
        c.check(typeof bare.mobile === "boolean" && typeof bare.hasFocus === "boolean", "bare.mobile and bare.hasFocus should be booleans");

        const pausedBefore = bare.paused;
        bare.TogglePause();
        c.check(bare.paused === !pausedBefore, "TogglePause should flip bare.paused");
        bare.TogglePause();
        c.check(bare.paused === pausedBefore, "TogglePause should flip bare.paused back");

        // --- objects
        const hero = this.AddGameObject("hero");
        hero.name = "docHero";
        const child = hero.AddChild();
        child.name = "docChild";
        c.check(bare.object.GetByName("docHero") === hero, "GetByName should find the object");
        c.check(bare.object.GetByName("docChild") === null, "GetByName should not search children");
        c.check(bare.object.GetByName("nobody") === null, "GetByName should return null when missing");
        c.check(bare.object.GetById(child.uniqueID) === child, "GetById should search children by default");
        c.check(bare.object.GetById(child.uniqueID, false) === null, "GetById(id, false) should skip children");
        c.check(bare.object.GetAll().includes(hero) && !bare.object.GetAll().includes(child), "GetAll should list objects without children");
        c.check(bare.object.GetLayerOf(new GameObject(this)) === -1, "GetLayerOf should be -1 for an object on no layer");

        const bgIndex = bare.object.GetLayers().indexOf(bare.object.GetLayerByName("background"));
        bare.object.MoveToLayer(hero, bgIndex);
        c.check(bare.object.GetLayerOf(hero) === bgIndex, "MoveToLayer should move the object");
        c.check(bare.object.GetLayer(bgIndex) === bare.object.GetLayerByName("background"), "GetLayer(index) should match GetLayerByName");
        const second = this.AddGameObject("hero", "background");
        bare.object.MoveWithinLayer(second, 0);
        c.check(bare.object.GetLayerByName("background")[0] === second, "MoveWithinLayer should move to the index");
        bare.object.BringToFront(second);
        const bgLayer = bare.object.GetLayerByName("background");
        c.check(bgLayer[bgLayer.length - 1] === second, "bare.object.BringToFront should move to the end");

        // --- input: keyboard
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "d" }));
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "d" }));
        c.check(bare.keyboard.IsKeyDown("d"), "IsKeyDown should be true while held");
        c.check(bare.keyboard.IsRightDown(), "IsRightDown should include WASD");
        c.check(bare.keyboard.IsAnyKeyDown(), "IsAnyKeyDown should be true");
        c.check(bare.keyboard.GetKeysDown().includes("d"), "GetKeysDown should list held keys");
        window.dispatchEvent(new KeyboardEvent("keyup", { key: "d" }));
        document.dispatchEvent(new KeyboardEvent("keyup", { key: "d" }));
        c.check(bare.keyboard.IsKeyUp("d"), "IsKeyUp should be true after release");
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
        c.check(bare.keyboard.IsKeyDown("arrowUp"), "key names should have a lowercase first letter");
        c.check(bare.keyboard.IsUpDown(), "IsUpDown should include arrow keys");
        bare.keyboard.ClearAll();
        c.check(!bare.keyboard.IsAnyKeyDown(), "ClearAll should reset key state");

        // --- input: hitbox helpers exist
        bare.hitbox.SetCircleHitbox(hero, 10);
        bare.hitbox.SetShowPointerCursor(hero, true);
        c.check(bare.hitbox.GetCurrentDown() == null, "GetCurrentDown should be empty without a press");

        // --- tweens
        const box = this.AddGameObject("hero").SetPosition(0, 0);
        const tween = TweenTo(box, 0.05, { x: 100 });
        await tween.promise;
        c.check(Math.abs(box.x - 100) < 0.001, "awaiting a tween's promise should end at the target");

        TweenTo(box, 0.05, { y: "+=10" } as any);
        bare.tween.FinishAllFrom(box);
        c.check(Math.abs(box.y - 10) < 0.001, "relative '+=10' should add, FinishAllFrom should jump to the end: " + box.y);

        bare.tween.RemoveAllFrom(box);
        TweenTo(box, 1, { x: 0 });
        TweenTo(box, 1, { x: 50 });
        c.check(bare.tween.GetAllFrom(box).length === 1, "a new tween on the same property should replace the old one: " + bare.tween.GetAllFrom(box).length);
        TweenTo(box, 1, { x: 25 }, false);
        c.check(bare.tween.GetAllFrom(box).length === 2, "overwrite false should keep both tweens: " + bare.tween.GetAllFrom(box).length);
        bare.tween.RemoveAllFrom(box);
        c.check(bare.tween.GetAllFrom(box).length === 0, "RemoveAllFrom should stop all tweens");

        let timerFired = false;
        bare.tween.SetTimer(0.02, () => timerFired = true);
        await wait(0.1);
        c.check(timerFired, "SetTimer should call after the delay");

        let removedTimerFired = false;
        bare.tween.SetTimer(0.02, () => removedTimerFired = true);
        bare.tween.RemoveTimers();
        await wait(0.1);
        c.check(!removedTimerFired, "RemoveTimers should cancel timers");

        const shaker = this.AddGameObject("hero");
        bare.tween.Shake(shaker, "innerRotation", 0.05, 20);
        await wait(0.2);
        c.check(Math.abs(shaker.innerRotation) < 0.001, "Shake should settle back to 0: " + shaker.innerRotation);

        // --- camera
        bare.camera.SetPosition(120, 80);
        const camPos = bare.camera.GetPosition().clone();
        c.check(camPos.x === 120 && camPos.y === 80, "SetPosition/GetPosition should round-trip: " + JSON.stringify(camPos));
        bare.camera.AddPosition(10, -5);
        c.check(bare.camera.GetPosition().x === 130 && bare.camera.GetPosition().y === 75, "AddPosition should move the camera: " + JSON.stringify(bare.camera.GetPosition()));
        bare.camera.SetZoom(2);
        c.check(bare.camera.GetZoom() === 2, "SetZoom/GetZoom should round-trip");
        const world = bare.camera.ScreenToWorld(50, 60);
        const screen = bare.camera.WorldToScreen(world.x, world.y);
        c.check(Math.abs(screen.x - 50) < 0.001 && Math.abs(screen.y - 60) < 0.001, "ScreenToWorld and WorldToScreen should be inverses");
        bare.camera.SetBounds({ x: 0, y: 0, width: 4000, height: 4000 });
        bare.camera.SetPosition(-500, -500);
        const clamped = bare.camera.GetPosition();
        c.check(clamped.x > 0 && clamped.y > 0, "SetPosition should keep the camera inside its bounds right away: " + JSON.stringify(clamped));
        bare.camera.DisableBounds();
        bare.camera.SetScaleMode(CameraScaleMode.None);
        bare.camera.SetZoom(1);
        bare.camera.StartShake(8, 0.1);
        bare.camera.StopShake();

        // --- scene manager
        const helper = await bare.scene.Add(HelperScene) as HelperScene;
        c.check(bare.scene.Has(HelperScene), "Has should be true for a running scene");
        c.check(bare.scene.GetAll().includes(helper), "GetAll should list running scenes");
        const replaced = await bare.scene.Add(HelperScene) as HelperScene;
        c.check(replaced !== helper && bare.scene.GetAll().filter((s) => s instanceof HelperScene).length === 1, "adding the same class again should replace the existing scene");
        const instance = new OtherScene();
        c.check(await bare.scene.Add(instance) === instance, "Add should accept a scene instance");

        bare.scene.MoveToBack(instance);
        c.check(bare.scene.GetAll()[0] === instance, "MoveToBack should draw it first");
        c.check(bare.scene.GetMainScene() === instance, "GetMainScene should be the first scene in draw order");
        bare.scene.MoveToFront(instance);
        const all = bare.scene.GetAll();
        c.check(all[all.length - 1] === instance || all.slice(all.indexOf(instance) + 1).every((s) => s.UI), "MoveToFront should draw it last (below UI scenes)");

        const sticky = await bare.scene.Add(StickyScene);
        await bare.scene.Goto(OtherScene);
        c.check(bare.scene.Has(StickyScene) && bare.scene.GetAll().includes(this), "Goto should keep persistent scenes");
        c.check(!bare.scene.Has(HelperScene), "Goto should remove nonpersistent scenes");
        bare.scene.Remove(sticky);
        c.check(!bare.scene.Has(StickyScene), "Remove should remove a persistent scene when targeted");
        bare.scene.Remove(OtherScene);

        const moved = this.AddGameObject("hero");
        const target = await bare.scene.Add(HelperScene);
        bare.scene.MoveGameObjectTo(moved, target);
        c.check(moved.scene === target, "MoveGameObjectTo should move the object to the scene");
        bare.scene.Remove(target);

        // --- level
        await bare.level.Load("docsRefLevel");
        const lvlHero = bare.object.GetByName("lvlHero");
        c.check(lvlHero?.x === 5, "bare.level.Load should load a level file by name");
        lvlHero!.x = 99;
        await bare.level.Restart();
        c.check(bare.object.GetByName("lvlHero")?.x === 5, "bare.level.Restart should reload the level as loaded: " + JSON.stringify(bare.object.GetAll().map((o) => o.name + "@" + o.x)));
        const dataLevel = { name: "dataOnlyLevel", dimensions: { width: 800, height: 600 }, entitiesByLayer: { objects: [{ extends: "hero", name: "dataHero", position: { x: 7, y: 8 } }] } } as any;
        await bare.level.Load(dataLevel);
        bare.object.GetByName("dataHero")!.x = 99;
        await bare.level.Restart();
        c.check(bare.object.GetByName("dataHero")?.x === 7, "Restart should reload a level that was loaded from data");

        await bare.level.Load("noSuchLevel");
        c.check(this.render, "a failed level load should keep the scene rendering");
        await bare.level.Load("docsRefLevel");

        const extra ={ name: "extraLevel", dimensions: { width: 800, height: 600 }, entitiesByLayer: { objects: [{ extends: "hero", name: "extraHero" }] } } as any;
        await bare.level.LoadOnly(extra);
        c.check(bare.object.GetByName("lvlHero") !== null && bare.object.GetByName("extraHero") !== null, "LoadOnly should not clear the scene first: " + JSON.stringify(bare.object.GetAll().map((o) => o.name)));

        // --- save data
        bare.storage.SetDefaults({ docHighScore: 0, docUnlocked: new Set<string>(), docTimes: new Map<string, number>() });
        c.check(SaveData.docHighScore === 0, "SetDefaults should add fields with defaults");
        SaveData.docHighScore = 1200;
        SaveData.docUnlocked.add("level2");
        SaveData.docTimes.set("level1", 42);
        bare.storage.Save();
        SaveData.docHighScore = 1;
        SaveData.docUnlocked = new Set();
        SaveData.docTimes = new Map();
        bare.storage.Load();
        c.check(SaveData.docHighScore === 1200, "Save then Load should restore numbers");
        c.check(SaveData.docUnlocked instanceof Set && SaveData.docUnlocked.has("level2"), "Save then Load should restore a Set");
        c.check(SaveData.docTimes instanceof Map && SaveData.docTimes.get("level1") === 42, "Save then Load should restore a Map");
        bare.storage.Clear();
        bare.storage.Load();
        c.check(SaveData.docHighScore === 0, "Clear should delete the save, so Load uses defaults: " + SaveData.docHighScore);

        // --- math: Vec2
        const a = new Vec2(10, 20);
        const b = a.add(new Vec2(5, 5));
        c.check(b.x === 15 && b.y === 25 && a.x === 10, "Vec2.add should return a new vector");
        a.set(0, 0);
        c.check(a.isZero(), "Vec2.set should change the vector");
        c.check(new Vec2(3, 4).length() === 5 && new Vec2(3, 4).squaredLength() === 25, "length and squaredLength");
        c.check(new Vec2(0, 0).distanceTo(new Vec2(3, 4)) === 5, "distanceTo");
        c.check(Math.abs(new Vec2(3, 4).normalized().length() - 1) < 1e-9, "normalized should have length 1");
        c.check(Math.abs(new Vec2(0, 1).angle() - Math.PI / 2) < 1e-9, "angle should be in radians");
        const fromAngle = Vec2.fromAngle(0);
        c.check(Math.abs(fromAngle.x - 1) < 1e-9 && Math.abs(fromAngle.y) < 1e-9, "fromAngle(0) should point right");
        c.check(Vec2.fromArray([[1, 2], [3, 4]])[1].y === 4, "fromArray should build a list of vectors");
        c.check(new Vec2(1, 2).dot(new Vec2(3, 4)) === 11, "dot product");
        c.check(new Vec2(1, 2).multiply(2).equals(new Vec2(2, 4)), "multiply by a number");
        const clone = b.clone();
        clone.set(0, 0);
        c.check(b.x === 15, "clone should copy");

        // --- math: Color
        const red = new Color(255, 0, 0);
        c.check(red.a === 255, "Color alpha should default to 255");
        const blue = Color.fromHex("#3060c0");
        c.check(blue.r === 0x30 && blue.g === 0x60 && blue.b === 0xc0, "fromHex should parse #rrggbb");
        c.check(Color.fromHex("#ffffff80").a === 0x80, "fromHex should parse #rrggbbaa alpha");
        c.check(blue.toHex().toLowerCase().startsWith("#3060c0"), "toHex should round-trip: " + blue.toHex());
        c.check(Color.fromNorm(1, 0, 0).r === 255, "fromNorm should use 0-1 values");
        c.check(red.clone().equals(red), "clone and equals");
        c.check(Color.Orange instanceof Color && Color.Transparent instanceof Color, "named colors should exist");

        // --- math: util
        for (let i = 0; i < 20; i++)
        {
            const r = bare.util.RandomRange(1, 6);
            if (r < 1 || r > 6)
                c.check(false, "RandomRange should stay in range: " + r);
        }
        c.check(["red", "green", "blue"].includes(bare.util.Choose("red", "green", "blue")), "Choose should return one of the items");
        c.check(bare.util.Clamp(150, 0, 100) === 100 && bare.util.Clamp(-5, 0, 100) === 0, "Clamp");
        c.check(bare.util.Lerp(0, 10, 0.5) === 5, "Lerp");
        c.check(bare.util.GetRanged(0, 10, 0, 100, 5) === 50, "GetRanged should map between ranges");
        c.check(Math.abs(bare.util.DegreesToRadians(180) - Math.PI) < 1e-9 && Math.abs(bare.util.RadiansToDegrees(Math.PI) - 180) < 1e-9, "angle conversions");
        c.check(Math.abs(bare.util.Direction(new Vec2(0, 0), new Vec2(0, 10)) - 90) < 1e-9, "Direction(from, to) should point from `from` to `to`, in degrees");
        c.check(Math.abs(bare.util.Direction(new Vec2(0, 0), new Vec2(-10, 0)) - 180) < 1e-9, "Direction should point left for a target on the left");
        const towards = bare.util.PointTowards(90, 5);
        c.check(Math.abs(towards.x) < 1e-9 && Math.abs(towards.y - 5) < 1e-9, "PointTowards(90, 5) should point down by 5: " + JSON.stringify(towards));
        const from = new Vec2(3, 4);
        const to = new Vec2(13, 4);
        const back = bare.util.PointTowards(bare.util.Direction(from, to), from.distanceTo(to)).add(from);
        c.check(Math.abs(back.x - 13) < 1e-9 && Math.abs(back.y - 4) < 1e-9, "PointTowards(Direction(from, to), distance) from `from` should reach `to`");
        c.check(bare.util.AlmostEqual(1, 1.0000001), "AlmostEqual");
        c.check(Math.abs(bare.util.AngleDifference(350, 10)) === 20, "AngleDifference should be the smallest difference: " + bare.util.AngleDifference(350, 10));
        const deep = { a: { b: 1 } };
        const copy = bare.util.DeepCopy(deep);
        copy.a.b = 2;
        c.check(deep.a.b === 1, "DeepCopy should copy nested objects");

        // --- globals: waits
        let waited = false;
        void wait(10).then(() => waited = true);
        cancelWaits();
        await waitFrame();
        c.check(!waited, "cancelWaits should leave cancelled waits pending");

        let persistentWaited = false;
        void wait(0.01, true).then(() => persistentWaited = true);
        cancelWaits();
        await wait(0.1, true);
        c.check(persistentWaited, "persistent waits should survive cancelWaits");

        this.done = true;
    }

    OnUpdate(): void
    {
        if (!this.running)
        {
            this.running = true;
            void this.RunChecks();
        }

        if (!this.done)
            return;

        this.done = false;
        this.checks.flush();
        bare.scene.Remove(this);
    }
}
