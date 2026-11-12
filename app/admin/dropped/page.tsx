import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { experiences, listingDrops, places } from '@/lib/db/schema';
import { one, type SearchParams } from '@/lib/params';

export const dynamic = 'force-dynamic';

const day = (d: Date | null) => (d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Jersey' }) : '');

/** jersey.com's listing kinds, as the guide names them. */
const KIND: Record<string, string> = {
  'food-and-drink': 'Eat & drink',
  attractions: 'Attraction',
  activities: 'Activity',
  'shopping-and-markets': 'Shopping',
  accommodation: 'Stay',
  'points-of-interest': 'Place',
  'tour-operators': 'Tour operator',
  'tours-and-activities': 'Tour',
  events: 'Event',
};

/**
 * Every listing that has dropped off jersey.com, kept for good, newest
 * first: when the import first missed it, whether it came back, and where
 * it stands in the guide. Venues and tours by default; events, which drop
 * off once they are over, when asked.
 */
export default async function Dropped({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const withEvents = one(sp.events) === '1';
  const rows = await db
    .select({ d: listingDrops, place: { slug: places.slug, inclusion: places.inclusion, section: places.guideSection }, tour: { slug: experiences.slug, inclusion: experiences.inclusion } })
    .from(listingDrops)
    .leftJoin(places, eq(places.id, listingDrops.placeId))
    .leftJoin(experiences, eq(experiences.id, listingDrops.experienceId))
    .where(eq(listingDrops.source, 'visit_jersey'))
    .orderBy(desc(listingDrops.droppedAt));
  const shown = rows.filter((r) => withEvents || r.d.externalType !== 'events');
  const stillGone = shown.filter((r) => !r.d.returnedAt);
  const inGuide = stillGone.filter((r) => r.place?.inclusion === 'included' || r.tour?.inclusion === 'included');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">Dropped from jersey.com</h1>
          <p className="text-sm text-stone-500">
            Every listing jersey.com has stopped showing, from the daily import, kept for good. {stillGone.length} still gone
            {inGuide.length ? <>, <strong className="text-stone-900">{inGuide.length} of them still in the guide</strong>: check they are still trading</> : ''}.
          </p>
        </div>
        <Link href={withEvents ? '/admin/dropped' : '/admin/dropped?events=1'} className="text-sm text-stone-600 hover:underline">
          {withEvents ? 'Venues and tours only' : 'Show past events too'}
        </Link>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-stone-500">
          <tr><th className="py-1">Listing</th><th>Kind</th><th>Dropped</th><th>Back</th><th>In the guide</th></tr>
        </thead>
        <tbody className="divide-y divide-stone-200 bg-white">
          {shown.map(({ d, place, tour }) => {
            const inclusion = place?.inclusion ?? tour?.inclusion ?? null;
            const href = place?.slug ? `/admin/venues/${place.slug}` : tour?.slug ? `/admin/tours/${tour.slug}` : null;
            return (
              <tr key={d.id} className={d.returnedAt ? 'text-stone-400' : ''}>
                <td className="py-1.5 pr-3">
                  {href ? <Link href={href} className="font-medium hover:underline">{d.name}</Link> : <span className="font-medium">{d.name}</span>}
                  {d.link && <a href={d.link} className="ml-2 text-xs text-stone-400 hover:underline">jersey.com page</a>}
                </td>
                <td className="pr-3">{KIND[d.externalType] ?? d.externalType}</td>
                <td className="pr-3">{day(d.droppedAt)}</td>
                <td className="pr-3">{d.returnedAt ? day(d.returnedAt) : ''}</td>
                <td>
                  {inclusion === 'included' ? <span className="rounded bg-amber-100 px-1.5 text-xs font-medium text-amber-900">In the guide{place?.section ? ` · ${place.section}` : ''}</span> : inclusion ? <span className="text-xs text-stone-500">{inclusion}</span> : ''}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {shown.length === 0 && <p className="text-sm text-stone-500">Nothing has dropped off yet.</p>}
    </div>
  );
}
