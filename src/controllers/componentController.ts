import { GameMode, RegisterController } from "../globals";
import { GameObject } from "../objects/gameObject";
import type { Scene } from "../scenes/scene";
import { BareEvent, Ctor } from '../types/bareTypes';
import { RUN_MODES_KEY } from "../utils/decorators";

// REFERENCING A CLASS EXTENDING BASECOMPONENT WILL AUTOMATICALLY ALSO INCLUDE COMPONENTCONTROLLER
export abstract class Component<T extends GameObject = GameObject>
{
    scene: Scene;
    enabled: boolean = true;
    go!: T;
    save: boolean = true; // IF FALSE, DOES NOT SERIALIZE
    hasAdded: boolean = false;

    constructor(scene: Scene)
    {
        this.scene = scene;
    }

    Added(go: T): void
    {
        this.go = go;
        this.OnAdded?.(go);
    }

    Removed(): void
    {
        if (this.hasAdded)
            this.OnRemoved?.();
    }

    OnAdded?(go: T): void;
    OnRemoved?(): void;
    OnStart?(): void;
    OnEnable?(): void;
    OnDisable?(): void;
    OnCollisionStart?(collidingObject: GameObject): void;
    OnCollisionUpdate?(collidingObject: GameObject): void;
    OnCollisionEnd?(collidingObject: GameObject): void;
    OnPreRender?(): void;
    OnRender?(): void;
    OnPostRender?(): void;
    OnUpdate?(dt: number): void;
    OnFixedUpdate?(fixedDt: number): void;
    OnPreSaveLevel?(): void;
    OnLevelChanged?(): void;
}

export class ComponentController
{
    public componentsByGameObject = new Map<string, Component<any>[]>() // TODO private
    private componentsByType = new Map<Ctor<Component<any>>, Component<any>[]>()
    private queuedForStart: Component<any>[] = [];

    public scene: Scene

    constructor(scene: Scene)
    {
        this.scene = scene
    }
    
	Start(): void
	{
        this.scene.events.on(BareEvent.collision_start, this.OnCollisionStart.bind(this));
        this.scene.events.on(BareEvent.collision_update, this.OnCollisionUpdate.bind(this));
        this.scene.events.on(BareEvent.collision_end, this.OnCollisionEnd.bind(this));

        this.scene.events.on(BareEvent.game_objectRemoved, this.RemoveComponentsFrom.bind(this));

        this.scene.events.on(BareEvent.level_preSave, this.OnPreSaveLevel.bind(this));
    }

    // PROBALY SHOULD JUST LISTEN TO BareEvent.level_loaded? TODO
    public PostLoadLevel(persistenObjUIDs:string[] = []): void
    {
        // CALL ONLEVELCHANGED ON PERSISTENT OBJECTS
        for (var i = 0; i < persistenObjUIDs.length; i++)
        {
            let uid = persistenObjUIDs[i]; 
            var comps = this.GetAllComponentsFromUID(uid); // CHECKING WITH UID IN CASE OBJECT WAS MANUALLY REMOVED, THEN THIS WILL FIND NO COMPONENTS
            for (var k = 0; k < comps.length; k++)
            {
                var comp = comps[k];
                if (comp.OnLevelChanged)
                {
                    comp.OnLevelChanged();
                }
            }
        }
    }

    private OnPreSaveLevel(): void
    {
        this.CallMethodOnAllComponents('OnPreSaveLevel');
    }

