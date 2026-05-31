import type { Scene } from "../scenes/scene";
import { GameObject } from "../objects/gameObject";
import { CanvasScaleMode, CustomGlShader, TextureFilterMode } from "../libraries/new-rapid-render";

export type Scalar = (number | string | boolean);

export type BareOptions = 
{
  resolution?: ResolutionOptions,
  antiAlias?: boolean;
  textureFilter?: TextureFilterMode;
  premultipliedAlpha?: boolean;
  gameObjectPoolSize?: number;
  fixedTimestep?: number;
  imagePath?: string;
  levelPath?: string;
  editorButtonPosition?: Position;
  showEditorButton?: boolean;
  debugKeys?: Record<string, () => void>[];
  roundPixels? :boolean;
  scaleMode?: CanvasScaleMode;
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
  Cover, // WHEN ZOOMED OUT, FITS CONTENT WITHIN SCREEN, LEAVING NO SPACE AROUND (WILL NEVER SEE OUTSIDE CONTENT BOUNDS)
  Contain // WHEN ZOOMED OUT, FITS CONTENT WITHIN SCREEN, LEAVING SPACE AROUND (LETTERBOX)
}


export type Ctor<T> = new (...args: any[]) => T;

export type GameObjectClass = { new (...args: any[]): GameObject };

// SOME TYPE ARE CHANGED TO 'any', SO THEY CAN HAVE A PRESET STRING AS WELL, EG: "pivot": "CENTER"
export interface Entity
{
  name?: string;
  customName?: string;
  tags?: Array<string>;
  customData?: Record<string, Scalar>;

  position?: Position; // ONLY USED WITHIN LEVEL DATA AND FOR CHILDREN
  x?: number;
  y?: number;
  //scaleX?: number;
  //scaleY?: number;
  scale?: Position;
  rotation?: number;
  flipped?: boolean;
  pivot?: any; //Position | String;
  pivotBasedOnHitbox?: any; //Position | String;
  //innerX?: number;
  //innerY?: number;
  innerPosition?: Position;
  //innerScaleX?: number;
  //innerScaleY?: number;
  innerScale?: Position;
  innerRotation?: number;

  texture?: string;
  color?: string;
  alpha?: number;
  visible?: boolean;

  hitbox?: any; //Rectangle2Vec | String;
  tapHitbox?: any; //Rectangle2Vec | String;
  hitboxType?: string;

  children?: Entity[];

  //components?: Record<string, Record<string, any> | string>;
  components?: Record<string, any>;
  //editorComponents?: Record<string, Record<string, any>>;
  componentsRemoved?: string[];
  propertiesRemoved?: string[];

  baseClass?: string;
  baseEntity?: string;
  imagePath?: string;
  interactableInEditor?:boolean;
  persistent?:boolean;
  save?:boolean;

  baseEntityLog?: Record<string, any>;

  // PHYSICS
  collide?: boolean;
  sensor?: boolean;
  static?: boolean;
  stayInBounds?: boolean;
  removeOnOutOfBounds?: boolean;

  rigidbodyRect?: Size;
  hitboxRadius?: number; // SHARED BY ARCADEOBJECT AND RIGIDBODY
  mass?: number;
  drag?: number;
  restitution?: number;
  polygonVertices?: number[];

  //tileDimensions?: {width: number; height: number};
  //numberOfTiles?: int; //
}

