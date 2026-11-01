'use client';

import { BadgeCheck, Clock, Globe, MapPin, Phone } from 'lucide-react';
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { tourWhen, type GuideEvent, type GuideTour, type GuideVenue, type Layout, type TourLayout, type AreaKey, type VenueCell, type VenueSection } from '@/lib/domain/guide-entry';
import type { GuideProvider, LookingAhead } from '@/lib/guide';
import { monthName } from '@/lib/domain/opening';
import { sectionSwatch, tint } from '@/lib/domain/guide-colours';
import { iconsFor, ListingIcons, PageKey } from './key-icons';
import { SIDE_TITLE, type DoBox, type DoSection } from '@/lib/domain/do-section';

/**
 * The guide's pages as the 2026 editions print them, from the InDesign
 * merge files: 230 × 165mm spreads of two 115 × 165mm pages. Events on a
 * two-column grid, orange; walks and tours in one ruled
 * column, green, after the providers' key. A coloured tab and the folio
 * on each outer edge. Proxima Nova where the browser has it (Adobe
 * Fonts), Barlow Semi Condensed where it does not.
 *
 * Events six to a page, the pictured pair across the top and four
 * listings under them; or on a grid of six or eight boxes, one of them a
 * picture beside its listing. Event cells are fixed, as the merge frames are; tours and the key flow,
 * so they are measured here and poured page by page. What will not fit a
 * frame is outlined red on screen, as InDesign marks overset text.
 */

export type Section = { name: string; colour: string };
const EVENTS: Section = { name: 'Events this season', colour: '#f58353' };
const TOURS: Section = { name: 'Walks and tours', colour: '#add581' };
/** A venue section in its own colour (lib/domain/guide-colours), the same on its tab and in its entries. */
const venueSection = (name: string): Section => ({ name, colour: sectionSwatch(name).hex });

/** A page marker: a second tab under the section's, naming the part of the section the page is in. */
type Page = { section: Section; body: ReactNode; bleed?: boolean; marker?: string; key?: ReturnType<typeof iconsFor> };

/** Content height of a flowing page, in mm: 8.5mm from the top to 150mm. */
const FLOW_MM = 141.5;
const MM = 96 / 25.4;

function Folio({ n, side }: { n: number; side: 'left' | 'right' }) {
  return <div className={`gp-folio gp-${side}`}><span>{n}</span></div>;
}

function Frame({ page, n }: { page: Page; n: number }) {
  const side = n % 2 === 0 ? 'left' : 'right';
  return (
    <div className={`gp-page gp-${side}${page.bleed ? ' gp-bleed' : ''}`} style={{ '--gp-accent': page.section.colour, '--gp-tint20': tint(page.section.colour, 20), '--gp-tint60': tint(page.section.colour, 60) } as React.CSSProperties}>
      <div className={`gp-tab gp-${side}`} style={{ background: page.section.colour }}><span>{page.section.name}</span></div>
      {page.marker && <div className={`gp-tab gp-marker gp-${side}`}><span>{page.marker}</span></div>}
      {page.key && <PageKey icons={page.key} side={side} below={page.marker ? 'marker' : 'tab'} />}
      <Folio n={n} side={side} />
      {page.body}
    </div>
  );
}

/**
 * A fixed frame that fits its own copy: it tries the fullest version,
 * measures, and steps to the next shorter until one fits, again once the
 * typeface has loaded. A sentence matters more than the phone number, so
 * if none fits with the phone line, it tries again without it. Overset
 * only if even the dates, title and venue will not fit.
 */
function EventCell({ e }: { e: GuideEvent }) {
  if (e.frame === 'image') return <PictureBox e={e} />;
  return <ListingCell e={e} />;
}

/** A grid's picture box: the whole cell, cropped to fill. */
function PictureBox({ e }: { e: { title: string; preview: string } }) {
  // A picture that will not load is marked as overset text is, so it is not missed in the proof.
  const [broken, setBroken] = useState(false);
  return (
    <figure className={`gp-event gp-image${broken ? ' gp-overset' : ''}`} title={broken ? `This picture did not load: ${e.title}` : e.title}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={e.preview.replace(/w_520,h_182/, 'w_520,h_520')} alt="" onError={() => setBroken(true)} />
    </figure>
  );
}

/**
 * A fixed frame's copy, measured: the fullest version first, then each
 * shorter one, then all of them again without the droppable line.
 */
