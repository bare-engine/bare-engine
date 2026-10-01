import { GameObject, Scene, World } from 'bare-engine';

export class Enemy extends GameObject
{
    health = 10;
    poisoned: true | undefined;

    OnAwake()
    {
        // Reset custom fields when this object is reused from its pool.
        this.health = 10;
        delete this.poisoned;
    }

    OnRemoved()
    {
        (this.scene as EcsGame).world.remove(this);
    }
}

export class EcsGame extends Scene
{
    readonly world = new World<Enemy>();
    readonly poisoned = this.world.with('health', 'poisoned');

    OnAwake()
    {
        bare.AddClass(Enemy);
    }

    OnStart()
    {
        const enemy = this.AddGameObject<Enemy>(Enemy);
        this.world.add(enemy);
        this.world.addComponent(enemy, 'poisoned', true);
    }

    OnUpdate(deltaTime: number)
    {
        for (const enemy of this.poisoned)
            enemy.health -= deltaTime;
    }

    OnClear()
    {
        // Also release any entities that weren't attached to the scene.
        for (const enemy of [...this.world])
            this.world.remove(enemy);
    }
}
