import { SettingsData } from "./bareTypes";

export const defaultSettingsData: SettingsData = {
  baseEntities: {
    ANY: {
      baseClass: "GameObject"
    },
    ANY_ENTITY: {
      baseEntity: "ANY",
      baseClass: "GameObject"
    },
    NONE: {
      baseClass: "GameObject"
    }
  },
  entities: {},
  layers: ["objects"],
  layersInfo: {
    objects: {
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