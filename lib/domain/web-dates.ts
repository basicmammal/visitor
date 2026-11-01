import type { EventDate } from '@/lib/db/schema';
import type { Occurrence } from './occurrence';

/**
 * When something is on, as the website says it: written for a visitor
 * scanning a list, not set to the guide's house style. Only dates from
 * today on count.
 *
 *   Sat 24 Oct
 *   Sat 31 Oct – Sun 1 Nov
 *   Sat 7 Nov, Mon 23 Nov
 *   Sat 2 Nov, Sun 3 Nov, Sat 9 Nov + 6 more
 *   Every Saturday until 17 Apr
 *   Until 3 Jan
 *   On now                     (ongoing, no real end in sight)
 */
/** Past about nine months ahead, an ongoing or regular listing's last date is a placeholder, not a closing date. */
const OPEN_ENDED_DAYS = 270;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const t = Date.UTC(y, m - 1, d);
  return { y, m, d, t: t / 86_400_000, dow: new Date(t).getUTCDay() };
};

export function upcomingDates(dates: readonly EventDate[], today: string): string[] {
  return [...new Set(dates.map((d) => d.date))].filter((d) => d >= today).sort();
}

export function webWhen(dates: readonly EventDate[], occurrence: Occurrence, today: string): string | null {
  const days = upcomingDates(dates, today).map(parse);
  if (days.length === 0) return null;
  const first = days[0]!;
  const last = days.at(-1)!;
  const thisYear = parse(today).y;
  const dm = (x: typeof first) => `${x.d} ${MONTHS[x.m - 1]}${x.y !== thisYear ? ` ${x.y}` : ''}`;
  const full = (x: typeof first) => `${DAYS[x.dow]} ${dm(x)}`;

  // An end this far off is the source's way of saying "no end date" (jersey.com sets 31 Dec next year), so it is not given.
  const openEnded = last.t - parse(today).t > OPEN_ENDED_DAYS;
  if (occurrence === 'ongoing') {
    const started = dates.some((d) => d.date < today) || first.t - parse(today).t <= 0;
    if (openEnded) return started ? 'On now' : `From ${dm(first)}`;
    return started ? `Until ${dm(last)}` : `${dm(first)} – ${dm(last)}`;
  }
  if (occurrence === 'regular') {
    const sameDay = days.every((x) => x.dow === first.dow);
    if (openEnded) return sameDay ? `Every ${DAYS_LONG[first.dow]}` : 'Regularly';
    return sameDay ? `Every ${DAYS_LONG[first.dow]} until ${dm(last)}` : `Regularly until ${dm(last)}`;
  }
  if (days.length === 1) return full(first);
  if (last.t - first.t + 1 === days.length) return `${full(first)} – ${full(last)}`;
  if (days.length <= 3) return days.map(full).join(', ');
  return `${days.slice(0, 3).map(full).join(', ')} + ${days.length - 3} more`;
}

/**
 * When, for a card: as webWhen, but scattered dates give only the next
 * one. "Sun 18 Oct", not "Sun 18 Oct, Sat 7 Nov, Sun 8 Nov + 3 more";
 * the event's own page lists them all.
 */
export function cardWhen(dates: readonly EventDate[], occurrence: Occurrence, today: string): string | null {
  const when = webWhen(dates, occurrence, today);
  if (occurrence === 'ongoing' || occurrence === 'regular' || !when) return when;
  // One day named, the next of several or the only one: its start time beside it.
  // A run of days: the times too, if every day starts at the same ones.
  const days = upcomingDates(dates, today);
  const times = startTimes(dates, days[0]!);
  const run = when.includes(' – ');
  const same = !run || days.every((d) => startTimes(dates, d).join() === times.join());
  const at = times.length && same ? ` · ${times.slice(0, 2).map(webTime).join(', ')}${times.length > 2 ? ' +' : ''}` : '';
  return (run ? when : when.split(', ')[0]!) + at;
}

/** The start times on a day, earliest first, each once: "14:00", "19:30". */
export function startTimes(dates: readonly EventDate[], day: string): string[] {
  return [...new Set(dates.filter((d) => d.date === day && d.start).map((d) => d.start!))].sort();
}

/**
 * The order for a list of events: by the day each is next on, then by
 * the time it starts that day (those with no time last), then by name.
 */
export function byWhen<T extends { next: string; event: { dates: readonly EventDate[]; title?: string } }>(a: T, b: T): number {
  const at = (r: T) => startTimes(r.event.dates, r.next)[0] ?? '99:99';
  return a.next.localeCompare(b.next) || at(a).localeCompare(at(b)) || (a.event.title ?? '').localeCompare(b.event.title ?? '');
}

/** The next date on or after today, for ordering a list. */
export function nextDate(dates: readonly EventDate[], today: string): string | null {
  return upcomingDates(dates, today)[0] ?? null;
}

/**
 * When, for the top of a listing's page: the next date to the fore, the
 * rest after it in smaller type. "Sat 24 Oct" and "and Sat 7 Nov"; many
 * later dates are counted, not listed, as the page lists them below. A
 * run of days, or something regular or ongoing, is one phrase.
 */
export function headerWhen(dates: readonly EventDate[], occurrence: Occurrence, today: string): { main: string; more: string | null } | null {
  const when = webWhen(dates, occurrence, today);
  if (!when) return null;
  const days = upcomingDates(dates, today).map(parse);
  const consecutive = days.at(-1)!.t - days[0]!.t + 1 === days.length;
  if (occurrence === 'ongoing' || occurrence === 'regular' || days.length === 1 || consecutive) return { main: when, more: null };
  const thisYear = parse(today).y;
  const full = (x: (typeof days)[number]) => `${DAYS[x.dow]} ${x.d} ${MONTHS[x.m - 1]}${x.y !== thisYear ? ` ${x.y}` : ''}`;
  const rest = days.slice(1);
  return { main: full(days[0]!), more: rest.length <= 2 ? `and ${rest.map(full).join(', ')}` : `and ${rest.length} more dates` };
}

/** A time as the website writes it: "7.30pm", "10am", "noon", "midnight". */
export function webTime(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]) % 24;
  const min = m[2]!;
  if (min === '00' && h === 12) return 'noon';
  if (min === '00' && h === 0) return 'midnight';
  return `${h % 12 || 12}${min === '00' ? '' : `.${min}`}${h < 12 ? 'am' : 'pm'}`;
}

/** Every time in a line of them, the website's way, ranges with an en dash: "10:00-16:00 | 19:30" → "10am–4pm | 7.30pm". */
export function webTimes(line: string | null): string | null {
  if (!line) return line;
  return line.replace(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/g, (_, a: string, b: string) => `${webTime(a)}–${webTime(b)}`).replace(/\b\d{1,2}:\d{2}\b/g, webTime);
}
