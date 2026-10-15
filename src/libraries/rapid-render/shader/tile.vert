#version 300 es
precision highp float;
precision highp int;

// one instance per map cell. The cell isn't stored: it follows from the instance's slot, since
// the buffer holds every cell of the map, chunk after chunk, each chunk row by row
layout(location = 0) in vec2 aVertex;
// low 16 bits: tile + 1 (0 = empty), bits 16-17: quarter turns clockwise, bit 18: flip x, bit 19: flip y
layout(location = 1) in uint aTile;

uniform mat4 u_projection;
// the map's transform, as the rows of an affine matrix: [a, c, tx], [b, d, ty]
uniform vec3 uWorld0;
uniform vec3 uWorld1;
uniform vec2 uTileSize;

uniform int uFirstInstance;
uniform int uChunkShift;
uniform int uChunksX;

// per tile: (first frame, frame count, frames per second, 0)
// from uFrameBase on, two texels per frame: (u0, v0, u1, v1), (texture unit, half texel u, half texel v, 0)
uniform highp sampler2D uDefs;
uniform int uFrameBase;
uniform float uTime;

out vec2 vUV;
flat out vec4 vRect;
flat out int vTextureId;

const int DEFS_WIDTH = 256;

vec4 def(int i)
{
    return texelFetch(uDefs, ivec2(i % DEFS_WIDTH, i / DEFS_WIDTH), 0);
}

void main(void)
{
    uint id = aTile & 0xFFFFu;
    if (id == 0u)
    {
        // empty cell: a point outside the clip volume draws nothing
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        return;
    }

    int instance = uFirstInstance + gl_InstanceID;
    int chunk = instance >> (uChunkShift * 2);
    int local = instance & ((1 << (uChunkShift * 2)) - 1);
    int chunkSize = 1 << uChunkShift;
    ivec2 cell = ivec2(chunk % uChunksX, chunk / uChunksX) * chunkSize
        + ivec2(local & (chunkSize - 1), local >> uChunkShift);

    vec4 tile = def(int(id) - 1);
    if (tile.y < 0.5)
    {
        // no frames: its images are still loading
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        return;
    }
    int frame = int(tile.x);
    if (tile.y > 1.0)
        frame += int(mod(floor(uTime * tile.z), tile.y));

    vec4 rect = def(uFrameBase + frame * 2);
    vec4 info = def(uFrameBase + frame * 2 + 1);

    // where in the image this corner samples: undo the turn, then the flips
    uint flags = aTile >> 16u;
    vec2 t = aVertex;
    uint turns = flags & 3u;
    vec2 s = turns == 0u ? t
        : turns == 1u ? vec2(t.y, 1.0 - t.x)
        : turns == 2u ? vec2(1.0 - t.x, 1.0 - t.y)
        : vec2(1.0 - t.y, t.x);
    if ((flags & 4u) != 0u) s.x = 1.0 - s.x;
    if ((flags & 8u) != 0u) s.y = 1.0 - s.y;

    vUV = mix(rect.xy, rect.zw, s);
    // half a texel in from the frame's edges, so neighbours in the atlas never bleed in
    vRect = vec4(rect.xy + info.yz, rect.zw - info.yz);
    vTextureId = int(info.x);

    vec3 position = vec3((vec2(cell) + aVertex) * uTileSize, 1.0);
    gl_Position = u_projection * vec4(dot(uWorld0, position), dot(uWorld1, position), 0.0, 1.0);
}
