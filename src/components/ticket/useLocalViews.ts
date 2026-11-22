'use client';
/** Seat-view pictures kept by the data store for some seats (before checkout), as object URLs. */
import { useEffect, useState } from 'react';
import { getStore } from '@/data';

export function useLocalViews(eventId: string, seats: number[]): Map<number, string> {
  const [urls, setUrls] = useState<Map<number, string>>(() => new Map());
  const key = seats.join(',');
  useEffect(() => {
    let alive = true;
    const made: string[] = [];
    const list = key ? key.split(',').map(Number) : [];
    void getStore()
      .loadViews(eventId, list)
      .then((found) => {
        if (!alive) return;
        const out = new Map<number, string>();
        for (const [seat, blob] of found) {
          const url = URL.createObjectURL(blob);
          made.push(url);
          out.set(seat, url);
        }
        setUrls(out);
      })
      .catch(() => {});
    return () => {
      alive = false;
      for (const url of made) URL.revokeObjectURL(url);
    };
  }, [eventId, key]);
  return urls;
}
