import type { Scene } from "../scenes/scene";
import type { GameObject } from "../objects/gameObject";
import type { ArcadeObjectEntity } from "../objects/arcadeObject";
import type { ButtonEntity } from "../objects/button";
import type { TextObjectEntity } from "../objects/textObject";
import type { CircleEntity } from "../libraries/sopiro/circle";
import type { PolygonEntity } from "../libraries/sopiro/polygon";
import type { RigidBody } from "../libraries/sopiro/rigidbody";
import type { Component } from "../controllers/componentController";
import { CanvasScaleMode, Color, CustomGlShader, TextureFilterMode, UniformValue } from "../libraries/rapid-render";

export type Scalar = (number | string | boolean);

export type BareOptions =
{
    backgroundColor?: Color;
    resolution?: ResolutionOptions,
    antiAlias?: boolean;
    textureFilter?: TextureFilterMode;
    premultipliedAlpha?: boolean;
    gameObjectPoolSize?: number;
    fixedTimestep?: number;
    freezeOnUnfocus?: boolean;
    multiTouch?: boolean;
    editorButtonPosition?: Position;
    showEditorButton?: boolean;
    debugKeys?: Record<string, () => void>[] | null; // null OR [] FOR NONE
    roundPixels? :boolean;
    scaleMode?: CanvasScaleMode;
    // GAME-WIDE SETUP (SAVE DATA, SOUNDS, FONTS). RUNS ONCE bare EXISTS, BEFORE THE FIRST SCENE IS CREATED,
    // AND AGAIN ON EVERY bare.Restart(). AWAITED WHEN IT RETURNS A PROMISE
    OnInit?: () => void | Promise<void>;
};

export type ResolutionOptions =
{
    width?: number;
    height?: number;
    scale?: number | CanvasScale;
    position?: CanvasPosition;
    integerScale?: boolean;
    // FIT-TO-WINDOW, BUT RENDER AT A LOWER LOGIC RESOLUTION SO EVERYTHING APPEARS pixelScale× BIGGER.
    // CSS SIZE STAYS THE FULL VIEWPORT (NO LETTERBOXING). TAKES PRECEDENCE OVER width/height/scale.
    pixelScale?: number;
}

export enum CanvasPosition
{
    TopLeft = 0,
    Center
}

export enum CanvasScale
{
    Fit = -1
}

export interface Position
{
    x: number;
    y: number;
}

export interface Size
{
    width: number;
    height: number;
}

export interface Rectangle
{
    x: number,
    y: number,
    width: number,
    height: number,
}

export interface Rectangle2Vec
{
    x1: number,
    y1: number,
    x2: number,
    y2: number,
}

export enum HitboxType
{
    Circle,
    Rectangle
}

export enum CameraScaleMode
{    
    None, // NO AUTOMATIC FIT SCALING
    Cover, // WHEN ZOOMED OUT, FITS CONTENT WITHIN SCREEN, LEAVING NO SPACE AROUND (WILL NEVER SEE OUTSIDE CONTENT BOUNDS)
    Contain // WHEN ZOOMED OUT, FITS CONTENT WITHIN SCREEN, LEAVING SPACE AROUND (LETTERBOX)
}

export type Ctor<T> = new (...args: any[]) => T;

// DROPS THE FIRST ELEMENT (THE AUTO-INJECTED scene) FROM A CONSTRUCTOR'S PARAM TUPLE
export type DropFirst<T extends any[]> = T extends [any, ...infer R] ? R : [];

// A COMPONENT CLASS WHOSE FIRST CONSTRUCTOR PARAM IS scene, KEEPING THE REST OF THE PARAM TYPES
export type ComponentCtor<T extends Component<GameObject> = Component<GameObject>> =
    new (scene: Scene, ...args: any[]) => T;

export type GameObjectClass = { new (...args: any[]): GameObject };

