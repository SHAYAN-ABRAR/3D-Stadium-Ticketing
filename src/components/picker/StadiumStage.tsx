'use client';
/**
 * The 3D stage. next/dynamic with ssr: false must itself sit in a Client Component (App Router rejects it
 * in a Server Component), so this thin wrapper exists. three.js only loads on pages that render it.
 */
import dynamic from 'next/dynamic';
import type { EngineViewProps } from './EngineView';

const EngineView = dynamic(() => import('./EngineView'), { ssr: false });

export function StadiumStage(props: EngineViewProps) {
  return <EngineView {...props} />;
}
