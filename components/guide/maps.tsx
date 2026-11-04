import { Fragment } from 'react';
import island from '@/lib/maps/island.json';
import town from '@/lib/maps/st-helier.json';
import { PALETTE, markerText } from '@/lib/domain/guide-colours';
import { ISLAND_FRAME, TOWN_FRAME, TOWN_GRID, project } from '@/lib/domain/map-frame';
import type { MapItem } from '@/lib/maps';

/**
 * The guide's two maps, drawn from OpenStreetMap: the island across a
 * spread, numbered markers by category with the index across the sea above
 * it; St Helier on a lettered grid with its place locator beside it. All
 * in millimetres, so the SVG prints at size.
 */

type MapData = {
  width: number;
  height: number;
  land: string;
  layers: { cls: string; d: string }[];
  streets: { name: string; cls: string; d: string; length: number }[];
  labels: { text: string; x: number; y: number; kind: string }[];
};

/** The categories' colours, as markers and index headings print them. */
export const MAP_COLOURS: Record<string, string> = {
  Attractions: PALETTE.orange.hex,
  'Heritage & culture': PALETTE.maroon.hex,
  Shopping: PALETTE.blue.hex,
  Restaurants: PALETTE.darkGreen.hex,
  Activity: PALETTE.deepBlue.hex,
  Pubs: PALETTE.green.hex,
  'Activity & travel': PALETTE.deepBlue.hex,
  Bars: PALETTE.orange.hex,
  'Coffee & cakes': PALETTE.green.hex,
};
export const colourOf = (category: string) => MAP_COLOURS[category] ?? PALETTE.deepBlue.hex;
const INK = PALETTE.deepBlue.hex;

/** The maps in the Jersey palette: sand land, light blue sea, greens for the green spaces, orange main roads. */
/**
 * A quiet base, so the markers are what you see: off-white land, a pale
 * grey-blue sea, roads in white and grey by weight, the green spaces and
 * the National Park only just there. Colour belongs to the markers.
 */
const SEA = '#e4eef1';
const LAND = '#fbfaf6';
const COAST = '#bfd3da';
const LABEL = '#5b6b70';

/** How each layer draws, bottom to top. */
const STYLE: Record<string, React.SVGProps<SVGPathElement>> = {
  built: { fill: '#f1efe8' },
  park: { fill: '#e9f0df' },
  golf: { fill: '#e9f0df' },
  heath: { fill: '#eef2e4' },
  wood: { fill: '#e1eacf' },
  'national-park': { fill: PALETTE.green.hex, fillOpacity: 0.12, stroke: PALETTE.darkGreen.hex, strokeOpacity: 0.45, strokeWidth: 0.2, strokeDasharray: '0.8 0.5' },
  sand: { fill: '#f5f0dc' },
  rock: { fill: '#ecebe5' },
  water: { fill: SEA },
  airport: { fill: '#efeeea' },
  runway: { fill: '#dfddd6' },
  'pedestrian-area': { fill: '#f2eee6' },
  building: { fill: '#e9e6dd' },
  stream: { fill: 'none', stroke: COAST, strokeWidth: 0.2 },
  'pier-line': { fill: 'none', stroke: '#d3d0c6', strokeWidth: 0.45 },
};
const LAYER_ORDER = ['built', 'park', 'golf', 'heath', 'wood', 'sand', 'rock', 'airport', 'runway', 'water', 'stream', 'national-park', 'pier-line', 'pedestrian-area', 'building'];

/** Roads: white, cased in grey, wider as they matter more; the island leaves out its lanes. Widths in mm. */
const ROADS: Record<'island' | 'town', Record<string, { w: number; fill: string; casing: string }>> = {
  island: {
    tertiary: { w: 0.32, fill: '#ffffff', casing: '#dcd9d0' },
    secondary: { w: 0.45, fill: '#ffffff', casing: '#cbc7bb' },
    primary: { w: 0.65, fill: '#ffffff', casing: '#b3ad9f' },
  },
  town: {
    service: { w: 0.4, fill: '#ffffff', casing: '#e4e1d8' },
    pedestrian: { w: 0.8, fill: '#f2eee6', casing: '#ddd8cc' },
    minor: { w: 0.8, fill: '#ffffff', casing: '#d6d2c6' },
    tertiary: { w: 0.95, fill: '#ffffff', casing: '#cdc8bb' },
    secondary: { w: 1.1, fill: '#ffffff', casing: '#c1bbad' },
    primary: { w: 1.35, fill: '#ffffff', casing: '#aea798' },
  },
};

