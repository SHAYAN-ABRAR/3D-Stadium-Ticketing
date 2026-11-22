/**
 * Skybox interior, built on demand for the box the visitor flies into (prototype: buildBoxInterior).
 * Stepped floor (sightlines over the tier in front, pitfall 9), eight lounge chairs in two rows, a bar on
 * the back step, a TV, ceiling lights and mullions. No rail at seated eye height (pitfall 10).
 */
import * as THREE from 'three';
import { SKY } from '@/lib/stadium/params';
import { VIP_CHAIRS, type BoxInfo } from '@/lib/stadium/layout';
import { mergeFlat, roundedBox } from './geometry';

const PI = Math.PI;

export interface BoxInterior {
  boxIndex: number;
  group: THREE.Group;
  chairs: THREE.Group[];
  chairMaterials: THREE.MeshStandardMaterial[];
  /** Box-local to world. */
  frame: THREE.Matrix4;
  toWorld: (x: number, y: number, z: number) => THREE.Vector3;
  dispose: () => void;
}

/** Box frame: local x along the glass, y up, z back from the glass (away from the pitch). */
export function boxFrame(box: BoxInfo): THREE.Matrix4 {
  const [nx, nz] = box.normal;
  const n = new THREE.Vector3(nx, 0, nz),
    t = new THREE.Vector3(-nz, 0, nx);
  return new THREE.Matrix4()
    .makeBasis(t.clone().negate(), new THREE.Vector3(0, 1, 0), n)
    .setPosition(box.origin[0], box.origin[1], box.origin[2]);
}

let chairGeometry: THREE.BufferGeometry | null = null;

/** One merged lounge chair (seat, back, arms, base), shared by every interior. */
function loungeChairGeometry(): THREE.BufferGeometry {
  if (chairGeometry) return chairGeometry;
  const parts = [
    [0.7, 0.2, 0.62, 0.06, 0, 0.47, 0, 0],
    [0.7, 0.54, 0.16, 0.06, 0, 0.8, 0.3, 0.12],
    [0.12, 0.3, 0.64, 0.05, 0.38, 0.62, 0.02, 0],
    [0.12, 0.3, 0.64, 0.05, -0.38, 0.62, 0.02, 0],
    [0.44, 0.36, 0.44, 0.04, 0, 0.18, 0.02, 0],
  ];
  const boxes = parts.map((p) => {
    const b = roundedBox(p[0], p[1], p[2], p[3]);
    b.rotateX(p[7]);
    b.translate(p[4], p[5], p[6]);
    return b;
  });
  chairGeometry = mergeFlat(boxes);
  chairGeometry.computeBoundingSphere();
  for (const b of boxes) b.dispose();
  return chairGeometry;
}

export function buildBoxInterior(
  box: BoxInfo,
  shared: { screen: THREE.Texture; boxLight: THREE.PointLight },
): BoxInterior {
  const g = new THREE.Group(),
    frame = boxFrame(box);
  g.matrixAutoUpdate = false;
  g.matrix.copy(frame);
  const owned: { geo: THREE.BufferGeometry[]; mat: THREE.Material[] } = { geo: [], mat: [] };
  const hw = box.width / 2 - 0.12;
  const M = (c: string, extra: THREE.MeshStandardMaterialParameters = {}) => {
    const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...extra });
    owned.mat.push(m);
    return m;
  };
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    owned.geo.push(geo);
    const o = new THREE.Mesh(geo, mat);
    o.position.set(x, y, z);
    o.receiveShadow = true;
    g.add(o);
    return o;
  };
  const carpet = M('#2c2a2a', { roughness: 0.95 }),
    wood = M('#6e4a30', { roughness: 0.5 }),
    marble = M('#f1eee8', { roughness: 0.25 });
  add(new THREE.BoxGeometry(hw * 2, 0.04, 5.9), carpet, 0, 0.02, 3.0);
  const stepMat = M('#3a3634', { roughness: 0.9 });
  add(new THREE.BoxGeometry(hw * 2, 0.5, 3.95), stepMat, 0, 0.25, 4.025);
  add(new THREE.BoxGeometry(hw * 2, 0.5, 2.25), stepMat, 0, 0.75, 4.875);
  const steel = M('#2a2e33', { metalness: 0.6, roughness: 0.35 });
  for (const x of [-hw + 0.06, hw - 0.06])
    add(new THREE.BoxGeometry(0.1, SKY.h, 0.12), steel, x, SKY.h / 2, 0.22);
  add(new THREE.BoxGeometry(hw * 2, 0.12, 0.14), steel, 0, SKY.h - 0.06, 0.22);
  add(new THREE.BoxGeometry(4.2, 1.0, 0.6), wood, 0, 1.0 + 0.5, 5.55);
  add(new THREE.BoxGeometry(4.4, 0.06, 0.72), marble, 0, 1.0 + 1.03, 5.55);
  const tvMat = new THREE.MeshBasicMaterial({ map: shared.screen, toneMapped: false });
  owned.mat.push(tvMat);
  const tv = add(new THREE.PlaneGeometry(1.5, 0.84), tvMat, 0, 2.72, 5.96);
  tv.rotation.y = PI;
  const lamp = new THREE.MeshBasicMaterial({ color: '#fff4dc' });
  owned.mat.push(lamp);
  for (const lx of [-2.2, 0, 2.2])
    for (const lz of [1.6, 4.2]) {
      const d = add(new THREE.CircleGeometry(0.16, 16), lamp, lx, SKY.h - 0.02, lz);
      d.rotation.x = PI / 2;
    }

  // Eight lounge chairs: two rows of four, the second on the first step.
  const chairs: THREE.Group[] = [],
    chairMaterials: THREE.MeshStandardMaterial[] = [];
  const geo = loungeChairGeometry();
  VIP_CHAIRS.forEach((c, k) => {
    const s = new THREE.Group(),
      mat = M('#2b2523', { roughness: 0.4 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    s.add(mesh);
    s.position.set(c.x, c.y, c.z);
    s.userData = { chair: k };
    g.add(s);
    chairs.push(s);
    chairMaterials.push(mat);
  });

  // The shared point light moves into this box (lights are never added or removed: pitfall 7).
  shared.boxLight.position.set(0, 3.0, 2.8);
  g.add(shared.boxLight);
  g.updateMatrixWorld(true);
  const toWorld = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(frame);
  return {
    boxIndex: box.index,
    group: g,
    chairs,
    chairMaterials,
    frame,
    toWorld,
    dispose: () => {
      for (const x of owned.geo) x.dispose();
      for (const m of owned.mat) m.dispose();
    },
  };
}
