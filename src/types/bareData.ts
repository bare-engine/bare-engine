import { SettingsData } from "./bareTypes";

export const defaultEntityData: SettingsData = {
  entityBases: {
    ANY: {
      extendClass: "GameObject"
    },
    ANY_ENTITY: {
      extendBase: "ANY",
      extendClass: "GameObject"
    },
    NONE: {
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
    GameObject: ["position", "children", "components"],
    PhysicsObjectBare: ["scale"]
  },
  settings: {
    gridEnabled: false,
    gridSize: 64
  }
};