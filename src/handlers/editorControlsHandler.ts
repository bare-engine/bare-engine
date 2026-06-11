import { hitboxController } from "../controllers/hitboxController";
import { keyboardController } from "../controllers/keyboardController";
import { mouseController } from "../controllers/mouseController";
import { objectController } from "../controllers/objectController";
import { Color, Vec2 } from "../libraries/new-rapid-render";
import { GameObject } from "../objects/gameObject";
import { ArcadeObject } from "../objects/arcadeObject";
import { EditorScene } from "../scenes/editorScene";
import { OutlineShader } from "../shaders/outlineShader";
import { BareEvent, BareEventPayload, Entity, Rectangle } from "../types/bareTypes";
import { Helper } from "../utils/helper";
import { MakePath, MakePathForEntity } from "../globals";
import { cameraHandler } from "./cameraHandler";
import { levelHandler } from "./levelHandler";

/*
    BUILD CONTROLS INGAME
    Handles in-game build controls, mouse interactions, and entity placement
*/

export class EditorControlsHandler {
    private active: boolean = true;
    public currentPreviewEntity: GameObject;
    public currentPreviewActive:boolean = false;
    private draggingObject: GameObject | null = null;
    private dragOffset: Vec2;
    
    public scene: EditorScene;

    private actionThisFrame: string = '';

    private selectionRect: Rectangle = { x: 0, y: 0, width: 0, height: 0 };

    selectedObjects: GameObject[] = [];
    copiedObjects: Entity[] = [];

    private lastMultiPlaceGridKey: string | null = null;
    private firstMultiPlacedObject: GameObject | null = null;
    private multiPlaceSelectionReset: boolean = false;
    static copiedObjectCached: Entity[] = [];
    
    constructor(editorScene: any) {
        this.scene = editorScene;
        this.draggingObject = null;

        if (EditorControlsHandler.copiedObjectCached.length > 0)
        {
            this.copiedObjects = EditorControlsHandler.copiedObjectCached;
            EditorControlsHandler.copiedObjectCached = [];
        }

        this.currentPreviewEntity = new ArcadeObject(this.scene, '', -100, -100);
        this.currentPreviewEntity.name = 'currentPreviewEntity';
        this.currentPreviewEntity.customName = 'ignoreInPlugin';
        this.SetCurrentPreviewActive(false);//

        this.init();

        window.addEventListener('wheel', this.OnScroll.bind(this), { passive: false });  // THIS DOESN'T REMOVE LISTENER, JUST CHECKS FOR editorController.active
    }

    init()
    {
        this.scene.events.on(BareEvent.pointer_down_any, this.AnyPointerDown.bind(this));
        this.scene.events.on(BareEvent.pointer_down, this.PointerDown.bind(this));
        this.scene.events.on(BareEvent.pointer_move, this.PointerMove.bind(this));
        this.scene.events.on(BareEvent.pointer_up_any, this.AnyPointerUp.bind(this));
        this.scene.events.on(BareEvent.pointer_up, this.PointerUp.bind(this));
        this.scene.events.on(BareEvent.pointer_doubleClick, this.DoubleClick.bind(this));
        //this.scene.events.on(BareEvent.game_postRender, this.PostRender.bind(this));
        this.scene.events.on(BareEvent.key_pressed, this.KeyPressed.bind(this));
        this.scene.events.on(BareEvent.key_released, this.KeyReleased.bind(this));
        this.scene.events.on(BareEvent.editor_layerSelected, this.LayerSelected.bind(this));
    }

    SetActive(active: boolean)
    {
        this.active = active;

        if (this.currentPreviewEntity.visible) // WORKS BUT WEIRD... TODO
            this.currentPreviewEntity.visibleInEditor = active;
    }

