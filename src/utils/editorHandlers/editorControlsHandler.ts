import { Scene, events, MakePath, pipes } from "../../main";
import { Color, Vec2 } from "../../libraries/rapid-render";
import { GameObject } from "../../objects/gameObject";
import { Helper } from "../helper";
import { BareEvent, BareEventPayload, Entity, Layer } from "../bareTypes";
import { Rectangle } from "../gamesTypes";
import { OutlineShader } from "../shaders/outlineShader";
import { keyboardController } from "../../controllers/keyboardController";
import { hitboxController } from "../../controllers/hitboxController";
import { mouseController } from "../../controllers/mouseController";
import { cameraHandler } from "../CameraHandler";
import { PhysicsObjectBare } from "../../barePhysics";
import { EditorScene } from "../../scenes/editorScene";

/*
    BUILD CONTROLS INGAME
    Handles in-game build controls, mouse interactions, and entity placement
*/

export class EditorControlsHandler {
    public currentPreviewEntity: GameObject;
    private draggingLevelEntity: GameObject | null = null;
    private dragOffset: Vec2;
    
    private editorScene: EditorScene;

    private actionThisFrame: string = '';

    private selectionRect: Rectangle = { x: 0, y: 0, width: 0, height: 0 };

    selectedObjects: GameObject[] = [];
    copiedObjects: GameObject[] = [];

    private outlineShader = new OutlineShader();
    
    constructor(editorScene: any) {
        this.editorScene = editorScene;
        this.draggingLevelEntity = null;

        // Keyboard controls
        if (window.isLocalhost)
        document.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key.toLowerCase() == "x") {
                this.editorScene.Toggle(bare.baseSettingsHandler);
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
        events.persistent.on(BareEvent.pointer_down, this.PointerDown.bind(this));
        events.persistent.on(BareEvent.pointer_move, this.PointerMove.bind(this));
        events.persistent.on(BareEvent.pointer_up, this.PointerUp.bind(this));
        events.persistent.on(BareEvent.pointer_doubleClick, this.DoubleClick.bind(this));
        events.persistent.on(BareEvent.game_postRender, this.PostRender.bind(this));
        events.persistent.on(BareEvent.key_pressed, this.KeyPressed.bind(this));
        events.persistent.on(BareEvent.key_released, this.KeyReleased.bind(this));
        events.persistent.on(BareEvent.editor_layerSelected, this.LayerSelected.bind(this));
    }

