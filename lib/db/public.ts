import { organiserKey } from '@/lib/domain/organiser';
import { and, asc, eq, getTableColumns, ne, or, inArray, notInArray, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import { db } from './index';
import { events, experiences, organiserProfiles, places, providers, type Category, type Event } from './schema';
import { UNIQUE } from '@/lib/domain/occurrence';
import { byWhen, nextDate } from '@/lib/domain/web-dates';
import type { Genre } from '@/lib/domain/genre';
import { normaliseName } from '@/lib/domain/same-place';
import { slugify } from '@/lib/domain/slug';
import { likeEscape } from '@/lib/domain/search';
import { hiddenByDefault, siteTypes } from '@/lib/domain/categorise';
import { cached, LISTINGS_TTL_MS } from '@/lib/cache';
import { addMonths } from '@/lib/domain/months';

/**
 * What the public site shows. Everything not left out — the site is the
 * whole picture, the guide is the edited selection — and only what is
 * still to come, and nothing a provider sent us that we have not yet
 * approved. Unique events and dated tours by default; ongoing and
 * on-demand ones when the visitor ticks for them. Highlights always.
 */

export const todayIso = () => new Date().toISOString().slice(0, 10);

const hasUpcoming = (col: typeof events.dates | typeof experiences.dates) =>
  sql`exists (select 1 from jsonb_array_elements(${col}) d where d->>'date' >= to_char(now(), 'YYYY-MM-DD'))`;

/** Any of its days between two dates, both inclusive. */
const inRange = (col: typeof events.dates | typeof experiences.dates, r: { from: string; to: string }) =>
  sql`exists (select 1 from jsonb_array_elements(${col}) d where d->>'date' between ${r.from} and ${r.to})`;

/** `range`: only what has a day in it, sorted and grouped by its first day there. */
export type PublicEventFilter = { showOngoing?: boolean; range?: { from: string; to: string } | null; type?: string; q?: string };

/**
 * What a listing of events shows, and no more: its summary and guide
 * copy (a card's blurb), but no long description, and none of the bookkeeping (field sources, locks, gallery).
 * The detail page reads the rest.
 */
const LIST_COLUMNS = {
  id: events.id, slug: events.slug, title: events.title, summary: events.summary, guideCopy: events.guideCopy, venue: events.venue, venueName: events.venueName, addressLine1: events.addressLine1,
  parish: events.parish, postcode: events.postcode, website: events.website, organiser: events.organiser, sourceLink: events.sourceLink,
  eventTypes: events.eventTypes, free: events.free, occurrence: events.occurrence, placeId: events.placeId, lat: events.lat, lon: events.lon,
  dates: events.dates, fromPricePence: events.fromPricePence, toPricePence: events.toPricePence, highlight: events.highlight, headerImage: events.headerImage,
  updatedAt: events.updatedAt,
};
export type ListEvent = Pick<Event, keyof typeof LIST_COLUMNS>;
type VenueRef = { name: string; slug: string; parish: string | null } | null;
/** An event as the public listings hold it: `hidden` and `siteTypes` judged once, from its words, when loaded. */
export type PublicEventRow = { event: ListEvent; venue: VenueRef; hidden: boolean; siteTypes: string[]; text: { description: string | null } };

/**
 * Every public event still to come, from the cache: one read of the
 * database every ten minutes, whatever the traffic. The description is
 * read to judge each event's kinds (and for the agents' feeds), not sent
 * to the pages that list them.
 */
function allPublicEvents(): Promise<PublicEventRow[]> {
  return cached('public:events', LISTINGS_TTL_MS, async () => {
    const rows = await db
      .select({ event: { ...LIST_COLUMNS, description: events.description, lockedFields: events.lockedFields }, venue: { name: places.name, slug: places.slug, parish: places.parish } })
      .from(events)
      .leftJoin(places, eq(places.id, events.placeId))
      .where(and(ne(events.inclusion, 'excluded'), eq(events.review, 'approved'), hasUpcoming(events.dates)));
    return rows.map(({ event: { description, lockedFields, ...event }, venue }) => {
      const judged = { ...event, description, lockedFields };
      return { event, venue: venue?.slug ? (venue as VenueRef) : null, hidden: hiddenByDefault(judged), siteTypes: siteTypes(judged), text: { description } };
    });
  });
}

const upcoming = (dates: Event['dates'], today: string) => dates.some((d) => d.date >= today);
const lower = (s: string | null | undefined) => (s ?? '').toLowerCase();

export async function publicEvents(f: PublicEventFilter = {}) {
  const today = todayIso();
  const q = f.q?.trim().toLowerCase();
  const rows = (await allPublicEvents()).filter(
    ({ event: e }) =>
      upcoming(e.dates, today) &&
      (f.showOngoing || UNIQUE.includes(e.occurrence) || e.highlight) &&
      (!f.type || e.eventTypes.includes(f.type)) &&
      (!q || lower(e.title).includes(q) || lower(e.venueName).includes(q)) &&
      (!f.range || e.dates.some((d) => d.date >= f.range!.from && d.date <= f.range!.to)),
  );
  const from = f.range && f.range.from > today ? f.range.from : today;
  return rows
    .map((r) => ({ ...r, next: nextDate(r.event.dates, from) ?? '9999' }))
    .sort(byWhen);
}

/**
 * The months with something on, from this one, and how many events in
 * each as What's on counts them (unique events and highlights, not those
 * it keeps back for Health & wellbeing): the month pages there are.
 */
export async function publicEventMonths(ahead = 12) {
  const today = todayIso();
  const first = today.slice(0, 7);
  const n = new Map<string, number>();
  for (const r of await publicEvents()) {
    if (r.hidden) continue;
    for (const ym of new Set(r.event.dates.filter((d) => d.date >= today).map((d) => d.date.slice(0, 7)))) n.set(ym, (n.get(ym) ?? 0) + 1);
  }
  return [...n]
    .filter(([ym]) => ym >= first && ym <= addMonths(first, ahead - 1))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ym, count]) => ({ ym, n: count }));
}

