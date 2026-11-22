/**
 * Seat colours (prototype: paint, paintVip): orange for the visitor's pick, grey for taken seats, dimmed
 * for seats that don't fit the quantity or the filters. Only changed ranges are uploaded (addUpdateRange).
 */
import * as THREE from 'three';
import { brand } from '@/config/brand';
import type { World } from './world/scene';
import type { BoxInterior } from './world/interior';
import type { Level } from './types';

const linear = (hex: string) => new THREE.Color(hex);

export const COLORS = {
  pick: linear(brand.colors.pick),
  sold: linear(brand.colors.sold),
  dimGrey: linear('#cfccc4'),
  leather: linear('#2b2523'),
  takenChair: linear('#6c6f75'),
};

export interface PaintState {
  level: Level;
  stand: number;
  block: number;
  /** Stand or block under the pointer (-1 when none). */
  hoverStand: number;
  hoverBlock: number;
  /** The previewed run under the pointer at block level: first seat index and length (0 = none). */
  runStart: number;
  runLen: number;
  /** A single hovered seat that has no run (to outline it). */
  hoverSeat: number;
  /** 0 available, 1 held, 2 sold, 3 blocked/closed; bowl seats then VIP chairs. */
  statuses: Uint8Array;
  /** 1 for the visitor's selected (or held) seats. */
  selected: Uint8Array;
  /** Per block: 1 when it has a run of `quantity` adjacent free seats that pass the filters. */
  blockFits: Uint8Array;
  /** Per bowl seat: 1 when it passes the filters (price, accessible, restricted view). */
  allowed: Uint8Array;
  /** VIP: chair under the pointer, the chosen chair, and whether the visitor is choosing chairs. */
  hoverVip: number;
  vip: number;
  choosingVip: boolean;
}

export class SeatPainter {
  private readonly col: Float32Array;
  private readonly glow: Float32Array;
  private readonly tmp = new THREE.Color();

  constructor(
    private world: World,
    private s: PaintState,
  ) {
    this.col = world.seats.instanceColor!.array as Float32Array;
    this.glow = world.seatGlow.array as Float32Array;
  }

  paint(a: number, b: number) {
    const { col, glow, s, world } = this;
    const base = world.seatBase,
      layout = world.layout,
      blockOf = layout.blockOf,
      blocks = layout.blocks;
    const lv = s.level,
      dim = COLORS.dimGrey,
      pick = COLORS.pick,
      sold = COLORS.sold;
    const runEnd = s.runStart + s.runLen;
    a = Math.max(0, a);
    b = Math.min(layout.bowlSeatCount, b);
    if (b <= a) return;
    for (let i = a; i < b; i++) {
      const bi = blockOf[i],
        si = blocks[bi].stand,
        taken = s.statuses[i] !== 0;
      let c: THREE.Color | null = null,
        g = 0,
        mixDim = false;
      if (s.selected[i]) {
        c = pick;
        g = 0.5;
      } else if (lv === 'overview' || lv === 'intro') {
        if (s.hoverStand === si) {
          if (taken) c = sold;
          else {
            c = pick;
            g = 0.3;
          }
        }
      } else if (lv === 'stand') {
        if (si === s.stand) {
          if (taken) c = sold;
          else if (!s.blockFits[bi] || !s.allowed[i]) mixDim = true;
          else if (s.hoverBlock === bi) {
            c = pick;
            g = 0.45;
          }
        }
      } else if (lv === 'block') {
        if (bi === s.block) {
          if (taken) c = sold;
          else if (i >= s.runStart && i < runEnd) {
            c = pick;
            g = 0.65;
          } else if (i === s.hoverSeat) {
            c = pick;
            g = 0.25;
          } else if (!s.allowed[i]) mixDim = true;
        }
      }
      const o = i * 3;
      if (c) {
        col[o] = c.r;
        col[o + 1] = c.g;
        col[o + 2] = c.b;
      } else if (mixDim) {
        col[o] = base[o] * 0.3 + dim.r * 0.7;
        col[o + 1] = base[o + 1] * 0.3 + dim.g * 0.7;
        col[o + 2] = base[o + 2] * 0.3 + dim.b * 0.7;
      } else {
        col[o] = base[o];
        col[o + 1] = base[o + 1];
        col[o + 2] = base[o + 2];
      }
      glow[i] = g;
    }
    const ic = world.seats.instanceColor!;
    ic.addUpdateRange(a * 3, (b - a) * 3);
    ic.needsUpdate = true;
    world.seatGlow.addUpdateRange(a, b - a);
    world.seatGlow.needsUpdate = true;
    this.paintWheelchairs(a, b);
  }

  paintAll() {
    this.paint(0, this.world.layout.bowlSeatCount);
  }

  paintBlock(bi: number) {
    if (bi < 0) return;
    const b = this.world.layout.blocks[bi];
    this.paint(b.firstSeat, b.firstSeat + b.seatCount);
  }

  paintStand(si: number) {
    if (si < 0) return;
    const st = this.world.layout.stands[si];
    const first = this.world.layout.blocks[st.blockIndices[0]];
    const last = this.world.layout.blocks[st.blockIndices[st.blockIndices.length - 1]];
    this.paint(first.firstSeat, last.firstSeat + last.seatCount);
  }

  /** Wheelchair platforms follow the same rules as their seats (blue instead of red). */
  private paintWheelchairs(a: number, b: number) {
    const wc = this.world.wheelchair,
      s = this.s,
      layout = this.world.layout;
    let touched = false;
    for (let k = 0; k < wc.seats.length; k++) {
      const i = wc.seats[k];
      if (i < a || i >= b) continue;
      touched = true;
      const bi = layout.blockOf[i],
        si = layout.blocks[bi].stand,
        taken = s.statuses[i] !== 0;
      let c: THREE.Color = wc.baseColor;
      if (s.selected[i]) c = COLORS.pick;
      else if ((s.level === 'stand' && si === s.stand) || (s.level === 'block' && bi === s.block)) {
        if (taken) c = COLORS.sold;
        else if (s.level === 'block' && i >= s.runStart && i < s.runStart + s.runLen) c = COLORS.pick;
        else if (!s.allowed[i]) c = this.tmp.copy(wc.baseColor).lerp(COLORS.dimGrey, 0.7);
      } else if ((s.level === 'overview' || s.level === 'intro') && s.hoverStand === si) {
        c = taken ? COLORS.sold : COLORS.pick;
      }
      wc.platform.setColorAt(k, c);
    }
    if (touched) wc.platform.instanceColor!.needsUpdate = true;
  }

  /** Lounge chairs in the current skybox: free ones glow while choosing, taken ones turn grey. */
  paintVip(interior: BoxInterior | null) {
    if (!interior) return;
    const s = this.s,
      box = this.world.layout.boxes[interior.boxIndex];
    interior.chairMaterials.forEach((m, k) => {
      const i = box.firstSeat + k,
        free = s.statuses[i] === 0;
      const hot = s.hoverVip === k || s.vip === k || s.selected[i] === 1;
      m.color.copy(!free && s.choosingVip ? COLORS.takenChair : hot ? COLORS.pick : COLORS.leather);
      m.emissive.copy(hot || (s.choosingVip && free) ? COLORS.pick : new THREE.Color(0, 0, 0));
      m.emissiveIntensity = hot ? 0.4 : 0.16;
      // Pitfall 11: when seated in a chair, hide it, or its arms fill the bottom of the frame.
      interior.chairs[k].visible = !(s.level === 'vip' && s.vip === k);
    });
  }
}
