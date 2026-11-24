/**
 * The neighbourhood around the park. It is procedural, not a map of the real streets: a planned grid of
 * roads like Mirpur's sections, lanes between rows of five- to twelve-storey blocks in Dhaka's facade
 * colours, a few towers along the main roads, stair rooms and water tanks on the roofs, mosques, small
 * playgrounds, trees along the main roads and street lights. Beyond about 1.4 km the blocks get bigger and
 * sparser, and the fog takes over. MRT Line 6 runs north-south on its viaduct east of the stadium, with
 * Mirpur 10 station to the north-east (a short walk from gates N1 and E1). No three.js and no DOM: it runs
 * in the build worker. Metres; x east, z south (north is -z), y up; the park covers |x|, |z| <= 430.
 */
import { clamp, hash2, noise2, rng } from '@/lib/stadium/random';

/** Half the side of the park square (park.ts GROUND / 2). */
export const PARK_HALF = 430;
/** The road around the park: its centreline (distance from the middle) and width. */
export const RING_ROAD = { at: 444, w: 18 } as const;

export const METRO = {
  /** The viaduct's centreline (it runs north-south). */
  x: 330,
  /** Mirpur 10 station: centre (z) and platform length. */
  stationZ: -330,
  stationLength: 150,
  /** Top of the deck, and how far the line runs each way from the middle (the fog hides its ends). */
  deckY: 13,
  half: 3400,
  /** The road under the viaduct, two carriageways either side of the piers. */
  roadW: 30,
} as const;

/** Where the east road meets the line: the Mirpur 10 roundabout. */
export const ROUNDABOUT = { x: METRO.x, z: 0, r: 26 } as const;

/** How far the city reaches from the middle (Chebyshev distance). */
export const CITY_HALF = 2800;
/** Bands: small plots with lanes, then bigger and sparser blocks. */
const BAND_A = 1150,
  BAND_B = 1950;
/** Stair rooms and water tanks only where they can be seen (they are a few pixels further out). */
const ROOFTOPS = 1100;
const STOREY = 3.1;

/**
 * Facade colours (sRGB), in mid tones so they hold up in a low sun: off-whites and beiges, sand and ochre,
 * dusty terracotta, sage and faded blue, mustard, exposed concrete, slate and old brick.
 */
export const FACADES = [
  '#d9d2c3',
  '#cfc4ad',
  '#d8b98a',
  '#c99787',
  '#b98579',
  '#9fb7a3',
  '#93aabf',
  '#b5b0a5',
  '#8d4e3a',
  '#e2dbcd',
  '#c4b28f',
  '#a9b9b5',
  '#d3a95c',
  '#7f8a92',
] as const;
/** Water tank colours: black and blue plastic, some grey concrete. */
export const TANK_COLORS = ['#1e1f22', '#2a5596', '#1e1f22', '#c8c3b8'] as const;

/** Kinds of ground rectangle. */
export const GroundKind = { Main: 0, Street: 1, Lane: 2, Green: 3 } as const;

export interface CityData {
  /** [cx, cz, w (along x), d (along z), h, facade, seed, flags] per building; flags 1 = shops at street level. */
  buildings: Float32Array;
  /** [x, y, z, w, d, h] per stair room on a roof (y = the roof). */
  roofRooms: Float32Array;
  /** [x, y, z, r, h, colour] per water tank (y = the roof it stands on). */
  tanks: Float32Array;
  /** [x0, z0, x1, z1, kind] per ground rectangle (a GroundKind value). */
  ground: Float32Array;
  /** [cx, cz, size, minaret corner 0-3] per mosque. */
  mosques: Float32Array;
  /** Trees in the park's format: [x, z, h, r, conifer (0), tint]. */
  trees: Float32Array;
  /** [x, y, z] per street light. */
  lights: Float32Array;
}

interface Line {
  at: number;
  w: number;
  main: boolean;
}

/** Grid lines across the whole extent: streets every 150-195 m, plus the main roads (which win when close). */
function gridLines(seed: number, mains: Line[]): Line[] {
  const r = rng(seed);
  const lines: Line[] = [...mains];
  let p = -CITY_HALF + 60 + r() * 40;
  while (p < CITY_HALF - 40) {
    lines.push({ at: p, w: 11, main: false });
    p += 150 + r() * 45;
  }
  lines.sort((a, b) => a.at - b.at);
  const out: Line[] = [];
  for (const l of lines) {
    const prev = out[out.length - 1];
    if (prev && l.at - prev.at < 70) {
      if (l.main && !prev.main) out[out.length - 1] = l;
      continue;
    }
    out.push(l);
  }
  return out;
}

