'use client';

import { FileUp, X } from 'lucide-react';
import { useState } from 'react';
import { answerArtwork, startArtworkUpload } from '@/app/proof/actions';
import type { ArtworkFile, ArtworkPlan } from '@/lib/db/schema';

export type ArtworkAnswer = { plan: ArtworkPlan | null; files: ArtworkFile[]; due: string };

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;

/** One file to storage by its signed link, reporting how far it has got. */
function put(url: string, file: File, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('content-type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`The upload stopped (${xhr.status}). Try again.`)));
    xhr.onerror = () => reject(new Error('The upload stopped: check your connection and try again.'));
    xhr.send(file);
  });
}

/**
 * Their advert, beside their editorial: send new artwork here (print
 * files go straight to our storage, however large, up to 50 MB each), say
 * it is on its way and when, or run the same as last time.
 */
export function ProofArtwork({ token, value, onChange, onBusy }: { token: string; value: ArtworkAnswer; onChange: (a: ArtworkAnswer) => void; onBusy?: (b: boolean) => void }) {
  const [busy, setBusyState] = useState<{ name: string; p: number } | null>(null);
  const setBusy = (b: { name: string; p: number } | null) => {
    setBusyState(b);
    onBusy?.(!!b);
  };
  const [error, setError] = useState<string | null>(null);

  const add = async (list: FileList | null) => {
    if (!list?.length) return;
    setError(null);
    let files = value.files;
    for (const file of [...list]) {
      setBusy({ name: file.name, p: 0 });
      const start = await startArtworkUpload(token, file.name, file.size);
      if (!start.ok) {
        setError(start.error);
        continue;
      }
      try {
        await put(start.url, file, (p) => setBusy({ name: file.name, p }));
        files = [...files, { path: start.path, name: file.name, size: file.size }];
        onChange({ ...value, plan: 'sent', files });
      } catch (e) {
        setError((e as Error).message);
      }
    }
    setBusy(null);
  };

  const option = (plan: ArtworkPlan, label: string, hint: string) => (
    <label className={`flex cursor-pointer gap-3 rounded-md border p-3 ${value.plan === plan ? 'border-sea bg-sea/5' : 'border-harbour/15 bg-white'}`}>
      <input type="radio" name="artwork-plan" checked={value.plan === plan} onChange={() => onChange({ ...value, plan })} className="mt-1" />
      <span>
        <span className="block font-medium text-ink">{label}</span>
        <span className="block text-sm text-harbour/65">{hint}</span>
      </span>
    </label>
  );

  return (
    <fieldset className="space-y-2">
      <legend className="font-semibold text-ink">Your advert artwork</legend>
      <p className="text-sm text-harbour/65">If you have an advert in this edition, let us know about its artwork.</p>
      {option('sent', 'I’m sending new artwork', 'Upload it here: a print-ready PDF is best. Up to 50 MB a file.')}
      {value.plan === 'sent' && (
        <div className="ml-7 space-y-2">
          {value.files.map((f) => (
            <p key={f.path} className="flex items-center gap-2 text-sm">
              <span className="truncate">{f.name}</span>
              <span className="text-harbour/50">{mb(f.size)}</span>
              <button type="button" onClick={() => onChange({ ...value, files: value.files.filter((x) => x.path !== f.path) })} aria-label={`Remove ${f.name}`} className="text-harbour/50 hover:text-brand">
                <X className="h-4 w-4" />
              </button>
            </p>
          ))}
          {busy ? (
            <div className="text-sm">
              <p className="truncate">Uploading {busy.name}…</p>
              <div className="mt-1 h-1.5 w-full max-w-xs overflow-hidden rounded bg-harbour/10"><div className="h-full bg-sea transition-all" style={{ width: `${Math.round(busy.p * 100)}%` }} /></div>
            </div>
          ) : (
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-ink ring-1 ring-harbour/20 hover:ring-sea">
              <FileUp aria-hidden="true" className="h-4 w-4" />
              {value.files.length ? 'Add another file' : 'Choose artwork files'}
              <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff,.eps,.ai,.psd,.indd,.zip" className="sr-only" onChange={(e) => void add(e.target.files)} />
            </label>
          )}
          {error && <p className="text-sm text-red-700">{error}</p>}
        </div>
      )}
      {option('coming', 'New artwork is on its way', 'We’ll look out for it. Tell us roughly when.')}
      {value.plan === 'coming' && (
        <label className="ml-7 block text-sm">
          Expected by <input type="date" value={value.due} onChange={(e) => onChange({ ...value, due: e.target.value })} className="ml-2 rounded border border-harbour/20 px-2 py-1" />
        </label>
      )}
      {option('same', 'Run the same artwork as last time', 'No changes to the advert.')}
    </fieldset>
  );
}

/** The answer as the form sends it. */
export function artworkFields(form: FormData, a: ArtworkAnswer) {
  if (a.plan) form.set('artwork', a.plan);
  form.set('artworkFiles', JSON.stringify(a.files));
  if (a.due) form.set('artworkDue', a.due);
}

/** The artwork part alone, for when their words are already settled with us. */
export function ArtworkOnly({ token, initial }: { token: string; initial: ArtworkAnswer }) {
  const [value, setValue] = useState(initial);
  const [uploading, setUploading] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'done' | string>('idle');
  const send = async () => {
    setState('sending');
    const form = new FormData();
    form.set('token', token);
    artworkFields(form, value);
    const r = await answerArtwork(form);
    setState(r.ok ? 'done' : r.error);
  };
  return (
    <div className="max-w-xl space-y-4 rounded-lg bg-white p-6 ring-1 ring-harbour/10">
      <ProofArtwork token={token} value={value} onChange={(v) => { setValue(v); setState('idle'); }} onBusy={setUploading} />
      <button type="button" onClick={() => void send()} disabled={uploading || state === 'sending' || !value.plan} className="rounded-full bg-harbour px-6 py-3 font-semibold text-white hover:bg-sea disabled:opacity-60">
        {state === 'sending' ? 'Sending…' : 'Send'}
      </button>
      {state === 'done' && <p className="text-sm text-sea">Thank you: we have it.</p>}
      {state !== 'idle' && state !== 'sending' && state !== 'done' && <p className="text-sm text-red-700">{state}</p>}
    </div>
  );
}
