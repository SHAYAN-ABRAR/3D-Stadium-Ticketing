/**
 * Close to the camera, the nearest seats swap to a detailed molded seat (prototype: setupNear, nearSeats).
 * The seat you sit in is hidden (pitfall 11).
 */
import * as THREE from 'three';
import { brand } from '@/config/brand';
import { SeatFlag } from '@/lib/stadium';
import type { World } from './world/scene';
import { addCloudShadows } from './world/shading';

const NEAR_MAX = 900;
const RADIUS2 = 9.5 * 9.5;

export class NearSeats {
  readonly mesh: THREE.InstancedMesh;
  private idx: number[] = [];
  private readonly live: Float32Array;
  private readonly clean: Float32Array;

  constructor(
    private world: World,
    private displayMatrices: Float32Array,
  ) {
    const material = new THREE.MeshStandardMaterial({ roughness: 0.34, metalness: 0, envMapIntensity: 0.9 });
    addCloudShadows(material, world.ambient);
    this.mesh = new THREE.InstancedMesh(world.detailSeat, material, NEAR_MAX);
    this.live = new Float32Array(NEAR_MAX * 3);
    this.clean = new Float32Array(NEAR_MAX * 3);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(this.live, 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    world.scene.add(this.mesh);
  }

  /** Swaps the seats near `eye` (in front of `dir`) to the detailed model. eye = null restores all. */
  update(eye: THREE.Vector3 | null, dir: THREE.Vector3 | null, hide: number, selected: Uint8Array) {
    const M = this.world.seats.instanceMatrix,
      arr = M.array as Float32Array,
      src = this.world.layout;
    for (const i of this.idx) {
      arr.set(this.displayMatrices.subarray(i * 16, i * 16 + 16), i * 16);
      M.addUpdateRange(i * 16, 16);
    }
    this.idx = [];
    let k = 0;
    if (eye) {
      const p = src.positions,
        base = this.world.seatBase,
        nm = this.mesh.instanceMatrix.array as Float32Array,
        raw = this.world.seatMatrices,
        pick = new THREE.Color(this.pickHex);
      for (let i = 0; i < src.bowlSeatCount && k < NEAR_MAX; i++) {
        const dx = p[i * 3] - eye.x,
          dy = p[i * 3 + 1] - eye.y,
          dz = p[i * 3 + 2] - eye.z;
        if (dx * dx + dy * dy + dz * dz > RADIUS2 || (dir && dx * dir.x + dz * dir.z < -1.2)) continue;
        if (src.flags[i] & SeatFlag.Wheelchair) continue;
        this.idx.push(i);
        for (const j of [0, 1, 2, 4, 5, 6, 8, 9, 10]) arr[i * 16 + j] = 0;
        M.addUpdateRange(i * 16, 16);
        if (i === hide) continue;
        nm.set(raw.subarray(i * 16, i * 16 + 16), k * 16);
        const sel = selected[i] === 1;
        this.live[k * 3] = sel ? pick.r : base[i * 3];
        this.live[k * 3 + 1] = sel ? pick.g : base[i * 3 + 1];
        this.live[k * 3 + 2] = sel ? pick.b : base[i * 3 + 2];
        this.clean[k * 3] = base[i * 3];
        this.clean[k * 3 + 1] = base[i * 3 + 1];
        this.clean[k * 3 + 2] = base[i * 3 + 2];
        k++;
      }
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
    M.needsUpdate = true;
  }

  /** Recolours the swapped seats after the selection changed. */
  recolor(selected: Uint8Array, hide: number) {
    const base = this.world.seatBase,
      pick = new THREE.Color(this.pickHex);
    let k = 0;
    for (const i of this.idx) {
      if (i === hide) continue;
      const sel = selected[i] === 1;
      this.live[k * 3] = sel ? pick.r : base[i * 3];
      this.live[k * 3 + 1] = sel ? pick.g : base[i * 3 + 1];
      this.live[k * 3 + 2] = sel ? pick.b : base[i * 3 + 2];
      k++;
    }
    this.mesh.instanceColor!.needsUpdate = true;
  }

  /** Snapshots show clean colours (no orange): swaps the colour data in and out. */
  useClean(clean: boolean) {
    const attr = this.mesh.instanceColor!;
    (attr as THREE.InstancedBufferAttribute).array = clean ? this.clean : this.live;
    attr.needsUpdate = true;
  }

  get active() {
    return this.idx.length > 0;
  }

  private readonly pickHex = brand.colors.pick;

  dispose() {
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
