'use client';
/**
 * The picker store: one zustand store shared by React and the engine bridge. Engine events update it;
 * changes to quantity, filters, selection and availability are pushed into the engine. The actions below
 * are the single place where picking rules live: the 3D view, the list panel, the ticket and the keyboard
 * all call them.
 */
import { create } from 'zustand';
import { brand } from '@/config/brand';
import type { PickerBackend, HoldInfo } from '@/lib/picker/backend';
import { bestAvailable, bestInBlock, type BestRun } from '@/lib/picker/best';
import { runAroundSeat } from '@/lib/picker/runs';
import { chairsInSelection, nearestBox } from '@/lib/picker/selection';
import { seatAllowed } from '@/lib/picker/stats';
import type { PublicEvent } from '@/lib/events/types';
import { getLayout, SKY, type EventPricing } from '@/lib/stadium';
import {
  DEFAULT_FILTERS,
  type Filters,
  type NavState,
  type PickInfo,
  type QualityTier,
  type StadiumEngine,
} from '@/engine';

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error' | 'nowebgl' | 'contextlost';

export interface Flash {
  id: number;
  /** Message key under "picker.flash" and its values. */
  key: string;
  values?: Record<string, string | number>;
  x: number;
  y: number;
}

export interface Announcement {
  id: number;
  /** Message key under "picker.announce". */
  key: string;
  values?: Record<string, string | number>;
}

export interface PickerState {
  event: PublicEvent | null;
  pricing: EventPricing | null;
  /** Closed blocks (block index). */
  closed: ReadonlySet<number>;
  backend: PickerBackend | null;
  engine: StadiumEngine | null;
  status: EngineStatus;
  progress: number;
  progressStep: string;
  nav: NavState;
  flying: boolean;
  hover: PickInfo | null;
  tier: QualityTier | null;
  statuses: Uint8Array | null;
  /** Bumped on every full availability load (deltas recolour seats without it). */
  statusesEpoch: number;
  version: number;
  quantity: number;
  filters: Filters;
  /** Seats the visitor has chosen (orange), held or not yet held. */
  selection: number[];
  hold: HoldInfo | null;
  holdBusy: boolean;
  /** The 2-minute warning has been given for the current hold. */
  holdWarned: boolean;
  /** Touch: the tapped stand, block, seat or chair waiting for "Fly in" / "Select". */
  touchCard: PickInfo | null;
  /** Best available results (null when closed). */
  best: BestRun[] | null;
  tour: boolean;
  /** List panel at block level: the row whose seats are listed (1-based), or null. */
  rowOpen: number | null;
  /** A message shown next to the pointer for a moment. */
  flash: Flash | null;
  /** Read out by the live region (and shown as a toast). */
  announcement: Announcement | null;
  /** A notice inside the ticket card (for example seats taken while holding). */
  ticketNotice: Announcement | null;
  /** Measured sizes of the list panel and the ticket card (for UI-aware 3D framing). */
  panelBox: { w: number; h: number } | null;
  ticketBox: { w: number; h: number } | null;
}

const initialNav: NavState = {
  level: 'loading',
  stand: -1,
  block: -1,
  seat: -1,
  box: -1,
  vip: -1,
  choosingVip: false,
};

export const usePicker = create<PickerState>(() => ({
  event: null,
  pricing: null,
  closed: new Set(),
  backend: null,
  engine: null,
  status: 'idle',
  progress: 0,
  progressStep: '',
  nav: initialNav,
  flying: false,
  hover: null,
  tier: null,
  statuses: null,
  statusesEpoch: 0,
  version: 0,
  quantity: 2,
  filters: { ...DEFAULT_FILTERS },
  selection: [],
  hold: null,
  holdBusy: false,
  holdWarned: false,
  touchCard: null,
  best: null,
  tour: false,
  rowOpen: null,
  flash: null,
  announcement: null,
  ticketNotice: null,
  panelBox: null,
  ticketBox: null,
}));

const get = () => usePicker.getState();
const set = usePicker.setState;

