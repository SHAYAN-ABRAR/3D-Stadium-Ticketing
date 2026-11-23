/**
 * Everything that identifies the venue and its commercial rules. Every text and every 3D texture
 * reads from here, so the site can be re-branded for another client by editing this one file.
 * Money is in minor units (Bangladeshi taka has 2 decimals, paisa: Tk 2,000 is 200000).
 */
export const brand = {
  name: 'Dhaka International Stadium',
  shortName: 'Dhaka Stadium',
  /** Two-letter prefix of order codes, for example DI-7F3K9Q. */
  orderPrefix: 'DI',
  currency: 'BDT',
  currencyDecimals: 2,
  /** Venue time zone: every date and time on the site is shown in it. */
  timeZone: 'Asia/Dhaka',
  /** The concourse level of the skybox ring, printed on VIP tickets. */
  vipLevel: 2,
  holdMinutes: 10,
  maxTicketsPerOrder: 10,
  /** VIP prices of the sample events. */
  vipChairPriceMinor: 750_000,
  boxPriceMinor: 5_500_000,
  /** Fees and tax: lines appear at checkout only when these are above zero. */
  serviceFeePerTicketMinor: 0,
  taxRate: 0,
  /** Doors open this many minutes before kick-off unless an event says otherwise. */
  doorsBeforeKickoffMinutes: 90,
  address: {
    line1: 'Begum Rokeya Sarani',
    line2: 'Mirpur 10',
    city: 'Dhaka',
    country: 'Bangladesh',
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
