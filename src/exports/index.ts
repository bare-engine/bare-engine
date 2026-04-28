// Core
export { GameObject } from "../objects/gameObject";
export { Scene } from "../scenes/scene";

// Core (side-effectful)
export { BareEngine } from "../bareEngine";
export { GameMode, globalEvents } from "../globals";
export { MakePath, StartBare } from "../main";

export { AnimationEvent, AnimationEventPayload as AnimationEvents } from "../components/animationComponent";
export { BareEvent, Events } from "../types/bareTypes";
export type { SceneI } from "../types/bareTypes";

export { LevelHandler, levelHandler } from "../handlers/levelHandler";
export { plugin, PluginHandler } from "../handlers/pluginHandler";
export { Button } from "../objects/button";

// Controllers
export { BaseComponent, ComponentController } from "../controllers/componentController";
export { HitboxController } from "../controllers/hitboxController";
export type { ButtonHandlers } from "../controllers/hitboxController";
export { KeyboardController } from "../controllers/keyboardController";
export { MouseController } from "../controllers/mouseController";
export { ObjectController } from "../controllers/objectController";
export { ParticleController } from "../controllers/particleController";
export { SceneController } from "../controllers/sceneController";
export { TweenController } from "../controllers/tweenController";
export { physicsControllerBare } from "../controllers/physicsControllerBare";

// Controllers instances
export { componentController } from "../controllers/componentController";
export { hitboxController } from "../controllers/hitboxController";
export { keyboardController } from "../controllers/keyboardController";
export { mouseController } from "../controllers/mouseController";
export { objectController } from "../controllers/objectController";
export { particleController } from "../controllers/particleController";
export { sceneController } from "../controllers/sceneController";
export { tweenController } from "../controllers/tweenController";
import { PhysicsControllerBare } from "../controllers/physicsControllerBare";
import { ComponentController } from "../controllers/componentController";
import { PhysicsObjectBare } from "../objects/physicsObjectBare";

export const BareClasses = {
  PhysicsControllerBare,
  PhysicsObjectBare,
  ComponentController,
  
  //ParticleController,
  //HitboxController,
  //TweenController,
  //LevelController,
  //ScreenController,
};

export { PhysicsControllerBare } from "../controllers/physicsControllerBare";
export { PhysicsControllerSopiro } from "../controllers/physicsControllerSopiro";
export { PhysicsObjectBare } from "../objects/physicsObjectBare";

export * from "../libraries/Sopiro/aabb";
export * from "../libraries/Sopiro/aabbtree";
export * from "../libraries/Sopiro/angle";
export * from "../libraries/Sopiro/box";
export * from "../libraries/Sopiro/circle";
export * from "../libraries/Sopiro/constraint";
export * from "../libraries/Sopiro/contact";
export * from "../libraries/Sopiro/distance";
export * from "../libraries/Sopiro/edge";
export * from "../libraries/Sopiro/grab";
export * from "../libraries/Sopiro/island";
export * from "../libraries/Sopiro/joint";
export * from "../libraries/Sopiro/line";
export * from "../libraries/Sopiro/math";
export * from "../libraries/Sopiro/maxdistance";
export * from "../libraries/Sopiro/motor";
export * from "../libraries/Sopiro/nsquared";
export * from "../libraries/Sopiro/polygon";
export * from "../libraries/Sopiro/polytope";
export * from "../libraries/Sopiro/prismatic";
export * from "../libraries/Sopiro/renderer";
export * from "../libraries/Sopiro/revolute";
export * from "../libraries/Sopiro/rigidbody";
export * from "../libraries/Sopiro/settings";
export * from "../libraries/Sopiro/simplex";
export * from "../libraries/Sopiro/timer";
export * from "../libraries/Sopiro/util";
export * from "../libraries/Sopiro/weld";
export * from "../libraries/Sopiro/world";

export { soundHandler } from "../handlers/soundHandler";
export { Howl, Howler } from "../libraries/howler/howler.core.js";
export type { HowlOptions } from "../libraries/howler/howler.core.js";

export { TweenTo } from "../controllers/tweenController";

// Components
export { AnimationComponent } from "../components/animationComponent";
export { CollisionEventComponent } from "../components/collisionEventComponent";
export { ParticleComponent } from "../components/particleComponent";
export { TextObject } from "../objects/textObject";

// Utils
export { assetsHandler } from "../handlers/assetsHandler";
export { cameraHandler, CameraHandler } from "../handlers/cameraHandler";
export { FileDropHandler } from "../handlers/fileDropHandler";
export { PoolHandler } from "../handlers/poolHandler";
export { SaveDataHandler } from "../handlers/SaveDataHandler";
export { SettingsHandler as SettingsHandler } from "../handlers/settingsHandler";
export { FlashShader } from "../shaders/flashShader";
export { OutlineShader } from "../shaders/outlineShader";
export { defaultSettingsData as defaultEntityData } from "../types/bareData";
export { Hitbox } from "../types/hitbox";
export { InspectorButton, Run } from "../utils/decorators";
export { Helper } from "../utils/helper";

export { PivotComponent } from "../editorComponents/pivotComponent";
export { PivotRemoveComponent } from "../editorComponents/pivotRemoveComponent";
export { PositionPivotComponent } from "../editorComponents/positionPivotComponent";
export { ResizableComponent } from "../editorComponents/resizableComponent";
export { ResizableRemoveComponent } from "../editorComponents/resizableRemoveComponent";
export { EditorScene } from "../scenes/editorScene";
export { EditorUIScene } from "../scenes/editorUIScene";
export { uiScene } from "../scenes/uiScene";

// Types and constants
export
{
  AnimationData,
  CollisionHandlingType,
  SaveData
} from "../types/bareTypes";
export type {
  Atlas,
  AtlasFrame, BareScreen, Component, Entity, FrameRect,
  GameObjectClass,
  LayerInfo,
  LevelData, Pipes, Position, Rectangle, Rectangle2Vec, SettingsData, Size, SourceSize,
  SpriteSourceSize
} from "../types/bareTypes";

export { CameraScaleMode, HitboxType } from "../types/bareTypes";

// Libraries
export * from "../libraries/rapid-render/interface";
export * from "../libraries/rapid-render/math";
export { Particle, ParticleEmitter } from "../libraries/rapid-render/particle";
export { graphicAttributes, spriteAttributes } from "../libraries/rapid-render/regions/attributes";
export * from "../libraries/rapid-render/render";
export { default as Rapid } from "../libraries/rapid-render/render";
export * from "../libraries/rapid-render/texture";
export { BareText } from "../libraries/rapid-render/texture";
export { QuadTree } from "../libraries/quadTree";
export type { QuadTreeItem } from "../libraries/quadTree";
export { default as GLShader } from "../libraries/rapid-render/webgl/glshader";
export { Uniform } from "../libraries/rapid-render/webgl/uniform";

export { Easing } from "../libraries/tweenJS/Easing";
export type { EasingFunction, EasingFunctionGroup } from "../libraries/tweenJS/Easing";
export { default as Group } from "../libraries/tweenJS/Group";
export { default as Interpolation } from "../libraries/tweenJS/Interpolation";
export type { InterpolationFunction } from "../libraries/tweenJS/Interpolation";
export { mainGroup } from "../libraries/tweenJS/mainGroup";
export { default as now, setNow } from "../libraries/tweenJS/Now";
export { default as Sequence } from "../libraries/tweenJS/Sequence";
export { Tween } from "../libraries/tweenJS/Tween";
export type { UnknownProps } from "../libraries/tweenJS/Tween";
export { default as VERSION } from "../libraries/tweenJS/Version";