function Base({ data, which }: { data: MapData; which: 'island' | 'town' }) {
  const roads = ROADS[which];
  const layer = (cls: string) => data.layers.find((l) => l.cls === cls);
  return (
    <>
      <rect width={data.width} height={data.height} fill={SEA} />
      <path d={data.land} fill={LAND} fillRule="evenodd" stroke={COAST} strokeWidth={which === 'town' ? 0.25 : 0.2} />
      {LAYER_ORDER.map((cls) => {
        const l = layer(cls);
        return l ? <path key={cls} d={l.d} fillRule="evenodd" {...STYLE[cls]} /> : null;
      })}
      {Object.entries(roads).map(([cls, s]) => {
        const l = layer(cls);
        return l ? <path key={`c-${cls}`} d={l.d} fill="none" stroke={s.casing} strokeWidth={s.w + (which === 'town' ? 0.22 : 0.18)} strokeLinecap="round" strokeLinejoin="round" /> : null;
      })}
      {Object.entries(roads).map(([cls, s]) => {
        const l = layer(cls);
        return l ? <path key={`f-${cls}`} d={l.d} fill="none" stroke={s.fill} strokeWidth={s.w} strokeLinecap="round" strokeLinejoin="round" /> : null;
      })}
    </>
  );
}

const PLACE_NAMES = new Set(['town', 'village']);

/** Labels with room around them: the first of any that would sit within `gap` mm of another. */
function clear<T extends { x: number; y: number }>(labels: T[], gap: number): T[] {
  const kept: T[] = [];
  for (const l of labels) if (kept.every((k) => Math.abs(k.x - l.x) > gap || Math.abs(k.y - l.y) > 3)) kept.push(l);
  return kept;
}

function Marker({ x, y, n, colour, r = 1.75 }: { x: number; y: number; n: number | string; colour: string; r?: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={colour} stroke="#fff" strokeWidth={0.4} />
      <text x={x} y={y + r * 0.36} textAnchor="middle" fontSize={r * 1.05} fontWeight={500} fill={markerText(colour)}>{n}</text>
    </g>
  );
}

/** The island across a spread: sea, land, roads, place names, the National Park, and the markers. */
export function IslandMap({ items }: { items: MapItem[] }) {
  const data = island as MapData;
  const placed = items.filter((i) => !i.missing);
  const names = clear(data.labels.filter((l) => PLACE_NAMES.has(l.kind)), 9);
  const bays = clear(data.labels.filter((l) => l.kind === 'bay' && /\bbay\b/i.test(l.text)), 14);
  return (
    <svg viewBox={`0 0 ${data.width} ${data.height}`} width={`${data.width}mm`} height={`${data.height}mm`} className="gp-map" fontFamily="var(--gp-cond)">
      <Base data={data} which="island" />
      {bays.map((l) => (
        <text key={`b-${l.text}-${l.x}`} x={l.x} y={l.y} textAnchor="middle" fontSize={1.9} fontStyle="italic" fill="#8aa5ae">{l.text}</text>
      ))}
      {names.map((l) => (
        <text key={`p-${l.text}`} x={l.x} y={l.y - 1.2} textAnchor="middle" fontSize={l.text === 'St Helier' ? 3.2 : 2.1} fontWeight={400} fill={LABEL} stroke={LAND} strokeWidth={0.5} paintOrder="stroke">{l.text}</text>
      ))}
      {placed.map((i) => {
        const [x, y] = project(ISLAND_FRAME, i.lat!, i.lon!);
        return (
          <Fragment key={i.id}>
            <Marker x={x} y={y} n={i.n} colour={colourOf(i.category)} />
            {i.labelled && (
              <text x={x + 2} y={y + 0.7} fontSize={2.1} fontWeight={500} fill={INK} stroke="#fff" strokeWidth={0.6} paintOrder="stroke">{i.label}</text>
            )}
          </Fragment>
        );
      })}
      <text x={data.width - 9} y={data.height - 3} textAnchor="end" fontSize={1.6} fill={LABEL}>Map data © OpenStreetMap contributors</text>
    </svg>
  );
}

