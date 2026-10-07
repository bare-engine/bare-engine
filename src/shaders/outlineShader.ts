import type { CameraHandler } from "../handlers/cameraHandler";
import { Color } from "../libraries/rapid-render";
import type { GameObject } from "../objects/gameObject";
import { Shader } from "../types/bareTypes";

export type OutlineShaderPayload = { color: Color, width: number };

export class OutlineShader extends Shader
{
    color: Color;
    width: number;

    constructor(args: OutlineShaderPayload = { color: Color.fromNorm(0.867, 0.631, 0.071), width: 8.0 })
    {
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

            void fragment(inout vec4 color, vec2 vRegion) {
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

        super(outlineVertexShaderSource, outlineFragmentShaderSource);

        this.color = args.color;
        this.width = args.width;

        this.SetUniforms({
            uOutlineColor: this.normalizedColor,
            uOutlineWidth: this.width,
            uTextureSize: [512.0, 512.0],
        });
    }

    public override Update(gameObject: GameObject): boolean
    {
        if (!gameObject?.texture)
            return false;

        const scaleX = Math.abs(gameObject.totalScaleX);
        const scaleY = Math.abs(gameObject.totalScaleY);
        const camera: CameraHandler = gameObject.scene.Get("_camera");
        
        const globalScale = Math.max(scaleX, scaleY, 0.0001) * (camera?.zoom ?? 1);
        const lpscale = Math.max(rapid.logicHeight / rapid.physicsHeight, rapid.logicWidth / rapid.physicsWidth);

        const texture = gameObject.texture;
        const textureWidth = texture?.width ?? texture?.base?.width ?? 512;
        const textureHeight = texture?.height ?? texture?.base?.height ?? 512;
        const padding = this.width / globalScale;

        this.SetUniforms({
            uOutlineColor: this.normalizedColor,
            uTextureSize: [textureWidth, textureHeight],
            uOutlineWidth: this.width * lpscale / globalScale // pixel size
        });
        
        this.SetPadding(padding); // pixel size

        return false;
    }

    private get normalizedColor(): [number, number, number, number]
    {
        return [this.color.r / 255, this.color.g / 255, this.color.b / 255, this.color.a / 255];
    }
}
