import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
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
    for (let i = 0; i < 50; i++) expect(newOrderCode()).toMatch(/^DI-[2-9A-HJKMNP-Z]{6}$/);
    expect(normaliseOrderCode(' di 7f3k9q ')).toBe('DI-7F3K9Q');
    expect(normaliseOrderCode('7F3K9Q')).toBe('DI-7F3K9Q');
    expect(normaliseOrderCode('DI-7F3K90')).toBeNull();
    expect(normaliseOrderCode('DI-7F3K9')).toBeNull();
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
      uid: 'DI-ABCDEF@tickets.example.test',
      title: 'Bangladesh v India, Cup Final; late',
      description: `Order DI-ABCDEF\nBlock 232, Row 10, Seat 7\n${'x'.repeat(200)}`,
      location: 'Dhaka International Stadium, Begum Rokeya Sarani, Mirpur 10, Dhaka, Bangladesh',
      url: 'https://tickets.example.test/orders/DI-ABCDEF',
      start: new Date('2026-12-12T13:30:00Z'),
      created: new Date('2026-11-21T10:00:00Z'),
    });
    expect(ics).toContain('DTSTART:20261212T133000Z');
    expect(ics).toContain('DTEND:20261212T153000Z');
    expect(ics).toContain('X-WR-TIMEZONE:Asia/Dhaka');
    expect(ics).toContain('TZOFFSETTO:+0600');
    expect(ics).toContain('SUMMARY:Bangladesh v India\\, Cup Final\\; late');
    for (const line of ics.split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    expect(ics.replace(/\r\n /g, '')).toContain(
      `DESCRIPTION:Order DI-ABCDEF\\nBlock 232\\, Row 10\\, Seat 7\\n${'x'.repeat(200)}`,
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
    title: 'Bangladesh v India',
    competition: 'Cup Final',
    homeTeam: 'Bangladesh',
    awayTeam: 'India',
    startsAt: Date.parse('2026-12-12T13:30:00Z'),
    doorsAt: Date.parse('2026-12-12T12:00:00Z'),
  };

  it('draws a QR code', () => {
    const qr = qrPath('https://tickets.example.test/tickets/abc');
    expect(qr.size).toBeGreaterThanOrEqual(21);
    expect(qr.d).toMatch(/^M\d+ \d+h\d+v1h-\d+z/);
  });

  it('writes one A6 page per ticket, in English, dropping names the PDF fonts cannot show', async () => {
    const bytes = await buildTicketsPdf({
      orderCode: 'DI-ABCDEF',
      event,
      origin: ORIGIN,
      messages: await loadMessages('en'),
      tickets: [
        {
          label: bowl,
          priceMinor: 200_000,
          holderName: 'José Müller',
          token: newTicketToken(),
        },
        {
          label: vip,
          priceMinor: 750_000,
          holderName: 'রহিম উদ্দিন',
          token: newTicketToken(),
        },
      ],
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    const [w, h] = [doc.getPage(0).getWidth(), doc.getPage(0).getHeight()];
    expect([Math.round(w), Math.round(h)]).toEqual([298, 420]);
  });

  it('puts the flags in the match header, embedded once for all the pages', async () => {
    // A 1 × 1 PNG stands in for a flag the browser drew; the away team has none and gets its colour.
    const png = Uint8Array.from(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      ),
    );
    const pdfWith = async (count: number, flags?: { home: Uint8Array | null; away: Uint8Array | null }) => {
      const bytes = await buildTicketsPdf({
        orderCode: 'DI-ABCDEF',
        event: { ...event, homeColor: '#006a4e', awayColor: '#1d5fbf' },
        origin: ORIGIN,
        messages: await loadMessages('en'),
        flags,
        tickets: Array.from({ length: count }, () => ({
          label: bowl,
          priceMinor: 200_000,
          holderName: null,
          token: newTicketToken(),
        })),
      });
      const doc = await PDFDocument.load(bytes);
      const images = doc.context
        .enumerateIndirectObjects()
        .filter(
          ([, obj]) =>
            obj instanceof PDFRawStream && obj.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'),
        );
      return { pages: doc.getPageCount(), images: images.length };
    };
    const one = await pdfWith(1, { home: png, away: null });
    expect(one.images).toBeGreaterThan(0);
    expect(await pdfWith(3, { home: png, away: null })).toEqual({ pages: 3, images: one.images });
    expect(await pdfWith(1)).toEqual({ pages: 1, images: 0 });
  });

  it('escapes everything a visitor typed and follows the visitor’s language', async () => {
    const input = {
      locale: 'en' as const,
      messages: await loadMessages('en'),
      siteUrl: ORIGIN,
      order: {
        code: 'DI-ABCDEF',
        name: '<script>alert(1)</script>',
        currency: 'BDT',
        feesMinor: 0,
        taxMinor: 0,
        totalMinor: 200_000,
      },
      event,
      tickets: [{ label: bowl, priceMinor: 200_000, holderName: `O'Brien & "Co"`, token: 'tok' }],
    };
    const mail = renderOrderEmail(input);
    expect(mail.subject).toBe('Your tickets: Bangladesh v India · DI-ABCDEF');
    expect(mail.html).not.toContain('<script>alert(1)');
    expect(mail.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(mail.html).toContain('O&#39;Brien &amp; &quot;Co&quot;');
    expect(mail.html).toContain(`${ORIGIN}/tickets/tok`);
    expect(mail.html).toContain(`${ORIGIN}/orders/DI-ABCDEF`);
    expect(mail.text).toContain('Block 232 · Row 10 · Seat 7');
    expect(mail.text).toContain('Tk 2,000');
    const bn = renderOrderEmail({ ...input, locale: 'bn', messages: await loadMessages('bn') });
    expect(bn.subject).toBe('আপনার টিকিট: Bangladesh বনাম India · DI-ABCDEF');
    expect(bn.text).toContain('২,০০০৳');
    expect(bn.html).toContain('lang="bn"');
  });
});
