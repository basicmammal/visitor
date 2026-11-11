import { and, asc, eq, gte, ilike, inArray, isNotNull, lte, or, sql, type SQL, ne } from 'drizzle-orm';
import { db } from './index';
import { events, experiences, places, providers, type Category, type Inclusion } from './schema';
import type { Genre } from '@/lib/domain/genre';
import type { Occurrence } from '@/lib/domain/occurrence';
import { metresBetween } from '@/lib/domain/same-place';

export type EventFilter = {
  inclusion?: Inclusion;
  /** "2026-11": events on at any point in that month. */
  month?: string;
  q?: string;
  venueId?: string;
  /** Which kinds to list. Unique ones by default; regular and ongoing on request. */
  occurrences?: readonly Occurrence[];
};

function monthBounds(month: string): [string, string] | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return [`${m[1]}-${m[2]}-01`, `${m[1]}-${m[2]}-${String(last).padStart(2, '0')}`];
}

/**
 * The admin lists hold what is public. A provider's listing joins them
 * once approved; until then it is in the review queue (lib/listings.ts).
 */
export async function listEvents(f: EventFilter = {}) {
  const where: SQL[] = [eq(events.review, 'approved')];
  if (f.inclusion) where.push(eq(events.inclusion, f.inclusion));
  if (f.venueId) where.push(eq(events.placeId, f.venueId));
  if (f.occurrences) where.push(inArray(events.occurrence, [...f.occurrences]));
  if (f.q) where.push(or(ilike(events.title, `%${f.q}%`), ilike(events.venue, `%${f.q}%`))!);
  const bounds = f.month ? monthBounds(f.month) : null;
  if (bounds) where.push(lte(events.startsOn, bounds[1]), gte(events.endsOn, bounds[0]));

  return db
    .select({ event: events, venue: { id: places.id, name: places.name, slug: places.slug } })
    .from(events)
    .leftJoin(places, eq(places.id, events.placeId))
    .where(and(...where))
    .orderBy(asc(events.startsOn), asc(events.title));
}

export async function getEvent(slug: string) {
  const [row] = await db
    .select({ event: events, venue: places })
    .from(events)
    .leftJoin(places, eq(places.id, events.placeId))
    .where(eq(events.slug, slug));
  return row ?? null;
}

// Spelled out: drizzle leaves columns unqualified inside a subquery, so
// `${places.id}` there became the events table's own "id" and every count was 0.
const eventCount = sql<number>`(select count(*) from "events" e where e.place_id = "places"."id")::int`;

export type VenueFilter = {
  inclusion?: Inclusion;
  category?: Category;
  q?: string;
  /** Only places that host at least one event. The default view. */
  hostsEvents?: boolean;
};

export async function listVenues(f: VenueFilter = {}) {
  const where: SQL[] = [eq(places.review, 'approved')];
  if (f.inclusion) where.push(eq(places.inclusion, f.inclusion));
  if (f.category) where.push(eq(places.category, f.category));
  if (f.q) where.push(or(ilike(places.name, `%${f.q}%`), ilike(places.parish, `%${f.q}%`))!);
  if (f.hostsEvents) where.push(sql`${eventCount} > 0`);
  return db
    .select({ place: places, eventCount })
    .from(places)
    .where(and(...where))
    .orderBy(sql`${eventCount} desc`, asc(places.name));
}

export async function getVenue(slug: string) {
  const [place] = await db.select().from(places).where(eq(places.slug, slug));
  if (!place) return null;
  const hosted = await db.select().from(events).where(eq(events.placeId, place.id)).orderBy(asc(events.startsOn));
  return { place, events: hosted };
}

/** What the guide currently holds. */
/**
 * What the guide prints: what staff have included, or, as a draft, every
 * approved listing nobody has left out, so an edition can be laid out
 * before it is chosen. A draft leaves out business events, which are not
 * for visitors, and venues, which are always chosen by hand.
 */
export async function guideSelection(opts: { draft?: boolean } = {}) {
  const chosen = (col: typeof events.inclusion) => (opts.draft ? ne(col, 'excluded') : eq(col, 'included'));
  const [chosenEvents, chosenVenues] = await Promise.all([
    db
      .select({ event: events, venue: places })
      .from(events)
      .leftJoin(places, eq(places.id, events.placeId))
      .where(and(chosen(events.inclusion), eq(events.review, 'approved'), ...(opts.draft ? [sql`not ('Business & networking' = any(${events.eventTypes}))`] : [])))
      .orderBy(asc(events.startsOn), asc(events.title)),
    db.select().from(places).where(and(eq(places.inclusion, 'included'), eq(places.review, 'approved'))).orderBy(asc(places.category), asc(places.name)),
  ]);
  return { events: chosenEvents, venues: chosenVenues };
}

