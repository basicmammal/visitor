import { printTitle } from '@/lib/domain/house-style';
import type { Metadata } from 'next';
import { alternates } from '@/lib/agents/data';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ClaimLink, Copy, DateList, DetailLayout, Facts, Gallery, Hero, ListingHeader, SideSection, directionsUrl, primaryButton, secondaryButton, timesSummary } from '@/components/site/detail';
import { StaffEdit } from '@/components/site/staff-edit';
import { OnVisitorMap } from '@/components/site/visitor-map';
import { staffViewer } from '@/lib/auth/session';
import { publicTour, publicVenueNamed, todayIso } from '@/lib/db/public';
import { GENRES } from '@/lib/domain/genre';
import { printPrice, printTimes, siteLabel } from '@/lib/domain/house-style';
import { webImage } from '@/lib/domain/images';
import { UNIQUE } from '@/lib/domain/occurrence';
import { headerWhen, webTimes, webWhen } from '@/lib/domain/web-dates';
import { slugify } from '@/lib/domain/slug';
import { JsonLd } from '@/components/site/json-ld';
import { tourOut } from '@/lib/agents/data';
import { breadcrumbs, tourLd } from '@/lib/agents/schema-org';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const row = await publicTour((await params).slug);
  if (!row) return {};
  const t = row.tour;
  return {
    title: printTitle(t.title),
    description: t.summary ?? undefined,
    alternates: alternates(`/tours/${t.slug}`),
    openGraph: { title: t.title, description: t.summary ?? undefined, images: t.headerImage ? [webImage(t.headerImage, 1200, 630)] : [] },
  };
}

export default async function TourPage({ params }: Props) {
  const row = await publicTour((await params).slug);
  if (!row) notFound();
  const { tour: t, provider } = row;
  const today = todayIso();
  const dated = UNIQUE.includes(t.occurrence);
  const directions = directionsUrl(t.lat, t.lon, t.meetingPoint);
  const book = t.website ?? provider?.website;
  // Where it happens, when that is a venue on the site: the operator's own place, or the meeting point.
  const [staff, host] = await Promise.all([staffViewer(), publicVenueNamed(provider?.name, t.meetingPoint)]);

  const runBy = provider && { name: provider.name, href: `/organisers/${slugify(provider.name)}` };

  return (
    <article>
      <JsonLd data={[tourLd(tourOut(t, provider, today)), breadcrumbs([['Tours & experiences', '/tours'], [t.title, `/tours/${t.slug}`]])]} />
      {staff && <StaffEdit kind="experience" id={t.id} title={t.title} summary={t.summary} description={t.description} image={t.headerImage ? { url: webImage(t.headerImage, 800, 400), alt: t.headerImage.alt, stock: !!t.headerImage.credit } : null} genre={t.genre} genres={GENRES} adminHref={`/admin/tours/${t.slug}`} />}
      <DetailLayout
        main={
          <>
            <Link href="/tours" className="text-sm text-harbour/60 hover:text-brand">← Tours &amp; experiences</Link>
            <ListingHeader
              when={dated ? headerWhen(t.dates, t.occurrence, today) : { main: 'Book any day', more: null }}
              title={t.title}
              label={t.highlight ? 'Highlight' : (t.genre ?? 'Experience')}
              whereWord="with"
              where={host ? { name: host.name, href: `/venues/${host.slug}` } : runBy || null}
              by={host && runBy ? runBy : null}
            />
            {provider?.visitorMap && <OnVisitorMap edition={provider.visitorMap} className="-mt-2 mb-5" />}
            <Hero image={t.headerImage} title={t.title} />
            <div className="mt-8 space-y-6">
              <Copy lead={t.guideCopy ?? t.summary} body={t.description} />
              <Gallery images={t.gallery} header={t.headerImage} title={t.title} />
              {dated && <DateList dates={t.dates} today={today} />}
            </div>
          </>
        }
        side={
          <>
            <SideSection title="Book">
              <Facts
                rows={[
                  ['When', dated ? webWhen(t.dates, t.occurrence, today) : 'Book any day, subject to availability'],
                  ['Times', dated ? timesSummary(webTimes(printTimes(t.dates.filter((d) => d.date >= today)))) : null],
                  ['Duration', t.duration],
                  ['Price', printPrice(t.fromPricePence, t.toPricePence)],
                  ['Contact', t.phone ? <a href={`tel:${t.phone.replace(/[^\d+]/g, '')}`} className="hover:text-brand">{t.phone}</a> : t.email && <a href={`mailto:${t.email}`} className="hover:text-brand">{t.email}</a>],
                ]}
              />
              <div className="mt-4 flex flex-col gap-2">
                {book && (
                  <>
                    <a href={book} target="_blank" rel="noopener" className={primaryButton}>Book with {provider?.name ?? 'the provider'} ↗</a>
                    <p className="text-center text-xs text-harbour/50">on {siteLabel(book)}</p>
                  </>
                )}
              </div>
              {runBy && (
                <p className="mt-4 text-sm text-harbour/70">
                  Run by <Link href={runBy.href} className="font-medium text-ink hover:text-brand">{runBy.name}</Link>
                </p>
              )}
              {!t.businessId && <ClaimLink href={`/claim/tours/${t.slug}`}>Run this tour? Claim it</ClaimLink>}
            </SideSection>

            {(t.meetingPoint || host) && (
              <SideSection title="Meeting point">
                {host ? <Link href={`/venues/${host.slug}`} className="font-medium hover:text-brand">{host.name}</Link> : null}
                {t.meetingPoint && t.meetingPoint !== host?.name && <p className={host ? 'text-sm text-harbour/60' : 'font-medium'}>{t.meetingPoint}</p>}
                {directions && <a href={directions} target="_blank" rel="noopener" className={`${secondaryButton} mt-4 block`}>Directions</a>}
              </SideSection>
            )}
          </>
        }
      />
    </article>
  );
}
