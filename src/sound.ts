// Sound-only entrypoint to keep Howler + SoundHandler in a separate subpath.

export { soundHandler } from "./utils/soundHandler";
export { Howl, Howler } from "./libraries/howler/howler.core.js";
export type { HowlOptions } from "./libraries/howler/howler.core.js";
