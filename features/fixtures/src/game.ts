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

function sceneName(scene: SceneClass): string {
    return scene.name[0].toLowerCase() + scene.name.slice(1);
}

declare global
{
    interface Window
    {
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
    ];

    constructor() 
    {
        super({ persistent: true });
    }

    OnAwake(): void
    {
        bare.AddClass(Box);
        bare.AddClass(Circle);

        installBrowserTestHarness();

        window.__bareBrowserTests = {
            start: (name: string) => this.startTest(name),
            check: (name: string) => this.checkTest(name),
            names: () => this.tests.map(sceneName),
        };
    }

    async OnStart(): Promise<void>
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
