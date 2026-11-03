import { and, asc, eq, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { guideSelection, includedExperiences } from '@/lib/db/queries';
import { doActivities, places, type Provider } from '@/lib/db/schema';
import { doSection, type DoSection } from '@/lib/domain/do-section';
import { openingText, reopensIn, windowMonths } from '@/lib/domain/opening';
import { usableLine } from '@/lib/domain/venue-line';
import { webImage } from '@/lib/domain/images';
import { GENRES } from '@/lib/domain/genre';
import {
  defaultWindow,
  guideEvent,
  guideTour,
  guideVenue,
  gridTours,
  layoutEvents,
  printable,
  budgetFor,
  venueSections,
  VENUE_SECTION_ORDER,
  type GuideEvent,
  type Layout,
  type GuideLayouts,
  type GuideTour,
  type GuideVenue,
  type VenueSection,
  type Window,
} from '@/lib/domain/guide-entry';
import { printContact, printParish, printWebsite } from '@/lib/domain/house-style';
import { fillCodes } from '@/lib/domain/provider-code';
import { nonCore, withCategories } from '@/lib/domain/categorise';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The guide's four editions a year. Winter runs into the next year, so
 * Winter 2026 is November 2026 to February 2027.
 */
export function editions(year: number): { name: string; window: Window }[] {
  return [
    { name: `Spring ${year}`, window: { from: `${year}-03-01`, to: `${year}-05-31` } },
    { name: `Summer ${year}`, window: { from: `${year}-06-01`, to: `${year}-08-31` } },
    { name: `Autumn ${year}`, window: { from: `${year}-09-01`, to: `${year}-10-31` } },
    { name: `Winter ${year}`, window: { from: `${year}-11-01`, to: `${year + 1}-02-${(year + 1) % 4 === 0 ? 29 : 28}` } },
  ];
}

/** ?draft=1: lay out everything eligible, not only what has been included. */
export const isDraft = (v: string | null | undefined) => v === '1';

/** The edition's dates from ?from=&to=, or the coming three months. */
export function windowFrom(params: { from?: string; to?: string }): Window {
  const fallback = defaultWindow();
  const from = params.from && ISO.test(params.from) ? params.from : fallback.from;
  const to = params.to && ISO.test(params.to) && params.to >= from ? params.to : fallback.to;
  return { from, to };
}

export type GuideProvider = { code: string; name: string; contact: string; website: string };

/** An attraction closed for part of the edition: when it opens again, and how to reach it. */
/** A place new this season, as its page prints it: what it is, a line about it, a picture, and how to find it. */
export type NewPlace = { name: string; section: string; line: string; thumb: string; imageUrl: string; address: string; phone: string; website: string };

const SECTION_LABEL: Record<string, string> = { 'eat-drink': 'Eat', see: 'Visit', do: 'Do', shop: 'Buy', stay: 'Stay' };

export type LookingAhead = { name: string; reopens: number; line: string; thumb: string; opening: string; phone: string; website: string };

export type Guide = {
  /** The attractions closed for part of the edition, in the order they open again; none in summer. */
  lookingAhead: LookingAhead[];
  /** Places new this season, picked by staff: a page of their own before the venue sections. */
  newThisSeason: NewPlace[];
  /** Highlights, each a full page, ahead of the listings and not repeated in them. */
  highlights: GuideEvent[];
  /** In page order, page by page as the layout set them; a grid's picture box is an entry of its own (frame 'image') beside its listing. */
  events: GuideEvent[];
  pages: GuideEvent[][];
  /** Exhibitions and the like, on for weeks or months: after the dated pages, on Ongoing events pages of their own, by name. */
  ongoing: GuideEvent[];
  ongoingPages: GuideEvent[][];
  layout: Layout;
  /** The whole template: What's On, tours, and each venue section's grid. */
  layouts: GuideLayouts;
  /** Titles of events left out of print as not aimed at visitors. */
  leftOut: string[];
  tours: GuideTour[];
  /** On a grid, the tours a page at a time, a picture a page; none when they flow in ruled columns. */
  tourPages: GuideTour[][] | null;
  providers: GuideProvider[];
  venues: GuideVenue[];
  /** The venues laid out as the sections print them: per section and area, full pages, grid pages, then the directory. */
  sections: VenueSection[];
  /** Do's activities and their providers' index, when there are activities to set; printed in the Do section after its venue pages. */
  doSection: DoSection | null;
};

const genreOrder = (g: string) => {
  const i = (GENRES as readonly string[]).indexOf(g);
  return i < 0 ? GENRES.length : i;
};

/**
 * Everything included, as printed entries, in guide order: events by
 * their first date in the edition; dated tours by date, then
 * on-demand ones by genre; the provider key only for providers with a
 * tour in this edition.
 */
export async function buildGuide(window: Window, opts: { draft?: boolean; layout?: Layout; layouts?: GuideLayouts } = {}): Promise<Guide> {
  const layouts: GuideLayouts = opts.layouts ?? { events: opts.layout ?? 'top', tours: (opts.layout ?? 'top') === 'top' ? 'columns' : 'grid8', venues: {}, budgets: {} };
  const layout = layouts.events;
  const [selection, tourRows] = await Promise.all([guideSelection(opts), includedExperiences(opts)]);

  // What is not aimed at visitors is left out of print: training and work, business, health and wellbeing. The event's own words count too, unless staff have set its types by hand.
  const typed = selection.events.map((row) => ({ ...row, types: row.event.lockedFields.includes('eventTypes') ? row.event.eventTypes : withCategories(row.event.eventTypes, row.event) }));
  const leftOut = typed.filter((r) => nonCore(r.types)).map((r) => r.event.title);
  const all = typed
    .filter((r) => !nonCore(r.types))
    .map(({ event, venue, types }) => guideEvent({ ...event, eventTypes: types }, venue, window))
    .filter((g): g is GuideEvent => g !== null);
  const highlights = all.filter((e) => e.highlight).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  // By their first date in the edition, long runs among the rest; onto pages as the layout asks.
  const pages = layoutEvents(all.filter((e) => !e.highlight && e.block !== 'ongoing').sort((a, b) => a.sortKey.localeCompare(b.sortKey) || a.title.localeCompare(b.title)), layout);
  const events = pages.flat();
  const ongoingPages = layoutEvents(all.filter((e) => !e.highlight && e.block === 'ongoing').sort((a, b) => a.title.localeCompare(b.title)), layout);
  const ongoing = ongoingPages.flat();

  // Every provider in the key has a code, so a tour need only print its provider's code; a new one gets its initials until the import saves them.
  const missing = fillCodes([...new Map(tourRows.flatMap(({ provider }) => (provider ? [[provider.id, provider] as const] : []))).values()]);
  const printed: { tour: GuideTour; provider: Provider | null }[] = [];
  for (const { experience, provider: found } of tourRows) {
    const provider = found && !found.code ? { ...found, code: missing.get(found.id) ?? null } : found;
    const tour = guideTour(experience, provider, window);
    if (tour) printed.push({ tour, provider });
  }
  const tours = printed
    .map((p) => p.tour)
    .sort((a, b) =>
      (a.kind === b.kind ? 0 : a.kind === 'dated' ? -1 : 1)
      || (a.kind === 'dated'
        ? a.sortKey.localeCompare(b.sortKey)
        : genreOrder(a.genre) - genreOrder(b.genre))
      || a.title.localeCompare(b.title));

  const byId = new Map<string, Provider>();
  for (const { provider } of printed) if (provider) byId.set(provider.id, provider);
  const tourProviders = [...byId.values()];

  // Do's activity providers go in its index rather than a box each; one that booked more space keeps its entry too.
  const activityRows = await db.select().from(doActivities).where(eq(doActivities.included, true)).orderBy(asc(doActivities.position), asc(doActivities.name));
  const indexed = selection.venues.filter((p) => p.activityCode && p.activities.length);
  const inIndex = new Set(indexed.filter((p) => p.listingSize === 'listing' || p.listingSize === 'directory').map((p) => p.id));
  const doGrid = layouts.venues.Do ?? 'grid8';
  const doSet = activityRows.length
    ? doSection(
        activityRows.map((a) => {
          // Its own picture, else that of the first provider offering it, by marker, that has one.
          const image = a.image ?? [...indexed].sort((x, y) => x.activityCode!.localeCompare(y.activityCode!)).find((p) => p.activities.includes(a.slug) && printable(p.headerImage))?.headerImage ?? null;
          return { slug: a.slug, name: a.name, side: a.side, blurb: a.blurb ?? '', imageUrl: image?.url ?? '', preview: image ? webImage(image, 520, 360) : '', guidePicture: !!a.image };
        }),
        // A provider who also runs tours keeps its tour guide marker: one provider, one marker, one line in the key.
        indexed.map((p) => ({ code: tourProviders.find((t) => t.placeId === p.id && t.code)?.code ?? p.activityCode!, name: p.name, phone: p.phone ?? '', website: printWebsite(p.website)?.toLowerCase() ?? '', activities: p.activities })),
        doGrid,
      )
    : null;
  // One key for tours and Do: the tour guides, then Do's providers not already among them.
  const providers = [
    ...tourProviders.map((p) => ({ code: p.code ?? '', name: p.name, contact: printContact(p.phone, p.email) ?? '', website: printWebsite(p.website)?.toLowerCase() ?? '' })),
    ...(doSet?.providers ?? [])
      .filter((d) => !tourProviders.some((t) => t.code && t.code.toUpperCase() === d.code.toUpperCase()))
      .map((d) => ({ code: d.code, name: d.name, contact: d.phone, website: d.website })),
  ].sort((a, b) => (a.code || 'ZZZ').localeCompare(b.code || 'ZZZ') || a.name.localeCompare(b.name));
  const sections = venueSections(selection.venues.filter((p) => !doSet || !inIndex.has(p.id)).map(guideVenue), (s) => layouts.venues[s] ?? 'grid8', (s) => budgetFor(layouts, s));
  // Do prints even when every provider is in its index and no venue has a page of its own.
  if (doSet && !sections.some((s) => s.section === 'Do')) {
    const at = sections.findIndex((s) => VENUE_SECTION_ORDER.indexOf(s.section as never) > VENUE_SECTION_ORDER.indexOf('Do'));
    sections.splice(at < 0 ? sections.length : at, 0, { section: 'Do', grid: doGrid, pages: [], directory: [], key: [] });
  }
  // In page order, as the sections print them.
  const venues = sections.flatMap((s) => [...s.pages.flatMap((p) => (p.kind === 'full' ? [p.venue] : p.cells)), ...s.directory]);

  // On the grid, dated tours and on-demand ones each start a page of their own, under their own page marker.
  const tg = layouts.tours;
  const tourPages = tg === 'columns' ? null : [...gridTours(tours.filter((t) => t.kind === 'dated'), tg), ...gridTours(tours.filter((t) => t.kind === 'on demand'), tg)];

  // Looking ahead: the attractions closed for part of this edition, and the month each opens again.
  const edition = windowMonths(window.from, window.to);
  const lookingAhead = selection.venues
    .filter((p) => (p.guideSection ?? (p.category === 'see' ? 'Visit' : '')) === 'Visit')
    .map((p) => ({ p, month: reopensIn(p.openMonths, edition) }))
    .filter((x): x is { p: (typeof x)['p']; month: number } => x.month !== null)
    .map(({ p, month }) => ({
      name: p.name,
      reopens: month,
      // Its one line, else the first sentence of its copy.
      line: p.guideLine && usableLine(p.guideLine) ? p.guideLine : (p.guideCopy ?? p.summary ?? '').split(/(?<=[.!?])\s/)[0] ?? '',
      // A small picture for a client: one marked as such, or that has booked space in an edition.
      thumb: (p.client || Object.values(p.spaceByEdition ?? {}).some((s) => s !== 'listing' && s !== 'directory')) && printable(p.headerImage) ? webImage(p.headerImage!, 240, 240) : '',
      opening: openingText(p.openingHours, p.openMonths) ?? '',
      phone: p.phone ?? '',
      website: printWebsite(p.website)?.toLowerCase() ?? '',
    }))
    // In the order they open again, counting on from the edition's first month.
    .sort((a, b) => ((a.reopens - edition[0]! + 12) % 12) - ((b.reopens - edition[0]! + 12) % 12) || a.name.localeCompare(b.name));

  // New this season: the places staff picked for this edition from those new to the jersey.com feed.
  const editionName = editions(Number(window.from.slice(0, 4))).find((e) => e.window.from === window.from)?.name ?? null;
  const picked = editionName ? await db.select().from(places).where(and(eq(places.newIn, editionName), ne(places.inclusion, 'excluded'), eq(places.review, 'approved'))).orderBy(asc(places.name)) : [];
  const newThisSeason: NewPlace[] = picked.map((p) => ({
    name: p.name,
    section: p.guideSection ?? SECTION_LABEL[p.category] ?? '',
    line: p.guideLine && usableLine(p.guideLine) ? p.guideLine : (p.guideCopy ?? p.summary ?? p.description ?? '').replace(/\s+/g, ' ').split(/(?<=[.!?])\s/)[0] ?? '',
    thumb: printable(p.headerImage) ? webImage(p.headerImage!, 300, 300) : '',
    imageUrl: printable(p.headerImage) ? p.headerImage!.url : '',
    address: [p.addressLine1, printParish(p.parish)].filter(Boolean).join(', '),
    phone: p.phone ?? '',
    website: printWebsite(p.website)?.toLowerCase() ?? '',
  }));

  return { highlights, events, pages, ongoing, ongoingPages, layout, layouts, leftOut, tours: tourPages ? tourPages.flat() : tours, tourPages, providers, venues, sections, doSection: doSet, lookingAhead, newThisSeason };
}

/** In page order: Frame says which take the picture cells, or (in a grid) which row is the picture box beside its listing. */
export const EVENT_COLUMNS = ['Frame', 'Dates', 'Times', 'Title', 'Copy', 'Price', 'Venue', 'Address', 'Contact', 'Website', 'Image URL', 'Block', 'Icons'] as const;
/** Highlights merge into their own full-page template. */
export const HIGHLIGHT_COLUMNS = ['Dates', 'Times', 'Title', 'Extended Copy', 'Price', 'Venue', 'Address', 'Contact', 'Website', 'Image URL'] as const;
/** On a grid, in page order: Frame says which row is the picture box beside its listing. */
export const TOUR_COLUMNS = ['Kind', 'Genre', 'Dates', 'Title', 'Code', 'Duration', 'Times', 'Copy', 'Provider', 'Frame', 'Image URL', 'Icons'] as const;
export const PROVIDER_COLUMNS = ['Code', 'Name', 'Contact', 'Website'] as const;
/** In page order: section, area, then full pages, grid pages (Frame says feature or listing) and directory lines. */
export const VENUE_COLUMNS = ['Section', 'Area', 'Key', 'Name', 'Label', 'Size', 'Frame', 'Copy', 'Address', 'Phone', 'Email', 'Website', 'Image URL'] as const;
