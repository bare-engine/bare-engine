import { GameObject } from "../objects/gameObject";
import { Scene } from "../scenes/scene";
import { RegisterController } from "../globals";
import { InspectorField } from "../utils/decorators";

export class ObjectController
{
    active: boolean = true;
    private layers: Array<Array<GameObject>>;

    public scene: Scene;

    @InspectorField
    private get objectsNum():int { return this.GetAll().length; }
    
    @InspectorField
    private get layersNum():int { return this.layers.length; }
    
    constructor(scene: Scene)
    {
        this.scene = scene;
    
        // TODO: MAKE LAYERS GAMEOBJECTS?
        
        this.layers = [];
    }

    FixedUpdate(fixedDeltaTime: number): void
    {
        if (!this.active)
            return;

        // PRETTY USELESS LOOPING THROUGH THIS IF NO GAMEOBJECTS HOOK INTO FIXED-UPDATE
        // ONLY USEFUL IF USER GAMEOBJECTS DO - TODO: REMOVE? MAYBE NOT TOO HEAVY THOUGH
        // CAN ADD A doFixedUpdate/doUpdate field
        for (let i = 0; i < this.layers.length; i++)
        {
            for (let j = 0; j < this.layers[i].length; j++)
            {
                const object = this.layers[i][j];
                object.FixedUpdate(fixedDeltaTime);
            }
        }
    }

    Update(deltaTime: number)
    {
        if (!this.active)
            return;

        for (let i = 0; i < this.layers.length; i++)
        {
            for (let j = 0; j < this.layers[i].length; j++)
            {
                const object = this.layers[i][j];
                object.Update(deltaTime);
            }
        }
    }
    
    PreRender()
    {
        if (!this.active)
            return;

        for (let i = 0; i < this.layers.length; i++)
        {
            for (let j = 0; j < this.layers[i].length; j++)
            {
                const object = this.layers[i][j];
                object.OnPreRender();
            }
        }
    }
    
    Render()
    {
        if (!this.active)
            return;

        for (let i = this.layers.length - 1; i >= 0; i--)
        {
            for (let j = 0; j < this.layers[i].length; j++)
            {
                const object = this.layers[i][j];
                object.Render();
            }
        }
    }
    
    PostRender()
    {
        if (!this.active)
            return;

        for (let i = 0; i < this.layers.length; i++)
        {
            for (let j = 0; j < this.layers[i].length; j++)
            {
                const object = this.layers[i][j];
                object.PostRender();
            }
        }
    }

    Add(obj: GameObject, layer: int | string = "objects"): void
    {
        var layerInt = 0;

        if (typeof layer === 'string')
            layerInt = this.scene.layerNames.indexOf(layer);
        else
            layerInt = layer;
        
        var layerAr = this.GetLayer(layerInt);
        layerAr.push(obj);
    }

	Remove(obj: GameObject, layer?: int): boolean
	{
        //if (obj.persistent)
        //    return false;

		if (layer !== undefined)
		{
			return this.RemoveFromLayer(obj, layer);
		}
		
		for (let i = 0; i < this.layers.length; i++)
		{
			if (this.RemoveFromLayer(obj, i))
			{
				return true;
			}
		}
		
		return false;
	}

	private RemoveFromLayer(obj: GameObject, layer: int): boolean
	{
        if (!this.layers[layer])
        {
            console.warn(`Layer ${layer} does not exist`);
            return false;
        }

		for (let i = 0; i < this.layers[layer].length; i++)
		{
			if (this.layers[layer][i] === obj)
			{
				this.layers[layer].splice(i, 1);
				return true;
			}
		}
		
		return false;
	}

    // IF YOU CALL THIS WITH Layer.OBJECTS FROM ANOTHER SCENE THAN YOUR MAIN SCENE, IT WILL PROBABY BE WRONG
    // Layer.OBJECTS IS GENERATED TO ALIGN WITH LAYERS OF SETTINGSDATA OF MAIN SCENE. CANNOT USE IT FOR OTHER SCENES - TODO
    // GENERATE MULTIPLE LAYER CLASSES?
    GetLayer(layer: int): GameObject[]
    {
        // ADD MORE LAYERS IF NEEDED - TODO: PUT AT INITIALIZATION?
        while (layer >= this.layers.length)
        {
            this.layers.push([]);
        }

        return this.layers[layer];
    }

    GetLayerByName(name: string): GameObject[]
    {
        const layerI = this.scene.layerNames.indexOf(name);
        if (layerI == -1)
        {
            //console.error(`Layer ${name} does not exist`);
            return [];
        }

        return this.GetLayer(layerI);
    }

