/**
 * The confirmation email: the tickets as paper cards with links to each ticket page (QR code) and to the
 * order (PDF and calendar downloads live there), in the visitor's language. It is never sent: the data store
 * puts it in the outbox, where the order page previews it. Table layout with inline styles, as mail clients
 * need; every piece of user content is escaped.
 */
import type { AbstractIntlMessages } from 'next-intl';
import { brand } from '@/config/brand';
import type { AppLocale } from '@/i18n/config';
import { currencySign, formatAmount, formatDate, formatMoney } from '@/lib/format';
import { translatorFor } from '@/lib/messages';
import type { SeatLabel } from '@/lib/stadium';
import { ticketText } from '@/lib/ticket-text';

export interface OrderEmailInput {
  locale: AppLocale;
  /** The messages of `locale`. */
  messages: AbstractIntlMessages;
  /** This site's origin, for the links. */
  siteUrl: string;
  order: {
    code: string;
    name: string;
    currency: string;
    feesMinor: number;
    taxMinor: number;
    totalMinor: number;
  };
  /** Times in epoch milliseconds. */
  event: {
    title: string;
    competition: string;
    homeTeam: string;
    awayTeam: string;
    startsAt: number;
    doorsAt: number;
  };
  tickets: { label: SeatLabel; priceMinor: number; holderName: string | null; token: string }[];
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const c = brand.colors;

export function renderOrderEmail(input: OrderEmailInput): RenderedEmail {
  const { locale, order, event, siteUrl, messages } = input;
  const t = translatorFor(messages, locale, 'email');
  const tt = translatorFor(messages, locale, 'tickets');
  const names = translatorFor(messages, locale, 'names');
  const links = {
    order: `${siteUrl}/orders/${order.code}`,
    ticket: (token: string) => `${siteUrl}/tickets/${token}`,
  };
  const date = formatDate(event.startsAt, 'long', locale);
  const kickoff = formatDate(event.startsAt, 'time', locale);
  const doors = formatDate(event.doorsAt, 'time', locale);
  const count = input.tickets.length;
  const subject = t('subject', { home: event.homeTeam, away: event.awayTeam, code: order.code });
  const body =
    locale === 'bn'
      ? "'Noto Sans Bengali','Nirmala UI',Arial,sans-serif"
      : "Barlow,'Helvetica Neue',Arial,sans-serif";
  const display =
    locale === 'bn' ? body : "'Barlow Condensed','Arial Narrow','Helvetica Neue',Arial,sans-serif";

  const button = (href: string, label: string, primary = false) =>
    `<a href="${esc(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:11px 18px;border-radius:10px;font:600 15px/1.2 ${body};text-decoration:none;${
      primary
        ? `background:${c.ink};color:#ffffff;`
        : `background:${c.paper2};color:${c.ink};border:1px solid ${c.line};`
    }">${esc(label)}</a>`;

  const ticketCards = input.tickets
    .map((tk, i) => {
      const words = ticketText(tk.label, tt, names);
      const facts = words.facts
        .map(
          (f) =>
            `<td style="padding:0 22px 0 0;vertical-align:top"><div style="font:600 12px/1.3 ${body};color:${c.muted}">${esc(
              f.label,
            )}</div><div style="font:700 26px/1.1 ${display};color:${c.ink}">${esc(f.value)}</div></td>`,
        )
        .join('');
      const holder = tk.holderName
        ? `<div style="margin-top:10px;font:400 14px/1.4 ${body};color:${c.ink}">${esc(tt('holder'))}: <strong>${esc(
            tk.holderName,
          )}</strong></div>`
        : '';
      return `
<tr><td style="padding:14px 0 0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.paper};border:1px solid ${c.line};border-radius:14px">
    <tr>
      <td style="padding:18px 20px;vertical-align:top">
        <div style="font:600 13px/1.3 ${body};color:${c.muted}">${esc(t('ticketOf', { n: i + 1, count }))}</div>
        <div style="margin-top:6px;font:600 14px/1.3 ${body};color:${c.ink}">${esc(words.kicker)}</div>
        <div style="font:700 34px/1.05 ${display};color:${c.ink}">${esc(words.title)}</div>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:10px"><tr>${facts}</tr></table>
        ${holder}
        <div style="margin-top:14px">${button(links.ticket(tk.token), t('showTicket'), true)}</div>
      </td>
      <td width="110" style="width:110px;padding:18px 12px;border-left:2px dashed #d6d0c3;text-align:center;vertical-align:middle">
        <div style="font:700 13px/1 ${body};color:${c.muted}">${esc(order.currency === 'BDT' ? currencySign(locale) : order.currency)}</div>
        <div style="margin-top:8px;font:700 30px/1 ${display};color:${c.pickInk}">${esc(
          formatAmount(tk.priceMinor, locale),
        )}</div>
      </td>
    </tr>
  </table>
</td></tr>`;
    })
    .join('');

