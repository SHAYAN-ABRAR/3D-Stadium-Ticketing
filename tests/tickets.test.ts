import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { orderTotals } from '@/lib/orders';
import {
  defaultPricing,
  getLayout,
  indexOf,
  labelOf,
  seatPricesMinor,
  totalPriceMinor,
  type SeatLabel,
} from '@/lib/stadium';
import { renderOrderEmail } from '@/lib/email/order-email';
import { loadMessages } from '@/lib/messages';
import { isTicketToken, newOrderCode, newTicketToken, normaliseOrderCode } from '@/lib/tickets/codes';
import { buildIcs } from '@/lib/tickets/ics';
import { isViewJpeg, jpegSize } from '@/lib/tickets/jpeg';
import { buildTicketsPdf } from '@/lib/tickets/pdf';
import { qrPath, ticketUrl } from '@/lib/tickets/qr';

const L = getLayout();
const ORIGIN = 'https://tickets.example.test';

describe('ticket tokens and order codes', () => {
  it('makes random, unguessable ticket tokens', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => newTicketToken()));
    expect(tokens.size).toBe(200);
    for (const t of tokens) expect(isTicketToken(t)).toBe(true);
    expect(isTicketToken('not a token')).toBe(false);
    expect(ticketUrl(`${ORIGIN}/`, 'abc')).toBe(`${ORIGIN}/tickets/abc`);
  });

  it('makes order codes without look-alike characters and reads what visitors type', () => {
    for (let i = 0; i < 50; i++) expect(newOrderCode()).toMatch(/^LP-[2-9A-HJKMNP-Z]{6}$/);
    expect(normaliseOrderCode(' lp 7f3k9q ')).toBe('LP-7F3K9Q');
    expect(normaliseOrderCode('7F3K9Q')).toBe('LP-7F3K9Q');
    expect(normaliseOrderCode('LP-7F3K90')).toBeNull();
    expect(normaliseOrderCode('LP-7F3K9')).toBeNull();
  });
});

describe('totals and prices', () => {
  it('adds fees per ticket and tax on subtotal plus fees', () => {
    expect(orderTotals([100_000, 50_000], { serviceFeePerTicketMinor: 500, taxRate: 0.05 })).toEqual({
      subtotalMinor: 150_000,
      feesMinor: 1_000,
      taxMinor: 7_550,
      totalMinor: 158_550,
    });
    expect(orderTotals([125_000])).toEqual({
      subtotalMinor: 125_000,
      feesMinor: 0,
      taxMinor: 0,
      totalMinor: 125_000,
    });
  });

  it('splits the whole-box price across its chairs and always sums to the total', () => {
    const pricing = { ...defaultPricing(), vipBoxMinor: 2_800_003 };
    const box = L.boxes[20];
    const chairs = Array.from({ length: 8 }, (_, k) => box.firstSeat + k);
    const seat = indexOf(232, 10, 7);
    const mixed = [seat, ...chairs, L.boxes[21].firstSeat];
    const prices = seatPricesMinor(mixed, pricing);
    expect(prices.reduce((a, b) => a + b, 0)).toBe(totalPriceMinor(mixed, pricing));
    expect(prices.slice(1, 9)).toEqual([
      350_001, 350_001, 350_001, 350_000, 350_000, 350_000, 350_000, 350_000,
    ]);
    expect(prices[9]).toBe(pricing.vipChairMinor);
  });
});

