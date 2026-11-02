import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq, inArray, ne, or, isNull } from 'drizzle-orm';
import { requireProvider } from '@/lib/auth/session';
import { KIND_PATH, kindFromPath } from '@/lib/account-paths';
import { db } from '@/lib/db';
import { events } from '@/lib/db/schema';
import { eventDatesText } from '@/lib/domain/format';
import { cardWhen, nextDate } from '@/lib/domain/web-dates';
import { jerseyToday } from '@/lib/domain/when';
import { businessListings } from '@/lib/listings';
import { ReviewBadge } from '@/components/account/review-badge';

export const dynamic = 'force-dynamic';

const TITLE = { venue: 'Your venues', event: 'Your events', experience: 'Your tours & experiences' } as const;
const ADD = { venue: 'Add a venue', event: 'Add an event', experience: 'Add a tour' } as const;
const INTRO = {
  venue: 'Each venue has one form: its picture, details, opening times and words, for the website and the guide.',
  event: 'Add what you have coming up that is not already listed. We check each one before it appears.',
  experience: 'Your tours and experiences. We check each one before it appears.',
} as const;

const host = (url: string | null) => {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, '') : null;
  } catch {
    return null;
  }
};

/**
 * A tab of the client's admin: their venues, their events, or their
 * tours, each with the way to add another. Events also show what is
 * already listed at their venues from elsewhere (ticket sites, jersey.com),
 * so they add only what is missing.
 */
export default async function KindPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind: segment } = await params;
  const kind = kindFromPath(segment);
  if (!kind) notFound();
  const user = await requireProvider();
  const mine = await businessListings(user.businessId);
  const today = jerseyToday();

  const rows =
    kind === 'venue'
      ? mine.venues.map(({ row, changeWaiting }) => ({ id: row.id, slug: row.slug, label: row.name, detail: row.parish, review: row.review, changeWaiting }))
      : kind === 'event'
        ? mine.events.map(({ row, changeWaiting }) => ({ id: row.id, slug: row.slug, label: row.title, detail: eventDatesText(row.dates), review: row.review, changeWaiting }))
        : mine.experiences.map(({ row, changeWaiting }) => ({ id: row.id, slug: row.slug, label: row.title, detail: row.duration, review: row.review, changeWaiting }));

  // What is on at their venues that came from elsewhere: listed already, nothing to add.
  const venueIds = mine.venues.map((v) => v.row.id);
  const elsewhere =
    kind === 'event' && venueIds.length
      ? (
          await db
            .select({ id: events.id, slug: events.slug, title: events.title, dates: events.dates, occurrence: events.occurrence, sourceLink: events.sourceLink })
            .from(events)
            .where(and(inArray(events.placeId, venueIds), ne(events.inclusion, 'excluded'), eq(events.review, 'approved'), or(isNull(events.businessId), ne(events.businessId, user.businessId))))
        )
          .map((e) => ({ ...e, when: cardWhen(e.dates, e.occurrence, today), next: nextDate(e.dates, today) ?? '9999' }))
          .filter((e) => e.when)
          .sort((a, b) => a.next.localeCompare(b.next))
      : [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">{TITLE[kind]}</h1>
          <p className="mt-1 max-w-2xl text-sm text-stone-600">{INTRO[kind]}</p>
        </div>
        <Link href={`/account/${KIND_PATH[kind]}/new`} className="rounded bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700">{ADD[kind]}</Link>
      </div>

      {rows.length ? (
        <ul className="divide-y divide-stone-200 rounded border border-stone-200 bg-white text-sm">
          {rows.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <Link href={`/account/${KIND_PATH[kind]}/${i.slug}`} className="font-medium hover:underline">{i.label}</Link>
                {i.detail && <div className="text-stone-500">{i.detail}</div>}
              </div>
              <ReviewBadge review={i.review} changeWaiting={i.changeWaiting} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded border border-dashed border-stone-300 p-4 text-sm text-stone-500">
          {kind === 'event' ? 'You have not added any events yet.' : 'None yet.'}
        </p>
      )}

      {kind === 'event' && elsewhere.length > 0 && (
        <section>
          <h2 className="font-display text-xl">Already listed at your venue</h2>
          <p className="mt-1 max-w-2xl text-sm text-stone-600">These reach us automatically from ticket sites and other listings, and are on the website already: there is no need to add them. If one is wrong, tell us.</p>
          <ul className="mt-3 divide-y divide-stone-200 rounded border border-stone-200 bg-white text-sm">
            {elsewhere.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <Link href={`/whats-on/${e.slug}`} className="font-medium hover:underline">{e.title}</Link>
                  <div className="text-stone-500">{e.when}</div>
                </div>
                {host(e.sourceLink) && <span className="text-xs text-stone-500">from {host(e.sourceLink)}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
