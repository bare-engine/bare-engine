import { Color, Scene, Vec2 } from "bare-engine";

export class GraphicsTest extends Scene
{
    rendered = false;

    OnRender(): void
    {
        this.drawCircle({
            radius: 50,
            color: Color.Red,
            segments: 16,
            position: new Vec2(100, 200),
        });

        this.drawRect({
            width: 120,
            height: 100,
            color: Color.Blue,
            position: new Vec2(200, 150),
        });

        this.drawLine({
            points: Vec2.FromArray([
                [0, 30],
                [120, 20],
                [130, 100],
            ]),
            width: 5,
            closed: false,
            color: Color.Green,
            position: new Vec2(380, 150),
        });

        if (!this.rendered)
        {
            this.rendered = true;
            assert(true, "graphics render calls should execute without throwing");
        }
    }
}
