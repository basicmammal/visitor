import '@fontsource-variable/google-sans-flex/wdth.css';
import Link from 'next/link';
import { GuideBook } from '@/components/guide/book';
import { budgetFor, layoutsFrom, layoutsQuery, type GuideLayouts } from '@/lib/domain/guide-entry';
import { includeDraft } from '@/app/actions';
import { buildGuide, editions, isDraft, windowFrom } from '@/lib/guide';
import { one, type SearchParams } from '@/lib/params';

export const dynamic = 'force-dynamic';

/**
 * The selection as the guide prints it: the pocket page (115 × 165mm),
 * entries in the printed field order, built by the same code as the
 * InDesign export. This is the proof; the export is what gets merged.
 */
export default async function Guide({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const window = windowFrom({ from: one(sp.from), to: one(sp.to) });
  // A draft lays out everything eligible; with nothing chosen yet, it is where the page starts.
  const asked = one(sp.draft);
  const layouts = layoutsFrom((k) => one(sp[k]));
  const layout = layouts.events;
  let draft = isDraft(asked);
  let guide = await buildGuide(window, { draft, layouts });
  if (asked === undefined && !draft && !guide.events.length && !guide.tours.length && !guide.highlights.length) {
    draft = true;
    guide = await buildGuide(window, { draft, layouts });
  }
  const { highlights, events, pages, tours, tourPages, providers, venues, sections, leftOut } = guide;
  const listed = events.filter((e) => e.frame !== 'image').length;
  const tq = layoutsQuery(layouts);
  const qs = `from=${window.from}&to=${window.to}${draft ? '&draft=1' : ''}${tq ? `&${tq}` : ''}`;
  const year = Number(window.from.slice(0, 4));
  // Where What's On starts in the printed guide; the 2026 editions open it on page 36.
  const firstPage = Math.max(1, Math.min(400, Number(one(sp.page)) || 36));
  const presets = [...editions(year - 1).slice(3), ...editions(year), ...editions(year + 1).slice(0, 2)];
  const href = (w: { from: string; to: string }, d = draft, l: GuideLayouts = layouts) => {
    const t = layoutsQuery(l);
    return `/admin/guide?from=${w.from}&to=${w.to}&draft=${d ? 1 : 0}${t ? `&${t}` : ''}`;
  };
  const with_ = (patch: Partial<GuideLayouts>) => href(window, draft, { ...layouts, ...patch });
  const eventLayouts = [['top', 'Pictures on top'], ['grid6', 'Grid of 6'], ['grid8', 'Grid of 8'], ['grid16', 'Grid of 16']] as const;
  const tourLayouts = [['columns', 'Ruled columns'], ['grid8', 'Grid of 8'], ['grid12', 'Grid of 12'], ['grid16', 'Grid of 16']] as const;
  const venueGrids = [['grid8', 'Grid of 8'], ['grid16', 'Grid of 16']] as const;
  const pill = (active: boolean) => `rounded-full border px-3 py-1 ${active ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 hover:bg-stone-100'}`;

  return (
    <>
      <div className="no-print mb-6 space-y-3 rounded border border-stone-200 bg-white p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-stone-500">Edition</span>
          {presets.map((p) => (
            <Link key={p.name} href={href(p.window)} className={pill(p.window.from === window.from && p.window.to === window.to)}>{p.name}</Link>
          ))}
        </div>
        <form action="/admin/guide" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="draft" value={draft ? '1' : '0'} />
          {[...new URLSearchParams(tq)].map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <label className="flex flex-col">
            <span className="text-xs text-stone-500">From</span>
            <input type="date" name="from" defaultValue={window.from} className="rounded border border-stone-300 px-2 py-1" />
          </label>
          <label className="flex flex-col">
            <span className="text-xs text-stone-500">to</span>
            <input type="date" name="to" defaultValue={window.to} className="rounded border border-stone-300 px-2 py-1" />
          </label>
          <label className="flex flex-col">
            <span className="text-xs text-stone-500">First page</span>
            <input type="number" name="page" min={1} max={400} defaultValue={firstPage} className="w-20 rounded border border-stone-300 px-2 py-1" />
          </label>
          <button type="submit" className="rounded bg-stone-900 px-3 py-1 text-white">Show</button>
          <span className="ml-auto flex gap-1">
            <Link href={href(window, false)} className={pill(!draft)}>Selected</Link>
            <Link href={href(window, true)} className={pill(draft)}>Draft: everything eligible</Link>
          </span>
        </form>
        <div className="space-y-1.5">
          <p className="text-xs text-stone-500">Template, section by section. On a grid each page&apos;s picture box shows the event or tour ticked &lsquo;Use its picture in the guide grid&rsquo;, else the first with its own photograph. A venue&apos;s booked space is the same share of a page on either grid; the grid sets the size of the listings around it. Pages for listings rations the places without booked space: those featured or printed before keep a box, the rest go to the section&apos;s index.</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-24 text-xs text-stone-500">What&apos;s On</span>
            {eventLayouts.map(([g, label]) => <Link key={g} href={with_({ events: g })} className={pill(layouts.events === g)}>{label}</Link>)}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-24 text-xs text-stone-500">Tours: dated</span>
            {tourLayouts.map(([g, label]) => <Link key={g} href={with_({ tours: g })} className={pill(layouts.tours === g)}>{label}</Link>)}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-24 text-xs text-stone-500">Tours: on demand</span>
            {tourLayouts.map(([g, label]) => <Link key={g} href={with_({ ongoing: g })} className={pill(layouts.ongoing === g)}>{label}</Link>)}
          </div>
          {sections.map((s) => (
            <div key={s.section} className="flex flex-wrap items-center gap-2">
              <span className="w-24 text-xs text-stone-500">{s.section}</span>
              {venueGrids.map(([g, label]) => <Link key={g} href={with_({ venues: { ...layouts.venues, [s.section]: g } })} className={pill(s.grid === g)}>{label}</Link>)}
              <span className="ml-3 text-xs text-stone-500">Pages for listings</span>
              {([null, 0, 1, 2, 3, 4, 6] as const).map((n) => (
                <Link key={String(n)} href={with_({ budgets: { ...layouts.budgets, [s.section]: n } })} className={pill(budgetFor(layouts, s.section) === n)}>{n === null ? 'All' : n}</Link>
              ))}
              <span className="text-xs text-stone-500">
                {s.pages.flatMap((p) => (p.kind === 'grid' ? p.cells : [])).filter((c) => c.frame === 'listing').length} in boxes · {s.directory.length} in the index
              </span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-stone-600">{highlights.length} highlights · {listed} events · {pages.length} event pages{tourPages ? ` · ${tourPages.length} tour pages` : ''} · {tours.filter((t) => t.frame !== 'image').length} tours · {venues.length} venues</span>
          <span className="ml-auto self-center text-xs text-stone-500">For InDesign:</span>
          <a href={`/admin/guide/export/highlights.csv?${qs}`} className="rounded border border-stone-300 px-3 py-1 hover:bg-stone-100">Highlights</a>
          <a href={`/admin/guide/export/whats-on.csv?${qs}`} className="rounded border border-stone-300 px-3 py-1 hover:bg-stone-100">What&apos;s On</a>
          <a href={`/admin/guide/export/tours.csv?${qs}`} className="rounded border border-stone-300 px-3 py-1 hover:bg-stone-100">Tours</a>
          <a href={`/admin/guide/export/providers.csv?${qs}`} className="rounded border border-stone-300 px-3 py-1 hover:bg-stone-100">Tour providers</a>
          <a href={`/admin/guide/export/venues.csv?${qs}`} className="rounded border border-stone-300 px-3 py-1 hover:bg-stone-100">Venues</a>
          <Link href="/admin/guide/maps" className="rounded border border-stone-300 px-3 py-1 hover:bg-stone-100">Maps</Link>
        </div>
        {leftOut.length > 0 && (
          <details className="text-xs text-stone-600">
            <summary className="cursor-pointer">{leftOut.length} events left out of print as not aimed at visitors: training and work, business, and health and wellbeing</summary>
            <p className="mt-1">{leftOut.join(' · ')}</p>
            <p className="mt-1 text-stone-500">To print one, set its kinds by hand on its page: without Professional &amp; training or Business &amp; networking, and with Health &amp; wellbeing only alongside something visitors come for.</p>
          </details>
        )}
        {draft && (
          <div className="flex flex-wrap items-center gap-3 rounded bg-amber-50 px-3 py-2 text-amber-900">
            <p className="mr-auto">
              <strong>Draft.</strong> Every approved event and tour on in these dates that nobody has left out, business events aside. Leave out what should not print from
              {' '}<Link href="/admin/whats-on" className="underline">What&apos;s on</Link>, then make the rest the selection:
            </p>
            {(['events', 'tours'] as const).map((what) => (
              <form key={what} action={includeDraft}>
                <input type="hidden" name="from" value={window.from} />
                <input type="hidden" name="to" value={window.to} />
                <input type="hidden" name="what" value={what} />
                <button type="submit" className="rounded border border-amber-300 bg-white px-3 py-1 hover:bg-amber-100">Include all {what} shown</button>
              </form>
            ))}
          </div>
        )}
      </div>

      {events.length === 0 && tours.length === 0 && highlights.length === 0 && (
        <p className="guide-empty no-print">Nothing selected for these dates. Choose events on <Link href="/admin/whats-on">What&apos;s on</Link>, or look at the draft.</p>
      )}
      <GuideBook key={`${window.from}-${window.to}-${draft}-${firstPage}-${tq}`} highlights={highlights} events={events} pages={pages} ongoingPages={guide.ongoingPages} layout={layout} tours={tours} tourGrid={tourPages} tourLayouts={{ tours: layouts.tours, ongoing: layouts.ongoing }} providers={providers} venues={venues} venueSections={sections} doSection={guide.doSection} lookingAhead={guide.lookingAhead} newThisSeason={guide.newThisSeason} firstPage={firstPage} />

    </>
  );
}
