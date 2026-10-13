import { Color } from "./color";
import type { ITransformOptions } from "./matrix-engine";
import { Vec2 } from "./math";
import { Texture } from "./texture";
import GLShader, { CustomGlShader } from "./webgl/glshader";
import { getLineGeometry, LineTextureMode } from "./line";
import type { ILineRenderOptions } from "./line";
import type { Rapid } from "./render";

export type DrawShader = GLShader | CustomGlShader;
export type DrawPoint = Vec2 | { x: number; y: number };

export interface IDrawOptions extends ITransformOptions, IDisplayOptions {
}

export interface IDisplayOptions {
    shader?: DrawShader;
    customMatrix?: number;
}

export interface IDrawParticleBatchOptions extends IDisplayOptions {
    texture: Texture;
    x: ArrayLike<number>;
    y: ArrayLike<number>;
    /** In degrees. */
    rotation?: ArrayLike<number> | number;
    color?: ArrayLike<Color> | ArrayLike<number> | number;
    count?: number;
    scaleX?: ArrayLike<number> | number;
    scaleY?: ArrayLike<number> | number;
    originX?: number;
    originY?: number;
    flipX?: boolean;
    flipY?: boolean;
    reverseOrder?: boolean;

    u0?: ArrayLike<number> | number;
    v0?: ArrayLike<number> | number;
    u1?: ArrayLike<number> | number;
    v1?: ArrayLike<number> | number;
}

export interface ISpriteOptions extends IDrawOptions {
    texture: Texture;
    color?: Color;
    flipX?: boolean;
    flipY?: boolean;
    padding?: number
}

export interface IGraphicOptions extends IDrawOptions {
    points: DrawPoint[];
    color?: Color | Color[];
    drawMode?: number;
    uv?: DrawPoint[];
    texture?: Texture;
    /** Wrap uvs outside 0..1 inside the texture's frame, so the texture tiles (works for atlas sub-textures). */
    repeatTexture?: boolean;
}

export interface IMaskImageOptions extends IDrawOptions {
    texture: Texture;
}

export interface ILineOptions extends ILineRenderOptions, IDrawOptions { }

/** A line along the edge of a shape, half inside and half outside it. */
export interface IOutlineOptions {
    width: number;
    /** Default black. */
    color?: Color;
}

export interface IShapeOptions {
    /** Draw a line along the edge. */
    outline?: IOutlineOptions;
    /** Fill the shape. Default true; false draws only the outline. */
    fill?: boolean;
}

export interface IRectOptions extends IDrawOptions, IShapeOptions {
    width: number;
    height: number;
    color?: Color;
    texture?: Texture;
}

export interface IRoundedRectOptions extends IRectOptions {
    /**
     * The corner radius in pixels. A single value rounds every corner equally,
     * or pass [topLeft, topRight, bottomRight, bottomLeft] to round them apart.
     * Radii are clamped so they can never overrun the rectangle.
     */
    radius: number | [number, number, number, number];
    /** The number of segments used to approximate each corner arc. */
    segments?: number;
}

export interface ICircleOptions extends IDrawOptions, IShapeOptions {
    radius: number;
    color?: Color;
    segments?: number;
}

const withOptionsTransform = (
    rapid: Rapid,
    options: IDrawOptions,
    width: number,
    height: number,
) => {
    const temporary = rapid.matrix.temporary

    if (options.customMatrix !== undefined) {
        rapid.matrixStack.applyTransform(
            options,
            width,
            height,
            temporary,
            options.customMatrix,
        );
        return temporary;
    }

    if (options.modifyStack) {
        rapid.matrixStack.applyTransform(
            options,
            width,
            height
        );

        return
    } else {
        rapid.matrixStack.applyTransform(
            options,
            width,
            height,
            temporary,
            rapid.matrixStack.curWorldM,
        );
        return temporary
    }
};

// A closed line along points, in the same space as the shape's fill (matrix), so it follows the
// shape's position, rotation, scale and origin
const drawOutline = (rapid: Rapid, points: DrawPoint[], outline: IOutlineOptions, shader: DrawShader | undefined, matrix: number | undefined): void => {
    if (rapid.inCreateMask || outline.width <= 0) {
        return;
    }

    const { vertices } = getLineGeometry({ points: points.map(p => new Vec2(p.x, p.y)), closed: true, width: outline.width });
    const color = rapid.getColorUint32(outline.color ?? Color.Black);

    rapid.startGraphic(rapid.gl.TRIANGLES, undefined, shader, matrix);
    for (const vertex of vertices) {
        rapid.addGraphicVertex(vertex.x, vertex.y, 0, 0, color);
    }
    rapid.endGraphic();
};

