/**
 * The run of N adjacent free seats containing a seat, most centred on it (used by the list panel; the
 * engine applies the same rule to the seat under the pointer).
 */
import { getLayout, type StadiumLayout } from '@/lib/stadium';

export function runAroundSeat(
  statuses: Uint8Array,
  seat: number,
  n: number,
  allowed: (i: number) => boolean,
  layout: StadiumLayout = getLayout(),
): number[] | null {
  if (seat < 0 || seat >= layout.bowlSeatCount) return null;
  const b = layout.blocks[layout.blockOf[seat]],
    r = layout.rowOf[seat] - 1;
  const first = b.rowFirst[r],
    len = b.rowLen[r],
    k = seat - first;
  let best = -1,
    bestD = Infinity;
  for (let start = Math.max(0, k - n + 1); start <= Math.min(k, len - n); start++) {
    let ok = true;
    for (let j = start; j < start + n; j++) {
      const s = first + j;
      if (statuses[s] !== 0 || !allowed(s)) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const d = Math.abs(start + (n - 1) / 2 - k);
    if (d < bestD) {
      bestD = d;
      best = start;
    }
  }
  return best < 0 ? null : Array.from({ length: n }, (_, j) => first + best + j);
}
