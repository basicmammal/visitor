/**
 * Turns the raw OpenStreetMap extract (data/osm, fetched by
 * .github/workflows/fetch-osm.yml) into the guide's two maps: layers of
 * SVG paths already projected to millimetres on the printed page and
 * simplified to what prints, in lib/maps/*.json. Run: pnpm maps:build.
 * © OpenStreetMap contributors (ODbL).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { ISLAND_FRAME, TOWN_FRAME, project, type MapFrame } from '../../lib/domain/map-frame';

type LatLon = { lat: number; lon: number };
type Way = { type: 'way'; id: number; tags?: Record<string, string>; geometry?: LatLon[] };
type Rel = { type: 'relation'; id: number; tags?: Record<string, string>; members?: { type: string; role: string; geometry?: LatLon[] }[] };
type Node = { type: 'node'; id: number; tags?: Record<string, string>; lat: number; lon: number };
type El = Way | Rel | Node | { type: 'way' | 'relation'; id: number; tags?: Record<string, string>; center?: LatLon };

const DIR = 'data/osm';
const load = (name: string): El[] => (existsSync(`${DIR}/${name}.json`) ? JSON.parse(readFileSync(`${DIR}/${name}.json`, 'utf8')).elements : []);

type Pt = [number, number];

/** Joins open lines end to end into rings, as coastlines and multipolygon members come. */
function rings(lines: LatLon[][]): LatLon[][] {
  const key = (p: LatLon | undefined) => (p ? `${p.lat.toFixed(7)},${p.lon.toFixed(7)}` : '');
  const open = lines.filter((l) => l.length > 1).map((l) => [...l]);
  const done: LatLon[][] = [];
  while (open.length) {
    let ring = open.shift()!;
    let grown = true;
    while (key(ring[0]) !== key(ring[ring.length - 1]) && grown) {
      grown = false;
      for (let i = 0; i < open.length; i++) {
        const l = open[i]!;
        const end = key(ring[ring.length - 1]);
        const start = key(ring[0]);
        if (key(l[0]) === end) ring = [...ring, ...l.slice(1)];
        else if (key(l[l.length - 1]) === end) ring = [...ring, ...[...l].reverse().slice(1)];
        else if (key(l[l.length - 1]) === start) ring = [...l, ...ring.slice(1)];
        else if (key(l[0]) === start) ring = [...[...l].reverse(), ...ring.slice(1)];
        else continue;
        open.splice(i, 1);
        grown = true;
        break;
      }
    }
    done.push(ring);
  }
  return done;
}

