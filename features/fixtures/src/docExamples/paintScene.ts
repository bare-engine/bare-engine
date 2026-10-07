import { RenderTexture, Scene } from 'bare-engine';

export class PaintScene extends Scene
{
    canvas?: RenderTexture;

    override OnStart()
    {
        this.canvas = new RenderTexture(rapid, { width: 256, height: 256 });
        this.AddGameObject(this.canvas);
    }

    override OnClear()
    {
        this.canvas?.destroy();
        this.canvas = undefined;
    }
}
