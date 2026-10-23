#version 300 es
precision highp float;

// per-vertex
in vec2 aVertex;

// per-instance：2x3 仿射矩阵，拆成两个 vec3
in vec3 aMatrixRow0; // [a, c, tx]
in vec3 aMatrixRow1; // [b, d, ty]

// per-instance：UV 区域 (u0, v0, u1, v1)
in vec4 aUVRect;

// per-instance：tint color
in vec4 aColor;

// per-instance：纹理索引
in float aTextureId;

// per-instance: 1 = discard samples outside aUVRect (atlas regions)
in float aClampUV;

// only once a clip has been drawn, as in sprite.frag
#ifdef CLIP
// per-instance: the slot + 1 of the innermost clip the sprite is in, 0 for none (see SpriteRegion.addClip)
in float aClip;

flat out int vClip;
out highp vec2 vPosition;
#endif

uniform mat4 u_projection;
uniform vec2 uPadding[%TEXTURE_NUM%];

out vec2 vRegion;
flat out int vTextureId;
flat out int vClampUV;
out vec4 vColor;

out vec4 vUVRect;
out vec2 vPadding;
// CUSTOM_CODE

void main(void) {
    vPadding = uPadding[int(aTextureId)];
    vUVRect = aUVRect;
    vRegion = mix(aUVRect.xy - vPadding, aUVRect.zw + vPadding, aVertex.xy);

    vTextureId = int(aTextureId);
    vClampUV = int(aClampUV);
    vColor = aColor;

    vec4 position = vec4(
        dot(aMatrixRow0.xyz, vec3(aVertex.xy, 1.0)), 
        dot(aMatrixRow1.xyz, vec3(aVertex.xy, 1.0)), 
        0.0, 
        1.0
    );
    // CUSTOM_CODE_CALL

#ifdef CLIP
    // after the custom code, so a clip cuts where the sprite ends up
    vClip = int(aClip);
    vPosition = position.xy;
#endif
    gl_Position = u_projection * position;
}
