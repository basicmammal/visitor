'use client';

import { Check } from 'lucide-react';
import { useCallback, useState, useTransition } from 'react';
import { requestSpace } from '@/app/proof/actions';
import { GuidePreview, type PreviewSize } from '@/components/guide/proof-page';
import { keyFields } from '@/components/proof-artwork';
import { copyOptions, type GuideVenue } from '@/lib/domain/guide-entry';
import type { ProofKey } from '@/lib/proofs';

const SIZES: { size: PreviewSize; label: string; pitch: string }[] = [
  { size: 'sixteenth', label: '1/16 page', pitch: 'Free: every venue in the guide has one.' },
  { size: 'eighth', label: '1/8 page', pitch: 'Twice the room for your words.' },
  { size: 'quarter', label: '¼ page', pitch: 'Your picture beside your words.' },
  { size: 'half', label: '½ page', pitch: 'A picture above, and room to say more.' },
  { size: 'three-quarters', label: '¾ page', pitch: 'A large picture and a full description.' },
  { size: 'full', label: 'Full page', pitch: 'A page of your own: the big picture and your whole story.' },
];

const first = (t: string) => (t.replace(/\s+/g, ' ').trim().match(/^.*?[.!?](\s|$)/)?.[0] ?? t).trim();

/**
 * Every size a venue can have in the guide, each showing its own entry
 * set at that size from its words, with how much room it gives: the
 * listing box, free, then the bigger spaces, each with a way to ask for
 * it. The space they have is marked.
 */
export function SpaceOptions(props: {
  venue: GuideVenue;
  picture: string;
  /** Their words, as the website will have them: what a bigger space has room to print. */
  words: string;
  current: PreviewSize;
  editions: string[];
  listingId: string;
  proofKey?: ProofKey;
}) {
  const [room, setRoom] = useState<Partial<Record<PreviewSize, number>>>({});
  const [asking, setAsking] = useState<PreviewSize | null>(null);
  const [sent, setSent] = useState<PreviewSize[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const onRoom = useCallback((size: PreviewSize) => (n: number) => setRoom((r) => (r[size] === n ? r : { ...r, [size]: n })), []);

  const options = copyOptions({ guideCopy: null, summary: null, description: props.words });
  const ask = (size: PreviewSize, form: FormData) =>
    start(async () => {
      setError(null);
      form.set('size', size);
      form.set('listingId', props.listingId);
      if (props.proofKey) keyFields(form, props.proofKey);
      const r = await requestSpace(form);
      if (r.ok) {
        setSent((s) => [...s, size]);
        setAsking(null);
      } else setError(r.error);
    });

  return (
    <section className="border-t border-harbour/10 pt-8">
      <h2 className="font-display text-2xl font-semibold text-ink">Your space in the guide</h2>
      <p className="mt-1 max-w-2xl text-sm text-harbour/65">Your entry at every size, set from your words. The more room, the more of your story the guide prints, with your picture from a quarter page up.</p>
      <div className="mt-6 flex snap-x gap-5 overflow-x-auto pb-4">
        {SIZES.map(({ size, label, pitch }) => {
          const yours = size === props.current;
          const v = { ...props.venue, copy: size === 'sixteenth' ? first(props.words) : (options[0] ?? ''), options: size === 'sixteenth' ? [first(props.words)] : options };
          return (
            <article key={size} className={`flex w-56 shrink-0 snap-start flex-col rounded-lg bg-white p-3 ring-1 ${yours ? 'ring-2 ring-sea' : 'ring-harbour/10'}`}>
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold text-ink">{label}</h3>
                {yours ? <span className="rounded-full bg-sea px-2 py-0.5 text-xs font-medium text-white">Yours</span> : size === 'sixteenth' ? <span className="text-xs font-semibold text-sea">Free</span> : null}
              </div>
              <div className="mt-2 overflow-hidden rounded ring-1 ring-harbour/10" style={{ zoom: 0.5 }}>
                <GuidePreview venue={v} picture={props.picture} sample={props.words} onCapacity={onRoom(size)} as={size} />
              </div>
              <p className="mt-2 text-xs text-harbour/70">{pitch}</p>
              {room[size] !== undefined && <p className="mt-1 text-xs text-harbour/55">About {room[size]} characters of your words</p>}
              <div className="mt-auto pt-3">
                {size === 'sixteenth' || yours ? null : sent.includes(size) ? (
                  <p className="flex items-center gap-1 text-sm text-sea"><Check className="h-4 w-4" aria-hidden="true" /> Asked: we will be in touch</p>
                ) : asking === size ? (
                  <form action={(f) => ask(size, f)} className="space-y-2 text-sm">
                    <label className="block">
                      <span className="text-xs text-harbour/65">Which edition</span>
                      <select name="edition" className="mt-0.5 w-full rounded border border-harbour/20 px-2 py-1">
                        {props.editions.map((e) => <option key={e}>{e}</option>)}
                      </select>
                    </label>
                    <textarea name="note" rows={2} placeholder="Anything we should know (optional)" className="w-full rounded border border-harbour/20 px-2 py-1" />
                    <div className="flex items-center gap-2">
                      <button type="submit" disabled={pending} className="rounded-full bg-harbour px-3 py-1.5 text-xs font-semibold text-white hover:bg-sea disabled:opacity-60">{pending ? 'Sending…' : 'Send'}</button>
                      <button type="button" onClick={() => setAsking(null)} className="text-xs text-harbour/60 hover:text-brand">Cancel</button>
                    </div>
                  </form>
                ) : (
                  <button type="button" onClick={() => setAsking(size)} className="w-full rounded-full bg-harbour px-3 py-2 text-sm font-semibold text-white hover:bg-sea">
                    Ask about this space
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <p className="text-xs text-harbour/55">Asking commits you to nothing: we will send you the price and the deadline for the edition.</p>
    </section>
  );
}
