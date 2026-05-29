import type { ArcadeObject } from "./objects/arcadeObject";

// Controller
export { ArcadePhysicsController, arcadePhysicsController } from "./controllers/arcadePhysicsController";

// Object
export { ArcadeObject } from "./objects/arcadeObject";

// Collision pair typing — only merged into the global union when a project
// opts into Arcade physics by importing from "bare-engine/arcade". Kept out of
// arcadePhysicsController.ts so that importing the controller type elsewhere
// doesn't pull ArcadeObject into every project's collision event payloads.
declare module "./types/bareTypes" {
  interface BareCollisionEventPairs {
    arcade: [ArcadeObject, ArcadeObject];
  }
}