let counter = 0;
export function showFlash(key: string, x: number, y: number, values?: Flash['values']) {
  set({ flash: { id: ++counter, key, values, x, y } });
}
export function announce(key: string, values?: Announcement['values']) {
  set({ announcement: { id: ++counter, key, values } });
}

/** Middle seat of a run (the camera sits there). */
export const middleOf = (run: readonly number[]) => run[Math.floor((run.length - 1) / 2)];

/** Whether a seat passes the current filters. */
export function allowedNow(i: number): boolean {
  const s = get();
  return seatAllowed(i, s.filters, s.pricing);
}

/* ================= data ================= */

export function setQuantity(n: number) {
  const q = Math.max(1, Math.min(brand.maxTicketsPerOrder, Math.round(n)));
  set({ quantity: q, best: null });
}

export function setFilters(f: Partial<Filters>) {
  set((s) => ({ filters: { ...s.filters, ...f }, best: null }));
}

export function setSelection(seats: number[]) {
  set({ selection: seats, ticketNotice: null });
}

/**
 * Stores new availability. A change list (from polling) recolours only those seats in the engine; a full
 * load bumps the epoch so the engine repaints everything. Selected seats (not yet held) that someone
 * else took are dropped from the selection.
 */
export function applyAvailability(
  statuses: Uint8Array,
  version: number,
  changes: Array<[number, number]> | null,
) {
  const s = get();
  if (changes && s.engine && s.status === 'ready') {
    s.engine.applyChanges(changes);
    set({ statuses, version });
  } else set({ statuses, version, statusesEpoch: s.statusesEpoch + 1 });
  if (!s.hold && s.selection.length) {
    const taken = s.selection.filter((i) => statuses[i] !== 0);
    if (taken.length) {
      set({ selection: s.selection.filter((i) => statuses[i] === 0) });
      announce('selectionTaken', { count: taken.length });
    }
  }
}

/* ================= navigation ================= */

function engineOrNull() {
  const s = get();
  return s.status === 'ready' ? s.engine : null;
}

/** Without WebGL the same actions move through the levels with no camera (the 2D plan picker). */
const is2D = () => get().status === 'nowebgl';
function nav2D(patch: Partial<NavState>) {
  set((s) => ({ nav: { ...s.nav, ...patch } }));
}

export function goOverview() {
  set({ touchCard: null, best: null });
  const e = engineOrNull();
  if (e) void e.goOverview();
  else if (is2D()) nav2D({ level: 'overview', choosingVip: false });
}

export function goStand(i: number) {
  set({ touchCard: null, best: null });
  const e = engineOrNull();
  if (e) void e.goStand(i);
  else if (is2D()) nav2D({ level: 'stand', stand: i, choosingVip: false });
}

export function goBlock(bi: number) {
  set({ touchCard: null, best: null, rowOpen: null });
  const e = engineOrNull();
  if (e) void e.goBlock(bi);
  else if (is2D())
    nav2D({ level: 'block', block: bi, stand: getLayout().blocks[bi].stand, choosingVip: false });
}

/** Back to a seat's view (breadcrumb). */
export function goSeatView(seat: number) {
  const e = engineOrNull();
  if (e) void e.goSeat(seat);
  else if (is2D()) {
    const L = getLayout();
    const b = L.blocks[L.blockOf[seat]];
    nav2D({ level: 'seat', seat, block: b.index, stand: b.stand, choosingVip: false });
  }
}

/** Into a skybox (breadcrumb, "Back to the box"). */
export function goBox(k: number) {
  const e = engineOrNull();
  if (e) void e.goBox(k);
  else if (is2D()) nav2D({ level: 'box', box: k, vip: -1, choosingVip: false });
}