export type ConstructEntityOptions = { propsToIgnoreInEntity?: string[], fillPresets?: boolean };
export type EntityVarsNestedGroup = Record<string, string[]>;
export type EntityVarsNestedEntry = string | EntityVarsNestedGroup;

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
  "General": [
      //"scaleX",
      //"scaleY",
      "position", // ONLY FOR CHILD
      "scale",
      "rotation",
      "flipped",
      "pivot",
      //"innerX",
      //"innerY",
      "innerPosition",
      //"innerScaleX",
      //"innerScaleY",
      "innerScale",
      "innerRotation",

      "texture",
      "color",
      "alpha",
      "visible",
  ],
  "Misc": [
        //"propertiesRemoved",

      "tapHitbox",
        //"interactableInEditor",
      "persistent",
      "save",
      "customName",
      "tags",
      "customData",
  ],
  "ArcadeObject": [
      "drag",
      "restitution",
      "pivotBasedOnHitbox",
      "hitbox",
      "hitboxType",
      "hitboxRadius",
      "stayInBounds",
      "removeOnOutOfBounds",
  ],
  "Rigidbody": [
      "drag",
      "mass",
      "restitution",
      "rigidbodyRect",
      "hitboxRadius",
      "polygonVertices",
  ]
}

export var entityVarsAr: string[] =
[
  "baseEntity",
  "baseClass",
  "imagePath"
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
  entitiesByLayer: Record<string, Entity[]>;
}

export interface Category
{
  image?: string;
  expanded?: boolean;
  entries?: Array<string> | string;
  baseEntity?: string;
  showLabels?: boolean;
}

interface AnimationDataInfo
{
  frames?: Array<string>;
  framesPerSecond?: number;
  loop?: boolean;
  imagePath?: string;
}


export interface SettingsData
{
  name?: string;
  categories?: Record<string, Category>;
  baseEntities?: Record<string, Entity>;
  entities?: Record<string, Entity>;
  tilesheets?: Array<Entity>;
  layers?: Array<string>;
  layersInfo?: Record<string, Partial<LayerInfo>>; // Partial, SINCE I'LL BE ASSIGNING MORE KEYS TO IT DURING PROCESSING
  presets?: Record<string, any>;
  saveVars?: Record<string, Array<string>>
  animations?: Record<string, AnimationDataInfo>
  showUI?: boolean,
  settings?: {gridEnabled?: boolean, gridSize?: int, minimized?: boolean},
  selectionEnabled?: boolean,
  defaultAnimationFramesPerSecond?: number,
  gravity?: number,
  editorObjectSnapToPivot?: boolean,
  processed?: boolean
} 




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
  isUI?: boolean;
  doSave?: boolean;
  pointerCollisionType?:CollisionHandlingType;
  showInEditor?: boolean;
  collidesWith?: string[];
}

export enum CollisionHandlingType
{
  POINT,
  RADIUS
}

// EVENTS MONSTER - SINCE IT WANT TO EASILY ADD BARE-EVENTS WITHOUT DUPLICATING CODE
const ev = <T>() => undefined as T | undefined;

