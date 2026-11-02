import type { Proof } from '@/lib/db/schema';
import { deadlineText } from '@/lib/domain/proof';
import { webImage } from '@/lib/domain/images';
import { ProofEditor } from '@/components/proof-editor';
import type { ProofEntry, ProofKey } from '@/lib/proofs';

/**
 * A proof to answer: the entry as the edition prints it, the words and
 * picture to change, and the advert artwork. Shown from the emailed link
 * and on the client's own listing page, the same either way. What they
 * sent last stands in the editor until staff deal with it; once dealt
 * with, the entry as it now is, still open to change until the proof
 * closes.
 */
export function ProofPanel({ proof, entry, proofKey }: { proof: Proof; entry: ProofEntry; proofKey: ProofKey }) {
  const waiting = proof.status === 'changes';
  const copy = waiting && proof.proposedCopy ? proof.proposedCopy : entry.copy;
  const image = (waiting && proof.proposedImage) || entry.image;
  const answered = proof.status === 'approved' || proof.status === 'changes' ? proof.status : null;
  return (
    <div className="space-y-4">
      {proof.status === 'accepted' && <p className="max-w-2xl rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-900">We have set your changes in your entry: this is how it now prints. You can still change it until {deadlineText(proof.deadline)}.</p>}
      {proof.status === 'declined' && (
        <p className="max-w-2xl rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
          We kept your entry as it was{proof.reviewNote ? `: ${proof.reviewNote}` : ''}. You can send changes again until {deadlineText(proof.deadline)}.
        </p>
      )}
      <ProofEditor
        proofKey={proofKey}
        subject={entry.kind === 'venue' ? { kind: 'venue', venue: entry.venue } : { kind: 'event', event: entry.event }}
        copy={copy}
        picture={image ? webImage(image, 900, 600) : ''}
        answered={answered}
        deadline={deadlineText(proof.deadline)}
        artwork={{ plan: proof.artwork, files: proof.artworkFiles, due: proof.artworkDue ?? '' }}
      />
    </div>
  );
}
