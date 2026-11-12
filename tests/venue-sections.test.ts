import { describe, expect, it } from 'vitest';
import { areaKey, budgetFor, layoutsFrom, layoutsQuery, venueGridFor, venueSections, type GuideVenue } from '@/lib/domain/guide-entry';

const v = (name: string, o: Partial<GuideVenue> = {}): GuideVenue => ({
  section: 'Eat', area: 'St. Helier', name, label: '', size: 'listing', isNew: false, copy: '', address: '', phone: '', email: '', website: '', imageUrl: '', preview: '', options: [], featured: false, printed: false, opening: '', ...o,
});

describe('venueSections', () => {
  it('puts the sections in the order the guide prints them, unknown ones after', () => {
    const out = venueSections([v('A', { section: 'Eat' }), v('B', { section: 'Stay' }), v('C', { section: 'Visit' }), v('D', { section: 'Buy' })]);
    expect(out.map((s) => s.section)).toEqual(['Visit', 'Buy', 'Eat', 'Stay']);
  });

  it('runs a section’s areas on together, as the guide reads the island, each box with its area’s marker', () => {
    const out = venueSections([v('A', { area: '' }), v('B', { area: 'Gorey' }), v('C', { area: 'Trinity' }), v('D', { area: 'St. Helier' })]);
    expect(out[0]!.pages).toHaveLength(1);
    const cells = out[0]!.pages[0]!.kind === 'grid' ? out[0]!.pages[0]!.cells : [];
    expect(cells.map((c) => `${c.areaCode}:${c.name}`)).toEqual(['SH:D', 'GY:B', 'T:C', ':A']);
    expect(out[0]!.key).toEqual([{ code: 'SH', area: 'St. Helier' }, { code: 'GY', area: 'Gorey' }, { code: 'T', area: 'Trinity' }]);
  });

  it('fills the last rows of one area with the next, leaving no part-empty pages between', () => {
    const out = venueSections([...Array.from({ length: 5 }, (_, i) => v(`S${i}`)), ...Array.from({ length: 5 }, (_, i) => v(`G${i}`, { area: 'Gorey' }))]);
    expect(out[0]!.pages.map((p) => (p.kind === 'grid' ? p.cells.length : 1))).toEqual([8, 2]);
  });

  it('keys areas by their own markers, else initials made unlike the others', () => {
    expect(areaKey(['Golf', 'Gorey', 'Grouville', 'Green Island', 'Gold Coast']).map((k) => k.code)).toEqual(['GF', 'GY', 'G', 'GI', 'GC']);
    expect(areaKey(['St. Ouen', 'St. Ouens Bay']).map((k) => k.code)).toEqual(['SO', 'SOB']);
    expect(areaKey(['Sark', 'Sorel']).map((k) => k.code)).toEqual(['S', 'SO']);
  });

  it('gives a full-page entry a page of its own, before the grids', () => {
    const [section] = venueSections([v('Listing'), v('Azure', { size: 'full' })]);
    expect(section!.pages.map((p) => p.kind)).toEqual(['full', 'grid']);
  });

  it('puts the bigger entries first, each on the first page with rows for it, then fills with listings two to a row', () => {
    const listings = Array.from({ length: 13 }, (_, i) => v(`L${String(i).padStart(2, '0')}`));
    const [section] = venueSections([...listings, v('Phire', { size: 'half' }), v('Zest', { size: 'three-quarters' }), v('Drew', { size: 'quarter' }), v('Moor', { size: 'half' })]);
    const grids = section!.pages.map((p) => (p.kind === 'grid' ? p.cells.map((c) => `${c.frame}:${c.name}`) : []));
    // Three-quarters and a quarter fill one page; the two halves the next.
    expect(grids[0]).toEqual(['three-quarters:Zest', 'quarter:Drew']);
    expect(grids[1]).toEqual(['half:Moor', 'half:Phire']);
    expect(grids[2]).toHaveLength(8);
    expect(grids[3]).toHaveLength(5);
  });

  it('fills the rows a big entry leaves with listings', () => {
    const listings = Array.from({ length: 5 }, (_, i) => v(`L${i}`));
    const [section] = venueSections([...listings, v('Phire', { size: 'half' })]);
    const grids = section!.pages.map((p) => (p.kind === 'grid' ? p.cells.map((c) => c.frame) : []));
    expect(grids[0]).toEqual(['half', 'listing', 'listing', 'listing', 'listing']);
    expect(grids[1]).toEqual(['listing']);
  });

  it('keeps directory lines off the grid, for the section’s list', () => {
    const [section] = venueSections([v('Bar', { size: 'directory' }), v('Cafe')]);
    expect(section!.directory.map((d) => d.name)).toEqual(['Bar']);
    expect(section!.pages).toHaveLength(1);
  });

  it('on the grid of sixteen gives booked space the same share of a page, and listings a sixteenth', () => {
    const listings = Array.from({ length: 21 }, (_, i) => v(`L${String(i).padStart(2, '0')}`));
    const [section] = venueSections([...listings, v('Gems', { size: 'three-quarters' }), v('Drew', { size: 'quarter' })], () => 'grid16');
    expect(section!.grid).toBe('grid16');
    const grids = section!.pages.map((p) => (p.kind === 'grid' ? p.cells.map((c) => c.frame) : []));
    // Three-quarters (six rows) and a quarter (two) fill a page; then sixteen listings, then five.
    expect(grids[0]).toEqual(['three-quarters', 'quarter']);
    expect(grids[1]).toHaveLength(16);
    expect(grids[2]).toHaveLength(5);
  });

  it('fills what three-quarters leaves on the grid of sixteen with four listings', () => {
    const listings = Array.from({ length: 4 }, (_, i) => v(`L${i}`));
    const [section] = venueSections([...listings, v('Gems', { size: 'three-quarters' })], () => 'grid16');
    const grids = section!.pages.map((p) => (p.kind === 'grid' ? p.cells.map((c) => c.frame) : []));
    expect(grids).toEqual([['three-quarters', 'listing', 'listing', 'listing', 'listing']]);
  });
});

