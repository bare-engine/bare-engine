import { keyboardController } from "../controllers/keyboardController";
import { Color, Vec2 } from "../libraries/new-rapid-render";
import { GameObject } from "../objects/gameObject";
import { ArcadeObject } from "../objects/arcadeObject";
import { EditorScene } from "../scenes/editorScene";
import { BareEvent, BareEventPayload, Entity, Rectangle } from "../types/bareTypes";
import { Helper } from "../utils/helper";
import { MakePathForEntity } from "../globals";
import { assetsHandler } from "./assetsHandler";
import { TransformToolHandler } from "./transformToolHandler";

export class EditorControlsHandler {
    private active: boolean = true;
    public currentPreviewEntity: GameObject;
    private previewEntityData: Entity | null = null;
    // where placed stamps go: the parent of the object the stamp was sampled from
    private previewParent: GameObject | null = null;
    private previewRevision = 0;

    private gesture: 'idle' | 'select' | 'remove' = 'idle';
    private readonly onWheel = this.OnScroll.bind(this);

    private selectionRect: Rectangle = { x: 0, y: 0, width: 0, height: 0 };

    selectedObjects: GameObject[] = [];
    private copiedObjects: Entity[] = [];

    private lastMultiPlaceGridKey: string | null = null;
    private static clipboard: Entity[] = [];

    constructor(public readonly scene: EditorScene) {
        this.copiedObjects = EditorControlsHandler.clipboard;
        this.currentPreviewEntity = new ArcadeObject(scene, '', -100, -100);
        this.currentPreviewEntity.name = 'ignoreInPlugin';
        this.OnStampChanged();

        bare.events.on(BareEvent.pointer_down_any, this.AnyPointerDown.bind(this));
        bare.events.on(BareEvent.pointer_down, this.PointerDown.bind(this));
        bare.events.on(BareEvent.pointer_move, this.PointerMove.bind(this));
        bare.events.on(BareEvent.pointer_up_any, this.AnyPointerUp.bind(this));
        bare.events.on(BareEvent.pointer_up, this.PointerUp.bind(this));
        bare.events.on(BareEvent.pointer_doubleClick, this.DoubleClick.bind(this));
        bare.events.on(BareEvent.key_pressed, this.KeyPressed.bind(this));
        bare.events.on(BareEvent.key_released, this.KeyReleased.bind(this));
        bare.events.on(BareEvent.editor_layerSelected, this.LayerSelected.bind(this));
    }

    SetActive(active: boolean)
    {
        this.active = active;

        this.UpdatePreviewVisibility();
    }

    private KeyPressed({ key, allKeys }: BareEventPayload['key_pressed']): void
    {
        if (!this.scene.opened)
            return;

        if (key === 'control')
            bare.hitbox.ClearExclusiveLayers();

        if (allKeys.includes('control'))
        {
            switch (key)
            {
                case 'a': this.SelectGameObjects(bare.object.GetAll()); break;
                case 'x':
                    this.CopySelectedObjects();
                    this.RemoveSelectedObjects();
                    this.scene.saveLevelCallback();
                    break;
                case 'c': this.CopySelectedObjects(); break;
                case 'v': this.PasteCopiedObjects(); break;
            }
            return;
        }

        if (key === 'delete')
        {
            this.RemoveSelectedObjects();
            this.scene.saveLevelCallback();
        }
        else if (key === 's' && allKeys.length === 1)
            this.ActivateStampFromSelection();
    }

    private KeyReleased({ key }: BareEventPayload['key_released']): void
    {
        if (!this.scene.opened || key !== 'control')
            return;

        bare.hitbox.SetExclusiveLayer(this.GetSelectedLayer());
        bare.hitbox.ResetCurrentHover();
    }

    private AnyPointerDown({ mouseX, mouseY, event }: BareEventPayload['pointer_down_any']): void
    {
        if (event.button !== 2 || !this.scene.opened || TransformToolHandler.Get().IsTransforming() || bare.MouseIsOnEditor(event))
            return;

        // Right-click must still remove transform targets while their handles suppress controls.
        if (!this.RemoveObjectAtPointer(mouseX, mouseY))
            this.SetCurrentPreviewEntity(null);
    }

