import { Component } from "../controllers/componentController";
import { assetsHandler } from "../handlers/assetsHandler";
import mitt, { Emitter } from "../libraries/mitt";
import { AnimationData } from "../types/bareTypes";
import { Decimal, Dropdown, InspectorField, Int, Limit } from "../utils/decorators";

// THIS COMPONENT JUST HANDLES PLAYING/PAUSING OF ANIMATIONS
// THERE IS NO METHOD TO REGISTER ANIMATIONS HERE, THAT HAPPENS AUTOMATICALLY WHEN YOU SUFFIX YOUR IMAGE NAME WITH "_00", "_01", "_03"...
// THIS WORKS FOR IMAGES IN /texturePackImages

// A SIMPLE ANIMATION CAN BE ATTACHED TO A GAMEOBJECT LIKE THIS:
// var buttonPressObj = uiScene.AddGameObject("-buffalo"); // - IS THERE TO PREVENT IT FROM DOING A TEXTURE LOOKUP
// buttonPressObj.AddComponent(AnimationComponent);
// THEN YOU COULD HAVE 2 IMAGE FILES: "buffalo_00" AND "buffalo_01" IN /texturePackImages(PRELOADED) OR public/images (STREAMED)
// IT WILL AUTO-PLAY THESE

// ANIMATIONS CAN ALSO BE REGISTERED IN settingsData.json OR THE BE SUPPLIED AS AN ARGUMENT TO A SCENE
// EG. FROM DEMO:

// const data = ` {
//   "animations": {
// 	  "buffalo_run": {
// 		  "framesPerSecond": 9
// 	  },
// 	  "buffalo_eat": {
// 		  "frames": ["buffalo_eat_00","buffalo_eat_01","buffalo_eat_03","buffalo_eat_00","buffalo_eat_01","buffalo_eat_03","buffalo_eat_00","buffalo_eat_01","buffalo_eat_02"],
// 		  "framesPerSecond": 9,
// 		  "loop": false
// 	   }
//   }
// }`;

// export class GameAnimation extends Scene
// {
//     constructor()
//     {
//         super(JSON.parse(data));
//     }
// }

// THIS IS JUST A QUICK EXAMPLE, IDEALLY YOU'D WANT TO HAVE THIS IN A JSON AND INCLUDE IT IN CODE WITH: 
// import entityDataJson from '../public/data/settingsData.json';
// ... super(entityDataJson);

// THE IDEA WITH THIS IS THAT ANIMATIONS STAYS SEPARATED IN DATA, AND ARE NOT DEFINED SOMEWHERE IN CODE
// MAYBE I WILL ADD METHOD LATER FOR THIS THOUGH, SETTING ANIMATIONS AND SPEED. LET'S SEE
// (ACTUALLY I SHOULD, SO YOU COULD SETUP YOUR OWN ANIMATIONS WITH RENDERTEXTURES OR SOMETHING - TODO)

// TO PLAY AN ANIMATION YOU GIVE IT THE NAME THAT'S SET AFTER THE _, SO FOR "buffalo_run", IT'S JUST "run"
// var buffalo = this.AddGameObject("-buffalo");
// var animComponent = buffalo.AddComponent(AnimationComponent);
// animComponent.Play("run"); // HERE

// (THE FULL ANIMATION NAME IS FOUND BY COMBINING THE ENTITY NAME WITH THE ANIMATION NAME: "buffalo" + "_" + "run")

export const AnimationEvent = {
  frameChanged: "frame_changed",
  started: "started",
  completed: "completed",
  looped: "looped",
} as const;

export type AnimationEventPayload = {
    frame_changed: { frame: number, animation: AnimationData }
    started: { animation: AnimationData }
    completed: { animation: AnimationData }
    looped: { animation: AnimationData }
}

export class AnimationComponent extends Component
{
    currentAnimation!: AnimationData;

    callbacks: Map<string, (anim: AnimationComponent) => void> = new Map();
    singleCallbacks: Map<string, (anim: AnimationComponent) => void> = new Map();

    events!: Emitter<AnimationEventPayload>

    allAnimationNamesForObject: string[] = [];

    @InspectorField
    get playing():boolean {return this.enabled;}
    set playing(value:boolean) {value ? this.Resume() : this.Pause();}

    @InspectorField
    @Dropdown(function (this: AnimationComponent) { return this.allAnimationNamesForObject; })
    get current():string {return this.currentAnimation?.name.replace(`${this.go.name}_`, "") ?? "";}
    set current(value:string) {this.Play(value);}

    @InspectorField
    @Limit(0, Infinity)
    @Int
    get frame():int {return this.currentAnimation?.currentFrame ?? 0;}
    set frame(value:int) {this.GotoFrame(value % (this.currentAnimation?.frames.length ?? 0));}

    @InspectorField
    @Limit(0, Infinity)
    @Int
    get framesPerSecond():int {return this.currentAnimation?.framesPerSecond ?? 0;}
    set framesPerSecond(value:int) {if (this.currentAnimation) this.currentAnimation.framesPerSecond = value;}
    
    OnAdded(): void
    {
        this.events = mitt<AnimationEventPayload>();

        var objName = this.go.name;
        const prefix = `${objName}_`;
        this.allAnimationNamesForObject = Object.keys(this.scene.settingsData.animations ?? {})
            .filter(name => name.startsWith(prefix))
            .map(name => name.slice(prefix.length));
    }
    
