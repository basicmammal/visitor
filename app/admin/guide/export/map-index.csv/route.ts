import { type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/auth/session';
import { MAPS, type MapName } from '@/lib/db/schema';
import { toCsv, utf16le } from '@/lib/domain/csv';
import { mapItems } from '@/lib/maps';

/** A map's index as an InDesign Data Merge source: category, number, name, and St Helier's grid reference. */
export async function GET(request: NextRequest) {
  await requireStaff();
  const asked = request.nextUrl.searchParams.get('map');
  const map: MapName = (MAPS as readonly string[]).includes(asked ?? '') ? (asked as MapName) : 'island';
  const items = await mapItems(map);
  const csv = toCsv(['category', 'number', 'name', 'grid', 'on map'], items.map((i) => [i.category, String(i.n), i.label, i.ref ?? '', i.labelled ? 'yes' : '']));
  return new Response(utf16le(csv), {
    headers: { 'Content-Type': 'text/csv; charset=utf-16le', 'Content-Disposition': `attachment; filename="map-${map}.csv"` },
  });
}