    GetLayerOf(obj: GameObject): int
    {
        for (let i = 0; i < this.layers.length; i++)
        {
            if (this.layers[i].includes(obj))
            {
                return i;
            }
        }

        return -1;
    }

    GetLayers(): Array<Array<GameObject>>
    {
        return this.layers;
    }

    GetAll(): Array<GameObject>
    {
        return this.layers.flat();//REVERSE IT?
    }

    GetById(id: string, searchChildren: boolean = true): GameObject | null
    {
        // LOOK THROUGH ALL LAYER FOR OBJECT - CHEAP
        for (let i = 0; i < this.layers.length; i++)
        {
            for (let j = 0; j < this.layers[i].length; j++)
            {
                if (this.layers[i][j].uniqueID == id)  
                {
                    return this.layers[i][j];
                }
            }
        }

        // CAN SET searchChildren TO FALSE TO MAKE THIS METHOD CHEAPER
        if (!searchChildren)
            return null;

        // FIRST PASS FAILED, START LOOKING THROUGH ALL CHILDREN RECURSIVELY - MORE COSTLY
        // JUST HAVE A SHALLOW LIST OF ALL OBJECTS? TODO
        var recurseChildren = (obj: GameObject): GameObject | null =>
        {
            for (let i = 0; i < obj.children.length; i++)
            {
                var child = obj.children[i];

                if (child.uniqueID == id)
                    return child;

                var found = recurseChildren(child);
                if (found)
                    return found;
            }

            return null;
        }

        for (let i = 0; i < this.layers.length; i++)
        {
            for (let j = 0; j < this.layers[i].length; j++)
            {
                var foundChild = recurseChildren(this.layers[i][j]);
                if (foundChild)
                    return foundChild;
            }
        }
        
        return null;
    }

    GetByName(name: string): GameObject | null
    {
        for (let i = 0; i < this.layers.length; i++)
        {
            for (let j = 0; j < this.layers[i].length; j++)
            {
                if (this.layers[i][j].name === name)  
                {
                    return this.layers[i][j];
                }
            }
        }
        
        return null;
    }

    GetByCustomName(customName: string): GameObject | null
    {
        for (let i = 0; i < this.layers.length; i++)
        {
            for (let j = 0; j < this.layers[i].length; j++)
            {
                if (this.layers[i][j].customName === customName)  
                {
                    return this.layers[i][j];
                }
            }
        }
        
        return null;
    }

    BringToFront(obj: GameObject): boolean
    {
        for (let i = 0; i < this.layers.length; i++)
        {
            for (let j = 0; j < this.layers[i].length; j++)
            {
                if (this.layers[i][j] === obj)  
                {
                    this.layers[i].splice(j, 1);
                    this.layers[i].push(obj);
                    return true;
                }
            }
        }
        return false;
    }

    BringToBack(obj: GameObject): boolean
    {
        for (let i = 0; i < this.layers.length; i++)
        {
            for (let j = 0; j < this.layers[i].length; j++)
            {
                if (this.layers[i][j] === obj)  
                {
                    this.layers[i].splice(j, 1);
                    this.layers[i].unshift(obj);
                    return true;
                }
            }
        }
        return false;
    }

    MoveToLayer(obj: GameObject, layer: int): boolean
    {
        for (let i = 0; i < this.layers.length; i++)
        {
            if (this.layers[i].includes(obj))  
            {
                this.layers[i].splice(this.layers[i].indexOf(obj), 1);
                this.layers[layer].push(obj);
                return true;
            }
        }
        return false;
    }

    MoveWithinLayer(obj: GameObject, index: int): boolean
    {
        for (let i = 0; i < this.layers.length; i++)
        {
            if (this.layers[i].includes(obj))  
            {
                this.layers[i].splice(this.layers[i].indexOf(obj), 1);
                this.layers[i].splice(index, 0, obj);
                return true;
            }
        }
        return false;
    }
    
    Clear(includingPersistent: boolean = true)
    {
        var layers = this.GetLayers();
        for (var i = 0; i < layers.length; i++)
        {
            var layer = layers[i];
            for (var j = layer.length - 1; j >= 0; j--)
            {
                var obj = layer[j];
                
                if (!includingPersistent && obj.persistent)
                    continue;

                this.scene.RemoveGameObject(obj, i);
            }
        }

        //this.layers = [];
    }
}

RegisterController(ObjectController);