const inPark = (x: number, z: number, m = 0) =>
  Math.abs(x) < RING_ROAD.at - RING_ROAD.w / 2 - m && Math.abs(z) < RING_ROAD.at - RING_ROAD.w / 2 - m;

export function buildCityData(): CityData {
  const xs = gridLines(101, [
    { at: 0, w: 22, main: true },
    { at: METRO.x, w: METRO.roadW, main: true },
    { at: -RING_ROAD.at, w: RING_ROAD.w, main: true },
    { at: RING_ROAD.at, w: RING_ROAD.w, main: true },
    { at: -1180, w: 20, main: true },
    { at: 1240, w: 20, main: true },
  ]);
  const zs = gridLines(202, [
    { at: 0, w: 22, main: true },
    { at: -RING_ROAD.at, w: RING_ROAD.w, main: true },
    { at: RING_ROAD.at, w: RING_ROAD.w, main: true },
    { at: -1150, w: 20, main: true },
    { at: 1200, w: 20, main: true },
  ]);

  const buildings: number[] = [],
    roofRooms: number[] = [],
    tanks: number[] = [],
    ground: number[] = [],
    mosques: number[] = [],
    trees: number[] = [],
    lights: number[] = [];
  const r = rng(303);

  /* roads: each line across the extent, minus the park (the park paints its own roads) */
  const road = (vertical: boolean, l: Line) => {
    const kind = l.main ? GroundKind.Main : GroundKind.Street;
    const crossesPark = Math.abs(l.at) < RING_ROAD.at - 1;
    const spans: [number, number][] = crossesPark
      ? [
          [-CITY_HALF, -RING_ROAD.at + RING_ROAD.w / 2],
          [RING_ROAD.at - RING_ROAD.w / 2, CITY_HALF],
        ]
      : [[-CITY_HALF, CITY_HALF]];
    for (const [a, b] of spans) {
      if (vertical) ground.push(l.at - l.w / 2, a, l.at + l.w / 2, b, kind);
      else ground.push(a, l.at - l.w / 2, b, l.at + l.w / 2, kind);
      // street lights on both sides, every 40 m on main roads and 60 m on streets
      const step = l.main ? 40 : 60,
        y = l.main ? 9.5 : 8,
        reach = l.main ? BAND_B : BAND_A + 200;
      for (let t = a + step / 2; t < b; t += step) {
        if (Math.max(Math.abs(t), Math.abs(l.at)) > reach) continue;
        for (const s of [-1, 1]) {
          const off = l.at + s * (l.w / 2 + 1);
          const [x, z] = vertical ? [off, t] : [t, off];
          if (!inPark(x, z, -4)) lights.push(x, y, z);
        }
      }
      // trees along the main roads, and now and then along streets
      for (let t = a + 9; t < b; t += 15 + r() * 7) {
        if (Math.max(Math.abs(t), Math.abs(l.at)) > (l.main ? BAND_A + 200 : BAND_A)) continue;
        if (r() > (l.main ? 0.6 : 0.1)) continue;
        for (const s of [-1, 1]) {
          const off = l.at + s * (l.w / 2 + 1.8);
          const [x, z] = vertical ? [off, t] : [t, off];
          if (inPark(x, z, -6) || nearMetroDeck(x)) continue;
          trees.push(x, z, 9 + r() * 6, 2.8 + r() * 2, 0, r());
        }
      }
    }
  };
  for (const l of xs) road(true, l);
  for (const l of zs) road(false, l);

  /* blocks */
  let blockIndex = 0;
  const mosqueSites: [number, number][] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      const a = xs[i],
        b = xs[i + 1],
        c = zs[j],
        d = zs[j + 1];
      const x0 = a.at + a.w / 2 + 3,
        x1 = b.at - b.w / 2 - 3,
        z0 = c.at + c.w / 2 + 3,
        z1 = d.at - d.w / 2 - 3;
      if (x1 - x0 < 24 || z1 - z0 < 24) continue;
      const cx = (x0 + x1) / 2,
        cz = (z0 + z1) / 2;
      if (inPark(cx, cz)) continue;
      const dist = Math.max(Math.abs(cx), Math.abs(cz));
      if (dist > CITY_HALF - 60) continue;
      const k = blockIndex++;
      const fronts = { w: a.main, e: b.main, n: c.main, s: d.main };

      // A few playgrounds in the inner band: grass with trees round the edge.
      if (dist < BAND_A && hash2(k, 401) < 0.045) {
        ground.push(x0, z0, x1, z1, GroundKind.Green);
        for (let t = x0 + 6; t < x1 - 4; t += 11 + r() * 4)
          for (const z of [z0 + 4, z1 - 4])
            if (r() < 0.85) trees.push(t, z, 10 + r() * 5, 3.2 + r() * 1.8, 0, r());
        for (let t = z0 + 14; t < z1 - 12; t += 11 + r() * 4)
          for (const x of [x0 + 4, x1 - 4])
            if (r() < 0.85) trees.push(x, t, 10 + r() * 5, 3.2 + r() * 1.8, 0, r());
        continue;
      }

      // Now and then a mosque on the block's corner nearest the stadium (at least 450 m apart).
      let mosque: [number, number, number, number] | null = null;
      if (dist < BAND_A + 300 && hash2(k, 409) < 0.06) {
        const size = 34;
        const mx = Math.abs(x0) < Math.abs(x1) ? x0 + size / 2 + 2 : x1 - size / 2 - 2;
        const mz = Math.abs(z0) < Math.abs(z1) ? z0 + size / 2 + 2 : z1 - size / 2 - 2;
        if (mosqueSites.every(([sx, sz]) => Math.hypot(sx - mx, sz - mz) > 450)) {
          mosqueSites.push([mx, mz]);
          mosque = [mx - size / 2 - 3, mz - size / 2 - 3, mx + size / 2 + 3, mz + size / 2 + 3];
          mosques.push(mx, mz, size, (hash2(k, 419) * 4) | 0);
        }
      }

      fillBlock({ x0, x1, z0, z1, dist, k, fronts, mosque }, r, buildings, roofRooms, tanks, ground, trees);
    }
  }

  return {
    buildings: new Float32Array(buildings),
    roofRooms: new Float32Array(roofRooms),
    tanks: new Float32Array(tanks),
    ground: new Float32Array(ground),
    mosques: new Float32Array(mosques),
    trees: new Float32Array(trees),
    lights: new Float32Array(lights),
  };
}

