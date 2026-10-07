import { Component, ComponentController, Scene, SerializeField } from "bare-engine";

export class SaveComponentTest extends Scene
{
    OnAwake(): void
    {
        bare.AddClass(ComponentController);
    }

    OnStart(): void
    {
        var obj = this.AddGameObject();

        obj.AddComponent(TestSaveComponent, "testChanged");
        obj.AddComponent(TestNoSaveComponent).save = false;

        var entity = this.level.SerializeObject(obj);

        assert(entity.components.testSave.valueNoSave === undefined, "test value should not be saved");
        assert(entity.components.testSave.valueSave === undefined, "default @SerializeField value should not be saved");
        assert(entity.components.testSave.valueSaveChanged == "testChanged", "saveChanged value should be saved and changed");
        assert(entity.components.testNoSave === undefined, "testNoSave component should not be saved");
    }
}

export class TestSaveComponent extends Component
{
    private valueNoSave:string = "test";

    @SerializeField
    private valueSave:string = "test";

    @SerializeField
    private valueSaveChanged:string | undefined = "test";

    constructor(scene: Scene, valueSaveChanged?:string)
    {
        super(scene);
        this.valueSaveChanged = valueSaveChanged;
    }
}

export class TestNoSaveComponent extends Component
{
    
}
