/**
 * The match's simulation (no three.js, so it can be tested on its own): two teams of eleven in a 4-4-2, the
 * referee, two assistant referees and the ball. Each side keeps its shape and slides with the ball; the
 * player on the ball dribbles, then passes to an open team-mate further forward or shoots from range; the
 * nearest opponent presses and can win the ball, and anyone close to a loose ball can take it (a pass is
 * meant for one player). Keepers track shots and save some. The ball flies, bounces and rolls. Throw-ins,
 * corners and goal kicks are taken by a player who walks over to the ball; after a goal the scorer runs to
 * the corner flag, then everyone walks back for the kick-off. The assistants follow the second-last
 * defender along their touchline. Deterministic for a seed. Metres and seconds; the pitch is 105 x 68 m
 * with the goal lines at x = +-52.5; team 0 attacks +x.
 */

export const HALF_L = 52.5,
  HALF_W = 34,
  POST = 3.66,
  BAR = 2.44,
  /** Drawn a little larger than a real ball (0.11 m), so it can be seen from the stands. */
  BALL_R = 0.2;

export type Role = 'gk' | 'def' | 'mid' | 'fwd' | 'ref' | 'ar';

export interface SimPlayer {
  team: 0 | 1 | 2;
  role: Role;
  /** Formation anchor: share of the way from own goal to the other (0-1), and z. */
  af: number;
  az: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Facing (0 = +z), and the run cycle's phase. */
  yaw: number;
  phase: number;
}

export interface SimBall {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** The player on the ball, or -1. */
  owner: number;
  /** The team that touched it last, the player a pass is meant for (-1 when none) and where it should arrive. */
  team: 0 | 1;
  target: number;
  tx: number;
  tz: number;
}

type Phase =
  | { kind: 'kickoff'; wait: number }
  | { kind: 'play' }
  | { kind: 'restart'; taker: number; x: number; z: number; wait: number; timeout: number }
  | { kind: 'celebrate'; scorer: number; team: 0 | 1; t: number }
  | { kind: 'reset'; kicking: 0 | 1; t: number };

/** 4-4-2: keeper, back four, four in midfield, two up front (share of the pitch, z). */
const SHAPE: readonly [Role, number, number][] = [
  ['gk', 0.02, 0],
  ['def', 0.2, -22],
  ['def', 0.18, -7.5],
  ['def', 0.18, 7.5],
  ['def', 0.2, 22],
  ['mid', 0.42, -23],
  ['mid', 0.4, -7],
  ['mid', 0.4, 7],
  ['mid', 0.42, 23],
  ['fwd', 0.62, -8],
  ['fwd', 0.62, 8],
];

const CELEBRATE_S = 6,
  RESET_S = 12,
  KICKOFF_WAIT_S = 2;

export class MatchSim {
  readonly players: SimPlayer[] = [];
  readonly ball: SimBall = {
    x: 0,
    y: BALL_R,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    owner: -1,
    team: 0,
    target: -1,
    tx: 0,
    tz: 0,
  };
  readonly score: [number, number] = [0, 0];
  readonly stats = { passes: 0, shots: 0, saves: 0, tackles: 0, restarts: 0, goalsFromShots: 0 };
  /** Called when a team scores. */
  onGoal: ((team: 0 | 1) => void) | null = null;
  phase: Phase = { kind: 'kickoff', wait: KICKOFF_WAIT_S };
  /** Seconds until the player on the ball decides what to do. */
  private decide = 1;
  /** The shot in the air: whether the keeper will hold it, and which keeper. */
  private shot: { saved: boolean; keeper: number } | null = null;
  private seed: number;

  constructor(seed = 7) {
    this.seed = Math.abs(Math.floor(seed)) % 2147483647 || 1;
    for (const team of [0, 1] as const)
      for (const [role, af, az] of SHAPE)
        this.players.push({ team, role, af, az, x: 0, z: 0, vx: 0, vz: 0, yaw: 0, phase: this.rand() * 6 });
    this.players.push({ team: 2, role: 'ref', af: 0.5, az: 0, x: 0, z: 0, vx: 0, vz: 0, yaw: 0, phase: 1 });
    // The assistants: one on each touchline, each covering one half.
    this.players.push({ team: 2, role: 'ar', af: 1, az: -1, x: 0, z: 0, vx: 0, vz: 0, yaw: 0, phase: 2 });
    this.players.push({ team: 2, role: 'ar', af: -1, az: 1, x: 0, z: 0, vx: 0, vz: 0, yaw: 0, phase: 3 });
    this.kickOff(0);
  }

