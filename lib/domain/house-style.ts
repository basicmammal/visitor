import type { EventDate } from '@/lib/db/schema';

/**
 * How the visitor guide prints things. Every rule here is copied from a
 * printed edition (vjvg_26_3, What's On), not invented:
 *
 *   1 SEP UNTIL 29 OCT   10:00-16:00
 *   Meet Albert: The Retired Gunner
 *   Step into the past and meet Albert…  £11.45 - £24.50
 *   Elizabeth Castle
 *   St Aubin's Bay, St. Helier
 *   +44 (0) 1534 633300
 *   JERSEYHERITAGE.ORG
 *
 * Pure, so the page preview and the InDesign export print the same thing.
 */

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** The guide writes "St. Helier", with a full stop. */
export function printParish(parish: string | null): string | null {
  if (!parish) return null;
  return parish.replace(/^(St|Saint)\.?\s+/i, 'St. ');
}

type Day = { iso: string; y: number; m: number; d: number; t: number };

function day(iso: string): Day {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return { iso, y, m, d, t: Date.UTC(y, m - 1, d) / 86_400_000 };
}

const dm = (x: Day) => `${x.d} ${MONTHS[x.m - 1]}`;

const WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const short = (w: number) => WEEKDAYS[w]!.slice(0, 3);

/**
 * The same one to four weekdays, filled most weeks for a fortnight or
 * more: "FRIDAY", "SAT & SUN", "THU - SUN". Null for anything else, a
 * daily run or dates that skip about.
 */
function everyWeek(days: Day[]): string | null {
  const first = days[0]!;
  const last = days.at(-1)!;
  if (days.length < 4 || last.t - first.t < 13) return null;
  const dow = (x: Day) => new Date(x.t * 86_400_000).getUTCDay();
  const weekdays = [...new Set(days.map(dow))].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  if (weekdays.length > 4) return null;
  let slots = 0;
  for (let t = first.t; t <= last.t; t += 1) if (weekdays.includes(new Date(t * 86_400_000).getUTCDay())) slots += 1;
  if (days.length / slots < 0.75) return null;
  if (weekdays.length === 1) return WEEKDAYS[weekdays[0]!]!;
  const mon = weekdays.map((w) => (w + 6) % 7);
  const run = mon.every((w, i) => i === 0 || w === mon[i - 1]! + 1);
  if (run && weekdays.length > 2) return `${short(weekdays[0]!)} - ${short(weekdays.at(-1)!)}`;
  return weekdays.length === 2 ? `${short(weekdays[0]!)} & ${short(weekdays[1]!)}` : weekdays.map(short).join(', ');
}

/** Past about six months after the edition, an ongoing listing's last date is the source's "no end", not a closing date. */
const OPEN_ENDED_AFTER = 180;

/**
 * When an ongoing listing is on, for the Ongoing events page: by its own
 * first and last days, not clipped to the edition, and with no end at all
 * when the source's end is a placeholder far off. "UNTIL 10 JAN",
 * "FROM 1 JAN", "12 DEC - 4 APR", or "ALL SEASON" when it is on before the
 * edition starts and after it ends. Null when not on in the edition.
 */
export function printOngoingDates(dates: readonly EventDate[], window: { from: string; to: string }): string | null {
  const isos = [...new Set(dates.map((x) => x.date))].sort();
  if (!isos.some((iso) => iso >= window.from && iso <= window.to)) return null;
  const first = day(isos[0]!);
  const last = day(isos.at(-1)!);
  const end = day(window.to);
  const starts = first.iso > window.from;
  const ends = last.t - end.t <= OPEN_ENDED_AFTER;
  if (starts && ends) return `${dm(first)} - ${dm(last)}`;
  if (starts) return `FROM ${dm(first)}`;
  if (ends) return `UNTIL ${dm(last)}`;
  return 'ALL SEASON';
}