/** Selects a run and sits down in its middle seat. */
export function chooseRun(run: number[]) {
  if (!run.length) return;
  set({ touchCard: null, best: null });
  if (get().hold) void releaseHold(true);
  setSelection(run);
  const e = engineOrNull();
  const seat = middleOf(run);
  if (e) void e.goSeat(seat);
  else if (is2D()) {
    const L = getLayout();
    const b = L.blocks[L.blockOf[seat]];
    nav2D({ level: 'seat', seat, block: b.index, stand: b.stand, choosingVip: false });
  }
}

/** From the list panel: the run of `quantity` seats around a seat. */
export function chooseSeatFromList(seat: number): boolean {
  const s = get();
  if (!s.statuses) return false;
  const run = runAroundSeat(s.statuses, seat, s.quantity, allowedNow);
  if (!run) {
    announce('notEnoughHere', { count: s.quantity });
    return false;
  }
  chooseRun(run);
  return true;
}

/** "Best available" inside the current block (optionally one row, 1-based). */
export function chooseBestInBlock(row: number | null = null): boolean {
  const s = get();
  const b = getLayout().blocks[s.nav.block];
  if (!b || !s.statuses) return false;
  const run = bestInBlock(s.statuses, b, s.quantity, s.filters, s.pricing, row == null ? null : row - 1);
  if (!run) {
    announce('notEnoughHere', { count: s.quantity });
    return false;
  }
  chooseRun(run.seats);
  return true;
}

/** Best available across the event: the top 3, shown as cards. */
export function openBestAvailable() {
  const s = get();
  if (!s.statuses) return;
  const runs = bestAvailable(s.statuses, s.quantity, s.filters, s.pricing, 3, s.closed);
  set({ best: runs });
  if (!runs.length) announce('noBest', { count: s.quantity });
}

export function closeBestAvailable() {
  set({ best: null });
}

/** Back one level (also Esc and the breadcrumb's back button). */
export function back() {
  const s = get(),
    e = engineOrNull();
  if (!e && is2D()) {
    const lv = s.nav.level;
    if (lv === 'stand') goOverview();
    else if (lv === 'block') goStand(s.nav.stand);
    else if (lv === 'seat') goBlock(s.nav.block);
    else if (lv === 'box') {
      if (s.nav.choosingVip) nav2D({ choosingVip: false });
      else if (s.nav.seat >= 0) nav2D({ level: 'seat' });
      else goOverview();
    } else if (lv === 'vip') nav2D({ level: 'box', vip: -1 });
    return;
  }
  if (!e || s.flying) return;
  set({ touchCard: null, best: null });
  switch (s.nav.level) {
    case 'stand':
      void e.goOverview();
      return;
    case 'block':
      void e.goStand(s.nav.stand);
      return;
    case 'seat':
      void e.goBlock(s.nav.block);
      return;
    case 'box':
      if (s.nav.choosingVip) e.setChoosingVip(false);
      else if (s.nav.seat >= 0) void e.goSeat(s.nav.seat);
      else void e.goBlock(Math.max(0, s.nav.block));
      return;
    case 'vip':
      void e.goBox(s.nav.box);
      return;
  }
}

/** The VIP upgrade: fly from the seat into the nearest straight skybox of the same stand. */
export function upgradeToBox() {
  const s = get(),
    e = engineOrNull();
  if (s.nav.seat < 0) return;
  const box = nearestBox(s.nav.seat);
  if (e) void e.goBox(box);
  else if (is2D()) nav2D({ level: 'box', box, vip: -1, choosingVip: false });
}

/** Enter or leave "choose your VIP seats" mode in the current box. */
export function chooseChairs(on: boolean) {
  const e = engineOrNull();
  if (e) e.setChoosingVip(on);
  else if (is2D()) nav2D({ choosingVip: on });
}

