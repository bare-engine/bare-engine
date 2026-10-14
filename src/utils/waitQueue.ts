type PendingWait = {
    kind: 'time' | 'frame' | 'real';
    until: number;
    persistent: boolean;
    resolve: (completed: boolean) => void;
    timer?: ReturnType<typeof setTimeout>;
};

// Each scene owns one queue. Resolving false on cancellation lets await/finally finish.
export class WaitQueue
{
    private time = 0;
    private frame = 0;
    private pending = new Set<PendingWait>();

    Wait(seconds: number, persistent = false): Promise<boolean>
    {
        this.CheckDuration(seconds);
        return this.Schedule('time', this.time + seconds * 1000, persistent);
    }

    WaitFrame(frames = 1, persistent = false): Promise<boolean>
    {
        this.CheckDuration(frames);
        return this.Schedule('frame', this.frame + Math.max(1, Math.ceil(frames)), persistent);
    }

    WaitRealTime(seconds: number, persistent = false): Promise<boolean>
    {
        this.CheckDuration(seconds);
        return this.Schedule('real', seconds * 1000, persistent);
    }

    AdvanceTime(deltaTime: number): void
    {
        this.time += deltaTime * 1000;
        // Even a zero-second game-time wait waits while timeScale is zero.
        if (deltaTime <= 0) return;
        for (const entry of this.pending)
            if (entry.kind === 'time' && entry.until <= this.time)
                this.Complete(entry, true);
    }

    AdvanceFrame(): void
    {
        this.frame++;
        for (const entry of this.pending)
            if (entry.kind === 'frame' && entry.until <= this.frame)
                this.Complete(entry, true);
    }

    Cancel(includingPersistent = false): void
    {
        for (const entry of this.pending)
            if (includingPersistent || !entry.persistent)
                this.Complete(entry, false);
    }

    private Schedule(kind: PendingWait['kind'], until: number, persistent: boolean): Promise<boolean>
    {
        return new Promise(resolve => {
            const entry: PendingWait = { kind, until, persistent, resolve };
            this.pending.add(entry);
            if (kind === 'real')
                entry.timer = setTimeout(() => this.Complete(entry, true), until);
        });
    }

    private Complete(entry: PendingWait, completed: boolean): void
    {
        if (!this.pending.delete(entry)) return;
        if (entry.timer !== undefined) clearTimeout(entry.timer);
        entry.resolve(completed);
    }

    private CheckDuration(value: number): void
    {
        if (!Number.isFinite(value) || value < 0)
            throw new RangeError('Wait duration must be a finite nonnegative number.');
    }
}