    KeyPressed({ key, allKeys }: BareEventPayload['key_pressed'])
    {
        if (!this.scene.opened)
            return;
        
        if (allKeys[0] == 'control')
        {
            hitboxController.ClearExclusiveLayers();
        }
        // SELECT ALL
        if (allKeys[0] == 'control' && allKeys[1] == 'a')
        {
            this.SelectGameObjects(objectController.GetAll());
        }
        // CUT
        if (allKeys[0] == 'control' && allKeys[1] == 'x')
        {
            this.CopySelectedObjects();
            this.RemoveSelectedObjects();
            this.scene.saveLevelCallback();
        }
        // COPY
        if (allKeys[0] == 'control' && allKeys[1] == 'c')
        {
            this.CopySelectedObjects();
        }
        // PASTE
        if (allKeys[0] == 'control' && allKeys[1] == 'v')
        {
            if (this.copiedObjects.length == 0)
                return;

            var topLeftCopiedObjects = new Vec2(Number.MAX_VALUE, Number.MAX_VALUE);
            this.copiedObjects.forEach(entity => {
                if (entity.position.x < topLeftCopiedObjects.x)
                    topLeftCopiedObjects.x = entity.position.x;
                if (entity.position.y < topLeftCopiedObjects.y)
                    topLeftCopiedObjects.y = entity.position.y;
            });

            var offset = mouseController.world.position.subtract(topLeftCopiedObjects);
            //offset = new Vec2(0,0);
            
            var objsCreated: GameObject[] = [];
            const layer = this.GetSelectedLayer();
            this.copiedObjects.forEach(entity => {
                var objCreated = this.scene.AddGameObjectAtPosition(entity.position.x + offset.x, entity.position.y + offset.y, entity, layer);
                objsCreated.push(objCreated);
            });
            this.SnapPastedObjectsToGrid(objsCreated);

            this.SelectGameObjects(objsCreated);

            this.scene.saveLevelCallback();
        }
        if (allKeys[0] == 'delete')
        {
            this.RemoveSelectedObjects();
        }
    }

    KeyReleased({ key, allKeys }: BareEventPayload['key_released'])
    {
        if (!this.scene.opened)
            return;
        
        if (key == 'control')
        {
            const layer = this.GetSelectedLayer();
            hitboxController.SetExclusiveLayer(layer);
            hitboxController.ResetCurrentHover(); // DON'T WANT TO STILL HAVE HITBOX HOVERED FROM POTENTIALLY DIFFERENT LAYER 
        }
    }

    private AnyPointerDown({ mouseX, mouseY, event, isLeftButton }: BareEventPayload['pointer_down_any']): void {
        if (isLeftButton)
            return;

        if (this.MouseIsOnEditor(event))
            return;

        if (!this.scene.opened)
            return;

        if (!this.active)
            return;

        if (this.draggingObject)
        {
            return;
        }

        var isRightButton = (event.button == 2);
        if (isRightButton)
        {
            var hover = hitboxController.GetCurrentHover();
            if (hover)
            {
                // ALSO REMOVE OTHER SELECTED ENTITIES
                var draggedEntityIsSelected = this.selectedObjects.includes(hover.parent);
                if (draggedEntityIsSelected)
                {
                    this.RemoveSelectedObjects();
                }
                else
                {
                    this.scene.RemoveGameObject(hover.parent);
                }

                hitboxController.ResetCurrentHover();
    
                this.actionThisFrame = 'objRemoval';
            }
            else
            {
                if (this.currentPreviewEntity)
                {
                    this.SetCurrentPreviewActive(false);
                }
            }
        }
    }

    private PointerDown({ mouseX, mouseY, event }: BareEventPayload['pointer_down']): void {
        if (this.MouseIsOnEditor(event))
            return;

        if (!this.scene.opened)
            return;

        if (!this.active)
            return;

        if (this.draggingObject)
        {
            return;
        }

        const layer = this.GetSelectedLayer();

        if (this.currentPreviewActive && this.currentPreviewEntity.visible)
        {
            const altDown = keyboardController.IsKeyDown("alt");
            this.SetEditorPosition(this.currentPreviewEntity, mouseController.world.position.x, mouseController.world.position.y, altDown);
            this.PlaceCurrentPreviewObject(layer);
            this.lastMultiPlaceGridKey = this.GetCurrentPreviewPlacementKey(layer);
        }
        
        if (this.actionThisFrame == '' && this.scene.settingsData.selectionEnabled !== false)
        {
            var w = mouseController.world.position.x - mouseController.world.positionOnDown.x;
            var h = mouseController.world.position.y - mouseController.world.positionOnDown.y;
            var x = mouseController.world.positionOnDown.x;
            var y = mouseController.world.positionOnDown.y;

            // MAKE SURE RECT X/Y IS ALWAYS AT TOP LEFT
            if (w < 0)
                x += w;
            if (h < 0)
                y += h;

            this.selectionRect.x = x;
            this.selectionRect.y = y;
            this.selectionRect.width = 0;
            this.selectionRect.height = 0;

            this.actionThisFrame = 'selectionRect';
        }
    }

