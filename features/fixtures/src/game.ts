import { Scene, SceneClass, StartBare, sceneController } from "bare-engine";
import {
    BrowserSceneResult,
    getBrowserSceneResult,
    installBrowserTestHarness,
    resetBrowserSceneTest,
} from "./browserTestHarness";
import { EntityTest } from "./testScenes/entityTest";
import { RotationTest } from "./testScenes/rotationTest";

type BrowserSceneTest = 
{
    name: string;
    scene: SceneClass;
};

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
    private tests: BrowserSceneTest[] = [
        {
            name: "rotationTest",
            scene: RotationTest,
        },
        {
            name: "entityTest",
            scene: EntityTest,
        },
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
            names: () => this.tests.map((test) => test.name),
        };
    }

    async OnStart(): Promise<void> 
    {
        await this.startTest(this.tests[0].name);
    }

    private async startTest(name: string): Promise<BrowserSceneResult> 
    {
        const test = this.tests.find((candidate) => candidate.name === name);

        if (!test) 
        {
            return {
                name,
                passed: false,
                error: `Unknown browser scene test "${name}"`,
            };
        }

        try 
        {
            resetBrowserSceneTest(test.name);
            await sceneController.Goto(test.scene);
            sceneController.MoveToFront(this);

            return {
                name: test.name,
                passed: true,
            };
        } 
        catch (error) 
        {
            return {
                name: test.name,
                passed: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    private checkTest(name: string): BrowserSceneResult 
    {
        const test = this.tests.find((candidate) => candidate.name === name);

        if (!test) 
        {
            return {
                name,
                passed: false,
                error: `Unknown browser scene test "${name}"`,
            };
        }

        return getBrowserSceneResult(test.name);
    }
}

StartBare(MainGame);
