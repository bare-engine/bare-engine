import { Color, GameObject, Scene } from 'bare-engine';

export class FirstGame extends Scene
{
    player: GameObject;

    OnStart()
    {
        this.player = this.AddGameObject('PIXEL')
            .SetScale(32)
            .SetColor(Color.Orange)
            .SetPosition(bare.width / 2, bare.height / 2)
            .CenterPivot();
    }

    OnUpdate(deltaTime: number)
    {
        const direction = Number(bare.keyboard.IsRightDown())
            - Number(bare.keyboard.IsLeftDown());
        this.player.x += direction * 200 * deltaTime;
    }
}
