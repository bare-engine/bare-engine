import { Helper } from "../utils/helper";
import { events } from '../main';
import { Vec2 } from "../libraries/rapid-render";

export class MouseController
{
    worldMousePosition: Vec2;
    worldMousePositionPrev: Vec2;
    worldMousePositionOnDown: Vec2;
    worldMousePositionOnMiddleMouseDown: Vec2;
    
    globalMousePosition: Vec2 = new Vec2(0, 0);
    globalMousePositionPrev: Vec2 = new Vec2(0, 0);
    globalMousePositionOnDown: Vec2 = new Vec2(0, 0);

    mouseIsDown:boolean = false;
    middleMouseIsDown:boolean = false;
    rightMouseIsDown:boolean = false;

    mouseSpeed: number = 0;
    mouseSpeedDelayed: number = 0;
    mouseDirection: number = 0;
    mouseDirectionVec2: Vec2;
    mouseDirectionVecDelayedVec2:Vec2;

    mouseFramesDown: int = 0;
    mouseDownOnLeave: boolean = false;
    ignoreNextMouseUp: boolean = false;

    constructor()
    {
        this.worldMousePosition = new Vec2(-1000, -1000);
        this.worldMousePositionPrev = new Vec2(-1000, -1000);
        this.worldMousePositionOnDown = new Vec2(-1000, -1000);
        this.globalMousePositionOnDown = new Vec2(-1000, -1000);
        this.worldMousePositionOnMiddleMouseDown = new Vec2(-1000, -1000);
        
        this.mouseDirectionVec2 = new Vec2(0, 0);
        this.mouseDirectionVecDelayedVec2 = new Vec2(0, 0);
        
        events.persistent.on('mouseController_Update', this.Update.bind(this));
        //events.persistent.on('preUpdate', this.Update.bind(this));
        events.persistent.on('focusChange', this.OnFocusChange.bind(this));

        document.addEventListener('pointerdown', this.PointerDown.bind(this), { passive: false });
        document.addEventListener('pointerup', this.PointerUp.bind(this), { passive: false });
        document.addEventListener('pointermove', this.PointerMove.bind(this), { passive: false });
        document.addEventListener('pointerenter', this.PointerEnter.bind(this), { passive: false });
        document.addEventListener('pointerleave', this.PointerLeave.bind(this), { passive: false });
        document.addEventListener('dblclick', this.DoubleClick.bind(this), { passive: false });
    }

    OnFocusChange(hasFocus: boolean)
    {
        if (hasFocus)
            mouseController.ignoreNextMouseUp = true;
    }

    PointerEnter(event: PointerEvent)
    {
        if (!window.bare || !window.bare.started)
            return;

        if (this.mouseDownOnLeave)
        if (!(event.buttons & 1))
        {
            // Left button is not pressed while entering
            this.PointerUp(event);
        }

        this.mouseDownOnLeave = false;
    }

    PointerLeave(event: PointerEvent)
    {
        if (!window.bare || !window.bare.started)
            return;

        // Left button is pressed while leaving
        this.mouseDownOnLeave = (event.buttons & 1) == 1;
    }

    PointerDown(event: PointerEvent)
    {
        if (!window.bare || !window.bare.started)
            return;

        if (bare.MouseIsOnEditor(event))
            return; // don't block inputs in editor

        if (!this.IsFirstTouch(event))
            return;

        this.globalMousePositionPrev.x = this.globalMousePosition.x;
        this.globalMousePositionPrev.y = this.globalMousePosition.y;

        this.globalMousePosition.x = event.clientX;
        this.globalMousePosition.y = event.clientY;
        
        this.SetMousePosition(event.clientX, event.clientY);

        this.worldMousePositionOnDown.x = this.worldMousePosition.x;
        this.worldMousePositionOnDown.y = this.worldMousePosition.y;

        this.globalMousePositionOnDown.x = event.clientX;
        this.globalMousePositionOnDown.y = event.clientY;
        
        this.mouseFramesDown = 0;

        if (event.button == 2)
        {
            this.rightMouseIsDown = true;
        }
        if (event.button == 1)
        {
            this.middleMouseIsDown = true;
            this.worldMousePositionOnMiddleMouseDown = new Vec2(event.clientX, event.clientY);
        }

        if (event.button == 0)
            this.mouseIsDown = true;
        
        if (!bare.isPaused)
            events.emit('pointerDown', {mouseX: this.worldMousePosition.x, mouseY: this.worldMousePosition.y, event: event, isLeftButton: event.button == 0});

        if (!bare.isPaused) // game is paused when info dialog is open, bit hacky way to make text selectable
            event.preventDefault();
    }

