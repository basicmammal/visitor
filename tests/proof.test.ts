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
