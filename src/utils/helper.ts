// helper.ts

import { Vec2, Color } from "../libraries/rapid-render";
import { GameObject } from "../objects/gameObject";
import { Entity, Rectangle, SettingsData } from "../types/bareTypes";

export interface Size {
    width: number;
    height: number;
}

export class Helper
{
    static DeepCopy<T>(obj: T): T
    {
        //return JSON.parse(JSON.stringify(obj)) as T;
        return structuredClone(obj);
    }

    static DeepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T
    {
        const mutableTarget = target as Record<string, any>;

        for (const key of Object.keys(source))
        {
            const sourceValue = source[key];
            const targetValue = mutableTarget[key];

            if (
                sourceValue !== null &&
                targetValue !== null &&
                typeof sourceValue === "object" &&
                typeof targetValue === "object" &&
                !Array.isArray(sourceValue) &&
                !Array.isArray(targetValue)
            )
            {
                Helper.DeepMerge(targetValue, sourceValue);
            }
            else
            {
                mutableTarget[key] = sourceValue;
            }
        }

        return target;
    }

    // like DeepMerge but never mutates either argument; returns a new object
    // where nested plain objects are merged and everything else is overridden by source
    static DeepMergeCopy<T extends Record<string, any>>(target: T, source: Partial<T>): T
    {
        const result: Record<string, any> = { ...target };

        for (const key of Object.keys(source))
        {
            const sourceValue = source[key];
            const targetValue = result[key];

            if (
                sourceValue !== null &&
                targetValue !== null &&
                typeof sourceValue === "object" &&
                typeof targetValue === "object" &&
                !Array.isArray(sourceValue) &&
                !Array.isArray(targetValue)
            )
            {
                result[key] = Helper.DeepMergeCopy(targetValue, sourceValue);
            }
            else
            {
                result[key] = sourceValue;
            }
        }

        return result as T;
    }

    static ToFixed(value: number, limit = 1e-13): number
    {
        return Math.round(value / limit) * limit;
    }

    static ScaleWithinContainer(obj: GameObject, containerSize: Size): void {
        const imageRatio = obj.texture!.width / obj.texture!.height;
        const containerRatio = containerSize.width / containerSize.height;
        
        let scale: number;

        obj.x = 0;
        obj.y = 0;

        if (containerRatio > imageRatio) {
            // fit to width
            scale = containerSize.width / obj.texture!.width;

            var heightScaled = obj.texture!.height * scale;
            var diff = containerSize.height - heightScaled;
            obj.y = diff / 2;
        } else {
            // fit to height
            scale = containerSize.height / obj.texture!.height;

            var widthScaled = obj.texture!.width * scale;
            var diff = containerSize.width - widthScaled;
            obj.x = diff / 2;
        }

        // Set scale uniformly
        obj.SetScale(scale);
    }

    static DegreesToRadians(degrees: number): number
    {
        return degrees * (Math.PI / 180);
    }
    
    static RadiansToDegrees(radians: number): number
    {
        return radians * (180 / Math.PI);
    }

    static RandomRange(min: number, max: number): number
    {
        return Math.random() * (max - min) + min;
    }

    static GetRanged(inMin: number, inMax: number, outMin: number, outMax: number, _in: number, limit: boolean = false): number
    {
        const amountIn: number = (_in - inMin) / (inMax - inMin);
        const out: number = Helper.Interpolate(outMin, outMax, amountIn, limit);
        return out;
    }

    static Interpolate(min: number, max: number, multi: number, limit: boolean = false): number
    {
        if (limit == null) limit = false;
        if (limit) return Math.min(Math.max(Math.min(min, max), Helper.Interpolate(min, max, multi)), Math.max(min, max));
        return min + (max - min) * multi;
    }

    static Lerp(min: number, max: number, multi: number, limit: boolean = false): number
    {
        return Helper.Interpolate(min, max, multi, limit);
    }

    static InterpolateVec2(a: Vec2, b: Vec2, t: number): Vec2
    {
        return new Vec2(Helper.Interpolate(a.x, b.x, t), Helper.Interpolate(a.y, b.y, t));
    }

    static Clamp(value: number, min: number, max: number): number
    {
        return Math.min(Math.max(value, min), max);
    }

