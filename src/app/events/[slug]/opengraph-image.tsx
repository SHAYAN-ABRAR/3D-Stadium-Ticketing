import { brand } from '@/config/brand';
import { SAMPLE_EVENTS } from '@/lib/events/samples';
import { OG_SIZE, ogImage } from '@/lib/og';

export const alt = `A match at ${brand.name}`;
export const size = OG_SIZE;
export const contentType = 'image/png';

/** The fixture over the stadium (no date: sample dates are counted from each visitor's first visit). */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const def = SAMPLE_EVENTS.find((e) => e.slug === slug);
  return ogImage(
    def
      ? {
          kicker: `${def.competition} · ${brand.name}`,
          title: `${def.homeTeam} v ${def.awayTeam}`,
          sub: 'Choose your seat in 3D and see the view from it.',
        }
      : {
          kicker: brand.name,
          title: 'Every seat. Every view. Before you buy.',
          sub: 'Choose your seat in 3D and see the view from it.',
        },
  );
}
