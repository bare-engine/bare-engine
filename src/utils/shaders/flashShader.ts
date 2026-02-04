import { ShaderType, Uniform } from "../../libraries/rapid-render";

export class FlashShader
{
    private flashShader: any = null;
    public flashUniform: any = null;
    private objectStates = new Map(); // Store state per object
    
    private isFlashing = false;
    private originalShader: any = null;
    private originalUniforms: any = null;

    constructor() {
        this.InitShader();
    }

    private InitShader() {
        const flashVertexShaderSource = `
        void vertex(inout vec2 position, inout vec2 region) {
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

        this.flashShader = rapid.createCostumShader(flashVertexShaderSource, flashFragmentShaderSource, ShaderType.SPRITE, 0);
        
        this.flashUniform = new Uniform({
            uFlashTime: 1.0  // Start at normal (no flash)
        });
    }

    public start(gameObject: any, duration: number = 1000, fadePreDuration: number = 400): void {
        if (this.objectStates.has(gameObject))
            return; // Already flashing

        // Store this object's state
        this.objectStates.set(gameObject, {
            originalShader: gameObject.shader,
            originalUniforms: gameObject.uniforms,
            fadeStartTime: Date.now() + fadePreDuration,
            fadeDuration: duration
        });
        
        // Apply flash shader
        gameObject.shader = this.flashShader;
        gameObject.uniforms = this.flashUniform;
        
        // Start flash effect
        this.flashUniform.setUniform('uFlashTime', 0.0);
    }

    public update(gameObject: any): void {
        const state = this.objectStates.get(gameObject);
        if (!state) return;

        const currentTime = Date.now();
        const elapsed = Math.max(0, currentTime - state.fadeStartTime);
        const progress = Math.min(elapsed / state.fadeDuration, 1.0);
        
        const easeOut = 1 - Math.pow(1 - progress, 2);
        this.flashUniform.setUniform('uFlashTime', easeOut);
        
        if (progress >= 1.0) {
            // Restore original shader and uniforms
            gameObject.shader = state.originalShader;
            gameObject.uniforms = state.originalUniforms;
            this.objectStates.delete(gameObject);
        }
    }

    public isActiveFor(gameObject: any): boolean {
        return this.objectStates.has(gameObject);
    }

    public isActive(): boolean {
        return this.isFlashing;
    }

    public stop(gameObject: any): void {
        //if (!this.isFlashing) return;
        this.objectStates.delete(gameObject);
        
        this.isFlashing = false;
        gameObject.shader = this.originalShader;
        gameObject.uniforms = this.originalUniforms;
    }
}