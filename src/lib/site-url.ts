/**
 * The site's public address, for absolute links in metadata (Open Graph images, the sitemap). Set
 * NEXT_PUBLIC_SITE_URL to override; on Vercel the production domain is used; locally, localhost.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return 'http://localhost:3000';
}
