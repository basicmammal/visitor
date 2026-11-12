import type { Event, Experience, ListingSize, Place, Provider } from '@/lib/db/schema';
import { isNewVenue } from './new-venue';
import { openingText } from './opening';
import { webImage } from './images';
import { UNIQUE } from './occurrence';
import {
  printAddress,
  printContact,
  printDates,
  printOngoingDates,
  printPrice,
  printTimes,
  printTourDates,
  printTitle,
  printWebsite,
  socialSite,
} from './house-style';

/**
 * One What's On entry, field by field, as the guide prints it. The page
 * preview and the InDesign Data Merge export both read this, so what is
 * proofed on screen is what lands in the layout.
 */
export type GuideEvent = {
  dates: string;
  times: string;
  title: string;
  copy: string;
  price: string;
  venue: string;
  address: string;
  contact: string;
  website: string;
  imageUrl: string;
  /** Unique events print in date order; regular ones among them; ongoing ones on Ongoing events pages of their own. */
  block: 'dated' | 'all season' | 'ongoing';
  /** A full page of its own: the extended listing and a large image. */
  highlight: boolean;
  /** The long copy a highlight prints: ours, else the listing's full description. */
  extendedCopy: string;
  /** The first date inside the edition, for ordering. Not printed. */
  sortKey: string;
  /** A web-sized copy of the picture for the on-screen proof; the export keeps the original. Not printed. */
  preview: string;
  /** A charity or community event: listed, but a picture slot goes to something else first. Not printed. */
  community: boolean;
  /** The copy cut for each frame it might take, a picture cell's or a listing's; the page layout picks. Not printed. */
  fits: { picture: string; listing: string };
  /** Which frame it takes on its page, set by the page layout: a pictured cell, a listing, or (in the grid) the picture box beside its listing. */
  frame: 'picture' | 'listing' | 'image';
  /** Staff chose its picture for the grid's picture box, ahead of the rest on its page. Not printed. */
  guidePicture: boolean;
  /** Its kinds, which the page prints as key icons. */
  types: string[];
  /** Every whole-sentence version of the copy, fullest first: the proof measures its frame and prints the first that fits. Not printed. */
  options: string[];
};

export type Window = { from: string; to: string };

/**
 * The frames an event prints in, six to a page: a top row of two 45.5 ×
 * 52mm cells with a 16mm picture, then four 45.5 × 43mm listings without.
 * The 2026 editions' 70mm picture cell is the default.
 */
/** A box: its height in mm, whether it carries a picture, and its type size against the standard boxes' (the grid of twelve sets 7.5pt to their 8.5pt). */
export type Frame = { height: number; picture: boolean; scale?: number };
export const FRAMES = { picture: { height: 52, picture: true }, listing: { height: 43, picture: false } } as const satisfies Record<string, Frame>;

/**
 * Room in an event's printed frame: the picture if it has one, the date
 * line, the title, the copy and the venue block. Line counts are estimated from characters at the
 * frame's width, a little short of the real figure so that what fits here
 * fits in InDesign too.
 */
const LINE_MM = { date: 3.6, title: 3.4, copy: 3.24, small: 2.75 };
const PER_LINE = { date: 30, title: 30, copy: 32, small: 40 };
const lines = (text: string, per: number) => (text ? Math.ceil(text.length / per) : 0);

export function copyBudget(e: { dates: string; times: string; title: string; price: string; venue: string; address: string; contact: string; website: string }, frame: Frame = { height: 70, picture: true }): number {
  // Smaller type: more characters to a line, and lines closer together.
  const k = frame.scale ?? 1;
  const lines = (text: string, per: number) => (text ? Math.ceil(text.length / (per / k)) : 0);
  const LINE = { date: LINE_MM.date * k, title: LINE_MM.title * k, copy: LINE_MM.copy * k, small: LINE_MM.small * k };
  const used =
    (frame.picture ? 18.7 : 2) + // the picture, its rule and the space under it; a listing's rule
    lines(`${e.dates}  ${e.times}`.trim(), PER_LINE.date) * LINE.date +
    lines(e.title, PER_LINE.title) * LINE.title + 0.5 +
    (e.venue ? 2.2 + lines(e.venue, PER_LINE.small) * LINE.small : 0) +
    lines(e.address, PER_LINE.small) * LINE.small +
    lines(e.contact, PER_LINE.small) * LINE.small +
    (e.website ? 1.4 + lines(e.website, PER_LINE.small) * LINE.small : 0);
  const copyLines = Math.max(0, Math.floor((frame.height - used) / LINE.copy));
  return copyLines ? Math.floor((copyLines * PER_LINE.copy) / k) - (e.price ? e.price.length + 1 : 0) : 0;
}