/** The same, with each event's description: for the agents' feeds, which print it. */
export async function publicEventsWithText(f: PublicEventFilter = {}) {
  return (await publicEvents(f)).map((r) => ({ ...r, event: { ...r.event, ...r.text } }));
}

export async function publicEvent(slug: string) {
  const [row] = await db
    .select({ event: events, venue: places })
    .from(events)
    .leftJoin(places, eq(places.id, events.placeId))
    .where(and(eq(events.slug, slug), ne(events.inclusion, 'excluded'), eq(events.review, 'approved')));
  return row ?? null;
}

const upcomingPublic = () => [ne(events.inclusion, 'excluded'), eq(events.review, 'approved'), hasUpcoming(events.dates)];

const byNextDate = <T extends { event: { dates: Event['dates'] } }>(rows: T[]) => {
  const today = todayIso();
  return rows.map((r) => ({ ...r, next: nextDate(r.event.dates, today) ?? '9999' })).sort(byWhen);
};

/** Every public event still to come, ongoing ones too: what the venue and event pages pick from. */
const everyUpcoming = async () => {
  const today = todayIso();
  return (await allPublicEvents()).filter((r) => upcoming(r.event.dates, today));
};

/** What else is on at the venue: by its place, or by name when the event has no place. */
export async function publicVenueEvents(e: Pick<Event, 'id' | 'placeId' | 'venueName'>, limit = 8) {
  const name = lower(e.venueName);
  if (!e.placeId && !name) return [];
  const rows = (await everyUpcoming()).filter((r) => r.event.id !== e.id && (e.placeId ? r.event.placeId === e.placeId : lower(r.event.venueName) === name));
  return byNextDate(rows).slice(0, limit);
}

/** Events of the same kinds, the closest match first, then the soonest. Unique events only: they are what a visitor plans around. */
export async function publicRelatedEvents(e: Pick<Event, 'eventTypes'>, exclude: string[], limit = 4) {
  const types = e.eventTypes.filter((t) => !STAFF_ONLY_TYPES.has(t));
  if (!types.length) return [];
  const rows = (await everyUpcoming()).filter((r) => UNIQUE.includes(r.event.occurrence) && !exclude.includes(r.event.id) && r.event.eventTypes.some((t) => types.includes(t)));
  const shared = (r: (typeof rows)[number]) => r.event.eventTypes.filter((t) => types.includes(t)).length;
  return byNextDate(rows)
    .sort((a, b) => shared(b) - shared(a) || a.next.localeCompare(b.next))
    .slice(0, limit);
}

/** Types for staff, not visitors: a filter for them would only lead to what review turned down. */
const STAFF_ONLY_TYPES = new Set(['Business & networking']);

export type PublicTourFilter = { showOnDemand?: boolean; genre?: Genre; range?: { from: string; to: string } | null; q?: string };

