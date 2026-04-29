import { CameraScaleMode, Scene } from "bare-engine";

export class CameraTest extends Scene
{
    OnStart(): void
    {
        this.cameraHandler.SetBounds({ x: -4500, y: -1500, width: 9000, height: 3000 });
        this.cameraHandler.SetDimensions(9000, 3000);

        this.cameraHandler.SetScaleMode(CameraScaleMode.Cover);
        const coverZoom = this.cameraHandler.zoomFit;

        this.cameraHandler.SetScaleMode(CameraScaleMode.Contain);
        const containZoom = this.cameraHandler.zoomFit;

        this.cameraHandler.SetPosition(120, 80);

        assert(coverZoom >= containZoom, "cover mode should fit at least as tightly as contain mode");
        assert(this.cameraHandler.target.x === 120 && this.cameraHandler.target.y === 80, "camera target position should update");
    }
}