/**
 * Copy cut to its frame: as many whole sentences as fit, and if not even
 * the first does, its words up to the room left and an ellipsis.
 */
export function fitCopy(text: string, budget: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= budget) return clean;
  const sentences = clean.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) ?? [clean];
  let out = '';
  for (const s of sentences) {
    const next = `${out} ${s.trim()}`.trim();
    if (next.length > budget) break;
    out = next;
  }
  if (out) return out;
  const words = clean.split(' ');
  let cut = '';
  for (const w of words) {
    if (`${cut} ${w}`.trim().length > budget - 1) break;
    cut = `${cut} ${w}`.trim();
  }
  return `${cut.replace(/[,;:–-]+$/, '')}…`;
}

/**
 * The copy a frame prints. Ours, when it fits, as an editor wrote it for
 * print. Otherwise the fullest that fits in whole sentences: the
 * description cut at a sentence, the card's one-sentence version, or the
 * print line written to fit the smallest frame, whichever says more. Only if neither fits whole is a sentence cut.
 */
export function printCopy(e: { guideCopy: string | null; summary: string | null; description: string | null; printLine?: string | null }, budget: number): string {
  // No room for a line of copy: the dates, title and venue say it.
  if (budget <= 0) return '';
  return copyOptions(e).find((c) => c.length <= budget) ?? '';
}

/**
 * The copy a frame could print, in order of preference: ours whole, then
 * every whole-sentence version of ours, the description, the card
 * sentence and the print line, fullest first, then none.
 */
export function copyOptions(e: { guideCopy: string | null; summary: string | null; description: string | null; printLine?: string | null }): string[] {
  const tidy = (t: string | null | undefined) => (t ?? '').replace(/\s+/g, ' ').trim();
  const ours = tidy(e.guideCopy);
  const snippet = tidy(e.printLine);
  // The snippet sums the listing up for print: whole, or its first sentence alone.
  const texts = snippet ? [snippet] : [tidy(e.description), tidy(e.summary)];
  const prefixes = new Set<string>();
  for (const text of [ours, ...texts]) {
    let out = '';
    for (const s of sentences(text)) {
      out = `${out} ${s}`.trim();
      if (out.length > 600) break;
      if (!trailsOff(out)) prefixes.add(out);
    }
  }
  return [...new Set([...(ours ? [ours] : []), ...[...prefixes].sort((a, b) => b.length - a.length), ''])];
}

/** Copy the source cut short ("…", "..."): never printed. */
const trailsOff = (t: string) => /(\.\.|…)\s*$/.test(t) || /(\.\.|…)\s/.test(t);
/** A full stop that ends a short form, not a sentence: "St. Helier", "Dr. Smith", "e.g. this". */
const SHORT_FORM = /(?:^|\s)(?:St|Ste|Mt|Dr|Mr|Mrs|Ms|No|Nos|approx|e\.g|i\.e|vs|[A-Z])\.$/;
function sentences(t: string): string[] {
  const out: string[] = [];
  for (const piece of (t.match(/[^.!?…]+(?:[.!?…]+|$)(?=\s|$)/g) ?? []).map((s) => s.trim()).filter(Boolean)) {
    const last = out.at(-1);
    // Glued back on: after a short form, or when what follows starts in lower case.
    if (last && (SHORT_FORM.test(last) || /^[a-z0-9]/.test(piece))) out[out.length - 1] = `${last} ${piece}`;
    else out.push(piece);
  }
  return out;
}

/**
 * A picture the guide prints: the listing's own (not stock or a club's
 * photograph we credit), and not a poster or flyer, which crops badly.
 */
export const printable = (image: Event['headerImage']) => !!image && !image.credit && !(image.text && image.text.url === image.url && image.text.found);

/** Sites that sell for everyone: in print they say nothing about the event. */
const TICKET_PLATFORMS = /(^|\.)(eventbrite\.[a-z.]+|ticketsolve\.com|ticketsource\.co\.uk|islandtickethut\.com|jersey\.com|skiddle\.com|ticketmaster\.[a-z.]+|seetickets\.com|bulls\.je\/event)$/i;

/**
 * The address the guide prints: the event's own, unless that is a ticket
 * platform and the venue has a site of its own, which a reader can type
 * and remember.
 */
export function guideWebsite(eventSite: string | null, venueSite: string | null): string | null {
  // A social page is not a website: the guide never prints one, so the other link stands in.
  if (venueSite && socialSite(venueSite)) venueSite = null;
  if (eventSite && socialSite(eventSite)) return venueSite ?? eventSite;
  if (!eventSite) return venueSite;
  let host = '';
  try {
    host = new URL(/^https?:/i.test(eventSite) ? eventSite : `https://${eventSite}`).hostname.replace(/^www\./, '');
  } catch {
    return eventSite;
  }
  return TICKET_PLATFORMS.test(host) && venueSite ? venueSite : eventSite;
}

