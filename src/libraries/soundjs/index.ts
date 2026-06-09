import {
  actx,
  decodeAudio,
  impulseResponse,
  loadSound,
  makeSound,
  sounds,
} from './sound.js';

export interface SoundJsSound
{
  source: string;
  soundNode: AudioBufferSourceNode | null;
  buffer: AudioBuffer | null;
  hasLoaded?: boolean;
  loop: boolean;
  playing: boolean;
  playbackRate: number;
  volume: number;
  startOffset?: number;
  play(): void;
  pause(): void;
  restart(): void;
  playFrom(value: number): void;
  setEcho(delayValue?: number, feedbackValue?: number, filterValue?: number): void;
  setReverb(duration?: number, decay?: number, reverse?: boolean): void;
  fade(endValue: number, durationInSeconds: number): void;
  fadeIn(durationInSeconds: number): void;
  fadeOut(durationInSeconds: number): void;
}

export type SoundJsLoadHandler = (source: string) => void;
export type SoundJsFailHandler = (source: string, error: unknown) => void;

const typedMakeSound = makeSound as (
  source: string,
  loadHandler?: SoundJsLoadHandler,
  shouldLoadSound?: boolean,
  xhr?: XMLHttpRequest | false,
  failHandler?: SoundJsFailHandler
) => SoundJsSound;

const typedLoadSound = loadSound as (
  sound: SoundJsSound,
  source: string,
  loadHandler?: SoundJsLoadHandler,
  failHandler?: SoundJsFailHandler
) => void;

const typedDecodeAudio = decodeAudio as (
  sound: SoundJsSound,
  xhr: XMLHttpRequest,
  loadHandler?: SoundJsLoadHandler,
  failHandler?: SoundJsFailHandler
) => void;

const typedImpulseResponse = impulseResponse as (
  duration: number,
  decay: number,
  reverse: boolean,
  audioContext: AudioContext
) => AudioBuffer;

export {
  actx,
  sounds,
  typedDecodeAudio as decodeAudio,
  typedImpulseResponse as impulseResponse,
  typedLoadSound as loadSound,
  typedMakeSound as makeSound,
};
