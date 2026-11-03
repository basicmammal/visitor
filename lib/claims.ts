import { and, asc, eq, gte, ilike, isNull, ne, or, sql } from 'drizzle-orm';
import { createInvite } from '@/lib/auth/accounts';
import { db } from '@/lib/db';
import { businesses, claims, events, experiences, places, users, type Claim, type ListingKind } from '@/lib/db/schema';
import { sendEmail } from '@/lib/email/send';
import { claimApprovedEmail, claimReceivedEmail, claimRejectedEmail, claimStaffEmail } from '@/lib/email/templates';
import { env } from '@/lib/env';
import { TABLES } from '@/lib/listings';

/**
 * Venues, organisers and tour operators saying "this one is ours", or
 * asking to list something new. Accounts stay invite only: a claim is a
 * request, and staff approving it is what gives the listing to a business
 * and makes the invite.
 */

export type ClaimInput = {
  kind: ListingKind | null;
  listingId: string | null;
  name: string;
  email: string;
  phone: string | null;
  businessName: string;
  relationship: string | null;
  message: string | null;
};

/** How many open requests one address may have at once. */
const OPEN_PER_EMAIL = 5;

export type Claimable = { kind: ListingKind; id: string; slug: string; title: string; businessId: string | null; where: string | null };

/** A public listing, as the claim form shows it. Null for one that is not on the site. */
export async function claimable(kind: ListingKind, slug: string): Promise<Claimable | null> {
  if (kind === 'venue') {
    const [p] = await db
      .select({ id: places.id, slug: places.slug, title: places.name, businessId: places.businessId, where: places.parish })
      .from(places)
      .where(and(eq(places.slug, slug), ne(places.inclusion, 'excluded'), eq(places.review, 'approved')));
    return p ? { kind, ...p } : null;
  }
  const t = kind === 'event' ? events : experiences;
  const [row] = await db
    .select({ id: t.id, slug: t.slug, title: t.title, businessId: t.businessId, where: kind === 'event' ? events.venueName : experiences.meetingPoint })
    .from(t)
    .where(and(eq(t.slug, slug), ne(t.inclusion, 'excluded'), eq(t.review, 'approved')));
  return row ? { kind, ...row } : null;
}

/** Listings by name, for "find yours". Venues, upcoming events and tours; a few of each. */
export async function searchClaimable(q: string): Promise<Claimable[]> {
  const like = `%${q.replace(/[%_]/g, '')}%`;
  if (q.trim().length < 2) return [];
  const today = new Date().toISOString().slice(0, 10);
  const [v, e, t] = await Promise.all([
    db
      .select({ id: places.id, slug: places.slug, title: places.name, businessId: places.businessId, where: places.parish })
      .from(places)
      .where(and(ilike(places.name, like), ne(places.inclusion, 'excluded'), eq(places.review, 'approved')))
      .orderBy(asc(places.name))
      .limit(8),
    db
      .select({ id: events.id, slug: events.slug, title: events.title, businessId: events.businessId, where: events.venueName })
      .from(events)
      .where(and(or(ilike(events.title, like), ilike(events.venueName, like)), ne(events.inclusion, 'excluded'), eq(events.review, 'approved'), gte(events.endsOn, today)))
      .orderBy(asc(events.startsOn))
      .limit(8),
    db
      .select({ id: experiences.id, slug: experiences.slug, title: experiences.title, businessId: experiences.businessId, where: experiences.meetingPoint })
      .from(experiences)
      .where(and(ilike(experiences.title, like), ne(experiences.inclusion, 'excluded'), eq(experiences.review, 'approved')))
      .orderBy(asc(experiences.title))
      .limit(8),
  ]);
  return [...v.map((r) => ({ kind: 'venue' as const, ...r })), ...e.map((r) => ({ kind: 'event' as const, ...r })), ...t.map((r) => ({ kind: 'experience' as const, ...r }))];
}

