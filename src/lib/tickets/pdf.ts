/**
 * Ticket PDF (PROMPT.md 9.7): one A6 page per ticket with the QR code, the seat-view picture (or the plan
 * with the block highlighted), the seat and the times. Always in English: pdf-lib can't shape Bengali
 * script, and the standard fonts only cover Western European characters, so other characters in names are
 * dropped (a name that would lose most of its letters is left out).
 */
import {
  clip,
  endPath,
  PDFDocument,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFPage,
  type RGB,
} from 'pdf-lib';
import { brand } from '@/config/brand';
import { formatDate, formatAmount } from '@/lib/format';
import {
  blockPolygon,
  boxPolygon,
  getLayout,
  loopPolygon,
  PLAN_EXTENT,
  polygonPath,
  type SeatLabel,
} from '@/lib/stadium';
import type { AbstractIntlMessages } from 'next-intl';
import { translatorFor } from '@/lib/messages';
import { ticketText } from '@/lib/ticket-text';
import { isViewJpeg } from './jpeg';
import { qrMatrix, ticketUrl } from './qr';

export interface PdfTicket {
  label: SeatLabel;
  priceMinor: number;
  holderName: string | null;
  token: string;
  view: Uint8Array | null;
}

export interface PdfInput {
  orderCode: string;
  /** Epoch milliseconds. */
  event: { title: string; competition: string; startsAt: number; doorsAt: number };
  tickets: PdfTicket[];
  /** This site's origin, for the QR codes. */
  origin: string;
  /** The English messages (the PDF is always in English). */
  messages: AbstractIntlMessages;
}

const A6: [number, number] = [297.64, 419.53];
const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
const C = {
  ink: hex(brand.colors.ink),
  paper: hex(brand.colors.paper),
  paper2: hex(brand.colors.paper2),
  muted: hex(brand.colors.muted),
  line: hex('#d6d0c3'),
  pick: hex(brand.colors.pick),
  neutral: hex('#d7d2c7'),
  pitch: hex('#3f8a2f'),
  white: rgb(1, 1, 1),
};

/** Keeps the characters a standard font can encode (letters with accents fall back to their base letter). */
function encoder(font: PDFFont) {
  const ok = new Set(font.getCharacterSet());
  return (text: string): string => {
    let out = '';
    for (const ch of text.normalize('NFC')) {
      if (ok.has(ch.codePointAt(0)!)) out += ch;
      else
        for (const base of ch.normalize('NFKD'))
          if (ok.has(base.codePointAt(0)!) && !/\p{M}/u.test(base)) out += base;
    }
    return out.replace(/\s+/g, ' ').trim();
  };
}

/** A name for the PDF, or null when the standard font would lose most of it. */
function printableName(name: string | null, enc: (s: string) => string): string | null {
  if (!name) return null;
  const letters = (s: string) => (s.match(/\p{L}/gu) ?? []).length;
  const kept = enc(name);
  return letters(kept) >= Math.max(1, letters(name) * 0.5) ? kept : null;
}

