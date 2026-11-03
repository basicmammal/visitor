import type { Metadata } from 'next';
import { printTitle } from '@/lib/domain/house-style';
import Link from 'next/link';
import { alternates } from '@/lib/agents/data';
import { GuideAd } from '@/components/site/guide-ad';
import { HeroRotator, type HeroSlide } from '@/components/site/hero-rotator';
import { publicAllVenues, publicEvents, publicTours, todayIso } from '@/lib/db/public';
import type { Category, Image } from '@/lib/db/schema';
import { StorySpread, type Story } from '@/components/site/story-spread';
import { KindPills } from '@/components/site/event-landing';
import { onePerGroup, standfirst } from '@/lib/domain/front-page';
import { nonCore } from '@/lib/domain/categorise';
import { LANDING_TYPES, typePath } from '@/lib/domain/landing';
import { GENRES } from '@/lib/domain/genre';
import { CATEGORY_LABEL } from '@/lib/params';
import { printParish } from '@/lib/domain/house-style';
import { HERO_SLIDES, heroPicks, imageKey, isFestival } from '@/lib/domain/hero';
import { webImage } from '@/lib/domain/images';
import { pickLead } from '@/lib/domain/lead';
import { UNIQUE } from '@/lib/domain/occurrence';
import { cardWhen, upcomingDates, webWhen } from '@/lib/domain/web-dates';
import { addDays } from '@/lib/domain/when';
import { JsonLd } from '@/components/site/json-ld';
import { SubscribePopover } from '@/components/site/subscribe-popover';
import { emailEnabled } from '@/lib/email/send';
import { organisation } from '@/lib/agents/schema-org';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { places as placesTable } from '@/lib/db/schema';
import { editions } from '@/lib/guide';

// Drawn ahead and again every ten minutes, each time with a fresh pick of stories.
export const revalidate = 600;
export const metadata: Metadata = { alternates: alternates('/') };

const PLACE_SECTIONS: Category[] = ['eat-drink', 'see', 'do', 'shop', 'stay'];
// The kinds a visitor comes for: not talks, charity or health, which are mostly for people who live here.
const FRONT_KINDS = LANDING_TYPES.filter((t) => !['Talks & learning', 'Charity', 'Health & wellbeing'].includes(t));
const EXHIBITION_KINDS = ['Arts & cultural', 'History & Heritage'];
// A long-running festival or food season is not an exhibition, though it may be cultural.
const NOT_EXHIBITIONS = ['Festivals', 'Food & drink', 'Seasonal'];
const printable = (img: Image | null): img is Image => !!img && !img.credit;

/**
 * The front page, as a magazine: the lead and other highlights in
 * rotation; then a spread of what's on, one event picked at random from
 * each of a few kinds; the same for tours and experiences, by kind; and
 * places to go, one from each section of the guide. A different pick each
 * time the page is redrawn.
 */
