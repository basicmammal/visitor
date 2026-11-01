import { describe, expect, it } from 'vitest';
import { byWhen, cardWhen, webTime, webTimes, headerWhen, nextDate, webWhen } from '@/lib/domain/web-dates';

const d = (...isos: string[]) => isos.map((date) => ({ date, start: null, end: null }));
const today = '2026-10-18';

describe('webWhen', () => {
  it('writes one date, a run and a few dates', () => {
    expect(webWhen(d('2026-10-24'), 'one-off', today)).toBe('Sat 24 Oct');
    expect(webWhen(d('2026-10-31', '2026-11-01'), 'one-off', today)).toBe('Sat 31 Oct – Sun 1 Nov');
    expect(webWhen(d('2026-11-07', '2026-11-23'), 'one-off', today)).toBe('Sat 7 Nov, Mon 23 Nov');
    expect(webWhen(d('2026-11-01', '2026-11-03', '2026-11-09', '2026-11-12', '2026-11-20'), 'dates', today)).toBe('Sun 1 Nov, Tue 3 Nov, Mon 9 Nov + 2 more');
  });

  it('ignores dates already gone', () => {
    expect(webWhen(d('2026-10-01', '2026-10-24'), 'one-off', today)).toBe('Sat 24 Oct');
    expect(webWhen(d('2026-10-01'), 'one-off', today)).toBeNull();
  });

  it('writes regular and ongoing things by their end', () => {
    expect(webWhen(d('2026-10-24', '2026-10-31', '2026-11-07', '2026-11-14'), 'regular', today)).toBe('Every Saturday until 14 Nov');
    expect(webWhen(d('2026-10-17', '2026-10-18', '2027-12-31'), 'ongoing', today)).toBe('Until 31 Dec 2027');
    expect(webWhen(d('2026-11-26', '2026-12-20'), 'ongoing', today)).toBe('26 Nov – 20 Dec');
  });

  it('finds the next date', () => {
    expect(nextDate(d('2026-10-01', '2026-10-24', '2026-10-20'), today)).toBe('2026-10-20');
  });
});

describe('cardWhen', () => {
  it('gives scattered dates as the next one only', () => {
    expect(cardWhen(d('2026-10-18', '2026-11-07', '2026-11-08', '2026-11-14', '2026-11-21', '2026-12-05'), 'dates', today)).toBe('Sun 18 Oct');
    expect(cardWhen(d('2026-11-07', '2026-11-23'), 'one-off', today)).toBe('Sat 7 Nov');
  });
  it('keeps a single day, a run, and regular or ongoing things as they are', () => {
    expect(cardWhen(d('2026-10-24'), 'one-off', today)).toBe('Sat 24 Oct');
    expect(cardWhen(d('2026-10-31', '2026-11-01'), 'one-off', today)).toBe('Sat 31 Oct – Sun 1 Nov');
    expect(cardWhen(d('2026-10-24', '2026-10-31', '2026-11-07'), 'regular', today)).toBe(webWhen(d('2026-10-24', '2026-10-31', '2026-11-07'), 'regular', today));
  });
});

describe('headerWhen', () => {
  const at = (...ds: string[]) => ds.map((date) => ({ date, start: null, end: null }));
  it('puts the next date first and the rest after it', () => {
    expect(headerWhen(at('2026-10-24', '2026-11-07'), 'dates', '2026-10-19')).toEqual({ main: 'Sat 24 Oct', more: 'and Sat 7 Nov' });
    expect(headerWhen(at('2026-10-24', '2026-11-07', '2026-11-21', '2026-12-05'), 'dates', '2026-10-19')).toEqual({ main: 'Sat 24 Oct', more: 'and 3 more dates' });
  });
  it('keeps a run of days, or a single date, as one phrase', () => {
    expect(headerWhen(at('2026-10-31', '2026-11-01'), 'one-off', '2026-10-19')).toEqual({ main: 'Sat 31 Oct – Sun 1 Nov', more: null });
    expect(headerWhen(at('2026-10-24'), 'one-off', '2026-10-19')).toEqual({ main: 'Sat 24 Oct', more: null });
  });
});

