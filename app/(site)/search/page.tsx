import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { Building2, CalendarDays, Footprints, Sparkles } from 'lucide-react';
import { FilterBar } from '@/components/site/filter-bar';
import { FilterPane } from '@/components/site/filter-pane';
import { GENRE_MARKERS, MARKERS } from '@/components/site/category-markers';
import { ListingCard } from '@/components/site/listing-card';
import { TickList } from '@/components/site/tick-list';
import { ViewFrame, ViewToggle } from '@/components/site/view-switch';
import { KINDS, KIND_LABEL, asKinds, type Kind } from '@/lib/domain/search';
import { jerseyToday, resolveWhen } from '@/lib/domain/when';
import { filterChips } from '@/lib/domain/filter-chips';
import { many, one, type SearchParams } from '@/lib/params';
import { runSearch } from '@/lib/search';
import { CARD_GRID, asView } from '@/lib/view';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Search', description: 'Search events, tours, experiences and venues across Jersey.', robots: { index: false, follow: true } };

const KIND_ICON: Record<Kind, typeof CalendarDays> = { events: CalendarDays, tours: Footprints, experiences: Sparkles, venues: Building2 };
const KIND_OPTIONS = KINDS.map((k) => [k, KIND_LABEL[k], KIND_ICON[k]] as const);
/** Events' kinds, then tours' genres, each with its icon. */
const CATEGORY_OPTIONS = [...MARKERS, ...Object.entries(GENRE_MARKERS)].map(([c, Icon]) => [c, c, Icon] as const);
/** Each kind lists this many at most; past it, a word or some dates narrow it. */
const MAX = 60;

/**
 * The site search, in the same filter panel as What's on: the magnifying
 * glass in the header comes here, and on a phone the panel opens full
 * screen straight away, with the search box ready. When, what to show and
 * which categories narrow it, each counted, and the button underneath
 * shows the results as the site's cards, in the visitor's view. Every
 * choice is in the address, so a search can be shared.
 */
export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const view = asView((await cookies()).get('view')?.value);
  const today = jerseyToday();
  const asked = { when: one(sp.when), from: one(sp.from), to: one(sp.to) };
  const range = resolveWhen(asked, today);
  const dates = range?.pick === 'dates' ? { from: range.from, to: range.to === '9999-12-31' ? undefined : range.to } : {};
  const kinds = asKinds(many(sp.kind));
  const cats = many(sp.cat);
  const q = one(sp.q);
  const values = { q, when: range?.pick ?? (asked.when === 'dates' ? 'dates' : undefined), ...dates, kind: kinds.join(',') || undefined, cat: cats.join(',') || undefined };
  // Each kind and category chosen counts on the button, the dates as one.
  const active = (q ? 1 : 0) + (range ? 1 : 0) + kinds.length + cats.length;

  const answer = await runSearch({ q, kinds, when: asked.when, from: asked.from, to: asked.to, cats });
  const kindCounts = new Map<string, number>(KINDS.map((k) => [k, answer.counts[k]]));
  const groups = KINDS.map((k) => [k, answer.hits.filter((h) => h.kind === k)] as const).filter(([, hs]) => hs.length > 0);

  return (
    <ViewFrame initial={view} className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-6 font-display text-3xl font-bold text-ink">{answer.asked ? 'Found for you' : 'Find something to do'}</h1>

      <FilterPane
        title="Search"
        full
        startOpen={!answer.asked}
        active={active}
        results={answer.hits.length}
        noun="results"
        button={answer.asked ? undefined : 'Search'}
        aside={answer.asked ? <ViewToggle /> : undefined}
        clear="/search"
        chips={filterChips('/search', values, (k, v) =>
          k === 'when' ? (answer.range?.label ?? null) : k === 'kind' ? (KIND_LABEL[v as Kind] ?? null) : k === 'q' ? `“${v}”` : v,
        )}
      >
        <FilterBar action="/search" today={today} values={values} round={{ placeholder: 'Events, tours, places…' }} keep={['kind', 'cat']}>
          <TickList title="Show" action="/search" values={values} param="kind" options={KIND_OPTIONS} counts={kindCounts} />
          <TickList title="Categories" action="/search" values={values} param="cat" options={CATEGORY_OPTIONS} counts={answer.cats} />
        </FilterBar>
      </FilterPane>

      {!answer.asked && <p className="rounded-lg bg-white p-8 text-center text-harbour/70 ring-1 ring-harbour/5">Pick a day, what you’d like to do and the kinds of thing you enjoy, in the panel at the side.</p>}

      {answer.asked && answer.hits.length === 0 && (
        <p className="rounded-lg bg-white p-8 text-center text-harbour/70 ring-1 ring-harbour/5">
          Nothing matches.{' '}
          <Link href="/search" className="font-medium text-brand underline">
            Start again
          </Link>
        </p>
      )}

      {groups.map(([k, hits]) => (
        <section key={k} className="mb-12">
          <h2 className="mb-4 flex items-baseline justify-between border-b border-harbour/15 pb-2">
            <span className="font-display text-xl font-semibold text-ink">{KIND_LABEL[k]}</span>
            <span className="text-sm text-harbour/55">{hits.length}</span>
          </h2>
          <div className={CARD_GRID}>
            {hits.slice(0, MAX).map((h) => (
              <ListingCard key={h.id} href={h.href} title={h.title} when={h.when} location={h.location} where={h.where} price={h.price} image={h.image} types={h.types} genre={h.genre} tag={h.tag} highlight={h.highlight} summary={h.summary} />
            ))}
          </div>
          {hits.length > MAX && <p className="mt-4 text-center text-sm text-harbour/60">The first {MAX} of {hits.length}. Add a word or pick some dates to narrow them down.</p>}
        </section>
      ))}
    </ViewFrame>
  );
}
