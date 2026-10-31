import Link from 'next/link';
import { EventCard, MonthNav } from '@/components/site/event-card';
import { JsonLd } from '@/components/site/json-ld';
import { ViewFrame, ViewToggle } from '@/components/site/view-switch';
import { SITE } from '@/lib/agents/data';
import { itemList } from '@/lib/agents/schema-org';
import type { PublicEventRow } from '@/lib/db/public';
import { LANDING_TYPES, WEEKEND_PATH, typePath } from '@/lib/domain/landing';
import { monthPath, monthTitle } from '@/lib/domain/months';
import { CARD_GRID } from '@/lib/view';

type Row = Pick<PublicEventRow, 'event' | 'venue'> & { next: string };

const dayHeading = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/** The weekend and each kind of event, as a row of links to their pages: the way into What's on by what, not by filter. */
export function KindPills({ current }: { current?: string }) {
  const pill = (href: string, label: string) => (
    <Link key={href} href={href} aria-current={current === href ? 'page' : undefined} className={`shrink-0 rounded-full px-3 py-1 text-sm ring-1 ${current === href ? 'bg-brand text-white ring-brand' : 'bg-white text-harbour ring-harbour/15 hover:text-brand'}`}>
      {label}
    </Link>
  );
  return (
    <nav aria-label="Kinds of event" className="mb-4 flex gap-2 overflow-x-auto pb-1">
      {pill(WEEKEND_PATH, 'This weekend')}
      {LANDING_TYPES.map((t) => pill(typePath(t), t))}
    </nav>
  );
}

/**
 * A What's on landing page: a kind of event, or the weekend. Its
 * highlights, then its events by month (each heading leading to that
 * month's page) or by day; the other kinds, the weekend and the months as
 * ways on. Built ahead, so nothing here reads a cookie or a query string.
 */
export function EventLanding(props: {
  title: string;
  intro: string;
  rows: Row[];
  shownFrom: string;
  by: 'month' | 'day';
  months: { ym: string; n: number }[];
  current?: string;
  empty: string;
}) {
  const highlights = props.rows.filter((r) => r.event.highlight);
  const rest = props.rows.filter((r) => !r.event.highlight);
  const groups = new Map<string, Row[]>();
  for (const r of rest) {
    const key = props.by === 'month' ? r.next.slice(0, 7) : r.next;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return (
    <ViewFrame className="mx-auto max-w-6xl px-4 py-10">
      <JsonLd data={itemList(`${props.title}, Jersey`, props.rows.map((r) => `${SITE}/whats-on/${r.event.slug}`))} />
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand"><Link href="/whats-on" className="hover:underline">What&apos;s on</Link></p>
          <h1 className="font-display text-3xl font-semibold text-ink">{props.title}</h1>
          <p className="mt-1 text-harbour/70">{props.intro}</p>
        </div>
        <ViewToggle className="hidden md:inline-flex" />
      </div>
      <KindPills current={props.current} />
      <MonthNav months={props.months} />

      {highlights.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-brand">Highlights</h2>
          <div className={`grid gap-6 ${highlights.length > 1 ? 'md:grid-cols-2' : ''}`}>
            {highlights.map((r) => <EventCard key={r.event.id} row={r} shownFrom={props.shownFrom} highlight wide={highlights.length === 1} />)}
          </div>
        </section>
      )}
      {props.rows.length === 0 && <p className="rounded-lg bg-white p-8 text-center text-harbour/70">{props.empty} <Link href="/whats-on" className="underline">See everything on soon</Link>.</p>}
      {[...groups].map(([key, items]) => (
        <section key={key} className="mb-12">
          <h2 className="mb-4 border-b border-harbour/15 pb-2 font-display text-xl font-semibold text-ink">
            {props.by === 'month' ? <Link href={monthPath(key)} className="hover:text-brand">{monthTitle(key)}</Link> : dayHeading(key)}
          </h2>
          <div className={CARD_GRID}>{items.map((r) => <EventCard key={r.event.id} row={r} shownFrom={props.shownFrom} />)}</div>
        </section>
      ))}
    </ViewFrame>
  );
}