// TYPES ARE CHANGED TO 'any', SO THEY CAN HAVE A PRESET STRING AS WELL, EG: {"pivot": "CENTER"}
// BIT ANNOYING, TODO: NOT SURE
export interface Entity
{
    name?: string;
    id?: int;
    tags?: any; // Array<string>
    customData?: any; // Record<string, Scalar>

    position?: any; // Position; ONLY USED WITHIN LEVEL DATA AND FOR CHILDREN
    x?: any; // number
    y?: any; // number
    //scaleX?: number;
    //scaleY?: number;
    scale?: any; // Position
    rotation?: any; // number
    flipped?: any; // boolean
    pivot?: any; // Position
    innerPivot?: any; // Position
    //innerX?: number;
    //innerY?: number;
    innerPosition?: any; // Position
    //innerScaleX?: number;
    //innerScaleY?: number;
    innerScale?: any; // Position
    innerRotation?: any; // number
    childrenInheritInnerTransform?: any; // boolean
    childrenAtPivot?: any; // boolean

    texture?: string;
    color?: string;
    alpha?: any; // number
    visible?: any; // boolean

    tapHitbox?: any; // Rectangle2Vec

    children?: any; // Entity[]

    components?: any; // Record<string, any>
    componentsRemoved?: any; // string[]
    //childrenRemoved?: any; // string[] TODO
    propertiesRemoved?: any; // string[]

    baseClass?: string;
    extends?: string;
    imagePath?: string;
    interactableInEditor?: any; // boolean
    persistent?: any; // boolean
    save?: any; // boolean

    // PHYSICS FIELDS LIVE IN ArcadeObjectEntity / RigidBodyEntity / CircleEntity / PolygonEntity

    //tileDimensions?: {width: number; height: number};
    //numberOfTiles?: int; //

    extendsLog?: Record<string, any>;
    __extendsOptions?: Array<{ value: string, label: string, source?: string }>;
    __lockedFields__?: string[];
    __defaultFieldsToIgnore__?: string[];
    constructed ?: boolean;
    entityUID?: string;
}

// ENTITY OF AN UNKNOWN CLASS (ENGINE INTERNALS, SERIALIZING, EDITORS) - ALLOWS EVERY CLASS-SPECIFIC FIELD
export type AnyEntity = Entity & ArcadeObjectEntity & CircleEntity & PolygonEntity & ButtonEntity & TextObjectEntity;

export type ConstructEntityOptions = { propsToIgnoreInEntity?: string[], fillPresets?: boolean, forceAllEntityVars?: boolean, keepRuntimeUIDs?: boolean };
export type EntityVarsNestedGroup = Record<string, string[]>;
export type EntityVarsNestedEntry = string | EntityVarsNestedGroup;

// GET THESE FROM DECORATORS? - TODO
// THOUGH CLASSES, EG RIGIRBODY, WOULD NOT BE TREE-SHAKEN ANYMORE - GENERATE THEIR DECORATED FIELDS HERE? VITE PLUGIN
export var entityVarsNestedRecord: Record<string, string[]> =
{
    "HideInPlugin": [
        "name",
        "children",
        "components",
        "componentsRemoved",
        "propertiesRemoved",
        "interactableInEditor",
    ],
    "Misc": [
        //"propertiesRemoved",

        "tapHitbox",
        //"interactableInEditor",
        "persistent",
        "save",
        "tags",
        "customData",
    ],
    "ArcadeObject": [
        "pivotBasedOnHitbox",
        "hitbox",
        "hitboxType",
        "hitboxRadius"
    ],
    "RigidBody": [
        "rigidbodyRect",
        "hitboxRadius",
        "polygonVertices"
    ],
    "TextObject": [
    ]
}

export var entityVarsAr: string[] =
[
    "name",
    "extends",
    "baseClass",
    "imagePath",
    "texture"
];

export var entityVarsNested: EntityVarsNestedEntry[] = [
    ...entityVarsAr,
    entityVarsNestedRecord,
];

