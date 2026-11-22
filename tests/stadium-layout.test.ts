import { describe, expect, it } from 'vitest';
import {
  blockById,
  blockFitsRun,
  blockPolygon,
  buildLayout,
  defaultCategories,
  defaultCategoryCode,
  defaultPricing,
  getLayout,
  indexOf,
  labelOf,
  oneCategoryLower,
  P0,
  planAt,
  planInverse,
  realLen,
  rng,
  runsOfAdjacentFree,
  sAtLen,
  SeatFlag,
  seatPriceMinor,
  seatsInRow,
  SKY,
  soldPattern,
  STANDS,
  TIERS,
  totalPriceMinor,
  vipIndexOf,
  wholeBoxOf,
} from '@/lib/stadium';
import proto from './fixtures/prototype-layout.json';

const layout = getLayout();

describe('layout parity (PROMPT.md section 5)', () => {
  it('has 79,556 bowl seats, 116 blocks and 78 skyboxes with 624 VIP chairs', () => {
    expect(layout.bowlSeatCount).toBe(79_556);
    expect(layout.blocks.length).toBe(116);
    expect(layout.boxes.length).toBe(78);
    expect(layout.vipSeatCount).toBe(624);
    expect(layout.totalSeatCount).toBe(79_556 + 624);
  });

  it('Block 232 is North stand, middle tier, 500 seats, Gate N3, AED 1,250, with row 10 seat 8', () => {
    const b = blockById(232)!;
    expect(b.standKey).toBe('N');
    expect(b.tierKey).toBe('M');
    expect(b.seatCount).toBe(500);
    expect(b.gate).toBe('N3');
    expect(b.defaultPrice).toBe(1250);
    const i = indexOf(232, 10, 8);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(labelOf(i)).toMatchObject({ kind: 'bowl', block: 232, row: 10, seat: 8, stand: 'N', tier: 'M' });
  });

  it('two runs produce byte-identical arrays', () => {
    const a = buildLayout(),
      b = buildLayout();
    for (const key of ['positions', 'normals', 'planS', 'blockOf', 'rowOf', 'numberOf', 'flags'] as const) {
      expect(Buffer.from(a[key].buffer).equals(Buffer.from(b[key].buffer)), key).toBe(true);
    }
    expect(JSON.stringify(a.blocks)).toBe(JSON.stringify(b.blocks));
    expect(JSON.stringify(a.boxes)).toBe(JSON.stringify(b.boxes));
  });

  it('planInverse(planAt(s, d)) returns (s, d) within 1 mm', () => {
    const r = rng(12345);
    for (let k = 0; k < 20_000; k++) {
      const s = r() * P0,
        d = r() * 70;
      const p = planAt(s, d);
      const q = planInverse(p.x, p.z);
      const ds = Math.abs(q.s - s);
      expect(Math.min(ds, P0 - ds)).toBeLessThan(0.001);
      expect(Math.abs(q.d - d)).toBeLessThan(0.001);
    }
  });

  it('sAtLen inverts realLen', () => {
    const r = rng(777);
    for (let k = 0; k < 20_000; k++) {
      const sa = r() * P0 * 0.5,
        sb = sa + r() * (P0 - sa),
        d = r() * 70;
      const len = realLen(sa, sb, d);
      expect(Math.abs(sAtLen(sa, len, d) - sb)).toBeLessThan(1e-6);
    }
  });

  it('no two seats are closer than 0.45 m (spatial hash)', () => {
    const cell = 0.5,
      grid = new Map<string, number[]>();
    const pos = layout.positions;
    const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
    for (let i = 0; i < layout.bowlSeatCount; i++) {
      const k = key(
        Math.floor(pos[i * 3] / cell),
        Math.floor(pos[i * 3 + 1] / cell),
        Math.floor(pos[i * 3 + 2] / cell),
      );
      const list = grid.get(k);
      if (list) list.push(i);
      else grid.set(k, [i]);
    }
    let min = Infinity;
    for (let i = 0; i < layout.bowlSeatCount; i++) {
      const cx = Math.floor(pos[i * 3] / cell),
        cy = Math.floor(pos[i * 3 + 1] / cell),
        cz = Math.floor(pos[i * 3 + 2] / cell);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dz = -1; dz <= 1; dz++) {
            for (const j of grid.get(key(cx + dx, cy + dy, cz + dz)) ?? []) {
              if (j <= i) continue;
              const d = Math.hypot(
                pos[i * 3] - pos[j * 3],
                pos[i * 3 + 1] - pos[j * 3 + 1],
                pos[i * 3 + 2] - pos[j * 3 + 2],
              );
              if (d < min) min = d;
            }
          }
    }
    expect(min).toBeGreaterThanOrEqual(0.45);
  });
});

