import { globalEvents } from "../globals";
import { SaveData, BareEvent } from '../types/bareTypes';
import { Helper } from "../utils/helper";

// TYPED ARRAYS AND ArrayBuffers, WHICH JSON CAN'T HOLD, ARE SAVED AS { $binary: "Uint8Array", base64: "..." }
const binaryTypes: Record<string, (buffer: ArrayBuffer) => ArrayBuffer | ArrayBufferView> = {
    ArrayBuffer: b => b,
    DataView: b => new DataView(b),
    Int8Array: b => new Int8Array(b),
    Uint8Array: b => new Uint8Array(b),
    Uint8ClampedArray: b => new Uint8ClampedArray(b),
    Int16Array: b => new Int16Array(b),
    Uint16Array: b => new Uint16Array(b),
    Int32Array: b => new Int32Array(b),
    Uint32Array: b => new Uint32Array(b),
    Float32Array: b => new Float32Array(b),
    Float64Array: b => new Float64Array(b),
    BigInt64Array: b => new BigInt64Array(b),
    BigUint64Array: b => new BigUint64Array(b),
};

export class SaveDataHandler
{
    static saveEnabled: boolean = true;
    static readonly gameId: string = __BARE_GAME_ID__;

    private static defaults: Map<string, any> = new Map();

    public static GetStorageKey(): string
    {
        return this.gameId;
    }

    // Allow game code to attach additional SaveData fields without modifying the engine class
    static SetDefaults(defaults: Record<string, any>)
    {
        for (const [key, value] of Object.entries(defaults))
        {
            if ((SaveData as any)[key] !== undefined)
                continue;

            if (value instanceof Set) {
                (SaveData as any)[key] = new Set(value);
                this.defaults.set(key, new Set(value));
            } else if (value instanceof Map) {
                (SaveData as any)[key] = new Map(value);
                this.defaults.set(key, new Map(value));
            } else if (typeof value === 'object' && value !== null) {
                (SaveData as any)[key] = Helper.DeepCopy(value);
                this.defaults.set(key, Helper.DeepCopy(value));
            } else {
                (SaveData as any)[key] = value;
                this.defaults.set(key, value);
            }
        }
    }

    public static InitDefaults()
    {
        // Capture initial values from SaveData static properties
        for (const key in SaveData)
        {
            if (typeof (SaveData as any)[key] === 'function' || key[0] === key[0].toUpperCase())
                continue;

            const value = (SaveData as any)[key];
            
            // Deep copy for objects
            if (value instanceof Set) {
                this.defaults.set(key, new Set(value));
            } else if (value instanceof Map) {
                this.defaults.set(key, new Map(value));
            } else if (typeof value === 'object' && value !== null) {
                this.defaults.set(key, Helper.DeepCopy(value));
            } else {
                this.defaults.set(key, value);
            }
        }
    }

    /** Writes SaveData to localStorage. Returns false when it couldn't, for example because the storage is full. */
    static Save(): boolean
    {
        if (!localStorage || !this.saveEnabled)
            return false;

        const save: Record<string, any> = {};
        for (const key in SaveData)
        {
            if (typeof (SaveData as any)[key] === 'function' || key[0] === key[0].toUpperCase())
                continue;

            const value = (SaveData as any)[key];
            save[key] = value instanceof Set || value instanceof Map ? Array.from(value as any) : value;
        }

        const json = JSON.stringify(save, SaveDataHandler.ToJson);

        // THE STORAGE CAN BE FULL (ABOUT 5 MB PER SITE) OR BLOCKED. DON'T THROW INTO GAME CODE, BUT DON'T STAY QUIET EITHER
        try
        {
            localStorage.setItem(this.GetStorageKey(), json);
        }
        catch (error)
        {
            if (!(error instanceof DOMException))
                throw error;

            console.error(`SaveData wasn't saved (${error.name}): ${Math.round(json.length / 1024)} KB of save data. ${error.message}`);
            return false;
        }

        return true;
    }

    private static ToJson(_key: string, value: any): any
    {
        if (typeof value !== "object" || value === null || !(ArrayBuffer.isView(value) || value instanceof ArrayBuffer))
            return value;

        const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000)
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000) as unknown as number[]);

        return { $binary: Object.prototype.toString.call(value).slice(8, -1), base64: btoa(binary) };
    }

    private static FromJson(_key: string, value: any): any
    {
        if (typeof value !== "object" || value === null || typeof value.$binary !== "string" || typeof value.base64 !== "string")
            return value;

        const create = binaryTypes[value.$binary];
        if (!create)
            return value;

        const binary = atob(value.base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++)
            bytes[i] = binary.charCodeAt(i);

        return create(bytes.buffer);
    }

    static Load()
    {
        if (!localStorage)
            return;

        const item = localStorage.getItem(this.GetStorageKey());
        const save = item === null ? null : JSON.parse(item, SaveDataHandler.FromJson);

        if (save === null)
            return;
        
        for (const key in SaveData)
        {
            if (typeof (SaveData as any)[key] === 'function' || key[0] === key[0].toUpperCase())
                continue;

            const defaultValue = this.defaults.get(key);
            if (!Object.prototype.hasOwnProperty.call(save, key))
                (SaveData as any)[key] = defaultValue;
            else if (defaultValue instanceof Set)
                (SaveData as any)[key] = new Set(save[key]);
            else if (defaultValue instanceof Map)
                (SaveData as any)[key] = new Map(save[key]);
            else
                (SaveData as any)[key] = save[key];
        }

    }

    static Clear()
    {
        if (!localStorage)
            return;
            
        SaveData.levelCache.clear();

        localStorage.removeItem(this.GetStorageKey());

        // Reset all properties to their default values
        for (const [key, defaultValue] of this.defaults)
        {
            if (defaultValue instanceof Set) {
                (SaveData as any)[key] = new Set(defaultValue);
            } else if (defaultValue instanceof Map) {
                (SaveData as any)[key] = new Map(defaultValue);
            } else if (typeof defaultValue === 'object' && defaultValue !== null) {
                (SaveData as any)[key] = Helper.DeepCopy(defaultValue);
            } else {
                (SaveData as any)[key] = defaultValue;
            }
        }
    }
}

SaveDataHandler.InitDefaults();

globalEvents.persistent.on(BareEvent.game_awake, () => {
    bare.storage = SaveDataHandler;
});

globalEvents.persistent.on(BareEvent.game_completeClear, () => {
    SaveDataHandler.Clear();
    //SaveDataHandler.InitDefaults();
});

globalEvents.persistent.on(BareEvent.level_postSave, ({level}) => {
    SaveData.levelCache.set(SaveData.currentLevelStr, level);
    SaveDataHandler.Save();
});