/**
 * An event's dates as the guide prints them, keeping only those inside
 * the edition's window.
 *
 *   one date                          26 OCT
 *   two                               1 SEP & 15 SEP
 *   a short run of consecutive days   1 - 5 SEP, 30 SEP - 4 OCT
 *   the same days most weeks          EVERY FRIDAY, 6 NOV - 18 DEC
 *                                     EVERY THU - SUN, 26 NOV - 20 DEC
 *   a long run, mostly daily          1 SEP UNTIL 29 OCT
 *   anything else                     1 SEP, 3/8/10/15 SEP, 2 OCT
 *
 * The last is the guide's own shape: the first date in full, then the
 * rest grouped by month.
 */
export function printDates(dates: readonly EventDate[], window?: { from: string; to: string }): string | null {
  const isos = [...new Set(dates.map((x) => x.date))]
    .filter((iso) => !window || (iso >= window.from && iso <= window.to))
    .sort();
  if (isos.length === 0) return null;
  const days = isos.map(day);
  const first = days[0]!;
  const last = days.at(-1)!;
  if (days.length === 1) return dm(first);

  const span = last.t - first.t + 1;
  const consecutive = span === days.length;
  if (consecutive && span <= 7) {
    return first.m === last.m ? `${first.d} - ${last.d} ${MONTHS[last.m - 1]}` : `${dm(first)} - ${dm(last)}`;
  }
  const weekly = everyWeek(days);
  if (weekly) return `EVERY ${weekly}, ${dm(first)} - ${dm(last)}`;
  // Open most days over a long stretch: an exhibition, a season.
  if (days.length >= 8 && days.length / span >= 0.4) return `${dm(first)} UNTIL ${dm(last)}`;
  if (days.length === 2) return `${dm(first)} & ${dm(last)}`;

  const groups: string[] = [];
  for (const x of days.slice(1)) {
    const prev = groups.at(-1);
    const label = MONTHS[x.m - 1]!;
    if (prev?.endsWith(` ${label}`)) groups[groups.length - 1] = prev.replace(` ${label}`, `/${x.d} ${label}`);
    else groups.push(`${x.d} ${label}`);
  }
  return [dm(first), ...groups].join(', ');
}

/**
 * "10:00-16:00", or "15:00, 19:30" for two shows with no end time, or
 * "18:30-23:00 | 9:30-23:00" when the hours differ between days.
 */
export function printTimes(dates: readonly EventDate[]): string | null {
  const seen: string[] = [];
  for (const x of dates) {
    if (!x.start) continue;
    const t = x.end ? `${x.start}-${x.end}` : x.start;
    if (!seen.includes(t)) seen.push(t);
  }
  if (seen.length === 0) return null;
  return seen.some((t) => t.includes('-')) ? seen.join(' | ') : seen.join(', ');
}

/** "£11.45 - £24.50", "£5.00", or "Free entry" when the source says nothing costs anything. */
export function printPrice(from: number | null, to: number | null, opts: { free?: boolean } = {}): string | null {
  const f = (p: number) => `£${(p / 100).toFixed(2)}`;
  if (from !== null && to !== null && from !== to) return `${f(Math.min(from, to))} - ${f(Math.max(from, to))}`;
  const one = from ?? to;
  if (one !== null) return f(one);
  return opts.free ? 'Free entry' : null;
}

const hostOf = (url: string): string | null => {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
};

const SOCIAL: [RegExp, string][] = [
  [/(^|\.)(facebook|fb)\.(com|me)$/, 'Facebook'],
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)(twitter|x)\.com$/, 'X'],
  [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)linktr\.ee$/, 'Linktree'],
];

/** "Facebook" for a Facebook page, and so on: a social page is not a website. */
export function socialSite(url: string | null): string | null {
  const host = url ? hostOf(url) : null;
  return host ? SOCIAL.find(([re]) => re.test(host))?.[1] ?? null : null;
}

/** "https://www.jerseyheritage.org/whats-on/x" to "JERSEYHERITAGE.ORG". A social page prints as nothing: the guide prints websites only. */
export function printWebsite(url: string | null): string | null {
  if (!url || socialSite(url)) return null;
  return hostOf(url)?.toUpperCase() ?? null;
}

/** How a link reads on the site: the website's address, or the social page's name. */
export function siteLabel(url: string | null): string | null {
  return socialSite(url) ?? printWebsite(url)?.toLowerCase() ?? null;
}