function useFit(copies: string[], droppable: boolean) {
  const ref = useRef<HTMLElement>(null);
  const said = copies.filter(Boolean);
  const options: [string, boolean][] = [...said.map((c): [string, boolean] => [c, true]), ...(droppable ? said.map((c): [string, boolean] => [c, false]) : []), ['', true]];
  const [pick, setPick] = useState(0);
  const [fonts, setFonts] = useState(false);
  const [overset, setOverset] = useState(false);
  useEffect(() => {
    void document.fonts.ready.then(() => {
      setPick(0);
      setFonts(true);
    });
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const over = el.scrollHeight > el.clientHeight + 1;
    if (over && pick < options.length - 1) setPick(pick + 1);
    else setOverset(over);
  }, [pick, fonts, options.length]);
  const [copy, keep] = options[pick] ?? ['', true];
  return { ref, copy, keep, overset };
}

const OVERSET = 'Overset: this entry will not fit its frame';

function ListingCell({ e }: { e: GuideEvent }) {
  const { ref, copy, keep: withContact, overset } = useFit(e.options.length ? e.options : [e.copy], !!e.contact);
  return (
    <article ref={ref} className={`gp-event gp-${e.frame}${overset ? ' gp-overset' : ''}`} title={overset ? OVERSET : undefined}>
      {e.frame === 'picture' && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={e.preview} alt="" className="gp-event-image" />
      )}
      <p className="gp-event-when"><ListingIcons icons={iconsFor(e)} />{e.dates}{e.times && <em>{e.times}</em>}</p>
      <h4 className="gp-event-title">{e.title}</h4>
      <p className="gp-event-copy">{copy} {e.price && <span className="gp-price">{e.price}</span>}</p>
      {e.venue && <p className="gp-event-venue"><MapPin aria-hidden="true" />{e.venue}</p>}
      {e.address && <p className="gp-event-address">{e.address}</p>}
      {e.contact && withContact && <p className="gp-event-contact">{e.contact}</p>}
      {e.website && <p className="gp-event-web">{e.website}</p>}
    </article>
  );
}

/** A tour on the grid: when, or its genre on the on-demand pages; the title; the copy; the provider's code, found in the key, and the duration. */
function TourBox({ t }: { t: GuideTour }) {
  const { ref, copy, overset } = useFit(t.options.length ? t.options : [t.copy], false);
  if (t.frame === 'image') return <PictureBox e={t} />;
  return (
    <article ref={ref} className={`gp-event gp-listing gp-tour-box${overset ? ' gp-overset' : ''}`} title={overset ? OVERSET : t.provider}>
      <p className="gp-event-when"><ListingIcons icons={iconsFor(t)} />{tourWhen(t)}{t.times && <em>{t.times}</em>}</p>
      <h4 className="gp-event-title">{t.title}</h4>
      <p className="gp-event-copy">{copy}</p>
      <p className="gp-tour-meta">
        {t.code ? <span className="gp-code"><BadgeCheck aria-hidden="true" />{t.code}</span> : <span className="gp-code">{t.provider}</span>}
        {t.duration && <span className="gp-duration"><Clock aria-hidden="true" />{t.duration}</span>}
      </p>
    </article>
  );
}

/** The section's first page: a picture across it and the section's name. */
function Opener({ e }: { e: GuideEvent | undefined }) {
  return (
    <div className="gp-opener">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {e?.preview && <img src={e.preview.replace(/w_520,h_182/, 'w_1000,h_1440')} alt="" />}
      <h2>Events<br />this season</h2>
      {e && <p className="gp-caption">{e.dates} : &lsquo;{e.title}&rsquo;</p>}
    </div>
  );
}

