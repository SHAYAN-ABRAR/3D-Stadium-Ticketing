/**
 * Lighting presets (PROMPT.md 6.6, item 3) with a smooth 1.5 s transition:
 * - day (default): sun high in the south-west, neutral light;
 * - blue hour: the sun just set, a deep blue sky, the lights already on;
 * - night: the sun below the horizon, moonlight and a dim hemisphere; floodlight strips under the roof's inner
 *   edge, spot lights on the pitch (no shadows), LED ribbons, screens and facade windows bright enough to
 *   bloom, facade fins washed in the brand colour, a light strip along the roof's edge, stars and a moon.
 * Values are blended every frame of a transition; the environment map is rebuilt for the target preset at
 * its end (and cached). Painted ground shadows are drawn for a sun 22 degrees high (SUN_DIR in park.ts), so
 * day softens them and the evening presets hide them.
 */
import * as THREE from 'three';
import { brand } from '@/config/brand';
import type { LightingPreset } from './types';
import { dirFrom, setSky, skyEnvironment, type SkyParams } from './world/sky';
import type { World } from './world/scene';

export interface Look {
  sky: SkyParams;
  /** The directional light (the sun, or the moon at night). */
  lightElevation: number;
  lightAzimuth: number;
  lightColor: THREE.Color;
  lightIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  fog: THREE.Color;
  fogNear: number;
  fogFar: number;
  exposure: number;
  envIntensity: number;
  paintedShadows: number;
  /** How much a passing cloud darkens the sun term (0 = no cloud shadows). */
  cloudShadows: number;
  /** 0 by day, 1 at night: floodlights, glowing LEDs and windows, spot lights, stars and moon. */
  night: number;
}

const c = (hex: string) => new THREE.Color(hex);

/** The sun's colour from its height: orange at the horizon, warm gold at 22 degrees, near white high up. */
export function sunColor(elevation: number): THREE.Color {
  const low = c('#ff9d5c'),
    gold = c('#ffdcb2'),
    high = c('#fff6ec');
  if (elevation <= 22) return low.lerp(gold, THREE.MathUtils.clamp((elevation - 4) / 18, 0, 1));
  return gold.lerp(high, THREE.MathUtils.clamp((elevation - 22) / 36, 0, 1));
}

/** The sun's azimuth in the prototype (SUN_DIR in park.ts): 145 degrees, south-west. */
const SUN_AZ = 145;

export const LOOKS: Record<LightingPreset, Look> = {
  day: {
    // Same azimuth as the painted ground shadows, so they only fade and never point the wrong way
    // (pitfall 14).
    sky: {
      elevation: 58,
      azimuth: SUN_AZ,
      turbidity: 4,
      rayleigh: 1.4,
      mie: 0.004,
      mieG: 0.8,
      gain: 0.34,
      clouds: 0.3,
      horizonTint: [1, 1, 1],
      zenithTint: [1, 1, 1],
    },
    lightElevation: 58,
    lightAzimuth: SUN_AZ,
    lightColor: sunColor(58),
    // A high sun lights flat surfaces about twice as strongly as a sun 22 degrees high.
    lightIntensity: 1.9,
    hemiSky: c('#d9e8fb'),
    hemiGround: c('#66774d'),
    hemiIntensity: 0.3,
    fog: c('#dde7ef'),
    fogNear: 1400,
    fogFar: 7000,
    exposure: 0.86,
    // The bright midday sky as an environment flattens the contrast; it is turned down.
    envIntensity: 0.55,
    paintedShadows: 0.3,
    cloudShadows: 0.38,
    night: 0,
  },
  // Blue hour: the sun just below the horizon, a deep blue sky with a warm glow where it set, the city's
  // windows and the floodlights already on.
  dusk: {
    // The sky model darkens steeply as the sun sinks (and goes black about 2.3 degrees down): just below
    // the horizon, with a high gain (which also lifts its faint blue night floor), it gives the deep blue of
    // the hour after sunset.
    sky: {
      elevation: -1.2,
      azimuth: SUN_AZ,
      turbidity: 3.2,
      rayleigh: 3.4,
      mie: 0.005,
      mieG: 0.84,
      gain: 30,
      clouds: 0.22,
      // Warm where the sun went down, deep blue overhead. (The model's twilight is olive: it has no ozone
      // absorption, which is what turns the real twilight sky blue.)
      horizonTint: [1.15, 0.8, 0.7],
      zenithTint: [0.2, 0.4, 1.7],
    },
    lightElevation: 34,
    lightAzimuth: SUN_AZ + 20,
    lightColor: c('#87a1e8'),
    lightIntensity: 0.8,
    hemiSky: c('#7088d2'),
    hemiGround: c('#1f2536'),
    hemiIntensity: 1.15,
    fog: c('#34497a'),
    fogNear: 650,
    fogFar: 4400,
    exposure: 1.06,
    envIntensity: 0.65,
    paintedShadows: 0,
    cloudShadows: 0,
    night: 0.82,
  },
  night: {
    sky: {
      elevation: -8,
      azimuth: SUN_AZ,
      turbidity: 2,
      rayleigh: 0.8,
      mie: 0.003,
      mieG: 0.75,
      gain: 1.4,
      clouds: 0.2,
      horizonTint: [1, 1, 1],
      zenithTint: [1, 1, 1],
    },
    lightElevation: 42,
    lightAzimuth: 250,
    lightColor: c('#9fb2ff'),
    lightIntensity: 0.35,
    hemiSky: c('#33456b'),
    hemiGround: c('#14120d'),
    hemiIntensity: 0.45,
    fog: c('#0a111d'),
    fogNear: 500,
    fogFar: 3800,
    exposure: 1.05,
    envIntensity: 0.35,
    paintedShadows: 0,
    cloudShadows: 0,
    night: 1,
  },
};

