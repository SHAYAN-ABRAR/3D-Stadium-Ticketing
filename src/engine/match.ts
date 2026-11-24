/**
 * The match on the pitch, while the stadium shows its match-day crowd (match-sim.ts plays it): 22 players
 * in the two teams' colours, the keepers in their own colours, the referee and the assistants in black, and
 * the ball. Players are low-poly figures in one instanced mesh with a run cycle and raised arms (goal
 * celebrations) in the vertex shader; soft blob shadows lie under them (the sun's shadow map is static).
 * With ambient animation off (tests, reduced motion, Low) everyone stands still in the kick-off shape.
 */
import * as THREE from 'three';
import { BALL_R, MatchSim } from './match-sim';
import { canvasTexture, type TextureText } from './world/textures';
import { addCloudShadows, patchMaterial, type AmbientUniforms } from './world/shading';

const FADE_S = 0.4;

/** Shorts that contrast with the shirt; the keepers wear yellow and orange, the officials black. */
function kits(home: string, away: string) {
  const lum = (h: string) => {
    const c = new THREE.Color(h);
    return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  };
  const shorts = (shirt: string) => (lum(shirt) > 0.45 ? '#1f2a33' : '#f4f4f1');
  return [
    { shirt: home, shorts: shorts(home), socks: home, keeper: '#f2c230' },
    { shirt: away, shorts: shorts(away), socks: away, keeper: '#f08a24' },
    { shirt: '#17191d', shorts: '#17191d', socks: '#17191d', keeper: '#17191d' },
  ];
}

const SKINS = ['#e9bd97', '#c99169', '#a26d48', '#7d4f33', '#5e3a26'];

/** Part ids of the figure's vertices (the shader colours and animates them). */
const PART = { shirt: 0, skin: 1, hair: 2, shorts: 3, legL: 4, legR: 5, armL: 6, armR: 7 } as const;

function figureGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, part: number) => {
    const ng = g.index ? g.toNonIndexed() : g;
    if (ng !== g) g.dispose();
    ng.deleteAttribute('uv');
    ng.setAttribute(
      'aPart',
      new THREE.Float32BufferAttribute(new Float32Array(ng.attributes.position.count).fill(part), 1),
    );
    parts.push(ng);
  };
  add(new THREE.BoxGeometry(0.44, 0.58, 0.25).translate(0, 1.13, 0), PART.shirt);
  add(new THREE.BoxGeometry(0.42, 0.26, 0.25).translate(0, 0.79, 0), PART.shorts);
  add(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 6, 1, true).translate(0, 1.46, 0), PART.skin);
  add(new THREE.SphereGeometry(0.12, 8, 6).translate(0, 1.6, 0.01), PART.skin);
  add(
    new THREE.SphereGeometry(0.128, 8, 3, 0, Math.PI * 2, 0, Math.PI * 0.45).translate(0, 1.625, -0.005),
    PART.hair,
  );
  for (const s of [-1, 1]) {
    // Legs hang from the hip (+-0.1, 0.78, 0); arms from the shoulder (+-0.275, 1.38, 0).
    add(new THREE.BoxGeometry(0.15, 0.78, 0.16).translate(0.1 * s, 0.39, 0), s < 0 ? PART.legL : PART.legR);
    add(new THREE.BoxGeometry(0.1, 0.56, 0.12).translate(0.275 * s, 1.1, 0), s < 0 ? PART.armL : PART.armR);
  }
  const out = new THREE.BufferGeometry();
  for (const n of ['position', 'normal', 'aPart'] as const) {
    const size = parts[0].getAttribute(n).itemSize;
    const total = parts.reduce((a, g) => a + g.getAttribute(n).array.length, 0);
    const arr = new Float32Array(total);
    let o = 0;
    for (const g of parts) {
      arr.set(g.getAttribute(n).array as Float32Array, o);
      o += g.getAttribute(n).array.length;
    }
    out.setAttribute(n, new THREE.BufferAttribute(arr, size));
  }
  for (const g of parts) g.dispose();
  out.computeBoundingSphere();
  return out;
}

