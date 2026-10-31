import { publicSearch } from '@/lib/db/public';
import { hiddenByDefault, siteTypes } from '@/lib/domain/categorise';
import { printParish, printPrice } from '@/lib/domain/house-style';
import { UNIQUE } from '@/lib/domain/occurrence';
import { fit, kindCounts, searchWords, sortHits, type Hit, type Kind } from '@/lib/domain/search';
import { tourKind } from '@/lib/domain/tour-kind';
import { cardWhen, startTimes } from '@/lib/domain/web-dates';
import { jerseyToday, rangeLabel, resolveWhen, type WhenPick } from '@/lib/domain/when';
import { cardLocation } from '@/components/site/listing-card';
import { CATEGORY_LABEL } from '@/lib/params';

export type SearchAsk = { q?: string; kinds?: Kind[]; when?: string; from?: string; to?: string; cats?: string[] };

export type SearchAnswer = {
  /** Something asked: words, a day, a kind or a category. Without, there is nothing to list yet, only counts. */
  asked: boolean;
  range: { from: string; to: string; pick: WhenPick | 'dates'; label: string } | null;
  /** How many of each kind, in the categories chosen. */
  counts: Record<Kind | 'all', number>;
  /** How many in each category (an event's kinds, a tour's genre), of the kinds chosen. */
  cats: Map<string, number>;
  /** Best first; of the kinds and categories chosen. */
  hits: Hit[];
};

const HEALTH = 'Health & wellbeing';

/**
 * The site search, behind the /search page: what is typed, in events,
 * tours, experiences and venues; narrowed by when (not venues, which have
 * no dates), by kind and by category (an event's kinds, a tour's genre;
 * venues have none). Kinds or categories chosen together mean any of
 * them. Each narrowing is counted from what the others leave, so a number
 * is what a tap shows.
 */
export async function runSearch(ask: SearchAsk): Promise<SearchAnswer> {
  const words = searchWords(ask.q);
  const today = jerseyToday();
  const range = resolveWhen({ when: ask.when, from: ask.from, to: ask.to }, today);
  const cats = ask.cats ?? [];
  const kinds = ask.kinds ?? [];
  const shownFrom = range && range.from > today ? range.from : today;

  const found = await publicSearch(words, range);
  // Health listings are for people who live here: found when asked for, by name or by picking Health & wellbeing.
  const healthAsked = words.length > 0 || cats.includes(HEALTH);
  const all: (Hit & { cats: string[]; hidden: boolean })[] = [
    ...found.events.map(({ event: e, venue, next }) => {
      const types = siteTypes(e);
      return {
        kind: 'events' as const,
        id: e.id,
        href: `/whats-on/${e.slug}`,
        title: e.title,
        when: cardWhen(e.dates, e.occurrence, shownFrom),
        location: cardLocation(e.venueName ?? venue?.name ?? e.venue, e.parish ?? venue?.parish),
        where: null,
        price: printPrice(e.fromPricePence, e.toPricePence, { free: e.free }),
        summary: e.summary ?? e.guideCopy,
        image: e.headerImage,
        types,
        genre: null,
        tag: UNIQUE.includes(e.occurrence) ? null : e.occurrence === 'regular' ? 'Regular' : 'Ongoing',
        highlight: e.highlight,
        fit: fit(e.title, words),
        // Ongoing ones after the dated; on a day, by the time each starts.
        order: UNIQUE.includes(e.occurrence) || e.highlight ? `${next} ${startTimes(e.dates, next)[0] ?? '99:99'}` : `~${next}`,
        cats: types,
        hidden: hiddenByDefault(e),
      };
    }),
    ...found.tours.map(({ tour: t, provider, next }) => ({
      kind: tourKind(t.title, t.tags, t.genre) === 'tour' ? ('tours' as const) : ('experiences' as const),
      id: t.id,
      href: `/tours/${t.slug}`,
      title: t.title,
      when: UNIQUE.includes(t.occurrence) ? cardWhen(t.dates, t.occurrence, shownFrom) : 'Book any day',
      location: cardLocation(t.meetingPoint, t.parish),
      where: [provider?.name, t.duration].filter(Boolean).join(' · ') || null,
      price: printPrice(t.fromPricePence, t.toPricePence),
      summary: t.summary ?? t.guideCopy,
      image: t.headerImage,
      types: null,
      genre: t.genre,
      tag: null,
      highlight: t.highlight,
      fit: fit(t.title, words),
      order: UNIQUE.includes(t.occurrence) || t.highlight ? next : `~${t.title.toLowerCase()}`,
      cats: t.genre ? [t.genre] : [],
      hidden: false,
    })),
    ...found.venues.map((v) => ({
      kind: 'venues' as const,
      id: v.id,
      href: `/venues/${v.slug}`,
      title: v.name,
      when: null,
      location: printParish(v.parish),
      where: v.stayType ?? CATEGORY_LABEL[v.category],
      price: null,
      summary: v.summary,
      image: v.headerImage,
      types: null,
      genre: null,
      tag: null,
      highlight: false,
      fit: fit(v.name, words),
      // Those our guide features first among equals.
      order: `${v.recommendedIn ? 0 : 1}${v.name.toLowerCase()}`,
      cats: [] as string[],
      hidden: false,
    })),
  ];

  type Row = (typeof all)[number];
  const inCats = (h: Row) => !cats.length || h.cats.some((c) => cats.includes(c));
  const ofKind = (h: Row) => !kinds.length || kinds.includes(h.kind);

  // A hidden health listing counts only under Health & wellbeing, as on What's on.
  const catCounts = new Map<string, number>();
  for (const h of all) if (ofKind(h)) for (const c of new Set(h.cats)) if (!h.hidden || c === HEALTH) catCounts.set(c, (catCounts.get(c) ?? 0) + 1);

  const chosen = all.filter((h) => inCats(h) && (!h.hidden || healthAsked));
  const asked = words.length > 0 || range !== null || cats.length > 0 || kinds.length > 0;
  return {
    asked,
    range: range ? { ...range, label: rangeLabel(range) } : null,
    counts: kindCounts(chosen),
    cats: catCounts,
    hits: asked ? sortHits(chosen.filter(ofKind)).map(({ cats: _c, hidden: _h, ...h }) => h) : [],
  };
}
