import { Scene, SceneClass, StartBare } from "bare-engine";
import { Box, Circle } from "bare-engine/sopiro";
import
    {
        BrowserSceneResult,
        getBrowserSceneResult,
        installBrowserTestHarness,
        resetBrowserSceneTest,
    } from "./browserTestHarness";
import { BasicsTest } from "./testScenes/basicsTest";
import { CameraTest } from "./testScenes/cameraTest";
import { PrefabsTest } from "./testScenes/prefabsTest";
import { SaveComponentTest } from "./testScenes/saveComponentTest";
import { DocsExamplesTest } from "./testScenes/docsExamplesTest";
import { DocsGuideObjectsTest } from "./testScenes/docsGuideObjectsTest";
import { DocsGuideSystemsTest } from "./testScenes/docsGuideSystemsTest";
import { DocsReferenceTest } from "./testScenes/docsReferenceTest";
import { DocsPhysicsTest } from "./testScenes/docsPhysicsTest";
import { TweensAdvancedTest } from "./testScenes/tweensAdvancedTest";
import { InputAdvancedTest } from "./testScenes/inputAdvancedTest";
import { AnimationsAdvancedTest } from "./testScenes/animationsAdvancedTest";
import { HierarchyAdvancedTest } from "./testScenes/hierarchyAdvancedTest";
import { LevelSaveTest } from "./testScenes/levelSaveTest";
import { SerializeModesTest } from "./testScenes/serializeModesTest";
import { TextObjectTest } from "./testScenes/textObjectTest";
import { TileMapTest } from "./testScenes/tileMapTest";
import { SettingsEditingTest } from "./testScenes/settingsEditingTest";
import { GameSpeedTest } from "./testScenes/gameSpeedTest";
import { SceneWaitTest } from "./testScenes/sceneWaitTest";
import { ParticleComponentTest } from "./testScenes/particleComponentTest";
import { ShapeOutlineTest } from "./testScenes/shapeOutlineTest";
import { HitboxInnerTransformTest } from "./testScenes/hitboxInnerTransformTest";
import { ShaderUniformsTest } from "./testScenes/shaderUniformsTest";
import { ClipChildrenTest } from "./testScenes/clipChildrenTest";
import { ClipBatchTest } from "./testScenes/clipBatchTest";
import { SopiroJointsTest } from "./testScenes/sopiroJointsTest";
import { ResolutionTest } from "./testScenes/resolutionTest";
import { EditorPreview } from "./docExamples/editorPreview";

function sceneName(scene: SceneClass): string {
    return scene.name[0].toLowerCase() + scene.name.slice(1);
}

declare global
{
    interface Window
    {
        __bareDocsPreview?: () => Promise<void>;
        __bareBrowserTests?: 
        {
            start: (name: string) => Promise<BrowserSceneResult>;
            check: (name: string) => BrowserSceneResult;
            names: () => string[];
        };
    }
}

class MainGame extends Scene 
{
    private tests: SceneClass[] = [
        BasicsTest,
        PrefabsTest,
        CameraTest,
        SaveComponentTest,
        DocsExamplesTest,
        DocsGuideObjectsTest,
        DocsGuideSystemsTest,
        DocsReferenceTest,
        DocsPhysicsTest,
        TweensAdvancedTest,
        InputAdvancedTest,
        AnimationsAdvancedTest,
        HierarchyAdvancedTest,
        LevelSaveTest,
        SerializeModesTest,
        TextObjectTest,
        TileMapTest,
        SettingsEditingTest,
        GameSpeedTest,
        SceneWaitTest,
        ParticleComponentTest,
        ShapeOutlineTest,
        HitboxInnerTransformTest,
        ShaderUniformsTest,
        ClipChildrenTest,
        ClipBatchTest,
        SopiroJointsTest,
        ResolutionTest,
    ];

    constructor() 
    {
        super({ persistent: true });
    }

    override OnAwake(): void
    {
        bare.AddClass(Box);
        bare.AddClass(Circle);

        installBrowserTestHarness();

        window.__bareDocsPreview = async () => { await bare.scene.Goto(EditorPreview); };

        window.__bareBrowserTests = {
            start: (name: string) => this.startTest(name),
            check: (name: string) => this.checkTest(name),
            names: () => this.tests.map(sceneName),
        };
    }

    override async OnStart(): Promise<void>
    {
        await this.startTest(sceneName(this.tests[0]));
    }

    private async startTest(name: string): Promise<BrowserSceneResult>
    {
        const scene = this.tests.find((candidate) => sceneName(candidate) === name);

        if (!scene)
        {
            return {
                name,
                passed: false,
                error: `Unknown browser scene test "${name}"`,
            };
        }

        try
        {
            resetBrowserSceneTest(name);
            await bare.scene.Goto(scene);
            bare.scene.MoveToFront(this);

            return {
                name,
                passed: true,
            };
        }
        catch (error)
        {
            return {
                name,
                passed: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    private checkTest(name: string): BrowserSceneResult
    {
        const scene = this.tests.find((candidate) => sceneName(candidate) === name);

        if (!scene)
        {
            return {
                name,
                passed: false,
                error: `Unknown browser scene test "${name}"`,
            };
        }

        return getBrowserSceneResult(name);
    }
}

StartBare(MainGame);