/** Every public tour still to come, from the cache, with its operator: one read every ten minutes. The bookkeeping (field sources, locks) stays behind. */
function allPublicTours() {
  return cached('public:tours', LISTINGS_TTL_MS, async () => {
    const { fieldSources: _f, lockedFields: _l, ...columns } = getTableColumns(experiences);
    return db
      .select({ tour: columns, provider: { id: providers.id, name: providers.name, website: providers.website } })
      .from(experiences)
      .leftJoin(providers, eq(providers.id, experiences.providerId))
      .where(and(ne(experiences.inclusion, 'excluded'), eq(experiences.review, 'approved'), hasUpcoming(experiences.dates)))
      .orderBy(asc(experiences.title));
  });
}

export async function publicTours(f: PublicTourFilter = {}) {
  const today = todayIso();
  const q = f.q?.trim().toLowerCase();
  const rows = (await allPublicTours()).filter(
    ({ tour: t, provider }) =>
      upcoming(t.dates, today) &&
      (f.showOnDemand || UNIQUE.includes(t.occurrence) || t.highlight) &&
      (!f.genre || t.genre === f.genre) &&
      (!q || lower(t.title).includes(q) || lower(provider?.name).includes(q)) &&
      (!f.range || t.dates.some((d) => d.date >= f.range!.from && d.date <= f.range!.to)),
  );
  const from = f.range && f.range.from > today ? f.range.from : today;
  return rows
    .map((r) => ({ ...r, next: nextDate(r.tour.dates, from) ?? '9999' }))
    .sort((a, b) => {
      // Dated tours by their next date; on-demand ones after, by name. Not one string with a ~
      // in front of the names: a locale sorts ~ before the digits, so on-demand came first.
      const aDated = UNIQUE.includes(a.tour.occurrence);
      const bDated = UNIQUE.includes(b.tour.occurrence);
      if (aDated !== bDated) return aDated ? -1 : 1;
      return aDated ? a.next.localeCompare(b.next) || a.tour.title.localeCompare(b.tour.title) : a.tour.title.localeCompare(b.tour.title);
    });
}

export async function publicTour(slug: string) {
  const [row] = await db
    .select({ tour: experiences, provider: providers })
    .from(experiences)
    .leftJoin(providers, eq(providers.id, experiences.providerId))
    .where(and(eq(experiences.slug, slug), ne(experiences.inclusion, 'excluded'), eq(experiences.review, 'approved')));
  return row ?? null;
}

/** A venue on the public site, by its slug: approved and not left out. */
export async function publicVenue(slug: string) {
  const [venue] = await db
    .select()
    .from(places)
    .where(and(eq(places.slug, slug), ne(places.inclusion, 'excluded'), eq(places.review, 'approved')));
  return venue ?? null;
}

/** The venue an address belonged to before it was merged into another, so an old link still arrives. */
export async function venueFormerlyAt(slug: string) {
  const [row] = await db
    .select({ slug: places.slug })
    .from(places)
    .where(and(sql`${slug} = any(${places.formerSlugs})`, ne(places.inclusion, 'excluded'), eq(places.review, 'approved')));
  return row?.slug ?? null;
}

/** Everything coming up at a venue, soonest first: ongoing things too, as a venue's page is its whole programme. */
export async function publicEventsAt(placeId: string) {
  return byNextDate((await everyUpcoming()).filter((r) => r.event.placeId === placeId));
}

/**
 * The venues with something coming up, and how many: the venues page and
 * the What's on venue filter. Unique events count by default, as on What's
 * on; `withOngoing` counts exhibitions and weekly sessions too.
 */
