import type { MapName, Place } from '@/lib/db/schema';

/**
 * The island map's index as the Summer 2026 guide printed it, six
 * categories of ten, mirrored on the owner's word. Each line is the name
 * as it printed and the venue it is (by slug, the first that exists), or a
 * pin of its own where we list no such venue or have it without a
 * location (positions from OpenStreetMap). Those with neither show in
 * the admin as needing a pin. `labelled` marks those named on the map.
 */
export type SeedEntry = { label: string; slugs?: string[]; pin?: [number, number]; labelled?: boolean };

export const ISLAND_CATEGORIES = ['Attractions', 'Heritage & culture', 'Shopping', 'Restaurants', 'Activity', 'Pubs'] as const;

export const ISLAND_SEED: Record<(typeof ISLAND_CATEGORIES)[number], SeedEntry[]> = {
  Attractions: [
    { label: 'Jersey Zoo', slugs: ['jersey-zoo'], labelled: true },
    { label: 'Jersey War Tunnels', slugs: ['jersey-war-tunnels'], labelled: true },
    { label: 'C.I. Military Museum', slugs: ['channel-islands-military-museum'] },
    { label: 'La Mare Wine Estate', slugs: ['la-mare-wine-estate'], labelled: true },
    { label: 'Eric Young Orchid Foundation', slugs: ['eric-young-orchid-foundation'] },
    { label: 'Pallot Steam Museum', slugs: ['pallot-steam-motor-and-general-museum'] },
    { label: 'Jersey Lavender', slugs: ['jersey-lavender-farm'] },
    { label: 'Jersey Museum', slugs: ['jersey-museum-art-gallery-and-victorian-house'] },
    { label: 'Samarès Manor', slugs: ['the-botanic-gardens-and-samares-manor'], labelled: true },
    { label: 'Maritime Museum', slugs: ['maritime-museum-and-occupation-tapestry-gallery'] },
  ],
  'Heritage & culture': [
    { label: 'Hamptonne', slugs: ['hamptonne-country-life-museum'], labelled: true },
    { label: 'Elizabeth Castle', slugs: ['elizabeth-castle'], labelled: true },
    { label: 'Mont Orgueil', slugs: ['mont-orgueil-castle'], labelled: true },
    { label: 'Maritime Museum', slugs: ['maritime-museum-and-occupation-tapestry-gallery'] },
    { label: 'La Hougue Bie', slugs: ['la-hougue-bie-museum'], labelled: true },
    { label: 'Tesson Mill', pin: [49.20483, -2.15601] },
    { label: 'Le Moulin de Quétivel', slugs: ['le-moulin-de-quetivel-watermill'] },
    { label: 'Wetland Centre', slugs: ['the-national-trust-for-jersey-wetland-centre'] },
    { label: 'Grosnez Castle', slugs: ['grosnez-castle'], labelled: true },
    { label: 'Corbière Lighthouse', slugs: ['la-corbiere-lighthouse'], labelled: true },
  ],
  Shopping: [
    { label: 'Catherine Best', slugs: ['catherine-best-jewellers'] },
    { label: 'Jersey Pearl', slugs: ['jersey-pearl-st-ouen', 'jersey-pearl'] },
    { label: 'Les Quesnes Garden Centre', slugs: ['les-quesne-garden-centre'], pin: [49.19265, -2.08274] },
    { label: 'The Trading Point', slugs: ['the-trading-point'] },
    { label: 'Harbour Gallery', slugs: ['the-harbour-gallery-jersey'] },
    { label: 'Jane James', slugs: ['jane-james-ceramics'] },
    { label: 'The Old Sail Loft' },
    { label: 'The Surfyard' },
    { label: 'Acorn Enterprises' },
    { label: "St Peter's Garden Centre", pin: [49.20691, -2.17975] },
  ],
  Restaurants: [
    { label: "Indigo's", slugs: ['indigo-s'] },
    { label: 'The Moorings', slugs: ['the-moorings-hotel', 'the-moorings-restaurant'] },
    { label: 'Sumas', slugs: ['sumas-restaurant'] },
    { label: 'The Poplars Tea Room', slugs: ['the-poplars-tea-room'] },
    { label: 'The Windmill', slugs: ['the-windmill-by-jersey-kitchen'] },
    { label: 'The Loft', slugs: ['the-loft-pizzeria-and-coffeehouse'] },
    { label: 'El Tico', slugs: ['el-tico-beach-cantina'] },
    { label: 'Watersplash', slugs: ['the-watersplash-beach-bar-and-diner'] },
    { label: 'Ocean Restaurant', slugs: ['ocean-restaurant'] },
    { label: 'Le Braye', slugs: ['le-braye'] },
  ],
  Activity: [
    { label: 'Valley Adventures', slugs: ['valley-adventure-centre'], labelled: true },
    { label: 'Jersey Duchess', slugs: ['the-jersey-duchess'] },
    { label: 'RIB Trips', slugs: ['island-rib-voyages-boat-trips-and-tours'] },
    { label: 'Jersey Sea Sport Centre', slugs: ['jersey-sea-sport-centre-jet-skiing-and-boat-tours'] },
    { label: 'Splash Surf Centre', slugs: ['splash-surf-centre'] },
    { label: 'Jersey Surf School', slugs: ['jersey-surf-school'] },
    { label: 'Absolute Adventures', slugs: ['absolute-adventures'] },
    { label: 'Jersey Bowl', slugs: ['jersey-bowl'] },
    { label: 'Jump Jersey', slugs: ['jump-jersey'] },
    { label: 'Les Mielles', slugs: ['les-mielles-golf-and-country-club'] },
  ],
  Pubs: [
    { label: 'Old Court House Inn', slugs: ['the-old-court-house-inn', 'the-old-court-house'] },
    { label: 'Trinity Arms', slugs: ['trinity-arms'] },
    { label: "St Mary's Pub", pin: [49.23529, -2.1729] },
    { label: 'The Seymour', slugs: ['the-seymour-pub-and-restaurant'] },
    { label: 'The Dolphin', slugs: ['dolphin-hotel'] },
    { label: 'The Beaumont Inn', slugs: ['cheffins-at-the-beaumont-inn'] },
    { label: 'Old Smugglers Inn', slugs: ['the-old-smugglers-inn'] },
    { label: 'Farmers Inn', pin: [49.23193, -2.20172] },
    { label: 'Victoria in the Valley', pin: [49.21123, -2.16118] },
    { label: 'The Rozel', slugs: ['the-rozel-pub-and-dining'] },
  ],
};

