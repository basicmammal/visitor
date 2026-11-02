'use client';

import { CheckCircle2, ImagePlus, RotateCcw } from 'lucide-react';
import { useCallback, useMemo, useState, useTransition } from 'react';
import { answerProof, saveVenueDetails } from '@/app/proof/actions';
import { GuidePreview } from '@/components/guide/proof-page';
import { ProofArtwork, artworkFields, keyFields, type ArtworkAnswer } from '@/components/proof-artwork';
import { ProofDetails } from '@/components/proof-details';
import { webSized } from '@/components/site/staff-edit';
import { copyOptions, type GuideVenue } from '@/lib/domain/guide-entry';
import { printAddress, printWebsite } from '@/lib/domain/house-style';
import { openingText } from '@/lib/domain/opening';
import { cleanHours, cleanMonths, tidyCopy, type DetailsForm } from '@/lib/domain/proof';
import type { ProofKey } from '@/lib/proofs';

const input = 'mt-2 w-full rounded-md border border-harbour/20 p-3 text-[15px] leading-relaxed focus:border-sea focus:outline-none focus:ring-2 focus:ring-sea/30';

const firstSentence = (t: string) => (t.replace(/\s+/g, ' ').trim().match(/^.*?[.!?](\s|$)/)?.[0] ?? t).trim();

/**
 * A venue's one form: its picture, its details and opening times, and its
 * words on the website, in that order, with one button. Beneath it, how
 * it will look, as it changes: the card on the website, and the entry in
 * the guide, at the size booked, or the listing box every venue in the
 * guide gets. The guide's words are ours: written from theirs, cut to fit
 * by our editors, so the client writes once.
 *
 * With a proof open, it answers the proof (and asks for the advert's
 * artwork); otherwise it sends a change to the listing. Staff check both.
 */
