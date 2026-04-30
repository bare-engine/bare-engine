import { BaseComponent, GameObject, Save, Scene } from "bare-engine";

export class SaveTest extends Scene
{
    OnStart(): void
    {
        var obj = this.AddGameObject();
        obj.AddComponent(TestComponent);
        obj.AddComponent(TestSaveComponent);

        var entity = this.levelHandler.SerializeObject(obj);

        assert(entity.components.test.value === undefined, "test value should not be saved");
        assert(entity.components.testSave.value == "test", "testSave value should be saved");
    }
}

export class TestComponent extends BaseComponent
{
    private value:string = "test";
}

export class TestSaveComponent extends BaseComponent
{
    @Save
    private value:string = "test";
}
