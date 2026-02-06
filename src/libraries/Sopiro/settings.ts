import * as Util from "./util";

export enum GenerationShape
{
    Box = 0,
    Circle,
    Regular,
    Random
}

export enum MouseMode
{
    Grab = 0,
    Force
}

const frequencyRange: Util.Pair<number, number> = { p1: 10, p2: 240 };
const iterationRange: Util.Pair<number, number> = { p1: 1, p2: 50 };
const densityRange: Util.Pair<number, number> = { p1: 1, p2: 100 };
const sizeRange: Util.Pair<number, number> = { p1: 0.1, p2: 3 };
const gravityForceRange: Util.Pair<number, number> = { p1: -20, p2: 20 };
const frictionRange: Util.Pair<number, number> = { p1: 0, p2: 1 };
const restitutionRange: Util.Pair<number, number> = { p1: 0, p2: 1 };
const numVerticesRange: Util.Pair<number, number> = { p1: 2.9, p2: 17 };
const strengthRange: Util.Pair<number, number> = { p1: 0.2, p2: 2.0 };

// Simulation settings
export const Settings = {
    width: 1280,
    height: 720,
    clipWidth: 12.8,
    clipHeight: 7.2,
    paused: false,
    frequency: 60,
    dt: 1.0 / 60.0, // delta time
    inv_dt: 60.0,
    GJK_MAX_ITERATION: 20,
    GJK_TOLERANCE: 1e-13 * 1e-13,
    EPA_MAX_ITERATION: 20,
    EPA_TOLERANCE: 1e-13,
    applyGravity: true,
    positionCorrection: true,
    impulseAccumulation: true,
    warmStarting: true,
    indicateCP: false,
    indicateCoM: false,
    showBoundingBox: false,
    showContactLink: false,
    mode: MouseMode.Grab,
    mouseStrength: 1.5,
    numIterations: 10, // Number of resolution(sequential impulses) iterations
    newBodySettings:
    {
        shape: GenerationShape.Box,
        density: 8,
        size: 0.5,
        friction: 0.7,
        restitution: 0.0,
        numVertices: Math.trunc(Util.random(3.0, 18.0)),
    },
    gravity: 2400,
    gravityScale: 0.5,
    penetrationSlop: 0.005,
    restitutionSlop: 50, // This has to be greater than (gravity * gravityScale * deltaTime)
    positionCorrectionBeta: 0.2,
    warmStartingThreshold: 0.005 * 0.005,
    deadBottom: -1000000.0, // DISABLED
    resetCamera: true,
    grabCenter: false,
    showInfo: false,
    randomConvexMaxVertices: 8,
    regularPolygonMaxVertices: 11,
    defaultDensity: 12.5,
    defaultFriction: 0.7,
    defaultRestitution: 0.7,
    blockSolve: true,
    colorizeBody: false,
    colorizeIsland: false,
    restLinearTolerance: 0.005 * 0.005,
    restAngularTolerance: (0.5 * Math.PI / 180.0) * (0.5 * Math.PI / 180.0),
    sleepingWait: 0.5,
    colorizeActiveBody: true,
    sleepEnabled: true,
    applyWarmStartingThreshold: true,
    showProfile: false,
    visualizeAABBTree: false,
}