/**
 * Events from sources beyond Visit Jersey, after it has run:
 *
 *   pnpm import:events                     every source
 *   pnpm import:events --only eventbrite   one of: eventbrite, ticketsolve-artscentre, ticketsolve-operahouse, jersey-charities,
 *                                          jersey-bulls, jersey-rfc, island-ticket-hut, gigzhub, stock (pictures only),
 *                                          print-lines (the guide's snippets for events and tours only), venue-lines (venues' one-liners only),
 *                                          pictures (text check only), nightlife (evening events at pubs and bars only)
 *   pnpm import:events --only ticketsolve-artscentre --fixture tests/fixtures/ticketsolve-shows.xml
 *
 * Each source's records are kept whole in source_records, like Visit
 * Jersey's. An event we already have from another source, the same title
 * on the same day (lib/domain/event-match.ts), is linked rather than
 * repeated, and the second source only fills what the first left empty.
 *
 * The Arts Centre and the Opera House are curated, so their shows go
 * straight on the site. Anyone can post on Eventbrite, and the charities'
 * diary carries the odd restaurant offer, so theirs wait in /admin/review
 * until staff approve them.
 *
 * Jersey Bulls' and Jersey RFC's home matches come from the clubs' own
 * fixture pages, each with a line of its own about the two sides.
 *
 * Anything still without a picture afterwards gets a royalty-free stock
 * one, credited (lib/integrations/stock).
 *
 * Every event's copy is put in the guide's third person by Claude when its
 * words change, with ANTHROPIC_API_KEY set; without it, as the organiser wrote it.
 */
import '@/lib/load-env';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { and, eq, gte, inArray, ne, notInArray, sql } from 'drizzle-orm';
import { client, db } from '@/lib/db';
import { events, places, sourceRecords, type Event, type Place, type Review } from '@/lib/db/schema';
import { eveningAtBar, withCategories } from '@/lib/domain/categorise';
import { findSameEvent } from '@/lib/domain/event-match';
import { mergeFromSource } from '@/lib/domain/merge';
import { normaliseName } from '@/lib/domain/same-place';
import { uniqueSlug } from '@/lib/domain/slug';
import { matchVenue } from '@/lib/domain/venue-match';
import { fixtureCopy } from '@/lib/integrations/claude/fixture';
import { rewriteListing, type Rewrite } from '@/lib/integrations/claude/rewrite';
import { BULLS_FIXTURES, JRFC_FIXTURES, isHome, parseBulls, parseJrfc, plainCopy, toEvent as fromFixture, type Fixture } from '@/lib/integrations/fixtures/parse';
import { apiEventUrl, fromApi, type ApiEvent, ldEvents, eventbriteId, isJerseyInPerson, toEvent as fromEventbrite, type LdEvent } from '@/lib/integrations/eventbrite/parse';
import type { VjEvent } from '@/lib/integrations/jersey-com/parse';
import { FEEDS, parseShows } from '@/lib/integrations/ticketsolve/parse';
import { fillStockImages } from '@/lib/integrations/stock/fill';
import { fillPrintLines, fillTourLines } from '@/lib/integrations/claude/fill-print-lines';
import { fillVenueLines } from '@/lib/integrations/claude/fill-venue-lines';
import { checkEventPictures } from '@/lib/integrations/claude/image-text';
import { fillProviderCodes } from '@/lib/db/provider-codes';
import { matchGooglePlaces } from '@/lib/integrations/google/match';
import { SITES as TRIBE_SITES, eventsUrl, toEvent as fromTribe, type TribeEvent, type TribeSite } from '@/lib/integrations/tribe-events/parse';
import { joinRuns } from '@/lib/domain/join-runs';
import { WHATS_ON as GIGZHUB_WHATS_ON, parseGigs, toEvent as fromGig } from '@/lib/integrations/gigzhub/parse';
import { BASE as CHARITIES, nextPages, parseDiary, parseEntryPage, toEvent as fromCharities, type DiaryEntry } from '@/lib/integrations/jersey-charities/parse';

const { values } = parseArgs({ options: { only: { type: 'string' }, fixture: { type: 'string' } } });