    AddComponent<T extends GameObject, C extends Component<T>>(go: T, componentClass: Ctor<C>): C;
    AddComponent<T extends GameObject, C extends Component<T>>(go: T, componentClass: Ctor<C>, ...args: any[]): C;
    AddComponent<T extends GameObject, C extends Component<T>>(go: T, componentInstance: C): C;
    AddComponent<T extends GameObject, C extends Component<T>>(go: T, arg: Ctor<C> | C, ...args: any[]): C | null
    {
        // IF IT'S A componentClass, MAKE SURE IT'S REGISTERED
        // EG: AnimationComponent
        if (typeof arg === "function")
            bare.AddClass(arg);

        const component: C = (typeof arg === "function") ? new arg(go.scene, ...args) : arg;

        // Check class-level @Run decorator
        const runModes: number[] | undefined = (component.constructor as any)[RUN_MODES_KEY];
        const runsInCurrentMode = runModes?.includes(bare.gameMode) ?? false;
        
        if (runModes && !runsInCurrentMode)
            return null;

        component.go = go;

        // make sure there is a list of components for this gameobject
        if (!this.componentsByGameObject.has(go.uniqueID))
        {
            this.componentsByGameObject.set(go.uniqueID, [])
        }

        // make sure there is a list of components for this type
        if (!this.componentsByType.has(component.constructor as Ctor<Component<any>>))
        {
            this.componentsByType.set(component.constructor as Ctor<Component<any>>, [])
        }

        // add new component to this gameobject's list
        const list = this.componentsByGameObject.get(go.uniqueID) as Component<any>[]
        list.push(component);

        // add new component to this type's list
        const typeList = this.componentsByType.get(component.constructor as Ctor<Component<any>>) as Component<any>[]
        typeList.push(component)

        component.enabled = false;

        const shouldActivate = (runsInCurrentMode || bare.gameMode == GameMode.Game);
        if (shouldActivate)
        {
            component.enabled = true;

            component.Added?.(go);

            component.hasAdded = true;

            if (component.OnStart)
            {
                this.queuedForStart.push(component)
            }
        }
        else
        {
            // COMPONENT JUST HANGS AROUND DOING NOTHING - NOT ENABLED+ADDED
            // BUT IT'S THERE TO BE SERIALIZED AGAIN BY THE LEVEL
        }

        return component;
    }
    
    GetComponent<T extends Component>(go: GameObject, componentType: Ctor<T>): T | null
    {
        const components = this.componentsByGameObject.get(go.uniqueID);
        if (!components) return null;

        const component = components.find(c => c instanceof componentType);
        return (component as T) ?? null;
    }

    HasComponent<T extends Component>(go: GameObject, componentType: Ctor<T>): boolean
    {
        return this.GetComponent<T>(go, componentType) != null;
    }

    GetComponentsByType<ComponentType extends Component<any>>(componentType: Ctor<ComponentType>): ComponentType[]
    {
        return this.componentsByType.get(componentType) as unknown as ComponentType[]
    }

    GetComponentsFrom(object: GameObject): Component<any>[]
    {
        var comps = this.componentsByGameObject.get(object.uniqueID);
        if (!comps)
            return new Array<Component<any>>();
        
        return this.componentsByGameObject.get(object.uniqueID)!;
    }

    GetAllComponentsFromUID(uniqueID: string): Component<any>[]
    {
        var components = this.componentsByGameObject.get(uniqueID);
        if (!components)
            return new Array<Component<any>>();

        return components;
    }

    MoveComponent<T extends Component>(from: GameObject, to: GameObject, componentType: Ctor<T>): T | null
    {
        const componentFrom = this.GetComponent(from, componentType);

        if (componentFrom)
        {
            this.RemoveComponent(from, componentFrom);
            this.AddComponent(to, componentFrom);
        }
        
        return componentFrom;
    }

    RemoveComponent<T extends Component<any>>(go: GameObject, componentClass: Ctor<T>): boolean;
    RemoveComponent<T extends Component<any>>(go: GameObject, componentInstance: T): boolean;
    RemoveComponent<T extends Component<any>>(go: GameObject, arg: Ctor<T> | T): boolean
    {
        const components = this.componentsByGameObject.get(go.uniqueID);
        if (!components)
            return false;

        const component = (typeof arg === "function")
            ? components.find(c => c instanceof arg) as T | undefined
            : arg;

        if (!component)
            return false;

        const index = components.indexOf(component);
        if (index < 0)
            return false;

        component.Removed();

        components.splice(index, 1);

        // Remove from componentsByType as well
        const typeComponents = this.componentsByType.get(component.constructor as Ctor<Component<any>>) as Component<any>[] | undefined;
        if (typeComponents)
        {
            const typeIndex = typeComponents.indexOf(component);
            if (typeIndex > -1)
            {
                typeComponents.splice(typeIndex, 1);

                if (typeComponents.length == 0)
                    this.componentsByType.delete(component.constructor as Ctor<Component<any>>);
            }
        }

        // SAVE COMPONENT REMOVED FOR GAMEOBJECT
        var compName = component.constructor.name.replace('Component', '')
        compName = compName.charAt(0).toLowerCase() + compName.slice(1); // LOWERCASE FIRST LETTER

        if (components.length == 0)
            this.componentsByGameObject.delete(go.uniqueID);

        return true;
    }

