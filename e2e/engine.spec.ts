import { expect, test } from '@playwright/test';
import { atLevel, collectErrors, idle, PICKER_QUERY, shot } from './helpers';

// Phase 2: the engine port. Visits every level through the test API, takes the reference screenshots,
// and checks the lifecycle (one canvas under Strict Mode, no frames while idle, no console errors).
test('engine renders every level, sleeps when idle and logs no errors', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`/events/cup-final?${PICKER_QUERY}`);
  await atLevel(page, 'overview');
  await expect(page.locator('canvas')).toHaveCount(1);
  await idle(page);
  await shot(page, 'engine-01-overview');

  // The scheduler renders nothing while nothing changes.
  const before = await page.evaluate(() => window.__stadium!.frames);
  await page.waitForTimeout(2000);
  expect(await page.evaluate(() => window.__stadium!.frames)).toBe(before);

  // Stand hover with the real mouse, then the North stand.
  const north = await page.evaluate(() => window.__stadium!.standScreen(3));
  await page.mouse.move(north.x, north.y);
  await idle(page);
  await shot(page, 'engine-02-stand-hover');
  await page.evaluate(() => window.__stadium!.goStand(3));
  await atLevel(page, 'stand');
  await idle(page);
  await shot(page, 'engine-03-stand');

  await page.evaluate(() => window.__stadium!.goBlock(232));
  await atLevel(page, 'block');
  await idle(page);
  await shot(page, 'engine-04-block');

  const seat = await page.evaluate(() => window.__stadium!.seatIndex(232, 10, 8));
  expect(seat).toBeGreaterThanOrEqual(0);
  await page.evaluate((i) => window.__stadium!.goSeat(i), seat);
  await atLevel(page, 'seat');
  await idle(page);
  await shot(page, 'engine-05-seat');

  await page.evaluate(() => window.__stadium!.goBox(9));
  await atLevel(page, 'box');
  await idle(page);
  await shot(page, 'engine-06-box');

  const chair = await page.evaluate(() => {
    const st = window.__stadium!.statuses;
    const first = st.length - 624 + 8 * 8; // Skybox 9 (index 8)
    return [1, 2, 0, 3, 5, 6, 4, 7].find((c) => st[first + c] === 0) ?? -1;
  });
  expect(chair).toBeGreaterThanOrEqual(0);
  await page.evaluate((c) => window.__stadium!.goVip(c), chair);
  await atLevel(page, 'vip');
  await idle(page);
  await shot(page, 'engine-07-vip');

  expect(errors).toEqual([]);
});

// Phase 6: lighting presets (one screenshot each), the match-day crowd and the match in seat views, the wave.
test('lighting presets, crowd and wave', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`/events/cup-final?${PICKER_QUERY}&block=232`);
  await atLevel(page, 'block');
  // The crowd and the match stay hidden at block level, where the availability colours must stay clear.
  expect(await page.evaluate(() => window.__stadium!.crowdVisible)).toBe(false);
  expect(await page.evaluate(() => window.__stadium!.matchVisible)).toBe(false);

  const seat = await page.evaluate(() => window.__stadium!.seatIndex(232, 10, 8));
  await page.evaluate((i) => window.__stadium!.goSeat(i), seat);
  await atLevel(page, 'seat');
  expect(await page.evaluate(() => window.__stadium!.crowdVisible)).toBe(true);
  // From a seat, the match is on: players, the referees and the ball on the pitch.
  expect(await page.evaluate(() => window.__stadium!.matchVisible)).toBe(true);

  for (const preset of ['day', 'dusk', 'night'] as const) {
    await page.evaluate((p) => window.__stadium!.setLighting(p), preset);
    expect(await page.evaluate(() => window.__stadium!.lighting)).toBe(preset);
    await idle(page);
    await shot(page, `engine-09-seat-${preset}`);
  }

  // The wave runs while the crowd is shown; stopping it ends it at once.
  expect(await page.evaluate(() => window.__stadium!.wave())).toBe(true);
  expect(await page.evaluate(() => window.__stadium!.waving)).toBe(true);
  await page.evaluate(() => window.__stadium!.stopWave());
  expect(await page.evaluate(() => window.__stadium!.waving)).toBe(false);

  // The toggle empties the stands and the pitch, and no wave can start without a crowd.
  await page.evaluate(() => window.__stadium!.setCrowd(false));
  expect(await page.evaluate(() => window.__stadium!.crowdVisible)).toBe(false);
  expect(await page.evaluate(() => window.__stadium!.matchVisible)).toBe(false);
  expect(await page.evaluate(() => window.__stadium!.wave())).toBe(false);
  await idle(page);
  await shot(page, 'engine-10-seat-night-no-crowd');
  await page.evaluate(() => window.__stadium!.setCrowd(true));

  await page.evaluate(() => window.__stadium!.goOverview());
  await atLevel(page, 'overview');
  expect(await page.evaluate(() => window.__stadium!.crowdVisible)).toBe(false);
  await idle(page);
  await shot(page, 'engine-11-overview-night');
  expect(errors).toEqual([]);
});

// Phase 7: the home hero mounts the engine in hero mode (no input on the canvas, so the page scrolls).
test('home hero: the 3D stadium fades in over the poster', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`/?${PICKER_QUERY}`);
  await page.waitForFunction(() => window.__stadium?.ready, null, { timeout: 600_000, polling: 250 });
  expect(await page.evaluate(() => window.__stadium!.level)).toBe('overview');
  const canvas = page.locator('[data-hero-visual] canvas');
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toHaveCSS('pointer-events', 'none');
  await idle(page);
  await shot(page, 'engine-12-home-hero');
  await page.mouse.wheel(0, 900);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  expect(errors).toEqual([]);
});

test('without WebGL the 2D plan is shown', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/events/cup-final?webgl=0');
  await expect(page.getByRole('heading', { name: /3D view isn.t available/i })).toBeVisible();
  await expect(page.locator('svg path[d]').first()).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await shot(page, 'engine-08-no-webgl');
  expect(errors).toEqual([]);
});
