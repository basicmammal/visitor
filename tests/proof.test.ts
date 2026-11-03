import { describe, expect, it } from 'vitest';
import { deadlineText, linkWorks, replyChanges, tidyCopy } from '@/lib/domain/proof';

describe('editorial proofs', () => {
  it('keeps a link working a week past the deadline, and no longer', () => {
    expect(linkWorks('2026-11-20', new Date('2026-11-20T18:00:00Z'))).toBe(true);
    expect(linkWorks('2026-11-20', new Date('2026-11-27T23:00:00Z'))).toBe(true);
    expect(linkWorks('2026-11-20', new Date('2026-11-28T00:00:01Z'))).toBe(false);
  });

  it('tidies a client’s copy without losing their paragraphs', () => {
    expect(tidyCopy('  Open daily.\r\n\r\n\r\nCome  and see\nus. ')).toBe('Open daily.\n\nCome and see us.');
  });

  it('counts a reply with the same words and no picture as signing off', () => {
    expect(replyChanges('Open daily.', ' Open daily. ', false)).toEqual({ copy: null, picture: false });
    expect(replyChanges('Open daily.', 'Open every day.', false)).toEqual({ copy: 'Open every day.', picture: false });
    expect(replyChanges('Open daily.', 'Open daily.', true)).toEqual({ copy: null, picture: true });
  });

  it('gives the deadline as a day', () => {
    expect(deadlineText('2026-11-20')).toBe('Fri 20 Nov');
  });
});

describe('proof artwork', () => {
  it('keeps each file in its proof’s folder under a safe name', async () => {
    const { artworkPath, allowedArtwork } = await import('@/lib/domain/proof');
    expect(artworkPath('abc', 'Rivoli Ad (FINAL) v2.pdf', 1)).toBe('proofs/abc/1-Rivoli_Ad_FINAL_v2.pdf');
    expect(artworkPath('abc', '../../etc/passwd', 1)).toBe('proofs/abc/1-.._.._etc_passwd');
    expect(allowedArtwork('advert.PDF', 20 * 1024 * 1024)).toBe(true);
    expect(allowedArtwork('advert.exe', 1000)).toBe(false);
    expect(allowedArtwork('huge.pdf', 60 * 1024 * 1024)).toBe(false);
  });
});

describe('proof details', () => {
  it('keeps only what a client changed, tidied', async () => {
    const { detailsChanges } = await import('@/lib/domain/proof');
    const now = { phone: '01534 123456', email: 'Shop@x.je', website: 'x.je', addressLine1: '1 King St', parish: 'St Helier', postcode: 'JE2 4WE', openingHours: { mon: ['09:00', '17:00'] as [string, string] }, openMonths: [], summary: 'Jewellers.', description: 'Fine jewellery.', ownWords: null };
    expect(detailsChanges(now, { phone: ' 01534 123456 ', email: 'shop@x.je', openMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], openingHours: { mon: ['09:00', '17:00'] } })).toBeNull();
    expect(detailsChanges(now, { openingHours: { mon: ['09:30', '17:30'], sun: ['', ''] }, postcode: 'je2 4we', website: 'rivoli.je' })).toEqual({ openingHours: { mon: ['09:30', '17:30'] }, website: 'rivoli.je' });
    expect(detailsChanges(now, { openMonths: [4, 5, 6, 7, 8, 9, 10], summary: '' })).toEqual({ openMonths: [4, 5, 6, 7, 8, 9, 10], summary: null });
  });
});

describe('own words', () => {
  it('starts from everything the listing says, short part and long', async () => {
    const { ownWordsOf } = await import('@/lib/domain/proof');
    expect(ownWordsOf({ ownWords: null, summary: 'A family jeweller.', description: 'Watches and rings.' })).toBe('A family jeweller.\n\nWatches and rings.');
    expect(ownWordsOf({ ownWords: null, summary: 'A family jeweller.', description: 'A family jeweller. Watches too.' })).toBe('A family jeweller. Watches too.');
    expect(ownWordsOf({ ownWords: 'Ours.', summary: 'x', description: 'y' })).toBe('Ours.');
  });
});
