import { Scene, TextObject } from "bare-engine";

export class UiTest extends Scene
{
    constructor()
    {
        super({ UI: true, resize: true });
    }

    OnStart(): void
    {
        const center = this.CreateText("Resize me")
            .SetPosition(bare.width * 0.5, bare.height * 0.5)
            .CenterPivot();

        const left = this.CreateText("Left")
            .SetPosition(0, bare.height * 0.5)
            .SetPivot(0, 0.5);

        const right = this.CreateText("Right")
            .SetPosition(bare.width, bare.height * 0.5)
            .SetPivot(1, 0.5);

        assert(this.UI === true && this.resize === true, "UI demo scene options should be enabled");
        assert(center.x === bare.width * 0.5 && center.y === bare.height * 0.5, "center UI text should be centered");
        assert(left.pivot.x === 0, "left UI text should anchor to the left edge");
        assert(right.x === bare.width, "right UI text should be positioned at the right edge");
    }

    private CreateText(text: string): TextObject
    {
        const textObject = new TextObject(this, {
            text,
            fontSize: 20,
            fontFamily: "monospace",
        });

        this.AddGameObject(textObject);

        return textObject;
    }
}
