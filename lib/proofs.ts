import { randomBytes } from 'node:crypto';
import { and, eq, gte, lte, ne, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { events, places, proofs, type Event, type Image, type Place, type Proof } from '@/lib/db/schema';
import { hashToken } from '@/lib/auth/accounts';
import { env } from '@/lib/env';
import { guideEvent, guideVenue, type GuideEvent, type GuideVenue } from '@/lib/domain/guide-entry';
import { editions } from '@/lib/guide';
import { BOOKED, deadlineText, linkWorks } from '@/lib/domain/proof';
import { emailEnabled, sendEmail } from '@/lib/email/send';
import { proofEmail } from '@/lib/email/templates';

export { BOOKED, linkWorks };

/** The editions a proof can be for: this year's and next, by name ("Winter 2026"), with their dates. */
export function proofEditions(today = new Date()) {
  const y = today.getUTCFullYear();
  return [...editions(y), ...editions(y + 1)];
}

export const editionWindow = (name: string) => proofEditions().find((e) => e.name === name)?.window ?? null;

/** A fresh link's secret: only its hash is kept. */
export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export const proofLink = (token: string) => `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/proof/${token}`;

/** Someone who gets a proof: a venue with booked space in the edition, or a highlighted event on in it. */
export type Recipient = { kind: 'venue' | 'event'; listingId: string; name: string; email: string | null; size: string; proof: Proof | null };

/**
 * Everyone owed a proof for an edition, with the proof already made for
 * them, if any: venues in the guide with more than a listing or a
 * directory line booked for it, then highlighted events on in its dates.
 */
export async function proofRecipients(edition: string): Promise<Recipient[]> {
  const window = editionWindow(edition);
  const [venueRows, eventRows, made] = await Promise.all([
    db.select().from(places).where(and(eq(places.inclusion, 'included'), eq(places.review, 'approved'), sql`${places.spaceByEdition} ? ${edition}`)),
    window
      ? db.select().from(events).where(and(eq(events.highlight, true), ne(events.inclusion, 'excluded'), eq(events.review, 'approved'), lte(events.startsOn, window.to), gte(events.endsOn, window.from)))
      : Promise.resolve([] as Event[]),
    db.select().from(proofs).where(eq(proofs.edition, edition)),
  ]);
  const proofOf = (kind: string, id: string) => made.find((p) => p.kind === kind && p.listingId === id) ?? null;
  return [
    ...venueRows
      .filter((p) => (BOOKED as readonly string[]).includes(p.spaceByEdition[edition] ?? ''))
      .map((p): Recipient => ({ kind: 'venue', listingId: p.id, name: p.name, email: p.email, size: p.spaceByEdition[edition] ?? p.listingSize, proof: proofOf('venue', p.id) }))
      .sort((a, b) => BOOKED.indexOf(a.size as never) - BOOKED.indexOf(b.size as never) || a.name.localeCompare(b.name)),
    ...eventRows.map((e): Recipient => ({ kind: 'event', listingId: e.id, name: e.title, email: e.email, size: 'highlight', proof: proofOf('event', e.id) })).sort((a, b) => a.name.localeCompare(b.name)),
  ];
}

export async function proofByToken(token: string): Promise<Proof | null> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const h = hashToken(token);
  // This link, or one sent before a reminder replaced it.
  const [row] = await db.select().from(proofs).where(or(eq(proofs.tokenHash, h), sql`${h} = any(${proofs.formerTokenHashes})`));
  return row ?? null;
}

/** The entry as the edition prints it: a venue at the size booked, or an event's highlight page. */
export type ProofEntry =
  | { kind: 'venue'; venue: GuideVenue; listing: Place; copy: string; image: Image | null }
  | { kind: 'event'; event: GuideEvent; listing: Event; copy: string; image: Image | null };

export async function proofEntry(proof: Pick<Proof, 'kind' | 'listingId' | 'edition'>): Promise<ProofEntry | null> {
  if (proof.kind === 'venue') {
    const [p] = await db.select().from(places).where(eq(places.id, proof.listingId));
    if (!p) return null;
    const size = p.spaceByEdition[proof.edition] ?? p.listingSize;
    const venue = guideVenue({ ...p, listingSize: size });
    return { kind: 'venue', venue, listing: p, copy: venue.copy, image: p.headerImage };
  }
  const [row] = await db.select({ event: events, venue: places }).from(events).leftJoin(places, eq(places.id, events.placeId)).where(eq(events.id, proof.listingId));
  if (!row) return null;
  const event = guideEvent(row.event, row.venue, editionWindow(proof.edition) ?? undefined);
  if (!event) return null;
  return { kind: 'event', event, listing: row.event, copy: event.extendedCopy, image: row.event.headerImage };
}

