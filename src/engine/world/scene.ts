/**
 * Builds the whole stadium scene from the layout and the build data (port of the prototype's buildWorld).
 */
import * as THREE from 'three';
import { brand } from '@/config/brand';
import { hash2, getLayout, rng, SeatFlag, type StadiumLayout } from '@/lib/stadium';
import { L0, P0, R0, CX, CZ, W0, planAt, realLen, sAtLen } from '@/lib/stadium/plan';
import { FACADE, ROOF, SKY, TIERS } from '@/lib/stadium/params';
import type { BuildData } from '../build-data';
import { SHADOW_MASK_PX } from '../build-data';
import { GROUND, LAKE, SUN_DIR } from './park';
import {
  detailSeatGeometry,
  PAL,
  seatGeometry,
  sweep,
  tierProfile,
  wheelchairDecalGeometry,
  wheelchairPlatformGeometry,
} from './geometry';
import type { Sky } from 'three/addons/objects/Sky.js';
import { LOOKS } from '../lighting';
import { Boards } from './boards';
import { aisleNosings, balustrades, buildFlags, goalNets, pitchMaterial, roofCables } from './details';
import { buildCity, type City } from './city';
import { buildMetro, type Metro } from './metro';
import { addCloudShadows, addTreeSway, createAmbientUniforms, type AmbientUniforms } from './shading';
import { dirFrom, makeMoon, makeSky, makeStars, setSky, skyEnvironment } from './sky';
import {
  facadeTexture,
  membraneTexture,
  wheelchairTexture,
  type DrawnTexture,
  type TextureText,
} from './textures';

const PI = Math.PI,
  TAU = PI * 2;

export interface WorldOptions {
  text: TextureText;
  font: string;
  shadowMapSize: number;
  /** Share of trees to draw (0.6 on the Low tier). */
  treeDensity: number;
  /** Share of the city's far buildings to draw, whether roofs get stair rooms and water tanks, and the
   * simpler lighting model for it (Low). */
  cityDensity: number;
  rooftops: boolean;
  cheapCity: boolean;
}

export interface World {
  layout: StadiumLayout;
  scene: THREE.Scene;
  sunDir: THREE.Vector3;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  boxLight: THREE.PointLight;
  /** What the lighting presets change (lighting.ts). */
  lighting: {
    sky: Sky;
    stars: THREE.Points;
    moon: THREE.Mesh;
    /** Pitch flood lights (night only, no shadows). */
    spots: THREE.SpotLight[];
    /** The floodlights' spill on the stands (night only). */
    bowlFill: THREE.PointLight;
    /** The environment of the default preset, day (the lighting rig owns and disposes it). */
    env: THREE.WebGLRenderTarget;
    flood: THREE.MeshBasicMaterial;
    roofEdge: THREE.MeshBasicMaterial;
    /** LED ribbons, pitch boards and the big screens. */
    leds: THREE.MeshBasicMaterial[];
    facade: THREE.MeshStandardMaterial;
    fins: THREE.MeshStandardMaterial;
    interior: THREE.MeshStandardMaterial;
    membrane: THREE.MeshStandardMaterial;
    /** The membrane seen from below: sky light shines through it by day. */
    membraneUnder: THREE.MeshStandardMaterial;
  };
  /** Animated LED ribbons, boards and screens. */
  boards: Boards;
  /** The neighbourhood around the park, and MRT Line 6 with its trains. */
  city: City;
  metro: Metro;
  /** Uniforms of the ambient shader patches (time, cloud shadows, wind). */
  ambient: AmbientUniforms;
  seats: THREE.InstancedMesh;
  seatGlow: THREE.InstancedBufferAttribute;
  /** Base colours (live colours are recomputed from these). */
  seatBase: Float32Array;
  /** Untouched seat matrices (the near-seat swap restores from these). */
  seatMatrices: Float32Array;
  /** Clean colours and zero glow, swapped in while taking snapshots. */
  cleanColor: THREE.InstancedBufferAttribute;
  zeroGlow: THREE.InstancedBufferAttribute;
  wheelchair: {
    platform: THREE.InstancedMesh;
    decal: THREE.InstancedMesh;
    /** Seat index of each platform instance. */
    seats: Int32Array;
    /** Platform instance of each seat index (-1 if none). */
    instanceOf: Map<number, number>;
    baseColor: THREE.Color;
  };
  detailSeat: THREE.BufferGeometry;
  tierMeshes: THREE.Mesh[];
  roofMesh: THREE.Mesh;
  glassMesh: THREE.Mesh;
  groundShadow: { value: number };
  textures: { led: DrawnTexture; board: DrawnTexture; screen: DrawnTexture };
  /** Everything created here that needs dispose(), beyond what scene traversal finds. */
  extraDisposables: { dispose: () => void }[];
}

