import type { Metadata } from 'next';
import Link from 'next/link';
import { requireStaff } from '@/lib/auth/session';
import { claimCount } from '@/lib/claims';
import { reviewCount } from '@/lib/listings';

export const metadata: Metadata = { title: 'Visitor Guide admin', robots: { index: false } };

const NAV = [
  { href: '/admin/whats-on', label: "What's on" },
  { href: '/admin/tours', label: 'Tours' },
  { href: '/admin/venues', label: 'Venues' },
  { href: '/admin/pictures', label: 'Pictures' },
  { href: '/admin/guide', label: 'Guide' },
  { href: '/admin/proofs', label: 'Proofs' },
  { href: '/admin/do', label: 'Do' },
  { href: '/admin/map', label: 'Map' },
  { href: '/admin/people', label: 'People' },
];

/** The editing side, for staff. Middleware keeps it behind sign-in; this keeps providers out. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const [waiting, claimed] = await Promise.all([reviewCount(), claimCount()]);
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="no-print border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/admin" className="font-display text-lg font-semibold">Visitor Guide</Link>
          {user && (
            <>
              <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <Link href="/admin/review" className="text-stone-600 hover:text-stone-900">
                  Review{waiting > 0 && <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-xs font-medium text-amber-800">{waiting}</span>}
                </Link>
                <Link href="/admin/claims" className="text-stone-600 hover:text-stone-900">
                  Claims{claimed > 0 && <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-xs font-medium text-amber-800">{claimed}</span>}
                </Link>
                {NAV.map((n) => (
                  <Link key={n.href} href={n.href} className="text-stone-600 hover:text-stone-900">{n.label}</Link>
                ))}
                <Link href="/" className="text-stone-400 hover:text-stone-900">Public site ↗</Link>
              </nav>
              <form action="/logout" method="post" className="ml-auto flex items-center gap-3 text-sm text-stone-500">
                <Link href="/account/password" className="hidden hover:text-stone-900 sm:inline">{user.email}</Link>
                <button type="submit" className="hover:text-stone-900 hover:underline">Sign out</button>
              </form>
            </>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
