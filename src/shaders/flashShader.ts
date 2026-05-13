import { CustomGlShader } from "../libraries/new-rapid-render";

export class FlashShader
{
    private flashShader: CustomGlShader = null;
    private objectStates = new Map(); // Store state per object
    

    constructor() {
        this.InitShader();
    }

    private InitShader() {
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

        this.flashShader = new CustomGlShader(rapid, flashVertexShaderSource, flashFragmentShaderSource, 0);
        
        this.flashShader.setUniforms({
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
        
        // Start flash effect
        this.flashShader.setUniforms({ uFlashTime: 0.0 });
    }

    public update(gameObject: any): void {
        const state = this.objectStates.get(gameObject);
        if (!state) return;

        const currentTime = Date.now();
        const elapsed = Math.max(0, currentTime - state.fadeStartTime);
        const progress = Math.min(elapsed / state.fadeDuration, 1.0);
        
        const easeOut = 1 - Math.pow(1 - progress, 2);
        this.flashShader.setUniforms({ uFlashTime: easeOut });
        
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
        return this.objectStates.size > 0;
    }

    public stop(gameObject: any): void {
        const state = this.objectStates.get(gameObject);
        if (!state) return;
        
        gameObject.shader = state.originalShader;
        gameObject.uniforms = state.originalUniforms;
        this.objectStates.delete(gameObject);
    }
}
