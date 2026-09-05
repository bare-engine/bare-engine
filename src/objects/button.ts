import type { ButtonHandlers } from "../controllers/hitboxController";
import { Color, ITextureOptions, TextTexture, Vec2 } from "../libraries/new-rapid-render";
import type { Scene } from "../scenes/scene";
import type { Rectangle } from "../types/bareTypes";
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
        this.text = rapid.texture.createTextTexture({text:options.text,fontSize: 22, fontFamily: 'monospace', fill: '#fff'});
        scene.hitbox.AssignButton(this, options);
    }

    override OnRender(inheritedColor?: Color): void
    {
        const buttonColor = this.buttonColor;
        buttonColor.a = this.buttonColor.a * ((inheritedColor?.a ?? 255)/255);

        bare.drawRect({
            width: this.width,
            height: this.height,
            color: buttonColor,
            position: new Vec2(),
        });

        bare.drawSprite({
            texture: this.text,
            color: inheritedColor,
            position: new Vec2(this.marge, this.height / 2),
            origin: new Vec2(0, 0.5)
        });
    }

    // no texture of its own - the rect is drawn in OnRender, so report it here for bounds/hit tests
    override GetLocalContentBounds(): Rectangle
    {
        return { x: 0, y: 0, width: this.width, height: this.height };
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
