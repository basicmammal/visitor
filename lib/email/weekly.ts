import { webTime } from '@/lib/domain/web-dates';
import type { Email } from './send';
import { esc, oneLine, shell, site } from './templates';

/**
 * The weekly What's On email: highlights first with their pictures, then
 * the week day by day. Pure, so it is tested without a database; the
 * listings are chosen in lib/newsletter.ts.
 */

export type WeeklyItem = {
  title: string;
  /** The listing's page, absolute. */
  href: string;
  /** A web-sized picture, absolute, or none. */
  image: string | null;
  alt: string;
  /** Its first day in the week, YYYY-MM-DD. */
  day: string;
  /** That day's start, "19:30", when known. */
  time: string | null;
  where: string | null;
  price: string | null;
  summary: string | null;
  highlight: boolean;
};

export type WeeklyContent = { from: string; to: string; items: WeeklyItem[] };

/** Rows in the day by day part; more are counted and left to the website. */
export const MAX_LISTED = 40;
const MAX_HIGHLIGHTS = 3;

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const parse = (iso: string) => new Date(`${iso}T00:00:00Z`);
/** "Thursday 29 October" */
export const longDay = (iso: string) => {
  const d = parse(iso);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
/** "29 October – 4 November", or "1 – 7 November" within a month. */
export const weekLabel = (from: string, to: string) => {
  const f = parse(from);
  const t = parse(to);
  return f.getUTCMonth() === t.getUTCMonth()
    ? `${f.getUTCDate()} – ${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]}`
    : `${f.getUTCDate()} ${MONTHS[f.getUTCMonth()]} – ${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]}`;
};

/** What goes where: up to three highlights at the top, everything else by its day, and how many were left out. */
export function arrange(items: WeeklyItem[]) {
  const highlights = items.filter((i) => i.highlight && i.image).slice(0, MAX_HIGHLIGHTS);
  const rest = items.filter((i) => !highlights.includes(i)).sort((a, b) => a.day.localeCompare(b.day) || (a.time ?? '99').localeCompare(b.time ?? '99') || a.title.localeCompare(b.title));
  const listed = rest.slice(0, MAX_LISTED);
  const days = new Map<string, WeeklyItem[]>();
  for (const i of listed) days.set(i.day, [...(days.get(i.day) ?? []), i]);
  return { highlights, days: [...days.entries()], more: rest.length - listed.length };
}

export const weeklySubject = (c: Pick<WeeklyContent, 'from' | 'to'>) => oneLine(`What’s on in Jersey, ${weekLabel(c.from, c.to)}`);

/** The week's link on the site: What's On for exactly these days. */
export const weekHref = (c: Pick<WeeklyContent, 'from' | 'to'>) => `${site()}/whats-on?from=${c.from}&to=${c.to}`;

const meta = (i: WeeklyItem, withDay = false) => [withDay ? longDay(i.day) : null, i.time && webTime(i.time), i.where, i.price].filter(Boolean).join(' · ');

/**
 * One reader's copy. `links.leave` is their unsubscribe page;
 * `links.oneClick` goes in the List-Unsubscribe header for mail apps.
 */
export function weeklyEmail(c: WeeklyContent, links: { leave: string; oneClick: string }): Omit<Email, 'to'> {
  const { highlights, days, more } = arrange(c.items);
  const subject = weeklySubject(c);
  const all = weekHref(c);

  const text = [
    `What’s on in Jersey, ${weekLabel(c.from, c.to)}`,
    ...(highlights.length ? ['DON’T MISS', ...highlights.map((i) => [i.title, meta(i, true), i.summary, i.href].filter(Boolean).join('\n'))] : []),
    ...days.map(([day, items]) => [longDay(day).toUpperCase(), ...items.map((i) => [i.title, meta(i), i.href].filter(Boolean).join('\n'))].join('\n\n')),
    more > 0 ? `And ${more} more this week: ${all}` : `Everything on this week: ${all}`,
    `—\nVisitor, Jersey’s What’s On Guide\n${site()}\n\nYou signed up for the weekly email. To stop it: ${links.leave}`,
  ].join('\n\n');

  const h2 = (t: string) => `<p style="margin:28px 0 12px;font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#cd1316">${esc(t)}</p>`;
  const small = (t: string) => (t ? `<p style="margin:4px 0 0;font-size:13px;color:#777;line-height:1.45">${esc(t)}</p>` : '');
  const big = (i: WeeklyItem) => `<a href="${esc(i.href)}" style="text-decoration:none;color:#333333">
<img src="${esc(i.image!)}" alt="${esc(i.alt)}" width="496" style="display:block;width:100%;max-width:496px;height:auto;border-radius:6px;border:0">
<p style="margin:12px 0 0;font-size:19px;font-weight:bold;line-height:1.3;color:#0f2a44">${esc(i.title)}</p></a>
${small(meta(i, true))}
${i.summary ? `<p style="margin:6px 0 24px;font-size:14px;line-height:1.5">${esc(i.summary)}</p>` : '<div style="height:24px"></div>'}`;
  const row = (i: WeeklyItem) => `<tr><td style="padding:0 0 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
${i.image ? `<td width="88" valign="top" style="padding-right:14px"><a href="${esc(i.href)}"><img src="${esc(i.image)}" alt="${esc(i.alt)}" width="88" height="66" style="display:block;width:88px;height:66px;object-fit:cover;border-radius:4px;border:0"></a></td>` : ''}
<td valign="top"><a href="${esc(i.href)}" style="font-size:15px;font-weight:bold;line-height:1.35;color:#0f2a44;text-decoration:none">${esc(i.title)}</a>${small(meta(i))}</td>
</tr></table></td></tr>`;

  const inner = `<p style="margin:0 0 4px;font-size:22px;font-weight:bold;line-height:1.3;color:#333333">What’s on this week</p>
<p style="margin:0;font-size:14px;color:#777">${esc(weekLabel(c.from, c.to))}</p>
${highlights.length ? h2('Don’t miss') + highlights.map(big).join('\n') : ''}
${days.map(([day, items]) => `${h2(longDay(day))}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items.map(row).join('\n')}</table>`).join('\n')}
<p style="margin:24px 0 0"><a href="${esc(all)}" style="display:inline-block;background:#cd1316;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:4px">${more > 0 ? `${more} more this week` : 'Everything on this week'}</a></p>`;

  const below = `<p style="margin:8px 0 0;font-size:12px;color:#999;line-height:1.5">You signed up for Visitor’s weekly email. <a href="${esc(links.leave)}" style="color:#999">Unsubscribe</a></p>`;

  return {
    subject,
    text,
    html: shell(inner, below),
    headers: { 'List-Unsubscribe': `<${links.oneClick}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}
