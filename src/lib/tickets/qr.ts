/**
 * QR codes for tickets. The code encodes the ticket page's address on this site; pages draw it as one SVG
 * path, the PDF draws the same modules as vector squares.
 */
import QRCode from 'qrcode';

/** The ticket page's absolute address (the QR code's content). */
export function ticketUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/tickets/${token}`;
}

export interface QrMatrix {
  size: number;
  dark(row: number, col: number): boolean;
}

export function qrMatrix(text: string): QrMatrix {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  return { size: modules.size, dark: (r, c) => modules.get(r, c) === 1 };
}

/** SVG path of the dark modules (runs merged per row) in a size × size grid, plus the size. */
export function qrPath(text: string): { size: number; d: string } {
  const m = qrMatrix(text);
  let d = '';
  for (let r = 0; r < m.size; r++) {
    let c = 0;
    while (c < m.size) {
      if (!m.dark(r, c)) {
        c++;
        continue;
      }
      const start = c;
      while (c < m.size && m.dark(r, c)) c++;
      d += `M${start} ${r}h${c - start}v1h${start - c}z`;
    }
  }
  return { size: m.size, d };
}
