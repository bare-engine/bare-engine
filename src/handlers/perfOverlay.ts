// DEVELOPMENT ONLY: A SMALL PANEL WITH FRAME TIMINGS, TOGGLED WITH THE F2 DEBUG KEY. IT'S HTML, SO
// DRAWING IT DOESN'T SHOW UP IN THE RENDER TIME AND DRAW CALLS IT REPORTS
export class PerfOverlay
{
    private element: HTMLDivElement | null = null;

    // SUMS OVER THE CURRENT HALF SECOND, SHOWN AS AVERAGES PER FRAME
    private frames = 0;
    private frameTime = 0;
    private worstFrame = 0;
    private fixedTime = 0;
    private steps = 0;
    private updateTime = 0;
    private renderTime = 0;
    private drawCalls = 0;
    private windowStart = 0;
    private lastFrameEnd = 0;

    get visible(): boolean
    {
        return this.element !== null;
    }

    Toggle(): void
    {
        if (this.element)
        {
            this.element.remove();
            this.element = null;
            return;
        }

        const element = document.createElement("div");
        element.style.cssText = "position:fixed;top:8px;right:8px;z-index:100000;pointer-events:none;"
            + "padding:6px 8px;background:rgba(0,0,0,.7);color:#fff;font:12px/1.4 monospace;white-space:pre;border-radius:4px";
        element.textContent = "measuring...";
        document.body.appendChild(element);

        this.element = element;
        this.Reset(performance.now());
        this.lastFrameEnd = 0;
    }

    // THIS FRAME'S FIXED STEPS AND UPDATE, IN MILLISECONDS. NOT CALLED WHILE THE GAME IS PAUSED
    private frameFixedTime = 0;
    private frameSteps = 0;
    private frameUpdateTime = 0;

    EndUpdate(fixedTime: number, steps: number, updateTime: number): void
    {
        this.frameFixedTime = fixedTime;
        this.frameSteps = steps;
        this.frameUpdateTime = updateTime;
    }

    // CALLED BY THE MAIN LOOP AFTER EVERY FRAME
    EndFrame(renderTime: number, drawCalls: number): void
    {
        if (!this.element)
            return;

        const fixedTime = this.frameFixedTime;
        const steps = this.frameSteps;
        const updateTime = this.frameUpdateTime;
        this.frameFixedTime = this.frameSteps = this.frameUpdateTime = 0;

        const now = performance.now();
        if (this.lastFrameEnd)
        {
            const frameTime = now - this.lastFrameEnd;
            this.frames++;
            this.frameTime += frameTime;
            this.worstFrame = Math.max(this.worstFrame, frameTime);
            this.fixedTime += fixedTime;
            this.steps += steps;
            this.updateTime += updateTime;
            this.renderTime += renderTime;
            this.drawCalls += drawCalls;
        }
        this.lastFrameEnd = now;

        if (now - this.windowStart < 500 || this.frames === 0)
            return;

        const n = this.frames;
        const lines = [
            `${(1000 * n / this.frameTime).toFixed(0)} fps  ${(this.frameTime / n).toFixed(1)} ms (worst ${this.worstFrame.toFixed(1)})`,
            `fixed  ${(this.fixedTime / n).toFixed(2)} ms  ${(this.steps / n).toFixed(1)} steps`,
            `update ${(this.updateTime / n).toFixed(2)} ms`,
            `render ${(this.renderTime / n).toFixed(2)} ms  ${Math.round(this.drawCalls / n)} draw calls`,
            `${bare.scene.GetAllObjects().length} objects`,
        ];
        if (bare.fixedStepsBehind)
            lines.push("slowed down: fixed steps can't keep up");

        this.element.textContent = lines.join("\n");
        this.Reset(now);
    }

    private Reset(now: number): void
    {
        this.frames = this.frameTime = this.worstFrame = this.fixedTime = this.steps = 0;
        this.updateTime = this.renderTime = this.drawCalls = 0;
        this.windowStart = now;
    }
}