function HighlightBody({ e }: { e: GuideEvent }) {
  return (
    <div className="gp-content gp-highlight">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {e.preview && <img src={e.preview.replace(/w_520,h_182/, 'w_1000,h_700')} alt="" className="gp-highlight-image" />}
      <p className="gp-event-when">{e.dates}{e.times && <em>{e.times}</em>}</p>
      <h3 className="gp-highlight-title">{e.title}</h3>
      <div className="gp-highlight-copy">{e.extendedCopy.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</div>
      {e.price && <p className="gp-price">{e.price}</p>}
      {e.venue && <p className="gp-event-venue"><MapPin aria-hidden="true" />{e.venue}</p>}
      {e.address && <p className="gp-event-address">{e.address}</p>}
      {e.website && <p className="gp-event-web">{e.website}</p>}
    </div>
  );
}

function TourEntry({ t }: { t: GuideTour }) {
  return (
    <article className="gp-tour">
      <p className="gp-tour-head">
        {t.dates && <b>{t.dates}</b>} <span className="gp-tour-title">{t.title}</span>
        {t.code && <span className="gp-code"><BadgeCheck aria-hidden="true" />{t.code}</span>}
        {t.duration && <span className="gp-duration"><Clock aria-hidden="true" />{t.duration}</span>}
        {t.times && <span className="gp-duration">{t.times}</span>}
      </p>
      <p className="gp-tour-copy">{t.copy}</p>
    </article>
  );
}

function ProviderRow({ p }: { p: GuideProvider }) {
  return (
    <p className="gp-provider">
      <BadgeCheck aria-hidden="true" /><b>{p.code || '??'}</b> {p.name} <strong>{p.contact}</strong> <em>{p.website}</em>
    </p>
  );
}

/** A venue's contact, as the full page prints it: phone, email, website; then where. */
function VenueFoot({ v }: { v: GuideVenue }) {
  return (
    <div className="gp-venue-foot">
      <p>
        {v.phone && <b><Phone aria-hidden="true" />{v.phone}</b>}
        {v.email && <em>{v.email}</em>}
        {v.website && <strong><Globe aria-hidden="true" />{v.website}</strong>}
      </p>
      {v.address && <p className="gp-venue-where"><MapPin aria-hidden="true" />{v.address}</p>}
      {v.opening && <p className="gp-venue-open"><Clock aria-hidden="true" />{v.opening}</p>}
    </div>
  );
}

/** A full-page venue: its picture with the label on it, the name, the copy (the first paragraph standing out), and how to find it. */
function VenueFullBody({ v }: { v: GuideVenue }) {
  // The copy as written, paragraphs and all: a full page has room for it.
  const paras = v.copy.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return (
    <div className="gp-content gp-venue-full">
      <div className="gp-venue-picture">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {v.preview && <img src={v.preview} alt="" />}
        {v.label && <span className="gp-venue-label">{v.label}</span>}
      </div>
      <h3 className="gp-venue-name gp-venue-name-big">
        {v.name}
        {v.isNew && <span className="gp-venue-tag gp-venue-new">NEW</span>}
      </h3>
      <div className="gp-venue-copy">{paras.map((p, i) => <p key={i} className={i === 0 && paras.length > 1 ? 'gp-standfirst' : undefined}>{p}</p>)}</div>
      <VenueFoot v={v} />
    </div>
  );
}

/**
 * A venue on the grid: a listing in one box; a quarter across both
 * columns for a row, its picture beside its copy; a half or
 * three-quarters across for two or three rows, its picture above. Copy
 * fitted as the events' is.
 */
function VenueBox({ c }: { c: VenueCell }) {
  const contact = [c.address, c.phone].filter(Boolean).join(' · ');
  // Where it is, apart, so the grid of sixteen's small boxes can leave it to the area marker.
  const where = c.address && c.phone ? <span className="gp-venue-where-line">{c.address} · </span> : c.address;
  const { ref, copy, keep, overset } = useFit(c.options.length ? c.options : [c.copy], !!contact);
  const text = (
    <>
      <p className="gp-venue-head">
        <span className="gp-venue-name">{c.name}</span>
        {c.isNew && <span className="gp-venue-tag gp-venue-new">NEW</span>}
        {c.label && <span className="gp-venue-tag">{c.label}</span>}
        <AreaCode code={c.areaCode} />
      </p>
      <p className="gp-event-copy">{copy}</p>
      {contact && keep && <p className="gp-event-address">{where}{c.phone}</p>}
      {c.website && <p className="gp-event-web">{c.website}</p>}
      {c.frame !== 'listing' && c.opening && <p className="gp-venue-open"><Clock aria-hidden="true" />{c.opening}</p>}
    </>
  );
  return (
    <article ref={ref} className={`gp-event gp-venue gp-venue-${c.frame}${overset ? ' gp-overset' : ''}`} title={overset ? OVERSET : undefined}>
      {c.frame !== 'listing' && c.preview && (
        <div className="gp-venue-picture">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.preview} alt="" />
        </div>
      )}
      {c.frame === 'quarter' ? <div className="gp-venue-text">{text}</div> : text}
    </article>
  );
}

