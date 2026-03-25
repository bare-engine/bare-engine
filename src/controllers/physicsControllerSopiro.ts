import { Box, Circle, Polygon, World } from "../exports/sopiroPhysics";
import { RigidBody } from "../libraries/Sopiro/rigidbody";
import { Settings } from "../libraries/Sopiro/settings";
import { PhysicsControllerBase } from "./physicsControllerBase";
import { Scene } from "../main";
import * as Util from "../libraries/Sopiro/util";
import { BareEvent } from "../types/bareTypes";
import { BareEngine } from "../bareEngine";
import { GameObject } from "../exports";

export class PhysicsControllerSopiro extends PhysicsControllerBase
{
	private world: World;
	public collisionsEnabled: boolean = true;

	private activeCollisions: Map<number, { bodyA: RigidBody; bodyB: RigidBody }> = new Map();

	constructor(scene: Scene)
	{
		super(scene);

    	this.world = new World(scene);
    }

	override Start(): void
	{  
		this.scene.events.on(BareEvent.physics_refreshBody, this.RefreshBody.bind(this));

		bareEngine.RegisterGameObjectPool(Polygon, 1);
		bareEngine.RegisterGameObjectPool(Box, 1);
		bareEngine.RegisterGameObjectPool(Circle, 1);

		super.Start();
	}

	override Add(object: GameObject): void
	{
		if (object instanceof RigidBody && !object.parent)
        	this.world.register(object);
	}

	override Remove(object: GameObject): void
	{
		if (object instanceof RigidBody && !object.parent)
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

    override FixedUpdate(fixedDeltaTime: number): void
    {
		if (bareEngine.levelEditorOpen) return;

        Settings.dt = fixedDeltaTime;
        Settings.inv_dt = 1 / fixedDeltaTime;
        this.world.update(fixedDeltaTime);

		if (this.collisionsEnabled)
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
					events.emit(BareEvent.collision_end, pair.bodyA, pair.bodyB);
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
				events.emit(BareEvent.collision_start, bodyA, bodyB); 
			}

			bodyA.OnCollisionUpdate(bodyB);
			bodyB.OnCollisionUpdate(bodyA);
			events.emit(BareEvent.collision_update, bodyA, bodyB); // NOT SENDING TO globalEvents, PROBABLY NEVER NEEDED? AND COULD COST MORE
		}

		for (const [key, pair] of this.activeCollisions)
		{
			if (currentCollisions.has(key))
				continue;

			pair.bodyA.OnCollisionEnd(pair.bodyB);
			pair.bodyB.OnCollisionEnd(pair.bodyA);
			events.emit(BareEvent.collision_end, pair.bodyA, pair.bodyB);
			this.activeCollisions.delete(key);
		}
	}

	Clear(): void
	{
		this.activeCollisions.clear();
		this.world.reset();
	}
}

export var physicsControllerSopiro:PhysicsControllerSopiro;
BareEngine.RegisterController(PhysicsControllerSopiro);
