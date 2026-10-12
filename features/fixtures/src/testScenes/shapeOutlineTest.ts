import { Color, Scene, Vec2 } from "bare-engine";
import { Checks } from "./checks";

// covers the outline and fill options of bare.drawRect, bare.drawCircle and bare.drawRoundedRect

export class ShapeOutlineTest extends Scene
{
    checks = new Checks();
    checked = false;

    constructor()
    {
        super({ layers: ["objects"] });
    }

    // the number of vertices a draw call submits
    CountVertices(draw: () => void): number
    {
        let count = 0;
        const add = rapid.addGraphicVertex.bind(rapid);
        rapid.addGraphicVertex = ((...args: Parameters<typeof add>) => { count++; add(...args); }) as typeof add;
        try
        {
            draw();
        }
        finally
        {
            rapid.addGraphicVertex = add;
        }
        return count;
    }

    override OnRender(): void
    {
        if (this.checked)
            return;
        this.checked = true;

        const c = this.checks;
        const position = new Vec2(100, 100);
        const outline = { width: 4, color: Color.Red };

        const rect = this.CountVertices(() => bare.drawRect({ position, width: 50, height: 30, color: Color.Blue }));
        const rectOutlined = this.CountVertices(() => bare.drawRect({ position, width: 50, height: 30, color: Color.Blue, outline }));
        const rectOnlyOutline = this.CountVertices(() => bare.drawRect({ position, width: 50, height: 30, fill: false, outline }));
        c.check(rectOutlined > rect, `an outline should add vertices to a rect: ${rect} -> ${rectOutlined}`);
        c.check(rectOnlyOutline === rectOutlined - rect, `fill: false should draw only the outline: ${rectOnlyOutline}`);

        const circle = this.CountVertices(() => bare.drawCircle({ position, radius: 20, color: Color.Blue }));
        const circleOnlyOutline = this.CountVertices(() => bare.drawCircle({ position, radius: 20, fill: false, outline }));
        c.check(circleOnlyOutline > 0, "a circle with fill: false should still draw its outline");
        c.check(this.CountVertices(() => bare.drawCircle({ position, radius: 20, color: Color.Blue, outline })) === circle + circleOnlyOutline,
            "an outlined circle should be its fill plus its outline");

        const rounded = this.CountVertices(() => bare.drawRoundedRect({ position, width: 60, height: 40, radius: 10, fill: false, outline }));
        c.check(rounded > rectOnlyOutline, "a rounded rect outline should follow its corners, so it has more vertices than a plain rect's: " + rounded);

        c.check(this.CountVertices(() => bare.drawRect({ position, width: 50, height: 30, fill: false })) === 0, "fill: false without an outline should draw nothing");

        c.flush();
    }
}