export function guideEvent(e: Event, venue: Pick<Place, 'name' | 'addressLine1' | 'parish' | 'postcode' | 'phone' | 'website'> | null, window?: Window): GuideEvent | null {
  const inside = e.dates.filter((d) => !window || (d.date >= window.from && d.date <= window.to));
  // Ongoing listings go by their own first and last days, not the edition's, and a placeholder end is left off.
  const dates = e.printDates ?? (e.occurrence === 'ongoing' && window ? printOngoingDates(e.dates, window) : printDates(e.dates, window));
  // Not on during this edition, and nobody has said otherwise.
  if (!dates) return null;

  const address = e.addressLine1 || e.parish
    ? printAddress(e)
    : venue ? printAddress(venue) : null;

  const entry = {
    dates,
    times: e.printTimes ?? printTimes(inside.length ? inside : e.dates) ?? '',
    title: printTitle(e.title),
    price: e.printPrice ?? printPrice(e.fromPricePence, e.toPricePence, { free: e.free }) ?? '',
    venue: e.venueName ?? venue?.name ?? e.venue?.split(',')[0] ?? '',
    address: address ?? '',
    contact: printContact(e.phone ?? venue?.phone ?? null, e.email) ?? '',
    website: printWebsite(guideWebsite(e.website, venue?.website ?? null)) ?? '',
    // Stock, credited and poster pictures are for the web only: print uses the listing's own photograph or none.
    imageUrl: printable(e.headerImage) ? e.headerImage!.url : '',
    preview: printable(e.headerImage) ? webImage(e.headerImage!, 520, 182) : '',
    block: (UNIQUE.includes(e.occurrence) ? 'dated' : e.occurrence === 'ongoing' ? 'ongoing' : 'all season') as GuideEvent['block'],
    highlight: e.highlight,
    extendedCopy: e.guideCopy ?? e.description ?? e.summary ?? '',
    sortKey: inside[0]?.date ?? e.startsOn ?? '',
  };
  const fits = { picture: printCopy(e, copyBudget(entry, FRAMES.picture)), listing: printCopy(e, copyBudget(entry, FRAMES.listing)) };
  const community = e.eventTypes.includes('Charity');
  return { ...entry, community, guidePicture: e.guidePicture, types: e.eventTypes, fits, frame: 'listing', copy: fits.listing, options: copyOptions(e) };
}

/**
 * How What's On is laid out. 'top': six to a page, a pictured pair across
 * the top. 'grid6', 'grid8' and 'grid16': six, eight or sixteen equal
 * boxes, two across, every listing without a picture and one box a
 * picture beside the listing it belongs to.
 */
export const LAYOUTS = ['top', 'grid6', 'grid8', 'grid16'] as const;
export type Layout = (typeof LAYOUTS)[number];
export const layoutFrom = (v: string | null | undefined): Layout => (LAYOUTS as readonly string[]).includes(v ?? '') ? (v as Layout) : 'top';

/** Tours: in ruled columns, or on a grid of eight, twelve or sixteen with a picture a page. */
export const TOUR_LAYOUTS = ['columns', 'grid8', 'grid12', 'grid16'] as const;
export type TourLayout = (typeof TOUR_LAYOUTS)[number];
/** A venue section: on the grid of eight (a listing a box, an eighth) or of sixteen (a listing a sixteenth). */
export const VENUE_GRIDS = ['grid8', 'grid16'] as const;
export type VenueGrid = (typeof VENUE_GRIDS)[number];

/** Each part of the guide's template, chosen on the production page and carried in its address. */
/** Venue sections' grids, and how many pages each gives listings (those without booked space) before the rest go to its index. */
/** `tours` is the template for tours on specific dates; `ongoing` for those on demand. */
export type GuideLayouts = { events: Layout; tours: TourLayout; ongoing: TourLayout; venues: Record<string, VenueGrid>; budgets: Record<string, number | null> };

/**
 * Pages for listings beyond the rows booked entries leave, then the section's index, unless chosen
 * otherwise: Eat two, Buy one, Visit none (its booked pages leave room for six). Null is no limit.
 */
export const DEFAULT_BUDGETS: Record<string, number> = { Eat: 2, Buy: 1, Visit: 0 };
export const budgetFor = (l: GuideLayouts, section: string): number | null => (section in l.budgets ? l.budgets[section]! : DEFAULT_BUDGETS[section] ?? null);

