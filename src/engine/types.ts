/** Public types of the 3D engine. */

export type Level = 'loading' | 'intro' | 'overview' | 'stand' | 'block' | 'seat' | 'box' | 'vip';
export type QualityTier = 'low' | 'medium' | 'high';
export type QualitySetting = 'auto' | QualityTier;
export type LightingPreset = 'day' | 'dusk' | 'night';

/** Where the camera is in the flow. Indices: stand 0-3, block/box by index, seat by seat index, vip 0-7. */
export interface NavState {
  level: Level;
  stand: number;
  block: number;
  seat: number;
  box: number;
  vip: number;
  /** In a skybox, choosing a lounge chair. */
  choosingVip: boolean;
}

export type PickKind = 'stand' | 'block' | 'seat' | 'vip';

export interface PickInfo {
  kind: PickKind;
  /** Stand index, block index, seat index, or chair (0-7) in the current box. */
  id: number;
  /** Screen position in CSS pixels, relative to the engine's container. */
  x: number;
  y: number;
  /** At block level: the run of `quantity` adjacent free seats previewed under the pointer. */
  run: number[] | null;
  /** The seat, block or stand is taken (sold out / held / closed). */
  taken: boolean;
  /** False when no run of the requested quantity fits here (or the block can't fit one). */
  fits: boolean;
  /** On select events: how it was chosen (a touch tap asks for confirmation instead of flying). */
  pointer?: 'mouse' | 'touch' | 'pen';
  /** Where a hover came from: the pointer over the canvas, the list panel, or the tour. */
  source?: 'pointer' | 'list' | 'tour';
}

export interface Filters {
  /** Price range in minor units; null = no limit. */
  priceMin: number | null;
  priceMax: number | null;
  /** Show and allow wheelchair spaces (and their companion seats). */
  accessible: boolean;
  hideRestricted: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  priceMin: null,
  priceMax: null,
  accessible: false,
  hideRestricted: false,
};

export type SnapshotView =
  { kind: 'seat'; seat: number } | { kind: 'box'; box: number } | { kind: 'vip'; box: number; chair: number };

export interface EngineStats {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  tier: QualityTier;
  pickMs: number;
  mode: 'active' | 'ambient' | 'asleep';
}

export interface EngineEventMap {
  ready: { seatCount: number; tier: QualityTier };
  progress: { value: number; step: string };
  level: NavState;
  hover: PickInfo | null;
  select: PickInfo;
  flight: { flying: boolean };
  error: { message: string; fatal: boolean; code: 'webgl' | 'build' | 'runtime' };
  contextlost: { lost: boolean };
  /** After a rendered frame in which the camera moved (labels re-project). */
  camera: null;
  quality: { tier: QualityTier; setting: QualitySetting };
  stats: EngineStats;
}

export type EngineEvent = keyof EngineEventMap;
