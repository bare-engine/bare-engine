import { events, GameMode, pipes } from "../main";
import { GameObject } from "../objects/gameObject";
import { Component, Entity, Ctor, BareEventPayload, BareEvent } from '../utils/bareTypes';
// REFERENCING A CLASS EXTENDING BASECOMPONENT WILL AUTOMATICALLY ALSO INCLUDE COMPONENTCONTROLLER

export abstract class BaseComponent<T extends GameObject = GameObject> implements Component<T>
{
    enabled: boolean = true;
    go!: T;

    Added(go: T): void
    {
        this.go = go;
        this.OnAdd?.();
    }

    OnAdd?(): void;
    OnEnable?(): void;
    OnDisable?(): void;

    OnStart?(): void;
    OnUpdate?(deltaTime: number): void;
}

export class ComponentController
{
    public componentsByGameObject = new Map<string, Component<any>[]>() // TODO private
    private componentsByType = new Map<Ctor<Component<any>>, Component<any>[]>()
    private queuedForStart: Component<any>[] = [];

    constructor()
    {
        this.init();
    }

    init()
    {
        events.persistent.on(BareEvent.componentController_Update, this.Update.bind(this));
        events.persistent.on(BareEvent.componentController_PreRender, this.PreRender.bind(this));
        events.persistent.on(BareEvent.componentController_Render, this.Render.bind(this));
        events.persistent.on(BareEvent.componentController_PostRender, this.PostRender.bind(this));
        events.persistent.on(BareEvent.componentController_OnLevelChanged, this.OnLevelChanged.bind(this));

        events.persistent.on(BareEvent.collisionStart, this.OnCollisionStart.bind(this));
        events.persistent.on(BareEvent.collisionUpdate, this.OnCollisionUpdate.bind(this));
        events.persistent.on(BareEvent.collisionEnd, this.OnCollisionEnd.bind(this));

        events.persistent.on(BareEvent.gameObjectRemoved, this.RemoveComponentsForObject.bind(this));

        events.persistent.on(BareEvent.preSaveLevel, this.OnPreSaveLevel.bind(this));
        
        pipes.set("componentController_GetAllComponentsFrom", (obj) => this.GetAllComponentsFrom(obj));
        pipes.set("componentController_ProcessCompentsFromEntity", (entity, obj) => this.ProcessCompentsFromEntity(entity, obj));
        pipes.set("componentController_AddComponent", (obj, componentInstance) => this.AddComponent(obj, componentInstance));
    }

    public ProcessCompentsFromEntity(entity:Entity, obj:GameObject)
    {
        // CREATE COMPONENTS
        function ProcessComponents(componentType: 'components' | 'editorComponents')
        {
            // PREPARE NEW DATA OBJ
            var components: Record<string, Record<string, any>> = {};

            var entityComps = entity[componentType];

            // COPY OVER ENTITY OBJ TO NEW OBJ
            for (const componentName in entityComps)
            {
                // ADD ENTITY COMPONENT (DEEP COPY) TODO: USE STRUCTURED CLONE THING FOR BETTER PERFORMANCE 
                components[componentName] = JSON.parse(JSON.stringify(entityComps[componentName]));
            }

            // CHECK ENTITY MODIFICATIONS
            if (entity)
            {
                var entityComps = entity[componentType];

                for (const componentName in entityComps)
                {
                    if (components[componentName])
                    {
                        // COMPONENT ALREADY EXISTS, OVERWRITE WITH NEW VALUES
                        for (const key in entityComps[componentName])
                        {
                            components[componentName][key] = entityComps[componentName][key];
                        }
                    }
                    else
                    {
                        // ADD NEW COMPONENT
                        components[componentName] = entityComps[componentName];
                    }
                }

                // REMOVED COMPONENTS SPECIFICALLY LISTED IN ENTITY
                if (entity.componentsRemoved)
                {
                    for (const componentName of entity.componentsRemoved)
                    {
                        //obj.componentsRemoved.push(componentName); // STORE SO IT'S SO IT'S SAVED AGAIN LATER
                        delete components[componentName];
                    }
                }
            }

            // ADD COMPONENTS BASED ON OBJ
            for (const componentName in components)
            {
                // FIND COMPONENT CLASS BASED ON NAME e.g. goal -> GoalComponent
                const className = componentName.charAt(0).toUpperCase() + componentName.slice(1) + 'Component';
                const ComponentClass = bare.componentClasses[className];

                if (!ComponentClass) // THIS IS NEEDED FOR RELEASE BUILD, SOME P COMPONENT GETS ADDED THAT'S NOT THERE IN GAME, TODO
                    continue;

                // INSTANCIATE AND ADD COMPONENT - VALUES BECOME ARGUMENTS
                const componentValues = components[componentName];
                var componentInstance = new ComponentClass(...Object.values(componentValues));
                componentController.AddComponent(obj, componentInstance);
            }
        }

        if (gameMode == GameMode.Game)
            ProcessComponents('components');
        else
        if (gameMode == GameMode.Editor)
            ProcessComponents('editorComponents');
    }

