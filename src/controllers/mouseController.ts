import { BareEvent } from '../types/bareTypes';
import { Helper } from "../utils/helper";
import { globalEvents, pipes } from "../main";
import { Vec2 } from "../libraries/rapid-render";
import { sceneController } from './sceneController';

type MouseSpace = {
    position: Vec2;
    positionPrev: Vec2;
    positionOnDown: Vec2;
    positionOnMiddleDown: Vec2;
    positionOnRightDown: Vec2;
};

export class MouseController
{
    screen: MouseSpace = {
        position: new Vec2(0, 0),
        positionPrev: new Vec2(0, 0),
        positionOnDown: new Vec2(-1000, -1000),
        positionOnMiddleDown: new Vec2(-1000, -1000),
        positionOnRightDown: new Vec2(-1000, -1000),
    };

    world: MouseSpace = {
        position: new Vec2(-1000, -1000),
        positionPrev: new Vec2(-1000, -1000),
        positionOnDown: new Vec2(-1000, -1000),
        positionOnMiddleDown: new Vec2(-1000, -1000),
        positionOnRightDown: new Vec2(-1000, -1000),
    };

    private mouseIsDown:boolean = false;
    private middleMouseIsDown:boolean = false;
    private rightMouseIsDown:boolean = false;

    mouseFramesDown: number = 0;

    mouseSpeed: number = 0;
    mouseSpeedDelayed: number = 0;
    mouseDirection: number = 0;
    mouseDirectionVec2: Vec2 = new Vec2(0, 0);
    mouseDirectionVec2Delayed:Vec2 = new Vec2(0, 0);

    delayFactor: number = .3;

    IsMouseDown(): boolean { return this.mouseIsDown; }
    IsMiddleMouseDown(): boolean { return this.middleMouseIsDown; }
    IsRightMouseDown(): boolean { return this.rightMouseIsDown; }

    private mouseDownOnLeave: boolean = false;

    constructor()
    {
        pipes.set("mouseController_Update", this.Update.bind(this));

        document.addEventListener('pointerdown', this.PointerDown.bind(this), { passive: false });
        document.addEventListener('pointerup', this.PointerUp.bind(this), { passive: false });
        document.addEventListener('pointermove', this.PointerMove.bind(this), { passive: false });
        document.addEventListener('pointerenter', this.PointerEnter.bind(this), { passive: false });
        document.addEventListener('pointerleave', this.PointerLeave.bind(this), { passive: false });
        document.addEventListener('dblclick', this.DoubleClick.bind(this), { passive: false });
    }

    PointerEnter(event: PointerEvent)
    {
        if (!window.bare || !window.bare.started)
            return;

        if (this.mouseDownOnLeave)
        if (!(event.buttons & 1))
        {
            this.PointerUp(event);
        }

        this.mouseDownOnLeave = false;
    }

    PointerLeave(event: PointerEvent)
    {
        if (!window.bare || !window.bare.started)
            return;

        this.mouseDownOnLeave = (event.buttons & 1) == 1;
    }

    PointerDown(event: PointerEvent)
    {
        if (!window.bare || !window.bare.started)
            return;

        if (bare.MouseIsOnEditor(event))
            return;

        if (!this.IsFirstTouch(event))
            return;

        this.screen.positionPrev.x = this.screen.position.x;
        this.screen.positionPrev.y = this.screen.position.y;

        this.screen.position.x = event.clientX;
        this.screen.position.y = event.clientY;

        this.SetMousePosition(event.clientX, event.clientY);

        if (event.button == 0)
        {
            this.world.positionOnDown.x = this.world.position.x;
            this.world.positionOnDown.y = this.world.position.y;

            this.screen.positionOnDown.x = event.clientX;
            this.screen.positionOnDown.y = event.clientY;

            this.mouseFramesDown = 0;
            this.mouseIsDown = true;
        }

        if (event.button == 1)
        {
            this.middleMouseIsDown = true;

            this.world.positionOnMiddleDown.x = this.world.position.x;
            this.world.positionOnMiddleDown.y = this.world.position.y;

            this.screen.positionOnMiddleDown.x = event.clientX;
            this.screen.positionOnMiddleDown.y = event.clientY;
        }

        if (event.button == 2)
        {
            this.rightMouseIsDown = true;

            this.world.positionOnRightDown.x = this.world.position.x;
            this.world.positionOnRightDown.y = this.world.position.y;

            this.screen.positionOnRightDown.x = event.clientX;
            this.screen.positionOnRightDown.y = event.clientY;
        }

        if (!bare.isPaused)
            bareEngine.SendEvent(BareEvent.pointer_down, {mouseX: this.world.position.x, mouseY: this.world.position.y, event: event, isLeftButton: event.button == 0});
            
        if (!bare.isPaused)
            event.preventDefault();
    }

    PointerUp(event: PointerEvent)
    {
        if (!window.bare || !window.bare.started)
            return;

        if (!this.IsFirstTouch(event))
            return;

        if (event.button == 2)
            this.rightMouseIsDown = false;

        if (event.button == 1)
            this.middleMouseIsDown = false;

        if (event.button == 0)
            this.mouseIsDown = false;

        this.SetMousePosition(event.clientX, event.clientY);

        if (!bare.isPaused)
            bareEngine.SendEvent(BareEvent.pointer_up, {mouseX: this.world.position.x, mouseY: this.world.position.y, event: event, isLeftButton: event.button == 0});

        event.preventDefault();
    }

    PointerMove(event: PointerEvent)
    {
        if (!window.bare || !window.bare.started)
            return;

        if (!this.IsFirstTouch(event))
            return;

        this.screen.positionPrev.x = this.screen.position.x;
        this.screen.positionPrev.y = this.screen.position.y;

        this.screen.position.x = event.clientX;
        this.screen.position.y = event.clientY;

        this.SetMousePosition(event.clientX, event.clientY);

        if (!bare.isPaused)
            bareEngine.SendEvent(BareEvent.pointer_move, {mouseX: this.world.position.x, mouseY: this.world.position.y, event: event, isLeftButton: event.button == 0});

        event.preventDefault();
    }

    DoubleClick(event: MouseEvent)
    {
        if (!window.bare || !window.bare.started)
            return;

        if (!bare.isPaused)
            bareEngine.SendEvent(BareEvent.pointer_doubleClick, {mouseX: this.world.position.x, mouseY: this.world.position.y, event: event});
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
        const worldPos = bare.ScreenToWorld(x, y);
        this.world.position.x = worldPos.x;
        this.world.position.y = worldPos.y;
    }

    Update(_deltaTime?: number)
    {
        if (this.world.position.x == -1000 && this.world.position.y == -1000)
            return;

        if (isMobile && !this.mouseIsDown)
            return;

        const moveVector = new Vec2(
            this.world.position.x - this.world.positionPrev.x,
            this.world.position.y - this.world.positionPrev.y
        );

        this.mouseSpeed = moveVector.length();
        this.mouseSpeedDelayed = Helper.Interpolate(this.mouseSpeedDelayed, this.mouseSpeed, this.delayFactor);
        this.mouseDirection = Helper.RadiansToDegrees(Math.atan2(moveVector.y, moveVector.x));
        this.mouseDirectionVec2 = moveVector;
        this.mouseDirectionVec2Delayed = Helper.InterpolateVec2(this.mouseDirectionVec2Delayed, this.mouseDirectionVec2, this.delayFactor);

        this.world.positionPrev.x = this.world.position.x;
        this.world.positionPrev.y = this.world.position.y;

        if (this.mouseIsDown)
            this.mouseFramesDown++;
    }
}

export const mouseController = new MouseController();
