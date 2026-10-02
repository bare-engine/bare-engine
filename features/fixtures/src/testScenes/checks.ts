// collects checks and asserts them together, so async tests report every result at once:
// the runner treats a scene as passed as soon as one assertion passed without errors
export class Checks
{
    private results: [boolean, string][] = [];

    check(condition: unknown, message: string): void
    {
        this.results.push([!!condition, message]);
    }

    async checkThrows(fn: () => unknown, message: string): Promise<void>
    {
        try
        {
            await fn();
            this.results.push([false, message]);
        }
        catch
        {
            this.results.push([true, message]);
        }
    }

    flush(): void
    {
        // failures first, so the runner's first error is a real one
        const sorted = [...this.results].sort((x, y) => Number(x[0]) - Number(y[0]));
        for (const [condition, message] of sorted)
            assert(condition, message);
    }
}
