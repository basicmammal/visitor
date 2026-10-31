import { describe, expect, it } from 'vitest';
import { filterChips } from '@/lib/domain/filter-chips';

describe('filter chips', () => {
  const label = (k: string, v: string) => (k === 'when' ? 'This weekend' : k === 'q' ? `“${v}”` : v);

  it('gives each kind its own chip, and dates one, each leading to the page without it', () => {
    const chips = filterChips('/search', { q: 'jazz', when: 'dates', from: '2026-11-01', to: '2026-11-02', cat: 'Music,Outdoor' }, label);
    expect(chips).toEqual([
      { label: '“jazz”', href: '/search?when=dates&from=2026-11-01&to=2026-11-02&cat=Music%2COutdoor' },
      { label: 'This weekend', href: '/search?q=jazz&cat=Music%2COutdoor' },
      { label: 'Music', href: '/search?q=jazz&when=dates&from=2026-11-01&to=2026-11-02&cat=Outdoor' },
      { label: 'Outdoor', href: '/search?q=jazz&when=dates&from=2026-11-01&to=2026-11-02&cat=Music' },
    ]);
  });

  it('leads back to the plain page when the last choice goes', () => {
    expect(filterChips('/whats-on', { type: 'Music' }, label)).toEqual([{ label: 'Music', href: '/whats-on' }]);
  });
});
