/**
 * Open Graph images (next/og): the hero poster with the stadium's name and a line of text over it. Text is in
 * the venue's language (English), like the boards in the stadium; link previews have no visitor locale.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { brand } from '@/config/brand';

export const OG_SIZE = { width: 1200, height: 630 };

let poster: Promise<string> | null = null;
function posterDataUrl(): Promise<string> {
  poster ??= readFile(join(process.cwd(), 'public', 'hero-poster.jpg')).then(
    (b) => `data:image/jpeg;base64,${b.toString('base64')}`,
  );
  return poster;
}

export async function ogImage(lines: { kicker: string; title: string; sub: string }) {
  const src = await posterDataUrl();
  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        position: 'relative',
        background: brand.colors.ink,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- rendered by next/og, not a page */}
      <img
        src={src}
        width={OG_SIZE.width}
        height={OG_SIZE.height}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background:
            'linear-gradient(to top, rgba(21,23,28,0.96) 0%, rgba(21,23,28,0.86) 40%, rgba(21,23,28,0.3) 70%, rgba(21,23,28,0) 88%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 64,
          right: 64,
          bottom: 56,
          display: 'flex',
          flexDirection: 'column',
          color: 'white',
        }}
      >
        <div style={{ fontSize: 26, letterSpacing: 4, textTransform: 'uppercase', color: brand.colors.pick }}>
          {lines.kicker}
        </div>
        <div style={{ fontSize: 68, lineHeight: 1.05, marginTop: 10 }}>{lines.title}</div>
        <div style={{ fontSize: 30, marginTop: 14, opacity: 0.9 }}>{lines.sub}</div>
      </div>
    </div>,
    OG_SIZE,
  );
}
