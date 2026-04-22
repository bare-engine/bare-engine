// Tree-shake friendly barrel: export named symbols directly from their modules.
// Avoid re-exporting from `main.ts` here since it has global side effects.

// Core
export { Scene } from "../scenes/scene";
export { GameObject } from "../objects/gameObject";

// Core (side-effectful)
export { BareEngine } from "../bareEngine";
export { StartBare, GameMode, MakePath, globalEvents } from "./core";

export { BareEvent, Events } from "../types/bareTypes";
export type { SceneI } from "../types/bareTypes";
export { AnimationEvent, AnimationEventPayload as AnimationEvents } from "../components/animationComponent";

export { PluginHandler as BarePlugin } from "../handlers/pluginHandler";
export { plugin } from "../handlers/pluginHandler";
export { LevelHandler } from "../handlers/levelHandler";
export { levelHandler } from "../handlers/levelHandler";
export { Button } from "../objects/button";

// Controllers
export { BaseComponent } from "../controllers/componentController";
export { HitboxController } from "../controllers/hitboxController";
export type { ButtonHandlers } from "../controllers/hitboxController";
export { KeyboardController } from "../controllers/keyboardController";
export { MouseController } from "../controllers/mouseController";
export { ObjectController } from "../controllers/objectController";
export { TweenController } from "../controllers/tweenController";
export { ComponentController } from "../controllers/componentController";
export { SceneController } from "../controllers/sceneController";
export { ParticleController } from "../controllers/particleController";

export { physicsControllerBare } from "../controllers/physicsControllerBare";


// Controllers instances
export { keyboardController } from "../controllers/keyboardController";
export { hitboxController } from "../controllers/hitboxController";
export { mouseController } from "../controllers/mouseController";
export { tweenController } from "../controllers/tweenController";
export { componentController } from "../controllers/componentController";
export { sceneController } from "../controllers/sceneController";
export { particleController } from "../controllers/particleController";
export { objectController } from "../controllers/objectController";

import { PhysicsControllerBare } from "../controllers/physicsControllerBare";

import { ComponentController } from "../controllers/componentController";
import { ParticleController } from "../controllers/particleController";
import { TweenController } from "../controllers/tweenController";
import { SceneController } from "../controllers/sceneController";
import { HitboxController } from "../controllers/hitboxController";


//import { BarePlugin } from "./handlers/plugin";

import { PhysicsObjectBare } from "./barePhysics";

export const BareClasses = {
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

export { PhysicsObjectBare } from "../objects/physicsObjectBare";

export { TweenTo } from "../controllers/tweenController";

// Components
export { AnimationComponent } from "../components/animationComponent";
export { ParticleComponent } from "../components/particleComponent";
export { CollisionEventComponent } from "../components/collisionEventComponent";
export { TextObject } from "../objects/textObject";

// Utils
export { assetsHandler } from "../handlers/assetsHandler";
export { cameraHandler } from "../handlers/cameraHandler";
export { CameraHandler } from "../handlers/cameraHandler";
export { defaultSettingsData as defaultEntityData } from "../types/bareData";
export { FileDropHandler } from "../handlers/fileDropHandler";
export { Helper } from "../utils/helper";
export { Hitbox } from "../types/hitbox";
export { PoolHandler } from "../handlers/poolHandler";
export { SaveDataHandler } from "../handlers/SaveDataHandler";
export { SettingsHandler as SettingsHandler } from "../handlers/settingsHandler";
export { FlashShader } from "../shaders/flashShader";
export { InspectorButton, Run } from "../utils/decorators";
export { OutlineShader } from "../shaders/outlineShader";

export {EditorScene} from "../scenes/editorScene";
export {EditorUIScene} from "../scenes/editorUIScene";
export { uiScene } from "../scenes/uiScene";

// Types and constants
export {
  AnimationData,
  CollisionHandlingType,
  SaveData,
} from "../types/bareTypes";
export type {
  Atlas,
  AtlasFrame,
  Component,
  Size,
  Rectangle, Rectangle2Vec,
  Entity,
  Pipes,
  FrameRect,
  GameObjectClass,
  LayerInfo,
  LevelData,
  Position,
  BareScreen,
  SettingsData,
  SourceSize,
  SpriteSourceSize,
} from "../types/bareTypes";

export { HitboxType, CameraScaleMode } from "../types/bareTypes";

// Libraries
export { default as Rapid } from "../libraries/rapid-render/render";
export { default as GLShader } from "../libraries/rapid-render/webgl/glshader";
export { Uniform } from "../libraries/rapid-render/webgl/uniform";
export { graphicAttributes, spriteAttributes } from "../libraries/rapid-render/regions/attributes";
export { Particle } from "../libraries/rapid-render/particle";
export { ParticleEmitter } from "../libraries/rapid-render/particle";
export { BareText } from "../libraries/rapid-render/texture";
export * from "../libraries/rapid-render/math";
export * from "../libraries/rapid-render/interface";
export * from "../libraries/rapid-render/texture";
export * from "../libraries/rapid-render/render";

export { Easing } from "../libraries/tweenJS/Easing";
export type { EasingFunction, EasingFunctionGroup } from "../libraries/tweenJS/Easing";
export { default as Group } from "../libraries/tweenJS/Group";
export { default as Interpolation } from "../libraries/tweenJS/Interpolation";
export type { InterpolationFunction } from "../libraries/tweenJS/Interpolation";
export { default as Sequence } from "../libraries/tweenJS/Sequence";
export { Tween } from "../libraries/tweenJS/Tween";
export type { UnknownProps } from "../libraries/tweenJS/Tween";
export { default as VERSION } from "../libraries/tweenJS/Version";
export { default as now, setNow } from "../libraries/tweenJS/Now";
export { mainGroup } from "../libraries/tweenJS/mainGroup";
