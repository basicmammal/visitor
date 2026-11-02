import { and, eq, isNull } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';
import { recordSignIn, resolveAccount } from '@/lib/auth/accounts';
import { getSupabaseAdmin } from '@/lib/auth/supabase-admin';
import { getSupabaseServer } from '@/lib/auth/supabase-server';
import { db } from '@/lib/db';
import { proofs } from '@/lib/db/schema';
import { linkWorks } from '@/lib/domain/proof';
import { env } from '@/lib/env';
import { proofAccount } from '@/lib/proof-access';
import { proofByToken } from '@/lib/proofs';

export const dynamic = 'force-dynamic';

/**
 * The proof email's button: signs the client in to their own listings and
 * opens this one, where their online details, their print entry and their
 * advert artwork are all to hand. The link is the key, as an invite's is,
 * for as long as the proof is open. Where it cannot sign them in (a staff
 * address, a listing someone else owns, sign-in not set up), it opens the
 * proof on its own page instead, which needs no account.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  const proofPage = `${base}/proof/${token}?direct=1`;

  const proof = await proofByToken(token);
  if (!proof || !linkWorks(proof.deadline)) return NextResponse.redirect(`${base}/proof/${token}`);
  if (!proof.openedAt) await db.update(proofs).set({ openedAt: new Date(), status: proof.status === 'sent' ? 'opened' : proof.status }).where(and(eq(proofs.id, proof.id), isNull(proofs.openedAt)));

  const admin = getSupabaseAdmin();
  const account = admin ? await proofAccount(proof) : null;
  if (!admin || !account) return NextResponse.redirect(proofPage);

  try {
    // Their Supabase identity, confirmed: the address is the one we sent the proof to.
    const made = await admin.auth.admin.createUser({ email: account.user.email, email_confirm: true });
    if (made.error && !/already|registered|exists/i.test(made.error.message)) throw made.error;
    const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: account.user.email });
    if (link.error) throw link.error;
    const supabase = await getSupabaseServer();
    const { data, error } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: link.data.properties.hashed_token });
    if (error || !data.user) throw error ?? new Error('no user');
    const signedIn = await resolveAccount(data.user);
    if (!signedIn || signedIn.id !== account.user.id) {
      await supabase.auth.signOut();
      return NextResponse.redirect(proofPage);
    }
    await recordSignIn(signedIn);
    return NextResponse.redirect(`${base}${account.path}#print`);
  } catch (e) {
    console.error('proof sign-in', proof.id, (e as Error).message);
    return NextResponse.redirect(proofPage);
  }
}
