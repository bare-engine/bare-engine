import { BareEvent, Component } from 'bare-engine';

export class FocusComponent extends Component
{
    private onFocus = (focused: boolean) => {
        this.go.alpha = focused ? 1 : 0.5;
    };

    override OnAdded()
    {
        bare.globalEvents.on(BareEvent.game_focusChange, this.onFocus);
    }

    override OnRemoved()
    {
        bare.globalEvents.off(BareEvent.game_focusChange, this.onFocus);
    }
}
