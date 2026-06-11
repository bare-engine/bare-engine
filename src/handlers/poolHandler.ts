export class PoolHandler<T> {
    private pool: Array<T> = [];
    private factory: () => T;
    private defaultPoolSize: number;

    constructor(factory: () => T, defaultPoolSize: number = 10) {
        this.factory = factory;
        this.defaultPoolSize = defaultPoolSize;
        this.Create(this.defaultPoolSize);
    }

    Grab(): T {
        if (this.pool.length === 0) {
            this.Create(this.defaultPoolSize || 1); // DON'T USE this.defaultPoolSize HERE, OTHER VAR? TODO
        }
        return this.pool.pop()!;
    }

    Release(obj: T): void {
        this.pool.push(obj);
    }

    Create(num: number): void {
        for (let i = 0; i < num; i++) {
            const obj = this.factory();
            this.pool.push(obj);
        }
    }

    GetSize(): number {
        return this.pool.length;
    }

    GetAll(): Array<T> {
        return this.pool;
    }

    Clear(): void {
        this.pool.length = 0;
    }
}