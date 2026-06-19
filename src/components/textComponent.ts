import { Component } from "../controllers/componentController";
import { Scene } from "../globals";
import { ITextOptions, TextTexture } from "../libraries/new-rapid-render";

export class TextComponent extends Component
{
    private textTexture: TextTexture;

    constructor(scene: Scene, private text: string = "", options:ITextOptions = {})
    {
        super(scene);

        this.textTexture = bare.texture.createTextTexture(options);
        this.textTexture.text = this.text;
    }

    SetText(text: string): void
    {
        this.text = text;
    }

    OnPostRender(): void
    {
        rapid.matrixStack.save();
        this.go.ApplyTransformToMatrixStack(this.go.transform);
        
        rapid.drawSprite({texture: this.textTexture});

        rapid.matrixStack.restore();
    }
}
