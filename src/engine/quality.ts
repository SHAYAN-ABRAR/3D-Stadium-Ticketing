/**
 * Quality tiers (PROMPT.md 6.4) and automatic tiering: start at Medium, measure 90 frames during the
 * intro flight, switch to High if the 90th-percentile frame time is under 12 ms or to Low if it is over
 * 30 ms, re-measure after a change, and remember the result per device in localStorage.
 */
import type { QualitySetting, QualityTier } from './types';

export interface TierSettings {
  dprCap: number;
  shadowMapSize: number;
  treeDensity: number;
  ambient: boolean;
  /** Drifting cloud shadows (Medium and up) and swaying trees (High). */
  cloudShadows: boolean;
  wind: boolean;
  bloom: boolean;
  ao: boolean;
  /** Crowd: 'views' = impostors only in seat and box views; 'impostors' everywhere it shows; 'full' adds near 3D people. */
  crowd: 'views' | 'impostors' | 'full';
  /** Snapshot supersampling and depth of field (High). */
  snapshotScale: number;
}

export const TIERS: Record<QualityTier, TierSettings> = {
  low: {
    dprCap: 1,
    shadowMapSize: 2048,
    treeDensity: 0.6,
    ambient: false,
    cloudShadows: false,
    wind: false,
    bloom: false,
    ao: false,
    crowd: 'views',
    snapshotScale: 1,
  },
  medium: {
    dprCap: 1.5,
    shadowMapSize: 2048,
    treeDensity: 1,
    ambient: true,
    cloudShadows: true,
    wind: false,
    bloom: true,
    ao: false,
    crowd: 'impostors',
    snapshotScale: 1,
  },
  high: {
    dprCap: 2,
    shadowMapSize: 4096,
    treeDensity: 1,
    ambient: true,
    cloudShadows: true,
    wind: true,
    bloom: true,
    ao: true,
    crowd: 'full',
    snapshotScale: 2,
  },
};

const STORAGE_KEY = 'stadium.quality.v1';

export function rememberedTier(): QualityTier | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'low' || v === 'medium' || v === 'high' ? v : null;
  } catch {
    return null;
  }
}

export function rememberTier(tier: QualityTier | null) {
  try {
    if (tier) localStorage.setItem(STORAGE_KEY, tier);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be blocked (private mode); the tier is simply measured again next time.
  }
}

/** ?quality=low|medium|high overrides everything. */
export function urlQuality(): QualityTier | null {
  if (typeof location === 'undefined') return null;
  const q = new URLSearchParams(location.search).get('quality');
  return q === 'low' || q === 'medium' || q === 'high' ? q : null;
}

/** The tier to start with for a setting. */
export function initialTier(setting: QualitySetting): QualityTier {
  const fromUrl = urlQuality();
  if (fromUrl) return fromUrl;
  if (setting !== 'auto') return setting;
  return rememberedTier() ?? 'medium';
}

/** Collects frame times and proposes a tier change. */
export class AutoTier {
  private samples: number[] = [];
  private measuring = false;
  private steps = 0;

  constructor(
    private current: QualityTier,
    private enabled: boolean,
  ) {}

  /** Starts a 90-frame measurement (the intro flight, or after a tier change). */
  begin() {
    if (!this.enabled) return;
    this.samples = [];
    this.measuring = true;
  }

  get isMeasuring() {
    return this.measuring;
  }

  /** Records a frame time; returns a new tier when the measurement asks for a change. */
  record(ms: number): QualityTier | null {
    if (!this.measuring) return null;
    if (ms <= 0 || ms > 2000) return null;
    this.samples.push(ms);
    if (this.samples.length < 90) return null;
    this.measuring = false;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const p90 = sorted[Math.floor(sorted.length * 0.9)];
    let next: QualityTier = this.current;
    if (p90 < 12 && this.current !== 'high' && this.steps === 0)
      next = this.current === 'low' ? 'medium' : 'high';
    else if (p90 > 30 && this.current !== 'low') next = this.current === 'high' ? 'medium' : 'low';
    if (next === this.current) {
      rememberTier(this.current);
      return null;
    }
    this.current = next;
    this.steps++;
    rememberTier(next);
    // Re-measure after a change (at most twice, so the tier can't oscillate).
    if (this.steps < 2) this.begin();
    return next;
  }

  set tier(t: QualityTier) {
    this.current = t;
  }
}
