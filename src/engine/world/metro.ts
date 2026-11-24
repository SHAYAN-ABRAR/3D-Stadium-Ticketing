/**
 * MRT Line 6 east of the stadium (city-data.ts has its line): the viaduct on single piers with hammerhead
 * caps, Mirpur 10 station (platform slab under a curved roof, the concourse below it, stair towers down to
 * the plaza and its name in Bengali and English), and two six-car trains, one each way. A train runs in from
 * beyond the fog, slows down, stops at the station, waits, and pulls away; at night its windows and the
 * station are lit. With ambient animation off (tests, reduced motion, Low) the trains stand still: one at the
 * platform, the other far up the line.
 */
import * as THREE from 'three';
import { METRO } from './city-data';
import { canvasTexture, type DrawnTexture } from './textures';
import { addCloudShadows, type AmbientUniforms } from './shading';

const CAR_L = 21.6,
  CAR_GAP = 0.6,
  CARS = 6,
  CAR_W = 3.1,
  CAR_H = 3.8;
const TRAIN_L = CARS * CAR_L + (CARS - 1) * CAR_GAP;
/** Track centrelines either side of the viaduct's middle. */
const TRACK = 2.15;
const CRUISE = 24,
  ACCEL = 1.0,
  BRAKE = 1.0,
  DWELL = 22,
  /** Seconds a train waits beyond the end of the line before it comes back. */
  TURN = 26;
const BASE = -0.6;

export interface Metro {
  group: THREE.Group;
  /** 0 by day, 1 at night: lit windows, station lights and its sign (the lighting rig sets it). */
  setNight(n: number): void;
  /** Moves the trains (only while ambient animation runs). */
  update(dt: number, animate: boolean): void;
  dispose(): void;
}

interface Train {
  /** +1 runs south (towards +z) on the east track, -1 runs north on the west track. */
  dir: 1 | -1;
  /** z of the train's middle. */
  z: number;
  v: number;
  state: 'run' | 'dwell' | 'turn';
  wait: number;
  /** Where it stops next (the station, then the end of the line). */
  stopped: boolean;
}

function sideTexture(): DrawnTexture {
  return canvasTexture(512, 96, (x, w, h) => {
    x.fillStyle = '#eef0ee';
    x.fillRect(0, 0, w, h);
    // window band with darker windows, doors at four places
    x.fillStyle = '#2b3138';
    x.fillRect(0, h * 0.22, w, h * 0.36);
    x.fillStyle = '#1a1f24';
    for (let i = 0; i < 9; i++) x.fillRect(16 + i * 56, h * 0.25, 40, h * 0.3);
    x.fillStyle = '#c9cdcf';
    for (const d of [0.12, 0.37, 0.62, 0.87]) x.fillRect(w * d - 13, h * 0.2, 26, h * 0.72);
    // the line's stripes: red, then green
    x.fillStyle = '#c8102e';
    x.fillRect(0, h * 0.64, w, h * 0.07);
    x.fillStyle = '#006a4e';
    x.fillRect(0, h * 0.73, w, h * 0.09);
    x.fillStyle = 'rgba(0,0,0,0.25)';
    x.fillRect(0, h * 0.95, w, h * 0.05);
  });
}

/** The lit windows at night (emissive map): the window band only. */
function sideGlowTexture(): DrawnTexture {
  return canvasTexture(512, 96, (x, w, h) => {
    x.fillStyle = '#000000';
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#fff4dc';
    for (let i = 0; i < 9; i++) x.fillRect(16 + i * 56, h * 0.25, 40, h * 0.3);
  });
}

function endTexture(): DrawnTexture {
  return canvasTexture(128, 160, (x, w, h) => {
    x.fillStyle = '#eef0ee';
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#1b2026';
    x.fillRect(w * 0.1, h * 0.14, w * 0.8, h * 0.36);
    x.fillStyle = '#c8102e';
    x.fillRect(0, h * 0.62, w, h * 0.06);
    x.fillStyle = '#006a4e';
    x.fillRect(0, h * 0.7, w, h * 0.08);
    x.fillStyle = '#fffbe8';
    x.fillRect(w * 0.12, h * 0.55, w * 0.16, h * 0.05);
    x.fillRect(w * 0.72, h * 0.55, w * 0.16, h * 0.05);
  });
}

