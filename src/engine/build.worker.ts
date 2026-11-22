/**
 * Build worker: generates seat instance data and paints the ground and shadow mask on OffscreenCanvases,
 * then transfers everything back without copying.
 */
import { computeBuildData } from './build-data';

/** The parts of DedicatedWorkerGlobalScope used here (the project compiles against the DOM lib). */
interface WorkerScope {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = async () => {
  try {
    const out = await computeBuildData(
      (w, h) => {
        const canvas = new OffscreenCanvas(w, h);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('OffscreenCanvas 2D is not available');
        return { canvas, ctx };
      },
      true,
      (value, step) => scope.postMessage({ type: 'progress', value, step }),
      async () => {},
    );
    const ground = (out.groundCanvas as OffscreenCanvas).transferToImageBitmap();
    const data = {
      seatMatrices: out.seatMatrices,
      seatColors: out.seatColors,
      trees: out.trees,
      cars: out.cars,
      shadowMask: out.shadowMask,
      ground,
      flipped: true,
    };
    scope.postMessage({ type: 'done', data }, [
      out.seatMatrices.buffer,
      out.seatColors.buffer,
      out.trees.buffer,
      out.cars.buffer,
      out.shadowMask.buffer,
      ground,
    ]);
  } catch (err) {
    scope.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
