import Form from 'next/form';
import { Search } from 'lucide-react';
import { ShowToggle } from './show-toggle';
import { WhenPicker } from './when-picker';

type Option = { value: string; label: string };

/**
 * The filter panel's form, as a GET form so every view has a link: when
 * first, then the choices a page adds (show, categories, as `children`),
 * any selects and the show tick, and the words to search for last, since
 * there are few enough listings that picking is quicker than typing. It
 * moves between views without reloading the page, so the panel stays open
 * while choices apply.
 */
export function FilterBar(props: {
  action: string;
  values: Record<string, string | undefined>;
  selects?: { name: string; label: string; options: Option[] }[];
  /** Jersey's today, for the quick picks and the calendars' first day. */
  today: string;
  toggle?: { name: string; label: string; hint: string };
  /** The search box's placeholder. */
  round?: { placeholder: string; autoFocus?: boolean };
  /** Values chosen elsewhere (the category chips) that a search keeps. */
  keep?: string[];
  /** Between when and the words: the page's own choices. */
  children?: React.ReactNode;
}) {
  const heading = 'mb-2 block text-xs font-semibold uppercase tracking-wide text-harbour/60';
  return (
    // Keyed on the view, so going back or clearing shows that view's own choices.
    <Form key={JSON.stringify(props.values)} action={props.action} scroll={false} className="flex flex-col gap-7">
      {props.keep?.map((k) => props.values[k] && <input key={k} type="hidden" name={k} value={props.values[k]} />)}
      <WhenPicker when={props.values.when} from={props.values.from} to={props.values.to} today={props.today} />
      {props.children}
      {(props.selects ?? []).map((s) => (
        <label key={s.name} className="flex flex-col text-sm">
          <span className={heading}>{s.label}</span>
          <select name={s.name} defaultValue={props.values[s.name] ?? ''} className="rounded-lg border border-harbour/20 bg-white px-3 py-2.5">
            <option value="">Any</option>
            {s.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      ))}
      {props.toggle && <ShowToggle name={props.toggle.name} label={props.toggle.label} hint={props.toggle.hint} checked={props.values[props.toggle.name] === '1'} />}
      <label className="relative flex flex-col text-sm">
        <span className={heading}>Words</span>
        <Search aria-hidden="true" className="pointer-events-none absolute bottom-3 left-3.5 h-4 w-4 text-harbour/50" />
        <input
          type="search"
          name="q"
          defaultValue={props.values.q ?? ''}
          placeholder={props.round?.placeholder ?? 'A name or a venue'}
          enterKeyHint="search"
          autoComplete="off"
          className="w-full rounded-full border border-harbour/20 bg-white py-2.5 pl-10 pr-4 text-base text-ink outline-none placeholder:text-harbour/45 focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </label>
      {/* Enter in the words field applies them; the panel's own button does the rest. */}
      <button type="submit" className="sr-only">Show</button>
    </Form>
  );
}

export function monthHeading(iso: string): string {
  return new Date(`${iso.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