/** Adds or removes a lounge chair (0-7) of the current box; sits in it when adding. */
export function toggleChair(k: number) {
  const s = get(),
    e = engineOrNull();
  const L = getLayout();
  const box = L.boxes[s.nav.box];
  if ((!e && !is2D()) || !box) return;
  const i = box.firstSeat + k;
  const own = s.selection.filter((x) => x >= box.firstSeat && x < box.firstSeat + SKY.chairsPerBox);
  if (own.includes(i)) {
    setSelection(own.filter((x) => x !== i));
    return;
  }
  if (s.statuses && s.statuses[i] !== 0) return;
  // Chairs replace bowl seats; at most `quantity` chairs.
  const next = [...own, i].slice(-Math.max(1, s.quantity));
  if (s.hold) void releaseHold(true);
  setSelection(next);
  set({ touchCard: null });
  if (e) void e.goVip(k);
  else nav2D({ level: 'vip', vip: k, choosingVip: false });
}

/** All 8 chairs of the current box (the whole-box price applies). */
export function bookWholeBox() {
  const s = get();
  const box = getLayout().boxes[s.nav.box];
  if (!box || !s.statuses) return;
  const chairs = Array.from({ length: SKY.chairsPerBox }, (_, k) => box.firstSeat + k);
  if (chairs.some((i) => s.statuses![i] !== 0 && !s.selection.includes(i))) return;
  if (s.hold) void releaseHold(true);
  setSelection(chairs);
  const e = engineOrNull();
  if (e) e.setChoosingVip(false);
  else if (is2D()) nav2D({ choosingVip: false });
}

/** "Choose different seats": back to the block with nothing selected. */
export function chooseDifferentSeats() {
  const s = get();
  if (s.hold) void releaseHold(true);
  setSelection([]);
  if (s.nav.block >= 0) goBlock(s.nav.block);
  else goOverview();
}

/* ================= holds ================= */

export async function holdSelection() {
  const s = get();
  if (!s.backend || !s.selection.length || s.holdBusy) return;
  set({ holdBusy: true, ticketNotice: null });
  try {
    const r = await s.backend.hold(s.selection);
    if (r.ok) {
      set({ hold: r.hold, holdWarned: false, selection: r.hold.seats });
      announce('held', { count: r.hold.seats.length, minutes: brand.holdMinutes });
      return;
    }
    if (r.reason === 'conflict') {
      // The conflicting seats turn grey now; the store's next update brings their exact status.
      get().engine?.applyChanges(r.conflicts.map((i) => [i, 1] as [number, number]));
      const left = get().selection.filter((i) => !r.conflicts.includes(i));
      set({
        selection: left,
        ticketNotice: { id: ++counter, key: 'conflict', values: { count: r.conflicts.length } },
      });
      announce('conflict', { count: r.conflicts.length });
      return;
    }
    announce(r.reason === 'not_on_sale' ? 'notOnSale' : 'holdError');
  } catch {
    announce('holdError');
  } finally {
    set({ holdBusy: false });
  }
}

/** Releases the hold. `keepSelection` when the visitor is changing seats (the new ones get held again). */
export async function releaseHold(keepSelection = false) {
  const s = get();
  const h = s.hold;
  if (!h) return;
  set({ hold: null, holdWarned: false });
  if (!keepSelection) setSelection([]);
  try {
    await s.backend?.release(h.id);
  } catch {
    // The hold expires on its own; nothing else to do.
  }
}

/** Called every second by the countdown: warns at 2 minutes and releases on expiry. */
export function tickHold(now = Date.now()) {
  const s = get();
  if (!s.hold) return;
  const left = s.hold.expiresAt - now;
  if (left <= 0) {
    void releaseHold(false);
    announce('expired');
    return;
  }
  if (left <= 120_000 && !s.holdWarned) {
    set({ holdWarned: true });
    announce('expiresSoon');
  }
}

/** After a reload: the session's active hold comes back with its seats selected. */
export async function restoreHold() {
  const s = get();
  if (!s.backend) return;
  try {
    const h = await s.backend.current();
    if (h && h.expiresAt > Date.now()) set({ hold: h, selection: h.seats });
  } catch {
    // No hold to restore.
  }
}

/* ================= engine bridge ================= */

