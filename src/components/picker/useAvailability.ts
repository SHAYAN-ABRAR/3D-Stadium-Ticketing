'use client';
/**
 * Availability: a full read, then live changes from the data store (this tab, other tabs, the sales
 * simulator). Changes recolour only the seats that changed; a gap in versions, a "reload" notice or a
 * return to the tab reads everything again.
 */
import { useEffect } from 'react';
import { getLayout } from '@/lib/stadium';
import type { PickerBackend } from '@/lib/picker/backend';
import { applyAvailability, usePicker } from './store';

export function useAvailability(backend: PickerBackend | null) {
  useEffect(() => {
    if (!backend) return;
    let alive = true;
    const seatCount = getLayout().totalSeatCount;

    const load = async () => {
      const { version, statuses } = await backend.seats();
      if (!alive) return;
      if (statuses.length !== seatCount) {
        // Data written by a different layout: never paint wrong seats.
        console.error(`Seat count mismatch: data ${statuses.length}, layout ${seatCount}`);
        return;
      }
      applyAvailability(statuses, version, null);
    };

    const off = backend.onSeats((u) => {
      const s = usePicker.getState();
      if ('reload' in u || !s.statuses || u.version !== s.version + 1) {
        if (!('reload' in u) && s.statuses && u.version <= s.version) return; // already applied
        void load();
        return;
      }
      const next = s.statuses.slice();
      for (const [i, st] of u.changes) if (i >= 0 && i < next.length) next[i] = st;
      applyAvailability(next, u.version, u.changes);
    });
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      off();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [backend]);
}
