import { BareEvent } from '../types/bareTypes';
import { globalEvents } from "../main";

export class KeyboardController
{
    private keysPressed: Set<string> = new Set<string>();
    private keysPressedPrevFrame: Set<string> = new Set<string>();
    private keysJustPressed: Set<string> = new Set<string>();

    constructor()
    {
        this.setupEventListeners();
        
        globalEvents.persistent.on(BareEvent.game_update, this.Update.bind(this));
    }

    private setupEventListeners(): void
    {
        // KEY DOWN
        document.addEventListener('keydown', (event: any) => {
            if (bareEngine.MouseIsOnEditor(event))
                return; // Allow normal typing inside the editor UI

            //trace(event.key)

            const key = event.key.toLowerCase();
            if (!this.keysPressed.has(key)) {
                this.keysJustPressed.add(key);
            }

            if (!this.keysPressed.has(key))
            {
                this.keysPressed.add(key);
                globalEvents.emit(BareEvent.key_pressed, { key: key, allKeys: Array.from(this.keysPressed) });
            }

            globalEvents.emit(BareEvent.key_down, { key: key, allKeys: Array.from(this.keysPressed) });

            event.preventDefault();
        });

        // KEY UP
        document.addEventListener('keyup', (event: any) => {
            if (bareEngine.MouseIsOnEditor(event))
                return; // Allow normal typing inside the editor UI

            const key = event.key.toLowerCase();
            this.keysPressed.delete(key);
            this.keysJustPressed.delete(key);

            globalEvents.emit(BareEvent.key_released, { key: key, allKeys: Array.from(this.keysPressed) });
        });

        // Handle window focus/blur to reset keys
        document.addEventListener('blur', () => {
            this.keysPressed.clear();
            this.keysJustPressed.clear();
        });

        // Handle window focus/blur to reset keys
        document.addEventListener('focus', () => {
            // Clear keys to prevent stuck keys
            this.keysPressed.clear();
            this.keysJustPressed.clear();
            
            const canvas = rapid.canvas;
            if (canvas) canvas.focus();
        });
    }

    public Update(): void
    {
        //trace(this.keysPressed)

        // Copy current state to previous frame
        this.keysPressedPrevFrame = new Set(this.keysPressed);

        // Clear the just pressed keys for next frame
        this.keysJustPressed.clear();
    }

    public IsKeyDown(key: string): boolean
    {
        return this.keysPressed.has(key);
    }

    public IsKeyPressed(key: string): boolean
    {
        return this.keysJustPressed.has(key);
    }

    public IsAnyKeyDown(): boolean
    {
        return (this.keysPressed.size > 0);
    }

    public IsAnyDirectionKeyDown(): boolean
    {
        return (this.IsUpDown() || this.IsDownDown() || this.IsLeftDown() || this.IsRightDown());
    }

    public IsUpDown(): boolean
    {
        return this.IsKeyDown("w") || this.IsKeyDown("z") || this.IsKeyDown("arrowup");
    }

    public IsUpPressed(): boolean
    {
        return this.IsKeyPressed("w") || this.IsKeyPressed("z") || this.IsKeyPressed("arrowup");
    }

    public IsDownDown(): boolean
    {
        return this.IsKeyDown("s") || this.IsKeyDown("arrowdown");
    }

    public IsDownPressed(): boolean
    {
        return this.IsKeyPressed("s") || this.IsKeyPressed("arrowdown");
    }

    public IsLeftDown(): boolean
    {
        return this.IsKeyDown("a") || this.IsKeyDown("q") || this.IsKeyDown("arrowleft");
    }

    public IsLeftPressed(): boolean
    {
        return this.IsKeyPressed("a") || this.IsKeyPressed("q") || this.IsKeyPressed("arrowleft");
    }

    public IsRightDown(): boolean
    {
        return this.IsKeyDown("d") || this.IsKeyDown("arrowright");
    }

    public IsRightPressed(): boolean
    {
        return this.IsKeyPressed("d") || this.IsKeyPressed("arrowright");
    }

    public GetKeysDown(): string[]
    {
        return Array.from(this.keysPressed);
    }

    public GetKeysPressed(): string[]
    {
        return Array.from(this.keysJustPressed);
    }

    public ClearAll(): void
    {
        this.keysPressed.clear();
        this.keysPressedPrevFrame.clear();
        this.keysJustPressed.clear();
    }
}

export const keyboardController = new KeyboardController();