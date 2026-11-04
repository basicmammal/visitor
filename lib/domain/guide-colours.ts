/**
 * The Jersey palette (Jersey Brand Guidelines, 2026): eight colours, the
 * blue and light blue, and the green and dark green, leading. Text is only
 * ever deep blue or white (onColour); the other colours are for tabs,
 * rules, chips, markers and panels.
 *
 * The guidelines give RGB and hex only. The CMYK here is converted from RGB
 * for the proof and the InDesign notes; confirm it against Visit Jersey's
 * print values before press.
 */
export type Swatch = { name: string; cmyk: readonly [number, number, number, number]; hex: string };

export const PALETTE = {
  sand: { name: 'sand', cmyk: [0, 1, 10, 4], hex: '#f4f2dc' },
  lightBlue: { name: 'light blue', cmyk: [36, 0, 0, 0], hex: '#a4feff' },
  green: { name: 'green', cmyk: [16, 0, 69, 23], hex: '#a4c43c' },
  orange: { name: 'orange', cmyk: [0, 68, 91, 4], hex: '#f64e16' },
  deepBlue: { name: 'deep blue', cmyk: [97, 23, 0, 76], hex: '#022e3c' },
  blue: { name: 'blue', cmyk: [82, 64, 0, 8], hex: '#2a55eb' },
  darkGreen: { name: 'dark green', cmyk: [65, 0, 63, 68], hex: '#1d521e' },
  maroon: { name: 'maroon', cmyk: [0, 79, 88, 62], hex: '#61140c' },
} as const satisfies Record<string, Swatch>;

/**
 * The guide's sections in the palette: a colour a section, for its tab,
 * rules and chips. Light blue and sand are backgrounds only: as rules on
 * white paper they barely show.
 */
export const SECTION_SWATCHES = {
  Visit: PALETTE.blue,
  See: PALETTE.maroon,
  Do: PALETTE.deepBlue,
  Buy: PALETTE.maroon,
  Eat: PALETTE.green,
} as const satisfies Record<string, Swatch>;

/** The pages that are not venue sections: What's On and New this season in orange, tours in dark green, the maps on light blue. */
export const PAGE_SWATCHES = {
  events: PALETTE.orange,
  tours: PALETTE.darkGreen,
  toursLight: PALETTE.green,
  new: PALETTE.orange,
  maps: PALETTE.lightBlue,
} as const satisfies Record<string, Swatch>;

export type SectionName = keyof typeof SECTION_SWATCHES;

/** Type on a colour: white on the dark ones, deep blue on the light, as the guidelines pair them. */
export function onColour(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Contrast with white against contrast with deep blue (luminance 0.024).
  return (1.05 / (lum + 0.05)) >= ((lum + 0.05) / (0.024 + 0.05)) ? '#ffffff' : PALETTE.deepBlue.hex;
}

/** A section with no colour of its own: a quiet grey, so it shows in the proof as unassigned. */
export const UNASSIGNED: Swatch = { name: 'unassigned', cmyk: [0, 0, 0, 60], hex: '#8a8989' };

const ALIASES: [prefix: string, section: SectionName][] = [
  ['shop', 'Buy'],
  ['attraction', 'Visit'],
  ['eat & drink', 'Eat'],
  ['eat and drink', 'Eat'],
  ['food', 'Eat'],
];

/**
 * The swatch for a section as staff name it on a venue: exactly, by what
 * it starts with ("Eat & Drink: Pubs" is Eat), or by the guide's other
 * names for it (Shop, Shopping: Buy; Attractions: Visit).
 */
export function sectionSwatch(section: string): Swatch {
  const s = section.trim().toLowerCase();
  const names = Object.keys(SECTION_SWATCHES) as SectionName[];
  const exact = names.find((n) => n.toLowerCase() === s);
  if (exact) return SECTION_SWATCHES[exact];
  const alias = ALIASES.find(([p]) => s.startsWith(p));
  if (alias) return SECTION_SWATCHES[alias[1]];
  const start = names.find((n) => new RegExp(`^${n.toLowerCase()}\\b`).test(s));
  return start ? SECTION_SWATCHES[start] : UNASSIGNED;
}

/** A tint of a colour on paper, as InDesign tints: the colour at pct %, the rest white. Label chips are at 20 %. */
export function tint(hex: string, pct: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(255 - (255 - c) * (pct / 100));
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix) as [number, number, number];
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
