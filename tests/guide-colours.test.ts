import { describe, expect, it } from 'vitest';
import { PALETTE, SECTION_SWATCHES, onColour, sectionSwatch, tint, UNASSIGNED } from '@/lib/domain/guide-colours';

describe('sectionSwatch', () => {
  it('gives each section one colour from the Jersey palette', () => {
    expect(sectionSwatch('Visit').hex).toBe('#2a55eb');
    expect(sectionSwatch('Buy').hex).toBe('#61140c');
    expect(sectionSwatch('Do').hex).toBe('#022e3c');
    expect(sectionSwatch('Eat').hex).toBe('#a4c43c');
    expect(sectionSwatch('Eat')).toBe(SECTION_SWATCHES.Eat);
  });
  it('knows the sections by the other names staff give them', () => {
    expect(sectionSwatch('Eat & Drink: Pubs')).toBe(SECTION_SWATCHES.Eat);
    expect(sectionSwatch('Shopping')).toBe(SECTION_SWATCHES.Buy);
    expect(sectionSwatch(' attractions ')).toBe(SECTION_SWATCHES.Visit);
    expect(sectionSwatch('Do: water sports')).toBe(SECTION_SWATCHES.Do);
  });
  it('does not take a word that only starts like a section', () => {
    expect(sectionSwatch('Donkeys')).toBe(UNASSIGNED);
    expect(sectionSwatch('Stay')).toBe(UNASSIGNED);
  });
});

describe('tint', () => {
  it('mixes with paper as InDesign tints', () => {
    expect(tint('#bb4983', 100)).toBe('#bb4983');
    expect(tint('#000000', 20)).toBe('#cccccc');
    expect(tint('#bb4983', 20)).toBe('#f1dbe6');
  });
});

describe('onColour', () => {
  it('sets type in white on the dark colours and deep blue on the light, as the guidelines pair them', () => {
    for (const c of [PALETTE.blue, PALETTE.darkGreen, PALETTE.maroon, PALETTE.deepBlue]) expect(onColour(c.hex)).toBe('#ffffff');
    for (const c of [PALETTE.lightBlue, PALETTE.green, PALETTE.sand]) expect(onColour(c.hex)).toBe(PALETTE.deepBlue.hex);
  });
});
