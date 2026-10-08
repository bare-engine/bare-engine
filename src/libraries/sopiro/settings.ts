// SOLVER SETTINGS. UNITS ARE GAME UNITS (PIXELS) AND SECONDS.
// THESE ARE THE DEFAULTS FOR EVERY SCENE. A SCENE CAN OVERRIDE ANY OF THEM WITH "sopiro" IN ITS settingsData,
// WHICH World.update APPLIES WHILE IT STEPS THAT SCENE (SEE World.update)
export const Settings = {
    // RENDERER CANVAS SIZE, ONLY FOR THE DEBUG RENDERER
    width: 1280,
    height: 720,

    // SET EVERY STEP BY THE CONTROLLER, FROM bare.fixedTimestep
    dt: 1.0 / 60.0,
    inv_dt: 60.0,

    GJK_MAX_ITERATION: 20,
    GJK_TOLERANCE: 1e-13 * 1e-13,
    EPA_MAX_ITERATION: 20,
    EPA_TOLERANCE: 1e-13,

    applyGravity: true,
    // DOWNWARD GRAVITY WHEN settingsData HAS NO "gravity"
    gravity: 1200,

    // SOLVER PASSES PER STEP. MORE MAKES STACKS STEADIER AND COSTS MORE
    numIterations: 10,
    impulseAccumulation: true,
    warmStarting: true,
    blockSolve: true,

    // OVERLAP CORRECTION
    positionCorrection: true,
    // PUSH OVERLAPPING BODIES APART WITHOUT GIVING THEM SPEED, LIKE Box2D. false: THE PUSH IS ADDED TO THEIR VELOCITY (BAUMGARTE)
    splitImpulse: true,
    // HOW MUCH OF AN OVERLAP IS CORRECTED PER STEP
    positionCorrectionBeta: 0.2,
    // OVERLAP LEFT ALONE, SO RESTING CONTACTS STAY TOUCHING
    penetrationSlop: 0.5,

    // BODIES HITTING EACH OTHER SLOWER THAN THIS DON'T BOUNCE. MUST BE ABOVE gravity * dt, OR RESTING BODIES JITTER
    restitutionThreshold: 50,

    // A CONTACT REUSES LAST STEP'S IMPULSE WHEN ITS POINT MOVED LESS THAN THIS, SQUARED
    applyWarmStartingThreshold: true,
    warmStartingThreshold: 1 * 1,

    // SLEEPING: BODIES SLOWER THAN THESE (SQUARED) FOR sleepingWait SECONDS FALL ASLEEP, WITH EVERYTHING THEY TOUCH
    sleepEnabled: true,
    sleepingWait: 0.5,
    restLinearTolerance: 1 * 1,
    restAngularTolerance: (2 * Math.PI / 180.0) * (2 * Math.PI / 180.0),

    // BODIES DEFAULTS. FRICTION MIXES AS sqrt(fA * fB), RESTITUTION AS max(rA, rB), LIKE Box2D
    densityFactor: 10000,
    defaultDensity: 1,
    defaultFriction: 0.7,
    defaultRestitution: 0,

    // DEBUG GRAB STRENGTH
    mouseStrength: 1.5,

    // DEBUG RENDERING
    indicateCP: false,
    indicateCoM: false,
    showBoundingBox: false,
    showContactLink: false,
    showInfo: false,
    showProfile: false,
    visualizeAABBTree: false,
    colorizeBody: false,
    colorizeIsland: false,
    colorizeActiveBody: true,

    // BODIES BELOW THIS ARE REMOVED. DISABLED
    deadBottom: -1000000.0,

    // FOR Util's RANDOM POLYGON HELPERS
    randomConvexMaxVertices: 8,
    regularPolygonMaxVertices: 11,
}

export type SopiroSettings = typeof Settings;