    private PointerDown({ event }: BareEventPayload['pointer_down']): void
    {
        if (!this.scene.opened || !this.active || TransformToolHandler.Get().IsTransforming() || bare.MouseIsOnEditor(event))
            return;

        if (this.CanPlaceCurrentPreviewObject())
        {
            const { x, y } = bare.mouse.world.position;
            this.SetEditorPosition(this.currentPreviewEntity, x, y, keyboardController.IsKeyDown("alt"));
            this.PlaceCurrentPreviewObject(this.GetSelectedLayer());
            return;
        }

        if (this.gesture === 'idle' && this.scene.AllowsRectSelection())
        {
            const { x, y } = bare.mouse.world.positionOnDown;
            this.selectionRect = { x, y, width: 0, height: 0 };
            this.gesture = 'select';
        }
    }

    CopySelectedObjects(): void
    {
        this.copiedObjects = this.selectedObjects.map(obj => this.scene.GetEntityFromObject(obj));
    }

    private PasteCopiedObjects(): void
    {
        if (this.copiedObjects.length === 0)
            return;

        const originX = Math.min(...this.copiedObjects.map(entity => entity.position?.x ?? 0));
        const originY = Math.min(...this.copiedObjects.map(entity => entity.position?.y ?? 0));
        const parent = this.GetPlacementParent(this.selectedObjects[this.selectedObjects.length - 1]?.parent);
        // copied positions are local to their parent, so place relative to the mouse in the paste parent's child space
        const mouse = bare.mouse.world.position;
        const { x, y } = parent instanceof GameObject ? parent.ToLocal(mouse) : mouse;
        const objects = this.copiedObjects.map(source => {
            const entity = this.CopyEntityForPlacement(source);
            return this.scene.AddGameObjectAtPosition(
                (entity.position?.x ?? 0) + x - originX,
                (entity.position?.y ?? 0) + y - originY,
                entity,
                parent
            );
        });
        this.SnapPastedObjectsToGrid(objects, x, y);
        this.SelectGameObjects(objects);
        this.scene.saveLevelCallback();
    }

    private CopyEntityForPlacement(source: Entity): Entity
    {
        const entity = Helper.DeepCopy(source);
        delete entity.entityUID;
        return entity;
    }

    RemoveSelectedObjects(): void
    {
        const objects = [...this.selectedObjects];
        this.ClearSelection();
        for (const obj of objects)
            this.scene.RemoveGameObject(obj);
    }

    private SnapPastedObjectsToGrid(objs: GameObject[], mouseX: number, mouseY: number)
    {
        if (objs.length == 0)
            return;

        let anchorObj = objs[0];
        for (let i = 1; i < objs.length; i++)
        {
            const obj = objs[i];
            if (obj.x < anchorObj.x || (obj.x == anchorObj.x && obj.y < anchorObj.y))
                anchorObj = obj;
        }

        const snappedPosition = this.GetGridAlignedPosition(
            anchorObj,
            anchorObj.x,
            anchorObj.y,
            keyboardController.IsKeyDown("alt"),
            mouseX,
            mouseY
        );

        const movedX = snappedPosition.x - anchorObj.x;
        const movedY = snappedPosition.y - anchorObj.y;

        if (movedX == 0 && movedY == 0)
            return;

        for (const obj of objs)
            obj.SetPosition(obj.x + movedX, obj.y + movedY);
    }

    private PointerMove(): void
    {
        if (!this.scene.opened || !this.active)
            return;

        if (bare.mouse.IsMiddleDown())
        {
            const delta = bare.mouse.screen.position.subtract(bare.mouse.screen.positionPrev);
            const zoom = bare.camera.GetZoom();
            bare.camera.AddPosition(-delta.x / zoom, -delta.y / zoom);
        }

        if (this.gesture !== 'select')
            return;

        const start = bare.mouse.world.positionOnDown;
        const end = bare.mouse.world.position;
        this.selectionRect = {
            x: Math.min(start.x, end.x),
            y: Math.min(start.y, end.y),
            width: Math.abs(end.x - start.x),
            height: Math.abs(end.y - start.y)
        };
    }

    private AnyPointerUp({ event }: BareEventPayload['pointer_up_any']): void
    {
        if (event.button === 2)
            this.HandlePointerUp(event);
    }

    private PointerUp({ event }: BareEventPayload['pointer_up']): void
    {
        this.HandlePointerUp(event);
    }

