import { GameObject } from "../../objects/gameObject";
import { IParticleOptions, ITransformOptions, ParticleAttribute, ParticleAttributeData, ParticleAttributeTypes, ParticleShape } from "./interface";
import { Color, Vec2 } from "./math";
import { Texture } from "./texture";
import { isPlainObject } from "./utils";

// Define constants for magic numbers
const DEFAULT_EMIT_RATE = 10;
const DEFAULT_EMIT_TIME = 0;
const DEFAULT_LOCAL_SPACE = true;

/**
 * Represents a single particle's properties
 */
export class Particle {
    private life: number = 0;
    private maxLife: number;

    private texture!: Texture;
    private options: IParticleOptions;
    private position: Vec2;
    private datas: Record<string, ParticleAttributeData<any>> = {};
    /**
     * Creates a new particle instance
     * @param rapid - The Rapid renderer instance
     * @param options - Particle configuration options
     */
    constructor(options: IParticleOptions) {
        this.options = options;
        if (options.texture instanceof Texture) {
            this.texture = options.texture
        } else if (options.texture instanceof Array && options.texture[0] instanceof Array) {
            this.texture = Random.pickWeight(options.texture as [Texture, number][])
        } else if (options.texture instanceof Array) {
            this.texture = Random.pick(options.texture)
        }

        this.maxLife = Random.scalarOrRange(options.life, 1)

        this.datas = {
            speed: this.processAttribute(options.animation.speed, 0)!,
            rotation: this.processAttribute(options.animation.rotation, 0)!,
            scale: this.processAttribute(options.animation.scale, 1)!,
            color: this.processAttribute(options.animation.color, Color.White)!,
            velocity: this.processAttribute(options.animation.velocity, Vec2.ZERO)!,
            acceleration: this.processAttribute(options.animation.acceleration, Vec2.ZERO)!,
        }

        this.position = Vec2.ZERO

        this.initializePosition();
    }
    private processAttribute<T extends ParticleAttributeTypes>(attribute: ParticleAttribute<T> | undefined | ParticleAttributeTypes, defaultData: T): ParticleAttributeData<T> {
        if (!attribute) return { value: defaultData };
        if (isPlainObject(attribute)) {
            attribute = attribute as ParticleAttribute<T>
            const start = Random.scalarOrRange(attribute.start, defaultData)
            const end = Random.scalarOrRange(attribute.end || start, defaultData)
            return {
                delta: attribute.delta ?? this.getDelta(start, end, this.maxLife),
                value: start,
                damping: attribute.damping
            }
        } else {
            return this.processAttribute({ start: attribute as T }, defaultData) as ParticleAttributeData<T>
        }
    }
    private updateDamping(deltaTime: number) {
        for (const att of Object.values(this.datas)) {
            if (att.damping) {
                const value = att.value
                const timeBasedDamping = Math.pow(att.damping, deltaTime);
                
                if (typeof value === 'number') {
                    att.value = value * timeBasedDamping
                } else {
                    att.value = value.multiply(timeBasedDamping)
                }
            }
        }
    }
    private updateDelta(deltaTime: number) {
        const datas = this.datas

        for (const att of Object.values(this.datas)) {
            if (att.delta) {
                const value = att.value

                if (typeof value === 'number') {
                    att.value += deltaTime * att.delta
                } else {
                    att.value = value.add(att.delta.multiply(deltaTime))
                }
            }
        }

        datas.color.value.clamp();
        const direction = Vec2.fromAngle(datas.rotation.value)
        const speedOffset = direction.multiply(datas.speed.value * deltaTime);
        this.position = this.position.add(speedOffset).add(datas.velocity.value.multiply(deltaTime)).add(datas.acceleration.value.multiply(deltaTime));
    }

    private getDelta<T extends ParticleAttributeTypes>(start: T, end: T, lifeTime: number): T {
        if (typeof start === 'number' && typeof end === 'number') {
            return (end - start) / lifeTime as T
        } else if ((start instanceof Vec2 && end instanceof Vec2)) {
            return end.subtract(start).divide(lifeTime) as T
        } else if (start instanceof Color && end instanceof Color) {
            return end.subtract(start).divide(lifeTime) as T
        }
        return start as T
    }

    /**
     * Updates particle state
     * @param deltaTime - Time in seconds since last update
     * @returns Whether the particle is still active
     */
    update(deltaTime: number): boolean {
        this.life += deltaTime;
        if (this.life >= this.maxLife) {
            return false;
        }
        this.updateDamping(deltaTime)
        this.updateDelta(deltaTime)

        return true;
    }

