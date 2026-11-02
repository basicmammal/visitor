import { env } from '@/lib/env';
import type { Email } from './send';

/**
 * The emails, each as plain text and as simple HTML in visitor's colours.
 * Anything a person typed is escaped before it goes into the HTML.
 */

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const site = () => env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
export const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ');

/** The frame every email shares: the masthead, a white card holding `inner`, and under it the site's address (and `below`, already HTML). */
export function shell(inner: string, below = ''): string {
  return `<!doctype html><html><body style="margin:0;background:#f5f5f4;padding:24px 12px;font-family:Helvetica,Arial,sans-serif;color:#333333;font-size:15px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;padding:32px">
<tr><td>
<p style="margin:0 0 4px;font-size:26px;font-weight:bold;color:#0f2a44;letter-spacing:-0.5px">Visitor</p>
<p style="margin:0 0 28px;font-family:Georgia,serif;font-style:italic;font-size:13px;color:#777">Jersey’s What’s On Guide</p>
${inner}
</td></tr></table>
<p style="margin:16px 0 0;font-size:12px;color:#999"><a href="${esc(site())}" style="color:#999">${esc(site().replace(/^https?:\/\//, ''))}</a></p>
${below}
</td></tr></table></body></html>`;
}

export const button = (b: { label: string; href: string }) =>
  `<p style="margin:24px 0"><a href="${esc(b.href)}" style="display:inline-block;background:#cd1316;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:4px">${esc(b.label)}</a></p>`;

/** Paragraphs in, an email out: the text as given, the HTML with a button for the one link that matters. */
function compose(subject: string, paragraphs: string[], link?: { label: string; href: string }, footnote?: string): Omit<Email, 'to'> {
  const text = [...paragraphs, link ? `${link.label}: ${link.href}` : null, footnote, '—\nVisitor, Jersey’s What’s On Guide\n' + site()]
    .filter(Boolean)
    .join('\n\n');
  const p = (t: string) => `<p style="margin:0 0 16px;line-height:1.55">${esc(t).replace(/\n/g, '<br>')}</p>`;
  const html = shell(
    `${paragraphs.map(p).join('\n')}
${link ? button(link) : ''}
${footnote ? `<p style="margin:16px 0 0;font-size:13px;color:#777;line-height:1.5">${esc(footnote).replace(/\n/g, '<br>')}</p>` : ''}`,
  );
  return { subject: oneLine(subject), text, html };
}

/** The one email a new sign-up gets before any other: follow the link, or hear nothing more. */
export function subscribeConfirmEmail(input: { link: string }) {
  return compose(
    'Confirm your weekly What’s On email',
    [
      'Thank you for signing up to Visitor’s weekly email: what’s on in Jersey in the coming week, every Thursday morning.',
      'Confirm it is you with the button below, and the next one is yours.',
    ],
    { label: 'Yes, send me the weekly email', href: input.link },
    'If you did not ask for this, ignore it: you will not hear from us again.',
  );
}

export function inviteEmail(input: { name: string | null; businessName: string | null; staff: boolean; link: string; reason?: string }) {
  const hello = input.name ? `Hello ${input.name.split(' ')[0]},` : 'Hello,';
  const what = input.staff
    ? 'You have been invited to help run Visitor, Jersey’s What’s On Guide.'
    : `You have been invited to look after ${input.businessName ?? 'your business'}’s listings on Visitor, Jersey’s What’s On Guide: keep your details right and add what you have coming up.`;
  return compose(
    input.staff ? 'Your invitation to Visitor' : `Look after ${input.businessName ?? 'your listings'} on Visitor`,
    [hello, ...(input.reason ? [input.reason] : []), what, 'Set up your account with the button below. You can sign in with Google or choose a password.'],
    { label: 'Set up my account', href: input.link },
    'The link works once, for 14 days. If you were not expecting this, you can ignore it.',
  );
}

export function claimReceivedEmail(input: { name: string; listingTitle: string | null }) {
  return compose(
    'We have your request',
    [
      `Hello ${input.name.split(' ')[0]},`,
      input.listingTitle
        ? `Thank you for claiming ${input.listingTitle} on Visitor. We check every claim, usually within two working days, and will email you when it is done.`
        : 'Thank you for asking to list with Visitor. We check every request, usually within two working days, and will email you when your account is ready.',
      'There is nothing more to do for now.',
    ],
  );
}

export function claimStaffEmail(input: { name: string; email: string; phone: string | null; businessName: string; relationship: string | null; message: string | null; listing: { kind: string; title: string } | null }) {
  const what = input.listing ? `claims the ${input.listing.kind} “${input.listing.title}”` : 'asks for an account to list with us';
  return {
    ...compose(
      input.listing ? `Claim: ${input.listing.title}` : `Account request: ${input.businessName}`,
      [
        `${input.name} (${input.businessName}${input.relationship ? `, ${input.relationship}` : ''}) ${what}.`,
        [`Email: ${input.email}`, input.phone && `Phone: ${input.phone}`].filter(Boolean).join('\n'),
        ...(input.message ? [`“${input.message}”`] : []),
      ],
      { label: 'Review claims', href: `${site()}/admin/claims` },
    ),
    replyTo: input.email,
  };
}

export function claimApprovedEmail(input: { name: string; businessName: string; listingTitle: string | null }) {
  return compose(
    input.listingTitle ? `${input.listingTitle} is now yours to look after` : 'Your request is approved',
    [
      `Hello ${input.name.split(' ')[0]},`,
      input.listingTitle
        ? `We have approved your claim: ${input.listingTitle} is now in ${input.businessName}’s listings. Changes you make are checked before they go live.`
        : `We have approved your request for ${input.businessName}.`,
    ],
    { label: 'Go to your listings', href: `${site()}/account` },
  );
}

export function claimRejectedEmail(input: { name: string; listingTitle: string | null }) {
  return compose(
    'About your request',
    [
      `Hello ${input.name.split(' ')[0]},`,
      input.listingTitle
        ? `Thank you for claiming ${input.listingTitle}. We were not able to confirm that it is yours, so we have not handed it over.`
        : 'Thank you for asking to list with Visitor. We have not been able to set up an account from your request.',
      'If you think we have got this wrong, reply to this email and tell us a little more, for example a way we can check you run it.',
    ],
  );
}

/** An editorial proof, on the artwork deadline: the client's entry to sign off or change, by their own link. A reminder says so. */
export function proofEmail(input: { name: string; edition: string; deadline: string; link: string; reminder?: boolean }) {
  return compose(
    `${input.reminder ? 'Reminder: ' : ''}your ${input.edition} Visitor Guide proof: ${input.name}`,
    [
      'Hello,',
      input.reminder
        ? `A reminder that we still need your sign-off for ${input.name} in the ${input.edition} edition of the Visitor Guide.`
        : `Your entry for ${input.name} in the ${input.edition} edition of the Visitor Guide is ready for you to check.`,
      'The button below signs you in to your listing, no password needed. There you will find your entry exactly as it will print: change the words and the picture, and see as you type whether it still fits; then approve it, or send us your changes. Your online listing’s details are on the same page.',
      'If you have an advert in this edition, you can send us its new artwork on the same page, let us know new artwork is on its way, or tell us to run the same as last time.',
      `Please reply by ${input.deadline}. If we have not heard by then, it will print as it stands.`,
    ],
    { label: 'Open my listing', href: input.link },
    'The link is yours alone: no password needed. It works until a week after the deadline.',
  );
}
