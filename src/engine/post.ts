/**
 * Post-processing (PROMPT.md 6.6, item 1): the render pass, N8AO ambient occlusion (High), bloom above a
 * luminance threshold so only bright emissive things glow (LED boards, screens, floodlights, lit windows;
 * Medium and up), tone mapping, then SMAA and a subtle vignette, on half-float buffers. The renderer itself
 * has antialiasing, stencil and tone mapping off; snapshots skip the composer and switch the renderer's own
 * tone mapping on while they render (snapshots.ts).
 */
import * as THREE from 'three';
import { N8AOPostPass } from 'n8ao';
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
  type Pass,
} from 'postprocessing';
import type { TierSettings } from './quality';

/** ACES keeps the prototype's tuned colours (AgX desaturated the red seats and the golden light). */
export const TONE_MAPPING = THREE.ACESFilmicToneMapping;
export const EXPOSURE = 0.92;
/** Linear luminance above which pixels bloom: above sunlit white surfaces (about 3.3 for the roof at golden
 * hour), below the night-time emissives (lighting.ts). */
export const BLOOM_THRESHOLD = 4.5;

export class PostPipeline {
  readonly composer: EffectComposer;
  /** The bloom of the current configuration (null on Low); lighting presets tune its intensity. */
  bloom: BloomEffect | null = null;
  private passes: Pass[] = [];
  private key = '';

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
  ) {
    this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
  }

  /** (Re)builds the passes for a tier: bloom from Medium, ambient occlusion on High. */
  configure(tier: TierSettings) {
    const key = `${tier.bloom}:${tier.ao}`;
    if (key === this.key) return;
    this.key = key;
    this.composer.removeAllPasses();
    // An EffectPass disposes its effects with it.
    for (const p of this.passes) p.dispose();
    this.passes = [];

    this.passes.push(new RenderPass(this.scene, this.camera));
    if (tier.ao) {
      const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      const ao = new N8AOPostPass(this.scene, this.camera, size.x, size.y);
      ao.configuration.aoRadius = 2.2;
      ao.configuration.distanceFalloff = 1.2;
      ao.configuration.intensity = 2.2;
      ao.configuration.halfRes = true;
      ao.configuration.gammaCorrection = false;
      ao.setQualityMode('Medium');
      this.passes.push(ao);
    }
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    this.bloom = tier.bloom
      ? new BloomEffect({
          luminanceThreshold: BLOOM_THRESHOLD,
          luminanceSmoothing: 0.6,
          intensity: 1.1,
          mipmapBlur: true,
          radius: 0.62,
        })
      : null;
    this.passes.push(
      this.bloom ? new EffectPass(this.camera, this.bloom, tone) : new EffectPass(this.camera, tone),
      new EffectPass(
        this.camera,
        new SMAAEffect({ preset: SMAAPreset.MEDIUM }),
        new VignetteEffect({ offset: 0.34, darkness: 0.32 }),
      ),
    );
    for (const p of this.passes) this.composer.addPass(p);
  }

  setSize(width: number, height: number) {
    this.composer.setSize(width, height, false);
  }

  render(dt: number) {
    this.composer.render(dt);
  }

  dispose() {
    this.composer.removeAllPasses();
    for (const p of this.passes) p.dispose();
    this.passes = [];
    this.bloom = null;
    this.composer.dispose();
  }
}
