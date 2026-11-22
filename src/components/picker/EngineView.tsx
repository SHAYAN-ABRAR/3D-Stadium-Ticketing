'use client';
/**
 * Mounts the three.js engine. Loaded only in the browser (next/dynamic with ssr: false, from StadiumStage).
 * React Strict Mode runs this effect twice in development: each run creates its own engine and the
 * cleanup disposes it completely, so exactly one canvas remains.
 */
import { useEffect, useRef } from 'react';
import { StadiumEngine, type QualitySetting } from '@/engine';
import { installTestApi } from '@/engine/test-api';
import type { TextureText } from '@/engine/world/textures';
import { connectEngine } from './store';

export interface EngineViewProps {
  text: TextureText;
  quality?: QualitySetting;
  label: string;
}

export default function EngineView({ text, quality = 'auto', label }: EngineViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const textKey = JSON.stringify(text);

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
      quality,
      freeze: params.get('freeze') === '1' || process.env.NEXT_PUBLIC_E2E === '1',
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      debug: params.get('debug') === '1',
    });
    const disconnect = connectEngine(engine);
    const uninstall = installTestApi(engine);
    engine.mount(el).catch(() => {
      // The error event already moved the store to 'error' or 'nowebgl'.
    });
    return () => {
      uninstall();
      disconnect();
      engine.dispose();
    };
  }, [textKey, quality]);

  return <div ref={ref} className="absolute inset-0" role="img" aria-label={label} />;
}