export async function buildTicketsPdf(input: PdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${input.event.title}: tickets ${input.orderCode}`);
  pdf.setAuthor(brand.name);
  pdf.setCreator(brand.name);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const enc = encoder(regular);
  const t = translatorFor(input.messages, 'en', 'tickets');
  const names = translatorFor(input.messages, 'en', 'names');

  // A6 is 297.6 × 419.5 pt. From the top: header band, event, picture, seat, then the perforation and the
  // stub (QR code, order, gate, price). Every y below is a text baseline or a box's bottom edge.
  const [W, H] = A6;
  const M = 16;
  const PIC_TOP = H - 74,
    PIC_H = 116,
    PERF = 140;
  const start = `${formatDate(input.event.startsAt, 'medium', 'en')} · ${formatDate(input.event.startsAt, 'time', 'en')}`;
  const times = `Doors open ${formatDate(input.event.doorsAt, 'time', 'en')} · Kick-off ${formatDate(input.event.startsAt, 'time', 'en')} (venue time)`;

  for (const [k, ticket] of input.tickets.entries()) {
    const page = pdf.addPage(A6);
    const text = (s: string, x: number, y: number, size: number, font = regular, color = C.ink) =>
      page.drawText(enc(s), { x, y, size, font, color });
    const right = (s: string, xr: number, y: number, size: number, font = regular, color = C.ink) =>
      text(s, xr - font.widthOfTextAtSize(enc(s), size), y, size, font, color);
    /** Shrinks the size down to `min`, then shortens the text with an ellipsis, to fit `width`. */
    const fit = (s: string, font: PDFFont, size: number, min: number, width: number) => {
      let str = enc(s);
      let sz = size;
      while (sz > min && font.widthOfTextAtSize(str, sz) > width) sz -= 0.5;
      while (str.length > 1 && font.widthOfTextAtSize(str, sz) > width)
        str = `${str.slice(0, -2).trimEnd()}…`;
      return { str, sz };
    };

    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.paper });
    page.drawRectangle({ x: 0, y: H - 34, width: W, height: 34, color: C.ink });
    text(brand.name, M, H - 22, 12, bold, C.white);
    right(`TICKET ${k + 1} OF ${input.tickets.length}`, W - M, H - 21, 7, bold, C.white);

    const title = fit(input.event.title, bold, 14, 10, W - 2 * M);
    page.drawText(title.str, { x: M, y: H - 52, size: title.sz, font: bold, color: C.ink });
    text(`${input.event.competition} · ${start}`, M, H - 64, 8, regular, C.muted);

    // The seat view (cropped to the band, keeping its 16:10 shape) or the plan with the block highlighted.
    const pw = W - 2 * M;
    const py = PIC_TOP - PIC_H;
    let drewView = false;
    if (ticket.view && isViewJpeg(ticket.view)) {
      try {
        const img = await pdf.embedJpg(ticket.view);
        const ih = pw / (img.width / img.height);
        page.pushOperators(pushGraphicsState(), rectangle(M, py, pw, PIC_H), clip(), endPath());
        page.drawImage(img, { x: M, y: py + (PIC_H - ih) / 2, width: pw, height: ih });
        page.pushOperators(popGraphicsState());
        drewView = true;
      } catch {
        // Not a usable JPEG: the plan below instead.
      }
    }
    if (!drewView) drawPlan(page, ticket.label, M, py, pw, PIC_H);

    const words = ticketText(ticket.label, t, names);
    text(words.kicker, M, py - 14, 8, bold, C.muted);
    const big = fit(words.title, bold, 20, 14, W - 2 * M);
    page.drawText(big.str, { x: M, y: py - 34, size: big.sz, font: bold, color: C.ink });
    let x = M;
    for (const f of words.facts) {
      text(f.label.toUpperCase(), x, py - 48, 6.5, bold, C.muted);
      text(f.value, x, py - 64, 15, bold);
      x += Math.max(48, bold.widthOfTextAtSize(enc(f.value), 15) + 20);
    }
    const holder = printableName(ticket.holderName, enc);
    if (holder) {
      const room = W - M - x - 8;
      const name = fit(holder, bold, 9, 7, room);
      if (room > 40) {
        right('TICKET HOLDER', W - M, py - 48, 6.5, bold, C.muted);
        page.drawText(name.str, {
          x: W - M - bold.widthOfTextAtSize(name.str, name.sz),
          y: py - 62,
          size: name.sz,
          font: bold,
          color: C.ink,
        });
      }
    }
    text(times, M, py - 80, 7.5, regular, C.muted);

    // Perforation with notches, then the stub.
    for (let dx = M; dx < W - M; dx += 7)
      page.drawLine({
        start: { x: dx, y: PERF },
        end: { x: dx + 3.5, y: PERF },
        thickness: 1,
        color: C.line,
      });
    page.drawCircle({ x: 0, y: PERF, size: 8, color: C.paper2 });
    page.drawCircle({ x: W, y: PERF, size: 8, color: C.paper2 });

    const qrSize = 104;
    drawQr(page, ticketUrl(input.origin, ticket.token), M, PERF - 12 - qrSize, qrSize);
    const sx = M + qrSize + 16;
    text('ORDER', sx, PERF - 22, 6.5, bold, C.muted);
    text(input.orderCode, sx, PERF - 34, 11, bold);
    text(ticket.label.kind === 'vip' ? 'ENTRANCE' : 'GATE', sx, PERF - 50, 6.5, bold, C.muted);
    text(
      ticket.label.kind === 'vip' ? `VIP · ${ticket.label.gate}` : ticket.label.gate,
      sx,
      PERF - 65,
      14,
      bold,
    );
    text(brand.currency, sx, PERF - 84, 8, bold, C.muted);
    text(formatAmount(ticket.priceMinor, 'en'), sx, PERF - 108, 22, bold, C.pick);
    text('Show this QR code at the gate. Sample ticket for demonstration.', M, 12, 6, regular, C.muted);
  }
  return pdf.save();
}

function drawQr(page: PDFPage, url: string, x: number, y: number, size: number) {
  const m = qrMatrix(url);
  const quiet = 2;
  const cell = size / (m.size + quiet * 2);
  page.drawRectangle({ x, y, width: size, height: size, color: C.white });
  for (let r = 0; r < m.size; r++) {
    let c = 0;
    while (c < m.size) {
      if (!m.dark(r, c)) {
        c++;
        continue;
      }
      const start = c;
      while (c < m.size && m.dark(r, c)) c++;
      page.drawRectangle({
        x: x + (quiet + start) * cell,
        y: y + size - (quiet + r + 1) * cell,
        width: (c - start) * cell + 0.05,
        height: cell + 0.05,
        color: C.ink,
      });
    }
  }
}

function drawPlan(page: PDFPage, label: SeatLabel, x: number, y: number, w: number, h: number) {
  page.drawRectangle({ x, y, width: w, height: h, color: C.paper2 });
  const L = getLayout();
  const { halfX, halfZ } = PLAN_EXTENT;
  const s = Math.min(w / (2 * halfX), h / (2 * halfZ)) * 0.94;
  const ox = x + w / 2,
    oy = y + h / 2;
  // drawSvgPath puts the path's origin at (x, y) and flips its y axis (SVG y grows downward).
  page.drawSvgPath(polygonPath(loopPolygon()), {
    x: ox,
    y: oy,
    scale: s,
    color: C.paper,
    borderColor: C.line,
    borderWidth: 0.6,
  });
  page.drawRectangle({ x: ox - 54.5 * s, y: oy - 36 * s, width: 109 * s, height: 72 * s, color: C.pitch });
  const mine = label.kind === 'bowl' ? label.block : -1;
  for (const b of L.blocks) {
    page.drawSvgPath(polygonPath(blockPolygon(b, L)), {
      x: ox,
      y: oy,
      scale: s,
      color: b.id === mine ? C.pick : C.neutral,
      borderColor: C.paper,
      borderWidth: 0.4,
    });
  }
  for (const box of L.boxes) {
    page.drawSvgPath(polygonPath(boxPolygon(box)), {
      x: ox,
      y: oy,
      scale: s,
      color: label.kind === 'vip' && label.box === box.id ? C.pick : C.line,
    });
  }
}
