import { editorController } from "..";
import { BareGame } from "../main";

export class EditorScene extends BareGame
{
    constructor()
    {
        super();
        
        editorController.Open();
    }
}