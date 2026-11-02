import type { ProofDetails } from '@/lib/db/schema';
import { WEEK, type WeekHours } from './opening';

/**
 * Editorial proofs, the parts with no database: who is owed one, how
 * long a link lasts, and what a client's reply amounts to.
 */

/** The space that gets a proof: more than a listing box or a directory line. Biggest first. */
export const BOOKED = ['full', 'three-quarters', 'half', 'quarter'] as const;

/** A link works until a week after the artwork deadline, so a late reply still reaches us. */
export const GRACE_DAYS = 7;

export function linkWorks(deadline: string, now = new Date()): boolean {
  const last = Date.parse(`${deadline}T23:59:59Z`) + GRACE_DAYS * 86_400_000;
  return now.getTime() <= last;
}

/** Copy as a person means it: their line breaks between paragraphs kept, stray spaces and blank lines not. */
export function tidyCopy(s: string): string {
  return s
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

/** What a reply changes: the words if they differ, the picture if one was sent. Nothing means it is signed off as it is. */
export function replyChanges(current: string, sent: string, picture: boolean): { copy: string | null; picture: boolean } {
  const copy = tidyCopy(sent);
  return { copy: copy && copy !== tidyCopy(current) ? copy : null, picture };
}

/** "Fri 21 Nov": the deadline as the email and the page give it. */
export function deadlineText(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** Advert artwork: print files up to 50 MB, of the kinds a designer sends. */
export const ARTWORK_MAX_BYTES = 50 * 1024 * 1024;
export const ARTWORK_TYPES = ['.pdf', '.jpg', '.jpeg', '.png', '.tif', '.tiff', '.eps', '.ai', '.psd', '.indd', '.zip'];

/** A file's place in the bucket: the proof's folder, a stamp, and its name made safe. */
export function artworkPath(proofId: string, name: string, now = Date.now()): string {
  const safe = name.normalize('NFKD').replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').slice(-120) || 'artwork';
  return `proofs/${proofId}/${now}-${safe}`;
}

export const allowedArtwork = (name: string, size: number) =>
  size > 0 && size <= ARTWORK_MAX_BYTES && ARTWORK_TYPES.some((t) => name.toLowerCase().endsWith(t));



/** A venue's details as the proof form shows them. */
export type DetailsForm = Required<ProofDetails>;

const text = (v: unknown) => {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  return s || null;
};
const longText = (v: unknown) => (typeof v === 'string' ? tidyCopy(v) || null : null);

/** Hours as a day-by-day map, each a valid opening before its closing: the rest left out. */
export function cleanHours(h: unknown): WeekHours | null {
  if (!h || typeof h !== 'object') return null;
  const out: WeekHours = {};
  for (const d of WEEK) {
    const v = (h as Record<string, unknown>)[d];
    if (!Array.isArray(v)) continue;
    const [o, c] = v.map((x) => (typeof x === 'string' && /^\d{2}:\d{2}$/.test(x) ? x : null));
    if (o && c && o !== c) out[d] = [o, c];
  }
  return Object.keys(out).length ? out : null;
}

/** Months open, in order; every month is the same as none given: open all year. */
export function cleanMonths(m: unknown): number[] {
  const ms = [...new Set((Array.isArray(m) ? m : []).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 12))].sort((a, b) => a - b);
  return ms.length === 12 ? [] : ms;
}

/** What a client changed of their details, and only that: each field tidied, then compared with what the listing has. */
export function detailsChanges(current: DetailsForm, sent: Partial<Record<keyof DetailsForm, unknown>>): ProofDetails | null {
  const tidy: DetailsForm = {
    phone: text(sent.phone),
    email: text(sent.email)?.toLowerCase() ?? null,
    website: text(sent.website),
    addressLine1: text(sent.addressLine1),
    parish: text(sent.parish),
    postcode: text(sent.postcode)?.toUpperCase() ?? null,
    openingHours: cleanHours(sent.openingHours),
    openMonths: cleanMonths(sent.openMonths),
    summary: text(sent.summary),
    description: longText(sent.description),
  };
  const now: DetailsForm = {
    ...current,
    email: current.email?.toLowerCase() ?? null,
    openingHours: cleanHours(current.openingHours),
    openMonths: cleanMonths(current.openMonths),
    description: longText(current.description),
  };
  const out: ProofDetails = {};
  for (const k of Object.keys(tidy) as (keyof DetailsForm)[]) {
    if (!(k in sent)) continue;
    if (JSON.stringify(tidy[k]) !== JSON.stringify(now[k])) (out as Record<string, unknown>)[k] = tidy[k];
  }
  return Object.keys(out).length ? out : null;
}