    /**
     * Renders the particle
     */
    render() {
        rapid.renderSprite({
            ...this.options,
            position: this.position,
            scale: this.datas.scale.value,
            rotation: this.datas.rotation.value,
            color: this.datas.color.value,
            texture: this.texture,
        });
    }

    private initializePosition() {
        switch (this.options.emitShape) {
            case ParticleShape.POINT:
                this.position = Vec2.ZERO;
                break;
            case ParticleShape.CIRCLE:
                const angle = Math.random() * Math.PI * 2;
                const radius = (this.options.emitRadius || 0) * Math.sqrt(Math.random());
                this.position = new Vec2(
                    Math.cos(angle) * radius,
                    Math.sin(angle) * radius
                );
                break;
            case ParticleShape.RECT:
                this.position = new Vec2(
                    (Math.random() - 0.5) * (this.options.emitRect?.width || 0),
                    (Math.random() - 0.5) * (this.options.emitRect?.height || 0)
                );
                break;
            default:
                break;
        }

        if (!this.options.localSpace && this.options.position) {
            this.position = this.position.add(this.options.position);
        }
    }
}

/**
 * Particle emitter for creating and managing particle systems
 */
export class ParticleEmitter {
    private particles: Particle[] = [];
    private options: IParticleOptions;
    private emitting: boolean = false;
    private emitTimer: number = 0;
    private emitRate: number = DEFAULT_EMIT_RATE; // Particles per second
    private emitTime: number = DEFAULT_EMIT_TIME;  // Time interval between emissions
    private emitTimeCounter: number = 0;
    localSpace: boolean = DEFAULT_LOCAL_SPACE;
    position: Vec2 = Vec2.ZERO;
    gameObject: GameObject; // ADDED, TO CHECK FOR PERSISTENCE

    /**
     * Creates a new particle emitter
     * @param rapid - The Rapid renderer instance
     * @param options - Emitter configuration options
     */
    constructor(options: IParticleOptions) {
        this.options = options;
        this.emitRate = options.emitRate !== undefined ? options.emitRate : DEFAULT_EMIT_RATE;
        this.emitTime = options.emitTime !== undefined ? options.emitTime : DEFAULT_EMIT_TIME;
        this.localSpace = options.localSpace !== undefined ? options.localSpace : DEFAULT_LOCAL_SPACE;
        this.position = options.position || Vec2.ZERO;
    }

    SetTexture(texture: Texture) {
        this.options.texture = texture
    }

    /**
     * Creates a new emitter with the same options.
     * Particles/state are not copied.
     */
    clone(): ParticleEmitter {
        return new ParticleEmitter(this.options);
    }

    /**
     * Gets the transform options
     */
    getTransform(): ITransformOptions {
        return this.options;
    }

    /**
     * Sets particle emission rate
     * @param rate - Particles per second
     */
    setEmitRate(rate: number) {
        this.emitRate = rate;
    }

    /**
     * Sets time interval between emissions
     * @param time - Time interval in seconds
     */
    setEmitTime(time: number) {
        this.emitTime = time;
    }

    /**
     * Starts emitting particles
     */
    start() {
        this.emitting = true;
        this.emitTimeCounter = 0;
    }

    /**
     * Stops emitting new particles but allows existing ones to complete their lifecycle
     */
    stop() {
        this.emitting = false;
    }

    /**
     * Clears all particles and resets the emitter
     */
    clear() {
        this.particles = [];
        this.emitTimeCounter = 0;
    }

    /**
     * Emits specified number of particles
     * @param count - Number of particles to emit
     */
    emit(count: number) {
        const actualCount = Math.min(count, (this.options.maxParticles || Infinity) - this.particles.length);

        for (let i = 0; i < actualCount; i++) {
            const options = { ...this.options };
            const particle = new Particle(options);
            this.particles.unshift(particle);
        }
    }

