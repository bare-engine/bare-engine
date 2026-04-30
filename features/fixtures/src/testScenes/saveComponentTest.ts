import { BaseComponent, Save, Scene } from "bare-engine";

export class SaveComponentTest extends Scene
{
    OnStart(): void
    {
        var obj = this.AddGameObject();

        obj.AddComponent(TestSaveComponent);
        obj.AddComponent(TestNoSaveComponent).save = false;

        var entity = this.levelHandler.SerializeObject(obj);

        assert(entity.components.testSave.valueNoSave === undefined, "test value should not be saved");
        assert(entity.components.testSave.valueSave == "test", "testSave value should be saved");
        assert(entity.components.testNoSave === undefined, "testNoSave component should not be saved");
    }
}

export class TestSaveComponent extends BaseComponent
{
    private valueNoSave:string = "test";

    @Save
    private valueSave:string = "test";
}

export class TestNoSaveComponent extends BaseComponent
{
    
}