describe('when: quick picks and chosen dates', () => {
  it('turns each quick pick into its days', async () => {
    const { pickRange } = await import('@/lib/domain/when');
    const thu = '2026-10-22';
    expect(pickRange('today', thu)).toEqual({ from: thu, to: thu });
    expect(pickRange('tomorrow', thu)).toEqual({ from: '2026-10-23', to: '2026-10-23' });
    expect(pickRange('weekend', thu)).toEqual({ from: '2026-10-24', to: '2026-10-25' });
    expect(pickRange('weekend', '2026-10-24')).toEqual({ from: '2026-10-24', to: '2026-10-25' });
    expect(pickRange('weekend', '2026-10-25')).toEqual({ from: '2026-10-25', to: '2026-10-25' });
    expect(pickRange('week', thu)).toEqual({ from: thu, to: '2026-10-28' });
    expect(pickRange('month', '2026-12-15')).toEqual({ from: '2026-12-15', to: '2027-01-13' });
  });

  it('reads chosen dates, either end open, in order, nothing past', async () => {
    const { resolveWhen } = await import('@/lib/domain/when');
    const today = '2026-10-22';
    expect(resolveWhen({}, today)).toBeNull();
    expect(resolveWhen({ when: 'dates' }, today)).toBeNull();
    expect(resolveWhen({ when: 'weekend' }, today)).toEqual({ from: '2026-10-24', to: '2026-10-25', pick: 'weekend' });
    expect(resolveWhen({ from: '2026-12-01', to: '2026-12-24' }, today)).toEqual({ from: '2026-12-01', to: '2026-12-24', pick: 'dates' });
    expect(resolveWhen({ from: '2026-12-24', to: '2026-12-01' }, today)).toEqual({ from: '2026-12-01', to: '2026-12-24', pick: 'dates' });
    expect(resolveWhen({ from: '2026-12-01' }, today)).toEqual({ from: '2026-12-01', to: '9999-12-31', pick: 'dates' });
    expect(resolveWhen({ to: '2026-11-01' }, today)).toEqual({ from: today, to: '2026-11-01', pick: 'dates' });
    expect(resolveWhen({ from: '2026-01-01', to: '2026-02-01' }, today)).toBeNull();
    expect(resolveWhen({ from: 'nonsense' }, today)).toBeNull();
  });

  it('reads an old month link as that month', async () => {
    const { resolveWhen } = await import('@/lib/domain/when');
    expect(resolveWhen({ month: '2026-12' }, '2026-10-22')).toEqual({ from: '2026-12-01', to: '2026-12-31', pick: 'dates' });
    expect(resolveWhen({ month: '2026-10' }, '2026-10-22')).toEqual({ from: '2026-10-22', to: '2026-10-31', pick: 'dates' });
  });

  it("knows Jersey's today near midnight", async () => {
    const { jerseyToday } = await import('@/lib/domain/when');
    expect(jerseyToday(new Date('2026-10-22T23:30:00Z'))).toBe('2026-10-23'); // BST
    expect(jerseyToday(new Date('2026-12-22T23:30:00Z'))).toBe('2026-12-22'); // GMT
  });
});

describe('times on a card', () => {
  const at = (date: string, start: string | null) => ({ date, start, end: null });
  it('puts the start beside a day, and beside a run when every day starts alike', () => {
    expect(cardWhen([at('2026-10-24', '19:30')], 'one-off', today)).toBe('Sat 24 Oct · 7.30pm');
    expect(cardWhen([at('2026-10-24', '19:30'), at('2026-10-24', '14:00')], 'one-off', today)).toBe('Sat 24 Oct · 2pm, 7.30pm');
    expect(cardWhen([at('2026-10-24', '11:00'), at('2026-10-24', '14:00'), at('2026-10-24', '17:00')], 'one-off', today)).toBe('Sat 24 Oct · 11am, 2pm +');
    expect(cardWhen([at('2026-10-24', '19:30'), at('2026-11-07', '20:00')], 'dates', today)).toBe('Sat 24 Oct · 7.30pm');
    expect(cardWhen([at('2026-10-31', '19:30'), at('2026-11-01', '19:30')], 'one-off', today)).toBe('Sat 31 Oct – Sun 1 Nov · 7.30pm');
    expect(cardWhen([at('2026-10-31', '19:30'), at('2026-11-01', '14:00')], 'one-off', today)).toBe('Sat 31 Oct – Sun 1 Nov');
    expect(cardWhen([at('2026-10-24', null)], 'one-off', today)).toBe('Sat 24 Oct');
  });

  it('orders a day by start time, untimed last', () => {
    const row = (title: string, start: string | null) => ({ next: '2026-10-24', event: { title, dates: [at('2026-10-24', start)] } });
    const sorted = [row('A', null), row('B', '19:30'), row('C', '10:00'), row('D', '19:30')].sort(byWhen).map((r) => r.event.title);
    expect(sorted).toEqual(['C', 'B', 'D', 'A']);
  });
});

describe('web times', () => {
  it('writes times the way a visitor reads them', () => {
    expect(['19:30', '10:00', '12:00', '00:00', '00:30', '09:05', '12:45'].map(webTime)).toEqual(['7.30pm', '10am', 'noon', 'midnight', '12.30am', '9.05am', '12.45pm']);
    expect(webTimes('10:00-16:00 | 9:30-23:00')).toBe('10am–4pm | 9.30am–11pm');
    expect(webTimes('15:00, 19:30')).toBe('3pm, 7.30pm');
    expect(webTimes(null)).toBeNull();
  });
});