export async function publicVenuesWithEvents(opts: { withOngoing?: boolean } = {}) {
  const where = [...upcomingPublic()];
  if (!opts.withOngoing) where.push(or(inArray(events.occurrence, [...UNIQUE]), eq(events.highlight, true))!);
  const rows = await db
    .select({
      id: places.id,
      slug: places.slug,
      name: places.name,
      parish: places.parish,
      category: places.category,
      headerImage: places.headerImage,
      summary: sql<string | null>`coalesce(${places.guideCopy}, ${places.summary})`,
      recommendedIn: places.recommendedIn,
      count: sql<number>`count(${events.id})::int`,
    })
    .from(places)
    .innerJoin(events, eq(events.placeId, places.id))
    .where(and(ne(places.inclusion, 'excluded'), eq(places.review, 'approved'), ...where))
    .groupBy(places.id);
  return rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * The venues page: every venue or business with events or tours coming
 * up, the busiest first. A tour counts for its operator's own listing.
 */
export async function publicVenuesWithSomethingOn() {
  const [byEvent, byTour] = await Promise.all([
    publicVenuesWithEvents({ withOngoing: true }),
    db
      .select({ id: places.id, slug: places.slug, name: places.name, parish: places.parish, category: places.category, headerImage: places.headerImage, summary: places.summary, recommendedIn: places.recommendedIn, tours: sql<number>`count(${experiences.id})::int` })
      .from(places)
      .innerJoin(providers, eq(providers.placeId, places.id))
      .innerJoin(experiences, eq(experiences.providerId, providers.id))
      .where(and(ne(places.inclusion, 'excluded'), eq(places.review, 'approved'), ne(experiences.inclusion, 'excluded'), eq(experiences.review, 'approved'), hasUpcoming(experiences.dates)))
      .groupBy(places.id),
  ]);
  const all = new Map(byEvent.map((v) => [v.id, { ...v, events: v.count, tours: 0 }]));
  for (const t of byTour) {
    const seen = all.get(t.id);
    if (seen) seen.tours = t.tours;
    else all.set(t.id, { ...t, count: 0, events: 0 });
  }
  return [...all.values()].sort((a, b) => b.events + b.tours - (a.events + a.tours) || a.name.localeCompare(b.name));
}

/** Every venue and business we list, by guide section, the visitor guide featured first, then A to Z; with what the printed guide gave each, for the page to lay out as a spread. */
export async function publicAllVenues(category?: Category) {
  const rows = await db
    .select({ id: places.id, slug: places.slug, name: places.name, parish: places.parish, category: places.category, headerImage: places.headerImage, summary: places.summary, recommendedIn: places.recommendedIn, listingSize: places.listingSize, guideCopy: places.guideCopy, guideLabel: places.guideLabel, aaRating: places.aaRating, stayType: places.stayType, firstListedAt: places.firstListedAt })
    .from(places)
    .where(and(ne(places.inclusion, 'excluded'), eq(places.review, 'approved'), ...(category ? [eq(places.category, category)] : [])));
  return rows.sort((a, b) => Number(!a.recommendedIn) - Number(!b.recommendedIn) || a.name.localeCompare(b.name));
}

export type Organiser = { slug: string; name: string; names: string[]; providerIds: string[]; website: string | null; events: number; tours: number };

/** Names as one: "The National Trust for Jersey" and "National Trust for Jersey" are the same people. */

/**
 * Who puts things on: the organisers the sources name on events
 * (Eventbrite's, the charities') and the operators who run tours, as one
 * list with how many of each are coming up. Most first.
 */
export async function publicOrganisers(): Promise<Organiser[]> {
  const [byEvent, byTour] = await Promise.all([
    db
      .select({ name: events.organiser, n: sql<number>`count(*)::int` })
      .from(events)
      .where(and(...upcomingPublic(), sql`${events.organiser} is not null`))
      .groupBy(events.organiser),
    db
      .select({ id: providers.id, name: providers.name, website: providers.website, n: sql<number>`count(*)::int` })
      .from(experiences)
      .innerJoin(providers, eq(providers.id, experiences.providerId))
      .where(and(ne(experiences.inclusion, 'excluded'), eq(experiences.review, 'approved'), hasUpcoming(experiences.dates)))
      .groupBy(providers.id),
  ]);
  const all = new Map<string, Organiser>();
  const add = (name: string, f: (o: Organiser) => void) => {
    const key = organiserKey(name);
    if (!key) return;
    const o = all.get(key) ?? { slug: '', name, names: [], providerIds: [], website: null, events: 0, tours: 0 };
    f(o);
    all.set(key, o);
  };
  for (const r of byEvent) add(r.name!, (o) => { o.events += r.n; o.names.push(r.name!); });
  for (const r of byTour) add(r.name, (o) => { o.tours += r.n; o.providerIds.push(r.id); o.website ??= r.website; o.name = r.name; });
  const list = [...all.values()];
  const taken = new Set<string>();
  for (const o of list.sort((a, b) => b.events + b.tours - (a.events + a.tours) || a.name.localeCompare(b.name))) {
    let slug = slugify(o.name) || 'organiser';
    for (let i = 2; taken.has(slug); i += 1) slug = `${slugify(o.name)}-${i}`;
    taken.add(slug);
    o.slug = slug;
  }
  return list;
}

/** One organiser and everything they have coming up: their events, then their tours. */
export async function publicOrganiser(slug: string) {
  // By its own slug, or by any spelling it was merged from (an event's sidebar links by the event's).
  const all = await publicOrganisers();
  const organiser = all.find((o) => o.slug === slug) ?? all.find((o) => o.names.some((n) => slugify(n) === slug));
  if (!organiser) return null;
  const [eventRows, tourRows] = await Promise.all([
    organiser.names.length
      ? db
          .select({ event: events, venue: { name: places.name, slug: places.slug, parish: places.parish } })
          .from(events)
          .leftJoin(places, eq(places.id, events.placeId))
          .where(and(...upcomingPublic(), inArray(events.organiser, organiser.names)))
      : Promise.resolve([]),
    organiser.providerIds.length
      ? db
          .select({ tour: experiences })
          .from(experiences)
          .where(and(ne(experiences.inclusion, 'excluded'), eq(experiences.review, 'approved'), hasUpcoming(experiences.dates), inArray(experiences.providerId, organiser.providerIds)))
      : Promise.resolve([]),
  ]);
  const today = todayIso();
  return {
    organiser,
    events: byNextDate(eventRows),
    tours: tourRows.map((r) => ({ ...r, next: nextDate(r.tour.dates, today) ?? '9999' })).sort((a, b) => a.next.localeCompare(b.next)),
  };
}

/** A public venue by its name, as a tour gives its meeting place or operator: for a link, so only an exact match. */
export async function publicVenueNamed(...names: (string | null | undefined)[]) {
  const wanted = names.filter((n): n is string => !!n?.trim()).map((n) => normaliseName(n));
  if (!wanted.length) return null;
  const rows = await db
    .select({ name: places.name, slug: places.slug })
    .from(places)
    .where(and(ne(places.inclusion, 'excluded'), eq(places.review, 'approved'), inArray(sql`lower(${places.name})`, names.filter((n): n is string => !!n?.trim()).map((n) => n.trim().toLowerCase()))));
  return rows.find((r) => wanted.includes(normaliseName(r.name))) ?? null;
}

/** The picture an organiser's events fall back on, if staff have set one. */
export async function organiserFallback(name: string) {
  const [row] = await db.select({ image: organiserProfiles.fallbackImage }).from(organiserProfiles).where(eq(organiserProfiles.key, organiserKey(name)));
  return row?.image ?? null;
}

/** Every word typed found in one of these columns or another: "jazz helier" is jazz in St Helier. */
const allWordsIn = (words: string[], cols: AnyColumn[]) => and(...words.map((w) => or(...cols.map((c) => sql`${c} ilike ${`%${likeEscape(w)}%`}`))));

/**
 * The site search: events (ongoing ones too), tours (on-demand ones too)
 * and venues, each matched on every word typed. `range` keeps events and
 * tours to those with a day in it; venues have no dates, so they are only
 * searched for by name, never listed wholesale.
 */
export async function publicSearch(words: string[], range: { from: string; to: string } | null = null) {
  const eventWhere: SQL[] = [ne(events.inclusion, 'excluded'), eq(events.review, 'approved'), hasUpcoming(events.dates)];
  const tourWhere: SQL[] = [ne(experiences.inclusion, 'excluded'), eq(experiences.review, 'approved'), hasUpcoming(experiences.dates)];
  const venueWhere: SQL[] = [ne(places.inclusion, 'excluded'), eq(places.review, 'approved')];
  if (words.length) {
    eventWhere.push(allWordsIn(words, [events.title, events.venueName, places.name, events.parish, places.parish, events.summary])!);
    tourWhere.push(allWordsIn(words, [experiences.title, providers.name, experiences.meetingPoint, experiences.parish, experiences.summary])!);
    venueWhere.push(allWordsIn(words, [places.name, places.parish, places.summary, places.stayType])!);
  }
  if (range) {
    eventWhere.push(inRange(events.dates, range));
    tourWhere.push(inRange(experiences.dates, range));
  }
  const [eventRows, tourRows, venueRows] = await Promise.all([
    db
      .select({ event: events, venue: { name: places.name, slug: places.slug, parish: places.parish } })
      .from(events)
      .leftJoin(places, eq(places.id, events.placeId))
      .where(and(...eventWhere)),
    db
      .select({ tour: experiences, provider: { id: providers.id, name: providers.name } })
      .from(experiences)
      .leftJoin(providers, eq(providers.id, experiences.providerId))
      .where(and(...tourWhere)),
    words.length
      ? db
          .select({ id: places.id, slug: places.slug, name: places.name, parish: places.parish, category: places.category, stayType: places.stayType, headerImage: places.headerImage, recommendedIn: places.recommendedIn, summary: places.summary })
          .from(places)
          .where(and(...venueWhere))
      : Promise.resolve([]),
  ]);
  // Each one's first day in the range chosen, not its next day overall.
  const today = range && range.from > todayIso() ? range.from : todayIso();
  return {
    events: eventRows.map((r) => ({ ...r, next: nextDate(r.event.dates, today) ?? '9999' })),
    tours: tourRows.map((r) => ({ ...r, next: nextDate(r.tour.dates, today) ?? '9999' })),
    venues: venueRows,
  };
}
