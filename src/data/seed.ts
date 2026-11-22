/**
 * Sample data, created in the visitor's browser on the first visit: the six sample events (kick-offs counted
 * from that visit), their price categories, and each event's clustered "already sold" pattern. Block 232 row
 * 10 seats 5-11 stay free in every on-sale event. Data older than two weeks is rebuilt so the events stay in
 * the future, unless the visitor has bought tickets (their orders are kept).
 */
import { protectedSeats, SAMPLE_EVENTS, samplePublicEvent } from '@/lib/events/samples';
import { getLayout, soldPattern } from '@/lib/stadium';
import type { EventRow, SeatsRow, StadiumDb } from './db';

export const SEED_VERSION = 1;
const REBUILD_AFTER_MS = 14 * 86_400_000;

interface SeedMeta {
  version: number;
  seededAt: number;
}

export interface SeedOptions {
  /** Only these sample events (tests). */
  only?: string[];
  /** Override every event's sold share (tests). */
  soldOverride?: number;
}

/** Lets the browser paint and handle input between chunks of CPU work. */
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function buildSampleData(
  now: number,
  opts: SeedOptions,
): Promise<{ events: EventRow[]; seats: SeatsRow[] }> {
  const total = getLayout().totalSeatCount;
  const events: EventRow[] = [];
  const seats: SeatsRow[] = [];
  for (const def of SAMPLE_EVENTS) {
    if (opts.only && !opts.only.includes(def.slug)) continue;
    // One event's pattern per task, so the first visit never blocks the page for long.
    await pause();
    const event = samplePublicEvent(def.slug, new Date(now))!;
    const statuses = new Uint8Array(total);
    const target = opts.soldOverride ?? def.sold;
    if (target > 0) {
      const sold = soldPattern({
        seed: def.slug,
        target,
        scatter: def.scatter,
        keepFree: def.status === 'on_sale' ? protectedSeats() : [],
      });
      for (let i = 0; i < Math.min(sold.length, total); i++) if (sold[i]) statuses[i] = 2;
    }
    events.push(event);
    seats.push({ eventId: event.id, version: 1, statuses });
  }
  return { events, seats };
}

/** Creates (or rebuilds) the sample data when needed. Returns whether it wrote anything. */
export async function seedIfNeeded(db: StadiumDb, now: number, opts: SeedOptions = {}): Promise<boolean> {
  const meta = (await db.meta.get('seed'))?.value as SeedMeta | undefined;
  const stale = !!meta && (meta.version !== SEED_VERSION || now - meta.seededAt > REBUILD_AFTER_MS);
  if (meta && !stale) return false;
  if (stale && (await db.orders.count()) > 0) return false;
  // The patterns are CPU work: build them before the transaction, then write everything at once.
  const data = await buildSampleData(now, opts);
  return db.transaction('rw', [db.events, db.seats, db.holds, db.views, db.meta], async () => {
    const current = (await db.meta.get('seed'))?.value as SeedMeta | undefined;
    // Another tab seeded in the meantime.
    if (current && current.seededAt !== meta?.seededAt) return false;
    await Promise.all([db.events.clear(), db.seats.clear(), db.holds.clear(), db.views.clear()]);
    await db.events.bulkPut(data.events);
    await db.seats.bulkPut(data.seats);
    await db.meta.put({ key: 'seed', value: { version: SEED_VERSION, seededAt: now } satisfies SeedMeta });
    return true;
  });
}