const lerp = THREE.MathUtils.lerp;
const lerp3 = (a: readonly [number, number, number], b: readonly [number, number, number], t: number) =>
  [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)] as const;

function lerpAngle(a: number, b: number, t: number) {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return a + d * t;
}

export function mixLook(a: Look, b: Look, t: number): Look {
  return {
    sky: {
      elevation: lerp(a.sky.elevation, b.sky.elevation, t),
      azimuth: lerpAngle(a.sky.azimuth, b.sky.azimuth, t),
      turbidity: lerp(a.sky.turbidity, b.sky.turbidity, t),
      rayleigh: lerp(a.sky.rayleigh, b.sky.rayleigh, t),
      mie: lerp(a.sky.mie, b.sky.mie, t),
      mieG: lerp(a.sky.mieG, b.sky.mieG, t),
      gain: lerp(a.sky.gain, b.sky.gain, t),
      clouds: lerp(a.sky.clouds, b.sky.clouds, t),
      horizonTint: lerp3(a.sky.horizonTint, b.sky.horizonTint, t),
      zenithTint: lerp3(a.sky.zenithTint, b.sky.zenithTint, t),
    },
    lightElevation: lerp(a.lightElevation, b.lightElevation, t),
    lightAzimuth: lerpAngle(a.lightAzimuth, b.lightAzimuth, t),
    lightColor: a.lightColor.clone().lerp(b.lightColor, t),
    lightIntensity: lerp(a.lightIntensity, b.lightIntensity, t),
    hemiSky: a.hemiSky.clone().lerp(b.hemiSky, t),
    hemiGround: a.hemiGround.clone().lerp(b.hemiGround, t),
    hemiIntensity: lerp(a.hemiIntensity, b.hemiIntensity, t),
    fog: a.fog.clone().lerp(b.fog, t),
    fogNear: lerp(a.fogNear, b.fogNear, t),
    fogFar: lerp(a.fogFar, b.fogFar, t),
    exposure: lerp(a.exposure, b.exposure, t),
    envIntensity: lerp(a.envIntensity, b.envIntensity, t),
    paintedShadows: lerp(a.paintedShadows, b.paintedShadows, t),
    cloudShadows: lerp(a.cloudShadows, b.cloudShadows, t),
    night: lerp(a.night, b.night, t),
  };
}

const TRANSITION_MS = 1500;
/** Candela of each pitch spot light at night (about 70-90 m from the pitch). */
const SPOT_CANDELA = 2600;
/** The point light above the pitch that stands in for the floodlights' spill on the stands. */
const BOWL_FILL_CANDELA = 9000;

export class LightingRig {
  private current: Look;
  private from: Look | null = null;
  private to: Look | null = null;
  private target: LightingPreset;
  private start = 0;
  private duration = 0;
  private readonly envs = new Map<LightingPreset, THREE.WebGLRenderTarget>();
  private readonly base: {
    flood: THREE.Color;
    roofEdge: THREE.Color;
    leds: THREE.Color[];
    interiorEmissive: number;
    membraneEmissive: number;
    membraneUnder: number;
  };
  /** Cloud shadows need Medium or High (quality.ts); the engine switches them. */
  private clouds = true;

  constructor(
    private readonly world: World,
    private readonly renderer: THREE.WebGLRenderer,
  ) {
    const L = world.lighting;
    this.base = {
      flood: L.flood.color.clone(),
      roofEdge: L.roofEdge.color.clone(),
      leds: L.leds.map((m) => m.color.clone()),
      interiorEmissive: L.interior.emissiveIntensity,
      membraneEmissive: L.membrane.emissiveIntensity,
      membraneUnder: L.membraneUnder.emissiveIntensity,
    };
    this.target = 'day';
    this.current = LOOKS.day;
    this.envs.set('day', L.env);
    this.apply(this.current);
  }

