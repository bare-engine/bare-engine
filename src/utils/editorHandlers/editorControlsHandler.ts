import { BareGame, events, MakePath } from "../../main";
import { Color, Vec2 } from "../../libraries/rapid-render";
import { GameObject } from "../../objects/gameObject";
import { Helper } from "../helper";
import { Entity, Events, Layer } from "../bareTypes";
import { EditorController } from "../../controllers/editorController";
import { Rectangle } from "../gamesTypes";
import { OutlineShader } from "../shaders/outlineShader";
import { keyboardController } from "../../controllers/keyboardController";
import { hitboxController } from "../../controllers/hitboxController";
import { mouseController } from "../../controllers/mouseController";
import { cameraHandler } from "../CameraHandler";
import { PhysicsObjectBare } from "../../barePhysics";

/*
    BUILD CONTROLS INGAME
    Handles in-game build controls, mouse interactions, and entity placement
*/

export class EditorControlsHandler {
    public currentPreviewEntity: GameObject;
    private draggingLevelEntity: GameObject | null = null;
    private dragOffset: Vec2;
    
    private editorController: EditorController;

    private actionThisFrame: string = '';

    private selectionRect: Rectangle = { x: 0, y: 0, width: 0, height: 0 };

    selectedObjects: GameObject[] = [];
    copiedObjects: GameObject[] = [];

    private outlineShader = new OutlineShader();
    
