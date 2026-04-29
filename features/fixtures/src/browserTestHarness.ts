export type BrowserSceneResult = 
{
    name: string;
    passed: boolean;
    assertions?: number;
    error?: string;
    errors?: string[];
};

type BrowserAssertState = 
{
    scene: string;
    assertions: number;
    passed: boolean;
    error?: string;
    errors: string[];
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
            state.errors.push(message);
            state.assertions++;
            return;
        }

        state.assertions++;
        state.passed = state.errors.length === 0;
    };

    window.addEventListener("error", (event) => {
        const state = window.__bareBrowserAssert;

        if (!state || state.error) 
        {
            return;
        }

        state.passed = false;
        state.error = event.error instanceof Error ? event.error.message : event.message;
        state.errors.push(state.error);
    });
}

export function resetBrowserSceneTest(name: string): void 
{
    window.__bareBrowserAssert = {
        scene: name,
        assertions: 0,
        passed: false,
        errors: [],
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
        passed: state.assertions > 0 && state.passed && state.errors.length === 0,
        assertions: state.assertions,
        error: state.error,
        errors: state.errors,
    };
}