export function buildWorld(renderer: THREE.WebGLRenderer, data: BuildData, opts: WorldOptions): World {
  const layout = getLayout();
  const scene = new THREE.Scene();
  const sunDir = new THREE.Vector3(SUN_DIR[0], SUN_DIR[1], SUN_DIR[2]);
  const extra: { dispose: () => void }[] = [];
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  /* lights, sky, fog (the lighting rig sets them per preset; these start as day, the default) */
  scene.fog = new THREE.Fog(LOOKS.day.fog, LOOKS.day.fogNear, LOOKS.day.fogFar);
  const sky = makeSky();
  setSky(sky, LOOKS.day.sky);
  const stars = makeStars();
  const moon = makeMoon(dirFrom(LOOKS.night.lightElevation, LOOKS.night.lightAzimuth));
  scene.add(sky, stars, moon);
  const sun = new THREE.DirectionalLight(LOOKS.day.lightColor, LOOKS.day.lightIntensity);
  sun.position.copy(sunDir).multiplyScalar(520);
  sun.castShadow = true;
  sun.shadow.mapSize.set(opts.shadowMapSize, opts.shadowMapSize);
  Object.assign(sun.shadow.camera, { left: -200, right: 200, top: 200, bottom: -200, near: 40, far: 1100 });
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 2;
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(LOOKS.day.hemiSky, LOOKS.day.hemiGround, LOOKS.day.hemiIntensity);
  scene.add(hemi);
  const boxLight = new THREE.PointLight(new THREE.Color('#ffd6a3'), 0, 11, 2);
  scene.add(boxLight);

  const env = skyEnvironment(renderer, LOOKS.day.sky);
  scene.environment = env.texture;
  const ambient = createAmbientUniforms();
  ambient.uCloudSun.value.copy(sunDir);
  const clouds = (...mats: THREE.Material[]) => mats.forEach((m) => addCloudShadows(m, ambient));

  /* textures */
  const boards = new Boards(opts.text, opts.font);
  const led = boards.led,
    board = boards.board,
    screen = boards.screen;
  const facade = facadeTexture();
  facade.texture.repeat.set(1 / 24, 1);
  const windows = facadeTexture(true);
  windows.texture.repeat.set(1 / 24, 1);
  const membrane = membraneTexture();
  membrane.texture.repeat.set(1 / 11, 1);

  /* materials */
  const concrete = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  const ledMat = new THREE.MeshBasicMaterial({ map: led.texture, toneMapped: false });
  const glass = new THREE.MeshStandardMaterial({
    color: '#1d2d38',
    transparent: true,
    opacity: 0.34,
    roughness: 0.05,
    metalness: 0.2,
    envMapIntensity: 1.6,
    depthWrite: false,
  });
  const interiorBand = new THREE.MeshStandardMaterial({
    color: '#ecd4b0',
    emissive: new THREE.Color('#e7c08c'),
    emissiveIntensity: 0.6,
    roughness: 0.85,
  });
  // The windows glow at night (emissiveIntensity set by the lighting rig).
  const facadeMat = new THREE.MeshStandardMaterial({
    map: facade.texture,
    roughness: 0.65,
    metalness: 0.05,
    emissive: new THREE.Color('#ffffff'),
    emissiveMap: windows.texture,
    emissiveIntensity: 0,
  });
  const finMat = new THREE.MeshStandardMaterial({ color: '#eef0f1', roughness: 0.45, metalness: 0.1 });
  const leds: THREE.MeshBasicMaterial[] = [ledMat];
  const roofTop = new THREE.MeshStandardMaterial({
    map: membrane.texture,
    roughness: 0.55,
    color: '#ffffff',
    emissive: new THREE.Color('#fff8ec'),
    emissiveIntensity: 0.2,
    emissiveMap: membrane.texture,
  });
  const flood = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff8e2') });
  // The membrane from below: a little sky light shines through the panels, not the seams (lighting.ts
  // turns it down at night).
  const membraneUnder = new THREE.MeshStandardMaterial({
    color: PAL.roofUnder,
    roughness: 0.8,
    emissive: new THREE.Color('#fff3e0'),
    emissiveMap: membrane.texture,
    emissiveIntensity: 0.24,
  });
  clouds(concrete, roofTop, facadeMat, finMat, membraneUnder);

  /* bowl floor + pitch (stripes, noise and markings per pixel: details.ts) */
  {
    const s = bowlPath(0.5, new THREE.Shape()) as THREE.Shape;
    const g = new THREE.ShapeGeometry(s, 24);
    g.rotateX(-PI / 2);
    const mat = pitchMaterial();
    clouds(mat);
    const m = new THREE.Mesh(g, mat);
    m.position.y = 0.03;
    m.receiveShadow = true;
    scene.add(m);
  }

  /* goals: posts, crossbar and nets */
  {
    const white = new THREE.MeshStandardMaterial({ color: '#f6f6f2', roughness: 0.4 });
    const post = new THREE.CylinderGeometry(0.06, 0.06, 2.44, 10),
      bar = new THREE.CylinderGeometry(0.06, 0.06, 7.44, 10);
    for (const s of [-1, 1]) {
      const gx0 = 52.5 * s;
      for (const z of [-3.66, 3.66]) {
        const m = new THREE.Mesh(post, white);
        m.position.set(gx0, 1.22, z);
        m.castShadow = true;
        scene.add(m);
      }
      const b = new THREE.Mesh(bar, white);
      b.rotation.x = PI / 2;
      b.position.set(gx0, 2.44, 0);
      b.castShadow = true;
      scene.add(b);
    }
    scene.add(goalNets().mesh);
  }

  /* corner flags and the flags on the roof ring */
  scene.add(
    buildFlags(ambient, [
      opts.text.homeColor || brand.colors.seatBlue,
      opts.text.awayColor || brand.colors.seatRed,
      '#ffffff',
    ]),
  );

  /* pitch-side LED boards */
  {
    const mat = new THREE.MeshBasicMaterial({ map: board.texture, toneMapped: false }),
      back = new THREE.MeshStandardMaterial({ color: '#1b1f25', roughness: 0.8 });
    leds.push(mat);
    const make = (len: number, x: number, z: number, ry: number) => {
      const g = new THREE.PlaneGeometry(len, 0.9);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * len) / 14.4);
      const m = new THREE.Mesh(g, mat);
      m.position.set(x, 0.47, z);
      m.rotation.y = ry;
      scene.add(m);
      const b = new THREE.Mesh(new THREE.BoxGeometry(len, 0.92, 0.25), back);
      b.position.set(x - Math.sin(ry) * 0.14, 0.46, z - Math.cos(ry) * 0.14);
      b.rotation.y = ry;
      b.castShadow = true;
      scene.add(b);
    };
    make(96, 0, -38.5, 0);
    make(96, 0, 38.5, PI);
    make(58, -57.2, 0, PI / 2);
    make(58, 57.2, 0, -PI / 2);
  }

  /* tiers */
  const tierMeshes: THREE.Mesh[] = [];
  for (const t of TIERS) {
    const m = new THREE.Mesh(sweep(tierProfile(t)), [concrete, ledMat]);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    tierMeshes.push(m);
  }
  // Glass balustrades on the middle and upper tier fronts; yellow nosings on the aisle steps.
  scene.add(balustrades(), aisleNosings(layout));

  /* skybox ring */
  let glassMesh: THREE.Mesh;
  {
    const prof = [
      { d: SKY.d, y: SKY.y, c: '#3b3a38' },
      { d: SKY.d2, y: SKY.y, c: '#ffffff', m: 1 },
      { d: SKY.d2, y: SKY.y + SKY.h, c: '#d8d4cc' },
      { d: SKY.d, y: SKY.y + SKY.h },
    ];
    const m = new THREE.Mesh(sweep(prof), [concrete, interiorBand]);
    m.receiveShadow = true;
    scene.add(m);
    const clad = new THREE.Mesh(
      sweep([
        { d: SKY.d + 0.5, y: SKY.y + SKY.h, c: '#2a2f36' },
        { d: SKY.d + 0.5, y: SKY.y + SKY.h + 2.7 },
      ]),
      concrete,
    );
    scene.add(clad);
    glassMesh = new THREE.Mesh(
      sweep([
        { d: SKY.d, y: SKY.y },
        { d: SKY.d + 0.5, y: SKY.y + SKY.h },
      ]),
      glass,
    );
    glassMesh.renderOrder = 2;
    scene.add(glassMesh);
  }

  /* roof */
  let roofMesh: THREE.Mesh;
  {
    const r = ROOF;
    const prof = [
      { d: r.d0, y: r.yIn, c: '#ffffff', m: 1 },
      { d: r.d1, y: r.yOut, c: PAL.roofEdge },
      { d: r.d1, y: r.yOut - r.thickOut, c: PAL.roofUnder, m: 3 },
      { d: r.d0, y: r.yIn - r.thickIn, c: '#ffffff', m: 2 },
      { d: r.d0, y: r.yIn - r.thickIn + 0.45, c: PAL.ring },
      { d: r.d0, y: r.yIn },
    ];
    roofMesh = new THREE.Mesh(sweep(prof), [concrete, roofTop, flood, membraneUnder]);
    roofMesh.castShadow = true;
    roofMesh.receiveShadow = true;
    scene.add(roofMesh, roofCables());
    // radial cantilever trusses under the membrane
    const n = 120,
      geo = new THREE.BoxGeometry(0.5, 1, 1);
    const tm = new THREE.InstancedMesh(
      geo,
      new THREE.MeshStandardMaterial({ color: '#d8dadc', roughness: 0.5, metalness: 0.3 }),
      n,
    );
    const P = { x: 0, z: 0, nx: 0, nz: 0 },
      Q = { x: 0, z: 0, nx: 0, nz: 0 };
    const mtx = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      sc = new THREE.Vector3(),
      p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const s = (i / n) * P0;
      planAt(s, r.d0 + 0.5, P);
      planAt(s, 60.6, Q);
      const a = new THREE.Vector3(P.x, r.yIn - r.thickIn - 0.2, P.z),
        b = new THREE.Vector3(Q.x, 52.4, Q.z);
      const dir = b.clone().sub(a),
        len = dir.length();
      p.copy(a).add(b).multiplyScalar(0.5);
      q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
      sc.set(1, 1.1, len);
      tm.setMatrixAt(i, mtx.compose(p, q, sc));
    }
    tm.castShadow = true;
    tm.frustumCulled = false;
    scene.add(tm);
  }

  /* a light strip along the roof's outer edge (grey by day, lit at night) */
  const roofEdge = new THREE.MeshBasicMaterial({ color: '#c3c7cb' });
  {
    const strip = new THREE.Mesh(
      sweep([
        { d: ROOF.d1 + 0.06, y: ROOF.yOut - 0.42 },
        { d: ROOF.d1 + 0.06, y: ROOF.yOut - 0.12 },
      ]),
      roofEdge,
    );
    scene.add(strip);
  }

  /* pitch flood lights (night): six spots under the roof's inner edge, aimed at the pitch, no shadows */
  const spots: THREE.SpotLight[] = [];
  {
    const P = { x: 0, z: 0, nx: 0, nz: 0 };
    for (let k = 0; k < 6; k++) {
      planAt(((k + 0.5) / 6) * P0, ROOF.d0 - 1, P);
      const spot = new THREE.SpotLight(new THREE.Color('#fff4e0'), 0, 0, 0.62, 0.75, 2);
      spot.position.set(P.x, ROOF.yIn - 1.2, P.z);
      spot.target.position.set(P.x * 0.22, 0, P.z * 0.22);
      spot.castShadow = false;
      scene.add(spot, spot.target);
      spots.push(spot);
    }
  }
  // Night: the floodlights' spill on the stands (one point light above the pitch, no shadows).
  const bowlFill = new THREE.PointLight(new THREE.Color('#ffe9cc'), 0, 0, 2);
  bowlFill.position.set(0, 36, 0);
  scene.add(bowlFill);

  /* facade + fins */
  {
    const m = new THREE.Mesh(
      sweep([
        { d: FACADE.d, y: FACADE.top },
        { d: FACADE.d, y: 0 },
      ]),
      facadeMat,
    );
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    const D = FACADE.finD,
      L = realLen(0, P0, D),
      n = Math.floor(L / FACADE.finStep),
      geo = new THREE.BoxGeometry(0.42, FACADE.top + 0.6, 1.5);
    const fins = new THREE.InstancedMesh(geo, finMat, n);
    const P = { x: 0, z: 0, nx: 0, nz: 0 },
      mtx = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      planAt(sAtLen(0, (i + 0.5) * (L / n), D), D, P);
      mtx
        .makeBasis(
          new THREE.Vector3(-P.nz, 0, P.nx),
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(-P.nx, 0, -P.nz),
        )
        .setPosition(P.x, (FACADE.top + 0.6) / 2, P.z);
      fins.setMatrixAt(i, mtx);
    }
    fins.castShadow = true;
    fins.receiveShadow = true;
    fins.frustumCulled = false;
    scene.add(fins);
  }

  /* big screens at both ends */
  {
    const frame = new THREE.MeshStandardMaterial({ color: '#1c1f24', roughness: 0.6 }),
      face = new THREE.MeshBasicMaterial({ map: screen.texture, toneMapped: false });
    leds.push(face);
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(s * (L0 + ROOF.d0 - 1.5), 49.6, 0);
      g.rotation.y = s > 0 ? -PI / 2 : PI / 2;
      const b = new THREE.Mesh(new THREE.BoxGeometry(24.6, 10.2, 1.2), frame);
      b.castShadow = true;
      g.add(b);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(24, 9.6), face);
      f.position.z = 0.61;
      g.add(f);
      scene.add(g);
    }
  }

  /* the seats: one InstancedMesh with a per-instance glow */
  const seatCount = layout.bowlSeatCount;
  const geo = seatGeometry();
  const seatMat = new THREE.MeshStandardMaterial({ roughness: 0.36, metalness: 0, envMapIntensity: 0.9 });
  const glow = new THREE.InstancedBufferAttribute(new Float32Array(seatCount), 1);
  glow.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aGlow', glow);
  const pickId = new Float32Array(seatCount);
  for (let i = 0; i < seatCount; i++) pickId[i] = i;
  geo.setAttribute('aPickId', new THREE.InstancedBufferAttribute(pickId, 1));
  seatMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying vec3 vGlowC;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n#ifdef USE_INSTANCING_COLOR\n vGlowC = instanceColor * aGlow;\n#else\n vGlowC = vec3(0.0);\n#endif',
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGlowC;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vGlowC;',
      );
  };
  // Without this, three.js could share the compiled program with plain MeshStandardMaterials (pitfall 5).
  seatMat.customProgramCacheKey = () => 'seat-glow';
  clouds(seatMat);
  const seats = new THREE.InstancedMesh(geo, seatMat, seatCount);
  const matrices = data.seatMatrices.slice();
  // Wheelchair spaces are drawn as platforms, so their chairs are scaled to zero.
  const wcSeats: number[] = [];
  for (let i = 0; i < seatCount; i++) if (layout.flags[i] & SeatFlag.Wheelchair) wcSeats.push(i);
  for (const i of wcSeats) for (const j of [0, 1, 2, 4, 5, 6, 8, 9, 10]) matrices[i * 16 + j] = 0;
  seats.instanceMatrix.array.set(matrices);
  seats.instanceMatrix.needsUpdate = true;
  // instanceColor must exist before the first render, or the shader compiles without it (pitfall 3).
  seats.instanceColor = new THREE.InstancedBufferAttribute(data.seatColors.slice(), 3);
  seats.instanceColor.setUsage(THREE.DynamicDrawUsage);
  seats.castShadow = true;
  seats.receiveShadow = true;
  seats.frustumCulled = false; // pitfall 4
  scene.add(seats);

  /* wheelchair spaces: a blue platform with a pictogram */
  const wcBase = new THREE.Color(brand.colors.seatBlue).multiplyScalar(0.9);
  const platform = new THREE.InstancedMesh(
    wheelchairPlatformGeometry(),
    new THREE.MeshStandardMaterial({ roughness: 0.5 }),
    Math.max(1, wcSeats.length),
  );
  const wheel = wheelchairTexture();
  const decal = new THREE.InstancedMesh(
    wheelchairDecalGeometry(),
    new THREE.MeshBasicMaterial({ map: wheel.texture, alphaTest: 0.5, transparent: false }),
    Math.max(1, wcSeats.length),
  );
  const wcIdx = new Int32Array(wcSeats.length);
  const instanceOf = new Map<number, number>();
  {
    const m = new THREE.Matrix4();
    wcSeats.forEach((i, k) => {
      m.fromArray(data.seatMatrices, i * 16);
      platform.setMatrixAt(k, m);
      decal.setMatrixAt(k, m);
      platform.setColorAt(k, wcBase);
      wcIdx[k] = i;
      instanceOf.set(i, k);
    });
    platform.count = decal.count = wcSeats.length;
    platform.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    const pickIds = new Float32Array(Math.max(1, wcSeats.length));
    wcSeats.forEach((i, k) => (pickIds[k] = i));
    platform.geometry.setAttribute('aPickId', new THREE.InstancedBufferAttribute(pickIds, 1));
    platform.receiveShadow = decal.receiveShadow = true;
    platform.frustumCulled = decal.frustumCulled = false;
    scene.add(platform, decal);
  }

  /* skybox partition walls */
  {
    const geo2 = new THREE.BoxGeometry(0.22, SKY.h, SKY.d2 - SKY.d);
    const parts = new THREE.InstancedMesh(
      geo2,
      new THREE.MeshStandardMaterial({ color: '#8a6243', roughness: 0.55 }),
      layout.boxes.length,
    );
    const mtx = new THREE.Matrix4(),
      P = { x: 0, z: 0, nx: 0, nz: 0 };
    layout.boxes.forEach((b, i) => {
      planAt(b.sa, (SKY.d + SKY.d2) / 2, P);
      mtx
        .makeBasis(
          new THREE.Vector3(-P.nz, 0, P.nx),
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(-P.nx, 0, -P.nz),
        )
        .setPosition(P.x, SKY.y + SKY.h / 2, P.z);
      parts.setMatrixAt(i, mtx);
    });
    parts.frustumCulled = false;
    scene.add(parts);
  }

  /* park: painted ground with a separate shadow mask, lake, trees, cars */
  const groundShadow = { value: 1 };
  {
    const tex = imageTexture(data.ground, data.flipped);
    tex.anisotropy = maxAniso;
    const mask = new THREE.DataTexture(data.shadowMask, SHADOW_MASK_PX, SHADOW_MASK_PX, THREE.RedFormat);
    mask.needsUpdate = true;
    mask.magFilter = THREE.LinearFilter;
    mask.minFilter = THREE.LinearMipmapLinearFilter;
    mask.generateMipmaps = true;
    // The ground has holes where the pitch and the lake have their own meshes, and the outer grass has a
    // hole under the ground: nothing coplanar overlaps, so nothing depth-fights at a distance (seat views
    // use a 5 cm near plane; the phone overview sits ~950 m away).
    const g = groundGeometry();
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.96 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uShadowMask = { value: mask };
      sh.uniforms.uShadowStrength = groundShadow;
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform sampler2D uShadowMask;\nuniform float uShadowStrength;',
        )
        .replace(
          '#include <map_fragment>',
          '#include <map_fragment>\nfloat gsm = texture2D(uShadowMask, vec2(vMapUv.x, 1.0 - vMapUv.y)).r;\ndiffuseColor.rgb *= mix(1.0, gsm, uShadowStrength);',
        );
    };
    mat.customProgramCacheKey = () => 'ground-shadow-mask';
    // Beyond the park: the city's dusty ground (its roads and playgrounds lie on top: city.ts).
    const outerMat = new THREE.MeshStandardMaterial({ color: '#8b877c', roughness: 1 });
    const lake = lakeMesh();
    clouds(mat, outerMat, lake.material as THREE.Material);
    const ground = new THREE.Mesh(g, mat);
    ground.receiveShadow = true;
    scene.add(ground);
    extra.push(mask);
    const g2 = squareWithHole(20000, GROUND - 2);
    const outer = new THREE.Mesh(g2, outerMat);
    outer.position.y = -0.6;
    scene.add(outer);
    scene.add(lake);
  }
  {
    const trees = data.trees,
      n = trees.length / 6;
    const keep: number[] = [];
    for (let i = 0; i < n; i++) if (opts.treeDensity >= 1 || hash2(i, 77) < opts.treeDensity) keep.push(i);
    const dec = keep.filter((i) => trees[i * 6 + 4] === 0),
      con = keep.filter((i) => trees[i * 6 + 4] === 1);
    const canopyG = new THREE.IcosahedronGeometry(1, 1),
      coneG = new THREE.ConeGeometry(1, 1, 7, 1),
      trunkG = new THREE.CylinderGeometry(0.22, 0.34, 1, 6);
    const leafMat = new THREE.MeshStandardMaterial({ roughness: 0.92, flatShading: true }),
      trunkMat = new THREE.MeshStandardMaterial({ color: '#5a4331', roughness: 1 });
    clouds(leafMat, trunkMat);
    addTreeSway(leafMat, ambient);
    const canopy = new THREE.InstancedMesh(canopyG, leafMat, Math.max(1, dec.length)),
      cones = new THREE.InstancedMesh(coneG, leafMat, Math.max(1, con.length)),
      trunks = new THREE.InstancedMesh(trunkG, trunkMat, Math.max(1, keep.length));
    const mtx = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      e = new THREE.Euler(),
      s = new THREE.Vector3(),
      p = new THREE.Vector3(),
      c = new THREE.Color();
    const rnd = rng(77);
    const greens = ['#3d6b2a', '#4b7a2f', '#33602a', '#5b8a36', '#46742d', '#2f5527'],
      autumn = ['#b9852f', '#a9522a', '#c9a23a'];
    dec.forEach((ti, i) => {
      const x = trees[ti * 6],
        z = trees[ti * 6 + 1],
        h = trees[ti * 6 + 2],
        r = trees[ti * 6 + 3],
        tint = trees[ti * 6 + 5];
      e.set(0, tint * TAU, 0);
      q.setFromEuler(e);
      s.set(r, r * 0.86, r);
      p.set(x, h - r * 0.8, z);
      canopy.setMatrixAt(i, mtx.compose(p, q, s));
      c.set(tint < 0.1 ? autumn[(tint * 30) | 0] : greens[((tint * 60) % greens.length) | 0]);
      c.multiplyScalar(0.85 + rnd() * 0.3);
      canopy.setColorAt(i, c);
    });
    con.forEach((ti, i) => {
      const x = trees[ti * 6],
        z = trees[ti * 6 + 1],
        h = trees[ti * 6 + 2],
        r = trees[ti * 6 + 3];
      s.set(r, h * 0.86, r);
      p.set(x, h * 0.43 + h * 0.14, z);
      q.identity();
      cones.setMatrixAt(i, mtx.compose(p, q, s));
      c.set('#29482a');
      c.multiplyScalar(0.8 + rnd() * 0.35);
      cones.setColorAt(i, c);
    });
    keep.forEach((ti, i) => {
      const x = trees[ti * 6],
        z = trees[ti * 6 + 1],
        h = trees[ti * 6 + 2],
        r = trees[ti * 6 + 3],
        conifer = trees[ti * 6 + 4] === 1;
      const th = conifer ? h * 0.2 : h - r * 1.2;
      s.set(1, th, 1);
      p.set(x, th / 2, z);
      q.identity();
      trunks.setMatrixAt(i, mtx.compose(p, q, s));
    });
    canopy.count = dec.length;
    cones.count = con.length;
    trunks.count = keep.length;
    for (const m of [canopy, cones, trunks]) {
      m.receiveShadow = true;
      m.frustumCulled = false;
      scene.add(m);
    }
  }
  {
    const cars = data.cars,
      n = cars.length / 4;
    const body = new THREE.BoxGeometry(1.8, 1.0, 4.4);
    body.translate(0, 0.62, 0);
    const cab = new THREE.BoxGeometry(1.6, 0.62, 2.3);
    cab.translate(0, 1.42, -0.2);
    const carMat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.4 }),
      glassMat = new THREE.MeshStandardMaterial({ color: '#1b232b', roughness: 0.15, metalness: 0.5 });
    clouds(carMat);
    const bm = new THREE.InstancedMesh(body, carMat, n),
      cm = new THREE.InstancedMesh(cab, glassMat, n);
    const pal = [
      '#ecebe7',
      '#bfc2c6',
      '#1d1f22',
      '#5c6066',
      '#284a8c',
      '#9c1d1d',
      '#2e4a3a',
      '#c9b994',
      '#ecebe7',
      '#bfc2c6',
    ];
    const mtx = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      e = new THREE.Euler(),
      s = new THREE.Vector3(1, 1, 1),
      p = new THREE.Vector3(),
      c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      e.set(0, cars[i * 4 + 2], 0);
      q.setFromEuler(e);
      p.set(cars[i * 4], 0, cars[i * 4 + 1]);
      mtx.compose(p, q, s);
      bm.setMatrixAt(i, mtx);
      cm.setMatrixAt(i, mtx);
      c.set(pal[(cars[i * 4 + 3] * pal.length) | 0]);
      bm.setColorAt(i, c);
    }
    bm.receiveShadow = cm.receiveShadow = true;
    bm.frustumCulled = cm.frustumCulled = false;
    scene.add(bm, cm);
  }

  /* the neighbourhood and MRT Line 6 */
  const city = buildCity(
    data.city,
    { density: opts.cityDensity, rooftops: opts.rooftops, cheap: opts.cheapCity },
    ambient,
  );
  const metro = buildMetro(ambient);
  scene.add(city.group, metro.group);
  extra.push(city, metro);

  extra.push(wheel.texture);
  return {
    layout,
    scene,
    sunDir,
    sun,
    hemi,
    boxLight,
    lighting: {
      sky,
      stars,
      moon,
      spots,
      bowlFill,
      env,
      flood,
      roofEdge,
      leds,
      facade: facadeMat,
      fins: finMat,
      interior: interiorBand,
      membrane: roofTop,
      membraneUnder,
    },
    boards,
    city,
    metro,
    ambient,
    seats,
    seatGlow: glow,
    seatBase: data.seatColors,
    seatMatrices: data.seatMatrices,
    cleanColor: new THREE.InstancedBufferAttribute(data.seatColors, 3),
    zeroGlow: new THREE.InstancedBufferAttribute(new Float32Array(seatCount), 1),
    wheelchair: { platform, decal, seats: wcIdx, instanceOf, baseColor: wcBase },
    detailSeat: detailSeatGeometry(),
    tierMeshes,
    roofMesh,
    glassMesh,
    groundShadow,
    textures: { led, board, screen },
    extraDisposables: extra,
  };
}

