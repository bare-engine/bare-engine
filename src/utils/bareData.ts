import { SettingsData } from "./bareTypes";

export const defaultEntityData: SettingsData = {
  entityBases: {
    ANY: {
      extend: "GameObject"
    }
  },
  entities: {},
  layers: ["Objects"],
  uiLayers: ["Ui"],
  layersInfo: {
    Objects: {
      doSave: true
    }
  },
  presets: {
    DEFAULT: {
      pivotBasedOnHitbox: {
        x: 0.5,
        y: 0.5
      }
    },
    FULL: {
      hitbox: {
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1
      }
    }
  },
  saveVars: {
    GameObject: ["name", "position"]
  },
  settings: {
    gridEnabled: false,
    gridSize: 64
  }
};