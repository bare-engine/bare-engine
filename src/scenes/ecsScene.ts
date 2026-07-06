/// <reference path="./../types/globals.d.ts" />

import { Scene } from "./scene";
import { World } from "../libraries/miniplex";
import { createQueue } from "../libraries/miniplex/queue";
import type { Entity, SceneOptions, SettingsData } from "../types/bareTypes";

export { Query, World } from "../libraries/miniplex";
export type { Strict, With, Without } from "../libraries/miniplex";
export { createQueue } from "../libraries/miniplex/queue";

export type SceneECSQueue = ReturnType<typeof createQueue>;

export function enableSceneECS<T extends Scene>(scene: T): T
{
    scene.worldECS = new World<Entity>();
    scene.queueECS = createQueue();

    return scene;
}

export class ECSScene extends Scene
{
    public worldECS = new World<Entity>();
    public queueECS = createQueue();

    constructor(sceneOptions?: SceneOptions | SettingsData)
    {
        super(sceneOptions);
    }
}
