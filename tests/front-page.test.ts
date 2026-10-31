import { describe, expect, it } from 'vitest';
import { onePerGroup, standfirst } from '@/lib/domain/front-page';

const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length]!;
};

describe('the front page’s stories', () => {
  it('takes one entry a group, never the same one twice, skipping empty groups', () => {
    const picks = onePerGroup(
      [['Music', ['a', 'b']], ['Food', ['a']], ['Empty', []], ['Arts', ['c']]] as const,
      3,
      (t) => t,
      seq(0),
    );
    expect(picks.map(([g]) => g).sort()).toEqual(['Arts', 'Food', 'Music']);
    const items = picks.map(([, t]) => t);
    expect(new Set(items).size).toBe(items.length);
  });

  it('stops at the number asked for', () => {
    expect(onePerGroup([['A', [1]], ['B', [2]], ['C', [3]]] as const, 2, String, seq(0.5))).toHaveLength(2);
  });

  it('stands a sentence or two of the copy under the headline', () => {
    expect(standfirst('One. Two is longer. Three.', 12)).toBe('One.');
    expect(standfirst('Short and sweet.')).toBe('Short and sweet.');
    expect(standfirst(null)).toBeNull();
  });
});