const eventDefs = {
  // GLOBAL
  game_awake: undefined,
  game_started: undefined,
  game_restart: ev<{ full: boolean }>(),
  game_preUpdate: ev<{ deltaTime: number }>(),
  game_update: ev<{ deltaTime: number }>(),
  game_preRender: undefined,
  game_postRender: undefined,
  game_objectAdded: ev<{ gameObject: GameObject; layer: int | string | GameObject }>(),
  game_objectRemoved: ev<GameObject>(),
  game_focusChange: ev<boolean>(),
  game_completeClear: undefined,
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
  level_restart: undefined,

  pointer_down: ev<{ mouseX: number; mouseY: number; event: PointerEvent; isLeftButton: boolean }>(),
  pointer_up: ev<{ mouseX: number; mouseY: number; event: PointerEvent; isLeftButton: boolean }>(),
  pointer_move: ev<{ mouseX: number; mouseY: number; movedX: number; movedY: number; event: PointerEvent; isLeftButton: boolean }>(),
  pointer_doubleClick: ev<{ mouseX: number; mouseY: number; event: MouseEvent }>(),

  key_pressed: ev<{ key: string; allKeys: Array<string> }>(),
  key_down: ev<{ key: string; allKeys: Array<string> }>(),
  key_released: ev<{ key: string; allKeys: Array<string> }>(),

  physics_refreshBody: ev<GameObject>(),

  // MOVE TO EDITOR, PROBABLY MAKE EVENTS STRINGS - TODO?
  editor_layerSelected: ev<{ layerName: string }>(),
  editor_opened: ev<{ settingsDataName: string, levelName: string }>(),
  editor_closed: ev<{ settingsDataName: string, levelName: string }>(),
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

export interface Pipes {
  hitboxController_Update: (deltaTime: number) => void;
  physicsController_Update: (deltaTime: number) => void;
  screenController_Update: (deltaTime: number) => void;
  screenController_Render: () => void;
  physicsController_Render: () => void;
  componentController_Update: (deltaTime: number) => void;
  componentController_PreRender: () => void;
  componentController_Render: () => void;
  componentController_PostRender: () => void;
  componentController_OnLevelChanged: (payload: { uids: string[] }) => void;
}

export interface IComponent<T extends GameObject = GameObject> 
{
    enabled?: boolean;
    go: T; 
    save: boolean; // IF FALSE, DOES NOT SERIALIZE
    hasAdded: boolean;

    Added?(go: T): void
    OnAdded?(): void;
    OnStart?(): void
    Removed?(): void
    OnRemoved?(): void
    OnEnable?(): void
    OnDisable?(): void
    OnCollisionStart?(collidingObject: GameObject): void
    OnCollisionUpdate?(collidingObject: GameObject): void
    OnCollisionEnd?(collidingObject: GameObject): void
    OnPreRender?(): void
    OnRender?(): void
    OnPostRender?(): void
    OnUpdate?(dt: number): void
    OnFixedUpdate?(fixedDt: number): void
    OnPreSaveLevel?(): void // IN CASE RELATED OBJECT IS PERSISTENT
    OnLevelChanged?(): void // IN CASE RELATED OBJECT IS PERSISTENT
}

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
}

// TODO
export interface SceneI
{
    //Add?: (obj: GameObject) => void
    //Remove?: (obj: GameObject) => void
    //Clear?: (full:boolean) => void
}

export interface IShader
{
    shader: CustomGlShader;
    update?(): boolean;
}

export class Shader implements IShader
{
    shader: CustomGlShader;

    constructor(vs: string, fs: string)
    {
        var name = this.constructor.name;
        
        // IF THIS CustomGlShader IS NOT CACHED YET, CREATE IT
        if (!bare.shaders[name])
        {
            bare.shaders[name] = new CustomGlShader(rapid, vs, fs);
        }

        // USE THE CACHED SHADER - SAVES SOME SHADER COMPILATION TIME
        this.shader = bare.shaders[name];
    }

    update?(gameObject?: GameObject): boolean;
}

export type SceneOptions = {
    settingsData?: SettingsData;
    persistent?: boolean;
    secret?: boolean;
    UI?: boolean;
    resize?: boolean;
    solo?: boolean;
}

export type SceneClass<T extends Scene = Scene> = new (sceneOptions?: SceneOptions) => T;
export type AwakePayload<T> = T extends { OnAwake: (payload: infer P) => any } ? P : T extends { Awake: (payload: infer P) => any } ? P : never;

// CLASSES ARE NOT REALLY TYPES, BUT OK
export class AnimationData
{
  name: string;
  frames: string[];
  framesPerSecond: number;
  loop: boolean;

  currentFrame:int = 0;
  currentFrameTime:number = 0;

  texturesLoaded: boolean = false;

  constructor(animName: string, animFrames: string[], framesPerSecond: number, loop: boolean)
  {
    this.name = animName;
    this.frames = animFrames;
    this.framesPerSecond = framesPerSecond;
    this.loop = loop;
  }
  
  clone(): AnimationData {                  // NOT CLONING THE FRAMES, ASSUMED TO STAY UNTOUCHED
    return new AnimationData(this.name, this.frames, this.framesPerSecond, this.loop);
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
