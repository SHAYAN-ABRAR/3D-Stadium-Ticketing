/**
 * Everything that identifies the venue and its commercial rules. Every text and every 3D texture
 * reads from here, so the site can be re-branded for another client by editing this one file.
 * Money is in minor units (AED has 2 decimals: AED 1,250 is 125000).
 */
export const brand = {
  name: 'Linden Park Stadium',
  shortName: 'Linden Park',
  /** Two-letter prefix of order codes, for example LP-7F3K9Q. */
  orderPrefix: 'LP',
  currency: 'AED',
  currencyDecimals: 2,
  /** Venue time zone: every date and time on the site is shown in it. */
  timeZone: 'Asia/Dubai',
  /** The concourse level of the skybox ring, printed on VIP tickets. */
  vipLevel: 2,
  holdMinutes: 10,
  maxTicketsPerOrder: 10,
  /** VIP prices of the sample events. */
  vipChairPriceMinor: 375_000,
  boxPriceMinor: 2_800_000,
  /** Fees and tax: lines appear at checkout only when these are above zero. */
  serviceFeePerTicketMinor: 0,
  taxRate: 0,
  /** Doors open this many minutes before kick-off unless an event says otherwise. */
  doorsBeforeKickoffMinutes: 90,
  address: {
    line1: '1 Parkside Avenue',
    line2: 'Linden Park',
    city: 'Dubai',
    country: 'United Arab Emirates',
  },
  colors: {
    ink: '#15171c',
    paper: '#fbfaf6',
    paper2: '#f2efe7',
    muted: '#5b616d',
    line: '#e2ddd2',
    seatRed: '#b3121c',
    seatBlue: '#1f46b8',
    pick: '#ff6a13',
    pickInk: '#a83c00',
    sold: '#9a9da3',
    success: '#1f7a3d',
    danger: '#b42318',
    /** Facade wash and accents at night. */
    accent: '#ff6a13',
  },
} as const;

export type Brand = typeof brand;