    constructor(editorController: any) {
        this.editorController = editorController;
        this.draggingLevelEntity = null;

        // Keyboard controls
        if (window.isLocalhost)
        document.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key.toLowerCase() == "x") {
                this.editorController.Toggle(bare.initialSettingsHandler);
            }
        }, { passive: false });

        this.currentPreviewEntity = new PhysicsObjectBare(-100, -100);
        this.currentPreviewEntity.name = 'currentPreviewEntity';
        this.currentPreviewEntity.customName = 'ignoreInPlugin';
        this.currentPreviewEntity.visible = false;

        this.init();

        window.addEventListener('wheel', this.OnScroll.bind(this), { passive: false });  // THIS DOESN'T REMOVE LISTENER, JUST CHECKS FOR editorController.active
    }

    init()
    {
        events.persistent.on('editorController_Update', this.Update.bind(this));
        events.persistent.on('pointerDown', this.PointerDown.bind(this));
        events.persistent.on('pointerMove', this.PointerMove.bind(this));
        events.persistent.on('pointerUp', this.PointerUp.bind(this));
        events.persistent.on('doubleClick', this.DoubleClick.bind(this));
        events.persistent.on('postRender', this.PostRender.bind(this));
        events.persistent.on('keyPressed', this.KeyPressed.bind(this));
        events.persistent.on('keyReleased', this.KeyReleased.bind(this));
        events.persistent.on('editor_layerSelected', this.LayerSelected.bind(this));
    }

    KeyPressed({ key, allKeys }: Events['keyPressed'])
    {
        if (allKeys[0] == 'control')
        {
            hitboxController.ClearExclusiveLayers();
        }
        if (allKeys[0] == 'control' && allKeys[1] == 'c')
        {
            this.copiedObjects = this.selectedObjects.slice();
        }
        if (allKeys[0] == 'control' && allKeys[1] == 'v')
        {
            var topLeftCopiedObjects = new Vec2(Number.MAX_VALUE, Number.MAX_VALUE);
            this.copiedObjects.forEach(obj => {
                if (obj.x - obj.pivot.x < topLeftCopiedObjects.x)
                    topLeftCopiedObjects.x = obj.x - obj.pivot.x;
                if (obj.y - obj.pivot.y < topLeftCopiedObjects.y)
                    topLeftCopiedObjects.y = obj.y - obj.pivot.y;
            });

            var offset = mouseController.worldMousePosition.subtract(topLeftCopiedObjects);
            //offset = new Vec2(0,0);
            
            var objsCreated: GameObject[] = [];
            const layer = this.GetSelectedLayer();
            this.copiedObjects.forEach(obj => {
                var entity = bare.ConstructEntity(obj.name);
                var objCreated = this.editorController.levelFunctionality.AddGameObjectAtPosition(obj.x + offset.x, obj.y + offset.y, entity, layer);
                objsCreated.push(objCreated);
            });

            this.SelectGameObjects(objsCreated);

            this.editorController.SaveLevel();
        }
    }

    KeyReleased({ key, allKeys }: Events['keyReleased'])
    {
        if (key == 'control')
        {
            const layer = this.GetSelectedLayer();
            hitboxController.SetExclusiveLayer(layer);
        }
    }

    private PointerDown({ mouseX, mouseY, event, isLeftButton }: Events['pointerDown']): void {
        if (this.MouseIsOnEditor(event))
            return;

        if (!this.editorController.active)
            return;

        if (isLeftButton)
        if (isLeftButton && bare.currentSettings.selectionEnabled !== false)
            bare.plugin?.CheckClickGameObject(event, false);

        if (this.draggingLevelEntity)
            return;

        const layer = this.GetSelectedLayer();

        if (isLeftButton)
        {
            if (this.currentPreviewEntity && this.currentPreviewEntity.visible)
            {
                var obj = this.editorController.levelFunctionality.AddGameObjectAtPosition(this.currentPreviewEntity.x, this.currentPreviewEntity.y, this.currentPreviewEntity.name, layer);
               
                var multiSelect = keyboardController.IsKeyDown("shift");
                this.SelectGameObjects([obj], !multiSelect);

                if (bare.currentSettings.selectionEnabled !== false)
                    bare.plugin?.CheckClickGameObject(event, false); // SELECTS OBJ IN PLUGIN (BIT ROUNDABOUT)

                this.actionThisFrame = 'objCreation';
            }
        }
        else
        {
            var isRightButton = (event.button == 2);

            if (isRightButton)
            {
                var hover = hitboxController.GetCurrentHitboxHover();
                if (hover)
                {
                    bare.RemoveGameObject(hover.parent);

                    // ALSO REMOVE OTHER SELECTED ENTITIES
                    var draggedEntityIsSelected = this.selectedObjects.includes(hover.parent);
                    if (draggedEntityIsSelected)
                    {
                        for (var i = 0; i < this.selectedObjects.length; i++)
                        {
                            const obj = this.selectedObjects[i];

                            if (obj == hover.parent)
                                continue;

                            bare.RemoveGameObject(obj);
                        }
                    }

                    hitboxController.ResetCurrentHover();
        
                    this.actionThisFrame = 'objRemoval';
                }
                else
                {
                    if (this.currentPreviewEntity)
                    {
                        this.currentPreviewEntity.visible = false;
                        this.currentPreviewEntity.alpha = 0;
                    }
                }
            }
        }
        
        if (isLeftButton && this.actionThisFrame == '' && bare.currentSettings.selectionEnabled !== false)
        {
            var w = mouseController.worldMousePosition.x - mouseController.worldMousePositionOnDown.x;
            var h = mouseController.worldMousePosition.y - mouseController.worldMousePositionOnDown.y;
            var x = mouseController.worldMousePositionOnDown.x;
            var y = mouseController.worldMousePositionOnDown.y;

            // MAKE SURE RECT X/Y IS ALWAYS AT TOP LEFT
            if (w < 0)
                x += w;
            if (h < 0)
                y += h;

            this.selectionRect.x = x;
            this.selectionRect.y = y;
            this.selectionRect.width = w;
            this.selectionRect.height = h;

            this.actionThisFrame = 'selectionRect';
        }
    }
    
    private PointerMove({ mouseX, mouseY, event }: Events['pointerMove']): void {
        if (mouseController.middleMouseIsDown) {
            var deltaMovedMiddleMouse = mouseController.globalMousePosition.subtract(mouseController.globalMousePositionPrev);
            var zoom = cameraHandler.GetCameraZoom();
            cameraHandler.AddCameraPosition(-deltaMovedMiddleMouse.x /zoom, -deltaMovedMiddleMouse.y / zoom);
        }

        var w = mouseController.worldMousePosition.x - mouseController.worldMousePositionOnDown.x;
        var h = mouseController.worldMousePosition.y - mouseController.worldMousePositionOnDown.y;
        var x = mouseController.worldMousePositionOnDown.x;
        var y = mouseController.worldMousePositionOnDown.y;

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

    private PointerUp({ mouseX, mouseY, event, isLeftButton }: Events['pointerUp']): void
    {
        if (this.actionThisFrame == 'selectionRect')
        {
            this.SelectGameObjectsInRect(this.selectionRect);
        }

        this.selectionRect.width = 0;
        this.selectionRect.height = 0;
            
        this.actionThisFrame = '';

        if (!this.editorController.active)
            return;

        if (!(event.button == 0 || event.button == 2))
            return;
        
        this.editorController.SaveLevel();
    }

    private DoubleClick({ mouseX, mouseY, event}: Events['doubleClick']): void
    {
        var multiSelect = keyboardController.IsKeyDown("shift");
        if (multiSelect)
            return;

        var hitbox = hitboxController.GetCurrentHitboxHover();
        if (hitbox)
        {
            var obj = hitbox.parent;

            const entity = bare.ConstructEntity(obj.name);

            if (entity.name != this.currentPreviewEntity.name || !this.currentPreviewEntity.visible)
                this.SetCurrentPreviewEntity(entity);
            else
                this.SetCurrentPreviewEntity(null);
        }
    }

    GetSelectedLayer(): int
    {
        const selectedLayer = document.querySelector('.selected-layer');
        const layerName = selectedLayer?.id;
        const layer = Object.values(bare.layerInfos).find(layer => layer.name == layerName)!;

        return layer?.layerI;
    }

    SelectGameObjectsInRect(rect: Rectangle = {x: 0, y: 0, width: 0, height: 0})
    {
        var selectedLayer = document.querySelector('.selected-layer')!;
        var layerName = selectedLayer.id;
        var objs = objectController.GetLayerByName(layerName);

        if (keyboardController.IsKeyDown("control"))
            objs = objectController.GetAllObjects();

        var objsToSelect: GameObject[] = [];

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

        this.SelectGameObjects(objsToSelect);
    }

    ClearSelection()
    {
        for (var i = this.selectedObjects.length - 1; i >= 0; i--)
        {
            var obj = this.selectedObjects[i];
            obj.color = new Color(255, 255, 255, 255);

            this.outlineShader.stop(obj);
            obj.shaders.splice(obj.shaders.indexOf(this.outlineShader), 1);
        }

        this.selectedObjects.length = 0;
    }

    SelectGameObjects(objs: GameObject[], clearPrevious: boolean = true)
    {
        if (bare.currentSettings.selectionEnabled === false)
            return;

        // CLEAR PREVIOUS
        if (clearPrevious)
            this.ClearSelection();

        // SELECT NEW
        for (var i = objs.length - 1; i >= 0; i--)
        {
            var obj = objs[i];

            // DESELECT IF ALREADY SELECTED
            if (this.selectedObjects.includes(obj))
            {
                obj.color = new Color(255, 255, 255, 255);
                this.outlineShader.stop(obj);
                obj.shaders.splice(obj.shaders.indexOf(this.outlineShader), 1);
                
                this.selectedObjects.splice(this.selectedObjects.indexOf(obj), 1);

                continue;
            }
            
            this.outlineShader.start(obj, [1.0, 1.0, 1.0, 1.0], 8.0);
            obj.shaders.push(this.outlineShader);

            //obj.color = Color.fromHex('#707070ff');
            this.selectedObjects.push(obj);
        }
    }

    private OnScroll(ev: WheelEvent)
    {
        if (!this.editorController.active)
            return;

        if (this.MouseIsOnEditor(ev))
            return;

        const zoomStep = 1.2; // EXPONENTIAL ZOOM FOR CONSISTENT FEEL AT ALL SCALES
        const scrollDirection = ev.deltaY > 0 ? -1 : 1;

        cameraHandler.zoom *= (scrollDirection > 0 ? zoomStep : 1 / zoomStep);
        cameraHandler.zoom = Math.max(.08, cameraHandler.zoom); // SO WE DON'T ZOOM OUT TOO MUCH AND LOSE THE CONTENT
    
        ev.preventDefault();
    }

    public StartDrag(obj: GameObject)
    {
        // PREVENT SELETING THE OBJECT WHEN HAVING STAMP (CURRENTPREVIEW) AND CONTROL KEY DOWN, SO IT'S EASIER TO PLACE
        if (keyboardController.IsKeyDown("control") && this.currentPreviewEntity.visible)
            return;
        
        this.draggingLevelEntity = obj;
        this.dragOffset = mouseController.worldMousePosition.subtract(obj.position);
        
        this.actionThisFrame = 'objDrag';
    }

    public EndDrag(obj: GameObject)
    {
        if (keyboardController.IsKeyDown("control") && this.currentPreviewEntity.visible)
        {
            this.draggingLevelEntity = null;
            return;
        }

        var distMouseMoved = Helper.Distance(mouseController.worldMousePosition, mouseController.worldMousePositionOnDown);
        if (distMouseMoved == 0)
        {
            if (keyboardController.IsKeyDown("control") && !this.currentPreviewEntity.visible)
            {
                var layerOfObj = objectController.GetObjectLayer(obj);
                this.editorController.editorUIHandler.SelectLayerItemByInt(layerOfObj);
                
                hitboxController.ClearExclusiveLayers();
            }

            //const entitySource = obj.levelEntity ?? { name: obj.name };
            //const entity = bare.ConstructEntity(entitySource);
            if (bare.currentSettings.showUI !== false)
            {
                const entity = bare.ConstructEntity(obj.name);
                this.editorController.SelectEntity(entity);
            }

            var multiSelect = keyboardController.IsKeyDown("shift");
            this.SelectGameObjects([obj], !multiSelect);
        }
        else
        if (this.draggingLevelEntity)
        {
            //var draggingLevelEntityIsOutsideScreen = this.draggingLevelEntity.x < 0 || this.draggingLevelEntity.x > this.editorController.currentLevel.dimensions.width || this.draggingLevelEntity.y < 0 || this.draggingLevelEntity.y > this.editorController.currentLevel.dimensions.height;
            /*if (draggingLevelEntityIsOutsideScreen) {
                hitboxController.Remove(this.draggingLevelEntity.hitbox!);
                objectController.Remove(this.draggingLevelEntity);
            }*/
        }

        this.draggingLevelEntity = null;
    }

    private LayerSelected({ layerName }: Events['editor_layerSelected']): void
    {
        this.ClearSelection();

        const selectedLayerI = Object.values(bare.layerInfos).find(layer => layer.name == layerName)!.layerI;

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

    SetCurrentPreviewEntity(entity: Entity | null) {
        if (!entity) {
            this.currentPreviewEntity.visible = false;
            return;
        }

        var entityCopy = Object.assign({}, entity);

        // THIS PREVIEW OBJECT IS JUST VISUAL, DON'T WANT ANY COMPONENTS ON IT
        delete entityCopy.components;
        delete entityCopy.editorComponents;

        this.currentPreviewEntity.Init(MakePath(entityCopy.imagePath!, entityCopy.name));
        this.currentPreviewEntity.alpha = 0.5;
        this.currentPreviewEntity.visible = true;

        this.currentPreviewEntity.WhenTextureLoaded(() => {
            // WILL END UP SETTING THE PIVOT CORRECTLY
            bare.ApplyEntityToGameObject(entityCopy, this.currentPreviewEntity);
        });
    }

    MouseIsOnEditor(event: PointerEvent | WheelEvent): boolean {
        return bare.MouseIsOnEditor(event);
    }

    Update() {
        if (!this.editorController.active)
            return;

        if (this.draggingLevelEntity)
        {
            var movedX = 0;
            var movedY = 0;
            var origPosX = this.draggingLevelEntity.x;
            var origPosY = this.draggingLevelEntity.y;

            // Calculate the desired position
            const desiredX = mouseController.worldMousePosition.x - this.dragOffset.x;
            const desiredY = mouseController.worldMousePosition.y - this.dragOffset.y;

            if (this.editorController.gridActive)
            {
                // Snap to grid
                const gridSize = this.editorController.gridSize;
                const snappedX = Math.round(desiredX / gridSize) * gridSize;
                const snappedY = Math.round(desiredY / gridSize) * gridSize;
                this.draggingLevelEntity.SetPosition(snappedX, snappedY);
            }
            else
            {
                // DRAG FREELY
                this.draggingLevelEntity.SetPosition(desiredX, desiredY);
            }

            // Calculate the distance moved
            movedX = this.draggingLevelEntity.x - origPosX;
            movedY = this.draggingLevelEntity.y - origPosY;

            var draggedEntityIsSelected = this.selectedObjects.includes(this.draggingLevelEntity);
            if (draggedEntityIsSelected)
            {
                for (var i = 0; i < this.selectedObjects.length; i++)
                {
                    const obj = this.selectedObjects[i];

                    if (obj == this.draggingLevelEntity)
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
        
        if (!mouseController.rightMouseIsDown)
            if (this.currentPreviewEntity.visible)
                this.currentPreviewEntity.alpha = (hitboxController.GetCurrentHitboxHover() && !keyboardController.IsKeyDown("control")) ? 0 : 0.5;

        // Calculate preview position
        const previewX = mouseController.worldMousePosition.x;
        const previewY = mouseController.worldMousePosition.y;

        if (this.editorController.gridActive) {
            // Snap preview entity to grid
            const gridSize = this.editorController.gridSize;
            const snappedPreviewX = Math.round(previewX / gridSize) * gridSize;
            const snappedPreviewY = Math.round(previewY / gridSize) * gridSize;
            this.currentPreviewEntity.SetPosition(snappedPreviewX, snappedPreviewY);
        } else {
            // Preview follows mouse freely
            this.currentPreviewEntity.SetPosition(previewX, previewY);
        }

        var distMouseMoved = Helper.Distance(mouseController.worldMousePosition, mouseController.worldMousePositionOnDown);
        if (mouseController.rightMouseIsDown && distMouseMoved > 5) {
            var hover = hitboxController.GetCurrentHitboxHover();
            if (hover) {
                bare.RemoveGameObject(hover.parent);
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
        if (this.actionThisFrame == 'selectionRect')
        {
            // TRANSPARENT RECT 
            rapid.renderRect({
                offset: new Vec2(this.selectionRect.x, this.selectionRect.y),
                width: this.selectionRect.width,
                height: this.selectionRect.height,
                points: [],
                color: new Color(0, 0, 0, 20),
            });
                
            const borderColor = Color.fromHex('#dda112');
            const borderWidth = 2;

            // TOP EDGE
            rapid.renderLine({
                points: [
                    new Vec2(this.selectionRect.x, this.selectionRect.y),
                    new Vec2(this.selectionRect.x + this.selectionRect.width, this.selectionRect.y),
                ],
                width: borderWidth,
                roundCap: false,
                color: borderColor,
            });

            // RIGHT EDGE
            rapid.renderLine({
                points: [
                    new Vec2(this.selectionRect.x + this.selectionRect.width, this.selectionRect.y),
                    new Vec2(this.selectionRect.x + this.selectionRect.width, this.selectionRect.y + this.selectionRect.height),
                ],
                width: borderWidth,
                roundCap: false,
                color: borderColor,
            });

            // BOTTOM EDGE
            rapid.renderLine({
                points: [
                    new Vec2(this.selectionRect.x + this.selectionRect.width, this.selectionRect.y + this.selectionRect.height),
                    new Vec2(this.selectionRect.x, this.selectionRect.y + this.selectionRect.height),
                ],
                width: borderWidth,
                roundCap: false,
                color: borderColor,
            });

            // LEFT EDGE
            rapid.renderLine({
                points: [
                    new Vec2(this.selectionRect.x, this.selectionRect.y + this.selectionRect.height),
                    new Vec2(this.selectionRect.x, this.selectionRect.y),
                ],
                width: borderWidth,
                roundCap: false,
                color: borderColor,
            });
        }
    }

    OpenEditor()
    {
        objectController.Add(this.currentPreviewEntity, Layer.OBJECTS);
        this.currentPreviewEntity.visible = false;
        this.currentPreviewEntity.alpha = 0;
    }
    
    Close()
    {
        hitboxController.ClearExclusiveLayers();

        objectController.Remove(this.currentPreviewEntity, Layer.OBJECTS);
    }
} 
