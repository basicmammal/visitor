'use server';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ARTWORK_PLANS, proofs, type ArtworkFile, type ArtworkPlan, type Image, type Proof } from '@/lib/db/schema';
import { allowedArtwork, artworkPath, artworkUploadUrl } from '@/lib/images/artwork';
import { detailsChanges, linkWorks, replyChanges } from '@/lib/domain/proof';
import { storeListingImage } from '@/lib/images/upload';
import { detailsOf, proofFor, proofEntry, type ProofKey } from '@/lib/proofs';

export type ProofReply = { ok: true; status: 'approved' | 'changes' } | { ok: false; error: string };

const keyOf = (form: FormData): ProofKey => ({ token: String(form.get('token') ?? '') || undefined, proofId: String(form.get('proofId') ?? '') || undefined });
const EXPIRED = 'This proof has closed. Reply to the email it came in and we will help.';

/**
 * A client's answer to their proof, by its link or signed in to their
 * listings: the same words and picture sign it off; new words or a new
 * picture wait for staff. They can answer again, even once staff have
 * dealt with an earlier answer, until the proof closes a week after the
 * deadline: a new answer goes back to staff.
 */
export async function answerProof(form: FormData): Promise<ProofReply> {
  const proof = await proofFor(keyOf(form));
  if (!proof || !linkWorks(proof.deadline)) return { ok: false, error: EXPIRED };
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

  // Their details, for a venue: only what they changed of what the listing has.
  let details = null;
  if (entry.kind === 'venue') {
    try {
      details = detailsChanges(detailsOf(entry.listing), JSON.parse(String(form.get('details') ?? '{}')));
    } catch {
      details = null;
    }
  }

  // A note alone asks for something too: it waits for staff, not signed off.
  const changed = !!changes.copy || !!image || !!note || !!details;
  const now = new Date();
  await db
    .update(proofs)
    .set({
      ...artworkFrom(form, proof),
      status: changed ? 'changes' : 'approved',
      proposedCopy: changes.copy,
      proposedImage: image,
      proposedDetails: details,
      note,
      repliedAt: now,
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
      updatedAt: now,
    })
    .where(eq(proofs.id, proof.id));
  return { ok: true, status: changed ? 'changes' : 'approved' };
}

/** What the form says of their advert: the plan, the files sent (only ever into this proof's own folder), and when what is coming will come. */
function artworkFrom(form: FormData, proof: Proof): { artwork: ArtworkPlan | null; artworkFiles: ArtworkFile[]; artworkDue: string | null } {
  const plan = String(form.get('artwork') ?? '');
  const artwork = (ARTWORK_PLANS as readonly string[]).includes(plan) ? (plan as ArtworkPlan) : null;
  let files: ArtworkFile[] = [];
  try {
    const raw = JSON.parse(String(form.get('artworkFiles') ?? '[]')) as unknown;
    if (Array.isArray(raw))
      files = raw
        .filter((f): f is ArtworkFile => !!f && typeof f.path === 'string' && typeof f.name === 'string' && typeof f.size === 'number' && f.path.startsWith(`proofs/${proof.id}/`))
        .slice(0, 20)
        .map((f) => ({ path: f.path, name: f.name.slice(0, 200), size: f.size }));
  } catch {
    files = [];
  }
  const due = String(form.get('artworkDue') ?? '');
  return {
    artwork: artwork === 'sent' && !files.length ? null : artwork,
    artworkFiles: artwork === 'sent' ? files : [],
    artworkDue: artwork === 'coming' && /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null,
  };
}

/** A one-time link for the browser to send one artwork file straight to storage. */
export async function startArtworkUpload(key: ProofKey, name: string, size: number): Promise<{ ok: true; path: string; url: string } | { ok: false; error: string }> {
  const proof = await proofFor(key);
  if (!proof || !linkWorks(proof.deadline)) return { ok: false, error: EXPIRED };
  if (!allowedArtwork(name, size)) return { ok: false, error: `${name}: send a PDF, JPEG, PNG, TIFF, EPS, AI, PSD, InDesign or zip file of up to 50 MB.` };
  try {
    const path = artworkPath(proof.id, name);
    return { ok: true, path, url: await artworkUploadUrl(path) };
  } catch (e) {
    console.error('artwork upload', proof.id, (e as Error).message);
    return { ok: false, error: `We could not start the upload of ${name}. Try again in a minute, or reply to our email with the artwork attached.` };
  }
}

/** Their advert alone, once their words are settled: new files, artwork on its way, or the same as before. */
export async function answerArtwork(form: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const proof = await proofFor(keyOf(form));
  if (!proof || !linkWorks(proof.deadline)) return { ok: false, error: EXPIRED };
  const now = new Date();
  await db.update(proofs).set({ ...artworkFrom(form, proof), repliedAt: now, updatedAt: now }).where(eq(proofs.id, proof.id));
  return { ok: true };
}
