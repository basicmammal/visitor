'use server';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { proofs, type Image } from '@/lib/db/schema';
import { linkWorks, replyChanges } from '@/lib/domain/proof';
import { storeListingImage } from '@/lib/images/upload';
import { proofByToken, proofEntry } from '@/lib/proofs';

export type ProofReply = { ok: true; status: 'approved' | 'changes' } | { ok: false; error: string };

/**
 * A client's answer to their proof, by its link alone: the same words and
 * picture sign it off; new words or a new picture wait for staff. They can
 * answer again until staff have dealt with it or the link runs out.
 */
export async function answerProof(form: FormData): Promise<ProofReply> {
  const proof = await proofByToken(String(form.get('token') ?? ''));
  if (!proof || !linkWorks(proof.deadline)) return { ok: false, error: 'This link has expired. Reply to the email it came in and we will help.' };
  if (proof.status === 'accepted' || proof.status === 'declined') return { ok: false, error: 'We have already put this entry to bed. Reply to the email if something needs to change.' };
  const entry = await proofEntry(proof);
  if (!entry) return { ok: false, error: 'This entry is no longer in the guide.' };

  const sent = String(form.get('copy') ?? '').slice(0, 6000);
  const note = String(form.get('note') ?? '').trim().slice(0, 2000) || null;
  const file = form.get('file');
  const picture = file instanceof File && file.size > 0 ? file : null;
  const changes = replyChanges(entry.copy, sent, !!picture);

  let image: Image | null = null;
  try {
    if (picture) image = { url: await storeListingImage(`proof-${proof.kind}`, proof.listingId, picture), publicId: null, alt: null, originalFilename: picture.name || null };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  // A note alone asks for something too: it waits for staff, not signed off.
  const changed = !!changes.copy || !!image || !!note;
  const now = new Date();
  await db
    .update(proofs)
    .set({
      status: changed ? 'changes' : 'approved',
      proposedCopy: changes.copy,
      proposedImage: image,
      note,
      repliedAt: now,
      updatedAt: now,
    })
    .where(eq(proofs.id, proof.id));
  return { ok: true, status: changed ? 'changes' : 'approved' };
}
