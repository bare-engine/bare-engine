import { SettingsData } from "./bareTypes";

export const defaultEntityData: SettingsData = {
  entityBases: {
    ANY: {
      extendClass: "GameObject"
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
    }
  },
  saveVars: {
    GameObject: ["name", "position"],
    PhysicsObjectBare: ["name", "position", "scale"]
  },
  settings: {
    gridEnabled: false,
    gridSize: 64
  }
};