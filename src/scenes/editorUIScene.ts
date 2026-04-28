import { sceneController } from "../controllers/sceneController";
import { Button } from "../objects/button";
import { BareEvent, SaveData } from "../types/bareTypes";
import { EditorScene } from "./editorScene";
import { Scene } from "./scene";

export class EditorUIScene extends Scene
{
    editorButton: Button;
    
    constructor()
    {
        super({UI: true, persistent: true});
    }

    OnStart(): void | Promise<void>
    {
        this.editorButton = new Button(this, {text: "Open Editor", OnPress: this.OnClickEditorButton.bind(this)});
        this.editorButton.alpha = .75;
        this.AddGameObject(this.editorButton);
        
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
