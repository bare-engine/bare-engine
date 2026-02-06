import { Box, Circle, Polygon, World } from "../sopiroPhysics";
import { RigidBody } from "../libraries/Sopiro/rigidbody";
import { Settings } from "../libraries/Sopiro/settings";
import { PhysicsControllerBase } from "./physicsControllerBase";
import { events } from "../main";
import * as Util from "../libraries/Sopiro/util";

export class PhysicsControllerSopiro extends PhysicsControllerBase
{
	private world: World;
	public collisionsEnabled: boolean = true;

	private accumulator = 0;
	private readonly fixedDt = 1 / 60;
	private readonly maxSubSteps = 5;
	private activeCollisions: Map<number, { bodyA: RigidBody; bodyB: RigidBody }> = new Map();

    constructor()
    {
		super();
    	this.world = new World();

        this.init();
    }

    init()
    {
		events.persistent.on('physicsRefreshBody', this.RefreshBody.bind(this));
		events.persistent.on('clear', this.Clear.bind(this));
		
		events.persistent.on('gameStarted', () => {
			bare.RegisterGameObjectPool(Polygon, 1);
			bare.RegisterGameObjectPool(Box, 1);
			bare.RegisterGameObjectPool(Circle, 1);
		});
	}

	Add(object: any): void
	{
        this.world.register(object);
	}

	Remove(object: any): void
	{
		this.world.unregister(object.id);
	}

	RefreshBody(body: RigidBody): void
	{
		if (!body || !body.node)
			return;

		this.world.tree.remove(body.node);
		this.world.tree.add(body);
	}

	setDimensions(x: number = 0, y: number = 0, width: number = 0, height: number = 0)
	{
	}

    override Update(deltaTime: number): void
    {
		if (bare.levelEditorOpen) return;
        if (deltaTime <= 0) return;

        // Prevent spiral of death after tab-switch or hitch.
        const clampedDelta = Math.min(deltaTime, 0.25);
        this.accumulator += clampedDelta;

        let steps = 0;
        while (this.accumulator >= this.fixedDt && steps < this.maxSubSteps)
        {
            Settings.dt = this.fixedDt;
            Settings.inv_dt = 1 / this.fixedDt;
            this.world.update(this.fixedDt);
            this.accumulator -= this.fixedDt;
            steps++;
        }

		if (steps > 0 && this.collisionsEnabled)
			this.HandleCollisions();
    }

    override Render(): void
    {
		if (window.debug)
        	this.world.render();
    }

	setCollisionsEnabled(enabled: boolean): void
	{
		if (this.collisionsEnabled === enabled)
			return;

		this.collisionsEnabled = enabled;
		this.world.collisionsEnabled = enabled;

		if (!enabled)
		{
			if (this.activeCollisions.size > 0)
			{
				for (const [, pair] of this.activeCollisions)
				{
					events.emit('collisionEnd', pair.bodyA, pair.bodyB);
				}

				this.activeCollisions.clear();
			}

			this.world.manifoldMap.clear();
			this.world.manifolds = [];

			for (let i = 0; i < this.world.bodies.length; i++)
				this.world.bodies[i].manifoldIDs = [];
		}
	}

	private HandleCollisions(): void
	{
		// PRETTY HEAVY? ONLY DO CHECK FOR OBJECT WE WANT TO CHECK COLLISION EVENT FOR?
		// WOULD NEED NEW SYSTEM
		
		const currentCollisions = new Set<number>();

		for (let i = 0; i < this.world.manifolds.length; i++)
		{
			const manifold = this.world.manifolds[i];
			const bodyA = manifold.bodyA;
			const bodyB = manifold.bodyB;
			let idA = bodyA.id;
			let idB = bodyB.id;

			if (idA > idB)
			{
				const temp = idA;
				idA = idB;
				idB = temp;
			}

			const key = Util.make_pair_natural(idA, idB);
			currentCollisions.add(key);

			if (!this.activeCollisions.has(key))
			{
				this.activeCollisions.set(key, { bodyA, bodyB });
				bodyA.OnCollisionStart(bodyB);
				bodyB.OnCollisionStart(bodyA);
				events.emit('collisionStart', bodyA, bodyB);
			}

			bodyA.OnCollisionUpdate(bodyB);
			bodyB.OnCollisionUpdate(bodyA);
			events.emit('collisionUpdate', bodyA, bodyB);
		}

		for (const [key, pair] of this.activeCollisions)
		{
			if (currentCollisions.has(key))
				continue;

			pair.bodyA.OnCollisionEnd(pair.bodyB);
			pair.bodyB.OnCollisionEnd(pair.bodyA);
			events.emit('collisionEnd', pair.bodyA, pair.bodyB);
			this.activeCollisions.delete(key);
		}
	}

	Clear(): void
	{
		//this.world.reset();
	}
}

export const physicsControllerSopiro = new PhysicsControllerSopiro();
globalThis.physicsControllerSopiro = physicsControllerSopiro;
