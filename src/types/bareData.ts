import { SettingsData } from "./bareTypes";

export const defaultSettingsData: SettingsData = {
  baseEntities: {
    ANY: {
    },
    ANY_ENTITY: {
      baseEntity: "ANY",
    },
    NONE: {
    }
  },
  entities: {},
  layers: ["objects"],
  layersInfo: {
    objects: {
      doSave: true
    }
  },
  categories: {
    
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
    },
    CENTER: {
      pivot: {
        x: 0.5,
        y: 0.5
      }
    }
  },
  saveVars: {
    GameObject: ["position", "children", "components"],
    PhysicsObjectBare: ["scale"]
  },
  settings: {
    gridEnabled: false,
    gridSize: 64
  },
  defaultAnimationFramesPerSecond: 8,
  gravity: 0
};