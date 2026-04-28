import { hitboxController } from "../controllers/hitboxController";
import { Color, ITextTextureOptions, Texture, Vec2 } from "../libraries/rapid-render";
import type { ButtonHandlers } from "../controllers/hitboxController";
import type { Scene } from "../scenes/scene";
import { BareText } from "../libraries/rapid-render/texture";
import { GameObject } from "./gameObject";

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

        this.name = options.text;

        this.marge = options.marge || 10;
        this.text = new BareText({text: options.text, fontSize: 22, fontFamily: 'monospace', color: '#fff'});
        
        scene.hitboxController.AssignButton(this, options);
    }

    override RenderTransformed(inheritedColor?: Color): void
    {
        const buttonColor = Color.fromHex('#014f00'); // MAKE CUSTOMIZEABLE - TODO
        buttonColor.a = inheritedColor?.a ?? buttonColor.a;

        bare.renderRect({ 
            position: new Vec2(-this.pivot.x, -this.pivot.y), 
            width: this.width, 
            height: this.height, 
            color: buttonColor
        });

        bare.renderSprite({
            texture: this.text, 
            position: new Vec2(this.marge - this.pivot.x, this.marge - this.pivot.y),
            color: inheritedColor
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
