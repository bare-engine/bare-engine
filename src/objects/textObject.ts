import { BareText, ITextTextureOptions, Vec2 } from "../exports";
import { Scene } from "../scenes/scene";
import { GameObject } from "./gameObject";

export class TextObject extends GameObject
{
    textTexture: BareText;
    pivotPercentage: Vec2 = new Vec2();

    constructor(scene: Scene, options: ITextTextureOptions = {})
    {
        super(scene);

        this.textTexture = new BareText(options);
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
        this.textTexture.setText(text);

        // REAPLY PIVOT AFTER CHANGING TEXT(URE)
        if (this.pivotPercentage.x != -1)
            this.pivotX = this.textTexture.width * this.pivotPercentage.x;
        if (this.pivotPercentage.y != -1)
            this.pivotY = this.textTexture.height * this.pivotPercentage.y;

        this.SetNameBasedOnText(text);
    }

    override SetPivot(x: number, y: number):GameObject
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
