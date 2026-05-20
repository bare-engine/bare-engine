import { sceneController } from "../controllers/sceneController";
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
        super({UI: true, resize: true, secret: !true, persistent: true});
    }

    OnStart(payload?: EditorUIScenePayload): void | Promise<void>
    {
        var position = payload?.openEditorButtonPosition ?? { x: .5, y: 0 };

        this.editorButton = new Button(this, {text: "Level Editor", OnPress: this.OnClickEditorButton.bind(this)});
        this.AddGameObject(this.editorButton);

        this.editorButton.SetPivot(position.x, position.y);
        this.editorButton.x = this.width * position.x;
        this.editorButton.y = this.height * position.y;

        var scale = 1;
        if (bareEngine.resolution && bareEngine.resolution.width != undefined && bareEngine.resolution.height != undefined)
            scale = bareEngine.resolution.width * .001736;
        
        this.editorButton.SetScale(scale);
        
        this.events.persistent.on(BareEvent.scene_changed, this.OnSceneChanged.bind(this));
    }

    OnSceneChanged()
    {
        this.editorButton.visible = false;
        
        for (var scene of sceneController.GetAllScenes())
        {
            if (scene.isLevel)
            {
                this.editorButton.visible = true;
                sceneController.MoveToFront(this);
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

        for (var scene of sceneController.GetAllScenes())
        {
            // HARDCODED THESE FOR NOW - NEEDED SO MOUSE IS NOT LOCKED TO DOWN AFTER CLICKING THIS BUTTON
            // HITBOX CONTROLLER FOR GOOD MEASURE TOO
            // CALLING IT RESET, NOT CLEAR, SO this[classes[i]].Clear?.(); IS NOT CALLED IN SCENE
            scene.hitboxController?.Reset();
            scene.mouseController?.Reset();
        }
        
        //sceneController.DisableAllScenes();
        sceneController.Add(EditorScene);
    }
}
