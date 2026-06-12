// Core
export { BareEngine } from "./bareEngine";
export { Bare } from "./types/bare";
export { GameMode, globalEvents } from "./globals";
export { MakePath, StartBare } from "./main";
export { Button } from "./objects/button";
export { GameObject } from "./objects/gameObject";
export { TextObject } from "./objects/textObject";

export { Scene } from "./scenes/scene";
export { SoundJsSound } from "./libraries/soundjs/index";

// Controllers
// NOTE: THE PER-SCENE CONTROLLER SINGLETONS (componentController, mouseController, ...) ARE NO
// LONGER EXPORTED - USE THE bare.<module> SHORTHANDS INSTEAD (bare.component, bare.mouse, ...)
// keyboardController AND soundHandler STAY EXPORTED: THE CONTROLLER PROXY TRANSFORMER INJECTS
// IMPORTS OF THEM FOR bare.keyboard / bare.sound
export { Component, ComponentController } from "./controllers/componentController";
export { HitboxController } from "./controllers/hitboxController";
export type { ButtonHandlers } from "./controllers/hitboxController";
export { KeyboardController, keyboardController } from "./controllers/keyboardController";
export { MouseController } from "./controllers/mouseController";
export { ObjectController } from "./controllers/objectController";
export { ParticleController } from "./controllers/particleController";
export { SceneController } from "./controllers/sceneController";
export { TweenController, TweenTo } from "./controllers/tweenController";

// Handlers
export { CameraHandler } from "./handlers/cameraHandler";
export { FileDropHandler } from "./handlers/fileDropHandler";
export { LevelHandler } from "./handlers/levelHandler";
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
export { Shader } from "./types/bareTypes";
export { FlashShader } from "./shaders/flashShader";
export { OutlineShader } from "./shaders/outlineShader";
export { defaultSettingsData } from "./types/bareData";
export { Hitbox } from "./types/hitbox";
export { Description, Dropdown, InspectorButton, InspectorField, InspectorBaseClass, Int, Label, Locked, Range, Run, Save } from "./utils/decorators";
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
  SaveData,
  BlockedState,
} from "./types/bareTypes";
export type {
  Atlas,
  AtlasFrame,
  BareScreen, Entity,
  FrameRect,
  GameObjectClass, LayerInfo,
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

// Arcade physics (ArcadeObject, ArcadePhysicsController) are available at "bare-engine/arcade"
// Sopiro physics (RigidBody, SopiroPhysicsController) are available at "bare-engine/sopiro"

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

