import { CameraScaleMode, LevelData, Scene } from "bare-engine";

export class CameraTest extends Scene
{
    override async OnStart(): Promise<void>
    {
        // the camera is created on first use: loading a level before that must still give it the level's bounds
        const level: LevelData = { name: "cameraBoundsLevel", dimensions: { width: 3000, height: 2000 }, entitiesByLayer: {} } as any;
        await this.LoadLevel(level as any);
        const levelBounds = this.camera.bounds;
        assert(levelBounds.width === 3000 && levelBounds.height === 2000, "a camera first used after a level loaded should have the level's bounds: " + JSON.stringify(levelBounds));

        this.camera.SetBounds({ x: -4500, y: -1500, width: 9000, height: 3000 });
        this.camera.SetDimensions(9000, 3000);

        this.camera.SetScaleMode(CameraScaleMode.Cover);
        const coverZoom = this.camera.zoomFit;

        this.camera.SetScaleMode(CameraScaleMode.Contain);
        const containZoom = this.camera.zoomFit;

        this.camera.SetScaleMode(CameraScaleMode.None);
        const noneZoom = this.camera.zoomFit;

        this.camera.SetPosition(120, 80);

        assert(coverZoom >= containZoom, "cover mode should fit at least as tightly as contain mode");
        assert(noneZoom === 1, "none mode should not apply automatic fit scaling");
        assert(this.camera.position.x === 120 && this.camera.position.y === 80, "camera position should update");
    }
}