describe('layout matches the prototype exactly (tests/fixtures/prototype-layout.json)', () => {
  it('perimeter, seat count and every block (id, stand, tier, first seat, rows, gate, price)', () => {
    expect(P0).toBe(proto.P0);
    expect(layout.bowlSeatCount).toBe(proto.seatCount);
    expect(layout.blocks.length).toBe(proto.blocks.length);
    layout.blocks.forEach((b, i) => {
      const p = proto.blocks[i];
      expect(
        { id: b.id, stand: b.standKey, tier: b.tierKey, first: b.firstSeat, count: b.seatCount },
        `block ${i}`,
      ).toEqual({ id: p.id, stand: p.stand, tier: p.tier, first: p.first, count: p.count });
      expect(b.gate).toBe(p.gate);
      expect(b.defaultPrice).toBe(p.price);
      expect(b.rowLen).toEqual(p.rowLen);
      expect(b.sa).toBe(p.sa);
      expect(b.sb).toBe(p.sb);
    });
  });

  it('every skybox (id, stand, range, straight)', () => {
    layout.boxes.forEach((x, i) => {
      const p = proto.boxes[i];
      expect({ id: x.id, stand: x.standKey, sa: x.sa, sb: x.sb, straight: x.straight }).toEqual(p);
    });
  });

  it('sampled seat positions, normals, rows and numbers are bit-identical', () => {
    for (const s of proto.samples) {
      const i = s.i;
      expect(layout.positions[i * 3]).toBe(s.x);
      expect(layout.positions[i * 3 + 1]).toBe(s.y);
      expect(layout.positions[i * 3 + 2]).toBe(s.z);
      expect(layout.normals[i * 2]).toBe(s.nx);
      expect(layout.normals[i * 2 + 1]).toBe(s.nz);
      expect(layout.blockOf[i]).toBe(s.block);
      expect(layout.rowOf[i]).toBe(s.row);
      expect(layout.numberOf[i]).toBe(s.num);
    }
    let sum = 0;
    for (let i = 0; i < layout.positions.length; i++) sum += layout.positions[i];
    expect(sum).toBe(proto.positionSum);
  });
});

describe('numbering and order', () => {
  it('block number = tier level x 100 + running number through East, South, West, North', () => {
    for (const t of TIERS) {
      const inOrder = STANDS.flatMap((st) =>
        layout.blocks.filter((b) => b.tier === t.index && b.stand === st.index),
      );
      inOrder.forEach((b, k) => expect(b.id).toBe(t.level * 100 + k + 1));
    }
  });

  it('seat indices run stand, tier, block, row, seat', () => {
    for (let i = 1; i < layout.bowlSeatCount; i++) {
      const a = layout.blocks[layout.blockOf[i - 1]],
        b = layout.blocks[layout.blockOf[i]];
      const ka = [a.stand, a.tier, a.index, layout.rowOf[i - 1], layout.numberOf[i - 1]];
      const kb = [b.stand, b.tier, b.index, layout.rowOf[i], layout.numberOf[i]];
      const cmp = ka.findIndex((v, j) => v !== kb[j]);
      expect(cmp, `seat ${i}`).toBeGreaterThanOrEqual(0);
      expect(kb[cmp]).toBeGreaterThan(ka[cmp]);
    }
  });

  it('skyboxes are numbered from 1, North stand first, then East, South, West', () => {
    const order = layout.boxes.map((x) => x.standKey);
    const firstOf = (k: string) => order.indexOf(k as 'N');
    expect(layout.boxes[0].id).toBe(1);
    expect(firstOf('N')).toBe(0);
    expect(firstOf('N') < firstOf('E') && firstOf('E') < firstOf('S') && firstOf('S') < firstOf('W')).toBe(
      true,
    );
    layout.boxes.forEach((x, i) => expect(x.firstSeat).toBe(layout.bowlSeatCount + i * SKY.chairsPerBox));
  });

  it('gates: 6 on long stands, 4 on end stands, increasing along each stand', () => {
    for (const st of layout.stands) {
      const nums = st.blockIndices.map((i) => Number(layout.blocks[i].gate.slice(1)));
      expect(Math.max(...nums)).toBe(st.long ? 6 : 4);
      expect(Math.min(...nums)).toBe(1);
      for (const i of st.blockIndices) expect(layout.blocks[i].gate[0]).toBe(st.key);
    }
  });
});