export async function mapPoints(opts: { includedOnly: boolean }) {
  const inc = opts.includedOnly ? [eq(places.inclusion, 'included')] : [];
  const venues = await db
    .select({ id: places.id, slug: places.slug, name: places.name, lat: places.lat, lon: places.lon, inclusion: places.inclusion, eventCount })
    .from(places)
    .where(and(isNotNull(places.lat), eq(places.review, 'approved'), sql`${eventCount} > 0`, ...inc));
  return venues;
}


/** Listings within roughly 600m of a pin, nearest first: the choices for an event's venue. */
export async function placesNear(lat: number, lon: number, limit = 15) {
  const dLat = 0.0055;
  const dLon = 0.0085;
  const rows = await db
    .select({ id: places.id, name: places.name, lat: places.lat, lon: places.lon })
    .from(places)
    .where(and(eq(places.review, 'approved'), gte(places.lat, lat - dLat), lte(places.lat, lat + dLat), gte(places.lon, lon - dLon), lte(places.lon, lon + dLon)));
  return rows
    .map((r) => ({ ...r, metres: metresBetween({ lat, lon }, { lat: r.lat!, lon: r.lon! }) }))
    .sort((a, b) => a.metres - b.metres)
    .slice(0, limit);
}

export type ExperienceFilter = {
  inclusion?: Inclusion;
  q?: string;
  month?: string;
  genre?: Genre | 'none';
  providerId?: string;
  occurrences?: readonly Occurrence[];
};

/** Tours on any date in the month, from their date list. */
function onInMonth(month: string): SQL | null {
  const bounds = monthBounds(month);
  if (!bounds) return null;
  return sql`exists (select 1 from jsonb_array_elements(${experiences.dates}) d where d->>'date' between ${bounds[0]} and ${bounds[1]})`;
}

const firstDate = sql<string>`(select min(d->>'date') from jsonb_array_elements(${experiences.dates}) d where d->>'date' >= to_char(now(), 'YYYY-MM-DD'))`;

export async function listExperiences(f: ExperienceFilter = {}) {
  const where: SQL[] = [eq(experiences.review, 'approved')];
  if (f.inclusion) where.push(eq(experiences.inclusion, f.inclusion));
  if (f.genre === 'none') where.push(sql`${experiences.genre} is null`);
  else if (f.genre) where.push(eq(experiences.genre, f.genre));
  if (f.providerId) where.push(eq(experiences.providerId, f.providerId));
  if (f.occurrences) where.push(inArray(experiences.occurrence, [...f.occurrences]));
  if (f.q) where.push(or(ilike(experiences.title, `%${f.q}%`), ilike(providers.name, `%${f.q}%`))!);
  const month = f.month ? onInMonth(f.month) : null;
  if (month) where.push(month);
  return db
    .select({ experience: experiences, provider: providers, firstDate })
    .from(experiences)
    .leftJoin(providers, eq(providers.id, experiences.providerId))
    .where(and(...where))
    .orderBy(sql`${firstDate} asc nulls last`, asc(experiences.title));
}

export async function getExperience(slug: string) {
  const [row] = await db
    .select({ experience: experiences, provider: providers, client: places.client })
    .from(experiences)
    .leftJoin(providers, eq(providers.id, experiences.providerId))
    // A tour is a client's when its provider's venue is a client.
    .leftJoin(places, eq(places.id, providers.placeId))
    .where(eq(experiences.slug, slug));
  return row ?? null;
}

export async function listProviders() {
  const total = sql<number>`(select count(*) from "experiences" x where x.provider_id = "providers"."id")::int`;
  const included = sql<number>`(select count(*) from "experiences" x where x.provider_id = "providers"."id" and x.inclusion = 'included')::int`;
  return db.select({ provider: providers, total, included }).from(providers).orderBy(sql`${providers.code} asc nulls last`, asc(providers.name));
}

export async function includedExperiences(opts: { draft?: boolean } = {}) {
  return db
    .select({ experience: experiences, provider: providers, client: places.client })
    .from(experiences)
    .leftJoin(providers, eq(providers.id, experiences.providerId))
    // A tour is a client's when its provider's venue is a client.
    .leftJoin(places, eq(places.id, providers.placeId))
    .where(and(opts.draft ? ne(experiences.inclusion, 'excluded') : eq(experiences.inclusion, 'included'), eq(experiences.review, 'approved')));
}
