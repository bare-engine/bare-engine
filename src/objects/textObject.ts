import { Color, ITextOptions, TextTexture, Vec2 } from "../libraries/new-rapid-render";
import { Scene } from "../scenes/scene";
import { Dropdown, InspectorField, Int } from "../utils/decorators";
import { GameObject } from "./gameObject";

export class TextObject extends GameObject
{
    textTexture: TextTexture;
    pivotPercentage: Vec2 = new Vec2();

    @InspectorField
    text = {
        get: () => this.textTexture.text,
        set: (text: string) => this.SetText(text),
    };

    @InspectorField @Int
    fontSize = {
        get: () => this.textTexture.style.fontSize,
        set: (fontSize: number) => {this.textTexture.style.fontSize = fontSize; this.UpdateText();},
    };

    @InspectorField
    @Dropdown(["left", "center", "right"])
    get align():string {return this.textTexture.style.align;}
    set align(value:"left" | "center" | "right") {this.textTexture.style.align = value; this.UpdateText();}
    
    @InspectorField
    get _color():Color {return Color.fromHex(this.textTexture.style.fill as string);}
    set _color(value:Color) { this.textTexture.style.fill = value.toHex(); this.UpdateText();}
    
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

    SetNameBasedOnText(text: string)
    {
        // LIMIT TEXT BY 20 CHARS, ELSE ADD ...
        this.pluginName = text.length > 20 ? text.substring(0, 17) + "..." : text;
    }

    SetText(text: string)
    {
        this.textTexture.text = text;

        // REAPLY PIVOT AFTER CHANGING TEXT(URE)
        this.UpdateText();

        this.SetNameBasedOnText(text);
    }

    GetText(): string
    {
        return this.textTexture.text;
    }

    UpdateText()
    {
        this.textTexture.update();

        if (this.pivotPercentage.x != -1)
            this.pivotX = this.textTexture.width * this.pivotPercentage.x;
        if (this.pivotPercentage.y != -1)
            this.pivotY = this.textTexture.height * this.pivotPercentage.y;
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
