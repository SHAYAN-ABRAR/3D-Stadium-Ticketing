import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { atLevel, collectErrors, idle, PICKER_QUERY, shot } from './helpers';

/** Fills the buyer details and a demo card, pays, and waits for the confirmation (after the print animation). */
async function checkoutAndPay(page: Page, prefix: string, card = '4242 4242 4242 4242'): Promise<string> {
  await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
  await page.getByLabel('Full name').fill('Dana Example');
  await page.getByLabel('Email').fill('dana@example.com');
  await page.getByLabel('Mobile number').fill('+880 1712 345678');
  await page.getByText('Names on the tickets').click();
  await page
    .getByLabel(/Name on the ticket for/)
    .first()
    .fill('Ana Lima');
  await page.getByLabel('Card number').fill(card);
  await page.getByLabel('Expiry date').fill('12/30');
  await page.getByLabel('Security code').fill('123');
  await page.getByLabel('Name on card').fill('Dana Example');
  await page.getByLabel(/I accept the/).check();
  await shot(page, `${prefix}-checkout`);
  await page.getByRole('button', { name: /^Pay Tk/ }).click();
  await page.waitForURL(/\/orders\/DI-[A-Z0-9]{6}/);
  const code = page.url().match(/DI-[A-Z0-9]{6}/)![0];
  await expect(page.getByRole('heading', { name: "You're going!" })).toBeVisible();
  await expect(page.locator('[data-print-intro]')).toBeHidden({ timeout: 15_000 });
  return code;
}

/** Clicks a download button and returns the downloaded file's bytes. */
async function download(page: Page, name: string): Promise<Buffer> {
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name }).click(),
  ]);
  return fs.readFileSync((await file.path())!);
}

