import type { Metadata, Viewport } from 'next';
import { Barlow, Barlow_Condensed, Noto_Sans_Bengali } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { brand } from '@/config/brand';
import { siteUrl } from '@/lib/site-url';
import './globals.css';

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-barlow',
  display: 'swap',
});

const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-barlow-condensed',
  display: 'swap',
});

// Not preloaded: English pages never download it; Bengali glyphs pull it in through unicode-range.
const notoBengali = Noto_Sans_Bengali({
  subsets: ['bengali'],
  variable: '--font-noto-bengali',
  display: 'swap',
  preload: false,
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  const locale = await getLocale();
  const title = `${brand.name} · ${t('title')}`;
  const description = t('description', { stadium: brand.name });
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: title, template: `%s · ${brand.shortName}` },
    description,
    openGraph: {
      type: 'website',
      siteName: brand.name,
      title,
      description,
      locale: locale === 'bn' ? 'bn_BD' : 'en_GB',
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export const viewport: Viewport = {
  themeColor: brand.colors.paper,
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${barlow.variable} ${barlowCondensed.variable} ${notoBengali.variable}`}>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