/**
 * The template from the address: ?grid= for What's On (as it always was),
 * ?tours= for tours on specific dates, ?ongoing= for those on demand,
 * ?venues=Eat:grid16,Buy:grid16 for the venue sections not on the grid of
 * eight. Dated tours are on the grid of eight unless chosen; on-demand
 * ones follow them onto a grid, the grid of twelve.
 */
export function layoutsFrom(get: (key: string) => string | null | undefined): GuideLayouts {
  const events = layoutFrom(get('grid'));
  const asked = get('tours');
  const tours: TourLayout = (TOUR_LAYOUTS as readonly string[]).includes(asked ?? '') ? (asked as TourLayout) : 'grid8';
  const askedOngoing = get('ongoing');
  const ongoing: TourLayout = (TOUR_LAYOUTS as readonly string[]).includes(askedOngoing ?? '') ? (askedOngoing as TourLayout) : defaultOngoing(tours);
  const venues: Record<string, VenueGrid> = {};
  for (const part of (get('venues') ?? '').split(',')) {
    const [section, grid] = part.split(':');
    if (section && (VENUE_GRIDS as readonly string[]).includes(grid ?? '')) venues[section] = grid as VenueGrid;
  }
  const budgets: Record<string, number | null> = {};
  for (const part of (get('budget') ?? '').split(',')) {
    const [section, n] = part.split(':');
    if (section && n === 'all') budgets[section] = null;
    else if (section && /^\d{1,2}$/.test(n ?? '')) budgets[section] = Number(n);
  }
  return { events, tours, ongoing, venues, budgets };
}

/** On-demand tours, unless chosen: in columns with dated ones in columns, else on the grid of twelve. */
export const defaultOngoing = (tours: TourLayout): TourLayout => (tours === 'columns' ? 'columns' : 'grid12');

/** The template as address parameters, leaving out what is the default. */
export function layoutsQuery(l: GuideLayouts): string {
  const q = new URLSearchParams();
  if (l.events !== 'top') q.set('grid', l.events);
  if (l.tours !== 'grid8') q.set('tours', l.tours);
  if (l.ongoing !== defaultOngoing(l.tours)) q.set('ongoing', l.ongoing);
  const venues = Object.entries(l.venues).filter(([, g]) => g !== 'grid8').map(([s, g]) => `${s}:${g}`).join(',');
  if (venues) q.set('venues', venues);
  const budgets = Object.entries(l.budgets ?? {})
    .filter(([s, n]) => n !== (DEFAULT_BUDGETS[s] ?? null))
    .map(([s, n]) => `${s}:${n ?? 'all'}`)
    .join(',');
  if (budgets) q.set('budget', budgets);
  return q.toString();
}

export const PER_PAGE = 6;
const PICTURES_PER_PAGE = 2;
/** Its copy would be cut mid-sentence, or dropped, in a picture cell. */
const cut = (e: GuideEvent) => !e.fits.picture || e.fits.picture.endsWith('…');

/** The grid's boxes: 142.4mm of page, rows 2mm apart. */
export const GRID = { grid6: { cells: 6, height: 46 }, grid8: { cells: 8, height: 34 }, grid12: { cells: 12, height: 22 }, grid16: { cells: 16, height: 16 } } as const;

/**
 * Events onto pages in date order, as the layout asks. Top: six at a
 * time; on each page the two with the strongest claim to a picture take
 * the top row: one with its own picture, not a community event unless
 * nothing else has one, and one whose copy fits the smaller frame in
 * whole sentences before one that would be cut. The rest follow as
 * listings, still in date order.
 *
 * Grid: five or seven listings a page and a picture box in the same row
 * as its listing, to its right, so that the reader sees whose picture it
 * is; a listing in the right-hand column swaps with the one before it. The
 * picture is the one staff chose, else the first with its own picture
 * that is not a community event, else any. A page with no picture to show
 * takes one more listing instead.
 */
export function layoutEvents(events: GuideEvent[], layout: Layout = 'top'): GuideEvent[][] {
  if (layout !== 'top') return gridEvents(events, GRID[layout]);
  const pages: GuideEvent[][] = [];
  for (let i = 0; i < events.length; i += PER_PAGE) {
    const page = events.slice(i, i + PER_PAGE);
    const ranked = page
      .map((e, at) => ({ e, at }))
      .filter(({ e }) => e.imageUrl)
      .sort((a, b) => Number(a.e.community) - Number(b.e.community) || Number(cut(a.e)) - Number(cut(b.e)) || a.at - b.at)
      .slice(0, PICTURES_PER_PAGE)
      .sort((a, b) => a.at - b.at)
      .map(({ e }) => e);
    const pictured = new Set(ranked);
    pages.push([
      ...ranked.map((e) => ({ ...e, frame: 'picture' as const, copy: e.fits.picture })),
      ...page.filter((e) => !pictured.has(e)).map((e) => ({ ...e, frame: 'listing' as const, copy: e.fits.listing })),
    ]);
  }
  return pages;
}

