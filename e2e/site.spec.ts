import { expect, test } from '@playwright/test';
import { collectErrors, shot } from './helpers';

// Phase 7: the site pages. The home hero is checked through its poster and the next match (the 3D view
// itself is covered by the engine specs); the events list loads from the browser's own data store.

test('home: hero, next match with countdown, upcoming matches, venue and FAQ', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?webgl=0');
  await expect(page.getByRole('heading', { level: 1, name: /Every seat\. Every view\./ })).toBeVisible();
  const next = page.locator('section[aria-labelledby="next-event"]');
  await expect(next).toContainText('Bangladesh v India');
  await expect(next.getByRole('timer')).toBeVisible();
  await expect(next.getByRole('link', { name: 'Choose your seats' })).toHaveAttribute(
    'href',
    '/events/cup-final',
  );
  await expect(page.getByRole('heading', { name: 'Upcoming matches' })).toBeVisible();
  await expect(page.locator('section[aria-labelledby="upcoming"] li')).toHaveCount(4);
  await expect(page.getByRole('img', { name: 'Plan of the stadium with its gates' })).toBeVisible();
  await page.getByText('Is the payment real?').click();
  await expect(page.getByText(/4242 4242 4242 4242/)).toBeVisible();
  await shot(page, 'site-01-home');
  expect(errors).toEqual([]);
});

test('events: filters by competition and month, and keeps them in the address', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/events');
  const cards = page.locator('main article');
  await expect(cards).toHaveCount(6);
  await page.getByLabel('Competition').selectOption('Qualifier');
  await expect(page).toHaveURL(/competition=Qualifier/);
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText('Qualifier');
  await page.getByRole('button', { name: 'Clear the filters' }).click();
  await expect(cards).toHaveCount(6);
  const month = page.getByLabel('Month');
  const first = await month.locator('option').nth(1).getAttribute('value');
  await month.selectOption(first!);
  await expect(page).toHaveURL(new RegExp(`month=${first}`));
  expect(await cards.count()).toBeGreaterThan(0);
  await shot(page, 'site-02-events');
  expect(errors).toEqual([]);
});

test('venue, FAQ, legal pages, Bengali and the 404 page', async ({ page, context }) => {
  const errors = collectErrors(page, [/404 \(Not Found\)/]);
  await page.goto('/venue');
  await expect(page.getByRole('heading', { level: 1, name: 'The venue' })).toBeVisible();
  await expect(page.getByRole('img', { name: /20 gates/ })).toBeVisible();
  await page.goto('/faq');
  await expect(page.locator('details')).toHaveCount(11);
  for (const [path, title] of [
    ['/terms', 'Terms of sale'],
    ['/privacy', 'Privacy'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByRole('note')).toContainText('Sample text');
  }

  // The language switch turns the whole site Bengali (the choice lives in a cookie).
  await page.goto('/events');
  await page.getByRole('banner').getByRole('button', { name: 'বাং' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'ইভেন্ট' })).toBeVisible();
  expect((await context.cookies()).find((c) => c.name === 'NEXT_LOCALE')?.value).toBe('bn');
  await shot(page, 'site-03-events-bn');
  await page.getByRole('banner').getByRole('button', { name: 'EN' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Events' })).toBeVisible();

  const res = await page.goto('/no-such-page');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('phone: the menu sheet reaches every page', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 760 }, hasTouch: true });
  const page = await context.newPage();
  const errors = collectErrors(page);
  await page.goto('/faq');
  await page.getByRole('button', { name: 'Menu' }).click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu.getByRole('link')).toHaveCount(4);
  await menu.getByRole('link', { name: 'The venue' }).click();
  await expect(page).toHaveURL(/\/venue$/);
  await expect(page.getByRole('heading', { level: 1, name: 'The venue' })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(1);
  await shot(page, 'site-04-phone-venue');
  expect(errors).toEqual([]);
  await context.close();
});