describe('labels and lookups', () => {
  it('labelOf and indexOf round-trip for every bowl seat', () => {
    for (let i = 0; i < layout.bowlSeatCount; i += 7) {
      const l = labelOf(i)!;
      expect(l.kind).toBe('bowl');
      if (l.kind === 'bowl') expect(indexOf(l.block, l.row, l.seat)).toBe(i);
    }
  });

  it('VIP chairs come after the bowl and label as skybox / row / seat', () => {
    const i = vipIndexOf(9, 2);
    expect(i).toBe(layout.bowlSeatCount + 8 * 8 + 1);
    expect(labelOf(i)).toMatchObject({ kind: 'vip', box: 9, row: 1, seat: 2 });
    expect(labelOf(vipIndexOf(9, 6))).toMatchObject({ kind: 'vip', box: 9, row: 2, seat: 6 });
    expect(labelOf(layout.totalSeatCount)).toBeNull();
    expect(labelOf(-1)).toBeNull();
    expect(indexOf(232, 21, 1)).toBe(-1);
    expect(indexOf(999, 1, 1)).toBe(-1);
  });

  it('seatsInRow and runsOfAdjacentFree', () => {
    const row = seatsInRow(232, 10)!;
    expect(row.count).toBe(25);
    const st = new Uint8Array(layout.totalSeatCount);
    // Row 10 of block 232: seats 1-4 sold, 5-11 free, 12 held, 13-25 free.
    for (let k = 0; k < 4; k++) st[row.first + k] = 2;
    st[row.first + 11] = 1;
    const runs3 = runsOfAdjacentFree(st, 232, 10, 3);
    // Runs of 3 start at seats 5..9 (5 runs) and 13..23 (11 runs).
    expect(runs3.length).toBe(5 + 11);
    expect(runs3[0]).toBe(indexOf(232, 10, 5));
    expect(runsOfAdjacentFree(st, 232, 10, 7)).toEqual(
      [5, ...range(13, 19)].map((seat) => indexOf(232, 10, seat)),
    );
    expect(runsOfAdjacentFree(st, 232, 10, 14)).toEqual([]);
    expect(blockFitsRun(st, blockById(232)!, 10)).toBe(true);
  });
});

describe('seat flags', () => {
  it('accessible blocks: every second lower-tier block has 4 wheelchair spaces and 2 companion seats', () => {
    const lower = layout.blocks.filter((b) => b.tierKey === 'L');
    const accessible = lower.filter((b) => b.accessible);
    expect(accessible.length).toBe(Math.ceil(lower.length / 2));
    for (const b of layout.blocks) {
      const n = b.rowLen[0],
        f = b.rowFirst[0];
      let wc = 0,
        comp = 0;
      for (let i = b.firstSeat; i < b.firstSeat + b.seatCount; i++) {
        if (layout.flags[i] & SeatFlag.Wheelchair) wc++;
        if (layout.flags[i] & SeatFlag.Companion) comp++;
      }
      if (!b.accessible) {
        expect(wc + comp).toBe(0);
        continue;
      }
      expect([wc, comp]).toEqual([4, 2]);
      for (const k of [0, 1, n - 2, n - 1]) expect(layout.flags[f + k] & SeatFlag.Wheelchair).toBeTruthy();
      for (const k of [2, n - 3]) expect(layout.flags[f + k] & SeatFlag.Companion).toBeTruthy();
    }
  });

  it('restricted view: exactly lower-tier rows 23-28', () => {
    for (let i = 0; i < layout.bowlSeatCount; i++) {
      const b = layout.blocks[layout.blockOf[i]];
      const expected = b.tierKey === 'L' && layout.rowOf[i] >= 23;
      expect(!!(layout.flags[i] & SeatFlag.Restricted), `seat ${i}`).toBe(expected);
    }
  });
});

