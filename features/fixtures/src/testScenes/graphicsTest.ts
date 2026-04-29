import { Color, Scene, Vec2 } from "bare-engine";

export class GraphicsTest extends Scene
{
    rendered = false;

    OnRender(): void
    {
        this.renderCircle({
            position: new Vec2(100, 200),
            radius: 50,
            segments: 16,
            color: Color.Red,
        });

        this.renderRect({
            position: new Vec2(200, 150),
            width: 120,
            height: 100,
            color: Color.Blue,
        });

        this.renderLine({
            position: new Vec2(380, 150),
            points: Vec2.FromArray([
                [0, 30],
                [120, 20],
                [130, 100],
            ]),
            width: 5,
            closed: false,
            color: Color.Green,
        });

        if (!this.rendered)
        {
            this.rendered = true;
            assert(true, "graphics render calls should execute without throwing");
        }
    }
}