/** A line in Looking ahead: the month it opens again, its name, its line, and how and when to visit; a client's picture beside. */
function AheadRow({ r }: { r: LookingAhead }) {
  return (
    <div className={`gp-ahead-row${r.thumb ? ' gp-ahead-pictured' : ''}`}>
      <span className="gp-ahead-when">{monthName(r.reopens)}</span>
      <div>
        <b>{r.name}</b>
        {r.line && <p className="gp-ahead-line">{r.line}</p>}
        <p className="gp-ahead-contact">{[r.opening, r.phone, r.website].filter(Boolean).join(' · ')}</p>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {r.thumb && <img src={r.thumb} alt="" className="gp-ahead-thumb" />}
    </div>
  );
}

/** An activity in Do: its name, its short piece, and the markers of the providers who offer it, found in the index. */
function DoBoxCell({ b, mixed }: { b: DoBox; mixed: boolean }) {
  const { ref, copy, overset } = useFit([b.blurb], false);
  if (b.frame === 'image') return <PictureBox e={{ title: b.name, preview: b.preview }} />;
  return (
    <article ref={ref} className={`gp-event gp-venue gp-do-box${overset ? ' gp-overset' : ''}`} title={overset ? OVERSET : undefined}>
      {/* Where the water gives way to land on a page, each box says which it is. */}
      {mixed && <p className="gp-do-side">{SIDE_TITLE[b.side]}</p>}
      <h4 className="gp-venue-name gp-do-name">{b.name}</h4>
      <p className="gp-event-copy">{copy}</p>
      {b.codes.length > 0 && (
        <p className="gp-do-codes"><BadgeCheck aria-hidden="true" />{b.codes.join('  ')}</p>
      )}
    </article>
  );
}

/** A directory line: the name, and where and how to reach it. */
/** A venue's area, by its marker in the section's key. */
function AreaCode({ code }: { code?: string }) {
  return code ? <span className="gp-code gp-area-code"><MapPin aria-hidden="true" />{code}</span> : null;
}

/** The key to the area markers on a page, at its foot. */
function AreaFooter({ keys }: { keys: AreaKey[] }) {
  if (!keys.length) return null;
  return (
    <p className="gp-tour-footer gp-area-key">
      {keys.map((k) => <span key={k.code}><MapPin aria-hidden="true" /><b>{k.code}</b> {k.area}</span>)}
    </p>
  );
}

/** A page's marker: its one area, two of them, or the first to the last. */
function areaMarker(areas: string[]): string | undefined {
  const named = areas.filter(Boolean);
  if (named.length <= 2) return named.join(' · ') || undefined;
  return `${named[0]} – ${named.at(-1)}`;
}

/** A line in a section's index: where (by its area's marker), the name, what kind of place, and the phone. */
function DirectoryLine({ v }: { v: GuideVenue }) {
  return (
    <p className="gp-directory">
      <span className="gp-directory-head">
        <AreaCode code={v.areaCode} />
        <b>{v.name}</b>
        {v.isNew && <span className="gp-venue-tag gp-venue-new">NEW</span>}
      </span>
      <span className="gp-directory-more">{[v.label && v.label.charAt(0) + v.label.slice(1).toLowerCase(), v.phone || v.website].filter(Boolean).join(' · ')}</span>
    </p>
  );
}

function TourHeading({ over, title, rest }: { over: string; title: string; rest: string }) {
  return (
    <div className="gp-tour-heading">
      <p>{over}</p>
      <h3><b>{title}</b> {rest}</h3>
    </div>
  );
}

/** A flowing item; one that starts a group (a venue section's area) starts a new page. */
type Flow = { key: string; node: ReactNode; heading?: boolean; group?: string; startsGroup?: boolean; venue?: GuideVenue };

/**
 * Pours flowing items into pages of FLOW_MM: each is measured at the
 * page's width, and a heading is never left at the foot of a page.
 */
