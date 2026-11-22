'use client';
/**
 * View snapshots as object URLs, cached (least recently used goes first) so hovering the same seat again
 * or reopening a ticket doesn't render again. Blobs are kept for uploading ticket pictures after payment.
 */
import type { SnapshotView, StadiumEngine } from '@/engine';

interface Entry {
  url: string;
  blob: Blob;
}

const MAX = 48;
const cache = new Map<string, Entry>();
const pending = new Map<string, Promise<Entry | null>>();

export const viewKey = (v: SnapshotView, w: number, h: number) =>
  `${v.kind}:${v.kind === 'seat' ? v.seat : v.kind === 'box' ? v.box : `${v.box}.${v.chair}`}:${w}x${h}`;

export function cachedView(key: string): Entry | undefined {
  const e = cache.get(key);
  if (e) {
    cache.delete(key);
    cache.set(key, e);
  }
  return e;
}

export function snapshotView(
  engine: StadiumEngine,
  v: SnapshotView,
  w: number,
  h: number,
): Promise<Entry | null> {
  const key = viewKey(v, w, h);
  const hit = cachedView(key);
  if (hit) return Promise.resolve(hit);
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  const p = engine
    .snapshot(v, w, h, 0.82)
    .then((blob) => {
      if (!blob) return null;
      const entry = { url: URL.createObjectURL(blob), blob };
      cache.set(key, entry);
      while (cache.size > MAX) {
        const oldest = cache.keys().next().value as string;
        URL.revokeObjectURL(cache.get(oldest)!.url);
        cache.delete(oldest);
      }
      return entry;
    })
    .catch(() => null)
    .finally(() => pending.delete(key));
  pending.set(key, p);
  return p;
}
