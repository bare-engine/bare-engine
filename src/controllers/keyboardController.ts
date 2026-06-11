import { BareEvent } from '../types/bareTypes';
import { globalEvents } from "../globals";

export class KeyboardController
{
    private keysPressed: Set<string> = new Set<string>();
    private keysPressedPrevFrame: Set<string> = new Set<string>();
    private keysJustPressed: Set<string> = new Set<string>();

    constructor()
    {
        globalEvents.once(BareEvent.game_awake, this.setupEventListeners.bind(this));
        globalEvents.persistent.on(BareEvent.game_update, this.Update.bind(this));
    }

    private setupEventListeners(): void
    {
        bare.keyboard = this;
        
        var processKey = (key: string) => {
            var processedkey = key.charAt(0).toLowerCase() + key.slice(1); // LOWERCASE FIRST LETTER

            if (processedkey == " ")
                processedkey = "space";

            return processedkey;
        };

        // KEY DOWN
        document.addEventListener('keydown', (event: any) => {
            //if (bareEngine.MouseIsOnEditor(event))
            //    return; // Allow normal typing inside the editor UI

            //trace(event.key)
            var key = processKey(event.key);
            
            if (!this.keysPressed.has(key)) {
                this.keysJustPressed.add(key);
            }

            if (!this.keysPressed.has(key))
            {
                this.keysPressed.add(key);
                bare.SendEvent(BareEvent.key_pressed, { key: key, allKeys: Array.from(this.keysPressed) });
            }

            bare.SendEvent(BareEvent.key_down, { key: key, allKeys: Array.from(this.keysPressed) });

            event.preventDefault();
        });

        // KEY UP
        document.addEventListener('keyup', (event: any) => {
            //if (bareEngine.MouseIsOnEditor(event))
            //    return; // Allow typing inside editor UI

            var key = processKey(event.key);

            this.keysPressed.delete(key);
            this.keysJustPressed.delete(key);

            bare.SendEvent(BareEvent.key_released, { key: key, allKeys: Array.from(this.keysPressed) });
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

    public IsKeyUp(key: string): boolean
    {
        return !this.keysPressed.has(key);
    }

    public IsKeyReleased(key: string): boolean
    {
        return !this.keysPressed.has(key) && this.keysPressedPrevFrame.has(key);
    }

    public IsAnyKeyDown(): boolean
    {
        return (this.keysPressed.size > 0);
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


    
    // EXTRAS FOR DIRECTIONAL MOVEMENT

    public IsUpDown(): boolean
    {
        return this.IsKeyDown("w") || this.IsKeyDown("z") || this.IsKeyDown("arrowUp");
    }

    public IsUpPressed(): boolean
    {
        return this.IsKeyPressed("w") || this.IsKeyPressed("z") || this.IsKeyPressed("arrowUp");
    }

    public IsDownDown(): boolean
    {
        return this.IsKeyDown("s") || this.IsKeyDown("arrowDown");
    }

    public IsDownPressed(): boolean
    {
        return this.IsKeyPressed("s") || this.IsKeyPressed("arrowDown");
    }

    public IsLeftDown(): boolean
    {
        return this.IsKeyDown("a") || this.IsKeyDown("q") || this.IsKeyDown("arrowLeft");
    }

    public IsLeftPressed(): boolean
    {
        return this.IsKeyPressed("a") || this.IsKeyPressed("q") || this.IsKeyPressed("arrowLeft");
    }

    public IsRightDown(): boolean
    {
        return this.IsKeyDown("d") || this.IsKeyDown("arrowRight");
    }

    public IsRightPressed(): boolean
    {
        return this.IsKeyPressed("d") || this.IsKeyPressed("arrowRight");
    }

    public IsUpReleased(): boolean
    {
        return this.IsKeyReleased("w") || this.IsKeyReleased("z") || this.IsKeyReleased("arrowUp");
    }

    public IsDownReleased(): boolean
    {
        return this.IsKeyReleased("s") || this.IsKeyReleased("arrowDown");
    }

    public IsLeftReleased(): boolean
    {
        return this.IsKeyReleased("a") || this.IsKeyReleased("q") || this.IsKeyReleased("arrowLeft");
    }

    public IsRightReleased(): boolean
    {
        return this.IsKeyReleased("d") || this.IsKeyReleased("arrowRight");
    }

    public IsAnyDirectionKeyDown(): boolean
    {
        return (this.IsUpDown() || this.IsDownDown() || this.IsLeftDown() || this.IsRightDown());
    }

    public IsAnyDirectionPressed(): boolean
    {
        return (this.IsUpPressed() || this.IsDownPressed() || this.IsLeftPressed() || this.IsRightPressed());
    }

    public IsAnyDirectionReleased(): boolean
    {
        return (this.IsUpReleased() || this.IsDownReleased() || this.IsLeftReleased() || this.IsRightReleased());
    }
}

export const keyboardController = new KeyboardController();
