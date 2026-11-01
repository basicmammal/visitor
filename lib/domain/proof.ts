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
