import { BaseComponent } from "../controllers/componentController";
import { GameObject } from "../objects/gameObject";
import { assetsHandler } from "../utils/assetsHandler";
import { AnimationData } from "../utils/bareTypes";

export class AnimationComponent extends BaseComponent
{
    currentAnimation: AnimationData;

    callbacks: Map<string, (anim: AnimationComponent) => void> = new Map();
    singleCallbacks: Map<string, (anim: AnimationComponent) => void> = new Map();
    
    Play(animationName: string = "", animationNameOrSingleCallback: string | (() => void) = ""): void
    {
        this.enabled = true;

        if (animationName == "")
            return;

        var fullAnimationName = this.go.name + "_" + animationName;

        if (!assetsHandler.GetAnimation(fullAnimationName))
        {
            console.error(`Animation ${fullAnimationName} does not exist`);
            return;
        }

        this.currentAnimation = assetsHandler.GetAnimation(fullAnimationName)!;
        this.currentAnimation.currentFrame = 0;
        this.currentAnimation.currentFrameTime = 0;

        this.SetTextureToFrame(0);

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
        }
        else
        {
            this.Pause();
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
}
