import '@fontsource-variable/google-sans-flex/wdth.css';
import Link from 'next/link';
import { and, asc, eq, isNotNull } from 'drizzle-orm';
import { Frame, type Section } from '@/components/guide/book';
import { IslandSpreadArt, TownSpreadArt, colourOf } from '@/components/guide/maps';
import { MapDownload } from '@/components/guide/map-download';
import islandData from '@/lib/maps/island.json';
import { db } from '@/lib/db';
import { PAGE_SWATCHES } from '@/lib/domain/guide-colours';
import { MAPS, places, type MapName } from '@/lib/db/schema';
import { editions } from '@/lib/guide';
import { MAP_TITLE } from '@/lib/domain/map-seed';
import { categoriesOf, mapItems, type MapItem } from '@/lib/maps';
import { one, type SearchParams } from '@/lib/params';
import { addMapEntry, fillTownMap, moveMapEntry, removeMapEntry, seedIslandMap, updateMapEntry } from './actions';

export const dynamic = 'force-dynamic';

const MAPS_SECTION: Section = { name: 'Maps', colour: PAGE_SWATCHES.maps.hex };

/** One page of a spread: the spread's artwork, shifted so this page shows its half. */
function Half({ art, side }: { art: React.ReactNode; side: 'left' | 'right' }) {
  return <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}><div style={{ position: 'absolute', top: 0, left: side === 'left' ? 0 : '-115mm', width: '230mm', height: '165mm' }}>{art}</div></div>;
}

/**
 * The guide's two maps, drawn from OpenStreetMap, as the guide prints them:
 * a spread each. Under the spread, the map's entries to change: add a venue
 * or a place of its own, reorder (the number is its place in its category),
 * name it on the map, or give it a pin.
 */
export default async function MapsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const asked = one(sp.map);
  const map: MapName = (MAPS as readonly string[]).includes(asked ?? '') ? (asked as MapName) : 'island';
  const first = Math.max(2, Math.min(400, Number(one(sp.page)) || 2));
  const left = first % 2 === 0 ? first : first + 1;
  const items = await mapItems(map);
  const categories = categoriesOf(map);
  const venues = await db
    .select({ name: places.name, slug: places.slug })
    .from(places)
    .where(and(eq(places.review, 'approved'), isNotNull(places.lat)))
    .orderBy(asc(places.name));
  const year = new Date().getFullYear();
  const today = new Date().toISOString().slice(0, 10);
  const coming = [...editions(year - 1), ...editions(year), ...editions(year + 1)].filter((e) => e.window.to >= today).slice(0, 5);
  const art = map === 'island' ? <IslandSpreadArt items={items} categories={categories} /> : <TownSpreadArt items={items} categories={categories} />;
  const missing = items.filter((i) => i.missing);
  const pill = (active: boolean) => `rounded-full border px-3 py-1 ${active ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 hover:bg-stone-100'}`;
  const cats = [...new Set([...categories, ...items.map((i) => i.category)])];

  return (
    <>
      <div className="no-print mb-6 space-y-3 rounded border border-stone-200 bg-white p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/guide" className="text-stone-500 hover:underline">Guide</Link>
          <span className="text-stone-400">/</span>
          {MAPS.map((m) => <Link key={m} href={`/admin/guide/maps?map=${m}`} className={pill(m === map)}>{MAP_TITLE[m]}</Link>)}
          <span className="ml-auto text-xs text-stone-500">For InDesign:</span>
          <a href={`/admin/guide/export/map-index.csv?map=${map}`} className="rounded border border-stone-300 px-3 py-1 hover:bg-stone-100">Index (CSV)</a>
          <MapDownload target="map-spread" name={map} />
        </div>
        <p className="text-xs text-stone-500">
          Drawn from OpenStreetMap (as of {islandData.osmDate ? new Date(islandData.osmDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'the last fetch'}; to refresh, run the Fetch OSM data workflow, then <code>pnpm maps:build</code>). Each entry sits where its venue is, unless it has a pin of its own. {map === 'st-helier' ? 'Grid references come from where each sits.' : 'Numbers run in each category, in the order below.'}
        </p>
        {missing.length > 0 && <p className="rounded bg-amber-50 px-3 py-2 text-amber-900">{missing.length} {missing.length === 1 ? 'entry has' : 'entries have'} no place on the map yet (underlined red in the index): give {missing.length === 1 ? 'it' : 'them'} a pin below. {missing.map((m) => m.label).join(' · ')}</p>}
      </div>

      <div className="gp-book" id="map-spread">
        <div className="gp-spread">
          <Frame n={left} page={{ section: MAPS_SECTION, bleed: true, body: <Half art={art} side="left" /> }} />
          <Frame n={left + 1} page={{ section: MAPS_SECTION, bleed: true, body: <Half art={art} side="right" /> }} />
        </div>
      </div>

      <div className="no-print mx-auto mt-8 max-w-4xl space-y-6 text-sm">
        {items.length === 0 && map === 'island' && (
          <form action={seedIslandMap} className="rounded border border-stone-200 bg-white p-4">
            <p className="mb-2">The island map has no entries yet. Start from the Summer 2026 guide&apos;s index: six categories of ten, matched to our venues.</p>
            <button type="submit" className="rounded bg-stone-900 px-3 py-1 text-white">Start from the Summer 2026 index</button>
          </form>
        )}
        {map === 'st-helier' && (
          <form action={fillTownMap} className="flex flex-wrap items-center gap-2 rounded border border-stone-200 bg-white p-4">
            <span className="mr-auto">Add every venue in town with space booked in</span>
            <select name="edition" className="rounded border border-stone-300 px-2 py-1">
              {coming.map((e) => <option key={e.name}>{e.name}</option>)}
            </select>
            <button type="submit" className="rounded bg-stone-900 px-3 py-1 text-white">Add booked venues</button>
            <span className="w-full text-xs text-stone-500">Only those not on the map already, under a heading by what they are. Move or remove any after.</span>
          </form>
        )}

        {cats.map((category) => {
          const rows = items.filter((i) => i.category === category);
          return (
            <section key={category} className="rounded border border-stone-200 bg-white p-4">
              <h2 className="mb-2 font-semibold" style={{ color: colourOf(category) }}>{category}</h2>
              <ol className="space-y-1">
                {rows.map((i, k) => <EntryRow key={i.id} i={i} first={k === 0} last={k === rows.length - 1} map={map} />)}
              </ol>
              <form action={addMapEntry} className="mt-3 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">
                <input type="hidden" name="map" value={map} />
                <input type="hidden" name="category" value={category} />
                <input name="venue" list="map-venues" placeholder="A venue, or a name of its own" className="w-64 rounded border border-stone-300 px-2 py-1" />
                <input name="pin" placeholder="Pin: 49.2295, -2.0739 (if not a venue)" className="w-64 rounded border border-stone-300 px-2 py-1" />
                <button type="submit" className="rounded border border-stone-300 px-3 py-1 hover:bg-stone-100">Add</button>
              </form>
            </section>
          );
        })}
        <form action={addMapEntry} className="flex flex-wrap items-center gap-2 rounded border border-dashed border-stone-300 p-4">
          <input type="hidden" name="map" value={map} />
          <span>New heading</span>
          <input name="category" placeholder="Heading" className="w-40 rounded border border-stone-300 px-2 py-1" />
          <input name="venue" list="map-venues" placeholder="Its first venue" className="w-64 rounded border border-stone-300 px-2 py-1" />
          <input name="pin" placeholder="Pin (if not a venue)" className="w-48 rounded border border-stone-300 px-2 py-1" />
          <button type="submit" className="rounded border border-stone-300 px-3 py-1 hover:bg-stone-100">Add</button>
        </form>
        <datalist id="map-venues">
          {venues.map((v) => <option key={v.slug} value={v.name} />)}
        </datalist>
      </div>
    </>
  );
}