    private OnLevelChanged({ uids }): void
    {
        // CALL ONLEVELCHANGED ON PERSISTENT OBJECTS
        for (var i = 0; i < uids.length; i++)
        {
            let uid = uids[i]; 
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
        this.CallMethodOnAllComponents('PreSaveLevel');
    }

    AddComponent<T extends GameObject, C extends Component<T>>(go: T, componentClass: Ctor<C>): C;
    AddComponent<T extends GameObject, C extends Component<T>>(go: T, componentInstance: C): C;

    AddComponent<T extends GameObject, C extends Component<T>>(go: T, arg: Ctor<C> | C): C {
        const component: C = (typeof arg === "function") ? new arg() : arg;

        component.go = go;
        component.enabled = true;

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

        if (component.Added)
        {
            component.Added(go);
        }

        if (component.OnStart)
        {
            this.queuedForStart.push(component)
        }

        return component;
    }
    
    GetComponent<T extends BaseComponent>(go: GameObject, componentType: Ctor<T>): T | null
    {
        const components = this.componentsByGameObject.get(go.uniqueID);
        if (!components) return null;

        const component = components.find(c => c instanceof componentType);
        return (component as T) ?? null;
    }

    HasComponent<T extends BaseComponent>(go: GameObject, componentType: Ctor<T>): boolean
    {
        return this.GetComponent<T>(go, componentType) != null;
    }

    GetComponentsByType<ComponentType extends Component<any>>(componentType: Ctor<ComponentType>): ComponentType[]
    {
        return this.componentsByType.get(componentType) as unknown as ComponentType[]
    }

    GetAllComponentsFrom(object: GameObject): Component<any>[]
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

    MoveComponent<T extends BaseComponent>(from: GameObject, to: GameObject, componentType: Ctor<T>): T | null
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

        if (component.Removed)
            component.Removed();

        components.splice(index, 1);

        // Remove from componentsByType as well
        const typeComponents = this.componentsByType.get(component.constructor as Ctor<Component<any>>) as Component<any>[] | undefined;
        if (typeComponents)
        {
            const typeIndex = typeComponents.indexOf(component);
            if (typeIndex > -1)
                typeComponents.splice(typeIndex, 1);

            if (typeComponents.length == 0)
                this.componentsByType.delete(component.constructor as Ctor<Component<any>>);
        }

        // SAVE COMPONENT REMOVED FOR GAMEOBJECT
        var compName = component.constructor.name.replace('Component', '').toLowerCase();

        if (!go.levelEntity)
            go.levelEntity = {name: "", componentsRemoved: []};
        if (!go.levelEntity.componentsRemoved)
            go.levelEntity.componentsRemoved = [];

        go.levelEntity.componentsRemoved.push(compName);

        if (components.length == 0)
            this.componentsByGameObject.delete(go.uniqueID);

        return true;
    }

