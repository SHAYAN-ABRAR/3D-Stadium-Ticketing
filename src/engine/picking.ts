/**
 * Picking (prototype: pickStand, setupPick, gpuPick, pickVip).
 * - Stands, from far away: march the pointer ray against the bowl's height profile.
 * - Blocks and seats: GPU id picking. Every seat is drawn with its index as a colour into a 1x1 render
 *   target; the 1x1 window is composed with the UI framing view offset (pitfall 8).
 * - VIP chairs: raycasting against the interior's chairs.
 */
import * as THREE from 'three';
import { bowlHeight, FACADE, ROOF, planInverse, standOf } from '@/lib/stadium';
import type { CameraRig } from './camera';
import type { World } from './world/scene';
import type { BoxInterior } from './world/interior';

const PICK_VERTEX = `attribute float aPickId; varying vec3 vC;
void main(){
  float id = aPickId + 1.0;
  vC = vec3(mod(id, 256.0), mod(floor(id / 256.0), 256.0), floor(id / 65536.0)) / 255.0;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const PICK_FRAGMENT = 'varying vec3 vC; void main(){ gl_FragColor = vec4(vC, 1.0); }';

/** Ray-marches the bowl from far away. Returns the stand index or -1. */
export function pickStand(ray: THREE.Ray): number {
  const o = ray.origin,
    d = ray.direction;
  let t = 0;
  if (o.y > 66) {
    if (d.y >= -1e-4) return -1;
    t = (o.y - 66) / -d.y;
  }
  for (let i = 0; i < 1500; i++, t += 1.1) {
    const px = o.x + d.x * t,
      py = o.y + d.y * t,
      pz = o.z + d.z * t;
    if (py < -0.5) return -1;
    const q = planInverse(px, pz),
      off = q.d;
    if (off > 67) continue;
    if (off >= ROOF.d0 && py <= ROOF.yIn + 0.2 && py >= ROOF.yOut - 1.2) return standOf(q.s);
    if (off >= FACADE.d - 0.6 && py < 53.2) return standOf(q.s);
    if (off >= -0.6 && py <= bowlHeight(off) + 0.8) return standOf(q.s);
    if (off < -0.6 && py <= 0.3) return -1;
  }
  return -1;
}

export class GpuPicker {
  private scene = new THREE.Scene();
  private target = new THREE.WebGLRenderTarget(1, 1);
  private buf = new Uint8Array(4);
  private prevClear = new THREE.Color();
  private materials: THREE.Material[] = [];
  /** Milliseconds the last pick took (for the debug overlay). */
  lastMs = 0;

  constructor(world: World) {
    const mat = new THREE.ShaderMaterial({ vertexShader: PICK_VERTEX, fragmentShader: PICK_FRAGMENT });
    this.materials.push(mat);
    // Shares geometry and instance matrices with the visible seats (near seats swapped out are hidden here too).
    const seats = new THREE.InstancedMesh(world.seats.geometry, mat, world.layout.bowlSeatCount);
    seats.instanceMatrix = world.seats.instanceMatrix;
    seats.frustumCulled = false;
    this.scene.add(seats);
    // Wheelchair spaces are platforms, picked through their own instances and seat ids.
    const wc = world.wheelchair.platform;
    const wcPick = new THREE.InstancedMesh(wc.geometry, mat, wc.count);
    wcPick.instanceMatrix = wc.instanceMatrix;
    wcPick.count = wc.count;
    wcPick.frustumCulled = false;
    this.scene.add(wcPick);
    // Occluders: tiers and roof in black, so seats hidden behind them can't be picked.
    const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
    this.materials.push(black);
    for (const t of world.tierMeshes) this.scene.add(new THREE.Mesh(t.geometry, black));
    this.scene.add(new THREE.Mesh(world.roofMesh.geometry, black));
  }

  /** Seat index under the pointer (CSS pixels), or -1. Call at most once per frame (pitfall 15). */
  pick(renderer: THREE.WebGLRenderer, rig: CameraRig, x: number, y: number): number {
    const t0 = performance.now();
    const { camera, vo } = rig;
    camera.setViewOffset(vo.fw, vo.fh, vo.x + Math.floor(x), vo.y + Math.floor(y), 1, 1);
    const prevTarget = renderer.getRenderTarget();
    renderer.getClearColor(this.prevClear);
    const prevAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.render(this.scene, camera);
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(this.prevClear, prevAlpha);
    camera.setViewOffset(vo.fw, vo.fh, vo.x, vo.y, rig.cssW, rig.cssH);
    renderer.readRenderTargetPixels(this.target, 0, 0, 1, 1, this.buf);
    this.lastMs = performance.now() - t0;
    return this.buf[0] + this.buf[1] * 256 + this.buf[2] * 65536 - 1;
  }

  dispose() {
    this.target.dispose();
    for (const m of this.materials) m.dispose();
  }
}

const raycaster = new THREE.Raycaster();

/** VIP chair (0-7) under the pointer, or -1. */
export function pickVip(rig: CameraRig, interior: BoxInterior | null, x: number, y: number): number {
  if (!interior) return -1;
  rig.rayAt(x, y, raycaster);
  const hits = raycaster.intersectObjects(interior.chairs, true);
  if (!hits.length) return -1;
  let o: THREE.Object3D | null = hits[0].object;
  while (o && o.userData.chair === undefined) o = o.parent;
  return o ? (o.userData.chair as number) : -1;
}

export { raycaster as sharedRaycaster };
