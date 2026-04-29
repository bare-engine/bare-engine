export type BrowserSceneResult = 
{
    name: string;
    passed: boolean;
    assertions?: number;
    error?: string;
};

type BrowserAssertState = 
{
    scene: string;
    assertions: number;
    passed: boolean;
    error?: string;
};

declare global 
{
    interface Window 
    {
        __bareBrowserAssert?: BrowserAssertState;
        assert: (condition: unknown, message?: string) => void;
    }

    function assert(condition: unknown, message?: string): void;
}

export function installBrowserTestHarness(): void 
{
    window.assert = (condition: unknown, message = "Assertion failed") => {
        const state = window.__bareBrowserAssert;

        if (!state) 
        {
            throw new Error("assert() called before a browser scene test was started");
        }

        if (!condition) 
        {
            state.passed = false;
            state.error = message;
            throw new Error(message);
        }

        state.assertions++;
        state.passed = true;
    };

    window.addEventListener("error", (event) => {
        const state = window.__bareBrowserAssert;

        if (!state || state.error) 
        {
            return;
        }

        state.passed = false;
        state.error = event.error instanceof Error ? event.error.message : event.message;
    });
}

export function resetBrowserSceneTest(name: string): void 
{
    window.__bareBrowserAssert = {
        scene: name,
        assertions: 0,
        passed: false,
    };
}

export function getBrowserSceneResult(name: string): BrowserSceneResult 
{
    const state = window.__bareBrowserAssert;

    if (!state || state.scene !== name) 
    {
        return {
            name,
            passed: false,
            error: `No assertion state found for "${name}"`,
        };
    }

    return {
        name,
        passed: state.assertions > 0 && state.passed && !state.error,
        assertions: state.assertions,
        error: state.error,
    };
}
