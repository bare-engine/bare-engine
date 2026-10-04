import { globalEvents } from "../globals";
import { SaveData, BareEvent } from '../types/bareTypes';
import { Helper } from "../utils/helper";

export class SaveDataHandler
{
    static saveEnabled: boolean = true;
    static readonly gameId: string = __BARE_GAME_ID__;

    private static defaults: Map<string, any> = new Map();
    private static readonly storagePrefix = `${this.gameId}:`;

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

    static Save()
    {
        if (!localStorage || !this.saveEnabled)
            return;

        const save: Record<string, any> = {};
        for (const key in SaveData)
        {
            if (typeof (SaveData as any)[key] === 'function' || key[0] === key[0].toUpperCase())
                continue;

            const value = (SaveData as any)[key];
            save[key] = value instanceof Set || value instanceof Map ? Array.from(value as any) : value;
        }

        localStorage.setItem(this.GetStorageKey(), JSON.stringify(save));
    }

    static Load()
    {
        if (!localStorage)
            return;

        const item = localStorage.getItem(this.GetStorageKey());
        const save = item === null ? null : JSON.parse(item);

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

        if (item === null && Array.from(this.defaults.keys()).some(key => localStorage.getItem(`${this.storagePrefix}${key}`) !== null))
            this.Save();
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
