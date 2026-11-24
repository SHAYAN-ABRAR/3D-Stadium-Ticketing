/**
 * The neighbourhood's meshes (city-data.ts has the layout). One draw call each:
 * - buildings: instanced boxes whose walls draw their windows per pixel: storeys of 3.1 m, whole bays across
 *   each face, dark glass by day; at night some windows are lit, warm or cool, a different pattern on every
 *   building, and the shops along the main roads glow under their signboards. Far away the pattern fades to
 *   its average, so it never shimmers;
 * - roads, lanes and playgrounds; stair rooms and water tanks on the roofs (Medium and up);
 * - mosques (prayer hall, dome, minaret), with a green light on the minaret at night;
 * - street lights: glowing points at night.
 * Nothing here casts or receives shadows (the sun's shadow map covers the stadium only). Low lights it with
 * the Lambert model and draws fewer far blocks, for weak and software renderers. Ground level out here is
 * -0.6 m (the far ground plane), 0.6 m below the park.
 */
import * as THREE from 'three';
import { hash2 } from '@/lib/stadium';
import { FACADES, GroundKind, TANK_COLORS, type CityData } from './city-data';
import { canvasTexture } from './textures';
import { addCloudShadows, patchMaterial, type AmbientUniforms } from './shading';

/** Ground level outside the park. */
const BASE = -0.6;

export interface City {
  group: THREE.Group;
  /** 0 by day, 1 at night (the lighting rig sets it): lit windows and shops, street and minaret lights. */
  night: { value: number };
  /** The glowing points; their opacity follows the night. */
  lamps: THREE.PointsMaterial[];
  dispose(): void;
}

export interface CityOptions {
  /** Share of the far buildings to draw (Low draws fewer); everything within 1.15 km is always drawn. */
  density: number;
  /** Stair rooms and water tanks (Medium and up). */
  rooftops: boolean;
  /** Lambert lighting (no environment map, no PBR) for weak and software renderers (Low). */
  cheap: boolean;
}

/** A material for the city: standard, or the cheaper Lambert model when asked. */
function cityMaterial(cheap: boolean, params: THREE.MeshStandardMaterialParameters) {
  if (!cheap) return new THREE.MeshStandardMaterial(params);
  const { roughness: _r, metalness: _m, ...rest } = params;
  return new THREE.MeshLambertMaterial(rest);
}

const WINDOWS_GLSL = /* glsl */ `
uniform float uNight;
varying vec3 vWall;
varying vec3 vFace;
float cityHash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}`;

