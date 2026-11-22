/**
 * Camera rig ported from the prototype (app.js): orbit views and first-person look views, cubic Bezier
 * flights with a 'dir' mode that turns yaw and pitch inside a window, smootherstep easing, near-plane
 * interpolation, lens fitting for portrait screens, and UI-aware framing with setViewOffset.
 */
import * as THREE from 'three';
import type { BlockInfo, StadiumLayout, StandInfo } from '@/lib/stadium';

const PI = Math.PI;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
/** Smootherstep: zero first and second derivatives at both ends. */
export const smooth = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export interface OrbitView {
  type: 'orbit';
  target: THREE.Vector3;
  radius: number;
  polar: number;
  azim: number;
  fov: number;
  near: number;
  /** Limits for dragging and zooming: radius, polar angle, and azimuth (centre, half-range). */
  lim?: { r: [number, number]; p: [number, number]; a?: [number, number] };
}

export interface LookView {
  type: 'look';
  eye: THREE.Vector3;
  yaw: number;
  pitch: number;
  fov: number;
  near: number;
  lim: { y: [number, number]; p: [number, number] };
}

export type View = OrbitView | LookView;

export interface Pose {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  fov: number;
  near: number;
}

export interface FlightOptions {
  dur?: number;
  lift?: number;
  mode?: 'target' | 'dir';
  turn?: [number, number];
  c1?: (from: Pose, to: Pose) => THREE.Vector3;
  c2?: (from: Pose, to: Pose) => THREE.Vector3;
}

interface Flight {
  from: Pose;
  to: Pose;
  c1: THREE.Vector3;
  c2: THREE.Vector3;
  dur: number;
  t0: number;
  mode: 'target' | 'dir';
  turn: [number, number];
  view: View;
  resolve: (ok: boolean) => void;
}

export const lookDir = (yaw: number, pitch: number) => {
  const c = Math.cos(pitch);
  return new THREE.Vector3(c * Math.cos(yaw), Math.sin(pitch), c * Math.sin(yaw));
};
export const aim = (from: THREE.Vector3, to: THREE.Vector3) => {
  const d = to.clone().sub(from);
  return { yaw: Math.atan2(d.z, d.x), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) };
};

export function poseOf(v: View): Pose {
  if (v.type === 'orbit') {
    const sp = Math.sin(v.polar);
    return {
      pos: new THREE.Vector3(
        v.target.x + v.radius * sp * Math.cos(v.azim),
        v.target.y + v.radius * Math.cos(v.polar),
        v.target.z + v.radius * sp * Math.sin(v.azim),
      ),
      look: v.target.clone(),
      fov: v.fov,
      near: v.near,
    };
  }
  return {
    pos: v.eye.clone(),
    look: v.eye.clone().addScaledVector(lookDir(v.yaw, v.pitch), 60),
    fov: v.fov,
    near: v.near,
  };
}

function bez(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, t: number) {
  const u = 1 - t;
  return new THREE.Vector3()
    .addScaledVector(a, u * u * u)
    .addScaledVector(b, 3 * u * u * t)
    .addScaledVector(c, 3 * u * t * t)
    .addScaledVector(d, t * t * t);
}

export class CameraRig {
  readonly camera = new THREE.PerspectiveCamera(40, 1, 2, 16000);
  cssW = 1;
  cssH = 1;
  /** The pose currently applied, and the settled view (null while flying). */
  cur: Pose | null = null;
  view: View | null = null;
  flight: Flight | null = null;
  /** Framing offset (eased towards tx, ty) and the resulting view-offset window. */
  readonly off = { x: 0, y: 0, tx: 0, ty: 0 };
  readonly vo = { fw: 1, fh: 1, x: 0, y: 0 };
  private insets = { right: 0, bottom: 0 };

  constructor(public reduceMotion: boolean) {}

  setSize(w: number, h: number) {
    this.cssW = Math.max(1, w);
    this.cssH = Math.max(1, h);
    this.targetOffset();
    this.off.x = this.off.tx;
    this.off.y = this.off.ty;
    if (this.cur) this.applyPose(this.cur);
  }

