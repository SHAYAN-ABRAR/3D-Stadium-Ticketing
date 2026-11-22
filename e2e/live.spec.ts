import { expect, test } from '@playwright/test';
import { atLevel, collectErrors, PICKER_QUERY, storeReady } from './helpers';

// E2E spec 2: two tabs of one browser share its local database but not their holds (each tab is a
// session, like two visitors). Tab A holds seats; tab B's picker shows them grey within 8 s and gets the
// conflict path when it tries them. A holds through the store's test hook, exactly as its picker would.
test('two tabs: B sees A’s hold within 8 s and gets the conflict path', async ({ context }) => {
  const pb = await context.newPage();
  await pb.setViewportSize({ width: 1280, height: 800 });
  const errors = collectErrors(pb);

  // B sits in Block 232, row 10, seat 8: the deep link selects the pair around it.
  await pb.goto(`/events/cup-final?block=232&row=10&seat=8&${PICKER_QUERY}`);
  await atLevel(pb, 'seat');
  await expect(pb.locator('#ticket-card').getByRole('button', { name: 'Hold 2 seats' })).toBeVisible();
  const bSeats = await pb.evaluate(() => window.__stadium!.selection);
  expect(bSeats).toHaveLength(2);

  // A: a light page in another tab, holding seats 5 and 6 of the same row.
  const pa = await context.newPage();
  await pa.goto('/orders/lookup');
  await storeReady(pa);
  const seat5 = await pb.evaluate(() => window.__stadium!.seatIndex(232, 10, 5));
  const aSeats = [seat5, seat5 + 1];
  const first = await pa.evaluate((s) => window.__data!.hold('cup-final', s), aSeats);
  expect(first.ok).toBe(true);
  const t0 = Date.now();

  // B hears the change (BroadcastChannel): the seats turn grey within 8 s, without touching B's selection.
  await pb.waitForFunction((s) => s.every((i) => window.__stadium!.statuses[i] !== 0), aSeats, {
    timeout: 8_000,
    polling: 200,
  });
  expect(Date.now() - t0).toBeLessThan(8_000);
  expect(await pb.evaluate(() => window.__stadium!.selection)).toEqual(bSeats);

  // A now takes B's seats as well; B tries to hold them and is told they were taken.
  const second = await pa.evaluate((s) => window.__data!.hold('cup-final', s), [...aSeats, ...bSeats]);
  expect(second.ok).toBe(true);
  const hold = pb.locator('#ticket-card').getByRole('button', { name: 'Hold 2 seats' });
  if (await hold.isEnabled().catch(() => false)) await hold.click().catch(() => {});
  await expect(pb.getByText(/taken by someone else/).first()).toBeVisible({ timeout: 15_000 });
  await pb.waitForFunction(
    (s) =>
      s.every((i) => window.__stadium!.statuses[i] !== 0) &&
      window.__stadium!.selection.every((i) => !s.includes(i)),
    bSeats,
    { timeout: 15_000, polling: 250 },
  );
  // The store agrees: B can't hold them.
  const blocked = await pb.evaluate((s) => window.__data!.hold('cup-final', s), bSeats);
  expect(blocked).toEqual({ ok: false, reason: 'conflict', conflicts: [...bSeats].sort((x, y) => x - y) });
  expect(errors).toEqual([]);
});
