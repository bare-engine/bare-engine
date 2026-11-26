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
    // structuredClone is missing on some older browsers/webviews; fall back to a manual clone with the same
    // semantics (Map/Set/Date/typed arrays/cycles kept, class instances become plain objects, throws on functions)
    static DeepCopy<T>(obj: T): T
    {
        if (typeof structuredClone === "function")
            return structuredClone(obj);
        return Helper.manualClone(obj, new Map()) as T;
    }

    private static manualClone(value: any, seen: Map<any, any>): any
    {
        const type = typeof value;
        if (type === "function" || type === "symbol")
            throw new Error("DeepCopy: value of type " + type + " could not be cloned");
        if (value === null || type !== "object")
            return value;

        if (seen.has(value))
            return seen.get(value);

        let copy: any;
        if (Array.isArray(value))
        {
            copy = new Array(value.length);
            seen.set(value, copy);
            for (let i = 0; i < value.length; i++)
                copy[i] = Helper.manualClone(value[i], seen);
            return copy;
        }
        if (value instanceof Date)
            copy = new Date(value.getTime());
        else if (value instanceof RegExp)
            copy = new RegExp(value.source, value.flags);
        else if (value instanceof ArrayBuffer)
            copy = value.slice(0);
        else if (ArrayBuffer.isView(value))
            copy = new (value.constructor as any)(value as any);
        else if (value instanceof Map)
        {
            copy = new Map();
            seen.set(value, copy);
            value.forEach((v, k) => copy.set(Helper.manualClone(k, seen), Helper.manualClone(v, seen)));
            return copy;
        }
        else if (value instanceof Set)
        {
            copy = new Set();
            seen.set(value, copy);
            value.forEach(v => copy.add(Helper.manualClone(v, seen)));
            return copy;
        }
        else
        {
            copy = {};
            seen.set(value, copy);
            for (const key of Object.keys(value))
                copy[key] = Helper.manualClone(value[key], seen);
            return copy;
        }

        seen.set(value, copy);
        return copy;
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

    // true when the browser reports a safe area on any side, eg for a notch, rounded corners or a home indicator
    static HasNotch(): boolean
    {
        const css = Helper.SafeAreaCss();
        return css.top > 0 || css.right > 0 || css.bottom > 0 || css.left > 0;
    }

    // how far in from each edge of the game to keep clear of the notch, rounded corners and home indicator, in screen
    // units (the units of a UI scene). the page asks to go under them (viewport-fit=cover), and the browser reports
    // them as env(safe-area-inset-*). on a phone held sideways iOS reports the same room on both sides, so only the
    // notch's side (see NotchSide) is kept. where the canvas doesn't reach the page's edge, eg beside the bars of a
    // fitted resolution, the bar already keeps that much clear, so that side is less or 0. it changes when the phone
    // turns, so read it again in OnResize
    static SafeArea(): { top: number, right: number, bottom: number, left: number }
    {
        const css = Helper.SafeAreaCss();

        // a browser that reports the two sides apart (android) already gives only the notch's side
        const side = Helper.NotchSide();
        if (side && css.left == css.right)
        {
            if (side == 'left') css.right = 0;
            else css.left = 0;
        }

        const topLeft = bare.GetCanvasScreenPosition(css.left, css.top);
        const bottomRight = bare.GetCanvasScreenPosition(window.innerWidth - css.right, window.innerHeight - css.bottom);

        return {
            top: Math.max(0, topLeft.y),
            right: Math.max(0, bare.width - bottomRight.x),
            bottom: Math.max(0, bare.height - bottomRight.y),
            left: Math.max(0, topLeft.x)
        };
    }

    // which side of the page a phone's notch is on when it's held sideways, by which way it's turned: its top, where
    // the camera is, goes left when it's turned counterclockwise. iOS gives that as window.orientation 90 (-90 the
    // other way), other browsers as the screen's angle 90 (270). null when it's upright or the browser doesn't say.
    // it doesn't check that there is a notch, see HasNotch for that
    static NotchSide(): 'left' | 'right' | null
    {
        const orientation = (window as { orientation?: unknown }).orientation;
        if (typeof orientation === 'number')
            return orientation === 90 ? 'left' : orientation === -90 ? 'right' : null;

        const angle = screen.orientation?.angle;
        return angle === 90 ? 'left' : angle === 270 ? 'right' : null;
    }

    // the browser's safe area at each edge of the page, in css pixels. read through a hidden element's padding,
    // because env() only resolves inside a css property
    private static SafeAreaCss(): { top: number, right: number, bottom: number, left: number }
    {
        const probe = document.createElement('div');
        probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;'
            + 'padding-top:env(safe-area-inset-top,0px);padding-right:env(safe-area-inset-right,0px);'
            + 'padding-bottom:env(safe-area-inset-bottom,0px);padding-left:env(safe-area-inset-left,0px)';
        document.body.appendChild(probe);

        const style = getComputedStyle(probe);
        const inset = {
            top: parseFloat(style.paddingTop) || 0,
            right: parseFloat(style.paddingRight) || 0,
            bottom: parseFloat(style.paddingBottom) || 0,
            left: parseFloat(style.paddingLeft) || 0
        };
        probe.remove();

        return inset;
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
