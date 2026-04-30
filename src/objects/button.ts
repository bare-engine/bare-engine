import { hitboxController } from "../controllers/hitboxController";
import { Color, ITextureOptions, TextTexture, Texture, Vec2 } from "../libraries/new-rapid-render";
import type { ButtonHandlers } from "../controllers/hitboxController";
import type { Scene } from "../scenes/scene";
import { GameObject } from "./gameObject";

interface TextOptions extends ITextureOptions, ButtonHandlers<Button> {
    buttonColor?: Color;
    marge?: number;
    text: string;
}

export class Button extends GameObject
{
    text: TextTexture;
    marge: number;
    buttonColor: Color;

    constructor(scene: Scene, textOptions: TextOptions | string)
    {
        super(scene);

        const options: TextOptions = (typeof textOptions === "string") ? { text: textOptions } : textOptions;

        this.name = options.text;
        this.marge = options.marge || 10;
        this.buttonColor = options.buttonColor || Color.fromHex('#242428eb');
        
        //this.text = new BareText({text: options.text, fontSize: 22, fontFamily: 'monospace', color: '#fff'});
        this.text = rapid.texture.createTextTexture({text:options.text, fontSize: 22, fontFamily: 'monospace', fill: '#fff'});
        scene.hitboxController.AssignButton(this, options);
    }

    override RenderTransformed(inheritedColor?: Color): void
    {
        const buttonColor = this.buttonColor;
        buttonColor.a = this.buttonColor.a * ((inheritedColor?.a ?? 255)/255);

        rapid.withTransform(()=>{
            bare.drawRect(
                this.width, 
                this.height, 
                buttonColor
            );
        }, { position: new Vec2(-this.pivot.x, -this.pivot.y) })

        rapid.withTransform(()=>{
            bare.drawSprite(this.text, inheritedColor);
        }, { position: new Vec2(this.marge - this.pivot.x, this.marge - this.pivot.y) })
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