  const extraLines = [
    order.feesMinor > 0 ? [t('fees'), formatMoney(order.feesMinor, locale, order.currency)] : null,
    order.taxMinor > 0 ? [t('tax'), formatMoney(order.taxMinor, locale, order.currency)] : null,
  ].filter((x): x is string[] => !!x);

  const html = `<!doctype html>
<html lang="${locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${c.paper2}">
<div style="display:none;max-height:0;overflow:hidden">${esc(
    t('preheader', { count, date: formatDate(event.startsAt, 'weekdayShort', locale), doors }),
  )}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.paper2}">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%">
  <tr><td style="padding:0 4px 14px;font:700 24px/1.1 ${display};color:${c.ink}">${esc(brand.name)}</td></tr>
  <tr><td style="background:${c.paper};border:1px solid ${c.line};border-radius:14px;padding:24px">
    <h1 style="margin:0;font:700 32px/1.1 ${display};color:${c.ink}">${esc(t('title'))}</h1>
    <p style="margin:10px 0 0;font:400 16px/1.5 ${body};color:${c.ink}">${esc(t('intro', { name: order.name, code: order.code }))}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;background:${c.paper2};border-radius:12px">
      <tr><td style="padding:16px 18px">
        <div style="font:600 13px/1.3 ${body};color:${c.muted}">${esc(event.competition)}</div>
        <div style="font:700 26px/1.15 ${display};color:${c.ink}">${esc(event.title)}</div>
        <div style="margin-top:6px;font:400 15px/1.5 ${body};color:${c.ink}">${esc(date)} · ${esc(t('kickoff'))} ${esc(kickoff)}</div>
        <div style="font:400 15px/1.5 ${body};color:${c.ink}">${esc(t('doors'))} ${esc(doors)}</div>
        <div style="font:400 14px/1.5 ${body};color:${c.muted}">${esc(brand.name)}, ${esc(brand.address.line1)}, ${esc(brand.address.city)}</div>
      </td></tr>
    </table>
  </td></tr>
  ${ticketCards}
  <tr><td style="padding:16px 0 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.paper};border:1px solid ${c.line};border-radius:14px">
      <tr><td style="padding:18px 20px">
        ${extraLines
          .map(
            ([label, value]) =>
              `<div style="font:400 15px/1.6 ${body};color:${c.ink}">${esc(label)}: ${esc(value)}</div>`,
          )
          .join('')}
        <div style="font:700 18px/1.5 ${body};color:${c.ink}">${esc(t('total'))}: ${esc(
          formatMoney(order.totalMinor, locale, order.currency),
        )}</div>
        <div style="margin-top:12px">${button(links.order, t('viewOrder'), true)}</div>
        <div style="margin-top:4px;font:400 14px/1.5 ${body};color:${c.muted}">${esc(t('downloads'))}</div>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:18px 4px 0;font:400 13px/1.5 ${body};color:${c.muted}">
    ${esc(t('sample'))}<br>${esc(t('why', { site: brand.name }))}<br>${esc(
      `${brand.address.line1}, ${brand.address.line2}, ${brand.address.city}, ${brand.address.country}`,
    )}
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const textLines = [
    t('title'),
    '',
    t('intro', { name: order.name, code: order.code }),
    '',
    event.title,
    `${date} · ${t('kickoff')} ${kickoff}`,
    `${t('doors')} ${doors}`,
    '',
    ...input.tickets.flatMap((tk, i) => {
      const words = ticketText(tk.label, tt, names);
      return [
        `${t('ticketOf', { n: i + 1, count })}: ${words.kicker}, ${words.short} (${formatMoney(tk.priceMinor, locale, order.currency)})`,
        `${t('showTicket')}: ${links.ticket(tk.token)}`,
        '',
      ];
    }),
    `${t('total')}: ${formatMoney(order.totalMinor, locale, order.currency)}`,
    `${t('viewOrder')}: ${links.order}`,
    t('downloads'),
    '',
    t('sample'),
  ];
  return { subject, html, text: textLines.join('\n') };
}
