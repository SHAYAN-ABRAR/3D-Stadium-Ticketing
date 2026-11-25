'use client';
/**
 * The home hero's 3D stadium: the engine in hero mode (day, the crowd, a slow orbit, no input).
 * Loaded with next/dynamic and ssr: false; Strict Mode safe like the picker's EngineView.
 */
import { useEffect, useRef } from 'react';
import { getStore } from '@/data';
import { StadiumEngine } from '@/engine';
import { installTestApi } from '@/engine/test-api';
import type { TextureText } from '@/engine/world/textures';

export default function HeroEngine({
  text,
  eventId,
  onReady,
}: {
  text: TextureText;
  /** The match whose sold seats get spectators (none without an event). */
  eventId: string | null;
  onReady: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const textKey = JSON.stringify(text);
  const ready = useRef(onReady);
  useEffect(() => {
    ready.current = onReady;
  }, [onReady]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const params = new URLSearchParams(location.search);
    const font = getComputedStyle(document.documentElement)
      .getPropertyValue('--font-barlow-condensed')
      .trim();
    const engine = new StadiumEngine({
      text: JSON.parse(textKey) as TextureText,
      displayFont: font ? `${font}, "Arial Narrow", Arial, sans-serif` : undefined,
      hero: true,
      freeze: params.get('freeze') === '1' || process.env.NEXT_PUBLIC_E2E === '1',
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    });
    // The crowd sits in the match's sold seats, and follows sales made in other tabs.
    let stopSeats = () => {};
    if (eventId) {
      const store = getStore();
      store
        .seats(eventId)
        .then((s) => engine.setStatuses(s.statuses))
        .catch(() => {
          // Without seat data the stands are simply empty.
        });
      stopSeats = store.onSeats(eventId, (u) => {
        if ('changes' in u) engine.applyChanges(u.changes);
        else void store.seats(eventId).then((s) => engine.setStatuses(s.statuses));
      });
    }
    // Fade in once the first frame is on screen.
    const off = engine.on('ready', () =>
      requestAnimationFrame(() => requestAnimationFrame(() => ready.current())),
    );
    const uninstall = installTestApi(engine);
    engine.mount(el).catch(() => {
      // No WebGL: the poster stays.
    });
    return () => {
      stopSeats();
      off();
      uninstall();
      engine.dispose();
    };
  }, [textKey, eventId]);

  return <div ref={ref} className="absolute inset-0" aria-hidden />;
}
