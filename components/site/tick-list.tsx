import { Check, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { kindsHref } from './category-menu';

/**
 * Choices as chips that wrap, for the filter panel: several can be chosen
 * together (any of them shows), each with how many it would show. Each
 * chip is a link that adds or takes away its choice, so the page behind
 * updates without closing the panel. Choices with nothing to show are left
 * out, unless chosen.
 */
export function TickList(props: {
  title: string;
  action: string;
  values: Record<string, string | undefined>;
  /** The parameter the choices go in, comma-separated. */
  param: string;
  options: readonly (readonly [value: string, label: string, icon: LucideIcon])[];
  counts: Map<string, number>;
  className?: string;
}) {
  const chosen = (props.values[props.param] ?? '').split(',').filter(Boolean);
  const rows = props.options.filter(([v]) => (props.counts.get(v) ?? 0) > 0 || chosen.includes(v));
  const toggle = (v: string) => kindsHref(props.action, props.values, props.param, chosen.includes(v) ? chosen.filter((c) => c !== v) : [...chosen, v]);
  if (!rows.length) return null;

  return (
    <div className={props.className}>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-harbour/60">{props.title}</h3>
        {chosen.length > 0 && (
          <Link href={kindsHref(props.action, props.values, props.param, [])} rel="nofollow" scroll={false} replace className="text-xs text-harbour/60 underline">
            Clear {chosen.length}
          </Link>
        )}
      </div>
      <ul className="flex flex-wrap gap-2">
        {rows.map(([value, label, Icon]) => {
          const on = chosen.includes(value);
          return (
            <li key={value}>
              <Link
                href={toggle(value)}
                rel="nofollow"
                scroll={false}
                replace
                role="checkbox"
                aria-checked={on}
                className={`inline-flex items-center gap-1.5 rounded-full py-1.5 pl-2.5 pr-3 text-sm ring-1 transition-colors ${on ? 'bg-harbour text-white ring-harbour' : 'bg-white text-ink ring-harbour/15 hover:ring-brand/50'}`}
              >
                {on ? <Check aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} /> : <Icon aria-hidden="true" className="h-4 w-4 text-harbour/70" strokeWidth={1.75} />}
                {label}
                <span className={`text-xs tabular-nums ${on ? 'text-white/70' : 'text-harbour/45'}`}>{props.counts.get(value) ?? 0}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
