import { GameObject } from "../objects/gameObject";
import { Scene } from "../main";

export type BareOptions = 
{
  antiAlias?: boolean;
  premultipliedAlpha?: boolean;
  gameObjectPoolSize?: number;
  fixedTimestep?: number;
  imagePath?: string;
  levelPath?: string;
};

export interface Position
{
  x: number;
  y: number;
}

export interface Dimensions
{
  width: number;
  height: number;
}

export type Ctor<T> = new (...args: any[]) => T;

export type GameObjectClass = { new (...args: any[]): GameObject };

export interface Entity
{
  name?: string;
  customName?: string;
  texture?: string;
  position?: Position; // ONLY USED WITHIN LEVEL DATA
  scale?: Position;
  rotation?: number;
  flipped?: boolean;
  pivot?: Position;
  pivotBasedOnHitbox?: any; //Position | String;
  innerPosition?: Position;
  innerScale?: Position;
  innerRotation?: number;
  alpha?: number;
  color?: string;
  visible?: boolean;
  hitbox?: any; //Rectangle2Vec | String;
  tapHitbox?: any; //Rectangle2Vec | String;
  hitboxType?: string;
  extendClass?: string;
  extendData?: string;
  imagePath?: string;
  tags?: Array<string>;
  customData?: Record<string, (string | number | boolean)>;
  components?: Record<string, Record<string, any>>;
  editorComponents?: Record<string, Record<string, any>>;
  componentsRemoved?: string[];
  propertiesRemoved?: string[];

  interactableInEditor?:boolean;

  // PHYSICS
  collide?: boolean;
  sensor?: boolean;
  static?: boolean;
  stayInBounds?: boolean;

  physicsRect?: Dimensions;
  physicsRadius?: number;
  mass?: number;
  restitution?: number;
  polygonVertices?: number[];
  children?: Entity[];

  //tileDimensions?: {width: number; height: number};
  //numberOfTiles?: int; //
}

export interface LevelData
{
  name: string;
  settingsData?: string;
  isData?: boolean;
  dimensions: Dimensions;
  backgroundColor?: string;
  entitiesByLayer: Record<string, Entity[]>;
}

interface Category
{
  image: string;
  entries: Array<string> | string;
}

interface AnimationDataInfo
{
  frames?: Array<string>;
  framesPerSecond?: number;
  loop?: boolean;
}

export interface SettingsData
{
  name?: string;
  categories?: Record<string, Category>;
  entityBases?: Record<string, Partial<Entity>>; // MADE PARTIAL TO SUPPORT IT HAVING NO NAME (YET)
  entities?: Record<string, Partial<Entity>>; // SAME ^
  tilesheets?: Array<Entity>;
  layers?: Array<string>;
  layersInfo?: Record<string, any>;
  presets?: Record<string, Partial<Entity>>;
  saveVars?: Record<string, Array<string>>
  animations?: Record<string, AnimationDataInfo>
  showUI?: boolean,
  settings?: {gridEnabled?: boolean, gridSize?: int, minimized?: boolean},
  selectionEnabled?: boolean,
  processed?: boolean
} 




export interface Atlas {
    frames: Record<string, AtlasFrame>;
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

  scene_awake: undefined,
  scene_added: ev<{ scene: Scene; }>(),
  scene_removed: ev<{ scene: Scene; }>(),
  scene_changed: ev<{ scene: Scene; type: 'added' | 'removed' }>(),
  scene_update: ev<number>(),

  // ALL LOCAL TO SCENE
  level_loaded: ev<{ levelStr: string; level: LevelData }>(),
  level_preSave: ev<{ levelStr: string }>(),
  level_postSave: ev<{ levelStr: string; level: LevelData }>(),
  level_restart: undefined,

  collision_start: ev<[GameObject, GameObject]>(),
  collision_update: ev<[GameObject, GameObject]>(),
  collision_end: ev<[GameObject, GameObject]>(),

  pointer_down: ev<{ mouseX: number; mouseY: number; event: PointerEvent; isLeftButton: boolean }>(),
  pointer_up: ev<{ mouseX: number; mouseY: number; event: PointerEvent; isLeftButton: boolean }>(),
  pointer_move: ev<{ mouseX: number; mouseY: number; event: PointerEvent; isLeftButton: boolean }>(),
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
export type BareEventPayload =
  EventPayloads<typeof eventDefs> & BareUserEvents;

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

export interface Component<T extends GameObject = GameObject> 
{
    enabled?: boolean;
    go: T; 
    save: boolean; // IF FALSE, DOES NOT SERIALIZE

    Added?(go: T): void
    OnAdded?(): void;
    OnStart?(): void
    OnRemoved?(): void
    OnEnable?(): void
    OnDisable?(): void
    OnCollisionStart?(initiatingObject: GameObject, collidingObject: GameObject): void
    OnCollisionUpdate?(initiatingObject: GameObject, collidingObject: GameObject): void
    OnCollisionEnd?(initiatingObject: GameObject, collidingObject: GameObject): void
    OnPreRender?(): void
    OnRender?(): void
    OnPostRender?(): void
    OnUpdate?(dt: number): void
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

export type SceneOptions = {
    entityData?: SettingsData;
    persistent?: boolean;
    UI?: boolean;
    solo?: boolean;
}

export type SceneClass<T extends Scene = Scene> = new (sceneOptions?: SceneOptions) => T;
export type AwakePayload<T> = T extends { OnAwake: (payload: infer P) => any } ? P : T extends { Awake: (payload: infer P) => any } ? P : never;

// CLASSES ARE NOT REALLY TYPES, BUT OK
export class AnimationData
{
  animName: string;
  animFrames: string[];
  framesPerSecond: number;
  loop: boolean;

  currentFrame:int = 0;
  currentFrameTime:number = 0;

  constructor(animName: string, animFrames: string[], framesPerSecond: number, loop: boolean)
  {
    this.animName = animName;
    this.animFrames = animFrames;
    this.framesPerSecond = framesPerSecond;
    this.loop = loop;
  }
  
  clone(): AnimationData {
    return new AnimationData(this.animName, [...this.animFrames], this.framesPerSecond, this.loop);
  }
}