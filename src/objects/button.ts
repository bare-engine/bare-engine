import type { ButtonHandlers } from "../controllers/hitboxController";
import { GameMode } from "../globals";
import { Color, ITextOptions, TextTexture, Vec2 } from "../libraries/rapid-render";
import type { Scene } from "../scenes/scene";
import type { Entity, Rectangle } from "../types/bareTypes";
import { Int, Limit } from "../utils/decorators";
import { SerializeField } from "../utils/serializeFields";
import { GameObject } from "./gameObject";

interface TextOptions extends ITextOptions, ButtonHandlers<Button> {
    buttonColor?: Color;
    margin?: number;
    minWidth?: number;
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
    margin?: number;
    minWidth?: number;
    cornerRadius?: number;
}

export class Button extends GameObject
{
    declare entity: ButtonEntity | null;

    textTexture: TextTexture;
    pivotPercentage: Vec2 = new Vec2(-1, -1); // SAME AS TextObject - SHOULD GAMEOBJECT HAVE THIS? - TODO

    @SerializeField(GameMode.Edit)
    get text():string {return this.textTexture.text;}
    set text(value:string) {this.SetText(value);}

    @SerializeField(GameMode.Edit) @Int @Limit(0, Infinity)
    get fontSize():number | undefined {return this.textTexture.style.fontSize;}
    set fontSize(value:number) {this.textTexture.style.fontSize = value; this.UpdateText();}

    @SerializeField(GameMode.Edit)
    get textColor(): Color {return Color.fromHex(this.textTexture.style.fill as string ?? "#ffffff");}
    set textColor(value: Color | string) {this.textTexture.style.fill = typeof value === "string" ? value : value.toHex(); this.UpdateText();}

    @SerializeField(GameMode.Edit)
    buttonColor: Color;

    private _margin = 10;

    @SerializeField(GameMode.Edit) @Limit(0, Infinity)
    get margin(): number {return this._margin;}
    set margin(value: number) {this._margin = value; this.OnSizeChanged();}

    // AT LEAST THIS WIDE, WITH THE TEXT CENTERED - SO A ROW OF BUTTONS LINES UP WHATEVER THEIR TEXT
    private _minWidth = 0;

    @SerializeField(GameMode.Edit) @Limit(0, Infinity)
    get minWidth(): number {return this._minWidth;}
    set minWidth(value: number) {this._minWidth = value; this.OnSizeChanged();}

    @SerializeField(GameMode.Edit) @Limit(0, Infinity)
    cornerRadius: number;

    constructor(scene: Scene, textOptions: TextOptions | string)
    {
        super(scene);

        const options: TextOptions = (typeof textOptions === "string")
            ? { text: textOptions }
            : { ...(typeof textOptions === "object" ? textOptions : {}) } as TextOptions;

        options.text ??= "Text";

        this.name = options.text;
        this.margin = options?.margin ?? 10;
        this.minWidth = options?.minWidth ?? 0;
        this.cornerRadius = options?.cornerRadius ?? 0;
        this.buttonColor = options?.buttonColor || Color.fromHex('#000000');

        this.textTexture = bare.texture.createTextTexture({
            fontSize: 22,
            ...(bare.defaultFont ? { fontFamily: bare.defaultFont } : {}),
            fill: "#fff",
            ...options,
        });
        scene?.hitbox.AssignButton(this, options);
    }

    override Added(): void
    {
        // ADDED AGAIN AFTER ReleaseResources - BRING THE TEXT TEXTURE BACK
        if (this.textTexture.released)
            this.UpdateText();

        super.Added();
    }

    override ReleaseResources(): void
    {
        this.textTexture.release();
    }

    SetText(text: string): this
    {
        if (this.textTexture.text === text)
            return this;

        this.textTexture.text = text;

        this.OnSizeChanged();

        // ONLY THE DISPLAY NAME - name IS USED TO LOOK THE OBJECT UP (EG BY THE ENTITY SCENE)
        if (!this.name)
            this.pluginName = text.length > 20 ? text.substring(0, 17) + "..." : text;

        return this;
    }

    GetText(): string
    {
        return this.textTexture.text;
    }

    UpdateText()
    {
        this.textTexture.update();

        this.OnSizeChanged();
    }

    // TEXT, FONT SIZE OR MARGIN CHANGED - THE PIVOT AND TAP HITBOX FOLLOW THE NEW SIZE
    private OnSizeChanged()
    {
        // CAN BE CALLED BEFORE THE CONSTRUCTOR IS DONE (EG margin SETTER)
        if (this.pivotPercentage == undefined || !this.textTexture)
            return;

        if (this.pivotPercentage.x != -1)
            this.pivotX = this.width * this.pivotPercentage.x;
        if (this.pivotPercentage.y != -1)
            this.pivotY = this.height * this.pivotPercentage.y;

        // THE HITBOX IS SIZED WHEN ASSIGNED, SO A BUTTON CREATED WITH SHORT TEXT WOULDN'T BE CLICKABLE WHERE IT GREW
        const rect = this.tapHitbox?.rectangle;
        if (rect)
        {
            rect.x = 0;
            rect.y = 0;
            rect.width = this.width;
            rect.height = this.height;
        }
    }

    override SetPivot(x: number, y: number): this
    {
        super.SetPivot(x, y);

        if (this.pivotPercentage == undefined)
            return this;

        // REMEMBER PIVOT PERCENTAGE TO REAPPLY FOR WHEN THE SIZE CHANGES (TEXT, FONT SIZE, MARGIN)
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

        // PLACED BY BASELINE, NOT CENTERED ON THE GLYPHS - A DESCENDER ("Retry") WOULD OTHERWISE SHIFT THE TEXT UP
        const lineTop = this.textTexture.baselineY - this.textTexture.fontAscent;
        bare.drawSprite({
            texture: this.textTexture,
            color: inheritedColor,
            // CENTERED: AT THE MARGIN, UNLESS minWidth MAKES THE BUTTON WIDER THAN ITS TEXT
            position: new Vec2((this.width - this.textTexture.width) / 2, this.margin - lineTop),
        });
    }

    MakeInteractive(onPress?: () => void, OnRelease?: () => void, onHoverScale:number = 1.1, onClickScale: number = .95, tweenTime: number = .2): this
    {
        bare.hitbox.AssignButton(this, {
            OnPress: () => {bare.tween.To(this, tweenTime/2, { scale: onClickScale }); onPress?.();},
            OnRelease: () => {bare.tween.To(this, tweenTime, { scale: onHoverScale }), OnRelease?.();},
            OnEnter: () => bare.tween.To(this, tweenTime, { scale: onHoverScale }),
            OnLeave: () => bare.tween.To(this, tweenTime, { scale: 1 })
        });
        
        return this;
    }

    // no texture of its own - the rect is drawn in OnRender, so report it here for bounds/hit tests
    override GetLocalContentBounds(): Rectangle
    {
        return { x: 0, y: 0, width: this.width, height: this.height };
    }

    override get width(): number
    {
        return Math.max(this.minWidth, this.textTexture.width + this.margin * 2);
    }

    override get height(): number
    {
        // FONT LINE HEIGHT, NOT THE GLYPH BOUNDS - SO "Retry" AND "Menu" BUTTONS ARE THE SAME HEIGHT
        return this.textTexture.lineBoxHeight + this.margin * 2
    }
}
