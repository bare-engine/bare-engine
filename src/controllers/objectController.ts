import { BareEngine } from "../exports";
import { GameObject } from "../objects/gameObject";
import { UI_LAYER } from "../types/bareTypes";

export class ObjectController
{
    active: boolean = true;
    private layers: Array<Array<GameObject>>;

    constructor()
    {
        // TODO: MAKE LAYERS GAMEOBJECTS?
        
        this.layers = [];
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
                object.PreRender();
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

    Add(obj: GameObject, layer: int = 0): void
    {
        // ADD MORE LAYERS IF NEEDED - TODO: PUT AT INITIALIZATION?
        if (layer >= UI_LAYER)
            layer -= UI_LAYER;
        
        if (layer >= this.layers.length)
        {
            for (let i = this.layers.length; i <= layer; i++)
            {
                this.layers.push([]);
            }
        }

        var layerNum = this.GetLayerNumber(layer);
        this.layers[layerNum].push(obj);
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
        var layerNum = this.GetLayerNumber(layer);
        
        if (!this.layers[layerNum])
        {
            console.warn(`Layer ${layer} does not exist`);
            return false;
        }

		for (let i = 0; i < this.layers[layerNum].length; i++)
		{
			if (this.layers[layerNum][i] === obj)
			{
				this.layers[layerNum].splice(i, 1);
				return true;
			}
		}
		
		return false;
	}

    GetLayer(layer: int): GameObject[]
    {
        var layerNum = this.GetLayerNumber(layer);
        
        // ADD MORE LAYERS IF NEEDED - TODO: PUT AT INITIALIZATION?
        if (layerNum >= this.layers.length)
        {
            for (let i = this.layers.length; i <= layerNum; i++)
            {
                this.layers.push([]);
            }
        }

        return this.layers[layerNum];
    }

    GetLayerByName(name: string): GameObject[]
    {
        const layerI = bare.layerNames.indexOf(name);
        if (layerI == -1)
        {
            console.error(`Layer ${name} does not exist`);
            return [];
        }

        return this.GetLayer(layerI);
    }

    GetLayerNumber(layer: int):int
    {
        if (layer < UI_LAYER)
            return layer;
        else
            return (layer - UI_LAYER);
    }

    GetObjectLayer(obj: GameObject): int
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

    GetAllObjects(): Array<GameObject>
    {
        return this.layers.flat();
    }

    GetObjectById(id: string): GameObject | null
    {
        for (let i = 0; i < this.layers.length; i++)
        {
            for (let j = 0; j < this.layers[i].length; j++)
            {
                if (this.layers[i][j].uniqueID === id)  
                {
                    return this.layers[i][j];
                }
            }
        }
        
        return null;
    }

    GetObjectByName(name: string): GameObject | null
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
    
    Clear(includingPersistent: boolean = false)
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

                bare.RemoveGameObject(obj, i);
            }
        }

        //this.layers = [];
    }
}

export const objectController = BareEngine.RegisterControllerProxy(ObjectController);