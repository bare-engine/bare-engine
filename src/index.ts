/// <reference path="./types/globals.d.ts" />

// Core
export { BareEngine } from "./bareEngine";
export { Bare } from "./types/bare";
export { GameMode, globalEvents } from "./globals";
export { MakePath, StartBare } from "./main";
export { Button, type ButtonEntity } from "./objects/button";
export { GameObject } from "./objects/gameObject";
export { TextObject, type TextObjectEntity } from "./objects/textObject";

export { Scene } from "./scenes/scene";
export type { SoundJsSound } from "./libraries/soundjs/index";

export { Query, World, createQueue } from "./libraries/miniplex/index";
export type { With, Without, Strict } from "./libraries/miniplex/index";

// Controllers
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
export { TextComponent } from "./components/textComponent";

// Editor
export { EditorScene } from "./scenes/editorScene";
export { EditorUIScene } from "./scenes/editorUIScene";
export { uiScene } from "./scenes/uiScene";

// Shaders and utils
export { Shader } from "./types/bareTypes";
export { FlashShader } from "./shaders/flashShader";
export { OutlineShader } from "./shaders/outlineShader";
export { defaultSettingsData } from "./types/bareData";
export { Hitbox } from "./types/hitbox";
export { Decimal, Description, Dropdown, Enum, Hidden, Inspector, InspectorButton, InspectorField, InspectorClass, InspectorBaseClass, Int, Label, Limit, Locked, Percentage, Range } from "./utils/decorators";
export { SerializeField } from "./utils/serializeFields";
export { Run } from "./utils/runModes";
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
  AnyEntity, BareScreen, Entity,
  FrameRect,
  GameObjectClass, LayerInfo,
  LevelData,
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
// export * from "./libraries/rapid-render/interface";
// export * from "./libraries/rapid-render/math";
// export { Particle, ParticleEmitter } from "./libraries/rapid-render/particle";
// export { graphicAttributes, spriteAttributes } from "./libraries/rapid-render/regions/attributes";
// export * from "./libraries/rapid-render/render";
// export { default as Rapid } from "./libraries/rapid-render/render";
// export * from "./libraries/rapid-render/texture";
// export { BareText } from "./libraries/rapid-render/texture";
// export { QuadTree } from "./libraries/quadTree";
// export type { QuadTreeItem } from "./libraries/quadTree";
// export { default as GLShader } from "./libraries/rapid-render/webgl/glshader";
// export { Uniform } from "./libraries/rapid-render/webgl/uniform";
export * from "./libraries/rapid-render";

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

