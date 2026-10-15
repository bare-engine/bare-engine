import { BareEvent } from '../types/bareTypes';
import { globalEvents } from "../globals";

export class KeyboardController
{
    private keysPressed: Set<string> = new Set<string>();
    // WENT DOWN / UP SINCE THE LAST FRAME. ONLY CLEARED IN Update(), SO A KEY TAPPED DOWN AND UP
    // BETWEEN TWO FRAMES IS STILL PRESSED (AND RELEASED) FOR ONE FRAME
    private keysJustPressed: Set<string> = new Set<string>();
    private keysJustReleased: Set<string> = new Set<string>();

    // KEY NAME EACH PHYSICAL KEY POSITION (event.code, EG "KeyW") LAST PRODUCED: "w" ON QWERTY, "z" ON AZERTY.
    // KEPT AFTER KEYUP, SO keyup RELEASES THE NAME keydown ADDED (EG "!" DOWN, "1" UP AFTER SHIFT WAS RELEASED)
    // AND IsCodeReleased CAN STILL LOOK IT UP
    private keyAtCode = new Map<string, string>();

    // DIRECTION HELPERS USE KEY POSITIONS, SO WASD ON QWERTY IS ZQSD ON AZERTY WITHOUT A SETTING,
    // AND Z/Q ON QWERTY (OFTEN ACTION KEYS) DON'T COUNT AS UP/LEFT
    private static readonly UP_CODES = ["KeyW", "ArrowUp"];
    private static readonly DOWN_CODES = ["KeyS", "ArrowDown"];
    private static readonly LEFT_CODES = ["KeyA", "ArrowLeft"];
    private static readonly RIGHT_CODES = ["KeyD", "ArrowRight"];

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

        const release = (key: string) => {
            if (!this.keysPressed.delete(key))
                return;

            this.keysJustReleased.add(key);
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
            this.keyAtCode.set(event.code, key);

            if (!this.keysPressed.has(key))
            {
                this.keysPressed.add(key);
                this.keysJustPressed.add(key);
                bare.SendEvent(BareEvent.key_pressed, { key: key, allKeys: Array.from(this.keysPressed) });
            }

            bare.SendEvent(BareEvent.key_down, { key: key, allKeys: Array.from(this.keysPressed) });

            // let the browser open devtools (f12, ctrl+shift+i/j/c)
            const devtools = __DEV__ && (event.key === "F12" || (event.ctrlKey && event.shiftKey && ["KeyI", "KeyJ", "KeyC"].includes(event.code)));
            if (!devtools)
                event.preventDefault();
        });

        // KEY UP
        document.addEventListener('keyup', (event: KeyboardEvent) => {
            release(this.keyAtCode.get(event.code) ?? processKey(event.key));
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

        // RUNS AFTER THE SCENES' UPDATES (game_update), SO EVERY OnUpdate SAW THIS FRAME'S PRESSES
        this.keysJustPressed.clear();
        this.keysJustReleased.clear();
    }

    // THE BROWSER NAMES THE SPACE BAR " ", BARE NAMES IT "space". ACCEPT BOTH WHEN ASKED
    private static KeyName(key: string): string
    {
        return key == " " ? "space" : key;
    }

    public IsKeyDown(key: string): boolean
    {
        return this.keysPressed.has(KeyboardController.KeyName(key));
    }

    public IsKeyPressed(key: string): boolean
    {
        return this.keysJustPressed.has(KeyboardController.KeyName(key));
    }

    public IsKeyUp(key: string): boolean
    {
        return !this.keysPressed.has(KeyboardController.KeyName(key));
    }

    public IsKeyReleased(key: string): boolean
    {
        return this.keysJustReleased.has(KeyboardController.KeyName(key));
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
        this.keysJustPressed.clear();
        this.keysJustReleased.clear();
        this.keyAtCode.clear(); // ALSO RUNS ON BLUR/FOCUS, EG AFTER SWITCHING KEYBOARD LAYOUT
    }

    // BY PHYSICAL KEY POSITION (event.code), EG "KeyW", "Space", "ArrowUp" - THE SAME KEY ON EVERY KEYBOARD LAYOUT
    // https://developer.mozilla.org/en-US/docs/Web/API/UI_Events/Keyboard_event_code_values
    // LOOKS UP THE KEY NAME THAT POSITION PRODUCED AND CHECKS THAT
    public IsCodeDown(code: string): boolean
    {
        const key = this.keyAtCode.get(code);
        return key !== undefined && this.IsKeyDown(key);
    }

    public IsCodePressed(code: string): boolean
    {
        const key = this.keyAtCode.get(code);
        return key !== undefined && this.IsKeyPressed(key);
    }

    public IsCodeReleased(code: string): boolean
    {
        const key = this.keyAtCode.get(code);
        return key !== undefined && this.IsKeyReleased(key);
    }

    private AnyCodeDown(codes: string[]): boolean { return codes.some(code => this.IsCodeDown(code)); }
    private AnyCodePressed(codes: string[]): boolean { return codes.some(code => this.IsCodePressed(code)); }
    private AnyCodeReleased(codes: string[]): boolean { return codes.some(code => this.IsCodeReleased(code)); }


    // EXTRAS FOR DIRECTIONAL MOVEMENT

    public IsUpDown(): boolean
    {
        return this.AnyCodeDown(KeyboardController.UP_CODES);
    }

    public IsUpPressed(): boolean
    {
        return this.AnyCodePressed(KeyboardController.UP_CODES);
    }

    public IsDownDown(): boolean
    {
        return this.AnyCodeDown(KeyboardController.DOWN_CODES);
    }

    public IsDownPressed(): boolean
    {
        return this.AnyCodePressed(KeyboardController.DOWN_CODES);
    }

    public IsLeftDown(): boolean
    {
        return this.AnyCodeDown(KeyboardController.LEFT_CODES);
    }

    public IsLeftPressed(): boolean
    {
        return this.AnyCodePressed(KeyboardController.LEFT_CODES);
    }

    public IsRightDown(): boolean
    {
        return this.AnyCodeDown(KeyboardController.RIGHT_CODES);
    }

    public IsRightPressed(): boolean
    {
        return this.AnyCodePressed(KeyboardController.RIGHT_CODES);
    }

    public IsUpReleased(): boolean
    {
        return this.AnyCodeReleased(KeyboardController.UP_CODES);
    }

    public IsDownReleased(): boolean
    {
        return this.AnyCodeReleased(KeyboardController.DOWN_CODES);
    }

    public IsLeftReleased(): boolean
    {
        return this.AnyCodeReleased(KeyboardController.LEFT_CODES);
    }

    public IsRightReleased(): boolean
    {
        return this.AnyCodeReleased(KeyboardController.RIGHT_CODES);
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
