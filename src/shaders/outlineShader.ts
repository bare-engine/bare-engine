import { CustomGlShader } from "../libraries/new-rapid-render";

export class OutlineShader
{
    private outlineShader: CustomGlShader = null;
    private objectStates = new Map(); // Store state per object

    constructor() {
        this.InitShader();
    }

    private InitShader() {
        const outlineVertexShaderSource = `
            void vertex(inout vec4 position, inout vec2 region) {
                // Keep original region so fragment shader can mask padding area itself.
                vRegion = region; 
            }
        `;

        /*const outlineFragmentShaderSource = `
            uniform sampler2D uTexture;
            uniform vec2 uTextureSize;

            void fragment(inout vec4 color) {
                vec2 px = vec2(1.0 / uTextureSize.x, 1.0 / uTextureSize.y);
                vec4 originalColor = texture2D(uTexture, vRegion + vec2(5.0,  5.0) * px);
                color = originalColor;
            }
        `;*/
        
        const outlineFragmentShaderSource = `
    uniform vec4 uOutlineColor;
    uniform float uOutlineWidth;
    uniform vec2 uTextureSize;

    void fragment(inout vec4 color) {
        vec2 uvSize = abs(vUVRect.zw - vUVRect.xy);
        vec2 px = uvSize / max(uTextureSize, vec2(0.00000001));
        vec4 ownColor = sampleClampTexture(vRegion);

        float maxAlpha = 0.0;
        
        const float PI = 3.14159265358979323846264;
        
        for (float angle = 0.0; angle <= PI * 2.0; angle += 0.39269908) {
            vec2 offset = vec2(cos(angle), sin(angle)) * uOutlineWidth * px;
            vec4 curColor = sampleClampTexture(vRegion + offset);
            maxAlpha = max(maxAlpha, curColor.a);
        }
        
        // If we're in the outline zone (maxAlpha > 0 but ownColor.a is low)
        // draw the outline color. Otherwise draw the original.
        float outlineAlpha = maxAlpha * (1.0 - ownColor.a);
        
        // Final color: original premultiplied sprite plus outline contribution.
        vec3 finalRgb = ownColor.rgb + uOutlineColor.rgb * uOutlineColor.a * outlineAlpha;
        float finalA = ownColor.a + outlineAlpha * uOutlineColor.a;
        color = vec4(finalRgb, finalA);
    }
`;

        this.outlineShader = new CustomGlShader(rapid,
            outlineVertexShaderSource, 
            outlineFragmentShaderSource, 
            0
        );
    }

    public start(
    gameObject: any, 
    color: [number, number, number, number] = [1.0, 1.0, 1.0, 1.0], 
    width: number = 2.0
): void {
    if (this.objectStates.has(gameObject))
        return;

    this.objectStates.set(gameObject, {
        originalShader: gameObject.shader,
        originalUniforms: gameObject.uniforms,
        baseWidth: width ?? 7.0
    });
    
    const texture = gameObject.texture;
    const textureWidth = texture?.width ?? texture?.base?.width ?? 512;
    const textureHeight = texture?.height ?? texture?.base?.height ?? 512;
    const outlineWidth = width ?? 7.0;
    const scaleX = Math.abs(gameObject?.totalScaleX);
    const scaleY = Math.abs(gameObject?.totalScaleY);
    const scale = Math.max(scaleX, scaleY, 0.0001);

    this.outlineShader.setUniforms({
        uTextureSize: [textureWidth + 0.00000001, textureHeight + 0.00000001],
        uOutlineColor: [0.867, 0.631, 0.071, 1.0],
        uOutlineWidth: outlineWidth,
    });

    gameObject.shader = this.outlineShader;
    // Pad the quad just enough to fit the outline; UVs are clamped in-shader to avoid atlas bleeding.
    const padding = (outlineWidth + 2.0) / scale;
    this.outlineShader.setPadding(padding);
}

    public updateColor(color: [number, number, number, number]): void {
        this.outlineShader.setUniforms({ uOutlineColor: color });
    }

    public updateWidth(width: number): void {
        const state = this.objectStates.values().next().value;
        if (state) state.baseWidth = width;
        this.outlineShader.setUniforms({ uOutlineWidth: width });
    }

    public update(gameObject: any): void {
        if (!this.objectStates.has(gameObject) || !gameObject?.texture)
            return;

        const texture = gameObject.texture;
        const textureWidth = texture?.width ?? texture?.base?.width ?? 512;
        const textureHeight = texture?.height ?? texture?.base?.height ?? 512;

        const state = this.objectStates.get(gameObject);
        const baseWidth = state?.baseWidth ?? 7.0;
        const scaleX = Math.abs(gameObject?.totalScaleX);
        const scaleY = Math.abs(gameObject?.totalScaleY);
        const scale = Math.max(scaleX, scaleY, 0.0001);

        this.outlineShader.setUniforms({
            uTextureSize: [textureWidth + 0.00000001, textureHeight + 0.00000001],
            uOutlineWidth: baseWidth / scale
        });
        this.outlineShader.setPadding((baseWidth + 2.0) / scale);
    }

    public isActiveFor(gameObject: any): boolean {
        return this.objectStates.has(gameObject);
    }

    public stop(gameObject: any): void {
        const state = this.objectStates.get(gameObject);
        if (!state) return;
        
        // Restore original shader and uniforms
        gameObject.shader = state.originalShader;
        gameObject.uniforms = state.originalUniforms;
        this.objectStates.delete(gameObject);
    }

    public stopAll(): void {
        for (const [gameObject, state] of this.objectStates) {
            gameObject.shader = state.originalShader;
            gameObject.uniforms = state.originalUniforms;
        }
        this.objectStates.clear();
    }
}
