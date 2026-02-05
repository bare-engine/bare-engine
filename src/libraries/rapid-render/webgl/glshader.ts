import { IAttribute, ShaderType, WebGLContext } from "../interface"
import Rapid from "../render"
import { Uniform } from "./uniform"
import { createShaderProgram, generateFragShader } from "./utils"
import graphicFragString from "../shader/graphic.frag";
import graphicVertString from "../shader/graphic.vert";
import spriteFragString from "../shader/sprite.frag";
import spriteVertString from "../shader/sprite.vert";
import { spriteAttributes } from "../regions/attributes"
import { graphicAttributes } from "../regions/attributes"
import RenderRegion from "../regions/region"

type ShaderPadding = { x: number, y: number }

class GLShader {
    attributeLoc: Record<string, number> = {}
    uniformLoc: Record<string, WebGLUniformLocation> = {}
    program: WebGLProgram
    textureUnitNum: number = 0
    padding: ShaderPadding = { x: 0, y: 0 }

    private attributes: IAttribute[] = []
    private gl: WebGLContext

    constructor(
        rapid: Rapid,
        vs: string,
        fs: string,
        attributes?: IAttribute[],
        textureUnitNum: number = 0,
        padding: number | ShaderPadding = 0
    ) {
        const processedFragmentShaderSource = generateFragShader(fs, rapid.maxTextureUnits - textureUnitNum)
        this.program = createShaderProgram(rapid.gl, vs, processedFragmentShaderSource)
        this.gl = rapid.gl
        this.textureUnitNum = textureUnitNum
        this.parseShader(vs);
        this.parseShader(processedFragmentShaderSource);
        this.setPadding(padding)
        if (attributes) {
            this.setAttributes(attributes)
        }
    }
    /**
     * Set the uniform of this shader
     * @param uniforms 
     * @param usedTextureUnit How many texture units have been used
     */
    setUniforms(uniform: Uniform, region: RenderRegion) {
        const gl = this.gl;
        for (const uniformName of uniform.getUnifromNames()) {
            const loc = this.getUniform(uniformName);

            uniform.bind(gl, uniformName, loc, region)
        }
    }

    private getUniform(name: string) {
        return this.uniformLoc[name]
    }
    /**
     * use this shader
     */
    use() {
        this.gl.useProgram(this.program)
    }
    private parseShader(shader: string) {
        const gl = this.gl

        const attributeMatches = shader.match(/attribute\s+\w+\s+(\w+)/g);
        if (attributeMatches) {
            for (const match of attributeMatches) {
                const name = match.split(' ')[2];
                const loc = gl.getAttribLocation(this.program, name)!
                if (loc != -1) this.attributeLoc[name] = loc
            }
        }

        const uniformMatches = shader.match(/uniform\s+\w+\s+(\w+)/g);
        if (uniformMatches) {
            for (const match of uniformMatches) {
                const name = match.split(' ')[2];
                this.uniformLoc[name] = gl.getUniformLocation(this.program, name)!;
            }
        }
    }
    /**
     * Set vertex attribute in glsl shader
     * @param element 
     */
    setAttribute(element: IAttribute) {
        const loc = this.attributeLoc[element.name]
        if (typeof loc != "undefined") {
            const gl = this.gl
            gl.vertexAttribPointer(
                loc,
                element.size,
                element.type,
                element.normalized || false,
                element.stride,
                element.offset || 0
            );
            gl.enableVertexAttribArray(loc);
        }
    }

    /**
     * Set vertex attributes in glsl shader
     * @param elements 
     */
    setAttributes(elements: IAttribute[]) {
        this.attributes = elements
        for (const element of elements) {
            this.setAttribute(element)
        }
    }

    updateAttributes() {
        this.setAttributes(this.attributes)
    }

    setPadding(padding: number | ShaderPadding = 0) {
        this.padding = typeof padding === "number" ? { x: padding, y: padding } : { x: padding.x, y: padding.y }
        return this
    }

    static createCostumShader(
        rapid: Rapid,
        vs: string,
        fs: string,
        type: ShaderType,
        textureUnitNum: number = 0,
        padding: number | ShaderPadding = 0
    ) {
        let baseFs = {
            [ShaderType.SPRITE]: spriteFragString,
            [ShaderType.GRAPHIC]: graphicFragString,
        }[type]
        let baseVs = {
            [ShaderType.SPRITE]: spriteVertString,
            [ShaderType.GRAPHIC]: graphicVertString,
        }[type]
        const attribute = {
            [ShaderType.SPRITE]: spriteAttributes,
            [ShaderType.GRAPHIC]: graphicAttributes,
        }[type]

        baseFs = baseFs.replace('void main(void) {', fs + '\nvoid main(void) {')
        baseVs = baseVs.replace('void main(void) {', vs + '\nvoid main(void) {')
        baseFs = baseFs.replace('// fragment', 'fragment(color);')
        baseVs = baseVs.replace(/\/\/ vertex s[\s\S]*?\/\/ vertex e/,
            `vec2 position = aPosition;
            vertex(position, vRegion);
            gl_Position = uProjectionMatrix * vec4(position, 0.0, 1.0);`
        )
        return new GLShader(rapid, baseVs, baseFs, attribute, textureUnitNum, padding)
    }
}

export default GLShader
