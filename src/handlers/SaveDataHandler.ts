import { globalEvents } from "../globals";
import { SaveData, BareEvent } from '../types/bareTypes';
export class SaveDataHandler
{
    static saveEnabled: boolean = true;
    static readonly gameId: string = __BARE_GAME_ID__;

    private static defaults: Map<string, any> = new Map();
    private static readonly storagePrefix = `${this.gameId}:`;

    public static GetStorageKey(key: string): string
    {
        return `${this.storagePrefix}${key}`;
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
            } else if (value instanceof Map) {
                (SaveData as any)[key] = new Map(value);
            } else if (typeof value === 'object' && value !== null) {
                (SaveData as any)[key] = JSON.parse(JSON.stringify(value));
            } else {
                (SaveData as any)[key] = value;
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
                this.defaults.set(key, JSON.parse(JSON.stringify(value)));
            } else {
                this.defaults.set(key, value);
            }
        }
    }

    static Save()
    {
        if (!localStorage || !this.saveEnabled)
            return;

        for (const key in SaveData)
        {
            if (typeof (SaveData as any)[key] === 'function' || key[0] === key[0].toUpperCase())
                continue;

            const value = (SaveData as any)[key];
            this.SaveItem(key, value);
        }
    }

    static Load()
    {
        if (!localStorage)
            return;

        for (const key in SaveData)
        {
            if (typeof (SaveData as any)[key] === 'function' || key[0] === key[0].toUpperCase())
                continue;

            const defaultValue = this.defaults.get(key);
            (SaveData as any)[key] = this.LoadItem(key, defaultValue);
        }
    }

    static Clear()
    {
        if (!localStorage)
            return;
            
        SaveData.levelCache.clear();

        for (let index = localStorage.length - 1; index >= 0; index--)
        {
            const key = localStorage.key(index);
            if (key?.startsWith(this.storagePrefix))
                localStorage.removeItem(key);
        }
        
        // Reset all properties to their default values
        for (const [key, defaultValue] of this.defaults)
        {
            if (defaultValue instanceof Set) {
                (SaveData as any)[key] = new Set(defaultValue);
            } else if (defaultValue instanceof Map) {
                (SaveData as any)[key] = new Map(defaultValue);
            } else if (typeof defaultValue === 'object' && defaultValue !== null) {
                (SaveData as any)[key] = JSON.parse(JSON.stringify(defaultValue));
            } else {
                (SaveData as any)[key] = defaultValue;
            }
        }
    }

    private static SaveItem<T>(key: string, value: T): void
    {
        key = this.GetStorageKey(key);

        if (typeof value === 'string') {
            localStorage.setItem(key, value);
        } else if (typeof value === 'boolean' || typeof value === 'number') {
            localStorage.setItem(key, value.toString());
        } else if (value instanceof Set) {
            localStorage.setItem(key, JSON.stringify(Array.from(value)));
        } else if (value instanceof Map) {
            localStorage.setItem(key, JSON.stringify(Array.from(value)));
        } else {
            localStorage.setItem(key, JSON.stringify(value));
        }
    }

    private static LoadItem<T>(key: string, defaultValue: T): T
    {
        key = this.GetStorageKey(key);
        const item = localStorage.getItem(key);
        
        if (item === null) {
            return defaultValue;
        }

        const defaultType = typeof defaultValue;
        
        if (defaultType === 'boolean') {
            return (item === 'true') as T;
        }
        
        if (defaultType === 'number') {
            return parseInt(item) as T;
        }
        
        if (defaultType === 'string') {
            return item as T;
        }
        
        if (defaultValue instanceof Set) {
            return new Set(JSON.parse(item)) as T;
        }
        
        if (defaultValue instanceof Map) {
            return new Map(JSON.parse(item)) as T;
        }
        
        return JSON.parse(item) as T;
    }
}

SaveDataHandler.InitDefaults();

globalEvents.persistent.on(BareEvent.game_awake, () => {
    SaveDataHandler.InitDefaults();

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
