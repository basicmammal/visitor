import { hoursText, type WeekHours } from '@/lib/domain/opening';
import { openMonthsText } from '@/lib/domain/format';
import Link from 'next/link';
import type { EventDate, ListingKind } from '@/lib/db/schema';
import { requireStaff } from '@/lib/auth/session';
import { PROVIDER_FIELDS, datesText } from '@/lib/domain/listing-form';
import { KIND_LABEL, SOURCE_LABEL, reviewQueue, sourceOf, titleOf } from '@/lib/listings';
import { CATEGORY_LABEL } from '@/lib/params';
import { approveAllAction, reviewChangeAction, reviewListingAction } from './actions';

export const dynamic = 'force-dynamic';

const ADMIN_PATH: Record<ListingKind, string> = { venue: '/admin/venues', event: '/admin/whats-on', experience: '/admin/tours' };

const LABEL: Record<string, string> = {
  name: 'Name', title: 'Title', category: 'Type', addressLine1: 'Address', addressLine2: 'Address 2', parish: 'Parish', postcode: 'Postcode',
  ownWords: 'Their own words', guideCopy: 'Guide entry', openingHours: 'Opening hours', openMonths: 'Months open', headerImage: 'Picture', phone: 'Phone', email: 'Email', website: 'Website', summary: 'Summary', description: 'Description', placeId: 'Venue (theirs)',
  venueName: 'Venue', dates: 'Dates', fromPricePence: 'Price from', toPricePence: 'Price to', free: 'Free', duration: 'Duration', meetingPoint: 'Meeting point',
};

function show(field: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (field === 'dates') return datesText(v as EventDate[]) || '—';
  if (field.endsWith('PricePence')) return `£${((v as number) / 100).toFixed(2)}`;
  if (field === 'category') return CATEGORY_LABEL[v as keyof typeof CATEGORY_LABEL] ?? String(v);
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (field === 'openingHours') return hoursText(v as WeekHours) ?? '—';
  if (field === 'openMonths') return ((v as number[]).length && openMonthsText(v as number[])) || 'All year';
  if (field === 'headerImage') return (v as { url?: string }).url ?? '—';
  return String(v);
}

export default async function ReviewPage() {
  await requireStaff();
  const { listings, changes } = await reviewQueue();
  // Imported listings, by source, for approving in one go. A provider's are looked at one by one.
  const tally = new Map<string, { kind: ListingKind; source: string; n: number }>();
  for (const { kind, row, business } of listings) {
    const source = sourceOf(row);
    if (business || !source || source === 'provider') continue;
    const key = `${kind}:${source}`;
    tally.set(key, { kind, source, n: (tally.get(key)?.n ?? 0) + 1 });
  }
  const imported = [...tally.values()];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl">Review</h1>
        <p className="mt-1 text-sm text-stone-600">What providers have sent. Nothing here is on the site until approved. Approving puts a new listing on the site as undecided for the guide.</p>
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-xl">New listings <span className="text-stone-400">{listings.length}</span></h2>
        {!listings.length && <p className="text-sm text-stone-500">Nothing waiting.</p>}
        {imported.map(({ kind, source, n }) => (
          <form key={`${kind}:${source}`} action={approveAllAction} className="flex flex-wrap items-center gap-3 rounded border border-sky-200 bg-sky-50 p-3 text-sm">
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="source" value={source} />
            <span className="flex-1">
              {n} {KIND_LABEL[kind].toLowerCase()}s from {SOURCE_LABEL[source] ?? source} are waiting. Turn down any that aren’t for visitors, then approve the rest at once.
            </span>
            <button type="submit" className="rounded border border-emerald-600 bg-white px-3 py-1.5 text-emerald-700 hover:bg-emerald-50">Approve all {n}</button>
          </form>
        ))}
        {listings.map(({ kind, row, business }) => (
          <article key={row.id} className="rounded border border-stone-200 bg-white p-4">
            <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-medium">
                <span className="mr-2 rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-600">{KIND_LABEL[kind]}</span>
                <Link href={`${ADMIN_PATH[kind]}/${row.slug}`} className="hover:underline">{titleOf(row as never)}</Link>
              </h3>
              <span className="text-sm text-stone-500">
                {business ? <>{business.name} · sent by {String(row.editedBy ?? '')}</> : <>From {SOURCE_LABEL[sourceOf(row) ?? ''] ?? sourceOf(row) ?? 'an import'}</>}
                {typeof row.sourceLink === 'string' && <> · <a href={row.sourceLink} target="_blank" rel="noreferrer" className="underline">their page</a></>}
              </span>
            </header>
            <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1 text-sm">
              {PROVIDER_FIELDS[kind].filter((f) => !['name', 'title', 'placeId'].includes(f) && show(f, row[f]) !== '—').map((f) => (
                <div key={f} className="contents"><dt className="text-stone-500">{LABEL[f] ?? f}</dt><dd className="whitespace-pre-line break-words">{show(f, row[f])}</dd></div>
              ))}
            </dl>
            <Decide action={reviewListingAction} hidden={{ kind, id: row.id }} />
          </article>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl">Changes to live listings <span className="text-stone-400">{changes.length}</span></h2>
        {!changes.length && <p className="text-sm text-stone-500">Nothing waiting.</p>}
        {changes.map(({ change, business, listing }) => (
          <article key={change.id} className="rounded border border-stone-200 bg-white p-4">
            <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-medium">
                <span className="mr-2 rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-600">{KIND_LABEL[change.kind]}</span>
                {listing ? <Link href={`${ADMIN_PATH[change.kind]}/${String(listing.slug)}`} className="hover:underline">{titleOf(listing as never)}</Link> : 'Listing since removed'}
              </h3>
              <span className="text-sm text-stone-500">{business.name} · {change.submittedBy} · {change.updatedAt.toISOString().slice(0, 10)}</span>
            </header>
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-stone-500"><tr><th className="w-32 py-1 font-normal">Field</th><th className="py-1 font-normal">Now</th><th className="py-1 font-normal">Proposed</th></tr></thead>
              <tbody className="align-top">
                {Object.entries(change.changes).map(([f, v]) => (
                  <tr key={f} className="border-t border-stone-100">
                    <td className="py-1 pr-2 text-stone-500">{LABEL[f] ?? f}</td>
                    <td className="whitespace-pre-line break-words py-1 pr-2 text-stone-500 line-through decoration-stone-300">{show(f, listing?.[f])}</td>
                    <td className="whitespace-pre-line break-words py-1">{show(f, v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Decide action={reviewChangeAction} hidden={{ id: change.id }} />
          </article>
        ))}
      </section>
    </div>
  );
}

/** Approve, or turn down with a note the provider will see. */
function Decide({ action, hidden }: { action: (form: FormData) => Promise<void>; hidden: Record<string, string> }) {
  const fields = Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />);
  return (
    <div className="mt-4 flex flex-wrap items-start gap-3 border-t border-stone-100 pt-3">
      <form action={action}>
        {fields}
        <input type="hidden" name="decision" value="approved" />
        <button type="submit" className="rounded border border-emerald-600 px-3 py-1.5 text-sm text-emerald-700 hover:bg-emerald-50">Approve</button>
      </form>
      <form action={action} className="flex flex-1 flex-wrap gap-2">
        {fields}
        <input type="hidden" name="decision" value="rejected" />
        <input name="note" placeholder="Why not (they will see this)" maxLength={500} className="min-w-48 flex-1 rounded border border-stone-300 px-2 py-1.5 text-sm" />
        <button type="submit" className="rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100">Turn down</button>
      </form>
    </div>
  );
}