// The edge of a rounded rectangle, clockwise from the top left like addRoundedRectVertex
const getRoundedRectPoints = (w: number, h: number, radius: number | [number, number, number, number], segments: number = 8): Vec2[] => {
    const max = Math.min(w, h) / 2;
    const radii = (typeof radius == "number" ? [radius, radius, radius, radius] : radius)
        .map((r) => Math.max(0, Math.min(r, max)));
    const corners = [
        { cx: radii[0], cy: radii[0], r: radii[0], start: Math.PI },
        { cx: w - radii[1], cy: radii[1], r: radii[1], start: Math.PI * 1.5 },
        { cx: w - radii[2], cy: h - radii[2], r: radii[2], start: 0 },
        { cx: radii[3], cy: h - radii[3], r: radii[3], start: Math.PI * 0.5 },
    ];
    const cornerSegments = Math.max(1, Math.floor(segments));
    const points: Vec2[] = [];
    for (const corner of corners) {
        const steps = corner.r > 0 ? cornerSegments : 0;
        for (let i = 0; i <= steps; i++) {
            const angle = corner.start + (Math.PI / 2) * (steps ? i / steps : 0);
            points.push(new Vec2(corner.cx + Math.cos(angle) * corner.r, corner.cy + Math.sin(angle) * corner.r));
        }
    }
    return points;
};

export const getColorUint32 = (premultipliedAlpha: boolean, color?: Color): number => {
    if (!color) return 0xFFFFFFFF;
    return premultipliedAlpha ? color.premultipliedUint32 : color.uint32;
};

const ATLAS_PADDING = 2
export const drawSprite = (rapid: Rapid, options: ISpriteOptions): void => {
    const matrix = withOptionsTransform(rapid, options, options.texture.rawWidth, options.texture.rawHeight)
    drawSpriteWithMatrix(rapid, options.texture, matrix ?? options.customMatrix ?? rapid.matrixStack.curWorldM,
        options.color, options.shader, !!options.flipX, !!options.flipY, options.padding);
};

/** Internal sprite submission for callers that have already applied their transform. */
export const drawSpriteWithMatrix = (
    rapid: Rapid, texture: Texture, matrix: number, color?: Color, shader?: DrawShader,
    flipX: boolean = false, flipY: boolean = false, padding?: number,
): void => {
    if (!texture?.base || rapid.inCreateMask) {
        return;
    }

    const region = rapid.spriteRegion
    rapid.enterRegion(region, shader);

    let u0 = texture.uvX;
    let v0 = texture.uvY;
    let u1 = texture.uvW;
    let v1 = texture.uvH;

    flipY = flipY !== !!texture.flipY; // XOR

    // pixel size
    let p = (padding ?? region.currentShader.padding);
    if (texture.isAtlas) {
        p += ATLAS_PADDING
    }

    // pass pixel size not uv size
    const paddingX = (u0 <= u1 ? p : -p);
    const paddingY = (v0 <= v1 ? p : -p);

    // padded quads sample outside the texture rect - clamp so that area stays transparent
    // instead of smearing the edge pixels (CLAMP_TO_EDGE) of plain textures
    const clampUV = texture.isAtlas || p > 0;

    region.drawSprite(
        texture,
        matrix,
        u0,
        v0,
        u1,
        v1,
        rapid.getColorUint32(color),
        paddingX,
        paddingY,
        flipX,
        flipY,
        texture.isRotated,
        clampUV,
    );
};

export const drawParticles = (rapid: Rapid, options: IDrawParticleBatchOptions): void => {
    const region = rapid.particleRegion
    rapid.enterRegion(region, options.shader);
    const texture = options.texture

    const count = options.count ?? options.x.length;
    const color = options.color;

    region.drawParticles(
        texture,
        options.x,
        options.y,
        options.rotation,
        color,
        count,
        options.scaleX,
        options.scaleY,
        options.u0 ?? texture.uvX,
        options.v0 ?? texture.uvY,
        options.u1 ?? texture.uvW,
        options.v1 ?? texture.uvH,
        options.flipX,
        options.flipY,
        texture.isRotated,
        options.originX,
        options.originY,
        rapid.premultipliedAlpha,
        options.reverseOrder,
        options.customMatrix
    )
};

