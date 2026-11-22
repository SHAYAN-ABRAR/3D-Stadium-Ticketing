/**
 * The 3D seat picker engine: plain three.js, no React. React mounts it in a client component, feeds it
 * data (statuses, prices, quantity, filters, selection), calls navigation methods, and listens to events
 * (hover, select, level, ...) to position its own UI. The engine never touches the DOM outside its
 * container.
 */
import * as THREE from 'three';
import {
  getLayout,
  SeatFlag,
  seatPriceMinor,
  VIP_CHAIRS,
  defaultPricing,
  type EventPricing,
  type StadiumLayout,
} from '@/lib/stadium';
import { brand } from '@/config/brand';
import { nearestBox } from '@/lib/picker/selection';
import { loadBuildData } from './build-client';
import { CameraRig, lookDir, poseOf, type FlightOptions, type View } from './camera';
import { Crowd } from './crowd';
import { Emitter } from './emitter';
import { NearSeats } from './near';
import { SeatPainter, type PaintState } from './painter';
import { GpuPicker, pickStand, pickVip, sharedRaycaster } from './picking';
import { LightingRig } from './lighting';
import { EXPOSURE, PostPipeline } from './post';
import { AutoTier, initialTier, TIERS, urlQuality } from './quality';
import { canvasToJpeg, Snapshotter } from './snapshots';
import {
  DEFAULT_FILTERS,
  type EngineEvent,
  type EngineEventMap,
  type Filters,
  type LightingPreset,
  type NavState,
  type PickInfo,
  type QualitySetting,
  type QualityTier,
  type SnapshotView,
} from './types';
import { buildBoxInterior, type BoxInterior } from './world/interior';
import { buildWorld, type World } from './world/scene';
import { tickSky } from './world/sky';
import { loadDisplayFont, type TextureText } from './world/textures';

export interface EngineOptions {
  /** Text for the LED boards and screens (venue language, PROMPT.md section 11). */
  text: TextureText;
  /** CSS font-family list of the display font (Barlow Condensed from next/font). */
  displayFont?: string;
  quality?: QualitySetting;
  /** Turns off ambient animation and the idle orbit (tests, ?freeze=1). */
  freeze?: boolean;
  reducedMotion?: boolean;
  /** Emit stats once a second (the ?debug=1 overlay). */
  debug?: boolean;
  /**
   * The home page hero: a slow orbit with the crowd (Medium and up), no intro, no picking and no input
   * listeners on the canvas (page scrolling stays free); page activity keeps the orbit awake.
   */
  hero?: boolean;
}

const DEFAULT_FONT = '"Barlow Condensed", "Arial Narrow", Arial, sans-serif';
const IDLE_ORBIT_AFTER_MS = 8000;
const SLEEP_AFTER_MS = 30000;
const DRAG_THRESHOLD = 6;

export class StadiumEngine {
  readonly layout: StadiumLayout = getLayout();
  private readonly events = new Emitter<EngineEventMap>();
  private readonly opts: Required<Omit<EngineOptions, 'displayFont'>> & { displayFont: string };

  private container: HTMLElement | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private world: World | null = null;
  private rig: CameraRig;
  private painter: SeatPainter | null = null;
  private picker: GpuPicker | null = null;
  private near: NearSeats | null = null;
  private snaps: Snapshotter | null = null;
  private post: PostPipeline | null = null;
  private lightingRig: LightingRig | null = null;
  private crowd: Crowd | null = null;
  private interior: BoxInterior | null = null;
  private mountPromise: Promise<void> | null = null;
  private disposed = false;
  private contextLost = false;
  private cleanup: (() => void)[] = [];

  /* data */
  private readonly statuses: Uint8Array;
  private readonly selected: Uint8Array;
  private selection: number[] = [];
  private pricing: EventPricing = defaultPricing();
  private quantity = 2;
  private filters: Filters = { ...DEFAULT_FILTERS };
  private readonly allowed: Uint8Array;
  private readonly blockFits: Uint8Array;
  private readonly blockFree: Int32Array;

  /* navigation and pointer state */
  private readonly nav: NavState = {
    level: 'loading',
    stand: -1,
    block: -1,
    seat: -1,
    box: -1,
    vip: -1,
    choosingVip: false,
  };
  private readonly paintState: PaintState;
  private hover: PickInfo | null = null;
  private pendingHover: { x: number; y: number } | null = null;
  private drag: { sx: number; sy: number; x: number; y: number; moved: boolean } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch = 0;
  private lastInput = performance.now();

  /* frame scheduling */
  private raf = 0;
  private dirty = true;
  private last = performance.now();
  private lastRender = 0;
  private onScreen = true;
  private tier: QualityTier;
  private qualitySetting: QualitySetting;
  private auto: AutoTier;
  private frameTimes: number[] = [];
  private statsTimer = 0;
  private lighting: LightingPreset = 'golden';
  /** The visitor's crowd toggle (the crowd shows in seat and box views). */
  private crowdWanted = true;
  /** When the home hero's crowd starts its next wave (frame time; 0 = not scheduled yet). */
  private nextHeroWave = 0;
  private insets = { right: 0, bottom: 0 };
  /** Frames actually rendered (tests check that the scheduler sleeps when nothing changes). */
  renderedFrames = 0;

  constructor(options: EngineOptions) {
    this.opts = {
      text: options.text,
      displayFont: options.displayFont || DEFAULT_FONT,
      quality: options.quality ?? 'auto',
      freeze: options.freeze ?? false,
      reducedMotion: options.reducedMotion ?? false,
      debug: options.debug ?? false,
      hero: options.hero ?? false,
    };
    const L = this.layout;
    this.statuses = new Uint8Array(L.totalSeatCount);
    this.selected = new Uint8Array(L.totalSeatCount);
    this.allowed = new Uint8Array(L.bowlSeatCount).fill(1);
    this.blockFits = new Uint8Array(L.blocks.length).fill(1);
    this.blockFree = new Int32Array(L.blocks.length);
    L.blocks.forEach((b) => (this.blockFree[b.index] = b.seatCount));
    this.rig = new CameraRig(this.opts.reducedMotion);
    this.qualitySetting = urlQuality() ?? this.opts.quality;
    this.tier = initialTier(this.qualitySetting);
    this.auto = new AutoTier(this.tier, this.qualitySetting === 'auto');
    this.paintState = {
      level: 'loading',
      stand: -1,
      block: -1,
      hoverStand: -1,
      hoverBlock: -1,
      runStart: -1,
      runLen: 0,
      hoverSeat: -1,
      statuses: this.statuses,
      selected: this.selected,
      blockFits: this.blockFits,
      allowed: this.allowed,
      hoverVip: -1,
      vip: -1,
      choosingVip: false,
    };
    this.recomputeAllowed();
  }

