import { BaseComponent } from "../controllers/componentController";
import { assetsHandler } from "../handlers/assetsHandler";
import mitt, { Emitter } from "../libraries/mitt";
import { AnimationData } from "../types/bareTypes";

// THIS COMPONENT JUST HANDLES PLAYING/PAUSING OF ANIMATIONS
// THERE IS NO METHOD TO REGISTER ANIMATIONS HERE, THAT HAPPENS AUTOMATICALLY WHEN YOU SUFFIX YOUR IMAGE NAME WITH "_00", "_01", "_03"...
// THIS WORKS FOR IMAGES IN /texturePackImages

// A SIMPLE ANIMATION CAN BE ATTACHED TO A GAMEOBJECT LIKE THIS:
// var buttonPressObj = uiScene.AddGameObject("buttonPress");
// buttonPressObj.AddComponent(AnimationComponent);
// HERE THERE ARE 2 IMAGE FILES: "buttonPress_00" AND "buttonPress_01" IN /texturePackImages
// IT WILL AUTO-PLAY

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
// import entityDataJson from '../public/assets/data/settingsData.json';
// ... super(entityDataJson);

// THE IDEA WITH THIS IS THAT ANIMATIONS STAYS SEPARATED IN DATA, AND ARE NOT DEFINED SOMEWHERE IN CODE
// MAYBE I WILL ADD METHOD LATER FOR THIS THOUGH, SETTING ANIMATIONS AND SPEED. LET'S SEE
// ACTUALLY I SHOULD, SO YOU COULD SETUP YOUR OWN ANIMATIONS WITH RENDERTEXTURES OR SOMETHING

// TO PLAY AN ANIMATION YOU GIVE IT THE NAME THAT'S SET AFTER THE _, SO FOR "buffalo_run", IT'S JUST "run"
// var buffalo = this.AddGameObject("buffalo");
// var animComponent = buffalo.AddComponent(AnimationComponent);
// animComponent.Play("run"); // HERE

// (THE FULL ANIMATION NAME IS FOUND BY CONCATENATING THE ENTITY NAME WITH THE ANIMATION NAME: "buffalo" + "_" + "run")

// CURRENTLY this.AddGameObject("buffalo"); WILL GIVE AN ERROR SAYING IT CAN'T FIND "buffalo.wepb" BUT YOU CAN IGNORE THAT

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

export class AnimationComponent extends BaseComponent
{
    currentAnimation: AnimationData;

    callbacks: Map<string, (anim: AnimationComponent) => void> = new Map();
    singleCallbacks: Map<string, (anim: AnimationComponent) => void> = new Map();

    events: Emitter<AnimationEventPayload>

    OnAdded(): void
    {
        this.events = mitt<AnimationEventPayload>();
    }
    
    OnStart(): void
    {
        // THIS HAPPENS AT START OF FIRST UPDATE, SO IF Play() HAS NOT BEEN CALLED YET, NO currentAnimation IS THERE
        // SO WE JUST PLAY THE DEFAULT ANIMATION
        if (!this.currentAnimation)
        {
            this.Play();
        }
    }

    Play(animationName: string = "", animationNameOrSingleCallback: string | (() => void) = ""): void
    {
        this.enabled = true;

        //if (animationName == "")
        //    return;

        var fullAnimationName = this.go.name + (animationName == "" ? "" : "_" + animationName);

        if (!assetsHandler.GetAnimation(fullAnimationName))
        {
            console.error(`Animation ${fullAnimationName} does not exist`);
            return;
        }

        this.currentAnimation = assetsHandler.GetAnimation(fullAnimationName)!.clone(); // CLONING IT, SO THAT WE MODIFY OUR OWN COPY
        this.currentAnimation.currentFrame = 0;
        this.currentAnimation.currentFrameTime = 0;

        this.SetTextureToFrame(0);

        this.events.emit(AnimationEvent.started, { animation: this.currentAnimation });

        if (animationNameOrSingleCallback)
        {
            if (typeof animationNameOrSingleCallback === 'string')
                this.singleCallbacks.set(fullAnimationName, () => this.Play(animationNameOrSingleCallback));
            else
                this.singleCallbacks.set(fullAnimationName, animationNameOrSingleCallback);
        }
    }

    Pause(): void
    {
        this.enabled = false;
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

            if (this.currentAnimation.currentFrame == this.currentAnimation.animFrames.length)
            {
                this.OnAnimationComplete();
            }
            else
            {
                this.SetTextureToFrame(this.currentAnimation.currentFrame);
            }
        }
    }

    private OnAnimationComplete()
    {
        if (this.currentAnimation.loop)
        {
            this.currentAnimation.currentFrame = 0;
            this.SetTextureToFrame(0);
            this.events.emit(AnimationEvent.looped, { animation: this.currentAnimation });
        }
        else
        {
            this.Pause();
            this.events.emit(AnimationEvent.completed, { animation: this.currentAnimation });
        }

        if (this.singleCallbacks.has(this.currentAnimation.animName))
        {
            this.singleCallbacks.get(this.currentAnimation.animName)!(this);
            this.singleCallbacks.delete(this.currentAnimation.animName);
        }

        if (this.callbacks.has(this.currentAnimation.animName))
        {
            this.callbacks.get(this.currentAnimation.animName)!(this);
        }
    }

    SetTextureToFrame(frame: int)
    {
        var texturePath = this.currentAnimation.animFrames[frame];
        var texture = assetsHandler.GetTexture(texturePath);
        this.go.SetTexture(texture);
    }
    
    OnRemoved(): void
    {
        this.events.clearAll(); // NOT REALLY NEEDED?
    }
}

