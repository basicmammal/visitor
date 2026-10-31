import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { ViewFrame, ViewToggle } from '@/components/site/view-switch';
import { CARD_GRID, asView } from '@/lib/view';
import { alternates } from '@/lib/agents/data';
import { CategoryList } from '@/components/site/category-list';
import { FilterPane } from '@/components/site/filter-pane';
import { jerseyToday, rangeLabel, resolveWhen } from '@/lib/domain/when';
import { filterChips } from '@/lib/domain/filter-chips';
import { KindPills } from '@/components/site/event-landing';
import { FilterBar, monthHeading } from '@/components/site/filter-bar';
import { publicEventMonths, publicEvents } from '@/lib/db/public';
import { EventCard, MonthNav } from '@/components/site/event-card';
import { addMonths, monthPath, monthRange, monthTitle } from '@/lib/domain/months';
import Link from 'next/link';
import { Fragment } from 'react';
import { many, one, type SearchParams } from '@/lib/params';
import { JsonLd } from '@/components/site/json-ld';
import { SITE } from '@/lib/agents/data';
import { itemList } from '@/lib/agents/schema-org';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: "What's on", description: 'Events in Jersey: festivals, concerts, markets, shows and more.', alternates: alternates('/whats-on') };

function group<T>(items: T[], key: (t: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const i of items) m.set(key(i), [...(m.get(key(i)) ?? []), i]);
  return [...m.entries()];
}

/**
 * What's on. One-off and dated events by default; exhibitions, daily
 * attractions and weekly sessions come in when the visitor ticks for them.
 */
export default async function WhatsOn({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const view = asView((await cookies()).get('view')?.value);
  const today = jerseyToday();
  const asked = { when: one(sp.when), from: one(sp.from), to: one(sp.to), month: one(sp.month) };
  const range = resolveWhen(asked, today);
  // Cards give each listing's first day in the range chosen, not its next day overall.
  const shownFrom = range && range.from > today ? range.from : today;
  // An old month link reads as its two dates, so the calendars show it and the tiles' links carry it on.
  const dates = range?.pick === 'dates' ? { from: range.from, to: range.to === '9999-12-31' ? undefined : range.to } : {};
  const values = { q: one(sp.q), when: range?.pick ?? (asked.when === 'dates' ? 'dates' : undefined), ...dates, venue: one(sp.venue), type: many(sp.type).join(',') || undefined, ongoing: one(sp.ongoing) };
  const kinds = many(values.type);
  // Each kind chosen counts on the Filters button, and the dates as one.
  const active = Object.entries(values).filter(([k, v]) => v && !['when', 'from', 'to', 'type'].includes(k)).length + (range ? 1 : 0) + many(values.type).length;
  // Narrowed a step at a time, each step counted for the choice that narrows it: the venues
  // from what the search finds, the kinds from what is on at the venue chosen.
  // Health listings are for people who live here: left out of the listing and the search until the visitor picks Health & wellbeing.
  // Unfiltered, What's on is the next two months, with a page for each month after: not every event to come on one page.
  const plain = !Object.values(sp).some((v) => v !== undefined && v !== '');
  const soon = { from: today, to: monthRange(addMonths(today.slice(0, 7), 1)).to };
  const months = await publicEventMonths();
  const found = (await publicEvents({ showOngoing: values.ongoing === '1', range: range ?? (plain ? soon : null), q: values.q })).map((r) => ({ ...r, event: { ...r.event, eventTypes: r.siteTypes } }));
  const venues = new Map<string, { name: string; n: number }>();
  for (const r of found) if (r.venue?.slug && !r.hidden) venues.set(r.venue.slug, { name: r.venue.name, n: (venues.get(r.venue.slug)?.n ?? 0) + 1 });
  const all = values.venue ? found.filter((r) => r.venue?.slug === values.venue) : found;
  const counts = new Map<string, number>();
  // A hidden health listing counts, and shows, only under Health & wellbeing.
  const HEALTH = 'Health & wellbeing';
  for (const r of all) for (const t of new Set(r.event.eventTypes)) if (!r.hidden || t === HEALTH) counts.set(t, (counts.get(t) ?? 0) + 1);
  const shown = all.filter((r) => !r.hidden);
  // Kinds chosen together mean any of them.
  const rows = kinds.length ? all.filter((r) => r.event.eventTypes.some((t) => kinds.includes(t) && (!r.hidden || t === HEALTH))) : shown;
  const venueOptions = [...venues]
    .sort(([, a], [, b]) => a.name.localeCompare(b.name))
    .map(([slug, v]) => ({ value: slug, label: `${v.name} (${v.n})` }));
  const highlights = rows.filter((r) => r.event.highlight);
  const rest = rows.filter((r) => !r.event.highlight);

  return (
    <ViewFrame initial={view} className="mx-auto max-w-6xl px-4 py-10">
      <JsonLd data={itemList('What’s on in Jersey', rows.map((r) => `${SITE}/whats-on/${r.event.slug}`))} />
      <h1 className="sr-only">What&apos;s on</h1>
      <KindPills />
      <FilterPane
        active={active}
        results={rows.length}
        noun="events"
        aside={<ViewToggle />}
        clear="/whats-on"
        chips={filterChips('/whats-on', values, (k, v) =>
          k === 'when' ? (range ? rangeLabel(range) : null) : k === 'venue' ? (venues.get(v)?.name ?? v) : k === 'ongoing' ? 'With ongoing events' : k === 'q' ? `“${v}”` : v,
        )}
      >
        <FilterBar
          action="/whats-on"
          today={today}
          values={values}
          selects={[{ name: 'venue', label: 'Venue', options: venueOptions }]}
          toggle={{ name: 'ongoing', label: 'Include ongoing events', hint: 'Exhibitions, attractions open every day and weekly sessions' }}
          keep={['type']}
        >
          <CategoryList action="/whats-on" values={values} counts={counts} />
        </FilterBar>
      </FilterPane>
      <MonthNav months={months} />

      {highlights.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-brand">Highlights</h2>
          <div className={`grid gap-6 ${highlights.length > 1 ? 'md:grid-cols-2' : ''}`}>{highlights.map((r) => <EventCard key={r.event.id} row={r} shownFrom={shownFrom} highlight wide={highlights.length === 1} />)}</div>
        </section>
      )}

      {rest.length === 0 && highlights.length === 0 && (
        <p className="rounded-lg bg-white p-8 text-center text-harbour/70">Nothing matches. Try another month{values.ongoing !== '1' && ', or include ongoing events'}.</p>
      )}

      {group(rest, (r) => r.next.slice(0, 7)).map(([month, items]) => (
        <section key={month} className="mb-12">
          <h2 className="mb-4 border-b border-harbour/15 pb-2 font-display text-xl font-semibold text-ink">
            <Link href={monthPath(month)} className="hover:text-brand">{monthHeading(month)}</Link>
          </h2>
          <div className={CARD_GRID}>{items.map((r) => <EventCard key={r.event.id} row={r} shownFrom={shownFrom} />)}</div>
        </section>
      ))}
      {plain && months.length > 2 && (
        <p className="text-sm text-harbour/70">
          Further ahead: {months.slice(2).map(({ ym }, i) => <Fragment key={ym}>{i > 0 && ' · '}<Link href={monthPath(ym)} className="underline hover:text-brand">{monthTitle(ym)}</Link></Fragment>)}
        </p>
      )}
    </ViewFrame>
  );
}