export var entityVars: string[] = [];

export function RefreshEntityVars(): void
{
    entityVars.length = 0;
    for (var entry of entityVarsNested)
    {
        if (typeof entry === "string")
            entityVars.push(entry);
        else
            entityVars.push(...Object.values(entry).flat());
    }
}

RefreshEntityVars();

export interface LevelData
{
    name: string;
    settingsData?: string;
    isData?: boolean;
    dimensions: Size;
    backgroundColor?: string;
    // your own values for the whole level, like a par or a time limit
    customData?: Record<string, any>;
    entitiesByLayer: Record<string, Entity[]>;
}

export interface Category
{
    image?: string;
    expanded?: boolean;
    entries?: Array<string> | string;
    extends?: string;
    showLabels?: boolean;
}

// ADDING ANYTHING TO THIS IS REALLY STUPID:
// ADD TO ProcessAnimations, AddAnimation, AnimationData (+clone),
interface AnimationDataInfo
{
    frames?: Array<string>;
    framesPerSecond?: number;
    loop?: boolean;
    removeOnComplete?: boolean;
    imagePath?: string;
}


export interface SettingsData
{
    name?: string; // WHEN SettingsData IS SAVED TO FILE, THIS NAME IS USED AS THE FILE NAME. IF LEFT EMPTY, THE DEFAULT settingsData.json IS USED. SO ANY EXTRA SettingsData json NEEDS A UNIQUE NAME, ELSE THEY WILL OVERRIDE THE DEFAULT ONE
    categories?: Record<string, Category>;
    basePrefabs?: Entity[];
    prefabs?: Entity[];
    tilesheets?: Array<Entity>;//
    layers?: Array<string>;
    layersInfo?: Record<string, Partial<LayerInfo>>; // Partial, SINCE I'LL BE ASSIGNING MORE KEYS TO IT DURING PROCESSING
    presets?: Record<string, Record<string, any>>;
    saveVars?: Record<string, Array<string>>
    animations?: Record<string, AnimationDataInfo>
    showUI?: boolean,
    settings?: {gridEnabled?: boolean, gridSize?: int},
    selectionEnabled?: boolean,
    defaultAnimationFramesPerSecond?: number,
    gravity?: number,
    editorObjectSnapToPivot?: boolean,
    processed?: boolean
}

// settings data after SettingsHandler processing: every section defaultSettingsData provides is filled in
// (nested objects deep merged), and every layer gets its full LayerInfo
export type ProcessedSettingsData = SettingsData & Required<Pick<SettingsData,
    "basePrefabs" | "prefabs" | "layers" | "categories" | "presets" | "saveVars" |
    "defaultAnimationFramesPerSecond" | "gravity" | "editorObjectSnapToPivot">> &
{
    layersInfo: Record<string, LayerInfo>;
    settings: Required<NonNullable<SettingsData["settings"]>>;
};




export interface Atlas {
    frames: Record<string, AtlasFrame>;
    animations?: Record<string, string[]>;
}

export interface AtlasFrame {
    frame: FrameRect;
    rotated: boolean;
    trimmed: boolean;
    spriteSourceSize: SpriteSourceSize;
    sourceSize: SourceSize;
}

