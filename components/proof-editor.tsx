'use client';

import { CheckCircle2, ImagePlus, RotateCcw } from 'lucide-react';
import { useCallback, useState, useTransition } from 'react';
import { answerProof } from '@/app/proof/actions';
import { ProofPage, type Fit, type ProofSubject } from '@/components/guide/proof-page';
import { webSized } from '@/components/site/staff-edit';
import { tidyCopy } from '@/lib/domain/proof';
import { ProofArtwork, artworkFields, keyFields, type ArtworkAnswer } from '@/components/proof-artwork';
import type { ProofKey } from '@/lib/proofs';

/**
 * The client's side of a proof: their entry as it will print, beside the
 * words to change and a picture to swap, the frame telling them as they
 * type whether it still fits. One button: it signs the entry off as it
 * is, or, once something has changed, sends the changes to us.
 */
export function ProofEditor(props: {
  proofKey: ProofKey;
  subject: ProofSubject;
  copy: string;
  picture: string;
  /** What they sent before, if they have answered already. */
  answered: 'approved' | 'changes' | null;
  deadline: string;
  artwork: ArtworkAnswer;
}) {
  const [copy, setCopy] = useState(props.copy);
  const [picture, setPicture] = useState(props.picture);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [fit, setFit] = useState<Fit>({ fits: true });
  const [done, setDone] = useState<'approved' | 'changes' | null>(props.answered);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [artwork, setArtwork] = useState<ArtworkAnswer>(props.artwork);
  const [uploading, setUploading] = useState(false);
  const onFit = useCallback((f: Fit) => setFit((was) => (was.fits === f.fits && (f.fits || (!was.fits && was.over === f.over)) ? was : f)), []);

  const changed = tidyCopy(copy) !== tidyCopy(props.copy) || !!file;
  const choose = async (f: File | undefined) => {
    if (!f) return;
    const scaled = await webSized(f);
    setFile(scaled);
    setPicture(URL.createObjectURL(scaled));
  };
  const reset = () => {
    setCopy(props.copy);
    setPicture(props.picture);
    setFile(null);
  };
  const send = () =>
    start(async () => {
      setError(null);
      const form = new FormData();
      keyFields(form, props.proofKey);
      form.set('copy', copy);
      form.set('note', note);
      if (file) form.set('file', file);
      artworkFields(form, artwork);
      const r = await answerProof(form);
      if (r.ok) setDone(r.status);
      else setError(r.error);
    });

  if (done)
    return (
      <div className="mx-auto max-w-xl rounded-lg bg-white p-8 text-center shadow-sm ring-1 ring-harbour/10">
        <CheckCircle2 aria-hidden="true" className="mx-auto h-10 w-10 text-sea" />
        <h2 className="mt-3 font-display text-2xl font-semibold text-ink">{done === 'approved' ? 'Thank you: signed off' : 'Thank you: we have your changes'}</h2>
        <p className="mt-2 text-harbour/75">
          {done === 'approved' ? 'Your entry will print as you saw it.' : 'Our editors will look over your changes and set them in your entry. We will be in touch if anything needs a word.'}
        </p>
        {artwork.plan && (
          <p className="mt-2 text-harbour/75">
            {artwork.plan === 'sent'
              ? `We have your artwork: ${artwork.files.map((f) => f.name).join(', ')}.`
              : artwork.plan === 'coming'
                ? `We’ll look out for your new artwork${artwork.due ? ` by ${new Date(`${artwork.due}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })}` : ''}.`
                : 'Your advert will run as last time.'}
          </p>
        )}
        <button type="button" onClick={() => setDone(null)} className="mt-6 text-sm text-sea underline hover:text-brand">
          Look again or change something
        </button>
      </div>
    );

  return (
    <div className="grid gap-8 lg:grid-cols-[auto_minmax(0,1fr)]">
      <div className="mx-auto">
        <ProofPage subject={props.subject} copy={copy} picture={picture} onFit={onFit} />
        <p className={`mt-3 text-center text-sm font-medium ${fit.fits ? 'text-sea' : 'text-red-700'}`}>
          {fit.fits ? 'Fits its space' : `About ${fit.over} character${fit.over === 1 ? '' : 's'} too long: the red outline shows where it runs over`}
        </p>
      </div>

      <div className="space-y-6">
        <div>
          <label htmlFor="copy" className="block font-semibold text-ink">Your words</label>
          <p className="mt-0.5 text-sm text-harbour/65">Edit them here and watch the page. A blank line starts a new paragraph.</p>
          <textarea id="copy" value={copy} onChange={(e) => setCopy(e.target.value)} rows={12} className="mt-2 w-full rounded-md border border-harbour/20 p-3 text-[15px] leading-relaxed focus:border-sea focus:outline-none focus:ring-2 focus:ring-sea/30" />
          <p className="mt-1 text-right text-xs text-harbour/55">{tidyCopy(copy).length} characters</p>
        </div>

        <div>
          <p className="font-semibold text-ink">Your picture</p>
          <p className="mt-0.5 text-sm text-harbour/65">A landscape photograph of the place itself works best: no logos or words over it, as they crop badly in print.</p>
          <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-ink ring-1 ring-harbour/20 hover:ring-sea">
            <ImagePlus aria-hidden="true" className="h-4 w-4" />
            {file ? 'Choose a different picture' : 'Choose a new picture'}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => void choose(e.target.files?.[0])} />
          </label>
          {file && <span className="ml-3 text-sm text-harbour/65">{file.name}</span>}
        </div>

        <div>
          <label htmlFor="note" className="block font-semibold text-ink">A note for our editors <span className="font-normal text-harbour/55">(optional)</span></label>
          <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Anything else to change: a phone number, opening times…" className="mt-2 w-full rounded-md border border-harbour/20 p-3 text-[15px] focus:border-sea focus:outline-none focus:ring-2 focus:ring-sea/30" />
        </div>

        <div className="border-t border-harbour/10 pt-6">
          <ProofArtwork proofKey={props.proofKey} value={artwork} onChange={setArtwork} onBusy={setUploading} />
        </div>

        {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {!fit.fits && changed && <p className="text-sm text-harbour/70">You can still send it: our editors will trim it to fit, or tell us in the note what matters most.</p>}

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={send} disabled={pending || uploading} className="rounded-full bg-harbour px-6 py-3 font-semibold text-white hover:bg-sea disabled:opacity-60">
            {uploading ? 'Uploading artwork…' : pending ? 'Sending…' : changed || note.trim() ? 'Send my changes' : 'Approve this entry'}
          </button>
          {changed && (
            <button type="button" onClick={reset} className="inline-flex items-center gap-1 text-sm text-harbour/65 hover:text-brand">
              <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" /> Start again
            </button>
          )}
        </div>
        <p className="text-sm text-harbour/60">Please reply by {props.deadline}.</p>
      </div>
    </div>
  );
}