    private HandlePointerUp(event: PointerEvent): void
    {
        if (!this.scene.opened)
            return;

        const shouldSave = this.active || this.gesture === 'remove';
        if (this.active && this.gesture == 'select')
        {
            this.SelectGameObjectsInRect(this.selectionRect);
        }

        this.selectionRect.width = 0;
        this.selectionRect.height = 0;

        this.gesture = 'idle';
        this.lastMultiPlaceGridKey = null;

        if (!shouldSave || !(event.button == 0 || event.button == 2))
            return;

        // TransformTool owns persistence for move/resize/rotate. Its global pointer-up runs
        // before this scene-local handler, so avoid saving the same gesture a second time.
        if (!TransformToolHandler.Get().HandledPointerUp(event))
            this.scene.saveLevelCallback();
    }

    private DoubleClick(): void
    {
        if (!this.scene.opened)
            return;

        const multiSelect = keyboardController.IsKeyDown("shift");
        if (multiSelect)
            return;

        // sample what the click picked. prefer the selection it made: while the transform tool hovers
        // a selected object its hitbox is off, so picking again could miss it
        const world = bare.mouse.world.position;
        const selected = this.selectedObjects[this.selectedObjects.length - 1];
        const obj = selected && Helper.IsPointInRectangle(world, selected.GetBounds())
            ? selected
            : this.scene.PickAt(world, keyboardController.IsKeyDown("control"));
        if (!obj?.entity)
            return;

        // includes edits since load (eg a scale set with the transform tool) and its position,
        // so only the object the stamp came from matches and toggles the stamp off
        const entity = this.scene.GetEntityFromObject(obj);
        // an unedited child (eg a person's eyes) serializes to {}, keep what it extends to stamp it
        entity.extends ??= obj.entity.extends;
        const sameEntity = JSON.stringify(entity) === JSON.stringify(this.previewEntityData);
        this.SetCurrentPreviewEntity(this.currentPreviewActive && sameEntity ? null : entity, obj.parent);
    }

    private ActivateStampFromSelection(): void
    {
        if (this.currentPreviewActive)
        {
            this.SetCurrentPreviewEntity(null);
            return;
        }

        const selectedObj = this.selectedObjects[this.selectedObjects.length - 1];
        if (selectedObj)
            this.SetCurrentPreviewEntity(this.scene.GetEntityFromObject(selectedObj), selectedObj.parent);
    }

    // where new objects go: next to the object they came from, else under the scene's edit root
    // (the entity in the entity editor), else in the selected layer
    private GetPlacementParent(sourceParent: GameObject | null | undefined): int | GameObject
    {
        return sourceParent ?? this.scene.GetEditRoot() ?? this.GetSelectedLayer();
    }

    GetSelectedLayer(): int
    {
        const selectedLayer = document.querySelector('.selected-layer');
        const layerName = selectedLayer?.id;
        const layerInfo = this.scene.settingsData.layersInfo[layerName];

        return layerInfo?.layerI;
    }

    private SelectGameObjectsInRect(rect: Rectangle): void
    {
        const objsToSelect: GameObject[] = [];

        if (rect.width != 0 && rect.height != 0)
        {
            const includeAllLayers = keyboardController.IsKeyDown("control");
            const candidates = this.scene.GetRectSelectionCandidates(includeAllLayers);
            // alt selects anything the rect touches instead of only fully contained objects
            const allowPartial = keyboardController.IsKeyDown("alt");

            for (const candidate of candidates)
            {
                const hit = allowPartial
                    ? this.RectOverlaps(rect, candidate.rect)
                    : this.RectContains(rect, candidate.rect);
                if (hit)
                    objsToSelect.push(candidate.obj);
            }
        }

        const multiSelect = keyboardController.IsKeyDown("shift");
        this.SelectGameObjects(objsToSelect, !multiSelect);
    }

    private RectOverlaps(a: Rectangle, b: Rectangle): boolean
    {
        return a.x <= b.x + b.width &&
            a.x + a.width >= b.x &&
            a.y <= b.y + b.height &&
            a.y + a.height >= b.y;
    }

    private RectContains(container: Rectangle, target: Rectangle): boolean
    {
        return target.x >= container.x &&
            target.x + target.width <= container.x + container.width &&
            target.y >= container.y &&
            target.y + target.height <= container.y + container.height;
    }

    ClearSelection(): void
    {
        this.selectedObjects.length = 0;
        TransformToolHandler.Get().Clear();
    }

    SelectGameObjects(
        objs: GameObject[],
        clearPrevious: boolean = true,
        notifyPlugin: boolean = true
    )
    {
        if (clearPrevious)
            this.ClearSelection();

        for (let i = objs.length - 1; i >= 0; i--)
        {
            const obj = objs[i];

            // Already selected objects stay selected during additive selection.
            if (this.selectedObjects.includes(obj))
                continue;

            this.selectedObjects.push(obj);
        }

        TransformToolHandler.Get().SetTargets(this.selectedObjects);

        // notify the plugin of the full current selection, or that it's empty. single selection shows
        // that object; multi selection shows the last one but applies field edits to all selected.
        if (notifyPlugin)
            this.scene.NotifySelectionToPlugin(this.selectedObjects);
    }