// E2E spec 1: real mouse picking for the stand, the block and the seat, a hold, checkout with the match
// header on each ticket, the demo card payment, a confirmation with 2 QR tickets, downloads made in the
// browser, the email in the outbox, the ticket page with the view rendered in the picker, and another tab
// seeing the seats sold.
test('buy 2 seats end to end and another tab sees them sold', async ({ page, context }) => {
  // The email preview frame is sandboxed without scripts on purpose; Playwright's trace snapshots try to
  // run script inside it and Chrome logs the refusal (without tracing the page logs nothing).
  const errors = collectErrors(page, [/Blocked script execution in 'about:srcdoc'/]);
  await page.goto(`/events/cup-final?${PICKER_QUERY}`);
  await atLevel(page, 'overview');

  const north = await page.evaluate(() => window.__stadium!.standScreen(3));
  await page.mouse.move(north.x, north.y);
  await page.mouse.click(north.x, north.y);
  await atLevel(page, 'stand');
  // The framing eases for a few frames after a flight: read screen positions once the view has settled.
  await idle(page);
  const block = await page.evaluate(() => window.__stadium!.blockScreen(232));
  await page.mouse.move(block!.x, block!.y);
  await expect(page.getByRole('tooltip')).toContainText('Block 232');
  await page.mouse.click(block!.x, block!.y);
  await atLevel(page, 'block');
  await idle(page);
  const seat = await page.evaluate(() => window.__stadium!.seatIndex(232, 10, 8));
  const s = await page.evaluate((i) => window.__stadium!.seatScreen(i), seat);
  await page.mouse.move(s.x, s.y);
  await expect(page.getByRole('tooltip')).toContainText('Row 10');
  await page.mouse.click(s.x, s.y);
  await atLevel(page, 'seat');

  const ticket = page.locator('#ticket-card');
  await ticket.getByRole('button', { name: 'Hold 2 seats' }).click();
  await expect(ticket).toContainText('Held for you');
  const seats = await page.evaluate(() => window.__stadium!.selection);
  expect(seats).toHaveLength(2);
  await ticket.getByRole('button', { name: 'Check out' }).click();
  await page.waitForURL(/\/checkout\?event=cup-final/);
  // Both tickets carry the match header: the two teams' flags and names, the venue and the times.
  const headers = page.locator('[data-match-banner]');
  await expect(headers).toHaveCount(2);
  await expect(headers.first()).toContainText('Bangladesh');
  await expect(headers.first()).toContainText('India');
  await expect(headers.first().locator('img')).toHaveCount(2);

  const code = await checkoutAndPay(page, 'purchase-3d');
  await expect(page.getByRole('img', { name: /^QR code for Block 232 · Row 10 · Seat \d+$/ })).toHaveCount(2);
  await expect(page.locator('[data-match-banner]')).toHaveCount(2);
  await expect(page.getByText('Ana Lima')).toBeVisible();
  await expect(page.getByText('Paid with Visa ending 4242 (demo)')).toBeVisible();
  await shot(page, 'purchase-3d-confirmation');

  // Downloads are made in the browser.
  expect((await download(page, 'Download PDF')).subarray(0, 5).toString()).toBe('%PDF-');
  expect((await download(page, 'Add to calendar')).toString()).toContain('BEGIN:VCALENDAR');

  // The confirmation email is in the outbox, never sent.
  await page.getByRole('link', { name: 'Open email preview' }).click();
  await page.waitForURL(new RegExp(`/orders/${code}/email$`));
  // The frame is sandboxed without scripts, so check its document rather than query inside it.
  await expect(page.locator('iframe')).toHaveAttribute('srcdoc', /Your tickets are ready/);
  await shot(page, 'purchase-3d-email');
  await page.goBack();

  await page.getByRole('link', { name: 'Open ticket' }).first().click();
  await page.waitForURL(/\/tickets\//);
  await expect(page.getByText('Turn your screen brightness up at the gate.')).toBeVisible();
  await expect(page.getByRole('img', { name: 'The view of the pitch from this seat' })).toBeVisible();
  await shot(page, 'purchase-3d-ticket');
  expect(errors).toEqual([]);

  // Another tab of the same browser: the picker shows the two seats sold.
  const other = await context.newPage();
  await other.setViewportSize({ width: 1280, height: 800 });
  const otherErrors = collectErrors(other);
  await other.goto(`/events/cup-final?block=232&${PICKER_QUERY}`);
  await atLevel(other, 'block');
  expect(await other.evaluate((x) => x.map((i) => window.__stadium!.statuses[i]), seats)).toEqual([2, 2]);
  await idle(other);
  await shot(other, 'purchase-3d-sold-in-another-tab');
  expect(otherErrors).toEqual([]);
});

// E2E spec 6: without WebGL, a purchase through the 2D plan and seat grid; the decline test card first.
test('without WebGL: buy through the 2D plan', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/events/cup-final?webgl=0');
  await expect(page.getByRole('heading', { name: /3D view isn.t available/ })).toBeVisible();
  await page.getByRole('button', { name: /^Block 232,/ }).click();
  await page.getByRole('gridcell', { name: /^Row 10, Seat 6, free/ }).click();
  const ticket = page.locator('#ticket-card');
  await ticket.getByRole('button', { name: 'Hold 2 seats' }).click();
  await expect(ticket).toContainText('Held for you');
  await shot(page, 'purchase-2d-held');
  await ticket.getByRole('button', { name: 'Check out' }).click();
  await page.waitForURL(/\/checkout\?event=cup-final/);
  // The tickets carry the match header without WebGL too.
  await expect(page.locator('[data-match-banner]')).toHaveCount(2);

  // The decline test card is declined and the seats stay held; the test card then goes through.
  await page.getByLabel('Full name').fill('Dana Example');
  await page.getByLabel('Email').fill('dana@example.com');
  await page.getByLabel('Mobile number').fill('+880 1712 345678');
  await page.getByLabel('Card number').fill('4000 0000 0000 0002');
  await page.getByLabel('Expiry date').fill('12/30');
  await page.getByLabel('Security code').fill('123');
  await page.getByLabel('Name on card').fill('Dana Example');
  await page.getByLabel(/I accept the/).check();
  await page.getByRole('button', { name: /^Pay Tk/ }).click();
  await expect(page.getByText(/The card was declined/)).toBeVisible();
  await expect(page.getByRole('timer')).toContainText('Your seats are held for');
  await shot(page, 'purchase-2d-declined');

  const code = await checkoutAndPay(page, 'purchase-2d');
  expect(code).toMatch(/^DI-/);
  await expect(page.getByRole('img', { name: /^QR code for Block 232 · Row 10 · Seat \d+$/ })).toHaveCount(2);
  await shot(page, 'purchase-2d-confirmation');
  expect(errors).toEqual([]);
});
