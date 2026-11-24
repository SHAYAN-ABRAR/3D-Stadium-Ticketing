import { describe, expect, it } from 'vitest';
import { BALL_R, HALF_L, HALF_W, MatchSim } from '@/engine/match-sim';

const DT = 1 / 30;

/** Plays `seconds` of a match and records what happened. */
function play(seconds: number, seed = 7) {
  const sim = new MatchSim(seed);
  const goals: { team: number; at: number }[] = [];
  let t = 0;
  sim.onGoal = (team) => goals.push({ team, at: t });
  const possession = [0, 0];
  const phases = new Map<string, number>();
  let worst = { ballX: 0, ballZ: 0, ballY: 0, lowY: Infinity, playerX: 0, playerZ: 0 };
  let finite = true;
  for (; t < seconds; t += DT) {
    sim.step(DT);
    const b = sim.ball;
    phases.set(sim.phase.kind, (phases.get(sim.phase.kind) ?? 0) + DT);
    if (b.owner >= 0) possession[sim.players[b.owner].team as 0 | 1] += DT;
    worst = {
      ballX: Math.max(worst.ballX, Math.abs(b.x)),
      ballZ: Math.max(worst.ballZ, Math.abs(b.z)),
      ballY: Math.max(worst.ballY, b.y),
      lowY: Math.min(worst.lowY, b.y),
      playerX: Math.max(worst.playerX, ...sim.players.map((p) => Math.abs(p.x))),
      playerZ: Math.max(worst.playerZ, ...sim.players.map((p) => Math.abs(p.z))),
    };
    for (const v of [b.x, b.y, b.z, ...sim.players.flatMap((p) => [p.x, p.z, p.vx, p.vz, p.yaw])])
      if (!Number.isFinite(v)) finite = false;
  }
  return { sim, goals, possession, phases: Object.fromEntries(phases), worst, finite };
}

describe('the match on the pitch', () => {
  const ten = play(600);

  it('plays ten minutes without anything going wrong', () => {
    expect(ten.finite).toBe(true);
    // The ball can be in the net (0.8 m behind the line) or just over a line before it is called out.
    expect(ten.worst.ballX).toBeLessThan(HALF_L + 1.6);
    expect(ten.worst.ballZ).toBeLessThan(HALF_W + 1.6);
    expect(ten.worst.lowY).toBeGreaterThanOrEqual(BALL_R - 1e-9);
    expect(ten.worst.ballY).toBeLessThan(25);
    expect(ten.worst.playerX).toBeLessThanOrEqual(HALF_L + 3);
    expect(ten.worst.playerZ).toBeLessThanOrEqual(HALF_W + 3);
  });

  it('plays like football over half an hour, for several seeds', () => {
    for (const seed of [7, 42, 2026]) {
      const m = play(1800, seed);
      const { passes, shots, tackles, goalsFromShots } = m.sim.stats;
      const goals = m.goals.length;
      const owned = m.possession[0] + m.possession[1];
      const s = `seed ${seed}`;
      // Lively but believable: a goal every few minutes, so a visitor who stays a while sees one.
      expect(passes, s).toBeGreaterThan(400);
      expect(shots, s).toBeGreaterThan(25);
      expect(shots, s).toBeLessThan(110);
      expect(goals, s).toBeGreaterThanOrEqual(3);
      expect(goals, s).toBeLessThanOrEqual(14);
      expect(goalsFromShots, s).toBe(goals);
      expect(tackles, s).toBeGreaterThan(30);
      expect(Math.min(...m.possession) / owned, s).toBeGreaterThan(0.35);
      // The ball is mostly in play: few, quick restarts.
      expect(m.phases.play / 1800, s).toBeGreaterThan(0.75);
      expect((m.phases.restart ?? 0) / 1800, s).toBeLessThan(0.08);
    }
  });

  it('celebrates a goal, walks back and kicks off again', () => {
    const sim = new MatchSim(42);
    let scored = -1,
      t = 0;
    sim.onGoal = (team) => (scored = team);
    while (scored < 0 && t < 1800) {
      sim.step(DT);
      t += DT;
    }
    expect(scored).toBeGreaterThanOrEqual(0);
    expect(sim.phase.kind).toBe('celebrate');
    const conceding = scored === 0 ? 1 : 0;
    // Celebration, the walk back, the kick-off: play resumes within half a minute, the other side kicking off.
    let resumed = 0;
    for (let k = 0; k < 30 / DT && !resumed; k++) {
      sim.step(DT);
      if (sim.phase.kind === 'kickoff') expect(sim.ball.team).toBe(conceding);
      if (sim.phase.kind === 'play') resumed = k * DT;
    }
    expect(resumed).toBeGreaterThan(6);
  });

  it('is the same for the same seed and different for another', () => {
    const a = play(60),
      b = play(60),
      c = play(60, 99);
    expect(b.sim.players.map((p) => [p.x, p.z])).toEqual(a.sim.players.map((p) => [p.x, p.z]));
    expect(c.sim.players.map((p) => [p.x, p.z])).not.toEqual(a.sim.players.map((p) => [p.x, p.z]));
  });
});