function figureMaterial(amb: AmbientUniforms) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0 });
  patchMaterial(mat, 'players', (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aPart;
attribute vec3 aShirt;
attribute vec3 aShorts;
attribute vec3 aSocks;
attribute vec3 aSkin;
attribute vec3 aMotion;
varying vec3 vPColor;`,
      )
      .replace(
        '#include <uv_vertex>',
        /* glsl */ `
// aMotion: run phase, stride (0 standing to 1 sprinting), arms up (0-1, celebrations).
float pLeg = aPart == 4.0 ? 1.0 : aPart == 5.0 ? -1.0 : 0.0;
float pArm = aPart == 6.0 ? 1.0 : aPart == 7.0 ? -1.0 : 0.0;
float pSwing = sin(aMotion.x) * aMotion.y;
float pAng = pLeg * pSwing * 0.85 - pArm * pSwing * 0.7 * (1.0 - aMotion.z);
// Raised arms swing out sideways and up, about the shoulder.
float pRaise = pArm * aMotion.z * 2.6;
vec3 pPivot = pLeg != 0.0 ? vec3(-0.1 * pLeg, 0.78, 0.0) : vec3(-0.275 * pArm, 1.38, 0.0);
float pC = cos(pAng), pS = sin(pAng);
float pRc = cos(pRaise), pRs = sin(pRaise);
vPColor = aPart == 0.0 || pArm != 0.0 ? aShirt : aPart == 3.0 ? aShorts : aPart == 2.0 ? vec3(0.09, 0.07, 0.06) : aSkin;
// Short sleeves: forearms and hands are skin.
if (pArm != 0.0 && position.y < 1.16) vPColor = aSkin;
if (pLeg != 0.0) vPColor = position.y < 0.08 ? vec3(0.05) : position.y < 0.42 ? aSocks : aSkin;
#include <uv_vertex>`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        /* glsl */ `vec3 objectNormal = vec3(normal);
if (pArm != 0.0) objectNormal = vec3(pRc * objectNormal.x + pRs * objectNormal.y, -pRs * objectNormal.x + pRc * objectNormal.y, objectNormal.z);
if (pLeg != 0.0 || pArm != 0.0) objectNormal = vec3(objectNormal.x, pC * objectNormal.y - pS * objectNormal.z, pS * objectNormal.y + pC * objectNormal.z);`,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `vec3 transformed = vec3(position);
if (pLeg != 0.0 || pArm != 0.0) {
  vec3 r = transformed - pPivot;
  if (pArm != 0.0) r = vec3(pRc * r.x + pRs * r.y, -pRs * r.x + pRc * r.y, r.z);
  r = vec3(r.x, pC * r.y - pS * r.z, pS * r.y + pC * r.z);
  transformed = pPivot + r;
}
// A slight forward lean when running.
transformed.z += aMotion.y * 0.16 * max(0.0, transformed.y - 0.8);`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPColor;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vPColor;');
  });
  addCloudShadows(mat, amb);
  return mat;
}

function blobTexture() {
  return canvasTexture(
    64,
    64,
    (x, w, h) => {
      const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(0,0,0,0.55)');
      g.addColorStop(0.6, 'rgba(0,0,0,0.25)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.clearRect(0, 0, w, h);
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
    },
    { wrapS: THREE.ClampToEdgeWrapping },
  );
}

export class Match {
  readonly group = new THREE.Group();
  readonly sim = new MatchSim();
  private readonly figures: THREE.InstancedMesh;
  private readonly shadows: THREE.InstancedMesh;
  private readonly ballMesh: THREE.Mesh;
  private readonly motion: THREE.InstancedBufferAttribute;
  private readonly blob: THREE.Texture;
  private fade = 0;
  private target = 0;
  /** Off in tests and with reduced motion: no fade. */
  instant = false;

  constructor(text: Pick<TextureText, 'homeColor' | 'awayColor'>, amb: AmbientUniforms) {
    const kit = kits(text.homeColor || '#1f46b8', text.awayColor || '#b3121c');
    const players = this.sim.players;
    const n = players.length;
    const geo = figureGeometry();
    const attr = (name: string, size: number) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(n * size), size);
      geo.setAttribute(name, a);
      return a;
    };
    const shirt = attr('aShirt', 3),
      shorts = attr('aShorts', 3),
      socks = attr('aSocks', 3),
      skin = attr('aSkin', 3);
    this.motion = attr('aMotion', 3);
    this.motion.setUsage(THREE.DynamicDrawUsage);
    const c = new THREE.Color();
    players.forEach((p, i) => {
      const k = kit[p.team];
      const keeper = p.role === 'gk';
      c.set(keeper ? k.keeper : k.shirt).toArray(shirt.array, i * 3);
      c.set(keeper ? k.keeper : k.shorts).toArray(shorts.array, i * 3);
      c.set(keeper ? k.keeper : k.socks).toArray(socks.array, i * 3);
      c.set(SKINS[(i * 7 + 3) % SKINS.length]).toArray(skin.array, i * 3);
    });
    this.figures = new THREE.InstancedMesh(geo, figureMaterial(amb), n);
    this.figures.frustumCulled = false;

    this.blob = blobTexture().texture;
    this.shadows = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: this.blob, transparent: true, depthWrite: false }),
      n + 1,
    );
    this.shadows.frustumCulled = false;
    this.shadows.renderOrder = 1;

    const ballMat = new THREE.MeshStandardMaterial({ color: '#f7f7f4', roughness: 0.45 });
    addCloudShadows(ballMat, amb);
    this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 12, 8), ballMat);

    this.group.add(this.shadows, this.figures, this.ballMesh);
    this.group.visible = false;
    this.place();
  }

  /** Called when a team scores (the crowd and the screens celebrate). */
  set onGoal(fn: ((team: 0 | 1) => void) | null) {
    this.sim.onGoal = fn;
  }

  /** Whether the players are (fading) on the pitch. */
  get visible() {
    return this.fade > 0;
  }

  /** Shows or hides the match with a 400 ms fade (instant in tests and with reduced motion). */
  setShown(on: boolean) {
    this.target = on ? 1 : 0;
    if (this.instant) this.fade = this.target;
    this.group.visible = this.fade > 0;
    this.place();
  }

  /**
   * Advances the fade and, with ambient animation, the match. Returns true while the fade runs (the frame
   * loop needs frames for it; the play itself rides on the ambient frames).
   */
  update(dt: number, animate: boolean): boolean {
    let busy = false;
    if (this.fade !== this.target) {
      const step = dt / FADE_S;
      this.fade = this.target > this.fade ? Math.min(1, this.fade + step) : Math.max(0, this.fade - step);
      busy = true;
    }
    this.group.visible = this.fade > 0;
    if (!this.group.visible) return busy;
    if (animate) {
      // Small steps keep the ball and the players steady at low frame rates.
      let t = Math.min(dt, 0.1);
      while (t > 1e-6) {
        const h = Math.min(t, 1 / 30);
        this.sim.step(h);
        t -= h;
      }
    }
    this.place();
    return busy;
  }

  dispose() {
    this.figures.geometry.dispose();
    (this.figures.material as THREE.Material).dispose();
    this.figures.dispose();
    this.shadows.geometry.dispose();
    (this.shadows.material as THREE.Material).dispose();
    this.shadows.dispose();
    this.ballMesh.geometry.dispose();
    (this.ballMesh.material as THREE.Material).dispose();
    this.blob.dispose();
  }

  private place() {
    const m = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      up = new THREE.Vector3(0, 1, 0),
      s = new THREE.Vector3(),
      pos = new THREE.Vector3();
    const motion = this.motion.array as Float32Array;
    const f = this.fade;
    const players = this.sim.players,
      cel = this.sim.celebrating;
    players.forEach((p, i) => {
      q.setFromAxisAngle(up, p.yaw);
      s.setScalar(f);
      pos.set(p.x, 0.03, p.z);
      this.figures.setMatrixAt(i, m.compose(pos, q, s));
      const sp = Math.hypot(p.vx, p.vz);
      const joy = cel && p.team === cel.team ? (i === cel.scorer ? 1 : 0.6) : 0;
      motion[i * 3] = p.phase;
      motion[i * 3 + 1] = Math.min(1, sp / 7);
      motion[i * 3 + 2] = joy;
      pos.set(p.x, 0.045, p.z);
      s.set(1.15 * f, 1, 1.15 * f);
      this.shadows.setMatrixAt(i, m.compose(pos, q.identity(), s));
    });
    const b = this.sim.ball;
    this.ballMesh.position.set(b.x, b.y, b.z);
    this.ballMesh.scale.setScalar(f);
    pos.set(b.x, 0.046, b.z);
    const bs = 0.5 * f * Math.max(0.4, 1 - (b.y - BALL_R) / 8);
    s.set(bs, 1, bs);
    this.shadows.setMatrixAt(players.length, m.compose(pos, q.identity(), s));
    this.figures.instanceMatrix.needsUpdate = true;
    this.shadows.instanceMatrix.needsUpdate = true;
    this.motion.needsUpdate = true;
  }
}
