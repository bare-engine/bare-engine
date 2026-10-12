import { Shader } from "../types/bareTypes";

export type FlashShaderPayload = { duration?: number, fadePreDuration?: number };

export class FlashShader extends Shader
{
    fadeStartTime: number;
    fadeDuration: number;

    constructor(args: FlashShaderPayload = {})
    {
        const flashVertexShaderSource = `
            void vertex(inout vec4 position, inout vec2 region) {
                // Do nothing - just pass through
            }
        `;

        const flashFragmentShaderSource = `
            uniform float uFlashTime;  // 0.0 = white flash, 1.0 = normal
            void fragment(inout vec4 color, vec2 vRegion) {
                if(color.a > 0.5) {  // Only apply flash to more opaque pixels
                    vec4 whiteColor = vec4(1.0, 1.0, 1.0, color.a);
                    color = mix(whiteColor, color, uFlashTime);
                }
                // Semi-transparent edge pixels remain unchanged
            }
        `;

        super(flashVertexShaderSource, flashFragmentShaderSource)
        
        this.fadeStartTime = bare.gameTime + (args.fadePreDuration ?? 0.1) * 1000;
        this.fadeDuration = (args.duration ?? 0.3) * 1000;
        
        this.SetUniforms({
            uFlashTime: 0.0
        });
    }

    public override Update(): boolean
    {
        const currentTime = bare.gameTime;
        const elapsed = Math.max(0, currentTime - this.fadeStartTime);
        const progress = this.fadeDuration > 0 ? Math.min(elapsed / this.fadeDuration, 1.0) : 1.0;
        
        const easeOut = 1 - Math.pow(1 - progress, 2);
        this.SetUniforms({ uFlashTime: easeOut });
        
        if (progress >= 1.0)
            return true;

        return false;
    }
}