const UA = 'VisitorGuideJersey/1.0 (+https://visitor.je; events listing for the Jersey visitor guide)';
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url: string): Promise<string> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,application/xml,application/json' }, signal: AbortSignal.timeout(30_000) });
      // Asked to slow down: wait a good while, not a moment.
      if (res.status === 429 && attempt < 3) {
        await pause(60_000 * attempt);
        continue;
      }
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.text();
    } catch (e) {
      if (attempt >= 3) throw e;
      await pause(2000 * attempt);
    }
  }
}

type Item = { v: VjEvent; raw: unknown };

/** What a page calls itself, for a log line when it is not what we expected. */
const pageTitle = (html: string) => (/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] ?? 'no title').trim().slice(0, 80);

async function loadTicketsolve(feed: (typeof FEEDS)[number]): Promise<Item[]> {
  const xml = values.fixture ? readFileSync(values.fixture, 'utf8') : await fetchText(`https://${feed.host}/shows.xml`);
  return parseShows(xml, feed).map((v) => ({ v, raw: { feed: feed.host, show: v.externalId, title: v.title, dates: v.dates } }));
}

const PAGE_FRESH_DAYS = 7;

/** One event from Eventbrite's API, in the shape its page gives. */
async function apiEvent(id: string, token: string): Promise<LdEvent | null> {
  const res = await fetch(apiEventUrl(id), { headers: { authorization: `Bearer ${token}`, 'user-agent': UA }, signal: AbortSignal.timeout(30_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${res.status} ${res.statusText}`);
  return fromApi((await res.json()) as ApiEvent);
}

/**
 * Every Jersey listing page, then each event's own page for its times and
 * price. An event's page is fetched when it is new to us or our copy is
 * over a week old, so a day's run asks for a few dozen pages rather than
 * all of them; Eventbrite turns away a few hundred in a row.
 */
async function loadEventbrite(): Promise<Item[]> {
  const kept = new Map<string, { page: LdEvent | null; fetchedAt: Date }>();
  for (const r of await db
    .select({ id: sourceRecords.externalId, payload: sourceRecords.payload, fetchedAt: sourceRecords.fetchedAt })
    .from(sourceRecords)
    .where(eq(sourceRecords.source, 'eventbrite'))) {
    const payload = r.payload as { page?: LdEvent | null; pageFetchedAt?: string | null };
    // Records from before pageFetchedAt was kept: the record's own time is when the page was read.
    if (payload?.page) kept.set(r.id, { page: payload.page, fetchedAt: payload.pageFetchedAt ? new Date(payload.pageFetchedAt) : r.fetchedAt });
    // Asked for, and the page had no event in it: remembered too, or it is asked for again every run.
    else if (payload?.pageFetchedAt) kept.set(r.id, { page: null, fetchedAt: new Date(payload.pageFetchedAt) });
  }
  const freshAfter = Date.now() - PAGE_FRESH_DAYS * 86_400_000;
  // A page that came back without its event is tried again after a day, not a week.
  const emptyFreshAfter = Date.now() - 86_400_000;

  const listed = new Map<string, LdEvent>();
  for (let page = 1; page <= 30; page += 1) {
    const html = await fetchText(`https://www.eventbrite.co.uk/d/jersey/all-events/?page=${page}`);
    const found = ldEvents(html);
    // Page one with nothing on it is Eventbrite turning us away (or a new page design), not an island
    // with no events: fail the source, so its events are not all marked gone.
    if (!found.length && page === 1) throw new Error(`no events on the listing page ("${pageTitle(html)}", ${html.length} bytes): turned away, or the page has changed`);
    if (!found.length) break;
    for (const e of found) {
      const id = eventbriteId(e.url);
      if (id && isJerseyInPerson(e)) listed.set(id, e);
    }
    process.stdout.write(`\reventbrite listing page ${page}: ${listed.size} events   `);
    await pause(1000);
  }
  const out: Item[] = [];
  let fetched = 0;
  let failedInARow = 0;
  // With a token, each event's details come from the API: the event pages, the most of our requests, are left alone.
  const token = process.env.EVENTBRITE_TOKEN?.trim() || null;
  for (const [id, listing] of listed) {
    const old = kept.get(id);
    let page = old?.page ?? null;
    let pageFetchedAt = old?.fetchedAt.toISOString() ?? null;
    const stale = !old || old.fetchedAt.getTime() < (old.page ? freshAfter : emptyFreshAfter);
    // Several pages in a row refused: Eventbrite is turning us away. The rest wait for the next run.
    if (stale && failedInARow < 5) {
      try {
        const got = token ? await apiEvent(id, token) : (ldEvents(await fetchText(listing.url!))[0] ?? null);
        failedInARow = 0;
        // A page without its event keeps the copy we had.
        page = got ?? page;
        pageFetchedAt = new Date().toISOString();
      } catch (e) {
        failedInARow += 1;
        console.warn(`\n${listing.url}: ${(e as Error).message}; using ${old ? 'our last copy' : 'the listing alone'}`);
        if (failedInARow === 5) console.warn('\neventbrite: five event pages refused in a row; the rest wait for the next run');
      }
      fetched += 1;
      process.stdout.write(`\reventbrite event pages fetched: ${fetched}   `);
      await pause(token ? 300 : 2000);
    }
    const v = fromEventbrite(listing, page);
    if (v) out.push({ v, raw: { listing, page, pageFetchedAt } });
  }
  return out;
}

/**
 * The Jersey Charities diary, its pages in turn, then each entry's own page
 * for its description. A diary that reads as empty means the site has
 * changed under us, and fails the source rather than marking every event gone.
 */
async function loadCharities(): Promise<Item[]> {
  const entries = new Map<string, DiaryEntry>();
  const queue = ['/diary'];
  const seen = new Set<string>();
  while (queue.length && seen.size < 10) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);
    const html = await fetchText(`${CHARITIES}${path}`);
    for (const e of parseDiary(html)) entries.set(e.id, e);
    queue.push(...nextPages(html).filter((p) => !seen.has(p)));
    await pause(1000);
  }
  if (!entries.size) throw new Error('the diary page had no entries: has jerseycharities.org changed?');
  const out: Item[] = [];
  for (const entry of entries.values()) {
    let page: ReturnType<typeof parseEntryPage> | null = null;
    try {
      page = parseEntryPage(await fetchText(`${CHARITIES}${entry.path}`));
    } catch (e) {
      console.warn(`\n${entry.path}: ${(e as Error).message}; using the diary entry alone`);
    }
    const v = fromCharities(entry, page);
    if (v) out.push({ v, raw: { entry, page } });
    await pause(1500);
  }
  return out;
}

