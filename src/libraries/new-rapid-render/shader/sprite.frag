#version 300 es
precision mediump float;

uniform sampler2D uTextures[%TEXTURE_NUM%];

in vec2 vRegion;
flat in int vTextureId;
flat in int vClampUV;
in vec4 vColor;

in vec4 vUVRect;

out vec4 fragColor;
in vec2 vPadding;

bool clampUV(vec2 uv) {
    return uv.x < vUVRect.x || uv.x > vUVRect.z || uv.y < vUVRect.y || uv.y > vUVRect.w;
}

vec4 sampleTexture(vec2 uv) {
    %GET_COLOR%
}

vec4 sampleClampTexture(vec2 uv) {
    if (clampUV(uv)) {
        return vec4(0.0, 0.0, 0.0, 0.0);
    }
    return sampleTexture(uv);
}

vec4 sampleTextureLocal(vec2 uv){
    vec2 gUV = mix(vUVRect.xy, vUVRect.zw, uv);
    if (clampUV(gUV)) {
        return vec4(0.0, 0.0, 0.0, 0.0);
    }
    return sampleTexture(gUV);
}

// CUSTOM_CODE

void main(void) {
    // Atlas regions clamp so padding never samples a neighbouring frame; plain textures
    // keep their wrap mode. Same program for both, selected per instance.
    fragColor = (vClampUV == 1 ? sampleClampTexture(vRegion) : sampleTexture(vRegion)) * vColor;

    // CUSTOM_CODE_CALL
}
