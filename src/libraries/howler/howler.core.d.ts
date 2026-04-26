export type HowlCallback = (soundId: number) => void;
export type HowlErrorCallback = (soundId: number, error: unknown) => void;
export type SpatialOrientation = [number, number, number];
export type SpatialPosition = [number, number, number];

export interface SoundSpriteDefinitions {
    [name: string]: [number, number] | [number, number, boolean];
}

export interface PannerAttributes {
    coneInnerAngle?: number | undefined;
    coneOuterAngle?: number | undefined;
    coneOuterGain?: number | undefined;
    distanceModel?: "inverse" | "linear";
    maxDistance?: number;
    panningModel?: "HRTF" | "equalpower";
    refDistance?: number;
    rolloffFactor?: number;
}

export interface HowlListeners {
    onstop?: HowlCallback | undefined;
    onpause?: HowlCallback | undefined;
    onload?: HowlCallback | undefined;
    onmute?: HowlCallback | undefined;
    onvolume?: HowlCallback | undefined;
    onrate?: HowlCallback | undefined;
    onseek?: HowlCallback | undefined;
    onfade?: HowlCallback | undefined;
    onunlock?: HowlCallback | undefined;
    onend?: HowlCallback | undefined;
    onplay?: HowlCallback | undefined;
    onloaderror?: HowlErrorCallback | undefined;
    onplayerror?: HowlErrorCallback | undefined;
}

export interface HowlOptions extends HowlListeners {
    src: string | string[];
    volume?: number | undefined;
    html5?: boolean | undefined;
    loop?: boolean | undefined;
    preload?: boolean | "metadata" | undefined;
    autoplay?: boolean | undefined;
    mute?: boolean | undefined;
    sprite?: SoundSpriteDefinitions | undefined;
    rate?: number | undefined;
    pool?: number | undefined;
    format?: string | string[] | undefined;
    xhr?:
        | {
              method?: string | undefined;
              headers?: Record<string, string> | undefined;
              withCredentials?: boolean | undefined;
          }
        | undefined;
}

export declare class Howl {
    constructor(options: HowlOptions);

    play(spriteOrId?: string | number): number;
    pause(id?: number): this;
    stop(id?: number): this;

    mute(): boolean;
    mute(muted: boolean, id?: number): this;

    volume(): number;
    volume(idOrSetVolume: number): this | number;
    volume(volume: number, id: number): this;

    fade(from: number, to: number, duration: number, id?: number): this;

    rate(id?: number): number;
    rate(rate: number, id?: number): this;

    seek(id?: number): number;
    seek(seek: number, id?: number): this;

    loop(id?: number): boolean;
    loop(loop: boolean, id?: number): this;

    playing(id?: number): boolean;
    duration(id?: number): number;
    state(): "unloaded" | "loading" | "loaded";
    load(): this;
    unload(): null;

    on(event: "load", callback: () => void, id?: number): this;
    on(event: "loaderror" | "playerror", callback: HowlErrorCallback, id?: number): this;
    on(
        event: "play" | "end" | "pause" | "stop" | "mute" | "volume" | "rate" | "seek" | "fade" | "unlock",
        callback: HowlCallback,
        id?: number,
    ): this;
    on(event: string, callback: HowlCallback | HowlErrorCallback, id?: number): this;

    once(event: "load", callback: () => void, id?: number): this;
    once(event: "loaderror" | "playerror", callback: HowlErrorCallback, id?: number): this;
    once(
        event: "play" | "end" | "pause" | "stop" | "mute" | "volume" | "rate" | "seek" | "fade" | "unlock",
        callback: HowlCallback,
        id?: number,
    ): this;
    once(event: string, callback: HowlCallback | HowlErrorCallback, id?: number): this;

    off(event: "load", callback?: () => void, id?: number): this;
    off(event: "loaderror" | "playerror", callback?: HowlErrorCallback, id?: number): this;
    off(
        event: "play" | "end" | "pause" | "stop" | "mute" | "volume" | "rate" | "seek" | "fade" | "unlock",
        callback?: HowlCallback,
        id?: number,
    ): this;
    off(
        event:
            | "load"
            | "loaderror"
            | "playerror"
            | "play"
            | "end"
            | "pause"
            | "stop"
            | "mute"
            | "volume"
            | "rate"
            | "seek"
            | "fade"
            | "unlock",
        id: number,
    ): this;
    off(event?: string, callback?: HowlCallback | HowlErrorCallback, id?: number): this;

    stereo(): number;
    stereo(pan: number, id?: number): number | this;

    pos(): SpatialPosition;
    pos(x: number, y?: number, z?: number, id?: number): this;

    orientation(): SpatialOrientation;
    orientation(x: number, y?: number, z?: number, id?: number): this;

    pannerAttr(id?: number): PannerAttributes;
    pannerAttr(options: PannerAttributes, id?: number): this;
}

export interface HowlerGlobal {
    mute(muted: boolean): this;
    stop(): this;

    volume(): number;
    volume(volume: number): this;

    codecs(ext: string): boolean;
    unload(): this;
    usingWebAudio: boolean;
    html5PoolSize: number;
    noAudio: boolean;
    autoUnlock: boolean;
    autoSuspend: boolean;
    ctx: AudioContext;
    masterGain: GainNode;

    stereo(pan: number): this;

    pos(): SpatialPosition;
    pos(x: number, y?: number, z?: number): this;

    orientation(): SpatialOrientation;
    orientation(x: number, y?: number, z?: number, xUp?: number, yUp?: number, zUp?: number): this;
}

export declare const Howler: HowlerGlobal;
export default Howler;