  get preset(): LightingPreset {
    return this.target;
  }

  get transitioning(): boolean {
    return !!this.to;
  }

  /** Cloud shadows on or off (the tier allows them from Medium up). */
  setClouds(on: boolean) {
    if (on === this.clouds) return;
    this.clouds = on;
    this.apply(this.current);
  }

  /** Starts a transition (instant with reduced motion or in tests). */
  set(preset: LightingPreset, instant = false) {
    if (preset === this.target && !this.to) return;
    this.target = preset;
    this.from = this.current;
    this.to = LOOKS[preset];
    this.start = performance.now();
    this.duration = instant ? 0 : TRANSITION_MS;
  }

  /** Advances the transition; returns true while it runs (the frame loop keeps rendering). */
  update(now: number): boolean {
    if (!this.to || !this.from) return false;
    const t = this.duration ? THREE.MathUtils.clamp((now - this.start) / this.duration, 0, 1) : 1;
    const eased = t * t * (3 - 2 * t);
    this.current = mixLook(this.from, this.to, eased);
    this.apply(this.current);
    this.renderer.shadowMap.needsUpdate = true;
    if (t >= 1) {
      this.current = this.to;
      this.from = this.to = null;
      this.world.scene.environment = this.envFor(this.target).texture;
    }
    return true;
  }

  private envFor(preset: LightingPreset): THREE.WebGLRenderTarget {
    let env = this.envs.get(preset);
    if (!env) {
      env = skyEnvironment(this.renderer, LOOKS[preset].sky);
      this.envs.set(preset, env);
    }
    return env;
  }

  private apply(look: Look) {
    const { world } = this,
      L = world.lighting,
      n = look.night;
    setSky(L.sky, look.sky);
    const dir = dirFrom(look.lightElevation, look.lightAzimuth);
    world.sunDir.copy(dir);
    world.sun.position.copy(dir).multiplyScalar(520);
    world.sun.color.copy(look.lightColor);
    world.sun.intensity = look.lightIntensity;
    world.hemi.color.copy(look.hemiSky);
    world.hemi.groundColor.copy(look.hemiGround);
    world.hemi.intensity = look.hemiIntensity;
    const fog = world.scene.fog as THREE.Fog;
    fog.color.copy(look.fog);
    fog.near = look.fogNear;
    fog.far = look.fogFar;
    world.scene.environmentIntensity = look.envIntensity;
    this.renderer.toneMappingExposure = look.exposure;
    world.groundShadow.value = look.paintedShadows;
    world.ambient.uCloudStrength.value = this.clouds ? look.cloudShadows : 0;
    world.ambient.uCloudSun.value.copy(dir);

    // Night: emissive things push above the bloom threshold (post.ts).
    L.flood.color.copy(this.base.flood).multiplyScalar(1 + 9 * n);
    L.roofEdge.color
      .copy(this.base.roofEdge)
      .lerp(new THREE.Color('#fff1d6'), n)
      .multiplyScalar(1 + 7 * n);
    L.leds.forEach((m, k) => m.color.copy(this.base.leds[k]).multiplyScalar(1 + 4.5 * n));
    L.facade.emissiveIntensity = 5.5 * n;
    L.fins.emissive.set(brand.colors.accent);
    L.fins.emissiveIntensity = 0.17 * n;
    L.interior.emissiveIntensity = this.base.interiorEmissive + 3 * n;
    L.membrane.emissiveIntensity = this.base.membraneEmissive * (1 - 0.8 * n);
    // Sky light through the membrane fades at night (the floodlights light it from below instead).
    L.membraneUnder.emissiveIntensity = this.base.membraneUnder * (1 - 0.92 * n);
    // Lights only change intensity: switching them on or off would recompile every material (pitfall 7).
    for (const s of L.spots) s.intensity = SPOT_CANDELA * n;
    // The floodlights' spill on the stands, so the seat colours stay readable at night.
    L.bowlFill.intensity = BOWL_FILL_CANDELA * n;
    L.stars.visible = L.moon.visible = n > 0.01;
    (L.stars.material as THREE.PointsMaterial).opacity = n;
    (L.moon.material as THREE.MeshBasicMaterial).opacity = n;
    // The city: lit windows and shops, street lights and minaret lights; the metro's windows and station.
    world.city.night.value = n;
    for (const m of world.city.lamps) {
      m.opacity = n;
      m.visible = n > 0.01;
    }
    world.metro.setNight(n);
  }

  dispose() {
    for (const env of this.envs.values()) env.dispose();
    this.envs.clear();
  }
}
