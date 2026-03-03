import Rapid from "./render"
import { Images, ITextTextureOptions, TextureWrapMode, WebGLContext } from "./interface"
import { Color } from "./math"
import { createTexture } from "./webgl/utils"

/**
 * texture manager
 * @ignore
 */
class TextureCache {
    private antialias: boolean

    constructor(antialias: boolean) {
        this.antialias = antialias
    }

    setAntialias(antialias: boolean) {
        this.antialias = antialias
    }

    getAntialias() {
        return this.antialias
    }
    
    /**
     * create texture from url
     * Equivalent to {@link Texture.fromUrl} method
     * @param url 
     * @param antialias 
     * @returns 
     */
    async textureFromUrl(url: string, antialias: boolean = this.antialias, wrapMode: TextureWrapMode = TextureWrapMode.CLAMP) {
        var image = await this.loadImage(url);
        var base = BaseTexture.fromImageSource(image, antialias, wrapMode);
        base.sourceUrl = url;
        return new Texture(base);
    }

    addImageFromSource(image: HTMLImageElement, antialias: boolean = this.antialias, wrapMode: TextureWrapMode = TextureWrapMode.CLAMP) {
        var base = BaseTexture.fromImageSource(image, antialias, wrapMode);
        return new Texture(base)
    }
    
    /**
     * Create a new `Texture` instance from a FrameBufferObject.
     * @param fbo - The FrameBufferObject to create the texture from.
     * @returns A new `Texture` instance created from the specified FrameBufferObject.
     */
    textureFromFrameBufferObject(fbo: FrameBufferObject) {
        return new Texture(fbo)
    }

    /**
     * Create a new `Texture` instance from an image source.
     * @param source - The image source to create the texture from.
     * @param antialias - Whether to enable antialiasing.
     * @returns A new `Texture` instance created from the specified image source.
     */
    /*async textureFromSource(source: Images, antialias: boolean = this.antialias, wrapMode: TextureWrapMode = TextureWrapMode.CLAMP) {
        let base = this.cache.get(source)
        if (!base) {
            base = BaseTexture.fromImageSource(this.render, source, antialias, wrapMode)
            this.cache.set(source, base)
        }
        return new Texture(base)
    }*/
    
    /**
     * Load an image from the specified URL.
     * @param url - The URL of the image to load.
     * @returns A promise that resolves to the loaded HTMLImageElement.
     */
    async loadImage(url: string): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => {
                resolve(image);
            };
            image.onerror = () => {
                reject(new Error(`Failed to load image: ${url}`));
            };
            image.src = url;
        });
    };
    /**
     * Create a new `Text` instance.
     * @param options - The options for rendering the text, such as font, size, color, etc.
     * @returns A new `Text` instance.
     */
    createText(options: ITextTextureOptions) {
        return new BareText(options)
    }
    /**
     * Destroy the texture
     * @param texture 
     */
    destroy(texture: Texture | BaseTexture) {
        if (texture instanceof Texture) {
            texture.base?.destroy(rapid.gl)
        } else {
            texture.destroy(rapid.gl)
        }
    }
    /**
     * Create a new FrameBufferObject instance
     * @param width - Width of the framebuffer
     * @param height - Height of the framebuffer
     * @param antialias - Whether to enable antialiasing
     * @returns A new FrameBufferObject instance
     */
    createFrameBufferObject(width: number, height: number, antialias: boolean = this.antialias) {
        return new FrameBufferObject(width, height, antialias)
    }
}

/**
 * Each {@link Texture} references a baseTexture, and different textures may have the same baseTexture
 */
class BaseTexture {
    texture: WebGLTexture
    width: number
    height: number
    wrapMode: TextureWrapMode
    sourceUrl?: string
    constructor(texture: WebGLTexture, width: number, height: number, wrapMode: TextureWrapMode = TextureWrapMode.CLAMP) {
        this.texture = texture
        this.width = width
        this.height = height
        this.wrapMode = wrapMode
    }
    static fromImageSource(image: Images, antialias: boolean = false, wrapMode: TextureWrapMode = TextureWrapMode.CLAMP) {
        return new BaseTexture(
            createTexture(rapid.gl, image, antialias, false, false, wrapMode),
            image.width,
            image.height
        )
    }
    /**
     * Destroy the texture
     * @param gl 
     * @ignore
     */
    destroy(gl: WebGLContext) {
        gl.deleteTexture(this.texture)
    }
}

