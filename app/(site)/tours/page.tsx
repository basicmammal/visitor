import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { ViewFrame, ViewToggle } from '@/components/site/view-switch';
import { CARD_GRID, asView } from '@/lib/view';
import { alternates } from '@/lib/agents/data';
import { CategoryList } from '@/components/site/category-list';
import { FilterPane } from '@/components/site/filter-pane';
import { jerseyToday, resolveWhen, rangeLabel } from '@/lib/domain/when';
import { filterChips } from '@/lib/domain/filter-chips';
import { FilterBar } from '@/components/site/filter-bar';
import { ListingCard, cardLocation } from '@/components/site/listing-card';
import { publicTours } from '@/lib/db/public';
import { GENRES, type Genre } from '@/lib/domain/genre';
import { printParish, printPrice } from '@/lib/domain/house-style';
import { UNIQUE } from '@/lib/domain/occurrence';
import { cardWhen } from '@/lib/domain/web-dates';
import { many, one, type SearchParams } from '@/lib/params';
import { JsonLd } from '@/components/site/json-ld';
import { SITE } from '@/lib/agents/data';
import { itemList } from '@/lib/agents/schema-org';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Tours & experiences', description: 'Guided walks, tide walks, boat trips and experiences in Jersey.', alternates: alternates('/tours') };

/**
 * Tours on particular dates by default: tide walks, ghost walks,
 * workshops. Those bookable any day come in with the tick, listed after.
 */
export default async function Tours({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const view = asView((await cookies()).get('view')?.value);
  const today = jerseyToday();
  const asked = { when: one(sp.when), from: one(sp.from), to: one(sp.to), month: one(sp.month) };
  const range = resolveWhen(asked, today);
  // Cards give each listing's first day in the range chosen, not its next day overall.
  const shownFrom = range && range.from > today ? range.from : today;
  // An old month link reads as its two dates, so the calendars show it and the tiles' links carry it on.
  const dates = range?.pick === 'dates' ? { from: range.from, to: range.to === '9999-12-31' ? undefined : range.to } : {};
  const values = { q: one(sp.q), when: range?.pick ?? (asked.when === 'dates' ? 'dates' : undefined), ...dates, genre: many(sp.genre).filter((g) => (GENRES as readonly string[]).includes(g)).join(',') || undefined, where: one(sp.where), by: one(sp.by), any: one(sp.any) };
  // Each kind chosen counts on the Filters button, and the dates as one.
  const active = Object.entries(values).filter(([k, v]) => v && !['when', 'from', 'to', 'genre'].includes(k)).length + (range ? 1 : 0) + many(values.genre).length;
  // Genres chosen together mean any of them.
  const genres = many(values.genre) as Genre[];
  const found = await publicTours({ showOnDemand: values.any === '1', range, q: values.q });

  // Where they start and who runs them, each counted from what the other choices leave.
  const inParish = (r: (typeof found)[number]) => !values.where || printParish(r.tour.parish) === values.where;
  const runBy = (r: (typeof found)[number]) => !values.by || r.provider?.id === values.by;
  const ofGenre = (r: (typeof found)[number]) => !genres.length || (r.tour.genre !== null && genres.includes(r.tour.genre));
  const tally = (rs: typeof found, key: (r: (typeof found)[number]) => [string, string] | null) => {
    const m = new Map<string, { label: string; n: number }>();
    for (const r of rs) {
      const k = key(r);
      if (k) m.set(k[0], { label: k[1], n: (m.get(k[0])?.n ?? 0) + 1 });
    }
    return [...m].sort(([, a], [, b]) => a.label.localeCompare(b.label)).map(([value, v]) => ({ value, label: `${v.label} (${v.n})` }));
  };
  const parishOptions = tally(found.filter((r) => runBy(r) && ofGenre(r)), (r) => {
    const p = printParish(r.tour.parish);
    return p ? [p, p] : null;
  });
  const providerOptions = tally(found.filter((r) => inParish(r) && ofGenre(r)), (r) => (r.provider?.id ? [r.provider.id, r.provider.name] : null));
  const placed = found.filter((r) => inParish(r) && runBy(r));
  // The genre tiles count what the other choices leave; then the genre chosen.
  const counts = new Map<string, number>();
  for (const r of placed) if (r.tour.genre) counts.set(r.tour.genre, (counts.get(r.tour.genre) ?? 0) + 1);
  const rows = genres.length ? placed.filter(ofGenre) : placed;
  const dated = rows.filter((r) => UNIQUE.includes(r.tour.occurrence) || r.tour.highlight);
  const onDemand = rows.filter((r) => !UNIQUE.includes(r.tour.occurrence) && !r.tour.highlight);

  const card = ({ tour: t, provider }: (typeof rows)[number]) => (
    <ListingCard
      key={t.id}
      href={`/tours/${t.slug}`}
      title={t.title}
      when={UNIQUE.includes(t.occurrence) ? cardWhen(t.dates, t.occurrence, shownFrom) : 'Book any day'}
      location={cardLocation(t.meetingPoint, t.parish)}
      where={[provider?.name, t.duration].filter(Boolean).join(' · ')}
      price={printPrice(t.fromPricePence, t.toPricePence)}
      image={t.headerImage}
      genre={t.genre}
      summary={t.summary ?? t.guideCopy}
      highlight={t.highlight}
    />
  );

  return (
    <ViewFrame initial={view} className="mx-auto max-w-6xl px-4 py-10">
      <JsonLd data={itemList('Tours & experiences in Jersey', rows.map((r) => `${SITE}/tours/${r.tour.slug}`))} />
      <h1 className="mb-2 font-display text-3xl font-bold text-ink">Tours &amp; experiences</h1>
      <p className="mb-8 max-w-2xl text-harbour/70">Walks on the seabed at low tide, ghost walks, boat trips and workshops, with local guides.</p>
      <FilterPane
        active={active}
        results={rows.length}
        noun="tours"
        aside={<ViewToggle />}
        clear="/tours"
        chips={filterChips('/tours', values, (k, v) =>
          k === 'when' ? (range ? rangeLabel(range) : null) : k === 'by' ? (found.find((r) => r.provider?.id === v)?.provider?.name ?? null) : k === 'any' ? 'With any-day tours' : k === 'q' ? `“${v}”` : v,
        )}
      >
        <FilterBar
          action="/tours"
          today={today}
          values={values}
          selects={[
            { name: 'where', label: 'Where', options: parishOptions },
            { name: 'by', label: 'Run by', options: providerOptions },
          ]}
          toggle={{ name: 'any', label: 'Include tours you can book any day', hint: 'Boat trips, bike hire, activity centres and other experiences on demand' }}
          keep={['genre']}
        >
          <CategoryList action="/tours" values={values} counts={counts} of="tours" />
        </FilterBar>
      </FilterPane>
      {dated.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 border-b border-harbour/15 pb-2 font-display text-xl font-semibold text-ink">On these dates</h2>
          <div className={CARD_GRID}>{dated.map(card)}</div>
        </section>
      )}
      {onDemand.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 border-b border-harbour/15 pb-2 font-display text-xl font-semibold text-ink">Book any day</h2>
          <div className={CARD_GRID}>{onDemand.map(card)}</div>
        </section>
      )}
      {rows.length === 0 && (
        <p className="rounded-lg bg-white p-8 text-center text-harbour/70">Nothing matches. Try another month{values.any !== '1' && ', or include tours you can book any day'}.</p>
      )}
    </ViewFrame>
  );
}
