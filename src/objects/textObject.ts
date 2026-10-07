import { GameMode } from "../globals";
import { Color, ITextOptions, TextTexture, Vec2 } from "../libraries/rapid-render";
import { Scene } from "../scenes/scene";
import { HitboxType, type Entity, type Rectangle } from "../types/bareTypes";
import { Dropdown, Int, Limit } from "../utils/decorators";
import { SerializeField } from "../utils/serializeFields";
import { GameObject } from "./gameObject";

// ENTITY PROPERTIES FOR this.AddGameObject<TextObject>({ ... })
export interface TextObjectEntity extends Entity
{
    text?: string;
    fontSize?: number;
    align?: "left" | "center" | "right";
    fill?: Color | string;
    stroke?: Color | string;
    strokeThickness?: number;
}

export class TextObject extends GameObject
{
    declare entity: TextObjectEntity | null;

    textTexture: TextTexture;
    pivotPercentage: Vec2 = new Vec2(); // SHOULD GAMEOBJECT HAVE THIS? - SOME MORE COMPLEXITY WITH SERIALIZE - TODO

    @SerializeField(GameMode.Edit)
    get text():string {return this.textTexture.text;}
    set text(value:string) {this.SetText(value);}

    @SerializeField(GameMode.Edit) @Int @Limit(0, Infinity)
    get fontSize():number | undefined {return this.textTexture.style.fontSize;}
    set fontSize(value:number) {this.textTexture.style.fontSize = value; this.UpdateText();}

    @SerializeField(GameMode.Edit)
    @Dropdown(["left", "center", "right"])
    get align():string | undefined {return this.textTexture.style.align;}
    set align(value:"left" | "center" | "right") {this.textTexture.style.align = value; this.UpdateText();}

    @SerializeField(GameMode.Edit)
    get fill(): Color {return Color.fromHex(this.textTexture.style.fill as string ?? "#000000");}
    set fill(value: Color | string) {this.textTexture.style.fill = typeof value === "string" ? value : value.toHex(); this.UpdateText();}

    @SerializeField(GameMode.Edit)
    get stroke(): Color {return Color.fromHex(this.textTexture.style.stroke as string ?? "#000000");}
    set stroke(value: Color | string) {this.textTexture.style.stroke = typeof value === "string" ? value : value.toHex(); this.UpdateText();}

    @SerializeField(GameMode.Edit) @Limit(0, Infinity)
    get strokeThickness(): number {return this.textTexture.style.strokeThickness ?? 0;}
    set strokeThickness(value: number) {this.textTexture.style.strokeThickness = value; this.UpdateText();}
    
    declare texture: TextTexture; // always the text texture, set in the constructor

    override get specialMap(): Record<string, (obj: GameObject, value: any) => void>
    {
        return {
            ...super.specialMap,
            color: (o, v) => { const text = o as TextObject; text.textTexture.style.fill = v; text.UpdateText();}
        };
    }

    constructor(scene: Scene, options: ITextOptions = {})
    {
        super(scene);

        options.text ??= "Text";

        if (!options.fontFamily && bare.defaultFont)
            options.fontFamily = bare.defaultFont; // COULD ALSO DO SAME IN RAPID TEXT - TODO

        this.textTexture = bare.texture.createTextTexture(options);
        this.SetText(options.text);
        this.SetTexture(this.textTexture);

        this.SetNameBasedOnText(options.text || "");
    }

    override OnStart(): void
    {
        if (this.HasOwnName())
            this.pluginName = this.name;
    }

    // objects are called "gameObject" until they're given a name
    private HasOwnName(): boolean
    {
        return !!this.name && this.name !== "gameObject";
    }

    SetNameBasedOnText(text: string)
    {
        // LIMIT TEXT BY 20 CHARS, ELSE ADD ...
        if (!this.HasOwnName())
            this.pluginName = text.length > 20 ? text.substring(0, 17) + "..." : text;
    }

    SetText(text: string)
    {
        if (this.textTexture.text === text)
            return;

        const previousBounds = this.textTexture.localBounds;
        this.textTexture.text = text;

        // REAPPLY PIVOT AFTER CHANGING TEXT(URE)
        this.OnSizeChanged(previousBounds);

        this.SetNameBasedOnText(text);
    }

    GetText(): string
    {
        return this.textTexture.text;
    }

    UpdateText()
    {
        const previousBounds = this.textTexture.localBounds;
        this.textTexture.update();

        this.OnSizeChanged(previousBounds);
    }

    // the text or its style changed: the pivot and a hitbox covering the text follow the new size
    private OnSizeChanged(previousBounds: Rectangle)
    {
        if (this.pivotPercentage.x != -1)
            this.pivotX = this.textTexture.width * this.pivotPercentage.x;
        if (this.pivotPercentage.y != -1)
            this.pivotY = this.textTexture.height * this.pivotPercentage.y;

        // a hitbox sized to the text when it was assigned (eg by OnPointerDown) keeps covering it, a custom one is left alone
        const rect = this.tapHitbox?.type == HitboxType.Rectangle ? this.tapHitbox.rectangle : null;
        if (rect && rect.x == previousBounds.x && rect.y == previousBounds.y
            && rect.width == previousBounds.width && rect.height == previousBounds.height)
        {
            Object.assign(rect, this.textTexture.localBounds);
        }
    }

    override SetPivot(x: number, y: number): this
    {
        super.SetPivot(x, y);
        
        if (this.pivotPercentage == undefined)
            return this;

        // REMEMBER PIVOT PERCENTAGE TO REAPPLY FOR WHEN WE CHANGE TEXT(URE)
        this.pivotPercentage.x = -1;
        this.pivotPercentage.y = -1;

        if (x > 0 && x <= 1)
        {
            this.pivotPercentage.x = x;
        }
        if (y > 0 && y <= 1)
        {
            this.pivotPercentage.y = y;
        }

        return this;
    }
}
