/**
 * Canvas textures: facade, roof membrane, goal net and the wheelchair pictogram, plus the helper that the
 * text boards use (boards.ts). Text is drawn on the main thread after the display font has loaded
 * (pitfall 12). Each texture keeps its draw function so animated boards can redraw (at most once a second).
 */
import * as THREE from 'three';
import { FACADE } from '@/lib/stadium/params';

/** The match as the boards, screens and crowd show it (venue language). */
export interface TextureText {
  stadium: string;
  short: string;
  /** The competition, for example "Cup Final". */
  event: string;
  /** For example "SAT 12 DEC". */
  date: string;
  /** Kick-off time, for example "19:30". */
  time: string;
  /** Kick-off (epoch ms) for the countdown; 0 shows no countdown. */
  kickoff: number;
  home: string;
  away: string;
  /** Team colours (sRGB hex) for the screens and the crowd's shirts, scarves and caps. */
  homeColor: string;
  awayColor: string;
}

export interface DrawnTexture {
  texture: THREE.CanvasTexture;
  redraw: () => void;
}

type Draw = (x: CanvasRenderingContext2D, w: number, h: number) => void;

interface TexOptions {
  wrapS?: THREE.Wrapping;
  wrapT?: THREE.Wrapping;
  flipY?: boolean;
  aniso?: number;
}

export function canvasTexture(w: number, h: number, draw: Draw, opts: TexOptions = {}): DrawnTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = opts.wrapS ?? THREE.RepeatWrapping;
  t.wrapT = opts.wrapT ?? THREE.ClampToEdgeWrapping;
  if (opts.flipY === false) t.flipY = false;
  t.anisotropy = opts.aniso ?? 4;
  return {
    texture: t,
    redraw: () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      draw(ctx, w, h);
      t.needsUpdate = true;
    },
  };
}

/** Waits (at most 1.5 s) for the display font, so canvas text doesn't use a fallback. */
export async function loadDisplayFont(family: string): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts?.load) return;
  try {
    await Promise.race([
      Promise.all([document.fonts.load(`700 40px ${family}`), document.fonts.load(`600 40px ${family}`)]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch {
    // Fonts are optional: the fallback stack still draws legible text.
  }
}

/** Facade panels and window bands. The emissive version (night) lights only the windows. */
export function facadeTexture(windowsOnly = false): DrawnTexture {
  const H = FACADE.top;
  return canvasTexture(
    512,
    1024,
    (x, w, h) => {
      const yy = (m: number) => ((H - m) / H) * h,
        mx = w / 24;
      x.fillStyle = windowsOnly ? '#000000' : '#cfd2d5';
      x.fillRect(0, 0, w, h);
      if (!windowsOnly)
        for (let i = 0; i < 24; i += 3) {
          x.fillStyle = i % 6 ? '#c6c9cc' : '#d7d9dc';
          x.fillRect(i * mx, 0, 3 * mx, h);
        }
      for (const [a, b] of [
        [0.4, 6.2],
        [13, 16.2],
        [25.2, 28.4],
        [39, 42.4],
        [48.4, 50.8],
      ]) {
        if (windowsOnly) {
          x.fillStyle = '#ffd9a0';
          x.fillRect(0, yy(b), w, yy(a) - yy(b));
          x.fillStyle = '#000000';
          for (let i = 0; i <= 24; i += 2) x.fillRect(i * mx - 2, yy(b), 4, yy(a) - yy(b));
          continue;
        }
        const g = x.createLinearGradient(0, yy(b), 0, yy(a));
        g.addColorStop(0, '#5d7486');
        g.addColorStop(1, '#22303b');
        x.fillStyle = g;
        x.fillRect(0, yy(b), w, yy(a) - yy(b));
        x.fillStyle = 'rgba(255,255,255,.35)';
        for (let i = 0; i <= 24; i += 2) x.fillRect(i * mx - 1, yy(b), 2, yy(a) - yy(b));
      }
      if (!windowsOnly) {
        x.fillStyle = '#1a2026';
        x.fillRect(9 * mx, yy(4.6), 6 * mx, yy(0) - yy(4.6));
        x.fillStyle = '#ff7a1a';
        x.fillRect(9 * mx, yy(5.6), 6 * mx, yy(4.8) - yy(5.6));
      }
    },
    { flipY: false },
  );
}

export function membraneTexture(): DrawnTexture {
  return canvasTexture(256, 256, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#e9eae8');
    g.addColorStop(0.5, '#fbfbfa');
    g.addColorStop(1, '#e9eae8');
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#c4c7ca';
    x.fillRect(0, 0, 5, h);
    x.fillStyle = 'rgba(0,0,0,.05)';
    for (let i = 0; i < h; i += 32) x.fillRect(0, i, w, 2);
  });
}

/** Goal net: white twine on a transparent background, 8 meshes per repeat (one repeat is a metre). */
export function netTexture(): DrawnTexture {
  return canvasTexture(
    64,
    64,
    (x, w, h) => {
      x.clearRect(0, 0, w, h);
      x.fillStyle = '#ffffff';
      for (let i = 0; i < 8; i++) {
        x.fillRect(i * 8, 0, 2, h);
        x.fillRect(0, i * 8, w, 2);
      }
    },
    { wrapT: THREE.RepeatWrapping },
  );
}

/** White International Symbol of Access on transparent background (alpha-tested decal). */
export function wheelchairTexture(): DrawnTexture {
  return canvasTexture(
    128,
    128,
    (x, w) => {
      x.clearRect(0, 0, w, w);
      x.save();
      x.scale(w / 100, w / 100);
      x.fillStyle = '#ffffff';
      x.strokeStyle = '#ffffff';
      x.lineCap = 'round';
      x.lineJoin = 'round';
      // head
      x.beginPath();
      x.arc(44, 16, 8, 0, Math.PI * 2);
      x.fill();
      // body and seat
      x.lineWidth = 9;
      x.beginPath();
      x.moveTo(42, 30);
      x.lineTo(44, 56);
      x.lineTo(66, 56);
      x.lineTo(76, 78);
      x.stroke();
      // arm
      x.lineWidth = 7;
      x.beginPath();
      x.moveTo(43, 41);
      x.lineTo(60, 41);
      x.stroke();
      // wheel
      x.lineWidth = 7;
      x.beginPath();
      x.arc(42, 66, 22, Math.PI * 1.15, Math.PI * 2.6);
      x.stroke();
      x.restore();
    },
    { wrapS: THREE.ClampToEdgeWrapping, aniso: 4 },
  );
}
