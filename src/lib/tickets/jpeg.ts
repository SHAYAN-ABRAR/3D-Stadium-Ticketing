/**
 * Minimal JPEG checks for uploaded seat-view pictures: the start and end markers, the frame size and the
 * presence of image data (a header alone is refused, so the PDF never embeds a broken picture).
 */

export const VIEW_WIDTH = 640;
export const VIEW_HEIGHT = 400;
export const VIEW_MAX_BYTES = 120 * 1024;
const VIEW_MIN_BYTES = 1024;

/** Walks the segments: the frame size from the first start-of-frame, and whether a scan follows. */
function segments(data: Uint8Array): { width: number; height: number; scan: boolean } | null {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return null;
  let size: { width: number; height: number } | null = null;
  let i = 2;
  while (i + 3 < data.length) {
    if (data[i] !== 0xff) return null;
    const marker = data[i + 1];
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (marker === 0xda) return size ? { ...size, scan: true } : null;
    if (marker === 0xd9) break;
    // SOF0-SOF15 carry the frame size, except DHT (C4), JPG (C8) and DAC (CC).
    if (!size && marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (i + 8 >= data.length) return null;
      size = { height: (data[i + 5] << 8) | data[i + 6], width: (data[i + 7] << 8) | data[i + 8] };
    }
    i += 2 + ((data[i + 2] << 8) | data[i + 3]);
  }
  return size ? { ...size, scan: false } : null;
}

/** Width and height from the first start-of-frame segment, or null when the data isn't a JPEG. */
export function jpegSize(data: Uint8Array): { width: number; height: number } | null {
  const s = segments(data);
  return s ? { width: s.width, height: s.height } : null;
}

/** Whether an upload is an acceptable seat-view picture: a whole 640 × 400 JPEG of 1 to 120 KB. */
export function isViewJpeg(data: Uint8Array): boolean {
  if (data.length < VIEW_MIN_BYTES || data.length > VIEW_MAX_BYTES) return false;
  if (data[data.length - 2] !== 0xff || data[data.length - 1] !== 0xd9) return false;
  const s = segments(data);
  return !!s && s.scan && s.width === VIEW_WIDTH && s.height === VIEW_HEIGHT;
}