    // Shift-click toggles membership without changing the other selected objects.
    ToggleGameObjectSelection(obj: GameObject, notifyPlugin: boolean = true)
    {
        if (!this.selectedObjects.includes(obj))
        {
            this.SelectGameObjects([obj], false, notifyPlugin);
            return;
        }

        this.selectedObjects = this.selectedObjects.filter(o => o !== obj);

        TransformToolHandler.Get().SetTargets(this.selectedObjects);

        if (notifyPlugin)
            this.scene.NotifySelectionToPlugin(this.selectedObjects);
    }

    private OnScroll(ev: WheelEvent)
    {
        if (!this.scene.opened)
            return;

        if (bare.MouseIsOnEditor(ev))
            return;

        const screen = bare.GetCanvasScreenPosition(ev.clientX, ev.clientY);
        const before = bare.camera.ScreenToWorld(screen.x, screen.y);

        const zoomStep = 1.2; // EXPONENTIAL ZOOM FOR CONSISTENT FEEL AT ALL SCALES
        const scrollDirection = ev.deltaY > 0 ? -1 : 1;

        bare.camera.zoom *= (scrollDirection > 0 ? zoomStep : 1 / zoomStep);
        bare.camera.zoom = Math.max(.08, bare.camera.zoom); // SO WE DON'T ZOOM OUT TOO MUCH AND LOSE THE CONTENT

        const after = bare.camera.ScreenToWorld(screen.x, screen.y);
        // Keep the mouse anchored to the same world position, similar to the zoom behavior in design software and map applications.
        bare.camera.AddPosition(before.x - after.x, before.y - after.y);

        ev.preventDefault();
    }

    private LayerSelected({ layerName }: BareEventPayload['editor_layerSelected']): void
    {
        if (!keyboardController.IsKeyDown("control"))
            this.ClearSelection();

        bare.hitbox.SetExclusiveLayer(this.scene.settingsData.layersInfo[layerName].layerI);
    }

    // stamp mode while there's stamp data
    get currentPreviewActive(): boolean
    {
        return this.previewEntityData !== null;
    }

    private OnStampChanged(): void
    {
        this.UpdatePreviewVisibility();
        // optional chaining since this also runs in our constructor, before editoruihandler exists
        this.scene.editorUIHandler?.editorUIHintHandler?.SetMode(this.currentPreviewActive ? 'stamp' : 'edit');
    }

    // Accept raw entity data; construction is only needed for rendering the preview.
    SetCurrentPreviewEntity(entity: Entity | null, parent: GameObject | null = null): void
    {
        this.previewParent = parent;
        const revision = ++this.previewRevision;
        this.previewEntityData = entity ? Helper.DeepCopy(entity) : null;
        this.lastMultiPlaceGridKey = null;
        if (!this.previewEntityData)
        {
            this.OnStampChanged();
            return;
        }

        const constructedEntity = this.scene.ConstructEntity(Helper.DeepCopy(this.previewEntityData));
        const preview = this.ReplacePreviewObject(constructedEntity.baseClass);
        this.OnStampChanged();

        const applyPreview = (texture?: GameObject['texture']) => {
            if (revision !== this.previewRevision)
                return;

            if (texture)
                preview.SetTexture(texture);
            this.scene.ApplyEntityToGameObject(constructedEntity, preview, false);
            this.RemovePreviewHitboxes(preview);
            // the entity can bring its own alpha and name
            preview.alpha = 0.5;
            preview.name = 'ignoreInPlugin';
            this.UpdatePreviewVisibility();
        };

        const texturePath = MakePathForEntity(constructedEntity);
        if (!texturePath || texturePath.endsWith("NONE") || texturePath.endsWith("NAME"))
            applyPreview();
        else
        {
            const cached = assetsHandler.GetTexture(texturePath);
            if (cached)
                applyPreview(cached);
            else
                // Load separately so an old request cannot overwrite the new preview's texture.
                assetsHandler.LoadTexture(texturePath).then(applyPreview);
        }
    }