describe('calendar file', () => {
  it('uses UTC times with the venue time zone, escapes text and folds long lines', () => {
    const ics = buildIcs({
      uid: 'LP-ABCDEF@tickets.example.test',
      title: 'Rangers v Eastbridge, Cup Final; late',
      description: `Order LP-ABCDEF\nBlock 232, Row 10, Seat 7\n${'x'.repeat(200)}`,
      location: 'Linden Park Stadium, 1 Parkside Avenue',
      url: 'https://tickets.example.test/orders/LP-ABCDEF',
      start: new Date('2026-12-12T15:30:00Z'),
      created: new Date('2026-11-21T10:00:00Z'),
    });
    expect(ics).toContain('DTSTART:20261212T153000Z');
    expect(ics).toContain('DTEND:20261212T173000Z');
    expect(ics).toContain('X-WR-TIMEZONE:Asia/Dubai');
    expect(ics).toContain('TZOFFSETTO:+0400');
    expect(ics).toContain('SUMMARY:Rangers v Eastbridge\\, Cup Final\\; late');
    for (const line of ics.split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    expect(ics.replace(/\r\n /g, '')).toContain(
      `DESCRIPTION:Order LP-ABCDEF\\nBlock 232\\, Row 10\\, Seat 7\\n${'x'.repeat(200)}`,
    );
  });
});

describe('seat-view uploads', () => {
  const header = (w: number, h: number) => [
    0xff,
    0xd8,
    // APP0 (JFIF), 16 bytes
    0xff,
    0xe0,
    0x00,
    0x10,
    0x4a,
    0x46,
    0x49,
    0x46,
    0x00,
    0x01,
    0x01,
    0x00,
    0x00,
    0x01,
    0x00,
    0x01,
    0x00,
    0x00,
    // SOF0, 17 bytes: precision, height, width, 3 components
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    h >> 8,
    h & 255,
    w >> 8,
    w & 255,
    0x03,
    1,
    0x22,
    0,
    2,
    0x11,
    1,
    3,
    0x11,
    1,
  ];
  // SOS, 12 bytes, then entropy-coded data (stand-in bytes) and the end-of-image marker.
  const scan = (bytes: number) => [
    0xff,
    0xda,
    0x00,
    0x0c,
    0x03,
    1,
    0x00,
    2,
    0x11,
    3,
    0x11,
    0x00,
    0x3f,
    0x00,
    ...new Array<number>(bytes).fill(0x55),
    0xff,
    0xd9,
  ];
  const jpeg = (w: number, h: number, bytes = 4000) => new Uint8Array([...header(w, h), ...scan(bytes)]);

  it('reads the frame size and accepts only whole 640 × 400 JPEGs of 1 to 120 KB', () => {
    expect(jpegSize(jpeg(640, 400))).toEqual({ width: 640, height: 400 });
    expect(isViewJpeg(jpeg(640, 400))).toBe(true);
    expect(isViewJpeg(jpeg(800, 500))).toBe(false);
    expect(isViewJpeg(jpeg(640, 400, 130 * 1024))).toBe(false);
    // A header without image data, or a cut-off file, is refused.
    expect(
      isViewJpeg(new Uint8Array([...header(640, 400), ...new Array<number>(2000).fill(0), 0xff, 0xd9])),
    ).toBe(false);
    expect(isViewJpeg(jpeg(640, 400).slice(0, -2))).toBe(false);
    expect(isViewJpeg(new TextEncoder().encode('<svg></svg>'))).toBe(false);
  });
});

describe('QR codes, PDF and email', () => {
  const bowl = labelOf(indexOf(232, 10, 7)) as SeatLabel;
  const vip = labelOf(L.boxes[8].firstSeat + 2) as SeatLabel;
  const event = {
    title: 'Rangers v Eastbridge',
    competition: 'Cup Final',
    homeTeam: 'Rangers',
    awayTeam: 'Eastbridge',
    startsAt: Date.parse('2026-12-12T15:30:00Z'),
    doorsAt: Date.parse('2026-12-12T14:00:00Z'),
  };

  it('draws a QR code', () => {
    const qr = qrPath('https://tickets.example.test/tickets/abc');
    expect(qr.size).toBeGreaterThanOrEqual(21);
    expect(qr.d).toMatch(/^M\d+ \d+h\d+v1h-\d+z/);
  });

  it('writes one A6 page per ticket, in English, dropping names the PDF fonts cannot show', async () => {
    const bytes = await buildTicketsPdf({
      orderCode: 'LP-ABCDEF',
      event,
      origin: ORIGIN,
      messages: await loadMessages('en'),
      tickets: [
        {
          label: bowl,
          priceMinor: 125_000,
          holderName: 'José Müller',
          token: newTicketToken(),
          view: null,
        },
        {
          label: vip,
          priceMinor: 375_000,
          holderName: 'রহিম উদ্দিন',
          token: newTicketToken(),
          view: null,
        },
      ],
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    const [w, h] = [doc.getPage(0).getWidth(), doc.getPage(0).getHeight()];
    expect([Math.round(w), Math.round(h)]).toEqual([298, 420]);
  });

  it('escapes everything a visitor typed and follows the visitor’s language', async () => {
    const input = {
      locale: 'en' as const,
      messages: await loadMessages('en'),
      siteUrl: ORIGIN,
      order: {
        code: 'LP-ABCDEF',
        name: '<script>alert(1)</script>',
        currency: 'AED',
        feesMinor: 0,
        taxMinor: 0,
        totalMinor: 125_000,
      },
      event,
      tickets: [{ label: bowl, priceMinor: 125_000, holderName: `O'Brien & "Co"`, token: 'tok' }],
    };
    const mail = renderOrderEmail(input);
    expect(mail.subject).toBe('Your tickets: Rangers v Eastbridge · LP-ABCDEF');
    expect(mail.html).not.toContain('<script>alert(1)');
    expect(mail.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(mail.html).toContain('O&#39;Brien &amp; &quot;Co&quot;');
    expect(mail.html).toContain(`${ORIGIN}/tickets/tok`);
    expect(mail.html).toContain(`${ORIGIN}/orders/LP-ABCDEF`);
    expect(mail.text).toContain('Block 232 · Row 10 · Seat 7');
    const bn = renderOrderEmail({ ...input, locale: 'bn', messages: await loadMessages('bn') });
    expect(bn.subject).toBe('আপনার টিকিট: Rangers বনাম Eastbridge · LP-ABCDEF');
    expect(bn.html).toContain('lang="bn"');
  });
});