  /** The goal being celebrated, if any. */
  get celebrating(): { scorer: number; team: 0 | 1 } | null {
    return this.phase.kind === 'celebrate' ? this.phase : null;
  }

  /** Advances the match by dt seconds (callers keep dt at or below 1/30 s). */
  step(dt: number) {
    const ph = this.phase;
    switch (ph.kind) {
      case 'kickoff':
        ph.wait -= dt;
        this.movePlayers(dt);
        if (ph.wait <= 0) this.phase = { kind: 'play' };
        return;
      case 'celebrate':
        ph.t -= dt;
        this.movePlayers(dt);
        if (ph.t <= 0) this.phase = { kind: 'reset', kicking: ph.team === 0 ? 1 : 0, t: RESET_S };
        return;
      case 'reset':
        ph.t -= dt;
        this.movePlayers(dt);
        if (ph.t <= 0 || this.allAtSpots(ph.kicking, 1.2)) this.kickOff(ph.kicking);
        return;
      case 'restart': {
        this.movePlayers(dt);
        const tk = this.players[ph.taker];
        ph.timeout -= dt;
        if (ph.timeout <= 0) {
          tk.x = ph.x;
          tk.z = ph.z;
        }
        if (Math.hypot(tk.x - ph.x, tk.z - ph.z) < 0.9) {
          ph.wait -= dt;
          if (ph.wait <= 0) {
            this.give(ph.taker);
            this.decide = 0.25;
            this.phase = { kind: 'play' };
          }
        }
        return;
      }
      case 'play':
        if (this.ball.owner >= 0) this.onTheBall(dt);
        else this.freeBall(dt);
        if (this.phase.kind === 'play' || this.phase.kind === 'restart') this.movePlayers(dt);
        return;
    }
  }

  /* ---------------- set pieces ---------------- */

  private rand() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  /** x of a share of the pitch for a team (0 = own goal line). */
  private fx(team: number, f: number) {
    return team === 0 ? -HALF_L + f * 2 * HALF_L : HALF_L - f * 2 * HALF_L;
  }

  /** The kicker at a kick-off: the first forward of the team kicking off. */
  private kicker(team: 0 | 1) {
    return this.players.findIndex((p) => p.team === team && p.role === 'fwd');
  }

  /** Where a player stands for a kick-off. */
  private spot(i: number, kicking: 0 | 1): [number, number] {
    const p = this.players[i];
    if (p.role === 'ref') return [0, -12];
    if (p.role === 'ar') return [p.af * HALF_L * 0.5, p.az * (HALF_W + 1.4)];
    if (i === this.kicker(kicking)) return [this.fx(kicking, 0.497), 0];
    return [this.fx(p.team, Math.min(0.47, p.af * 0.78)), p.az];
  }

  private allAtSpots(kicking: 0 | 1, tol: number) {
    return this.players.every((p, i) => {
      const [x, z] = this.spot(i, kicking);
      return Math.hypot(p.x - x, p.z - z) < tol;
    });
  }

  /** Kick-off: everyone on their spot, the ball on the centre spot with the kicker. */
  private kickOff(team: 0 | 1) {
    this.players.forEach((p, i) => {
      [p.x, p.z] = this.spot(i, team);
      p.vx = p.vz = 0;
      p.yaw = p.team === 2 ? 0 : p.team === 1 ? -Math.PI / 2 : Math.PI / 2;
    });
    const k = this.kicker(team);
    Object.assign(this.ball, { x: 0, y: BALL_R, z: 0, vx: 0, vy: 0, vz: 0, owner: k, team, target: -1 });
    this.decide = 0.4;
    this.shot = null;
    this.phase = { kind: 'kickoff', wait: KICKOFF_WAIT_S };
  }

  /** A dead ball at (x, z): the taker walks over and takes it. */
  private restart(taker: number, x: number, z: number) {
    const b = this.ball;
    Object.assign(b, { x, y: BALL_R, z, vx: 0, vy: 0, vz: 0, owner: -1, target: -1 });
    b.team = this.players[taker].team as 0 | 1;
    this.shot = null;
    this.stats.restarts++;
    this.phase = { kind: 'restart', taker, x, z, wait: 0.5, timeout: 9 };
  }

