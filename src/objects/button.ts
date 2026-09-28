import type { ButtonHandlers } from "../controllers/hitboxController";
import { Color, ITextOptions, TextTexture, Vec2 } from "../libraries/new-rapid-render";
import type { Scene } from "../scenes/scene";
import type { Rectangle } from "../types/bareTypes";
import { InspectorField, Int, Limit } from "../utils/decorators";
import { Save } from "../utils/saveFields";
import { GameObject } from "./gameObject";

interface TextOptions extends ITextOptions, ButtonHandlers<Button> {
    buttonColor?: Color;
    marge?: number;
    text: string;
}

export class Button extends GameObject
{
    textTexture: TextTexture;

    @InspectorField @Save
    text = {
        get: () => this.textTexture.text,
        set: (text: string) => this.SetText(text),
    };

    @InspectorField @Save @Int @Limit(0, Infinity)
    fontSize = {
        get: () => this.textTexture.style.fontSize,
        set: (fontSize: number) => {this.textTexture.style.fontSize = fontSize; this.UpdateText();},
    };

    @InspectorField @Save
    get fill(): Color {return Color.fromHex(this.textTexture.style.fill as string ?? "#ffffff");}
    set fill(value: Color | string) {this.textTexture.style.fill = typeof value === "string" ? value : value.toHex(); this.UpdateText();}

    @InspectorField @Save
    buttonColor: Color;

    @InspectorField @Save @Limit(0, Infinity)
    marge: number;

    constructor(scene: Scene, textOptions: TextOptions | string)
    {
        super(scene);

        const options: TextOptions = (typeof textOptions === "string")
            ? { text: textOptions }
            : { ...(typeof textOptions === "object" ? textOptions : {}) } as TextOptions;

        options.text ??= "Text";

        this.name = options.text;
        this.marge = options?.marge ?? 10;
        this.buttonColor = options?.buttonColor || Color.fromHex('#242428eb');

        this.textTexture = bare.texture.createTextTexture({
            fontSize: 22,
            fontFamily: bare.defaultFont || bare.defaultEngineFont,
            fill: "#fff",
            ...options,
        });
        scene?.hitbox.AssignButton(this, options);
    }

    SetText(text: string)
    {
        if (this.textTexture.text === text)
            return;

        this.textTexture.text = text;

        // ONLY THE DISPLAY NAME - name IS USED TO LOOK THE OBJECT UP (EG BY THE ENTITY SCENE)
        if (!this.name)
            this.pluginName = text.length > 20 ? text.substring(0, 17) + "..." : text;
    }

    GetText(): string
    {
        return this.textTexture.text;
    }

    UpdateText()
    {
        this.textTexture.update();
    }

    override OnRender(inheritedColor?: Color): void
    {
        // COPY SO THE INHERITED ALPHA DOESN'T COMPOUND INTO THE SAVED COLOR EVERY FRAME
        const buttonColor = this.buttonColor.clone();
        buttonColor.a = this.buttonColor.a * ((inheritedColor?.a ?? 255)/255);

        bare.drawRect({
            width: this.width,
            height: this.height,
            color: buttonColor,
            position: new Vec2(),
        });

        bare.drawSprite({
            texture: this.textTexture,
            color: inheritedColor,
            position: new Vec2(this.marge, this.height / 2),
            origin: new Vec2(0, 0.5)
        });
    }

    // no texture of its own - the rect is drawn in OnRender, so report it here for bounds/hit tests
    override GetLocalContentBounds(): Rectangle
    {
        return { x: 0, y: 0, width: this.width, height: this.height };
    }

    get width(): number
    {
        return this.textTexture.width + this.marge * 2
    }

    get height(): number
    {
        return this.textTexture.height + this.marge * 2
    }
}