/** The station's name, as on Dhaka's MRT signs: Bengali over English, white on green. */
function signTexture(): DrawnTexture {
  return canvasTexture(1024, 192, (x, w, h) => {
    x.fillStyle = '#0d5c3f';
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#ffffff';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = `700 ${h * 0.4}px "Noto Sans Bengali", "Nirmala UI", "Bangla Sangam MN", sans-serif`;
    x.fillText('মিরপুর-১০', w / 2, h * 0.3);
    x.font = `700 ${h * 0.3}px "Barlow Condensed", "Arial Narrow", Arial, sans-serif`;
    x.fillText('MIRPUR 10', w / 2, h * 0.73);
  });
}

export function buildMetro(amb: AmbientUniforms): Metro {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const concrete = new THREE.MeshStandardMaterial({ color: '#c9c6bf', roughness: 0.85 });
  const darker = new THREE.MeshStandardMaterial({ color: '#8f8c86', roughness: 0.9 });
  addCloudShadows(concrete, amb);
  addCloudShadows(darker, amb);
  const X = METRO.x,
    Y = METRO.deckY,
    H = METRO.half;
  const st = { z0: METRO.stationZ - METRO.stationLength / 2, z1: METRO.stationZ + METRO.stationLength / 2 };

  /* the deck, its parapets and the track bed */
  {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(9, 1.7, H * 2), concrete);
    deck.position.set(X, Y - 0.85, 0);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(8, 0.1, H * 2), darker);
    bed.position.set(X, Y + 0.05, 0);
    group.add(deck, bed);
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.25, H * 2), concrete);
      p.position.set(X + s * 4.35, Y + 0.62, 0);
      group.add(p);
    }
  }

  /* piers with hammerhead caps, every 34 m (the station stands on its own frame) */
  {
    const zs: number[] = [];
    for (let z = -H + 17; z < H; z += 34) if (z < st.z0 - 12 || z > st.z1 + 12) zs.push(z);
    const pierH = Y - 1.7 - 1.3 - BASE;
    const piers = new THREE.InstancedMesh(new THREE.BoxGeometry(2.1, pierH, 2.5), concrete, zs.length);
    const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(8.8, 1.3, 2.9), concrete, zs.length);
    const m = new THREE.Matrix4();
    zs.forEach((z, i) => {
      piers.setMatrixAt(i, m.makeTranslation(X, BASE + pierH / 2, z));
      caps.setMatrixAt(i, m.makeTranslation(X, Y - 1.7 - 0.65, z));
    });
    for (const mesh of [piers, caps]) {
      mesh.frustumCulled = false;
      group.add(mesh);
    }
  }

  /* Mirpur 10 station */
  const stationLights: THREE.MeshBasicMaterial[] = [];
  let concourseGlass: THREE.MeshStandardMaterial | null = null;
  const sign = signTexture();
  disposables.push(sign.texture);
  {
    const L = METRO.stationLength,
      Z = METRO.stationZ;
    const white = new THREE.MeshStandardMaterial({ color: '#eef0ef', roughness: 0.55 });
    const glass = new THREE.MeshStandardMaterial({ color: '#365a63', roughness: 0.15, metalness: 0.4 });
    const green = new THREE.MeshStandardMaterial({ color: '#0d5c3f', roughness: 0.6 });
    for (const mtl of [white, glass, green]) addCloudShadows(mtl, amb);
    const add = (g: THREE.BufferGeometry, mtl: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(g, mtl);
      mesh.position.set(x, y, z);
      group.add(mesh);
      return mesh;
    };
    // platform slab, concourse box below it (glazed), and columns down to the plaza
    add(new THREE.BoxGeometry(24, 1.4, L), concrete, X, Y - 0.7, Z);
    add(new THREE.BoxGeometry(23, 4.6, L * 0.55), glass, X, 7.2, Z);
    add(new THREE.BoxGeometry(23.4, 0.8, L * 0.55 + 0.4), white, X, 9.9, Z);
    add(new THREE.BoxGeometry(23.4, 0.8, L * 0.55 + 0.4), white, X, 4.6, Z);
    const cols: number[] = [];
    for (let z = Z - L / 2 + 8; z <= Z + L / 2 - 8; z += 16) cols.push(z);
    const colMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.4, Y - 1.4, 1.4),
      concrete,
      cols.length * 2,
    );
    const m = new THREE.Matrix4();
    cols.forEach((z, i) => {
      colMesh.setMatrixAt(i * 2, m.makeTranslation(X - 8.5, (Y - 1.4) / 2, z));
      colMesh.setMatrixAt(i * 2 + 1, m.makeTranslation(X + 8.5, (Y - 1.4) / 2, z));
    });
    colMesh.frustumCulled = false;
    group.add(colMesh);
    // platform walls (screen doors) and the curved roof on slender posts
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(0.4, 1.6, L - 6), green, X + s * 11.6, Y + 0.8, Z);
      const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.45, 6.2, 0.45), white, cols.length);
      cols.forEach((z, i) => posts.setMatrixAt(i, m.makeTranslation(X + s * 11.4, Y + 3.1, z)));
      posts.frustumCulled = false;
      group.add(posts);
    }
    // A flattened arc of a cylinder: its axis turned to run along the platform, the arc on top. Its edges
    // rest on the posts.
    const roof = new THREE.CylinderGeometry(15, 15, L + 6, 24, 1, true, -Math.PI * 0.36, Math.PI * 0.72);
    roof.rotateX(-Math.PI / 2);
    const roofMat = new THREE.MeshStandardMaterial({
      color: '#f4f5f3',
      roughness: 0.5,
      side: THREE.DoubleSide,
    });
    addCloudShadows(roofMat, amb);
    const roofMesh = new THREE.Mesh(roof, roofMat);
    roofMesh.scale.set(1, 0.42, 1);
    roofMesh.position.set(X, Y + 6.2 - 15 * 0.42 * Math.cos(Math.PI * 0.36), Z);
    group.add(roofMesh);
    // lights under the roof (they glow at night), and the concourse's glazing lit warm from inside
    for (const s of [-1, 1]) {
      const lm = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff3d6') });
      stationLights.push(lm);
      add(new THREE.BoxGeometry(0.4, 0.15, L - 10), lm, X + s * 7, Y + 5.6, Z);
    }
    glass.emissive.set('#ffd9a0');
    concourseGlass = glass;
    // stair towers down to the plaza, two each side
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const tz = Z + sz * (L * 0.27 + 7);
        add(new THREE.BoxGeometry(6, 9.4, 11), white, X + sx * 16, 4.7, tz);
        add(new THREE.BoxGeometry(7, 0.5, 12.5), green, X + sx * 16, 9.65, tz);
      }
    // the name on both sides of the concourse
    for (const s of [-1, 1]) {
      const sm = new THREE.MeshBasicMaterial({ map: sign.texture, toneMapped: true });
      stationLights.push(sm);
      const p = add(new THREE.PlaneGeometry(14, 2.6), sm, X + s * 11.72, 11.6, Z);
      p.rotation.y = (s * Math.PI) / 2;
    }
  }

  /* trains: 12 cars, one instanced mesh with side, roof and end materials */
  const side = sideTexture(),
    glow = sideGlowTexture(),
    end = endTexture();
  disposables.push(side.texture, glow.texture, end.texture);
  const sideMat = new THREE.MeshStandardMaterial({
    map: side.texture,
    emissiveMap: glow.texture,
    emissive: new THREE.Color('#ffffff'),
    emissiveIntensity: 0,
    roughness: 0.4,
    metalness: 0.25,
  });
  const carRoofMat = new THREE.MeshStandardMaterial({ color: '#d9dcdb', roughness: 0.5, metalness: 0.3 });
  const endMat = new THREE.MeshStandardMaterial({
    map: end.texture,
    roughness: 0.4,
    emissive: new THREE.Color('#ffffff'),
    emissiveMap: end.texture,
    emissiveIntensity: 0,
  });
  for (const mtl of [sideMat, carRoofMat, endMat]) addCloudShadows(mtl, amb);
  // Box faces: +x, -x, +y, -y, +z, -z.
  const carGeo = new THREE.BoxGeometry(CAR_W, CAR_H, CAR_L);
  const cars = new THREE.InstancedMesh(
    carGeo,
    [sideMat, sideMat, carRoofMat, carRoofMat, endMat, endMat],
    CARS * 2,
  );
  cars.frustumCulled = false;
  group.add(cars);

  const trains: Train[] = [
    { dir: 1, z: METRO.stationZ, v: 0, state: 'dwell', wait: DWELL * 0.6, stopped: true },
    { dir: -1, z: H * 0.62, v: CRUISE, state: 'run', wait: 0, stopped: false },
  ];
  const m = new THREE.Matrix4();
  const place = () => {
    trains.forEach((t, ti) => {
      const x = X + t.dir * TRACK;
      for (let k = 0; k < CARS; k++) {
        const z = t.z + (k - (CARS - 1) / 2) * (CAR_L + CAR_GAP);
        m.makeTranslation(x, Y + 0.25 + CAR_H / 2, z);
        cars.setMatrixAt(ti * CARS + k, m);
      }
    });
    cars.instanceMatrix.needsUpdate = true;
  };
  place();

  /** Where a train stops next: the station (if it hasn't yet), then just beyond the end of the line. */
  const stopAt = (t: Train) =>
    !t.stopped && (METRO.stationZ - t.z) * t.dir > 0 ? METRO.stationZ : t.dir * (H + TRAIN_L);

  return {
    group,
    setNight(n) {
      sideMat.emissiveIntensity = 1.6 * n;
      endMat.emissiveIntensity = 0.35 * n;
      // The light strips are grey by day and bloom at night; the sign brightens; the concourse glows warm.
      for (const lm of stationLights) lm.color.setScalar(lm.map ? 1 + 0.6 * n : 0.65 + 3.2 * n);
      if (concourseGlass) concourseGlass.emissiveIntensity = 0.9 * n;
    },
    update(dt, animate) {
      if (!animate) return;
      for (const t of trains) {
        if (t.state === 'dwell' || t.state === 'turn') {
          t.wait -= dt;
          if (t.wait > 0) continue;
          if (t.state === 'turn') {
            // Back from beyond the fog, running the other way on the other track.
            t.dir = t.dir === 1 ? -1 : 1;
            t.z = -t.dir * (H + TRAIN_L);
            t.stopped = false;
            t.v = CRUISE;
          }
          t.state = 'run';
          continue;
        }
        const target = stopAt(t);
        let dist = (target - t.z) * t.dir;
        // Accelerate to cruising speed; brake so as to stop on the mark (a crawl at the very end).
        const vMax = Math.max(0.3, Math.min(CRUISE, Math.sqrt(Math.max(0, 2 * BRAKE * dist))));
        t.v = t.v < vMax ? Math.min(vMax, t.v + ACCEL * dt) : vMax;
        const step = Math.min(t.v * dt, Math.max(0, dist));
        t.z += t.dir * step;
        dist -= step;
        if (dist <= 0.05) {
          t.z = target;
          t.v = 0;
          if (target === METRO.stationZ) {
            t.stopped = true;
            t.state = 'dwell';
            t.wait = DWELL;
          } else {
            t.state = 'turn';
            t.wait = TURN;
          }
        }
      }
      place();
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