/** A texture from a worker ImageBitmap (pre-flipped) or a canvas. */
function imageTexture(img: ImageBitmap | HTMLCanvasElement, flipped: boolean): THREE.Texture {
  const t = flipped ? new THREE.Texture(img) : new THREE.CanvasTexture(img as HTMLCanvasElement);
  if (flipped) t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

/** Rounded-rectangle path of the bowl floor at offset d (shape space: x, -z). */
function bowlPath(d: number, path: THREE.Path) {
  const hx = L0 + d,
    hz = W0 + d,
    r = R0 + d;
  path.moveTo(-CX, -hz);
  path.lineTo(CX, -hz);
  path.absarc(CX, -CZ, r, -PI / 2, 0, false);
  path.lineTo(hx, CZ);
  path.absarc(CX, CZ, r, 0, PI / 2, false);
  path.lineTo(-CX, hz);
  path.absarc(-CX, CZ, r, PI / 2, PI, false);
  path.lineTo(-hx, -CZ);
  path.absarc(-CX, -CZ, r, PI, 1.5 * PI, false);
  return path;
}

/** The painted ground square, minus the bowl floor and the lake (they have their own meshes). */
function groundGeometry(): THREE.BufferGeometry {
  const H = GROUND / 2;
  const s = new THREE.Shape();
  s.moveTo(-H, -H);
  s.lineTo(H, -H);
  s.lineTo(H, H);
  s.lineTo(-H, H);
  s.closePath();
  s.holes.push(bowlPath(0.3, new THREE.Path()));
  const lake = new THREE.Path();
  LAKE.pts.forEach((p, i) => {
    const x = LAKE.cx + (p[0] - LAKE.cx) * 0.97,
      z = LAKE.cz + (p[1] - LAKE.cz) * 0.97;
    if (i) lake.lineTo(x, -z);
    else lake.moveTo(x, -z);
  });
  s.holes.push(lake);
  const g = new THREE.ShapeGeometry(s, 12);
  const pos = g.attributes.position,
    uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + H) / GROUND, (pos.getY(i) + H) / GROUND);
  g.rotateX(-PI / 2);
  return g;
}

