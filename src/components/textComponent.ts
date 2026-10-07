import { Component } from "../controllers/componentController";
import { GameMode, Scene } from "../globals";
import { Color, ITextOptions, TextTexture, Vec2 } from "../libraries/rapid-render";
import { Dropdown, Int, Limit } from "../utils/decorators";
import { SerializeField } from "../utils/serializeFields";
import { Run } from "../utils/runModes";

@Run(GameMode.Edit, GameMode.Play)
export class TextComponent extends Component
{
    private textTexture: TextTexture;

    @SerializeField(GameMode.Edit)
    get _text():string {return this.textTexture.text;}
    set _text(value:string) {this.SetText(value);}

    @SerializeField(GameMode.Edit) @Int @Limit(0, Infinity)
    get fontSize():number | undefined {return this.textTexture.style.fontSize;}
    set fontSize(value:number) {this.textTexture.style.fontSize = value; this.UpdateText();}

    @SerializeField(GameMode.Edit)
    offset:Vec2 = new Vec2();

    @SerializeField(GameMode.Edit)
    @Dropdown(["left", "center", "right"])
    get align():string | undefined {return this.textTexture.style.align;}
    set align(value:"left" | "center" | "right") {this.textTexture.style.align = value; this.UpdateText();}
    
    @SerializeField(GameMode.Edit)
    get _color():Color
    {
        const fill = this.textTexture.style.fill;

        // Keep this tolerant of instances that received a Color before the setter was fixed.
        return fill instanceof Color ? fill : Color.fromHex(fill as string);
    }
    set _color(value:Color | string)
    {
        this.textTexture.style.fill = typeof value === "string" ? value : value.toHex();
        this.UpdateText();
    }
    
    constructor(scene: Scene, options:ITextOptions = {})
    {
        super(scene);

        options.text ??= "Text";

        this.textTexture = bare.texture.createTextTexture(options);
    }

    SetText(text: string): void
    {
        // THE TEXTTEXTURE TEXT SETTER RE-RENDERS THE TEXTURE ON CHANGE, AND SKIPS IDENTICAL TEXT
        this.textTexture.text = text;
    }

    GetText(): string
    {
        return this.textTexture.text;
    }

    private UpdateText(): void
    {
        this.textTexture.update();
    }

    override OnPostRender(): void
    {
        rapid.matrixStack.save();
        this.go.ApplyTransformToMatrixStack(this.go.transform);
        
        rapid.drawSprite({texture: this.textTexture, offset: this.offset});

        rapid.matrixStack.restore();
    }
}