/**
 * A site on The Events Calendar: its programme from the WordPress API, a
 * page of fifty at a time from today. Guernsey's nights are left out by
 * the parser; an empty programme fails the source rather than marking
 * every event gone.
 */
async function loadTribe(site: TribeSite): Promise<Item[]> {
  const today = new Date().toISOString().slice(0, 10);
  const all: TribeEvent[] = [];
  if (values.fixture) all.push(...(JSON.parse(readFileSync(values.fixture, 'utf8')) as { events: TribeEvent[] }).events);
  else {
    for (let page = 1; page <= 20; page += 1) {
      const text = await fetchText(eventsUrl(site, page, today));
      // A security page in place of the data: say whose, so the log points at the cause.
      if (!text.trimStart().startsWith('{')) throw new Error(`${site.base} sent a web page, not its events (${/<title>([^<]*)/i.exec(text)?.[1]?.trim() || 'no title'}): its host may be challenging our server`);
      const body = JSON.parse(text) as { events?: TribeEvent[]; total_pages?: number };
      all.push(...(body.events ?? []));
      if (!body.total_pages || page >= body.total_pages) break;
      await pause(1000);
    }
  }
  if (!all.length) throw new Error(`no events from ${site.base}: has the site changed?`);
  const raw = new Map(all.map((e) => [String(e.id), e]));
  const parsed = all.map((e) => fromTribe(e, site)).filter((v) => v !== null);
  return parsed.map((v) => ({ v, raw: raw.get(v.externalId) }));
}

