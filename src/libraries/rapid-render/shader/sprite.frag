precision mediump float;
uniform sampler2D uTextures[%TEXTURE_NUM%];
uniform int uMaskWrite;
uniform float uMaskAlphaCutoff;

varying vec2 vRegion;
varying float vTextureId;
varying vec4 vColor;

void main(void) {
    vec4 color;
    %GET_COLOR%
    // fragment
    if (uMaskWrite == 1 && color.a <= uMaskAlphaCutoff) {
        discard;
    }
    gl_FragColor = color * vColor;
}
