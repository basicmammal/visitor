import type { Proof } from '@/lib/db/schema';
import { deadlineText } from '@/lib/domain/proof';
import { webImage } from '@/lib/domain/images';
import { ProofEditor } from '@/components/proof-editor';
import { VenueEditor } from '@/components/venue-editor';

const SPACE: Record<string, string> = { full: 'a full page', 'three-quarters': '¾ page', half: '½ page', quarter: '¼ page' };
import { detailsOf, type ProofEntry, type ProofKey } from '@/lib/proofs';

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
  // What staff did with their last answer, said once, until they answer again.
  const notice =
    proof.status === 'accepted'
      ? `We have set your changes in your entry: this is how it now prints. You can still change it until ${deadlineText(proof.deadline)}.`
      : proof.status === 'declined'
        ? `We kept your entry as it was${proof.reviewNote ? `: ${proof.reviewNote}` : ''}. You can send changes again until ${deadlineText(proof.deadline)}.`
        : undefined;
  const details = entry.kind === 'venue' ? { ...detailsOf(entry.listing), ...(waiting ? (proof.proposedDetails ?? {}) : {}) } : undefined;
  const artwork = { plan: proof.artwork, files: proof.artworkFiles, due: proof.artworkDue ?? '' };
  // A venue: the one form for its listing, the guide's words ours, written from theirs.
  if (entry.kind === 'venue' && details)
    return (
      <VenueEditor
        listingId={entry.listing.id}
        proofKey={proofKey}
        name={entry.listing.name}
        venue={entry.venue}
        booked={`${SPACE[entry.venue.size] ?? entry.venue.size} in ${proof.edition}`}
        picture={image ? webImage(image, 900, 600) : ''}
        details={details}
        printCopy={entry.copy}
        artwork={artwork}
        deadline={deadlineText(proof.deadline)}
        notice={notice}
        answered={answered}
      />
    );
  return (
    <div className="space-y-4">
      <ProofEditor
        proofKey={proofKey}
        subject={entry.kind === 'venue' ? { kind: 'venue', venue: entry.venue } : { kind: 'event', event: entry.event }}
        copy={copy}
        picture={image ? webImage(image, 900, 600) : ''}
        answered={answered}
        deadline={deadlineText(proof.deadline)}
        artwork={{ plan: proof.artwork, files: proof.artworkFiles, due: proof.artworkDue ?? '' }}
        details={details}
        notice={notice}
      />
    </div>
  );
}
