import mitt from '../../mitt';

type EventMap = Record<string, any[]>;

type Listener = {
    original: (...args: any[]) => void;
    wrapped: (...args: any[]) => void;
    context?: any;
};

class MittEventEmitter
{
    private emitter = mitt<EventMap>();
    private listeners = new Map<string, Listener[]>();

    public on(event: string, fn: (...args: any[]) => void, context?: any): this
    {
        const wrapped = (...args: any[]) => fn.apply(context, args);

        this.getListeners(event).push({ original: fn, wrapped, context });
        this.emitter.on(event, wrapped);

        return this;
    }

    public once(event: string, fn: (...args: any[]) => void, context?: any): this
    {
        const wrapped = (...args: any[]) =>
        {
            this.off(event, fn, context);
            fn.apply(context, args);
        };

        this.getListeners(event).push({ original: fn, wrapped, context });
        this.emitter.on(event, wrapped);

        return this;
    }

    public off(event: string, fn?: (...args: any[]) => void, context?: any): this
    {
        if (!fn)
        {
            this.emitter.off(event);
            this.listeners.delete(event);

            return this;
        }

        const listeners = this.listeners.get(event);

        if (!listeners)
            return this;

        for (let i = listeners.length - 1; i >= 0; i--)
        {
            const listener = listeners[i];
            const contextMatches = context === undefined || listener.context === context;

            if (listener.original === fn && contextMatches)
            {
                this.emitter.off(event, listener.wrapped);
                listeners.splice(i, 1);
            }
        }

        return this;
    }

    public emit(event: string, ...args: any[]): this
    {
        this.emitter.emit(event, ...(args as any));

        return this;
    }

    public removeAllListeners(event?: string): this
    {
        if (event !== undefined)
        {
            this.off(event);

            return this;
        }

        this.emitter.clearAll();
        this.listeners.clear();

        return this;
    }

    private getListeners(event: string): Listener[]
    {
        let listeners = this.listeners.get(event);

        if (!listeners)
        {
            listeners = [];
            this.listeners.set(event, listeners);
        }

        return listeners;
    }
}

export { MittEventEmitter as EventEmitter };
