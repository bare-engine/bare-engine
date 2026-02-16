import { Button, SaveData, sceneController } from "../exports";
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
        this.editorButton = new Button({text: "Open Editor", OnPress: this.OnClickEditorButton.bind(this)});
        this.AddGameObject(this.editorButton);

        // HIDE EDITOR BUTTON IN PRODUCTION
        if (!window.isLocalhost)
            this.editorButton.visible = false;
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