import '@fontsource/barlow-semi-condensed/400.css';
import '@fontsource/barlow-semi-condensed/500.css';
import '@fontsource/barlow-semi-condensed/500-italic.css';
import '@fontsource/barlow-semi-condensed/600.css';
import '@fontsource/barlow-semi-condensed/700.css';
import Link from 'next/link';
import { ProofPanel } from '@/components/proof-panel';
import { openProofsFor, proofEntry } from '@/lib/proofs';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { requireProvider } from '@/lib/auth/session';
import { canEditListing } from '@/lib/auth/roles';
import { JERSEY_PARISHES, kindFromPath } from '@/lib/account-paths';
import { db } from '@/lib/db';
import type { Review } from '@/lib/db/schema';
import { TABLES, lastRejectedChange, openChange, titleOf } from '@/lib/listings';
import { ListingForm } from '@/components/account/listing-form';
import { formDefaults, formOptions } from '@/components/account/form-setup';
import { ReviewBadge } from '@/components/account/review-badge';

export const dynamic = 'force-dynamic';

const PUBLIC_PATH = { venue: null, event: '/whats-on', experience: '/tours' } as const;

export default async function EditListingPage({ params, searchParams }: { params: Promise<{ kind: string; slug: string }>; searchParams: Promise<{ created?: string; rewritten?: string }> }) {
  const { kind: segment, slug } = await params;
  const kind = kindFromPath(segment);
  if (!kind) notFound();
  const user = await requireProvider();
  const table = TABLES[kind];
  const [row] = (await db.select().from(table).where(eq(table.slug, slug))) as (Record<string, unknown> & { id: string; review: Review; reviewNote: string | null; businessId: string | null })[];
  // Somebody else's listing looks the same as no listing.
  if (!row || !canEditListing(user, row)) notFound();

  const [change, rejected, options] = await Promise.all([openChange(kind, row.id), lastRejectedChange(kind, row.id), formOptions(kind, user.businessId)]);
  // Edit the pending version, so a second edit builds on the first rather than losing it.
  const defaults = formDefaults(kind, { ...row, ...(change?.changes ?? {}) });
  const publicPath = PUBLIC_PATH[kind];
  // Its entry in a printed edition, while that edition's proof is open: beside the online details, to answer here.
  const proofs = kind === 'experience' ? [] : await openProofsFor(kind, row.id);
  const printed = (await Promise.all(proofs.map(async (p) => ({ p, entry: await proofEntry(p) })))).filter((x) => x.entry);
  const { created, rewritten } = await searchParams;

  return (
    <div className="space-y-4">
      <Link href="/account" className="text-sm text-stone-500 hover:underline">← Your listings</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="font-display text-3xl">{titleOf(row as never)}</h1>
        <div className="flex items-center gap-3">
          {kind !== 'venue' && (
            <Link href={`/account/${segment}/new?from=${encodeURIComponent(slug)}`} className="rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100">
              Copy as a new {kind === 'event' ? 'event' : 'tour'}
            </Link>
          )}
          <ReviewBadge review={row.review} changeWaiting={!!change} />
        </div>
      </div>

      {created && <Notice tone="ok">Sent. We will check it and it will appear once approved; until then you can keep editing it here.</Notice>}
      {created && rewritten && <Notice>We have put your description in the guide’s voice and written the one-line summary shown on listing cards. Check both below and change anything we got wrong.</Notice>}
      {row.review === 'pending' && !created && <Notice>We have not checked this yet. Edits save straight away.</Notice>}
      {row.review === 'rejected' && (
        <Notice tone="bad">
          We did not accept this listing{row.reviewNote ? <>: “{row.reviewNote}”</> : '.'} Change it and save to send it again.
        </Notice>
      )}
      {row.review === 'approved' && (
        <Notice>
          {change ? 'Your last change is waiting for us to check it; the live listing shows the version before it. ' : 'This listing is live. '}
          Changes you save here are checked before they appear.
          {publicPath && <> <Link href={`${publicPath}/${slug}`} className="underline">See it on the site</Link>.</>}
        </Notice>
      )}
      {row.review === 'approved' && !change && rejected && (
        <Notice tone="bad">We did not accept your last change{rejected.reviewNote ? <>: “{rejected.reviewNote}”</> : '.'}</Notice>
      )}

      {printed.map(({ p, entry }) => (
        <section key={p.id} id="print" className="scroll-mt-4 space-y-3 rounded-lg border border-stone-200 bg-stone-50 p-4">
          <div>
            <h2 className="font-display text-2xl">In the printed guide: {p.edition}</h2>
            <p className="text-sm text-stone-600">Your entry as it will print, and your advert artwork. Approve it or send changes; we check them before they go to print.</p>
          </div>
          <ProofPanel proof={p} entry={entry!} proofKey={{ proofId: p.id }} />
        </section>
      ))}

      {printed.length > 0 && (
        <div>
          <h2 className="font-display text-2xl">Online listing</h2>
          <p className="text-sm text-stone-600">How it appears on the website: its details, words and picture.</p>
        </div>
      )}
      <ListingForm
        kind={kind}
        id={row.id}
        defaults={defaults}
        options={options}
        parishes={JERSEY_PARISHES}
        submitLabel={row.review === 'approved' ? 'Send change for review' : 'Save'}
      />
    </div>
  );
}

function Notice({ tone, children }: { tone?: 'ok' | 'bad'; children: React.ReactNode }) {
  const style = tone === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : tone === 'bad' ? 'border-red-200 bg-red-50 text-red-800' : 'border-stone-200 bg-white text-stone-700';
  return <p className={`max-w-3xl rounded border px-3 py-2 text-sm ${style}`}>{children}</p>;
}
