import "./howler.core.js";
import type { Howl as HowlType, HowlerGlobal } from "./howler.core.js";

const globalHowler = globalThis as typeof globalThis & {
    Howl: typeof HowlType;
    Howler: HowlerGlobal;
};

export const Howl = globalHowler.Howl;
export const Howler = globalHowler.Howler;
export type Howl = InstanceType<typeof Howl>;
export type { HowlOptions } from "./howler.core.js";
export default Howler;
