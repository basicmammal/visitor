import { describe, expect, it } from 'vitest';
import { fromApi, toEvent, type LdEvent } from '@/lib/integrations/eventbrite/parse';

const listing: LdEvent = {
  '@type': 'Event',
  name: 'Winter Quiz Night',
  url: 'https://www.eventbrite.co.uk/e/winter-quiz-night-tickets-1234567890123',
  startDate: '2026-12-04',
  endDate: '2026-12-04',
  location: { '@type': 'Place', name: 'The Peirson', address: { postalCode: 'JE2 4WD', addressCountry: 'JE' } },
};

describe('Eventbrite API', () => {
  it('reads the API’s event as its page would give it: times, price, venue, organiser', () => {
    const page = fromApi({
      id: '1234567890123',
      name: { text: 'Winter Quiz Night' },
      summary: 'Teams of up to six.',
      url: listing.url,
      start: { utc: '2026-12-04T19:30:00Z' },
      end: { utc: '2026-12-04T22:00:00Z' },
      status: 'live',
      online_event: false,
      category_id: '103',
      venue: { name: 'The Peirson', latitude: '49.1840', longitude: '-2.1050', address: { address_1: 'Royal Square', city: 'St Helier', postal_code: 'JE2 4WD', country: 'JE' } },
      organizer: { name: 'Jersey Quiz League' },
      ticket_availability: { is_free: false, minimum_ticket_price: { major_value: '5.00' }, maximum_ticket_price: { major_value: '30.00' } },
    });
    const e = toEvent(listing, page)!;
    expect(e.dates).toEqual([{ date: '2026-12-04', start: '19:30', end: '22:00' }]);
    expect(e.fromPricePence).toBe(500);
    expect(e.toPricePence).toBe(3000);
    expect(e.organiser).toBe('Jersey Quiz League');
    expect(e.addressLine1).toBe('Royal Square');
    expect(e.eventTypes).toEqual(['Music']);
    expect(e.lat).toBeCloseTo(49.184);
  });

  it('calls a free event free, and drops a cancelled one', () => {
    expect(toEvent(listing, fromApi({ start: { utc: '2026-12-04T19:30:00Z' }, ticket_availability: { is_free: true }, venue: { address: { postal_code: 'JE2 4WD', country: 'JE' } } }))!.free).toBe(true);
    expect(toEvent(listing, fromApi({ status: 'canceled', start: { utc: '2026-12-04T19:30:00Z' }, venue: { address: { country: 'JE' } } }))).toBeNull();
  });
});
