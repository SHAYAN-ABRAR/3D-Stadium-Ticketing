import { describe, expect, it } from 'vitest';
import { buildCityData, CITY_HALF, GroundKind, METRO, PARK_HALF, ROUNDABOUT } from '@/engine/world/city-data';

const city = buildCityData();
const count = (a: Float32Array, stride: number) => a.length / stride;

describe('the neighbourhood around the park', () => {
  it('is the same every time', () => {
    const again = buildCityData();
    for (const key of Object.keys(city) as (keyof typeof city)[])
      expect(Buffer.from(again[key].buffer).equals(Buffer.from(city[key].buffer)), key).toBe(true);
  });

  it('stays within a budget a phone can draw', () => {
    const stats = {
      buildings: count(city.buildings, 8),
      roofRooms: count(city.roofRooms, 6),
      tanks: count(city.tanks, 6),
      mosques: count(city.mosques, 4),
      trees: count(city.trees, 6),
      lights: count(city.lights, 3),
    };
    console.log(JSON.stringify(stats));
    expect(stats.buildings).toBeGreaterThan(3000);
    expect(stats.buildings).toBeLessThan(10000);
    expect(stats.roofRooms + stats.tanks).toBeLessThan(9000);
    expect(stats.mosques).toBeGreaterThanOrEqual(3);
    expect(stats.mosques).toBeLessThanOrEqual(12);
    expect(stats.trees).toBeLessThan(4500);
    expect(stats.lights).toBeLessThan(8000);
  });

  it('builds nothing in the park, on a road or under the viaduct', () => {
    const b = city.buildings,
      g = city.ground;
    const roads: number[][] = [];
    for (let i = 0; i < g.length; i += 5)
      if (g[i + 4] !== GroundKind.Green) roads.push([g[i], g[i + 1], g[i + 2], g[i + 3]]);
    const wrong: string[] = [];
    for (let i = 0; i < b.length; i += 8) {
      const [cx, cz, w, d, h] = [b[i], b[i + 1], b[i + 2], b[i + 3], b[i + 4]];
      const n = i / 8;
      if (Math.max(Math.abs(cx) - w / 2, Math.abs(cz) - d / 2) <= PARK_HALF) wrong.push(`${n}: in the park`);
      if (Math.max(Math.abs(cx), Math.abs(cz)) >= CITY_HALF) wrong.push(`${n}: beyond the city`);
      if (h <= 8) wrong.push(`${n}: too low`);
      if (Math.abs(cx - METRO.x) - w / 2 <= 5) wrong.push(`${n}: under the viaduct`);
      for (const r of roads) {
        const ox = Math.min(cx + w / 2, r[2]) - Math.max(cx - w / 2, r[0]),
          oz = Math.min(cz + d / 2, r[3]) - Math.max(cz - d / 2, r[1]);
        if (ox > 0.01 && oz > 0.01) {
          wrong.push(`${n}: on a road`);
          break;
        }
      }
    }
    expect(wrong.slice(0, 10)).toEqual([]);
  });

  it('keeps the mosques apart and the roundabout on the line, inside the park', () => {
    const m = city.mosques;
    for (let i = 0; i < m.length; i += 4)
      for (let j = i + 4; j < m.length; j += 4)
        expect(Math.hypot(m[i] - m[j], m[i + 1] - m[j + 1])).toBeGreaterThan(450);
    expect(ROUNDABOUT.x).toBe(METRO.x);
    expect(Math.abs(METRO.stationZ)).toBeLessThan(PARK_HALF);
  });
});
