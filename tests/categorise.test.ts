import { describe, expect, it } from 'vitest';
import { categorise, eveningAtBar, withCategories } from '@/lib/domain/categorise';

const types = (title: string, summary?: string, source?: string) => categorise({ title, summary }, source).sort();

describe('categorise', () => {
  // Real titles from Eventbrite and the charities' diary, October 2026.
  it('files family, seasonal and outdoor events', () => {
    expect(types('Family Spooky Bat-Spotting Saunter')).toEqual(['Family friendly', 'Outdoor', 'Seasonal']);
    expect(types('Abandon Ship Halloween 2026')).toEqual(['Seasonal']);
    expect(types('Woodland Wonders in Waterworks Valley')).toEqual(['Outdoor']);
    expect(types('Junior Tennis Camp')).toEqual(['Family friendly', 'Sports']);
  });

  it('files music and nights out', () => {
    expect(types("80's and 90's Disco Night")).toEqual(['Nightlife']);
    expect(types('GUNS 2 ROSES – LIVE AT THE DRIFT', 'The UK’s top Guns N’ Roses tribute band')).toEqual(['Music']);
    expect(types('Gala Opera Night fundraiser with the Diva Opera Company')).toEqual(['Charity', 'Music']);
    expect(types('Dove Days presents Ibiza Summer Party')).toEqual(['Music', 'Nightlife']);
  });

  it('files charity events, from their words or their source', () => {
    expect(types('Trekker Fundraising Quiz', null as never, 'jersey-charities')).toEqual(['Charity', 'Nightlife']);
    expect(types('BSK October Set Menu', null as never, 'jersey-charities')).toEqual(['Charity', 'Food & drink']);
    expect(types('Hospice Festive Market')).toEqual(['Charity', 'Markets & fairs', 'Seasonal']);
    expect(types("80's and 90's Disco Night", 'Join DJ Mel for a disco night, all proceeds to JCH')).toEqual(['Charity', 'Nightlife']);
  });

  it('marks business events, so review can turn them down', () => {
    expect(types('The PwC Wealth Management Report 2026')).toEqual(['Business & networking']);
    expect(types('Cyber Security Tabletop Exercise')).toEqual(['Business & networking']);
    expect(types('Planning Policy: Preserving the Past, Preparing for the Future')).toContain('Business & networking');
  });

  it('files wellbeing and sport without catching words inside words', () => {
    expect(types('Sound Bath Meditation')).toEqual(['Health & wellbeing']);
    expect(types('Golf Day')).toEqual(['Sports']);
    expect(types('Embrace the Start: a classic evening')).toEqual([]);
    // Running a process is not a run.
    expect(types('The Right Advice On: Running a Grievance Process')).not.toContain('Sports');
    expect(types('Jersey Spartans Running Club')).toEqual(['Sports']);
  });

  it('keeps a source’s own types and adds to them', () => {
    expect(withCategories(['Arts & cultural'], { title: 'Christmas Panto' })).toEqual(['Arts & cultural', 'Family friendly', 'Seasonal']);
  });

  it('is not fooled by Bat Out of Hell, a bar on the coast or Boxing Day', () => {
    expect(types('Bat Out of Hell 50th Anniversary Concert')).toEqual(['Music']);
    expect(types('Live Music at Coast Bar & Bistro')).toEqual(['Music', 'Nightlife']);
    expect(types('Boxing Day Afternoon Tea')).toEqual(['Food & drink']);
    expect(types('Jersey Bulls FC Home Games')).toEqual(['Sports']);
  });
});

describe('health and wellbeing is not for the printed guide', () => {
  it('finds care, support and parenting as well as classes', async () => {
    const { categorise } = await import('@/lib/domain/categorise');
    for (const title of ['Strength-based Parenting', 'Dementia Awareness Talk', 'Understanding Anxiety', 'Lone Working in Healthcare', 'The Hidden Healing Power Behind Stagnant Emotions']) {
      expect(categorise({ title })).toContain('Health & wellbeing');
    }
  });

  it('leaves it out unless it is also something visitors come for', async () => {
    const { nonCore } = await import('@/lib/domain/categorise');
    expect(nonCore(['Health & wellbeing'])).toBe(true);
    expect(nonCore(['Health & wellbeing', 'Talks & learning', 'Seasonal'])).toBe(true);
    expect(nonCore(['Family friendly', 'Health & wellbeing', 'Outdoor'])).toBe(false);
    expect(nonCore(['Music'])).toBe(false);
  });
});

