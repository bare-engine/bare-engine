import { GameObject } from "../objects/gameObject";
import type { Vec2 } from "../libraries/rapid-render";

// Type definitions for level data
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

export interface Background
{
  color: string;
}

export type Ctor<T> = new (...args: any[]) => T;

export type GameObjectClass = { new (...args: any[]): GameObject };

export interface Entity
{
  name: string;
  extend?: string;
  imagePath?: string;
  rotation?: number;
  pivot?: Position;
  pivotBasedOnHitbox?: any; //Position | String;
  scale?: Position;
  alpha?: number;
  hitbox?: any; //Rectangle2Vec | String;
  hitboxType?: string;
  canCollide?: boolean
  isStatic?: boolean
  tags?: Array<string>;
  components?: Record<string, Record<string, any>>;
  editorComponents?: Record<string, Record<string, any>>;
  //tileDimensions?: {width: number; height: number};
  numberOfTiles?: int; //
  visible?: boolean;
  customName?: string;
  componentsRemoved?: string[]; // REMOVE IGNORE?
  propertiesRemoved?: string[]; // REMOVE IGNORE?
  presets?: Array<string>;

  position?: Position; // ONLY USED WITHIN LEVEL DATA
  interactableInEditor?:boolean;

  // PHYSICS
  static?: boolean;
  physicsRect?: Dimensions;
  physicsRadius?: number;
  mass?: number;
  restitution?: number;
  polygonVertices?: number[];

  stayInBounds?: boolean;
}

/*
export const EntityTypeInfo: Record<string, string> = {
  name: "string",
  extendData: "string",
  extendClass: "string",
  imagePath: "string",
  type: "string",
  rotation: "number",
  pivot: "Position",
  scale: "Position",
  hitbox: "any",
  canCollide: "boolean",
  isStatic: "boolean",
  tags: "string[]",
  components: "object",
  editorComponents: "object",
  numberOfTiles: "number",
  visible: "boolean",
  customName: "string",
  componentsRemoved: "string[]",
  position: "Position",
  levelID: "string",
};

export type EntityKeys = keyof typeof EntityTypeInfo;

export type Entity = {
  [K in EntityKeys]?: any;
};*/

export interface LevelData
{
  name: string;
  dimensions: Dimensions;
  background?: Background;
  entitiesByLayer: Record<string, Entity[]>;
}

interface CategoryData
{
  image: string;
  entries: Array<string> | string;
}

interface Category
{
  [key: string]: CategoryData;
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
  categories?: Array<Category>;
  entityBases?: Record<string, Partial<Entity>>; // MADE PARTIAL TO SUPPORT IT HAVING NO NAME (YET)
  entities?: Record<string, Partial<Entity>>; // SAME ^
  tilesheets?: Array<Entity>;
  layers?: Array<string>;
  uiLayers?: Array<string>;
  layersInfo?: Record<string, any>;
  presets?: Record<string, Partial<Entity>>;
  saveVars?: Record<string, Array<string>>
  animations?: Record<string, AnimationDataInfo>
  showUI?: boolean,
  settings?: {gridEnabled: boolean, gridSize: int},
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
  hasPhysics?: boolean;
  doSave?: boolean;
  pointerCollisionType?:CollisionHandlingType;
  showInEditor?: boolean;
}

export enum CollisionHandlingType
{
  POINT,
  RADIUS
}

// Base layer map. Extend via module augmentation in user space (e.g. _generated/layer.ts).
export interface LayerMap {
  OBJECTS: number;
}

export const UI_LAYER = 50; // NOT THE BEST?

export let Layer = {
  OBJECTS: 0,
} as LayerMap;

export let UILayer = {
    UI: UI_LAYER,
    FADE: UI_LAYER + 1
} as const;

export function SetLayers<T extends LayerMap>(layers: T) {
  Layer = layers;
}

export function SetUILayers<T extends Record<string, number>>(UILayers: T) {
  UILayer = UILayers as any;
}

export type CameraRenderInfo = {
  position: Vec2; // camera center in world space (after clamping)
  offset: Vec2;   // world offset so camera center maps to screen center
  scale: number;  // final scale used for rendering
};

