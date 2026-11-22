/**
 * Main-thread side of the build: runs build.worker.ts (or falls back to building on the main thread in
 * chunks) and caches the CPU-side results at module level, so a second mount (home, then an event page)
 * skips generation entirely.
 */
import { computeBuildData, type BuildData, type Progress } from './build-data';

let cache: Promise<BuildData> | null = null;
let listeners: Progress[] = [];

const emit: Progress = (value, step) => {
  for (const l of listeners) l(value, step);
};

/** Lets the browser paint between chunks of main-thread work. */
const yieldToBrowser = () =>
  new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    requestAnimationFrame(() => setTimeout(finish, 0));
    setTimeout(finish, 80);
  });

async function buildOnMainThread(): Promise<BuildData> {
  const out = await computeBuildData(
    (w, h) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Canvas 2D is not available');
      return { canvas, ctx };
    },
    false,
    emit,
    yieldToBrowser,
  );
  return {
    seatMatrices: out.seatMatrices,
    seatColors: out.seatColors,
    trees: out.trees,
    cars: out.cars,
    shadowMask: out.shadowMask,
    ground: out.groundCanvas as HTMLCanvasElement,
    flipped: false,
  };
}

function workerSupported(): boolean {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return false;
  try {
    return !!new OffscreenCanvas(1, 1).getContext('2d');
  } catch {
    return false;
  }
}

function buildInWorker(): Promise<BuildData> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./build.worker.ts', import.meta.url), { type: 'module' });
    } catch (err) {
      reject(err);
      return;
    }
    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as {
        type: string;
        value?: number;
        step?: string;
        data?: BuildData;
        message?: string;
      };
      if (msg.type === 'progress') emit(msg.value ?? 0, msg.step ?? '');
      else if (msg.type === 'done' && msg.data) {
        worker.terminate();
        resolve(msg.data);
      } else if (msg.type === 'error') {
        worker.terminate();
        reject(new Error(msg.message));
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || 'Build worker failed'));
    };
    worker.postMessage({ type: 'build' });
  });
}

/** Seat data, park and painted textures. Cached for the lifetime of the tab. */
export function loadBuildData(progress?: Progress): { promise: Promise<BuildData>; unsubscribe: () => void } {
  if (progress) listeners.push(progress);
  const unsubscribe = () => {
    listeners = listeners.filter((l) => l !== progress);
  };
  if (!cache) {
    cache = (
      workerSupported() ? buildInWorker().catch(() => buildOnMainThread()) : buildOnMainThread()
    ).catch((err) => {
      cache = null;
      throw err;
    });
  }
  return { promise: cache, unsubscribe };
}
