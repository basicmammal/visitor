import '@fontsource-variable/google-sans-flex/wdth.css';
import type { Metadata } from 'next';
import { and, eq, isNull } from 'drizzle-orm';
import { ProofPanel } from '@/components/proof-panel';
import { Wordmark } from '@/components/site/wordmark';
import { db } from '@/lib/db';
import { proofs } from '@/lib/db/schema';
import { deadlineText, linkWorks } from '@/lib/domain/proof';
import { proofByToken, proofEntry } from '@/lib/proofs';

export const dynamic = 'force-dynamic';
// The link is the key: it is not sent on to the picture hosts in a Referer.
export const metadata: Metadata = { title: 'Your entry in the guide', robots: { index: false, follow: false }, referrer: 'no-referrer' };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-stone-50 text-harbour">
      <header className="border-b border-harbour/10 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4"><Wordmark /></div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}

/**
 * A client's editorial proof, opened from the link in their email: no
 * sign-in, the link is the key. Their entry as this edition prints it,
 * to sign off or change.
 */
export default async function ProofPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ direct?: string }> }) {
  const { token } = await params;
  // Sent here because signing in could not be done: no point offering it again.
  const { direct } = await searchParams;
  const proof = await proofByToken(token);
  if (!proof || !linkWorks(proof.deadline))
    return (
      <Shell>
        <div className="mx-auto max-w-xl rounded-lg bg-white p-8 text-center ring-1 ring-harbour/10">
          <h1 className="font-display text-2xl font-semibold text-ink">This link has expired</h1>
          <p className="mt-2 text-harbour/75">Proof links work until a week after the artwork deadline. Reply to the email it came in and we will send you a fresh one.</p>
        </div>
      </Shell>
    );
  const entry = await proofEntry(proof);
  if (!entry)
    return (
      <Shell>
        <p className="mx-auto max-w-xl rounded-lg bg-white p-8 text-center ring-1 ring-harbour/10">This entry is no longer in the guide. Reply to the email it came in if that is a surprise.</p>
      </Shell>
    );

  // The first look is noted, for the list of who has seen theirs.
  if (!proof.openedAt) {
    await db.update(proofs).set({ openedAt: new Date(), status: proof.status === 'sent' ? 'opened' : proof.status }).where(and(eq(proofs.id, proof.id), isNull(proofs.openedAt)));
  }

  const name = entry.kind === 'venue' ? entry.listing.name : entry.listing.title;

  return (
    <Shell>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">{proof.edition} · editorial proof</p>
      <h1 className="mt-1 font-display text-3xl font-semibold text-ink">{name}</h1>
      <p className="mt-2 max-w-2xl text-harbour/75">
        Your listing for the {proof.edition} edition of the Visitor Guide, in print and online. Check your picture, details, opening times and words, tell us about your advert artwork, then approve it or send us your changes by {deadlineText(proof.deadline)}.
      </p>
      {!direct && (
        <p className="mt-4 max-w-2xl rounded-md bg-white px-4 py-3 text-sm ring-1 ring-harbour/10">
          Your online listing too: <a href={`/proof/${token}/enter`} className="font-semibold text-sea underline hover:text-brand">sign in to your listing</a> to change its details on the website, this entry and your artwork, all in one place. No password needed.
        </p>
      )}
      <div className="mt-8">
        <ProofPanel proof={proof} entry={entry} proofKey={{ token }} />
      </div>
    </Shell>
  );
}
