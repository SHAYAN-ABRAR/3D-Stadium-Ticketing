/**
 * Simulated buyers, so a stadium that lives in one browser still feels like a live sale: every few seconds a
 * "buyer" holds 1-4 adjacent free seats (grey in the picker), then after 15-60 s buys them (70%) or walks
 * away. It runs while an event page is open, in one tab at a time (a Web Lock per event), never touches
 * the protected seats or closed blocks, and stops near sell-out. The data store completes simulated holds,
 * so they finish even after the tab closes. Off in tests unless a test starts it (CLAUDE.md).
 */
import { protectedSeats } from '@/lib/events/samples';
import { sellThroughOf } from '@/lib/events/summary';
import { isOnSale, type PublicEvent } from '@/lib/events/types';
import { getLayout, type BlockInfo } from '@/lib/stadium';
import type { SeatState } from './store';

export interface SimHost {
  getEvent(eventId: string): Promise<PublicEvent | null>;
  seats(eventId: string): Promise<SeatState>;
  addSimHold(eventId: string, seats: number[], buys: boolean, ms: number): Promise<boolean>;
  activeSimHolds(eventId: string): Promise<number>;
  sweep(): Promise<void>;
}

export interface SimulatorOptions {
  /** Mean time between buyers (default 4.5 s). */
  intervalMs?: number;
  random?: () => number;
}

const MAX_ACTIVE = 6;
const STOP_AT_SELL_THROUGH = 0.985;
/** Group sizes: singles are rare, pairs common. */
const GROUP_SIZES = [1, 2, 2, 2, 3, 4, 4];

export class SalesSimulator {
  private readonly interval: number;
  private readonly random: () => number;
  private readonly keep = new Set(protectedSeats());

  constructor(
    private readonly host: SimHost,
    private readonly eventId: string,
    opts: SimulatorOptions = {},
  ) {
    this.interval = opts.intervalMs ?? 4500;
    this.random = opts.random ?? Math.random;
  }

  /** Starts in this tab unless another tab already simulates this event. Returns the stop function. */
  start(): () => void {
    let stopped = false;
    let wake: (() => void) | null = null;
    const abort = new AbortController();
    const loop = async () => {
      while (!stopped) {
        try {
          await this.step();
        } catch (e) {
          console.warn('[simulator] step failed:', e);
        }
        const wait = this.interval * (0.5 + this.random());
        await new Promise<void>((resolve) => {
          wake = resolve;
          setTimeout(resolve, wait);
        });
      }
    };
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (locks) {
      locks.request(`stadium-sim:${this.eventId}`, { signal: abort.signal }, loop).catch(() => {
        // Aborted while waiting for the lock: another tab was simulating.
      });
    } else {
      void loop();
    }
    return () => {
      stopped = true;
      abort.abort();
      wake?.();
    };
  }

  /** One buyer (exposed for tests). */
  async step(): Promise<number[] | null> {
    await this.host.sweep();
    const event = await this.host.getEvent(this.eventId);
    if (!event || !isOnSale(event)) return null;
    if ((await this.host.activeSimHolds(this.eventId)) >= MAX_ACTIVE) return null;
    const { statuses } = await this.host.seats(this.eventId);
    if (sellThroughOf(statuses) >= STOP_AT_SELL_THROUGH) return null;
    const seats = this.pickSeats(statuses, new Set(event.closedBlocks));
    if (!seats) return null;
    const buys = this.random() < 0.7;
    const ms = 15_000 + this.random() * 45_000;
    return (await this.host.addSimHold(this.eventId, seats, buys, ms)) ? seats : null;
  }

  /** A run of adjacent free seats in a block chosen by desirability (pricier blocks sell faster). */
  private pickSeats(statuses: Uint8Array, closed: Set<number>): number[] | null {
    const L = getLayout();
    const blocks = L.blocks.filter((b) => !closed.has(b.index));
    const weights = blocks.map((b) => b.defaultPrice * (1.2 - b.c * 0.4));
    const sum = weights.reduce((a, b) => a + b, 0);
    const size = GROUP_SIZES[Math.floor(this.random() * GROUP_SIZES.length)];
    for (let tries = 0; tries < 12; tries++) {
      let r = this.random() * sum;
      let block: BlockInfo = blocks[blocks.length - 1];
      for (let k = 0; k < blocks.length; k++) {
        r -= weights[k];
        if (r <= 0) {
          block = blocks[k];
          break;
        }
      }
      const row = Math.floor(this.random() * block.rows);
      const first = block.rowFirst[row];
      const len = block.rowLen[row];
      const starts: number[] = [];
      for (let s = first; s + size <= first + len; s++) {
        let ok = true;
        for (let i = s; i < s + size && ok; i++) ok = statuses[i] === 0 && !this.keep.has(i);
        if (ok) starts.push(s);
      }
      if (!starts.length) continue;
      const s = starts[Math.floor(this.random() * starts.length)];
      return Array.from({ length: size }, (_, k) => s + k);
    }
    return null;
  }
}