describe('a section rationed to so many pages of listings', () => {
  it('keeps boxes for those featured, printed before, new, then pictured, and indexes the rest by area', () => {
    const listings = Array.from({ length: 12 }, (_, i) => v(`L${String(i).padStart(2, '0')}`, { area: i % 2 ? 'Gorey' : 'St. Helier' }));
    const special = [v('Feat', { featured: true, area: 'Gorey' }), v('Old', { printed: true }), v('Pic', { imageUrl: 'x' }), v('Neu', { isNew: true })];
    const [s] = venueSections([...listings, ...special, v('Big', { size: 'three-quarters' }), v('Line', { size: 'directory' })], () => 'grid8', () => 1);
    const boxed = s!.pages.flatMap((p) => (p.kind === 'grid' ? p.cells.map((c) => c.name) : []));
    // The three-quarters page leaves a row (two listings), and one page more holds eight.
    expect(boxed).toHaveLength(11);
    expect(boxed).toEqual(expect.arrayContaining(['Feat', 'Old', 'Neu', 'Pic']));
    expect(s!.pages).toHaveLength(2);
    expect(s!.directory).toHaveLength(17 - 10 + 0);
    expect(s!.directory.map((d) => d.area)).toEqual([...s!.directory.map((d) => d.area)].sort((a, b) => (a === 'St. Helier' ? -1 : 0) - (b === 'St. Helier' ? -1 : 0)));
    expect(s!.directory.map((d) => d.name)).toContain('Line');
  });

  it('with no pages, puts every listing in the index', () => {
    const [s] = venueSections([v('A'), v('B')], () => 'grid8', () => 0);
    expect(s!.pages).toHaveLength(0);
    expect(s!.directory.map((d) => d.name)).toEqual(['A', 'B']);
  });
});

describe('the template in the address', () => {
  const read = (q: string) => layoutsFrom((k) => new URLSearchParams(q).get(k));

  it('chooses each part, defaulting as before', () => {
    expect(read('')).toEqual({ events: 'top', tours: 'grid8', ongoing: 'grid12', venues: {}, budgets: {} });
    expect(read('grid=grid8')).toEqual({ events: 'grid8', tours: 'grid8', ongoing: 'grid12', venues: {}, budgets: {} });
    expect(read('grid=grid8&tours=columns&ongoing=grid16')).toMatchObject({ tours: 'columns', ongoing: 'grid16' });
    expect(read('grid=grid16&tours=columns&venues=Eat:grid16,Buy:grid8,Nope:grid99&budget=Eat:all,Buy:1,See:x')).toEqual({ events: 'grid16', tours: 'columns', ongoing: 'columns', venues: { Eat: 'grid16', Buy: 'grid8' }, budgets: { Eat: null, Buy: 1 } });
  });

  it('writes back only what is not the default', () => {
    expect(layoutsQuery({ events: 'top', tours: 'grid8', ongoing: 'grid12', venues: { Buy: 'grid8' }, budgets: { Eat: 2 } })).toBe('');
    expect(layoutsQuery({ events: 'top', tours: 'columns', ongoing: 'columns', venues: {}, budgets: {} })).toBe('tours=columns');
    const l = { events: 'grid8', tours: 'grid16', ongoing: 'grid8', venues: { Eat: 'grid16' }, budgets: { Eat: null, Buy: 3 } } as const;
    expect(read(layoutsQuery({ ...l, venues: { ...l.venues }, budgets: { ...l.budgets } }))).toEqual(l);
  });

  it('rations Eat, Buy and Visit unless chosen otherwise', () => {
    expect(budgetFor(read(''), 'Eat')).toBe(2);
    expect(budgetFor(read('budget=Eat:all'), 'Eat')).toBeNull();
    expect(budgetFor(read(''), 'Buy')).toBe(1);
    expect(budgetFor(read(''), 'Visit')).toBe(0);
    expect(budgetFor(read(''), 'See')).toBeNull();
  });
});

describe('Eat by area, as the last edition runs it', () => {
  it('puts St Helier, then East, then West, however St Helier is written', () => {
    const out = venueSections([v('W1', { area: 'West' }), v('E1', { area: 'East' }), v('H1', { area: 'St Helier' }), v('N1', { area: '' })]);
    expect(out[0]!.key.map((k) => k.area)).toEqual(['St Helier', 'East', 'West']);
    expect(out[0]!.key[0]!.code).toBe('SH');
  });
});

describe('Pubs & bars', () => {
  it('prints as a section of its own after Eat, on the grid of sixteen unless chosen', () => {
    const out = venueSections([v('Bar', { section: 'Pubs & bars', area: 'West' }), v('Cafe', { area: 'St Helier' }), v('Shop', { section: 'Buy', area: '' })]);
    expect(out.map((s) => s.section)).toEqual(['Buy', 'Eat', 'Pubs & bars']);
    expect(venueGridFor({ venues: {} }, 'Pubs & bars')).toBe('grid16');
    expect(venueGridFor({ venues: { 'Pubs & bars': 'grid8' } }, 'Pubs & bars')).toBe('grid8');
    expect(venueGridFor({ venues: {} }, 'Eat')).toBe('grid8');
  });
});