/** What sending came to: how many went, and, when the site cannot send email, each link to pass on by hand. */
export type SendResult = { sent: number; failed: string[]; links: { name: string; email: string; link: string }[] };

async function deliver(r: { name: string; email: string; edition: string; deadline: string; token: string; reminder?: boolean }, out: SendResult) {
  const link = proofLink(r.token);
  if (!emailEnabled()) {
    out.links.push({ name: r.name, email: r.email, link });
    return;
  }
  const ok = await sendEmail({ to: r.email, ...proofEmail({ name: r.name, edition: r.edition, deadline: deadlineText(r.deadline), link, reminder: r.reminder }) });
  if (ok) out.sent += 1;
  else out.failed.push(r.name);
}

/**
 * Proofs for the recipients chosen, to the addresses given: a new proof
 * and link for each who has none; a fresh link to the same proof for one
 * sent again (the earlier link keeps working). The deadline is the
 * edition's, set as they go out.
 */
export async function issueProofs(edition: string, deadline: string, picks: { kind: 'venue' | 'event'; listingId: string; email: string }[], by: string): Promise<SendResult> {
  const out: SendResult = { sent: 0, failed: [], links: [] };
  const everyone = await proofRecipients(edition);
  for (const pick of picks) {
    const r = everyone.find((x) => x.kind === pick.kind && x.listingId === pick.listingId);
    if (!r) continue;
    const { token, hash } = newToken();
    const now = new Date();
    if (r.proof) {
      await db
        .update(proofs)
        .set({ email: pick.email, deadline, tokenHash: hash, formerTokenHashes: [...r.proof.formerTokenHashes, r.proof.tokenHash], sentBy: by, sentAt: now, updatedAt: now })
        .where(eq(proofs.id, r.proof.id));
    } else {
      await db.insert(proofs).values({ edition, kind: r.kind, listingId: r.listingId, email: pick.email, tokenHash: hash, deadline, sentBy: by });
    }
    await deliver({ name: r.name, email: pick.email, edition, deadline, token }, out);
  }
  return out;
}

/** A reminder to each who has not answered: a fresh link, the first still working. */
export async function remindProofs(edition: string): Promise<SendResult> {
  const out: SendResult = { sent: 0, failed: [], links: [] };
  const waiting = (await proofRecipients(edition)).filter((r) => r.proof && (r.proof.status === 'sent' || r.proof.status === 'opened'));
  for (const r of waiting) {
    const p = r.proof!;
    if (!linkWorks(p.deadline)) continue;
    const { token, hash } = newToken();
    const now = new Date();
    await db.update(proofs).set({ tokenHash: hash, formerTokenHashes: [...p.formerTokenHashes, p.tokenHash], remindedAt: now, updatedAt: now }).where(eq(proofs.id, p.id));
    await deliver({ name: r.name, email: p.email, edition, deadline: p.deadline, token, reminder: true }, out);
  }
  return out;
}

/**
 * Staff take a client's changes: their words (as staff may have trimmed
 * them) as the listing's guide copy, and their picture as its picture,
 * each locked so no import replaces them. Print and website both.
 */
export async function acceptProof(id: string, copy: string | null, usePicture: boolean, by: string) {
  const [p] = await db.select().from(proofs).where(eq(proofs.id, id));
  if (!p) return;
  const table = p.kind === 'venue' ? places : events;
  const [row] = await db.select({ locked: table.lockedFields }).from(table).where(eq(table.id, p.listingId));
  if (!row) return;
  const now = new Date();
  const set: Record<string, unknown> = {};
  const locked = new Set(row.locked);
  if (copy) {
    set.guideCopy = copy;
    locked.add('guideCopy');
  }
  if (usePicture && p.proposedImage) {
    set.headerImage = p.proposedImage;
    locked.add('headerImage');
  }
  if (Object.keys(set).length) {
    await db.update(table).set({ ...set, lockedFields: [...locked], editedBy: by, editedAt: now, updatedAt: now }).where(eq(table.id, p.listingId));
  }
  await db.update(proofs).set({ status: 'accepted', reviewedBy: by, reviewedAt: now, updatedAt: now }).where(eq(proofs.id, id));
}

export async function declineProof(id: string, note: string | null, by: string) {
  const now = new Date();
  await db.update(proofs).set({ status: 'declined', reviewNote: note, reviewedBy: by, reviewedAt: now, updatedAt: now }).where(eq(proofs.id, id));
}

