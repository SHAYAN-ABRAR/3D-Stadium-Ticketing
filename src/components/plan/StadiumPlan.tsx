/**
 * The 2D stadium plan (PROMPT.md 6.8): an SVG built from the layout, north up. Stands and blocks are
 * polygons coloured by availability; used by the no-WebGL picker, ticket pages ("your block") and the
 * venue page (gates). Pure SVG: renders on the server too.
 */
import type { KeyboardEvent } from 'react';
import {
  blockPolygon,
  boxPolygon,
  getLayout,
  loopPolygon,
  PLAN_EXTENT,
  polygonCentre,
  polygonPath,
  standPolygon,
  type BlockInfo,
} from '@/lib/stadium';

export type BlockTone = 'plenty' | 'limited' | 'few' | 'soldout' | 'closed' | 'dim' | 'neutral' | 'highlight';

export interface StadiumPlanProps {
  /** Tone of each block (by block index). Missing blocks are drawn neutral. */
  tones?: (BlockTone | undefined)[];
  /** Accessible name and description of each block (by block index), for interactive plans. */
  blockLabel?: (b: BlockInfo) => string;
  /** Called when a block is chosen (interactive plans). */
  onBlock?: (b: BlockInfo) => void;
  /** Called when a stand is chosen (stand-level plans). */
  onStand?: (standIndex: number) => void;
  standLabel?: (standIndex: number) => string;
  /** Show block numbers. */
  numbers?: boolean;
  /** Only show and number this stand's blocks as interactive. */
  focusStand?: number;
  /** Draw gate markers (venue page). */
  gates?: boolean;
  /** Public number of a skybox to highlight (VIP tickets). */
  highlightBox?: number;
  className?: string;
  title?: string;
}

const TONE_FILL: Record<BlockTone, string> = {
  plenty: '#1f46b8',
  limited: '#6c8ad6',
  few: '#e8a33d',
  soldout: '#c9c6bf',
  closed: '#dedbd3',
  dim: '#e6e2da',
  neutral: '#d7d2c7',
  highlight: '#ff6a13',
};
const TONE_TEXT: Record<BlockTone, string> = {
  plenty: '#ffffff',
  limited: '#ffffff',
  few: '#15171c',
  soldout: '#5b616d',
  closed: '#5b616d',
  dim: '#8a8f99',
  neutral: '#5b616d',
  highlight: '#ffffff',
};

/** Tone of a block from its free seats and whether the requested run fits. */
export function toneFor(free: number, total: number, fits = true, closed = false): BlockTone {
  if (closed) return 'closed';
  if (free <= 0) return 'soldout';
  if (!fits) return 'dim';
  const share = free / total;
  return share >= 0.35 ? 'plenty' : share >= 0.1 ? 'limited' : 'few';
}

const PITCH = { w: 105, h: 68 };