function gridEvents(events: GuideEvent[], grid: { cells: number; height: number }): GuideEvent[][] {
  const frame = { height: grid.height, picture: false };
  return gridPages(events, grid.cells, {
    listing: (e) => ({ ...e, frame: 'listing', copy: e.options.find((c) => c.length <= copyBudget(e, frame)) ?? '' }),
    image: (e) => ({ ...e, frame: 'image', copy: '' }),
  });
}

type Pictured = { imageUrl: string; guidePicture: boolean; community?: boolean };
/** Eventbrite's pictures, linked from its servers, do not always show elsewhere: a page's picture is one of them only when nothing else has a picture. */
const hotlinked = (url: string) => /^https:\/\/img\.evbuc\.com\//.test(url);

/**
 * Entries onto pages of a two-across grid, in order: a box a page for a
 * picture and the rest listings. The picture is the one staff chose, else
 * the first with its own picture that is not linked from Eventbrite or a
 * community event, else any;
 * it follows its listing in the same row, and a listing in the
 * right-hand column swaps with the one before it to make room. A page
 * with no picture to show takes one more listing instead.
 */
export function gridPages<T extends Pictured>(items: T[], cells: number, cell: { listing: (t: T) => T; image: (t: T) => T }): T[][] {
  const pages: T[][] = [];
  let i = 0;
  while (i < items.length) {
    const page = items.slice(i, i + cells - 1);
    const pick = page
      .map((e, at) => ({ e, at }))
      .filter(({ e }) => e.imageUrl)
      .sort((a, b) => Number(b.e.guidePicture) - Number(a.e.guidePicture) || Number(hotlinked(a.e.imageUrl)) - Number(hotlinked(b.e.imageUrl)) || Number(!!a.e.community) - Number(!!b.e.community) || a.at - b.at)[0];
    if (!pick) {
      // Nothing on this page to picture: a listing fills the box instead.
      const full = items.slice(i, i + cells);
      pages.push(full.map(cell.listing));
      i += full.length;
      continue;
    }
    const listed = page.map(cell.listing);
    const at = pick.at - (pick.at % 2);
    const [chosen] = listed.splice(pick.at, 1);
    listed.splice(at, 0, chosen!, cell.image(page[pick.at]!));
    pages.push(listed);
    i += page.length;
  }
  return pages;
}