export interface FrameRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface SpriteSourceSize {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface SourceSize {
    w: number;
    h: number;
}

export interface LayerInfo {
    layerI: int;
    name: string;
    ui?: boolean;
    save?: boolean;
    pointerCollisionType?:CollisionHandlingType;
    showInEditor?: boolean;
    collidesWith?: string[];
}

export enum CollisionHandlingType
{
    POINT = "POINT",
    RADIUS = "RADIUS"
}

// EVENTS MONSTER - SINCE IT WANT TO EASILY ADD BARE-EVENTS WITHOUT DUPLICATING CODE
const ev = <T>() => undefined as T | undefined;

const eventDefs = {
    // GLOBAL
    game_awake: ev<undefined>(),
    game_started: ev<undefined>(),
    game_restart: ev<{ full: boolean }>(),
    game_preUpdate: ev<{ deltaTime: number }>(),
    game_update: ev<{ deltaTime: number }>(),
    game_preRender: ev<undefined>(),
    game_postRender: ev<undefined>(),
    game_objectAdded: ev<{ gameObject: GameObject; layer: int | string | GameObject }>(),
    game_objectRemoved: ev<GameObject>(),
    game_focusChange: ev<boolean>(),
    game_pauseToggled: ev<boolean>(),
    game_completeClear: ev<undefined>(),
    game_resize: ev<{ prevWidth: number; prevHeight: number; newWidth: number; newHeight: number }>(),

    scene_awake: ev<{ scene: Scene; }>(),
    scene_added: ev<{ scene: Scene; }>(),
    scene_removed: ev<{ scene: Scene; }>(),
    scene_changed: ev<{ scene: Scene; type: 'added' | 'removed' }>(),
    scene_update: ev<number>(),

    // ALL LOCAL TO SCENE
    level_loaded: ev<{ levelStr: string; level: LevelData }>(),
    level_preSave: ev<{ levelStr: string }>(),
    level_postSave: ev<{ levelStr: string; level: LevelData }>(),
    level_restart: ev<undefined>(),

    pointer_down: ev<{ mouseX: number; mouseY: number; event: PointerEvent }>(),
    pointer_down_any: ev<{ mouseX: number; mouseY: number; event: PointerEvent; isLeftButton: boolean }>(),
    pointer_up: ev<{ mouseX: number; mouseY: number; event: PointerEvent }>(),
    pointer_up_any: ev<{ mouseX: number; mouseY: number; event: PointerEvent; isLeftButton: boolean }>(),
    pointer_move: ev<{ mouseX: number; mouseY: number; movedX: number; movedY: number; event: PointerEvent; isLeftButton: boolean }>(),
    pointer_doubleClick: ev<{ mouseX: number; mouseY: number; event: MouseEvent }>(),

    key_pressed: ev<{ key: string; allKeys: Array<string> }>(),
    key_down: ev<{ key: string; allKeys: Array<string> }>(),
    key_released: ev<{ key: string; allKeys: Array<string> }>(),

    physics_refreshBody: ev<RigidBody>(),

    // MOVE TO EDITOR, PROBABLY MAKE EVENTS STRINGS - TODO?
    editor_layerSelected: ev<{ layerName: string }>(),
    editor_opened: ev<{ settingsDataName: string, levelName: string }>(),
    editor_closed: ev<{ settingsDataName: string, levelName: string }>(),
    level_preSavedToDisk: ev<{ levelStr: string; }>(),//
    level_savedToDisk: ev<{ levelStr: string; level: LevelData }>(),//
} as const;

const createEventMap = <T extends Record<string, any>>(defs: T) =>
Object.fromEntries(Object.keys(defs).map((k) => [k, k])) as {
    [K in keyof T]: K;
};

export interface BareEventExtensions {}
const baseBareEvent = createEventMap(eventDefs);
export const BareEvent = baseBareEvent as typeof baseBareEvent & BareEventExtensions;

type EventPayloads<T> = { [K in keyof T]: T[K] extends undefined ? void : NonNullable<T[K]> };

export interface BareUserEvents {}
export interface BareCollisionEventPairs {}

type BareCollisionEventPayload = BareCollisionEventPairs[keyof BareCollisionEventPairs];
type BareCollisionEvents = [BareCollisionEventPayload] extends [never] ? {} : {
    collision_start: BareCollisionEventPayload;
    collision_update: BareCollisionEventPayload;
    collision_end: BareCollisionEventPayload;
};

export type BareEventPayload =
EventPayloads<typeof eventDefs> & BareCollisionEvents & BareUserEvents;

// Events must be the merged type
export type Events = BareEventPayload & Record<string, any>;
// Runtime placeholder so bundlers that don't honor type-only exports won't warn.
export const Events = undefined as unknown as Events;
//

// ABOVE BECOMES:
/*export const BareEvent = {
 game_restart: "game_restart",
 key_down: "key_down",
 ...
 } as const;

 export type BareEventPayload = {
 game_restart: void
 key_down: { key: string; allKeys: Array<string> }
 ...
 }*/

export interface BareScreen
{
    OnAwake?(payload?: any): Promise<void> | void;
    OnStart?(): void;
    OnUpdate?(dt: number): void;
    OnRender?(): void;
    newScene?(): void;
}

export class SaveData
{
    static currentLevelStr: string = '';
    static levelCache: Map<string, LevelData> = new Map();
    static levelsEditedCache: Map<string, LevelData> = new Map();