  /** UI-aware framing: the picture's centre moves away from a right panel and a bottom ticket/sheet. */
  setInsets(right: number, bottom: number) {
    this.insets = { right: Math.max(0, right), bottom: Math.max(0, bottom) };
    this.targetOffset();
  }

  private targetOffset() {
    this.off.tx = -this.insets.right / 2;
    this.off.ty = -Math.min(this.insets.bottom * 0.5, this.cssH * 0.3);
  }

  /** Eases the framing offset; returns true while it is still moving. */
  stepOffset(dt: number): boolean {
    const k = this.reduceMotion ? 1 : 1 - Math.exp(-dt * 5),
      dx = this.off.tx - this.off.x,
      dy = this.off.ty - this.off.y;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      if (dx || dy) {
        this.off.x = this.off.tx;
        this.off.y = this.off.ty;
        return true;
      }
      return false;
    }
    this.off.x += dx * k;
    this.off.y += dy * k;
    return true;
  }

  get aspect() {
    return this.cssW / this.cssH;
  }

  /** On tall, narrow screens the lens widens. */
  lens(fov: number) {
    return this.aspect < 0.9 ? fov + 10 : fov;
  }

  /** Backs off until a subject `width` metres wide fits across (capped at base * cap). */
  fit(base: number, width: number, fov: number, cap: number) {
    const hf = Math.atan(Math.tan((fov * PI) / 360) * this.aspect);
    return clamp(width / 2 / Math.tan(hf), base, base * cap);
  }

  applyProjection(fov: number, near: number) {
    const { off, vo, camera } = this;
    const ax = Math.abs(off.x),
      ay = Math.abs(off.y);
    vo.fw = this.cssW + 2 * ax;
    vo.fh = this.cssH + 2 * ay;
    vo.x = off.x < 0 ? 2 * ax : 0;
    vo.y = off.y < 0 ? 2 * ay : 0;
    camera.fov = (2 * Math.atan(Math.tan((fov * PI) / 360) * (vo.fh / this.cssH)) * 180) / PI;
    camera.near = near;
    camera.aspect = vo.fw / vo.fh;
    camera.setViewOffset(vo.fw, vo.fh, vo.x, vo.y, this.cssW, this.cssH);
  }

  applyPose(p: Pose) {
    this.cur = p;
    this.camera.position.copy(p.pos);
    this.camera.lookAt(p.look);
    this.applyProjection(p.fov, p.near);
  }

  /* ---------- views ---------- */

  introView(): OrbitView {
    const f = this.lens(40);
    return {
      type: 'orbit',
      target: new THREE.Vector3(0, 0, 0),
      radius: this.fit(800, 420, f, 2.2),
      polar: 0.02,
      azim: PI / 2,
      fov: f,
      near: 4,
    };
  }

  overviewView(): OrbitView {
    const f = this.lens(40),
      r = this.fit(430, 330, f, 2.2);
    return {
      type: 'orbit',
      target: new THREE.Vector3(0, 8, 0),
      radius: r,
      polar: 0.9,
      azim: 1.95,
      lim: { r: [170, Math.max(820, r * 1.4)], p: [0.18, 1.3] },
      fov: f,
      near: 3,
    };
  }

  /**
   * The home hero: lower and closer than the overview, aimed low so the bowl sits high in the frame (lower
   * still on tall screens, where the headline covers the bottom half).
   */
  heroView(): OrbitView {
    const f = this.lens(34),
      r = this.fit(340, 300, f, 2.4);
    return {
      type: 'orbit',
      target: new THREE.Vector3(0, this.aspect < 0.9 ? -48 : -14, 0),
      radius: r,
      polar: 1.06,
      azim: 2.05,
      fov: f,
      near: 3,
    };
  }

  standView(st: StandInfo): OrbitView {
    const az = Math.atan2(-st.normal[1], -st.normal[0]),
      f = this.lens(42),
      r = this.fit(st.long ? 165 : 150, 120, f, 1.7);
    return {
      type: 'orbit',
      target: new THREE.Vector3(st.center[0], st.center[1] + 4, st.center[2]),
      radius: r,
      polar: 1.13,
      azim: az,
      lim: { r: [60, Math.max(200, r * 1.2)], p: [0.9, 1.42], a: [az, 0.5] },
      fov: f,
      near: 1,
    };
  }

  blockView(b: BlockInfo): OrbitView {
    const az = Math.atan2(-b.normal[1], -b.normal[0]),
      f = this.lens(45),
      r = this.fit(30 + b.tier * 4, 22, f, 1.6);
    return {
      type: 'orbit',
      target: new THREE.Vector3(b.center[0], b.center[1], b.center[2]),
      radius: r,
      polar: 1.17,
      azim: az,
      lim: { r: [12, Math.max(75, r * 1.3)], p: [0.85, 1.5], a: [az, 0.65] },
      fov: f,
      near: 0.25,
    };
  }

  seatView(layout: StadiumLayout, i: number): LookView {
    const p = layout.positions,
      n = layout.normals;
    const eye = new THREE.Vector3(
        p[i * 3] - n[i * 2] * 0.03,
        p[i * 3 + 1] + 1.2,
        p[i * 3 + 2] - n[i * 2 + 1] * 0.03,
      ),
      a = aim(eye, new THREE.Vector3(0, 0.5, 0));
    return {
      type: 'look',
      eye,
      yaw: a.yaw,
      pitch: a.pitch,
      lim: { y: [a.yaw, 1.35], p: [-0.8, 0.5] },
      fov: 58,
      near: 0.05,
    };
  }

  boxView(toWorld: (x: number, y: number, z: number) => THREE.Vector3): LookView {
    const eye = toWorld(0, 1.0 + 1.62, 4.85),
      a = aim(eye, new THREE.Vector3(0, 1.5, 0));
    return {
      type: 'look',
      eye,
      yaw: a.yaw,
      pitch: a.pitch,
      lim: { y: [a.yaw, 1.2], p: [-0.75, 0.45] },
      fov: 64,
      near: 0.05,
    };
  }

  vipView(
    toWorld: (x: number, y: number, z: number) => THREE.Vector3,
    chair: { x: number; y: number; z: number },
  ): LookView {
    const eye = toWorld(chair.x, chair.y + 1.18, chair.z + 0.06),
      a = aim(eye, new THREE.Vector3(0, 0.5, 0));
    return {
      type: 'look',
      eye,
      yaw: a.yaw,
      pitch: a.pitch,
      lim: { y: [a.yaw, 1.2], p: [-0.75, 0.45] },
      fov: 60,
      near: 0.05,
    };
  }

  /* ---------- flights ---------- */

  /** Flies to a view in one continuous move. Resolves true when it lands, false if interrupted. */
  flyTo(view: View, o: FlightOptions = {}): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.flight) this.flight.resolve(false);
      const to = poseOf(view),
        from: Pose = this.cur
          ? { pos: this.cur.pos.clone(), look: this.cur.look.clone(), fov: this.cur.fov, near: this.cur.near }
          : to;
      const dist = from.pos.distanceTo(to.pos),
        up = new THREE.Vector3(0, 1, 0),
        lift = o.lift === undefined ? 0.12 : o.lift;
      const dur = this.reduceMotion ? 0.001 : (o.dur ?? clamp(1.25 + dist / 230, 1.3, 3.4));
      const c1 = o.c1
        ? o.c1(from, to)
        : from.pos
            .clone()
            .lerp(to.pos, 0.33)
            .addScaledVector(up, dist * lift);
      const c2 = o.c2
        ? o.c2(from, to)
        : to.pos
            .clone()
            .lerp(from.pos, 0.33)
            .addScaledVector(up, dist * lift);
      this.flight = {
        from,
        to,
        c1,
        c2,
        dur,
        t0: performance.now(),
        mode: o.mode || 'target',
        turn: o.turn || [0, 1],
        view,
        resolve,
      };
      this.view = null;
    });
  }

  /** Lands immediately at the view (deep links, skipped intros). */
  jumpTo(view: View) {
    if (this.flight) {
      const f = this.flight;
      this.flight = null;
      f.resolve(false);
    }
    this.view = view;
    this.applyPose(poseOf(view));
  }

  /** Finishes the current flight now (any input skips the intro). */
  finishFlight() {
    const f = this.flight;
    if (!f) return;
    this.flight = null;
    this.view = f.view;
    this.applyPose(poseOf(f.view));
    f.resolve(true);
  }

  /** Advances the flight; returns true while flying. */
  stepFlight(now: number): boolean {
    const f = this.flight;
    if (!f) return false;
    let t = (now - f.t0) / 1000 / f.dur;
    if (t > 1) t = 1;
    const e = smooth(t),
      pos = bez(f.from.pos, f.c1, f.c2, f.to.pos, e);
    let look: THREE.Vector3;
    if (f.mode === 'dir') {
      const a = aim(f.from.pos, f.from.look),
        b = aim(f.to.pos, f.to.look),
        k = smooth(clamp((t - f.turn[0]) / (f.turn[1] - f.turn[0]), 0, 1));
      look = pos.clone().add(lookDir(a.yaw + wrapA(b.yaw - a.yaw) * k, a.pitch + (b.pitch - a.pitch) * k));
    } else look = f.from.look.clone().lerp(f.to.look, e);
    this.applyPose({
      pos,
      look,
      fov: f.from.fov + (f.to.fov - f.from.fov) * e,
      near: Math.exp(Math.log(f.from.near) + (Math.log(f.to.near) - Math.log(f.from.near)) * e),
    });
    if (t >= 1) {
      this.flight = null;
      this.view = f.view;
      f.resolve(true);
    }
    return true;
  }

  /* ---------- user control ---------- */

  drag(dx: number, dy: number): boolean {
    const v = this.view;
    if (!v || this.flight) return false;
    if (v.type === 'orbit') {
      v.azim += dx * 0.005;
      if (v.lim?.a) v.azim = v.lim.a[0] + clamp(wrapA(v.azim - v.lim.a[0]), -v.lim.a[1], v.lim.a[1]);
      if (v.lim) v.polar = clamp(v.polar - dy * 0.004, v.lim.p[0], v.lim.p[1]);
    } else {
      v.yaw -= dx * 0.0042;
      v.yaw = v.lim.y[0] + clamp(wrapA(v.yaw - v.lim.y[0]), -v.lim.y[1], v.lim.y[1]);
      v.pitch = clamp(v.pitch + dy * 0.0042, v.lim.p[0], v.lim.p[1]);
    }
    return true;
  }

  zoom(delta: number): boolean {
    const v = this.view;
    if (!v || this.flight) return false;
    if (v.type === 'orbit') {
      if (v.lim) v.radius = clamp(v.radius * Math.exp(delta * 0.0012), v.lim.r[0], v.lim.r[1]);
    } else v.fov = clamp(v.fov * Math.exp(delta * 0.001), 28, 80);
    return true;
  }

  /** Applies the settled view (after drag, zoom or idle orbit) or refreshes the projection mid-flight. */
  refresh() {
    if (!this.flight && this.view) this.applyPose(poseOf(this.view));
    else if (this.cur) this.applyProjection(this.cur.fov, this.cur.near);
  }

  /** Screen position (CSS pixels) of a world point, and whether it is in front of the camera. */
  screenOf(p: THREE.Vector3, out = new THREE.Vector3()): { x: number; y: number; visible: boolean } {
    out.copy(p).project(this.camera);
    return {
      x: ((out.x + 1) / 2) * this.cssW,
      y: ((1 - out.y) / 2) * this.cssH,
      visible: out.z < 1 && Math.abs(out.x) < 1.02 && Math.abs(out.y) < 1.02,
    };
  }

  rayAt(x: number, y: number, raycaster: THREE.Raycaster) {
    raycaster.setFromCamera(
      new THREE.Vector2((x / this.cssW) * 2 - 1, -(y / this.cssH) * 2 + 1),
      this.camera,
    );
    return raycaster.ray;
  }
}
