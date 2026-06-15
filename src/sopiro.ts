/// <reference path="./types/globals.d.ts" />

import type { RigidBody } from "./libraries/sopiro/rigidbody";

// Controller
export { SopiroPhysicsController, sopiro } from "./controllers/sopiroPhysicsController";

// Libraries: Sopiro
export * from "./libraries/sopiro/aabb";
export * from "./libraries/sopiro/aabbtree";
export * from "./libraries/sopiro/angle";
export * from "./libraries/sopiro/box";
export * from "./libraries/sopiro/circle";
export * from "./libraries/sopiro/constraint";
export * from "./libraries/sopiro/contact";
export * from "./libraries/sopiro/distance";
export * from "./libraries/sopiro/edge";
export * from "./libraries/sopiro/grab";
export * from "./libraries/sopiro/island";
export * from "./libraries/sopiro/joint";
export * from "./libraries/sopiro/line";
export * from "./libraries/sopiro/math";
export * from "./libraries/sopiro/maxdistance";
export * from "./libraries/sopiro/motor";
export * from "./libraries/sopiro/nsquared";
export * from "./libraries/sopiro/polygon";
export * from "./libraries/sopiro/polytope";
export * from "./libraries/sopiro/prismatic";
export * from "./libraries/sopiro/renderer";
export * from "./libraries/sopiro/revolute";
export * from "./libraries/sopiro/rigidbody";
export * from "./libraries/sopiro/settings";
export * from "./libraries/sopiro/simplex";
export * from "./libraries/sopiro/timer";
export * from "./libraries/sopiro/util";
export * from "./libraries/sopiro/weld";
export * from "./libraries/sopiro/world";

// Collision pair typing — only merged into the global union when a project
// opts into Sopiro physics by importing from "bare-engine/sopiro". Kept out of
// sopiroPhysicsController.ts so that scene.ts's `import type` of the controller
// doesn't pull RigidBody into every project's collision event payloads.
declare module "./types/bareTypes" {
  interface BareCollisionEventPairs {
    sopiro: [RigidBody, RigidBody];
  }
}