/**
 * A club's home matches, Jersey named first. Each match's copy is Claude's,
 * written once and kept with the record until the match itself changes
 * (opponent, competition, ground); a new kick-off time needs no new words.
 * A page with no matches at all means the site has changed under us.
 */
async function loadFixtures(source: string, url: string, parse: (html: string) => Fixture[]): Promise<Item[]> {
  const all = parse(values.fixture ? readFileSync(values.fixture, 'utf8') : await fetchText(url));
  if (!all.length) throw new Error(`no fixtures on ${url}: has the page changed?`);
  const kept = new Map<string, KeptRewrite>();
  for (const r of await db
    .select({ id: sourceRecords.externalId, payload: sourceRecords.payload })
    .from(sourceRecords)
    .where(and(eq(sourceRecords.source, source), eq(sourceRecords.externalType, 'events')))) {
    const rw = (r.payload as { rewrite?: KeptRewrite } | null)?.rewrite;
    if (rw) kept.set(r.id, rw);
  }
  const home = all.filter(isHome);
  const out: Item[] = [];
  for (let n = 0; n < home.length; n += 4) {
    out.push(
      ...(await Promise.all(
        home.slice(n, n + 4).map(async (f) => {
          const key = createHash('sha1').update([f.home, f.away, f.competition ?? '', f.venue ?? ''].join('\u0000')).digest('hex');
          const old = kept.get(f.id);
          let rewrite = old?.key === key ? old : null;
          if (!rewrite) {
            const made = await fixtureCopy(f);
            if (made) {
              rewrite = { ...made, key };
              counts.rewritten += 1;
            }
          }
          const copy = rewrite ? { snippet: rewrite.snippet, description: rewrite.description } : plainCopy(f);
          return { v: fromFixture(f, copy), raw: { fixture: f, ...(rewrite ? { rewrite } : {}) } };
        }),
      )),
    );
  }
  return out;
}

/**
 * Gigz Hub's coming gigs, from its What's On page. Bands and venues post
 * them and Gigz Hub approves them, so they go on the site as they come.
 * A page with no gigs at all means the site has changed under us.
 */
async function loadGigzhub(): Promise<Item[]> {
  const gigs = parseGigs(values.fixture ? readFileSync(values.fixture, 'utf8') : await fetchText(GIGZHUB_WHATS_ON));
  if (!gigs.length) throw new Error(`no gigs on ${GIGZHUB_WHATS_ON}: has the page changed?`);
  return gigs.flatMap((g) => {
    const v = fromGig(g);
    // The poster's link expires within the week: the record keeps the gig, not the link.
    const { id, venue, bandName, date, startTime, genre, price, ticketUrl, blurb, address } = g;
    return v ? [{ v, raw: { gig: { id, venue, bandName, date, startTime, genre, price, ticketUrl, blurb, address } } }] : [];
  });
}

const counts = { created: 0, linked: 0, updated: 0, unchanged: 0, rewritten: 0, joined: 0 };

/** Which words a rewrite was made from: a new one only when these change. */
const wordsKey = (v: VjEvent) => createHash('sha1').update([v.title, v.summary ?? '', v.description ?? ''].join('\u0000')).digest('hex');
type KeptRewrite = Rewrite & { key: string };

/**
 * Organisers write "join us", "we", "our": each event's copy in the guide's
 * third person, and its card sentence, as providers' own listings get.
 * Kept with the source record, so a day's run asks Claude only about the
 * events whose words changed. A few at a time; one that fails keeps the
 * organiser's words and is tried again tomorrow.
 */
