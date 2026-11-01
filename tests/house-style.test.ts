import { describe, expect, it } from 'vitest';
import {
  printOngoingDates,
  printAddress,
  printContact,
  printDates,
  printParish,
  printPrice,
  printTimes,
  printTourDates,
  printWebsite,
} from '@/lib/domain/house-style';
import { suggestGenre } from '@/lib/domain/genre';

// Expected strings are copied from the printed autumn 2026 edition.

const d = (...isos: string[]) => isos.map((date) => ({ date, start: null, end: null }));
const range = (from: string, to: string, step = 1) => {
  const out: string[] = [];
  for (let t = Date.parse(from); t <= Date.parse(to); t += step * 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
};

describe('printDates', () => {
  it('prints a single date', () => {
    expect(printDates(d('2026-10-26'))).toBe('26 OCT');
  });

  it('prints a short run as a range, across a month too', () => {
    expect(printDates(d(...range('2026-09-01', '2026-09-05')))).toBe('1 - 5 SEP');
    expect(printDates(d(...range('2026-09-30', '2026-10-04')))).toBe('30 SEP - 4 OCT');
  });

  it('prints two dates with an ampersand', () => {
    expect(printDates(d('2026-09-01', '2026-09-15'))).toBe('1 SEP & 15 SEP');
  });

  it('prints a long, mostly daily run as UNTIL', () => {
    expect(printDates(d(...range('2026-09-01', '2026-10-29')))).toBe('1 SEP UNTIL 29 OCT');
  });

  it('prints the same days each week as a weekday and a range', () => {
    // Coast Bar's Friday music, 6 Nov to 18 Dec.
    expect(printDates(d('2026-11-06', '2026-11-13', '2026-11-20', '2026-11-27', '2026-12-04', '2026-12-11', '2026-12-18'))).toBe('EVERY FRIDAY, 6 NOV - 18 DEC');
    // The Christmas market's four long weekends, a Monday or two aside.
    const market = ['2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29', '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06', '2026-12-10', '2026-12-11', '2026-12-12', '2026-12-13', '2026-12-17', '2026-12-18', '2026-12-19', '2026-12-20'];
    expect(printDates(d(...market))).toBe('EVERY THU - SUN, 26 NOV - 20 DEC');
    expect(printDates(d('2026-11-07', '2026-11-08', '2026-11-14', '2026-11-15', '2026-11-21', '2026-11-22'))).toBe('EVERY SAT & SUN, 7 NOV - 22 NOV');
    // Tide walks land on any day: still their dates.
    expect(printDates(d('2026-09-02', '2026-09-13', '2026-09-16', '2026-09-27'))).toBe('2 SEP, 13/16/27 SEP');
  });

  it('groups the rest by month after the first date', () => {
    // Every Tuesday and Thursday is a weekly pattern now (below); dates that skip weeks still group.
    expect(printDates(d('2026-09-01', '2026-09-03', '2026-09-15', '2026-09-24')))
      .toBe('1 SEP, 3/15/24 SEP');
    expect(printDates(d('2026-09-01', '2026-09-03', '2026-09-08', '2026-09-10', '2026-09-15', '2026-09-17', '2026-09-22', '2026-09-24')))
      .toBe('EVERY TUE & THU, 1 SEP - 24 SEP');
    expect(printDates(d('2026-09-04', '2026-10-02', '2026-11-06'))).toBe('4 SEP, 2 OCT, 6 NOV');
    expect(printDates(d('2026-09-06', '2026-09-20', '2026-10-04', '2026-10-18', '2026-11-07', '2026-11-08')))
      .toBe('6 SEP, 20 SEP, 4/18 OCT, 7/8 NOV');
  });

  it('keeps only dates inside the edition', () => {
    const all = d(...range('2026-10-17', '2027-12-31'));
    expect(printDates(all, { from: '2026-11-01', to: '2027-02-28' })).toBe('1 NOV UNTIL 28 FEB');
    expect(printDates(all, { from: '2028-01-01', to: '2028-03-31' })).toBeNull();
  });
});

describe('printTimes', () => {
  it('prints one time range', () => {
    expect(printTimes([{ date: '2026-09-01', start: '10:00', end: '16:00' }])).toBe('10:00-16:00');
  });

  it('prints two show times with a comma', () => {
    expect(printTimes([{ date: '2026-06-06', start: '15:00', end: null }, { date: '2026-06-06', start: '19:30', end: null }]))
      .toBe('15:00, 19:30');
  });

  it('prints differing hours with a bar', () => {
    expect(printTimes([
      { date: '2026-06-04', start: '18:30', end: '23:00' },
      { date: '2026-06-05', start: '9:30', end: '23:00' },
    ])).toBe('18:30-23:00 | 9:30-23:00');
  });
});

describe('the rest of an entry', () => {
  it('prints prices to the penny', () => {
    expect(printPrice(1145, 2450)).toBe('£11.45 - £24.50');
    expect(printPrice(500, null)).toBe('£5.00');
    expect(printPrice(null, null, { free: true })).toBe('Free entry');
    expect(printPrice(null, null)).toBeNull();
  });

  it('prints the website as a bare domain in capitals', () => {
    expect(printWebsite('https://www.jerseyheritage.org/whats-on/x')).toBe('JERSEYHERITAGE.ORG');
    expect(printWebsite('jerseyoperahouse.ticketsolve.com/shows/1')).toBe('JERSEYOPERAHOUSE.TICKETSOLVE.COM');
    expect(printWebsite(null)).toBeNull();
  });

  it('prints the parish with a full stop, and the address in order', () => {
    expect(printParish('St Martin')).toBe('St. Martin');
    expect(printParish('Grouville')).toBe('Grouville');
    expect(printAddress({ addressLine1: 'Castle Green', parish: 'St Martin', postcode: 'JE3 6ET' })).toBe('Castle Green, St. Martin, JE3 6ET');
  });

  it('prints a phone, or the email when there is none', () => {
    expect(printContact('+44 (0) 1534 633300', 'a@b.je')).toBe('+44 (0) 1534 633300');
    expect(printContact(null, 'drink@curfew.je')).toBe('drink@curfew.je');
  });
});


describe('printTourDates', () => {
  it('groups every date by month, as the tours pages do', () => {
    expect(printTourDates(d('2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29', '2026-10-06'))).toBe('1/8/15/22/29 Sep, 6 Oct');
    expect(printTourDates(d('2026-09-12'))).toBe('12 Sep');
  });
});

describe('suggestGenre', () => {
  it('reads the specific signal over the generous tags', () => {
    expect(suggestGenre('Carteret RIB Voyage', ['Active & adrenaline', 'boat'])).toBe('On the water');
    expect(suggestGenre('Discover Jersey | Vintage Open Top Bus Tour', ['History & culture', 'bus', 'Guided'])).toBe('Motorised');
    expect(suggestGenre('Michelin Star Kitchen Tour, Wine Tasting & Canapes', ['food-drink', 'Guided'])).toBe('Foodie');
    expect(suggestGenre('Intertidal Walk to Seymour Tower', ['Active & adrenaline', 'walking'])).toBe('On foot');
    expect(suggestGenre('Yoga at Bouley Bay', ['Indoor', 'Yoga & pilates'])).toBe('Classes & crafts');
    expect(suggestGenre('Arena Paintball', ['Active & adrenaline'])).toBe('Active');
    expect(suggestGenre('Moonlight Walk to Seymour Tower', ['Active & adrenaline', 'water-sports', 'outdoors'])).toBe('On foot');
  });
});

describe('social pages are not websites', () => {
  it('prints nothing for a Facebook or Instagram page, and names it on the site', async () => {
    const { printWebsite, siteLabel, socialSite } = await import('@/lib/domain/house-style');
    expect(printWebsite('https://www.facebook.com/lockes.stories')).toBeNull();
    expect(printWebsite('https://www.instagram.com/thekingsbar')).toBeNull();
    expect(socialSite('https://m.facebook.com/x')).toBe('Facebook');
    expect(siteLabel('https://www.facebook.com/x')).toBe('Facebook');
    expect(siteLabel('https://www.locke.je/menu')).toBe('locke.je');
    expect(printWebsite('notfacebook.com')).toBe('NOTFACEBOOK.COM');
  });

  it('lets the other link stand in for a social page in the guide', async () => {
    const { guideWebsite } = await import('@/lib/domain/guide-entry');
    expect(guideWebsite('https://www.eventbrite.co.uk/e/1', 'https://facebook.com/venue')).toBe('https://www.eventbrite.co.uk/e/1');
    expect(guideWebsite('https://facebook.com/events/1', 'https://venue.je')).toBe('https://venue.je');
  });
});

describe('printOngoingDates', () => {
  const winter = { from: '2026-12-01', to: '2027-02-28' };
  const days = (from: string, to: string) => {
    const out: { date: string; start: null; end: null }[] = [];
    for (let t = Date.parse(from); t <= Date.parse(to); t += 86_400_000) out.push({ date: new Date(t).toISOString().slice(0, 10), start: null, end: null });
    return out;
  };
  it('gives an exhibition its own ends, not the edition’s', () => {
    expect(printOngoingDates(days('2026-10-31', '2027-12-31'), winter)).toBe('ALL SEASON'); // the source's placeholder end
    expect(printOngoingDates(days('2026-10-31', '2027-01-10'), winter)).toBe('UNTIL 10 JAN');
    expect(printOngoingDates(days('2026-10-31', '2027-04-12'), winter)).toBe('UNTIL 12 APR');
    expect(printOngoingDates(days('2027-01-01', '2027-12-31'), winter)).toBe('FROM 1 JAN');
    expect(printOngoingDates(days('2026-12-12', '2027-02-04'), winter)).toBe('12 DEC - 4 FEB');
    expect(printOngoingDates(days('2027-03-01', '2027-06-01'), winter)).toBeNull();
  });
});
