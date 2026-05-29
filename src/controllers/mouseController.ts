import { Vec2 } from "../libraries/new-rapid-render";
import { Scene } from '../scenes/scene';
import { BareEvent, BareEventPayload } from '../types/bareTypes';
import { Helper } from "../utils/helper";
import { RegisterController } from '../globals';

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

    static lastMouseX: number = -10000;
    static lastMouseY: number = -10000;

    IsMouseDown(): boolean { return this.mouseIsDown; }
    IsMiddleMouseDown(): boolean { return this.middleMouseIsDown; }
    IsRightMouseDown(): boolean { return this.rightMouseIsDown; }

    public scene: Scene;

    constructor(scene: Scene)
    {
        this.scene = scene;
        
        // MOVED HERE FROM Start(), SINCE IT NEEDS TO BE THE FIRST POINTER EVENT THAT FIRES
        this.scene.events.on(BareEvent.pointer_down, this.PointerDown.bind(this));
        this.scene.events.on(BareEvent.pointer_move, this.PointerMove.bind(this));
        this.scene.events.on(BareEvent.pointer_up, this.PointerUp.bind(this));
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
            this.SetMousePosition(MouseController.lastMouseX, MouseController.lastMouseY);
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

        this.SetMousePosition(this.screen.position.x, this.screen.position.y);

        if (event.button == 0)
        {
            this.world.positionOnDown.x = this.world.position.x;
            this.world.positionOnDown.y = this.world.position.y;

            this.screen.positionOnDown.x = this.screen.position.x;
            this.screen.positionOnDown.y = this.screen.position.y;

            this.mouseFramesDown = 0;
            this.mouseIsDown = true;
        }

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

    PointerUp({ mouseX, mouseY, event }: BareEventPayload['pointer_up']): void
    {
        if (!this.scene.started)
            return;
        
        const screenPosition = new Vec2(mouseX, mouseY);

        if (event.button == 2)
            this.rightMouseIsDown = false;

        if (event.button == 1)
            this.middleMouseIsDown = false;

        if (event.button == 0)
            this.mouseIsDown = false;

        this.screen.positionPrev.x = this.screen.position.x;
        this.screen.positionPrev.y = this.screen.position.y;

        this.screen.position.x = screenPosition.x;
        this.screen.position.y = screenPosition.y;

        MouseController.lastMouseX = screenPosition.x;
        MouseController.lastMouseY = screenPosition.y;

        this.SetMousePosition(this.screen.position.x, this.screen.position.y);
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

        this.SetMousePosition(this.screen.position.x, this.screen.position.y);
    }

    IsMoving()
    {
        return this.mouseSpeed > 0;
    }

    IsMousePressed(): boolean
    {
        return this.mouseIsDown && this.mouseFramesDown == 1;
    }

    SetMousePosition(x:number, y:number)
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
        this.mouseIsDown = false;
        this.middleMouseIsDown = false;
        this.rightMouseIsDown = false;
    }
}

export var mouseController:MouseController;
RegisterController(MouseController);
