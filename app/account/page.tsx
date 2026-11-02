import { redirect } from 'next/navigation';
import { requireProvider } from '@/lib/auth/session';
import { businessListings } from '@/lib/listings';

export const dynamic = 'force-dynamic';

/** The client's admin opens on their venue: the one form, if they have one venue; else the list of them; else their events. */
export default async function AccountHome() {
  const user = await requireProvider();
  const { venues, events, experiences } = await businessListings(user.businessId);
  if (venues.length === 1) redirect(`/account/venues/${venues[0]!.row.slug}`);
  if (venues.length) redirect('/account/venues');
  if (experiences.length && !events.length) redirect('/account/tours');
  redirect('/account/events');
}