/** St Helier's place locator, by the old map's headings; filled from the edition's bookings. */
export const TOWN_CATEGORIES = ['Shopping', 'Heritage & culture', 'Activity & travel', 'Restaurants', 'Bars', 'Coffee & cakes', 'Pubs'] as const;

export const MAP_TITLE: Record<MapName, string> = { island: 'Island map', 'st-helier': 'St Helier' };

/** St Helier's locator heading for a venue: by what it is, and the guide's label for it. */
export function townCategory(p: Pick<Place, 'category' | 'guideLabel' | 'name'>): string {
  const label = `${p.guideLabel ?? ''} ${p.name}`.toLowerCase();
  switch (p.category) {
    case 'shop':
      return 'Shopping';
    case 'see':
      return 'Heritage & culture';
    case 'do':
    case 'stay':
      return 'Activity & travel';
    case 'eat-drink':
      if (/\bpub\b|\binn\b|tavern|arms\b/.test(label)) return 'Pubs';
      if (/\bbar\b|cocktail|wine/.test(label) && !/restaurant|bistro/.test(label)) return 'Bars';
      if (/caf[eé]|coffee|cake|bakery|tea ?room/.test(label)) return 'Coffee & cakes';
      return 'Restaurants';
    default:
      return 'Shopping';
  }
}
