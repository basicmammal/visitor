import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { businesses, events, places, users, type Proof, type User } from '@/lib/db/schema';
import { isStaff } from '@/lib/auth/roles';
import { isEmailListed } from '@/lib/auth/permissions';
import { env } from '@/lib/env';
import { KIND_PATH } from '@/lib/account-paths';

/**
 * The account a proof's link signs in to: the listing's owner, for the
 * address the proof went to. Made on first use when there is none: a
 * business named for the listing, and a provider account for the address,
 * who then owns the listing (their changes still come to staff to check).
 *
 * Never a staff account: a link in an email must not open the admin. And
 * not when the listing already belongs to another business: that person
 * may answer the proof by its page, but owning the listing is for staff
 * to decide. Null in either case.
 */
export async function proofAccount(proof: Pick<Proof, 'kind' | 'listingId' | 'email'>): Promise<{ user: User; path: string } | null> {
  const email = proof.email.trim().toLowerCase();
  // An address that becomes a superadmin on first sign-in is never made a client.
  if (isEmailListed(email, env.SUPERADMIN_EMAILS)) return null;
  const table = proof.kind === 'venue' ? places : events;
  const [listing] = await db.select({ id: table.id, slug: table.slug, businessId: table.businessId, name: proof.kind === 'venue' ? places.name : events.title }).from(table).where(eq(table.id, proof.listingId));
  if (!listing) return null;
  const path = `/account/${KIND_PATH[proof.kind]}/${listing.slug}`;

  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) {
    if (existing.disabledAt || isStaff(existing.role) || !existing.businessId) return null;
    if (listing.businessId && listing.businessId !== existing.businessId) return null;
    if (!listing.businessId) await db.update(table).set({ businessId: existing.businessId, updatedAt: new Date() }).where(eq(table.id, listing.id));
    return { user: existing, path };
  }

  let businessId = listing.businessId;
  if (!businessId) {
    const [made] = await db.insert(businesses).values({ name: listing.name, email }).returning({ id: businesses.id });
    businessId = made!.id;
    await db.update(table).set({ businessId, updatedAt: new Date() }).where(eq(table.id, listing.id));
  }
  const [user] = await db.insert(users).values({ email, role: 'provider', businessId, invitedBy: 'proof link' }).onConflictDoNothing().returning();
  if (!user) return null;
  return { user, path };
}