    RemoveComponentsForObject(object: GameObject, ignoring: any[] = [])
    {
        // clear component in componentsByGameObject
        const entries = this.componentsByGameObject.entries()
        for (const [, components] of entries)
        {
            for (var i = components.length - 1; i >= 0; i--)
            {
                var component = components[i];
                if (component.go == object)
                {
                    // Check if this component type should be ignored
                    const shouldIgnore = ignoring.some(ignoredType => component.constructor === ignoredType);
                    if (shouldIgnore) {
                        continue; // Skip this component
                    }
                    
                    // clear component in componentsByGameObject
                    const index = components.indexOf(component)
                    components.splice(index, 1);

                    if (components.length == 0)
                        this.componentsByGameObject.delete(object.uniqueID)
                    
                    // clear component in componentsByType too
                    const typeComponents = this.componentsByType.get(component.constructor as Ctor<Component<any>>) as Component<any>[];
                    const typeIndex = typeComponents.indexOf(component);
                    typeComponents.splice(typeIndex, 1);

                    if (typeComponents.length == 0)
                        this.componentsByType.delete(component.constructor as Ctor<Component<any>>)

                    if (component.Removed)
                    {
                        component.Removed()
                    }
                }
            }
        }
    }

    RemoveAllComponents()
    {
        this.CallMethodOnAllComponents('Removed');

        // Clear all component references
        this.componentsByGameObject.clear()
        this.componentsByType.clear()
        
        this.queuedForStart = []
    }

    EnableComponent<T extends BaseComponent>(obj: GameObject, componentType: Ctor<T>)
    {
        const component = this.GetComponent(obj, componentType);
        if (component)
        {
            component.enabled = true;

            if (component.OnEnable)
            {
                component.OnEnable()
            }
        }
    }

    DisableComponent<T extends BaseComponent>(obj: GameObject, componentType: Ctor<T>)
    {
        const component = this.GetComponent(obj, componentType);
        if (component)
        {
            component.enabled = false; // OR COULD BE SET IN BASE COMPONENT METHOD

            if (component.OnDisable)
            {
                component.OnDisable()
            }
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

    OnCollisionStart(initiatingObject: GameObject, collidingObject: GameObject)
    {
        const entries = this.componentsByGameObject.entries()
        for (const [, components] of entries)
        {
            components.forEach(component => {
                if (!component.OnCollisionStart) return;

                if (component.go == initiatingObject)
                    component.OnCollisionStart(initiatingObject, collidingObject);
                else if (component.go == collidingObject)
                    component.OnCollisionStart(collidingObject, initiatingObject);
            })
        }
    }

    OnCollisionUpdate(initiatingObject: GameObject, collidingObject: GameObject)
    {
        const entries = this.componentsByGameObject.entries()
        for (const [, components] of entries)
        {
            components.forEach(component => {
                if (!component.OnCollisionUpdate) return;

                if (component.go == initiatingObject)
                    component.OnCollisionUpdate(initiatingObject, collidingObject);
                else if (component.go == collidingObject)
                    component.OnCollisionUpdate(collidingObject, initiatingObject);
            })
        }
    }

    OnCollisionEnd(initiatingObject: GameObject, collidingObject: GameObject)
    {
        const entries = this.componentsByGameObject.entries()
        for (const [, components] of entries)
        {
            components.forEach(component => {
                if (!component.OnCollisionEnd) return;

                if (component.go == initiatingObject)
                    component.OnCollisionEnd(initiatingObject, collidingObject);
                else if (component.go == collidingObject)
                    component.OnCollisionEnd(collidingObject, initiatingObject);
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

    PreRender()
    {
        this.CallMethodOnAllComponents('PreRender');
    }

    Render()
    {
        this.CallMethodOnAllComponents('Render');
    }

    PostRender()
    {
        this.CallMethodOnAllComponents('PostRender');
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

    CallMethodOnComponentsOfObject<T extends keyof Component<any>>(methodName: T, object: GameObject, ...args: any[]): void {
        var allCompsObject = this.GetAllComponentsFrom(object);

        for (const component of allCompsObject) {
            const method = component[methodName];
            if (component.enabled && typeof method === 'function') {
                (method as Function).call(component, ...args);
            }
        }
    }
}

export const componentController = new ComponentController();
globalThis.componentController = componentController;