/** A phone number if there is one, otherwise the email: the guide prints one or the other. */
export function printContact(phone: string | null, email: string | null): string | null {
  return phone?.trim() || email?.trim() || null;
}

/** "Castle Green, St. Martin, JE3 6ET". */
export function printAddress(p: { addressLine1: string | null; parish: string | null; postcode: string | null }): string | null {
  const parts = [p.addressLine1, printParish(p.parish), p.postcode].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

const TOUR_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Tours print their dates differently from events, every date grouped by
 * month: "1/8/15/22/29 Sep, 6 Oct", "2/13/16/27/28 Sep, 7/27 Oct".
 */
export function printTourDates(dates: readonly EventDate[], window?: { from: string; to: string }): string | null {
  const isos = [...new Set(dates.map((x) => x.date))]
    .filter((iso) => !window || (iso >= window.from && iso <= window.to))
    .sort();
  if (isos.length === 0) return null;
  const groups: { key: string; label: string; days: number[] }[] = [];
  for (const iso of isos) {
    const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
    const key = `${y}-${m}`;
    const g = groups.at(-1);
    if (g?.key === key) g.days.push(d);
    else groups.push({ key, label: TOUR_MONTHS[m - 1]!, days: [d] });
  }
  return groups.map((g) => `${g.days.join('/')} ${g.label}`).join(', ');
}

/** Words a title keeps small unless they open or close it, or follow a colon or dash. */
const MINOR = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'en', 'for', 'from', 'in', 'into', 'nor', 'of', 'on', 'or', 'per', 'the', 'to', 'v', 'vs', 'via', 'with', 'de', 'du', 'la', 'le', 'les', 'des']);

/**
 * A heading in title case, as the guide prints them: "An Island Christmas
 * Carol at 16 New Street", "Jersey Bulls v Hartley Wintney". What its
 * source already wrote with care is kept: acronyms (JCG, RFC), names with
 * capitals inside (O'Sullivan, McQueen, iNED). A title shouted in
 * capitals is cased again from scratch.
 */
export function printTitle(title: string): string {
  const letters = title.replace(/[^A-Za-z]/g, '');
  const shouted = letters.length > 3 && letters === letters.toUpperCase();
  const source = shouted ? title.toLowerCase() : title;
  const words = source.split(/(\s+)/);
  const real = words.map((w, i) => (/\S/.test(w) ? i : -1)).filter((i) => i >= 0);
  const first = real[0];
  const last = real.at(-1);
  return words
    .map((w, i) => {
      if (!/\S/.test(w)) return w;
      const before = words.slice(0, i).join('').trimEnd();
      const opens = i === first || i === last || /[:–—\-(]$/.test(before);
      return w
        .split('-')
        .map((part, j) => {
          const core = part.replace(/^[^A-Za-z0-9]+/, '');
          const lead = part.slice(0, part.length - core.length);
          if (!core) return part;
          // Already deliberate: an acronym or a capital inside the word.
          if (!shouted && (/^[A-Z0-9&.]{2,}$/.test(core.replace(/[^A-Za-z0-9&.]/g, '')) || /[a-z][A-Z]/.test(core) || /^[a-z]+[A-Z]/.test(core))) return part;
          const bare = core.toLowerCase().replace(/[^a-z]/g, '');
          if (j === 0 && !opens && MINOR.has(bare)) return lead + core.toLowerCase();
          if (/^\d/.test(core)) return part;
          return lead + core.charAt(0).toUpperCase() + core.slice(1);
        })
        .join('-');
    })
    .join('');
}

/** Where, for a card: the venue or meeting point, and the parish unless the name already says it. "Jersey Arts Centre, St. Helier". */
export function cardLocation(place: string | null | undefined, parish: string | null | undefined): string | null {
  const name = place?.trim() || null;
  const p = printParish(parish ?? null);
  const letters = (s: string) => s.toLowerCase().replace(/^(st\.?|saint)\s+/, '').replace(/[^a-z]/g, '');
  if (!name || !p) return name ?? p;
  return letters(name).includes(letters(p)) ? name : `${name}, ${p}`;
}
