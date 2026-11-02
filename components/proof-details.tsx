'use client';

import type { DetailsForm } from '@/lib/domain/proof';
import { WEEK, type Day, type WeekHours } from '@/lib/domain/opening';

const DAY_LONG: Record<Day, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PARISHES = ['Grouville', 'St Brelade', 'St Clement', 'St Helier', 'St John', 'St Lawrence', 'St Martin', 'St Mary', 'St Ouen', 'St Peter', 'St Saviour', 'Trinity'];

const input = 'mt-1 w-full rounded-md border border-harbour/20 px-3 py-2 text-[15px] focus:border-sea focus:outline-none focus:ring-2 focus:ring-sea/30';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink">{label}</span>
      {hint && <span className="block text-xs text-harbour/60">{hint}</span>}
      {children}
    </label>
  );
}

/** The week's hours, a row a day: open or closed, and from when to when. */
function Hours({ value, onChange }: { value: WeekHours | null; onChange: (h: WeekHours | null) => void }) {
  const h = value ?? {};
  const set = (d: Day, v: [string, string] | null) => {
    const next = { ...h };
    if (v) next[d] = v;
    else delete next[d];
    onChange(Object.keys(next).length ? next : null);
  };
  const last = WEEK.map((d) => h[d]).find(Boolean) ?? ['10:00', '17:00'];
  return (
    <div className="divide-y divide-harbour/10 rounded-md border border-harbour/15 bg-white">
      {WEEK.map((d) => {
        const at = h[d];
        return (
          <div key={d} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
            <label className="flex w-32 items-center gap-2">
              <input type="checkbox" checked={!!at} onChange={(e) => set(d, e.target.checked ? [...last] as [string, string] : null)} />
              {DAY_LONG[d]}
            </label>
            {at ? (
              <span className="flex items-center gap-2">
                <input type="time" value={at[0]} onChange={(e) => set(d, [e.target.value, at[1]])} aria-label={`${DAY_LONG[d]} opens`} className="rounded border border-harbour/20 px-2 py-1" />
                to
                <input type="time" value={at[1]} onChange={(e) => set(d, [at[0], e.target.value])} aria-label={`${DAY_LONG[d]} closes`} className="rounded border border-harbour/20 px-2 py-1" />
              </span>
            ) : (
              <span className="text-harbour/50">Closed</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The months it opens: all year unless some are chosen. */
function Months({ value, onChange }: { value: number[]; onChange: (m: number[]) => void }) {
  const all = value.length === 0;
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={all} onChange={(e) => onChange(e.target.checked ? [] : [4, 5, 6, 7, 8, 9, 10])} /> Open all year
      </label>
      {!all && (
        <div className="flex flex-wrap gap-1.5">
          {MONTHS.map((m, i) => {
            const on = value.includes(i + 1);
            return (
              <button key={m} type="button" onClick={() => onChange(on ? value.filter((x) => x !== i + 1) : [...value, i + 1].sort((a, b) => a - b))} className={`rounded-full px-3 py-1 text-sm ring-1 ${on ? 'bg-sea text-white ring-sea' : 'bg-white text-harbour ring-harbour/20'}`}>
                {m}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * A venue's details, the same in the guide and on the website: how to
 * reach it, where it is, and when it opens. What changes here shows in the
 * page beside as it changes.
 */
export function ProofDetails({ value, onChange }: { value: DetailsForm; onChange: (d: DetailsForm) => void }) {
  const set = <K extends keyof DetailsForm>(k: K, v: DetailsForm[K]) => onChange({ ...value, [k]: v });
  const str = (k: 'phone' | 'email' | 'website' | 'addressLine1' | 'postcode') => ({ value: value[k] ?? '', onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value) });
  return (
    <div className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="font-semibold text-ink">Your details</legend>
        <p className="text-sm text-harbour/65">The same in the guide and on the website.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Phone"><input type="tel" {...str('phone')} className={input} /></Field>
          <Field label="Email" hint="For enquiries: shown to visitors."><input type="email" {...str('email')} className={input} /></Field>
          <div className="sm:col-span-2"><Field label="Website"><input type="url" {...str('website')} placeholder="yourwebsite.com" className={input} /></Field></div>
          <div className="sm:col-span-2"><Field label="Address"><input {...str('addressLine1')} className={input} /></Field></div>
          <Field label="Parish">
            <select value={value.parish ?? ''} onChange={(e) => set('parish', e.target.value || null)} className={input}>
              <option value="">–</option>
              {[...new Set([...(value.parish && !PARISHES.includes(value.parish) ? [value.parish] : []), ...PARISHES])].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Postcode"><input {...str('postcode')} className={input} /></Field>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="font-semibold text-ink">Opening times</legend>
        <Hours value={value.openingHours} onChange={(h) => set('openingHours', h)} />
        <Months value={value.openMonths} onChange={(m) => set('openMonths', m)} />
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="font-semibold text-ink">On the website</legend>
        <p className="text-sm text-harbour/65">Your online listing’s own words: the guide prints the words above.</p>
        <Field label="Summary" hint="One sentence, for the cards that list you."><input value={value.summary ?? ''} onChange={(e) => set('summary', e.target.value)} className={input} /></Field>
        <Field label="Description"><textarea value={value.description ?? ''} onChange={(e) => set('description', e.target.value)} rows={7} className={input} /></Field>
      </fieldset>
    </div>
  );
}