class Texture {
    /**
     * Reference to the {@link BaseTexture} used by this texture.
     */
    base?: BaseTexture;

    /**
     * The x-coordinate of the top-left corner of the clipped region.
     */
    clipX!: number;

    /**
     * The y-coordinate of the top-left corner of the clipped region.
     */
    clipY!: number;

    /**
     * The width of the clipped region.
     */
    clipW!: number;

    /**
     * The height of the clipped region.
     */
    clipH!: number;

    /**
     * The width of the texture.
     */
    width!: number;

    /**
     * The height of the texture.
     */
    height!: number;

    isRotated: boolean = false; // true when texture region is rotated 90 degrees clockwise

    sourceSize: {w: number, h: number} 
    spriteSourceSize: {x: number, y: number, w: number, h: number}
    frame: {x: number, y: number, w: number, h: number}  

    /**
     * Image scaling factor
     */
    protected scale: number = 1
    /**
     * Creates a new `Texture` instance with the specified base texture reference.
     * @param base - The {@link BaseTexture} to be used by the texture.
     */
    constructor(base?: BaseTexture) {
        this.setBaseTexture(base)
    }
    /**
     * Set or change BaseTexture
     * @param base 
     * @param scale 
     */
    setBaseTexture(base?: BaseTexture) {
        if (base) {
            this.base = base
            this.setClipRegion(0, 0, base.width, base.height)
        }
    }
    /**
     * Sets the region of the texture to be used for rendering.
     * @param x - The x-coordinate of the top-left corner of the region.
     * @param y - The y-coordinate of the top-left corner of the region.
     * @param w - The width of the region.
     * @param h - The height of the region.
     */
    setClipRegion(x: number, y: number, w: number, h: number) {
        if (!this.base) return this;

        const bw = this.base.width;
        const bh = this.base.height;

        const u0 = x / bw;
        const v0 = y / bh;
        const u1 = (x + w) / bw;
        const v1 = (y + h) / bh;

        this.clipX = u0;
        this.clipY = v0;
        this.clipW = u1;
        this.clipH = v1;

        this.width = (this.isRotated ? h : w) * this.scale;
        this.height = (this.isRotated ? w : h) * this.scale;

        return this;
    }


    /**
     * Creates a new `Texture` instance from the specified image source.
     * @param image - The image source to create the texture from.
     * @param antialias - Whether to enable antialiasing for the texture. Default is `false`.
     * @returns A new `Texture` instance created from the image source.
     */
    static fromImageSource(image: Images, antialias: boolean = false) {
        return new Texture(
            BaseTexture.fromImageSource(image, antialias)
        )
    }
    /**
     * Creates a new `Texture` instance from the specified URL.
     * @param url - The URL of the image to create the texture from.
     * @returns A new `Texture` instance created from the specified URL.
     */
    static fromUrl(url: string) {
        return rapid.textures.textureFromUrl(url)
    }
    /**
     * Converts the current texture into a spritesheet.
     * @param spriteWidth - The width of each sprite in the spritesheet.
     * @param spriteHeight - The height of each sprite in the spritesheet.
     * @returns An array of `Texture` instances representing the sprites in the spritesheet.
     */
    createSpritesheet(spriteWidth: number, spriteHeight: number): Texture[] {
        if (!this.base) return [];
        const sprites: Texture[] = [];
        const columns = Math.floor(this.base.width / spriteWidth);
        const rows = Math.floor(this.base.height / spriteHeight);
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < columns; x++) {
                const sprite = this.clone();
                sprite.setClipRegion(
                    x * spriteWidth,
                    y * spriteHeight,
                    spriteWidth,
                    spriteHeight
                );
                sprites.push(sprite);
            }
        }
        return sprites;
    }
    /**
     * Clone the current texture
     * @returns A new `Texture` instance with the same base texture reference.
     */
    clone() {
        return new Texture(this.base)
    }
}

class RenderTexture extends Texture {
    fbo: FrameBufferObject;
    clearColor?: Color;

    /**
     * Creates a new render texture backed by an FBO.
     * @param width - Width of the framebuffer
     * @param height - Height of the framebuffer
     * @param antialias - Whether to enable antialiasing
     * @param color - Optional clear color to use when rendering to this texture
     */
    constructor(
        width: number,
        height: number,
        antialias: boolean = rapid.textures.getAntialias(),
        color?: Color
    ) {
        const fbo = new FrameBufferObject(width, height, antialias);
        super(fbo);
        this.fbo = fbo;
        this.clearColor = color;
        if (this.clearColor) {
            this.fillColor(this.clearColor);
        }
    }

