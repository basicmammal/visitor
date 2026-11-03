import Link from 'next/link';
import { and, desc, eq, gte, ne, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { places } from '@/lib/db/schema';
import { webImage } from '@/lib/domain/images';
import { one, type SearchParams } from '@/lib/params';
import { proofEditions } from '@/lib/proofs';
import { CATEGORY_LABEL } from '@/lib/params';
import { setNewIn } from './actions';

export const dynamic = 'force-dynamic';

const day = (d: Date | null) => (d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Jersey' }) : '');

/**
 * New this season: for an edition, the places new to the jersey.com feed
 * in the six months before it, newest first, to pick from. Being new to
 * the feed is not always being new (a beach or a town gets its first
 * listing too), so staff choose. The picks get a page in the guide and a
 * spread on the front page.
 */
export default async function NewThisSeason({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const all = proofEditions().filter((e) => e.window.to >= today);
  const ed = all.find((e) => e.name === one(sp.edition)) ?? all[0]!;
  const since = new Date(`${ed.window.from}T00:00:00Z`);
  since.setUTCMonth(since.getUTCMonth() - 6);
  const rows = await db
    .select()
    .from(places)
    .where(and(eq(places.review, 'approved'), ne(places.inclusion, 'excluded'), or(gte(places.firstListedAt, since), eq(places.newIn, ed.name))))
    .orderBy(desc(places.firstListedAt));
  const picked = rows.filter((p) => p.newIn === ed.name);
  const rest = rows.filter((p) => p.newIn !== ed.name);

  const Row = ({ p, on }: { p: (typeof rows)[number]; on: boolean }) => (
    <li className="flex items-center gap-3 p-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {p.headerImage ? <img src={webImage(p.headerImage, 160, 110)} alt="" className="h-14 w-20 shrink-0 rounded object-cover" /> : <span className="h-14 w-20 shrink-0 rounded bg-stone-100" />}
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          <Link href={`/admin/venues/${p.slug}`} className="hover:underline">{p.name}</Link>{' '}
          <span className="text-xs font-normal text-stone-500">{CATEGORY_LABEL[p.category]} · first listed {day(p.firstListedAt)}{p.newIn && p.newIn !== ed.name ? ` · new in ${p.newIn}` : ''}</span>
        </p>
        <p className="truncate text-sm text-stone-600">{p.summary ?? p.description ?? ''}</p>
      </div>
      <form action={setNewIn}>
        <input type="hidden" name="id" value={p.id} />
        <input type="hidden" name="edition" value={ed.name} />
        <input type="hidden" name="on" value={on ? '0' : '1'} />
        <button type="submit" className={`rounded px-3 py-1.5 text-sm ${on ? 'border border-stone-300 hover:bg-stone-100' : 'bg-stone-900 font-semibold text-white hover:bg-stone-700'}`}>{on ? 'Take out' : 'Feature'}</button>
      </form>
    </li>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">New this season</h1>
          <p className="text-sm text-stone-500">Places new to the jersey.com feed in the six months before the edition. Feature those that have really opened: they get a page in the guide and a spread on the front page.</p>
        </div>
        <nav className="flex flex-wrap gap-2 text-sm">
          {all.slice(0, 4).map((e) => (
            <Link key={e.name} href={`/admin/new?edition=${encodeURIComponent(e.name)}`} className={`rounded px-2 py-1 ${e.name === ed.name ? 'bg-stone-900 text-white' : 'bg-white ring-1 ring-stone-200 hover:bg-stone-100'}`}>{e.name}</Link>
          ))}
        </nav>
      </div>
      <section>
        <h2 className="mb-2 text-lg font-semibold">Featured in {ed.name} <span className="text-sm font-normal text-stone-500">{picked.length}</span></h2>
        {picked.length ? <ul className="divide-y divide-stone-100 rounded bg-white ring-1 ring-stone-200">{picked.map((p) => <Row key={p.id} p={p} on />)}</ul> : <p className="rounded bg-white p-4 text-sm text-stone-500 ring-1 ring-stone-200">None yet: feature some from the list below.</p>}
      </section>
      <section>
        <h2 className="mb-2 text-lg font-semibold">New to the feed since {day(since)} <span className="text-sm font-normal text-stone-500">{rest.length}</span></h2>
        <ul className="divide-y divide-stone-100 rounded bg-white ring-1 ring-stone-200">{rest.map((p) => <Row key={p.id} p={p} on={false} />)}</ul>
      </section>
    </div>
  );
}
