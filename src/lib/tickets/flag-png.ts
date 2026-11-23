/**
 * Team flags as PNG pictures for the ticket PDF (pdf-lib can't draw SVG). They are drawn in the browser
 * from the flag SVGs: 4:3 at 320 × 240 inside an 8 px margin that leaves room for a soft edge following
 * the flag's outline (Nepal's flag isn't a rectangle).
 */
import { flagOf } from '@/lib/events/flags';

/** Size of the PNG and the margin around the 320 × 240 flag. */
export const FLAG_PNG = { width: 336, height: 256, margin: 8 } as const;

/** A team's flag as PNG bytes, or null (no flag for the team, or the browser couldn't draw it). */
export async function flagPng(team: string): Promise<Uint8Array | null> {
  const src = flagOf(team);
  if (!src || typeof document === 'undefined') return null;
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = FLAG_PNG.width;
    canvas.height = FLAG_PNG.height;
    const g = canvas.getContext('2d');
    if (!g) return null;
    g.shadowColor = 'rgba(0, 0, 0, 0.45)';
    g.shadowBlur = 3;
    const m = FLAG_PNG.margin;
    g.drawImage(img, m, m, FLAG_PNG.width - 2 * m, FLAG_PNG.height - 2 * m);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } catch {
    return null;
  }
}
