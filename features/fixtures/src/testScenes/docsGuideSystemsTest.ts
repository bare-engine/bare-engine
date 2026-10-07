import
{
    AnimationComponent,
    AnimationEvent,
    BareEvent,
    Button,
    CollisionHandlingType,
    Color,
    LevelData,
    OutlineShader,
    ParticleComponent,
    RenderTexture,
    Scene,
    TextComponent,
    TextObject,
} from "bare-engine";
import { Checks } from "./checks";

// covers docs/guide: levels-and-layers, events, animations, particles, text-and-ui, rendering, mobile

declare module "bare-engine"
{
    interface BareUserEvents
    {
        coinCollected: { value: number };
    }
}

class HUD extends Scene
{
    constructor()
    {
        super({ UI: true, resize: true });
    }
}

export class DocsGuideSystemsTest extends Scene
{
    checks = new Checks();
    preLoaded?: string;
    postLoaded?: string;

    constructor()
    {
        super({
            basePrefabs: [
                { name: "ANY", texture: "PIXEL" },
            ],
            prefabs: [
                { name: "hero" },
                { name: "saw", components: { animation: {} } },
                { name: "explosion", texture: "NONE", components: { animation: {} } },
                { name: "coin", components: { particle: "SPARKLE" } },
                { name: "label", baseClass: "TextObject", text: "Hi", fontSize: 12 } as any,
            ],
            presets: {
                SPARKLE: { particle: { texture: "PIXEL", life: 1, emitRate: 5 } },
            },
            animations: {
                hero_walk: { frames: ["PIXEL", "PIXEL"], framesPerSecond: 10 },
                hero_jump: { frames: ["PIXEL"], loop: false },
                saw: { frames: ["PIXEL", "PIXEL"] },
                explosion_big: { frames: ["PIXEL"], loop: false },
                hero_numbered: { frames: ["walk1#2+4+6#8"] },
                hero_padded: { frames: ["walk_00#03"] },
            },
            layers: ["background", "objects"],
            layersInfo: {
                background: { pointerCollisionType: "RADIUS" },
            },
        } as any);
    }

    override OnAwake(): void
    {
        // the text guide doesn't mention it, but a TextObject baseClass needs registering like any other
        bare.AddClass(TextObject);
        // projects get components from settingsData.json registered by the vite plugin; these settings are inline
        bare.AddClass(ParticleComponent);
    }

    override async OnPreLoadLevel(level: LevelData) { this.preLoaded = level?.name; }
    override async OnPostLoadLevel(level: LevelData) { this.postLoaded = level?.name; }

