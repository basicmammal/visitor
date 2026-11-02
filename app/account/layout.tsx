import type { Metadata } from 'next';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { isStaff } from '@/lib/auth/roles';
import { requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { businesses, experiences, places } from '@/lib/db/schema';
import { AccountTabs } from '@/components/account/account-tabs';

export const metadata: Metadata = { title: 'Your listings · Visitor Guide', robots: { index: false } };

/** A provider's side: their business's listings and its team. Staff only come here for their password. */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [business] = user.businessId ? await db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, user.businessId)) : [];
  // A tab a part: their venue (straight to it when there is one), their events, their tours if they run any, the team.
  const [venues, tours] = user.businessId
    ? await Promise.all([
        db.select({ slug: places.slug }).from(places).where(eq(places.businessId, user.businessId)),
        db.select({ id: experiences.id }).from(experiences).where(eq(experiences.businessId, user.businessId)).limit(1),
      ])
    : [[], []];
  const tabs = isStaff(user.role)
    ? [{ href: '/admin', label: '← Admin', match: '/admin' }, { href: '/account/password', label: 'Password', match: '/account/password' }]
    : [
        venues.length === 1
          ? { href: `/account/venues/${venues[0]!.slug}`, label: 'Your venue', match: '/account/venues' }
          : { href: '/account/venues', label: venues.length ? 'Your venues' : 'Venues', match: '/account/venues' },
        { href: '/account/events', label: 'Events', match: '/account/events' },
        ...(tours.length ? [{ href: '/account/tours', label: 'Tours & experiences', match: '/account/tours' }] : []),
        { href: '/account/team', label: 'Team', match: '/account/team' },
        { href: '/account/password', label: 'Password', match: '/account/password' },
      ];
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href={isStaff(user.role) ? '/admin' : '/account'} className="font-display text-lg font-semibold">
            Visitor Guide{business && <span className="font-sans text-sm font-normal text-stone-500"> · {business.name}</span>}
          </Link>
          <AccountTabs tabs={tabs} />
          <form action="/logout" method="post" className="ml-auto flex items-center gap-3 text-sm text-stone-500">
            <span className="hidden sm:inline">{user.email}</span>
            <button type="submit" className="hover:text-stone-900 hover:underline">Sign out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
