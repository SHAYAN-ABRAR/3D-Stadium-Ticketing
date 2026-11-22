/**
 * Snapshots of a view (prototype: snap, runSnaps). They skip the post-processing composer: the renderer's
 * own tone mapping is switched on while they render into a scissored corner of the main canvas, at the
 * tier's scale (2x on High), and the corner is copied out with drawImage in the same task (no
 * preserveDrawingBuffer needed); canvasToJpeg then downsamples the copy. On High the scene first renders
 * into a render target with depth, and a small pass adds a gentle depth of field while it tone-maps onto
 * the canvas. Seats switch to clean colours while snapshots render.
 */
import * as THREE from 'three';
import type { Pose } from './camera';
import { TONE_MAPPING } from './post';
import type { World } from './world/scene';
import type { NearSeats } from './near';

interface Job {
  pose: Pose;
  w: number;
  h: number;
  resolve: (c: HTMLCanvasElement) => void;
}

export interface SnapshotOptions {
  /** Render at this multiple of the requested size (capped by the canvas). */
  scale: number;
  /** Gentle depth of field (High). */
  dof: boolean;
  before?: () => void;
  after?: () => void;
}

const DOF_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/** Gather depth of field: 24 taps on a golden-angle spiral, weighted by each sample's own blur. */
const DOF_FRAGMENT = /* glsl */ `
#include <common>
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform float uNear;
uniform float uFar;
uniform float uFocus;
uniform float uAperture;
uniform float uMaxBlur;
varying vec2 vUv;
float viewZ(float d) {
  float z = d * 2.0 - 1.0;
  return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear));
}
// Explicit LOD 0: the targets have no mipmaps, and implicit derivatives are undefined inside the loop.
float coc(vec2 uv) {
  float z = viewZ(textureLod(tDepth, uv, 0.0).x);
  return min(abs(1.0 / uFocus - 1.0 / z) * uAperture, uMaxBlur);
}
void main() {
  float c0 = coc(vUv);
  vec3 sum = textureLod(tColor, vUv, 0.0).rgb;
  float wsum = 1.0;
  for (int i = 0; i < 24; i++) {
    float r = sqrt((float(i) + 0.5) / 24.0) * max(c0, 0.001);
    float a = float(i) * 2.39996323;
    vec2 uv = vUv + vec2(cos(a), sin(a)) * r * uTexel;
    float cs = coc(uv);
    float w = smoothstep(r - 0.5, r + 0.5, max(cs, c0 * 0.5));
    sum += textureLod(tColor, uv, 0.0).rgb * w;
    wsum += w;
  }
  gl_FragColor = vec4(sum / wsum, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Snapshotter {
  private queue: Job[] = [];
  private readonly cam = new THREE.PerspectiveCamera(55, 1.6, 0.05, 16000);
  private dof: {
    target: THREE.WebGLRenderTarget;
    material: THREE.ShaderMaterial;
    scene: THREE.Scene;
    camera: THREE.Camera;
  } | null = null;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private world: World,
    private near: NearSeats,
  ) {}

  get pending() {
    return this.queue.length > 0;
  }

  request(pose: Pose, w: number, h: number): Promise<HTMLCanvasElement> {
    return new Promise((resolve) => this.queue.push({ pose, w, h, resolve }));
  }

  /** Renders every queued snapshot. Call inside the frame, before the main render. */
  run(cssW: number, cssH: number, o: SnapshotOptions = { scale: 1, dof: false }) {
    if (!this.queue.length) return;
    const { renderer, world } = this;
    const seats = world.seats,
      geo = seats.geometry,
      liveColor = seats.instanceColor,
      liveGlow = world.seatGlow;
    seats.instanceColor = world.cleanColor;
    geo.setAttribute('aGlow', world.zeroGlow);
    this.near.useClean(true);
    o.before?.();
    const toneMapping = renderer.toneMapping;
    renderer.toneMapping = TONE_MAPPING;
    const canvas = renderer.domElement,
      pr = renderer.getPixelRatio();
    for (const q of this.queue.splice(0)) {
      // Device pixels: at least `scale` x the requested size, within the canvas, keeping the aspect.
      let dw = Math.round(q.w * Math.max(pr, o.scale)),
        dh = Math.round((dw * q.h) / q.w);
      const fit = Math.min(1, canvas.width / dw, canvas.height / dh);
      dw = Math.max(1, Math.floor(dw * fit));
      dh = Math.max(1, Math.floor(dh * fit));
      const w = dw / pr,
        h = dh / pr;
      const p = q.pose,
        cam = this.cam;
      cam.fov = p.fov;
      cam.near = p.near;
      cam.aspect = dw / dh;
      cam.updateProjectionMatrix();
      cam.position.copy(p.pos);
      cam.lookAt(p.look);
      cam.updateMatrixWorld();
      renderer.setScissorTest(true);
      renderer.setScissor(0, 0, w, h);
      renderer.setViewport(0, 0, w, h);
      if (o.dof) this.renderWithDof(dw, dh, p);
      else renderer.render(world.scene, cam);
      const out = document.createElement('canvas');
      out.width = dw;
      out.height = dh;
      out.getContext('2d')!.drawImage(canvas, 0, canvas.height - dh, dw, dh, 0, 0, dw, dh);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, cssW, cssH);
      q.resolve(out);
    }
    renderer.toneMapping = toneMapping;
    o.after?.();
    seats.instanceColor = liveColor;
    geo.setAttribute('aGlow', liveGlow);
    this.near.useClean(false);
  }

  /** Scene into a render target with depth, then depth of field + tone mapping into the canvas corner. */
  private renderWithDof(dw: number, dh: number, p: Pose) {
    const { renderer, world, cam } = this;
    const d = this.ensureDof(dw, dh);
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(d.target);
    renderer.render(world.scene, cam);
    renderer.setRenderTarget(prev);
    const u = d.material.uniforms;
    u.uTexel.value.set(1 / dw, 1 / dh);
    u.uNear.value = cam.near;
    u.uFar.value = cam.far;
    // Focus on the pitch; the rows just in front blur a little (in device pixels, at the snapshot's scale).
    u.uFocus.value = Math.max(20, p.pos.distanceTo(new THREE.Vector3(0, 0.5, 0)));
    u.uAperture.value = 6 * (dw / 640);
    u.uMaxBlur.value = 4 * (dw / 640);
    renderer.render(d.scene, d.camera);
  }

  private ensureDof(dw: number, dh: number) {
    if (!this.dof) {
      const target = new THREE.WebGLRenderTarget(dw, dh, {
        type: THREE.HalfFloatType,
        depthTexture: new THREE.DepthTexture(dw, dh),
      });
      const material = new THREE.ShaderMaterial({
        vertexShader: DOF_VERTEX,
        fragmentShader: DOF_FRAGMENT,
        uniforms: {
          tColor: { value: target.texture },
          tDepth: { value: target.depthTexture },
          uTexel: { value: new THREE.Vector2() },
          uNear: { value: 0.05 },
          uFar: { value: 16000 },
          uFocus: { value: 70 },
          uAperture: { value: 6 },
          uMaxBlur: { value: 4 },
        },
        depthTest: false,
        depthWrite: false,
      });
      const scene = new THREE.Scene();
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
      quad.frustumCulled = false;
      scene.add(quad);
      this.dof = { target, material, scene, camera: new THREE.Camera() };
    } else if (this.dof.target.width !== dw || this.dof.target.height !== dh) {
      this.dof.target.setSize(dw, dh);
    }
    return this.dof;
  }

  dispose() {
    if (!this.dof) return;
    this.dof.target.depthTexture?.dispose();
    this.dof.target.dispose();
    this.dof.material.dispose();
    (this.dof.scene.children[0] as THREE.Mesh).geometry.dispose();
    this.dof = null;
  }
}

/** Downsamples a snapshot canvas to exactly w x h (cover) and encodes it as JPEG. */
export function canvasToJpeg(src: HTMLCanvasElement, w: number, h: number, quality = 0.8): Promise<Blob> {
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const s = Math.max(w / src.width, h / src.height),
    sw = w / s,
    sh = h / s;
  ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, w, h);
  return new Promise((resolve, reject) =>
    out.toBlob((b) => (b ? resolve(b) : reject(new Error('JPEG encoding failed'))), 'image/jpeg', quality),
  );
}
