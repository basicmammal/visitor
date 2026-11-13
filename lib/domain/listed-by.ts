/**
 * Listings sites we take events from and want to send people back to:
 * an event whose source link is theirs carries a credit and a link out.
 * Gigz Hub, Jersey's live-music listings, first.
 */
export const LISTED_BY = [{ host: 'gigzhub.je', name: 'Gigz Hub', href: 'https://gigzhub.je/whats-on', blurb: 'Jersey’s live music listings' }] as const;

export type ListedBy = (typeof LISTED_BY)[number];

export function listedBy(sourceLink: string | null | undefined): ListedBy | null {
  if (!sourceLink) return null;
  let host: string;
  try {
    host = new URL(sourceLink).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
  return LISTED_BY.find((l) => host === l.host || host.endsWith(`.${l.host}`)) ?? null;
}
