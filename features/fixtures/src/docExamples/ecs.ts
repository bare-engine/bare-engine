import { GameObject, Scene, World } from 'bare-engine';

export class Enemy extends GameObject
{
    health = 10;
    poisoned: true | undefined;

    override OnAwake()
    {
        // Reset custom fields when this object is reused from its pool.
        this.health = 10;
        delete this.poisoned;
    }

    override OnRemoved()
    {
        (this.scene as EcsGame).world.remove(this);
    }
}

export class EcsGame extends Scene
{
    readonly world = new World<Enemy>();
    readonly poisoned = this.world.with('health', 'poisoned');

    override OnAwake()
    {
        bare.AddClass(Enemy);
    }

    override OnStart()
    {
        const enemy = this.AddGameObject<Enemy>(Enemy);
        this.world.add(enemy);
        this.world.addComponent(enemy, 'poisoned', true);
    }

    override OnUpdate(deltaTime: number)
    {
        for (const enemy of this.poisoned)
            enemy.health -= deltaTime;
    }

    override OnClear()
    {
        // Also release any entities that weren't attached to the scene.
        for (const enemy of [...this.world])
            this.world.remove(enemy);
    }
}
