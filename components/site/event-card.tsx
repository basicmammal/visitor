import Link from 'next/link';
import { ListingCard, cardLocation } from '@/components/site/listing-card';
import type { PublicEventRow } from '@/lib/db/public';
import { printPrice } from '@/lib/domain/house-style';
import { monthPath, monthTitle } from '@/lib/domain/months';
import { LANDING_TYPES, WEEKEND_PATH, typePath } from '@/lib/domain/landing';
import { UNIQUE } from '@/lib/domain/occurrence';
import { cardWhen } from '@/lib/domain/web-dates';

/** An event's card on What's on and its month pages: when (from `shownFrom` on), where, the price and its blurb. */
export function EventCard({ row: { event: e, venue }, shownFrom, highlight = false, wide = false }: { row: Pick<PublicEventRow, 'event' | 'venue'>; shownFrom: string; highlight?: boolean; wide?: boolean }) {
  return (
    <ListingCard
      href={`/whats-on/${e.slug}`}
      title={e.title}
      when={cardWhen(e.dates, e.occurrence, shownFrom)}
      location={cardLocation(e.venueName ?? venue?.name ?? e.venue, e.parish ?? venue?.parish)}
      price={printPrice(e.fromPricePence, e.toPricePence, { free: e.free })}
      image={e.headerImage}
      types={e.eventTypes}
      tag={UNIQUE.includes(e.occurrence) ? null : e.occurrence === 'regular' ? 'Regular' : 'Ongoing'}
      highlight={highlight}
      featured={highlight}
      wide={wide}
      summary={wide ? (e.guideCopy ?? e.summary) : (e.summary ?? e.guideCopy)}
    />
  );
}

/**
 * The ways into What's on that are pages of their own (the weekend, each
 * kind, each month), as a quiet block of links at the foot of the page:
 * the filters do the choosing, but crawlers and visitors who reach the end
 * still find every landing page.
 */
export function BrowseLinks({ months, current }: { months: { ym: string; n: number }[]; current?: string }) {
  const link = (href: string, label: string, n?: number) => (
    <li key={href}>
      <Link href={href} aria-current={href === current ? 'page' : undefined} className={href === current ? 'font-semibold text-ink' : 'text-harbour/75 hover:text-brand hover:underline'}>
        {label}
        {n !== undefined && <span className="text-harbour/45"> {n}</span>}
      </Link>
    </li>
  );
  const list = 'flex flex-wrap gap-x-4 gap-y-1.5 text-sm';
  const head = 'mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-harbour/55';
  return (
    <nav aria-label="Browse what's on" className="mt-16 grid gap-6 border-t border-harbour/15 pt-6 md:grid-cols-2">
      <div>
        <h2 className={head}>By kind</h2>
        <ul className={list}>{[link(WEEKEND_PATH, 'This weekend'), ...LANDING_TYPES.map((t) => link(typePath(t), t))]}</ul>
      </div>
      {months.length > 0 && (
        <div>
          <h2 className={head}>By month</h2>
          <ul className={list}>{months.map(({ ym, n }) => link(monthPath(ym), monthTitle(ym), n))}</ul>
        </div>
      )}
    </nav>
  );
}
