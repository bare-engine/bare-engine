import { SettingsData } from "./bareTypes";

export const defaultSettingsData: SettingsData = {
  basePrefabs: [
    {
      name: "ANY",
    },
    {
      name: "NONE",
    }
  ],
  prefabs: [],
  layers: ["objects"],
  layersInfo: {
    objects: {
      save: true
    }
  },
  categories: {
    
  },
  presets: {
    FULL: {
      hitbox: {
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1
      }
    },
    CENTER: {
      ANY: {
        x: 0.5,
        y: 0.5
      }
    }
  },
  saveVars: {
    GameObject: ["position", "children", "components"]
  },
  settings: {
    gridEnabled: false,
    gridSize: 64
  },
  defaultAnimationFramesPerSecond: 8,
  gravity: 0,
  editorObjectSnapToPivot: true
};
