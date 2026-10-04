import { Component, Inspector, InspectorField } from 'bare-engine';

export enum State { Idle, Walking }

export class StateComponent extends Component
{
    private currentState = State.Idle;

    @InspectorField
    @Inspector.Enum(State)
    get state(): State { return this.currentState; }
    set state(value: State) { this.currentState = value; }
}
