import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { mapEntries, places, type MapName } from '@/lib/db/schema';
import { PROOF_SIZES } from '@/lib/domain/proof';
import { ISLAND_FRAME, TOWN_FRAME, gridRef, inside } from '@/lib/domain/map-frame';
import { ISLAND_CATEGORIES, ISLAND_SEED, TOWN_CATEGORIES, townCategory } from '@/lib/domain/map-seed';

/** A map entry as the map and its index print it. */
export type MapItem = {
  id: string;
  category: string;
  /** Its number in its category, from 1. */
  n: number;
  label: string;
  placeId: string | null;
  slug: string | null;
  lat: number | null;
  lon: number | null;
  /** Its own pin rather than the venue's location. */
  pinned: boolean;
  labelled: boolean;
  /** St Helier's grid square, "F7". */
  ref: string | null;
  /** Off the map, or nowhere: it needs a pin. */
  missing: boolean;
};

export function categoriesOf(map: MapName): readonly string[] {
  return map === 'island' ? ISLAND_CATEGORIES : TOWN_CATEGORIES;
}

export async function mapItems(map: MapName): Promise<MapItem[]> {
  const rows = await db
    .select({ e: mapEntries, slug: places.slug, name: places.name, lat: places.lat, lon: places.lon })
    .from(mapEntries)
    .leftJoin(places, eq(places.id, mapEntries.placeId))
    .where(eq(mapEntries.map, map))
    .orderBy(asc(mapEntries.category), asc(mapEntries.position), asc(mapEntries.createdAt));
  const order = categoriesOf(map);
  const rank = (c: string) => (order.indexOf(c) < 0 ? 99 : order.indexOf(c));
  const frame = map === 'island' ? ISLAND_FRAME : TOWN_FRAME;
  const counts = new Map<string, number>();
  return rows
    .sort((a, b) => rank(a.e.category) - rank(b.e.category) || a.e.category.localeCompare(b.e.category) || a.e.position - b.e.position)
    .map(({ e, slug, name, lat, lon }) => {
      const n = (counts.get(e.category) ?? 0) + 1;
      counts.set(e.category, n);
      const pinned = e.lat !== null && e.lon !== null;
      const y = pinned ? e.lat : lat;
      const x = pinned ? e.lon : lon;
      const placed = y !== null && x !== null && inside(frame, y, x);
      return {
        id: e.id,
        category: e.category,
        n,
        label: e.label?.trim() || name || '(no name)',
        placeId: e.placeId,
        slug,
        lat: y,
        lon: x,
        pinned,
        labelled: e.labelled,
        ref: map === 'st-helier' && placed ? gridRef(y!, x!) : null,
        missing: !placed,
      };
    });
}

async function nextPosition(map: MapName, category: string) {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${mapEntries.position}), 0)` })
    .from(mapEntries)
    .where(and(eq(mapEntries.map, map), eq(mapEntries.category, category)));
  return Number(row?.max ?? 0) + 1;
}

export async function addEntry(map: MapName, input: { category: string; placeId?: string | null; label?: string | null; lat?: number | null; lon?: number | null }) {
  await db.insert(mapEntries).values({
    map,
    category: input.category,
    position: await nextPosition(map, input.category),
    placeId: input.placeId ?? null,
    label: input.label ?? null,
    lat: input.lat ?? null,
    lon: input.lon ?? null,
  });
}

/** Swaps an entry with its neighbour in its category. */
export async function moveEntry(id: string, by: -1 | 1) {
  const [e] = await db.select().from(mapEntries).where(eq(mapEntries.id, id));
  if (!e) return;
  const siblings = await db
    .select()
    .from(mapEntries)
    .where(and(eq(mapEntries.map, e.map), eq(mapEntries.category, e.category)))
    .orderBy(asc(mapEntries.position), asc(mapEntries.createdAt));
  const i = siblings.findIndex((s) => s.id === id);
  const j = i + by;
  if (j < 0 || j >= siblings.length) return;
  [siblings[i], siblings[j]] = [siblings[j]!, siblings[i]!];
  await db.transaction(async (tx) => {
    for (const [k, s] of siblings.entries()) await tx.update(mapEntries).set({ position: k + 1 }).where(eq(mapEntries.id, s.id));
  });
}

/** The island map's index as the Summer 2026 guide printed it, matched to our venues. Only into an empty map. */
export async function seedIsland(): Promise<number> {
  const [count] = await db.select({ n: sql<number>`count(*)` }).from(mapEntries).where(eq(mapEntries.map, 'island'));
  if (Number(count?.n ?? 0) > 0) return 0;
  const slugs = Object.values(ISLAND_SEED).flatMap((es) => es.flatMap((e) => e.slugs ?? []));
  const found = await db.select({ id: places.id, slug: places.slug, lat: places.lat }).from(places).where(inArray(places.slug, slugs));
  const bySlug = new Map(found.map((p) => [p.slug, p]));
  const rows = Object.entries(ISLAND_SEED).flatMap(([category, entries]) =>
    entries.map((e, i) => {
      const place = (e.slugs ?? []).map((s) => bySlug.get(s)).find(Boolean);
      // A venue without a location keeps the pin we have for it.
      const pin = e.pin && (!place || place.lat === null) ? e.pin : null;
      return { map: 'island' as const, category, position: i + 1, placeId: place?.id ?? null, label: e.label, lat: pin?.[0] ?? null, lon: pin?.[1] ?? null, labelled: !!e.labelled };
    }),
  );
  await db.insert(mapEntries).values(rows);
  return rows.length;
}

/**
 * St Helier's locator from the edition's bookings: every venue in the guide
 * with space booked in it (listing box and up) that falls on the town map,
 * under its heading, by name. Adds only those not on the map already.
 */
export async function fillTownFromBookings(edition: string): Promise<number> {
  const booked = await db
    .select()
    .from(places)
    .where(and(eq(places.inclusion, 'included'), eq(places.review, 'approved'), sql`${places.spaceByEdition} ? ${edition}`));
  const there = new Set(
    (await db.select({ placeId: mapEntries.placeId }).from(mapEntries).where(eq(mapEntries.map, 'st-helier'))).map((r) => r.placeId),
  );
  const sizes: readonly string[] = PROOF_SIZES;
  const fresh = booked
    .filter((p) => sizes.includes(p.spaceByEdition[edition] ?? '') && p.lat !== null && p.lon !== null && inside(TOWN_FRAME, p.lat, p.lon) && !there.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const p of fresh) await addEntry('st-helier', { category: townCategory(p), placeId: p.id });
  return fresh.length;
}
