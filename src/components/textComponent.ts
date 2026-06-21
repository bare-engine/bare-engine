import { Component } from "../controllers/componentController";
import { Scene } from "../globals";
import { Color, ITextOptions, TextTexture, Vec2 } from "../libraries/new-rapid-render";
import { Dropdown, InspectorField, Int } from "../utils/decorators";

export class TextComponent extends Component
{
    private textTexture: TextTexture;

    @InspectorField
    private _text = {
        get: () => this.textTexture.text,
        set: (text: string) => this.SetText(text),
    };

    @InspectorField @Int
    fontSize = {
        get: () => this.textTexture.style.fontSize,
        set: (fontSize: number) => {this.textTexture.style.fontSize = fontSize; this.UpdateText();},
    };

    @InspectorField
    offset:Vec2 = new Vec2();

    @InspectorField
    @Dropdown(["left", "center", "right"])
    get align():string {return this.textTexture.style.align;}
    set align(value:"left" | "center" | "right") {this.textTexture.style.align = value; this.UpdateText();}
    
    @InspectorField
    get _color():Color {return Color.fromHex(this.textTexture.style.fill as string);}
    set _color(value:Color) { this.textTexture.style.fill = value.toHex(); this.UpdateText();}
    
    constructor(scene: Scene, options:ITextOptions = {})
    {
        super(scene);

        options.text ??= "Text";

        this.textTexture = bare.texture.createTextTexture(options);
    }

    SetText(text: string): void
    {
        this.textTexture.text = text;
        this.textTexture.update();
    }

    GetText(): string
    {
        return this.textTexture.text;
    }

    private UpdateText(): void
    {
        this.textTexture.update();
    }

    OnPostRender(): void
    {
        rapid.matrixStack.save();
        this.go.ApplyTransformToMatrixStack(this.go.transform);
        
        rapid.drawSprite({texture: this.textTexture, offset: this.offset});

        rapid.matrixStack.restore();
    }
}
