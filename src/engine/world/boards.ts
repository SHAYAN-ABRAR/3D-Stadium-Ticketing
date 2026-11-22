/**
 * LED ribbons, pitch-side boards and the big screens (PROMPT.md 6.6, item 4). With ambient animation on,
 * the ribbons and boards scroll, the ribbons cycle between the event, a kick-off countdown and a welcome,
 * and the screens alternate between the fixture and the countdown. Canvas textures are redrawn at most
 * once a second. Without ambient animation (Low tier, reduced motion, tests) they show fixed content.
 * Board text is in the venue language (English), whatever the visitor's language.
 */
import * as THREE from 'three';
import { canvasTexture, type DrawnTexture, type TextureText } from './textures';

type LedItem = readonly [text: string, color: string];
type LedPhase = 'static' | 'event' | 'countdown' | 'welcome';
type ScreenPhase = 'static' | 'fixture' | 'countdown';

const LED_CYCLE: readonly LedPhase[] = ['event', 'countdown', 'welcome'];
const SCREEN_CYCLE: readonly ScreenPhase[] = ['fixture', 'countdown'];
const LED_PHASE_MS = 8000;
const SCREEN_PHASE_MS = 7000;
/** Scroll speeds in texture repeats per second (a ribbon repeat is 18.4 m, a board repeat 14.4 m). */
const LED_SPEED = 0.16;
const BOARD_SPEED = 0.12;

const WHITE = '#ffffff',
  ORANGE = '#ff8a2a',
  YELLOW = '#ffd85a';

const upper = (s: string) => String(s || '').toUpperCase();

