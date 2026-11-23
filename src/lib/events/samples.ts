/**
 * The six sample events (PROMPT.md 9.3): Bangladesh at home to South Asian sides (sample fixtures, not real
 * matches); kick-off 19:30 venue time on Saturdays counted from the visitor's first visit. The local data
 * store seeds them (src/data/seed.ts).
 */
import { brand } from '@/config/brand';
import {
  defaultCategories,
  defaultCategoryCode,
  getLayout,
  indexOf,
  RESTRICTED_CATEGORY_CODE,
} from '@/lib/stadium';
import type { EventStatus, PriceCategory, PublicEvent } from './types';

/** Seats kept free in every on-sale sample event (Block 232 row 10 seats 5-11; the tour and tests use them). */
export function protectedSeats(): number[] {
  return [5, 6, 7, 8, 9, 10, 11].map((s) => indexOf(232, 10, s));
}

export interface SampleEventDef {
  slug: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  homeColor: string;
  awayColor: string;
  /** 1 = the next Saturday after today, 2 = the one after, ...; -1 = last Saturday. */
  saturday: number;
  status: EventStatus;
  /** Share of bowl seats already sold. */
  sold: number;
  /** Scatter the remaining free seats as singles (the nearly sold-out derby). */
  scatter?: number;
  /** Sale opens this many days from today (coming soon). */
  saleOpensInDays?: number;
}

export const SAMPLE_EVENTS: readonly SampleEventDef[] = [
  {
    slug: 'cup-final',
    competition: 'Cup Final',
    homeTeam: 'Bangladesh',
    awayTeam: 'India',
    homeColor: '#006a4e',
    awayColor: '#1d5fbf',
    saturday: 1,
    status: 'on_sale',
    sold: 0.65,
  },
  {
    slug: 'bangladesh-v-nepal',
    competition: 'Friendly',
    homeTeam: 'Bangladesh',
    awayTeam: 'Nepal',
    homeColor: '#006a4e',
    awayColor: '#c8102e',
    saturday: 2,
    status: 'on_sale',
    sold: 0.4,
  },
  {
    slug: 'bangladesh-v-bhutan',
    competition: 'Qualifier',
    homeTeam: 'Bangladesh',
    awayTeam: 'Bhutan',
    homeColor: '#006a4e',
    awayColor: '#f4b400',
    saturday: 3,
    status: 'on_sale',
    sold: 0.3,
  },
  {
    slug: 'bangladesh-v-pakistan',
    competition: 'Qualifier',
    homeTeam: 'Bangladesh',
    awayTeam: 'Pakistan',
    homeColor: '#006a4e',
    awayColor: '#f4f4f1',
    saturday: 4,
    status: 'on_sale',
    sold: 0.97,
    scatter: 1,
  },
  {
    slug: 'bangladesh-v-sri-lanka',
    competition: 'Friendly',
    homeTeam: 'Bangladesh',
    awayTeam: 'Sri Lanka',
    homeColor: '#006a4e',
    awayColor: '#8d153a',
    saturday: 5,
    status: 'on_sale',
    sold: 0,
    saleOpensInDays: 3,
  },
  {
    slug: 'bangladesh-v-maldives',
    competition: 'Friendly',
    homeTeam: 'Bangladesh',
    awayTeam: 'Maldives',
    homeColor: '#006a4e',
    awayColor: '#d21034',
    saturday: -1,
    status: 'past',
    sold: 0.88,
  },
];

/** UTC offset of the venue time zone at a given instant, in minutes (e.g. +360 for Asia/Dhaka). */
export function zoneOffsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((wall - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

/** A wall-clock time in the venue time zone, as a UTC Date. */
export function venueTime(y: number, m: number, d: number, hh: number, mm: number): Date {
  const guess = new Date(Date.UTC(y, m, d, hh, mm));
  const off = zoneOffsetMinutes(brand.timeZone, guess);
  return new Date(guess.getTime() - off * 60000);
}

/** Kick-off (19:30 venue time) of a sample event, Saturdays counted from `now` in the venue time zone. */
export function sampleKickoff(def: SampleEventDef, now = new Date()): Date {
  const off = zoneOffsetMinutes(brand.timeZone, now);
  const local = new Date(now.getTime() + off * 60000);
  const y = local.getUTCFullYear(),
    m = local.getUTCMonth(),
    d = local.getUTCDate(),
    dow = local.getUTCDay();
  const toNext = (6 - dow + 7) % 7 || 7; // strictly after today
  const toLast = -((dow - 6 + 7) % 7 || 7); // strictly before today
  const days = def.saturday > 0 ? toNext + (def.saturday - 1) * 7 : toLast + (def.saturday + 1) * 7;
  return venueTime(y, m, d + days, 19, 30);
}

/** A sample event in the public shape, with the default categories (the seed's starting point). */
export function samplePublicEvent(slug: string, now = new Date()): PublicEvent | null {
  const def = SAMPLE_EVENTS.find((e) => e.slug === slug);
  if (!def) return null;
  const layout = getLayout();
  const kickoff = sampleKickoff(def, now);
  const cats: PriceCategory[] = defaultCategories().map((c) => ({
    id: c.code,
    code: c.code,
    name: c.name,
    priceMinor: c.priceMinor,
    sort: c.sort,
  }));
  cats.push({
    id: RESTRICTED_CATEGORY_CODE,
    code: RESTRICTED_CATEGORY_CODE,
    name: 'Restricted view',
    priceMinor: null,
    sort: 99,
  });
  return {
    id: def.slug,
    slug: def.slug,
    title: `${def.homeTeam} v ${def.awayTeam}`,
    competition: def.competition,
    homeTeam: def.homeTeam,
    awayTeam: def.awayTeam,
    homeColor: def.homeColor,
    awayColor: def.awayColor,
    startsAt: kickoff.getTime(),
    doorsAt: kickoff.getTime() - brand.doorsBeforeKickoffMinutes * 60000,
    status: def.status,
    saleStartsAt: def.saleOpensInDays ? now.getTime() + def.saleOpensInDays * 86400000 : null,
    saleEndsAt: kickoff.getTime(),
    currency: brand.currency,
    categories: cats,
    blockCategory: layout.blocks.map((b) => defaultCategoryCode(b)),
    vip: { chairPriceMinor: brand.vipChairPriceMinor, boxPriceMinor: brand.boxPriceMinor },
    closedBlocks: [],
  };
}