    /**
     * Fill the entire render texture with a color.
     * If no color is provided, uses the configured clearColor (if any).
     */
    fillColor(color?: Color) {
        const fill = color || this.clearColor;
        if (!fill) return;

        const gl = rapid.gl;
        const prevFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
        const prevViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;
        const prevScissor = gl.getParameter(gl.SCISSOR_BOX) as Int32Array;
        const prevClear = gl.getParameter(gl.COLOR_CLEAR_VALUE) as Float32Array;

        this.fbo.bind(false);
        gl.viewport(0, 0, this.fbo.width, this.fbo.height);
        gl.scissor(0, 0, this.fbo.width, this.fbo.height);
        gl.clearColor(fill.r / 255, fill.g / 255, fill.b / 255, fill.a / 255);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.clearColor(prevClear[0], prevClear[1], prevClear[2], prevClear[3]);
        gl.bindFramebuffer(gl.FRAMEBUFFER, prevFramebuffer);
        gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);
        gl.scissor(prevScissor[0], prevScissor[1], prevScissor[2], prevScissor[3]);
    }

    /**
     * Resize the underlying framebuffer and update clip region.
     * @param width - New width
     * @param height - New height
     */
    resize(width: number, height: number) {
        this.fbo.resize(width, height);
        this.setClipRegion(0, 0, width, height);
    }

    /**
     * Get raw pixels from the render texture.
     * @param x - X coordinate in pixel space (top-left origin).
     * @param y - Y coordinate in pixel space (top-left origin).
     * @param width - Width of the region to read.
     * @param height - Height of the region to read.
     */
    GetPixels(x: number = 0, y: number = 0, width: number = this.width, height: number = this.height): Uint8Array {
        if (!this.base) return new Uint8Array(0);

        const texWidth = this.fbo.width;
        const texHeight = this.fbo.height;
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        const iw = Math.floor(width);
        const ih = Math.floor(height);

        if (iw <= 0 || ih <= 0) return new Uint8Array(0);
        if (ix < 0 || iy < 0 || ix >= texWidth || iy >= texHeight) {
            return new Uint8Array(0);
        }

        const readW = Math.min(iw, texWidth - ix);
        const readH = Math.min(ih, texHeight - iy);
        const readY = iy;

        const gl = rapid.gl;
        const prevFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
        const prevTexture = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
        const pixels = new Uint8Array(readW * readH * 4);

        this.fbo.bind(false);
        gl.readPixels(ix, readY, readW, readH, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        gl.bindFramebuffer(gl.FRAMEBUFFER, prevFramebuffer);
        gl.bindTexture(gl.TEXTURE_2D, prevTexture);

        return pixels;
    }

    /**
     * Get the color at a pixel in the render texture.
     * @param x - X coordinate in pixel space (top-left origin).
     * @param y - Y coordinate in pixel space (top-left origin).
     */
    GetColorAt(x: number, y: number): Color {
        const pixels = this.GetPixels(x, y, 1, 1);
        if (pixels.length < 4) return Color.TRANSPARENT.clone();
        return new Color(pixels[0], pixels[1], pixels[2], pixels[3]);
    }

    /**
     * Destroy framebuffer resources.
     */
    destroy() {
        if (this.base) {
            this.base.destroy(rapid.gl);
            this.base = undefined;
        }
    }
}

/**
 * @ignore
 */
export const SCALEFACTOR = 2
class BareText extends Texture {
    private options: ITextTextureOptions;
    protected override scale: number = 1 / SCALEFACTOR
    text: string;

