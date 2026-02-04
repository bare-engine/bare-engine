precision mediump float;
varying vec2 vRegion;
varying vec4 vColor;

uniform sampler2D uTexture;
uniform int uUseTexture;
uniform int uMaskWrite;
uniform float uMaskAlphaCutoff;

void main(void) {
    vec4 color;
    if(uUseTexture > 0){
        color = texture2D(uTexture, vRegion) * vColor;
    }else{
        color = vColor;
    }
    // fragment
    if (uMaskWrite == 1 && color.a <= uMaskAlphaCutoff) {
        discard;
    }
    gl_FragColor = color;
}
