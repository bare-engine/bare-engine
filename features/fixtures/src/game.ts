import { Scene, SceneClass, StartBare, sceneController } from "bare-engine";
import {
    BrowserSceneResult,
    getBrowserSceneResult,
    installBrowserTestHarness,
    resetBrowserSceneTest,
} from "./browserTestHarness";
import { EntityTest } from "./testScenes/entityTest";
import { RotationTest } from "./testScenes/rotationTest";
import { BarePhysicsTest } from "./testScenes/barePhysicsTest";
import { BasicsTest } from "./testScenes/basicsTest";
import { CameraTest } from "./testScenes/cameraTest";
import { ComponentsTest } from "./testScenes/componentsTest";
import { EntitiesTest } from "./testScenes/entitiesTest";
import { GraphicsTest } from "./testScenes/graphicsTest";
import { TweensTest } from "./testScenes/tweensTest";
import { UiTest } from "./testScenes/uiTest";
import { SaveTest } from "./testScenes/saveTest";

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
        RotationTest,
        EntityTest,
        BasicsTest,
        EntitiesTest,
        ComponentsTest,
        TweensTest,
        CameraTest,
        UiTest,
        GraphicsTest,
        BarePhysicsTest,
        SaveTest,
    ];

    constructor() 
    {
        super({ persistent: true });
    }

    OnAwake(): void 
    {
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
            await sceneController.Goto(scene);
            sceneController.MoveToFront(this);

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
