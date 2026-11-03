'use server';

import { revalidatePath } from 'next/cache';
import { eq, or } from 'drizzle-orm';
import { z } from 'zod';
import { requireStaff } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { MAPS, mapEntries, places } from '@/lib/db/schema';
import { addEntry, fillTownFromBookings, moveEntry, seedIsland } from '@/lib/maps';

const done = () => revalidatePath('/admin/guide/maps');
const id = (form: FormData) => z.string().uuid().parse(form.get('id'));
const mapOf = (form: FormData) => z.enum(MAPS).parse(form.get('map'));

/** "49.2295, -2.0739", as Google Maps copies a point; empty clears it. Anything else is ignored. */
function pinOf(text: string): { lat: number | null; lon: number | null } | null {
  const t = text.trim();
  if (!t) return { lat: null, lon: null };
  const m = t.match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (lat < 48.8 || lat > 49.4 || lon < -2.5 || lon > -1.7) return null;
  return { lat, lon };
}

export async function seedIslandMap() {
  await requireStaff();
  await seedIsland();
  done();
}

export async function fillTownMap(form: FormData) {
  await requireStaff();
  const edition = String(form.get('edition') ?? '');
  if (!/^(Spring|Summer|Autumn|Winter) \d{4}$/.test(edition)) return;
  await fillTownFromBookings(edition);
  done();
}

/** A venue we list (by its name as the list offers it, or its slug), or a name and a pin of its own. */
export async function addMapEntry(form: FormData) {
  await requireStaff();
  const map = mapOf(form);
  const category = String(form.get('category') ?? '').trim();
  const venue = String(form.get('venue') ?? '').trim();
  if (!category || !venue) return;
  const [place] = await db.select({ id: places.id }).from(places).where(or(eq(places.slug, venue), eq(places.name, venue))).limit(1);
  const pin = pinOf(String(form.get('pin') ?? ''));
  await addEntry(map, { category, placeId: place?.id ?? null, label: place ? null : venue, lat: pin?.lat ?? null, lon: pin?.lon ?? null });
  done();
}

export async function updateMapEntry(form: FormData) {
  await requireStaff();
  const label = String(form.get('label') ?? '').trim();
  const pin = pinOf(String(form.get('pin') ?? ''));
  await db
    .update(mapEntries)
    .set({ label: label || null, labelled: form.get('labelled') === '1', ...(pin ?? {}) })
    .where(eq(mapEntries.id, id(form)));
  done();
}

export async function moveMapEntry(form: FormData) {
  await requireStaff();
  await moveEntry(id(form), form.get('by') === 'up' ? -1 : 1);
  done();
}

export async function removeMapEntry(form: FormData) {
  await requireStaff();
  await db.delete(mapEntries).where(eq(mapEntries.id, id(form)));
  done();
}
