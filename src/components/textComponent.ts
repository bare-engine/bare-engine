import { Component } from "../controllers/componentController";
import { GameMode, Scene } from "../globals";
import { Color, ITextOptions, TextTexture, Vec2 } from "../libraries/new-rapid-render";
import { Dropdown, InspectorField, Int, Limit } from "../utils/decorators";
import { Save } from "../utils/saveFields";
import { Run } from "../utils/runModes";

@Run(GameMode.Edit, GameMode.Play)
export class TextComponent extends Component
{
    private textTexture: TextTexture;

    @InspectorField
    private _text = {
        get: () => this.textTexture.text,
        set: (text: string) => this.SetText(text),
    };

    @InspectorField @Int @Limit(0, Infinity) @Save
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

    OnPostRender(): void
    {
        rapid.matrixStack.save();
        this.go.ApplyTransformToMatrixStack(this.go.transform);
        
        rapid.drawSprite({texture: this.textTexture, offset: this.offset});

        rapid.matrixStack.restore();
    }
}