    /**
     * Updates particle emitter state
     * @param deltaTime - Time in seconds since last update
     */
    update(deltaTime: number) {
        // Auto-emit particles
        if (this.emitting && this.emitRate > 0) {
            // If emitTime is set, only emit particles at specified interval
            if (this.emitTime > 0) {
                this.emitTimeCounter += deltaTime;

                if (this.emitTimeCounter >= this.emitTime) {
                    // Calculate how many intervals have passed
                    const intervals = Math.floor(this.emitTimeCounter / this.emitTime);
                    // Emit particles based on emitRate (per emission, not per second)
                    this.emit(this.emitRate * intervals);
                    // Subtract the time consumed
                    this.emitTimeCounter -= intervals * this.emitTime;
                }
            } else {
                // Original continuous emission logic
                this.emitTimer += deltaTime;
                const particlesPerFrame = this.emitRate * deltaTime;
                const wholeParticles = Math.floor(particlesPerFrame);

                if (wholeParticles > 0) {
                    this.emit(wholeParticles);
                    this.emitTimer -= wholeParticles / this.emitRate;
                }

                // Handle fractional part
                const fractionalPart = this.emitTimer * this.emitRate;
                if (fractionalPart >= 1) {
                    this.emit(1);
                    this.emitTimer -= 1 / this.emitRate;
                }
            }
        }

        // Update existing particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            if (!this.particles[i].update(deltaTime)) {
                this.particles.splice(i, 1);
            }
        }
    }

    /**
     * Renders all particles
     */
    render() {
        if (this.localSpace) {
            rapid.save()
            rapid.matrixStack.applyTransform(this.getTransform())
        }
        
        for (const particle of this.particles) {
            particle.render()
        }
        
        if (this.localSpace) {
            rapid.restore()
        }
    }

    /**
     * Gets current particle count
     */
    getParticleCount(): number {
        return this.particles.length;
    }

    /**
     * Checks if the particle emitter is active (has particles or is emitting)
     */
    isActive(): boolean {
        return this.emitting || this.particles.length > 0;
    }
    oneShot() {
        this.emit(this.emitRate)
    }
}

export class Random {
    /**
     * 生成指定范围内的随机浮点数
     * @param min - 最小值
     * @param max - 最大值
     * @returns 随机浮点数
     */
    static float(min: number, max: number): number {
        return Math.random() * (max - min) + min;
    }

    /**
     * 生成指定范围内的随机整数
     * @param min - 最小值
     * @param max - 最大值
     * @returns 随机整数
     */
    static int(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /**
     * 生成随机角度（0-360度）
     * @returns 随机角度（弧度）
     */
    static angle(): number {
        return Math.random() * Math.PI * 2;
    }

    /**
     * 生成指定范围内的随机向量
     * @param minX - 最小X值
     * @param maxX - 最大X值
     * @param minY - 最小Y值
     * @param maxY - 最大Y值
     * @returns 随机向量
     */
    static vector(minX: number, maxX: number, minY: number, maxY: number): Vec2 {
        return new Vec2(
            Random.float(minX, maxX),
            Random.float(minY, maxY)
        );
    }

    static randomColor(minColor: Color, maxColor: Color): Color {
        return new Color(
            Random.float(minColor.r, maxColor.r),
            Random.float(minColor.g, maxColor.g),
            Random.float(minColor.b, maxColor.b),
            Random.float(minColor.a, maxColor.a)
        );
    }

    static pick(array: any[]): any {
        return array[Random.int(0, array.length - 1)];
    }

    static pickWeight(array: [any, number][]): any {
        if (!array || array.length === 0) {
            return null;
        }

        // 计算总权重
        let totalWeight = 0;
        for (const item of array) {
            totalWeight += item[1];
        }

        // 生成一个0到总权重之间的随机数
        const random = Math.random() * totalWeight;

        // 减去每个项目的权重直到找到选择的项目
        let currentWeight = 0;
        for (const item of array) {
            currentWeight += item[1];
            if (random <= currentWeight) {
                return item[0];
            }
        }

        // 防止浮点数精度问题，返回最后一项
        return array[array.length - 1][0];
    }


    static scalarOrRange<T extends number | Vec2 | Color>(range?: T | [T, T], defaultValue?: T): T {
        if (range === undefined) {
            return defaultValue as T;
        }
        if (Array.isArray(range)) {
            if (typeof range[0] === 'number') {
                return Random.float(range[0] as number, range[1] as number) as T;
            } else if (range[0] instanceof Vec2) {
                return Random.vector(range[0].x, (range[1] as Vec2).x, range[0].y, (range[1] as Vec2).y) as T;
            } else if (range[0] instanceof Color) {
                return Random.randomColor(range[0] as Color, range[1] as Color) as T;
            }
        }
        if (typeof range === 'number') {
            return range as T;
        }
        return (range as Vec2 | Color).clone() as T;
    }
}
