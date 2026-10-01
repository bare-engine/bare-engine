import { RenderTexture, Scene } from 'bare-engine';

export class PaintScene extends Scene
{
    canvas?: RenderTexture;

    OnStart()
    {
        this.canvas = new RenderTexture(rapid, { width: 256, height: 256 });
        this.AddGameObject(this.canvas);
    }

    OnClear()
    {
        this.canvas?.destroy();
        this.canvas = undefined;
    }
}