    CopySelectedObjects()
    {
        this.copiedObjects = this.selectedObjects.map(obj => levelHandler.SerializeObject(obj));
    }

    RemoveSelectedObjects()
    {
        const objsToRemove = this.selectedObjects.slice();
        this.ClearSelection();

        for (var i = 0; i < objsToRemove.length; i++)
        {
            const obj = objsToRemove[i];
            this.scene.RemoveGameObject(obj);
        }
    }

    private SnapPastedObjectsToGrid(objs: GameObject[])
    {
        if (objs.length == 0)
            return;

        var anchorObj = objs[0];
        for (var i = 1; i < objs.length; i++)
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
            mouseController.world.position.x,
            mouseController.world.position.y
        );

        const movedX = snappedPosition.x - anchorObj.x;
        const movedY = snappedPosition.y - anchorObj.y;

        if (movedX == 0 && movedY == 0)
            return;

        for (const obj of objs)
            obj.SetPosition(obj.x + movedX, obj.y + movedY);
    }
    
    private PointerMove({ mouseX, mouseY, event }: BareEventPayload['pointer_move']): void {
        if (!this.scene.opened)
            return;

        if (!this.active)
            return;

        if (mouseController.IsMiddleDown()) {
            var deltaMovedMiddleMouse = mouseController.screen.position.subtract(mouseController.screen.positionPrev);
            var zoom = cameraHandler.GetZoom();
            cameraHandler.AddPosition(-deltaMovedMiddleMouse.x /zoom, -deltaMovedMiddleMouse.y / zoom);
        }

        var w = mouseController.world.position.x - mouseController.world.positionOnDown.x;
        var h = mouseController.world.position.y - mouseController.world.positionOnDown.y;
        var x = mouseController.world.positionOnDown.x;
        var y = mouseController.world.positionOnDown.y;

        // MAKE SURE RECT X/Y IS ALWAYS AT TOP LEFT
        if (w < 0)
            x += w;
        if (h < 0)
            y += h;
        w = Math.abs(w);
        h = Math.abs(h);

        if (this.actionThisFrame == 'selectionRect')
        {
            this.selectionRect.x = x;
            this.selectionRect.y = y;
            this.selectionRect.width = w;
            this.selectionRect.height = h;
        }
    }

    private AnyPointerUp({ mouseX, mouseY, event, isLeftButton }: BareEventPayload['pointer_up_any']): void
    {
        if (isLeftButton || event.button != 2)
            return;

        this.HandlePointerUp(event);
    }

    private PointerUp({ mouseX, mouseY, event }: BareEventPayload['pointer_up']): void
    {
        this.HandlePointerUp(event);
    }

    private HandlePointerUp(event: PointerEvent): void
    {
        if (!this.scene.opened)
            return;

        if (!this.active)
            return;

        if (this.actionThisFrame == 'selectionRect')
        {
            this.SelectGameObjectsInRect(this.selectionRect);
        }

        this.selectionRect.width = 0;
        this.selectionRect.height = 0;
            
        this.actionThisFrame = '';
        this.lastMultiPlaceGridKey = null;
        this.firstMultiPlacedObject = null;
        this.multiPlaceSelectionReset = false;

        if (!this.scene.opened)
            return;

        if (!(event.button == 0 || event.button == 2))
            return;
        
        this.scene.saveLevelCallback();
    }
    
    private DoubleClick({ mouseX, mouseY, event }: BareEventPayload['pointer_doubleClick']): void
    {
        if (!this.scene.opened)
            return;
        
        var multiSelect = keyboardController.IsKeyDown("shift");
        if (multiSelect)
            return;

        var hitbox = hitboxController.GetCurrentHover();
        if (hitbox)
        {
            var obj = hitbox.parent;
            
            if (!this.currentPreviewActive || obj.name != this.currentPreviewEntity.name) // DOUBLE CLICK FIRST TIME OR DIFFERENT OBJECT
            {
                //const entity = this.scene.ConstructEntity(obj.name);
                this.SetCurrentPreviewEntity(obj.entity);
            }
            else
            {
                this.SetCurrentPreviewEntity(null);
            }
        }
    }

    GetSelectedLayer(): int
    {
        const selectedLayer = document.querySelector('.selected-layer');
        const layerName = selectedLayer?.id;
        const layerInfo = this.scene.settingsData.layersInfo[layerName];

        return layerInfo?.layerI;
    }

    SelectGameObjectsInRect(rect: Rectangle = {x: 0, y: 0, width: 0, height: 0})
    {
        var objsToSelect: GameObject[] = [];

        if (rect.width != 0 && rect.height != 0)
        {
            var selectedLayer = document.querySelector('.selected-layer')!;
            var layerName = selectedLayer.id;
            var objs = objectController.GetLayerByName(layerName);

            if (keyboardController.IsKeyDown("control"))
                objs = objectController.GetAll();

            for (var i = objs.length - 1; i >= 0; i--)
            {
                var obj = objs[i];
                
                if (!obj.tapHitbox)
                    continue; // COULD BE THE PREVIEW OBJECT

                var topLeft = {x: obj.x - obj.pivot.x, y: obj.y - obj.pivot.y};
                var otherRect = {x: topLeft.x, y: topLeft.y, width: obj.tapHitbox.rectangle.width, height: obj.tapHitbox.rectangle.height};

                if (otherRect.x < rect.x + rect.width &&
                    otherRect.x + otherRect.width > rect.x &&
                    otherRect.y < rect.y + rect.height &&
                    otherRect.y + otherRect.height > rect.y)
                {
                    objsToSelect.push(obj);
                }
            }
        }

        var multiSelect = keyboardController.IsKeyDown("shift");
        this.SelectGameObjects(objsToSelect, !multiSelect);
    }

    ClearSelection()
    {
        for (var i = this.selectedObjects.length - 1; i >= 0; i--)
        {
            var obj = this.selectedObjects[i];
            obj.color = new Color(255, 255, 255, 255);

            obj.RemoveShader(OutlineShader);
        }

        this.selectedObjects.length = 0;
    }

    SelectGameObjects(objs: GameObject[], clearPrevious: boolean = true)
    {
        if (this.scene.settingsData.selectionEnabled === false)
            return;

        // CLEAR PREVIOUS
        if (clearPrevious)
            this.ClearSelection();

        // SELECT NEW
        for (var i = objs.length - 1; i >= 0; i--)
        {
            var obj = objs[i];

            // Already selected objects stay selected during additive selection.
            if (this.selectedObjects.includes(obj))
                continue;
            
            if (!obj.HasShader(OutlineShader))
                obj.AddShader(OutlineShader, { color: [0.867, 0.631, 0.071, 1.0], width: 8.0 });

            //obj.color = Color.fromHex('#707070ff');
            this.selectedObjects.push(obj);
        }

        // IF SINGLE OBJECT SELECTED, SELECT IN PLUGIN
        if (objs.length == 1)
            globalThis.plugin?.SelectObjectInPlugin(objs[0].uniqueID, true);
    }

    private OnScroll(ev: WheelEvent)
    {
        if (!this.scene.opened)
            return;

        if (this.MouseIsOnEditor(ev))
            return;

        const screen = bare.GetCanvasScreenPosition(ev.clientX, ev.clientY);
        const before = cameraHandler.ScreenToWorld(screen.x, screen.y);

        const zoomStep = 1.2; // EXPONENTIAL ZOOM FOR CONSISTENT FEEL AT ALL SCALES
        const scrollDirection = ev.deltaY > 0 ? -1 : 1;

        cameraHandler.zoom *= (scrollDirection > 0 ? zoomStep : 1 / zoomStep);
        cameraHandler.zoom = Math.max(.08, cameraHandler.zoom); // SO WE DON'T ZOOM OUT TOO MUCH AND LOSE THE CONTENT

        const after = cameraHandler.ScreenToWorld(screen.x, screen.y);
        // Keep the mouse anchored to the same world position, similar to the zoom behavior in design software and map applications.
        cameraHandler.AddPosition(before.x - after.x, before.y - after.y);
        
        ev.preventDefault();
    }

    public StartDrag(obj: GameObject)
    {
        // PREVENT SELETING THE OBJECT WHEN HAVING STAMP (CURRENTPREVIEW) AND CONTROL KEY DOWN, SO IT'S EASIER TO PLACE
        if (keyboardController.IsKeyDown("control") && this.currentPreviewActive)
            return;
        
        this.draggingObject = obj;
        this.dragOffset = mouseController.world.position.subtract(obj.position);
        
        this.actionThisFrame = 'objDrag';
    }

    public EndDrag(obj: GameObject)
    {
        if (keyboardController.IsKeyDown("control") && this.currentPreviewActive)
        {
            this.draggingObject = null;
            return;
        }

        var distMouseMoved = Helper.Distance(mouseController.world.position, mouseController.world.positionOnDown);
        if (distMouseMoved == 0)
        {
            if (keyboardController.IsKeyDown("control") && !this.currentPreviewActive)
            {
                var layerOfObj = objectController.GetLayerOf(obj);
                this.scene.editorUIHandler.SelectLayerItemByInt(layerOfObj);
                
                hitboxController.ClearExclusiveLayers();
            }

            if (this.scene.settingsData.showUI !== false)
            {
                const entity = this.scene.ConstructEntity(obj.name);
                this.scene.SelectEntity(entity);
            }

            var multiSelect = keyboardController.IsKeyDown("shift");
            this.SelectGameObjects([obj], !multiSelect);
        }
        else
        if (this.draggingObject)
        {
            //var draggingLevelEntityIsOutsideScreen = this.draggingLevelEntity.x < 0 || this.draggingLevelEntity.x > this.editorController.currentLevel.dimensions.width || this.draggingLevelEntity.y < 0 || this.draggingLevelEntity.y > this.editorController.currentLevel.dimensions.height;
            /*if (draggingLevelEntityIsOutsideScreen) {
                hitboxController.Remove(this.draggingLevelEntity.hitbox!);
                objectController.Remove(this.draggingLevelEntity);
            }*/
        }

        this.draggingObject = null;
    }

    private LayerSelected({ layerName }: BareEventPayload['editor_layerSelected']): void
    {
        this.ClearSelection();

        const layerInfo = this.scene.settingsData.layersInfo[layerName];
        const selectedLayerI = layerInfo.layerI;

        hitboxController.SetExclusiveLayer(selectedLayerI);
        
        // FADE OUT ALL OTHER LAYERS - PROBLEMS WITH ALPHA BEING ADJUSTED AND SAVED, NEED SEPARATION
        /*var allLayers = objectController.GetLayers();
        for (var i = allLayers.length - 1; i >= 0; i--)
        {
            var objs = allLayers[i];
            for (var j = objs.length - 1; j >= 0; j--)
            {
                var obj = objs[j];
                if (obj == this.currentPreviewEntity)
                    continue;
                
                obj.alpha = (i == selectedLayerI ? 1 : .5);
            }
        }*/
    }

    SetCurrentPreviewActive(active: boolean)
    {
        this.currentPreviewActive = active;
        this.currentPreviewEntity.visible = active;
        this.currentPreviewEntity.visibleInEditor = active;

        // STAMP MODE WHILE A PREVIEW ENTITY IS SELECTED, EDIT MODE OTHERWISE
        // OPTIONAL CHAINING SINCE THIS ALSO RUNS IN OUR CONSTRUCTOR, BEFORE editorUIHandler EXISTS
        this.scene.editorUIHandler?.editorUIHintHandler?.SetMode(active ? 'stamp' : 'edit');
    }

    SetCurrentPreviewEntity(entity: Entity | null)
    {
        if (!entity)
        {
            this.SetCurrentPreviewActive(false);
            return;
        }

        var entityCopy = Object.assign({}, entity);

        // THIS PREVIEW OBJECT IS JUST VISUAL, DON'T WANT ANY COMPONENTS ON IT (?)
        delete entityCopy.components;

        this.currentPreviewEntity.ResetValues();
        this.currentPreviewEntity.Init(MakePathForEntity(entityCopy));
        this.currentPreviewEntity.alpha = 0.5;
        this.currentPreviewEntity.customName = 'ignoreInPlugin';

        this.SetCurrentPreviewActive(true);

        this.currentPreviewEntity.WhenTextureLoaded(() => {
            // WILL END UP SETTING THE PIVOT CORRECTLY
            this.scene.ApplyEntityToGameObject(entityCopy, this.currentPreviewEntity);
            this.SetCurrentPreviewActive(true); // COULD HAVE BEEN SET TO VISIBLE FALSE ABOVE
            this.currentPreviewEntity.alpha = 0.5;
            this.currentPreviewEntity.customName = 'ignoreInPlugin';
        });
    }

    MouseIsOnEditor(event: PointerEvent | WheelEvent): boolean {
        return bare.MouseIsOnEditor(event);
    }

    // SNAPS EDITOR PLACEMENT TO THE GRID.
    // BY DEFAULT, THE OBJECT PIVOT CONTROLS WHICH GRID EDGE/INTERSECTION THE
    // MOUSE POSITION RESOLVES TO. WHEN editorObjectSnapToPivot IS FALSE, THE
    // OBJECT'S LOCAL 0,0 POINT RESOLVES TO THE UPPER/LEFT GRID EDGE.
    private GetGridAlignedPosition(obj: GameObject, x: number, y: number, ignoreGrid: boolean = false, guideX: number = x, guideY: number = y): Vec2
    {
        function GetPivotReferenceRect(obj: GameObject): Rectangle
        {
            if (obj.texture && obj.texture.width > 0 && obj.texture.height > 0)
                return { x: 0, y: 0, width: obj.texture.width, height: obj.texture.height };

            const hitboxRect = (obj as ArcadeObject).physicsHitbox?.rectangle;
            if (hitboxRect && hitboxRect.width > 0 && hitboxRect.height > 0)
                return hitboxRect;

            return { x: 0, y: 0, width: 0, height: 0 };
        }

        function SnapCoordinateToGrid(value: number, gridSize: number, pivotPercent: number): number
        {
            return Math.floor(value / gridSize + pivotPercent) * gridSize;
        }

        function SnapCoordinateToGridCell(value: number, gridSize: number): number
        {
            return Math.floor((value + gridSize * 0.000001) / gridSize) * gridSize;
        }

        function GetLocalPointOffset(obj: GameObject, localPoint: Vec2): Vec2
        {
            return new Vec2(
                (localPoint.x - obj.pivot.x) * obj.totalScaleX,
                (localPoint.y - obj.pivot.y) * obj.totalScaleY
            );
        }
        
        function GetSnapPivotPercent(obj: GameObject): Vec2
        {
            const rect = GetPivotReferenceRect(obj);
            if (rect.width <= 0 || rect.height <= 0)
                return new Vec2(.5, .5);

            return new Vec2(
                Helper.Clamp((obj.pivot.x - rect.x) / rect.width, 0, 1),
                Helper.Clamp((obj.pivot.y - rect.y) / rect.height, 0, 1)
            );
        }

        const settings = this.scene.settingsData.settings;
        const gridSize = settings?.gridSize;

        if (!ignoreGrid && settings?.gridEnabled && gridSize && gridSize > 0)
        {
            const pivotPercent = GetSnapPivotPercent(obj);

            if (this.scene.settingsData.editorObjectSnapToPivot === false)
            {
                const localZeroOffset = GetLocalPointOffset(obj, new Vec2(0, 0));

                return new Vec2(
                    SnapCoordinateToGridCell(guideX, gridSize) - localZeroOffset.x,
                    SnapCoordinateToGridCell(guideY, gridSize) - localZeroOffset.y
                );
            }

            return new Vec2(
                SnapCoordinateToGrid(guideX, gridSize, pivotPercent.x),
                SnapCoordinateToGrid(guideY, gridSize, pivotPercent.y)
            );
        }

        return new Vec2(x, y);
    }

    private SetEditorPosition(obj: GameObject, x: number, y: number, ignoreGrid: boolean = false): void
    {
        const position = this.GetGridAlignedPosition(obj, x, y, ignoreGrid);
        obj.SetPosition(position.x, position.y);
    }

    private PlaceCurrentPreviewObject(layer: int): GameObject
    {
        const obj = this.scene.AddGameObjectAtPosition(this.currentPreviewEntity.x, this.currentPreviewEntity.y, this.currentPreviewEntity.entity, layer);
        const multiSelect = keyboardController.IsKeyDown("shift");

        if (!multiSelect)
        {
            this.firstMultiPlacedObject = null;
            this.multiPlaceSelectionReset = false;
            this.SelectGameObjects([obj], true);
        }
        else
        if (!this.firstMultiPlacedObject)
        {
            this.firstMultiPlacedObject = obj;
            this.SelectGameObjects([obj], false);
        }
        else
        if (!this.multiPlaceSelectionReset)
        {
            this.SelectGameObjects([this.firstMultiPlacedObject, obj], true);
            this.multiPlaceSelectionReset = true;
        }
        else
        {
            this.SelectGameObjects([obj], false);
        }

        this.actionThisFrame = 'objCreation';
        return obj;
    }

    private IsMultiPlaceGridEnabled(ignoreGrid: boolean = false): boolean
    {
        const settings = this.scene.settingsData.settings;
        return !!(
            this.currentPreviewActive &&
            this.currentPreviewEntity.visible &&
            keyboardController.IsKeyDown("shift") &&
            !ignoreGrid &&
            settings?.gridEnabled &&
            settings.gridSize &&
            settings.gridSize > 0
        );
    }

    private GetCurrentPreviewPlacementKey(layer: int): string
    {
        return [
            layer,
            this.currentPreviewEntity.name,
            this.currentPreviewEntity.x.toFixed(4),
            this.currentPreviewEntity.y.toFixed(4)
        ].join(":");
    }

    private PlaceCurrentPreviewObjectOnNewGridSquare(ignoreGrid: boolean): void
    {
        if (!mouseController.IsDown())
        {
            this.lastMultiPlaceGridKey = null;
            this.firstMultiPlacedObject = null;
            this.multiPlaceSelectionReset = false;
            return;
        }

        if (!this.IsMultiPlaceGridEnabled(ignoreGrid))
            return;

        const layer = this.GetSelectedLayer();
        const placementKey = this.GetCurrentPreviewPlacementKey(layer);
        if (placementKey == this.lastMultiPlaceGridKey)
            return;

        this.PlaceCurrentPreviewObject(layer);
        this.lastMultiPlaceGridKey = placementKey;
    }

    Update(_deltaTime?: number) {
        if (!this.scene.opened)
            return;
        if (!this.active)
            return;

        var altDown = keyboardController.IsKeyDown("alt");
            
        if (this.draggingObject && Helper.Distance(mouseController.screen.position, mouseController.screen.positionOnDown) != 0)
        {
            var movedX = 0;
            var movedY = 0;
            var origPosX = this.draggingObject.x;
            var origPosY = this.draggingObject.y;

            // Calculate the desired position
            const desiredX = mouseController.world.position.x - this.dragOffset.x;
            const desiredY = mouseController.world.position.y - this.dragOffset.y;

            const guideX = this.scene.settingsData.editorObjectSnapToPivot === false
                ? mouseController.world.position.x
                : desiredX;
            const guideY = this.scene.settingsData.editorObjectSnapToPivot === false
                ? mouseController.world.position.y
                : desiredY;

            const position = this.GetGridAlignedPosition(this.draggingObject, desiredX, desiredY, altDown, guideX, guideY);
            this.draggingObject.SetPosition(position.x, position.y);

            // Calculate the distance moved
            movedX = this.draggingObject.x - origPosX;
            movedY = this.draggingObject.y - origPosY;

            var draggedEntityIsSelected = this.selectedObjects.includes(this.draggingObject);
            if (draggedEntityIsSelected)
            {
                for (var i = 0; i < this.selectedObjects.length; i++)
                {
                    const obj = this.selectedObjects[i];

                    if (obj == this.draggingObject)
                        continue;

                    obj.x += movedX;
                    obj.y += movedY;
                }
            }
            else
            {
                //this.SelectGameObjectsInRect(); // DOESN'T REALLY NEED TO HAPPEN EACH FRAME, BUT SELECTEDOBJS IS EMPTY AFTER ONE FRAME ANYWAY, CHEAP
            }
        }
        
        if (!mouseController.IsRightDown())
            if (this.currentPreviewActive)
                this.currentPreviewEntity.visibleInEditor = !(hitboxController.GetCurrentHover() && !keyboardController.IsKeyDown("control"));

        // Calculate preview position
        const previewX = mouseController.world.position.x;
        const previewY = mouseController.world.position.y;

        this.SetEditorPosition(this.currentPreviewEntity, previewX, previewY, altDown);
        this.PlaceCurrentPreviewObjectOnNewGridSquare(altDown);

        var distMouseMoved = Helper.Distance(mouseController.world.position, mouseController.world.positionOnDown);
        if (mouseController.IsRightDown() && distMouseMoved > 5) {
            var hover = hitboxController.GetCurrentHover();
            if (hover) {
                this.scene.RemoveGameObject(hover.parent);
                hitboxController.ResetCurrentHover();
                return;
            }
        }

        /*objectController.GetLayer(Layer.worldUI).sort((a, b) => {
            return a.y - b.y;
        });*/
        
        //trace(this.actionThisFrame);
    }

    PostRender()
    {
        if (!this.scene.opened)
            return;
        
        if (this.actionThisFrame == 'selectionRect')
        {
            // TRANSPARENT RECT 
            // rapid.renderRect({
            //     offset: new Vec2(this.selectionRect.x, this.selectionRect.y),
            //     width: this.selectionRect.width,
            //     height: this.selectionRect.height,
            //     points: [],
            //     color: new Color(0, 0, 0, 20),
            // });
            rapid.drawRect({
                width: this.selectionRect.width,
                height: this.selectionRect.height,
                color: new Color(0, 0, 0, 20),
                position: new Vec2(this.selectionRect.x, this.selectionRect.y),
            });
                
            const borderColor = Color.fromHex('#dda112');
            const borderWidth = 2;

            rapid.drawLine({
                points: [
                    new Vec2(this.selectionRect.x, this.selectionRect.y),
                    new Vec2(this.selectionRect.x + this.selectionRect.width, this.selectionRect.y),
                    new Vec2(this.selectionRect.x + this.selectionRect.width, this.selectionRect.y + this.selectionRect.height),
                    new Vec2(this.selectionRect.x, this.selectionRect.y + this.selectionRect.height),
                ],
                width: borderWidth,
                roundCap: false,
                color: borderColor,
                closed: true
            });
        }
    }

    OpenEditor()
    {
        objectController.Add(this.currentPreviewEntity);
        this.SetCurrentPreviewActive(false);
        this.currentPreviewEntity.alpha = 0;
    }
    
    Clear()
    {
        // BIT OF A HACK TO PERSIST COPIED OBJECTS - SINCE WE CREATE A NEW INSTANCE OF THIS OBJECT WHEN EDITOR IS OPENED AGAIN
        EditorControlsHandler.copiedObjectCached = this.copiedObjects;

        hitboxController.ClearExclusiveLayers();
        objectController.Remove(this.currentPreviewEntity);
    }
} 
