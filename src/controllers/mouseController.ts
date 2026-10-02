import { Vec2 } from "../libraries/rapid-render";
import { Scene } from '../scenes/scene';
import { BareEvent, BareEventPayload } from '../types/bareTypes';
import { Helper } from "../utils/helper";
import { RegisterController } from '../globals';
import { InspectorField } from "../utils/decorators";

type MouseSpace = {
    position: Vec2;
    positionPrev: Vec2;
    positionOnDown: Vec2;
    positionOnMiddleDown: Vec2;
    positionOnRightDown: Vec2;
};

export class MouseController
{
    @InspectorField
    private get mouseScreenPosition(): Vec2 { return this.screen.position; }

    @InspectorField
    private get mouseWorldPosition(): Vec2 { return this.world.position; }
    
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
    private pointersDown = new Set<number>();
    private middleMouseIsDown:boolean = false;
    private rightMouseIsDown:boolean = false;

    mouseFramesDown: number = 0;

    mouseSpeed: number = 0;
    mouseSpeedDelayed: number = 0;
    mouseDirection: number = 0;
    mouseDirectionVec2: Vec2 = new Vec2(0, 0);
    mouseDirectionVec2Delayed:Vec2 = new Vec2(0, 0);

    delayFactor: number = .3;

    static lastMouseX: number = -10000;
    static lastMouseY: number = -10000;

    IsDown(): boolean { return this.mouseIsDown; }
    IsMiddleDown(): boolean { return this.middleMouseIsDown; }
    IsRightDown(): boolean { return this.rightMouseIsDown; }

    public scene: Scene;

    constructor(scene: Scene)
    {
        this.scene = scene;
        
        // MOVED HERE FROM Start(), SINCE IT NEEDS TO BE THE FIRST POINTER EVENT THAT FIRES
        bare.events.persistent.on(BareEvent.pointer_down, this.PointerDown.bind(this));
        bare.events.persistent.on(BareEvent.pointer_down_any, this.PointerDownAny.bind(this));
        bare.events.persistent.on(BareEvent.pointer_move, this.PointerMove.bind(this));
        bare.events.persistent.on(BareEvent.pointer_up, this.PointerUp.bind(this));
        bare.events.persistent.on(BareEvent.pointer_up_any, this.PointerUpAny.bind(this));
    }

    Start()
    {
        // SET MOUSE POSITION TO LAST KNOW POSITION
        // THIS IS NEEDED AFTER A SCENE SWITCH, SO THE VALUES ARE UP TO TO DATE
        // SO WE DON'T HAVE TO WAIT ON THE NEXT MOUSE MOVE
        if (MouseController.lastMouseX != -10000)
        {
            this.screen.position.x = MouseController.lastMouseX;
            this.screen.position.y = MouseController.lastMouseY;
            this.SetPosition(MouseController.lastMouseX, MouseController.lastMouseY);
        }
    }

    PointerDownAny({ mouseX, mouseY, event }: BareEventPayload['pointer_down_any']): void
    {
        if (!this.scene.started)
            return;
        
        const screenPosition = new Vec2(mouseX, mouseY);
        
        if (event.button == 1)
        {
            this.middleMouseIsDown = true;

            this.world.positionOnMiddleDown.x = this.world.position.x;
            this.world.positionOnMiddleDown.y = this.world.position.y;

            this.screen.positionOnMiddleDown.x = screenPosition.x;
            this.screen.positionOnMiddleDown.y = screenPosition.y;
        }

        if (event.button == 2)
        {
            this.rightMouseIsDown = true;

            this.world.positionOnRightDown.x = this.world.position.x;
            this.world.positionOnRightDown.y = this.world.position.y;

            this.screen.positionOnRightDown.x = screenPosition.x;
            this.screen.positionOnRightDown.y = screenPosition.y;
        }
    }

    PointerDown({ mouseX, mouseY, event }: BareEventPayload['pointer_down']): void
    {
        if (!this.scene.started)
            return;
        
        const screenPosition = new Vec2(mouseX, mouseY);

        this.screen.positionPrev.x = this.screen.position.x;
        this.screen.positionPrev.y = this.screen.position.y;

        this.screen.position.x = screenPosition.x;
        this.screen.position.y = screenPosition.y;

        this.SetPosition(this.screen.position.x, this.screen.position.y);

        this.world.positionOnDown.x = this.world.position.x;
        this.world.positionOnDown.y = this.world.position.y;

        this.screen.positionOnDown.x = this.screen.position.x;
        this.screen.positionOnDown.y = this.screen.position.y;

        this.pointersDown.add(event.pointerId);
        this.mouseFramesDown = 0;
        this.mouseIsDown = true;
    }

    PointerUpAny({ mouseX, mouseY, event }: BareEventPayload['pointer_up_any']): void
    {
        if (!this.scene.started)
            return;
        
        if (event.button == 2)
            this.rightMouseIsDown = false;

        if (event.button == 1)
            this.middleMouseIsDown = false;
    }

    PointerUp({ mouseX, mouseY, event }: BareEventPayload['pointer_up']): void
    {
        if (!this.scene.started)
            return;
        
        const screenPosition = new Vec2(mouseX, mouseY);

        this.pointersDown.delete(event.pointerId);
        this.mouseIsDown = this.pointersDown.size > 0;

        this.screen.positionPrev.x = this.screen.position.x;
        this.screen.positionPrev.y = this.screen.position.y;

        this.screen.position.x = screenPosition.x;
        this.screen.position.y = screenPosition.y;

        MouseController.lastMouseX = screenPosition.x;
        MouseController.lastMouseY = screenPosition.y;

        this.SetPosition(this.screen.position.x, this.screen.position.y);
    }

    PointerMove({ mouseX, mouseY, event }: BareEventPayload['pointer_move'])
    {
        if (!this.scene.started)
            return;
        
        const screenPosition = new Vec2(mouseX, mouseY);
        
        this.screen.positionPrev.x = this.screen.position.x;
        this.screen.positionPrev.y = this.screen.position.y;

        this.screen.position.x = screenPosition.x;
        this.screen.position.y = screenPosition.y;

        MouseController.lastMouseX = screenPosition.x;
        MouseController.lastMouseY = screenPosition.y;

        this.SetPosition(this.screen.position.x, this.screen.position.y);
    }

    IsMoving()
    {
        return this.mouseSpeed > 0;
    }

    IsPressed(): boolean
    {
        return this.mouseIsDown && this.mouseFramesDown == 1;
    }

    SetPosition(x:number, y:number)
    {
        const worldPos = this.scene.ScreenToWorld(x, y);
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

    Reset()
    {
        this.world.position.x = -1000;
        this.world.position.y = -1000;

        this.mouseSpeed = 0;
        this.mouseSpeedDelayed = 0;
        this.mouseDirection = 0;
        this.mouseDirectionVec2.x = 0;
        this.mouseDirectionVec2.y = 0;
        this.mouseDirectionVec2Delayed.x = 0;
        this.mouseDirectionVec2Delayed.y = 0;

        this.mouseFramesDown = 0;
        this.pointersDown.clear();
        this.mouseIsDown = false;
        this.middleMouseIsDown = false;
        this.rightMouseIsDown = false;
    }
}

RegisterController(MouseController);