export default async function Home() {
  const [found, tours, places] = await Promise.all([publicEvents({ showOngoing: true }), publicTours({ showOnDemand: true }), publicAllVenues()]);
  // Health listings are for people who live here: off the front page, still behind the Health & wellbeing tile.
  const all = found.filter((r) => !r.hidden).map((r) => ({ ...r, event: { ...r.event, eventTypes: r.siteTypes } }));
  // The front page's events have days to them; what is on every day for months has its own spread below.
  const events = all.filter((r) => UNIQUE.includes(r.event.occurrence));
  const today = todayIso();
  // The lead goes first; highlights and festivals follow, never with its photo again.
  const lead = pickLead(events, today);
  const leadImage = lead?.event.headerImage && imageKey(lead.event.headerImage);
  const rest = events.filter((r) => r !== lead && !(r.event.headerImage && imageKey(r.event.headerImage) === leadImage));
  const hero = lead ? [lead, ...heroPicks(rest, (r) => r.event, HERO_SLIDES - 1)] : heroPicks(events, (r) => r.event);
  const slides: HeroSlide[] = hero.map(({ event: e, venue }) => {
    const where = e.venueName ?? venue?.name;
    return {
      key: e.id,
      href: `/whats-on/${e.slug}`,
      title: printTitle(e.title),
      label: e.highlight ? 'Highlight' : isFestival(e) ? 'Festival' : null,
      meta: [webWhen(e.dates, e.occurrence, today), where].filter(Boolean).join(' · ') || null,
      src: webImage(e.headerImage!, 1920, 900),
      alt: e.headerImage!.alt ?? '',
    };
  });

  // What's on: the next six weeks, not what the hero already shows, with a picture of its own;
  // not a month of days (a season's menus), which reads as ongoing.
  const soon = addDays(today, 42);
  const onSoon = events.filter((r) => !hero.includes(r) && !nonCore(r.event.eventTypes) && printable(r.event.headerImage) && r.next <= soon && upcomingDates(r.event.dates, today).length <= 14);
  const eventStories: Story[] = onePerGroup(FRONT_KINDS.map((t) => [t, onSoon.filter((r) => r.event.eventTypes.includes(t))] as const), 6, (r) => r.event.id).map(([t, { event: e, venue }]) => ({
    key: e.id,
    kicker: t,
    kickerHref: typePath(t),
    title: printTitle(e.title),
    href: `/whats-on/${e.slug}`,
    meta: [cardWhen(e.dates, e.occurrence, today), e.venueName ?? venue?.name].filter(Boolean).join(' · ') || null,
    blurb: standfirst(e.guideCopy ?? e.summary),
    image: e.headerImage!,
  }));

  // Tours on given days in the same six weeks: not those to book any day, nor every week.
  const datedTours = tours.filter((r) => UNIQUE.includes(r.tour.occurrence) && r.next <= soon && printable(r.tour.headerImage));
  const tourStories: Story[] = onePerGroup(GENRES.map((g) => [g, datedTours.filter((r) => r.tour.genre === g)] as const), 3, (r) => r.tour.id).map(([g, { tour: t, provider }]) => ({
    key: t.id,
    kicker: g,
    kickerHref: '/tours',
    title: printTitle(t.title),
    href: `/tours/${t.slug}`,
    meta: [cardWhen(t.dates, t.occurrence, today), provider?.name].filter(Boolean).join(' · ') || null,
    blurb: standfirst(t.guideCopy ?? t.summary),
    image: t.headerImage!,
  }));

  // Exhibitions: on for weeks or months, arts and heritage, the highlighted first; a fresh pick each time.
  const showing = all.filter(
    (r) => r.event.occurrence === 'ongoing' && printable(r.event.headerImage) && r.event.eventTypes.some((t) => EXHIBITION_KINDS.includes(t)) && !r.event.eventTypes.some((t) => NOT_EXHIBITIONS.includes(t)),
  );
  const exhibitionStories: Story[] = [...showing]
    .map((r) => ({ r, order: (r.event.highlight ? 0 : 1) + Math.random() }))
    .sort((a, b) => a.order - b.order)
    .slice(0, 4)
    .map(({ r: { event: e, venue } }) => ({
      key: e.id,
      kicker: e.eventTypes.includes('History & Heritage') ? 'History & Heritage' : 'Arts & cultural',
      kickerHref: '/whats-on?ongoing=1',
      title: printTitle(e.title),
      href: `/whats-on/${e.slug}`,
      meta: [cardWhen(e.dates, e.occurrence, today), e.venueName ?? venue?.name].filter(Boolean).join(' · ') || null,
      blurb: standfirst(e.guideCopy ?? e.summary, 140),
      image: e.headerImage!,
    }));

  // New this season: the places staff featured for the edition now in hand.
  const season = [...editions(Number(today.slice(0, 4)) - 1), ...editions(Number(today.slice(0, 4)))].find((e) => e.window.from <= today && e.window.to >= today)?.name;
  // Built ahead, before the deploy's migrations run: a column they have yet to add must not stop the build.
  const fresh = season
    ? await db
        .select()
        .from(placesTable)
        .where(and(eq(placesTable.newIn, season), ne(placesTable.inclusion, 'excluded'), eq(placesTable.review, 'approved')))
        .catch(() => [])
    : [];
  const newStories: Story[] = fresh
    .filter((v) => printable(v.headerImage))
    .sort(() => Math.random() - 0.5)
    .slice(0, 4)
    .map((v) => ({
      key: v.id,
      kicker: CATEGORY_LABEL[v.category],
      kickerHref: `/venues?category=${v.category}`,
      title: v.name,
      href: `/venues/${v.slug}`,
      meta: printParish(v.parish),
      blurb: standfirst(v.summary ?? v.guideCopy ?? v.description, 140),
      image: v.headerImage!,
    }));

  // Places: those the guide writes about, with a picture.
  const placeStories: Story[] = onePerGroup(
    PLACE_SECTIONS.map((c) => [c, places.filter((v) => v.category === c && printable(v.headerImage) && (v.guideCopy || v.recommendedIn))] as const),
    4,
    (v) => v.id,
  ).map(([c, v]) => ({
    key: v.id,
    kicker: CATEGORY_LABEL[c],
    kickerHref: `/venues?category=${c}`,
    title: v.name,
    href: `/venues/${v.slug}`,
    meta: printParish(v.parish),
    blurb: standfirst(v.guideCopy ?? v.summary, 140),
    image: v.headerImage!,
  }));

  return (
    <>
      <JsonLd data={organisation()} />
      {/* The weekly email, offered once; not while nothing could send its confirmation. */}
      {emailEnabled() && <SubscribePopover />}
      <h1 className="sr-only">What&apos;s on in Jersey</h1>
      <HeroRotator slides={slides} />

      <div className="mx-auto max-w-6xl px-4 py-12">
        <StorySpread title="Coming up" intro="A pick of what’s on in the weeks ahead." more={{ label: 'Everything on', href: '/whats-on' }} stories={eventStories}>
          <KindPills />
        </StorySpread>

        <GuideAd />

        <StorySpread title="Tours & experiences" intro="Out with a local guide, on foot, by boat or by bike." more={{ label: 'All tours & experiences', href: '/tours' }} stories={tourStories} cards />

        <StorySpread title="Exhibitions" intro="On now in Jersey’s galleries and museums." more={{ label: 'Everything on, ongoing too', href: '/whats-on?ongoing=1' }} stories={exhibitionStories} cards />

        <StorySpread title="New this season" intro="Opened in the last few months: new places to eat, shop, stay and explore." more={{ label: 'All venues', href: '/venues' }} stories={newStories} cards />

        <StorySpread title="Places to go" intro="From the pages of the Visitor Guide." more={{ label: 'All venues', href: '/venues' }} stories={placeStories} cards />
      </div>
    </>
  );
}