async function guideVoice(source: string, items: Item[]): Promise<Map<string, KeptRewrite>> {
  const kept = new Map<string, KeptRewrite>();
  for (const r of await db
    .select({ id: sourceRecords.externalId, payload: sourceRecords.payload })
    .from(sourceRecords)
    .where(and(eq(sourceRecords.source, source), eq(sourceRecords.externalType, 'events')))) {
    const rw = (r.payload as { rewrite?: KeptRewrite } | null)?.rewrite;
    if (rw) kept.set(r.id, rw);
  }
  const out = new Map<string, KeptRewrite>();
  const todo: Item[] = [];
  for (const i of items) {
    const old = kept.get(i.v.externalId);
    if (old?.key === wordsKey(i.v)) out.set(i.v.externalId, old);
    else if (i.v.summary || i.v.description) todo.push(i);
  }
  for (let n = 0; n < todo.length; n += 4) {
    await Promise.all(
      todo.slice(n, n + 4).map(async ({ v }) => {
        const r = await rewriteListing({ kind: 'event', name: v.title, summary: v.summary, description: v.description });
        if (r) out.set(v.externalId, { ...r, key: wordsKey(v) });
      }),
    );
    process.stdout.write(`\r${source}: rewording ${Math.min(n + 4, todo.length)} of ${todo.length}   `);
  }
  counts.rewritten += todo.filter((i) => out.has(i.v.externalId)).length;
  return out;
}

/** The source's own fields for the events table. */
function eventFields(v: VjEvent, venue: Place | null) {
  const { externalId: _id, modifiedAt: _m, portalSyncedAt: _p, ...fields } = v;
  return { ...fields, placeId: venue?.id ?? null, lat: v.lat ?? venue?.lat ?? null, lon: v.lon ?? venue?.lon ?? null };
}

/**
 * A performance now folded into its show: the event it had on its own
 * comes off the site, with a note saying where it went, unless it is
 * the show's own event (an earlier import may have linked them already).
 */
async function retireJoined(source: string, joined: Map<string, string>, existing: Event[]) {
  if (!joined.size) return;
  const records = await db
    .select({ externalId: sourceRecords.externalId, eventId: sourceRecords.eventId })
    .from(sourceRecords)
    .where(and(eq(sourceRecords.source, source), eq(sourceRecords.externalType, 'events'), inArray(sourceRecords.externalId, [...joined.keys(), ...joined.values()])));
  const eventOf = new Map(records.map((r) => [r.externalId, r.eventId]));
  for (const [part, show] of joined) {
    const partEvent = eventOf.get(part);
    const showEvent = eventOf.get(show);
    if (!partEvent || partEvent === showEvent) continue;
    const kept = existing.find((e) => e.id === showEvent);
    await db
      .update(events)
      .set({ inclusion: 'excluded', inclusionNote: `One night of ${kept ? `"${kept.title}" (/whats-on/${kept.slug})` : 'a longer run'}, now listed with all its dates.`, inclusionSetBy: 'import', inclusionSetAt: new Date(), updatedAt: new Date() })
      .where(and(eq(events.id, partEvent), ne(events.inclusion, 'excluded')));
    await db.update(sourceRecords).set({ present: false }).where(and(eq(sourceRecords.source, source), eq(sourceRecords.externalType, 'events'), eq(sourceRecords.externalId, part)));
    counts.joined += 1;
  }
}