export interface Events {
    // TODO, REMOVE THOSE SINGLE { deltaTime: number } AND MAKE NUMBER
    startInitialAssetLoad: void;
    firstStart: void;
    gameStarted: void;
    preUpdate: { deltaTime: number };
    midUpdate: { deltaTime: number };
    update: { deltaTime: number };
    preRender: void;
    postRender: void;
    clear: { full: boolean };
    resize: { prevWidth: number; prevHeight: number, newWidth: number, newHeight: number };

    levelLoaded: {levelStr: string, level: LevelData};
    preSaveLevel: { levelStr: string };
    postSaveLevel: { levelStr: string, level: LevelData };
    savedLevelToDisk: { levelStr: string, level: LevelData };
    levelCompleted: {levelNum: int};
    levelFailed: {levelNum: int};
    restarLevel: void;

    gameObjectAdded: {gameObject: GameObject, layer: number | GameObject};
    gameObjectRemoved: GameObject;

    collisionStart: [GameObject, GameObject]; // COLLISION EVENTS USE DIFFERENT FORMAT, TO EASILY CHANGE THE TYPE ON LISTEN METHOD
    collisionUpdate: [GameObject, GameObject];
    collisionEnd: [GameObject, GameObject];

    pointerDown: {mouseX: number, mouseY: number, event:PointerEvent, isLeftButton: boolean};
    pointerUp: {mouseX: number, mouseY: number, event:PointerEvent, isLeftButton: boolean};
    pointerMove: {mouseX: number, mouseY: number, event:PointerEvent, isLeftButton: boolean};
    doubleClick: {mouseX: number, mouseY: number, event:MouseEvent};

    keyPressed: { key:string, allKeys: Array<string> };
    keyDown: { key:string, allKeys: Array<string> };
    keyReleased: { key:string, allKeys: Array<string> };

    focusChange: boolean;

    editor_layerSelected: { layerName:string };
    editor_opened: { name: string };
    editor_closed: { name: string };

    physicsRefreshBody: GameObject;

    screenController_Update: number;
    mouseController_Update: number;
    hitboxController_Update: number;
    physicsController_Update: number;
    editorController_Update: number;
    screenController_Render: void;
    physicsController_Render: void;
    componentController_Update: number;
    componentController_PreRender: void;
    componentController_Render: void;
    componentController_PostRender: void;
    componentController_OnLevelChanged: { uids:string[] };
}

export interface Pipes {
  componentController_GetAllComponentsFrom: (obj: GameObject) => Component<any>[];
  componentController_ProcessCompentsFromEntity: (entity: Entity, obj: GameObject) => void;
  componentController_AddComponent: (obj: GameObject, componentInstance: Component) => Component;
  
  cameraHandler_GetRenderInfo: (levelEditorOpen: boolean) => CameraRenderInfo;
  cameraHandler_ScreenToWorld: (x: number, y: number) => Vec2;
  cameraHandler_WorldToScreen: (x: number, y: number) => Vec2;
  cameraHandler_GetZoom: () => number;
}

export interface Component<T extends GameObject = GameObject> 
{
    enabled?: boolean;
    go: T; 

    Added?(go: T): void
    OnStart?: () => void
    Removed?: () => void
    OnEnable?: () => void
    OnDisable?: () => void
    OnCollisionStart?: (initiatingObject: GameObject, collidingObject: GameObject) => void
    OnCollisionUpdate?: (initiatingObject: GameObject, collidingObject: GameObject) => void
    OnCollisionEnd?: (initiatingObject: GameObject, collidingObject: GameObject) => void
    PreRender?: () => void
    Render?: () => void
    PostRender?: () => void
    OnUpdate?: (dt: number) => void
    PreSaveLevel?: () => void // IN CASE RELATED OBJECT IS PERSISTENT
    OnLevelChanged?: () => void // IN CASE RELATED OBJECT IS PERSISTENT
}

export interface BareScreen
{
  OnAwake?(): Promise<void> | void;
  OnStart?(): void;
  OnUpdate?(dt: number): void;
  OnRender?(): void;
  OnDestroy?(): void;
}

// BIT DIFFERENT THAN THE REST?
export class SaveData
{
  static currentLevelStr: string = '';
  static levelCache: Map<string, LevelData> = new Map();
  
  static soundEnabled: boolean = true;
  static musicEnabled: boolean = true;
}

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
}