    OnStart(): void
    {
        // THIS HAPPENS AT START OF FIRST UPDATE, SO IF Play() HAS NOT BEEN CALLED YET, NO currentAnimation IS THERE
        // SO WE JUST PLAY THE DEFAULT ANIMATION - ONE THAT SHARES THE NAME WITH OBJECT
        if (!this.currentAnimation)
        {
            var animationName = this.go.name;
            if (assetsHandler.GetAnimation(animationName))
                this.Play();
        }
    }

    // PLAY DESIRED ANIMATION - WILL STREAM IN FRAMES IF NECESSARY, AWAIT THE METHOD TO WAIT FOR THIS
    async Play(animationName: string = "", animationNameOrSingleCallback: string | (() => void) = ""): Promise<void>
    {
        // IN CASE A Data.Animation.XXX IS SUPPLIED, 
        // REMOVE THE NAME PREFIX. EG: "buffalo_run" -> "run"
        // IT WANTS ONLY "run", SINCE THIS SYSTEM WAS DESIGNED WITH ONLY STRINGS IN MIND
        // AND IT TAKES THE "buffalo_" PART FROM THE GAMEOBJECT NAME
        // IF Data.Animation.XXX WOULD BECOME THE STANDARD, THAT'S NOT REALLY NECESSARY ANYMORE
        if (animationName.startsWith(`${this.go.name}_`))
            animationName = animationName.slice(this.go.name.length + 1);

        var fullAnimationName = this.go.name + (animationName == "" ? "" : "_" + animationName);

        if (!assetsHandler.GetAnimation(fullAnimationName))
        {
            console.error(`Animation ${fullAnimationName} does not exist`);
            /*if (assetsHandler.HasTexture(fullAnimationName) || await assetsHandler.GetTexturePromise(fullAnimationName))
            {
                this.go.SetTexture(assetsHandler.GetTexture(fullAnimationName));
                this.enabled = false;
            }*/
            return;
        }

        this.enabled = true;

        var animation = assetsHandler.GetAnimation(fullAnimationName)!;
        
        // LOAD TEXTURES
        if  (!animation.texturesLoaded)
        {
            var texturesToLoad: string[] = [];
            for (var i = 0; i < animation.frames.length; i++)
            {
                if (!assetsHandler.HasTexture(animation.frames[i]))
                    texturesToLoad.push(animation.frames[i]);
            }
            if (texturesToLoad.length > 0)
            {
                var texturePromises = [];
                for (var i = 0; i < texturesToLoad.length; i++)
                {
                    texturePromises.push(assetsHandler.LoadTexture(texturesToLoad[i]));
                }
                await Promise.all(texturePromises);

                animation.texturesLoaded = true; // SO WE ONLY DO IT ONCE
            }
        }

        this.currentAnimation = animation.clone(); // CLONING IT, SO THAT WE MODIFY OUR OWN COPY

        this.GotoFrame(0);

        if (animationNameOrSingleCallback)
        {
            if (typeof animationNameOrSingleCallback === 'string')
                this.singleCallbacks.set(fullAnimationName, () => this.Play(animationNameOrSingleCallback));
            else
                this.singleCallbacks.set(fullAnimationName, animationNameOrSingleCallback);
        }

        this.events.emit(AnimationEvent.started, { animation: this.currentAnimation });
    }

    Pause(): void
    {
        this.enabled = false;
    }

    Resume(): void
    {
        this.enabled = true;
    }

    OnComplete(animationName: string, animationNameOrCallback: string | (() => void)): void
    {
        var fullAnimationName = this.go.name + "_" + animationName;

        if (typeof animationNameOrCallback === 'string')
        {
            this.callbacks.set(fullAnimationName, () => this.Play(animationNameOrCallback));
        }
        else
        {
            this.callbacks.set(fullAnimationName, animationNameOrCallback);
        }
    }

    OnUpdate(deltaTime: number): void 
    {
        if (!this.currentAnimation)
            return;
        
        this.currentAnimation.currentFrameTime += deltaTime * this.currentAnimation.framesPerSecond;
        if (this.currentAnimation.currentFrameTime >= 1)
        {
            this.currentAnimation.currentFrame++;
            this.currentAnimation.currentFrameTime -= 1;

            this.events.emit(AnimationEvent.frameChanged, { 
                frame: this.currentAnimation.currentFrame,
                animation: this.currentAnimation 
            });

            if (this.currentAnimation.currentFrame == this.currentAnimation.frames.length)
            {
                this.OnAnimationComplete();
            }
            else
            {
                this.GotoFrame(this.currentAnimation.currentFrame);
            }
        }
    }

    private OnAnimationComplete()
    {
        // a callback can play the next animation, which replaces currentAnimation
        const finished = this.currentAnimation;

        if (finished.loop)
        {
            finished.currentFrame = 0;
            this.GotoFrame(0);
            this.events.emit(AnimationEvent.looped, { animation: finished });
        }
        else
        {
            this.Pause();
            this.events.emit(AnimationEvent.completed, { animation: finished });
        }

        const singleCallback = this.singleCallbacks.get(finished.name);
        if (singleCallback)
        {
            this.singleCallbacks.delete(finished.name);
            singleCallback(this);
        }

        this.callbacks.get(finished.name)?.(this);

        if (finished.removeOnComplete)
        {
            this.go.Remove();
        }
    }

    GotoFrame(frame: int)
    {
        if (!this.currentAnimation)
            return;

        frame = Math.max(0, Math.min(frame, this.currentAnimation.frames.length - 1));
        this.currentAnimation.currentFrame = frame;

        var texturePath = this.currentAnimation.frames[frame];
        var texture = assetsHandler.GetTexture(texturePath);
        this.go.SetTexture(texture);
    }
    
    OnRemoved(): void
    {
        this.events?.clearAll(); // NOT REALLY NEEDED?
    }
}