async function importSource(source: string, items: Item[], review: Review, allPlaces: Place[], existing: Event[], voice: boolean) {
  const taken = new Set(existing.map((e) => e.slug));
  // Matches come with copy of their own, already in the guide's voice.
  const rewrites = voice ? await guideVoice(source, items) : new Map<string, KeptRewrite>();
  for (const { v: given, raw: fetched } of items) {
    const rw = rewrites.get(given.externalId);
    // The source's own types, and what the event's own words add; then the copy in the guide's voice.
    const v = {
      ...given,
      eventTypes: withCategories(given.eventTypes, given, source),
      ...(rw ? { summary: rw.snippet, description: rw.description } : {}),
    };
    // The organiser's words stay in the record as they gave them; the rewrite sits beside them.
    const raw = rw ? { ...(fetched as object), rewrite: rw } : fetched;
    const [record] = await db
      .insert(sourceRecords)
      .values({ source, externalType: 'events', externalId: v.externalId, payload: raw })
      .onConflictDoUpdate({
        target: [sourceRecords.source, sourceRecords.externalType, sourceRecords.externalId],
        set: { payload: raw, present: true, fetchedAt: new Date() },
      })
      .returning();
    const stamp = { source, ref: `events/${v.externalId}`, at: new Date().toISOString() };
    // By pin and name where the source has a pin; by name alone for a theatre's own feed.
    const venue =
      matchVenue(v.venue, v, allPlaces) ??
      (v.venueName ? allPlaces.find((p) => normaliseName(p.name) === normaliseName(v.venueName!)) ?? null : null);
    const fields = eventFields(v, venue);

    let current = record!.eventId ? existing.find((e) => e.id === record!.eventId) : undefined;
    if (!current) {
      current = findSameEvent({ title: v.title, dates: v.dates, placeId: venue?.id ?? null }, existing) ?? undefined;
      if (current) {
        await db.update(sourceRecords).set({ eventId: current.id }).where(eq(sourceRecords.id, record!.id));
        counts.linked += 1;
      }
    }

    if (!current) {
      const slug = uniqueSlug(`${v.title} ${v.startsOn?.slice(0, 4) ?? ''}`, (s) => taken.has(s));
      taken.add(slug);
      const { fieldSources } = mergeFromSource({}, fields, { locked: [], fieldSources: {}, stamp });
      const [created] = await db.insert(events).values({ ...fields, slug, fieldSources, review }).returning();
      await db.update(sourceRecords).set({ eventId: created!.id }).where(eq(sourceRecords.id, record!.id));
      existing.push(created!);
      counts.created += 1;
      continue;
    }

    // The source that brought the event writes it; any other fills its gaps.
    const primary = current.fieldSources.title?.source === source;
    const { patch, fieldSources, changed } = mergeFromSource<Record<string, unknown>>(current, fields, {
      locked: current.lockedFields,
      fieldSources: current.fieldSources,
      stamp,
      fillOnly: !primary,
    });
    if (changed.length) {
      const [updated] = await db
        .update(events)
        .set({ ...(patch as Partial<Event>), fieldSources, updatedAt: new Date() })
        .where(eq(events.id, current.id))
        .returning();
      existing.splice(existing.indexOf(current), 1, updated!);
    }
    counts[changed.length ? 'updated' : 'unchanged'] += 1;
  }

  // What the source no longer lists: kept, flagged, as for Visit Jersey.
  if (!values.fixture) {
    const ids = items.map((i) => i.v.externalId);
    const where = and(eq(sourceRecords.source, source), eq(sourceRecords.externalType, 'events'));
    await db.update(sourceRecords).set({ present: false }).where(ids.length ? and(where, notInArray(sourceRecords.externalId, ids)) : where);
  }
}

const SOURCES: { source: string; review: Review; load: () => Promise<Item[]>; voice?: false }[] = [
  // The theatres first: when Eventbrite lists the same show, theirs is the record and Eventbrite fills gaps.
  ...FEEDS.map((feed) => ({ source: feed.source, review: 'approved' as const, load: () => loadTicketsolve(feed) })),
  { source: 'eventbrite', review: 'pending', load: loadEventbrite },
  { source: 'jersey-charities', review: 'pending', load: loadCharities },
  // Live music in the pubs and bars, posted by the bands and venues and approved by Gigz Hub.
  { source: 'gigzhub', review: 'approved', load: loadGigzhub },
  // Ticket sellers for anyone's night, courses and Guernsey's among them: review first.
  ...TRIBE_SITES.map((site) => ({ source: site.source, review: 'pending' as const, load: () => loadTribe(site) })),
  // The clubs' own fixtures: on the site as they come.
  { source: 'jersey-bulls', review: 'approved', load: () => loadFixtures('jersey-bulls', BULLS_FIXTURES, parseBulls), voice: false },
  { source: 'jersey-rfc', review: 'approved', load: () => loadFixtures('jersey-rfc', JRFC_FIXTURES, parseJrfc), voice: false },
];

