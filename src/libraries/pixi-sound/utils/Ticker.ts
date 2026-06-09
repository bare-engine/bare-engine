type TickerListener = {
    fn: () => void;
    context?: any;
};

class BareTicker
{
    private listeners: TickerListener[] = [];
    private frame: number | null = null;

    public add(fn: () => void, context?: any): void
    {
        if (this.listeners.some((listener) => listener.fn === fn && listener.context === context))
            return;

        this.listeners.push({ fn, context });
        this.start();
    }

    public remove(fn: () => void, context?: any): void
    {
        for (let i = this.listeners.length - 1; i >= 0; i--)
        {
            const listener = this.listeners[i];

            if (listener.fn === fn && listener.context === context)
                this.listeners.splice(i, 1);
        }
    }

    private start(): void
    {
        if (this.frame !== null)
            return;

        const tick = () =>
        {
            this.frame = null;

            for (const listener of this.listeners.slice())
                listener.fn.call(listener.context);

            if (this.listeners.length > 0)
                this.start();
        };

        this.frame = requestAnimationFrame(tick);
    }
}

const Ticker = {
    shared: new BareTicker(),
};

export { Ticker };
