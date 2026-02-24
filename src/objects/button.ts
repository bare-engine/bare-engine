import { GameObject, Vec2, Color, ITextTextureOptions, hitboxController } from "../exports";
import type { ButtonHandlers, Scene, Texture } from "../exports";
import { BareText } from "../libraries/rapid-render/texture";

interface TextOptions extends ITextTextureOptions, ButtonHandlers<Button> {
    marge?: number;
}

export class Button extends GameObject
{
    text: BareText;
    marge: number;

    constructor(scene: Scene, textOptions: TextOptions | string)
    {
        super(scene);

        const options: TextOptions = (typeof textOptions === "string") ? { text: textOptions } : textOptions;

        this.name = "button: " + options.text;

        this.marge = options.marge || 10;
        this.text = new BareText({text: options.text, fontSize: 22, fontFamily: 'monospace', color: '#fff'});
        this.SetTexture(this.text);

        scene.hitboxController.AssignButton(this, options);
    }

    override RenderTransformed(inheritedColor?: Color): void
    {
        bare.renderRect({ 
            position: new Vec2(-this.pivot.x, -this.pivot.y), 
            width: this.width, 
            height: this.height, 
            color: Color.fromHex('#014f00')
        });

        bare.renderSprite({
            texture: this.text, 
            position: new Vec2(this.marge - this.pivot.x, this.marge - this.pivot.y)
        });
    }

    get width(): number
    {
        return this.text.width + this.marge * 2
    }

    get height(): number
    {
        return this.text.height + this.marge * 2
    }
}