/** St Helier on its grid: streets named along their lines, the markers by category, A–M across and 1–11 down. */
export function TownMap({ items }: { items: MapItem[] }) {
  const data = town as MapData;
  const { cols, rows, cell } = TOWN_GRID;
  const placed = items.filter((i) => !i.missing);
  // The longest streets get their names, and no more than fit.
  const named = data.streets.filter((s) => s.length > s.name.length * (s.cls === 'primary' || s.cls === 'secondary' ? 0.75 : 0.62) + 3 && s.cls !== 'path');
  return (
    <svg viewBox={`-4 -4 ${data.width + 4} ${data.height + 4}`} width={`${data.width + 4}mm`} height={`${data.height + 4}mm`} className="gp-map" fontFamily="var(--gp-cond)">
      <defs>
        <clipPath id="town-clip"><rect width={data.width} height={data.height} /></clipPath>
        {named.map((s, i) => <path key={i} id={`st-${i}`} d={s.d} />)}
      </defs>
      <g clipPath="url(#town-clip)">
        <Base data={data} which="town" />
        {named.map((s, i) => (
          <text key={i} fontSize={s.cls === 'primary' || s.cls === 'secondary' ? 1.4 : 1.2} fill="#7d7a70" dy={0.42}>
            <textPath href={`#st-${i}`} startOffset="50%" textAnchor="middle">{s.name}</textPath>
          </text>
        ))}
        {Array.from({ length: cols - 1 }, (_, c) => <line key={`v${c}`} x1={(c + 1) * cell} x2={(c + 1) * cell} y1={0} y2={data.height} stroke={INK} strokeWidth={0.1} strokeOpacity={0.25} />)}
        {Array.from({ length: rows - 1 }, (_, r) => <line key={`h${r}`} y1={(r + 1) * cell} y2={(r + 1) * cell} x1={0} x2={data.width} stroke={INK} strokeWidth={0.1} strokeOpacity={0.25} />)}
        {placed.map((i) => {
          const [x, y] = project(TOWN_FRAME, i.lat!, i.lon!);
          return <Marker key={i.id} x={x} y={y} n={i.n} colour={colourOf(i.category)} r={1.8} />;
        })}
        <text x={data.width - 1.5} y={data.height - 1.5} textAnchor="end" fontSize={1.5} fill={LABEL}>Map data © OpenStreetMap contributors</text>
      </g>
      <rect width={data.width} height={data.height} fill="none" stroke={INK} strokeWidth={0.2} />
      {Array.from({ length: cols }, (_, c) => <text key={`c${c}`} x={(c + 0.5) * cell} y={-1.2} textAnchor="middle" fontSize={2.2} fontWeight={500}>{String.fromCharCode(65 + c)}</text>)}
      {Array.from({ length: rows }, (_, r) => <text key={`r${r}`} x={-2} y={(r + 0.5) * cell + 0.8} textAnchor="middle" fontSize={2.2} fontWeight={500}>{r + 1}</text>)}
    </svg>
  );
}

/** The index, a category to a column: its heading in its colour, then each entry by its number. */
function IndexColumn({ category, items }: { category: string; items: MapItem[] }) {
  const colour = colourOf(category);
  return (
    <div className="gm-col">
      <h4 style={{ borderBottom: `0.6pt solid ${colour}` }}>{category}</h4>
      <ol>
        {items.map((i) => (
          <li key={i.id}>
            <span className="gm-num" style={{ background: colour, color: markerText(colour) }}>{i.n}</span>
            <span className={i.missing ? 'gm-missing' : undefined}>{i.label}</span>
            {i.ref && <span className="gm-ref">{i.ref}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

function byCategory(items: MapItem[], order: readonly string[]) {
  const cats = [...new Set([...order, ...items.map((i) => i.category)])];
  return cats.map((c) => ({ category: c, items: items.filter((i) => i.category === c) })).filter((g) => g.items.length);
}

/** The island spread's whole artwork, 230 × 165mm: the map, the title and the index across the sea at the top. */
export function IslandSpreadArt({ items, categories }: { items: MapItem[]; categories: readonly string[] }) {
  const groups = byCategory(items, categories);
  const half = Math.ceil(groups.length / 2);
  return (
    <div className="gm-spread">
      <IslandMap items={items} />
      <div className="gm-index gm-island-index" style={{ left: '10mm' }}>
        {groups.slice(0, half).map((g) => <IndexColumn key={g.category} {...g} />)}
      </div>
      <div className="gm-index gm-island-index" style={{ left: '124mm' }}>
        {groups.slice(half).map((g) => <IndexColumn key={g.category} {...g} />)}
      </div>
      <p className="gm-note" style={{ right: '9mm', top: '44mm' }}>Les Écréhous<br />10km north east ↗</p>
      <p className="gm-note" style={{ left: '60mm', bottom: '6mm' }}>Les Minquiers 20km south ↓</p>
    </div>
  );
}

/** St Helier's spread: the gridded map on the left and over the gutter, the place locator down the right. */
export function TownSpreadArt({ items, categories }: { items: MapItem[]; categories: readonly string[] }) {
  return (
    <div className="gm-spread">
      <div style={{ position: 'absolute', left: '10mm', top: '8mm' }}>
        <TownMap items={items} />
      </div>
      <div className="gm-index gm-locator">
        <h3>Place locator</h3>
        {byCategory(items, categories).map((g) => <IndexColumn key={g.category} {...g} />)}
      </div>
    </div>
  );
}