    RemoveComponentsFrom(object: GameObject, ignoring: any[] = [])
    {
        // Direct O(1) lookup by uniqueID instead of iterating all components
        const components = this.componentsByGameObject.get(object.uniqueID);
        if (!components)
            return;

        for (var i = components.length - 1; i >= 0; i--)
        {
            var component = components[i];

            // Check if this component type should be ignored
            const shouldIgnore = ignoring.some(ignoredType => component.constructor === ignoredType);
            if (shouldIgnore)
                continue;

            // Remove from componentsByType
            const typeComponents = this.componentsByType.get(component.constructor as Ctor<Component<any>>) as Component<any>[] | undefined;
            if (typeComponents)
            {
                const typeIndex = typeComponents.indexOf(component);
                if (typeIndex > -1)
                {
                    typeComponents.splice(typeIndex, 1);

                    if (typeComponents.length == 0)
                        this.componentsByType.delete(component.constructor as Ctor<Component<any>>);
                }
            }

            components.splice(i, 1);

            component.Removed();
        }

        if (components.length == 0)
            this.componentsByGameObject.delete(object.uniqueID);
    }

    RemoveAllComponents(includingPersistent: boolean = true)
    {
        if (includingPersistent)
        {
            this.CallMethodOnAllComponents('Removed');
            this.componentsByGameObject.clear()
            this.componentsByType.clear()
            this.queuedForStart = []
            return;
        }

        for (const [uniqueID, components] of this.componentsByGameObject.entries())
        {
            if (components.length === 0) continue;

            const go = components[0].go;
            if (go.persistent) continue;

            for (const component of components)
            {
                component.Removed();

                const typeComponents = this.componentsByType.get(component.constructor as Ctor<Component<any>>);
                if (typeComponents)
                {
                    const typeIndex = typeComponents.indexOf(component);
                    if (typeIndex > -1)
                        typeComponents.splice(typeIndex, 1);

                    if (typeComponents.length === 0)
                        this.componentsByType.delete(component.constructor as Ctor<Component<any>>);
                }
            }

            this.componentsByGameObject.delete(uniqueID);
        }

        this.queuedForStart = this.queuedForStart.filter(c => c.go.persistent);
    }

    EnableComponent<T extends Component>(obj: GameObject, componentType: Ctor<T>)
    {
        const component = this.GetComponent(obj, componentType);
        if (component)
        {
            component.enabled = true;
            component.OnEnable?.();
        }
    }

    DisableComponent<T extends Component>(obj: GameObject, componentType: Ctor<T>)
    {
        const component = this.GetComponent(obj, componentType);
        if (component)
        {
            component.enabled = false; // OR COULD BE SET IN BASE COMPONENT METHOD
            component.OnDisable?.();
        }
    }

    EnableAllComponentsFromObject(obj: GameObject)
    {
        const entries = this.componentsByGameObject.entries()
        for (const [, components] of entries)
        {
            components.forEach(component => {
                if (component.go == obj)
                {
                    component.enabled = true;

                    if (component.OnEnable)
                    {
                        component.OnEnable()
                    }
                }
            })
        }
    }

    DisableAllComponentsFromObject(obj: GameObject)
    {
        const entries = this.componentsByGameObject.entries()
        for (const [, components] of entries)
        {
            components.forEach(component => {
                if (component.go == obj)
                {
                    component.enabled = false;

                    if (component.OnDisable)
                    {
                        component.OnDisable()
                    }
                }
            })
        }
    }

