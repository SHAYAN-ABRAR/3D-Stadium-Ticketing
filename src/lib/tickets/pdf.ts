/**
 * Ticket PDF (PROMPT.md 9.7): one A6 page per ticket with the QR code, the match header (both teams'
 * flags, as on the site's tickets), the seat and the times. Always in English: pdf-lib can't shape Bengali
 * script, and the standard fonts only cover Western European characters, so other characters in names are
 * dropped (a name that would lose most of its letters is left out).
 */
import {
  PDFDocument,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type RGB,
} from 'pdf-lib';
import { brand } from '@/config/brand';
import { currencySign, formatDate, formatAmount } from '@/lib/format';
import type { SeatLabel } from '@/lib/stadium';
import type { AbstractIntlMessages } from 'next-intl';
import { translatorFor } from '@/lib/messages';
import { ticketText } from '@/lib/ticket-text';
import { FLAG_PNG } from './flag-png';
import { qrMatrix, ticketUrl } from './qr';

export interface PdfTicket {
  label: SeatLabel;
  priceMinor: number;
  holderName: string | null;
  token: string;
}

export interface PdfInput {
  orderCode: string;
  /** Epoch milliseconds. Team colours are "#rrggbb". */
  event: {
    title: string;
    competition: string;
    homeTeam: string;
    awayTeam: string;
    homeColor?: string;
    awayColor?: string;
    startsAt: number;
    doorsAt: number;
  };
  tickets: PdfTicket[];
  /** The teams' flags as PNG pictures (see flag-png.ts); without them the header shows the teams' colours. */
  flags?: { home: Uint8Array | null; away: Uint8Array | null };
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
  // The flags are embedded once and drawn on every page; a picture pdf-lib can't read is left out.
  const embedFlag = async (png: Uint8Array | null | undefined): Promise<PDFImage | null> => {
    if (!png) return null;
    try {
      return await pdf.embedPng(png);
    } catch {
      return null;
    }
  };
  const teams = [
    {
      name: input.event.homeTeam,
      color: teamColor(input.event.homeColor),
      flag: await embedFlag(input.flags?.home),
    },
    {
      name: input.event.awayTeam,
      color: teamColor(input.event.awayColor),
      flag: await embedFlag(input.flags?.away),
    },
  ];

  // A6 is 297.6 × 419.5 pt. From the top: header band, event, match header, seat, then the perforation and
  // the stub (QR code, order, gate, price). Every y below is a text baseline or a box's bottom edge.
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

    // The match header, as on the site's tickets: a wash of each team's colour from its side, the colours
    // along the top, both flags with "VS" between them, the names, then the venue, date and times.
    const pw = W - 2 * M;
    const py = PIC_TOP - PIC_H;
    const top = py + PIC_H;
    page.drawRectangle({ x: M, y: py, width: pw, height: PIC_H, color: C.white });
    const STEPS = 24;
    const strip = (pw * 0.4) / STEPS;
    for (let i = 0; i < STEPS; i++) {
      const opacity = 0.16 * (1 - i / STEPS);
      const wash = { y: py, width: strip, height: PIC_H, opacity };
      page.drawRectangle({ ...wash, x: M + i * strip, color: teams[0].color });
      page.drawRectangle({ ...wash, x: M + pw - (i + 1) * strip, color: teams[1].color });
    }
    page.drawRectangle({ x: M, y: top - 3, width: pw / 2, height: 3, color: teams[0].color });
    page.drawRectangle({ x: M + pw / 2, y: top - 3, width: pw / 2, height: 3, color: teams[1].color });
    page.drawRectangle({ x: M, y: py, width: pw, height: PIC_H, borderColor: C.line, borderWidth: 0.5 });
    const FW = 60,
      FH = 45;
    const fy = top - 12 - FH;
    teams.forEach((team, side) => {
      const cx = M + pw * (side === 0 ? 0.25 : 0.75);
      if (team.flag) {
        const s = FW / (FLAG_PNG.width - 2 * FLAG_PNG.margin);
        page.drawImage(team.flag, {
          x: cx - FW / 2 - FLAG_PNG.margin * s,
          y: fy - FLAG_PNG.margin * s,
          width: FLAG_PNG.width * s,
          height: FLAG_PNG.height * s,
        });
      } else page.drawRectangle({ x: cx - FW / 2, y: fy, width: FW, height: FH, color: team.color });
      const name = fit(team.name.toUpperCase(), bold, 11, 7, pw * 0.42);
      page.drawText(name.str, {
        x: cx - bold.widthOfTextAtSize(name.str, name.sz) / 2,
        y: fy - 13,
        size: name.sz,
        font: bold,
        color: C.ink,
      });
    });
    const vs = enc(t('match.vs'));
    page.drawText(vs, {
      x: M + pw / 2 - bold.widthOfTextAtSize(vs, 16) / 2,
      y: fy + FH / 2 - 5.5,
      size: 16,
      font: bold,
      color: C.ink,
    });
    page.drawLine({
      start: { x: M, y: py + 30 },
      end: { x: M + pw, y: py + 30 },
      thickness: 0.5,
      color: C.line,
    });
    /** "Label: value" in 6.5 pt, from the left edge or up to the right one. */
    const fact = (label: string, value: string, y: number, side: 'left' | 'right') => {
      const l = enc(`${label}:`);
      const v = enc(value);
      const lw = regular.widthOfTextAtSize(l, 6.5) + 2.5;
      const x0 = side === 'left' ? M + 8 : M + pw - 8 - lw - bold.widthOfTextAtSize(v, 6.5);
      page.drawText(l, { x: x0, y, size: 6.5, font: regular, color: C.muted });
      page.drawText(v, { x: x0 + lw, y, size: 6.5, font: bold, color: C.ink });
    };
    fact(t('match.venue'), brand.name, py + 19, 'left');
    fact(t('match.date'), formatDate(input.event.startsAt, 'medium', 'en'), py + 9, 'left');
    fact(t('match.gates'), formatDate(input.event.doorsAt, 'time', 'en'), py + 19, 'right');
    fact(t('match.kickoff'), formatDate(input.event.startsAt, 'time', 'en'), py + 9, 'right');

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
    // The PDF's standard fonts have no taka sign: print the English form (Tk).
    text(brand.currency === 'BDT' ? currencySign('en') : brand.currency, sx, PERF - 84, 8, bold, C.muted);
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

/** A team's colour ("#rrggbb"), or the muted grey when it has none. */
function teamColor(color: string | undefined): RGB {
  return color && /^#[0-9a-f]{6}$/i.test(color) ? hex(color) : C.muted;
}
