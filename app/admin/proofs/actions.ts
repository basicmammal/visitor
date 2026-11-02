'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireStaff } from '@/lib/auth/session';
import { refreshSite } from '@/lib/refresh';
import { tidyCopy } from '@/lib/domain/proof';
import { acceptProof, declineProof, issueProofs, proofsWith, remindProofs, type SendResult } from '@/lib/proofs';

export type SendState = (SendResult & { error?: undefined }) | { error: string } | null;

const email = z.string().trim().toLowerCase().email();

/** Send proofs to those ticked, at the addresses in their rows, with the deadline given. */
export async function sendProofs(_: SendState, form: FormData): Promise<SendState> {
  const user = await requireStaff();
  const edition = String(form.get('edition') ?? '');
  const deadline = String(form.get('deadline') ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return { error: 'Set the artwork deadline first.' };
  const picks: { kind: 'venue' | 'event'; listingId: string; email: string }[] = [];
  const missing: string[] = [];
  for (const v of form.getAll('pick').map(String)) {
    const [kind, listingId] = v.split(':') as ['venue' | 'event', string];
    const address = email.safeParse(form.get(`email:${v}`));
    if (!address.success) {
      missing.push(String(form.get(`name:${v}`) ?? v));
      continue;
    }
    picks.push({ kind, listingId, email: address.data });
  }
  if (missing.length) return { error: `An email address is needed for ${missing.join(', ')}.` };
  if (!picks.length) return { error: 'Tick who to send proofs to.' };
  const result = await issueProofs(edition, deadline, picks, user.email);
  revalidatePath('/admin/proofs');
  return result;
}

export async function sendReminders(_: SendState, form: FormData): Promise<SendState> {
  await requireStaff();
  const result = await remindProofs(String(form.get('edition') ?? ''));
  revalidatePath('/admin/proofs');
  return result;
}

/** Take a client's changes, with the words as staff leave them in the box and their picture if ticked. */
export async function takeProof(form: FormData) {
  const user = await requireStaff();
  const id = z.string().uuid().parse(form.get('id'));
  const copy = form.has('copy') ? tidyCopy(String(form.get('copy'))) || null : null;
  // Their details as sent, those staff leave ticked.
  const [proof] = await proofsWith(id);
  const details = Object.fromEntries(Object.entries(proof?.proposedDetails ?? {}).filter(([k]) => form.get(`detail:${k}`) === 'on'));
  await acceptProof(id, copy, form.get('picture') === 'on', user.email, Object.keys(details).length ? details : null);
  refreshSite();
  revalidatePath('/admin/proofs');
}

export async function turnDownProof(form: FormData) {
  const user = await requireStaff();
  const id = z.string().uuid().parse(form.get('id'));
  await declineProof(id, String(form.get('note') ?? '').trim() || null, user.email);
  revalidatePath('/admin/proofs');
}