describe('prices', () => {
  const pricing = defaultPricing();

  it('default categories: one per distinct price, highest first', () => {
    const cats = defaultCategories();
    expect(cats.map((c) => c.priceMinor / 100)).toEqual([1250, 1050, 950, 850, 800, 750, 650, 550, 450, 400]);
    expect(cats[0]).toMatchObject({ code: 'C1', name: 'Category 1', priceMinor: 125_000 });
    expect(defaultCategoryCode(blockById(232)!)).toBe('C1');
  });

  it('price classes follow the stand position', () => {
    for (const b of layout.blocks) {
      const st = layout.stands[b.stand];
      const expected = st.long
        ? b.c < 0.36
          ? 'centre'
          : b.c < 0.72
            ? 'side'
            : 'corner'
        : b.c > 0.6
          ? 'corner'
          : 'end';
      expect(b.priceClass).toBe(expected);
    }
  });

  it('restricted seats cost one category lower; the cheapest category stays', () => {
    const ladder = pricing.ladderMinor;
    expect(oneCategoryLower(95_000, ladder)).toBe(85_000);
    expect(oneCategoryLower(40_000, ladder)).toBe(40_000);
    const lowerCentre = layout.blocks.find((b) => b.tierKey === 'L' && b.priceClass === 'centre')!;
    const front = lowerCentre.rowFirst[0],
      back = lowerCentre.rowFirst[27];
    expect(seatPriceMinor(front, pricing)).toBe(95_000);
    expect(seatPriceMinor(back, pricing)).toBe(85_000);
    // A fixed "Restricted view" price applies instead, but never above the block's own price.
    expect(seatPriceMinor(back, { ...pricing, restrictedMinor: 50_000 })).toBe(50_000);
    expect(seatPriceMinor(back, { ...pricing, restrictedMinor: 99_000 })).toBe(95_000);
    expect(seatPriceMinor(front, { ...pricing, restrictedMinor: 50_000 })).toBe(95_000);
  });

  it('VIP chairs cost AED 3,750; all 8 chairs of a box cost the whole-box price', () => {
    const box = layout.boxes[8];
    const chairs = Array.from({ length: 8 }, (_, k) => box.firstSeat + k);
    expect(seatPriceMinor(chairs[0], pricing)).toBe(375_000);
    expect(totalPriceMinor(chairs.slice(0, 3), pricing)).toBe(3 * 375_000);
    expect(totalPriceMinor(chairs, pricing)).toBe(2_800_000);
    expect(wholeBoxOf(chairs)).toBe(8);
    expect(wholeBoxOf(chairs.slice(0, 7))).toBe(-1);
    const two = [indexOf(232, 10, 7), indexOf(232, 10, 8)];
    expect(totalPriceMinor([...two, ...chairs], pricing)).toBe(2 * 125_000 + 2_800_000);
  });
});

describe('plan polygons', () => {
  it('blockPolygon gives a closed band with finite points', () => {
    for (const b of layout.blocks) {
      const poly = blockPolygon(b);
      expect(poly.length).toBeGreaterThanOrEqual(4);
      for (const [x, z] of poly) expect(Number.isFinite(x) && Number.isFinite(z)).toBe(true);
    }
    expect(blockPolygon(999)).toEqual([]);
  });
});

describe('sold pattern', () => {
  const keep = range(5, 11).map((s) => indexOf(232, 10, s));

  it('is deterministic per seed, hits the target and keeps the protected seats free', () => {
    for (const target of [0.3, 0.4, 0.65, 0.97]) {
      const a = soldPattern({ seed: 'cup-final', target, keepFree: keep, scatter: target > 0.9 ? 1 : 0 });
      const b = soldPattern({ seed: 'cup-final', target, keepFree: keep, scatter: target > 0.9 ? 1 : 0 });
      expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
      let sold = 0;
      for (let i = 0; i < layout.bowlSeatCount; i++) sold += a[i];
      expect(Math.abs(sold / layout.bowlSeatCount - target)).toBeLessThan(0.02);
      for (const i of keep) expect(a[i]).toBe(0);
    }
    const other = soldPattern({ seed: 'league-1', target: 0.4 });
    const same = soldPattern({ seed: 'cup-final', target: 0.4 });
    expect(Buffer.from(other).equals(Buffer.from(same))).toBe(false);
  });

  it('sells out about 6% of blocks', () => {
    const sold = soldPattern({ seed: 'cup-final', target: 0.65, keepFree: keep });
    const soldOut = layout.blocks.filter((b) => {
      for (let i = b.firstSeat; i < b.firstSeat + b.seatCount; i++) if (!sold[i]) return false;
      return true;
    }).length;
    expect(soldOut / layout.blocks.length).toBeGreaterThan(0.02);
    expect(soldOut / layout.blocks.length).toBeLessThan(0.14);
  });
});

function range(a: number, b: number): number[] {
  return Array.from({ length: b - a + 1 }, (_, k) => a + k);
}
