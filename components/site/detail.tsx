import Link from 'next/link';
import { printTitle } from '@/lib/domain/house-style';
import type { EventDate, Image } from '@/lib/db/schema';
import { webImage } from '@/lib/domain/images';
import { upcomingDates, webTime } from '@/lib/domain/web-dates';

const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function Hero({ image, title }: { image: Image | null; title: string }) {
  if (!image) return null;
  return (
    <figure>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={webImage(image, 1600, 760)} alt={image.alt ?? title} className="aspect-[2/1] w-full rounded-lg object-cover" />
      {/* Not the listing's own picture: say whose it is, and if it is stock, that it only illustrates. */}
      {image.credit && (
        <figcaption className="mt-1.5 text-right text-xs text-harbour/50">
          {image.credit.source === 'club' ? 'Photo: ' : 'Illustrative photo: '}
          {image.credit.url ? <a href={image.credit.url} rel="nofollow noopener" target="_blank" className="hover:text-brand">{image.credit.name}</a> : image.credit.name}
          {image.credit.source !== 'club' && ` / ${image.credit.source}`}
        </figcaption>
      )}
    </figure>
  );
}

/** The source's other pictures under the copy, each opening full size; the header is not shown twice. */
export function Gallery({ images, header, title }: { images: Image[] | null | undefined; header: Image | null; title: string }) {
  const shown = (images ?? []).filter((i) => i.url !== header?.url).slice(0, 9);
  if (!shown.length) return null;
  return (
    <ul className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label={`Pictures of ${title}`}>
      {shown.map((i) => (
        <li key={i.url}>
          <a href={webImage(i, 1920)} target="_blank" rel="noopener" className="block overflow-hidden rounded-md bg-harbour/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={webImage(i, 480, 360)} alt={i.alt ?? ''} loading="lazy" className="aspect-[4/3] w-full object-cover transition duration-300 hover:scale-[1.03]" />
          </a>
        </li>
      ))}
    </ul>
  );
}

/** The listing's text as paragraphs. */
export function Copy({ lead, body }: { lead: string | null; body: string | null }) {
  return (
    <div className="space-y-4">
      {lead && <p className="text-lg leading-relaxed">{lead}</p>}
      {body && body !== lead && body.split(/\n{2,}/).map((p, i) => <p key={i} className="leading-relaxed text-harbour/80">{p}</p>)}
    </div>
  );
}

/** Every date still to come, with its times, when there are few enough to read. */
export function DateList({ dates, today }: { dates: readonly EventDate[]; today: string }) {
  const upcoming = upcomingDates(dates, today);
  if (upcoming.length < 2 || upcoming.length > 40) return null;
  const times = (iso: string) => dates.filter((d) => d.date === iso && d.start).map((d) => (d.end ? `${webTime(d.start!)}–${webTime(d.end)}` : webTime(d.start!))).join(', ');
  return (
    <details className="rounded-lg bg-white p-4 text-sm ring-1 ring-harbour/5">
      <summary className="cursor-pointer font-medium">All {upcoming.length} dates</summary>
      <ul className="mt-3 grid gap-1 sm:grid-cols-2">
        {upcoming.map((iso) => (
          <li key={iso}>{DAY.format(new Date(`${iso}T00:00:00Z`))}{times(iso) && <span className="text-harbour/60"> · {times(iso)}</span>}</li>
        ))}
      </ul>
    </details>
  );
}

/** The practical box: when, price, where, how to book. Without actions, just the facts, for a panel that has its own. */
export function Facts({ rows, actions }: { rows: [string, React.ReactNode][]; actions?: React.ReactNode }) {
  const list = (
    <dl className="space-y-3 text-sm">
      {rows.filter(([, v]) => v).map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs font-semibold uppercase tracking-wide text-harbour/50">{k}</dt>
          <dd className="mt-0.5">{v}</dd>
        </div>
      ))}
    </dl>
  );
  if (actions === undefined) return list;
  return (
    <aside className="space-y-4 rounded-lg bg-white p-5 shadow-sm ring-1 ring-harbour/5">
      {list}
      <div className="flex flex-col gap-2">{actions}</div>
    </aside>
  );
}

export const primaryButton = 'rounded bg-brand px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-harbour';
export const secondaryButton = 'rounded border border-harbour/20 px-4 py-2.5 text-center text-sm font-medium hover:border-harbour';

export function directionsUrl(lat: number | null, lon: number | null, fallback: string | null): string | null {
  if (lat !== null && lon !== null) return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
  return fallback ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${fallback}, Jersey`)}` : null;
}

/** Times for the facts box: one or two read fine; more than that is a list of their own. */
export function timesSummary(times: string | null): string | null {
  if (!times) return null;
  return times.split(/ \| |, /).length > 2 ? 'Varies by day, see all dates' : times;
}

type Who = { name: string; href: string | null } | null;

const whoLink = (w: NonNullable<Who>) =>
  w.href ? <Link href={w.href} className="font-semibold text-ink hover:text-brand">{w.name}</Link> : <span className="font-semibold text-ink">{w.name}</span>;

/**
 * The top of a listing's page: when first, the next date large and any
 * later ones small; then what it is; then where, and whose, each a way
 * on to that venue's or organiser's own page.
 */
export function ListingHeader(props: { when: { main: string; more: string | null } | null; title: string; label?: string | null; where?: Who; whereWord?: 'at' | 'with'; by?: Who }) {
  const { where, by } = props;
  // A tour run by the place it happens at needs saying once.
  const showBy = by && (!where || by.name.toLowerCase() !== where.name.toLowerCase());
  return (
    <header className="mb-6 mt-3">
      {props.label && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-brand">{props.label}</p>}
      <p className="font-display text-xl font-semibold text-sea md:text-2xl">
        {props.when?.main ?? 'Finished'}
        {props.when?.more && <span className="ml-2 text-base font-medium text-sea/70 md:text-lg">({props.when.more})</span>}
      </p>
      <h1 className="mt-1 font-display text-3xl font-bold leading-tight text-ink md:text-4xl">{printTitle(props.title)}</h1>
      {(where || showBy) && (
        <p className="mt-2 text-lg text-harbour/70">
          {where && <>{props.whereWord ?? 'at'} {whoLink(where)}</>}
          {where && showBy && ' '}
          {showBy && <>by {whoLink(by)}</>}
        </p>
      )}
    </header>
  );
}

/**
 * A listing's page on a desktop: what it is on the left, and down the
 * whole right-hand side, staying in view, what to do next. On a phone
 * the side follows the main column.
 */
export function DetailLayout({ main, side }: { main: React.ReactNode; side: React.ReactNode }) {
  return (
    <div className="mx-auto grid max-w-6xl md:grid-cols-[1fr_340px]">
      <div className="min-w-0 px-4 py-8 md:pr-10">{main}</div>
      <aside className="border-t border-harbour/10 bg-white px-4 py-8 md:border-l md:border-t-0 md:px-6">
        <div className="space-y-8 md:sticky md:top-6">{side}</div>
      </aside>
    </div>
  );
}

export function SideSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-brand">{title}</h2>
      {children}
    </section>
  );
}

/** A quiet way in for whoever runs it. */
export function ClaimLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="mt-4 block text-xs text-harbour/50 underline decoration-harbour/20 underline-offset-2 hover:text-brand hover:decoration-brand">
      {children}
    </Link>
  );
}