    static soundEnabled: boolean = true;
    static musicEnabled: boolean = true;

    static minimized: boolean = false; // REALLY ONLY FOR EDITOR - NEVER NEEDED IN PROD (WITHOUT EDITOR)
}

// TODO
export interface SceneI
{
    //Add?: (obj: GameObject) => void
    //Remove?: (obj: GameObject) => void
    //Clear?: (full:boolean) => void
}

export class Shader
{
    shader: CustomGlShader;

    constructor(vs: string, fs: string)
    {
        var name = this.constructor.name;

        // IF THIS CustomGlShader IS NOT CACHED YET (OR ITS SOURCE CHANGED, EG HOT RELOAD), CREATE IT
        var cached = bare.shaders[name];
        if (!cached || cached.vs !== vs || cached.fs !== fs)
        {
            bare.shaders[name] = new CustomGlShader(rapid, vs, fs);
        }

        // USE THE CACHED SHADER - SAVES SOME SHADER COMPILATION TIME
        this.shader = bare.shaders[name];
    }

    Update?(gameObject?: GameObject): boolean | void;

    SetUniforms(uniforms: Record<string, UniformValue | WebGLTexture>)
    {
        this.shader.setUniforms(uniforms);
    }

    SetPadding(paddingPixels: number)
    {
        this.shader.setPadding(paddingPixels);
    }
}

export type SceneOptions = {
    settingsData?: SettingsData;
    persistent?: boolean;
    UI?: boolean;
    resize?: boolean;
    solo?: boolean;
}

// every SceneOptions key, typed as a Record so adding an option without listing it here is a compile error
export const sceneOptionKeys: Record<keyof SceneOptions, true> = { settingsData: true, persistent: true, UI: true, resize: true, solo: true };

export type SceneClass<T extends Scene = Scene> = new (sceneOptions?: SceneOptions) => T;
export type AwakePayload<T> = T extends { OnAwake: (payload: infer P) => any } ? P : T extends { Awake: (payload: infer P) => any } ? P : never;

// CLASSES ARE NOT REALLY TYPES, BUT OK
export class AnimationData
{
    name: string;
    frames: string[];
    framesPerSecond: number;
    loop: boolean;
    removeOnComplete: boolean;

    currentFrame:int = 0;
    currentFrameTime:number = 0;

    texturesLoaded: boolean = false;

    constructor(animName: string, animFrames: string[], framesPerSecond: number, loop: boolean, removeOnComplete: boolean)
    {
        this.name = animName;
        this.frames = animFrames;
        this.framesPerSecond = framesPerSecond;
        this.loop = loop;
        this.removeOnComplete = removeOnComplete;
    }

    clone(): AnimationData {                  // NOT CLONING THE FRAMES, ASSUMED TO STAY UNTOUCHED
        return new AnimationData(this.name, this.frames, this.framesPerSecond, this.loop, this.removeOnComplete);
    }
}

export enum BlockedState
{
    None = 0,
    Up = 1 << 0,
    Down = 1 << 1,
    Left = 1 << 2,
    Right = 1 << 3
}
