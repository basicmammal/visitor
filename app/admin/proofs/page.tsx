import Link from 'next/link';
import { ProofRemindForm, ProofSendForm } from '@/components/admin/proof-send';
import { takeProof, turnDownProof } from './actions';
import type { Proof } from '@/lib/db/schema';
import { webImage } from '@/lib/domain/images';
import { deadlineText, linkWorks } from '@/lib/domain/proof';
import { emailEnabled } from '@/lib/email/send';
import { one, type SearchParams } from '@/lib/params';
import { proofEditions, proofEntry, proofRecipients, type Recipient } from '@/lib/proofs';

export const dynamic = 'force-dynamic';

const when = (d: Date | null) => (d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/Jersey' }) : null);

const STATUS: Record<Proof['status'], { label: string; tone: string }> = {
  sent: { label: 'Sent', tone: 'bg-stone-100 text-stone-700' },
  opened: { label: 'Opened', tone: 'bg-sky-100 text-sky-800' },
  approved: { label: 'Signed off', tone: 'bg-emerald-100 text-emerald-800' },
  changes: { label: 'Changes to review', tone: 'bg-amber-100 text-amber-900' },
  accepted: { label: 'Changes taken', tone: 'bg-emerald-100 text-emerald-800' },
  declined: { label: 'Changes turned down', tone: 'bg-stone-200 text-stone-700' },
};

function Status({ p }: { p: Proof | null }) {
  if (!p) return <span className="text-stone-400">Not sent</span>;
  const s = STATUS[p.status];
  const steps = [`sent ${when(p.sentAt)}`, p.remindedAt && `reminded ${when(p.remindedAt)}`, p.openedAt && `opened ${when(p.openedAt)}`, p.repliedAt && `answered ${when(p.repliedAt)}`].filter(Boolean);
  return (
    <span>
      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${s.tone}`}>{s.label}</span>
      <span className="ml-2 text-xs text-stone-500">{steps.join(' · ')}</span>
      {!linkWorks(p.deadline) && <span className="ml-2 text-xs text-red-700">link expired</span>}
    </span>
  );
}

const SIZE: Record<string, string> = { full: 'Full page', 'three-quarters': '¾ page', half: '½ page', quarter: '¼ page', highlight: 'Highlight page' };

/** A client's changes beside what the entry says now: take them (the words as left in the box), or turn them down. */
async function Review({ r }: { r: Recipient }) {
  const p = r.proof!;
  const entry = await proofEntry(p);
  const current = entry?.copy ?? '';
  return (
    <article className="rounded-lg border border-amber-200 bg-white p-4">
      <h3 className="font-semibold">{r.name} <span className="text-sm font-normal text-stone-500">· {SIZE[r.size] ?? r.size} · {p.email}</span></h3>
      {p.note && <p className="mt-2 rounded bg-amber-50 px-3 py-2 text-sm"><b>Their note:</b> {p.note}</p>}
      <form action={takeProof} className="mt-3 space-y-3">
        <input type="hidden" name="id" value={p.id} />
        {p.proposedCopy && (
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Now</p>
              <p className="mt-1 whitespace-pre-line text-sm text-stone-600">{current}</p>
            </div>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">Their words (edit before taking)</span>
              <textarea name="copy" defaultValue={p.proposedCopy} rows={8} className="mt-1 w-full rounded border border-stone-300 p-2 text-sm" />
            </label>
          </div>
        )}
        {p.proposedImage && (
          <div className="flex flex-wrap items-end gap-4">
            {entry?.image && (
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={webImage(entry.image, 240, 160)} alt="" className="h-24 w-36 rounded object-cover" />
                <figcaption className="text-xs text-stone-500">Now</figcaption>
              </figure>
            )}
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={webImage(p.proposedImage, 240, 160)} alt="" className="h-24 w-36 rounded object-cover ring-2 ring-amber-400" />
              <figcaption className="text-xs text-stone-500">Theirs</figcaption>
            </figure>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="picture" defaultChecked /> Use their picture</label>
          </div>
        )}
        <button type="submit" className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">Take these changes</button>
        <p className="text-xs text-stone-500">Sets them on the listing, for print and the website, locked so the import leaves them alone.</p>
      </form>
      <form action={turnDownProof} className="mt-3 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">
        <input type="hidden" name="id" value={p.id} />
        <input name="note" placeholder="Why (for us)" className="min-w-0 flex-1 rounded border border-stone-300 px-2 py-1 text-sm" />
        <button type="submit" className="rounded border border-stone-300 px-3 py-1 text-sm hover:bg-stone-100">Turn down</button>
      </form>
    </article>
  );
}

/**
 * Editorial proofs for an edition: who has booked space, what has gone to
 * them and what has come back. On the artwork deadline, send each their
 * entry by a link of their own; remind those who have not answered; take
 * or turn down the changes they send.
 */
export default async function Proofs({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const all = proofEditions();
  const edition = all.find((e) => e.name === one(sp.edition))?.name ?? all.find((e) => e.window.to >= today)!.name;
  const recipients = await proofRecipients(edition);
  const sent = recipients.filter((r) => r.proof);
  const waiting = sent.filter((r) => r.proof!.status === 'sent' || r.proof!.status === 'opened').length;
  const toReview = sent.filter((r) => r.proof!.status === 'changes');
  const deadline = sent[0]?.proof?.deadline ?? '';

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Editorial proofs</h1>
          <p className="text-sm text-stone-500">Clients with booked space, and highlighted events, check their entry by a link of their own and sign it off or send changes.</p>
        </div>
        <nav className="flex flex-wrap gap-2 text-sm">
          {all.filter((e) => e.window.to >= today).slice(0, 4).map((e) => (
            <Link key={e.name} href={`/admin/proofs?edition=${encodeURIComponent(e.name)}`} className={`rounded px-2 py-1 ${e.name === edition ? 'bg-stone-900 text-white' : 'bg-white ring-1 ring-stone-200 hover:bg-stone-100'}`}>{e.name}</Link>
          ))}
        </nav>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
        {[
          ['Owed a proof', recipients.length],
          ['Sent', sent.length],
          ['Waiting', waiting],
          ['Signed off', sent.filter((r) => r.proof!.status === 'approved' || r.proof!.status === 'accepted').length],
          ['To review', toReview.length],
        ].map(([k, v]) => (
          <div key={k} className="rounded bg-white p-3 ring-1 ring-stone-200"><dt className="text-stone-500">{k}</dt><dd className="text-xl font-semibold">{v}</dd></div>
        ))}
      </dl>

      {toReview.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Changes to review</h2>
          {toReview.map((r) => <Review key={r.proof!.id} r={r} />)}
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">{edition}</h2>
          {sent.length > 0 && <ProofRemindForm edition={edition} waiting={waiting} />}
        </div>
        {!emailEnabled() && <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">Email is not set up here: sending gives you each link to pass on yourself.</p>}
        {recipients.length === 0 ? (
          <p className="rounded bg-white p-6 text-sm text-stone-500 ring-1 ring-stone-200">Nobody has booked space in {edition} yet. Set a venue&apos;s space for the edition on its page.</p>
        ) : (
          <ProofSendForm edition={edition} deadline={deadline}>
            <div className="overflow-x-auto rounded bg-white ring-1 ring-stone-200">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
                  <tr><th className="p-2">Send</th><th className="p-2">Entry</th><th className="p-2">Space</th><th className="p-2">Email</th><th className="p-2">Where it stands</th></tr>
                </thead>
                <tbody>
                  {recipients.map((r) => {
                    const key = `${r.kind}:${r.listingId}`;
                    return (
                      <tr key={key} className="border-t border-stone-100 align-middle">
                        <td className="p-2"><input type="checkbox" name="pick" value={key} defaultChecked={false} aria-label={`Send to ${r.name}`} /></td>
                        <td className="p-2 font-medium">{r.name}<input type="hidden" name={`name:${key}`} value={r.name} /></td>
                        <td className="p-2 text-stone-600">{SIZE[r.size] ?? r.size}</td>
                        <td className="p-2"><input type="email" name={`email:${key}`} defaultValue={r.proof?.email ?? r.email ?? ''} placeholder="Add an email" className="w-56 rounded border border-stone-300 px-2 py-1" /></td>
                        <td className="p-2"><Status p={r.proof} />{r.proof && <span className="ml-2 text-xs text-stone-500">reply by {deadlineText(r.proof.deadline)}</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-stone-500">Nobody is ticked to start with: tick who to send to, or select all. Ticking someone already sent sends them a fresh link (their first one keeps working). Links work until a week after the deadline.</p>
          </ProofSendForm>
        )}
      </section>
    </div>
  );
}