    HasAnyComponentOfType<ComponentType extends Component<any>>(componentType: Ctor<ComponentType>): Boolean
    {
        var comp = this.componentsByType.get(componentType);
        if (comp)
        {
            return comp.length > 0;
        }
        else
        {
            return false;
        }
    }

    private OnCollisionStart(initiatingObject: GameObject, collidingObject: GameObject)
    {
        const entries = this.componentsByGameObject.entries()
        for (const [, components] of entries)
        {
            components.forEach(component => {
                if (!component.OnCollisionStart) return;

                if (component.go == initiatingObject)
                    component.OnCollisionStart(collidingObject);
                else if (component.go == collidingObject)
                    component.OnCollisionStart(initiatingObject);
            })
        }
    }

    private OnCollisionUpdate(initiatingObject: GameObject, collidingObject: GameObject)
    {
        const entries = this.componentsByGameObject.entries()
        for (const [, components] of entries)
        {
            components.forEach(component => {
                if (!component.OnCollisionUpdate) return;

                if (component.go == initiatingObject)
                    component.OnCollisionUpdate(collidingObject);
                else if (component.go == collidingObject)
                    component.OnCollisionUpdate(initiatingObject);
            })
        }
    }

    private OnCollisionEnd(initiatingObject: GameObject, collidingObject: GameObject)
    {
        const entries = this.componentsByGameObject.entries()
        for (const [, components] of entries)
        {
            components.forEach(component => {
                if (!component.OnCollisionEnd) return;

                if (component.go == initiatingObject)
                    component.OnCollisionEnd(collidingObject);
                else if (component.go == collidingObject)
                    component.OnCollisionEnd(initiatingObject);
            })
        }
    }

    Update(deltaTime: number)
    {
        // process queued for start
        while (this.queuedForStart.length > 0)
        {
            const component = this.queuedForStart.shift()
            if (component?.OnStart && component.enabled)
            {
                component.OnStart()
            }
        }

        this.CallMethodOnAllComponents('OnUpdate', deltaTime);
    }

    FixedUpdate(deltaTime: number)
    {
        this.CallMethodOnAllComponents('OnFixedUpdate', deltaTime);
    }

    PreRender()
    {
        this.CallMethodOnAllComponents('OnPreRender');
    }

    Render()
    {
        this.CallMethodOnAllComponents('OnRender');
    }

    PostRender()
    {
        this.CallMethodOnAllComponents('OnPostRender');
    }

    // NOTE: methodName NEEDS TO MATCH WITH COMPONENT'S ONE
    CallMethodOnAllComponents<T extends keyof Component<any>>(methodName: T, ...args: any[]): void {
        for (const components of this.componentsByGameObject.values()) {
            for (let i = 0; i < components.length; i++) {
                const component = components[i];
                const method = component[methodName];
                if (component.enabled && typeof method === 'function') {
                    (method as Function).call(component, ...args);
                }
            }
        }
    }

    CallMethodOnComponentsOfObject<T extends keyof Component<any>>(methodName: T, object: GameObject, ...args: any[]): void
    {
        var allCompsObject = this.GetComponentsFrom(object);

        // GET THE FINAL COMPONENT HERE ALREADY, SINCE FIRING A METHOD CAN CHANGE THE PROPERTIES OF OTHER COMPONENTS
        // EG, DISABLING IT, PREVENTING IT FROM BEING CALLED NEXT
        var allCompsFiltered = allCompsObject.filter(comp => {
            const method = comp[methodName];
            return (comp.enabled && typeof method === 'function');
        });

        for (const component of allCompsFiltered)
        {
            const method = component[methodName];
            (method as Function).call(component, ...args);
        }
    }

    Clear(includingPersistent: boolean = true)
    {
        this.RemoveAllComponents(includingPersistent);
    }
}

export var componentController:ComponentController;
RegisterController(ComponentController);
