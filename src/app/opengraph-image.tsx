import { brand } from '@/config/brand';
import { OG_SIZE, ogImage } from '@/lib/og';

export const alt = `${brand.name} in 3D in daylight`;
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
  return ogImage({
    kicker: brand.name,
    title: 'Every seat. Every view. Before you buy.',
    sub: 'Choose your seat in 3D and see the view from it.',
  });
}
