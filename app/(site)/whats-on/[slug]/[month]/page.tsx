import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BrowseLinks, EventCard } from '@/components/site/event-card';
import { JsonLd } from '@/components/site/json-ld';
import { ViewFrame, ViewToggle } from '@/components/site/view-switch';
import { SITE } from '@/lib/agents/data';
import { itemList } from '@/lib/agents/schema-org';
import { publicEventMonths, publicEvents } from '@/lib/db/public';
import { jerseyToday } from '@/lib/domain/when';
import { addMonths, monthFromPath, monthPath, monthRange, monthTitle } from '@/lib/domain/months';
import { CARD_GRID } from '@/lib/view';

/**
 * What's on in a month: /whats-on/2026/november. Built ahead and drawn
 * afresh every ten minutes, so a visit, or a crawler's, costs nothing:
 * no cookie, no query string, nothing that makes one request unlike the
 * next. Unique events and highlights, as What's on shows by default.
 */
export const revalidate = 600;
// Each month is built the first time it is asked for, then kept and redrawn every ten minutes.
export async function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string; month: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, month } = await params;
  const ym = monthFromPath(slug, month);
  if (!ym) return {};
  return { title: `What's on in ${monthTitle(ym)}`, description: `Events in Jersey in ${monthTitle(ym)}: festivals, concerts, markets, shows and more.`, alternates: { canonical: monthPath(ym) } };
}

export default async function WhatsOnMonth({ params }: Props) {
  const { slug, month } = await params;
  const ym = monthFromPath(slug, month);
  const today = jerseyToday();
  // Months gone are gone; a year ahead is as far as the listings reach.
  if (!ym || ym < today.slice(0, 7) || ym > addMonths(today.slice(0, 7), 23)) notFound();
  const { from, to } = monthRange(ym);
  const shownFrom = from > today ? from : today;
  const [found, months] = await Promise.all([publicEvents({ range: { from: shownFrom, to } }), publicEventMonths()]);
  const rows = found.filter((r) => !r.hidden).map((r) => ({ ...r, event: { ...r.event, eventTypes: r.siteTypes } }));
  const highlights = rows.filter((r) => r.event.highlight);
  const rest = rows.filter((r) => !r.event.highlight);
  const prev = addMonths(ym, -1);
  const next = addMonths(ym, 1);

  return (
    <ViewFrame className="mx-auto max-w-6xl px-4 py-10">
      <JsonLd data={itemList(`What’s on in Jersey, ${monthTitle(ym)}`, rows.map((r) => `${SITE}/whats-on/${r.event.slug}`))} />
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold text-ink">What&apos;s on in {monthTitle(ym)}</h1>
        <div className="flex items-center gap-3 text-sm">
          {prev >= today.slice(0, 7) && <Link href={monthPath(prev)} className="text-harbour/70 hover:text-brand">← {monthTitle(prev)}</Link>}
          <Link href={monthPath(next)} className="text-harbour/70 hover:text-brand">{monthTitle(next)} →</Link>
          <ViewToggle className="hidden md:inline-flex" />
        </div>
      </div>

      {highlights.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-brand">Highlights</h2>
          <div className={`grid gap-6 ${highlights.length > 1 ? 'md:grid-cols-2' : ''}`}>
            {highlights.map((r) => <EventCard key={r.event.id} row={r} shownFrom={shownFrom} highlight wide={highlights.length === 1} />)}
          </div>
        </section>
      )}
      {rows.length === 0 ? (
        <p className="rounded-lg bg-white p-8 text-center text-harbour/70">Nothing listed for {monthTitle(ym)} yet. <Link href="/whats-on" className="underline">See what&apos;s on soon</Link>.</p>
      ) : (
        <div className={CARD_GRID}>{rest.map((r) => <EventCard key={r.event.id} row={r} shownFrom={shownFrom} />)}</div>
      )}
      <p className="mt-10 text-sm text-harbour/60">
        Looking for exhibitions, attractions and weekly sessions too? <Link href="/whats-on?ongoing=1" className="underline">Search everything on</Link>.
      </p>
      <BrowseLinks months={months} current={monthPath(ym)} />
    </ViewFrame>
  );
}
