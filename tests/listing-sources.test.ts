import { describe, expect, it } from 'vitest';
import { LISTING_SOURCES, busiestSources } from '@/lib/domain/listing-sources';

describe('the listings banner', () => {
  it('shows the busy sources, busiest first, and not the quiet ones', () => {
    const shown = busiestSources(new Map([['visit_jersey', 180], ['gigzhub', 32], ['eventbrite', 60], ['jersey-rfc', 2]]));
    expect(shown.map((s) => s.source)).toEqual(['visit_jersey', 'eventbrite', 'gigzhub']);
  });

  it('caps the row', () => {
    const counts = new Map(LISTING_SOURCES.map((s, i) => [s.source, 10 + i]));
    expect(busiestSources(counts, { max: 5 })).toHaveLength(5);
  });

  it('uses only logo files we hold', async () => {
    const { existsSync } = await import('node:fs');
    for (const s of LISTING_SOURCES) if (s.logo) expect(existsSync(`public${s.logo.src}`)).toBe(true);
  });
});