describe('training and work events are not for the printed guide', () => {
  it('finds courses for carers, careers and business events, and leaves them out', async () => {
    const { categorise, nonCore } = await import('@/lib/domain/categorise');
    for (const title of ['Safe Moving & Handling update', 'Launch a Local Career programme 2027', 'Routes to success: Ambitions for Palliative and End of Life Care', 'Pizza + Pitches Night | Jersey\'s Startups Take the Mic']) {
      const types = categorise({ title });
      expect(types).toContain('Professional & training');
      expect(nonCore(types)).toBe(true);
    }
    expect(nonCore(['Business & networking', 'Food & drink'])).toBe(true);
    expect(categorise({ title: 'Jersey Bulls v Cobham' })).not.toContain('Professional & training');
  });
});

describe('health listings are off the front page and What\'s on by default', () => {
  const ev = (title: string, eventTypes: string[] = [], extra: { highlight?: boolean; lockedFields?: string[] } = {}) => ({ title, eventTypes, lockedFields: extra.lockedFields ?? [], highlight: extra.highlight ?? false });

  it('hides classes and nurses\' courses, by their types or their own words', async () => {
    const { hiddenByDefault, siteTypes } = await import('@/lib/domain/categorise');
    expect(hiddenByDefault(ev('Sound Bath Meditation', ['Health & wellbeing']))).toBe(true);
    expect(hiddenByDefault(ev('Catheter Best Practice  for Nurses'))).toBe(true);
    // Filed under Health & wellbeing on the site, so that tile still finds it.
    expect(siteTypes(ev('Catheter Best Practice  for Nurses', ['Talks & learning']))).toEqual(['Talks & learning', 'Health & wellbeing']);
  });

  it('keeps what visitors come for, staff highlights, and types staff set by hand', async () => {
    const { hiddenByDefault, siteTypes } = await import('@/lib/domain/categorise');
    expect(hiddenByDefault(ev('Beast of The East Half Marathon', ['Health & wellbeing', 'Sports', 'Outdoor']))).toBe(false);
    expect(hiddenByDefault(ev('New Moon Gong Bath Meditation', ['Health & wellbeing'], { highlight: true }))).toBe(false);
    expect(hiddenByDefault(ev('Yoga on the beach', ['Outdoor'], { lockedFields: ['eventTypes'] }))).toBe(false);
    expect(hiddenByDefault(ev('Disney\'s the Little Mermaid', ['Arts & cultural']))).toBe(false);
    expect(siteTypes(ev('Jersey Bulls v Cobham', ['Sports']))).toEqual(['Sports']);
  });
});

describe('kinds chosen together', () => {
  it('reads several kinds from one parameter or many', async () => {
    const { many } = await import('@/lib/params');
    expect(many(undefined)).toEqual([]);
    expect(many('Music')).toEqual(['Music']);
    expect(many('Music,Food & drink')).toEqual(['Music', 'Food & drink']);
    expect(many(['Music', 'Outdoor,Music', ' '])).toEqual(['Music', 'Outdoor']);
  });

  it('builds the address for a set, the rest of the search kept', async () => {
    const { kindsHref } = await import('@/components/site/category-menu');
    expect(kindsHref('/whats-on', { q: 'jazz', type: 'Music' }, 'type', ['Music', 'Food & drink'])).toBe('/whats-on?q=jazz&type=Music%2CFood+%26+drink');
    expect(kindsHref('/whats-on', { q: 'jazz', type: 'Music' }, 'type', [])).toBe('/whats-on?q=jazz');
  });
});

describe('Nightlife', () => {
  it('finds a night out by its name', () => {
    expect(types('Charity Quiz Night')).toContain('Nightlife');
    expect(types('Live Music at Coast Bar & Bistro')).toContain('Nightlife');
    expect(types('Christmas Cabaret Night for Wetwheels Jersey')).toContain('Nightlife');
    expect(types('Sea Shanty Night at The Seaside Café')).toContain('Nightlife');
  });

  it('finds one by where and when: an evening at one of the pubs and bars', () => {
    const at = (start: string | null, eventTypes: string[] = []) => ({ dates: [{ start }], eventTypes });
    expect(eveningAtBar(at('21:30'), 'Pubs & bars')).toBe(true);
    expect(eveningAtBar(at('19:00', ['Music']), 'Pubs & bars')).toBe(true);
    expect(eveningAtBar(at('11:00', ['Food & drink']), 'Pubs & bars')).toBe(false);
    expect(eveningAtBar(at('19:30', ['Outdoor', 'History & Heritage']), 'Pubs & bars')).toBe(false);
    expect(eveningAtBar(at('19:00', ['Business & networking']), 'Pubs & bars')).toBe(false);
    expect(eveningAtBar(at('20:00'), 'Eat')).toBe(false);
    expect(eveningAtBar(at(null), 'Pubs & bars')).toBe(false);
  });
});