/** Trees keep clear of the viaduct's deck. */
function nearMetroDeck(x: number) {
  return Math.abs(x - METRO.x) < 9;
}

interface Block {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  dist: number;
  k: number;
  /** Which sides face a main road. */
  fronts: { w: boolean; e: boolean; n: boolean; s: boolean };
  /** A mosque's site (x0, z0, x1, z1) to keep clear. */
  mosque: [number, number, number, number] | null;
}

/**
 * Fills a block with rows of buildings. Rows run along the block's longer side; in the inner band, lanes
 * split the block into strips of two rows back to back, each row facing a lane or a road.
 */
function fillBlock(
  b: Block,
  r: () => number,
  buildings: number[],
  roofRooms: number[],
  tanks: number[],
  ground: number[],
  trees: number[],
) {
  const alongX = b.x1 - b.x0 >= b.z1 - b.z0;
  // u runs along the rows, v across them.
  const u0 = alongX ? b.x0 : b.z0,
    u1 = alongX ? b.x1 : b.z1,
    v0 = alongX ? b.z0 : b.x0,
    v1 = alongX ? b.z1 : b.x1;
  const band = b.dist < BAND_A ? 0 : b.dist < BAND_B ? 1 : 2;
  // Height of the neighbourhood: some areas are taller than others.
  const tall = 0.82 + noise2(b.x0 * 0.0024 + 11, b.z0 * 0.0024 + 7) * 0.45;
  const laneW = 6;
  const strips: [number, number][] = [];
  if (band === 0) {
    const n = Math.max(1, Math.round((v1 - v0 + laneW) / (56 + laneW)));
    const depth = (v1 - v0 - laneW * (n - 1)) / n;
    for (let s = 0; s < n; s++) {
      const a = v0 + s * (depth + laneW);
      strips.push([a, a + depth]);
      if (s < n - 1) {
        const l0 = a + depth,
          l1 = l0 + laneW;
        if (alongX) ground.push(u0, l0, u1, l1, GroundKind.Lane);
        else ground.push(l0, u0, l1, u1, GroundKind.Lane);
      }
    }
  } else strips.push([v0, v1]);

  const keep = band === 2 ? clamp(0.8 - ((b.dist - BAND_B) / (CITY_HALF - BAND_B)) * 0.65, 0.15, 1) : 1;
  const mainFront = alongX ? [b.fronts.n, b.fronts.s] : [b.fronts.w, b.fronts.e];

  for (const [s0, s1] of strips) {
    const sd = s1 - s0;
    // Two rows back to back when the strip is deep enough.
    const rows: { a: number; b: number; front: number; main: boolean }[] =
      sd > 30
        ? [
            { a: s0, b: s0 + sd / 2 - 0.6, front: s0, main: s0 === v0 && mainFront[0] },
            { a: s0 + sd / 2 + 0.6, b: s1, front: s1, main: s1 === v1 && mainFront[1] },
          ]
        : [{ a: s0, b: s1, front: s0, main: (s0 === v0 && mainFront[0]) || (s1 === v1 && mainFront[1]) }];
    for (const row of rows) {
      const rowD = row.b - row.a;
      let u = u0 + r() * 2;
      while (u < u1 - 6) {
        const wMin = band === 0 ? 11 : band === 1 ? 28 : 40,
          wMax = band === 0 ? 26 : band === 1 ? 54 : 76;
        let w = wMin + r() * (wMax - wMin);
        if (u + w > u1) w = u1 - u;
        const gap = band === 0 ? 1.6 + r() * 2.4 : 2.5 + r() * 4;
        if (w < 7) break;
        const dd = rowD * (0.72 + r() * 0.28);
        // Flush with the street (or lane) side, a little setback now and then.
        const setback = r() < 0.3 ? r() * 2 : 0;
        const va = row.front === row.a ? row.a + setback : row.b - setback - dd;
        const vb = va + dd;
        const cu = u + w / 2,
          cv = (va + vb) / 2;
        const cx = alongX ? cu : cv,
          cz = alongX ? cv : cu,
          bw = alongX ? w : dd,
          bd = alongX ? dd : w;
        u += w + gap;
        if (keep < 1 && hash2((cx * 7) | 0, (cz * 13) | 0) > keep) continue;
        if (b.mosque && overlaps(cx, cz, bw, bd, b.mosque)) continue;
        // Storeys: five to ten in the inner band, taller on main roads, a tower now and then.
        let storeys =
          band === 0
            ? 5 + Math.floor(Math.pow(r(), 1.4) * 6)
            : band === 1
              ? 4 + Math.floor(r() * 6)
              : 3 + Math.floor(r() * 5);
        if (row.main) storeys += Math.floor(r() * 4);
        if (row.main && band < 2 && r() < 0.05) storeys = 13 + Math.floor(r() * 9);
        storeys = Math.max(3, Math.round(storeys * tall));
        const h = storeys * STOREY + 1;
        const seed = r() * 997;
        const facade = Math.floor(r() * FACADES.length);
        buildings.push(cx, cz, bw, bd, h, facade, seed, row.main ? 1 : 0);
        // On the roof: a stair room and a water tank or two, where they can be seen.
        if (b.dist < ROOFTOPS && bw > 7 && bd > 7) {
          if (r() < 0.75) {
            const rw = 3 + r() * 1.4,
              rd = 3.8 + r() * 1.6;
            const ox = (r() - 0.5) * (bw - rw - 2),
              oz = (r() - 0.5) * (bd - rd - 2);
            roofRooms.push(cx + ox, h, cz + oz, rw, rd, 2.8 + r() * 0.4);
          }
          const nTanks = r() < 0.5 ? 1 + (r() < 0.25 ? 1 : 0) : 0;
          for (let t = 0; t < nTanks; t++) {
            const tr = 0.6 + r() * 0.45;
            tanks.push(
              cx + (r() - 0.5) * (bw - 3),
              h,
              cz + (r() - 0.5) * (bd - 3),
              tr,
              1.3 + r() * 0.8,
              Math.floor(r() * TANK_COLORS.length),
            );
          }
        }
        // A courtyard tree now and then in the inner band.
        if (band === 0 && r() < 0.05) {
          const tu = u - gap / 2,
            tv = row.front === row.a ? row.b - 2 : row.a + 2;
          trees.push(alongX ? tu : tv, alongX ? tv : tu, 8 + r() * 5, 2.6 + r() * 1.5, 0, r());
        }
      }
    }
  }
}

function overlaps(cx: number, cz: number, w: number, d: number, rect: [number, number, number, number]) {
  return cx + w / 2 > rect[0] && cx - w / 2 < rect[2] && cz + d / 2 > rect[1] && cz - d / 2 < rect[3];
}
