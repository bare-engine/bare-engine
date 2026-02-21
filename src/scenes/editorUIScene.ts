import { BareEvent, Button, SaveData, sceneController } from "../exports";
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
        this.AddGameObject(this.editorButton);

        // HIDE EDITOR BUTTON IN PRODUCTION
        if (!window.isLocalhost)
            this.editorButton.visible = false;
        
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

        sceneController.DisableAllScenes();
        sceneController.Add(EditorScene, {levelInput: SaveData.currentLevelStr});
    }
}