export const drawGraphic = (rapid: Rapid, options: IGraphicOptions): void => {
    if (options.points.length === 0) return;

    const matrix = withOptionsTransform(rapid, options, 0, 0);
    rapid.startGraphic(
        options.drawMode ?? rapid.gl.TRIANGLES,
        options.texture,
        options.shader,
        matrix ?? options.customMatrix,
        options.repeatTexture ?? false,
    );

    for (let i = 0; i < options.points.length; i++) {
        const point = options.points[i];
        const uv = options.uv?.[i];
        const color = Array.isArray(options.color) ? options.color[i] : options.color;

        rapid.addGraphicVertex(
            point.x,
            point.y,
            uv?.x ?? 0,
            uv?.y ?? 0,
            rapid.getColorUint32(color),
        );
    }

    rapid.endGraphic();
};

export const drawLine = (rapid: Rapid, options: ILineOptions): void => {
    if (rapid.inCreateMask) {
        return;
    }

    const { vertices, uv } = getLineGeometry(options);
    drawGraphic(rapid, {
        ...options,
        points: vertices,
        uv,
        drawMode: rapid.gl.TRIANGLES,
        repeatTexture: options.textureMode === LineTextureMode.REPEAT,
    });
};

export const drawMaskImage = (rapid: Rapid, options: IMaskImageOptions): void => {
    const matrix = withOptionsTransform(
        rapid,
        options,
        options.texture.rawWidth,
        options.texture.rawHeight,
    );
    rapid.startMaskGraphic(
        rapid.gl.TRIANGLE_FAN,
        options.texture,
        matrix ?? options.customMatrix,
    );
    rapid.addRectVertex(options.texture.rawWidth, options.texture.rawHeight);
    rapid.endGraphic();
};

export const drawRect = (rapid: Rapid, options: IRectOptions): void => {
    const matrix = withOptionsTransform(rapid, options, options.width, options.height)

    if (options.fill !== false) {
        rapid.startGraphic(
            rapid.gl.TRIANGLE_FAN,
            options.texture,
            options.shader,
            matrix ?? options.customMatrix,
        );
        rapid.addRectVertex(options.width, options.height, options.color);
        rapid.endGraphic();
    }

    if (options.outline) {
        const { width: w, height: h } = options;
        drawOutline(rapid, [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }], options.outline, options.shader, matrix ?? options.customMatrix);
    }
};

export const drawCircle = (rapid: Rapid, options: ICircleOptions): void => {
    const segments = options.segments ?? 32;
    const matrix = withOptionsTransform(rapid, options, 0, 0);

    if (options.fill !== false) {
        rapid.startGraphic(
            rapid.gl.TRIANGLE_FAN,
            undefined,
            options.shader,
            matrix ?? options.customMatrix,
        );

        const unitColor = rapid.getColorUint32(options.color);
        rapid.addGraphicVertex(0, 0, 0.5, 0.5, unitColor);
        rapid.addCircleVertex(options.radius, options.color, segments);
        rapid.addGraphicVertex(options.radius, 0, 1, 0.5, unitColor);
        rapid.endGraphic();
    }

    if (options.outline) {
        const points: Vec2[] = [];
        for (let i = 0; i < segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            points.push(new Vec2(Math.cos(angle) * options.radius, Math.sin(angle) * options.radius));
        }
        drawOutline(rapid, points, options.outline, options.shader, matrix ?? options.customMatrix);
    }
};

export const drawRoundedRect = (rapid: Rapid, options: IRoundedRectOptions): void => {
    const matrix = withOptionsTransform(rapid, options, options.width, options.height)

    if (options.fill !== false) {
        rapid.startGraphic(
            rapid.gl.TRIANGLE_FAN,
            options.texture,
            options.shader,
            matrix ?? options.customMatrix,
        );
        rapid.addRoundedRectVertex(options.width, options.height, options.radius, options.color, options.segments);
        rapid.endGraphic();
    }

    if (options.outline) {
        drawOutline(rapid, getRoundedRectPoints(options.width, options.height, options.radius, options.segments),
            options.outline, options.shader, matrix ?? options.customMatrix);
    }
};
