#version 300 es
// highp: atlas UVs need more precision than mediump has on mobile GPUs
precision highp float;

uniform sampler2D uTextures[%TEXTURE_NUM%];
uniform vec4 uTint;

in vec2 vUV;
flat in vec4 vRect;
flat in int vTextureId;

out vec4 fragColor;

vec4 sampleTexture(vec2 uv) {
    %GET_COLOR%
}

void main(void) {
    fragColor = sampleTexture(clamp(vUV, vRect.xy, vRect.zw)) * uTint;
}
