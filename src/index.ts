/*export const BareClasses = {
  ArcadePhysicsController,
  ArcadeObject,
  ComponentController,
};*/

// Core
export { BareEngine } from "./bareEngine";
export { GameMode, globalEvents } from "./globals";
export { MakePath, StartBare } from "./main";
export { Button } from "./objects/button";
export { GameObject } from "./objects/gameObject";
export { TextObject } from "./objects/textObject";
export { Scene } from "./scenes/scene";

// Controllers
export { ArcadePhysicsController, arcadePhysicsController } from "./controllers/arcadePhysicsController";
export { Component, ComponentController, componentController } from "./controllers/componentController";
export { HitboxController, hitboxController } from "./controllers/hitboxController";
export type { ButtonHandlers } from "./controllers/hitboxController";
export { KeyboardController, keyboardController } from "./controllers/keyboardController";
export { MouseController, mouseController } from "./controllers/mouseController";
export { ObjectController, objectController } from "./controllers/objectController";
export { ParticleController, particleController } from "./controllers/particleController";
export { SceneController, sceneController } from "./controllers/sceneController";
export { SopiroPhysicsController } from "./controllers/sopiroPhysicsController";
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
export { AnimationComponent, AnimationEvent } from "./components/animationComponent";
export type { AnimationEventPayload as AnimationEvents } from "./components/animationComponent";
export { CollisionEventComponent } from "./components/collisionEventComponent";
export { ParticleComponent } from "./components/particleComponent";

// Objects
export { ArcadeObject } from "./objects/arcadeObject";

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
export { defaultSettingsData } from "./types/bareData";
export { Hitbox } from "./types/hitbox";
export { Description, InspectorButton, InspectorField, Label, Locked, Range, Run, Save } from "./utils/decorators";
export { Helper } from "./utils/helper";

// Types and constants
export
{
  AnimationData,
  BareEvent,
  CameraScaleMode,
  CanvasPosition,
  CanvasScale,
  CollisionHandlingType,
  Events,
  HitboxType,
  SaveData
} from "./types/bareTypes";
export type {
  Atlas,
  AtlasFrame,
  BareScreen, Entity,
  FrameRect,
  GameObjectClass, IComponent, LayerInfo,
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
  SpriteSourceSize
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
export { Howl, Howler } from "./libraries/howler/howler";
export type { HowlOptions } from "./libraries/howler/howler";

// Libraries: rapid-render
// export * from "./libraries/new-rapid-render/interface";
// export * from "./libraries/new-rapid-render/math";
// export { Particle, ParticleEmitter } from "./libraries/new-rapid-render/particle";
// export { graphicAttributes, spriteAttributes } from "./libraries/new-rapid-render/regions/attributes";
// export * from "./libraries/new-rapid-render/render";
// export { default as Rapid } from "./libraries/new-rapid-render/render";
// export * from "./libraries/new-rapid-render/texture";
// export { BareText } from "./libraries/new-rapid-render/texture";
// export { QuadTree } from "./libraries/quadTree";
// export type { QuadTreeItem } from "./libraries/quadTree";
// export { default as GLShader } from "./libraries/new-rapid-render/webgl/glshader";
// export { Uniform } from "./libraries/new-rapid-render/webgl/uniform";
export * from "./libraries/new-rapid-render";

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