    override async OnStart()
    {
        const c = this.checks;

        // layers: objects exists and comes after background; Data.Layer equivalents by name
        const layers = bare.object.GetLayers();
        c.check(layers.indexOf(bare.object.GetLayerByName("background")) < layers.indexOf(bare.object.GetLayerByName("objects")), "later layers should draw on top");
        c.check(bare.object.GetLayerByName("missing").length === 0, "GetLayerByName should be empty for an unknown layer");

        // levels: load from data, persistent objects survive, pre/post hooks run
        const keep = this.AddGameObject("hero");
        keep.persistent = true;
        const temp = this.AddGameObject("hero");
        const level: LevelData = {
            name: "docLevel",
            dimensions: { width: 1536, height: 1152 },
            entitiesByLayer: {
                objects: [{ extends: "hero", name: "levelHero", position: { x: 100, y: 800 } }],
            },
        } as any;
        await this.LoadLevel(level as any);
        c.check(this.preLoaded === "docLevel" && this.postLoaded === "docLevel", "OnPreLoadLevel and OnPostLoadLevel should run around loading");
        const levelHero = bare.object.GetByName("levelHero");
        c.check(levelHero?.x === 100 && levelHero?.y === 800, "level entities should become GameObjects with their position");
        c.check(keep.scene === this && bare.object.GetAll().includes(keep), "persistent objects should survive loading a level");
        c.check(!bare.object.GetAll().includes(temp), "nonpersistent objects should be cleared by loading a level");
        keep.persistent = false;
        keep.Remove();

        // events: emit/on, once, off, alias, SendEvent
        let total = 0;
        bare.events.on("coinCollected", ({ value }) => total += value);
        bare.events.emit("coinCollected", { value: 10 });
        c.check(total === 10, "scene events should deliver the payload");

        let onceCount = 0;
        bare.events.once("coinCollected", () => onceCount++);
        bare.events.emit("coinCollected", { value: 0 });
        bare.events.emit("coinCollected", { value: 0 });
        c.check(onceCount === 1, "once should only fire the first time");

        let offCount = 0;
        const handler = () => offCount++;
        bare.events.on("coinCollected", handler);
        bare.events.off("coinCollected", handler);
        bare.events.emit("coinCollected", { value: 0 });
        c.check(offCount === 0, "off should remove the listener");

        let aliasCount = 0;
        bare.events.on("coinCollected", () => aliasCount++, "drag");
        bare.events.offAlias("drag");
        bare.events.emit("coinCollected", { value: 0 });
        c.check(aliasCount === 0, "offAlias should remove the aliased listener");

        let sceneGot = 0;
        let globalGot = 0;
        bare.events.on("docPing" as any, () => sceneGot++);
        const globalHandler = () => globalGot++;
        bare.globalEvents.on("docPing" as any, globalHandler);
        bare.SendEvent("docPing" as any);
        bare.globalEvents.off("docPing" as any, globalHandler);
        c.check(sceneGot === 1 && globalGot === 1, "SendEvent should reach scene events and global events");

        // events: ordinary listeners are cleared on restart, persistent ones are not (checked after restart below)
        let added = 0;
        bare.events.on(BareEvent.game_objectAdded, () => added++);
        this.AddGameObject();
        c.check(added >= 1, "game_objectAdded should fire when an object is added");

        // animations
        const hero = this.AddGameObject("hero");
        const anim = hero.AddComponent(AnimationComponent);
        let started = 0;
        anim.events.on(AnimationEvent.started, () => started++);
        await anim.Play("walk");
        c.check(started === 1, "Play should start the animation and emit started");
        c.check(bare.asset.GetAnimation("hero_walk") !== undefined, "GetAnimation should return settings animations");

        const numbered = bare.asset.GetAnimation("hero_numbered") as any;
        const numberedFrames = (numbered?.frames ?? numbered?.frameNames ?? []).map((f: any) => typeof f === "string" ? f : f?.name ?? f?.textureName);
        c.check(numberedFrames.join(",") === "walk1,walk2,walk4,walk6,walk7,walk8", "walk1#2+4+6#8 should expand: " + JSON.stringify(numbered));
        const padded = bare.asset.GetAnimation("hero_padded") as any;
        const paddedFrames = (padded?.frames ?? padded?.frameNames ?? []).map((f: any) => typeof f === "string" ? f : f?.name ?? f?.textureName);
        c.check(paddedFrames.join(",") === "walk_00,walk_01,walk_02,walk_03", "walk_00#03 should expand with padding: " + JSON.stringify(padded));

        bare.asset.AddAnimation("hero_code", ["PIXEL"], 8, true, false);
        c.check(bare.asset.GetAnimation("hero_code") !== undefined, "AddAnimation should define an animation");

        const saw = this.AddGameObject("saw");
        c.check(saw.GetComponent(AnimationComponent) != null, "prefab animation component should attach");

        const explosion = this.AddGameObject("-explosion");
        c.check(explosion.name === "explosion", "a '-' prefix should still resolve the prefab");
        c.check(explosion.GetComponent(AnimationComponent) != null, "'-' prefab should keep its components");

        // particles: from a prefab preset and from code
        const coin = this.AddGameObject("coin");
        const particle = coin.GetComponent(ParticleComponent);
        c.check(particle?.emitter != null, "particle preset should attach a ParticleComponent with an emitter");
        particle?.Fire();

        const emitter = bare.particle.CreateEmitter({ texture: "PIXEL", life: 0.8, emitRate: 20, emitShape: "CIRCLE", emitRadius: 10 } as any);
        bare.particle.Add(emitter, { autoStart: true });
        c.check(bare.particle.Has(emitter), "Add should register the emitter");
        bare.particle.OneShot(emitter, { position: hero.position });
        bare.particle.Remove(emitter);
        c.check(!bare.particle.Has(emitter), "Remove should unregister the emitter");

        // text and ui
        const score = new TextObject(this, { text: "Score: 0", fontSize: 32, fill: "#ffffff" });
        this.AddGameObject(score).SetPosition(20, 20);
        score.SetText("Score: 10");
        c.check(score.GetText() === "Score: 10", "SetText should change the text");

        const prefabText = this.AddGameObject("label");
        c.check(prefabText instanceof TextObject, "a TextObject baseClass prefab should create a TextObject");

        const labelled = this.AddGameObject("hero");
        const label = labelled.AddComponent(TextComponent, { text: "Goblin", fontSize: 16 } as any);
        label.offset.set(0, -40);
        label.SetText("Angry goblin");
        c.check(label.GetText() === "Angry goblin", "TextComponent SetText should change the text");

        let pressed = 0;
        const play = new Button(this, { text: "Play", fontSize: 28, buttonColor: Color.fromHex("#3060c0"), OnPress: () => pressed++ } as any);
        this.AddGameObject(play).SetPosition(bare.width / 2, bare.height / 2).CenterPivot();
        c.check(play instanceof Button, "Button should be a GameObject you can add");

        const hud = await bare.scene.Add(HUD);
        const gameIndex = bare.scene.GetAll().indexOf(this);
        c.check(bare.scene.GetAll().indexOf(hud) > gameIndex, "UI scenes should be kept above non-UI scenes");
        bare.scene.Remove(hud);

        const ui = bare.uiScene;
        c.check(ui === bare.uiScene, "bare.uiScene should be created once and reused");

        const anchored = this.AddGameObject("hero").SetPosition(bare.width, 0).SetPivot(1, 0);
        c.check(anchored.x === bare.width && anchored.pivot.x === 1, "SetPivot anchoring should chain");

        // rendering: shaders, masks, render textures
        const outlined = this.AddGameObject("hero");
        outlined.AddShader(OutlineShader);
        c.check(outlined.HasShader(OutlineShader), "HasShader should be true after AddShader");
        outlined.RemoveShader(OutlineShader);
        c.check(!outlined.HasShader(OutlineShader), "RemoveShader should remove the shader");

        const flower = this.AddGameObject("hero");
        flower.SetMask(outlined);
        flower.RemoveMask();

        const canvas = new RenderTexture(rapid, { width: 64, height: 64 });
        this.AddGameObject(canvas as any);
        this.RenderTo(hero, canvas);
        bare.asset.AddTexture("docCanvas", canvas as any);
        c.check(bare.asset.HasTexture("docCanvas"), "AddTexture should register a texture by name");
        bare.asset.RemoveTexture("docCanvas");
        c.check(!bare.asset.HasTexture("docCanvas"), "RemoveTexture should forget the texture");

        // mobile: pointer collision type per layer
        this.SetPointerCollisionTypeForLayer(CollisionHandlingType.RADIUS, "objects");

        // persistent scene listeners survive restart, ordinary ones don't
        if (!this.restarted)
        {
            this.restarted = true;
            this.persistentHits = 0;
            this.ordinaryHits = 0;
            bare.events.persistent.on("docRestart" as any, () => this.persistentHits++);
            bare.events.on("docRestart" as any, () => this.ordinaryHits++);
            this.restartChecks = c;
            void this.Restart();
            return;
        }
    }

    restarted = false;
    persistentHits = 0;
    ordinaryHits = 0;
    restartChecks?: Checks;

    override OnUpdate(): void
    {
        if (!this.restartChecks || !this.restarted)
            return;

        const c = this.restartChecks;
        this.restartChecks = undefined;
        bare.events.emit("docRestart" as any);
        c.check(this.persistentHits === 1, "persistent scene listeners should survive a restart");
        c.check(this.ordinaryHits === 0, "ordinary scene listeners should be cleared on restart");
        c.flush();
    }
}
