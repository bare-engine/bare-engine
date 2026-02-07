// Tree-shake friendly barrel: export named symbols directly from their modules.
// Avoid re-exporting from `main.ts` here since it has global side effects.

// Core
export { BareGame } from "./bareGame";
export { GameObject } from "./objects/gameObject";

// Core (side-effectful)
export { StartBare, GameMode, MakePath, events, pipes } from "./core";

export { BareEvent } from "./utils/bareTypes";

export { BarePlugin } from "./utils/plugin";
export { plugin } from "./utils/plugin";

// Controllers
export { BaseComponent } from "./controllers/componentController";
export { HitboxController } from "./controllers/hitboxController";
export { KeyboardController } from "./controllers/keyboardController";
export { LevelController } from "./controllers/levelController";
export { MouseController } from "./controllers/mouseController";
export { ObjectController } from "./controllers/objectController";
export { TweenController } from "./controllers/tweenController";
export { ComponentController } from "./controllers/componentController";
export { ScreenController } from "./controllers/screenController";
export { EditorController } from "./controllers/editorController";
export { ParticleController } from "./controllers/particleController";

// Controllers instances
export { keyboardController } from "./controllers/keyboardController";
export { hitboxController } from "./controllers/hitboxController";
export { mouseController } from "./controllers/mouseController";
export { tweenController } from "./controllers/tweenController";
export { componentController } from "./controllers/componentController";
export { screenController } from "./controllers/screenController";
export { levelController } from "./controllers/levelController";
export { editorController } from "./controllers/editorController";
export { particleController } from "./controllers/particleController";

import { PhysicsControllerBare } from "./controllers/PhysicsControllerBare";
import { PhysicsControllerSopiro } from "./controllers/physicsControllerSopiro";
import { EditorController } from "./controllers/editorController";
import { ComponentController } from "./controllers/componentController";
import { ParticleController } from "./controllers/particleController";
import { TweenController } from "./controllers/tweenController";
import { LevelController } from "./controllers/levelController";
import { ScreenController } from "./controllers/screenController";
import { HitboxController } from "./controllers/hitboxController";

//import { BarePlugin } from "./utils/plugin";

import { PhysicsObjectBare } from "./barePhysics";

export const BareClasses = {
  EditorController,
  PhysicsControllerSopiro,
  PhysicsControllerBare,
  PhysicsObjectBare,
  ComponentController,
  //BarePlugin,
  
  //ParticleController,
  //HitboxController,
  //TweenController,
  //LevelController,
  //ScreenController,
};

export { PhysicsObjectBare } from "./objects/physicsObjectBare";

export { TweenTo } from "./controllers/tweenController";

// Components
export { AnimationComponent } from "./components/animationComponent";

// Utils
export { assetsHandler } from "./utils/assetsHandler";
export { cameraHandler } from "./utils/CameraHandler";
export { defaultEntityData } from "./utils/bareData";
export { FileDropHandler } from "./utils/fileDropHandler";
export { Helper } from "./utils/helper";
export { Hitbox } from "./utils/hitbox";
export { PoolHandler } from "./utils/poolHandler";
export { SaveDataHandler } from "./utils/SaveDataHandler";
export { SettingsHandler as SettingsHandler } from "./utils/settingsHandler";
export { FlashShader } from "./utils/shaders/flashShader";
export { OutlineShader } from "./utils/shaders/outlineShader";

// Types and constants
export {
  AnimationData,
  CollisionHandlingType,
  Layer,
  SetLayers,
  SetUILayers,
  UI_LAYER,
  UILayer,
  SaveData,
} from "./utils/bareTypes";
export type {
  Atlas,
  AtlasFrame,
  Background,
  Component,
  Dimensions,
  Entity,
  Pipes,
  FrameRect,
  GameObjectClass,
  LayerInfo,
  LayerMap,
  LevelData,
  Position,
  BareScreen,
  SettingsData,
  SourceSize,
  SpriteSourceSize,
} from "./utils/bareTypes";
export { HitboxType, CameraScaleMode } from "./utils/gamesTypes";
export type { Rectangle, Rectangle2Vec } from "./utils/gamesTypes";

// Libraries
export { default as Rapid } from "./libraries/rapid-render/render";
export { default as GLShader } from "./libraries/rapid-render/webgl/glshader";
export { Uniform } from "./libraries/rapid-render/webgl/uniform";
export { graphicAttributes, spriteAttributes } from "./libraries/rapid-render/regions/attributes";
export { Particle } from "./libraries/rapid-render/particle";
export { ParticleEmitter } from "./libraries/rapid-render/particle";
export { Text } from "./libraries/rapid-render/texture";
export * from "./libraries/rapid-render/math";
export * from "./libraries/rapid-render/interface";
export * from "./libraries/rapid-render/texture";
export * from "./libraries/rapid-render/render";

export { Easing } from "./libraries/tweenJS/Easing";
export type { EasingFunction, EasingFunctionGroup } from "./libraries/tweenJS/Easing";
export { default as Group } from "./libraries/tweenJS/Group";
export { default as Interpolation } from "./libraries/tweenJS/Interpolation";
export type { InterpolationFunction } from "./libraries/tweenJS/Interpolation";
export { default as Sequence } from "./libraries/tweenJS/Sequence";
export { Tween } from "./libraries/tweenJS/Tween";
export type { UnknownProps } from "./libraries/tweenJS/Tween";
export { default as VERSION } from "./libraries/tweenJS/Version";
export { default as now, setNow } from "./libraries/tweenJS/Now";
export { mainGroup } from "./libraries/tweenJS/mainGroup";