  /** The nearest outfield player of a team to a point. */
  private nearest(team: number, x: number, z: number) {
    let best = -1,
      d = Infinity;
    this.players.forEach((q, i) => {
      if (q.team !== team || q.role === 'gk') return;
      const e = Math.hypot(q.x - x, q.z - z);
      if (e < d) {
        d = e;
        best = i;
      }
    });
    return best;
  }

  /* ---------------- open play ---------------- */

  /** The player on the ball dribbles, then passes or shoots; a close opponent may win it. */
  private onTheBall(dt: number) {
    const b = this.ball,
      p = this.players[b.owner];
    const team = p.team as 0 | 1;
    const dir = team === 0 ? 1 : -1;
    // The ball runs just ahead of the player's feet.
    b.x = p.x + Math.sin(p.yaw) * 0.55;
    b.z = p.z + Math.cos(p.yaw) * 0.55;
    b.y = BALL_R;
    b.vx = p.vx;
    b.vz = p.vz;
    b.team = team;
    if (Math.abs(b.x) >= HALF_L || Math.abs(b.z) >= HALF_W + 0.3) {
      // Carried over a line: the ball is loose, and out.
      b.owner = -1;
      return;
    }
    for (let i = 0; i < this.players.length; i++) {
      const o = this.players[i];
      if (o.team === p.team || o.team === 2 || p.role === 'gk') continue;
      if (Math.hypot(o.x - p.x, o.z - p.z) < 1.3 && this.rand() < 1.5 * dt) {
        // Tackled: the ball runs loose.
        b.owner = -1;
        b.team = o.team as 0 | 1;
        const a = Math.atan2(o.x - p.x, o.z - p.z) + Math.PI + (this.rand() - 0.5);
        b.vx = Math.sin(a) * 4;
        b.vz = Math.cos(a) * 4;
        this.decide = 0.8;
        this.stats.tackles++;
        return;
      }
    }
    this.decide -= dt;
    // Near the goal line there is no more room to dribble: shoot or pass now.
    if (p.x * dir > HALF_L - 7) this.decide = Math.min(this.decide, 0);
    if (this.decide > 0) return;
    if (p.role === 'gk') return this.pass(b.owner, true);
    const toGoal = Math.hypot(dir * HALF_L - p.x, p.z);
    if (toGoal < 22 && Math.abs(p.z) < 18 && this.rand() < 0.2) return this.shoot(b.owner);
    if (this.rand() < 0.78) return this.pass(b.owner, false);
    this.decide = 0.7 + this.rand() * 0.9;
  }

