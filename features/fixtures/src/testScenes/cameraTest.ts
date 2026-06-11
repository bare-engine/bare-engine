import { CameraScaleMode, Scene } from "bare-engine";

export class CameraTest extends Scene
{
    OnStart(): void
    {
        this.camera.SetBounds({ x: -4500, y: -1500, width: 9000, height: 3000 });
        this.camera.SetDimensions(9000, 3000);

        this.camera.SetScaleMode(CameraScaleMode.Cover);
        const coverZoom = this.camera.zoomFit;

        this.camera.SetScaleMode(CameraScaleMode.Contain);
        const containZoom = this.camera.zoomFit;

        this.camera.SetPosition(120, 80);

        assert(coverZoom >= containZoom, "cover mode should fit at least as tightly as contain mode");
        assert(this.camera.target.x === 120 && this.camera.target.y === 80, "camera target position should update");
    }
}
