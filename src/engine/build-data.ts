/**
 * The heavy, CPU-only part of building the stadium: seat matrices and colours, tree and car placement,
 * and the painted ground and shadow mask (the pitch is drawn per pixel in a shader: world/details.ts). Runs
 * in the build worker (with OffscreenCanvas) or, as a fallback, on the main thread in chunks. No three.js.
 */
import { getLayout } from '@/lib/stadium';
import { buildCityData, type CityData } from './world/city-data';
import { drawGround, drawGroundShadows, GROUND_PX, placeCars, placeTrees, type Ctx2D } from './world/park';
import { seatBaseColors, seatMatrices } from './world/seat-data';

/** Shadow mask resolution (single channel). */
export const SHADOW_MASK_PX = 2048;

export interface BuildData {
  seatMatrices: Float32Array;
  seatColors: Float32Array;
  /** Trees packed as [x, z, h, r, conifer (0/1), tint] per tree: the park's, then the city's. */
  trees: Float32Array;
  /** The neighbourhood around the park (its trees are in `trees`). */
  city: Omit<CityData, 'trees'>;
  /** Cars packed as [x, z, rot, colour] per car. */
  cars: Float32Array;
  /** Painted ground: an ImageBitmap drawn upside down (from the worker) or a canvas. */
  ground: ImageBitmap | HTMLCanvasElement;
  /** True when the ground is a pre-flipped bitmap (upload with flipY = false). */
  flipped: boolean;
  /** Single-channel shadow mask, SHADOW_MASK_PX square, rows top to bottom (north first). */
  shadowMask: Uint8Array;
}

export type Progress = (value: number, step: string) => void;

export type CanvasFactory = (
  w: number,
  h: number,
) => { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: Ctx2D };

/** Pauses so the main thread can paint (no-op in the worker). */
export type Yield = () => Promise<void>;

export async function computeBuildData(
  makeCanvas: CanvasFactory,
  flip: boolean,
  progress: Progress,
  pause: Yield,
): Promise<Omit<BuildData, 'ground'> & { groundCanvas: OffscreenCanvas | HTMLCanvasElement }> {
  const layout = getLayout();
  progress(0.08, 'seats');
  await pause();
  const matrices = seatMatrices(layout);
  const colors = seatBaseColors(layout);
  progress(0.2, 'park');
  await pause();

  const treeList = placeTrees(),
    carList = placeCars();
  const { trees: cityTrees, ...city } = buildCityData();
  const trees = new Float32Array(treeList.length * 6 + cityTrees.length);
  treeList.forEach((t, i) => trees.set([t.x, t.z, t.h, t.r, t.conifer ? 1 : 0, t.tint], i * 6));
  trees.set(cityTrees, treeList.length * 6);
  const cars = new Float32Array(carList.length * 4);
  carList.forEach((c, i) => cars.set([c.x, c.z, c.rot, c.c], i * 4));
  progress(0.3, 'ground');
  await pause();

  const g = makeCanvas(GROUND_PX, GROUND_PX);
  drawGround(g.ctx, flip);
  progress(0.45, 'shadows');
  await pause();

  // The mask is uploaded as raw single-channel data, so it is never flipped: row 0 is north.
  const s = makeCanvas(SHADOW_MASK_PX, SHADOW_MASK_PX);
  drawGroundShadows(s.ctx, SHADOW_MASK_PX, treeList, carList, false);
  const rgba = s.ctx.getImageData(0, 0, SHADOW_MASK_PX, SHADOW_MASK_PX).data;
  const shadowMask = new Uint8Array(SHADOW_MASK_PX * SHADOW_MASK_PX);
  for (let i = 0, j = 0; i < shadowMask.length; i++, j += 4) shadowMask[i] = rgba[j];
  progress(0.58, 'done');
  return {
    seatMatrices: matrices,
    seatColors: colors,
    trees,
    cars,
    city,
    groundCanvas: g.canvas,
    flipped: flip,
    shadowMask,
  };
}