  private pass(from: number, long: boolean) {
    const b = this.ball,
      p = this.players[from];
    const dir = p.team === 0 ? 1 : -1;
    let best = -1,
      score = -Infinity;
    this.players.forEach((q, i) => {
      if (i === from || q.team !== p.team || q.role === 'gk') return;
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < 6 || (!long && d > 42)) return;
      let open = 9;
      for (const o of this.players)
        if (o.team !== p.team && o.team !== 2) open = Math.min(open, Math.hypot(o.x - q.x, o.z - q.z));
      const s =
        (q.x - p.x) * dir * 0.5 +
        open * 1.6 -
        Math.max(0, d - 28) * 0.6 +
        this.rand() * 6 +
        (long && q.role !== 'def' ? 10 : 0);
      if (s > score) {
        score = s;
        best = i;
      }
    });
    if (best < 0) {
      this.decide = 0.6;
      return;
    }
    const q = this.players[best];
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    const speed = Math.min(24, Math.max(11, d * 0.85 + 7));
    const t = d / speed;
    // Lead the receiver a little.
    const tx = q.x + q.vx * t * 0.8,
      tz = q.z + q.vz * t * 0.8;
    const dd = Math.hypot(tx - p.x, tz - p.z) || 1;
    b.owner = -1;
    b.target = best;
    b.tx = tx;
    b.tz = tz;
    b.vx = ((tx - p.x) / dd) * speed;
    b.vz = ((tz - p.z) / dd) * speed;
    b.vy = long || d > 32 ? Math.min(14, d * 0.2) : 0;
    this.decide = 0.6 + this.rand() * 1.2;
    this.stats.passes++;
  }

  private shoot(from: number) {
    const b = this.ball,
      p = this.players[from];
    const dir = p.team === 0 ? 1 : -1;
    // Under half the shots are on target, and the keeper holds most of those.
    const tz = (this.rand() - 0.5) * 2 * (POST + 4.5),
      ty = 0.3 + this.rand() * 2.1;
    const gx = dir * HALF_L;
    const d = Math.hypot(gx - p.x, tz - p.z),
      speed = 25,
      t = d / speed;
    b.owner = -1;
    b.target = -1;
    b.vx = ((gx - p.x) / d) * speed;
    b.vz = ((tz - p.z) / d) * speed;
    // Up so that gravity brings it to height ty at the goal line.
    b.vy = (ty - BALL_R + 4.9 * t * t) / t;
    const keeper = this.players.findIndex((k) => k.team !== p.team && k.role === 'gk');
    this.shot = { saved: Math.abs(tz) <= POST && this.rand() < 0.78, keeper };
    this.stats.shots++;
  }

  /** The ball flies, bounces and rolls; a player close to it controls it. Goals and the ball going out. */
  private freeBall(dt: number) {
    const b = this.ball;
    b.x += b.vx * dt;
    b.z += b.vz * dt;
    b.y += b.vy * dt;
    b.vy -= 9.8 * dt;
    if (b.y <= BALL_R) {
      b.y = BALL_R;
      b.vy = b.vy < -1.5 ? -b.vy * 0.42 : 0;
      const sp = Math.hypot(b.vx, b.vz);
      if (sp > 0) {
        const k = Math.max(0, sp - 2.4 * dt) / sp;
        b.vx *= k;
        b.vz *= k;
      }
    }
    // The keeper gets to a shot he will save (a dive covers a couple of metres).
    if (this.shot?.saved) {
      const k = this.players[this.shot.keeper];
      if (Math.hypot(k.x - b.x, k.z - b.z) < 2.4 && b.y < 2.7) {
        this.give(this.shot.keeper);
        this.shot = null;
        this.decide = 1.2;
        this.stats.saves++;
        return;
      }
    }
    if (Math.abs(b.x) >= HALF_L) {
      const side = b.x > 0 ? 1 : -1;
      if (Math.abs(b.z) < POST && b.y < BAR) {
        // Goal: the ball rests in the net; the nearest player of the scoring side is the scorer.
        const team: 0 | 1 = side > 0 ? 0 : 1;
        let scorer = -1,
          best = Infinity;
        this.players.forEach((q, i) => {
          const d = Math.hypot(q.x - b.x, q.z - b.z);
          if (q.team === team && q.role !== 'gk' && d < best) {
            best = d;
            scorer = i;
          }
        });
        Object.assign(b, { x: side * (HALF_L + 0.8), y: BALL_R, vx: 0, vy: 0, vz: 0, owner: -1, target: -1 });
        if (this.shot) this.stats.goalsFromShots++;
        this.shot = null;
        this.score[team]++;
        this.phase = { kind: 'celebrate', scorer, team, t: CELEBRATE_S };
        this.onGoal?.(team);
        return;
      }
      // Out over the goal line: a corner if the defending side touched it last, else a goal kick.
      const defending: 0 | 1 = side > 0 ? 1 : 0;
      const zs = b.z >= 0 ? 1 : -1;
      if (b.team === defending) {
        const attacking: 0 | 1 = defending === 0 ? 1 : 0;
        const cx = side * (HALF_L - 0.5),
          cz = zs * (HALF_W - 0.5);
        this.restart(this.nearest(attacking, cx, cz), cx, cz);
      } else {
        const keeper = this.players.findIndex((q) => q.role === 'gk' && q.team === defending);
        this.restart(keeper, side * (HALF_L - 5.5), zs * 9);
      }
      return;
    }
    if (Math.abs(b.z) >= HALF_W + 0.3) {
      // Out over the touchline: a throw-in for the other side.
      const team: 0 | 1 = b.team === 0 ? 1 : 0;
      const x = Math.max(-HALF_L + 1, Math.min(HALF_L - 1, b.x)),
        z = (b.z > 0 ? 1 : -1) * (HALF_W + 0.3);
      this.restart(this.nearest(team, x, z), x, z);
      return;
    }
    // Control: the intended receiver first, then anyone close enough.
    const sp = Math.hypot(b.vx, b.vz);
    for (let i = 0; i < this.players.length; i++) {
      const q = this.players[i];
      if (q.team === 2 || b.y > 1.7) continue;
      const d = Math.hypot(q.x - b.x, q.z - b.z);
      const meant = i === b.target;
      if (d > (meant ? 1.8 : 1.1)) continue;
      if (!meant && q.team === b.team && sp > 3) continue;
      if (!meant && sp > 9 && this.rand() > 0.35) continue;
      this.give(i);
      this.decide = 0.5 + this.rand() * 1.3;
      return;
    }
  }

  private give(i: number) {
    const b = this.ball,
      q = this.players[i];
    b.owner = i;
    b.team = q.team as 0 | 1;
    b.target = -1;
    b.vx = b.vy = b.vz = 0;
    b.y = BALL_R;
  }

  /* ---------------- movement ---------------- */

  /**
   * Where each player wants to be, and how fast they go there. `pressers`: the opponent closing down the
   * player on the ball, and near their own goal a second one covering the way to goal.
   */
  private targetOf(i: number, chasers: Set<number>, pressers: number[]): [number, number, number] {
    const b = this.ball,
      p = this.players[i],
      ph = this.phase;
    if (p.role === 'ar') {
      // Level with the second-last defender of the side defending this half, or the ball if further.
      const defending = p.af > 0 ? 1 : 0;
      const xs = this.players.filter((q) => q.team === defending).map((q) => q.x);
      xs.sort((a, c) => (p.af > 0 ? c - a : a - c));
      const line = p.af > 0 ? Math.max(xs[1] ?? 0, b.x) : Math.min(xs[1] ?? 0, b.x);
      const x = p.af > 0 ? Math.max(0, Math.min(HALF_L, line)) : Math.max(-HALF_L, Math.min(0, line));
      return [x, p.az * (HALF_W + 1.4), 6];
    }
    if (ph.kind === 'kickoff' || ph.kind === 'reset') {
      const [x, z] = this.spot(i, ph.kind === 'reset' ? ph.kicking : (b.team as 0 | 1));
      return [x, z, ph.kind === 'reset' ? 5.5 : 3];
    }
    if (p.role === 'ref') {
      // A diagonal behind play, out of the way of the ball.
      const x = Math.max(-40, Math.min(40, b.x - 10)),
        z = Math.max(-26, Math.min(26, b.z * 0.4 - (b.x / HALF_L) * 12));
      return [x, z, 5.5];
    }
    if (ph.kind === 'celebrate') {
      const s = this.players[ph.scorer];
      const cornerX = (ph.team === 0 ? 1 : -1) * (HALF_L - 3),
        cornerZ = (s.z >= 0 ? 1 : -1) * (HALF_W - 3);
      if (i === ph.scorer) return [cornerX, cornerZ, 7.5];
      if (p.team === ph.team && p.role !== 'gk')
        return [s.x + ((i % 3) - 1) * 1.6, s.z + ((i % 5) - 2) * 1.5, 6.5];
      const [x, z] = this.spot(i, ph.team === 0 ? 1 : 0);
      return [x, z, 1.8];
    }
    if (ph.kind === 'restart' && i === ph.taker) return [ph.x, ph.z, 6.5];
    if (i === b.owner) {
      // Dribble towards goal, drifting away from the touchline, never over a line.
      const dir = p.team === 0 ? 1 : -1;
      const x = Math.max(-HALF_L + 2, Math.min(HALF_L - 2, p.x + dir * 8)),
        z = Math.max(-HALF_W + 2, Math.min(HALF_W - 2, p.z * 0.85 + Math.sin(this.decide * 3 + i) * 2));
      return [x, z, p.role === 'gk' ? 0 : 5.4];
    }
    if (chasers.has(i)) {
      // The receiver runs to meet the pass where it will arrive, until it has gone past him; the other
      // side reads where the ball is going and steps into its path.
      if (i === b.target && (b.tx - b.x) * b.vx + (b.tz - b.z) * b.vz > 0) return [b.tx, b.tz, 7];
      if (p.team !== b.team) {
        const lead = Math.min(0.9, Math.hypot(p.x - b.x, p.z - b.z) / 12);
        return [b.x + b.vx * lead, b.z + b.vz * lead, 7.6];
      }
      return [b.x, b.z, 7.6];
    }
    if (pressers[0] === i) {
      const o = this.players[b.owner];
      return [o.x, o.z, 6.8];
    }
    if (pressers[1] === i) {
      const o = this.players[b.owner];
      const gx = this.fx(p.team, 0);
      return [o.x + (gx - o.x) * 0.22, o.z * 0.78, 6.4];
    }
    if (p.role === 'gk') {
      const gx = this.fx(p.team, 0.012);
      const dir = p.team === 0 ? 1 : -1;
      // Track a shot to where it will cross the line, otherwise the ball's side of the goal.
      if (this.shot && this.shot.keeper === i && b.owner < 0) {
        const t = Math.abs(b.vx) > 0.1 ? (gx - b.x) / b.vx : 0;
        return [gx, Math.max(-POST, Math.min(POST, b.z + b.vz * Math.max(0, t))), 8];
      }
      return [gx + dir * 1.2, Math.max(-3, Math.min(3, b.z * 0.12)), 3];
    }
    // The team's shape slides with the ball; forwards push on when the team has it.
    const own = (p.team === 0 ? b.x + HALF_L : HALF_L - b.x) / (2 * HALF_L);
    const has = b.team === p.team;
    const push = has ? (p.role === 'fwd' ? 0.12 : p.role === 'mid' ? 0.06 : 0.03) : -0.04;
    const f = Math.max(0.05, Math.min(0.95, p.af + (own - 0.5) * 0.55 + push));
    return [this.fx(p.team, f), p.az + (b.z - p.az) * 0.22, 4.2];
  }

  /** Steers everyone towards where they want to be, keeps them apart and turns them. */
  private movePlayers(dt: number) {
    const b = this.ball,
      ph = this.phase;
    const chasers = new Set<number>();
    if (ph.kind === 'play' && b.owner < 0) {
      // The nearest player of each side goes for a loose ball (the receiver for a pass).
      for (const team of [0, 1]) {
        let near = -1,
          best = Infinity;
        this.players.forEach((q, i) => {
          if (q.team !== team || q.role === 'gk') return;
          const d = i === b.target ? 0 : Math.hypot(q.x - b.x, q.z - b.z);
          if (d < best) {
            best = d;
            near = i;
          }
        });
        if (near >= 0) chasers.add(near);
      }
    }
    const pressers: number[] = [];
    if (ph.kind === 'play' && b.owner >= 0) {
      const owner = this.players[b.owner];
      if (owner.role !== 'gk') {
        const defending = owner.team === 0 ? 1 : 0;
        const first = this.nearest(defending, owner.x, owner.z);
        pressers.push(first);
        // In the last 35 m before their goal, a second defender covers.
        if (Math.abs(this.fx(defending, 0) - owner.x) < 35) {
          let second = -1,
            d = Infinity;
          this.players.forEach((q, i) => {
            if (q.team !== defending || q.role === 'gk' || i === first) return;
            const e = Math.hypot(q.x - owner.x, q.z - owner.z);
            if (e < d) {
              d = e;
              second = i;
            }
          });
          if (second >= 0) pressers.push(second);
        }
      }
    }
    const n = this.players.length;
    for (let i = 0; i < n; i++) {
      const p = this.players[i];
      const [tx, tz, top] = this.targetOf(i, chasers, pressers);
      const dx = tx - p.x,
        dz = tz - p.z,
        d = Math.hypot(dx, dz);
      // Arrive gently; accelerate at about 5 m/s².
      const want = d > 0.05 ? Math.min(top, d * 1.6) : 0;
      const wx = d > 0.05 ? (dx / d) * want : 0,
        wz = d > 0.05 ? (dz / d) * want : 0;
      const k = Math.min(1, dt * 5);
      p.vx += (wx - p.vx) * k;
      p.vz += (wz - p.vz) * k;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
    }
    // Keep a little space between players (the player on the ball and his marker may close in).
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const p = this.players[i],
          q = this.players[j];
        const dx = q.x - p.x,
          dz = q.z - p.z,
          d = Math.hypot(dx, dz);
        const min = i === b.owner || j === b.owner ? 0.75 : 0.95;
        if (d >= min || d < 1e-6) continue;
        const push = ((min - d) / d) * 0.25;
        p.x -= dx * push;
        p.z -= dz * push;
        q.x += dx * push;
        q.z += dz * push;
      }
    for (const p of this.players) {
      // Nobody strays far from the pitch (the assistants run just outside it).
      p.x = Math.max(-HALF_L - 3, Math.min(HALF_L + 3, p.x));
      p.z = Math.max(-HALF_W - 3, Math.min(HALF_W + 3, p.z));
      const sp = Math.hypot(p.vx, p.vz);
      // Face where they run, or the ball when (almost) standing.
      const face = sp > 0.6 ? Math.atan2(p.vx, p.vz) : Math.atan2(b.x - p.x, b.z - p.z);
      const dy = Math.atan2(Math.sin(face - p.yaw), Math.cos(face - p.yaw));
      p.yaw += dy * Math.min(1, dt * 7);
      p.phase += dt * sp * 2.9;
    }
  }
}
