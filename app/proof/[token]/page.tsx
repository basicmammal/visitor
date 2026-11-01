import '@fontsource/barlow-semi-condensed/400.css';
import '@fontsource/barlow-semi-condensed/500.css';
import '@fontsource/barlow-semi-condensed/500-italic.css';
import '@fontsource/barlow-semi-condensed/600.css';
import '@fontsource/barlow-semi-condensed/600-italic.css';
import '@fontsource/barlow-semi-condensed/700.css';
import type { Metadata } from 'next';
import { and, eq, isNull } from 'drizzle-orm';
import { ProofEditor } from '@/components/proof-editor';
import { Wordmark } from '@/components/site/wordmark';
import { db } from '@/lib/db';
import { proofs } from '@/lib/db/schema';
import { deadlineText, linkWorks } from '@/lib/domain/proof';
import { webImage } from '@/lib/domain/images';
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
export default async function ProofPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
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
  // What they sent last time, if staff have not yet dealt with it; else the entry as it stands.
  const copy = proof.status === 'changes' && proof.proposedCopy ? proof.proposedCopy : entry.copy;
  const image = (proof.status === 'changes' && proof.proposedImage) || entry.image;
  const picture = image ? webImage(image, 900, 600) : '';
  const answered = proof.status === 'approved' || proof.status === 'changes' ? proof.status : null;
  const done = proof.status === 'accepted' || proof.status === 'declined';

  return (
    <Shell>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">{proof.edition} · editorial proof</p>
      <h1 className="mt-1 font-display text-3xl font-semibold text-ink">{name}</h1>
      <p className="mt-2 max-w-2xl text-harbour/75">
        This is your entry as it will print in the {proof.edition} edition of the Visitor Guide. Check the words and picture, change anything that needs it, then approve it or send us your changes{done ? '' : ` by ${deadlineText(proof.deadline)}`}.
      </p>
      <div className="mt-8">
        {done ? (
          <p className="max-w-xl rounded-lg bg-white p-8 ring-1 ring-harbour/10">Our editors have set your entry for print. Reply to the email this came in if something still needs to change.</p>
        ) : (
          <ProofEditor
            token={token}
            subject={entry.kind === 'venue' ? { kind: 'venue', venue: entry.venue } : { kind: 'event', event: entry.event }}
            copy={copy}
            picture={picture}
            answered={answered}
            deadline={deadlineText(proof.deadline)}
          />
        )}
      </div>
    </Shell>
  );
}
