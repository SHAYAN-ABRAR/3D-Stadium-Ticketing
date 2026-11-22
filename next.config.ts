import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Security headers for every response. No script CSP: a strict CSP without nonces would break
// hydration, so only frame-ancestors is restricted.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // The gate scanner needs the camera on our own origin; nothing else needs device APIs.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  // Cache Components stays off: pages render per request (the locale comes from a cookie) and all
  // data loads in the browser. See docs/DECISIONS.md.
  reactStrictMode: true,
  poweredByHeader: false,
  // The dev-mode indicator would cover UI in E2E screenshots.
  devIndicators: process.env.NEXT_PUBLIC_E2E === '1' ? false : undefined,
  // Lets the E2E web server build into its own folder, so it can run next to `npm run dev`.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