export function StadiumPlan({
  tones = [],
  blockLabel,
  onBlock,
  onStand,
  standLabel,
  numbers = false,
  focusStand,
  gates = false,
  highlightBox,
  className,
  title,
}: StadiumPlanProps) {
  const layout = getLayout();
  const { halfX, halfZ } = PLAN_EXTENT;
  const facade = polygonPath(loopPolygon());
  const interactive = !!onBlock || !!onStand;
  const activate = (fn: () => void) => ({
    onClick: fn,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fn();
      }
    },
  });

  // Gate markers sit just outside the facade: leave room for them.
  const pad = gates ? 10 : 0;
  return (
    <svg
      viewBox={`${-halfX - pad} ${-halfZ - pad} ${(halfX + pad) * 2} ${(halfZ + pad) * 2}`}
      className={className}
      role={interactive ? 'group' : 'img'}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <pattern
          id="plan-hatch"
          width="3"
          height="3"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="3" height="3" fill="#dedbd3" />
          <line x1="0" y1="0" x2="0" y2="3" stroke="#b5b0a5" strokeWidth="1.2" />
        </pattern>
      </defs>
      {/* facade and pitch */}
      <path d={facade} fill="#f2efe7" stroke="#cfc9bc" strokeWidth={1.2} />
      <rect
        x={-PITCH.w / 2 - 2}
        y={-PITCH.h / 2 - 2}
        width={PITCH.w + 4}
        height={PITCH.h + 4}
        rx={3}
        fill="#3f8a2f"
      />
      <g stroke="rgba(255,255,255,.75)" strokeWidth={0.5} fill="none">
        <rect x={-PITCH.w / 2} y={-PITCH.h / 2} width={PITCH.w} height={PITCH.h} />
        <line x1={0} y1={-PITCH.h / 2} x2={0} y2={PITCH.h / 2} />
        <circle cx={0} cy={0} r={9.15} />
        <rect x={-PITCH.w / 2} y={-20.16} width={16.5} height={40.32} />
        <rect x={PITCH.w / 2 - 16.5} y={-20.16} width={16.5} height={40.32} />
      </g>
      {/* skyboxes */}
      <g fill="#cdb79e" stroke="#f2efe7" strokeWidth={0.3}>
        {layout.boxes.map((box) => (
          <path
            key={box.id}
            d={polygonPath(boxPolygon(box))}
            fill={box.id === highlightBox ? TONE_FILL.highlight : undefined}
          />
        ))}
      </g>
      {/* stands (stand-level plans) */}
      {onStand
        ? layout.stands.map((st) => (
            <path
              key={st.key}
              d={polygonPath(standPolygon(st.index))}
              fill="transparent"
              stroke="transparent"
              className="cursor-pointer outline-none hover:fill-[rgba(255,106,19,.18)] focus-visible:fill-[rgba(255,106,19,.25)] focus-visible:stroke-pick"
              strokeWidth={1.5}
              role="button"
              tabIndex={0}
              aria-label={standLabel?.(st.index)}
              {...activate(() => onStand(st.index))}
            />
          ))
        : null}
      {/* blocks */}
      {layout.blocks.map((b) => {
        const tone = tones[b.index] ?? 'neutral';
        const poly = blockPolygon(b, layout);
        const active = !!onBlock && (focusStand === undefined || focusStand === b.stand);
        const fill = tone === 'closed' ? 'url(#plan-hatch)' : TONE_FILL[tone];
        const [cx, cz] = polygonCentre(poly);
        return (
          <g key={b.id} pointerEvents={onStand ? 'none' : undefined}>
            <path
              d={polygonPath(poly)}
              fill={fill}
              stroke="#fbfaf6"
              strokeWidth={0.6}
              className={
                active
                  ? 'cursor-pointer outline-none hover:brightness-110 focus-visible:stroke-ink focus-visible:stroke-[1.6]'
                  : undefined
              }
              role={active ? 'button' : undefined}
              tabIndex={active ? 0 : undefined}
              aria-label={active ? blockLabel?.(b) : undefined}
              {...(active ? activate(() => onBlock!(b)) : {})}
            />
            {numbers && (focusStand === undefined || focusStand === b.stand) ? (
              <text
                x={cx}
                y={cz}
                fontSize={b.tierKey === 'L' ? 4.6 : 5.2}
                fontWeight={700}
                textAnchor="middle"
                dominantBaseline="central"
                fill={TONE_TEXT[tone]}
                pointerEvents="none"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {b.id}
              </text>
            ) : null}
          </g>
        );
      })}
      {gates ? <GateMarkers /> : null}
    </svg>
  );
}

/** Gate letters around the facade (one marker per gate, at the middle of its blocks). */
function GateMarkers() {
  const layout = getLayout();
  const gates = new Map<string, { x: number; z: number; n: number }>();
  for (const b of layout.blocks) {
    if (b.tierKey !== 'L') continue;
    const [cx, cz] = polygonCentre(blockPolygon(b, layout));
    const g = gates.get(b.gate) ?? { x: 0, z: 0, n: 0 };
    g.x += cx;
    g.z += cz;
    g.n++;
    gates.set(b.gate, g);
  }
  return (
    <g>
      {[...gates.entries()].map(([gate, g]) => {
        const x = g.x / g.n,
          z = g.z / g.n,
          len = Math.hypot(x, z) || 1;
        // Push the marker out to just beyond the facade, along the direction from the centre.
        const k = (len + 58) / len;
        return (
          <g key={gate} transform={`translate(${(x * k).toFixed(1)} ${(z * k).toFixed(1)})`}>
            <circle r={5.6} fill="#15171c" />
            <text
              fontSize={5}
              fontWeight={700}
              textAnchor="middle"
              dominantBaseline="central"
              fill="#fff"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {gate}
            </text>
          </g>
        );
      })}
    </g>
  );
}
