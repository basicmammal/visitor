/**
 * Visit Jersey → source_records → places / events.
 *
 *   pnpm import:visit-jersey                     every type, live
 *   pnpm import:visit-jersey --types events      one or more types
 *   pnpm import:visit-jersey --fixture <file>    from a saved JSON file
 *
 * Safe to run again: records are keyed on (source, type, id), places
 * keep their slug, inclusion and our copy, and locked fields are never
 * written. A record the source stops returning is marked not present,
 * never deleted, so last edition's entry is still there to look at.
 */
import '@/lib/load-env';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { and, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import { client, db } from '@/lib/db';
import { events, experiences, listingDrops, places, providers, sourceRecords, type Event, type Experience, type Place, type Provider } from '@/lib/db/schema';
import { normaliseName } from '@/lib/domain/same-place';
import { decodeEntities } from '@/lib/integrations/jersey-com/parse';
import { categorise } from '@/lib/domain/categorise';
import { findSameEvent } from '@/lib/domain/event-match';
import { mergeFromSource } from '@/lib/domain/merge';
import { inGuideVoice, type KeptRewrite } from '@/lib/integrations/claude/voice';
import { isSamePlace } from '@/lib/domain/same-place';
import { matchVenue } from '@/lib/domain/venue-match';
import { uniqueSlug } from '@/lib/domain/slug';
import { PLACE_TYPES, fetchRawListings, type ListingType, type PlaceType, type RawItem } from '@/lib/integrations/jersey-com/directory';
import { isListingType, toEvent, toExperience, toPlace, type VjEvent, type VjExperience, type VjPlace } from '@/lib/integrations/jersey-com/parse';

const SOURCE = 'visit_jersey';

const { values } = parseArgs({
  options: { fixture: { type: 'string' }, types: { type: 'string' } },
});

const types: ListingType[] = values.types
  ? values.types.split(',').map((t) => t.trim()).filter(isListingType)
  : [...PLACE_TYPES, 'tours-and-activities', 'events'];

const fixture = values.fixture
  ? (JSON.parse(readFileSync(values.fixture, 'utf8')) as Record<string, RawItem[]>)
  : null;

async function load(type: ListingType): Promise<RawItem[]> {
  if (fixture) return fixture[type] ?? [];
  return fetchRawListings(type, (p, of) => process.stdout.write(`\r${type} ${p}/${of}   `));
}

const latest = (a: Date | null, b: Date | null) => (a && b ? (a > b ? a : b) : a ?? b);

/** Everything the source owns on a place. Slug, inclusion and our copy are not here. */
function placeFields(v: VjPlace) {
  const { externalId: _id, type: _t, category: _c, modifiedAt: _m, portalSyncedAt: _p, ...fields } = v;
  return fields;
}

/** The venue link is a source-derived field like any other, so a person's correction is locked and kept. */
function eventFields(v: VjEvent, venue: Place | null) {
  const { externalId: _id, modifiedAt: _m, portalSyncedAt: _p, ...fields } = v;
  return { ...fields, placeId: venue?.id ?? null };
}

async function upsertRecord(type: ListingType, raw: RawItem & { _rewrite?: KeptRewrite }, modifiedAt: Date | null, portalSyncedAt: Date | null) {
  const [row] = await db
    .insert(sourceRecords)
    .values({ source: SOURCE, externalType: type, externalId: String(raw.id), payload: raw, modifiedAt, portalSyncedAt })
    .onConflictDoUpdate({
      target: [sourceRecords.source, sourceRecords.externalType, sourceRecords.externalId],
      set: { payload: raw, modifiedAt, portalSyncedAt, present: true, fetchedAt: new Date() },
    })
    .returning();
  return row!;
}

/**
 * Events' and tours' copy in the guide's third person, as every other
 * source's is: Visit Jersey's listings are written by the businesses,
 * "join us" and all. The rewrite rides in the record beside their words
 * (payload._rewrite), so a run asks Claude only about what changed.
 */
async function keptRewrites(type: ListingType): Promise<Map<string, KeptRewrite>> {
  const rows = await db
    .select({ id: sourceRecords.externalId, payload: sourceRecords.payload })
    .from(sourceRecords)
    .where(and(eq(sourceRecords.source, SOURCE), eq(sourceRecords.externalType, type)));
  const kept = new Map<string, KeptRewrite>();
  for (const r of rows) {
    const rw = (r.payload as { _rewrite?: KeptRewrite } | null)?._rewrite;
    if (rw) kept.set(r.id, rw);
  }
  return kept;
}

const counts = { created: 0, updated: 0, unchanged: 0, linked: 0, unpinned: 0, rewritten: 0 };

async function importPlaces(type: PlaceType, raws: RawItem[], all: Place[]) {
  const taken = new Set(all.map((p) => p.slug));
  for (const raw of raws) {
    const v = toPlace(raw, type);
    if (!v.name) continue;
    if (v.lat === null) counts.unpinned += 1;
    const record = await upsertRecord(type, raw, v.modifiedAt, v.portalSyncedAt);
    const stamp = { source: SOURCE, ref: `${type}/${v.externalId}`, at: new Date().toISOString() };

    let place = record.placeId ? all.find((p) => p.id === record.placeId) : undefined;
    // Second listing for one front door: a hotel's restaurant.
    if (!place) {
      place = all.find((p) => isSamePlace(p, v));
      if (place) counts.linked += 1;
    }

    if (!place) {
      const slug = uniqueSlug(v.name, (s) => taken.has(s), v.parish);
      taken.add(slug);
      const { fieldSources } = mergeFromSource({}, placeFields(v), { locked: [], fieldSources: {}, stamp });
      const [created] = await db
        .insert(places)
        .values({ ...placeFields(v), slug, category: v.category, fieldSources, sourceModifiedAt: v.modifiedAt })
        .returning();
      all.push(created!);
      await db.update(sourceRecords).set({ placeId: created!.id }).where(eq(sourceRecords.id, record.id));
      counts.created += 1;
      continue;
    }

    const { patch, fieldSources, changed } = mergeFromSource<Record<string, unknown>>(place, placeFields(v), {
      locked: place.lockedFields,
      fieldSources: place.fieldSources,
      stamp,
    });
    const sourceModifiedAt = latest(place.sourceModifiedAt, v.modifiedAt);
    const [updated] = await db
      .update(places)
      .set({ ...(patch as Partial<Place>), fieldSources, sourceModifiedAt, ...(changed.length ? { updatedAt: new Date() } : {}) })
      .where(eq(places.id, place.id))
      .returning();
    all.splice(all.indexOf(place), 1, updated!);
    if (record.placeId !== place.id) {
      await db.update(sourceRecords).set({ placeId: place.id }).where(eq(sourceRecords.id, record.id));
    }
    counts[changed.length ? 'updated' : 'unchanged'] += 1;
  }
}

async function importEvents(raws: RawItem[], allPlaces: Place[]) {
  const existing: Event[] = await db.select().from(events);
  const taken = new Set(existing.map((e) => e.slug));
  const listed = raws.map((raw) => ({ raw, parsed: toEvent(raw) })).filter((x) => x.parsed.title);
  const { rewrites, fresh } = await inGuideVoice(
    listed.map(({ parsed: p }) => ({ id: p.externalId, kind: 'event' as const, name: p.title, summary: p.summary, description: p.description })),
    await keptRewrites('events'),
    'events',
  );
  counts.rewritten += fresh;
  for (const { raw, parsed: given } of listed) {
    const rw = rewrites.get(given.externalId);
    // Types from their words as they wrote them; then the copy in the guide's voice.
    const typed = given.eventTypes.length ? given : { ...given, eventTypes: categorise(given) };
    const v = rw ? { ...typed, summary: rw.snippet, description: rw.description } : typed;
    const record = await upsertRecord('events', rw ? { ...raw, _rewrite: rw } : raw, v.modifiedAt, v.portalSyncedAt);
    const stamp = { source: SOURCE, ref: `events/${v.externalId}`, at: new Date().toISOString() };
    const venue = matchVenue(v.venue, v, allPlaces);
    let current = record.eventId ? existing.find((e) => e.id === record.eventId) : undefined;
    // Listed first by another source (scripts/import-events.ts): link it, and since
    // Visit Jersey lists it too, it no longer waits for review.
    if (!current) {
      current = findSameEvent({ title: v.title, dates: v.dates, placeId: venue?.id ?? null }, existing) ?? undefined;
      if (current) {
        await db.update(sourceRecords).set({ eventId: current.id }).where(eq(sourceRecords.id, record.id));
        if (current.review === 'pending') await db.update(events).set({ review: 'approved' }).where(eq(events.id, current.id));
        counts.linked += 1;
      }
    }

    if (!current) {
      const slug = uniqueSlug(`${v.title} ${v.startsOn?.slice(0, 4) ?? ''}`, (s) => taken.has(s));
      taken.add(slug);
      const { fieldSources } = mergeFromSource({}, eventFields(v, venue), { locked: [], fieldSources: {}, stamp });
      const [created] = await db
        .insert(events)
        .values({ ...eventFields(v, venue), slug, fieldSources, sourceModifiedAt: v.modifiedAt })
        .returning();
      await db.update(sourceRecords).set({ eventId: created!.id }).where(eq(sourceRecords.id, record.id));
      counts.created += 1;
      continue;
    }
    const { patch, fieldSources, changed } = mergeFromSource<Record<string, unknown>>(current, eventFields(v, venue), {
      locked: current.lockedFields,
      fieldSources: current.fieldSources,
      stamp,
    });
    await db
      .update(events)
      .set({
        ...(patch as Partial<Event>),
        fieldSources,
        sourceModifiedAt: latest(current.sourceModifiedAt, v.modifiedAt),
        ...(changed.length ? { updatedAt: new Date() } : {}),
      })
      .where(eq(events.id, current.id));
    counts[changed.length ? 'updated' : 'unchanged'] += 1;
  }
}

function experienceFields(v: VjExperience, providerId: string | null) {
  const { externalId: _id, provider: _p, providerListingId: _l, modifiedAt: _m, portalSyncedAt: _s, ...fields } = v;
  return { ...fields, providerId };
}

/**
 * The provider a tour names, found by its name or one it was merged from, or created. Contact details
 * come from their own listing when the tour links one, else the tour.
 * The code is never set here: codes are ours.
 */
async function providerFor(v: VjExperience, known: Provider[], allPlaces: Place[]): Promise<Provider | null> {
  if (!v.provider) return null;
  const key = normaliseName(v.provider);
  // A merge comes first: staff chose that provider for this name, even while the old record is still there.
  const existing = known.find((p) => p.aliases.some((a) => normaliseName(a) === key)) ?? known.find((p) => normaliseName(p.name) === key);
  if (existing) return existing;
  let place: Place | undefined;
  if (v.providerListingId) {
    const [rec] = await db.select({ placeId: sourceRecords.placeId }).from(sourceRecords)
      .where(and(eq(sourceRecords.source, SOURCE), eq(sourceRecords.externalId, v.providerListingId)));
    place = allPlaces.find((p) => p.id === rec?.placeId);
  }
  place ??= allPlaces.find((p) => normaliseName(p.name) === key);
  const [created] = await db
    .insert(providers)
    .values({
      name: v.provider,
      phone: place?.phone ?? v.phone,
      email: place?.email ?? v.email,
      website: place?.website ?? v.website,
      placeId: place?.id ?? null,
    })
    .onConflictDoNothing()
    .returning();
  if (created) known.push(created);
  return created ?? null;
}

async function importExperiences(raws: RawItem[], allPlaces: Place[]) {
  const existing: Experience[] = await db.select().from(experiences);
  const known: Provider[] = await db.select().from(providers);
  const taken = new Set(existing.map((e) => e.slug));
  const listed = raws.map((raw) => ({ raw, given: toExperience(raw) })).filter((x) => x.given.title);
  const { rewrites, fresh } = await inGuideVoice(
    listed.map(({ given: g }) => ({ id: g.externalId, kind: 'experience' as const, name: g.title, summary: g.summary, description: g.description })),
    await keptRewrites('tours-and-activities'),
    'tours',
  );
  counts.rewritten += fresh;
  for (const { raw, given } of listed) {
    const rw = rewrites.get(given.externalId);
    const v = rw ? { ...given, summary: rw.snippet, description: rw.description } : given;
    const record = await upsertRecord('tours-and-activities', rw ? { ...raw, _rewrite: rw } : raw, v.modifiedAt, v.portalSyncedAt);
    const stamp = { source: SOURCE, ref: `tours-and-activities/${v.externalId}`, at: new Date().toISOString() };
    const provider = await providerFor(v, known, allPlaces);
    const current = record.experienceId ? existing.find((e) => e.id === record.experienceId) : undefined;
    const fields = experienceFields(v, provider?.id ?? null);

    if (!current) {
      const slug = uniqueSlug(`${v.title} ${v.provider ?? ''}`.trim(), (s) => taken.has(s));
      taken.add(slug);
      const { fieldSources } = mergeFromSource({}, fields, { locked: [], fieldSources: {}, stamp });
      const [created] = await db.insert(experiences).values({ ...fields, slug, fieldSources, sourceModifiedAt: v.modifiedAt }).returning();
      await db.update(sourceRecords).set({ experienceId: created!.id }).where(eq(sourceRecords.id, record.id));
      counts.created += 1;
      continue;
    }
    const { patch, fieldSources, changed } = mergeFromSource<Record<string, unknown>>(current, fields, {
      locked: current.lockedFields,
      fieldSources: current.fieldSources,
      stamp,
    });
    await db
      .update(experiences)
      .set({
        ...(patch as Partial<Experience>),
        fieldSources,
        sourceModifiedAt: latest(current.sourceModifiedAt, v.modifiedAt),
        ...(changed.length ? { updatedAt: new Date() } : {}),
      })
      .where(eq(experiences.id, current.id));
    counts[changed.length ? 'updated' : 'unchanged'] += 1;
  }
}

/**
 * Records this run did not see are gone from the source: kept, flagged,
 * and logged once in listing_drops, the day they went. One that is back
 * closes its open drop.
 */
async function markMissing(type: ListingType, seen: RawItem[]) {
  const ids = seen.map((r) => String(r.id));
  const where = and(eq(sourceRecords.source, SOURCE), eq(sourceRecords.externalType, type));
  const gone = await db
    .update(sourceRecords)
    .set({ present: false })
    .where(and(ids.length ? and(where, notInArray(sourceRecords.externalId, ids)) : where, eq(sourceRecords.present, true)))
    .returning();
  if (gone.length) {
    await db.insert(listingDrops).values(
      gone.map((r) => {
        const p = r.payload as { title?: { rendered?: string } | string; name?: string; link?: string };
        const title = typeof p.title === 'string' ? p.title : p.title?.rendered ?? p.name ?? r.externalId;
        return {
          source: SOURCE, externalType: type, externalId: r.externalId, name: decodeEntities(title), link: p.link ?? null,
          placeId: r.placeId, experienceId: r.experienceId, eventId: r.eventId, lastSeenAt: r.fetchedAt,
        };
      }),
    );
  }
  if (ids.length) {
    await db
      .update(listingDrops)
      .set({ returnedAt: new Date() })
      .where(and(eq(listingDrops.source, SOURCE), eq(listingDrops.externalType, type), inArray(listingDrops.externalId, ids), isNull(listingDrops.returnedAt)));
  }
  // Still gone, all of them: what the run's summary counts.
  const [still] = await db.select({ n: sql<number>`count(*)` }).from(sourceRecords).where(and(where, eq(sourceRecords.present, false)));
  return Number(still?.n ?? 0);
}

const allPlaces: Place[] = await db.select().from(places);
let missing = 0;
// Places first, so events can find their venue and tours their provider.
const ORDER = (t: ListingType) => (t === 'events' ? 2 : t === 'tours-and-activities' ? 1 : 0);
for (const type of [...types].sort((a, b) => ORDER(a) - ORDER(b))) {
  const raws = await load(type);
  if (type === 'events') await importEvents(raws, allPlaces);
  else if (type === 'tours-and-activities') await importExperiences(raws, allPlaces);
  else await importPlaces(type, raws, allPlaces);
  // A fixture is a sample, not the whole directory; only a live run knows what is gone.
  if (!fixture) missing += await markMissing(type, raws);
  console.log(`\r${type}: ${raws.length} listings`);
}

// When each place was first listed: the earliest Visit Jersey published any record of it. A
// place we added before Visit Jersey listed it keeps our earlier day.
await db.execute(sql`
  update places p set first_listed_at = least(coalesce(p.first_listed_at, s.first), s.first)
  from (
    select place_id, min((payload->>'date_gmt')::timestamp at time zone 'UTC') as first
    from source_records
    where source = 'visit_jersey' and place_id is not null and payload->>'date_gmt' is not null
    group by place_id
  ) s
  where p.id = s.place_id and p.first_listed_at is distinct from least(coalesce(p.first_listed_at, s.first), s.first)`);

console.log(
  `created ${counts.created}, updated ${counts.updated}, unchanged ${counts.unchanged}, ` +
    `linked to an existing place ${counts.linked}, no usable pin ${counts.unpinned}, no longer listed ${missing}, ` +
    `reworded ${counts.rewritten}`,
);
await client.end();