/** A large square with a square hole in the middle (the far grass around the painted ground). */
function squareWithHole(size: number, hole: number): THREE.BufferGeometry {
  const a = size / 2,
    b = hole / 2;
  const s = new THREE.Shape();
  s.moveTo(-a, -a);
  s.lineTo(a, -a);
  s.lineTo(a, a);
  s.lineTo(-a, a);
  s.closePath();
  const h = new THREE.Path();
  h.moveTo(-b, -b);
  h.lineTo(b, -b);
  h.lineTo(b, b);
  h.lineTo(-b, b);
  h.closePath();
  s.holes.push(h);
  const g = new THREE.ShapeGeometry(s);
  g.rotateX(-PI / 2);
  return g;
}

function lakeMesh(): THREE.Mesh {
  const s = new THREE.Shape();
  LAKE.pts.forEach((p, i) => (i ? s.lineTo(p[0], -p[1]) : s.moveTo(p[0], -p[1])));
  const g = new THREE.ShapeGeometry(s, 4);
  g.rotateX(-PI / 2);
  const m = new THREE.Mesh(
    g,
    new THREE.MeshStandardMaterial({
      color: '#285a74',
      roughness: 0.08,
      metalness: 0.0,
      envMapIntensity: 1.25,
    }),
  );
  m.position.y = 0.06;
  m.receiveShadow = true;
  return m;
}