/** The current season if none is chosen: today to three months on. */
export function defaultWindow(today = new Date()): Window {
  const to = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 3, 0));
  return { from: today.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

/** One venue as the guide prints it: in a section and area, under its label. */
export type GuideVenue = {
  section: string;
  area: string;
  name: string;
  label: string;
  size: ListingSize;
  /** First listed in the last six months: printed NEW beside its name. */
  isNew: boolean;
  copy: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  imageUrl: string;
  /** A web-sized copy of the picture for the on-screen proof. Not printed. */
  preview: string;
  /** Every whole-sentence version of the copy, fullest first, for a box to fit. Not printed. */
  options: string[];
  /** Its area's marker in the section's key, once the section is laid out. */
  areaCode?: string;
  /** Featured in a past guide, or has its own guide copy: first for a box when the section's pages for listings are rationed. */
  featured: boolean;
  printed: boolean;
  /** When it opens: the months, unless all year, then the hours. Empty when the source does not say. */
  opening: string;
};

const SECTION_OF_CATEGORY: Record<Place['category'], string> = {
  stay: 'Stay', 'eat-drink': 'Eat', see: 'See', do: 'Do', shop: 'Buy',
};

export function guideVenue(p: Place): GuideVenue {
  const options = copyOptions({ guideCopy: p.guideCopy, summary: p.summary, description: p.description });
  return {
    section: p.guideSection ?? SECTION_OF_CATEGORY[p.category],
    area: p.guideArea ?? '',
    name: p.name,
    label: (p.guideLabel ?? '').toUpperCase(),
    size: p.listingSize,
    isNew: isNewVenue(p.firstListedAt),
    // A directory line has no copy; a listing box its one line, when it has one; the bigger entries their copy.
    copy: p.listingSize === 'directory' ? '' : p.listingSize === 'listing' && p.guideLine ? p.guideLine : p.guideCopy ?? p.summary ?? '',
    address: [p.addressLine1, printAddress({ addressLine1: null, parish: p.parish, postcode: null })].filter(Boolean).join(', '),
    phone: p.phone ?? '',
    email: p.email ?? '',
    website: printWebsite(p.website) ?? '',
    imageUrl: printable(p.headerImage) ? p.headerImage!.url : '',
    preview: printable(p.headerImage) ? webImage(p.headerImage!, 900, 600) : '',
    options: p.listingSize === 'directory' ? [] : p.listingSize === 'listing' && p.guideLine ? [p.guideLine] : options,
    featured: !!p.recommendedIn,
    printed: !!p.guideCopy,
    opening: openingText(p.openingHours, p.openMonths) ?? '',
  };
}

/**
 * The venue sections in the order the 2026 editions print them (Visit,
 * See, Do, Buy, Eat), then any other section a venue is set to; areas
 * in the order the guide reads the island (Do's by activity), then any
 * other, then those with no area.
 */
export const VENUE_SECTION_ORDER = ['Visit', 'See', 'Do', 'Buy', 'Eat'] as const;
// Places as the 2026 editions run Eat (St Helier, then East, then West); Do is set by activity rather than by place, in their order too.
export const VENUE_AREA_ORDER = ['St Helier', 'East', 'Gorey', 'North', 'West', 'St Aubin', 'South', 'Surf & kite', 'On the water', 'Adventure', 'Golf', 'Swim & sport', 'Riding', 'Yoga'] as const;
const SIZE_ORDER: Record<ListingSize, number> = { full: 0, 'three-quarters': 1, half: 2, quarter: 3, listing: 4, directory: 5 };
/** A name as staff may type it: "St. Helier" and "St Helier", "east" and "East", are one area. */
const sameName = (v: string) => v.replace(/\./g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const ranked = (order: readonly string[], v: string) => {
  const i = order.findIndex((o) => sameName(o) === sameName(v));
  return i < 0 ? order.length + (v ? 0 : 1) : i;
};

/** A box on a venue grid page: an entry across both columns for so many rows, or a listing in one box. */
export type VenueFrame = 'three-quarters' | 'half' | 'quarter' | 'listing';
export type VenueCell = GuideVenue & { frame: VenueFrame };
export type VenuePage = { kind: 'full'; venue: GuideVenue } | { kind: 'grid'; cells: VenueCell[] };
/** An area's short marker, printed on its boxes as the tour guides' are, and the area it stands for. */
export type AreaKey = { code: string; area: string };
export type VenueSection = { section: string; grid: VenueGrid; pages: VenuePage[]; directory: GuideVenue[]; key: AreaKey[] };

/** A page's share each size takes: on the grid of eight, three rows, two and one of four; on sixteen, six, four and two of eight. */
const SHARE: Record<Exclude<VenueFrame, 'listing'>, number> = { 'three-quarters': 3 / 4, half: 1 / 2, quarter: 1 / 4 };

// The areas' markers, where initials alone would clash or mislead.
const AREA_CODES: Record<string, string> = {
  'St. Helier': 'SH', 'St. Aubin': 'SA', West: 'W', North: 'N', East: 'E', Gorey: 'GY', South: 'S',
  'Surf & kite': 'SK', 'On the water': 'OW', Adventure: 'AD', Golf: 'GF', 'Swim & sport': 'SS', Riding: 'R', Yoga: 'Y',
};

/** A marker for each area, in order: its own, else its initials, lengthened until it is unlike the others. */
export function areaKey(areas: string[]): AreaKey[] {
  const taken = new Set<string>();
  return areas.filter(Boolean).map((area) => {
    const words = area.replace(/[^A-Za-z ]/g, ' ').split(/\s+/).filter((w) => w && !['the', 'and', 'of'].includes(w.toLowerCase()));
    const own = Object.entries(AREA_CODES).find(([name]) => sameName(name) === sameName(area))?.[1];
    let code = own ?? words.map((w) => w[0]!.toUpperCase()).join('');
    const last = words.at(-1) ?? area;
    for (let i = 1; taken.has(code) && i < last.length; i++) code = code.slice(0, -1) + last.slice(0, i + 1).toUpperCase();
    while (taken.has(code)) code += '+';
    taken.add(code);
    return { code, area };
  });
}

/**
 * Venues onto pages, a section at a time, on the grid the events and tours
 * use. A section runs on without a break between its areas, so no page is
 * left part empty; each box carries its area's marker, and the key says
 * which is which. A full-page entry is a page of its own, first. The bigger
 * grid entries go next, by area, each onto the first page with rows enough
 * for it (three-quarters and a quarter share a page; so do two halves).
 * Listings then fill the rows left, two to a row, and further grids. When
 * the section's listings are rationed to so many pages, those featured in
 * a past guide or with their own guide copy, then new ones, then those
 * with a picture, keep their boxes; the others join the directory lines
 * in the index that follows, by area. Within an area and size, by name.
 */
export function venueSections(venues: GuideVenue[], gridFor: (section: string) => VenueGrid = () => 'grid8', budget: (section: string) => number | null = () => null): VenueSection[] {
  const sections = [...new Set(venues.map((v) => v.section))].sort((a, b) => ranked(VENUE_SECTION_ORDER, a) - ranked(VENUE_SECTION_ORDER, b) || a.localeCompare(b));
  return sections.map((section) => {
    const grid = gridFor(section);
    // Rows of two boxes; an entry across both columns takes whole rows, a listing half of one.
    const ROWS = GRID[grid].cells / 2;
    const inArea = (a: GuideVenue, b: GuideVenue) => ranked(VENUE_AREA_ORDER, a.area) - ranked(VENUE_AREA_ORDER, b.area) || a.area.localeCompare(b.area);
    const here = venues.filter((v) => v.section === section).sort((a, b) => inArea(a, b) || SIZE_ORDER[a.size] - SIZE_ORDER[b.size] || a.name.localeCompare(b.name));
    const key = areaKey([...new Set(here.map((v) => v.area))]);
    const code = new Map(key.map((k) => [k.area, k.code]));
    const keyed = here.map((v) => ({ ...v, areaCode: code.get(v.area) ?? '' }));
    const fulls: VenuePage[] = keyed.filter((v) => v.size === 'full').map((venue) => ({ kind: 'full', venue }));
    const grids: { cells: VenueCell[]; free: number }[] = [];
    for (const v of keyed) {
      if (v.size !== 'three-quarters' && v.size !== 'half' && v.size !== 'quarter') continue;
      const rows = SHARE[v.size] * ROWS;
      let page = grids.find((g) => g.free >= rows);
      if (!page) grids.push((page = { cells: [], free: ROWS }));
      page.cells.push({ ...v, frame: v.size });
      page.free -= rows;
    }
    let listings: VenueCell[] = keyed.filter((v) => v.size === 'listing').map((v) => ({ ...v, frame: 'listing' }));
    // Rationed: the rows booked entries leave, and so many pages more; the rest go to the index.
    const pages = budget(section);
    const toIndex: GuideVenue[] = [];
    if (pages !== null) {
      const room = grids.reduce((n, g) => n + g.free * 2, 0) + pages * GRID[grid].cells;
      const first = [...listings].sort((a, b) => Number(b.featured) - Number(a.featured) || Number(b.printed) - Number(a.printed) || Number(b.isNew) - Number(a.isNew) || Number(!!b.imageUrl) - Number(!!a.imageUrl) || a.name.localeCompare(b.name));
      const boxed = new Set(first.slice(0, room));
      toIndex.push(...listings.filter((v) => !boxed.has(v)).map(({ frame: _f, ...v }) => v));
      listings = listings.filter((v) => boxed.has(v));
    }
    for (const g of grids) {
      g.cells.push(...listings.splice(0, g.free * 2));
      g.free = 0;
    }
    while (listings.length) grids.push({ cells: listings.splice(0, GRID[grid].cells), free: 0 });
    return {
      section,
      grid,
      pages: [...fulls, ...grids.map((g): VenuePage => ({ kind: 'grid', cells: g.cells }))],
      directory: [...keyed.filter((v) => v.size === 'directory'), ...toIndex].sort((a, b) => inArea(a, b) || a.name.localeCompare(b.name)),
      key,
    };
  });
}

/**
 * One tour as the guide prints it. Dated tours (one-off, specific dates)
 * carry their dates; on-demand ones (regular, bookable any day) print
 * under their genre without dates. From the autumn 2026 pages:
 *
 *   1/8/15/22/29 Sep, 6 Oct  Beach Blokarting  AA  1-2 hrs  If you're looking for…
 *   Arena Paintball  VAC  1-2 hrs  Arena Paintball is a high octane…
 */
export type GuideTour = {
  kind: 'dated' | 'on demand';
  genre: string;
  dates: string;
  title: string;
  code: string;
  provider: string;
  duration: string;
  times: string;
  copy: string;
  sortKey: string;
  imageUrl: string;
  /** A web-sized copy of the picture for the on-screen proof. Not printed. */
  preview: string;
  /** Staff chose its picture for the grid's picture box. Not printed. */
  guidePicture: boolean;
  /** Every whole-sentence version of the copy, fullest first, for a grid box to fit. Not printed. */
  options: string[];
  /** In the grid: a listing, or the picture box beside it. */
  frame: 'listing' | 'image';
  /** Its provider has worked with us (their venue is a client). Not printed. */
  client: boolean;
  /** The grid its page is on, once laid out. */
  grid?: Exclude<TourLayout, 'columns'>;
};

export function guideTour(
  x: Experience,
  provider: Pick<Provider, 'name' | 'code'> | null,
  window?: Window,
  client = false,
): GuideTour | null {
  const inside = x.dates.filter((d) => !window || (d.date >= window.from && d.date <= window.to));
  const dated = UNIQUE.includes(x.occurrence);
  const dates = dated ? x.printDates ?? printTourDates(x.dates, window) : '';
  // A dated tour with no dates in this edition is not in it; an on-demand
  // one is, if it runs at all during the edition or lists no dates.
  if (dated && !dates) return null;
  if (!dated && x.dates.length > 0 && inside.length === 0 && !x.printDates) return null;

  const times = x.printTimes ?? printTimes(inside.length ? inside : x.dates) ?? '';
  return {
    kind: dated ? 'dated' : 'on demand',
    genre: x.genre ?? '',
    dates: dates ?? '',
    title: printTitle(x.title),
    code: provider?.code ?? '',
    provider: provider?.name ?? '',
    duration: x.duration ?? '',
    // Bookable all day at many times reads as noise in print; leave it to the provider.
    times: times.split(/ \| |, /).length > 2 ? '' : times,
    copy: x.guideCopy ?? x.summary ?? '',
    sortKey: inside[0]?.date ?? '',
    imageUrl: printable(x.headerImage) ? x.headerImage!.url : '',
    preview: printable(x.headerImage) ? webImage(x.headerImage!, 520, 182) : '',
    guidePicture: x.guidePicture,
    options: tourOptions(x),
    frame: 'listing',
    client,
  };
}

/**
 * A tour's copy, in the order a box tries it: ours and the source's, sentence by
 * sentence, and then its snippet (two sentences, or the first alone) for
 * the smallest boxes, so a tour that loses its longer copy keeps a sentence.
 */
export function tourOptions(x: { guideCopy: string | null; summary: string | null; description: string | null; printLine?: string | null }): string[] {
  const long = copyOptions({ ...x, printLine: null });
  const short = x.printLine ? copyOptions({ guideCopy: null, summary: null, description: null, printLine: x.printLine }) : [];
  // Ours stays first, as copyOptions keeps it; the snippet's forms come after the source's, shortest last.
  return [...new Set([...long.filter(Boolean), ...short.filter(Boolean)]), ''];
}

/** A tour's box on the grid: when (dated tours only: the on-demand pages say so on their marker), its title, the copy, then the provider's code and the duration. The code points to the key. */
/** The tour grids' type against the standard boxes' 8.5pt: twelve at 7.5pt, sixteen at 7pt (app/globals.css). */
const TOUR_SCALE: Record<Exclude<TourLayout, 'columns'>, number> = { grid8: 1, grid12: 7.5 / 8.5, grid16: 7 / 8.5 };
const tourBox = (grid: Exclude<TourLayout, 'columns'>) => ({ height: GRID[grid].height, picture: false, scale: TOUR_SCALE[grid] });
export const tourWhen = (t: Pick<GuideTour, 'kind' | 'dates' | 'genre'>) => (t.kind === 'dated' ? t.dates : '');

/**
 * The tours on grids, page by page, as the templates chosen for each kind
 * put them: dated ones on theirs, on-demand ones on theirs, in print order
 * (a kind in columns has no grid pages: it flows). Each kind starts a page
 * of its own.
 */
export function tourGroups(tours: GuideTour[], layouts: Pick<GuideLayouts, 'tours' | 'ongoing'>): GuideTour[][] {
  const pages: GuideTour[][] = [];
  if (layouts.tours !== 'columns') pages.push(...gridTours(tours.filter((t) => t.kind === 'dated'), layouts.tours));
  if (layouts.ongoing !== 'columns') pages.push(...gridTours(tours.filter((t) => t.kind === 'on demand'), layouts.ongoing));
  return pages;
}

/** Tours and experiences on a grid (eight, twelve or sixteen), in the order they print: the listings and a picture a page. */
export function gridTours(tours: GuideTour[], grid: Exclude<TourLayout, 'columns'> = 'grid8'): GuideTour[][] {
  return gridPages(tours, GRID[grid].cells, {
    listing: (t) => {
      const room = copyBudget({ dates: tourWhen(t), times: t.times, title: t.title, price: '', venue: t.code ? '' : t.provider, address: '', contact: '', website: [t.code, t.duration].filter(Boolean).join('  ') }, tourBox(grid));
      // What fits by the estimate; failing that, the shortest sentence it has, so no tour goes without one (the proof measures and flags any overset).
      const shortest = [...t.options].reverse().find(Boolean) ?? '';
      return { ...t, frame: 'listing', grid, copy: t.options.find((c) => c && c.length <= room) ?? shortest };
    },
    image: (t) => ({ ...t, frame: 'image', grid, copy: '' }),
  });
}
