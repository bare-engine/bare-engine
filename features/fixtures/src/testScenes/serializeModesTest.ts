import { Component, ComponentController, GameMode, GameObject, Run, Scene, SerializeField, TextObject } from "bare-engine";
import { Checks } from "./checks";

// covers docs/reference/inspector-decorators: @SerializeField(...modes) and @Run(...modes)

export class ModesComponent extends Component
{
    @SerializeField always = 1;
    @SerializeField(GameMode.Edit) editOnly = 1;
    @SerializeField(GameMode.Play) playOnly = 1;
    @SerializeField(GameMode.Edit, GameMode.Play) both = 1;
}

export class ModesObject extends GameObject
{
    @SerializeField always = 1;
    @SerializeField(GameMode.Edit) editOnly = 1;
    @SerializeField(GameMode.Play) playOnly = 1;
}

// redeclares a field of its parent with other modes
export class ModesObjectChild extends ModesObject
{
    @SerializeField(GameMode.Play) override editOnly = 1;
    @SerializeField(GameMode.Edit) childEditOnly = 1;
}

// a TextObject whose text is saved while playing too, through saveVars
export class SavedText extends TextObject {}

@Run(GameMode.Edit)
export class EditRunComponent extends Component
{
    awoken = false;
    override OnAwake(): void { this.awoken = true; }
}

@Run(GameMode.Play)
export class PlayRunComponent extends Component
{
    awoken = false;
    override OnAwake(): void { this.awoken = true; }
}

@Run(GameMode.Edit, GameMode.Play)
export class BothRunComponent extends Component
{
    awoken = false;
    override OnAwake(): void { this.awoken = true; }
}

export class PlainRunComponent extends Component
{
    awoken = false;
    override OnAwake(): void { this.awoken = true; }
}

export class SerializeModesTest extends Scene
{
    checks = new Checks();

    constructor()
    {
        super({
            basePrefabs: [{ name: "ANY", texture: "PIXEL" }],
            prefabs: [{ name: "modes", baseClass: "ModesObject" }],
            saveVars: { SavedText: ["text"] },
        } as any);
    }

    override OnAwake(): void
    {
        bare.AddClass(ComponentController);
        bare.AddClass(ModesComponent);
        bare.AddClass(ModesObject);
        bare.AddClass(ModesObjectChild);
        bare.AddClass(TextObject);
        bare.AddClass(SavedText);
    }

    // serializes like the editor does, without leaving play mode
    InMode<T>(mode: GameMode, fn: () => T): T
    {
        const previous = bare.gameMode;
        bare.gameMode = mode;
        try { return fn(); }
        finally { bare.gameMode = previous; }
    }

    Serialize(obj: GameObject, mode: GameMode): any
    {
        return this.InMode(mode, () => this.level.SerializeObject(obj));
    }

