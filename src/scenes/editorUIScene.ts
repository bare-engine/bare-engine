import { Button } from "../objects/button";
import { BareEvent, Position, SaveData } from "../types/bareTypes";
import { EditorScene } from "./editorScene";
import { Scene } from "./scene";

export type EditorUIScenePayload = { openEditorButtonPosition: Position }

export class EditorUIScene extends Scene
{
    editorButton: Button;
    
    constructor()
    {
        super({UI: true, resize: true, persistent: true});
    }

    OnStart(payload?: EditorUIScenePayload): void | Promise<void>
    {
        var position = payload?.openEditorButtonPosition ?? { x: .5, y: 0 };

        this.editorButton = new Button(this, {text: "Level Editor", fontFamily: bare.defaultEngineFont, OnPress: this.OnClickEditorButton.bind(this)});
        this.AddGameObject(this.editorButton);
        this.editorButton.buttonColor.a = 180;

        this.editorButton.SetPivot(position.x, position.y);
        this.editorButton.x = bare.width * position.x;
        this.editorButton.y = bare.height * position.y;

        var scale = 1;
        if (bare.resolution && bare.resolution.width != undefined && bare.resolution.height != undefined)
            scale = bare.resolution.width * .001736;
        
        this.editorButton.SetScale(scale);
        
        this.events.persistent.on(BareEvent.scene_changed, this.OnSceneChanged.bind(this));
    }

    OnSceneChanged()
    {
        this.editorButton.visible = false;
        
        for (var scene of bare.scene.GetAll())
        {
            if (scene.isLevel)
            {
                this.editorButton.visible = true;
                bare.scene.MoveToFront(this);
                break;
            }
        }
    }
    
    async OnClickEditorButton()
    {
        if (SaveData.currentLevelStr === '')
        {
            console.warn('[editor] No level loaded, cannot open editor');
            return;
        }

        for (var scene of bare.scene.GetAll())
        {
            // HARDCODED THESE FOR NOW - NEEDED SO MOUSE IS NOT LOCKED TO DOWN AFTER CLICKING THIS BUTTON
            // HITBOX CONTROLLER FOR GOOD MEASURE TOO
            // CALLING IT RESET, NOT CLEAR, SO THE SCENE'S CLEAR LOOP IS NOT CALLED
            // BACKING FIELD (_) READS: ONLY RESET CONTROLLERS THE SCENE ACTUALLY HAS
            scene.Get("_hitbox")?.Reset();
            scene.Get("_mouse")?.Reset();
        }
        
        bare.scene.Add(EditorScene);
    }
}
