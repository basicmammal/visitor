import { describe, expect, it } from 'vitest';
import { ISLAND_FRAME, TOWN_FRAME, TOWN_GRID, gridRef, inside, project } from '@/lib/domain/map-frame';
import { ISLAND_CATEGORIES, ISLAND_SEED, townCategory } from '@/lib/domain/map-seed';

describe('map frames', () => {
  it('puts the frame centre in the middle of the page', () => {
    expect(project(TOWN_FRAME, TOWN_FRAME.lat, TOWN_FRAME.lon)).toEqual([TOWN_FRAME.width / 2, TOWN_FRAME.height / 2]);
  });

  it('runs east to the right and north up', () => {
    const [x0, y0] = project(ISLAND_FRAME, 49.2, -2.1);
    const [x1, y1] = project(ISLAND_FRAME, 49.21, -2.09);
    expect(x1).toBeGreaterThan(x0);
    expect(y1).toBeLessThan(y0);
  });

  it('keeps the island whole on its spread: Grosnez to Gorey, Sorel to La Rocque', () => {
    for (const [lat, lon] of [[49.2575, -2.2465], [49.1793, -2.2498], [49.1997, -2.0188], [49.1660, -2.0270]] as const) {
      expect(inside(ISLAND_FRAME, lat, lon)).toBe(true);
    }
  });

  it('gives St Helier grid references A1 to M11', () => {
    expect(TOWN_FRAME.width).toBe(TOWN_GRID.cols * TOWN_GRID.cell);
    // Royal Square, near the middle; Elizabeth Castle, far to the south west.
    expect(gridRef(49.1838, -2.1065)).toMatch(/^[F-H][5-7]$/);
    expect(gridRef(49.1761, -2.1253)).toMatch(/^A(9|10|11)$/);
    expect(gridRef(49.25, -2.1)).toBeNull();
  });
});

describe('map seed', () => {
  it('has ten entries in each of six categories, as the Summer 2026 index', () => {
    expect(Object.keys(ISLAND_SEED)).toEqual([...ISLAND_CATEGORIES]);
    for (const entries of Object.values(ISLAND_SEED)) expect(entries).toHaveLength(10);
  });

  it('files St Helier venues under the locator headings', () => {
    expect(townCategory({ category: 'shop', guideLabel: null, name: 'Rivoli' })).toBe('Shopping');
    expect(townCategory({ category: 'see', guideLabel: null, name: 'Jersey Museum' })).toBe('Heritage & culture');
    expect(townCategory({ category: 'eat-drink', guideLabel: 'MODERN', name: 'Samphire' })).toBe('Restaurants');
    expect(townCategory({ category: 'eat-drink', guideLabel: 'PUB', name: 'The Lamplighter' })).toBe('Pubs');
    expect(townCategory({ category: 'eat-drink', guideLabel: 'COCKTAILS', name: 'The Drift Bar' })).toBe('Bars');
    expect(townCategory({ category: 'eat-drink', guideLabel: 'CAFÉ', name: 'Mange Tout' })).toBe('Coffee & cakes');
  });
});