    // a fresh object of the stamp's class (eg a TextObject to draw text) for every stamp, so nothing
    // from the previous stamp carries over. a plain GameObject stamp gets an ArcadeObject
    private ReplacePreviewObject(baseClass: string = "GameObject"): GameObject
    {
        const preview = baseClass == "GameObject"
            ? new ArcadeObject(this.scene, '', -100, -100)
            : bare.GetObjectFromPool(baseClass, this.scene);
        preview.Awake();
        preview.Init('ignoreInPlugin');
        preview.alpha = 0.5;

        bare.object.Remove(this.currentPreviewEntity);
        bare.object.Add(preview);
        this.currentPreviewEntity = preview;
        return preview;
    }

    // the preview's children get editor hitboxes like any added object. hovering one hides the
    // preview (see UpdatePreviewVisibility), which unhovers it again, so it flickers every frame.
    private RemovePreviewHitboxes(obj: GameObject): void
    {
        for (const child of obj.children)
        {
            child.tapHitbox = null;
            this.RemovePreviewHitboxes(child);
        }
    }

    private UpdatePreviewVisibility(): void
    {
        this.currentPreviewEntity.visible = this.currentPreviewActive;
        this.currentPreviewEntity.visibleInEditor = this.currentPreviewActive && this.active &&
            (!bare.hitbox.GetCurrentHover() || keyboardController.IsKeyDown("control"));
    }

    // Snap either the pivot or local origin to the grid, using the pointer as a guide.
    private GetGridAlignedPosition(obj: GameObject, x: number, y: number, ignoreGrid = false, guideX = x, guideY = y): Vec2
    {
        const settings = this.scene.settingsData.settings;
        const gridSize = settings?.gridSize;
        if (ignoreGrid || !this.scene.gridEnabled || !(gridSize > 0))
            return new Vec2(x, y);

        if (this.scene.settingsData.editorObjectSnapToPivot === false)
        {
            const snapCell = (value: number) => Math.floor(value / gridSize + 0.000001) * gridSize;
            return new Vec2(
                snapCell(guideX) + obj.pivot.x * obj.totalScaleX,
                snapCell(guideY) + obj.pivot.y * obj.totalScaleY
            );
        }

        const texture = obj.texture;
        const rect = texture && texture.width > 0 && texture.height > 0
            ? { x: 0, y: 0, width: texture.width, height: texture.height }
            : (obj as ArcadeObject).physicsHitbox?.rectangle;
        const validRect = rect && rect.width > 0 && rect.height > 0;
        const pivotX = validRect ? Helper.Clamp((obj.pivot.x - rect.x) / rect.width, 0, 1) : 0.5;
        const pivotY = validRect ? Helper.Clamp((obj.pivot.y - rect.y) / rect.height, 0, 1) : 0.5;
        return new Vec2(
            Math.floor(guideX / gridSize + pivotX) * gridSize,
            Math.floor(guideY / gridSize + pivotY) * gridSize
        );
    }

    private SetEditorPosition(obj: GameObject, x: number, y: number, ignoreGrid: boolean = false): void
    {
        const position = this.GetGridAlignedPosition(obj, x, y, ignoreGrid);
        obj.SetPosition(position.x, position.y);
    }

    // Keep transform-tool dragging consistent with stamp and paste snapping.
    GetGridAlignedDragPosition(obj: GameObject, desiredX: number, desiredY: number, mouseX: number, mouseY: number, ignoreGrid: boolean): Vec2
    {
        const guideX = this.scene.settingsData.editorObjectSnapToPivot === false ? mouseX : desiredX;
        const guideY = this.scene.settingsData.editorObjectSnapToPivot === false ? mouseY : desiredY;

        return this.GetGridAlignedPosition(obj, desiredX, desiredY, ignoreGrid, guideX, guideY);
    }

    private PlaceCurrentPreviewObject(layer: int): GameObject
    {
        const entityCopy = this.CopyEntityForPlacement(this.previewEntityData);
        // the preview sits in world space, a parent needs its local position
        const parent = this.GetPlacementParent(this.previewParent);
        const { x, y } = parent instanceof GameObject
            ? parent.ToLocal(new Vec2(this.currentPreviewEntity.x, this.currentPreviewEntity.y))
            : this.currentPreviewEntity;
        const obj = this.scene.AddGameObjectAtPosition(x, y, entityCopy, parent);

        // placing replaces the selection: while stamping, shift multi-places, it doesn't multi-select
        this.SelectGameObjects([obj], true);
        // save now like a paste does, on pointer up the new selection under the pointer has
        // TransformTool suppressing these controls, which skips that save
        this.scene.saveLevelCallback();

        this.lastMultiPlaceGridKey = this.GetCurrentPreviewPlacementKey(layer);
        return obj;
    }

