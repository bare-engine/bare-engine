import { CustomGlShader } from "../libraries/new-rapid-render";
import { GameObject } from "../objects/gameObject";
import { IShader } from "../types/bareTypes";

/*export const flashShader = new CustomGlShader(rapid,
    `void vertex(inout vec4 position, inout vec2 region) {}`,

    `uniform float u_time;

    void fragment(inout vec4 color) {
        color.r = color.r * (0.6 + 0.4 * sin(u_time));
        color.g = color.g * (0.6 + 0.4 * cos(u_time * 0.7));
        color.b = color.b * (0.6 + 0.4 * sin(u_time * 1.3 + 1.0));
    }`
);*/

const flashVertexShaderSource = `
    void vertex(inout vec4 position, inout vec2 region) {
        // Do nothing - just pass through
    }
`;

const flashFragmentShaderSource = `
    uniform float uFlashTime;  // 0.0 = white flash, 1.0 = normal
    void fragment(inout vec4 color) {
        if(color.a > 0.5) {  // Only apply flash to more opaque pixels
            vec4 whiteColor = vec4(1.0, 1.0, 1.0, color.a);
            color = mix(whiteColor, color, uFlashTime);
        }
        // Semi-transparent edge pixels remain unchanged
    }
`;

export type FlashShaderPayload = { duration: number, fadePreDuration: number };

export class FlashShader implements IShader
{
    shader: CustomGlShader = null;

    private objectStates = new Map(); // Store state per object

    constructor()
    {
        this.shader = new CustomGlShader(rapid, flashVertexShaderSource, flashFragmentShaderSource, 0);

        this.shader.setUniforms({
            uFlashTime: 1.0  // Start at normal (no flash)
        });
    }

    public start(gameObject: GameObject, args:FlashShaderPayload = {duration: 300, fadePreDuration: 100} ): void
    {
        if (this.objectStates.has(gameObject))
            return; // Already flashing

        // Store this object's state
        this.objectStates.set(gameObject, {
            //originalUniforms: gameObject.uniforms,
            fadeStartTime: Date.now() + args.fadePreDuration,
            fadeDuration: args.duration
        });
        
        // Start flash effect
        this.shader.setUniforms({ uFlashTime: 0.0 });
    }

    public update(gameObject: GameObject): boolean
    {
        const state = this.objectStates.get(gameObject);
        if (!state) return;

        const currentTime = Date.now();
        const elapsed = Math.max(0, currentTime - state.fadeStartTime);
        const progress = Math.min(elapsed / state.fadeDuration, 1.0);
        
        const easeOut = 1 - Math.pow(1 - progress, 2);
        this.shader.setUniforms({ uFlashTime: easeOut });
        
        if (progress >= 1.0)
        {
            this.objectStates.delete(gameObject);
            return true;
        }

        return false;
    }

    public stop(gameObject: GameObject): void
    {
        const state = this.objectStates.get(gameObject);
        if (!state) return;
        
        //gameObject.uniforms = state.originalUniforms;
        this.objectStates.delete(gameObject);
    }
}