export function VenueEditor(props: {
  listingId: string;
  /** The proof this answers, when one is open. */
  proofKey?: ProofKey;
  name: string;
  venue: GuideVenue;
  /** Which space it has, in words: "¾ page in Winter 2026", or null for a listing box. */
  booked: string | null;
  picture: string;
  details: DetailsForm;
  /** The printed words as they stand: sent back unchanged with a proof's answer. */
  printCopy: string;
  artwork?: ArtworkAnswer;
  deadline?: string;
  notice?: string;
  answered?: 'approved' | 'changes' | 'saved' | null;
}) {
  const [details, setDetails] = useState(props.details);
  const [picture, setPicture] = useState(props.picture);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [artwork, setArtwork] = useState<ArtworkAnswer | undefined>(props.artwork);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(props.answered ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [room, setRoom] = useState<number | null>(null);
  const onCapacity = useCallback((n: number) => setRoom((was) => (was === n ? was : n)), []);

  const description = details.description ?? '';
  const wordsChanged = tidyCopy(description) !== tidyCopy(props.details.description ?? '');
  const changed = JSON.stringify(details) !== JSON.stringify(props.details) || !!file;

  // The guide entry from what they have written: our words while theirs stand, their new words cut to whole sentences once they change.
  const venue = useMemo<GuideVenue>(() => {
    const address = [details.addressLine1, printAddress({ addressLine1: null, parish: details.parish, postcode: null })].filter(Boolean).join(', ');
    const fresh = wordsChanged ? copyOptions({ guideCopy: null, summary: null, description }) : null;
    const copy = fresh ? (props.venue.size === 'listing' ? firstSentence(description) : description) : props.venue.copy;
    return {
      ...props.venue,
      phone: details.phone ?? '',
      email: details.email ?? '',
      website: printWebsite(details.website) ?? '',
      address,
      opening: openingText(cleanHours(details.openingHours), cleanMonths(details.openMonths)) ?? '',
      copy,
      options: fresh ? (props.venue.size === 'listing' ? [firstSentence(description)] : fresh) : props.venue.options,
    };
  }, [props.venue, details, description, wordsChanged]);
  const summary = wordsChanged ? firstSentence(description) : (details.summary ?? '');

  const choose = async (f: File | undefined) => {
    if (!f) return;
    const scaled = await webSized(f);
    setFile(scaled);
    setPicture(URL.createObjectURL(scaled));
  };
  const reset = () => {
    setDetails(props.details);
    setPicture(props.picture);
    setFile(null);
  };
  const send = () =>
    start(async () => {
      setError(null);
      const form = new FormData();
      form.set('listingId', props.listingId);
      form.set('details', JSON.stringify(details));
      if (file) form.set('file', file);
      if (props.proofKey) {
        keyFields(form, props.proofKey);
        form.set('copy', props.printCopy);
        form.set('note', note);
        if (artwork) artworkFields(form, artwork);
        const r = await answerProof(form);
        if (r.ok) setDone(r.status);
        else setError(r.error);
      } else {
        const r = await saveVenueDetails(form);
        if (r.ok) setDone(r.status);
        else setError(r.error);
      }
    });

  if (done)
    return (
      <div className="mx-auto max-w-xl rounded-lg bg-white p-8 text-center shadow-sm ring-1 ring-harbour/10">
        <CheckCircle2 aria-hidden="true" className="mx-auto h-10 w-10 text-sea" />
        <h2 className="mt-3 font-display text-2xl font-semibold text-ink">{done === 'approved' ? 'Thank you: signed off' : 'Thank you: we have your changes'}</h2>
        <p className="mt-2 text-harbour/75">
          {done === 'approved' ? 'Your listing stays as you saw it.' : 'We will check them and set them on your listing, online and in the guide, where your words are cut to fit.'}
        </p>
        <button type="button" onClick={() => setDone(null)} className="mt-6 text-sm text-sea underline hover:text-brand">
          Look again or change something
        </button>
      </div>
    );

  return (
    <div className="space-y-10">
      {props.notice && <p className="max-w-2xl rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">{props.notice}</p>}

      <div className="max-w-2xl space-y-8">
        <div>
          <p className="font-semibold text-ink">Your picture</p>
          <p className="mt-0.5 text-sm text-harbour/65">A landscape photograph of the place itself works best: no logos or words over it, as they crop badly in print.</p>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {picture && <img src={picture} alt="" className="h-20 w-32 rounded object-cover" />}
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-ink ring-1 ring-harbour/20 hover:ring-sea">
              <ImagePlus aria-hidden="true" className="h-4 w-4" />
              {file ? 'Choose a different picture' : 'Choose a new picture'}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => void choose(e.target.files?.[0])} />
            </label>
          </div>
        </div>

        <ProofDetails value={details} onChange={setDetails} />

        <div>
          <label htmlFor="description" className="block font-semibold text-ink">About {props.name}</label>
          <p className="mt-0.5 text-sm text-harbour/65">Your words for the website. The guide prints a shorter version: our editors cut it from this to fit your space.</p>
          <textarea id="description" value={description} onChange={(e) => setDetails({ ...details, description: e.target.value })} rows={9} className={input} />
          <Count used={tidyCopy(description).length} room={room} space={props.booked ? `your ${props.booked.replace(/^(a |your )/, '')}` : 'your listing box'} />
        </div>

        {artwork && props.proofKey && (
          <div className="border-t border-harbour/10 pt-6">
            <ProofArtwork proofKey={props.proofKey} value={artwork} onChange={setArtwork} onBusy={setUploading} />
          </div>
        )}

        {props.proofKey && (
          <div>
            <label htmlFor="note" className="block font-semibold text-ink">A note for our editors <span className="font-normal text-harbour/55">(optional)</span></label>
            <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Anything else we should know" className={input} />
          </div>
        )}

        {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={send} disabled={pending || uploading || (!props.proofKey && !changed)} className="rounded-full bg-harbour px-6 py-3 font-semibold text-white hover:bg-sea disabled:opacity-50">
            {uploading ? 'Uploading artwork…' : pending ? 'Sending…' : changed || note.trim() ? 'Send my changes' : props.proofKey ? 'Approve my listing' : 'No changes yet'}
          </button>
          {changed && (
            <button type="button" onClick={reset} className="inline-flex items-center gap-1 text-sm text-harbour/65 hover:text-brand">
              <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" /> Start again
            </button>
          )}
        </div>
        {props.deadline && <p className="text-sm text-harbour/60">Please reply by {props.deadline}.</p>}
      </div>

      <section className="border-t border-harbour/10 pt-8">
        <h2 className="font-display text-2xl font-semibold text-ink">How it will look</h2>
        <p className="mt-1 text-sm text-harbour/65">As you change the form above.</p>
        <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,22rem)_auto]">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-harbour/60">On the website</p>
            <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-harbour/10">
              <div className="aspect-[3/2] bg-harbour/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {picture && <img src={picture} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="space-y-1 p-4">
                <p className="font-display text-lg font-semibold text-ink">{props.name}</p>
                {venue.address && <p className="text-xs text-harbour/60">{venue.address}</p>}
                {summary && <p className="text-sm text-harbour/80">{summary}</p>}
              </div>
            </div>
            <div className="mt-4 space-y-2 text-sm text-harbour/80">
              {tidyCopy(description).split(/\n{2,}/).filter(Boolean).slice(0, 3).map((p, i) => <p key={i}>{p}</p>)}
              {venue.opening && <p className="text-harbour/60">Open: {venue.opening}</p>}
            </div>
          </div>
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-harbour/60">In the guide{props.booked ? `: ${props.booked}` : ': your listing'}</p>
            <GuidePreview venue={venue} picture={picture} sample={description} onCapacity={onCapacity} />
            {!props.booked && <p className="mt-2 max-w-sm text-xs text-harbour/60">Every venue in the guide has a listing like this. Ask us about a bigger entry with a picture.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * Their words against the guide's space: how many characters they have
 * written, and about how many fit the frame they have. Past it the guide
 * prints a shorter version, cut at a sentence.
 */
function Count({ used, room, space }: { used: number; room: number | null; space: string }) {
  if (room === null) return <p className="mt-1 text-right text-xs text-harbour/55">{used} characters</p>;
  const over = used - room;
  const pct = Math.min(100, Math.round((used / Math.max(room, 1)) * 100));
  return (
    <div className="mt-1.5">
      <div className="h-1.5 overflow-hidden rounded bg-harbour/10" aria-hidden="true">
        <div className={`h-full transition-all ${over > 0 ? 'bg-red-600' : pct > 85 ? 'bg-amber-500' : 'bg-sea'}`} style={{ width: `${pct}%` }} />
      </div>
      <p className={`mt-1 text-right text-xs ${over > 0 ? 'font-medium text-red-700' : 'text-harbour/60'}`}>
        {used} characters · about {room} fit {space}
        {over > 0 && `: ${over} over, so the guide will print a shorter version`}
      </p>
    </div>
  );
}