function usePoured(items: Flow[], narrow = false): [Flow[][] | null, ReactNode] {
  const ref = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<Flow[][] | null>(null);
  useLayoutEffect(() => {
    let cancelled = false;
    const pour = () => {
      const el = ref.current;
      if (!el || cancelled) return;
      const heights = [...el.children].map((c) => (c as HTMLElement).offsetHeight);
      // An index column stops short of the key at the page's foot.
      const max = (narrow ? FLOW_MM - 9 : FLOW_MM) * MM;
      const out: Flow[][] = [[]];
      let used = 0;
      items.forEach((item, i) => {
        const h = heights[i] ?? 0;
        const next = items[i + 1];
        const needed = item.heading && next ? h + (heights[i + 1] ?? 0) : h;
        if (used > 0 && (used + needed > max || item.startsGroup)) {
          out.push([]);
          used = 0;
        }
        out.at(-1)!.push(item);
        used += h;
      });
      setPages(out.filter((p) => p.length));
    };
    // Measure once the type is in, or the pages are cut for the wrong font.
    void document.fonts.ready.then(pour);
    return () => {
      cancelled = true;
    };
  }, [items]);
  const measure = (
    <div ref={ref} className={`gp-measure${narrow ? ' gp-measure-narrow' : ''}`} aria-hidden="true">
      {items.map((i) => <Fragment key={i.key}>{i.node}</Fragment>)}
    </div>
  );
  return [pages, pages ? null : measure];
}