  /* ================= events ================= */

  on<K extends EngineEvent>(name: K, cb: (payload: EngineEventMap[K]) => void): () => void {
    return this.events.on(name, cb);
  }

  /* ================= lifecycle ================= */

  /** Creates the renderer and builds the stadium inside `container`. Safe to call twice (Strict Mode). */
  mount(container: HTMLElement): Promise<void> {
    if (!this.mountPromise) this.mountPromise = this.doMount(container);
    return this.mountPromise;
  }

  private async doMount(container: HTMLElement) {
    this.container = container;
    let renderer: THREE.WebGLRenderer;
    try {
      if (new URLSearchParams(location.search).get('webgl') === '0')
        throw new Error('WebGL turned off by ?webgl=0');
      // Antialiasing (SMAA) and tone mapping happen in the post-processing pipeline (post.ts).
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        powerPreference: 'high-performance',
        stencil: false,
        failIfMajorPerformanceCaveat: false,
      });
    } catch (err) {
      this.events.emit('error', {
        message: err instanceof Error ? err.message : String(err),
        fatal: true,
        code: 'webgl',
      });
      throw err;
    }
    if (this.disposed) {
      renderer.dispose();
      renderer.forceContextLoss();
      return;
    }
    this.renderer = renderer;
    // The composer renders several passes per frame: statistics are reset once per frame instead.
    renderer.info.autoReset = false;
    // Off: the composer tone-maps; snapshots switch it on while they render straight to the canvas.
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = EXPOSURE;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false; // the sun is static (pitfall 6)
    renderer.setClearColor(0x000000, 1);
    this.applyPixelRatio();
    const canvas = renderer.domElement;
    canvas.style.cssText = this.opts.hero
      ? 'display:block;width:100%;height:100%;pointer-events:none;outline:none'
      : 'display:block;width:100%;height:100%;touch-action:none;cursor:grab;outline:none';
    canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(canvas);
    this.attachListeners(canvas);
    this.resize();

    this.events.emit('progress', { value: 0.02, step: 'engine' });
    const fontPromise = loadDisplayFont(this.opts.displayFont);
    const build = loadBuildData((value, step) => this.events.emit('progress', { value, step }));
    this.cleanup.push(build.unsubscribe);
    let data;
    try {
      [data] = await Promise.all([build.promise, fontPromise]);
    } catch (err) {
      this.events.emit('error', { message: String(err), fatal: true, code: 'build' });
      throw err;
    }
    if (this.disposed) return;

    this.events.emit('progress', { value: 0.7, step: 'scene' });
    await nextFrame();
    if (this.disposed) return;
    const tier = TIERS[this.tier];
    const world = buildWorld(renderer, data, {
      text: this.opts.text,
      font: this.opts.displayFont,
      shadowMapSize: tier.shadowMapSize,
      treeDensity: tier.treeDensity,
    });
    this.world = world;
    this.painter = new SeatPainter(world, this.paintState);
    const display = world.seats.instanceMatrix.array as Float32Array;
    this.near = new NearSeats(world, display.slice());
    this.picker = new GpuPicker(world);
    this.snaps = new Snapshotter(renderer, world, this.near);
    this.post = new PostPipeline(renderer, world.scene, this.rig.camera);
    this.post.configure(TIERS[this.tier]);
    this.lightingRig = new LightingRig(world, renderer);
    this.lightingRig.setClouds(tier.cloudShadows);
    if (this.lighting !== 'golden') this.lightingRig.set(this.lighting, true);
    this.crowd = new Crowd(this.layout, this.opts.text, world.ambient);
    this.crowd.scaleIn = !(this.opts.freeze || this.opts.reducedMotion);
    this.crowd.setStatuses(this.statuses);
    world.scene.add(this.crowd.far, this.crowd.near);
    this.resize();

    this.events.emit('progress', { value: 0.85, step: 'lights' });
    this.rig.jumpTo(this.opts.hero ? this.rig.heroView() : this.rig.introView());
    this.recomputeFits();
    this.painter.paintAll();
    renderer.shadowMap.needsUpdate = true;
    try {
      await renderer.compileAsync(world.scene, this.rig.camera);
    } catch {
      // compile is only a warm-up
    }
    if (this.disposed) return;
    this.events.emit('progress', { value: 1, step: 'ready' });
    this.setLevel(this.opts.hero ? 'overview' : 'intro');
    this.invalidate();
    this.events.emit('ready', { seatCount: this.layout.totalSeatCount, tier: this.tier });
    this.events.emit('quality', { tier: this.tier, setting: this.qualitySetting });
    if (this.opts.debug) this.statsTimer = window.setInterval(() => this.emitStats(), 1000);
  }

  /** Frees everything: GPU resources, listeners, observers, timers. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    clearInterval(this.statsTimer);
    for (const c of this.cleanup.splice(0)) c();
    if (this.interior) {
      this.interior.dispose();
      this.interior = null;
    }
    this.picker?.dispose();
    this.near?.dispose();
    this.snaps?.dispose();
    this.crowd?.dispose();
    this.crowd = null;
    this.post?.dispose();
    this.post = null;
    this.lightingRig?.dispose();
    this.lightingRig = null;
    if (this.world) {
      disposeScene(this.world.scene);
      for (const d of this.world.extraDisposables) d.dispose();
      this.world.detailSeat.dispose();
      this.world = null;
    }
    if (this.renderer) {
      const canvas = this.renderer.domElement;
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      canvas.remove();
      this.renderer = null;
    }
    this.events.clear();
  }

  get isReady() {
    return !!this.world && this.nav.level !== 'loading';
  }

  get flying() {
    return !!this.rig.flight;
  }

  get navState(): Readonly<NavState> {
    return this.nav;
  }

  get currentTier() {
    return this.tier;
  }

  resize() {
    if (!this.container || !this.renderer) return;
    const w = Math.max(1, this.container.clientWidth),
      h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.post?.setSize(w, h);
    this.rig.setSize(w, h);
    this.invalidate();
  }

  /** UI-aware framing: pixels covered by a right-hand panel and a bottom ticket or sheet. */
  setInsets(insets: { right?: number; bottom?: number }) {
    const right = insets.right ?? 0,
      bottom = insets.bottom ?? 0;
    // UI re-renders report the same sizes again; only a real change may wake the sleeping scheduler.
    if (right === this.insets.right && bottom === this.insets.bottom) return;
    this.insets = { right, bottom };
    this.rig.setInsets(right, bottom);
    this.invalidate();
  }

  /* ================= data ================= */

  /** Full availability (0 available, 1 held, 2 sold, 3 blocked/closed) for every seat. */
  setStatuses(statuses: Uint8Array) {
    // A reload that brings nothing new (for example after another tab seeded the data) changes nothing,
    // and mustn't wake the sleeping scheduler.
    const next = statuses.subarray(0, this.statuses.length);
    if (next.length === this.statuses.length && sameBytes(next, this.statuses)) return;
    this.statuses.set(next);
    this.crowd?.setStatuses(this.statuses);
    this.recomputeFree();
    this.recomputeFits();
    this.painter?.paintAll();
    this.painter?.paintVip(this.interior);
    this.refreshHover();
    this.invalidate();
  }

  /** Recolours only the seats that changed. */
  applyChanges(changes: ReadonlyArray<readonly [number, number]>) {
    const L = this.layout;
    const touched = new Set<number>();
    let vip = false;
    for (const [i, s] of changes) {
      if (i < 0 || i >= L.totalSeatCount || this.statuses[i] === s) continue;
      this.statuses[i] = s;
      if (i >= L.bowlSeatCount) vip = true;
      else touched.add(L.blockOf[i]);
    }
    for (const bi of touched) {
      this.recomputeBlock(bi);
      this.painter?.paintBlock(bi);
    }
    // A seat that sells gets a spectator, who scales in.
    if (touched.size) this.crowd?.applyChanges(changes);
    if (vip) this.painter?.paintVip(this.interior);
    if (touched.size || vip) {
      this.refreshHover();
      this.invalidate();
    }
  }

  setPrices(pricing: EventPricing) {
    this.pricing = pricing;
    this.recomputeAllowed();
    this.recomputeFits();
    this.painter?.paintAll();
    this.invalidate();
  }

  setQuantity(n: number) {
    this.quantity = Math.max(1, Math.min(brand.maxTicketsPerOrder, Math.round(n)));
    this.recomputeFits();
    this.painter?.paintAll();
    this.refreshHover();
    this.invalidate();
  }

  setFilters(f: Partial<Filters>) {
    this.filters = { ...this.filters, ...f };
    this.recomputeAllowed();
    this.recomputeFits();
    this.painter?.paintAll();
    this.refreshHover();
    this.invalidate();
  }

  /** The visitor's chosen (or held) seats, shown in orange everywhere. */
  setSelection(indices: readonly number[]) {
    const old = this.selection;
    for (const i of old) this.selected[i] = 0;
    for (const i of indices) if (i >= 0 && i < this.selected.length) this.selected[i] = 1;
    this.selection = [...indices];
    const touched = new Set<number>();
    for (const i of [...old, ...indices]) if (i < this.layout.bowlSeatCount) touched.add(i);
    for (const i of touched) this.painter?.paint(i, i + 1);
    this.near?.recolor(this.selected, this.nav.level === 'seat' ? this.nav.seat : -1);
    this.painter?.paintVip(this.interior);
    this.invalidate();
  }

  /* ================= navigation ================= */

  /** The opening drone shot from straight above (4 s), skippable by any input. */
  async playIntro(): Promise<boolean> {
    if (!this.world) return false;
    this.setLevel('intro');
    this.rig.jumpTo(this.rig.introView());
    this.auto.begin();
    this.setFlying(true);
    const ok = await this.rig.flyTo(this.rig.overviewView(), {
      dur: this.opts.reducedMotion ? 0.3 : 4,
      lift: 0,
    });
    this.setFlying(false);
    if (this.nav.level === 'intro') this.setLevel('overview');
    return ok;
  }

  /** Ends the intro immediately (any input). */
  skipIntro() {
    if (this.nav.level === 'intro' && this.rig.flight) {
      this.rig.finishFlight();
      this.invalidate();
    }
  }

  goOverview(o: { instant?: boolean } = {}): Promise<boolean> {
    const prev = this.nav.level;
    this.setLevel('overview');
    const deep = prev === 'seat' || prev === 'box' || prev === 'vip' || prev === 'block';
    return this.fly(
      this.rig.overviewView(),
      deep ? { c1: (f) => f.pos.clone().add(new THREE.Vector3(0, 70, 0)), lift: 0.15 } : {},
      o.instant,
    );
  }

  goStand(i: number, o: { instant?: boolean } = {}): Promise<boolean> {
    const st = this.layout.stands[i];
    if (!st) return Promise.resolve(false);
    const prev = this.nav.level;
    this.nav.stand = i;
    this.setLevel('stand');
    return this.fly(
      this.rig.standView(st),
      prev === 'seat' || prev === 'box' || prev === 'vip'
        ? { mode: 'dir', turn: [0, 0.7], c1: (f) => f.pos.clone().add(new THREE.Vector3(0, 12, 0)) }
        : {},
      o.instant,
    );
  }

  /** Flies to a block (by block index). */
  goBlock(bi: number, o: { instant?: boolean } = {}): Promise<boolean> {
    const b = this.layout.blocks[bi];
    if (!b) return Promise.resolve(false);
    const prev = this.nav.level;
    const n = new THREE.Vector3(b.normal[0], 0, b.normal[1]);
    const boxN = this.boxNormal();
    this.nav.stand = b.stand;
    this.nav.block = bi;
    this.setLevel('block');
    const fo: FlightOptions =
      prev === 'seat'
        ? {
            mode: 'dir',
            turn: [0, 0.6],
            c1: (f) =>
              f.pos
                .clone()
                .add(new THREE.Vector3(0, 7, 0))
                .addScaledVector(n, -4),
          }
        : prev === 'box' || prev === 'vip'
          ? { mode: 'dir', turn: [0.1, 0.8], c1: (f) => f.pos.clone().addScaledVector(boxN, -14) }
          : {};
    return this.fly(this.rig.blockView(b), fo, o.instant);
  }

  /** Sits down in a bowl seat (by seat index). */
  goSeat(i: number, o: { instant?: boolean } = {}): Promise<boolean> {
    const L = this.layout;
    if (i < 0 || i >= L.bowlSeatCount) return Promise.resolve(false);
    const prev = this.nav.level,
      b = L.blocks[L.blockOf[i]],
      n = new THREE.Vector3(L.normals[i * 2], 0, L.normals[i * 2 + 1]);
    const boxN = this.boxNormal();
    this.nav.stand = b.stand;
    this.nav.block = b.index;
    this.nav.seat = i;
    this.setLevel('seat');
    const fo: FlightOptions =
      prev === 'box' || prev === 'vip'
        ? {
            mode: 'dir',
            dur: 3,
            c1: (f) => f.pos.clone().addScaledVector(boxN, -15),
            c2: (_f, t) =>
              t.pos
                .clone()
                .add(new THREE.Vector3(0, 7, 0))
                .addScaledVector(n, -9),
          }
        : {
            mode: 'dir',
            turn: [0.42, 1],
            c2: (_f, t) =>
              t.pos
                .clone()
                .add(new THREE.Vector3(0, 7, 0))
                .addScaledVector(n, -4),
          };
    const view = this.rig.seatView(L, i);
    this.nearFor(view, i);
    return this.fly(view, fo, o.instant);
  }

  /** Flies into a skybox (by box index): backwards through the glass while facing the pitch. */
  goBox(k: number, o: { instant?: boolean } = {}): Promise<boolean> {
    const box = this.layout.boxes[k];
    if (!box || !this.world) return Promise.resolve(false);
    const prev = this.nav.level;
    this.ensureInterior(k);
    const bn = new THREE.Vector3(box.normal[0], 0, box.normal[1]);
    this.nav.box = k;
    this.nav.stand = box.stand;
    this.nav.vip = -1;
    this.setLevel('box');
    const fo: FlightOptions =
      prev === 'seat'
        ? {
            mode: 'dir',
            dur: 3.2,
            c1: (f) =>
              f.pos
                .clone()
                .add(new THREE.Vector3(0, 7, 0))
                .addScaledVector(bn, -9),
            c2: (_f, t) => t.pos.clone().addScaledVector(bn, -16),
          }
        : { mode: 'dir', c2: (_f, t) => t.pos.clone().addScaledVector(bn, prev === 'vip' ? -0.5 : -18) };
    const view = this.rig.boxView(this.interior!.toWorld);
    this.nearFor(view, -1);
    return this.fly(view, fo, o.instant);
  }

  /** In the current skybox, sits in lounge chair k (0-7). */
  goVip(k: number, o: { instant?: boolean } = {}): Promise<boolean> {
    if (!this.interior || k < 0 || k > 7) return Promise.resolve(false);
    const box = this.layout.boxes[this.interior.boxIndex];
    if (this.statuses[box.firstSeat + k] !== 0 && !this.selected[box.firstSeat + k])
      return Promise.resolve(false);
    this.nav.vip = k;
    this.setLevel('vip');
    const view = this.rig.vipView(this.interior.toWorld, VIP_CHAIRS[k]);
    this.nearFor(view, -1);
    return this.fly(view, { mode: 'dir', dur: this.opts.reducedMotion ? 0.3 : 1.6, lift: 0.05 }, o.instant);
  }

  /** In a skybox: highlight free chairs and let the pointer pick one. */
  setChoosingVip(on: boolean) {
    this.nav.choosingVip = on && (this.nav.level === 'box' || this.nav.level === 'vip');
    this.paintState.choosingVip = this.nav.choosingVip;
    this.painter?.paintVip(this.interior);
    this.events.emit('level', { ...this.nav });
    this.invalidate();
  }

  /** The skybox nearest to a seat on a straight side of the same stand (the VIP upgrade target). */
  nearestBox(seat: number): number {
    return nearestBox(seat, this.layout);
  }

  /* ================= snapshots ================= */

  /** Renders a view into a canvas (CSS size w x h, device-pixel resolution). */
  async snapshotCanvas(view: SnapshotView, w: number, h: number): Promise<HTMLCanvasElement | null> {
    if (!this.world || !this.snaps || this.contextLost) return null;
    let v: View;
    if (view.kind === 'seat') v = this.rig.seatView(this.layout, view.seat);
    else {
      this.ensureInterior(view.box);
      v =
        view.kind === 'box'
          ? this.rig.boxView(this.interior!.toWorld)
          : this.rig.vipView(this.interior!.toWorld, VIP_CHAIRS[view.chair]);
    }
    const p = this.snaps.request(poseOf(v), w, h);
    this.invalidate();
    return p;
  }

  /** A JPEG of a view at exactly w x h (the ticket's "Your view"). */
  async snapshot(view: SnapshotView, w = 640, h = 400, quality = 0.8): Promise<Blob | null> {
    const c = await this.snapshotCanvas(view, w, h);
    return c ? canvasToJpeg(c, w, h, quality) : null;
  }

  /* ================= settings ================= */

  setQuality(setting: QualitySetting) {
    this.qualitySetting = setting;
    const tier = setting === 'auto' ? initialTier('auto') : setting;
    this.applyTier(tier);
    this.events.emit('quality', { tier: this.tier, setting });
  }

  /** Golden hour (default), day or night, with a 1.5 s transition (instant on request or reduced motion). */
  setLighting(preset: LightingPreset, instant = false) {
    this.lighting = preset;
    this.lightingRig?.set(preset, instant || this.opts.reducedMotion);
    this.invalidate();
  }

  /** The match-day crowd toggle: spectators in sold seats in seat and box views (fades over 400 ms). */
  setCrowd(on: boolean) {
    this.crowdWanted = on;
    this.updateCrowd();
    this.invalidate();
  }

  /** Starts a Mexican wave round the bowl (only while the crowd is shown). Returns false otherwise. */
  startWave(): boolean {
    if (!this.crowd?.shown) return false;
    this.crowd.startWave(this.rig.camera.position);
    this.invalidate();
    return true;
  }

  stopWave() {
    this.crowd?.stopWave();
    this.invalidate();
  }

  get lightingPreset() {
    return this.lighting;
  }

  get crowdOn() {
    return this.crowdWanted;
  }

  /** The crowd is (fading) on screen. */
  get crowdVisible() {
    return !!this.crowd?.visible;
  }

  get waving() {
    return !!this.crowd?.waving;
  }

  /* ================= screen helpers ================= */

  /** Screen position (CSS px, relative to the container) of a world point. */
  screenOf(x: number, y: number, z: number) {
    return this.rig.screenOf(new THREE.Vector3(x, y, z));
  }

  /** Screen anchors of the four stand labels (null when off screen). */
  standLabelAnchors(): ({ x: number; y: number } | null)[] {
    const v = new THREE.Vector3();
    return this.layout.stands.map((st) => {
      const p = this.rig.screenOf(v.set(st.label[0], st.label[1], st.label[2]));
      return p.visible ? { x: p.x, y: p.y } : null;
    });
  }

  /** A copy of the current statuses (test API). */
  get statusesSnapshot(): Uint8Array {
    return this.statuses.slice();
  }

  /** The visitor's selection as the engine paints it (test API). */
  get selectionSnapshot(): number[] {
    return [...this.selection];
  }

  /* ================= internals: data ================= */

  private recomputeAllowed() {
    const L = this.layout,
      f = this.filters,
      p = this.pricing;
    for (let i = 0; i < L.bowlSeatCount; i++) {
      const flags = L.flags[i];
      let ok = true;
      if (flags & SeatFlag.Wheelchair && !f.accessible) ok = false;
      else if (flags & SeatFlag.Restricted && f.hideRestricted) ok = false;
      else if (f.priceMin != null || f.priceMax != null) {
        const price = seatPriceMinor(i, p, L);
        if ((f.priceMin != null && price < f.priceMin) || (f.priceMax != null && price > f.priceMax))
          ok = false;
      }
      this.allowed[i] = ok ? 1 : 0;
    }
  }

  private recomputeFree() {
    for (const b of this.layout.blocks) {
      let free = 0;
      for (let i = b.firstSeat; i < b.firstSeat + b.seatCount; i++) if (this.statuses[i] === 0) free++;
      this.blockFree[b.index] = free;
    }
  }

  private recomputeFits() {
    for (const b of this.layout.blocks) this.blockFits[b.index] = this.fitsIn(b.index) ? 1 : 0;
  }

  private recomputeBlock(bi: number) {
    const b = this.layout.blocks[bi];
    let free = 0;
    for (let i = b.firstSeat; i < b.firstSeat + b.seatCount; i++) if (this.statuses[i] === 0) free++;
    this.blockFree[bi] = free;
    this.blockFits[bi] = this.fitsIn(bi) ? 1 : 0;
  }

  private fitsIn(bi: number): boolean {
    const b = this.layout.blocks[bi],
      n = this.quantity;
    for (let r = 0; r < b.rows; r++) {
      let streak = 0;
      for (let k = 0; k < b.rowLen[r]; k++) {
        const i = b.rowFirst[r] + k;
        if (this.statuses[i] === 0 && this.allowed[i]) {
          if (++streak >= n) return true;
        } else streak = 0;
      }
    }
    return false;
  }

  /** Free seats left in a block, a stand, or overall (for tooltips and the list). */
  freeInBlock(bi: number) {
    return this.blockFree[bi] ?? 0;
  }

  blockFitsQuantity(bi: number) {
    return this.blockFits[bi] === 1;
  }

  /** The run of `quantity` free adjacent seats containing seat i that is most centred on it, or null. */
  runAround(i: number): number[] | null {
    const L = this.layout,
      b = L.blocks[L.blockOf[i]],
      r = L.rowOf[i] - 1;
    const first = b.rowFirst[r],
      len = b.rowLen[r],
      n = this.quantity,
      k = i - first;
    let best = -1,
      bestD = Infinity;
    for (let start = Math.max(0, k - n + 1); start <= Math.min(k, len - n); start++) {
      let ok = true;
      for (let j = start; j < start + n; j++) {
        const s = first + j;
        if (this.statuses[s] !== 0 || !this.allowed[s]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      const d = Math.abs(start + (n - 1) / 2 - k);
      if (d < bestD) {
        bestD = d;
        best = start;
      }
    }
    if (best < 0) return null;
    return Array.from({ length: n }, (_, j) => first + best + j);
  }

  /* ================= internals: navigation ================= */

  private boxNormal() {
    const box = this.layout.boxes[this.nav.box];
    return box ? new THREE.Vector3(box.normal[0], 0, box.normal[1]) : new THREE.Vector3(0, 0, -1);
  }

  private setLevel(level: NavState['level']) {
    this.nav.level = level;
    if (level !== 'box' && level !== 'vip') this.nav.choosingVip = false;
    const ps = this.paintState;
    ps.level = level;
    ps.stand = this.nav.stand;
    ps.block = this.nav.block;
    ps.vip = level === 'vip' ? this.nav.vip : -1;
    ps.choosingVip = this.nav.choosingVip;
    if (this.near?.active && level !== 'seat' && level !== 'box' && level !== 'vip') {
      this.near.update(null, null, -1, this.selected);
    }
    if (level !== 'seat' && level !== 'box' && level !== 'vip') this.crowd?.setNear(null, null);
    this.updateCrowd();
    this.setHover(null);
    this.painter?.paintAll();
    this.painter?.paintVip(this.interior);
    this.events.emit('level', { ...this.nav });
  }

  /** The crowd shows in seat and box views (fading out at the stand and block levels, PROMPT.md 6.7). */
  private updateCrowd() {
    const lv = this.nav.level;
    // The home hero shows the crowd too, except on Low (impostors only in seat and box views there).
    const hero = this.opts.hero && TIERS[this.tier].crowd !== 'views';
    // Tests (?freeze=1) and reduced motion: no fade.
    this.crowd?.setShown(
      this.crowdWanted && (hero || lv === 'seat' || lv === 'box' || lv === 'vip'),
      this.opts.freeze || this.opts.reducedMotion,
    );
  }

  private async fly(view: View, fo: FlightOptions, instant?: boolean): Promise<boolean> {
    if (instant || this.opts.reducedMotion) {
      if (!instant) this.crossFade();
      this.rig.jumpTo(view);
      this.invalidate();
      return true;
    }
    this.setFlying(true);
    this.invalidate();
    const ok = await this.rig.flyTo(view, fo);
    if (!this.rig.flight) this.setFlying(false);
    return ok;
  }

  private setFlying(flying: boolean) {
    this.events.emit('flight', { flying });
  }

  /** Reduced motion: flights become a 300 ms cross-fade (the last frame fades out over the new one). */
  private crossFade() {
    const r = this.renderer,
      world = this.world,
      c = this.container;
    if (!r || !world || !c) return;
    try {
      r.render(world.scene, this.rig.camera);
      const shot = document.createElement('canvas');
      shot.width = r.domElement.width;
      shot.height = r.domElement.height;
      shot.getContext('2d')!.drawImage(r.domElement, 0, 0);
      shot.style.cssText =
        'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:1;transition:opacity 300ms linear';
      c.appendChild(shot);
      requestAnimationFrame(() => {
        shot.style.opacity = '0';
        setTimeout(() => shot.remove(), 360);
      });
    } catch {
      // A missing cross-fade is harmless.
    }
  }

  private nearFor(view: View, hide: number) {
    if (!this.near || view.type !== 'look') return;
    const dir = lookDir(view.yaw, view.pitch);
    this.near.update(view.eye, dir, hide, this.selected);
    // Near 3D people on High only.
    this.crowd?.setNear(TIERS[this.tier].crowd === 'full' ? view.eye : null, dir);
  }

  private ensureInterior(k: number) {
    const world = this.world;
    if (!world || this.interior?.boxIndex === k) return;
    if (this.interior) {
      world.scene.add(world.boxLight);
      world.scene.remove(this.interior.group);
      this.interior.dispose();
    }
    this.interior = buildBoxInterior(this.layout.boxes[k], {
      screen: world.textures.screen.texture,
      boxLight: world.boxLight,
    });
    world.scene.add(this.interior.group);
    world.boxLight.intensity = 24;
    this.painter?.paintVip(this.interior);
  }

  /* ================= internals: pointer ================= */

  private attachListeners(canvas: HTMLCanvasElement) {
    if (this.opts.hero) {
      this.attachHeroListeners(canvas);
      return;
    }
    const local = (e: PointerEvent | WheelEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const dist = () => {
      const p = [...this.pointers.values()];
      return p.length < 2 ? 0 : Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
    };
    const onDown = (e: PointerEvent) => {
      this.userInput();
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // capture is optional
      }
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1)
        this.drag = { sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, moved: false };
      else {
        if (this.drag) this.drag.moved = true;
        this.pinch = dist();
      }
    };
    const onMove = (e: PointerEvent) => {
      if (this.pointers.has(e.pointerId)) {
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        this.userInput();
        if (this.pointers.size >= 2) {
          const d = dist();
          if (this.pinch > 0 && d > 0 && this.rig.zoom(Math.log(this.pinch / d) * 700)) this.invalidate();
          this.pinch = d;
          return;
        }
        const drag = this.drag;
        if (!drag) return;
        const dx = e.clientX - drag.x,
          dy = e.clientY - drag.y;
        drag.x = e.clientX;
        drag.y = e.clientY;
        if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > DRAG_THRESHOLD) {
          drag.moved = true;
          this.setHover(null);
        }
        if (drag.moved && this.rig.drag(dx, dy)) this.invalidate();
      } else if (e.pointerType === 'mouse') {
        // Hovering counts as input: ambient animation keeps running while the visitor looks around.
        this.lastInput = performance.now();
        this.pendingHover = local(e);
        this.requestFrame();
      }
    };
    const onEnd = (e: PointerEvent) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size === 0) {
        const d = this.drag;
        this.drag = null;
        this.pinch = 0;
        if (d && !d.moved && e.type === 'pointerup') {
          const p = local(e);
          this.click(p.x, p.y, e.pointerType);
        }
      }
    };
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && !this.pointers.size) {
        this.pendingHover = null;
        if (this.hover) this.setHover(null);
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      this.userInput();
      if (this.rig.zoom(e.deltaY * (e.deltaMode === 1 ? 33 : 1))) this.invalidate();
    };
    const onLost = (e: Event) => {
      e.preventDefault();
      this.contextLost = true;
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.events.emit('contextlost', { lost: true });
    };
    const onRestored = () => {
      this.contextLost = false;
      if (this.renderer) this.renderer.shadowMap.needsUpdate = true;
      this.events.emit('contextlost', { lost: false });
      this.invalidate();
    };
    const onVisibility = () => {
      if (!document.hidden) this.invalidate();
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onEnd);
    canvas.addEventListener('pointercancel', onEnd);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    document.addEventListener('visibilitychange', onVisibility);
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(this.container!);
    const io = new IntersectionObserver((entries) => {
      this.onScreen = entries.some((en) => en.isIntersecting);
      if (this.onScreen) this.invalidate();
    });
    io.observe(this.container!);
    this.cleanup.push(() => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onEnd);
      canvas.removeEventListener('pointercancel', onEnd);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      document.removeEventListener('visibilitychange', onVisibility);
      ro.disconnect();
      io.disconnect();
    });
  }

  /**
   * Hero: no input on the canvas (pointer-events: none). Activity anywhere on the page keeps the orbit and
   * the ambient animation awake; resize, visibility, off-screen and context loss work as in the picker.
   */
  private attachHeroListeners(canvas: HTMLCanvasElement) {
    const wake = () => {
      this.lastInput = performance.now();
      this.requestFrame();
    };
    const onLost = (e: Event) => {
      e.preventDefault();
      this.contextLost = true;
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.events.emit('contextlost', { lost: true });
    };
    const onRestored = () => {
      this.contextLost = false;
      if (this.renderer) this.renderer.shadowMap.needsUpdate = true;
      this.events.emit('contextlost', { lost: false });
      this.invalidate();
    };
    const onVisibility = () => {
      if (!document.hidden) this.invalidate();
    };
    const activity = ['pointermove', 'pointerdown', 'scroll', 'keydown', 'touchstart'] as const;
    for (const a of activity) window.addEventListener(a, wake, { passive: true });
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    document.addEventListener('visibilitychange', onVisibility);
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(this.container!);
    const io = new IntersectionObserver((entries) => {
      this.onScreen = entries.some((en) => en.isIntersecting);
      if (this.onScreen) this.invalidate();
    });
    io.observe(this.container!);
    this.cleanup.push(() => {
      for (const a of activity) window.removeEventListener(a, wake);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      document.removeEventListener('visibilitychange', onVisibility);
      ro.disconnect();
      io.disconnect();
    });
  }

  private userInput() {
    this.lastInput = performance.now();
    if (this.nav.level === 'intro') this.skipIntro();
    this.invalidate();
  }

  /** What is under the pointer at the current level. Never called mid-flight (pitfall 15). */
  private pickAt(x: number, y: number): PickInfo | null {
    const r = this.renderer,
      world = this.world;
    if (!r || !world || !this.picker) return null;
    const L = this.layout,
      lv = this.nav.level;
    if (lv === 'overview') {
      const si = pickStand(this.rig.rayAt(x, y, sharedRaycaster));
      if (si < 0) return null;
      const st = L.stands[si];
      const free = st.blockIndices.reduce((a, bi) => a + this.blockFree[bi], 0);
      const fits = st.blockIndices.some((bi) => this.blockFits[bi] === 1);
      return { kind: 'stand', id: si, x, y, run: null, taken: free === 0, fits };
    }
    if (lv === 'stand' || lv === 'block') {
      const id = this.picker.pick(r, this.rig, x, y);
      if (id < 0 || id >= L.bowlSeatCount) return null;
      const bi = L.blockOf[id];
      if (lv === 'stand') {
        if (L.blocks[bi].stand !== this.nav.stand) return null;
        return {
          kind: 'block',
          id: bi,
          x,
          y,
          run: null,
          taken: this.blockFree[bi] === 0,
          fits: this.blockFits[bi] === 1,
        };
      }
      if (bi !== this.nav.block) return null;
      const taken = this.statuses[id] !== 0;
      const run = taken ? null : this.runAround(id);
      return { kind: 'seat', id, x, y, run, taken, fits: !!run };
    }
    if ((lv === 'box' || lv === 'vip') && this.interior) {
      const k = pickVip(this.rig, this.interior, x, y);
      if (k < 0) return null;
      const i = L.boxes[this.interior.boxIndex].firstSeat + k;
      const taken = this.statuses[i] !== 0 && !this.selected[i];
      return { kind: 'vip', id: k, x, y, run: null, taken, fits: !taken };
    }
    return null;
  }

  private click(x: number, y: number, pointerType: string) {
    if (this.rig.flight || this.nav.level === 'intro' || this.nav.level === 'loading') return;
    const info = this.pickAt(x, y);
    if (!info) return;
    if (pointerType !== 'mouse') this.setHover(info, false);
    const pointer = pointerType === 'touch' || pointerType === 'pen' ? pointerType : 'mouse';
    this.events.emit('select', { ...info, pointer });
  }

  /** Re-evaluates the hover after data changed (a seat under the pointer may have been taken). */
  private refreshHover() {
    const h = this.hover;
    if (!h || this.rig.flight) return;
    if (h.kind === 'seat') {
      const taken = this.statuses[h.id] !== 0;
      const run = taken ? null : this.runAround(h.id);
      this.setHover({ ...h, run, taken, fits: !!run }, true, true);
    } else if (h.kind === 'block') {
      this.setHover(
        { ...h, taken: this.blockFree[h.id] === 0, fits: this.blockFits[h.id] === 1 },
        true,
        true,
      );
    }
  }

  /**
   * Highlights a stand, block, seat (with its run) or VIP chair from outside the canvas: the list panel
   * (no tooltip) or the tour (tooltip at `at`). null clears it.
   */
  highlight(
    kind: PickInfo['kind'] | null,
    id = -1,
    opts: { run?: number[] | null; at?: { x: number; y: number } } = {},
  ) {
    if (!kind || !this.world) {
      this.setHover(null);
      return;
    }
    const L = this.layout;
    let info: PickInfo;
    const x = opts.at?.x ?? Number.NaN,
      y = opts.at?.y ?? Number.NaN,
      source = opts.at ? 'tour' : 'list';
    if (kind === 'stand') {
      const st = L.stands[id];
      const free = st.blockIndices.reduce((a, bi) => a + this.blockFree[bi], 0);
      const fits = st.blockIndices.some((bi) => this.blockFits[bi] === 1);
      info = { kind, id, x, y, run: null, taken: free === 0, fits, source };
    } else if (kind === 'block') {
      info = {
        kind,
        id,
        x,
        y,
        run: null,
        taken: this.blockFree[id] === 0,
        fits: this.blockFits[id] === 1,
        source,
      };
    } else if (kind === 'seat') {
      const taken = this.statuses[id] !== 0;
      const run = opts.run ?? (taken ? null : this.runAround(id));
      info = { kind, id, x, y, run, taken, fits: !!run, source };
    } else {
      const box = this.interior ? L.boxes[this.interior.boxIndex] : null;
      const i = box ? box.firstSeat + id : -1;
      const taken = i < 0 || (this.statuses[i] !== 0 && !this.selected[i]);
      info = { kind, id, x, y, run: null, taken, fits: !taken, source };
    }
    this.setHover(info);
  }

  /** Screen position of a stand label, block centre, seat or VIP chair (for the tour's tooltips). */
  screenOfTarget(kind: PickInfo['kind'], id: number): { x: number; y: number; visible: boolean } {
    const L = this.layout;
    if (kind === 'stand') return this.screenOf(...L.stands[id].label);
    if (kind === 'block') return this.screenOf(...L.blocks[id].center);
    if (kind === 'seat')
      return this.screenOf(L.positions[id * 3], L.positions[id * 3 + 1] + 0.6, L.positions[id * 3 + 2]);
    if (this.interior) {
      const c = VIP_CHAIRS[id];
      const p = this.interior.toWorld(c.x, c.y + 0.8, c.z);
      return this.screenOf(p.x, p.y, p.z);
    }
    return { x: Number.NaN, y: Number.NaN, visible: false };
  }

  private setHover(h: PickInfo | null, emit = true, force = false) {
    const old = this.hover;
    const same =
      old === h ||
      (!!old && !!h && old.kind === h.kind && old.id === h.id && (old.run?.[0] ?? -1) === (h.run?.[0] ?? -1));
    if (same && !force) {
      if (h && old && (old.x !== h.x || old.y !== h.y)) {
        this.hover = h;
        if (emit) this.events.emit('hover', h);
      }
      return;
    }
    this.hover = h;
    const ps = this.paintState;
    const prevStand = ps.hoverStand,
      prevBlock = ps.hoverBlock,
      prevRun = [ps.runStart, ps.runLen],
      prevSeat = ps.hoverSeat;
    ps.hoverStand = h?.kind === 'stand' ? h.id : -1;
    ps.hoverBlock = h?.kind === 'block' ? h.id : -1;
    ps.runStart = h?.kind === 'seat' && h.run ? h.run[0] : -1;
    ps.runLen = h?.kind === 'seat' && h.run ? h.run.length : 0;
    ps.hoverSeat = h?.kind === 'seat' && !h.run ? h.id : -1;
    ps.hoverVip = h?.kind === 'vip' ? h.id : -1;
    const p = this.painter;
    if (p) {
      if (prevStand >= 0) p.paintStand(prevStand);
      if (ps.hoverStand >= 0 && ps.hoverStand !== prevStand) p.paintStand(ps.hoverStand);
      if (prevBlock >= 0) p.paintBlock(prevBlock);
      if (ps.hoverBlock >= 0 && ps.hoverBlock !== prevBlock) p.paintBlock(ps.hoverBlock);
      if (prevRun[1] > 0) p.paint(prevRun[0], prevRun[0] + prevRun[1]);
      if (ps.runLen > 0) p.paint(ps.runStart, ps.runStart + ps.runLen);
      if (prevSeat >= 0) p.paint(prevSeat, prevSeat + 1);
      if (ps.hoverSeat >= 0) p.paint(ps.hoverSeat, ps.hoverSeat + 1);
      if (old?.kind === 'vip' || h?.kind === 'vip') p.paintVip(this.interior);
    }
    const canvas = this.renderer?.domElement;
    if (canvas) canvas.style.cursor = h ? (h.taken || !h.fits ? 'not-allowed' : 'pointer') : 'grab';
    if (emit) this.events.emit('hover', h);
    this.invalidate();
  }

  /* ================= internals: frame loop ================= */

  invalidate() {
    this.dirty = true;
    this.requestFrame();
  }

  private requestFrame() {
    if (this.raf || this.disposed || this.contextLost || !this.world) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    if (!this.onScreen) return;
    this.raf = requestAnimationFrame(this.frame);
  }

  /**
   * Ambient animation (boards, flags, trees, clouds, the crowd's idle motion): 'static' when it is off
   * altogether (Low tier, reduced motion, ?freeze=1 and tests), 'pause' while the scheduler sleeps.
   */
  private ambientMode(now: number): 'animate' | 'pause' | 'static' {
    if (this.opts.freeze || this.opts.reducedMotion || !TIERS[this.tier].ambient) return 'static';
    if (this.nav.level === 'loading' || !this.onScreen) return 'pause';
    if (typeof document !== 'undefined' && document.hidden) return 'pause';
    return now - this.lastInput < SLEEP_AFTER_MS ? 'animate' : 'pause';
  }

  private idleOrbit(dt: number): boolean {
    if (this.opts.freeze || this.opts.reducedMotion) return false;
    if (this.opts.hero) {
      // The hero orbits slowly while the page is in use and the canvas is on screen.
      const v = this.rig.view;
      if (!v || v.type !== 'orbit' || this.rig.flight || !this.onScreen) return false;
      if (performance.now() - this.lastInput > SLEEP_AFTER_MS) return false;
      v.azim += dt * 0.05;
      return true;
    }
    if (this.nav.level !== 'overview' || !this.rig.view || this.rig.flight || this.drag || this.hover)
      return false;
    const idle = performance.now() - this.lastInput;
    if (idle < IDLE_ORBIT_AFTER_MS || idle > SLEEP_AFTER_MS) return false;
    const v = this.rig.view;
    if (v.type !== 'orbit') return false;
    v.azim += dt * 0.045;
    return true;
  }

  private frame = (now: number) => {
    this.raf = 0;
    const r = this.renderer,
      world = this.world;
    if (this.disposed || this.contextLost || !r || !world) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    const frameMs = now - this.last;
    this.last = now;
    let active = this.dirty;
    let ambient = false;
    const mode = this.ambientMode(now),
      animate = mode === 'animate',
      amb = world.ambient;
    if (animate) {
      amb.uTime.value += dt;
      // Cloud shadows drift with the wind (about 4 m/s); the sky's clouds move too.
      amb.uCloudOffset.value.x += dt * 0.014;
      amb.uCloudOffset.value.y -= dt * 0.008;
      tickSky(world.lighting.sky, amb.uTime.value);
      ambient = true;
    }
    amb.uWind.value = animate && TIERS[this.tier].wind ? 1 : 0;
    // The home hero's crowd starts a Mexican wave now and then (6 s in, then every 30 s).
    if (this.opts.hero && animate && this.crowd?.shown && !this.crowd.waving) {
      if (!this.nextHeroWave) this.nextHeroWave = now + 6000;
      else if (now >= this.nextHeroWave) {
        this.crowd.startWave(this.rig.camera.position);
        this.nextHeroWave = now + 30000;
      }
    }
    if (world.boards.update(Date.now(), dt, mode) && mode === 'static') active = true;
    if (this.crowd?.update(dt, animate)) active = true;
    if (this.lightingRig?.update(now)) active = true;
    if (this.rig.stepOffset(dt)) active = true;
    if (this.rig.flight) {
      this.rig.stepFlight(now);
      active = true;
      if (!this.rig.flight) this.setFlying(false);
    } else if (this.idleOrbit(dt)) ambient = true;
    if (this.pendingHover && !this.rig.flight && !this.drag) {
      const p = this.pendingHover;
      this.pendingHover = null;
      if (this.nav.level !== 'intro' && this.nav.level !== 'loading' && this.nav.level !== 'seat') {
        const info = this.pickAt(p.x, p.y);
        this.setHover(info ? { ...info, source: 'pointer' } : null);
      }
      active = true;
    }
    if (this.snaps?.pending) active = true;
    const render = active || (ambient && now - this.lastRender >= 33);
    if (render) {
      this.dirty = false;
      r.info.reset();
      this.rig.refresh();
      if (this.snaps?.pending) {
        // "Your view": on High at twice the size, with a gentle depth of field and the crowd.
        const high = this.tier === 'high';
        this.snaps.run(this.rig.cssW, this.rig.cssH, {
          scale: TIERS[this.tier].snapshotScale,
          dof: high,
          before: () => this.crowd?.forSnapshot(high),
          after: () => this.crowd?.restore(),
        });
      }
      if (this.post) this.post.render(dt);
      else r.render(world.scene, this.rig.camera);
      this.lastRender = now;
      this.renderedFrames++;
      this.events.emit('camera', null);
      if (this.rig.flight || this.auto.isMeasuring) {
        const next = this.auto.record(frameMs);
        if (next) {
          this.applyTier(next);
          this.events.emit('quality', { tier: this.tier, setting: this.qualitySetting });
        }
      }
      if (this.opts.debug) this.frameTimes.push(frameMs);
    }
    if (active || ambient || this.rig.flight) this.requestFrame();
  };

  private applyPixelRatio() {
    const r = this.renderer;
    if (!r) return;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, TIERS[this.tier].dprCap));
  }

  private applyTier(tier: QualityTier) {
    const changed = tier !== this.tier;
    this.tier = tier;
    this.auto.tier = tier;
    if (!this.renderer) return;
    this.applyPixelRatio();
    this.post?.configure(TIERS[tier]);
    this.lightingRig?.setClouds(TIERS[tier].cloudShadows);
    this.updateCrowd();
    // Near 3D people exist on High only.
    const v = this.rig.view,
      lv = this.nav.level;
    if (TIERS[tier].crowd === 'full' && (lv === 'seat' || lv === 'box' || lv === 'vip') && v?.type === 'look')
      this.crowd?.setNear(v.eye, lookDir(v.yaw, v.pitch));
    else this.crowd?.setNear(null, null);
    const size = TIERS[tier].shadowMapSize;
    const sun = this.world?.sun;
    if (sun && sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
      this.renderer.shadowMap.needsUpdate = true;
    }
    if (changed) this.resize();
  }

  private emitStats() {
    const r = this.renderer;
    if (!r) return;
    const ft = this.frameTimes.splice(0);
    const avg = ft.length ? ft.reduce((a, b) => a + b, 0) / ft.length : 0;
    this.events.emit('stats', {
      fps: ft.length,
      frameMs: Math.round(avg * 10) / 10,
      drawCalls: r.info.render.calls,
      triangles: r.info.render.triangles,
      tier: this.tier,
      pickMs: Math.round((this.picker?.lastMs ?? 0) * 100) / 100,
      mode: this.raf ? (this.rig.flight || this.dirty ? 'active' : 'ambient') : 'asleep',
    });
  }
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Disposes every geometry, material and texture reachable from a scene. */
function disposeScene(root: THREE.Object3D) {
  const geos = new Set<THREE.BufferGeometry>(),
    mats = new Set<THREE.Material>(),
    texs = new Set<THREE.Texture>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) geos.add(m.geometry);
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) {
      mats.add(x);
      for (const v of Object.values(x)) if (v instanceof THREE.Texture) texs.add(v);
      const u = (x as THREE.ShaderMaterial).uniforms;
      if (u) for (const val of Object.values(u)) if (val?.value instanceof THREE.Texture) texs.add(val.value);
    }
    if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
  });
  for (const g of geos) g.dispose();
  for (const m of mats) m.dispose();
  for (const t of texs) t.dispose();
}
