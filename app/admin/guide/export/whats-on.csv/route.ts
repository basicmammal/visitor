import { type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/auth/session';
import { toCsv, utf16le } from '@/lib/domain/csv';
import { iconsFor } from '@/components/guide/key-icons';
import { layoutsFrom } from '@/lib/domain/guide-entry';
import { buildGuide, EVENT_COLUMNS, isDraft, windowFrom } from '@/lib/guide';

/** The What's On selection as an InDesign Data Merge source. Signed-in only, through middleware. */
export async function GET(request: NextRequest) {
  await requireStaff();
  const sp = request.nextUrl.searchParams;
  const window = windowFrom({ from: sp.get('from') ?? undefined, to: sp.get('to') ?? undefined });
  const { events: dated, ongoing, layout } = await buildGuide(window, { draft: isDraft(sp.get('draft')), layouts: layoutsFrom((k) => sp.get(k)) });
  // The Ongoing events pages follow the dated ones; Block says which is which.
  const events = [...dated, ...ongoing];
  // A grid's picture box is a row of its own: the picture, and the title of the listing it sits beside.
  const csv = toCsv(EVENT_COLUMNS, events.map((e) => e.frame === 'image'
    ? [e.frame, '', '', e.title, '', '', '', '', '', '', e.imageUrl, e.block, '']
    : [e.frame, e.dates, e.times, e.title, e.copy, e.price, e.venue, e.address, e.contact, e.website, e.frame === 'picture' ? e.imageUrl : '', e.block, iconsFor(e).map((i) => i.label).join(', ')]));
  return new Response(utf16le(csv), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-16le',
      'Content-Disposition': `attachment; filename="whatson_${window.from}_${window.to}${layout === 'top' ? '' : `_${layout}`}.csv"`,
    },
  });
}
