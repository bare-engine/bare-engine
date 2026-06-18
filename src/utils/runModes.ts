import { GameMode } from "../globals";

const RUN_MODES_KEY = "__runModes__";

/**
 * Restricts when a component is active based on GameMode.
 *
 * @Run(GameMode.Editor)                — component is only added in Editor mode
 * @Run(GameMode.Game, GameMode.Editor) — component is added in both modes
 *
 * Lives outside decorators.ts on purpose: @Run carries real runtime semantics (read via
 * RUN_MODES_KEY in componentController), so it must survive the production build that strips
 * the editor-only inspector decorators and tree-shakes decorators.ts away.
 */
export function Run(...modes: GameMode[])
{
    return function (target: any)
    {
        target[RUN_MODES_KEY] = modes;
        return target;
    };
}

export { RUN_MODES_KEY };