export async function submitClaim(input: ClaimInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  const open = await db.select({ kind: claims.kind, listingId: claims.listingId }).from(claims).where(and(eq(claims.email, email), eq(claims.status, 'pending')));
  // The same request twice is one request.
  if (open.some((c) => c.kind === input.kind && c.listingId === input.listingId)) return { ok: true };
  if (open.length >= OPEN_PER_EMAIL) return { ok: false, error: 'We already have several requests from you. We will be in touch about those first.' };
  await db.insert(claims).values({ ...input, email });

  // Staff hear of it; the person hears we have it. Neither holds up the reply.
  const listing = input.kind && input.listingId ? await listingTitle(input.kind, input.listingId) : null;
  await Promise.all([
    staffAddresses().then((to) =>
      sendEmail({ to, ...claimStaffEmail({ ...input, email, listing: listing && input.kind ? { kind: KIND_WORD[input.kind], title: listing } : null }) }),
    ),
    sendEmail({ to: email, ...claimReceivedEmail({ name: input.name, listingTitle: listing }) }),
  ]);
  return { ok: true };
}

const KIND_WORD: Record<ListingKind, string> = { venue: 'venue', event: 'event', experience: 'tour' };

async function listingTitle(kind: ListingKind, id: string): Promise<string | null> {
  const t = TABLES[kind];
  const [row] = (await db.select().from(t).where(eq(t.id, id))) as Record<string, unknown>[];
  return row ? String(row.name ?? row.title) : null;
}

/** Who hears about claims: STAFF_NOTIFY_EMAILS, else every staff account still switched on. */
export async function staffAddresses(): Promise<string[]> {
  const listed = env.STAFF_NOTIFY_EMAILS?.split(',').map((s) => s.trim()).filter(Boolean);
  if (listed?.length) return listed;
  const staff = await db.select({ email: users.email, role: users.role, disabledAt: users.disabledAt }).from(users);
  return staff.filter((u) => u.role !== 'provider' && !u.disabledAt).map((u) => u.email);
}

export type QueuedClaim = Claim & {
  listing: { title: string; slug: string; businessName: string | null } | null;
  account: { role: string; businessId: string | null; businessName: string | null } | null;
  suggestions: { id: string; name: string }[];
};

/** Open claims, oldest first, each with what it is for, whether the person already has an account, and businesses it might belong to. */
export async function claimQueue(): Promise<QueuedClaim[]> {
  const open = await db.select().from(claims).where(eq(claims.status, 'pending')).orderBy(asc(claims.createdAt));
  const allBusinesses = await db.select({ id: businesses.id, name: businesses.name, email: businesses.email }).from(businesses).orderBy(asc(businesses.name));
  const byId = new Map(allBusinesses.map((b) => [b.id, b.name]));
  return Promise.all(
    open.map(async (c) => {
      let listing: QueuedClaim['listing'] = null;
      if (c.kind && c.listingId) {
        const t = TABLES[c.kind];
        const [row] = (await db.select().from(t).where(eq(t.id, c.listingId))) as Record<string, unknown>[];
        if (row) listing = { title: String(row.name ?? row.title), slug: String(row.slug), businessName: row.businessId ? (byId.get(row.businessId as string) ?? null) : null };
      }
      const [u] = await db.select({ role: users.role, businessId: users.businessId }).from(users).where(eq(users.email, c.email));
      const account = u ? { ...u, businessName: u.businessId ? (byId.get(u.businessId) ?? null) : null } : null;
      const domain = c.email.split('@')[1] ?? '';
      const words = c.businessName.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
      const suggestions = allBusinesses
        .filter((b) => (b.email && domain && !/gmail|hotmail|outlook|yahoo|icloud|live\./.test(domain) && b.email.endsWith(`@${domain}`)) || words.some((w) => b.name.toLowerCase().includes(w)))
        .slice(0, 5)
        .map(({ id, name }) => ({ id, name }));
      return { ...c, listing, account, suggestions };
    }),
  );
}

export async function claimCount() {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(claims).where(eq(claims.status, 'pending'));
  return Number(row?.n ?? 0);
}