/** What a click in the 3D view does; a touch tap opens the confirmation card instead. */
function handleSelect(engine: StadiumEngine, info: PickInfo) {
  if (get().tour) set({ tour: false });
  if (info.pointer === 'touch') {
    if (info.kind === 'seat' && (info.taken || !info.run)) {
      return showFlash(info.taken ? 'seatTaken' : 'notEnoughHere', info.x, info.y, {
        count: get().quantity,
      });
    }
    set({ touchCard: info });
    return;
  }
  activate(engine, info);
}

/** Carries out a pick (mouse click, or "Fly in"/"Select" on the touch card). */
export function activate(engine: StadiumEngine, info: PickInfo) {
  const L = engine.layout;
  set({ touchCard: null });
  switch (info.kind) {
    case 'stand':
      goStand(info.id);
      return;
    case 'block': {
      const b = L.blocks[info.id];
      if (get().closed.has(b.index)) return showFlash('blockClosed', info.x, info.y, { block: b.id });
      if (info.taken) return showFlash('blockSoldOut', info.x, info.y, { block: b.id });
      goBlock(info.id);
      if (!info.fits) showFlash('notEnoughInBlock', info.x, info.y, { count: get().quantity });
      return;
    }
    case 'seat': {
      if (info.taken) return showFlash('seatTaken', info.x, info.y);
      if (!info.run) return showFlash('notEnoughHere', info.x, info.y, { count: get().quantity });
      chooseRun(info.run);
      return;
    }
    case 'vip': {
      if (info.taken) return showFlash('seatTaken', info.x, info.y);
      toggleChair(info.id);
      return;
    }
  }
}

/** Connects an engine to the store (events in, data out). Returns the disconnect function. */
export function connectEngine(engine: StadiumEngine): () => void {
  set({ engine, status: 'loading', progress: 0, nav: initialNav, hover: null, flying: false });
  const push = (s: PickerState) => {
    if (s.pricing) engine.setPrices(s.pricing);
    if (s.statuses) engine.setStatuses(s.statuses);
    engine.setQuantity(s.quantity);
    engine.setFilters(s.filters);
    engine.setSelection(s.selection);
  };
  const offs = [
    engine.on('progress', ({ value, step }) => set({ progress: value, progressStep: step })),
    engine.on('ready', ({ tier }) => {
      push(get());
      set({ status: 'ready', tier });
    }),
    engine.on('level', (nav) => {
      const prev = get().nav;
      set({
        nav: { ...nav },
        touchCard: null,
        rowOpen: nav.level === 'block' && prev.block === nav.block ? get().rowOpen : null,
      });
    }),
    engine.on('flight', ({ flying }) => set({ flying })),
    engine.on('hover', (hover) => set({ hover })),
    engine.on('select', (info) => handleSelect(engine, info)),
    engine.on('error', ({ code }) => set({ status: code === 'webgl' ? 'nowebgl' : 'error' })),
    engine.on('contextlost', ({ lost }) => set({ status: lost ? 'contextlost' : 'ready' })),
    engine.on('quality', ({ tier }) => set({ tier })),
  ];
  const unsub = usePicker.subscribe((s, prev) => {
    if (s.engine !== engine || s.status === 'loading') return;
    if (s.pricing !== prev.pricing && s.pricing) engine.setPrices(s.pricing);
    if (s.statusesEpoch !== prev.statusesEpoch && s.statuses) engine.setStatuses(s.statuses);
    if (s.quantity !== prev.quantity) engine.setQuantity(s.quantity);
    if (s.filters !== prev.filters) engine.setFilters(s.filters);
    if (s.selection !== prev.selection) engine.setSelection(s.selection);
  });
  return () => {
    for (const off of offs) off();
    unsub();
    const s = get();
    // "No WebGL" is sticky: the page switches to the 2D plan and must not try the engine again.
    if (s.engine === engine) set({ engine: null, status: s.status === 'nowebgl' ? 'nowebgl' : 'idle' });
  };
}

/** Chairs of the current box in the selection (0-7). */
export function selectedChairs(): number[] {
  const s = get();
  return s.nav.box >= 0 ? chairsInSelection(s.nav.box, s.selection) : [];
}
