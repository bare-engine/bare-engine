export class Vec2 {
    x: number;
    y: number;

    // FROZEN, SINCE THEY'RE SHARED: AN IN-PLACE METHOD (normalize, perpendicular, invert, set...)
    // ON ONE WOULD OTHERWISE CHANGE IT FOR EVERYONE. CLONE FIRST TO MODIFY.
    static readonly ZERO: Readonly<Vec2> = Object.freeze(new Vec2(0, 0));
    static readonly ONE: Readonly<Vec2> = Object.freeze(new Vec2(1, 1));
    // Y POINTS DOWN THE SCREEN, SO UP IS -Y
    static readonly UP: Readonly<Vec2> = Object.freeze(new Vec2(0, -1));
    static readonly DOWN: Readonly<Vec2> = Object.freeze(new Vec2(0, 1));
    static readonly LEFT: Readonly<Vec2> = Object.freeze(new Vec2(-1, 0));
    static readonly RIGHT: Readonly<Vec2> = Object.freeze(new Vec2(1, 0));

    constructor(x?: number, y?: number) {
        this.x = x !== undefined ? x : 0;
        this.y = y !== undefined ? y : this.x;
    }

    set(x: number, y?: number): Vec2 {
        if (y === undefined) {
            this.x = x;
            this.y = x;
        } else {
            this.x = x;
            this.y = y;
        }
        return this;
    }

    add(v: Vec2): Vec2 {
        return new Vec2(this.x + v.x, this.y + v.y);
    }

    subtract(v: Vec2): Vec2 {
        return new Vec2(this.x - v.x, this.y - v.y);
    }

    sub(v: Vec2): Vec2 {
        return new Vec2(this.x - v.x, this.y - v.y);
    }

    multiply(f: number | Vec2): Vec2 {
        if (f instanceof Vec2) {
            return new Vec2(this.x * f.x, this.y * f.y);
        }
        return new Vec2(this.x * f, this.y * f);
    }

    mul(f: number | Vec2): Vec2 {
        return this.multiply(f);
    }

    divide(f: number | Vec2): Vec2 {
        if (f instanceof Vec2) {
            return new Vec2(this.x / f.x, this.y / f.y);
        }
        return new Vec2(this.x / f, this.y / f);
    }

    dot(v: Vec2): number {
        return this.x * v.x + this.y * v.y;
    }

    cross(v: Vec2): number {
        return this.x * v.y - this.y * v.x;
    }

    distanceTo(v: Vec2): number {
        const dx = this.x - v.x;
        const dy = this.y - v.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    clone(): Vec2 {
        return new Vec2(this.x, this.y);
    }

    to(vec: Vec2): void {
        this.x = vec.x;
        this.y = vec.y;
    }

    copy(): Vec2 {
        return new Vec2(this.x, this.y);
    }

    equals(vec: Vec2): boolean {
        return vec.x == this.x && vec.y == this.y;
    }

    perpendicular(): this {
        const x = this.x;
        this.x = -this.y;
        this.y = x;
        return this;
    }

    invert(): this {
        this.x = -this.x;
        this.y = -this.y;
        return this;
    }

    inverted(): Vec2 {
        return new Vec2(this.x * -1, this.y * -1);
    }

    length(): number {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    squaredLength(): number {
        return this.x * this.x + this.y * this.y;
    }

    normalize(): this {
        const mod = this.length();
        this.x = this.x / mod || 0;
        this.y = this.y / mod || 0;
        return this;
    }

    normalized(): Vec2 {
        const mod = this.length();
        return new Vec2(this.x / mod || 0, this.y / mod || 0);
    }

    fix(limit = 1e-13): void {
        this.x = Math.abs(this.x) < limit ? 0 : this.x;
        this.y = Math.abs(this.y) < limit ? 0 : this.y;
    }

    fixed(limit = 1e-13): Vec2 {
        return new Vec2(
            Math.abs(this.x) < limit ? 0 : this.x,
            Math.abs(this.y) < limit ? 0 : this.y
        );
    }

    /** In degrees: 0 points right, 90 down. */
    angle(): number {
        return Math.atan2(this.y, this.x) * (180 / Math.PI);
    }

    abs(): Vec2 {
        return new Vec2(Math.abs(this.x), Math.abs(this.y));
    }

    floor(): Vec2 {
        return new Vec2(Math.floor(this.x), Math.floor(this.y));
    }

    ceil(): Vec2 {
        return new Vec2(Math.ceil(this.x), Math.ceil(this.y));
    }

    stringify(): string {
        return `Vec2(${this.x}, ${this.y})`;
    }

    clear(): void {
        this.x = 0;
        this.y = 0;
    }

    isPrettyMuchZero(): boolean {
        return Math.abs(this.x) < 0.0001 && Math.abs(this.y) < 0.0001;
    }

    isZero(): boolean {
        return this.x == 0 && this.y == 0;
    }

    isNotZero(): boolean {
        return this.x !== 0 || this.y !== 0;
    }

    /** `azimuth` in degrees. */
    setToPolar(azimuth: number, radius: number = 1): this {
        const radians = azimuth * (Math.PI / 180);
        this.x = Math.cos(radians) * radius;
        this.y = Math.sin(radians) * radius;
        return this;
    }

    static fromArray(array: number[][]): Vec2[] {
        return array.map(pair => new Vec2(pair[0], pair[1]));
    }

    /** A vector of length 1 pointing at `angle` degrees. */
    static fromAngle(angle: number): Vec2 {
        const radians = angle * (Math.PI / 180);
        return new Vec2(Math.cos(radians), Math.sin(radians));
    }
}

export const composeProjectionWithAffine = (
    projection: Float32Array,
    affine: Float32Array
): Float32Array => {
    const [a, b, c, d, e, f] = affine;
    const affineMat4 = new Float32Array([
        a, c, 0, 0,
        b, d, 0, 0,
        0, 0, 1, 0,
        e, f, 0, 1 
    ]);

    return multiplyMat4(affineMat4, projection);
}

export const multiplyMat4 = (A: Float32Array, B: Float32Array): Float32Array => {
    const out = new Float32Array(16);
    for (let col = 0; col < 4; col++) {
        for (let row = 0; row < 4; row++) {
            let sum = 0;
            for (let k = 0; k < 4; k++) {
                sum += A[row * 4 + k] * B[k * 4 + col];
            }
            out[row * 4 + col] = sum;
        }
    }
    return out;
}
