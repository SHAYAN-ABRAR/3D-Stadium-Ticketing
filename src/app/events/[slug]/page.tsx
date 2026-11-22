import type { Metadata } from 'next';
import type { DeepLink } from '@/components/picker/PickerApp';
import { EventScreen } from '@/components/picker/EventScreen';
import { SAMPLE_EVENTS } from '@/lib/events/samples';

const int = (v: string | string[] | undefined) => {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

export async function generateMetadata({ params }: PageProps<'/events/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const def = SAMPLE_EVENTS.find((e) => e.slug === slug);
  return def ? { title: `${def.homeTeam} v ${def.awayTeam}` } : {};
}

/** The seat picker. The event comes from the visitor's browser (the data store), so it loads client-side. */
export default async function EventPage({ params, searchParams }: PageProps<'/events/[slug]'>) {
  const { slug } = await params;
  const q = await searchParams;
  const deepLink: DeepLink = {
    stand: typeof q.stand === 'string' ? q.stand : undefined,
    block: int(q.block),
    row: int(q.row),
    seat: int(q.seat),
    box: int(q.box),
    chair: int(q.chair),
  };
  return <EventScreen slug={slug} deepLink={deepLink} />;
}
