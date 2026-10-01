import { BareEvent, Scene } from 'bare-engine';
import { FirstGame } from '../docExamples/firstGame';
import { EcsGame } from '../docExamples/ecs';
import { State, StateComponent } from '../docExamples/inspectorState';
import { FocusComponent } from '../docExamples/focusComponent';
import { PaintScene } from '../docExamples/paintScene';

export class DocsExamplesTest extends Scene
{
    async OnStart()
    {
        const first = await bare.scene.Add(FirstGame);
        const startX = first.player.x;
        const keyboard = bare.keyboard;
        const right = keyboard.IsRightDown;
        const left = keyboard.IsLeftDown;
        try
        {
            keyboard.IsRightDown = () => true;
            keyboard.IsLeftDown = () => false;
            first.OnUpdate(0.5);
            assert(first.player.x === startX + 100, 'Tutorial movement uses units per second');
            assert(first.player.width > 0, 'Tutorial sprite has a loaded texture');
        }
        finally
        {
            keyboard.IsRightDown = right;
            keyboard.IsLeftDown = left;
            bare.scene.Remove(first);
        }

        const state = this.AddGameObject().AddComponent(StateComponent);
        assert(state.state === State.Idle, 'Inspector state starts idle');
        state.state = State.Walking;
        assert(state.state === State.Walking, 'Inspector setter updates the backing value');

        const focusObject = this.AddGameObject();
        focusObject.AddComponent(FocusComponent);
        bare.globalEvents.emit(BareEvent.game_focusChange, false);
        assert(focusObject.alpha === 0.5, 'Global listener reacts while attached');
        focusObject.RemoveComponent(FocusComponent);
        focusObject.alpha = 1;
        bare.globalEvents.emit(BareEvent.game_focusChange, false);
        assert(focusObject.alpha === 1, 'Global listener is released on removal');
        bare.globalEvents.emit(BareEvent.game_focusChange, true);

        const paint = await bare.scene.Add(PaintScene);
        const oldCanvas = paint.canvas;
        await paint.Restart();
        assert(paint.canvas !== oldCanvas, 'Render texture is recreated on restart');
        bare.scene.Remove(paint);
        assert(paint.canvas === undefined, 'Scene cleanup releases its render texture reference');

        const ecs = await bare.scene.Add(EcsGame);
        const enemy = ecs.world.first!;
        const health = enemy.health;
        ecs.OnUpdate(0.5);
        assert(enemy.health === health - 0.5, 'ECS query applies poison');
        enemy.Remove();
        assert(ecs.world.size === 0 && ecs.poisoned.size === 0, 'Removed objects leave the ECS world and query');
        await ecs.Restart();
        assert(ecs.world.size === 1 && ecs.poisoned.size === 1, 'Restart creates one tracked enemy');
        assert(ecs.world.first!.health === 10, 'Pooled custom fields reset');
        bare.scene.Remove(ecs);
        assert(ecs.world.size === 0, 'Removing the scene releases ECS entities');
    }
}
