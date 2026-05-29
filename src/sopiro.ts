import type { RigidBody } from "./libraries/Sopiro/rigidbody";

// Controller
export { SopiroPhysicsController } from "./controllers/sopiroPhysicsController";

// Libraries: Sopiro
export * from "./libraries/Sopiro/aabb";
export * from "./libraries/Sopiro/aabbtree";
export * from "./libraries/Sopiro/angle";
export * from "./libraries/Sopiro/box";
export * from "./libraries/Sopiro/circle";
export * from "./libraries/Sopiro/constraint";
export * from "./libraries/Sopiro/contact";
export * from "./libraries/Sopiro/distance";
export * from "./libraries/Sopiro/edge";
export * from "./libraries/Sopiro/grab";
export * from "./libraries/Sopiro/island";
export * from "./libraries/Sopiro/joint";
export * from "./libraries/Sopiro/line";
export * from "./libraries/Sopiro/math";
export * from "./libraries/Sopiro/maxdistance";
export * from "./libraries/Sopiro/motor";
export * from "./libraries/Sopiro/nsquared";
export * from "./libraries/Sopiro/polygon";
export * from "./libraries/Sopiro/polytope";
export * from "./libraries/Sopiro/prismatic";
export * from "./libraries/Sopiro/renderer";
export * from "./libraries/Sopiro/revolute";
export * from "./libraries/Sopiro/rigidbody";
export * from "./libraries/Sopiro/settings";
export * from "./libraries/Sopiro/simplex";
export * from "./libraries/Sopiro/timer";
export * from "./libraries/Sopiro/util";
export * from "./libraries/Sopiro/weld";
export * from "./libraries/Sopiro/world";

// Collision pair typing — only merged into the global union when a project
// opts into Sopiro physics by importing from "bare-engine/sopiro". Kept out of
// sopiroPhysicsController.ts so that scene.ts's `import type` of the controller
// doesn't pull RigidBody into every project's collision event payloads.
declare module "./types/bareTypes" {
  interface BareCollisionEventPairs {
    sopiro: [RigidBody, RigidBody];
  }
}
