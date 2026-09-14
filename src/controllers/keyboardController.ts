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
        globalEvents.on(BareEvent.game_focusChange, this.OnFocusChange.bind(this));  
    }

    OnFocusChange(hasFocus: boolean)
    {
        // HANDLE VISUAL OF focusOverlay
        const focusOverlay = document.getElementById('focusOverlay') as HTMLElement;

        if (hasFocus || !bare.freezeOnUnfocus)
            focusOverlay.classList.remove('show');
        else
            focusOverlay.classList.add('show');
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

        // keyup removes the same name keydown added, even if event.key changed in between
        // (eg: "!" on keydown, "1" on keyup after shift was released)
        const codeToKey = new Map<string, string>();

        const release = (key: string) => {
            if (!this.keysPressed.delete(key))
                return;

            this.keysJustPressed.delete(key);
            bare.SendEvent(BareEvent.key_released, { key: key, allKeys: Array.from(this.keysPressed) });
        };

        // modifier keyups often never reach us (ctrl+shift+i, alt+shift, shift+click into another document),
        // but every input event carries the real modifier state, so use that to drop stuck ones
        const syncModifiers = (event: KeyboardEvent | MouseEvent) => {
            if (!event.shiftKey) release("shift");
            if (!event.ctrlKey) release("control");
            if (!event.altKey) release("alt");
            if (!event.metaKey) release("meta");
        };

        // KEY DOWN
        document.addEventListener('keydown', (event: KeyboardEvent) => {
            syncModifiers(event);

            var key = processKey(event.key);
            codeToKey.set(event.code, key);

            if (!this.keysPressed.has(key))
            {
                this.keysPressed.add(key);
                this.keysJustPressed.add(key);
                bare.SendEvent(BareEvent.key_pressed, { key: key, allKeys: Array.from(this.keysPressed) });
            }

            bare.SendEvent(BareEvent.key_down, { key: key, allKeys: Array.from(this.keysPressed) });

            event.preventDefault();
        });

        // KEY UP
        document.addEventListener('keyup', (event: KeyboardEvent) => {
            release(codeToKey.get(event.code) ?? processKey(event.key));
            codeToKey.delete(event.code);
            syncModifiers(event);
        });

        document.addEventListener('mousedown', syncModifiers);

        // blur/focus don't bubble, they must be listened for on window
        window.addEventListener('blur', () => this.ClearAll());
        window.addEventListener('focus', () => {
            this.ClearAll();
            rapid.canvas?.focus();
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
