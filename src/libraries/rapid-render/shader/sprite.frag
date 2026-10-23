#version 300 es
precision mediump float;

uniform sampler2D uTextures[%TEXTURE_NUM%];

// CLIP is only defined once a clip has been drawn (see SpriteRegion.enableClips): the clip code makes this
// shader several times slower to compile, which every game would otherwise pay at startup
#ifdef CLIP
// the clips of this batch (see Rapid.pushClip), 3 vec4 each: the two rows of the matrix from the sprites'
// space to 0..1 across the clip's image, with the image's texture unit and the slot + 1 of the clip it's in
// itself (0 for none) in their w, then the image's UV rect. not a uniform block, though it compiles faster: ANGLE on
// Direct3D 11 turns a block with an array of 50+ into a structured buffer, and after a draw with this shader no other
// program would link (checked in Edge and Chrome, 2026-10)
uniform highp vec4 uClips[%CLIP_VECTORS%];

flat in int vClip;
in highp vec2 vPosition;
#endif

in vec2 vRegion;
flat in int vTextureId;
flat in int vClampUV;
in vec4 vColor;

in vec4 vUVRect;

out vec4 fragColor;
in vec2 vPadding;

vec4 sampleTexture(vec2 uv) {
    %GET_COLOR%
}

vec4 sampleClampTexture(vec2 uv) {
    vec2 inMin = step(vUVRect.xy, uv);
    vec2 inMax = step(uv, vUVRect.zw);

    float mask = inMin.x * inMin.y * inMax.x * inMax.y;

    return sampleTexture(uv) * mask;
}

vec4 sampleTextureLocal(vec2 uv){
    return sampleClampTexture(mix(vUVRect.xy, vUVRect.zw, uv));
}

#ifdef CLIP
vec4 sampleUnit(int unit, highp vec2 uv) {
    %GET_UNIT_COLOR%
}

// 1 where the pixel is on every clip's image, 0 elsewhere. Like the stencil the clips used to be drawn into,
// any alpha above 0 counts. Up to 4 deep, as many as Rapid.maxClipDepth
float clipCoverage() {
    float coverage = 1.0;
    int slot = vClip;
    for (int depth = 0; depth < 4 && slot > 0; depth++) {
        int i = (slot - 1) * 3;
        highp vec4 row0 = uClips[i];
        highp vec4 row1 = uClips[i + 1];
        highp vec4 rect = uClips[i + 2];
        highp vec3 position = vec3(vPosition, 1.0);
        highp vec2 local = vec2(dot(row0.xyz, position), dot(row1.xyz, position));
        // sampled before the bounds test, so the lookup isn't in a branch that differs per pixel
        float alpha = sampleUnit(int(row0.w), mix(rect.xy, rect.zw, local)).a;
        vec2 inside = step(0.0, local) * step(local, vec2(1.0));
        coverage *= inside.x * inside.y * (alpha > 0.0 ? 1.0 : 0.0);
        slot = int(row1.w);
    }
    return coverage;
}
#endif

#ifdef CUSTOM_FRAGMENT
// the object's color without its alpha, for a custom fragment() that samples the texture again
vec4 spriteTint;
#endif
// CUSTOM_CODE

void main(void) {
    // atlas regions clamp so padding never samples a neighbouring frame; plain textures keep
    // their wrap mode. one program for both, picked per instance
    vec4 texel = vClampUV == 1 ? sampleClampTexture(vRegion) : sampleTexture(vRegion);

#ifdef CUSTOM_FRAGMENT
    // a custom fragment() sees the tint without the alpha, and the alpha comes after it, so what it adds (a flash,
    // an outline) fades along with the object. The same as when it's drawn as a filter, which has alpha 1 here
    float alpha = vColor.a;
#ifdef PREMULTIPLIED
    spriteTint = vec4(alpha > 0.0 ? vColor.rgb / alpha : vec3(0.0), 1.0);
#else
    spriteTint = vec4(vColor.rgb, 1.0);
#endif
    fragColor = texel * spriteTint;

    // CUSTOM_CODE_CALL

#ifdef PREMULTIPLIED
    fragColor *= alpha;
#else
    fragColor.a *= alpha;
#endif
#else
    fragColor = texel * vColor;
#endif

#ifdef CLIP
    // last, so it also cuts what a custom shader draws, like an outline
    if (vClip > 0)
        fragColor *= clipCoverage();
#endif
}
