/**
 * The front page as a magazine: for a few kinds of thing coming up (a kind
 * of event, a kind of tour, a section of places), one entry each, picked at
 * random, so the page reads differently every time it is redrawn. Never the
 * same entry twice on the page; groups with nothing to show are passed over.
 */
export function onePerGroup<G, T>(
  groups: readonly (readonly [group: G, items: readonly T[]])[],
  howMany: number,
  key: (t: T) => string,
  rand: () => number = Math.random,
): [G, T][] {
  const order = [...groups].filter(([, items]) => items.length > 0);
  // A fresh order of the groups each time, so the same few do not always lead.
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const used = new Set<string>();
  const out: [G, T][] = [];
  for (const [g, items] of order) {
    if (out.length >= howMany) break;
    const left = items.filter((t) => !used.has(key(t)));
    if (!left.length) continue;
    const pick = left[Math.floor(rand() * left.length)]!;
    used.add(key(pick));
    out.push([g, pick]);
  }
  return out;
}

/** The first sentence or two of some copy, to stand under a headline: whole sentences, at most about `max` characters. */
export function standfirst(copy: string | null | undefined, max = 180): string | null {
  const text = (copy ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [text];
  let out = '';
  for (const s of sentences) {
    if (out && (out + s).length > max) break;
    out += s;
  }
  out = out.trim();
  return out.length > max + 60 ? `${out.slice(0, max).replace(/\s+\S*$/, '')}…` : out;
}