    /**
     * Creates a new `Text` instance.
     * @param options - The options for rendering the text, such as font, size, color, etc.
     */
    constructor(options: ITextTextureOptions) {
        super()
        this.options = options;
        this.text = options.text || ' '
        this.updateTextImage()
    }
    public updateTextImage() {
        const canvas = this.createTextCanvas();
        this.setBaseTexture(BaseTexture.fromImageSource(canvas, true))
    }
    /**
     * Creates a canvas element for rendering text.
     * @returns HTMLCanvasElement - The created canvas element.
     */
    private createTextCanvas(): HTMLCanvasElement {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        if (!context) {
            throw new Error('Failed to get canvas context');
        }

        context.font = `${this.options.fontSize || 16}px ${this.options.fontFamily || 'Arial'}`;
        context.fillStyle = this.options.color || '#000';
        context.textAlign = this.options.textAlign || 'left';
        context.textBaseline = this.options.textBaseline || 'top';

        // Measure text to adjust canvas size
        const lines = this.text.split('\n');
        let maxWidth = 0;
        let totalHeight = 0;

        for (const line of lines) {
            const metrics = context.measureText(line);
            maxWidth = Math.max(maxWidth, metrics.width);
            totalHeight += (this.options.fontSize || 16);
        }

        canvas.width = maxWidth * SCALEFACTOR;
        canvas.height = totalHeight * SCALEFACTOR;
        context.scale(SCALEFACTOR, SCALEFACTOR);
        
        // Redraw the text on the correctly sized canvas
        context.font = `${this.options.fontSize || 16}px ${this.options.fontFamily || 'Arial'}`;
        context.fillStyle = this.options.color || '#000';
        context.textAlign = this.options.textAlign || 'left';
        context.textBaseline = this.options.textBaseline || 'top';

        // Adjust x position based on text alignment
        let xPosition = 0;
        if (this.options.textAlign === 'center') {
            xPosition = maxWidth / 2;
        } else if (this.options.textAlign === 'right') {
            xPosition = maxWidth;
        }

        let yOffset = 0;
        for (const line of lines) {
            context.fillText(line, xPosition, yOffset);
            yOffset += (this.options.fontSize || 16);
        }

        return canvas;
    }
    /**
     * Update the displayed text
     * @param text 
     */
    setText(text: string) {
        if (this.text == text) return

        this.text = text
        this.updateTextImage()
    }
}

class FrameBufferObject extends BaseTexture {
    public framebuffer: WebGLFramebuffer;
    private gl: WebGLContext;

    /**
     * Creates a new FrameBufferObject instance
     * @param width - Width of the framebuffer
     * @param height - Height of the framebuffer
     * @param antialias - Whether to enable antialiasing
     */
    constructor(width: number, height: number, antialias: boolean = false) {
        // Create the texture first
        const gl = rapid.gl;
        const texture = createTexture(gl, { width, height }, antialias, true, false)

        // Create and setup framebuffer
        const framebuffer = gl.createFramebuffer();
        if (!framebuffer) {
            gl.deleteTexture(texture);
            throw new Error('Failed to create WebGL framebuffer');
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D,
            texture,
            0
        );

        const stencilBuffer = gl.createRenderbuffer();
        if (!stencilBuffer) {
            gl.deleteFramebuffer(framebuffer);
            gl.deleteTexture(texture);
            throw new Error("Failed to create depth-stencil renderbuffer");
        }

        gl.bindRenderbuffer(gl.RENDERBUFFER, stencilBuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.STENCIL_INDEX8, width, height);
        gl.framebufferRenderbuffer(
            gl.FRAMEBUFFER,
            gl.STENCIL_ATTACHMENT,
            gl.RENDERBUFFER,
            stencilBuffer
        );

        super(texture, width, height);

        this.gl = gl;
        this.framebuffer = framebuffer;

        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    /**
     * Bind the framebuffer for rendering
     * @ignore
     */
    bind(clear: boolean = true) {
        const gl = this.gl

        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);

        if (clear) {
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }
    }

    /**
     * Unbind the framebuffer and restore default framebuffer
     * @ignore
     */
    unbind() {
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
        this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    }

    /**
     * Resize the framebuffer
     * @param width - New width
     * @param height - New height
     */
    resize(width: number, height: number) {
        this.width = width;
        this.height = height;

        this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
        this.gl.texImage2D(
            this.gl.TEXTURE_2D,
            0,
            this.gl.RGBA,
            width,
            height,
            0,
            this.gl.RGBA,
            this.gl.UNSIGNED_BYTE,
            null
        );
        this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    }

    /**
     * Override destroy method to clean up framebuffer resources
     * @param gl - WebGL context
     */
    override destroy(gl: WebGLContext) {
        gl.deleteFramebuffer(this.framebuffer);
        super.destroy(gl);
    }
}

export {
    BareText,
    Texture,
    RenderTexture,
    BaseTexture,
    TextureCache,
    FrameBufferObject
}