    static MobileAndTabletCheck(): boolean
    {
        return (('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || ((navigator as any).msMaxTouchPoints > 0));
    }

    static HasNotch(): boolean
    {
        // get the <html> element
        var root = document.documentElement;

        // add CSS variables so we can read them back
        root.style.setProperty('--notch-top', 'env(safe-area-inset-top)');
        root.style.setProperty('--notch-right', 'env(safe-area-inset-right)');
        root.style.setProperty('--notch-bottom', 'env(safe-area-inset-bottom)');
        root.style.setProperty('--notch-left', 'env(safe-area-inset-left)');

        // get runtime styles
        var computedStyle = window.getComputedStyle(root);

        // read env values back and check if we have any values
        var hasNotch = [
            computedStyle.getPropertyValue('--notch-top') || '-1',
            computedStyle.getPropertyValue('--notch-right') || '-1',
            computedStyle.getPropertyValue('--notch-bottom') || '-1',
            computedStyle.getPropertyValue('--notch-left') || '-1'
        ]
            .map(parseInt)
            .filter(function(val) {
                return val > 0;
            })
            .length > 0;

        // remove CSS variables
        root.style.removeProperty('--notch-top');
        root.style.removeProperty('--notch-right');
        root.style.removeProperty('--notch-bottom');
        root.style.removeProperty('--notch-left');

        return hasNotch;
    }

    static IsAndroid(): boolean
    {
        const userAgent = navigator.userAgent.toLowerCase();
        return /android/i.test(userAgent);
    }

    static async loadRawString(url: string): Promise<string>
    {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.text();
    }

    static async loadJSONToString(url: string): Promise<string>
    {
        const rawString = await this.loadRawString(url);
        return rawString;
    }

    /*static async loadJSONFromString<T extends object>(rawString: string): Promise<T>
    {
        return JSON.parse(rawString) as T;
    }

    static async stringToJson<T extends object>(rawString: string): Promise<T>
    {
        return this.loadJSONFromString<T>(rawString);
    }*/

    static async loadJSON<T extends object>(url: string): Promise<T>
    {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json() as T;
    }

    static async loadJSONFile<T extends object>(file: File): Promise<T>
    {
        const text = await file.text();
        return JSON.parse(text) as T;
    }
    
    static async GetFilesInFolder(folderPath: string, recursive: boolean = false): Promise<string[]>
    {
        if (!__DEV__)
            return [];
        
        // SPECIFIC FOR THIS PROJECT - FUNCTIONALITY IN config/vite.config.cjs
        try {
            const response = await fetch(`/api/list-files?path=${encodeURIComponent(folderPath)}&recursive=${recursive}`);
            if (!response.ok) {
                console.warn(`[GetFilesInFolder] Missing list-files endpoint (${response.status}) for ${folderPath}`);
                return [];
            }

            const contentType = response.headers.get('content-type') || '';
            if (!contentType.includes('application/json')) {
                console.warn(`[GetFilesInFolder] Unexpected content-type "${contentType}" for ${folderPath}`);
                return [];
            }

            const data = await response.json();
            return data.files || [];
        } catch (error) {
            console.warn(`[GetFilesInFolder] Failed to list files for ${folderPath}`, error);
            return [];
        }
    }

    static SetMaxVec2Length(vec2: Vec2, max: number)
    {
        const length = Math.sqrt(vec2.x * vec2.x + vec2.y * vec2.y);
        if (length > max)
        {
            const scale = max / length;
            vec2.x *= scale;
            vec2.y *= scale;
        }
    }
    
    static Choose(...array: any[]): any
    {
        return array[Math.floor(Math.random() * array.length)];
    }
    
    static ChooseAr(array:Array<string>): string
    {
        return array[Math.floor(Math.random() * array.length)];
    }

    static randomizeMap(map: Map<string, string>): Map<string, string>
    {
        // Convert Map to array of entries
        const entries = Array.from(map.entries());
        
        // Shuffle the entries array (Fisher-Yates algorithm)
        for (let i = entries.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [entries[i], entries[j]] = [entries[j], entries[i]];
        }
        
        // Create a new Map from the shuffled entries
        return new Map(entries);
    }

    static VectorLength(vec2:any):number
    {
        return Math.sqrt(vec2.x*vec2.x + vec2.y*vec2.y);
    }

    static Distance = function(pos1:Vec2, pos2:Vec2)
    {
        var distancex = pos1.x - pos2.x;
        var distancey = pos1.y - pos2.y;
        return Math.sqrt(distancex * distancex + distancey * distancey);
    }

    static DistanceNoSqr = function(pos1:Vec2, pos2:Vec2)
    {
        var distancex = pos1.x - pos2.x;
        var distancey = pos1.y - pos2.y;
        return distancex * distancex + distancey * distancey;
    }

    // ANGLE IN DEGREES
    static Direction(p1:{x:number,y:number}, p2:{x:number,y:number})
    {
        var dx = p2.x - p1.x;
        var dy = p2.y - p1.y;
        return Math.atan2(dy,dx) * 180 / Math.PI;
    };

    static PointTowards(direction:number, distance:number = 1):Vec2
    {
        var p = new Vec2();
        p.x = Math.cos(direction * Math.PI / 180) * distance;
        p.y = Math.sin(direction * Math.PI / 180) * distance;
        return p;
    };

    static PointTowardsFrom(from:Vec2, direction:number, distance:number = 1)
    {
        //return Helper.pointTowards(direction,distance).add(from);
        var p = Helper.PointTowards(direction, distance);
        p.x += from.x;
        p.y += from.y;
        return p;
    };

    static PointTowardsFromTo(from:Vec2, to:Vec2, distance:number)
    {
        return Helper.PointTowardsFrom(from, Helper.Direction(from, to), distance);
    };

    static AngleDifference(angle0:number, angle1:number, positive?:boolean):number
    {
        if(positive == null)
            positive = false;

        if (positive)
            return Math.abs(Helper.AngleDifference(angle0, angle1));

        var dif = (angle0 - angle1) % 360;

        if (Math.abs(dif) > 180) {
            if (dif < 0) 
                dif = dif + 360;
            else 
                dif = dif - 360;
        }

        return dif;
    }

    static SnapDirection(dir:number, snapTolerance:number)
    {
        var normalizedDir = ((dir % 360) + 360) % 360;
        var cardinalDirections = [0, 90, 180, 270];
        
        var closestDir = cardinalDirections[0];
        var minDiff = Math.abs(Helper.AngleDifference(normalizedDir, closestDir, true));
        
        for (var i = 1; i < cardinalDirections.length; i++) {
            var diff = Math.abs(Helper.AngleDifference(normalizedDir, cardinalDirections[i], true));
            if (diff < minDiff) {
                minDiff = diff;
                closestDir = cardinalDirections[i];
            }
        }
        
        if (minDiff < snapTolerance) {
            return closestDir;
        }
        
        return dir;
    }

    static CapitalizeFirstLetter(str:string)
    {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    static DecapitalizeFirstLetter(str:string)
    {
        return str.charAt(0).toLowerCase() + str.slice(1);
    }
    
    static MultiplyColors(color1: Color, color2: Color): Color
    {
        return new Color(
            (color1.r / 255) * (color2.r / 255) * 255,
            (color1.g / 255) * (color2.g / 255) * 255,
            (color1.b / 255) * (color2.b / 255) * 255,
            (color1.a / 255) * (color2.a / 255) * 255
        );
    }

    static IsPointInRectangle(point: Vec2, rect: Rectangle): boolean
    {
        return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
    }

    static ObjectsAreEqual(obj1: Object, obj2: Object): boolean
    {
        return JSON.stringify(obj1) === JSON.stringify(obj2); // PROBABLY NOT FAST
    }

    static AlmostEqual(a: number, b: number, eps: number = 0.001): boolean
    {
        return Math.abs(a - b) < eps;
    }

    static JsonArToVec2Ar(jsonAr: { x: number; y: number }[]): Vec2[]
    {
        return jsonAr.map(p => new Vec2(p.x, p.y));
    }

    // EG: Helper.GetConstructorParamNames(this.constructor);
    static GetConstructorParamNames(cls:Function): string[]
    {
        const constructorString = cls.toString();
        const match = constructorString.match(/constructor\s*\(([^)]*)\)/);
        if (!match) return [];
        
        return match[1]
            .split(',')
            .map(param => param.trim().split(/[:=\s]/)[0].trim())
            .filter(name => name.length > 0);
    }

    static GetParentClasses(cls: any): string[]
    {
        const classes: string[] = [];
        let current = Object.getPrototypeOf(cls);

        while (current && current.name)
        {
            classes.push(current.name);
            current = Object.getPrototypeOf(current);
        }

        return classes;
    }

    // bare.AddClass RESTORES THE TRUE cls.name AT REGISTRATION, SO THIS USUALLY
    // RETURNS IT DIRECTLY. FALLBACK STRIPS THE LEADING _ AND TRAILING NUMBER THE
    // DECORATOR TRANSFORM ADDS TO UNREGISTERED CLASSES, EG: Weapon -> Weapon2.
    static GetNameFromClass(_class: any): string
    {
        return _class.name.replace(/^_/, '').replace(/\d+$/, '');
    }

    static RemoveExtension(path: string): string
    {
        return path.replace(/\.[^/.]+$/, "");
    }
    
    static GenerateEntityUID(): string
    {
        const bytes = new Uint8Array(8);
        globalThis.crypto.getRandomValues(bytes);
        return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
    }
}