    PointerUp(event: PointerEvent)
    {
        if (!window.bare || !window.bare.started)
            return;

        if (!this.IsFirstTouch(event))
            return;

        if (event.button == 2)
        {
            this.rightMouseIsDown = false;
        }
        if (event.button == 1)
        {
            this.middleMouseIsDown = false;
        }

        this.mouseIsDown = false;
        this.SetMousePosition(event.clientX, event.clientY);

        if (this.ignoreNextMouseUp)// REALLY ONLY DO THIS TO NOT POSSESS ATM, MOVE TO MOVEMENTCONTROLLER? TODO
        {
            this.ignoreNextMouseUp = false;

            if (this.mouseFramesDown <= 10)
                return;
        }

        if (!bare.isPaused)
            events.emit('pointerUp', {mouseX: this.worldMousePosition.x, mouseY: this.worldMousePosition.y, event: event, isLeftButton: event.button == 0});

        event.preventDefault();
    }

    // event.button IS -1 EVEN WHEN LEFT MOUSE DOWN? TODO
    PointerMove(event: PointerEvent)
    {
        if (!window.bare || !window.bare.started)
            return;

        if (!this.IsFirstTouch(event))
            return;

        this.globalMousePositionPrev.x = this.globalMousePosition.x;
        this.globalMousePositionPrev.y = this.globalMousePosition.y;

        this.globalMousePosition.x = event.clientX;
        this.globalMousePosition.y = event.clientY;

        this.SetMousePosition(event.clientX, event.clientY);

        if (!bare.isPaused)
            events.emit('pointerMove', {mouseX: this.worldMousePosition.x, mouseY: this.worldMousePosition.y, event: event, isLeftButton: event.button == 0});

        event.preventDefault();
    }

    DoubleClick(event: MouseEvent)
    {
        if (!window.bare || !window.bare.started)
            return;

        if (!bare.isPaused)
            events.emit('doubleClick', {mouseX: this.worldMousePosition.x, mouseY: this.worldMousePosition.y, event: event});
    }
    
    IsMoving()
    {
        return this.mouseSpeed > 0;
    }

    IsFirstTouch(event:PointerEvent): boolean
    {
        if (event.pointerType == 'mouse')
            return true;
        
        return (event.pointerType == 'touch' && event.isPrimary);
    }

    IsMousePressed(): boolean
    {
        return this.mouseIsDown && this.mouseFramesDown == 1;
    }

    SetMousePosition(x:number, y:number)
    {
        //trace("global", x, y);
        
        var worldPos = bare.ScreenToWorld(x, y);
        this.worldMousePosition.x = worldPos.x;
        this.worldMousePosition.y = worldPos.y;
        
        //trace("cameraPosition", bare.cameraPosition.x, bare.cameraPosition.y);
        //trace("world", this.worldMouse.x, this.worldMouse.y);
    }

    Update()
    {
        if (this.worldMousePosition.x == -1000 && this.worldMousePosition.y == -1000)
        {
            return;
        }

        if (isMobile && !mouseController.mouseIsDown)
        {
            return;
        }
        
        const moveVector = new Vec2(this.worldMousePosition.x - this.worldMousePositionPrev.x, this.worldMousePosition.y - this.worldMousePositionPrev.y);

        // Calculate speed using vector length
        this.mouseSpeed = moveVector.length();
        
        this.mouseSpeedDelayed = Helper.Interpolate(this.mouseSpeedDelayed, this.mouseSpeed, 0.3);

        this.mouseDirectionVecDelayedVec2 = Helper.InterpolateVec2(this.mouseDirectionVecDelayedVec2, this.mouseDirectionVec2, 0.3);

        // Calculate direction in degrees
        this.mouseDirection = Helper.RadiansToDegrees(Math.atan2(moveVector.y, moveVector.x));
        
        // Store direction vector
        this.mouseDirectionVec2 = moveVector;

        this.worldMousePositionPrev.x = this.worldMousePosition.x;
        this.worldMousePositionPrev.y = this.worldMousePosition.y;

        if (this.mouseIsDown)
        {
            this.mouseFramesDown++;
        }
    }
}

export const mouseController = new MouseController();