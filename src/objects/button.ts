import type { ButtonHandlers } from "../controllers/hitboxController";
import { Color, ITextOptions, TextTexture, Vec2 } from "../libraries/new-rapid-render";
import type { Scene } from "../scenes/scene";
import type { Entity, Rectangle } from "../types/bareTypes";
import { InspectorField, Int, Limit } from "../utils/decorators";
import { Save } from "../utils/saveFields";
import { GameObject } from "./gameObject";

interface TextOptions extends ITextOptions, ButtonHandlers<Button> {
    buttonColor?: Color;
    marge?: number;
    cornerRadius?: number;
    text: string;
}

// ENTITY PROPERTIES FOR this.AddGameObject<Button>({ ... })
export interface ButtonEntity extends Entity
{
    text?: string;
    fontSize?: number;
    textColor?: Color | string;
    buttonColor?: Color | string;
    marge?: number;
    cornerRadius?: number;
}

export class Button extends GameObject
{
    declare entity: ButtonEntity | null;

    textTexture: TextTexture;
    pivotPercentage: Vec2 = new Vec2(-1, -1); // SAME AS TextObject - SHOULD GAMEOBJECT HAVE THIS? - TODO

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
    get textColor(): Color {return Color.fromHex(this.textTexture.style.fill as string ?? "#ffffff");}
    set textColor(value: Color | string) {this.textTexture.style.fill = typeof value === "string" ? value : value.toHex(); this.UpdateText();}

    @InspectorField @Save
    buttonColor: Color;

    private _marge = 10;

    @InspectorField @Save @Limit(0, Infinity)
    get marge(): number {return this._marge;}
    set marge(value: number) {this._marge = value; this.ReapplyPivot();}

    @InspectorField @Save @Limit(0, Infinity)
    cornerRadius: number;

    constructor(scene: Scene, textOptions: TextOptions | string)
    {
        super(scene);

        const options: TextOptions = (typeof textOptions === "string")
            ? { text: textOptions }
            : { ...(typeof textOptions === "object" ? textOptions : {}) } as TextOptions;

        options.text ??= "Text";

        this.name = options.text;
        this.marge = options?.marge ?? 10;
        this.cornerRadius = options?.cornerRadius ?? 0;
        this.buttonColor = options?.buttonColor || Color.fromHex('#000000');

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

        // REAPPLY PIVOT AFTER CHANGING TEXT, SINCE THE WIDTH CHANGED
        this.ReapplyPivot();

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

        this.ReapplyPivot();
    }

    private ReapplyPivot()
    {
        // CAN BE CALLED BEFORE THE CONSTRUCTOR IS DONE (EG marge SETTER)
        if (this.pivotPercentage == undefined || !this.textTexture)
            return;

        if (this.pivotPercentage.x != -1)
            this.pivotX = this.width * this.pivotPercentage.x;
        if (this.pivotPercentage.y != -1)
            this.pivotY = this.height * this.pivotPercentage.y;
    }

    override SetPivot(x: number, y: number): this
    {
        super.SetPivot(x, y);

        if (this.pivotPercentage == undefined)
            return this;

        // REMEMBER PIVOT PERCENTAGE TO REAPPLY FOR WHEN THE SIZE CHANGES (TEXT, FONT SIZE, MARGE)
        this.pivotPercentage.x = (x > 0 && x <= 1) ? x : -1;
        this.pivotPercentage.y = (y > 0 && y <= 1) ? y : -1;

        return this;
    }

    override ResetValues(): this
    {
        super.ResetValues();

        // POOLED BUTTONS SHOULDN'T KEEP A PERCENTAGE FROM THEIR PREVIOUS USE
        this.pivotPercentage?.set(-1, -1);

        return this;
    }

    override OnRender(inheritedColor?: Color): void
    {
        // COPY SO THE INHERITED ALPHA DOESN'T COMPOUND INTO THE SAVED COLOR EVERY FRAME
        const buttonColor = this.buttonColor.clone();
        buttonColor.a = this.buttonColor.a * ((inheritedColor?.a ?? 255)/255);

        bare.drawRoundedRect({
            width: this.width,
            height: this.height,
            radius: this.cornerRadius,
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
