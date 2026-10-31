/**
 * The choices in force on a listing or the search, as chips above the
 * results, each leading to the same page without it. Lists (kinds,
 * categories) give a chip each; the dates are one chip.
 */
export type Chip = { label: string; href: string };

const LISTS = new Set(['type', 'cat', 'kind', 'genre']);

export function filterChips(
  action: string,
  values: Record<string, string | undefined>,
  label: (key: string, value: string) => string | null,
): Chip[] {
  const href = (drop: (k: string, v: string) => string | undefined) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(values)) {
      if (!v) continue;
      const kept = drop(k, v);
      if (kept) p.set(k, kept);
    }
    const qs = p.toString();
    return qs ? `${action}?${qs}` : action;
  };
  const chips: Chip[] = [];
  for (const [key, value] of Object.entries(values)) {
    if (!value || key === 'from' || key === 'to') continue;
    if (LISTS.has(key)) {
      for (const item of value.split(',').filter(Boolean)) {
        const words = label(key, item);
        if (words) chips.push({ label: words, href: href((k, v) => (k === key ? v.split(',').filter((x) => x !== item).join(',') || undefined : v)) });
      }
      continue;
    }
    const words = label(key, value);
    if (words) chips.push({ label: words, href: href((k, v) => (k === key || (key === 'when' && (k === 'from' || k === 'to')) ? undefined : v)) });
  }
  return chips;
}