    CanPlaceCurrentPreviewObject(): boolean
    {
        return (
            this.currentPreviewActive &&
            this.currentPreviewEntity.visible &&
            this.currentPreviewEntity.visibleInEditor
        );
    }

    private IsMultiPlaceGridEnabled(ignoreGrid: boolean = false): boolean
    {
        const settings = this.scene.settingsData.settings;
        return !!(
            this.CanPlaceCurrentPreviewObject() &&
            keyboardController.IsKeyDown("shift") &&
            !ignoreGrid &&
            this.scene.gridEnabled &&
            settings.gridSize > 0
        );
    }

    private GetCurrentPreviewPlacementKey(layer: int): string
    {
        return [
            layer,
            this.previewRevision,
            this.currentPreviewEntity.x.toFixed(4),
            this.currentPreviewEntity.y.toFixed(4)
        ].join(":");
    }

    private PlaceCurrentPreviewObjectOnNewGridSquare(ignoreGrid: boolean): void
    {
        if (!bare.mouse.IsDown())
        {
            this.lastMultiPlaceGridKey = null;
            return;
        }

        if (!this.IsMultiPlaceGridEnabled(ignoreGrid))
            return;

        const layer = this.GetSelectedLayer();
        const placementKey = this.GetCurrentPreviewPlacementKey(layer);
        if (placementKey == this.lastMultiPlaceGridKey)
            return;

        this.PlaceCurrentPreviewObject(layer);
    }

    // removes what the pointer is on: the transform tool's selection (its targets have their hitboxes
    // disabled, so picking misses them) or what a click would pick, with the rest of the selection
    private RemoveObjectAtPointer(screenX: number, screenY: number): boolean
    {
        if (!TransformToolHandler.Get().TryRemoveTargetsAtPointer(this.scene, screenX, screenY))
        {
            const obj = this.scene.PickAt(this.scene.ScreenToWorld(screenX, screenY), false);
            if (!obj)
                return false;

            if (this.selectedObjects.includes(obj))
                this.RemoveSelectedObjects();
            else
                this.scene.RemoveGameObject(obj);
        }

        bare.hitbox.ResetCurrentHover();
        this.gesture = 'remove';
        return true;
    }

    Update(_deltaTime?: number) {
        if (!this.scene.opened)
            return;

        // before the active check: TransformTool suppresses editor controls while its frame is hovered,
        // which would otherwise make its own selection unremovable by a right drag
        const rightDragged = bare.mouse.IsRightDown() &&
            Helper.Distance(bare.mouse.world.position, bare.mouse.world.positionOnRightDown) > 5;

        if (rightDragged && this.RemoveObjectAtPointer(bare.mouse.screen.position.x, bare.mouse.screen.position.y))
            return;

        if (!this.active)
            return;

        this.UpdatePreviewVisibility();
        if (!this.currentPreviewActive)
            return;

        const altDown = keyboardController.IsKeyDown("alt");
        const { x, y } = bare.mouse.world.position;
        this.SetEditorPosition(this.currentPreviewEntity, x, y, altDown);
        this.PlaceCurrentPreviewObjectOnNewGridSquare(altDown);
    }

    PostRender(): void
    {
        if (!this.scene.opened || this.gesture !== 'select')
            return;

        const { x, y, width, height } = this.selectionRect;
        rapid.drawRect({
            width,
            height,
            color: new Color(0, 0, 0, 20),
            position: new Vec2(x, y),
        });
        rapid.drawLine({
            points: [
                new Vec2(x, y),
                new Vec2(x + width, y),
                new Vec2(x + width, y + height),
                new Vec2(x, y + height),
            ],
            width: 2,
            roundCap: false,
            color: Color.fromHex('#dda112'),
            closed: true
        });
    }

    OpenEditor()
    {
        window.addEventListener('wheel', this.onWheel, { passive: false });
        bare.object.Add(this.currentPreviewEntity);
        this.SetCurrentPreviewEntity(null);
    }

    Clear()
    {
        EditorControlsHandler.clipboard = this.copiedObjects;
        window.removeEventListener('wheel', this.onWheel);
        this.gesture = 'idle';

        bare.hitbox.ClearExclusiveLayers();
        this.SetCurrentPreviewEntity(null);
        bare.object.Remove(this.currentPreviewEntity);

        this.ClearSelection();
    }
}