const allPlaces = await db.select().from(places);
const existing = await db.select().from(events);
let failed = 0;
for (const s of SOURCES.filter((s) => !values.only || s.source === values.only)) {
  // One source down must not stop the others.
  try {
    const before = { ...counts };
    const loaded = await s.load();
    // A show sold night by night, or matinee and evening, is one event with every date.
    const { events: shows, joined } = joinRuns(loaded.map((i) => i.v));
    const rawOf = new Map(loaded.map((i) => [i.v.externalId, i.raw]));
    const items = shows.map((v) => ({ v, raw: rawOf.get(v.externalId) }));
    await importSource(s.source, items, s.review, allPlaces, existing, s.voice !== false);
    await retireJoined(s.source, joined, existing);
    console.log(
      `\r${s.source}: ${items.length} events; created ${counts.created - before.created}, linked to one we had ${counts.linked - before.linked}, ` +
        `updated ${counts.updated - before.updated}, unchanged ${counts.unchanged - before.unchanged}, rewritten ${counts.rewritten - before.rewritten}, nights joined into their show ${counts.joined - before.joined}`,
    );
  } catch (e) {
    failed += 1;
    console.error(`\r${s.source} failed: ${(e as Error).message}`);
  }
}
// Last, a stock picture for whatever is still without one, from any source.
if (!values.only || values.only === 'stock') {
  try {
    const filled = await fillStockImages();
    console.log(`fallback pictures: ${filled.fallbacks} events; stock pictures (${filled.source}): ${filled.events} events, ${filled.tours} tours`);
  } catch (e) {
    failed += 1;
    console.error(`stock pictures failed: ${(e as Error).message}`);
  }
}
// Each venue's place on Google, for the reviews panel on its page: a batch a night until all are found.
if (!values.only || values.only === 'google') {
  try {
    const g = await matchGooglePlaces();
    console.log(`google places: ${g.matched} of ${g.looked} looked for matched`);
  } catch (e) {
    failed += 1;
    console.error(`google places failed: ${(e as Error).message}`);
  }
}
// A key code for every tour provider, so each tour points to the guide's key.
if (!values.only || values.only === 'codes') {
  try {
    console.log(`provider codes: ${await fillProviderCodes()} new`);
  } catch (e) {
    failed += 1;
    console.error(`provider codes failed: ${(e as Error).message}`);
  }
}
// Nightlife by where and when: evening events at the guide's pubs and bars, from every source. Types a person set are left alone.
if (!values.only || values.only === 'nightlife') {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await db
      .select({ id: events.id, dates: events.dates, eventTypes: events.eventTypes, section: places.guideSection })
      .from(events)
      .innerJoin(places, eq(places.id, events.placeId))
      .where(and(gte(events.endsOn, today), eq(places.guideSection, 'Pubs & bars'), sql`not ('eventTypes' = any(${events.lockedFields}))`, sql`not ('Nightlife' = any(${events.eventTypes}))`));
    const night = rows.filter((r) => eveningAtBar(r, r.section));
    for (const r of night) await db.update(events).set({ eventTypes: [...r.eventTypes, 'Nightlife'] }).where(eq(events.id, r.id));
    console.log(`nightlife: ${night.length} evening events at pubs and bars tagged`);
  } catch (e) {
    failed += 1;
    console.error(`nightlife failed: ${(e as Error).message}`);
  }
}
// And the guide's one-line copy for whatever is new or has new words.
if (!values.only || values.only === 'print-lines') {
  try {
    const lines = await fillPrintLines();
    console.log(`print lines: ${lines.written} of ${lines.wanted} written`);
    const tourLines = await fillTourLines();
    console.log(`tour print lines: ${tourLines.written} of ${tourLines.wanted} written`);
  } catch (e) {
    failed += 1;
    console.error(`print lines failed: ${(e as Error).message}`);
  }
}
// And each venue's one line for its box in the guide, for whatever is new or has new words.
if (!values.only || values.only === 'venue-lines') {
  try {
    const lines = await fillVenueLines();
    console.log(`venue lines: ${lines.written} of ${lines.wanted} written`);
  } catch (e) {
    failed += 1;
    console.error(`venue lines failed: ${(e as Error).message}`);
  }
}
// And which pictures are posters and flyers, which the guide does not print.
if (!values.only || values.only === 'pictures') {
  try {
    const p = await checkEventPictures();
    console.log(`pictures checked for text: ${p.checked}, ${p.withText} kept out of print`);
  } catch (e) {
    failed += 1;
    console.error(`picture check failed: ${(e as Error).message}`);
  }
}
await client.end();
if (failed) process.exitCode = 1;
