import { CustomGlShader } from "../libraries/new-rapid-render";
import type { CameraHandler } from "src/handlers/cameraHandler";
import type { GameObject } from "../objects/gameObject";
import { IShader } from "../types/bareTypes";

type OutlineColor = [number, number, number, number];

export type OutlineShaderPayload = { color: OutlineColor, width: number };

interface OutlineShaderState
{
    originalShader: CustomGlShader;
    originalUniforms: Record<string, any>;
    baseWidth: number;
}

const outlineVertexShaderSource = `
    void vertex(inout vec4 position, inout vec2 region) {
        // Keep original region so fragment shader can mask padding area itself.
        vRegion = region; 
    }
`;

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

export class OutlineShader implements IShader
{
    shader: CustomGlShader = null;

    private objectStates = new Map<GameObject, OutlineShaderState>(); // Store state per object

    constructor()
    {
        this.shader = new CustomGlShader(rapid, outlineVertexShaderSource, outlineFragmentShaderSource, 0);

        this.shader.setUniforms({
            uOutlineColor: [0.867, 0.631, 0.071, 1.0],
            uOutlineWidth: 2.0,
            uTextureSize: [512.0, 512.0],
        });
    }

    public start(gameObject: GameObject, args: OutlineShaderPayload = { color: [0.867, 0.631, 0.071, 1.0], width: 8.0 }): void
    {
        if (this.objectStates.has(gameObject))
            return;

        this.objectStates.set(gameObject, {
            originalShader: (gameObject as any).shader,
            originalUniforms: (gameObject as any).uniforms,
            baseWidth: args.width ?? 7.0
        });
        
        this.shader.setUniforms({
            uOutlineColor: args.color,
        });

        (gameObject as any).shader = this.shader;
        this.update(gameObject);
    }

    public updateColor(color: OutlineColor): void
    {
        this.shader.setUniforms({ uOutlineColor: color });
    }

    public updateWidth(width: number): void
    {
        const state = this.objectStates.values().next().value;
        if (state) state.baseWidth = width;
        this.shader.setUniforms({ uOutlineWidth: width });
    }

    public update(gameObject: GameObject): boolean
    {
        if (!this.objectStates.has(gameObject) || !gameObject?.texture)
            return false;

        const scaleX = Math.abs(gameObject?.totalScaleX);
        const scaleY = Math.abs(gameObject?.totalScaleY);
        const camera: CameraHandler = gameObject.scene.cameraHandler;
        
        const globalScale = Math.max(scaleX, scaleY, 0.0001) * camera.zoom;
        const lpscale = Math.max(rapid.logicHeight / rapid.physicsHeight, rapid.logicWidth / rapid.physicsWidth);

        const texture = gameObject.texture;
        const textureWidth = texture?.width ?? texture?.base?.width ?? 512;
        const textureHeight = texture?.height ?? texture?.base?.height ?? 512;

        const state = this.objectStates.get(gameObject);
        const outlineWidth = state?.baseWidth ?? 7.0;
        const padding = outlineWidth / globalScale;
        this.shader.setUniforms({
            uTextureSize: [textureWidth + 0.00000001, textureHeight + 0.00000001],
            uOutlineWidth: outlineWidth * lpscale / globalScale // pixel size
        });
        this.shader.setPadding(padding); // pixel size

        return false;
    }

    public stop(gameObject: GameObject): void
    {
        const state = this.objectStates.get(gameObject);
        if (!state) return;
        
        // Restore original shader and uniforms
        (gameObject as any).shader = state.originalShader;
        (gameObject as any).uniforms = state.originalUniforms;
        this.objectStates.delete(gameObject);
    }

    public stopAll(): void
    {
        for (const [gameObject, state] of this.objectStates) {
            (gameObject as any).shader = state.originalShader;
            (gameObject as any).uniforms = state.originalUniforms;
        }
        this.objectStates.clear();
    }
}
