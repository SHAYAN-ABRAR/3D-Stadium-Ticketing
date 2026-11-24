import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';

export const SHOTS_DIR = path.join(process.cwd(), 'test-results', 'shots');

/** Screenshot into test-results/shots/ (software WebGL needs a long timeout). */
export async function shot(page: Page, name: string) {
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`), timeout: 120_000 });
}

/** Waits until the engine is ready and not flying. Never use fixed sleeps for 3D state. */
export async function settled(page: Page) {
  await page.waitForFunction(() => window.__stadium?.ready && !window.__stadium.flying, null, {
    timeout: 600_000,
    polling: 250,
  });
}

/** Waits until the engine has reached a level and stopped flying. */
export async function atLevel(page: Page, level: string) {
  await page.waitForFunction(
    (lv) => window.__stadium?.ready && !window.__stadium.flying && window.__stadium.level === lv,
    level,
    { timeout: 600_000, polling: 250 },
  );
}

/** Frames rendered so far, to check that the engine has finished drawing a change. */
export async function frames(page: Page): Promise<number> {
  return page.evaluate(() => window.__stadium?.frames ?? 0);
}

/**
 * Waits until the engine sleeps: nothing scheduled and no flight, on three polls in a row. (Counting
 * frames over a quiet spell misreads a single frame that takes longer than the spell, which happens with
 * software rendering.)
 */
export async function idle(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __quietPolls?: number }).__quietPolls = 0;
  });
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __quietPolls?: number };
      const s = window.__stadium;
      if (!s?.ready || s.busy) {
        w.__quietPolls = 0;
        return false;
      }
      w.__quietPolls = (w.__quietPolls ?? 0) + 1;
      return w.__quietPolls >= 3;
    },
    null,
    { timeout: 600_000, polling: 300 },
  );
}

/**
 * Collects console errors and page errors for the assertion at the end of a test. `expected` lists console
 * messages the test provokes on purpose (Chrome logs every 4xx response, for example the 409 of a lost seat).
 */
export function collectErrors(page: Page, expected: RegExp[] = []): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // Chrome logs the performance hint for synchronous pixel reads (GPU picking) as a GL driver message.
    if (/GPU stall due to ReadPixels/.test(t)) return;
    if (expected.some((re) => re.test(t))) return;
    errors.push(t.split('\n')[0]);
  });
  return errors;
}

export const PICKER_QUERY = 'quality=low&freeze=1';

/** Waits until the page's data store is open (window.__data, E2E builds only) and returns nothing. */
export async function storeReady(page: Page) {
  await page.waitForFunction(() => !!window.__data, null, { timeout: 120_000 });
  await page.evaluate(() => window.__data!.ready());
}
