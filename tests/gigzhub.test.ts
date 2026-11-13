import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gigPrice, gigTime, parseGigs, shout, toEvent } from '@/lib/integrations/gigzhub/parse';

const gigs = parseGigs(readFileSync('tests/fixtures/gigzhub-whats-on.html', 'utf8'));
const parsed = gigs.map(toEvent).filter((e) => e !== null);

describe('Gigz Hub', () => {
  it('reads every gig object on the What’s On page, nested lineups and all', () => {
    expect(gigs).toHaveLength(6);
    expect(gigs[0]).toMatchObject({ bandName: 'Alfie Butel', venue: 'Trafalgar Pub', date: '2026-11-13', startTime: '20.00', price: 'Free' });
    expect(gigs[1]).toMatchObject({ venue: 'The Ommaroo Hotel - Coast Bar', lat: 49.1774006, lng: -2.0991034 });
  });

  it('makes a gig an evening event at its venue, linking back to Gigz Hub', () => {
    const e = parsed.find((x) => x.title === 'Alfie Butel')!;
    expect(e.dates).toEqual([{ date: '2026-11-13', start: '20:00', end: null }]);
    expect(e.venueName).toBe('Trafalgar Pub');
    expect(e.parish).toBe('St Aubin');
    expect(e.postcode).toBe('JE3 8AA');
    expect(e.free).toBe(true);
    expect(e.eventTypes).toEqual(['Music', 'Nightlife']);
    expect(e.sourceLink).toBe('https://gigzhub.je/whats-on/20206fa8-c57c-4408-a612-50a461a5b1d9');
    expect(e.organiser).toBeNull();
    // Their posters are signed links that expire: none kept.
    expect(e.headerImage).toBeNull();
  });

  it('leaves out an invitation-only night, and keeps a church concert out of Nightlife', () => {
    expect(parsed.some((e) => e.venueName === 'The Royal St. Martin')).toBe(false);
    expect(parsed.find((e) => e.venueName === 'St Aubin On The Hill Church')!.eventTypes).toEqual(['Music']);
  });

  it('reads the times as bands type them', () => {
    expect(gigTime('20.00')).toBe('20:00');
    expect(gigTime('2000')).toBe('20:00');
    expect(gigTime('1530')).toBe('15:30');
    expect(gigTime('10:00 pm')).toBe('22:00');
    expect(gigTime('8:00 pm')).toBe('20:00');
    expect(gigTime('8:00')).toBe('20:00');
    expect(gigTime('')).toBeNull();
    expect(gigTime('late')).toBeNull();
  });

  it('reads the prices', () => {
    expect(gigPrice('FREE')).toEqual({ free: true, from: null, to: null });
    expect(gigPrice('0').free).toBe(true);
    expect(gigPrice('Free entry').free).toBe(true);
    expect(gigPrice('£5 on the door')).toEqual({ free: false, from: 500, to: null });
    expect(gigPrice('£10 (£5 students)')).toEqual({ free: false, from: 500, to: 1000 });
    expect(gigPrice('From £15').from).toBe(1500);
    expect(gigPrice('')).toEqual({ free: false, from: null, to: null });
  });

  it('lowers a band typed in capitals, but not an acronym', () => {
    expect(shout('PARISH 13')).toBe('Parish 13');
    expect(shout('AC/DC')).toBe('AC/DC');
    expect(shout('Inside Job')).toBe('Inside Job');
  });
});

describe('listed by', () => {
  it('credits Gigz Hub for a gig from it, and no one for anything else', async () => {
    const { listedBy } = await import('@/lib/domain/listed-by');
    expect(listedBy('https://gigzhub.je/whats-on/abc')?.name).toBe('Gigz Hub');
    expect(listedBy('https://www.gigzhub.je/x')?.name).toBe('Gigz Hub');
    expect(listedBy('https://www.eventbrite.co.uk/e/1')).toBeNull();
    expect(listedBy(null)).toBeNull();
  });
});