export type ApproveResult =
  | { ok: true; invite: { email: string; link: string } | null; emailed: boolean; businessName: string; listings: number }
  | { ok: false; error: string };

/**
 * Give the claimed listing to a business, an existing one or one made
 * here from the claim, and let the person in: an invite for someone
 * new, nothing more for someone already on that business's team. For a
 * venue, its upcoming events nobody else looks after can go with it.
 */
export async function approveClaim(input: { claimId: string; reviewer: string; businessId: string | null; withVenueEvents: boolean }): Promise<ApproveResult> {
  const [c] = await db.select().from(claims).where(eq(claims.id, input.claimId));
  if (!c || c.status !== 'pending') return { ok: false, error: 'That claim has already been dealt with.' };

  const [account] = await db.select().from(users).where(eq(users.email, c.email));
  if (account && account.role !== 'provider') return { ok: false, error: `${c.email} is staff here; give the listing to a business from People instead.` };
  if (account && input.businessId && account.businessId !== input.businessId) {
    const [theirs] = account.businessId ? await db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, account.businessId)) : [];
    return { ok: false, error: `${c.email} already looks after ${theirs?.name ?? 'another business'}. Choose that business, or ask them to use another address.` };
  }

  let businessId = input.businessId ?? account?.businessId ?? null;
  let businessName = '';
  let listings = 0;
  await db.transaction(async (tx) => {
    if (!businessId) {
      const [made] = await tx.insert(businesses).values({ name: c.businessName, email: c.email, phone: c.phone }).returning();
      businessId = made!.id;
      businessName = made!.name;
    } else {
      const [b] = await tx.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, businessId));
      businessName = b?.name ?? c.businessName;
    }
    if (c.kind && c.listingId) {
      const t = TABLES[c.kind];
      await tx.update(t).set({ businessId, updatedAt: new Date() } as never).where(eq(t.id, c.listingId));
      listings += 1;
      if (c.kind === 'venue' && input.withVenueEvents) {
        const today = new Date().toISOString().slice(0, 10);
        const moved = await tx
          .update(events)
          .set({ businessId, updatedAt: new Date() })
          .where(and(eq(events.placeId, c.listingId), isNull(events.businessId), gte(events.endsOn, today)))
          .returning({ id: events.id });
        listings += moved.length;
      }
    }
    await tx.update(claims).set({ status: 'approved', businessId, reviewedBy: input.reviewer, reviewedAt: new Date() }).where(eq(claims.id, c.id));
  });

  const title = c.kind && c.listingId ? await listingTitle(c.kind, c.listingId) : null;
  if (account) {
    const emailed = await sendEmail({ to: c.email, ...claimApprovedEmail({ name: c.name, businessName, listingTitle: title }) });
    return { ok: true, invite: null, emailed, businessName, listings };
  }
  const made = await createInvite({
    email: c.email,
    name: c.name,
    role: 'provider',
    businessId: businessId!,
    invitedBy: input.reviewer,
    reason: title ? `Your claim for ${title} is approved.` : 'Your request to list with Visitor is approved.',
  });
  if (!made.ok) return { ok: false, error: made.error };
  return { ok: true, invite: { email: made.email, link: made.link }, emailed: made.emailed, businessName, listings };
}

/** Turn a claim down. The note is ours; the person gets a kind email that does not quote it. */
export async function rejectClaim(claimId: string, reviewer: string, note: string | null): Promise<{ emailed: boolean }> {
  const [c] = await db
    .update(claims)
    .set({ status: 'rejected', reviewNote: note, reviewedBy: reviewer, reviewedAt: new Date() })
    .where(and(eq(claims.id, claimId), eq(claims.status, 'pending')))
    .returning();
  if (!c) return { emailed: false };
  const title = c.kind && c.listingId ? await listingTitle(c.kind, c.listingId) : null;
  return { emailed: await sendEmail({ to: c.email, ...claimRejectedEmail({ name: c.name, listingTitle: title }) }) };
}