export function GuideBook(props: {
  highlights: GuideEvent[];
  events: GuideEvent[];
  pages: GuideEvent[][];
  /** Ongoing events, on pages of their own after the dated ones. */
  ongoingPages?: GuideEvent[][];
  layout: Layout;
  tours: GuideTour[];
  /** On a grid, the tours a page at a time after the key; otherwise they flow. */
  tourGrid: GuideTour[][] | null;
  /** Which grid the tours are on, when they are. */
  tourLayout: TourLayout;
  providers: GuideProvider[];
  venues: GuideVenue[];
  /** The venue sections, laid out: pages per area, and the directory lines that follow them. */
  venueSections: VenueSection[];
  /** The attractions closed for part of the edition, after Visit's pages; none in summer. */
  lookingAhead?: LookingAhead[];
  /** Do's activities and providers' key, after Do's venue pages. */
  doSection?: DoSection | null;
  firstPage: number;
}) {
  const { highlights, events, tours, providers, layout, tourGrid } = props;

  // Walks and tours flow: the key, then dated tours, then on-demand ones by genre.
  const [flow] = useState<Flow[]>(() => {
    const items: Flow[] = [];
    if (providers.length) {
      items.push({ key: 'key-h', heading: true, node: <h3 className="gp-key-heading">Tour Guides &amp; Activity Providers</h3> });
      providers.forEach((p) => items.push({ key: `p-${p.code}-${p.name}`, node: <ProviderRow p={p} /> }));
      items.push({ key: 'key-end', node: <div className="gp-break" /> });
    }
    // On the grid, the tours have pages of their own after the key, and each box says when or what kind.
    if (tourGrid) return items;
    const dated = tours.filter((t) => t.kind === 'dated');
    if (dated.length) {
      items.push({ key: 'dated-h', heading: true, node: <TourHeading over="Tours & Experiences" title="On" rest="specific dates" /> });
      dated.forEach((t, i) => items.push({ key: `d-${i}-${t.title}`, node: <TourEntry t={t} /> }));
    }
    const genres = [...new Set(tours.filter((t) => t.kind === 'on demand').map((t) => t.genre || 'Other'))];
    for (const g of genres) {
      items.push({ key: `g-${g}`, heading: true, node: <TourHeading over="Tours & Experiences" title="On demand" rest={g.toLowerCase()} /> });
      tours.filter((t) => t.kind === 'on demand' && (t.genre || 'Other') === g).forEach((t, i) => items.push({ key: `o-${g}-${i}-${t.title}`, node: <TourEntry t={t} /> }));
    }
    return items;
  });
  const [tourPages, measuring] = usePoured(flow);
  // Each section's directory lines flow onto pages of their own, after its grid pages, by area.
  const [dirFlow] = useState<Flow[]>(() =>
    props.venueSections.filter((s) => s.directory.length).flatMap((s) => {
      const group = s.section;
      return [
        { key: `dh-${group}`, group, startsGroup: true, heading: true, node: <h3 className="gp-directory-heading">{s.section}: index</h3> },
        ...s.directory.map((v, i) => ({ key: `dl-${group}-${i}-${v.name}`, group, venue: v, node: <DirectoryLine v={v} /> })),
      ];
    }),
  );
  // Do's key, as the tour guides' is: each provider's marker, name and contact.
  const [doFlow] = useState<Flow[]>(() => {
    const ps = props.doSection?.providers ?? [];
    if (!ps.length) return [];
    return [
      { key: 'do-key-h', heading: true, node: <h3 className="gp-key-heading">Activity Providers</h3> },
      ...ps.map((p) => ({ key: `do-${p.code}-${p.name}`, node: <ProviderRow p={{ code: p.code, name: p.name, contact: p.phone, website: p.website }} /> })),
    ];
  });
  const [doKeyPages, measuringDo] = usePoured(doFlow);
  // Looking ahead flows like the keys: its heading, a word on what it is, then the attractions.
  const [aheadFlow] = useState<Flow[]>(() => {
    const rows = props.lookingAhead ?? [];
    if (!rows.length) return [];
    return [
      { key: 'ahead-h', heading: true, node: <div><h3 className="gp-key-heading">Looking ahead</h3><p className="gp-ahead-intro">Closed for the winter, these attractions open again in the new season.</p></div> },
      ...rows.map((r) => ({ key: `ahead-${r.name}`, node: <AheadRow r={r} /> })),
    ];
  });
  const [aheadPages, measuringAhead] = usePoured(aheadFlow);
  // Poured a column at a time; two columns to a page, each section's index from a fresh page.
  const [dirColumns, measuringDir] = usePoured(dirFlow, true);
  const dirPages: Flow[][][] = [];
  for (const col of dirColumns ?? []) {
    const last = dirPages.at(-1);
    if (!last || last.length === 2 || col[0]?.startsGroup || last[0]?.[0]?.group !== col[0]?.group) dirPages.push([col]);
    else last.push(col);
  }

  // The opener's picture: the first highlight's, else the first event with its own picture.
  const lead = highlights.find((e) => e.preview) ?? events.find((e) => e.preview);
  const pages: Page[] = [];
  if (events.length || highlights.length || props.ongoingPages?.length) pages.push({ section: EVENTS, bleed: true, body: <Opener e={lead} /> });
  for (const h of highlights) pages.push({ section: EVENTS, body: <HighlightBody e={h} /> });
  for (const cells of props.pages) {
    pages.push({
      section: EVENTS,
      key: cells.filter((e) => e.frame !== 'image').flatMap((e) => iconsFor(e)),
      body: (
        <div className={`gp-content gp-grid gp-${layout}`}>
          {cells.map((e) => <EventCell key={e.frame + e.title + e.sortKey} e={e} />)}
        </div>
      ),
    });
  }
  // Ongoing events: exhibitions and the like, on for weeks or months, apart from the dated listings.
  for (const cells of props.ongoingPages ?? []) {
    pages.push({
      section: EVENTS,
      marker: 'Ongoing events',
      key: cells.filter((e) => e.frame !== 'image').flatMap((e) => iconsFor(e)),
      body: (
        <div className={`gp-content gp-grid gp-${layout}`}>
          {cells.map((e) => <EventCell key={e.frame + e.title + e.sortKey} e={e} />)}
        </div>
      ),
    });
  }
  // The key to every provider's marker, tours' and Do's, where the tours open; Do keeps a key of its own only when no tours print.
  let sharedKey: number | null = null;
  // Tours start on a left-hand page, as a section does in the guide.
  if (tourPages && (tourPages.length || tourGrid?.length)) {
    if ((props.firstPage + pages.length) % 2 === 1) pages.push({ section: EVENTS, body: <div className="gp-content" /> });
    for (const items of tourPages) pages.push({ section: TOURS, body: <div className="gp-content gp-flow">{items.map((i) => <Fragment key={i.key}>{i.node}</Fragment>)}</div> });
    // The key opens the section: every tour page sends the reader back to it.
    const keyPage = props.firstPage + pages.length - tourPages.length;
    if (providers.length && tourPages.length) sharedKey = keyPage;
    for (const cells of tourGrid ?? []) {
      pages.push({
        section: TOURS,
        marker: cells[0]?.kind === 'dated' ? 'On specific dates' : 'On demand',
        key: cells.filter((t) => t.frame !== 'image').flatMap((t) => iconsFor(t)),
        body: (
          <>
            <div className={`gp-content gp-grid gp-${props.tourLayout} gp-tour-grid`}>
              {cells.map((t) => <TourBox key={t.frame + t.title + t.sortKey + t.dates} t={t} />)}
            </div>
            {providers.length > 0 && <p className="gp-tour-footer"><BadgeCheck aria-hidden="true" />Locate guide on index page {keyPage}</p>}
          </>
        ),
      });
    }
  }

  // The venue sections, each from a left-hand page and running on: full pages, grid pages, then the directory. Each page keys the areas on it.
  for (const vs of props.venueSections) {
    const section = venueSection(vs.section);
    if ((props.firstPage + pages.length) % 2 === 1) pages.push({ section: pages.at(-1)?.section ?? section, body: <div className="gp-content" /> });
    const keyed = (vs: VenueSection, on: GuideVenue[]) => {
      const here = new Set(on.map((v) => v.area));
      const keys = vs.key.filter((k) => here.has(k.area));
      return { marker: areaMarker(keys.map((k) => k.area)), foot: <AreaFooter keys={keys} /> };
    };
    for (const p of vs.pages) {
      const { marker, foot } = keyed(vs, p.kind === 'full' ? [p.venue] : p.cells);
      pages.push(
        p.kind === 'full'
          ? { section, marker, body: <VenueFullBody v={p.venue} /> }
          : { section, marker, body: <><div className={`gp-content gp-grid gp-${vs.grid} gp-venue-grid`}>{p.cells.map((c) => <VenueBox key={c.frame + c.name} c={c} />)}</div>{foot}</> },
      );
    }
    for (const cols of dirPages.filter((pg) => pg[0]?.[0]?.group === vs.section)) {
      const { marker, foot } = keyed(vs, cols.flat().flatMap((i) => (i.venue ? [i.venue] : [])));
      pages.push({
        section,
        marker,
        body: (
          <>
            <div className="gp-content gp-index">
              {cols.map((items, c) => <div key={c} className="gp-flow">{items.map((i) => <Fragment key={i.key}>{i.node}</Fragment>)}</div>)}
            </div>
            {foot}
          </>
        ),
      });
    }
    if (vs.section === 'Visit') {
      for (const items of aheadPages ?? []) pages.push({ section, marker: 'Looking ahead', body: <div className="gp-content gp-flow gp-ahead">{items.map((i) => <Fragment key={i.key}>{i.node}</Fragment>)}</div> });
    }
    // Do by activity: on the water, then on land, running on, a picture a page; then who offers what.
    const ds = props.doSection;
    if (vs.section === 'Do' && ds) {
      // Every activity page sends the reader to the key: the tours', else Do's own after the activities.
      const keyPage = sharedKey ?? props.firstPage + pages.length + ds.pages.length;
      for (const pg of ds.pages) {
        pages.push({
          section,
          marker: pg.sides.map((side) => SIDE_TITLE[side]).join(' · '),
          body: (
            <>
              <div className={`gp-content gp-grid gp-${ds.grid} gp-venue-grid gp-do-grid`}>{pg.cells.map((b) => <DoBoxCell key={b.frame + b.slug} b={b} mixed={pg.sides.length > 1} />)}</div>
              {ds.providers.length > 0 && <p className="gp-tour-footer"><BadgeCheck aria-hidden="true" />Locate provider on page {keyPage}</p>}
            </>
          ),
        });
      }
      for (const items of sharedKey ? [] : doKeyPages ?? []) {
        pages.push({ section, marker: 'Providers', body: <div className="gp-content gp-flow">{items.map((i) => <Fragment key={i.key}>{i.node}</Fragment>)}</div> });
      }
    }
  }

  // Into spreads: the first page faces left or right by its number.
  const numbered = pages.map((p, i) => ({ page: p, n: props.firstPage + i }));
  const spreads: (typeof numbered[number] | null)[][] = [];
  let k = 0;
  if (numbered[0] && numbered[0].n % 2 === 1) spreads.push([null, numbered[k++]!]);
  for (; k < numbered.length; k += 2) spreads.push([numbered[k]!, numbered[k + 1] ?? null]);

  return (
    <div className="gp-book">
      {measuring}
      {measuringDir}
      {measuringDo}
      {measuringAhead}
      {!tourPages && tours.length > 0 && <p className="no-print text-sm text-stone-500">Laying out the tours…</p>}
      {spreads.map((pair, i) => (
        <div key={i} className="gp-spread">
          {pair.map((x, j) => (x ? <Frame key={x.n} page={x.page} n={x.n} /> : <div key={`blank-${j}`} className="gp-page gp-blank" />))}
        </div>
      ))}
    </div>
  );
}
