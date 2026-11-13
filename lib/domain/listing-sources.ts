/**
 * Where the events come from, for the banner of greyed-out logos under
 * What's on: each source the import reads, by its name in source_records,
 * with the site it links to and its logo when we have the file
 * (public/logos). A source without one shows its name, set in grey, until
 * its logo is added: we use the organisers' own files, never redrawn ones.
 */
export type ListingSource = { source: string; name: string; href: string; logo?: { src: string; width: number; height: number } };

export const LISTING_SOURCES: ListingSource[] = [
  { source: 'visit_jersey', name: 'Visit Jersey', href: 'https://www.jersey.com/whats-on' },
  { source: 'gigzhub', name: 'Gigz Hub', href: 'https://gigzhub.je/whats-on', logo: { src: '/logos/gigzhub.png', width: 704, height: 149 } },
  { source: 'island-ticket-hut', name: 'Island Ticket Hut', href: 'https://www.islandtickethut.com', logo: { src: '/logos/island-ticket-hut.png', width: 311, height: 85 } },
  { source: 'ticketsolve-artscentre', name: 'Jersey Arts Centre', href: 'https://www.artscentre.je' },
  { source: 'ticketsolve-operahouse', name: 'Jersey Opera House', href: 'https://www.jerseyoperahouse.co.uk' },
  { source: 'eventbrite', name: 'Eventbrite', href: 'https://www.eventbrite.co.uk/d/jersey/all-events/' },
  { source: 'jersey-charities', name: 'Jersey Charities', href: 'https://www.jerseycharities.org' },
  { source: 'jersey-bulls', name: 'Jersey Bulls', href: 'https://www.bulls.je' },
  { source: 'jersey-rfc', name: 'Jersey RFC', href: 'https://jrfc.je' },
];

/** The busy ones: those with a few events on the site, busiest first, at most `max`. */
export function busiestSources(counts: ReadonlyMap<string, number>, { min = 3, max = 8 } = {}): (ListingSource & { events: number })[] {
  return LISTING_SOURCES.map((s) => ({ ...s, events: counts.get(s.source) ?? 0 }))
    .filter((s) => s.events >= min)
    .sort((a, b) => b.events - a.events)
    .slice(0, max);
}
