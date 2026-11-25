import { describe, expect, it } from 'vitest';
import { getLayout } from '@/lib/stadium';
import { countdownText } from '@/engine/world/boards';
import { crowdVariantOf } from '@/engine/crowd';
import { LOOKS, mixLook } from '@/engine/lighting';

describe('board countdown', () => {
  it('formats days, hours, minutes and seconds in the venue language', () => {
    expect(countdownText(59_000)).toBe('00:00:59');
    expect(countdownText((2 * 3600 + 5 * 60 + 7) * 1000)).toBe('02:05:07');
    expect(countdownText((86400 + 2 * 3600) * 1000)).toBe('1 DAY 02:00:00');
    expect(countdownText((3 * 86400 + 59) * 1000 + 999)).toBe('3 DAYS 00:00:59');
  });

  it('shows nothing once kick-off has passed', () => {
    expect(countdownText(0)).toBeNull();
    expect(countdownText(-5000)).toBeNull();
    expect(countdownText(Number.NaN)).toBeNull();
  });
});

describe('crowd colours', () => {
  const L = getLayout();
  const sample = (key: string) =>
    L.blocks
      .filter((b) => b.standKey === key)
      .flatMap((b) => Array.from({ length: b.seatCount }, (_, k) => b.firstSeat + k));

  it('puts the away fans in the West stand and home fans elsewhere', () => {
    const west = sample('W').map((i) => crowdVariantOf(i, L));
    expect(west.every((v) => v >= 7)).toBe(true); // away (7-10) or neutral (11-15)
    expect(west.filter((v) => v <= 10).length / west.length).toBeGreaterThan(0.6);
    const north = sample('N').map((i) => crowdVariantOf(i, L));
    expect(north.filter((v) => v <= 6).length / north.length).toBeGreaterThan(0.55);
    expect(north.filter((v) => v >= 7 && v <= 10).length / north.length).toBeLessThan(0.1);
  });

  it('is deterministic and stays within the 16 variants', () => {
    for (let i = 0; i < L.bowlSeatCount; i += 997) {
      const v = crowdVariantOf(i, L);
      expect(v).toBe(crowdVariantOf(i, L));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(16);
    }
  });
});

describe('lighting presets', () => {
  it('has no cloud shadows or painted sun shadows at night', () => {
    expect(LOOKS.night.cloudShadows).toBe(0);
    expect(LOOKS.night.paintedShadows).toBe(0);
    expect(LOOKS.night.night).toBe(1);
    expect(LOOKS.day.night).toBe(0);
  });

  it('blends between presets and lands exactly on the target', () => {
    const half = mixLook(LOOKS.day, LOOKS.night, 0.5);
    expect(half.night).toBeCloseTo(0.5);
    expect(half.exposure).toBeCloseTo((LOOKS.day.exposure + LOOKS.night.exposure) / 2);
    const end = mixLook(LOOKS.night, LOOKS.day, 1);
    expect(end.lightIntensity).toBe(LOOKS.day.lightIntensity);
    expect(end.sky.elevation).toBe(LOOKS.day.sky.elevation);
    // Angles take the short way round.
    expect(mixLook(LOOKS.day, LOOKS.night, 1).lightAzimuth % 360).toBeCloseTo(LOOKS.night.lightAzimuth);
  });
});
