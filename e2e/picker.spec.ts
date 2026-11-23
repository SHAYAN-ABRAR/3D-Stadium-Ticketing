import { expect, test, devices } from '@playwright/test';
import { atLevel, collectErrors, idle, PICKER_QUERY, shot } from './helpers';

// Phase 3: the whole selection flow with mouse, keyboard and touch (against the mock backend; Phase 4
// swaps in the real API without changing these steps).

test('mouse: stand, block and seat picked in 3D, then the VIP upgrade and a hold', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`/events/cup-final?${PICKER_QUERY}`);
  await atLevel(page, 'overview');
  await expect(page.getByRole('button', { name: /^North stand\./ })).toBeVisible();

  const north = await page.evaluate(() => window.__stadium!.standScreen(3));
  await page.mouse.move(north.x, north.y);
  await page.mouse.click(north.x, north.y);
  await atLevel(page, 'stand');

  const block = await page.evaluate(() => window.__stadium!.blockScreen(232));
  await page.mouse.move(block!.x, block!.y);
  await expect(page.getByRole('tooltip')).toContainText('Block 232');
  await page.mouse.click(block!.x, block!.y);
  await atLevel(page, 'block');

  const seat = await page.evaluate(() => window.__stadium!.seatIndex(232, 10, 8));
  const s = await page.evaluate((i) => window.__stadium!.seatScreen(i), seat);
  await page.mouse.move(s.x, s.y);
  await expect(page.getByRole('tooltip')).toContainText('Row 10');
  await page.mouse.click(s.x, s.y);
  await atLevel(page, 'seat');
  const ticket = page.locator('#ticket-card');
  await expect(ticket).toContainText('Block 232');
  await expect(ticket.getByRole('button', { name: 'Hold 2 seats' })).toBeVisible();
  await expect(ticket.locator('[data-match-banner]')).toContainText('India');
  await idle(page);
  await shot(page, 'picker-06-seat-ticket');
  expect(page.url()).toContain('block=232');

  await ticket.getByRole('button', { name: /Upgrade to Skybox/ }).click();
  await atLevel(page, 'box');
  await expect(ticket).toContainText(/Skybox \d+/);
  await ticket.getByRole('button', { name: /Choose your VIP seats/ }).click();
  const chair = page.locator('#seat-list button:not([disabled])', { hasText: /Row \d · Seat \d/ }).first();
  await chair.click();
  await atLevel(page, 'vip');
  await ticket.getByRole('button', { name: /^Hold/ }).click();
  await expect(ticket).toContainText('Held for you');
  await expect(ticket.getByRole('button', { name: 'Check out' })).toBeVisible();
  await idle(page);
  await shot(page, 'picker-09-vip-held');

  // Esc goes back one level.
  await page.keyboard.press('Escape');
  await atLevel(page, 'box');
  expect(errors).toEqual([]);
});

test('keyboard: the list panel offers the whole flow', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`/events/cup-final?${PICKER_QUERY}`);
  await atLevel(page, 'overview');
  // The skip link moves focus to the seat list.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to seat list' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#seat-list')).toBeFocused();

  const press = async (name: RegExp) => {
    const b = page.getByRole('button', { name }).first();
    await b.focus();
    await page.keyboard.press('Enter');
  };
  await press(/^North stand\./);
  await atLevel(page, 'stand');
  await press(/^Block 232,/);
  await atLevel(page, 'block');
  await press(/^Row 10\./);
  await press(/^Seat 8,/);
  await atLevel(page, 'seat');
  const hold = page.locator('#ticket-card').getByRole('button', { name: 'Hold 2 seats' });
  await hold.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#ticket-card')).toContainText('Held for you');
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: /held for 10 minutes/ })
      .first(),
  ).toBeAttached();
  expect(errors).toEqual([]);
});

test('deep link opens the seat view directly', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`/events/cup-final?block=232&row=10&seat=8&${PICKER_QUERY}`);
  await atLevel(page, 'seat');
  const ticket = page.locator('#ticket-card');
  await expect(ticket).toContainText('Block 232');
  await expect(ticket).toContainText('10');
  expect(errors).toEqual([]);
});

// iPhone-sized touch device, rendered by Chromium (the suite runs one browser).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { defaultBrowserType, ...phone } = devices['iPhone 13'];

test.describe('phone', () => {
  test.use({ ...phone, viewport: { width: 390, height: 844 } });

  test('touch: tap, fly in, choose from the chips, hold from the ticket sheet', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(`/events/cup-final?${PICKER_QUERY}`);
    await atLevel(page, 'overview');
    const north = await page.evaluate(() => window.__stadium!.standScreen(3));
    await page.touchscreen.tap(north.x, north.y);
    const card = page.locator('[data-vaul-drawer]');
    await expect(card).toContainText('North stand');
    await card.getByRole('button', { name: 'Fly in' }).tap();
    await atLevel(page, 'stand');
    await idle(page);
    await shot(page, 'picker-phone-stand');
    await page.getByRole('button', { name: /^Block 232,/ }).tap();
    await atLevel(page, 'block');
    await page.getByRole('button', { name: /^Row 10\./ }).tap();
    await page.getByRole('button', { name: /^Seat 8,/ }).tap();
    await atLevel(page, 'seat');
    const ticket = page.locator('#ticket-card');
    await expect(ticket.locator('[data-match-banner]')).toContainText('India');
    await idle(page);
    await shot(page, 'picker-phone-ticket');
    await ticket.getByRole('button', { name: 'Hold 2 seats' }).tap();
    await expect(ticket).toContainText('Held for you');
    expect(errors).toEqual([]);
  });
});
