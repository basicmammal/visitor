import { env } from '@/lib/env';
import { storageAuth } from './upload';
import { ARTWORK_MAX_BYTES } from '@/lib/domain/proof';

export { ARTWORK_MAX_BYTES, ARTWORK_TYPES, allowedArtwork, artworkPath } from '@/lib/domain/proof';

/**
 * Advert artwork clients send with their proof: print files, often tens
 * of megabytes, kept private (not on the public listing-images bucket).
 * The browser sends each file straight to Storage by a signed upload link
 * the server makes for it, so nothing that size passes through the site;
 * staff download by a signed link that lasts an hour.
 */
export const ARTWORK_BUCKET = 'artwork';

const base = () => `${env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')}/storage/v1`;
const auth = () => {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Artwork uploads need SUPABASE_SERVICE_ROLE_KEY on the server.');
  return storageAuth(env.SUPABASE_SERVICE_ROLE_KEY);
};

let made = false;
/** The private bucket, made the first time it is needed; "already exists" is fine. */
async function ensureBucket() {
  if (made) return;
  const res = await fetch(`${base()}/bucket`, {
    method: 'POST',
    headers: { ...auth(), 'content-type': 'application/json' },
    body: JSON.stringify({ id: ARTWORK_BUCKET, name: ARTWORK_BUCKET, public: false, file_size_limit: ARTWORK_MAX_BYTES }),
  });
  if (!res.ok && res.status !== 409 && !/already exists/i.test(await res.text())) throw new Error(`Storage said ${res.status} making the artwork bucket`);
  made = true;
}

/** A link the browser can PUT one file to, once. */
export async function artworkUploadUrl(path: string): Promise<string> {
  await ensureBucket();
  const res = await fetch(`${base()}/object/upload/sign/${ARTWORK_BUCKET}/${path}`, { method: 'POST', headers: { ...auth(), 'content-type': 'application/json' }, body: '{}' });
  if (!res.ok) throw new Error(`Storage said ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const { url } = (await res.json()) as { url: string };
  return `${base()}${url}`;
}

/** A link to download a file, for an hour. */
export async function artworkDownloadUrl(path: string, name: string): Promise<string | null> {
  try {
    const res = await fetch(`${base()}/object/sign/${ARTWORK_BUCKET}/${path}`, { method: 'POST', headers: { ...auth(), 'content-type': 'application/json' }, body: JSON.stringify({ expiresIn: 3600 }) });
    if (!res.ok) return null;
    const { signedURL } = (await res.json()) as { signedURL: string };
    return `${base()}${signedURL}${signedURL.includes('?') ? '&' : '?'}download=${encodeURIComponent(name)}`;
  } catch {
    return null;
  }
}