/** Douglas–Peucker, in millimetres. A ring is split at its farthest point, so its two ends are not one point. */
function simplify(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 3) return pts;
  const [fx, fy] = pts[0]!;
  const [lx, ly] = pts[pts.length - 1]!;
  if (fx === lx && fy === ly) {
    let far = 1, best = -1;
    pts.forEach(([x, y], i) => { const d = Math.hypot(x - fx, y - fy); if (d > best) { best = d; far = i; } });
    if (far === 0 || far === pts.length - 1) return pts;
    return [...simplify(pts.slice(0, far + 1), tol).slice(0, -1), ...simplify(pts.slice(far), tol)];
  }
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a]!;
    const [bx, by] = pts[b]!;
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-9;
    let worst = -1, at = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * pts[i]![0] - dx * pts[i]![1] + bx * ay - by * ax) / len;
      if (d > worst) { worst = d; at = i; }
    }
    if (worst > tol) { keep[at] = 1; stack.push([a, at], [at, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const r = (n: number) => Math.round(n * 100) / 100;

function pathOf(frame: MapFrame, line: LatLon[], closed: boolean, tol: number): string {
  const pts = simplify(line.map((p) => project(frame, p.lat, p.lon)), tol);
  if (pts.length < 2) return '';
  if (closed && pts.length < 3) return '';
  const [x0, y0] = pts[0]!;
  return `M${r(x0)} ${r(y0)}` + pts.slice(1).map(([x, y]) => `L${r(x)} ${r(y)}`).join('') + (closed ? 'Z' : '');
}

/** Area polygons of an element: a closed way, or a multipolygon's rings (outer and inner; even-odd fill). */
function areaRings(e: El): LatLon[][] {
  if (e.type === 'way' && 'geometry' in e && e.geometry) return [e.geometry];
  if (e.type === 'relation' && 'members' in e && e.members) return rings(e.members.filter((m) => m.type === 'way' && m.geometry).map((m) => m.geometry!));
  return [];
}

function areaPath(frame: MapFrame, e: El, tol: number, minArea = 0): string {
  return areaRings(e)
    .filter((ring) => minArea <= 0 || ringArea(frame, ring) >= minArea)
    .map((ring) => pathOf(frame, ring, true, tol))
    .join('');
}

function ringArea(frame: MapFrame, ring: LatLon[]): number {
  const pts = ring.map((p) => project(frame, p.lat, p.lon));
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]!;
    const [x2, y2] = pts[(i + 1) % pts.length]!;
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a / 2);
}

/** What kind of land each area is, as the map colours it. */
function landClass(t: Record<string, string>): string | null {
  if (t.aeroway === 'aerodrome') return 'airport';
  if (t.aeroway === 'runway') return 'runway';
  if (t.natural === 'water' || t.landuse === 'reservoir') return 'water';
  if (t.natural === 'beach' || t.natural === 'sand') return 'sand';
  if (t.natural === 'bare_rock') return 'rock';
  if (t.natural === 'wood' || t.landuse === 'forest') return 'wood';
  if (t.natural === 'scrub' || t.natural === 'heath' || t.natural === 'grassland' || t.natural === 'wetland') return 'heath';
  if (t.leisure === 'golf_course') return 'golf';
  if (t.leisure === 'park' || t.leisure === 'garden' || t.leisure === 'common' || t.leisure === 'nature_reserve' || t.landuse === 'recreation_ground' || t.landuse === 'cemetery' || t.leisure === 'pitch') return 'park';
  if (t.landuse === 'residential' || t.landuse === 'commercial' || t.landuse === 'retail' || t.landuse === 'industrial') return 'built';
  if (t.man_made === 'pier' || t.man_made === 'breakwater') return 'pier';
  return null;
}

/** Roads by weight on the map. */
function roadClass(h: string | undefined): string | null {
  if (!h) return null;
  if (['motorway', 'trunk', 'primary'].includes(h)) return 'primary';
  if (h === 'secondary') return 'secondary';
  if (h === 'tertiary') return 'tertiary';
  if (['unclassified', 'residential', 'living_street'].includes(h)) return 'minor';
  if (h === 'pedestrian') return 'pedestrian';
  if (h === 'service') return 'service';
  if (['track', 'path', 'footway', 'cycleway', 'bridleway'].includes(h)) return 'path';
  return null;
}

type Layer = { cls: string; d: string };
type Label = { text: string; x: number; y: number; kind: string };
type Street = { name: string; cls: string; d: string; length: number };

function elPoints(e: El): LatLon[] {
  if ('geometry' in e && e.geometry) return e.geometry;
  if ('members' in e && e.members) return e.members.flatMap((m) => m.geometry ?? []);
  return [];
}

function inFrame(frame: MapFrame, lat: number, lon: number, pad = 0) {
  const [x, y] = project(frame, lat, lon);
  return x >= -pad && y >= -pad && x <= frame.width + pad && y <= frame.height + pad;
}

function group(items: { cls: string; d: string }[]): Layer[] {
  const by = new Map<string, string[]>();
  for (const i of items) if (i.d) by.set(i.cls, [...(by.get(i.cls) ?? []), i.d]);
  return [...by].map(([cls, ds]) => ({ cls, d: ds.join('') }));
}

function lineLength(frame: MapFrame, line: LatLon[]) {
  let s = 0;
  for (let i = 1; i < line.length; i++) {
    const [x1, y1] = project(frame, line[i - 1]!.lat, line[i - 1]!.lon);
    const [x2, y2] = project(frame, line[i]!.lat, line[i]!.lon);
    s += Math.hypot(x2 - x1, y2 - y1);
  }
  return s;
}

function build(frame: MapFrame, opts: { town: boolean }) {
  const tol = opts.town ? 0.05 : 0.12;
  const coast = load('coastline') as Way[];
  const land = rings(coast.map((w) => w.geometry ?? []))
    .filter((ring) => ring.some((p) => inFrame(frame, p.lat, p.lon, 20)))
    .map((ring) => pathOf(frame, ring, true, tol * 0.6))
    .join('');

  const near = (e: El) => elPoints(e).some((p) => inFrame(frame, p.lat, p.lon, 5));
  const covers = (load('landcover') as El[]).filter(near).flatMap((e) => {
    const t = e.tags ?? {};
    if (opts.town && t.landuse === 'grass') return [{ cls: 'park', d: areaPath(frame, e, tol, 0.5) }];
    const cls = landClass(t);
    if (!cls) return [];
    if (cls === 'pier' && e.type === 'way' && 'geometry' in e && e.geometry && e.geometry[0] !== e.geometry.at(-1)) {
      return [{ cls: 'pier-line', d: pathOf(frame, e.geometry, false, tol) }];
    }
    return [{ cls, d: areaPath(frame, e, tol, opts.town ? 0.5 : 0.6) }];
  });
  const streams = (load('landcover') as Way[]).filter((e) => e.type === 'way' && e.tags?.waterway && near(e)).map((e) => ({ cls: 'stream', d: pathOf(frame, e.geometry ?? [], false, tol) }));

  const parkland = (load('protected') as El[])
    .filter(near)
    .filter((e) => /national park/i.test(e.tags?.name ?? '') || e.tags?.boundary === 'national_park')
    .map((e) => ({ cls: 'national-park', d: areaPath(frame, e, tol, 1) }));

  const roadEls = (load(opts.town ? 'town' : 'roads') as Way[]).filter((w) => w.type === 'way' && w.tags?.highway && w.geometry && near(w));
  const roads = roadEls.flatMap((w) => {
    let cls = roadClass(w.tags!.highway);
    if (!cls) return [];
    if (!opts.town && (cls === 'service' || cls === 'path' || cls === 'pedestrian')) return [];
    if (!opts.town && cls === 'minor' && w.tags!.highway === 'residential') cls = 'minor';
    if (w.tags!.area === 'yes') return [{ cls: 'pedestrian-area', d: pathOf(frame, w.geometry!, true, tol) }];
    return [{ cls, d: pathOf(frame, w.geometry!, false, tol) }];
  });
  const buildings = opts.town
    ? (load('town') as El[]).filter((e) => e.tags?.building && near(e)).map((e) => ({ cls: 'building', d: areaPath(frame, e, 0.04) }))
    : [];
  const pedestrianAreas = opts.town
    ? (load('town') as El[]).filter((e) => e.tags?.['area:highway'] === 'pedestrian' || (e.tags?.highway === 'pedestrian' && e.tags?.area === 'yes')).map((e) => ({ cls: 'pedestrian-area', d: areaPath(frame, e, 0.04) }))
    : [];

  // Street names for the town: one path per name, the longest run, to set text along.
  const streets: Street[] = [];
  if (opts.town) {
    const best = new Map<string, Street>();
    for (const w of roadEls) {
      const name = w.tags!.name;
      const cls = roadClass(w.tags!.highway);
      if (!name || !cls || cls === 'path' || cls === 'service') continue;
      let g = w.geometry!;
      // A closed way (a square, a roundabout) has no direction to read along.
      if (g.length > 2 && g[0]!.lat === g.at(-1)!.lat && g[0]!.lon === g.at(-1)!.lon) continue;
      if (!g.some((p) => inFrame(frame, p.lat, p.lon, -3))) continue;
      // Text reads left to right.
      const [xa] = project(frame, g[0]!.lat, g[0]!.lon);
      const [xb] = project(frame, g.at(-1)!.lat, g.at(-1)!.lon);
      if (xb < xa) g = [...g].reverse();
      const length = lineLength(frame, g);
      const prev = best.get(name);
      if (!prev || prev.length < length) best.set(name, { name, cls, d: pathOf(frame, g, false, 0.3), length: r(length) });
    }
    streets.push(...[...best.values()].sort((a, b) => b.length - a.length));
  }

  // Place names: towns, villages and bays on the island; districts in town.
  const labels: Label[] = (load('places') as (Node & { center?: LatLon })[]).flatMap((n) => {
    const t = n.tags ?? {};
    const lat = n.lat ?? n.center?.lat;
    const lon = n.lon ?? n.center?.lon;
    if (lat === undefined || lon === undefined || !t.name || !inFrame(frame, lat, lon)) return [];
    const kind = t.place ?? (t.natural === 'bay' ? 'bay' : t.natural ?? '');
    if (opts.town ? !['suburb', 'locality', 'bay', 'islet'].includes(kind) : !['town', 'village', 'bay', 'islet', 'island', 'cape', 'peak'].includes(kind)) return [];
    const [x, y] = project(frame, lat, lon);
    return [{ text: t.name, x: r(x), y: r(y), kind }];
  });

  // The extract's date, from Geofabrik's state file: "timestamp=2026-11-02T21\:21\:26Z".
  const state = existsSync(`${DIR}/state.txt`) ? readFileSync(`${DIR}/state.txt`, 'utf8') : '';
  const osmDate = state.match(/timestamp=(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
  return {
    osmDate,
    width: frame.width,
    height: frame.height,
    land,
    layers: group([...covers, ...streams, ...parkland, ...pedestrianAreas, ...buildings, ...roads]),
    streets: streets.slice(0, 160),
    labels,
  };
}

mkdirSync('lib/maps', { recursive: true });
for (const [name, frame, town] of [['island', ISLAND_FRAME, false], ['st-helier', TOWN_FRAME, true]] as const) {
  const map = build(frame, { town });
  const json = JSON.stringify(map);
  writeFileSync(`lib/maps/${name}.json`, json);
  console.log(`${name}: ${(json.length / 1024).toFixed(0)} KB, ${map.layers.length} layers, ${map.streets.length} streets, ${map.labels.length} labels`);
}