/** "2 DAYS 04:12:33" or "04:12:33"; null once kick-off has passed. */
export function countdownText(ms: number): string | null {
  if (!(ms > 0)) return null;
  const s = Math.floor(ms / 1000),
    d = Math.floor(s / 86400);
  const hms = [Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map((v) => String(v).padStart(2, '0'))
    .join(':');
  return d > 0 ? `${d} ${d === 1 ? 'DAY' : 'DAYS'} ${hms}` : hms;
}

export class Boards {
  readonly led: DrawnTexture;
  readonly board: DrawnTexture;
  readonly screen: DrawnTexture;
  private ledPhase: LedPhase = 'static';
  private screenPhase: ScreenPhase = 'static';
  private ledSecond = -1;
  private screenSecond = -1;
  private now = 0;

  constructor(
    private readonly text: TextureText,
    private readonly font: string,
  ) {
    this.led = canvasTexture(2048, 128, (x, w, h) => drawLed(x, w, h, font, this.ledItems()));
    this.led.texture.repeat.set(1 / 18.4, 1);
    this.board = canvasTexture(1024, 64, (x, w, h) => drawBoard(x, w, h, font, text));
    this.screen = canvasTexture(1024, 400, (x, w, h) => this.drawScreen(x, w, h), {
      wrapS: THREE.ClampToEdgeWrapping,
    });
  }

  /**
   * Advances scrolling and content. `nowMs` is wall-clock time (epoch ms), for the countdown. 'static' shows
   * the fixed content (no ambient animation at all); 'pause' leaves everything as it is (the scheduler is
   * asleep). Returns true when the boards changed.
   */
  update(nowMs: number, dt: number, mode: 'animate' | 'pause' | 'static'): boolean {
    if (mode === 'pause') return false;
    if (mode === 'static') {
      if (this.ledPhase === 'static' && this.screenPhase === 'static') return false;
      this.ledPhase = this.screenPhase = 'static';
      this.ledSecond = this.screenSecond = -1;
      this.led.redraw();
      this.screen.redraw();
      return true;
    }
    const led = this.led.texture,
      board = this.board.texture;
    led.offset.x = (led.offset.x + dt * LED_SPEED) % 1;
    board.offset.x = (board.offset.x + dt * BOARD_SPEED) % 1;
    this.now = nowMs;
    const second = Math.floor(nowMs / 1000);
    const ledPhase = LED_CYCLE[Math.floor(nowMs / LED_PHASE_MS) % LED_CYCLE.length];
    const screenPhase = SCREEN_CYCLE[Math.floor(nowMs / SCREEN_PHASE_MS) % SCREEN_CYCLE.length];
    // At most one redraw per texture per second: phases change on whole seconds, the countdown ticks once.
    if (second !== this.ledSecond && (ledPhase !== this.ledPhase || ledPhase === 'countdown')) {
      this.ledPhase = ledPhase;
      this.ledSecond = second;
      this.led.redraw();
    }
    if (second !== this.screenSecond && (screenPhase !== this.screenPhase || screenPhase === 'countdown')) {
      this.screenPhase = screenPhase;
      this.screenSecond = second;
      this.screen.redraw();
    }
    return true;
  }

  private countdown(): string | null {
    return this.text.kickoff ? countdownText(this.text.kickoff - this.now) : null;
  }

  private ledItems(): LedItem[] {
    const t = this.text;
    const fixture = t.home && t.away ? `${upper(t.home)} V ${upper(t.away)}` : upper(t.event);
    switch (this.ledPhase) {
      case 'event':
        return [
          [upper(t.event), ORANGE],
          [fixture, WHITE],
          [`${upper(t.date)} ${t.time}`, YELLOW],
        ];
      case 'countdown': {
        const cd = this.countdown();
        if (cd)
          return [
            ['KICK-OFF IN', WHITE],
            [cd, YELLOW],
            [upper(t.short), WHITE],
          ];
        break;
      }
      case 'welcome':
        return [
          [`WELCOME TO ${upper(t.stadium)}`, WHITE],
          ['ENJOY THE MATCH', ORANGE],
        ];
    }
    return [
      [upper(t.short), WHITE],
      [upper(t.event), ORANGE],
      ['WELCOME', WHITE],
      ['KICK-OFF ' + t.time, YELLOW],
    ];
  }

  private drawScreen(x: CanvasRenderingContext2D, w: number, h: number) {
    const t = this.text,
      font = this.font;
    const g = x.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#0d1f4f');
    g.addColorStop(1, '#16367f');
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#ff7a1a';
    x.fillRect(0, h - 70, w, 70);
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    const cd = this.screenPhase === 'countdown' ? this.countdown() : null;
    if (this.screenPhase === 'fixture' && t.home && t.away) {
      // Team colours down both edges.
      x.fillStyle = t.homeColor || '#ffffff';
      x.fillRect(0, 0, 26, h - 70);
      x.fillStyle = t.awayColor || '#ffffff';
      x.fillRect(w - 26, 0, 26, h - 70);
      x.fillStyle = '#ffb27a';
      x.font = `700 44px ${font}`;
      x.fillText(upper(t.event), w / 2, 50, w - 100);
      x.fillStyle = WHITE;
      x.font = `700 92px ${font}`;
      x.fillText(upper(t.home), w / 2, 122, w - 100);
      x.font = `600 44px ${font}`;
      x.fillText('V', w / 2, 184, w - 100);
      x.font = `700 92px ${font}`;
      x.fillText(upper(t.away), w / 2, 246, w - 100);
    } else if (cd) {
      x.fillStyle = WHITE;
      x.font = `600 58px ${font}`;
      x.fillText('KICK-OFF IN', w / 2, 70, w - 60);
      x.fillStyle = YELLOW;
      x.font = `700 132px ${font}`;
      x.fillText(cd, w / 2, 172, w - 60);
      x.fillStyle = WHITE;
      x.font = `600 50px ${font}`;
      x.fillText(`${upper(t.date)} · ${t.time}`, w / 2, 272, w - 60);
    } else {
      x.fillStyle = WHITE;
      x.font = `700 150px ${font}`;
      x.fillText(upper(t.event), w / 2, 150, w - 60);
      x.font = `600 64px ${font}`;
      x.fillText('KICK-OFF ' + t.time, w / 2, 262, w - 60);
    }
    x.fillStyle = WHITE;
    x.font = `700 44px ${font}`;
    x.fillText(upper(t.stadium), w / 2, h - 34, w - 60);
  }
}

/** The ribbon: items spread evenly across one repeat, with orange chevrons between them. */
function drawLed(x: CanvasRenderingContext2D, w: number, h: number, font: string, list: LedItem[]) {
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#13307a');
  g.addColorStop(1, '#0b1f52');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  x.textBaseline = 'middle';
  let size = 84,
    widths: number[];
  for (;;) {
    x.font = `700 ${size}px ${font}`;
    widths = list.map((it) => x.measureText(it[0]).width);
    if (widths.reduce((a, b) => a + b, 0) + list.length * 96 <= w || size < 40) break;
    size -= 4;
  }
  const gap = (w - widths.reduce((a, b) => a + b, 0)) / list.length;
  let px = gap * 0.18;
  list.forEach(([t, cl], i) => {
    x.fillStyle = cl;
    x.fillText(t, px, h / 2 + 4);
    px += widths[i];
    x.fillStyle = '#ff7a1a';
    const c0 = px + (gap - 78) / 2;
    for (let k = 0; k < 3; k++) {
      const o = c0 + k * 26;
      x.beginPath();
      x.moveTo(o, 28);
      x.lineTo(o + 18, h / 2);
      x.lineTo(o, h - 28);
      x.lineTo(o + 9, h - 28);
      x.lineTo(o + 27, h / 2);
      x.lineTo(o + 9, 28);
      x.fill();
    }
    px += gap;
  });
  x.fillStyle = 'rgba(255,255,255,.08)';
  for (let i = 0; i < w; i += 4) x.fillRect(i, 0, 1, h);
}

function drawBoard(x: CanvasRenderingContext2D, w: number, h: number, font: string, text: TextureText) {
  x.fillStyle = '#0d1a3d';
  x.fillRect(0, 0, w, h);
  x.textBaseline = 'middle';
  x.font = `700 46px ${font}`;
  x.fillStyle = '#ff7a1a';
  x.fillRect(0, 0, 300, h);
  x.fillStyle = '#ffffff';
  x.fillText(upper(text.event), 22, h / 2 + 2, 270);
  x.fillStyle = '#ffffff';
  x.fillText(upper(text.short), 340, h / 2 + 2, 340);
  x.fillStyle = '#3d7bff';
  x.fillRect(700, 10, 300, h - 20);
  x.fillStyle = '#ffffff';
  x.fillText(upper(text.date), 720, h / 2 + 2, 270);
}