function buildingMaterial(night: { value: number }, amb: AmbientUniforms, cheap: boolean) {
  const mat = cityMaterial(cheap, { roughness: 0.9, metalness: 0 });
  patchMaterial(mat, 'city-windows', (sh) => {
    sh.uniforms.uNight = night;
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec2 aCity;
varying vec3 vWall;
varying vec3 vFace;`,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
{
  vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  bool sideX = abs(normal.x) > 0.5;
  float wall = 1.0 - step(0.5, abs(normal.y));
  // u: metres along the face; v: metres up; the face's width and height; the building's seed and flags.
  vWall = vec3(sideX ? (position.z + 0.5) * sc.z : (position.x + 0.5) * sc.x, position.y * sc.y, wall);
  vFace = vec3(sideX ? sc.z : sc.x, sc.y, aCity.x + aCity.y * 1000.0);
}`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>${WINDOWS_GLSL}\nvec3 cityGlow = vec3(0.0);`)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
{
  float seed = mod(vFace.z, 1000.0);
  bool shops = vFace.z >= 1000.0;
  float storey = 3.1;
  float floors = floor((vFace.y - 1.0) / storey);
  float bays = max(1.0, floor(vFace.x / 3.3));
  vec2 f = vec2(vWall.x / vFace.x * bays, vWall.y / storey);
  vec2 id = floor(f), cell = fract(f);
  float rows = step(vWall.y, floors * storey) * vWall.z;
  float shopRow = shops ? step(vWall.y, storey) : 0.0;
  rows *= 1.0 - shopRow;
  float win = step(0.18, cell.x) * step(cell.x, 0.82) * step(0.3, cell.y) * step(cell.y, 0.86) * rows;
  // Far away the pattern becomes its average (no shimmer).
  float fw = max(fwidth(f.x), fwidth(f.y));
  float aa = clamp(1.5 - fw * 2.0, 0.0, 1.0);
  float cover = 0.64 * 0.56;
  float w = mix(cover * rows, win, aa);
  // The floor slabs show as a lighter line at every storey.
  float slab = step(fract(f.y), 0.07) * rows * aa;
  diffuseColor.rgb = mix(diffuseColor.rgb, min(diffuseColor.rgb * 1.18 + 0.05, vec3(1.0)), slab);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.15, 0.18, 0.22), w * 0.82);
  // The roof is a little darker than the walls; the lowest storeys carry a little street grime.
  diffuseColor.rgb *= mix(0.74, 1.0, vWall.z);
  diffuseColor.rgb *= mix(1.0, 0.84 + 0.16 * smoothstep(0.0, 8.0, vWall.y), vWall.z);
  // Shops along the main roads: dark shopfronts and a coloured signboard above them.
  if (shopRow > 0.5 && vWall.z > 0.5) {
    float h = cityHash(vec2(floor(vWall.x / 6.0), seed));
    vec3 sign = h < 0.25 ? vec3(0.78, 0.12, 0.12) : h < 0.5 ? vec3(0.1, 0.45, 0.25) : h < 0.75 ? vec3(0.95, 0.75, 0.15) : vec3(0.15, 0.32, 0.7);
    float band = step(2.3, vWall.y);
    diffuseColor.rgb = mix(vec3(0.2, 0.2, 0.21), sign, band);
    cityGlow = mix(vec3(1.0, 0.82, 0.55) * 0.8, sign * 1.6, band) * step(0.25, h + 0.3);
  } else {
    // Night: some windows lit (a different pattern per building and per floor), mostly warm, some cool.
    float share = 0.24 + 0.26 * cityHash(vec2(seed, id.y));
    float on = step(cityHash(id + seed * 1.37), share);
    vec3 tone = mix(vec3(1.0, 0.68, 0.36), vec3(0.78, 0.86, 1.0), step(0.72, cityHash(id.yx + seed)));
    float lit = mix(cover * rows * 0.37, win * on, aa);
    cityGlow = tone * lit;
  }
}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += cityGlow * uNight * 1.15;',
      );
  });
  addCloudShadows(mat, amb);
  return mat;
}

/** A soft round dot for the street lights. */
function glowTexture() {
  return canvasTexture(
    64,
    64,
    (x, w, h) => {
      const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.25, 'rgba(255,255,255,0.75)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.clearRect(0, 0, w, h);
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
    },
    { wrapS: THREE.ClampToEdgeWrapping },
  );
}

function lampMaterial(map: THREE.Texture, color: string, size: number) {
  return new THREE.PointsMaterial({
    map,
    color: new THREE.Color(color),
    size,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

export function buildCity(data: Omit<CityData, 'trees'>, opts: CityOptions, amb: AmbientUniforms): City {
  const group = new THREE.Group();
  const night = { value: 0 };
  const disposables: { dispose(): void }[] = [];

  /* buildings */
  {
    const b = data.buildings,
      n = b.length / 8;
    const keep: number[] = [];
    for (let i = 0; i < n; i++) {
      const far = Math.max(Math.abs(b[i * 8]), Math.abs(b[i * 8 + 1])) > 1150;
      if (!far || opts.density >= 1 || hash2(i, 991) < opts.density) keep.push(i);
    }
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    geo.deleteAttribute('uv');
    const info = new Float32Array(keep.length * 2);
    const mesh = new THREE.InstancedMesh(geo, buildingMaterial(night, amb, opts.cheap), keep.length);
    const m = new THREE.Matrix4(),
      c = new THREE.Color(),
      palette = FACADES.map((h) => new THREE.Color(h));
    keep.forEach((i, k) => {
      const o = i * 8;
      m.makeScale(b[o + 2], b[o + 4], b[o + 3]).setPosition(b[o], BASE, b[o + 1]);
      mesh.setMatrixAt(k, m);
      c.copy(palette[b[o + 5]]).multiplyScalar(0.9 + hash2(i, 7) * 0.14);
      mesh.setColorAt(k, c);
      info[k * 2] = b[o + 6];
      info[k * 2 + 1] = b[o + 7];
    });
    geo.setAttribute('aCity', new THREE.InstancedBufferAttribute(info, 2));
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  /* roads, lanes and playgrounds */
  {
    const g = data.ground,
      n = g.length / 5;
    const pos = new Float32Array(n * 12),
      col = new Float32Array(n * 12),
      idx = new Uint32Array(n * 6);
    const tones: Record<number, THREE.Color> = {
      [GroundKind.Main]: new THREE.Color('#3e4146'),
      [GroundKind.Street]: new THREE.Color('#4b4d51'),
      [GroundKind.Lane]: new THREE.Color('#77736a'),
      [GroundKind.Green]: new THREE.Color('#5f8a3e'),
    };
    for (let i = 0; i < n; i++) {
      const [x0, z0, x1, z1, kind] = [g[i * 5], g[i * 5 + 1], g[i * 5 + 2], g[i * 5 + 3], g[i * 5 + 4]];
      const y = BASE + (kind === GroundKind.Green ? 0.12 : kind === GroundKind.Lane ? 0.14 : 0.16);
      pos.set([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1], i * 12);
      const t = tones[kind];
      for (let v = 0; v < 4; v++) col.set([t.r, t.g, t.b], i * 12 + v * 3);
      const a = i * 4;
      idx.set([a, a + 2, a + 1, a, a + 3, a + 2], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    const mat = cityMaterial(opts.cheap, {
      vertexColors: true,
      roughness: 0.95,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
    });
    addCloudShadows(mat, amb);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  /* stair rooms and water tanks */
  if (opts.rooftops) {
    const rr = data.roofRooms,
      nr = rr.length / 6;
    const roomGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const roomMat = cityMaterial(opts.cheap, { roughness: 0.92 });
    addCloudShadows(roomMat, amb);
    const rooms = new THREE.InstancedMesh(roomGeo, roomMat, Math.max(1, nr));
    const m = new THREE.Matrix4(),
      c = new THREE.Color();
    for (let i = 0; i < nr; i++) {
      const o = i * 6;
      m.makeScale(rr[o + 3], rr[o + 5], rr[o + 4]).setPosition(rr[o], BASE + rr[o + 1], rr[o + 2]);
      rooms.setMatrixAt(i, m);
      rooms.setColorAt(i, c.set('#c9c3b6').multiplyScalar(0.82 + hash2(i, 13) * 0.2));
    }
    rooms.count = nr;
    const t = data.tanks,
      nt = t.length / 6;
    const tankGeo = new THREE.CylinderGeometry(1, 1, 1, 7, 1).translate(0, 0.5, 0);
    const tankMat = cityMaterial(opts.cheap, { roughness: 0.6 });
    addCloudShadows(tankMat, amb);
    const tanks = new THREE.InstancedMesh(tankGeo, tankMat, Math.max(1, nt));
    const palette = TANK_COLORS.map((h) => new THREE.Color(h));
    for (let i = 0; i < nt; i++) {
      const o = i * 6;
      m.makeScale(t[o + 3], t[o + 4], t[o + 3]).setPosition(t[o], BASE + t[o + 1], t[o + 2]);
      tanks.setMatrixAt(i, m);
      tanks.setColorAt(i, palette[t[o + 5]]);
    }
    tanks.count = nt;
    for (const mesh of [rooms, tanks]) {
      mesh.frustumCulled = false;
      group.add(mesh);
    }
  }

  /* mosques */
  const glow = glowTexture();
  disposables.push(glow.texture);
  const lamps: THREE.PointsMaterial[] = [];
  {
    const md = data.mosques,
      nm = md.length / 4;
    const parts: THREE.BufferGeometry[] = [];
    const tops: number[] = [];
    const white = new THREE.Color('#f1eee6'),
      cream = new THREE.Color('#e7dcc3'),
      green = new THREE.Color('#2f7d55');
    const paint = (g: THREE.BufferGeometry, col: THREE.Color) => {
      const ng = g.index ? g.toNonIndexed() : g;
      if (ng !== g) g.dispose();
      ng.deleteAttribute('uv');
      const cols = new Float32Array(ng.attributes.position.count * 3);
      for (let v = 0; v < cols.length; v += 3) cols.set([col.r, col.g, col.b], v);
      ng.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      parts.push(ng);
    };
    for (let i = 0; i < nm; i++) {
      const [x, z, size, corner] = [md[i * 4], md[i * 4 + 1], md[i * 4 + 2], md[i * 4 + 3]];
      const hall = size * 0.78,
        wallH = 10,
        domeR = hall * 0.34,
        domeCol = hash2(i, 3) < 0.5 ? green : white;
      paint(new THREE.BoxGeometry(hall, wallH, hall).translate(x, BASE + wallH / 2, z), white);
      paint(
        new THREE.CylinderGeometry(domeR * 0.92, domeR * 0.92, 2.2, 16, 1).translate(
          x,
          BASE + wallH + 1.1,
          z,
        ),
        cream,
      );
      paint(
        new THREE.SphereGeometry(domeR, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2).translate(
          x,
          BASE + wallH + 2.2,
          z,
        ),
        domeCol,
      );
      // The minaret at one corner of the site.
      const sx = corner & 1 ? 1 : -1,
        sz = corner & 2 ? 1 : -1;
      const mx = x + sx * (size / 2 - 2.2),
        mz = z + sz * (size / 2 - 2.2),
        mh = 34;
      paint(new THREE.CylinderGeometry(1.3, 1.7, mh, 10, 1).translate(mx, BASE + mh / 2, mz), white);
      paint(new THREE.CylinderGeometry(2.4, 2.1, 1.1, 10, 1).translate(mx, BASE + mh * 0.72, mz), cream);
      paint(new THREE.CylinderGeometry(1.5, 1.5, 3.2, 10, 1).translate(mx, BASE + mh + 1.6, mz), white);
      paint(new THREE.ConeGeometry(1.7, 4.4, 10, 1).translate(mx, BASE + mh + 5.4, mz), domeCol);
      tops.push(mx, BASE + mh + 2.2, mz);
    }
    if (parts.length) {
      const geo = mergeColored(parts);
      const mat = cityMaterial(opts.cheap, { vertexColors: true, roughness: 0.7 });
      addCloudShadows(mat, amb);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      group.add(mesh);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tops), 3));
      const mat2 = lampMaterial(glow.texture, '#59ff9a', 7);
      lamps.push(mat2);
      const pts = new THREE.Points(g, mat2);
      pts.frustumCulled = false;
      group.add(pts);
    }
  }

  /* street lights */
  {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(data.lights, 3));
    const mat = lampMaterial(glow.texture, '#ffcf8f', 5.5);
    lamps.push(mat);
    const pts = new THREE.Points(g, mat);
    pts.position.y = BASE;
    pts.frustumCulled = false;
    group.add(pts);
  }

  return {
    group,
    night,
    lamps,
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

/** Merges non-indexed geometries with position, normal and colour. */
function mergeColored(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color'] as const) {
    const total = parts.reduce((a, g) => a + g.getAttribute(name).array.length, 0);
    const arr = new Float32Array(total);
    let o = 0;
    for (const g of parts) {
      arr.set(g.getAttribute(name).array as Float32Array, o);
      o += g.getAttribute(name).array.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  for (const g of parts) g.dispose();
  out.computeBoundingSphere();
  return out;
}
