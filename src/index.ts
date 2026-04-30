import { PhysicsControllerBare } from "./controllers/physicsControllerBare";
import { ComponentController } from "./controllers/componentController";
import { PhysicsObjectBare } from "./objects/physicsObjectBare";

export const BareClasses = {
  PhysicsControllerBare,
  PhysicsObjectBare,
  ComponentController,
};

// Core
export { BareEngine } from "./bareEngine";
export { GameMode, globalEvents } from "./globals";
export { MakePath, StartBare } from "./main";
export { Button } from "./objects/button";
export { GameObject } from "./objects/gameObject";
export { TextObject } from "./objects/textObject";
export { Scene } from "./scenes/scene";

// Controllers
export { BaseComponent, ComponentController, componentController } from "./controllers/componentController";
export { HitboxController, hitboxController } from "./controllers/hitboxController";
export type { ButtonHandlers } from "./controllers/hitboxController";
export { KeyboardController, keyboardController } from "./controllers/keyboardController";
export { MouseController, mouseController } from "./controllers/mouseController";
export { ObjectController, objectController } from "./controllers/objectController";
export { ParticleController, particleController } from "./controllers/particleController";
export { PhysicsControllerBare, physicsControllerBare } from "./controllers/physicsControllerBare";
export { PhysicsControllerSopiro } from "./controllers/physicsControllerSopiro";
export { SceneController, sceneController } from "./controllers/sceneController";
export { TweenController, tweenController, TweenTo } from "./controllers/tweenController";

// Handlers
export { assetsHandler } from "./handlers/assetsHandler";
export { cameraHandler, CameraHandler } from "./handlers/cameraHandler";
export { FileDropHandler } from "./handlers/fileDropHandler";
export { LevelHandler, levelHandler } from "./handlers/levelHandler";
export { plugin, PluginHandler } from "./handlers/pluginHandler";
export { PoolHandler } from "./handlers/poolHandler";
export { SaveDataHandler } from "./handlers/SaveDataHandler";
export { SettingsHandler } from "./handlers/settingsHandler";
export { soundHandler } from "./handlers/soundHandler";

// Components
export { AnimationComponent, AnimationEvent, AnimationEventPayload as AnimationEvents } from "./components/animationComponent";
export { CollisionEventComponent } from "./components/collisionEventComponent";
export { ParticleComponent } from "./components/particleComponent";

// Objects
export { PhysicsObjectBare } from "./objects/physicsObjectBare";

// Editor
export { PivotComponent } from "./editorComponents/pivotComponent";
export { PivotRemoveComponent } from "./editorComponents/pivotRemoveComponent";
export { PositionPivotComponent } from "./editorComponents/positionPivotComponent";
export { ResizableComponent } from "./editorComponents/resizableComponent";
export { ResizableRemoveComponent } from "./editorComponents/resizableRemoveComponent";
export { EditorScene } from "./scenes/editorScene";
export { EditorUIScene } from "./scenes/editorUIScene";
export { uiScene } from "./scenes/uiScene";

// Shaders and utils
export { FlashShader } from "./shaders/flashShader";
export { OutlineShader } from "./shaders/outlineShader";
export { defaultSettingsData as defaultEntityData } from "./types/bareData";
export { Hitbox } from "./types/hitbox";
export { InspectorButton, InspectorField, Label, Locked, Range, Run, Save } from "./utils/decorators";
export { Helper } from "./utils/helper";

// Types and constants
export {
  AnimationData,
  BareEvent,
  CameraScaleMode,
  CollisionHandlingType,
  Events,
  HitboxType,
  SaveData,
} from "./types/bareTypes";
export type {
  Atlas,
  AtlasFrame,
  BareScreen,
  Component,
  Entity,
  FrameRect,
  GameObjectClass,
  LayerInfo,
  LevelData,
  Pipes,
  Position,
  Rectangle,
  Rectangle2Vec,
  SceneClass,
  SceneI,
  SettingsData,
  Size,
  SourceSize,
  SpriteSourceSize,
} from "./types/bareTypes";

// Libraries: Sopiro
export * from "./libraries/Sopiro/aabb";
export * from "./libraries/Sopiro/aabbtree";
export * from "./libraries/Sopiro/angle";
export * from "./libraries/Sopiro/box";
export * from "./libraries/Sopiro/circle";
export * from "./libraries/Sopiro/constraint";
export * from "./libraries/Sopiro/contact";
export * from "./libraries/Sopiro/distance";
export * from "./libraries/Sopiro/edge";
export * from "./libraries/Sopiro/grab";
export * from "./libraries/Sopiro/island";
export * from "./libraries/Sopiro/joint";
export * from "./libraries/Sopiro/line";
export * from "./libraries/Sopiro/math";
export * from "./libraries/Sopiro/maxdistance";
export * from "./libraries/Sopiro/motor";
export * from "./libraries/Sopiro/nsquared";
export * from "./libraries/Sopiro/polygon";
export * from "./libraries/Sopiro/polytope";
export * from "./libraries/Sopiro/prismatic";
export * from "./libraries/Sopiro/renderer";
export * from "./libraries/Sopiro/revolute";
export * from "./libraries/Sopiro/rigidbody";
export * from "./libraries/Sopiro/settings";
export * from "./libraries/Sopiro/simplex";
export * from "./libraries/Sopiro/timer";
export * from "./libraries/Sopiro/util";
export * from "./libraries/Sopiro/weld";
export * from "./libraries/Sopiro/world";

// Libraries: howler
export { Howl, Howler } from "./libraries/howler/howler.core.js";
export type { HowlOptions } from "./libraries/howler/howler.core.js";

// Libraries: rapid-render
export * from "./libraries/rapid-render/interface";
export * from "./libraries/rapid-render/math";
export { Particle, ParticleEmitter } from "./libraries/rapid-render/particle";
export { graphicAttributes, spriteAttributes } from "./libraries/rapid-render/regions/attributes";
export * from "./libraries/rapid-render/render";
export { default as Rapid } from "./libraries/rapid-render/render";
export * from "./libraries/rapid-render/texture";
export { BareText } from "./libraries/rapid-render/texture";
export { QuadTree } from "./libraries/quadTree";
export type { QuadTreeItem } from "./libraries/quadTree";
export { default as GLShader } from "./libraries/rapid-render/webgl/glshader";
export { Uniform } from "./libraries/rapid-render/webgl/uniform";

// Libraries: tweenJS
export { Easing } from "./libraries/tweenJS/Easing";
export type { EasingFunction, EasingFunctionGroup } from "./libraries/tweenJS/Easing";
export { default as Group } from "./libraries/tweenJS/Group";
export { default as Interpolation } from "./libraries/tweenJS/Interpolation";
export type { InterpolationFunction } from "./libraries/tweenJS/Interpolation";
export { mainGroup } from "./libraries/tweenJS/mainGroup";
export { default as now, setNow } from "./libraries/tweenJS/Now";
export { default as Sequence } from "./libraries/tweenJS/Sequence";
export { Tween } from "./libraries/tweenJS/Tween";
export type { UnknownProps } from "./libraries/tweenJS/Tween";
export { default as VERSION } from "./libraries/tweenJS/Version";
