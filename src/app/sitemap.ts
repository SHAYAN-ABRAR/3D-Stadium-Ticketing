import type { MetadataRoute } from 'next';
import { SAMPLE_EVENTS } from '@/lib/events/samples';
import { siteUrl } from '@/lib/site-url';

/** The public pages and the sample events (orders and tickets are private to a browser). */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const pages = ['', '/events', '/venue', '/faq', '/terms', '/privacy'];
  return [
    ...pages.map((p) => ({ url: `${base}${p}`, changeFrequency: 'weekly' as const, priority: p ? 0.6 : 1 })),
    ...SAMPLE_EVENTS.filter((e) => e.status !== 'past').map((e) => ({
      url: `${base}/events/${e.slug}`,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
  ];
}
