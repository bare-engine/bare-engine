#version 300 es
precision mediump float;

in vec4 vColor;
in vec2 vRegion;
in vec4 vUVRect;
// highp: repeated lines can reach large u values, mediump would make fract() jitter
in highp vec2 vLocalUV;

uniform sampler2D uTexture;
uniform sampler2D uTextures[%TEXTURE_NUM%];
uniform int uUseTexture;
uniform int uRepeat;
// the uv bounds of the shape being drawn, when repeating
uniform highp vec4 uLocalUVRange;

out vec4 fragColor;

bool clampUV(vec2 uv) {
    vec2 uvMin = min(vUVRect.xy, vUVRect.zw);
    vec2 uvMax = max(vUVRect.xy, vUVRect.zw);
    return uv.x < uvMin.x || uv.x > uvMax.x || uv.y < uvMin.y || uv.y > uvMax.y;
}

vec4 sampleTexture(vec2 uv) {
    if (uUseTexture > 0) {
        return texture(uTexture, uv);
    }
    return vec4(1,1,1,1);
}

vec4 sampleClampTexture(vec2 uv) {
    if (clampUV(uv)) {
        return vec4(0.0, 0.0, 0.0, 0.0);
    }
    return sampleTexture(uv);
}

vec4 sampleTextureLocal(vec2 uv) {
    vec2 gUV = mix(vUVRect.xy, vUVRect.zw, uv);
    if (clampUV(gUV)) {
        return vec4(0.0, 0.0, 0.0, 0.0);
    }
    return sampleTexture(gUV);
}

// Wrap the local uv into the texture's frame, so repeating works for atlas sub-textures too
// (the GL wrap mode only repeats the whole atlas page).
vec4 sampleRepeatTexture() {
    if (uUseTexture == 0) {
        return vec4(1,1,1,1);
    }
    // With antialiasing, edge pixels are shaded at their center even when it lies just outside the shape.
    // The uv there is past the shape's edge, and wrapping it would show a line from the far side of the
    // texture. So clamp to the shape's own uvs, stopping just short of the far edge, where fract() would wrap to 0.
    highp vec2 local = clamp(vLocalUV, uLocalUVRange.xy, uLocalUVRange.zw - 1e-5 * (1.0 + abs(uLocalUVRange.zw)));
    vec2 uv = mix(vUVRect.xy, vUVRect.zw, fract(local));

    // Half a texel in from the frame edge, so linear filtering doesn't bleed in neighbouring frames
    vec2 halfTexel = 0.5 / vec2(textureSize(uTexture, 0));
    uv = clamp(uv, min(vUVRect.xy, vUVRect.zw) + halfTexel, max(vUVRect.xy, vUVRect.zw) - halfTexel);

    // Gradients from the unwrapped uv, the wrapped one jumps at the seam and would pick a tiny mip there
    return textureGrad(uTexture, uv, dFdx(vRegion), dFdy(vRegion));
}

// CUSTOM_CODE

void main(void) {
    fragColor = (uRepeat > 0 ? sampleRepeatTexture() : sampleTexture(vRegion)) * vColor;
    // CUSTOM_CODE_CALL
}
