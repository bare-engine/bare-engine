import { TextureWrapMode } from "../texture";
import type { Rapid } from "../render";
import { ITextOptions, TextureFilterMode } from "../texture";

export type WebGLContext = WebGL2RenderingContext;

export const supportsWebGL = (canvas: HTMLCanvasElement): boolean => {
    const options = { stencil: true }
    const gl = canvas.getContext("webgl2", options) || canvas.getContext("webgl", options)
    return !!gl
}
/**
 * get webgl2 rendering context
 * @param canvas
 * @returns webgl2
 */
export const getContext = (canvas: HTMLCanvasElement, antialias: boolean = false, premultipliedAlpha: boolean = true): WebGLContext => {
    const gl = canvas.getContext("webgl2", { stencil: true, antialias, premultipliedAlpha });
    if (!gl) {
        throw new Error("WebGL2 is not supported in this browser.");
    }
    // lets the browser compile and link programs on worker threads, so the deferred
    // status check in verifyShaderProgram rarely has to wait
    gl.getExtension("KHR_parallel_shader_compile");
    return gl;
}

/**
 * compile string to webgl shader
 * @param gl 
 * @param source 
 * @param type 
 * @returns 
 */
export const compileShader = (gl: WebGLContext, source: string, type: number) => {
    const shader = gl.createShader(type);
    if (!shader) {
        throw new Error("Unable to create webgl shader");
    }
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    // no COMPILE_STATUS query here: it would block until the driver has finished compiling.
    // errors surface in verifyShaderProgram once the program is first used
    return shader;
}

const pendingShaders = new WeakMap<WebGLProgram, { vShader: WebGLShader, fShader: WebGLShader }>();

/**
 * create webgl program by shader string.
 * compiles and links without waiting for the result, so the driver builds the program in
 * the background while the caller carries on. call verifyShaderProgram before first use.
 * @param gl
 * @param vsSource
 * @param fsSource
 * @returns
 */
export const createShaderProgram = (gl: WebGLContext, vsSource: string, fsSource: string) => {
    var program = gl.createProgram(),
        vShader = compileShader(gl, vsSource, 35633),
        fShader = compileShader(gl, fsSource, 35632);
    if (!program) {
        throw new Error("Unable to create program shader");
    }
    gl.attachShader(program, vShader);
    gl.attachShader(program, fShader);
    gl.linkProgram(program);
    // commands wait in the command buffer until something flushes them; without this the
    // link wouldn't even start until the first status query forces a round trip
    gl.flush();
    pendingShaders.set(program, { vShader, fShader });
    return program;
}

/**
 * waits for a program made by createShaderProgram to finish linking and throws with the
 * compiler logs if it failed. safe to call more than once; only the first call blocks.
 */
export const verifyShaderProgram = (gl: WebGLContext, program: WebGLProgram) => {
    const shaders = pendingShaders.get(program);
    if (!shaders) return;
    pendingShaders.delete(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const errorLog = gl.getProgramInfoLog(program);
        const vsLog = gl.getShaderInfoLog(shaders.vShader);
        const fsLog = gl.getShaderInfoLog(shaders.fShader);
        gl.deleteProgram(program);
        throw new Error(`Unable to link shader program: ${errorLog}\nvertex: ${vsLog}\nfragment: ${fsLog}`);
    }
    gl.deleteShader(shaders.vShader);
    gl.deleteShader(shaders.fShader);
}

export function setTextureWrapMode(gl: WebGLRenderingContext | WebGL2RenderingContext, wrapMode: TextureWrapMode) {
    const wrapParam = {
        [TextureWrapMode.CLAMP]: gl.CLAMP_TO_EDGE,
        [TextureWrapMode.REPEAT]: gl.REPEAT,
        [TextureWrapMode.MIRRORED_REPEAT]: gl.MIRRORED_REPEAT,
    }[wrapMode] || gl.CLAMP_TO_EDGE;

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapParam);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapParam);
}

export function setTextureFilterMode(gl: WebGLRenderingContext | WebGL2RenderingContext, filterMode: TextureFilterMode) {
    const filter = {
        [TextureFilterMode.LINEAR]: gl.LINEAR,
        [TextureFilterMode.NEAREST]: gl.NEAREST,
    }[filterMode] ?? gl.NEAREST;

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
}

export interface ICreateTextureOptions extends ITextOptions {
    onlySize?: boolean
}
/**
 * Creates a WebGL texture either from an image source or as a blank texture
 * @param gl - The WebGL rendering context
 * @param source - The image source or dimensions for a blank texture
 * @param filterMode - texture filter mode
 * @returns A WebGL texture
 */
export function createTexture(
    render: Rapid,
    source: TexImageSource | { width: number; height: number },
    options: ICreateTextureOptions,
): WebGLTexture {
    const gl = render.gl
    const texture = gl.createTexture();
    if (!texture) {
        throw new Error("Unable to create WebGL texture");
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    setTextureWrapMode(gl, options.wrap ?? TextureWrapMode.CLAMP);
    setTextureFilterMode(gl, options.textureFilter ?? render.textureFilter);

    if (options.onlySize) {
        // RenderTexture: blank allocation, no source pixels to premultiply
        const s = source as { width: number; height: number };
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, s.width, s.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    } else {
        const premultipliedAlpha = options.premultipliedAlpha ?? render.premultipliedAlpha
        if (premultipliedAlpha) {
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        }
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source as TexImageSource);
        if (premultipliedAlpha) {
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        }
    }

    gl.bindTexture(gl.TEXTURE_2D, null);

    return texture;
}

export function generateShader(fs: string, max: number, id = "vTextureId", uv = "uv", set = "return") {
    if (fs.includes("%TEXTURE_NUM%")) fs = fs.split("%TEXTURE_NUM%").join(max.toString())
    if (fs.includes("%GET_COLOR%")) {
        let code = ""
        for (let index = 0; index < max; index++) {
            if (index == 0) {
                code += `if(${id} == ${index})`
            } else if (index == max - 1) {
                code += `else`
            } else {
                code += `else if(${id} == ${index})`
            }
            code += `{${set} texture(uTextures[${index}], ${uv});}`
        }
        fs = fs.split("%GET_COLOR%").join(code)
    }
    // the same for a texture unit given by an `int unit` and a `uv`, eg the sprite shader's clip image
    if (fs.includes("%GET_UNIT_COLOR%")) {
        fs = generateShader(fs.split("%GET_UNIT_COLOR%").join("%GET_COLOR%"), max, "unit", "uv", set)
    }
    return fs
}
export const FLOAT = 5126;
export const UNSIGNED_BYTE = 5121;

export function vertexAttribDivisor(gl: WebGLContext, index: number, divisor: number): void {
    gl.vertexAttribDivisor(index, divisor);
}

export function drawArraysInstanced(
    gl: WebGLContext,
    mode: number,
    first: number,
    count: number,
    instanceCount: number
): void {
    gl.drawArraysInstanced(mode, first, count, instanceCount);
}