    KeyPressed({ key, allKeys }: BareEventPayload['key_pressed'])
    {
        if (!this.editorScene.active)
            return;
        
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

            var offset = mouseController.world.position.subtract(topLeftCopiedObjects);
            //offset = new Vec2(0,0);
            
            var objsCreated: GameObject[] = [];
            const layer = this.GetSelectedLayer();
            this.copiedObjects.forEach(obj => {
                var entity = bare.ConstructEntity(obj.name);
                var objCreated = this.editorScene.AddGameObjectAtPosition(obj.x + offset.x, obj.y + offset.y, entity, layer);
                objsCreated.push(objCreated);
            });

            this.SelectGameObjects(objsCreated);

            this.editorScene.SaveLevel();
        }
    }

    KeyReleased({ key, allKeys }: BareEventPayload['key_released'])
    {
        if (!this.editorScene.active)
            return;
        
        if (key == 'control')
        {
            const layer = this.GetSelectedLayer();
            hitboxController.SetExclusiveLayer(layer);
        }
    }

    private PointerDown({ mouseX, mouseY, event, isLeftButton }: BareEventPayload['pointer_down']): void {
        if (this.MouseIsOnEditor(event))
            return;

        if (!this.editorScene.active)
            return;

        if (this.draggingLevelEntity)
        {
            return;
        }

        const layer = this.GetSelectedLayer();

        if (isLeftButton)
        {
            if (this.currentPreviewEntity && this.currentPreviewEntity.visible)
            {
                var obj = this.editorScene.AddGameObjectAtPosition(this.currentPreviewEntity.x, this.currentPreviewEntity.y, this.currentPreviewEntity.name, layer);
               
                var multiSelect = keyboardController.IsKeyDown("shift");
                this.SelectGameObjects([obj], !multiSelect);

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
            this.selectionRect.width = w;
            this.selectionRect.height = h;

            this.actionThisFrame = 'selectionRect';
        }
    }
    
    private PointerMove({ mouseX, mouseY, event }: BareEventPayload['pointer_move']): void {
        if (!this.editorScene.active)
            return;

        if (mouseController.IsMiddleMouseDown()) {
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

    private PointerUp({ mouseX, mouseY, event, isLeftButton }: BareEventPayload['pointer_up']): void
    {
        if (!this.editorScene.active)
            return;

        if (this.actionThisFrame == 'selectionRect')
        {
            this.SelectGameObjectsInRect(this.selectionRect);
        }

        this.selectionRect.width = 0;
        this.selectionRect.height = 0;
            
        this.actionThisFrame = '';

        if (!this.editorScene.active)
            return;

        if (!(event.button == 0 || event.button == 2))
            return;
        
        this.editorScene.SaveLevel();
    }
    
    private DoubleClick({ mouseX, mouseY, event }: BareEventPayload['pointer_doubleClick']): void
    {
        if (!this.editorScene.active)
            return;
        
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

        var multiSelect = keyboardController.IsKeyDown("shift");
        this.SelectGameObjects(objsToSelect, !multiSelect);
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

        // IF SINGLE OBJECT SELECTED, SELECT IN PLUGIN
        if (objs.length == 1)
            globalThis.plugin?.SelectObjectInPlugin(objs[0].uniqueID, true);
    }

    private OnScroll(ev: WheelEvent)
    {
        if (!this.editorScene.active)
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
        this.dragOffset = mouseController.world.position.subtract(obj.position);
        
        this.actionThisFrame = 'objDrag';
    }

    public EndDrag(obj: GameObject)
    {
        if (keyboardController.IsKeyDown("control") && this.currentPreviewEntity.visible)
        {
            this.draggingLevelEntity = null;
            return;
        }

        var distMouseMoved = Helper.Distance(mouseController.world.position, mouseController.world.positionOnDown);
        if (distMouseMoved == 0)
        {
            if (keyboardController.IsKeyDown("control") && !this.currentPreviewEntity.visible)
            {
                var layerOfObj = objectController.GetObjectLayer(obj);
                this.editorScene.editorUIHandler.SelectLayerItemByInt(layerOfObj);
                
                hitboxController.ClearExclusiveLayers();
            }

            //const entitySource = obj.levelEntity ?? { name: obj.name };
            //const entity = bare.ConstructEntity(entitySource);
            if (bare.currentSettings.showUI !== false)
            {
                const entity = bare.ConstructEntity(obj.name);
                this.editorScene.SelectEntity(entity);
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

    private LayerSelected({ layerName }: BareEventPayload['editor_layerSelected']): void
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

    Update(_deltaTime?: number) {
        if (!this.editorScene.active)
            return;

        if (this.draggingLevelEntity)
        {
            var movedX = 0;
            var movedY = 0;
            var origPosX = this.draggingLevelEntity.x;
            var origPosY = this.draggingLevelEntity.y;

            // Calculate the desired position
            const desiredX = mouseController.world.position.x - this.dragOffset.x;
            const desiredY = mouseController.world.position.y - this.dragOffset.y;

            if (this.editorScene.gridActive)
            {
                // Snap to grid
                const gridSize = this.editorScene.gridSize;
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
        
        if (!mouseController.IsRightMouseDown())
            if (this.currentPreviewEntity.visible)
                this.currentPreviewEntity.alpha = (hitboxController.GetCurrentHitboxHover() && !keyboardController.IsKeyDown("control")) ? 0 : 0.5;

        // Calculate preview position
        const previewX = mouseController.world.position.x;
        const previewY = mouseController.world.position.y;

        if (this.editorScene.gridActive) {
            // Snap preview entity to grid
            const gridSize = this.editorScene.gridSize;
            const snappedPreviewX = Math.round(previewX / gridSize) * gridSize;
            const snappedPreviewY = Math.round(previewY / gridSize) * gridSize;
            this.currentPreviewEntity.SetPosition(snappedPreviewX, snappedPreviewY);
        } else {
            // Preview follows mouse freely
            this.currentPreviewEntity.SetPosition(previewX, previewY);
        }

        var distMouseMoved = Helper.Distance(mouseController.world.position, mouseController.world.positionOnDown);
        if (mouseController.IsRightMouseDown() && distMouseMoved > 5) {
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
        if (!this.editorScene.active)
            return;
        
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
