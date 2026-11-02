'use client';

import { useActionState, useRef, useState } from 'react';
import { sendProofs, sendReminders, type SendState } from '@/app/admin/proofs/actions';

function Result({ state }: { state: SendState }) {
  if (!state) return null;
  if ('error' in state && state.error) return <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>;
  const r = state as Exclude<SendState, null | { error: string }>;
  return (
    <div className="space-y-2 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
      {r.sent > 0 && <p>Sent {r.sent} email{r.sent === 1 ? '' : 's'}.</p>}
      {r.failed.length > 0 && <p className="text-red-800">Could not send to {r.failed.join(', ')}: try again, or copy their link from a fresh send.</p>}
      {r.links.length > 0 && (
        <>
          <p>The site cannot send email here, so pass these links on yourself. Each is shown once:</p>
          <ul className="space-y-1">
            {r.links.map((l) => (
              <li key={l.link}>
                <b>{l.name}</b> ({l.email}): <input readOnly value={l.link} onFocus={(e) => e.target.select()} className="w-full rounded border border-emerald-200 bg-white px-2 py-1 font-mono text-xs" />
              </li>
            ))}
          </ul>
        </>
      )}
      {r.sent === 0 && !r.failed.length && !r.links.length && <p>Nobody to send to.</p>}
    </div>
  );
}

/** The recipients' table as one form: tick, check the address, set the deadline, send. */
export function ProofSendForm({ edition, deadline, children }: { edition: string; deadline: string; children: React.ReactNode }) {
  const [state, action, pending] = useActionState(sendProofs, null);
  const form = useRef<HTMLFormElement>(null);
  const [ticked, setTicked] = useState(0);
  const boxes = () => [...(form.current?.querySelectorAll<HTMLInputElement>('input[name="pick"]') ?? [])];
  const count = () => setTicked(boxes().filter((b) => b.checked).length);
  const tickAll = (on: boolean) => {
    for (const b of boxes()) b.checked = on;
    count();
  };
  return (
    <form ref={form} action={action} onChange={count} className="space-y-4">
      <input type="hidden" name="edition" value={edition} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block font-medium">Artwork deadline</span>
          <input type="date" name="deadline" defaultValue={deadline} required className="mt-1 rounded border border-stone-300 px-2 py-1" />
        </label>
        <button type="submit" disabled={pending} className="rounded bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700 disabled:opacity-60">
          {pending ? 'Sending…' : ticked ? `Send ${ticked} proof${ticked === 1 ? '' : 's'}` : 'Send proofs to those ticked'}
        </button>
        <span className="flex gap-3 pb-2 text-sm">
          <button type="button" onClick={() => tickAll(true)} className="text-stone-600 underline hover:text-stone-900">Select all</button>
          <button type="button" onClick={() => tickAll(false)} className="text-stone-600 underline hover:text-stone-900">Unselect all</button>
        </span>
      </div>
      <Result state={state} />
      {children}
    </form>
  );
}

export function ProofRemindForm({ edition, waiting }: { edition: string; waiting: number }) {
  const [state, action, pending] = useActionState(sendReminders, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="edition" value={edition} />
      <button type="submit" disabled={pending || waiting === 0} className="rounded border border-stone-300 bg-white px-4 py-2 text-sm font-medium hover:bg-stone-100 disabled:opacity-50">
        {pending ? 'Sending…' : `Remind the ${waiting} who ${waiting === 1 ? 'has' : 'have'} not answered`}
      </button>
      <Result state={state} />
    </form>
  );
}