function EntryRow({ i, first, last, map }: { i: MapItem; first: boolean; last: boolean; map: MapName }) {
  const pin = i.pinned && i.lat !== null ? `${i.lat}, ${i.lon}` : '';
  return (
    <li className="flex flex-wrap items-center gap-2">
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: colourOf(i.category) }}>{i.n}</span>
      {(['up', 'down'] as const).map((by) => (
        <form key={by} action={moveMapEntry}>
          <input type="hidden" name="id" value={i.id} />
          <input type="hidden" name="by" value={by} />
          <button type="submit" disabled={by === 'up' ? first : last} className="px-0.5 text-stone-500 hover:text-stone-900 disabled:opacity-30" aria-label={by === 'up' ? 'Move up' : 'Move down'}>{by === 'up' ? '↑' : '↓'}</button>
        </form>
      ))}
      <form action={updateMapEntry} className="flex flex-1 flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={i.id} />
        <input name="label" defaultValue={i.label} className="w-56 rounded border border-stone-300 px-2 py-0.5" />
        {i.slug ? <Link href={`/admin/venues/${i.slug}`} className="text-xs text-stone-500 hover:underline">venue</Link> : <span className="text-xs text-stone-400">own pin</span>}
        <input name="pin" defaultValue={pin} placeholder={i.slug ? 'Pin to move it' : 'Pin: lat, lon'} className={`w-44 rounded border px-2 py-0.5 text-xs ${i.missing ? 'border-red-400 bg-red-50' : 'border-stone-300'}`} />
        {map === 'island' && (
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="labelled" value="1" defaultChecked={i.labelled} /> named on the map</label>
        )}
        {i.ref && <span className="text-xs font-semibold">{i.ref}</span>}
        <button type="submit" className="rounded border border-stone-300 px-2 py-0.5 text-xs hover:bg-stone-100">Save</button>
      </form>
      <form action={removeMapEntry}>
        <input type="hidden" name="id" value={i.id} />
        <button type="submit" className="text-xs text-red-700 hover:underline">Remove</button>
      </form>
    </li>
  );
}
