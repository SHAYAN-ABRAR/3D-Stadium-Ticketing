/**
 * Test API (window.__stadium), installed only when NEXT_PUBLIC_E2E=1 or in development. E2E tests wait on
 * it instead of sleeping: page.waitForFunction(() => window.__stadium?.ready && !window.__stadium.flying).
 */
import { blockById, indexOf } from '@/lib/stadium';
import type { StadiumEngine } from './StadiumEngine';
import type { LightingPreset } from './types';

export interface StadiumTestApi {
  readonly ready: boolean;
  readonly level: string;
  readonly flying: boolean;
  readonly statuses: number[];
  readonly tier: string;
  /** Frames rendered so far (the scheduler renders nothing while idle). */
  readonly frames: number;
  /** A frame is scheduled or a flight runs (false = the engine sleeps until something changes). */
  readonly busy: boolean;
  /** The visitor's chosen seats (orange). */
  readonly selection: number[];
  goOverview(): Promise<boolean>;
  goStand(i: number): Promise<boolean>;
  /** By public block number, for example 232. */
  goBlock(id: number): Promise<boolean>;
  goSeat(index: number): Promise<boolean>;
  /** By public skybox number, for example 9. */
  goBox(id: number): Promise<boolean>;
  goVip(chair: number): Promise<boolean>;
  /** Switches the lighting preset at once (no transition). */
  setLighting(preset: LightingPreset): void;
  readonly lighting: string;
  /** The crowd toggle, whether the crowd is on screen, and the Mexican wave. */
  setCrowd(on: boolean): void;
  readonly crowd: boolean;
  readonly crowdVisible: boolean;
  /** The players on the pitch (shown with the crowd). */
  readonly matchVisible: boolean;
  /** Visual checks: plays the match on to its next goal (returns the scoring team, or -1). */
  forwardToGoal(): number;
  /** Visual checks: points the camera from `eye` at `target`. */
  peek(eye: [number, number, number], target: [number, number, number], fov?: number): void;
  /** Starts a wave (false when the crowd isn't shown); stopWave ends it at once. */
  wave(): boolean;
  stopWave(): void;
  readonly waving: boolean;
  screenOf(x: number, y: number, z: number): { x: number; y: number; visible: boolean };
  /** Seat index of block / row / seat. */
  seatIndex(block: number, row: number, seat: number): number;
  /** Screen position of a block's centre and of a seat. */
  blockScreen(id: number): { x: number; y: number; visible: boolean } | null;
  seatScreen(index: number): { x: number; y: number; visible: boolean };
  standScreen(i: number): { x: number; y: number; visible: boolean };
}

declare global {
  interface Window {
    __stadium?: StadiumTestApi;
  }
}

export const testApiEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_E2E === '1' || process.env.NODE_ENV === 'development';

export function installTestApi(engine: StadiumEngine): () => void {
  if (!testApiEnabled() || typeof window === 'undefined') return () => {};
  const L = engine.layout;
  const api: StadiumTestApi = {
    get ready() {
      return engine.isReady;
    },
    get level() {
      return engine.navState.level;
    },
    get flying() {
      return engine.flying;
    },
    get statuses() {
      return Array.from(engine.statusesSnapshot);
    },
    get tier() {
      return engine.currentTier;
    },
    get frames() {
      return engine.renderedFrames;
    },
    get busy() {
      return engine.busy;
    },
    get selection() {
      return engine.selectionSnapshot;
    },
    goOverview: () => engine.goOverview(),
    goStand: (i) => engine.goStand(i),
    goBlock: (id) => {
      const b = blockById(id);
      return b ? engine.goBlock(b.index) : Promise.resolve(false);
    },
    goSeat: (index) => engine.goSeat(index),
    goBox: (id) => {
      const box = L.boxes.find((x) => x.id === id);
      return box ? engine.goBox(box.index) : Promise.resolve(false);
    },
    goVip: (chair) => engine.goVip(chair),
    setLighting: (preset) => engine.setLighting(preset, true),
    get lighting() {
      return engine.lightingPreset;
    },
    setCrowd: (on) => engine.setCrowd(on),
    get crowd() {
      return engine.crowdOn;
    },
    get crowdVisible() {
      return engine.crowdVisible;
    },
    get matchVisible() {
      return engine.matchVisible;
    },
    forwardToGoal: () => engine.forwardToGoal(),
    peek: (eye, target, fov) => engine.peek(eye, target, fov),
    wave: () => engine.startWave(),
    stopWave: () => engine.stopWave(),
    get waving() {
      return engine.waving;
    },
    screenOf: (x, y, z) => engine.screenOf(x, y, z),
    seatIndex: (block, row, seat) => indexOf(block, row, seat),
    blockScreen: (id) => {
      const b = blockById(id);
      return b ? engine.screenOf(b.center[0], b.center[1], b.center[2]) : null;
    },
    seatScreen: (i) =>
      engine.screenOf(L.positions[i * 3], L.positions[i * 3 + 1] + 0.5, L.positions[i * 3 + 2]),
    standScreen: (i) => {
      const st = L.stands[i];
      return engine.screenOf(st.center[0], st.center[1], st.center[2]);
    },
  };
  window.__stadium = api;
  return () => {
    if (window.__stadium === api) delete window.__stadium;
  };
}