    override OnStart(): void
    {
        const c = this.checks;
        const json = (value: any) => JSON.stringify(value);

        // component fields
        const holder = this.AddGameObject();
        const comp = holder.AddComponent(ModesComponent);
        comp.always = comp.editOnly = comp.playOnly = comp.both = 2;

        const playComp = this.Serialize(holder, GameMode.Play).components?.modes ?? {};
        c.check(playComp.always === 2, "a bare @SerializeField component field should be saved while playing: " + json(playComp));
        c.check(playComp.editOnly === undefined, "a GameMode.Edit component field should not be saved while playing: " + json(playComp));
        c.check(playComp.playOnly === 2, "a GameMode.Play component field should be saved while playing: " + json(playComp));
        c.check(playComp.both === 2, "a field with both modes should be saved while playing: " + json(playComp));

        const editComp = this.Serialize(holder, GameMode.Edit).components?.modes ?? {};
        c.check(editComp.always === 2, "a bare @SerializeField component field should be saved in the editor: " + json(editComp));
        c.check(editComp.editOnly === 2, "a GameMode.Edit component field should be saved in the editor: " + json(editComp));
        c.check(editComp.playOnly === undefined, "a GameMode.Play component field should not be saved in the editor: " + json(editComp));
        c.check(editComp.both === 2, "a field with both modes should be saved in the editor: " + json(editComp));

        // GameObject class fields
        const obj = this.AddGameObject<ModesObject>(ModesObject);
        obj.always = obj.editOnly = obj.playOnly = 2;

        const playObj = this.Serialize(obj, GameMode.Play);
        c.check(playObj.always === 2 && playObj.playOnly === 2, "bare and GameMode.Play object fields should be saved while playing: " + json(playObj));
        c.check(playObj.editOnly === undefined, "a GameMode.Edit object field should not be saved while playing: " + json(playObj));

        const editObj = this.Serialize(obj, GameMode.Edit);
        c.check(editObj.always === 2 && editObj.editOnly === 2, "bare and GameMode.Edit object fields should be saved in the editor: " + json(editObj));
        c.check(editObj.playOnly === undefined, "a GameMode.Play object field should not be saved in the editor: " + json(editObj));

        // an unchanged field is not saved, whatever its mode
        const untouched = this.AddGameObject("modes");
        const untouchedEntity = this.Serialize(untouched, GameMode.Play);
        c.check(untouchedEntity.always === undefined && untouchedEntity.playOnly === undefined, "unchanged fields should not be saved: " + json(untouchedEntity));

        // a subclass redeclaring a field uses its own modes, and inherits the rest
        const child = this.AddGameObject<ModesObjectChild>(ModesObjectChild);
        child.always = child.editOnly = child.playOnly = child.childEditOnly = 2;

        const playChild = this.Serialize(child, GameMode.Play);
        c.check(playChild.editOnly === 2, "a field redeclared as GameMode.Play should be saved while playing: " + json(playChild));
        c.check(playChild.always === 2 && playChild.playOnly === 2, "inherited fields should keep their modes while playing: " + json(playChild));
        c.check(playChild.childEditOnly === undefined, "a subclass's GameMode.Edit field should not be saved while playing: " + json(playChild));

        const editChild = this.Serialize(child, GameMode.Edit);
        c.check(editChild.editOnly === undefined, "a field redeclared as GameMode.Play should not be saved in the editor: " + json(editChild));
        c.check(editChild.childEditOnly === 2 && editChild.always === 2, "a subclass's own and inherited fields should be saved in the editor: " + json(editChild));

        // TextObject's style fields are GameMode.Edit: a runtime SetText is only saved when saveVars asks for it
        const text = this.AddGameObject<TextObject>({ baseClass: "TextObject", text: "before" } as any);
        text.SetText("after");
        const playText = this.Serialize(text, GameMode.Play);
        c.check(playText.text === "before", "a runtime SetText should not be saved while playing by default, the entity's text is kept: " + json(playText));
        const editText = this.Serialize(text, GameMode.Edit);
        c.check(editText.text === "after", "a TextObject's text should be saved in the editor: " + json(editText));

        const savedText = this.AddGameObject<SavedText>({ baseClass: "SavedText", text: "before" } as any);
        savedText.SetText("after");
        const playSavedText = this.Serialize(savedText, GameMode.Play);
        c.check(playSavedText.text === "after", "saveVars should make a TextObject's text saved while playing: " + json(playSavedText));

        // @Run
        const runner = this.AddGameObject();
        c.check(runner.AddComponent(EditRunComponent) === null && !runner.HasComponent(EditRunComponent), "a @Run(GameMode.Edit) component should not be added while playing");
        c.check(runner.AddComponent(PlayRunComponent)?.awoken === true, "a @Run(GameMode.Play) component should be added and awoken while playing");
        c.check(runner.AddComponent(BothRunComponent)?.awoken === true, "a component running in both modes should be added while playing");
        c.check(runner.AddComponent(PlainRunComponent)?.awoken === true, "a component without @Run should be added while playing");

        const editRunner = this.AddGameObject();
        this.InMode(GameMode.Edit, () =>
        {
            const edit = editRunner.AddComponent(EditRunComponent);
            c.check(edit?.awoken === true && edit.enabled, "a @Run(GameMode.Edit) component should be added and awoken in the editor");
            c.check(editRunner.AddComponent(PlayRunComponent) === null, "a @Run(GameMode.Play) component should not be added in the editor");
            c.check(editRunner.AddComponent(BothRunComponent)?.awoken === true, "a component running in both modes should be awoken in the editor");
            const plain = editRunner.AddComponent(PlainRunComponent);
            c.check(plain !== null && plain.awoken === false && plain.enabled === false,
                "a component without @Run should be added but stay inactive in the editor: " + json({ awoken: plain?.awoken, enabled: plain?.enabled }));
        });
        editRunner.Remove();

        c.flush();
    }
}
